import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
BUCKET = os.getenv("SUPABASE_GAMES_BUCKET", "games")

LOCAL_FILE = Path("games/static/games/external/armor_mayhem/play.html")
REMOTE_FILE = "external/armor_mayhem/play.html"

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

with open(LOCAL_FILE, "rb") as f:
    result = supabase.storage.from_(BUCKET).upload(
        path=REMOTE_FILE,
        file=f,
        file_options={
            "content-type": "text/html",
            "upsert": "false"
        }
    )

print("Subido play.html:", result)