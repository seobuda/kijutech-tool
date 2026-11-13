# Módulo Agentes: hablar con el agente por Telegram (texto y audio) y correo, subagentes e integraciones
**Fecha:** 2026-11-13  
**Rama:** feature/agentes (incluye feature/coste-servidor y el diseño)  
**Commit:** 39977cc6

## Qué se construyó
- **Núcleo:** `lib/core/capabilities.ts`, el registro de capacidades.
  - Herramientas de los módulos.
  - Entrada de mensajes libres.
  - Salida por Telegram y correo.
  - Tareas programadas.
  - `lib/app-wiring.ts` lo conecta al arrancar (`instrumentation.ts`, la ruta del webhook de Telegram y las pantallas).
- **Migración 0047 + `schema.ts`:** tablas `agt_agents`, `agt_conversations`, `agt_messages`, `agt_jobs` y `agt_integrations`, más el tipo `agent_tool` en `ops_agent_actions`.
- **`lib/agentes/`:**
  - `store.ts`: fichas, agentes por defecto, conversaciones, mensajes y gasto por agente;
  - `engine.ts`: Claude con herramientas, caché de prompt, coste con la caché valorada, presupuesto, formato por canal y resúmenes;
  - `inbound.ts`: Telegram y correo, en segundo plano, un mensaje cada vez;
  - `voice.ts`: OpenAI para transcribir y hablar;
  - `jobs.ts`: trabajos de subagentes y las herramientas `encargar_a_agente` y `estado_trabajos`;
  - `integrations.ts`: DataForSEO, Clarity y Google con OAuth;
  - `register.ts`: herramientas de integraciones y registro en el núcleo;
  - `actions.ts`: acciones web de administración;
  - `process-map.ts`: mapa del módulo.
- **Operaciones:**
  - `agent-capabilities.ts`:
    - herramientas de lectura: equipo, tareas, pendientes, cliente, encargos, costes, informe y calendario;
    - herramientas de cambio con aprobación y autonomía por herramienta: crear encargo, reasignar, mover fecha, comentar y ausencia;
    - salida por Telegram y correo.
  - `agent-capabilities-actions.ts`: autonomía por herramienta.
  - `telegram-handler.ts`: mensajes libres y audios hacia el agente; botones `at:`.
  - `telegram.ts`: `tgSendVoice` y tipos de audio.
  - `email-agent.ts`: los correos del dueño, autenticados, van al agente.
  - `agent-actions.ts`: tipo `agent_tool`.
  - `telegram-worker.ts`: paso «tareas de módulos».
- **Pantallas `/dashboard/agentes`** (admin):
  - Agentes: fichas, nuevo, probar y autonomía;
  - Conversaciones;
  - Trabajos;
  - Integraciones.
  - Rutas `/api/agentes/google/conectar` y `/callback`.
  - Entrada «Agentes» en el menú.
- **Dependencia nueva:** `@anthropic-ai/sdk` 1.8.0, instalada en un contenedor temporal.
- **Mapa Visual:** nodo «Agentes» con su mapa (4 pasos), paso de conexión en Operaciones, y «Subagentes» y «Audios al bot» pasan a construido. La comprobación se amplió para el mapa de Agentes y sus tablas. **Pasó** (20 automatizaciones, 17 tareas del planificador, 7 prompts, 40 tablas `ops_*` + 5 `agt_*` verificadas, 105 pasos, 16 mapas).
- **Documentación:**
  - `docs/DISENO-AGENTE-CONVERSACIONAL.md` (estado);
  - `docs/GUIA-AGENTES.md` (nuevo);
  - `docs/ESTADO.md` (§6.21, tablas, migraciones y mapa de archivos);
  - `docs/PENDIENTES-ENRIC.md`.
- **Pruebas:**
  - `tests/agentes.test.ts` (16);
  - 7 acciones nuevas en `tests/seguridad.test.ts`.
  - Resultado: tipos limpios; 257+ pruebas OK y las 9 de entorno de siempre.

