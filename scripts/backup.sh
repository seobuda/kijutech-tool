#!/usr/bin/env bash
# Copia diaria de la base de datos (revisión de autonomía, 12 nov 2026). Sustituye a /opt/kijutech/backup.sh.
# Lo ejecuta cron en el servidor:
#   0 3 * * * /opt/kijutech/scripts/backup.sh >> /opt/kijutech/backups/backup.log 2>&1
# 1. pg_dump comprimido en /opt/kijutech/backups (7 días).
# 2. Comprueba que el volcado no está vacío ni roto (gzip -t y que contiene la tabla tenants).
# 3. Si está bien, lo anota en ops_settings (clave backup_last_at): Salud avisa si pasa más de un día sin copia.
# 4. Opcional (copia fuera de DigitalOcean): si existe rclone y RCLONE_REMOTE en /opt/kijutech/backup.env
#    (por ejemplo «gdrive:kijutech-backups»), sube la copia y borra allí las de más de 30 días.
set -uo pipefail

DIR="/opt/kijutech"
OUT="$DIR/backups"
KEEP_DAYS=7
STAMP="$(date +%Y%m%d_%H%M)"
FILE="$OUT/backup_daily_${STAMP}.sql.gz"
[[ -f "$DIR/backup.env" ]] && source "$DIR/backup.env"

mkdir -p "$OUT"
if ! docker exec kijutech_db pg_dump -U kijutech -d kijutech_db | gzip > "$FILE"; then
  echo "$(date -Is) ERROR pg_dump"; rm -f "$FILE"; exit 1
fi
if ! gzip -t "$FILE" || ! zcat "$FILE" | grep -q 'CREATE TABLE public.tenants'; then
  echo "$(date -Is) ERROR copia inválida: $FILE"; exit 1
fi
SIZE="$(du -h "$FILE" | cut -f1)"

docker exec kijutech_db psql -U kijutech -d kijutech_db -q -c "
  INSERT INTO ops_settings (tenant_id, key, value)
  SELECT id, 'backup_last_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') FROM tenants
  ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();" >/dev/null \
  || echo "$(date -Is) AVISO no se pudo anotar la copia en ops_settings"

find "$OUT" -name 'backup_daily_*.sql.gz' -mtime +"$KEEP_DAYS" -delete

if command -v rclone >/dev/null 2>&1 && [[ -n "${RCLONE_REMOTE:-}" ]]; then
  if rclone copy "$FILE" "$RCLONE_REMOTE" --quiet; then
    rclone delete "$RCLONE_REMOTE" --min-age 30d --quiet || true
    echo "$(date -Is) OK $FILE ($SIZE) y copia fuera en $RCLONE_REMOTE"
  else
    echo "$(date -Is) AVISO copia local OK ($SIZE) pero falló la subida a $RCLONE_REMOTE"
  fi
else
  echo "$(date -Is) OK $FILE ($SIZE)"
fi
