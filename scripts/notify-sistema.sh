#!/usr/bin/env bash
# Aviso al chat de Sistema desde el servidor (organigrama, 20 nov 2026). Lo llama scripts/deploy.sh por SSH para contar
# cómo fue un despliegue. No envía nada directamente: deja el aviso en la cola de avisos de la app (ops_notifications),
# que lo manda por el bot de Sistema si está listo o por el principal si no, con sus reintentos.
#   bash /opt/kijutech/scripts/notify-sistema.sh ok "texto HTML"      sin sonido
#   bash /opt/kijutech/scripts/notify-sistema.sh fallo "texto HTML"   con sonido
# El texto va como variable de psql (:'msg'): nunca se mezcla con el SQL.
set -uo pipefail
LEVEL="${1:-ok}"
TEXT="${2:-}"
[[ -n "$TEXT" ]] || { echo "notify-sistema: falta el texto" >&2; exit 2; }
SILENT=true
[[ "$LEVEL" == "fallo" ]] && SILENT=false
docker exec -i kijutech_db psql -U kijutech -d kijutech_db -q -v ON_ERROR_STOP=1 \
  -v msg="$TEXT" -v silent="$SILENT" -v key="deploy:$(date +%s%N)" <<'SQL' || echo "notify-sistema: no se pudo dejar el aviso en la cola" >&2
INSERT INTO ops_notifications (tenant_id, kind, dedupe_key, for_clickup_user_id, for_name, payload, status)
SELECT c.tenant_id, 'health', :'key', cc.me_clickup_id, 'Dueño',
       jsonb_build_object('text', :'msg', 'toOwner', true, 'bot', 'sistema', 'silent', :'silent'::boolean, 'testMode', c.test_mode),
       'pendiente'
FROM ops_telegram_config c
JOIN ops_clickup_connections cc ON cc.tenant_id = c.tenant_id
WHERE c.receive_mode <> 'simulado';
SQL
