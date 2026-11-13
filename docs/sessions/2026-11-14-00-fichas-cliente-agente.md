# Fichas de cliente por Telegram (fase 1 del onboarding)
**Fecha:** 2026-11-14  
**Rama:** feature/agente-fichas  
**Commit:** 496f968b

Antes de empezar se desplegó `feature/voz-agente` en producción (`main` `c7cd65ec`, sin migraciones; web 200, Telegram sin error, 0 errores en logs).

## Qué se construyó
- `lib/operaciones/client-write.ts` (nuevo): `planClientChange` valida y resuelve lo que propone el agente (nivel, servicios, responsables, webs, contactos, memoria, opción «Cliente» de ClickUp), `planHtml` (vista previa en Telegram), `applyClientPlan` (guarda al aprobar, revalidando duplicados y opción ya usada), `addClientMemory`, `clientSheetText` (ficha completa en texto), y las funciones puras `domainOf`, `normalizeUrl`, `withContactLine`. Exporta `SECRET_RE`, que ahora comparte con la ficha web.
- `lib/operaciones/agent-capabilities.ts`: herramientas nuevas `crear_cliente`, `actualizar_cliente` y `anotar_memoria_cliente` (de cambio, por el motor de acciones con ✅ / ✖️ y autonomía por herramienta). `ficha_cliente` devuelve la ficha completa, y la búsqueda del cliente (`findClient`) avisa si el nombre encaja con varios.
- `lib/operaciones/client-actions.ts`: usa `SECRET_RE` de `client-write.ts`.
- `lib/agentes/store.ts`: instrucciones del principal con el apartado de fichas; herramientas nuevas y `web_fetch` en el principal; **actualización única de los agentes ya creados** (`UPGRADES`, aplicada en `ensureDefaultAgents` y registrada en `agt_integrations`, proveedor «sistema»).
- `tests/agentes.test.ts`: pruebas puras (dominio, URL, línea de contacto) y con base de datos: crear con aprobación, rechazo de contraseñas y de duplicados, valores por defecto, remitentes, memoria, edición en autónomo (suma y reemplaza), ficha completa, memoria con aprobación y actualización única del agente.
- Mapa (`lib/operaciones/process-map.ts`, `lib/agentes/process-map.ts`), `docs/ESTADO.md`, `docs/GUIA-AGENTES.md`.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **El agente redacta los campos; no se hace una segunda llamada a `ops_client_fill`.** Alternativas comparadas:
  1. Reutilizar el prompt `ops_client_fill`: es una llamada más, su regla «frases cortas, no deduzcas» va en contra de una ficha «más profesional y amplia», y no ve la conversación ni la web.
  2. Que el agente rellene el esquema de la herramienta: ninguna llamada extra, tiene todo el contexto y puede leer la web antes. Es la elegida.
  3. Un híbrido: más coste sin ganar nada.

  La seguridad la pone el código (validación contra los datos reales) y la aprobación de Enric.
- **Sin columnas nuevas (fase 1):**
  - la web va en «Webs y herramientas», y su dominio en los alias y los remitentes (así sus correos se reconocen solos), salvo los proveedores genéricos (gmail…);
  - el teléfono y la dirección van en una línea «Contacto:» al principio de las notas;
  - los contactos con correo van en `ops_client_senders`.

  Los activos del cliente con su propio esquema son la fase 2.
- **Al editar, los textos se reemplazan y lo demás se suma** (alias, servicios, webs, contactos, memoria). Así el agente no puede borrar por accidente una lista, y para un texto pasa la versión completa nueva. Para quitar un servicio hay un campo explícito (`servicios_quitar`).
- **Nivel por defecto:** el «normal / estándar / medio» si existe, si no el primero, con un aviso en la vista previa.
- **Opción «Cliente» de ClickUp:** se vincula sola si hay una con el mismo nombre o alias y está libre. Crear opciones en el campo desplegable de ClickUp por API está **sin verificar**, así que no se intenta: el aviso le pide a Enric que la añada en ClickUp.
- **Actualización de agentes ya creados:** la inserción por defecto no toca las filas existentes. Se añadió un mecanismo de actualizaciones únicas por cuenta, que añade las herramientas que falten y cambia las instrucciones solo si siguen siendo las originales. Si Enric quita una herramienta después, no vuelve a aparecer.
- **Memoria creada por el agente:** se guarda como «aceptada» con origen «nota», porque la ha dicho Enric y ha pasado por su aprobación. La restricción de la tabla no admite un origen «agente», y no se tocó el esquema.
- **`web_fetch` en el principal,** para que lea la web del cliente al crear la ficha. Coste estimado: unos céntimos por ficha. Las instrucciones le piden que no invente datos de contacto, cifras ni servicios contratados.

## Qué verificar manualmente
- Tras desplegar, por Telegram (texto o audio): «Nos ha entrado un cliente nuevo, José Pérez, tienda de deportes en Valencia, web joseperez.com, teléfono 600…, quiere conseguir leads».
  - Debe leer la web.
  - Te llega la propuesta «🗂 Nueva ficha: …» con ✅ / ✖️.
  - Al aprobar, la ficha aparece en Operaciones → Clientes con la web, la línea «Contacto» en las notas y el dominio en los correos reconocidos.
- «Añade a la ficha de José Pérez que también llevamos Google Ads»: llega la propuesta «✏️ Cambios en la ficha…».
- «Apunta en la memoria de José Pérez que prefiere WhatsApp».
- En Agentes, el Operations manager tiene las tres herramientas nuevas y «Leer una página web». La autonomía de las tres está en «con tu aprobación».
- Borra la ficha de prueba al terminar (Clientes → Eliminar).

## Pendientes detectados
- **Fase 2 (esquema, necesita aprobación):** activos del cliente en el núcleo (webs, dominio, teléfono, dirección, cuentas de Search Console, Analytics y Business Profile, competidores), según `docs/DISENO-CLIENTE-NUCLEO.md`. Habrá que migrar la línea «Contacto» y la «Web» de las fichas creadas en la fase 1.
- **Fase 3:** onboarding encadenado. Cuando Enric aprueba una ficha nueva, el agente aún no se entera en la conversación: hoy el mensaje del ✅ dice «¿Empezamos su onboarding? Díselo al agente». En la fase 3, la aprobación debe volver a la conversación y lanzar los subagentes.
- La vista previa se corta a 4.096 caracteres (límite de Telegram) si la ficha es muy larga. El resumen guardado en la acción se corta a 480.
- Comprobación del mapa: pasa (`Mapa Visual OK: 20 automatizaciones, 17 tareas, 7 prompts, 40 tablas, 105 pasos en 16 mapas`). Pruebas: 263 correctas; las 9 de `http` y `auditoria` fallan por diseño en el contenedor temporal.
