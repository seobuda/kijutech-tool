# Jefe SEO D3: conversación con el Jefe y cambios propuestos al plan
**Fecha:** 2026-11-27  
**Rama:** feature/seo-jefe-d3  
**Commit:** b13c5691

## Qué se construyó
- `lib/core/capabilities.ts`: capacidad `agentChat` (`setAgentChat` / `agentChat`, `AGENT_THREAD_RE`) para que un módulo converse con un agente desde su pantalla sin importar Agentes. `ToolContext.thread`: el hilo fijado por el servidor.
- `lib/core/jobs.ts`: el trabajador pasa a cola continua (coge un trabajo nuevo en cuanto queda un hueco; antes esperaba a que terminara todo el lote).
- `lib/agentes/chat.ts` (nuevo): envío (guarda el mensaje y encola el trabajo `agt.chat`, uno por hilo con la clave única del trabajo abierto), lectura del hilo y el trabajo que responde con `runAgent` y resume cada 20 mensajes.
- `lib/agentes/store.ts`: departamento «SEO» y agente «Jefe SEO» (`jefe_seo`, Opus 5.5; su gasto cuenta en el tope del Jefe) con sus instrucciones y herramientas.
- `lib/agentes/register.ts`: registra la capacidad y el tipo de trabajo. `lib/agentes/engine.ts`: texto genérico para las herramientas de cambio.
- `lib/seo/jefe/cambios.ts` (nuevo): proponer, listar, aceptar o rechazar y caducar cambios al plan; cambios aceptados para la versión siguiente; resumen del plan para el agente.
- `lib/seo/jefe/tools.ts`: `seo_plan_maestro` y `seo_proponer_cambio_plan`; el proyecto sale del hilo (`projectForTool`); el id del proyecto vale como entrada.
- `lib/seo/jefe/plan.ts`: los cambios aceptados entran en el prompt de la versión siguiente; los motivos de decisión solo de planes; al aprobar, caducan los cambios pendientes antiguos; el gasto del Jefe incluye `agt_jefe_seo_resumen`. `PlanError` pasa a `lib/seo/jefe/errors.ts` (sin ciclo de imports).
- `lib/seo/jefe/chat.ts` (nuevo, puro): clave del agente, hilo y `max_tokens` del chat.
- `lib/seo/jefe-actions.ts`: `sendJefeMessageAction`, `jefeThreadAction`, `decidePlanChangeAction` (admin, con el tope del Jefe).
- `app/(dashboard)/dashboard/projects/[projectId]/servicio/jefe-chat.tsx` (nuevo), `page.tsx`, `servicio-panel.tsx`: «Hablar con el Jefe SEO» y «Cambios propuestos por el Jefe».
- Mapa Visual: paso `jefe-chat` (SEO) y `agt-chat-modulo` (Agentes); organigrama con SEO. Comprobación del mapa pasada.
- Pruebas: `tests/seo-jefe-d3.test.ts` (nueva, 7); `agentes`, `organigrama` y `arquitectura-guardrails` actualizadas (excepción `lib/seo/jefe-actions.ts → lib/app-wiring` con su motivo, como las de Agentes, Estrategia y Rendimiento).

## Migraciones aplicadas
Ninguna. La tabla `seo_jefe_proposals` (0080) ya tenía el tipo «cambio» y `thread_peer`; el agente y el departamento se crean solos al primer uso (`ensureDefaultAgents`).

