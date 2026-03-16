# MondongoGames

Proyecto Django conectado a Supabase (Postgres + Storage).

## Storage actual (sin Base64)

- Avatar de perfil: se guarda localmente en `media/avatars/`.
- Captura de soporte: se sube a bucket `support-uploads` y en DB se guarda URL publica en `soporte.screenshot_name`.

## Variables de entorno requeridas

En `.env`:

```env
SUPABASE_URL=https://TU_PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET_SUPPORT=support-uploads
SUPABASE_STORAGE_BUCKET_AUDIO=ui-audio
```

Notas:

- `SUPABASE_SERVICE_ROLE_KEY` es solo backend. No exponer en frontend.
- Los buckets deben existir en Supabase Storage.

## Media local

`MEDIA_URL` y `MEDIA_ROOT` se usan para avatar de perfil local.
En `urls.py` los archivos `media/` solo se sirven en `DEBUG`.

## Audios UI en Storage

Las plantillas cargan audio desde Supabase Storage y usan fallback local si falla.

Comando para subir todos los `.mp3` actuales:

```bash
python manage.py upload_ui_audio_to_supabase --bucket ui-audio --prefix ui --upsert
```

Esto sube archivos de `games/static/games/sounds` a `ui-audio/ui/*`.

## Importar un juego desde ZIP (rapido)

Comando:

```bash
python manage.py import_external_game_zip \
  --zip a8bd8668-9b63-4949-b4fd-b5e3ed58b67a-1616733849758.zip \
  --slug regular_show_battle_of_the_behemoths \
  --title "Regular Show: Battle of the Behemoths" \
  --genre Arcade \
  --developer "Cartoon Network" \
  --release-date 2026-03-04
```

Que hace:

- Extrae el ZIP en `games/static/games/external/<slug>/`.
- Registra o actualiza el juego en tabla `juego`.
- Muestra por consola el `entry` detectado y un snippet de `iframe` sugerido para `juego.html`.
