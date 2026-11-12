# Agente de correo como project manager
**Fecha:** 2026-11-12  
**Rama:** feature/agente-pm → main  
**Commit:** 0dc455cb

## Qué se construyó
- **Diagnóstico con datos de producción** (permiso de Enric): en la prueba real el agente (1) cerraba con preguntas opcionales aunque ya estuviera todo claro y (2) prometía acciones que el sistema no hacía («lo dejo anotado como encargo», «actualizo el encargo y lo asigno a Jesús»).
- `lib/db/migrations/0042_ops_email_prompt_v2.sql`: prompt `ops_email_reply` v2 (solo si seguía en v1).
- `lib/operaciones/request-proposer.ts`: lógica «texto → encargos» extraída de `note-actions.ts` sin cambiarla; la usan el Bloc y el correo.
- `lib/operaciones/email-pm.ts`: hilo (correos anteriores y respuestas enviadas, sin texto citado), correcciones recientes de Enric como ejemplos, carga del equipo, propuesta del encargo con reparto por carga, creación real, tarea del hilo y frase verídica.
- `lib/operaciones/email-agent.ts`: decisiones nuevas (crear encargo, añadir a la tarea, sin respuesta), botones y aprobación.
- `lib/operaciones/telegram-handler.ts`: `ag:<id>:re|pa|as:<persona>`.
- `lib/operaciones/agent-actions.ts`: medidas `endsWithQuestion` y `promisesAction`; `agente-view.tsx` las muestra.
- `correos/correos-view.tsx`: la propuesta enseña el encargo o la tarea a completar.
- `tests/agente-pm.test.ts`.

## Migraciones aplicadas
`0042_ops_email_prompt_v2.sql`: `UPDATE ai_prompts SET system_prompt = …, user_prompt_template = …, version = 2 WHERE key = 'ops_email_reply' AND version = 1` (texto completo en el archivo). En producción, backup previo con `scripts/deploy.sh --migrate`.

## Decisiones técnicas tomadas en auto mode
- **La frase «lo hemos registrado como tarea…» la añade el código, no la IA**, y solo después de que el encargo exista de verdad: así la respuesta nunca promete algo que no ha pasado.
- **Reutilizar la IA del Bloc** para proponer el encargo (lista, cliente, responsable habitual o por fichas, plazo del cliente) en vez de pedírselo al prompt del correo: misma calidad y un solo sitio que mantener.
- **Reparto por carga:** si el responsable propuesto suma ≥ 8 puntos (vencidas×2 + hoy + encargos abiertos) y otra persona tiene la mitad o menos, se propone a esa persona y se explica; Enric puede cambiarlo con «👤 Cambiar responsable».
- **Un correo que aporta datos a una tarea ya creada** se añade como comentario en ClickUp (bandeja de salida, clave única) en vez de crear otra tarea.
- **Correcciones como ejemplos** (últimas 5) en vez de reglas aprendidas: barato y efectivo con poco volumen; con muchos ejemplos se podrá resumir el estilo.
- Prueba descubierta: con el prompt nuevo, un encargo interno sin respuesta quedaba «informativo» y no proponía la tarea. Corregido antes de desplegar.

## Qué verificar manualmente
- Enviar a `agente@equipo.kijutech.com`, desde `@kijutech.com`, un encargo («cambiar X en la web de cliente Y para el viernes»): llega a Telegram con «✅ Crear encargo», el responsable con su carga y la carga del equipo. Probar «👤 Cambiar responsable».
- Contestar en el mismo hilo con más datos: debe proponer «✅ Añadir a la tarea» (sin crear otra).
- Comprobar en ClickUp la tarea creada (y el comentario añadido) y el aviso de Telegram al responsable.
- Pestaña Agente → «Responder correos»: % que acaban en pregunta y promesas.

## Pendientes detectados
- La creación usa el espacio habitual del cliente o, si no, el último espacio usado en el Bloc; si no hay ninguno, solo se sugiere el trabajo.
- «Cambiar responsable» solo desde Telegram (no desde la web).
- Mapa Visual actualizado (nodo del buzón) y comprobación OK; `pnpm test` 150 OK.
