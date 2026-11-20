# Diseño: jefe de Operaciones y base de conocimiento

**Fecha:** 2026-11-20 · **Estado:** propuesta, pendiente del OK de Enric. Nada construido.

Parte del organigrama (ver `docs/ESTADO.md` §6.28). Tras el piloto de Sistema, el siguiente departamento es Operaciones.
Decisión de Enric del 20 nov: **el equipo pregunta por el mismo chat privado donde le llegan los encargos** (opción A).

---

## 1. El objetivo

1. **El equipo resuelve sus dudas sin esperar a Enric.** Primero con lo que ya sabemos y, si no hay nada, con ayuda de IA.
2. **A Enric solo le llega lo que no se ha podido resolver**, ya resumido y con lo que se ha probado.
3. **Cada respuesta de Enric se convierte en conocimiento de la agencia**, ordenado y reutilizable. La base crece sola con el uso, y
   también con las horas que Enric dedique a escribir en ella.
4. **Dejar de depender de ClickUp** para el conocimiento, conservando los vídeos explicativos.
5. Encaja con la visión (Operaciones sustituye a un humano): la base de conocimiento será también la memoria de todos los agentes
   (estratega, revisor web, técnico), no solo del jefe de Operaciones.

## 2. Lo que ya existe y se reutiliza

| Pieza | Dónde | Qué aporta |
|---|---|---|
| Chat privado de cada persona con el bot principal | `lib/operaciones/telegram-handler.ts` | El canal. Hoy los mensajes libres del equipo **se ignoran** |
| Mensajes libres y audios → agentes | `toAgent` → `dispatchInbound` (núcleo) → `lib/agentes/inbound.ts` | Ya llega `isOwner`. Hoy solo se atiende a Enric |
| Flujo «Bloqueado» con triaje de IA | `lib/operaciones/blockers.ts`, tabla `ops_blockers` | Responde con el contexto de la tarea o escala a Enric con resumen, opciones y recomendación |
| Modos de autonomía (sombra / aprobación / autónomo) | `lib/operaciones/agent-actions.ts` | Para decidir si el jefe contesta solo o con tu visto bueno |
| Ficha del cliente y memoria aceptada | `clients`, `client_memory`, herramienta `ficha_cliente` | El primer escalón de respuesta |
| Embeddings y pgvector | `lib/ai/clustering/layers/1-embeddings.ts` (`embedTexts`), columnas `vector(1536)` | Búsqueda por significado sin coste de IA apreciable |
| Organigrama y bots de departamento | `agt_departments`, `ops_telegram_bots` | El departamento Operaciones ya existe; falta su jefe |
| Pruebas simuladas | `lib/operaciones/sim/` | Probar con cientos de preguntas sin molestar al equipo |

**No se reutiliza `seo_knowledge_cards`:** son las tarjetas de ayuda de las etapas del módulo SEO, con otro fin.
**Lo que es de un cliente concreto** («este cliente no quiere fotos de stock») va a `client_memory`, no a la base general.

## 3. Cómo funciona (de punta a punta)

### 3.1 La persona pregunta
- Escribe o manda un audio en su chat de siempre.
- Si **responde a un mensaje de un encargo**, el jefe sabe de qué tarea y de qué cliente habla.
- Si no, detecta el cliente por el nombre. Si no lo ve claro, pregunta «¿De qué cliente?» con botones de sus clientes activos
  (o «Es general»).
- Un «gracias» o un «ok» no se trata como pregunta. Lo decide un modelo pequeño (Haiku), no Sonnet.

### 3.2 La escalera de respuesta (el orden que pidió Enric)
1. **Ficha del cliente + memoria aceptada + contexto del encargo** (descripción, nota original, comentarios).
2. **Base de conocimiento**: artículos publicados que se parecen a la pregunta.
3. **Casos anteriores**: preguntas ya respondidas por Enric, también de otros clientes («esto ya se resolvió en X»).
4. **IA general (Sonnet)**: si nada de lo anterior sirve, ayuda a resolverlo como lo haría un compañero con experiencia, y
   **lo marca así**: «Esto no está en nuestra base; es una sugerencia general».

