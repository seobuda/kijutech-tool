# Despliegue en producción (DigitalOcean)

**Servidor:** droplet `kijutech-brain` (Frankfurt, Ubuntu 24.04, 2 GB + 2 GB de swap, Docker). **Dirección:** `https://brain.kijutech.com`
(registro `A` en Cloudflare, sin proxy de momento). **Acceso:** solo SSH con clave (`~/.ssh/kijutech_brain`). Firewall: solo 22, 80 y 443.
Backups de DigitalOcean activados (semanales). Sin secretos en este documento.

## Archivos
- `docker-compose.prod.yml`: Postgres (pgvector) + app + Caddy. Solo Caddy publica puertos.
- `Caddyfile`: HTTPS automático hacia la app.
- En el servidor, `/opt/kijutech/`: el código, el `.env` (permisos 600, secretos NUEVOS, distintos a los de desarrollo) y `backups/`.
- Variables opcionales del `.env` (`PAGESPEED_API_KEY`, `RESEND_API_KEY`, `DO_API_TOKEN`, `OPS_APP_DROPLET`, `AGT_TTS_MODEL`, `AGT_STT_MODELS`): `docker-compose.prod.yml` las pasa una a una (D7, 18 nov). Una variable nueva que lea el código se añade allí; `tests/servidor.test.ts` lo comprueba. Tras cambiar el `.env`: `docker compose -f docker-compose.prod.yml up -d` (recrea la app).

## Subir una versión
**Atajo (11 nov):** `bash scripts/deploy.sh` hace los pasos 1-3 y verifica (migraciones, web, Telegram y errores en logs);
`bash scripts/deploy.sh --migrate` además hace el backup con `pg_dump` antes y aplica las migraciones con la imagen nueva en un
contenedor de un solo uso ANTES de sustituir la app (desde el 17 nov: si la migración falla, la app anterior sigue en marcha). Exige que
`main` local coincida con `origin/main`.

**Protocolo de despliegue autónomo (19 nov, aprobado por Enric).** Claude despliega solo, con estas garantías:
- **`deploy.sh` se niega si:**
  - no estás en `main` o hay cambios sin commit;
  - las pruebas (Vitest) o la comprobación del Mapa Visual fallan sobre el commit exacto que se sube. Se pasan en una copia temporal dentro del contenedor local `kijutech_app`, que tiene que estar en marcha;
  - hay migraciones pendientes en producción y no se pidió `--migrate`.
- **Antes de compilar:** guarda la imagen en marcha como `kijutech-app:previous`, y la versión desplegada en `/opt/kijutech/DEPLOYED.previous`.
- **Verificación con vuelta atrás:** espera hasta 60 s un 200 de la web y cuenta los errores de JavaScript del contenedor nuevo. Si algo falla y no hubo migración, ejecuta solo `scripts/rollback.sh`. Con migración no vuelve solo, porque la base ya cambió: lo decide Enric.
- **Si todo va bien:** anota la versión en `/opt/kijutech/DEPLOYED` y borra las imágenes sin etiqueta (`docker image prune -f`).
- **`bash scripts/rollback.sh`:** vuelve a mano a `kijutech-app:previous`. La que falló queda como `kijutech-app:failed`. Solo cambia el código, no la base.
- **`bash scripts/server-status.sh [--logs]`:** estado de producción en solo lectura (versión, contenedores, web, Telegram, latido, errores, avisos, copias, cron, disco, memoria y log). Claude no tiene SSH libre.
- **Permisos de Claude Code:**
  - `.claude/settings.local.json` (no versionado) permite sin preguntar `git checkout main`, `git merge --no-ff …`, `git push origin main`, `bash scripts/deploy.sh`, `rollback.sh` y `server-status.sh`.
  - `bash scripts/deploy.sh --migrate` está en «ask»: siempre pregunta.
  - En la configuración global de Enric (`~/.claude/settings.json`, `autoMode`) se quitaron los bloqueos del push a main y del `psql` local, y se describió este protocolo.

Pasos a mano:
1. En el PC: `git archive --format=tar.gz -o <ruta>/kijutech.tgz HEAD` (solo lo versionado, sin `.env`).
2. `scp` al servidor y descomprimir en `/opt/kijutech/` (sin tocar `.env` ni `backups/`).
3. En el servidor: `bash scripts/build-image.sh` (hace `docker compose -f docker-compose.prod.yml build app` con prioridad baja de CPU y disco para que la app en marcha siga respondiendo; al terminar devuelve la prioridad normal, y la verificación final comprueba que la app tenga prioridad 0).
4. Si hay migraciones (antes, backup con `pg_dump`): `docker compose -f docker-compose.prod.yml run --rm --no-deps app pnpm db:migrate`.
5. `docker compose -f docker-compose.prod.yml up -d`.

## Base de datos de una instalación nueva
Migraciones (crean el tenant Kijutech y los 4 roles) + copia de los prompts de IA (`ai_prompts`, sin datos de clientes) + usuario
administrador `super_admin` creado con contraseña generada en el servidor (se cambia al entrar). Sin usuario de pruebas ni datos de prueba.
Los tokens de ClickUp, Telegram y claves de IA se introducen de nuevo en el panel (se guardan cifrados con la clave nueva).

## Backups
- Cron diario (03:00) `pg_dump` → `/opt/kijutech/backups/`, 7 días de retención (`/opt/kijutech/backup.sh`).
- Snapshots de DigitalOcean (semanales).
- **Pendiente:** sacar los dumps fuera de DigitalOcean (NAS y Google Drive de la agencia).
- Restaurar: `docker exec -i kijutech_db psql -U kijutech -d kijutech_db < backups/<archivo>.sql` sobre una BD limpia.

## Telegram
Mientras la app local escuche con el mismo token, Telegram da 409: parar la local (`docker compose stop app`) antes de poner el token en el servidor.
