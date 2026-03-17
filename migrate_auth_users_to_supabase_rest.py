import argparse
import os
import secrets
import string
import time
from pathlib import Path

from dotenv import load_dotenv
from supabase import AuthApiError, create_client


def _load_env() -> None:
    base_dir = Path(__file__).resolve().parent
    load_dotenv(base_dir / ".env")


def _random_password(length: int = 20) -> str:
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


def _fetch_auth_users(admin_client, *, batch_size: int = 500, limit: int = 0):
    fetched = 0
    start = 0
    while True:
        end = start + batch_size - 1
        query = admin_client.table("auth_user").select(
            "id,username,email,is_superuser,is_active"
        )
        resp = query.range(start, end).execute()
        rows = resp.data or []
        if not rows:
            break
        for row in rows:
            yield row
            fetched += 1
            if limit and fetched >= limit:
                return
        if len(rows) < batch_size:
            break
        start += batch_size


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Migra usuarios de Django (auth_user) a Supabase Auth via PostgREST."
    )
    parser.add_argument(
        "--send-reset",
        action="store_true",
        help="Enviar email de recuperacion para cada usuario (incluye existentes).",
    )
    parser.add_argument(
        "--redirect-url",
        default="http://localhost:8000/password-reset/confirm/",
        help="URL de redireccion para recovery (debe estar en Redirect URLs de Supabase).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Limite de usuarios a migrar (0 = sin limite).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Solo listar usuarios, sin crear ni enviar correos.",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=0.0,
        help="Segundos de espera entre envios de reset para evitar rate limit.",
    )
    args = parser.parse_args()

    _load_env()
    admin_client, anon_client = _get_clients()

    seen_emails = set()
    created = 0
    existing = 0
    skipped = 0
    errors = 0
    reset_sent = 0
    reset_errors = 0

    for user in _fetch_auth_users(admin_client, limit=args.limit):
        email = (user.get("email") or "").strip().lower()
        if not email:
            skipped += 1
            continue
        if email in seen_emails:
            skipped += 1
            continue
        seen_emails.add(email)

        if args.dry_run:
            print(f"[DRY] {email}")
            continue

        payload = {
            "email": email,
            "email_confirm": True,
            "password": _random_password(),
            "user_metadata": {
                "username": user.get("username") or "",
                "django_user_id": user.get("id"),
                "is_superuser": bool(user.get("is_superuser")),
                "is_active": bool(user.get("is_active")),
            },
        }

        try:
            admin_client.auth.admin.create_user(payload)
            created += 1
        except AuthApiError as exc:
            if exc.code in {"email_exists", "user_already_exists", "conflict"}:
                existing += 1
            else:
                errors += 1
                print(f"[ERROR] {email}: {exc.message}")
                continue

        if args.send_reset:
            try:
                anon_client.auth.reset_password_for_email(
                    email, options={"redirect_to": args.redirect_url}
                )
                reset_sent += 1
            except AuthApiError as exc:
                reset_errors += 1
                print(f"[ERROR] reset {email}: {exc.message}")
            if args.sleep and args.sleep > 0:
                time.sleep(args.sleep)

    print(
        "Listo. "
        f"Creados: {created} | Existentes: {existing} | "
        f"Omitidos: {skipped} | Errores: {errors} | "
        f"Reset enviados: {reset_sent} | Reset errores: {reset_errors}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
