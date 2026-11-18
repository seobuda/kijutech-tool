#!/usr/bin/env bash
# Prueba de restauración (revisión de autonomía, 13 nov 2026): una copia que nunca se ha restaurado no es una copia.
# Una vez al mes restaura la última copia diaria en un PostgreSQL DESECHABLE (contenedor aparte, sin volumen, sin red
# pública), cuenta tablas y filas clave, lo compara con la base real y anota el resultado en ops_settings
# (restore_test_at y restore_test_result). Salud avisa si falla o si pasa más de 40 días sin probarse.
# No toca la base de datos real salvo para anotar el resultado.
#   0 4 1 * * /opt/kijutech/scripts/restore-test.sh >> /opt/kijutech/backups/restore-test.log 2>&1
set -uo pipefail

OUT="/opt/kijutech/backups"
NAME="kijutech_restore_test"
LATEST="$(ls -1t "$OUT"/backup_daily_*.sql.gz 2>/dev/null | head -1)"

record() { # $1 = ok|fallo, $2 = detalle
  local detail="${2//\'/}"
  docker exec kijutech_db psql -U kijutech -d kijutech_db -q -c "
    INSERT INTO ops_settings (tenant_id, key, value)
    SELECT id, 'restore_test_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') FROM tenants
    ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
    INSERT INTO ops_settings (tenant_id, key, value)
    SELECT id, 'restore_test_result', '$1|$detail' FROM tenants
    ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();" >/dev/null
  echo "$(date -Is) $1 $detail"
}

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

[[ -n "$LATEST" ]] || { record fallo "no hay ninguna copia diaria en $OUT"; exit 1; }
cleanup
docker run -d --name "$NAME" --network none -e POSTGRES_PASSWORD=restore -e POSTGRES_USER=kijutech -e POSTGRES_DB=kijutech_db pgvector/pgvector:pg16 >/dev/null \
  || { record fallo "no se pudo arrancar el PostgreSQL de prueba"; exit 1; }
for _ in $(seq 1 30); do docker exec "$NAME" pg_isready -U kijutech -d kijutech_db >/dev/null 2>&1 && break; sleep 2; done

if ! zcat "$LATEST" | docker exec -i "$NAME" psql -U kijutech -d kijutech_db -q -v ON_ERROR_STOP=0 >/dev/null 2>/tmp/restore-test.err; then
  record fallo "psql falló al restaurar $(basename "$LATEST")"; exit 1
fi

# D8 (revisión del 17 nov): con ON_ERROR_STOP=0 psql sigue tras un error, así que se revisan los errores: un COPY o
# un CREATE fallido es una copia rota. Solo se toleran los avisos inofensivos de un PostgreSQL recién creado
# (la extensión o el esquema public ya existen).
ERRS="$(grep -E '^(psql:.*)?ERROR' /tmp/restore-test.err | grep -viE 'already exists|ya existe' || true)"
if [[ -n "$ERRS" ]]; then
  record fallo "errores al restaurar $(basename "$LATEST"): $(echo "$ERRS" | head -2 | tr '
' ' ' | cut -c1-300)"; exit 1
fi

q() { docker exec "$1" psql -U kijutech -d kijutech_db -tA -c "$2" 2>/dev/null | tr -d '[:space:]'; }
SQL_TABLES="SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"
SQL_ROWS="SELECT (SELECT count(*) FROM ops_requests)||'/'||(SELECT count(*) FROM ops_clients)||'/'||(SELECT count(*) FROM ops_work_events)"
T_TEST="$(q "$NAME" "$SQL_TABLES")"; T_LIVE="$(q kijutech_db "$SQL_TABLES")"
R_TEST="$(q "$NAME" "$SQL_ROWS")"

# Filas: la copia es de hasta 24 h antes, así que puede tener algo menos que la base real, pero nunca una tabla vacía
# que en la real tiene datos, ni menos de la mitad de sus filas (eso sería un COPY perdido; con el margen de un día de crecimiento).
for T in users clients ops_requests ops_work_events est_url_daily perf_daily ai_jobs; do
  LIVE="$(q kijutech_db "SELECT count(*) FROM $T")"; COPY="$(q "$NAME" "SELECT count(*) FROM $T")"
  [[ -z "$LIVE" ]] && continue # la tabla no existe en esta versión
  if [[ -z "$COPY" ]]; then record fallo "la tabla $T no está en la copia $(basename "$LATEST")"; exit 1; fi
  if (( LIVE > 0 && COPY * 2 < LIVE )); then
    record fallo "$T: la copia tiene $COPY filas y la base real $LIVE ($(basename "$LATEST"))"; exit 1
  fi
done

if [[ -z "$T_TEST" || "$T_TEST" == "0" ]]; then
  record fallo "la copia $(basename "$LATEST") se restauró vacía"; exit 1
fi
if [[ "$T_TEST" != "$T_LIVE" ]]; then
  record fallo "tablas: copia $T_TEST, real $T_LIVE ($(basename "$LATEST"))"; exit 1
fi
record ok "$(basename "$LATEST"): $T_TEST tablas; encargos/clientes/jornada $R_TEST"
