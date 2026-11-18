# Resto de pendientes de la revisión del 17 nov
**Fecha:** 2026-11-17  
**Rama:** fix/estrategia-informe-mes (incluye C4, C6 e I3 de las dos sesiones anteriores de hoy)  
**Commit:** 46113b8a

## Qué se construyó
**IA**
- `lib/ai/adapters/common.ts` (nuevo): `finishResponse` — una respuesta vacía, cortada por el límite de tokens o rechazada lanza `AIBilledError` con el motivo real y los tokens (I5, I6).
- `lib/ai/adapters/anthropic.ts`, `openai.ts`, `gemini.ts`, `deepseek.ts`: usan `finishResponse`. OpenAI pide `max_completion_tokens` (los modelos de razonamiento rechazan `max_tokens`). Gemini une todas las partes de texto sin las de pensamiento y cuenta el pensamiento como salida (I6, I7).
- `lib/operaciones/transcribe.ts`: sin pensamiento en todos los modelos flash (si el modelo no acepta el ajuste, se repite sin él) y coste con el pensamiento (I7).
- `lib/ai/clustering/layers/0-intent-normalizer.ts`: lotes de 150 modificadores (tope 600), cada llamada en `ai_jobs` (`cluster_intent_modifiers`) con su coste también si falla, y lo que la IA no devuelve ya no se guarda en `ai_intent_modifiers` (I8). `pipeline.ts`: le pasa la cuenta y el proyecto; la capa 4 sin precio guarda NULL, no 0.
- `lib/ai/clustering/layers/1-embeddings.ts`: 60 s por petición (I11).
- `lib/agentes/engine.ts`: coste NULL si el modelo no tiene precio y búsquedas web a 0,01 $ (I10); el resumen de la conversación registra su error o su respuesta vacía (I9); marca el turno como «contenido de fuera» tras una lectura web (I13).
- `lib/core/capabilities.ts`: campo opcional `untrustedInput` en `ToolContext` (I13). `lib/operaciones/agent-capabilities.ts`: con él, «autónomo» pasa a «con aprobación».

**Seguridad**
- `lib/seo/kw-feedback-actions.ts`: el cluster tiene que ser del proyecto; si no, no se toca nada (S8).

**Operaciones**
- `lib/operaciones/jornada.ts`: `recordWorkEvent` con candado por persona (`pg_advisory_xact_lock`) en una transacción (O4); `dropPendingStartPrompts` quita de la cola los «⏰ te escribo en N min» al empezar o marcar ausencia (O10).
- `lib/operaciones/reminders.ts`: carga primero los avisos recientes y solo sus encargos (O9).
- `lib/operaciones/sync.ts`: `safeRevalidate` (O8) y `retryFailedSyncs`, reintento automático de `error_sync` (5 por vuelta, cada encargo como mucho cada 30 min, sus primeras 24 h) (O6). `telegram-worker.ts`: nuevo paso del planificador y «Sistema en marcha» con hasta 5 intentos (D13).

**Estrategia y Rendimiento**
- `lib/estrategia/strategist.ts`: propuestas y cierre del análisis en una sola transacción (C7).
- `lib/rendimiento/report.ts`: en el panel central, una propiedad sin datos desde hace más de 14 días no arrastra el rango de carga; su fila dice desde cuándo (C9).

**Servidor**
- `scripts/deploy.sh`: `build` → (con `--migrate`) migración con la imagen nueva en `compose run --rm --no-deps` → `up -d`. Si la migración falla, la app anterior sigue en marcha (D1). `docs/DESPLIEGUE.md` actualizado.
- `scripts/restore-test.sh`: falla si hay errores al restaurar (salvo «ya existe») y compara las filas de 7 tablas con la base real (D8).
- `scripts/watchdog.sh` + `app/api/health/route.ts` + `lib/operaciones/health.ts`: el vigilante anota cada ejecución en `ops_settings` (también sin `watchdog.env`), Salud avisa si falta la configuración o lleva más de 20 min sin ejecutarse, y el aviso distingue «base de datos sin responder» de «planificador parado» (D12).

