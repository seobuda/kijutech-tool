# El agente de operaciones por Telegram (conversación, audios y equipo de subagentes)

**Fecha:** 13 nov 2026 · **Estado:** aprobado por Enric («sí a las tres… te apruebo todo») y **construido las fases 1–3 y parte de
la 4** en `feature/agentes`:
- conversación por Telegram con texto y audio en los dos sentidos;
- correo y prueba desde la web;
- acciones con aprobación y autonomía por herramienta;
- agentes con rol editables y subagentes con trabajos (Revisor web);
- integraciones DataForSEO, Clarity y Google.

Pendiente: que el equipo hable con agentes, más subagentes y revisor intercambiable con agentes.
**Pedido:** «poder comunicarme con él por Telegram de forma natural, con audios, y que él también me pueda enviar audios…
escribirle tareas para asignar… y más adelante que tenga sub-agentes que hagan trabajos (revisar la web del cliente X, analizar el
último artículo y darnos un informe)… todo esto tiene que tener su propio módulo».

## 1. Punto de partida (verificado en el código)
- El bot hoy **ignora los mensajes libres y los audios**. Solo atiende comandos (`/descanso`, `/jornada`…), botones y las respuestas
  que él mismo ha pedido.
- **Ya existen:**
  - transcripción de audio con Gemini (la del Bloc; la clave no tiene créditos);
  - convertir una nota en encargos con IA (`request-proposer`);
  - crear tareas en ClickUp con envío fiable;
  - la bandeja de salida (estado, fecha, comentario y responsable);
  - el **motor de acciones** con autonomía por tipo (sombra, con aprobación, autónomo) y medición del acierto;
  - el vigía de gasto de IA;
  - la IA de reserva.
- **La IA de Claude no escucha ni habla:** entiende texto, imágenes y PDF, pero no audio. Hacen falta un servicio para pasar la
  voz a texto (STT) y otro para pasar el texto a voz (TTS).

## 2. Cómo funcionaría (lo que verías)
1. Le mandas al bot un **texto o un audio**, como a una persona: *«Mira, que Jesús revise mañana el formulario de CM Ibérica, que
   no llegan los correos, y dile a Mayelin que el artículo de Athos es para el viernes»*.
2. Si es audio, se transcribe. El agente entiende la petición y **propone las acciones** con botones:
   - «📝 Crear encargo: revisar formulario · CM Ibérica · Jesús · mañana»;
   - «📅 Cambiar la fecha de "Artículo Athos" al viernes».

   Debajo: ✅ Hacerlo · ✏️ Cambiar · ✖️ Descartar.
3. Pulsas ✅ y se hace (ClickUp + aviso a la persona). Lo que se puede deshacer o es de solo lectura lo hace directamente:
   - *«¿Qué tiene Eury pendiente?»*;
   - *«¿Cómo va el gasto de IA?»*;
   - *«¿Quién no ha fichado hoy?»*.
4. **Si le hablas con audio, te responde con audio**, y además con texto, para leerlo o copiarlo. También puedes pedírselo
   («respóndeme en audio»).
5. Más adelante: *«Revisa el último artículo de la web de Athos y dime si está bien»*. El agente se lo encarga a un **subagente**,
   que lee la web, lo analiza y te devuelve un **informe**: por Telegram, adjunto a la tarea de ClickUp si la hay y guardado.
   Si se lo pides, crea además la tarea para alguien del equipo.

## 3. Arquitectura recomendada

### 3.1 Un módulo nuevo: «Agentes» (tablas `agt_*`)
Es un módulo como SEO u Operaciones, no parte de Operaciones. Contiene:
- **Conversaciones y mensajes** (`agt_conversations`, `agt_messages`): la memoria del chat con su contexto (qué se pidió, qué se
  hizo). Los audios se guardan con su transcripción.
- **Registro de agentes** (`agt_agents`): el agente principal («Operations manager») y los subagentes, cada uno con su ficha:
  - qué hace;
  - instrucciones (prompt editable, como los demás);
  - herramientas que puede usar;
  - modelo;
  - autonomía;
  - presupuesto.
- **Trabajos** (`agt_jobs`): lo que se le encarga a un subagente. Tienen estado (en cola, trabajando, hecho, fallido), resultado
  (informe), coste y quién lo pidió. Los ejecuta el planificador, como los correos del agente: reclamo atómico, reintento y nunca
  dos veces.

### 3.2 Cómo usa el agente lo que ya existe (respetando la regla núcleo/módulos)
Un módulo no puede llamar a otro. **Propuesta:** un **registro de capacidades en el núcleo**. Cada módulo publica sus «herramientas»
con su descripción, sus parámetros, su nivel de riesgo y el permiso que exige:
- Operaciones publica `crear_encargo`, `reasignar`, `mover_fecha`, `estado_equipo`, `jornada_hoy`…
- SEO, más adelante, publicaría `analizar_articulo`, `keywords_cliente`…

El módulo Agentes solo habla con ese registro. Así un módulo nuevo añade herramientas al agente sin tocar el agente. **Esto toca el
núcleo (una pieza pequeña: tipos y registro, sin tablas), y por regla necesita tu aprobación.**

### 3.3 El cerebro: Claude con herramientas y el motor de acciones
- Claude con **uso de herramientas** (*tool use*) en un bucle: lee el mensaje y el contexto, decide qué herramientas llamar y
  redacta la respuesta.
  - Se usaría el **SDK oficial de Anthropic** (`@anthropic-ai/sdk`), que es lo recomendado para el uso de herramientas.
  - Hoy la pasarela usa `fetch`. **Instalar la dependencia necesita tu aprobación.**
