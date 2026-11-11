#!/usr/bin/env bash
# Despliegue a producción (brain.kijutech.com). Procedimiento de docs/DESPLIEGUE.md en un solo comando.
#
#   bash scripts/deploy.sh             sube `main`, reconstruye y verifica
#   bash scripts/deploy.sh --migrate   además: backup con pg_dump ANTES y migraciones de Drizzle después
#
# Sin secretos: usa la clave SSH local (~/.ssh/kijutech_brain); el .env del servidor no se toca.
set -euo pipefail

HOST="root@207.154.216.13"
KEY="$HOME/.ssh/kijutech_brain"
REMOTE_DIR="/opt/kijutech"
SSH=(ssh -i "$KEY" -o BatchMode=yes "$HOST")

MIGRATE=0
if [[ "${1:-}" == "--migrate" ]]; then MIGRATE=1; fi

cd "$(dirname "$0")/.."

git fetch -q origin main
if [[ "$(git rev-parse main)" != "$(git rev-parse origin/main)" ]]; then
  echo "✗ main local y origin/main no coinciden: haz push (o pull) antes de desplegar." >&2
  exit 1
fi
echo "→ Desplegando main $(git rev-parse --short main)"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git archive --format=tar.gz -o "$TMP/kijutech.tgz" main

if [[ $MIGRATE -eq 1 ]]; then
  STAMP="$(date +%Y%m%d_%H%M)"
  echo "→ Backup de la base de datos (backups/backup_pre_deploy_${STAMP}.sql.gz)"
  "${SSH[@]}" "cd $REMOTE_DIR && docker exec kijutech_db pg_dump -U kijutech -d kijutech_db | gzip > backups/backup_pre_deploy_${STAMP}.sql.gz && echo \"  tablas: \$(zcat backups/backup_pre_deploy_${STAMP}.sql.gz | grep -c 'CREATE TABLE')\""
fi

echo "→ Subiendo código"
scp -i "$KEY" -o BatchMode=yes -q "$TMP/kijutech.tgz" "$HOST:/tmp/kijutech.tgz"
"${SSH[@]}" "cd $REMOTE_DIR && tar -xzf /tmp/kijutech.tgz -C $REMOTE_DIR && rm /tmp/kijutech.tgz"

echo "→ Reconstruyendo (unos minutos)"
"${SSH[@]}" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml up -d --build 2>&1 | grep -E 'rror|Started|Built' | tail -3"

if [[ $MIGRATE -eq 1 ]]; then
  echo "→ Migraciones"
  "${SSH[@]}" "sleep 5 && docker exec kijutech_app pnpm db:migrate 2>&1 | grep -E 'applied|ERROR|error:' | tail -2"
fi

echo "→ Verificación"
"${SSH[@]}" "sleep 5; \
  echo \"  migraciones: \$(docker exec kijutech_db psql -U kijutech -d kijutech_db -tAc 'select count(*) from drizzle.__drizzle_migrations')\"; \
  echo \"  web: \$(curl -s -o /dev/null -w '%{http_code}' https://brain.kijutech.com/sign-in)\"; \
  echo \"  telegram: \$(docker exec kijutech_db psql -U kijutech -d kijutech_db -tAc \"select receive_mode || ' / ' || coalesce(last_error,'sin error') from ops_telegram_config\")\"; \
  ERR=\$(docker logs --since 5m kijutech_app 2>&1 | grep -ciE 'ReferenceError|TypeError' || true); echo \"  errores en logs: \$ERR\""
echo "✓ Despliegue terminado"
