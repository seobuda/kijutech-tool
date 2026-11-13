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
# Descomprimir encima NO borra los archivos que se quitaron de git: en las carpetas de código (solo código versionado)
# se borran los que ya no están en `main`, si no la compilación los encuentra y puede fallar (pasó el 14 nov).
"${SSH[@]}" "cd $REMOTE_DIR && tar -tzf /tmp/kijutech.tgz | grep -v '/\$' | sort > /tmp/kiju-new.list \
  && find app lib components tests scripts modules -type f 2>/dev/null | sort > /tmp/kiju-old.list \
  && comm -23 /tmp/kiju-old.list /tmp/kiju-new.list > /tmp/kiju-stale.list \
  && N=\$(wc -l < /tmp/kiju-stale.list) && if [ \"\$N\" -gt 0 ]; then echo \"  archivos que ya no están en main: \$N (se borran)\"; sed 's/^/    - /' /tmp/kiju-stale.list | head -20; xargs -r -d '\n' rm -f -- < /tmp/kiju-stale.list; fi \
  && tar -xzf /tmp/kijutech.tgz -C $REMOTE_DIR && rm /tmp/kijutech.tgz /tmp/kiju-new.list /tmp/kiju-old.list /tmp/kiju-stale.list"

echo "→ Reconstruyendo (unos minutos)"
# Si la compilación falla, Docker no sustituye el contenedor (sigue la versión anterior) y aquí se para: sin migrar.
"${SSH[@]}" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml up -d --build > /tmp/kiju-build.log 2>&1; rc=\$?; grep -E 'rror|Started|Built' /tmp/kiju-build.log | tail -8; exit \$rc" || {
  echo "✗ La reconstrucción falló: producción sigue con la versión anterior y NO se ha migrado. Log en el servidor: /tmp/kiju-build.log" >&2
  exit 1
}

if [[ $MIGRATE -eq 1 ]]; then
  echo "→ Migraciones"
  "${SSH[@]}" "sleep 5 && docker exec kijutech_app pnpm db:migrate 2>&1 | grep -E 'applied|ERROR|error:' | tail -2"
fi

echo "→ Verificación"
EXPECTED="$(git show main:lib/db/migrations/meta/_journal.json | grep -c '"tag"')"
APPLIED="$("${SSH[@]}" "docker exec kijutech_db psql -U kijutech -d kijutech_db -tAc 'select count(*) from drizzle.__drizzle_migrations'" | tr -d '[:space:]')"
if [[ "$APPLIED" != "$EXPECTED" ]]; then echo "  ⚠ migraciones: $APPLIED aplicadas de $EXPECTED en main (¿falta --migrate o falló?)" >&2; fi
"${SSH[@]}" "sleep 5; \
  echo \"  migraciones: \$(docker exec kijutech_db psql -U kijutech -d kijutech_db -tAc 'select count(*) from drizzle.__drizzle_migrations')\"; \
  echo \"  web: \$(curl -s -o /dev/null -w '%{http_code}' https://brain.kijutech.com/sign-in)\"; \
  echo \"  telegram: \$(docker exec kijutech_db psql -U kijutech -d kijutech_db -tAc \"select receive_mode || ' / ' || coalesce(last_error,'sin error') from ops_telegram_config\")\"; \
  ERR=\$(docker logs --since 5m kijutech_app 2>&1 | grep -ciE 'ReferenceError|TypeError' || true); echo \"  errores en logs: \$ERR\""
echo "✓ Despliegue terminado"
