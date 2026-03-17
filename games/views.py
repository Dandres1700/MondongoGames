import json
import mimetypes
import os
import re
import unicodedata
import uuid
from urllib.parse import urlencode
from datetime import date
import httpx
from django.shortcuts import render, redirect
from django.contrib.auth import login, logout
from django.contrib import messages
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.http import JsonResponse
from .forms import EditProfileForm, ProfileForm
from .models import Juego, Partida, Profile, Usuario, FriendRequest, Friendship, DirectMessage, Notification
from .roles import ROLE_ADMIN, ROLE_DESARROLLADOR, ROLE_JUGADOR, get_user_role, is_admin, is_desarrollador, is_jugador
from django.db.models import Sum, Count
from django.utils import timezone
from django.views.decorators.http import require_http_methods
from django.db.models import Q
from django.contrib.auth import get_user_model
from django.conf import settings
from django.db import connection, OperationalError, ProgrammingError
from django.db.models import Avg, Count
from django.shortcuts import render, get_object_or_404
from django.templatetags.static import static
from django.urls import reverse
from supabase import AuthApiError, AuthInvalidCredentialsError, AuthWeakPasswordError
from supabase_cliente import (
    create_supabase_auth_client,
    insert_support_ticket,
    list_support_tickets,
    delete_profile_avatar_from_url,
    upload_profile_avatar,
    upload_support_screenshot,
    update_support_ticket_status,
)
User = get_user_model()


def _supabase_auth_client():
    # Cliente por request para evitar sesiones compartidas entre usuarios.
    return create_supabase_auth_client()

def _resolve_email_from_supabase_username(username: str) -> str | None:
    # Busca en Supabase Auth (admin) por username guardado en user_metadata.
    # Requiere SUPABASE_SERVICE_ROLE_KEY en el entorno.
    username = (username or "").strip()
    if not username:
        return None
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        return None

    target = username.lower()
    headers = {
        "Authorization": f"Bearer {key}",
        "apikey": key,
    }
    # Paginamos por seguridad (por si hay muchos usuarios).
    page = 1
    per_page = 200
    try:
        with httpx.Client(timeout=10.0) as client:
            while page <= 5:
                resp = client.get(
                    f"{url}/auth/v1/admin/users",
                    params={"page": page, "per_page": per_page},
                    headers=headers,
                )
                if resp.status_code != 200:
                    return None
                data = resp.json() or {}
                users = data.get("users") or []
                for u in users:
                    email = (u.get("email") or "").strip()
                    if email and email.lower() == target:
                        return email
                    meta = u.get("user_metadata") or {}
                    meta_username = str(meta.get("username") or "").strip()
                    if meta_username and meta_username.lower() == target:
                        return email or None
                if len(users) < per_page:
                    break
                page += 1
    except Exception:
        return None
    return None


def _absolute_site_url(request, path: str) -> str:
    # En producción usamos DJANGO_SITE_URL (Render). En local, el request.
    if getattr(settings, "SITE_URL", ""):
        return f"{settings.SITE_URL}{path}"
    return request.build_absolute_uri(path)


