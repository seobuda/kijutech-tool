# Revisión de Operaciones y arreglos de mayor riesgo
**Fecha:** 2026-11-11  
**Rama:** fix/operaciones-revision (desde `main`)  
**Commit:** 0131d346

## Qué se construyó
- `lib/operaciones/telegram-handler.ts`: regex de botones corregida (`\d{1,20}`) y exportada como `FLOW_CALLBACK_RE`; con la tarea en marcha solo actúa el responsable actual.
- `lib/operaciones/telegram-worker.ts`: planificador con cada paso aislado (`step()`); «Sistema en marcha» marcado antes de enviar; cierre de la conexión del candado al fallar; nueva tarea `retriageStaleBlockers`.
- `lib/operaciones/note-actions.ts`: «Enviar todo» reclama la nota (`borrador` → `convertida`) e inserta los encargos en una transacción.
- `lib/operaciones/sync.ts`: candado `pg_try_advisory_xact_lock` por encargo durante el envío a ClickUp.
- `lib/operaciones/outbox.ts`: `isSuperseded()` descarta cambios de estado/fecha antiguos de la misma tarea.
- `lib/operaciones/telegram.ts` y `notifications.ts`: `clampMessage` respeta el HTML; `isParseError` + `htmlToPlain` para reenviar en texto plano.
- `lib/operaciones/blockers.ts`: `strictBool`, `sourceIsUntrusted`, datos no fiables delimitados, `retriageStaleBlockers`, error genérico.
- `lib/operaciones/watch.ts` y `clickup.ts`: reintento de tareas que fallan, cursor que no las salta (1 h), `reverse=true`, aviso si la pasada se trunca.
- `tests/revision-operaciones.test.ts`: 7 pruebas nuevas (botones, recorte HTML, booleano estricto, fuentes no fiables).
- `scripts/check-architecture-map.js`: reconoce el nuevo formato `step(…, () => tarea(t))`.
- `docs/ESTADO.md`: §16 «Revisión del 11 nov», §18 cronología y fecha.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Candado por encargo con `pg_try_advisory_xact_lock`** en vez de un estado nuevo `enviando`: evita tocar el esquema (el CHECK de estados) y el candado se libera solo aunque el proceso caiga.
- **Comentarios de ClickUp = fuente no fiable:** la IA puede proponer, pero si se apoya en comentarios se escala a Enric con la propuesta visible. Se eligió frente a «verificar la cita literal» porque no exige cambiar el prompt en la base de datos de producción.
- **Cursor de la vigilancia:** se retiene como mucho 1 h por una tarea que falla, para que una tarea rota no bloquee la vigilancia para siempre.
- **`reverse=true` en la consulta de vigilancia:** orden ascendente para que, si una pasada no cabe, lo que falte sean los cambios más nuevos (que entran en la siguiente). No verificado contra la documentación de ClickUp; si el orden por defecto ya fuera ascendente, la pasada truncada lo avisa igualmente en `lastError`.
- No se arrancó `kijutech_app` (el permiso lo bloqueó): las pruebas se ejecutaron con `docker compose run --rm --no-deps app pnpm test`.

## Qué verificar manualmente
- En producción, tras desplegar: una tarea de ClickUp con dos responsables → los dos pueden pulsar «Empezar» y el primero queda como principal.
- `docker logs` sin `ReferenceError` y con mensajes `[telegram] planificador (paso)` solo si algo falla.
- Pulsar «Enviar todo» dos veces seguidas en el Bloc → un solo juego de encargos.
- Mapa Visual → Operaciones → «Bloqueado: triaje con IA» muestra la tarea `retriageStaleBlockers`.

## Pendientes detectados
- `pnpm test`: 69 pruebas OK + 7 nuevas; las 8 de `tests/http.test.ts` fallan solo porque necesitan el servidor en marcha (no es regresión).
- `node scripts/check-architecture-map.js`: OK (13 automatizaciones, 8 tareas del planificador, 77 pasos).
- Sin arreglar todavía (ver ESTADO §16): minutos laborables (tope 14 días, muestreo de 5 min, comida), «hoy» por zona horaria de la persona, horas por cliente en paralelo, estados de lista sin refrescar, tareas duplicadas con `[kiju:]`, tope de coste de IA, autenticación del remitente de correo, `answerCallbackQuery` al final del webhook.
