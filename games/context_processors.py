import os
from django.templatetags.static import static
from django.conf import settings
from supabase_cliente import get_public_storage_url


def _resolve_avatar_url(value: str | None) -> str | None:
    if not value:
        return None
    value = str(value).strip()
    if value.startswith(("http://", "https://")):
        return value
    media_url = getattr(settings, "MEDIA_URL", "/media/") or "/media/"
    return f"{media_url.rstrip('/')}/{value.lstrip('/')}"

def current_user_avatar(request):
    # Avatar de usuario (Supabase o fallback a MEDIA_URL si es ruta legacy).
    avatar_url = None
    try:
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return {"current_user_avatar_url": None}

        if hasattr(user, "profile") and user.profile.avatar:
            avatar_url = _resolve_avatar_url(user.profile.avatar)
    except Exception:
        avatar_url = None

    return {"current_user_avatar_url": avatar_url}


def ui_audio_urls(request):
    # URLs de audio para UI: intenta Storage y cae a static local si falla.
    bucket = os.getenv("SUPABASE_STORAGE_BUCKET_AUDIO", "ui-audio")
    files = {
        "click_editar_perfil": "click_editar_perfil.mp3",
        "click_cerrar_sesion": "click_cerrar_sesion.mp3",
        "hover_card": "hover_card.mp3",
        "bg_music": "bg-music.mp3",
        "dashboard_sonido": "dashboard_sonido.mp3",
        "login_bg": "login_bg.mp3",
        "mouse_pass": "mouse_pass.mp3",
        "register_bg": "register_bg.mp3",
    }

    urls = {}
    for key, filename in files.items():
        fallback = static(f"games/sounds/{filename}")
        try:
            urls[key] = get_public_storage_url(
                bucket_name=bucket,
                object_path=f"ui/{filename}",
            )
        except Exception:
            urls[key] = fallback

    return {"ui_audio": urls}

def supabase_public(request):
    return {
        "SUPABASE_URL": getattr(settings, "SUPABASE_URL", ""),
        "SUPABASE_ANON_KEY": getattr(settings, "SUPABASE_ANON_KEY", ""),
    }
