#!/usr/bin/env bash
# Estado del servidor de producción, SOLO LECTURA (19 nov 2026, protocolo de autonomía de despliegue).
# Claude lo puede lanzar sin pedir permiso: los comandos remotos son fijos y no cambian nada. No hay SSH libre.
#
#   bash scripts/server-status.sh          resumen: versión, contenedores, web, Telegram, copias, cron, disco, errores
#   bash scripts/server-status.sh --logs   además, las últimas 60 líneas del log de la app
#   bash scripts/server-status.sh --errores [palabra]  además, los últimos 25 fallos del registro de errores (cuenta real),
#                                                    con su mensaje; con palabra (letras, números, guion bajo), solo las zonas que la contienen
set -uo pipefail

HOST="root@207.154.216.13"
KEY="$HOME/.ssh/kijutech_brain"
LOGS=0
ERRS=0
[[ "${1:-}" == "--logs" ]] && LOGS=1
FILTER=""
if [[ "${1:-}" == "--errores" ]]; then
  ERRS=1
  FILTER="${2:-}"
  [[ -z "$FILTER" || "$FILTER" =~ ^[A-Za-z0-9_]+$ ]] || { echo "✗ Filtro no válido: solo letras, números y guion bajo" >&2; exit 2; }
fi

ssh -i "$KEY" -o BatchMode=yes "$HOST" "LOGS=$LOGS ERRS=$ERRS FILTER=$FILTER bash -s" <<'REMOTE'
cd /opt/kijutech
q() { docker exec kijutech_db psql -U kijutech -d kijutech_db -tAc "$1" 2>/dev/null; }
echo "== Versión"
echo "  desplegada: $(cat DEPLOYED 2>/dev/null || echo '¿?')   anterior: $(cat DEPLOYED.previous 2>/dev/null || echo '—')"
if docker image inspect kijutech-app:previous >/dev/null 2>&1; then
  echo "  imagen de vuelta atrás: creada $(docker image inspect -f '{{.Created}}' kijutech-app:previous | cut -c1-16)"
else
  echo "  imagen de vuelta atrás: no hay (se guarda en el próximo despliegue)"
fi
echo "== Contenedores"
docker ps --format '  {{.Names}}: {{.Status}}'
echo "== Servicio"
echo "  web: $(curl -s -o /dev/null -w '%{http_code}' https://brain.kijutech.com/sign-in)"
echo "  migraciones: $(q 'select count(*) from drizzle.__drizzle_migrations')"
# La cuenta de pruebas (Sistema → Pruebas) va aparte: aquí solo lo real.
REAL="tenant_id NOT IN (SELECT sim_tenant_id FROM ops_sim_environments)"
echo "  telegram: $(q "select receive_mode || ' / ' || coalesce(last_error,'sin error') from ops_telegram_config where receive_mode <> 'simulado'")"
HB=$(q "select value from ops_settings where key='worker_heartbeat' limit 1")
if [ -n "$HB" ]; then echo "  latido del planificador: hace $(( ($(date +%s%3N) - HB) / 1000 )) s"; else echo "  latido del planificador: sin registro"; fi
echo "  errores nuevos (24 h): $(q "select count(*) from sys_error_groups where last_seen > now() - interval '24 hours' and status = 'nuevo'")"
echo "  avisos pendientes / fallidos (24 h): $(q "select count(*) filter (where status='pendiente') || ' / ' || count(*) filter (where status='fallido' and created_at > now() - interval '24 hours') from ops_notifications where $REAL")"
echo "  pendientes, detalle: $(q "select coalesce(string_agg(kind || ' (próximo ' || to_char(next_attempt_at, 'DD/MM HH24:MI') || ' UTC, intentos ' || attempts || coalesce(', ' || left(last_error, 80), '') || ')', ', '), 'ninguno') from ops_notifications where status='pendiente' and $REAL")"
echo "  pruebas simuladas: $(q "select coalesce((select status || ' · ' || scenario_key || ' · ' || to_char(started_at, 'DD/MM HH24:MI') from ops_sim_runs order by started_at desc limit 1), 'ninguna') || ' · fallan ahora: ' || (select count(*) from (select distinct on (scenario_key) status from ops_sim_runs order by scenario_key, started_at desc) x where status = 'fallo')")"
# «Pedir una prueba» (Sistema → Pruebas): lo que Enric quiere ver probado y aún no es un escenario.
echo "  pruebas pedidas pendientes: $(q "select coalesce(string_agg('[' || (e->>'id') || '] ' || left(replace(e->>'text', chr(10), ' '), 300), ' | '), 'ninguna') from ops_settings s, json_array_elements(s.value::json) e where s.key = 'sim_test_requests' and e->>'status' = 'pendiente'")"
echo "== Copias"
ls -lt backups/backup_daily_*.sql.gz 2>/dev/null | head -3 | awk '{print "  " $6, $7, $8, $9, "(" $5 " bytes)"}'
echo "  último registro: $(tail -1 backups/backup.log 2>/dev/null)"
echo "  prueba de restauración: $(tail -1 backups/restore-test.log 2>/dev/null)"
echo "  vigilante: $(tail -1 backups/watchdog.log 2>/dev/null)"
echo "== Cron"
crontab -l 2>/dev/null | grep -v '^#' | sed 's/^/  /'
echo "== Máquina"
df -h / | awk 'NR==2 {print "  disco: " $3 " de " $2 " (" $5 ")"}'
free -m | awk '/Mem:/ {print "  memoria: " $3 " MB de " $2 " MB"}'
echo "  carga: $(cut -d' ' -f1-3 /proc/loadavg)"
echo "== Log de la app (última hora)"
echo "  líneas con error: $(docker logs --since 1h kijutech_app 2>&1 | grep -ciE 'error' || true)"
docker logs --since 1h kijutech_app 2>&1 | grep -iE 'ReferenceError|TypeError|Unhandled' | tail -5 | sed 's/^/  /'
if [ "$LOGS" = 1 ]; then echo "== Últimas 60 líneas"; docker logs --tail 60 kijutech_app 2>&1; fi
if [ "$ERRS" = 1 ]; then
  echo "== Últimos fallos del registro (cuenta real)"
  q "select to_char(e.created_at, 'DD/MM HH24:MI') || ' · ' || g.source || ' · ' || g.area || ' · ' || coalesce(e.channel, '') || E'\n    ' || left(replace(coalesce(e.user_message, e.message), E'\n', ' '), 400) from sys_error_events e join sys_error_groups g on g.id = e.group_id where (e.tenant_id is null or e.tenant_id NOT IN (SELECT sim_tenant_id FROM ops_sim_environments)) and g.area ilike '%$FILTER%' order by e.created_at desc limit 25" | sed 's/^/  /'
fi
REMOTE
