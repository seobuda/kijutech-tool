# Para ti completo y detalles de interfaz
**Fecha:** 2026-11-23  
**Rama:** feature/para-ti-y-detalles y fix/guards-paginas  
**Commit:** 9a8e2512 (antes de6f1139)

## Qué se construyó
Enric pidió el 23 nov los puntos 1 y 2 de la lista de pendientes: decidir en Para ti también los correos, las propuestas de los agentes y las dudas del equipo, y los detalles de interfaz.

**Para ti (commit d6972630)**
- `lib/inicio/para-ti.ts`: `getParaTiDecisions` (correos con la propuesta, lo que entendió el agente y el principio del texto; propuestas `agent_tool`; dudas abiertas) y `decisionKey`. El enlace de un correo lleva a ese correo (`?id=`).
- `app/(dashboard)/dashboard/para-ti/page.tsx`: secciones «Dudas del equipo», «Correos por responder» y «Propuestas de los agentes» con sus botones, respetando los filtros. Correos y propuestas solo para el dueño; dudas, cualquier admin.
- `app/(dashboard)/dashboard/para-ti/decision-cards.tsx` (nuevo): tarjeta del correo (reutiliza `ReplyProposal`) y de la propuesta del agente (Hacerlo / Descartar).
- `app/(dashboard)/dashboard/operaciones/correos/reply-proposal.tsx` (nuevo, sacado de `correos-view.tsx`); `correos/page.tsx` y `correos-view.tsx` aceptan `?id=` para abrir un correo.
- `app/(dashboard)/dashboard/agentes/equipo/rows.ts` (nuevo: `QuestionRow`, `toQuestionRow`); `equipo-view.tsx` exporta `QuestionCard`.
- `lib/operaciones/agent-capabilities.ts`: `decideAgentTool` recibe `via` (`telegram` o `panel`).
- `lib/operaciones/agent-capabilities-actions.ts`: `decideAgentToolAction` (solo el dueño, `requireInboxOwner`; registra el evento).

**Detalles de interfaz (commit de6f1139)**
- `clientes/[id]/tab-trabajo.tsx`, `ficha-view.tsx`, `operaciones/nuevo/page.tsx`, `nuevo-encargo-form.tsx`: «Nuevo encargo» desde la ficha abre el formulario con el cliente y su primera lista habitual (mejor una que tenga su opción «Cliente»). La IA no quita ese cliente si no reconoce otro. Aviso si el cliente no está vinculado a ClickUp. «Volver a la ficha».
- `operaciones/encargos/page.tsx`: columna Cliente («sin ficha» si la opción de ClickUp no está vinculada) y filtro «Sin cliente» (`?cliente=sin`) con la explicación de cómo arreglarlo.
- `components/app-shell/crumb-label.tsx` (nuevo) + `app-shell.tsx`: la última miga muestra el nombre que pone la página. Se usa en la ficha de Equipo, la del cliente y la entrada de Conocimiento.
- `components/app-shell/app-shell.tsx`: la entrada principal de la barra pasa a `aria-current="true"` cuando hay una subentrada marcada (antes, dos `page`).
- `lib/equipo/team.ts`: la actividad del día suma los fichajes de jornada (`ops_work_events`, sin los anulados), los bloqueos respondidos, las fichas, el calendario y las decisiones de personas sobre propuestas del agente. Frases en funciones puras (`workEventText`, `webEventText`, `decisionText`).
- `lib/architecture-map/registry.ts`: descripciones de Para ti y Equipo al día. `node scripts/check-architecture-map.js` pasa.
- Pruebas:
  - `tests/para-ti.test.ts`: propuesta de un agente que sale en Para ti, se descarta desde la web, queda como «panel» y ya no se puede volver a decidir.
  - `tests/seguridad.test.ts`: un editor no puede decidir propuestas.
  - `tests/equipo-humano-ia.test.ts`: frases de la jornada y de las acciones web.
  - En total, 539 correctas (1 saltada, el examen real).
- `docs/ESTADO.md`: cabecera, pruebas, §6.32, §16, §18 y el mapa de archivos.

**Guards de página (rama `fix/guards-paginas`, pedido por Enric antes de desplegar)**
- `projects/page.tsx`, `projects/archived/page.tsx`: `requirePagePermission('view')`. Sin rol no se ve la lista.
- `projects/new/page.tsx`, `projects/[projectId]/edit/page.tsx`, `operaciones/nuevo/page.tsx`: `requirePagePermission('edit')`. Antes solo lo exigían las acciones, y un lector podía abrir el formulario.
- `tests/seguridad.test.ts`: un lector que abre esas páginas vuelve a Inicio; un usuario sin rol no ve la lista. 540 pruebas en total.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Reutilizar, no duplicar:** `ReplyProposal` y `QuestionCard` se comparten entre su pantalla y Para ti, así que los botones y las reglas son los mismos en los dos sitios.
- **Quién decide qué en Para ti:** los correos y las propuestas de los agentes siguen la regla de Mi bandeja y de Telegram (solo el dueño). Las dudas, la de Dudas del equipo (cualquier admin).
- **Las propuestas `note_conversion` siguen enlazando:** hoy nunca quedan en «propuesto» (se registran ya decididas al enviar la nota).
- **Para ti carga las decisiones solo al pintar la página** (como mucho 30 por tipo). El contador de la barra sigue con la consulta ligera.
- **«Sin cliente» incluye las opciones de ClickUp que no están vinculadas a ninguna ficha**, porque tampoco aparecen en ninguna ficha.
- **Nombre en la miga con un almacén del lado del navegador** en vez de tocar `breadcrumbs()`: las migas se calculan con la ruta en el navegador y no conocen los nombres. Si la página no lo pone, sigue saliendo «Detalle».
- **La jornada se lee de `ops_work_events`**, la fuente de verdad (incluye correcciones web y cierres automáticos), y no de los eventos `jornada`.
- **Sin comprobación en el navegador:** el usuario de pruebas tiene la contraseña en `.env` y no se teclea en formularios. Las pruebas `pantallas-*` abren Para ti, Encargos y Nuevo encargo con admin, editor y lector. Las fichas con `[id]` no las recorre ninguna prueba.

## Qué verificar manualmente
- Para ti: si hay un correo con respuesta propuesta, decidirlo ahí (enviar o descartar) y comprobar que desaparece. Lo mismo con una propuesta de un agente («apunta en la ficha de X…» por Telegram → Para ti → Hacerlo) y con una duda escalada.
- Ficha de un cliente → Encargos → «Nuevo encargo»: sale con el cliente y su lista habitual elegidos.
- Encargos → «Sin cliente»: la lista y su número.
- Ficha de una persona en Equipo: la miga muestra su nombre; su actividad de hoy incluye la entrada de jornada.

## Pendientes detectados
- Tras decidir en Para ti, la confirmación «Hecho» casi no se ve porque la tarjeta desaparece al refrescar (igual que en Mi bandeja).
- Otras páginas sin guard propio que dependen de su layout o de comprobaciones internas (SEO de proyecto, IA, seguridad): no se han tocado. Una auditoría de guards de página, como la de acciones, lo cerraría.
- El mensaje de Telegram de una propuesta decidida en la web conserva sus botones; al pulsarlos responde «ya estaba decidida».
