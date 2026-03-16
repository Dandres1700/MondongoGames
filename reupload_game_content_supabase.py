import mimetypes
import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
BUCKET = os.getenv("SUPABASE_GAMES_BUCKET", "games")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el .env")

CONTENT_TYPES = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".json": "application/json",
    ".xml": "application/xml",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".otf": "font/otf",
    ".ttf": "font/ttf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".wasm": "application/wasm",
}


def guess_content_type(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in CONTENT_TYPES:
        return CONTENT_TYPES[ext]
    guess, _ = mimetypes.guess_type(path.name)
    return guess or "application/octet-stream"


def upload_folder(local_root: Path, remote_root: str) -> None:
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    storage = client.storage.from_(BUCKET)

    files = [p for p in local_root.rglob("*") if p.is_file()]
    for local_path in files:
        rel = local_path.relative_to(local_root).as_posix()
        remote_path = f"{remote_root}/{rel}"
        content_type = guess_content_type(local_path)
        # Cache largo para assets pesados (mejora recargas).
        cache_control = "max-age=31536000, immutable"
        with open(local_path, "rb") as f:
            storage.upload(
                path=remote_path,
                file=f,
                file_options={
                    "content-type": content_type,
                    "cache-control": cache_control,
                    "upsert": "true",
                },
            )
        print(f"OK {remote_path} ({content_type})")


BASE = Path(__file__).resolve().parent / "games/static/games/external"

GAMES = [
    "regular_show_battle_of_the_behemoths",
    "regular_show_fist_punch",
    "sky_streaker",
    "agent_p_rebel_spy",
    "extreme_pamplona",
]

for game in GAMES:
    local_folder = BASE / game / "content"
    if not local_folder.exists():
        print(f"SKIP {game}: no existe {local_folder}")
        continue
    remote_prefix = f"external/{game}/content"
    print(f"Subiendo {game} -> {remote_prefix}")
    upload_folder(local_folder, remote_prefix)