La búsqueda de los escalones 2 y 3 se hace con **embeddings + texto**, no con IA (ver §6). A Sonnet solo le llegan los 5 resultados más
parecidos, nunca la base entera. Cada respuesta **cita su fuente**: «Según la ficha de X», «Artículo: Cómo redirigir en WordPress
(revisado en marzo)» o «Sugerencia general».

### 3.3 Botones bajo cada respuesta
- **✅ Me sirve** → se cierra y cuenta como respuesta útil (el artículo sube en la búsqueda).
- **❌ No me sirve / ya lo probé** → pide en una línea qué ha probado o por qué no vale (texto o audio) y **escala a Enric**.
- **🙋 Prefiero que lo vea Enric** → escala directamente, sin más preguntas.

### 3.4 Enric responde
- Le llega: quién pregunta, el cliente y el encargo, la pregunta, lo que contestó el jefe y por qué no le valió. Además, la propuesta del
  jefe si tiene una.
- Contesta por Telegram (texto o audio) o desde la herramienta. La respuesta le llega a la persona al momento.
- Después, el jefe **redacta un borrador de artículo** a partir de la conversación. Lo generaliza (sin datos del cliente) y le pone
  título, problema, solución y categoría. Si hay algo propio del cliente, lo propone aparte como memoria del cliente.
- Enric ve el borrador con tres botones: **Guardar en la base** · **Editar** · **No guardar**. **Nada entra en la base sin su OK**:
  es lo que mantiene la calidad.

### 3.5 Límites: lo que el jefe nunca contesta solo
Siempre escala estos temas, aunque crea saber la respuesta:
- plazos, prioridades y cambios de asignación;
- precios, presupuestos y compromisos con un cliente;
- quejas o enfados de un cliente;
- temas personales, de horario o de RR. HH.;
- **accesos y contraseñas**: nunca se mandan por Telegram, solo dice dónde están.

Además, lo que venga de comentarios de ClickUp se trata como dato no fiable, igual que en el triaje de bloqueos.

### 3.6 Cómo se entera Enric de lo que el jefe contesta solo
- **Parte diario** del departamento: preguntas del día, cuántas se resolvieron con la base, con la ficha o con IA general, cuántas se
  escalaron y las que siguen sin respuesta.
- En cada pregunta de la herramienta, un botón **Corregir**: si el jefe contestó mal, Enric escribe la buena respuesta, se le reenvía a la
  persona y sale un borrador de artículo.
- **Huecos de conocimiento**: temas que se preguntan mucho y no tienen artículo. Es la lista de qué escribir cuando Enric saque horas.

## 4. La base de conocimiento

### 4.1 Qué es un artículo
- **Título** y **problema o pregunta** («El cliente dice que su web va lenta»).
- **Solución**, con pasos y en texto con formato.
- **Categoría**: SEO, Google Ads, Webs WordPress, Contenidos, Operativa interna o Herramientas (editables).
- **Etiquetas**.
- **Enlaces y vídeos**: cualquier URL (clip de ClickUp, Loom, Google Drive o YouTube oculto), con título.
- **Estado**: borrador · publicado · archivado.
- **Origen**: escrito a mano · respuesta de Enric · importado de ClickUp · dictado por Telegram.
- **Revisado el** (fecha). Los artículos que no se revisan en 12 meses se marcan para revisar.
- **Uso**: veces que se ha usado, «me sirve» y «no me sirve».

### 4.2 Pantalla «Conocimiento»
- Buscador y filtros por categoría y estado.
- Pestañas: **Publicados · Pendientes de revisar** (borradores salidos de respuestas) **· Huecos · Archivados**.
- Crear, editar, archivar y eliminar (con confirmación). El borrador se autoguarda.
- Desde el detalle: preguntas del equipo que lo usaron y resultado.
- Permisos: el equipo **lee**; los editores proponen; publicar y archivar es de admin.

