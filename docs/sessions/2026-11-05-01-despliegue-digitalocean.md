# Paso 9: despliegue en DigitalOcean (brain.kijutech.com)
**Fecha:** 2026-11-05  
**Rama:** feature/despliegue  
**Commit:** 34fedc0f

## Qué se construyó
- `docker-compose.prod.yml` (nuevo): Postgres con pgvector, la app y Caddy. Solo Caddy publica puertos (80/443). `BASE_URL=https://brain.kijutech.com`. Los secretos se leen de `/opt/kijutech/.env`.
- `Caddyfile` (nuevo): HTTPS automático (Let's Encrypt) y proxy inverso hacia la app.
- `docs/DESPLIEGUE.md` (nuevo): procedimiento de despliegue, base de datos inicial, backups y Telegram. Sin secretos.
- `lib/architecture-map/registry.ts`: el nodo «Servidor» del Mapa Visual pasa de `planned` a `in_progress` con lo hecho y lo que falta.
- `docs/ESTADO.md`: cabecera, hoja de ruta, pendientes y cronología.

**En el servidor (`kijutech-brain`, 207.154.216.13, Frankfurt):**
- Código subido con `git archive` + `scp` a `/opt/kijutech/` (sin `git push`).
- `.env` (permisos 600) con `POSTGRES_PASSWORD`, `AUTH_SECRET` y `AI_ENCRYPTION_KEY` nuevos, generados en el servidor.
- Base de datos limpia: 38 migraciones, tenant Kijutech y 4 roles (los crea la migración 0001), 7 prompts de IA copiados de la base local (solo `ai_prompts`, sin datos de clientes; `updated_by` a NULL) y el usuario `enrique@kijutech.com` con rol `super_admin`. Sin usuario de pruebas ni datos de prueba.
- Cron diario a las 03:00 (`/opt/kijutech/backup.sh`): `pg_dump` comprimido en `/opt/kijutech/backups`, 7 días de retención, descarta dumps vacíos. Probado a mano: OK.
- Backups semanales de DigitalOcean activados solo en `kijutech-brain` (2,40 $/mes aprox.).
- DNS en Cloudflare: `A brain → 207.154.216.13`, sin proxy.

## Migraciones aplicadas
Ninguna nueva. Se aplicaron en el servidor las 38 migraciones existentes (`lib/db/migrations/0000…0037`) sobre una base vacía con `pnpm db:migrate`. No hubo backup previo porque la base estaba vacía. Los mensajes `NOTICE` de pgvector (`ivfbuild.c`) y de drizzle («already exists, skipping») no son errores.

## Decisiones técnicas tomadas en auto mode
- **Prompts de IA por copia directa, no por scripts:** `ESTADO.md` decía que había que reaplicar `scripts/ops-*.sql` en orden (frágil). Copié la tabla `ai_prompts` local (mismas versiones: `ops_note_to_requests` v6, `cluster_keywords` v6, etc.) con un volcado de solo esa tabla.
- **Administrador por SQL, no con `db:seed`:** `seed.ts` crea además un «Test Team» heredado y no asigna rol en `user_roles`. Creé usuario + rol `super_admin` directamente; la contraseña se generó en el servidor y se guardó en un archivo 600 (no se imprimió).
- **Reinicio de la app tras migrar:** arrancó antes que las migraciones y el bucle de Telegram dio «relation does not exist»; tras reiniciar queda como líder sin errores.
- **Dockerfile.dev se reutiliza** en producción (ya compila y arranca con `pnpm build` + `pnpm start`); no se modificó ni `docker-compose.yml` ni `Dockerfile.dev`.

## Qué verificar manualmente
- Entrar en `https://brain.kijutech.com/sign-in` con `enrique@kijutech.com`. Contraseña inicial: `ssh -i ~/.ssh/kijutech_brain root@207.154.216.13 cat /opt/kijutech/admin-initial-password.txt`. Cambiarla al entrar y luego borrar ese archivo.
- Recorrer Bloc de notas, Equipo hoy y Encargos (estarán vacíos: falta conectar ClickUp, Telegram e IA en el panel).
- Comprobar en `/dashboard/usuarios` que se ve como `super_admin`.
- Ya verificado desde fuera: HTTPS con certificado válido, HTTP → HTTPS, `/api/user` devuelve `null` sin sesión, `/api/team` 401, `/dashboard` y `/sign-up` redirigen a `/sign-in`, 3 contenedores arriba, firewall solo 22/80/443, Postgres y la app sin puertos públicos.

## Pendientes detectados
- **Copias fuera de DigitalOcean** (petición explícita de Enric): enviar el dump diario al NAS y al Google Drive de la agencia.
- Telegram a webhook: parar antes la app local; reintroducir en el panel los tokens de ClickUp, Telegram y claves de IA.
- Activar el proxy de Cloudflare con SSL «Full (strict)».
- CSP con `script-src` por nonce.
- Borrar `/opt/kijutech/admin-initial-password.txt` tras el primer acceso.
- Bots de escaneo ya llegan al servidor (LeakIX y otros): los errores «Server Reference ID did not match» en `docker logs` son de ellos, inofensivos.
- Los snapshots de DigitalOcean son semanales; el cron cubre el día a día.
- No se ejecutó `pnpm test` en esta sesión: solo cambió infraestructura, documentación y un texto del Mapa Visual; el servidor corre la versión anterior del mapa hasta el próximo despliegue.
- Con el crecimiento de la app, revisar los 2 GB de RAM (la compilación fue lenta).
