# Revisión: limpieza de registros (D4/D5), política de borrados (S7) y C10
**Fecha:** 2026-11-19  
**Rama:** fix/revision-purga-permisos  
**Commit:** 0f5fd4d6

## Qué se construyó
Enric aprobó: «D4/D5 OK con 6 meses, S7 OK, C10 OK».

**D4: `ai_jobs`**
- `lib/db/schema.ts` y la migración `0053_ai_jobs_indice.sql` añaden el índice `ai_jobs_tenant_created_idx` (cuenta, fecha). El vigía de IA, Salud y los paneles de gasto la leían entera cada pocos minutos.
- Pasados 90 días (se puede cambiar en el panel), la limpieza semanal vacía `input` y deja `output` en `{"purgado": true}`. Coste, tokens, modelo y error se guardan siempre, así que el gasto sigue cuadrando.
- `lib/core/errors.ts`: la herramienta del Técnico de mantenimiento que lista llamadas con respuesta vacía ignora las purgadas.

**D5: limpieza semanal de registros**
- `lib/operaciones/retention.ts` (nuevo): `runRetentionCleanup` corre el domingo desde las 05:00 de Madrid, una vez por semana. `purgeOldRecords` hace el trabajo:
  - **Borra** lo que tiene más de N meses (por defecto 6): avisos enviados o fallidos, bandeja de ClickUp hecha o fallida, eventos de encargos y correos recibidos ya resueltos.
  - **Nunca toca** avisos pendientes, cambios por hacer en ClickUp ni correos nuevos, interpretándose o propuestos.
  - **Resultado:** queda en `ops_settings` (`retention_last`). Si falla, también se anota, para no reintentar cada 30 s.
- `lib/core/capabilities.ts`: `registerRetention` / `runRetention`. Cada módulo borra lo suyo sin que Operaciones conozca sus tablas.
- `lib/agentes/register.ts`: Agentes registra el borrado de `agt_messages` antiguos. Las conversaciones, la memoria y las fichas no se tocan.
- `lib/operaciones/automations.ts`: automatización `retention` («Limpieza de registros antiguos»), con `logMonths` 6 (3–36) y `aiTextDays` 90 (30–365).
- `lib/operaciones/telegram-worker.ts`: nuevo paso del planificador.
- **Mapa Visual:**
  - `lib/operaciones/process-map.ts`: nodo `ops-au-retention`.
  - `lib/operaciones/map-live.ts`: proveedor `retention`, que muestra la última limpieza y cuánto borró.

**S7: política de borrados.** Ya estaba aplicada. `tests/auditoria.test.ts` («política de borrados») la fija:
- **Editor:** locales, cuentas, competidores, palabras clave, URLs y anotaciones.
- **Solo administrador:** contactos, memoria y ficha del cliente.

**C10: aceptado.** Las pantallas de Clientes son capa de aplicación y pueden mostrar piezas de varios módulos; `lib/core/` sigue sin importar módulos. Anotado en `docs/REVISION-2026-11-17.md`.

**Otros cambios**
- `tests/retencion.test.ts` (nuevo) comprueba:
  - qué borra y qué conserva;
  - que no toca otras cuentas;
  - que los trabajos de IA guardan el coste;
  - que la segunda pasada no recuenta;
  - el día, la hora y la semana del planificador.
- `tests/tiempos.test.ts`: la prueba «con los tiempos apagados…» fallaba a veces con la batería completa. Tomaba el último evento de una consulta sin ORDER BY; ahora busca el evento por lo que tiene que ser.
- `docs/ESTADO.md`: cabecera, §7 (panel), §10 (índice y retención), §13 (política de borrados), §16 (pendientes) y §18 (cronología).
- `docs/REVISION-2026-11-17.md`: D4, D5, S7 y C10 pasan a ✅.

## Migraciones aplicadas
`0053_ai_jobs_indice.sql`. Aplicada en local tras `backups/backup_pre_ai_jobs_indice_20261119.sql`:
```sql
CREATE INDEX IF NOT EXISTS "ai_jobs_tenant_created_idx" ON "ai_jobs" USING btree ("tenant_id","created_at");
```
En producción se aplica con `bash scripts/deploy.sh --migrate`, que hace una copia antes.

## Decisiones técnicas tomadas en auto mode
- **Textos de IA, sin borrar la fila:** el gasto mensual y los picos salen de `ai_jobs`; borrar filas descuadraría el vigía.
- **`{"purgado": true}` en vez de `NULL`:** si no, el Técnico de mantenimiento vería las llamadas antiguas como respuestas vacías.
- **Retención mínima de 3 meses:** los informes, el piloto automático y la actividad de clientes miran como mucho dos meses atrás.
- **Domingo desde las 05:00 de Madrid:** después de la copia diaria (03:00 UTC), para que lo borrado quede al menos en la copia de esa noche.
- **Enganche en el núcleo para Agentes:** Operaciones no puede importar el módulo Agentes (regla de arquitectura).
- **Encendida por defecto,** como se aprobó. Se puede apagar en el panel.

## Qué verificar manualmente
- Automatizaciones → «Limpieza de registros antiguos»: debe aparecer con 6 meses y 90 días.
- Mapa Visual → Operaciones → «Limpieza de registros antiguos»: antes del primer domingo dice «Aún no se ha hecho ninguna». El lunes 23 nov debe mostrar la primera limpieza. Con datos solo desde el 4 nov, no se borrará ningún registro y los textos de IA tampoco, hasta febrero.
- Tras el despliegue: `migraciones: 54` en la verificación de `deploy.sh`.

Comprobaciones hechas:
- `pnpm test`: 399/399.
- `node scripts/check-architecture-map.js`: OK (21 automatizaciones, 19 tareas del planificador, mapa actualizado).
- `tsc` sin errores en los archivos tocados.

## Pendientes detectados
- S2/S3 (rol de plataforma): sigue esperando, antes de abrir una segunda cuenta.
- Copias antiguas `backup_kijutech_*` en el servidor: borrarlas a mano, con OK de Enric, cuando haya 7 días de `backup_daily_*`.