## Migraciones aplicadas
Solo en local, con backup previo `backups/backup_pre_agentes_20261113.sql`. Aprobada por Enric. `0047_agt_agentes.sql`: ver el archivo en `lib/db/migrations/`. Crea las 5 tablas `agt_*` con sus índices y reglas, y amplía `ops_agent_actions_kind_check` con `'agent_tool'`.

## Decisiones técnicas tomadas en auto mode
Cuestionadas antes de decidir. Las alternativas descartadas están en el diseño.

- **Registro de capacidades en el núcleo**, en vez de que el bot llame al agente o meter el agente en Operaciones. Cumple la regla de módulos y permite añadir canales (WhatsApp, web) y herramientas de otros módulos sin tocar el agente.
- **El webhook de Telegram responde al momento y el agente trabaja en segundo plano.** Si no, Telegram reenvía el mensaje cuando se tarda más de lo que espera, y el agente respondería dos veces.
- **Contexto corto** (resumen + últimos 16 mensajes, solo texto) y **caché de prompt**. Medido con la IA real: ~0,02 $ por mensaje con herramientas.
- **Coste:** lectura de caché al 10 % y escritura al 125 % del precio de entrada, para no sobrestimar.
- **Acciones de cambio por el motor de acciones existente** (tipo `agent_tool`) con autonomía por herramienta, empezando todo «con tu aprobación». Es coherente con el resto del sistema y se mide el acierto.
- **Crear encargos reutiliza la conversión del Bloc** (listas, clientes, responsables y fechas con las fichas) **y el envío fiable**, en lugar de que el agente rellene campos de ClickUp.
- **Voz con OpenAI:** `gpt-transcribe` en español, que la documentación de OpenAI recomienda (los modelos antiguos se retiran en 2027), y `gpt-4o-mini-tts`, cuyo sustituto no funciona con la API de voz actual. Se comprueba que la salida sea OGG antes de mandarla como nota de voz.
- **Subagente con la lectura web de Anthropic** (`web_fetch`) en lugar de un *scraper* propio.
- **Integraciones dentro del módulo Agentes**, con herramientas que solo aparecen si están conectadas.
  - Clarity no se prueba al guardar: tiene un límite de 10 consultas al día.
  - Google, con estado OAuth firmado y la sesión de admin comprobada en la vuelta.
- **Primera línea de «pensar en voz alta» fuera del informe y Markdown convertido según el canal:** salía así con la IA real.

## Qué verificar manualmente
- Desplegar con `bash scripts/deploy.sh --migrate`. Lleva la migración 0047 y la dependencia nueva; el despliegue hace el backup.
- Por Telegram, escribir al bot y mandar un audio. Comprobar la transcripción (🎙 «…») y la nota de voz de respuesta.
- Pedir «que Jesús revise mañana X»: debe llegar la propuesta con ✅ / ✖️, y al aprobar, crearse la tarea en ClickUp.
- Pedir «revisa el último artículo de la web de X»: el informe debe llegar por Telegram y aparecer en Agentes → Trabajos.
- Con tu cuenta, revisar las cuatro pantallas de Agentes y conectar las integraciones.

## Pendientes detectados
- **Que el equipo hable con agentes**, con herramientas limitadas. Hoy solo el dueño.
- **La reserva de IA no cubre el motor de agentes:** si Anthropic falla, el agente avisa de que no puede.
- **El clustering de SEO no usa todavía el registro de capacidades.**
- **No probado de extremo a extremo:**
  - la voz (la clave de OpenAI está en producción);
  - DataForSEO, Clarity y Google con cuentas reales;
  - el correo del dueño en producción.
- **Se ignora un audio enviado mientras el bot espera una respuesta escrita** (un motivo, por ejemplo): va al agente y lo pendiente sigue esperando.
- **Business Profile** necesita que Google apruebe el acceso a su API.