## Decisiones técnicas tomadas en auto mode
Protocolo de decisión (toca el núcleo):
- **Puntos de vista:** arquitectura (capacidad del núcleo, como `setAgentJobCreator`, sin que SEO importe Agentes); especialista SEO (el Jefe debe ver plan, expediente y pronóstico, y proponer sin decidir); seguridad y costes (solo admin, un presupuesto, nada de datos de webs como criterio sin revisar).
- **Alternativas:** (A) no hacer nada y usar el chat de prueba de Agentes o Telegram: sin contexto del proyecto ni lista de cambios en la pantalla; (B) capacidad del núcleo: **elegida**; (C) chat propio de SEO con `callAI` y su bucle de herramientas: duplica motor, presupuesto y registro; (D) importar el motor desde SEO: rompe la regla de arquitectura.
- **Auditoría Opus 5.5 (esfuerzo alto)** encontró fallos serios y se aplicaron todos antes de escribir la capacidad:
  1. El proyecto lo fijaba el modelo → ahora lo fija el hilo (`ToolContext.thread`).
  2. Envíos a la vez en el hilo compartido → candado por hilo (clave única del trabajo abierto; el segundo mensaje se quita).
  3. Acción síncrona larga y `max_tokens` corto → envío encolado, la pantalla lee el hilo; 16.000 tokens.
  4. Dos topes de gasto sin coordinar → la acción exige margen en el tope del Jefe para una versión del plan; el resumen cuenta.
  5. Inyección «blanqueada» (web → propuesta → aceptar → prompt) → evidencia real obligatoria, evidencias visibles al decidir, aviso si en ese turno leyó una web, y el cambio entra en el prompt delimitado como dato.
  6. Ciclo de vida → caducan al aprobar otra versión; los aceptados salen solos cuando se aprueba la siguiente; decisiones de planes y de cambios por separado.
  7. Riesgo «cambio» con texto falso → texto genérico en el motor.
  8. Seguridad → hilo construido en el servidor, «web:» prohibido, historial solo por acción de admin.
  9. Autoría por mensaje («Nombre: …») e `isOwner` real (permiso `users`); contexto mínimo; resumen como en Telegram.
- **Hilo compartido por proyecto** (no por persona): es la memoria del proyecto y los cambios son comunes.
- **Un hilo por proyecto, no por propuesta:** más simple; si hace falta, se añaden hilos por frente después.
- **Cola continua del trabajador:** sin ella, una respuesta del chat podía esperar minutos detrás de un plan o un rastreo (deuda ya apuntada en D2).
- **Sin prueba visual en local:** arrancar la app local con el bot rompe el webhook de producción (memoria del proyecto). La pantalla queda cubierta por `tsc` y por las pruebas de pantallas del despliegue.

## Qué verificar manualmente
- Agentes → Departamentos: aparece «SEO» con el Jefe SEO.
- Un proyecto con plan → Trabajo → Plan de servicio, al final: «Hablar con el Jefe SEO». Pregunta «¿Por qué este orden?» y comprueba que responde en un minuto y cita datos.
- Pídele un cambio («pon la ficha de Google en el primer trimestre»): debe aparecer en «Cambios propuestos por el Jefe» con sus datos; acéptalo y genera una versión nueva: el cambio debe estar incorporado.
- Coste por mensaje (se ve en cada respuesta) y gasto del Jefe en el botón de generar.

## Pendientes detectados
- Coste y duración reales de un mensaje del Jefe con Opus (estimado: céntimos; sin medir).
- El plan nuevo no declara por código si incorporó o descartó cada cambio aceptado (lo dice en el texto si no lo hace): se puede añadir al validador.
- Hilos por frente o por propuesta y Telegram del departamento SEO: más adelante.
- El agente `jefe_seo` se puede editar en Agentes (herramientas): un admin podría darle herramientas de otros departamentos.
- `summarize` del motor etiqueta los mensajes del usuario como «Enric» (el contenido ya lleva el nombre de quien escribe).

## Revisor de código
Aprobar con cambios, sin hallazgos graves. Arreglados: aviso en la pantalla si no llega la respuesta (trabajo fallido o reinicio); una respuesta pasado el tiempo máximo ya no se escribe; los motivos de rechazo de cambios llegan al prompt del plan siguiente; el mensaje se borra si falla el encolado; un solo tope de gasto (el agente ya no tiene tope propio, manda `jefe_budget_usd`). Apuntado sin arreglar: con 3 huecos ocupados por trabajos largos, la respuesta espera (no se reserva hueco para el chat); el mensaje que pierde el candado existe unos milisegundos antes de borrarse.
