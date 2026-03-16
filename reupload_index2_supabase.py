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

GAMES = [
    "regular_show_battle_of_the_behemoths",
    "regular_show_fist_punch",
    "sky_streaker",
    "agent_p_rebel_spy",
]

BASE = Path("games/static/games/external")

client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
storage = client.storage.from_(BUCKET)

for game in GAMES:
    local_index = BASE / game / "content"
    if not local_index.exists():
        print(f"SKIP {game}: no existe {local_index}")
        continue

    index_path = next(local_index.rglob("index.html"), None)
    if index_path is None:
        print(f"SKIP {game}: no se encontro index.html")
        continue

    # Renombra a index2.html para evadir cache viejo del CDN.
    rel = index_path.relative_to(local_index).as_posix()
    remote_index2 = f"external/{game}/content/{rel.replace('index.html', 'index2.html')}"

    with open(index_path, "rb") as f:
        storage.upload(
            path=remote_index2,
            file=f,
            file_options={
                "content-type": "text/html",
                "cache-control": "max-age=31536000, immutable",
                "upsert": "true",
            },
        )
    print(f"OK {remote_index2} (text/html)")

    if game == "agent_p_rebel_spy":
        index_local_path = next(local_index.rglob("index_local.html"), None)
        if index_local_path is None:
            print("SKIP agent_p_rebel_spy: no se encontro index_local.html")
            continue
        rel_local = index_local_path.relative_to(local_index).as_posix()
        remote_local2 = f"external/{game}/content/{rel_local.replace('index_local.html', 'index_local2.html')}"
        with open(index_local_path, "rb") as f:
            storage.upload(
                path=remote_local2,
                file=f,
                file_options={
                    "content-type": "text/html",
                    "cache-control": "max-age=31536000, immutable",
                    "upsert": "true",
                },
            )
        print(f"OK {remote_local2} (text/html)")