### 4.3 Crear conocimiento por Telegram
Enric manda un audio al bot: «Apunta en la base: cuando un cliente de WordPress…». Sale un borrador ordenado para revisar. Así las horas
de «volcar conocimiento» pueden ser hablando, no escribiendo.

### 4.4 Lo que hay en ClickUp
- **Importación única** del espacio «Base de conocimiento» a borradores, para revisarlos por tandas. Los enlaces a vídeos se conservan.
- **Sin verificar:** si el espacio son Docs o tareas, y cuántas entradas tiene. Docker no estaba arrancado al escribir esto. Lo miro antes
  de construir la importación (la API de Docs de ClickUp es distinta de la de tareas).
- **Vídeos:** se pueden seguir grabando con ClickUp mientras se use. **Riesgo sin verificar:** si se deja ClickUp, los enlaces de sus
  clips podrían dejar de funcionar. Para vídeos nuevos recomiendo **Google Drive** (ya hay Workspace: sin coste extra y los enlaces
  son vuestros) o Loom. Con la grabación de pantalla de Windows o Chrome basta. La base acepta cualquier enlace, así que no hay que
  decidirlo ahora.

## 5. Decisiones de diseño (cuestionadas tres veces, con alternativas)

### 5.1 Dónde vive la base de conocimiento
**Hipótesis:** tablas propias en la herramienta, con embeddings.

**Cuestionada:**
1. *¿Sirve al objetivo final o solo a hoy?* Sirve a todos los agentes, no solo a Operaciones. Por eso iría **en el núcleo** (como
   `clients` y `client_memory`), no como tablas `ops_*`. Tocar el núcleo requiere tu OK.
2. *¿Coste o riesgo oculto a semanas vista?* Una base que envejece da respuestas viejas con seguridad. Se mitiga con la fecha de revisión,
   la cita de la fuente con su fecha, el «no me sirve» que la baja en la búsqueda y la lista de revisión anual.
3. *¿Hay algo que ya tenemos?* El espacio de ClickUp. Leerlo por la API evitaría construir la base, pero va contra dejar ClickUp, choca con
   el límite de 100 peticiones por minuto, no busca por significado y no permite guardar bien las respuestas de Enric.

| Opción | Coste y esfuerzo | Riesgo | Qué se pierde |
|---|---|---|---|
| **A. Tablas propias + embeddings** (recomendada) | Medio: tablas, pantalla, importación | Bajo; ya usamos pgvector | Nada; el vídeo va por enlace |
| B. Seguir en ClickUp y leer por la API | Bajo al principio | Límite de peticiones, dependencia de ClickUp | Búsqueda por significado y guardado automático |
| C. Carpeta de Google Docs (Workspace) | Bajo | Búsqueda pobre y estructura libre | Estados, uso, huecos y aprobación |
| D. No hacer base; solo responder con IA | Ninguno | La IA inventa lo que es propio de la agencia | El conocimiento de Enric no se guarda |

### 5.2 Cómo se busca
**Recomendado: búsqueda híbrida** (embeddings + texto completo de Postgres).
- Solo embeddings falla con términos exactos («Rank Math», «404»).
- Solo texto falla con la misma duda dicha con otras palabras.
- Usar una IA para buscar sería caro y lento.

### 5.3 Una tabla de preguntas nueva o ampliar `ops_blockers`
**Recomendado: tabla nueva de preguntas del equipo**, porque un bloqueo cambia el estado del encargo y una duda no. El motor de respuesta
(la escalera) es uno solo y, en la fase 3, lo usará también el triaje de bloqueos. Así un «Bloqueado» también mira la ficha y la base.

### 5.4 Si el jefe contesta solo o con tu visto bueno
| Opción | A favor | En contra |
|---|---|---|
| **Autónomo, con fuente citada y parte diario** (recomendada) | Respuesta inmediata, que es el objetivo | Una respuesta mala puede llegar antes de que la veas; se compensa con el botón Corregir y los límites de §3.5 |
| Aprobación previa las 2 primeras semanas | Calibras al jefe antes de soltarlo | Si no estás pendiente, las dudas esperan horas y el equipo deja de usarlo |
| Sombra (contesta solo para ti, no a la persona) | Cero riesgo | No ayuda al equipo |