**Mapas y documentos**
- `lib/operaciones/process-map.ts` (envío a ClickUp con `runs: ['retryFailedSyncs']`), `lib/agentes/process-map.ts` (motor), `lib/auth/security-process-map.ts` (nuevo paso «Agente y contenido de fuera»).
- `scripts/check-architecture-map.js`: reconoce también las tareas `retry…` del planificador.
- `docs/REVISION-2026-11-17.md`, `docs/ESTADO.md`.

**Pruebas:** `tests/ia-adaptador.test.ts` (reglas comunes, Gemini, OpenAI), `tests/jornada.test.ts` (O4 con tres pulsaciones a la vez, O10), `tests/salud.test.ts` (campo `db`).

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **I5, una respuesta cortada ahora es un error:** antes se devolvía el trozo y quien llamaba fallaba con «JSON no válido». Ningún uso actual aprovecha una respuesta a medias (el motor del agente lleva su propio tratamiento del corte y no pasa por el adaptador).
- **I13 toca el núcleo** (`ToolContext.untrustedInput`, campo opcional): es la única forma de que la herramienta (Operaciones) sepa lo que pasó en el turno del agente (Agentes) sin que un módulo importe al otro. Es aditivo y no cambia nada para quien no lo use.
- **O4, sin limitar el webhook a una conexión:** el candado por persona basta y no ralentiza al resto del equipo.
- **O10, borrar el aviso de la cola:** `ops_notifications` no tiene un estado «anulado» (habría que cambiar el esquema). Se borran solo avisos `pendiente` sin enviar con la clave `jw:later:<persona>:`, que nunca llegaron a nadie.
- **O6, límites del reintento automático:** 30 min entre intentos y solo el primer día, para no gastar peticiones de ClickUp en un encargo que falla siempre; después sigue «Reintentar» a mano y el aviso de Salud.
- **D8, umbral de filas a la mitad:** la copia diaria puede tener hasta un día menos de datos; menos de la mitad de las filas solo pasa si se perdió un `COPY`.
- **D11 no se ha hecho:** rotar las copias implica borrar copias antiguas, y eso necesita el OK de Enric. Queda 🔒 con una propuesta.

## Qué verificar manualmente
- **Despliegue:** es el primero con el `deploy.sh` nuevo. Con `bash scripts/deploy.sh` (sin `--migrate`, no hay migraciones) debe verse «Reconstruyendo la imagen» y luego «Sustituyendo la app», y terminar con web 200 y 0 errores.
- **Salud (tras el primer cron del vigilante, ≤ 5 min):** aparece «Vigilante externo: última comprobación hace N min».
- **Jornada:** pulsar dos veces seguidas «Empezar» → una sola entrada. Pulsar «⏰ 15 min» y empezar antes → no llega el recordatorio.
- **Gasto de IA:** en Sistema → Gasto de IA aparece la función `cluster_intent_modifiers` cuando se agrupen palabras clave.
- **Agente:** con una herramienta en «autónomo», pedirle que lea una web y haga un cambio → debe proponerlo con botones, no hacerlo.
- **Prueba de restauración** (próxima, el día 1 a las 4:00, o lanzarla a mano): debe dar «ok» con las filas.

Comprobaciones hechas:
- `pnpm test`: 380/380.
- `node scripts/check-architecture-map.js`: OK (mapa actualizado; la comprobación ahora reconoce las tareas `retry…`).
- Logs del contenedor local tras reconstruir: sin `ReferenceError` ni errores del planificador.

## Pendientes detectados
- **🔒 que esperan a Enric:** D4/D5 (índice y purga de `ai_jobs` y registros: migración), D6 (borrar un cliente borra su histórico de Google), D7 (`docker-compose.prod.yml` sin variables opcionales), D11 (rotación de copias), S2/S3/S7 (roles de plataforma y política de borrados), S4/S9 (login), C10 (Clientes del núcleo que importan módulos).
- **D14 (continuo):** quedan `catch {}` vacíos; el Técnico de mantenimiento irá señalando los que causen algo.
- Las tareas que se cancelan por tiempo agotado siguen sin coste registrado (el proveedor no devuelve los tokens).
