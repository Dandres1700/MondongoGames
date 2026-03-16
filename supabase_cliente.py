import os
import posixpath
from pathlib import Path
from uuid import uuid4
from typing import Any

from dotenv import load_dotenv
import httpx
from supabase import Client, create_client
from supabase.lib.client_options import SyncClientOptions

# Utilidades de acceso a Supabase (tabla soporte + Storage de avatar/capturas).
# Carga .env del proyecto de forma deterministica (independiente del CWD).
_BASE_DIR = Path(__file__).resolve().parent
load_dotenv(_BASE_DIR / ".env")

_supabase_client: Client | None = None 


def get_supabase_client() -> Client:
    global _supabase_client

    # Reutiliza el cliente para evitar recrearlo en cada request.
    if _supabase_client is not None:
        return _supabase_client

    url = os.environ.get("SUPABASE_URL", "")
    # En backend se recomienda usar la service role key para operaciones con RLS.
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY", "")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_KEY) deben estar configuradas en .env"
        )

    _supabase_client = create_client(url, key)
    return _supabase_client


def create_supabase_auth_client() -> Client:
    # Crea un cliente nuevo por request para evitar sesiones compartidas.
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("SUPABASE_KEY", "")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL y SUPABASE_ANON_KEY (o SUPABASE_KEY) deben estar configuradas en .env"
        )
    # Timeout corto para evitar cuelgues en requests de Auth.
    http_client = httpx.Client(timeout=10.0)
    options = SyncClientOptions(httpx_client=http_client)
    return create_client(url, key, options)


def create_supabase_admin_auth_client() -> Client:
    # Cliente admin para crear usuarios en Supabase Auth (service role).
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configuradas en .env"
        )
    # Timeout corto para operaciones admin.
    http_client = httpx.Client(timeout=10.0)
    options = SyncClientOptions(httpx_client=http_client)
    return create_client(url, key, options)


def insert_support_ticket(payload: dict[str, Any], table_name: str | None = None):
    # Inserta un ticket de soporte desde el formulario web.
    table = table_name or os.environ.get("SUPABASE_SUPPORT_TABLE", "soporte")
    client = get_supabase_client()
    return client.table(table).insert(payload).execute()


def list_support_tickets(
    *,
    only_game_issues: bool = False,
    limit: int = 100,
    table_name: str | None = None,
):
    # Lista tickets ordenados por fecha; opcionalmente filtra solo incidencias de juego.
    table = table_name or os.environ.get("SUPABASE_SUPPORT_TABLE", "soporte")
    client = get_supabase_client()
    query = client.table(table).select("*").order("created_at", desc=True).limit(limit)
    if only_game_issues:
        query = query.eq("tipo", "juego")
    return query.execute()


def update_support_ticket_status(
    ticket_id: int,
    estado: str,
    *,
    only_game_issues: bool = False,
    table_name: str | None = None,
):
    # Actualiza estado de ticket; en modo dev solo permite tocar tickets de tipo juego.
    table = table_name or os.environ.get("SUPABASE_SUPPORT_TABLE", "soporte")
    client = get_supabase_client()
    query = client.table(table).update({"estado": estado}).eq("id", ticket_id)
    if only_game_issues:
        query = query.eq("tipo", "juego")
    return query.execute()


def _coerce_public_url(value: Any) -> str:
    # Normaliza la respuesta del SDK (string o dict) a una URL simple.
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        if "publicUrl" in value:
            return str(value["publicUrl"])
        data = value.get("data")
        if isinstance(data, dict) and "publicUrl" in data:
            return str(data["publicUrl"])
    raise RuntimeError("No se pudo obtener la URL publica del archivo en Supabase Storage.")


def _upload_public_asset(
    *,
    bucket: str,
    object_path: str,
    content: bytes,
    content_type: str | None = None,
) -> str:
    # Subida base reutilizable para archivos publicos en Storage.
    client = get_supabase_client()
    client.storage.from_(bucket).upload(
        object_path,
        content,
        file_options={"upsert": "false", "content-type": content_type or "application/octet-stream"},
    )
    public_url_raw = client.storage.from_(bucket).get_public_url(object_path)
    return _coerce_public_url(public_url_raw)


def get_public_storage_url(*, bucket_name: str, object_path: str) -> str:
    # Construye la URL publica cuando en DB solo guardamos el path del archivo.
    client = get_supabase_client()
    public_url_raw = client.storage.from_(bucket_name).get_public_url(object_path)
    return _coerce_public_url(public_url_raw)


def upload_support_screenshot(
    *,
    user_id: int,
    original_name: str,
    content: bytes,
    content_type: str | None = None,
    bucket_name: str | None = None,
) -> tuple[str, str]:
    # Sube captura de soporte y retorna (path_en_bucket, public_url).
    bucket = bucket_name or os.environ.get("SUPABASE_STORAGE_BUCKET_SUPPORT", "support-uploads")
    ext = posixpath.splitext(original_name or "")[1].lower() or ".bin"
    object_path = f"tickets/{int(user_id)}/{uuid4().hex}{ext}"
    public_url = _upload_public_asset(
        bucket=bucket,
        object_path=object_path,
        content=content,
        content_type=content_type,
    )
    return object_path, public_url


def upload_profile_avatar(
    *,
    user_id: int,
    original_name: str,
    content: bytes,
    content_type: str | None = None,
    bucket_name: str | None = None,
) -> tuple[str, str]:
    # Sube avatar de perfil y retorna (path_en_bucket, public_url).
    bucket = bucket_name or os.environ.get("SUPABASE_STORAGE_BUCKET_PROFILE", "img_profile")
    ext = posixpath.splitext(original_name or "")[1].lower() or ".bin"
    object_path = f"avatars/{int(user_id)}/{uuid4().hex}{ext}"
    public_url = _upload_public_asset(
        bucket=bucket,
        object_path=object_path,
        content=content,
        content_type=content_type,
    )
    return object_path, public_url


def delete_profile_avatar_from_url(
    *,
    public_url: str | None,
    bucket_name: str | None = None,
) -> bool:
    # Elimina el avatar anterior si pertenece al bucket configurado.
    if not public_url:
        return False

    bucket = bucket_name or os.environ.get("SUPABASE_STORAGE_BUCKET_PROFILE", "img_profile")
    marker = f"/storage/v1/object/public/{bucket}/"
    if marker not in public_url:
        return False

    object_path = public_url.split(marker, 1)[-1].strip("/")
    if "?" in object_path:
        object_path = object_path.split("?", 1)[0]
    if not object_path:
        return False
    if not object_path.startswith("avatars/"):
        return False

    client = get_supabase_client()
    client.storage.from_(bucket).remove([object_path])
    return True
