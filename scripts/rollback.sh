#!/usr/bin/env bash
# Vuelta atrás: arranca la imagen anterior de la app (19 nov 2026, protocolo de autonomía de despliegue).
# deploy.sh la guarda como kijutech-app:previous antes de cada compilación y la usa sola si la verificación falla.
#
#   bash scripts/rollback.sh
#
# Solo cambia el CÓDIGO que corre. La base de datos no se toca: si el despliegue que se deshace llevaba una
# migración, el esquema sigue siendo el nuevo (normalmente compatible, porque las migraciones son aditivas). Si hiciera
# falta volver también la base, se restaura a mano la copia backups/backup_pre_deploy_<fecha>.sql.gz, con OK de Enric.
set -euo pipefail

HOST="root@207.154.216.13"
KEY="$HOME/.ssh/kijutech_brain"

ssh -i "$KEY" -o BatchMode=yes "$HOST" 'bash -s' <<'REMOTE'
set -uo pipefail
cd /opt/kijutech
if ! docker image inspect kijutech-app:previous >/dev/null 2>&1; then
  echo "✗ No hay imagen anterior (kijutech-app:previous): no se puede volver atrás." >&2
  exit 1
fi
echo "→ Volviendo a la imagen anterior ($(cat DEPLOYED.previous 2>/dev/null || echo '¿?'))"
# La que falló queda como kijutech-app:failed, por si hay que mirarla.
docker image tag kijutech-app:latest kijutech-app:failed 2>/dev/null || true
docker image tag kijutech-app:previous kijutech-app:latest
docker compose -f docker-compose.prod.yml up -d --no-build --force-recreate app > /tmp/kiju-rollback.log 2>&1 || {
  echo "✗ No se pudo arrancar la imagen anterior. Log: /tmp/kiju-rollback.log" >&2
  exit 1
}
[ -f DEPLOYED.previous ] && cp DEPLOYED.previous DEPLOYED
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  sleep 5
  CODE=$(curl -s -o /dev/null -w '%{http_code}' https://brain.kijutech.com/sign-in)
  [ "$CODE" = 200 ] && break
done
echo "  web: $CODE"
[ "$CODE" = 200 ] && echo "✓ Vuelta atrás hecha: corre $(cat DEPLOYED 2>/dev/null || echo 'la versión anterior')" || { echo "✗ Tras volver atrás la web sigue sin responder 200." >&2; exit 1; }
REMOTE