Se puede cambiar en cualquier momento desde el panel, como el resto de automatizaciones. Propuesta intermedia: **los escalones 1-3**
(ficha, base y casos) **autónomos desde el principio, y la IA general en «aprobación» la primera semana.**

## 6. Coste de IA (directiva de optimización)
| Tarea | Cómo | Por qué |
|---|---|---|
| ¿Es una pregunta? ¿De qué cliente? | Haiku | Clasificación simple |
| Buscar en la base y en los casos | Embeddings + texto, **sin IA** | Similitud: céntimos por miles de preguntas |
| Redactar la respuesta con lo encontrado | Sonnet | Razonamiento y tono con el equipo |
| Respuesta de IA general | Sonnet | Razonamiento |
| Borrador de artículo a partir de la conversación | Sonnet, salida corta | Solo cuando Enric responde |
| Importación de ClickUp | Sin IA (copia tal cual) y embeddings | Ordenar por categoría puede hacerse con Haiku si hace falta |

**Sin verificar:** el coste por pregunta. A ojo, unos céntimos con Sonnet. El vigía de IA lo controla dentro de los 80 $/mes.
El proveedor de embeddings en producción (Voyage, OpenAI o Gemini) depende de las claves configuradas; lo miro antes de construir.

## 7. Qué toca construir (por fases)

**Fase 1: base de conocimiento** (el equipo no nota nada todavía)
- Esquema (necesita OK): tabla de artículos con embedding y tabla de categorías, en el núcleo.
- Pantalla «Conocimiento» completa (§4.2), con búsqueda híbrida.
- Importación del espacio de ClickUp a borradores.
- Dictado por Telegram para Enric (§4.3).

**Fase 2: el jefe de Operaciones contesta al equipo**
- Esquema (necesita OK): tabla de preguntas del equipo (pregunta, persona, cliente, encargo, escalón que respondió, fuentes,
  respuesta, «me sirve», escalado, respuesta de Enric, artículo generado).
- Agente **Jefe de operaciones** (`jefe_operaciones`, Sonnet) en el departamento Operaciones, con herramientas nuevas:
  `buscar_conocimiento`, `casos_anteriores` y `escalar_a_enric`, más las que ya existen (`ficha_cliente` y `encargos_recientes`).
- `lib/agentes/inbound.ts`: los mensajes del equipo (no del dueño) van al jefe de Operaciones y se contestan por el bot principal.
- Botones (§3.3), escalado y respuesta de Enric (§3.4), borrador de artículo con aprobación.
- Automatización «Respuestas al equipo» (autonomía por escalón) y **Parte de Operaciones**.
- Pruebas simuladas con el miembro de pruebas antes de abrirlo al equipo real.

**Fase 3: unir y medir**
- El triaje de «Bloqueado» usa la misma escalera.
- Pestaña Huecos de conocimiento y revisión anual de artículos.
- Mapa Visual, ESTADO.md, seguridad y pruebas en cada fase, como siempre.

## 8. Decisiones que necesito de Enric
1. **Base de conocimiento en el núcleo** (para todos los agentes) en vez de dentro de Operaciones. Supone tocar el núcleo.
2. **Por dónde te llegan las escaladas del equipo**: el chat principal (como hoy los bloqueos) o un bot propio de Operaciones para la
   dirección, como el de Sistema.
3. **Autonomía de partida** (§5.4): mi propuesta es base y ficha autónomas, e IA general con tu aprobación la primera semana.
4. **Categorías iniciales**: SEO, Google Ads, Webs WordPress, Contenidos, Operativa interna y Herramientas. ¿Cambias alguna?
5. **Quién del equipo puede proponer artículos** (rol editor) o si de momento solo escribes tú.