- **Toda acción que cambia algo pasa por el motor de acciones.** Por defecto, cada tipo nuevo empieza «con tu aprobación», con
  botones. Con datos sube a autónomo (la propuesta semanal y la bajada automática ya existen).
  - Las consultas de solo lectura se hacen sin preguntar.
- Todo queda medido en el vigía de gasto (cada mensaje es una llamada, con su función `agt_chat`).

### 3.4 Voz
- **Entrada:** Telegram envía los audios en OGG/Opus. Se descargan, se transcriben y se guarda el audio con su texto.
- **Salida:** el texto de la respuesta se convierte a voz y se manda como nota de voz de Telegram (OGG/Opus).

| Opción | Entrada (STT) | Salida (TTS) | A favor | En contra |
|---|---|---|---|---|
| **A. OpenAI para todo** (recomendada para empezar) | Sí | Sí | Una sola clave para las dos cosas. Buena transcripción en español. Voces correctas. Puede ser además la clave de la **IA de reserva**. | Voces menos naturales que ElevenLabs. Datos a otro proveedor. |
| B. ElevenLabs para todo | Sí | Sí | Las voces más naturales en español; se puede clonar una voz propia. | Más caro. Otra cuenta y otra clave. |
| C. Gemini (ya integrado) para STT + otro para TTS | Sí | Parcial | El código de transcripción ya existe. | La clave no tiene créditos; serían dos proveedores. |
| D. Whisper en el propio servidor | Sí | No | Sin coste por minuto, nada sale fuera. | Con 1 CPU y 2 GB es lento y quita memoria a la herramienta: habría que ampliar el servidor. |

> **Precios no verificados.** Antes de elegir los miro en las páginas oficiales. Para el uso previsto (unos minutos de audio al día)
> el orden de magnitud es de céntimos al día, pero hay que confirmarlo. El vigía de gasto lo contaría.

### 3.5 Subagentes (fase posterior)
- **Primer subagente, «Revisor web»:**
  - lee una URL con la herramienta de lectura web de Anthropic (`web_fetch`, no hay que montar un *scraper*);
  - la analiza con un criterio editable (SEO on-page, enlaces, imágenes, legibilidad, el tono del cliente según su ficha y su
    memoria);
  - devuelve un informe estructurado.
- **Lo que lee de la web es un dato, nunca una instrucción.** Ya se hace así con los correos: un subagente no puede actuar por lo
  que diga una página.
- **Trabajos más pesados** (auditorías con código, muchas páginas, horas de trabajo):
  - se puede usar **Claude Managed Agents**, que pone la ejecución y un entorno aislado; se decide cuando llegue;
  - los subagentes encajan también como **revisor intercambiable** (`reviewers.ts`), que ya estaba previsto para revisar trabajo
    antes que tú.

## 4. Alternativas descartadas para el conjunto
| Alternativa | Por qué no |
|---|---|
| Ampliar el bot con comandos (`/tarea …`) sin IA | No es «natural»: no entiende audios ni frases como las de arriba. |
| Meter el agente dentro de Operaciones | Rompe la regla de módulos y crece sin orden cuando lleguen los subagentes de SEO u otros departamentos. |
| Plataforma externa de agentes (n8n, Make, un bot de terceros) | Pierde el acceso directo a nuestros datos, las aprobaciones y la medición del motor de acciones. Más piezas y más costes. |
| Todo con Managed Agents desde el principio | Es para trabajos largos con entorno propio. Para conversar y llamar a nuestras herramientas, un bucle propio es más simple y barato. Se usará para subagentes pesados. |

**Cuestionado tres veces:**
1. *¿Sirve al objetivo final (sustituir a un humano con supervisión)?* Sí: hablar con él como con una persona, con las mismas
   acciones que harías tú y con aprobación hasta que demuestre acierto.
2. *¿Riesgo oculto?*
   - **Coste:** cada mensaje es una llamada a Claude más audio. Mitigación: modelo según la tarea, contexto corto y el vigía.
   - **Errores al interpretar:** mitigado porque nada cambia sin tu ✅ al principio.
   - **Seguridad:** solo tu chat puede mandar órdenes; el equipo, más adelante y con herramientas limitadas.
3. *¿Hay algo que ya tengamos?* Casi todo: el bot, el motor de acciones, el `request-proposer`, la bandeja de salida, la
   transcripción y el vigía. Lo nuevo es el bucle de conversación, la voz, la memoria y el registro de capacidades.

## 5. Plan por fases
| Fase | Qué | Necesita aprobación |
|---|---|---|
| **1. Hablar con él (texto y audio de entrada)** | Mensajes libres y audios del dueño. Herramientas de lectura: estado del equipo, tareas de una persona, jornada, gasto, informes. Herramientas con aprobación: crear encargo, reasignar, mover fecha, comentar. Memoria de la conversación. | **Esquema** (`agt_conversations`, `agt_messages`), **dependencia** `@anthropic-ai/sdk`, **núcleo** (registro de capacidades), **proveedor de voz** |
| **2. Que te hable** | Respuestas en audio (cuando le hablas en audio o lo pides). Voz elegida. | Proveedor de TTS |
| **3. Equipo de subagentes** | Registro de agentes y trabajos (`agt_agents`, `agt_jobs`). Primer subagente «Revisor web» con informe a Telegram y ClickUp. Pantalla «Agentes» con fichas, trabajos y costes. | **Esquema** |
| **4. Más subagentes y el equipo** | Redactor con el tono del cliente, auditor SEO, revisor de entregas (revisor intercambiable). Que el equipo también pueda hablar con el agente con herramientas limitadas. | Según cada uno |