def _normalize_username(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", raw)
    return safe.strip("_") or "user"


def _ensure_local_user(email: str, username_hint: str | None = None) -> User:
    email = (email or "").strip().lower()
    if not email:
        raise ValueError("Email requerido")

    username_hint = _normalize_username(username_hint or email.split("@")[0])
    candidate = username_hint
    counter = 1
    while User.objects.filter(username=candidate).exclude(email=email).exists():
        counter += 1
        candidate = f"{username_hint}{counter}"

    # Mantiene sesión local de Django sincronizada con Supabase Auth.
    user = User.objects.filter(email=email).first()
    created = False
    if not user:
        user = User.objects.create(email=email, username=candidate)
        created = True
    updated = False
    if created:
        user.set_unusable_password()
        updated = True
    if not user.username:
        user.username = candidate
        updated = True
    if updated:
        user.save(update_fields=["username", "password"])
    return user


def _resolve_game_image(path_or_url: str) -> str:
    value = (path_or_url or "").strip()
    if value.startswith(("http://", "https://")):
        return value
    return static(value or "games/img/game1.png")


def _support_games_options() -> list[str]:
    # Opciones de juegos para Soporte.
    # Se leen desde BD para no editar el HTML cada vez que se agrega un juego.
    return list(Juego.objects.order_by("titulo").values_list("titulo", flat=True))


def _insert_support_ticket_via_db(payload: dict) -> None:
    # Fallback cuando Supabase REST bloquea por RLS: inserta directo por SQL.
    table = os.getenv("SUPABASE_SUPPORT_TABLE", "soporte")
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", table):
        raise ValueError("Nombre de tabla de soporte invalido")

    sql = (
        f"INSERT INTO {table} "
        "(user_id, username, email, tipo, game, motivo, screenshot_name, estado, created_at) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)"
    )
    values = (
        payload.get("user_id"),
        payload.get("username"),
        payload.get("email"),
        payload.get("tipo"),
        payload.get("game"),
        payload.get("motivo"),
        payload.get("screenshot_name"),
        payload.get("estado"),
        payload.get("created_at"),
    )
    with connection.cursor() as cursor:
        cursor.execute(sql, values)


def _list_support_tickets_via_db(*, only_game_issues: bool = False, limit: int = 200) -> list[dict]:
    table = os.getenv("SUPABASE_SUPPORT_TABLE", "soporte")
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", table):
        raise ValueError("Nombre de tabla de soporte invalido")

    where_sql = "WHERE tipo = %s" if only_game_issues else ""
    params = ["juego"] if only_game_issues else []
    params.append(int(limit))
    sql = (
        f"SELECT id, created_at, user_id, username, email, tipo, game, motivo, screenshot_name, estado "
        f"FROM {table} {where_sql} ORDER BY created_at DESC LIMIT %s"
    )
    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        cols = [c[0] for c in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]


def _update_support_ticket_status_via_db(
    ticket_id: int, estado: str, *, only_game_issues: bool = False
) -> int:
    table = os.getenv("SUPABASE_SUPPORT_TABLE", "soporte")
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", table):
        raise ValueError("Nombre de tabla de soporte invalido")

    extra = " AND tipo = %s" if only_game_issues else ""
    params = [estado, int(ticket_id)]
    if only_game_issues:
        params.append("juego")
    sql = f"UPDATE {table} SET estado = %s WHERE id = %s{extra}"
    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        return cursor.rowcount


# LOGIN
def login_view(request):
    if request.user.is_authenticated:
        return redirect("dashboard")


    if request.method == "POST":
        username_or_email = (request.POST.get("username") or "").strip()
        password = request.POST.get("password")

        email = ""
        if "@" in username_or_email:
            email = username_or_email
        else:
            user_obj = User.objects.filter(username__iexact=username_or_email).first()
            if user_obj and user_obj.email:
                email = user_obj.email
            else:
                try:
                    usuario_row = Usuario.objects.filter(nombre__iexact=username_or_email).first()
                except (ProgrammingError, OperationalError):
                    usuario_row = None
                if usuario_row and usuario_row.email:
                    email = usuario_row.email
                else:
                    # Si no existe localmente, buscar en Supabase Auth (metadata.username).
                    email = _resolve_email_from_supabase_username(username_or_email) or ""

        if not email:
            messages.error(request, "Usuario no encontrado")
            return redirect("login")

        try:
            auth_client = _supabase_auth_client()
            auth_resp = auth_client.auth.sign_in_with_password(
                {"email": email, "password": password}
            )
        except AuthInvalidCredentialsError:
            messages.error(request, "Credenciales incorrectas")
            return redirect("login")
        except AuthApiError as exc:
            if exc.code == "email_not_confirmed":
                messages.error(request, "Debes confirmar tu correo antes de iniciar sesión.")
            elif exc.code == "invalid_credentials":
                messages.error(request, "Credenciales incorrectas")
            else:
                messages.error(request, "No se pudo iniciar sesión.")
            return redirect("login")

        # Login Supabase OK -> sesión Django.
        supa_user = auth_resp.user or (auth_resp.session.user if auth_resp.session else None)
        if not supa_user or not supa_user.email:
            messages.error(request, "No se pudo iniciar sesión.")
            return redirect("login")

        username_hint = None
        metadata = getattr(supa_user, "user_metadata", None) or {}
        if isinstance(metadata, dict):
            username_hint = metadata.get("username")

        user = _ensure_local_user(supa_user.email, username_hint=username_hint)
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        return redirect("dashboard")

    return render(request, "games/login.html")


# REGISTER
def register_view(request):

    if request.method == "POST":
        username = (request.POST.get("username") or "").strip()
        email = (request.POST.get("email") or "").strip().lower()
        password1 = request.POST.get("password1")
        password2 = request.POST.get("password2")

        if not email or "@" not in email:
            messages.error(request, "Ingresa un correo válido")
            return redirect("register")

        if password1 != password2:
            messages.error(request, "Las contraseÃ±as no coinciden")
            return redirect("register")

        try:
            validate_password(password1)
        except ValidationError as e:
            for error in e.messages:
                messages.error(request, error)
            return redirect("register")

        if User.objects.filter(email=email).exists():
            messages.error(request, "El correo ya está registrado")
            return redirect("register")

        try:
            auth_client = _supabase_auth_client()
            email_redirect_to = _absolute_site_url(request, "/")
            auth_resp = auth_client.auth.sign_up(
                {
                    "email": email,
                    "password": password1,
                    "options": {
                        "data": {"username": username},
                        "email_redirect_to": email_redirect_to,
                    },
                }
            )
        except AuthWeakPasswordError as exc:
            messages.error(request, exc.message or "La contraseña es muy débil.")
            return redirect("register")
        except AuthApiError as exc:
            if exc.code in {"email_exists", "user_already_exists"}:
                messages.error(request, "El correo ya está registrado")
            else:
                messages.error(request, "No se pudo crear la cuenta.")
            return redirect("register")

        # Si Supabase requiere confirmación, no hay sesión inmediata.
        if not auth_resp.session:
            messages.success(
                request,
                "Cuenta creada. Revisa tu correo para confirmar y luego inicia sesión.",
            )
            return redirect("login")

        supa_user = auth_resp.user or auth_resp.session.user
        user = _ensure_local_user(supa_user.email, username_hint=username)
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        return redirect("home")

    return render(request, "games/register.html")


def password_reset_request_view(request):
    if request.method == "POST":
        email = (request.POST.get("email") or "").strip().lower()
        if not email:
            messages.error(request, "Ingresa un correo válido.")
            return redirect("password_reset")

        try:
            auth_client = _supabase_auth_client()
            redirect_url = _absolute_site_url(
                request,
                reverse("password_reset_confirm"),
            )
            auth_client.auth.reset_password_for_email(
                email,
                options={"redirect_to": redirect_url},
            )
        except httpx.ReadTimeout:
            messages.error(request, "Tiempo de espera al contactar Supabase. Intenta de nuevo.")
            return redirect("password_reset")
        except AuthApiError as exc:
            if exc.code == "over_email_send_rate_limit":
                messages.error(request, "Espera un momento antes de solicitar otro correo.")
                return redirect("password_reset")
            messages.error(request, "No se pudo enviar el correo de recuperación.")
            return redirect("password_reset")

        return redirect("password_reset_done")

    return render(request, "games/password_reset.html")


def password_reset_done_view(request):
    return render(request, "games/password_reset_done.html")


def password_reset_confirm_view(request):
    if request.method == "POST":
        access_token = (request.POST.get("access_token") or "").strip()
        refresh_token = (request.POST.get("refresh_token") or "").strip()
        password1 = request.POST.get("password1") or ""
        password2 = request.POST.get("password2") or ""

        if not access_token or not refresh_token:
            messages.error(request, "El enlace de recuperación no es válido.")
            return redirect("password_reset")

        if password1 != password2:
            messages.error(request, "Las contraseñas no coinciden.")
            query = urlencode({"access_token": access_token, "refresh_token": refresh_token})
            return redirect(f"{request.path}?{query}")

        try:
            validate_password(password1)
        except ValidationError as e:
            for error in e.messages:
                messages.error(request, error)
            query = urlencode({"access_token": access_token, "refresh_token": refresh_token})
            return redirect(f"{request.path}?{query}")

        try:
            auth_client = _supabase_auth_client()
            auth_client.auth.set_session(access_token, refresh_token)
            auth_client.auth.update_user({"password": password1})
        except AuthApiError:
            messages.error(request, "No se pudo cambiar la contraseña.")
            return redirect("password_reset")

        return redirect("password_reset_complete")

    access_token = (request.GET.get("access_token") or "").strip()
    refresh_token = (request.GET.get("refresh_token") or "").strip()
    return render(
        request,
        "games/password_reset_confirm.html",
        {
            "access_token": access_token,
            "refresh_token": refresh_token,
        },
    )


def password_reset_complete_view(request):
    return render(request, "games/password_reset_complete.html")

@login_required
@user_passes_test(is_jugador)
def dashboard_user(request):
    excluded_titles = {"plants vs zombies"}

    def normalizar_categoria(valor):
        txt = str(valor or "").strip().lower()
        txt = unicodedata.normalize("NFD", txt)
        return "".join(ch for ch in txt if unicodedata.category(ch) != "Mn")

    # Mapa rapido para cards del dashboard (imagen por titulo).
    # Aqui tambien se mapean los juegos externos agregados por ZIP.
    # Img de las portadas
    imagenes_por_titulo = {
        "one hit kill": "https://mukvhdxlmtjdpbpodfht.supabase.co/storage/v1/object/public/img_port/One%20Hit%20Kill.png",
        "dungeon spell": "https://mukvhdxlmtjdpbpodfht.supabase.co/storage/v1/object/public/img_port/dungeon%20spell.png",
        "regular show: fist punch": "https://mukvhdxlmtjdpbpodfht.supabase.co/storage/v1/object/public/img_port/Regular%20ShowFist%20Punch.png",
        "regular show: battle of the behemoths": "https://mukvhdxlmtjdpbpodfht.supabase.co/storage/v1/object/public/img_port/Regular%20Show%20Battle%20of%20the%20Behemoths.png",
        "sky streaker": "https://mukvhdxlmtjdpbpodfht.supabase.co/storage/v1/object/public/img_port/Sky%20Streaker.png",
        "escaping the prison": "https://mukvhdxlmtjdpbpodfht.supabase.co/storage/v1/object/public/img_port/Escaping%20the%20Prison.png",
        "extreme pamplona": "https://mukvhdxlmtjdpbpodfht.supabase.co/storage/v1/object/public/img_port/Extreme%20Pamplona.png",
        "agent p: rebel spy": "https://mukvhdxlmtjdpbpodfht.supabase.co/storage/v1/object/public/img_port/Agent%20P%20Rebel%20Spy.png",
        "bomberman pacman": "https://mukvhdxlmtjdpbpodfht.supabase.co/storage/v1/object/public/img_port/B_P.png",
        "haunt the house": "https://mukvhdxlmtjdpbpodfht.supabase.co/storage/v1/object/public/img_port/Haunt%20the%20House.png",
        "armor mayhem": "https://mukvhdxlmtjdpbpodfht.supabase.co/storage/v1/object/public/img_port/Armor%20Mayhem.png",
        "bite jacker": "https://mukvhdxlmtjdpbpodfht.supabase.co/storage/v1/object/public/img_port/Bite%20Jacker.png",
        "cactus mccoy": "https://mukvhdxlmtjdpbpodfht.supabase.co/storage/v1/object/public/img_port/Cactus%20McCoy.png",
    }
    # Categoria forzada para titulos externos o legacy.
    categoria_por_titulo = {
        "one hit kill": "Aventura",
        "dungeon spell": "Accion",
        "regular show: fist punch": "Arcade",
        "regular show: battle of the behemoths": "Arcade",
        "sky streaker": "Arcade",
        "escaping the prison": "Arcade",
        "extreme pamplona": "Arcade",
        "agent p: rebel spy": "Arcade",
        "bomberman pacman": "Arcade",
    }
    categorias_por_titulo = {
        "cactus mccoy": ["Arcade", "Accion", "Platformer"],
        "regular show: battle of the behemoths": ["Arcade", "Accion", "Science Fiction"],
        "one hit kill": ["Aventura", "Science Fiction"],
        "extreme pamplona": ["Arcade", "Platformer"],
        "dungeon spell": ["Accion", "Science Fiction"],
        "regular show: fist punch": ["Arcade","Science Fiction", "Aventura"],
    }

    juegos = []
    for juego_db in Juego.objects.only("titulo", "genero").order_by("id_juego"):
        titulo = juego_db.titulo
        if titulo.lower() in excluded_titles:
            continue
        categorias = categorias_por_titulo.get(
            titulo.lower(),
            [categoria_por_titulo.get(titulo.lower(), juego_db.genero)],
        )
        juegos.append(
            {
                "nombre": titulo,
                "categoria": " / ".join(categorias),
                "categorias": categorias,
                "imagen": _resolve_game_image(
                    imagenes_por_titulo.get(titulo.lower(), "games/img/game1.png")
                ),
            }
        )

    # Fallback: mostrar juegos externos aunque aun no exista el registro en BD.
    fallback_titles = [
        "Regular Show: Fist Punch",
        "Regular Show: Battle of the Behemoths",
        "Sky Streaker",
        "Escaping the Prison",
        "Extreme Pamplona",
        "Agent P: Rebel Spy",
        "Bomberman Pacman",
    ]
    for title in fallback_titles:
        if any(j["nombre"].lower() == title.lower() for j in juegos):
            continue
        juegos.append(
            {
                "nombre": title,
                "categoria": categoria_por_titulo[title.lower()],
                "categorias": [categoria_por_titulo[title.lower()]],
                "imagen": _resolve_game_image(imagenes_por_titulo[title.lower()]),
            }
        )

    # FILTRO BUSCADOR
    q = request.GET.get("q")
    if q:
        juegos = [j for j in juegos if q.lower() in j["nombre"].lower()]

    # FILTRO CATEGORIA
    categoria = request.GET.get("categoria")
    if categoria:
        categoria_norm = normalizar_categoria(categoria)
        juegos = [
            j for j in juegos
            if any(normalizar_categoria(cat) == categoria_norm for cat in j.get("categorias", [j["categoria"]]))
        ]

    return render(request, "games/dashboard.html", {"juegos": juegos})
# LOGOUT
def logout_view(request):
    logout(request)
    return redirect("login")

def home_redirect(request):
    return redirect("dashboard")


@login_required
def home_view(request):
    return render(request, 'games/home.html')

@login_required
@user_passes_test(is_jugador)
def juego(request, nombre):
    if (nombre or "").strip().lower() == "plants vs zombies":
        return redirect("dashboard")

    juego_db = Juego.objects.filter(
        Q(titulo__iexact=nombre) | Q(slug__iexact=nombre)
    ).first()

    if not juego_db:
        return redirect("dashboard")

    return render(
        request,
        "games/juego.html",
        {
            "juego": juego_db,
            "nombre": juego_db.titulo,
            "juego_id": juego_db.id_juego,
            "disable_realtime_ui": False,
            "disable_global_music": True,
        },
    )

@login_required
@user_passes_test(is_jugador)
def catalogo(request):
    return render(request, "games/catalogo.html")

@login_required
@user_passes_test(is_jugador)
def mis_juegos(request):
    return render(request, "games/mis_juegos.html")

@login_required
#guarda todo en supabase
def edit_profile(request):
    profile, _ = Profile.objects.get_or_create(user=request.user)

    if request.method == "POST":
        user_form = EditProfileForm(request.POST, instance=request.user)
        profile_form = ProfileForm(request.POST, request.FILES, instance=profile)

        if user_form.is_valid():
            user_form.save()
            avatar = request.FILES.get("avatar")
            previous_avatar_url = profile.avatar
            if avatar:
                max_size = 3 * 1024 * 1024
                if avatar.size > max_size:
                    messages.error(request, "El avatar excede el limite de 3MB.", extra_tags="profile")
                    return render(request, "games/edit_profile.html", {
                        "user_form": user_form,
                        "profile_form": profile_form,
                    }, status=400)

                allowed_types = {"image/jpeg", "image/png", "image/webp", "image/gif"}
                detected_type = (avatar.content_type or "").lower().strip()
                if detected_type not in allowed_types:
                    guessed, _ = mimetypes.guess_type(avatar.name or "")
                    detected_type = (guessed or "").lower()
                    if detected_type not in allowed_types:
                        messages.error(
                            request,
                            "Formato de avatar no valido. Usa JPG, PNG, WEBP o GIF.",
                            extra_tags="profile",
                        )
                        return render(request, "games/edit_profile.html", {
                            "user_form": user_form,
                            "profile_form": profile_form,
                        }, status=400)

                try:
                    avatar_bytes = avatar.read()
                    _, public_url = upload_profile_avatar(
                        user_id=request.user.id,
                        original_name=avatar.name or "avatar.bin",
                        content=avatar_bytes,
                        content_type=detected_type or avatar.content_type,
                    )
                    profile.avatar = f"{public_url}?v={uuid.uuid4().hex}"
                    profile.save(update_fields=["avatar"])
                    if previous_avatar_url and previous_avatar_url != public_url:
                        try:
                            delete_profile_avatar_from_url(public_url=previous_avatar_url)
                        except Exception:
                            pass
                except Exception:
                    messages.error(
                        request,
                        "No se pudo subir el avatar a Supabase Storage.",
                        extra_tags="profile",
                    )
                    return render(request, "games/edit_profile.html", {
                        "user_form": user_form,
                        "profile_form": profile_form,
                    }, status=502)

            return redirect("dashboard")

        messages.error(
            request,
            f"Errores en usuario: {user_form.errors.as_text()}",
            extra_tags="profile",
        )
    else:
        user_form = EditProfileForm(instance=request.user)
        profile_form = ProfileForm(instance=profile)

    return render(request, "games/edit_profile.html", {
        "user_form": user_form,
        "profile_form": profile_form,
    })

@login_required
def soporte(request):
    # Flag para mostrar mensaje visual de envio exitoso en la plantilla.
    # support_games alimenta el select dinamico de juegos en soporte.html.
    context = {"support_saved": False, "support_games": _support_games_options()}

    if request.method == "POST":
        # Mensajes de este modulo van con tag "support" para no mezclarlos.
        tipo = (request.POST.get("tipo") or "").strip().lower()
        motivo = (request.POST.get("motivo") or "").strip()
        juego = (request.POST.get("game") or "").strip()
        screenshot = request.FILES.get("screenshot")

        if tipo not in {"juego", "plataforma"}:
            messages.error(request, "Selecciona un tipo de problema valido.", extra_tags="support")
            return render(request, "games/soporte.html", context, status=400)

        if len(motivo) < 10:
            messages.error(request, "Describe el problema con al menos 10 caracteres.", extra_tags="support")
            return render(request, "games/soporte.html", context, status=400)

        if tipo == "juego" and not juego:
            messages.error(request, "Debes indicar en que juego ocurrio el problema.", extra_tags="support")
            return render(request, "games/soporte.html", context, status=400)

        screenshot_url = None
        if screenshot:
            # La captura tambien se valida y sube a Supabase Storage.
            max_size = 5 * 1024 * 1024
            if screenshot.size > max_size:
                messages.error(request, "La captura excede el limite de 5MB.", extra_tags="support")
                return render(request, "games/soporte.html", context, status=400)

            allowed_types = {"image/jpeg", "image/png", "image/webp", "image/gif"}
            detected_type = (screenshot.content_type or "").lower().strip()
            if detected_type not in allowed_types:
                guessed, _ = mimetypes.guess_type(screenshot.name or "")
                detected_type = (guessed or "").lower()
                if detected_type not in allowed_types:
                    messages.error(
                        request,
                        "Formato de captura no valido. Usa JPG, PNG, WEBP o GIF.",
                        extra_tags="support",
                    )
                    return render(request, "games/soporte.html", context, status=400)

            try:
                screenshot_bytes = screenshot.read()
                _, screenshot_url = upload_support_screenshot(
                    user_id=request.user.id,
                    original_name=screenshot.name or "screenshot.bin",
                    content=screenshot_bytes,
                    content_type=detected_type,
                )
            except Exception:
                messages.error(request, "No se pudo subir la captura a Supabase Storage.", extra_tags="support")
                return render(request, "games/soporte.html", context, status=502)

        payload = {
            "user_id": request.user.id,
            "username": request.user.username,
            "email": request.user.email,
            "tipo": tipo,
            "game": juego if tipo == "juego" else None,
            "motivo": motivo,
            "screenshot_name": screenshot_url,
            "estado": "pendiente",
            "created_at": timezone.now().isoformat(),
        }

        try:
            # Persistencia del ticket en Supabase (tabla soporte por defecto).
            insert_support_ticket(payload)
        except Exception as exc:
            err_text = str(exc).lower()
            if "row-level security policy" in err_text:
                try:
                    _insert_support_ticket_via_db(payload)
                    messages.success(request, "Tu reporte fue enviado correctamente.", extra_tags="support")
                    context["support_saved"] = True
                    return render(request, "games/soporte.html", context)
                except Exception:
                    messages.error(
                        request,
                        "No se pudo enviar el reporte: la clave de Supabase no tiene permisos de escritura (RLS).",
                        extra_tags="support",
                    )
            else:
                messages.error(request, "No se pudo enviar el reporte a soporte.", extra_tags="support")
            return render(request, "games/soporte.html", context, status=502)

        messages.success(request, "Tu reporte fue enviado correctamente.", extra_tags="support")
        context["support_saved"] = True

    return render(request, "games/soporte.html", context)

@login_required
def registrar_partida(request):
    if request.method != "POST":
        return JsonResponse({"ok": False, "error": "Metodo no permitido"}, status=405)

    try:
        data = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({"ok": False, "error": "JSON invalido"}, status=400)

    juego_id = data.get("id_juego")
    score = data.get("score", 0)
    tiempo_juego = data.get("tiempo_juego", 0)

    if not juego_id:
        return JsonResponse({"ok": False, "error": "id_juego es requerido"}, status=400)

    try:
        juego = Juego.objects.get(pk=int(juego_id))
    except (ValueError, TypeError, Juego.DoesNotExist):
        return JsonResponse({"ok": False, "error": "Juego no encontrado"}, status=404)

    usuario, _ = Usuario.objects.get_or_create(
        id_usuario=request.user.id,
        defaults={
            "nombre": request.user.username,
            "email": request.user.email,
            "fecha_registro": request.user.date_joined.date(),
            "es_superusuario": request.user.is_superuser,
        },
    )

    try:
        score_int = max(0, int(score))
        tiempo_int = max(0, int(tiempo_juego))
    except (ValueError, TypeError):
        return JsonResponse({"ok": False, "error": "score/tiempo_juego invalidos"}, status=400)

    partida = Partida.objects.create(
        id_usuario_id=usuario.id_usuario,
        id_juego_id=juego.id_juego,
        tiempo_juego=tiempo_int,
        score=score_int,
        fecha_partida=date.today(),
    )

    return JsonResponse({"ok": True, "id_partida": partida.id_partida})

@login_required
def dashboard_router(request):
    role = get_user_role(request.user)

    if request.user.is_superuser or role == ROLE_ADMIN:
        return redirect("dashboard_admin")
    if role == ROLE_DESARROLLADOR:
        return redirect("dashboard_dev")
    return redirect("dashboard_user")

@login_required
@user_passes_test(is_admin)
def dashboard_admin(request):
    # Contadores
    total_users = User.objects.count()
    total_admins = User.objects.filter(is_superuser=True).count()

    total_games = Juego.objects.count()
    total_partidas = Partida.objects.count()

    # Ãšltimas partidas (10) -> con FK listas (usuario y juego)
    ultimas_partidas = (
        Partida.objects
        .select_related("id_usuario", "id_juego")
        .order_by("-id_partida")[:10]
    )

    # Top jugadores por score acumulado
    top_jugadores = (
        Partida.objects
        .values("id_usuario", "id_usuario__nombre")  # trae nombre desde Usuario
        .annotate(total_score=Sum("score"), partidas=Count("id_partida"))
        .order_by("-total_score")[:5]
    )

    context = {
        "total_users": total_users,
        "total_admins": total_admins,
        "total_games": total_games,
        "total_partidas": total_partidas,
        "ultimas_partidas": ultimas_partidas,
        "top_jugadores": top_jugadores,
    }
    return render(request, "games/dashboard_admin.html", context)
@login_required
@user_passes_test(is_desarrollador)
def dashboard_dev(request):
    hoy = timezone.localdate()

    # Métricas “hoy”
    partidas_hoy = Partida.objects.filter(fecha_partida=hoy)
    partidas_hoy_count = partidas_hoy.count()

    usuarios_activos_hoy = (
        partidas_hoy.values("id_usuario_id").distinct().count()
    )

    score_promedio_hoy = partidas_hoy.aggregate(avg=Avg("score"))["avg"] or 0
    score_promedio_global = Partida.objects.aggregate(avg=Avg("score"))["avg"] or 0

    # Juego más jugado (hoy y global)
    juego_top_hoy = (
        partidas_hoy.values("id_juego__titulo")
        .annotate(n=Count("id_partida"))
        .order_by("-n")
        .first()
    )
    juego_top_global = (
        Partida.objects.values("id_juego__titulo")
        .annotate(n=Count("id_partida"))
        .order_by("-n")
        .first()
    )

    # Actividad reciente
    actividad = (
        Partida.objects
        .select_related("id_usuario", "id_juego")
        .order_by("-id_partida")[:15]
    )

    # Estado del sistema (solo info)
    system_info = {
        "server_time": timezone.now(),
        "debug": settings.DEBUG,
        "db_vendor": connection.vendor,
    }

    context = {
        "hoy": hoy,
        "partidas_hoy_count": partidas_hoy_count,
        "usuarios_activos_hoy": usuarios_activos_hoy,
        "score_promedio_hoy": round(float(score_promedio_hoy), 2),
        "score_promedio_global": round(float(score_promedio_global), 2),
        "juego_top_hoy": juego_top_hoy["id_juego__titulo"] if juego_top_hoy else "—",
        "juego_top_hoy_count": juego_top_hoy["n"] if juego_top_hoy else 0,
        "juego_top_global": juego_top_global["id_juego__titulo"] if juego_top_global else "—",
        "juego_top_global_count": juego_top_global["n"] if juego_top_global else 0,
        "actividad": actividad,
        "system_info": system_info,
    }
    return render(request, "games/dashboard_dev.html", context)

@login_required
@user_passes_test(is_admin)
def soporte_admin(request):
    # Estados habilitados para gestion operativa del ticket.
    allowed_status = {"pendiente", "en_proceso", "cerrado"}

    if request.method == "POST":
        ticket_id_raw = (request.POST.get("ticket_id") or "").strip()
        estado = (request.POST.get("estado") or "").strip().lower()

        if not ticket_id_raw.isdigit() or estado not in allowed_status:
            messages.error(request, "Datos invalidos para actualizar ticket.")
            return redirect("soporte_admin")

        try:
            # Admin puede actualizar cualquier ticket.
            resp = update_support_ticket_status(int(ticket_id_raw), estado)
            if resp.data:
                messages.success(request, "Estado de ticket actualizado.")
            else:
                # Algunas policies RLS responden [] en lugar de error.
                updated = _update_support_ticket_status_via_db(int(ticket_id_raw), estado)
                if updated:
                    messages.success(request, "Estado de ticket actualizado.")
                else:
                    messages.error(request, "Ticket no encontrado.")
        except Exception as exc:
            if "row-level security policy" in str(exc).lower():
                try:
                    updated = _update_support_ticket_status_via_db(int(ticket_id_raw), estado)
                    if updated:
                        messages.success(request, "Estado de ticket actualizado.")
                    else:
                        messages.error(request, "Ticket no encontrado.")
                except Exception:
                    messages.error(request, "No se pudo actualizar el ticket en soporte.")
            else:
                messages.error(request, "No se pudo actualizar el ticket en Supabase.")
        return redirect("soporte_admin")

    tickets = []
    try:
        # Admin visualiza todos los tickets de soporte.
        resp = list_support_tickets(limit=200)
        tickets = resp.data or []
        if not tickets:
            # Algunas policies RLS devuelven lista vacia sin lanzar excepcion.
            tickets = _list_support_tickets_via_db(limit=200)
    except Exception as exc:
        if "row-level security policy" in str(exc).lower():
            try:
                tickets = _list_support_tickets_via_db(limit=200)
            except Exception:
                messages.error(request, "No se pudieron cargar tickets de soporte.")
        else:
            messages.error(request, "No se pudieron cargar tickets de soporte.")

    return render(
        request,
        "games/soporte_admin.html",
        {"tickets": tickets, "allowed_status": sorted(allowed_status)},
    )


@login_required
@user_passes_test(is_desarrollador)
def soporte_dev(request):
    # Dev usa el mismo flujo de tickets que admin (juego y plataforma).
    allowed_status = {"pendiente", "en_proceso", "cerrado"}

    if request.method == "POST":
        ticket_id_raw = (request.POST.get("ticket_id") or "").strip()
        estado = (request.POST.get("estado") or "").strip().lower()

        if not ticket_id_raw.isdigit() or estado not in allowed_status:
            messages.error(request, "Datos invalidos para actualizar ticket.")
            return redirect("soporte_dev")

        try:
            resp = update_support_ticket_status(
                int(ticket_id_raw),
                estado,
            )
            if resp.data:
                messages.success(request, "Estado de ticket actualizado.")
            else:
                # Algunas policies RLS responden []: intentar fallback SQL.
                updated = _update_support_ticket_status_via_db(
                    int(ticket_id_raw),
                    estado,
                )
                if updated:
                    messages.success(request, "Estado de ticket actualizado.")
                else:
                    messages.error(request, "Ticket no encontrado.")
        except Exception as exc:
            if "row-level security policy" in str(exc).lower():
                try:
                    updated = _update_support_ticket_status_via_db(
                        int(ticket_id_raw),
                        estado,
                    )
                    if updated:
                        messages.success(request, "Estado de ticket actualizado.")
                    else:
                        messages.error(request, "Ticket no encontrado.")
                except Exception:
                    messages.error(request, "No se pudo actualizar el ticket en soporte.")
            else:
                messages.error(request, "No se pudo actualizar el ticket en Supabase.")
        return redirect("soporte_dev")

    tickets = []
    try:
        # Panel de desarrollo: mostrar todos los tickets de soporte.
        resp = list_support_tickets(limit=200)
        tickets = resp.data or []
        if not tickets:
            # Algunas policies RLS devuelven lista vacia sin excepcion.
            tickets = _list_support_tickets_via_db(limit=200)
    except Exception as exc:
        if "row-level security policy" in str(exc).lower():
            try:
                tickets = _list_support_tickets_via_db(limit=200)
            except Exception:
                messages.error(request, "No se pudieron cargar tickets de soporte.")
        else:
            messages.error(request, "No se pudieron cargar tickets de soporte.")

    return render(
        request,
        "games/soporte_dev.html",
        {"tickets": tickets, "allowed_status": sorted(allowed_status)},
    )

#Mensajes


@login_required
def api_friends_list(request):
    friend_ids = list(_friend_ids(request.user))
    friends = User.objects.filter(id__in=friend_ids).order_by("username")
    return JsonResponse({"ok": True, "friends": [_serialize_user(u) for u in friends]})

@login_required
def api_friend_requests(request):
    incoming = FriendRequest.objects.filter(to_user=request.user, status="pending").select_related("from_user").order_by("-created_at")
    outgoing = FriendRequest.objects.filter(from_user=request.user, status="pending").select_related("to_user").order_by("-created_at")

    return JsonResponse({
        "ok": True,
        "incoming": [{"id": fr.id, "from_user": _serialize_user(fr.from_user), "created_at": fr.created_at.isoformat()} for fr in incoming],
        "outgoing": [{"id": fr.id, "to_user": _serialize_user(fr.to_user), "created_at": fr.created_at.isoformat()} for fr in outgoing],
    })

@login_required
@require_http_methods(["POST"])
def api_friend_request_send(request):
    try:
        data = json.loads(request.body.decode("utf-8"))
    except Exception:
        data = {}

    query = (data.get("q") or "").strip()
    if not query:
        return JsonResponse({"ok": False, "error": "q requerido"}, status=400)

    to_user = (
        User.objects.filter(email__iexact=query).first()
        if "@" in query
        else User.objects.filter(username__iexact=query).first()
    )

    if not to_user:
        return JsonResponse({"ok": False, "error": "Usuario no encontrado"}, status=404)
    if to_user.id == request.user.id:
        return JsonResponse({"ok": False, "error": "No puedes agregarte a ti misma"}, status=400)
    if Friendship.are_friends(request.user, to_user):
        return JsonResponse({"ok": False, "error": "Ya son amigos"}, status=400)

    inverse = FriendRequest.objects.filter(
        from_user=to_user,
        to_user=request.user,
        status="pending"
    ).first()

    if inverse:
        inverse.status = "accepted"
        inverse.save(update_fields=["status"])

        u1, u2 = Friendship.normalize_pair(request.user, to_user)
        Friendship.objects.get_or_create(user1=u1, user2=u2)

        Notification.objects.create(
            user=to_user,
            type=Notification.TYPE_FRIEND_ACCEPTED,
            title="Solicitud aceptada",
            text=f"{request.user.username} aceptó tu solicitud de amistad."
        )

        return JsonResponse({"ok": True, "auto_accepted": True})

    fr, created = FriendRequest.objects.get_or_create(
        from_user=request.user,
        to_user=to_user,
        defaults={"status": "pending"}
    )

    if created:
        Notification.objects.create(
            user=to_user,
            type=Notification.TYPE_FRIEND_REQUEST,
            title="Nueva solicitud de amistad",
            text=f"{request.user.username} quiere agregarte como amigo."
        )

    return JsonResponse({"ok": True, "request_id": fr.id})

@login_required
@require_http_methods(["POST"])
def api_friend_request_accept(request, request_id: int):
    fr = FriendRequest.objects.filter(
        id=request_id,
        to_user=request.user
    ).select_related("from_user").first()

    if not fr or fr.status != "pending":
        return JsonResponse({"ok": False, "error": "Solicitud no válida"}, status=404)

    fr.status = "accepted"
    fr.save(update_fields=["status"])

    u1, u2 = Friendship.normalize_pair(request.user, fr.from_user)
    Friendship.objects.get_or_create(user1=u1, user2=u2)

    Notification.objects.create(
        user=fr.from_user,
        type=Notification.TYPE_FRIEND_ACCEPTED,
        title="Solicitud aceptada",
        text=f"{request.user.username} aceptó tu solicitud de amistad."
    )

    return JsonResponse({"ok": True})

@login_required
@require_http_methods(["POST"])
def api_friend_request_decline(request, request_id: int):
    fr = FriendRequest.objects.filter(id=request_id, to_user=request.user).first()
    if not fr or fr.status != "pending":
        return JsonResponse({"ok": False, "error": "Solicitud no vÃ¡lida"}, status=404)
    fr.status = "declined"
    fr.save(update_fields=["status"])
    return JsonResponse({"ok": True})



@login_required
def api_message_threads(request):
    friend_ids = list(_friend_ids(request.user))
    if not friend_ids:
        return JsonResponse({"ok": True, "threads": []})

    friends = list(User.objects.filter(id__in=friend_ids).only("id", "username", "email").order_by("username"))
    friends_by_id = {friend.id: friend for friend in friends}

    last_by_friend_id = {}
    last_messages = (
        DirectMessage.objects
        .filter(
            Q(sender=request.user, receiver_id__in=friend_ids)
            | Q(sender_id__in=friend_ids, receiver=request.user)
        )
        .values("sender_id", "receiver_id", "body", "created_at")
        .order_by("-created_at")
    )
    for row in last_messages:
        other_id = row["receiver_id"] if row["sender_id"] == request.user.id else row["sender_id"]
        if other_id in last_by_friend_id:
            continue
        last_by_friend_id[other_id] = {
            "body": row["body"],
            "created_at": row["created_at"].isoformat(),
            "from_me": row["sender_id"] == request.user.id,
        }

    threads = []
    for friend_id, friend in friends_by_id.items():
        threads.append({
            "user": _serialize_user(friend),
            "last_message": last_by_friend_id.get(friend_id),
        })

    # ordenar: chats con mensaje arriba
    threads.sort(
        key=lambda t: (t["last_message"]["created_at"] if t["last_message"] else ""),
        reverse=True,
    )
    return JsonResponse({"ok": True, "threads": threads})


@login_required
def api_message_thread_detail(request, user_id: int):
    other = User.objects.filter(id=user_id).first()
    if not other:
        return JsonResponse({"ok": False, "error": "Usuario no existe"}, status=404)

    if not Friendship.are_friends(request.user, other):
        return JsonResponse({"ok": False, "error": "No son amigos"}, status=403)

    msgs = (DirectMessage.objects
            .filter(Q(sender=request.user, receiver=other) | Q(sender=other, receiver=request.user))
            .order_by("created_at"))

    # Marcar como leÃ­do lo que te enviaron
    DirectMessage.objects.filter(
        sender=other, 
        receiver=request.user, 
        is_read=False
    ).update(is_read=True)
    
    Notification.objects.filter(
        user=request.user,
        type=Notification.TYPE_MESSAGE,
        is_read=False
    ).update(is_read=True)

    return JsonResponse({
        "ok": True,
        "other": _serialize_user(other),
        "messages": [
            {"id": m.id, "body": m.body, "created_at": m.created_at.isoformat(), "from_me": m.sender_id == request.user.id}
            for m in msgs
        ],
    })

@login_required
@require_http_methods(["POST"])
def api_message_thread_mark_read(request, user_id: int):
    other = User.objects.filter(id=user_id).first()
    if not other:
        return JsonResponse({"ok": False, "error": "Usuario no existe"}, status=404)

    if not Friendship.are_friends(request.user, other):
        return JsonResponse({"ok": False, "error": "No son amigos"}, status=403)

    DirectMessage.objects.filter(
        sender=other,
        receiver=request.user,
        is_read=False
    ).update(is_read=True)

    Notification.objects.filter(
        user=request.user,
        type=Notification.TYPE_MESSAGE,
        is_read=False
    ).update(is_read=True)

    return JsonResponse({"ok": True})

@login_required
@require_http_methods(["POST"])
def api_message_send(request, user_id: int):
    other = User.objects.filter(id=user_id).first()
    if not other:
        return JsonResponse({"ok": False, "error": "Usuario no existe"}, status=404)

    if not Friendship.are_friends(request.user, other):
        return JsonResponse({"ok": False, "error": "No son amigos"}, status=403)

    data = json.loads(request.body.decode("utf-8")) if request.body else {}
    body = (data.get("body") or "").strip()
    if not body:
        return JsonResponse({"ok": False, "error": "Mensaje vacío"}, status=400)

    msg = DirectMessage.objects.create(
        sender=request.user,
        receiver=other,
        body=body
    )

    Notification.objects.create(
        user=other,
        type=Notification.TYPE_MESSAGE,
        title="Nuevo mensaje",
        text=f"{request.user.username} te envió un mensaje: {body[:80]}"
    )

    return JsonResponse({
        "ok": True,
        "message": {
            "id": msg.id,
            "body": msg.body,
            "created_at": msg.created_at.isoformat(),
            "from_me": True
        }
    })
    
#Helpers
def _avatar_url(user):
    try:
        if hasattr(user, "profile") and user.profile.avatar:
            value = str(user.profile.avatar).strip()
            if value.startswith(("http://", "https://")):
                return value
            media_url = getattr(settings, "MEDIA_URL", "/media/") or "/media/"
            return f"{media_url.rstrip('/')}/{value.lstrip('/')}"
    except Exception:
        pass
    return None

def _serialize_user(user):
    return {"id": user.id, "username": user.username, "email": user.email, "avatar": _avatar_url(user)}

def _friend_ids(me):
    pairs = Friendship.objects.filter(Q(user1=me) | Q(user2=me)).values_list("user1_id", "user2_id")
    ids = set()
    for a, b in pairs:
        ids.add(b if a == me.id else a)
    return ids


@login_required
def api_messages_unread_count(request):
    c = DirectMessage.objects.filter(receiver=request.user, is_read=False).count()
    return JsonResponse({"ok": True, "count": c})


    
@login_required
def api_notifications_list(request):
    notifications = Notification.objects.filter(user=request.user).order_by("-created_at")[:30]

    data = []
    for n in notifications:
        action = None

        if n.type == Notification.TYPE_MESSAGE:
            action = "messages"
        elif n.type == Notification.TYPE_FRIEND_REQUEST:
            action = "requests"
        elif n.type == Notification.TYPE_FRIEND_ACCEPTED:
            action = "friends"

        data.append({
            "id": n.id,
            "type": n.type,
            "title": n.title,
            "text": n.text,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat(),
            "action": action,
        })

    return JsonResponse({
        "ok": True,
        "notifications": data,
    })


@login_required
def api_notifications_unread_count(request):
    count = Notification.objects.filter(user=request.user, is_read=False).count()
    return JsonResponse({"ok": True, "count": count})


@login_required
@require_http_methods(["POST"])
def api_notifications_mark_all_read(request):
    Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
    return JsonResponse({"ok": True})

def jugar(request, slug):
    juego = get_object_or_404(Juego, slug=slug, activo=True)
    return render(
        request,
        "games/jugar.html",
        {
            "juego": juego,
            "disable_global_music": True,
        },
    )
