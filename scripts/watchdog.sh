#!/usr/bin/env bash
# Vigilante EXTERNO (paso 4): lo ejecuta cron en el servidor cada 5 min, fuera de la app, para avisar por
# Telegram cuando la app entera se cae o el planificador se para (lo que la propia app no puede detectar).
# Avisa una vez al caer y otra al volver (estado en /opt/kijutech/.watchdog_state).
#   */5 * * * * /opt/kijutech/scripts/watchdog.sh >> /opt/kijutech/backups/watchdog.log 2>&1
set -uo pipefail

DIR="/opt/kijutech"
ENV_FILE="$DIR/watchdog.env"
STATE_FILE="$DIR/.watchdog_state"
URL="https://brain.kijutech.com/api/health"

# Constancia en la base de datos de cada ejecución (D12): Salud avisa si el vigilante deja de ejecutarse o si le falta
# su configuración (antes, sin watchdog.env, callaba sin que nadie lo supiera).
mark() { # $1 = ok|sin_config
  docker exec kijutech_db psql -U kijutech -d kijutech_db -q -c "
    INSERT INTO ops_settings (tenant_id, key, value)
    SELECT id, 'watchdog_seen_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') FROM tenants
    ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
    INSERT INTO ops_settings (tenant_id, key, value)
    SELECT id, 'watchdog_status', '$1' FROM tenants
    ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();" >/dev/null 2>&1 || true
}

[[ -f "$ENV_FILE" ]] || { echo "$(date -Is) falta $ENV_FILE"; mark sin_config; exit 0; }
mark ok
# shellcheck disable=SC1090
source "$ENV_FILE"

send() {
  curl -s -m 15 -o /dev/null "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TG_CHAT}" --data-urlencode "parse_mode=HTML" --data-urlencode "text=$1" || true
}

# Dos intentos separados por 20 s para no avisar por un corte de un instante.
check() { curl -s -m 15 -o /tmp/kijutech_health.json -w '%{http_code}' "$URL" 2>/dev/null || echo 000; }
CODE="$(check)"
if [[ "$CODE" != "200" ]]; then sleep 20; CODE="$(check)"; fi

PREV="$(cat "$STATE_FILE" 2>/dev/null || echo ok)"
if [[ "$CODE" == "200" ]]; then
  if [[ "$PREV" != "ok" ]]; then
    send "🟢 <b>La herramienta vuelve a funcionar</b> (brain.kijutech.com). Estuvo caída desde $(cat "$STATE_FILE.since" 2>/dev/null || echo '—')."
    echo ok > "$STATE_FILE"
  fi
else
  if [[ "$PREV" == "ok" ]]; then
    # 503 puede ser el planificador parado o la base de datos sin responder: lo dice /api/health (campo db).
    if [[ "$CODE" == "503" ]] && grep -q '"db":false' /tmp/kijutech_health.json 2>/dev/null; then DETAIL='la web responde pero la base de datos no'
    elif [[ "$CODE" == "503" ]]; then DETAIL='la web responde pero el planificador está parado (sin latido)'
    else DETAIL="la web no responde (HTTP $CODE)"; fi
    send "🔴 <b>La herramienta está caída</b>: ${DETAIL}. Revisa el servidor: <code>docker compose -f docker-compose.prod.yml ps</code> y los logs de kijutech_app."
    echo down > "$STATE_FILE"
    date '+%d/%m %H:%M' > "$STATE_FILE.since"
  fi
fi
echo "$(date -Is) $CODE"
