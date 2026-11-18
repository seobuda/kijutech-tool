# Decisiones de Enric sobre la revisión: D6, D7, D11, S4 y S9
**Fecha:** 2026-11-18  
**Rama:** fix/revision-decisiones (sale de fix/estrategia-informe-mes, aún sin fusionar)  
**Commit:** 68516c94

## Qué se construyó
**D6: un cliente con histórico no se borra de un clic**
- `lib/rendimiento/store.ts` y `lib/estrategia/store.ts`: `historyBlocker`, que dice qué histórico tiene el cliente: días de datos de Google, resúmenes mensuales e hitos en un caso; objetivos, palabras clave, URLs, trabajos, señales y revisiones en el otro. Cada módulo lo registra como guard en su `register.ts`.
- `lib/core/clients.ts`:
  - `deleteCoreClient(tenantId, id, confirmName?)`: con histórico exige que el cliente esté de baja (archivado) y que se escriba su nombre. La comparación no distingue mayúsculas ni tildes.
  - Nueva `clientHistory` para la ficha.
- `lib/core/client-rules.ts`: `normClientName`, la misma normalización para el servidor y la pantalla.
- `lib/core/client-actions.ts`: `deleteClientAction` recibe el nombre escrito.
- Ficha del cliente (`clientes/[id]/page.tsx` y `ficha-view.tsx`):
  - Sin histórico se borra como antes.
  - Con histórico aparece la lista de lo que se perdería. Si el cliente no está de baja, el botón lleva a «Dar de baja». Si ya lo está, hay que escribir su nombre para activar «Borrar para siempre».

**D7: variables opcionales en producción**
- `docker-compose.prod.yml`: pasa una a una `PAGESPEED_API_KEY`, `RESEND_API_KEY`, `DO_API_TOKEN`, `OPS_APP_DROPLET`, `AGT_TTS_MODEL` y `AGT_STT_MODELS`. Las que no están en el `.env` llegan vacías.
- `tests/servidor.test.ts`: falla si el código lee una variable que no está en el compose y no es solo de desarrollo.
- `lib/operaciones/resend.ts`: una clave vacía cuenta como no configurada.

**D11: rotación**
- `scripts/backup.sh` (cron diario):
  - Guarda las 15 últimas copias `backup_pre_deploy_*`.
  - Recorta los `*.log` de `backups/` a los últimos 90 días. Una línea sin fecha va con la última fecha vista. El archivo se reescribe con `cat >` para que los cron sigan escribiendo en el mismo.

**S4 y S9: cuenta y contraseña** (`app/(login)/actions.ts`, `lib/auth/session.ts`, `lib/db/queries.ts`)
- **Cambio de correo:**
  - Pide la contraseña actual.
  - Se guarda en minúsculas.
  - Se rechaza si coincide con el de otro usuario sin distinguir mayúsculas.
  - Si solo cambia el nombre, no hace falta la contraseña.
  - El alta de usuarios (`usuarios/actions.ts`) también compara con `lower(email)`.
- **Contraseña nueva:**
  - Mínimo de 12 caracteres y mensajes en español.
  - Ya no se devuelven las contraseñas al navegador cuando hay un error.
  - Al cambiarla se cierran las demás sesiones: el token lleva `pv`, una huella del hash de la contraseña, y `getUser` lo comprueba. La sesión actual se vuelve a firmar con la huella nueva.
- Las pantallas Datos de la cuenta y Seguridad están en español y tienen el campo «Contraseña actual (solo si cambias el correo)».

**Mapas y documentos:**
- `lib/auth/security-process-map.ts` y `lib/core/clients-process-map.ts`.
- `docs/REVISION-2026-11-17.md` (D6, D7, D11, S4 y S9 en ✅), `docs/ESTADO.md` y `docs/DESPLIEGUE.md` (variables opcionales).

**Pruebas:**
- `tests/rendimiento.test.ts`: D6. No se borra si el cliente no está de baja, tampoco con un nombre mal escrito, y sí con el nombre en minúsculas.
- `tests/seguridad.test.ts`: S4 y S9, incluido que la sesión anterior deja de valer y la actual sigue.
- `tests/servidor.test.ts`: D7.
- `tests/fixtures.ts`: `loginAs` firma con la huella.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **D6, «archivar» = estado «baja»:** la ficha ya tiene ese estado, con fecha y motivo, y un cliente de baja deja de descargarse de Google. Así no hace falta una columna nueva.
- **D6, qué cuenta como histórico:**
  - En Rendimiento: datos diarios, resúmenes mensuales e hitos.
  - En Estrategia: objetivos, palabras clave, URLs, trabajos, señales y revisiones.
  - Un cliente sin nada de eso se sigue borrando con la confirmación de siempre.
- **D7, variables una a una y no `env_file: .env`:** pasar todo el `.env` daría a la app la contraseña de Postgres, los tokens de Cloudflare y otros secretos que no usa. El riesgo de olvidar una variable nueva lo cubre la prueba.
- **D11, logs de 3 meses:** era la propuesta que acompañaba a «las 15 últimas» y Enric la aprobó con ella. Se hace en `backup.sh` porque ya corre a diario, sin un cron nuevo.
- **S9, cerrar sesiones sin cambiar el esquema:** se usa una huella de la contraseña dentro del token en vez de una columna de «versión de sesión». Lo mismo cierra las sesiones de alguien cuando un super_admin le cambie la contraseña.
- **S9, consecuencia:** al desplegar, **todo el mundo tendrá que volver a iniciar sesión una vez**, porque los tokens actuales no llevan la huella. Aceptarlos sin huella dejaría válidas para siempre las sesiones antiguas, porque el proxy las renueva en cada visita.
- **S4, sin índice único `lower(email)`:** hace falta una migración, así que la comprobación se hace en la aplicación. Queda como mejora junto a D4/D5.

## Qué verificar manualmente
- **Tras desplegar:** volver a iniciar sesión (es lo esperado).
- **Ficha de un cliente con datos de Google (admin):**
  - «Eliminar» enseña la lista de histórico y lleva a «Dar de baja».
  - Ya de baja, el botón «Borrar para siempre» solo se activa al escribir el nombre. No borrar un cliente real.
- **Seguridad:**
  - Cambiar la contraseña con 11 caracteres da error.
  - Con 12 o más funciona, y otro navegador con la sesión abierta vuelve al inicio de sesión.
- **Datos de la cuenta:** cambiar el correo sin la contraseña da error. Cambiar solo el nombre se guarda.
- **Servidor:** al día siguiente del despliegue, `ls /opt/kijutech/backups/backup_pre_deploy_* | wc -l` debe dar 15 o menos.
- **Con `PAGESPEED_API_KEY` en el `.env` del servidor y la app recreada:** el proceso de salud web de Estrategia deja de fallar por cuota.

Comprobaciones hechas:
- `pnpm test`: 384/384.
- `node scripts/check-architecture-map.js`: OK (mapa actualizado).
- Logs del contenedor local tras reconstruir: sin errores.

## Pendientes detectados
- **🔒 que siguen esperando a Enric:** D4/D5 (índice y purga de `ai_jobs` y registros: migración), S2/S3/S7 (rol de plataforma y política de borrados) y C10 (Clientes del núcleo que importan módulos). D14 es continuo.
- Índice único `lower(email)` en `users`: necesita migración.
- La página de Actividad heredada del starter sigue en inglés.
