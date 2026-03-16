import argparse
import os
import secrets
import string
from pathlib import Path

import django
from dotenv import load_dotenv
from supabase import AuthApiError, create_client


def _load_env() -> None:
    base_dir = Path(__file__).resolve().parent
    load_dotenv(base_dir / ".env")


def _random_password(length: int = 20) -> str:
    # Garantiza mezcla de tipos para evitar rechazos por fuerza de password.
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*()-_=+"
    while True:
        password = "".join(secrets.choice(alphabet) for _ in range(length))
        if (
            any(c.islower() for c in password)
            and any(c.isupper() for c in password)
            and any(c.isdigit() for c in password)
            and any(c in "!@#$%^&*()-_=+" for c in password)
        ):
            return password


def _setup_django() -> None:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "MondongoGames.settings")
    django.setup()


def _get_clients():
    url = os.getenv("SUPABASE_URL", "")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    anon_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY", "")
    if not url or not service_key:
        raise RuntimeError("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env")
    if not anon_key:
        raise RuntimeError("Falta SUPABASE_ANON_KEY (o SUPABASE_KEY) en .env")
    admin_client = create_client(url, service_key)
    anon_client = create_client(url, anon_key)
    return admin_client, anon_client


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Migra usuarios de Django (auth_user) a Supabase Auth."
    )
    parser.add_argument(
        "--send-reset",
        action="store_true",
        help="Enviar email de recuperación después de crear cada usuario.",
    )
    parser.add_argument(
        "--redirect-url",
        default="http://localhost:8000/password-reset/confirm/",
        help="URL de redirección para recovery (debe estar en Redirect URLs de Supabase).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Límite de usuarios a migrar (0 = sin límite).",
    )
    args = parser.parse_args()

    _load_env()
    _setup_django()
    admin_client, anon_client = _get_clients()

    from django.contrib.auth import get_user_model  # noqa: E402

    User = get_user_model()
    qs = User.objects.all().only("id", "username", "email", "is_active", "is_superuser")
    if args.limit and args.limit > 0:
        qs = qs[: args.limit]

    seen_emails = set()
    created = 0
    skipped = 0
    errors = 0

    for user in qs:
        email = (user.email or "").strip().lower()
        if not email:
            skipped += 1
            continue
        if email in seen_emails:
            skipped += 1
            continue
        seen_emails.add(email)

        payload = {
            "email": email,
            "email_confirm": True,
            "password": _random_password(),
            "user_metadata": {
                "username": user.username,
                "django_user_id": user.id,
                "is_superuser": bool(user.is_superuser),
            },
        }

        try:
            admin_client.auth.admin.create_user(payload)
            created += 1
        except AuthApiError as exc:
            if exc.code in {"email_exists", "user_already_exists", "conflict"}:
                skipped += 1
                continue
            errors += 1
            print(f"[ERROR] {email}: {exc.message}")
            continue

        if args.send_reset:
            try:
                anon_client.auth.reset_password_for_email(
                    email, options={"redirect_to": args.redirect_url}
                )
            except AuthApiError as exc:
                errors += 1
                print(f"[ERROR] reset {email}: {exc.message}")

    print(
        f"Listo. Creados: {created} | Omitidos: {skipped} | Errores: {errors}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
