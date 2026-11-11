# Despliegue en producción (DigitalOcean)

**Servidor:** droplet `kijutech-brain` (Frankfurt, Ubuntu 24.04, 2 GB + 2 GB de swap, Docker). **Dirección:** `https://brain.kijutech.com`
(registro `A` en Cloudflare, sin proxy de momento). **Acceso:** solo SSH con clave (`~/.ssh/kijutech_brain`). Firewall: solo 22, 80 y 443.
Backups de DigitalOcean activados (semanales). Sin secretos en este documento.

## Archivos
- `docker-compose.prod.yml`: Postgres (pgvector) + app + Caddy. Solo Caddy publica puertos.
- `Caddyfile`: HTTPS automático hacia la app.
- En el servidor, `/opt/kijutech/`: el código, el `.env` (permisos 600, secretos NUEVOS, distintos a los de desarrollo) y `backups/`.

## Subir una versión
**Atajo (11 nov):** `bash scripts/deploy.sh` hace los pasos 1-3 y verifica (migraciones, web, Telegram y errores en logs);
`bash scripts/deploy.sh --migrate` además hace el backup con `pg_dump` antes y aplica las migraciones después. Exige que
`main` local coincida con `origin/main`. Para que Claude Code lo ejecute sin pedir permiso cada vez, en
`.claude/settings.local.json` (no versionado) se permiten exactamente `Bash(bash scripts/deploy.sh)` y
`Bash(bash scripts/deploy.sh --migrate)`.

Pasos a mano:
1. En el PC: `git archive --format=tar.gz -o <ruta>/kijutech.tgz HEAD` (solo lo versionado, sin `.env`).
2. `scp` al servidor y descomprimir en `/opt/kijutech/` (sin tocar `.env` ni `backups/`).
3. En el servidor: `docker compose -f docker-compose.prod.yml up -d --build`.
4. Migraciones: `docker exec kijutech_app pnpm db:migrate` (antes, backup con `pg_dump`).

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
