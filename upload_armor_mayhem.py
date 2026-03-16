import mimetypes
import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
BUCKET = os.getenv("SUPABASE_GAMES_BUCKET", "games")

LOCAL_GAME_FOLDER = Path("games/static/games/external/armor_mayhem")
REMOTE_GAME_FOLDER = "external/armor_mayhem"

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise ValueError("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el .env")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def guess_content_type(file_path: Path) -> str:
    content_type, _ = mimetypes.guess_type(str(file_path))
    return content_type or "application/octet-stream"

def upload_folder():
    if not LOCAL_GAME_FOLDER.exists():
        print(f"No existe la carpeta local: {LOCAL_GAME_FOLDER}")
        return

    for file_path in LOCAL_GAME_FOLDER.rglob("*"):
        if file_path.is_file():
            relative_path = file_path.relative_to(LOCAL_GAME_FOLDER).as_posix()
            remote_path = f"{REMOTE_GAME_FOLDER}/{relative_path}"
            content_type = guess_content_type(file_path)

            print(f"Subiendo: {remote_path} -> {content_type}")

            with open(file_path, "rb") as f:
                supabase.storage.from_(BUCKET).upload(
                    path=remote_path,
                    file=f,
                    file_options={
                        "content-type": content_type,
                        "upsert": "true",
                    },
                )

    print("Subida completada.")

if __name__ == "__main__":
    upload_folder()