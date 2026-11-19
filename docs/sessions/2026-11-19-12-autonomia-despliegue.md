# Protocolo de despliegue autónomo
**Fecha:** 2026-11-19  
**Rama:** feature/autonomia-despliegue  
**Commit:** cd0f9132

## Qué se construyó
Enric quiere pasarle a Claude una idea grande y que la termine sin tener que estar pendiente del terminal. Pidió empezar por la autonomía de despliegue y aprobó los cuatro cambios («ok a todo»).

- `scripts/deploy.sh`:
  - **Se niega si:**
    - no estás en `main` o hay cambios sin commit;
    - las pruebas o el Mapa Visual fallan sobre el commit exacto (se pasan en una copia temporal de `main` dentro del contenedor local, con `vitest` directo y los `node_modules` de la imagen);
    - hay migraciones pendientes sin `--migrate`, o producción va por delante de `main`.
  - **Antes de compilar,** guarda `kijutech-app:previous` y `DEPLOYED.previous`.
  - **Verificación:** hasta 60 s esperando un 200, más los errores de JavaScript del contenedor nuevo. Si falla y no hubo migración, ejecuta `scripts/rollback.sh`.
  - **Si todo va bien,** escribe `DEPLOYED` y borra las imágenes sin etiqueta.
- `scripts/rollback.sh` (nuevo): vuelve a la imagen anterior y espera el 200. Solo cambia el código, no la base.
- `scripts/server-status.sh` (nuevo): estado de producción en solo lectura (versión, contenedores, web, Telegram, latido, errores, avisos, copias, cron, disco, memoria, log), con `--logs` opcional. Los comandos remotos son fijos.
- **Permisos de Claude Code:**
  - `.claude/settings.local.json` (no versionado): sin preguntar, `git checkout main`, `git merge --no-ff`, `git push origin main`, `deploy.sh`, `rollback.sh` y `server-status.sh`. `deploy.sh --migrate` pasa a «ask».
  - `~/.claude/settings.json` (global de Enric): se quitaron los bloqueos `git push origin main` y `psql` local, y se describió el protocolo en `autoMode.allow`.
- `CLAUDE.md`: el push a main sale de la lista de aprobación obligatoria y entra «desplegar con migración». Se añade el protocolo de despliegue autónomo con sus condiciones.
- `lib/auth/security-process-map.ts`: paso «Despliegue protegido» en el bloque Seguridad del Mapa Visual. Es solo descripción; entra en la aprobación de Enric.
- `docs/DESPLIEGUE.md` y `docs/ESTADO.md` (§4, §18, §20 y cabecera): el protocolo.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Pruebas en una copia temporal dentro del contenedor local:** se prueba el commit exacto sin reconstruir la imagen local. `pnpm test` intentaba reinstalar dependencias en la copia; se usa `./node_modules/.bin/vitest run`.
- **Sin SSH libre:** un permiso por prefijo `ssh …` habría dado root al servidor. En su lugar, scripts con comandos fijos y revisados.
- **Sin vuelta atrás automática con migración:** la base ya cambió y volver el código podría no bastar. Lo decide Enric.
- **Errores de JavaScript como señal de fallo:** son los que indican código roto (`ReferenceError`, `TypeError`). Otros errores, como los de proveedores externos, no deben deshacer un despliegue.

## Qué verificar manualmente
- El primer despliegue con el protocolo lo hace Claude al cerrar esta sesión. Debe:
  - mostrar «Pruebas y Mapa Visual…» con 399 pruebas;
  - mostrar «Guardando la versión en marcha»;
  - terminar con «✓ Despliegue terminado».
- Después, `bash scripts/server-status.sh` debe mostrar la versión desplegada y «imagen de vuelta atrás: creada …».
- La vuelta atrás automática no se ha forzado en producción. Se activará sola si un despliegue sale mal.

## Pendientes detectados
- Canal de preguntas y aprobaciones por Telegram (aviso tras cada despliegue, OK de migraciones con botones): siguiente paso, junto al miembro de pruebas IA.
- `--logs` muestra el log de la app tal cual. Si algún día contiene datos personales, filtrarlo.
