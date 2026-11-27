// Mapa Visual del módulo Agentes (nivel 3): cómo se habla con un agente y cómo trabaja. Se registra en
// lib/architecture-map/registry.ts (detailMapId «agentes»).
import type { ProcessStep } from '@/lib/ai/clustering/pipeline';

export const AGENTES_PROCESS_MAP: ProcessStep[] = [
  {
    id: 'agt-entrada',
    lane: 'Hablar con el agente',
    name: 'Telegram, audio y correo',
    description: 'Enric escribe o manda un audio al bot (o un correo al buzón del agente). El bot de Operaciones entrega el mensaje al núcleo y el módulo Agentes lo atiende; el webhook responde al momento y el agente trabaja en segundo plano.',
    status: 'built',
    file: 'lib/agentes/inbound.ts',
    when: 'Cada mensaje libre o audio del dueño en Telegram (sin nada pendiente del bot) y cada correo autenticado del dueño.',
    ai: 'La transcripción del audio (OpenAI) y la respuesta del agente (Claude).',
    code: 'Solo el dueño (fase 1). Un mensaje cada vez por conversación. Audio: se descarga de Telegram (3 intentos) y se transcribe en español; si le hablas en audio (o pides «respóndeme en audio»), el agente lo sabe, escribe para ser escuchado y contesta también con nota de voz. Voz configurable en Agentes → Voz (modelo, voz, velocidad, tono, transcripción; integración «voz» en agt_integrations) con prueba en el navegador. Correo: solo remitente autenticado (SPF/DKIM/DMARC) y que sea el dueño. Fichas de cliente: con lo que le cuentas (y su web, que lee) crea o completa la ficha y anota en la memoria, siempre con vista previa y ✅ / ✖️. Los agentes por defecto ya creados se actualizan una vez por cuenta (herramientas nuevas; instrucciones solo si no se personalizaron), registrado en agt_integrations proveedor «sistema».',
    tables: ['agt_conversations', 'agt_messages', 'agt_agents']
  },
  {
    id: 'agt-organigrama',
    lane: 'Hablar con el agente',
    name: 'Organigrama: departamentos y jefes',
    description:
      'Organigrama (20 nov 2026): la agencia en departamentos (Gabinete, Operaciones, Cuentas y Estrategia, SEO, Sistema y Plataforma, Seguridad; SEO desde el 27 nov con el Jefe SEO), cada uno con su jefe (agente de tipo «jefe»), sus agentes y a quién reporta. El primero en funcionar es Sistema: su jefe habla con Enric por su propio bot de Telegram («Kijutech Sistema»). Pantalla Agentes → Departamentos. Desde el 21 nov, la portada de Equipo dibuja este organigrama con personas y agentes juntos, cada uno con su foto o avatar (agt_agent_avatars para los agentes).',
    status: 'built',
    file: 'lib/agentes/store.ts',
    when: 'Los departamentos y el jefe de sistema se crean solos la primera vez; un mensaje al bot de un departamento va a su jefe.',
    ai: 'El jefe de sistema (Claude Sonnet) contesta con estado_sistema, errores y diagnósticos; encarga al Técnico de mantenimiento lo que haya que diagnosticar.',
    code: 'El núcleo entrega el mensaje con `bot`: si el departamento de ese bot tiene jefe activo, contesta él (por el mismo bot); si no, el principal, por el mismo chat. Conversación propia por agente (no se mezcla con la del principal). El informe de un trabajo vuelve al chat de quien lo encargó (el jefe de sistema, por su bot); sin conversación de origen, al chat del departamento del subagente. Los agentes que ya existían pasan a su departamento una sola vez (Operations manager → Gabinete, Revisor web → Cuentas, Técnico → Sistema). Departamentos sin jefe todavía: su trabajo lo sigue haciendo el principal.',
    tables: ['agt_departments', 'agt_agents', 'agt_conversations', 'agt_agent_avatars']
  },
  {
    id: 'agt-motor',
    lane: 'Pensar y actuar',
    name: 'Motor: Claude con herramientas',
    description: 'El agente lee el mensaje con el resumen y los últimos mensajes, decide qué herramientas usar (consultas al momento; cambios propuestos con botones) y responde. Las herramientas vienen del registro del núcleo: cada módulo publica las suyas.',
    status: 'built',
    file: 'lib/agentes/engine.ts',
    when: 'En cada mensaje y en cada trabajo de subagente.',
    ai: 'Qué herramientas usar, con qué datos y la respuesta. Hasta 8 vueltas de herramientas por mensaje.',
    code: 'Herramientas permitidas por ficha; las de una integración sin conectar no se ofrecen. Las acciones de cambio pasan por el motor de acciones de Operaciones (tipo agent_tool) con autonomía por herramienta (por defecto con aprobación). Coste en ai_jobs (función agt_<clave>, con las búsquedas web a 0,01 $ cada una; sin precio del modelo queda NULL y el vigía lo marca) y presupuesto mensual por agente. Lo leído de webs y correos es dato, nunca instrucción, y si el turno ha leído una web o una búsqueda, ninguna herramienta de cambio se ejecuta sola aunque esté en «autónomo»: se propone para aprobar. En una conversación por Telegram con el dueño, cada propuesta llega en el MISMO mensaje que la respuesta del agente (frase + propuesta + ✅ / ✖️); desde correo, web o subagentes, como aviso aparte.',
    tables: ['agt_messages', 'agt_agents']
  },
  {
    id: 'agt-chat-modulo',
    lane: 'Hablar con el agente',
    name: 'Conversación desde la pantalla de un módulo',
    description:
      'Capacidad agentChat del núcleo (27 nov 2026, Jefe SEO D3): un módulo abre un hilo con un agente desde su propia pantalla sin importar Agentes. El primero es SEO: Plan de servicio → «Hablar con el Jefe SEO», un hilo compartido por proyecto («seo:<id>»). El departamento SEO y su jefe (Jefe SEO, Opus 5.5) se crean solos.',
    status: 'built',
    file: 'lib/agentes/chat.ts',
    when: 'Cada mensaje enviado desde la pantalla del módulo. La respuesta va como trabajo «agt.chat» de la cola del núcleo (un intento, 15 min como máximo) y la pantalla lee el hilo cada 4 s hasta que llega.',
    ai: 'El agente responde con sus herramientas (motor de siempre) y el contexto mínimo del hilo; max_tokens a medida del módulo (16.000 para el Jefe SEO: Opus piensa dentro de ese margen).',
    code: 'El hilo lo construye el servidor del módulo a partir de un proyecto validado (nunca el navegador ni el modelo) y no puede empezar por «web:» (chat de prueba de Agentes). Una respuesta a la vez por hilo: clave única del trabajo abierto; si dos personas envían a la vez, el segundo mensaje se quita y se le pide esperar. Cada mensaje guarda quién lo escribe («Nombre: …»). Las herramientas reciben el hilo (ToolContext.thread) y usan ESE proyecto aunque el modelo pida otro. Resumen cada 20 mensajes, igual que por Telegram. Desde el 27 nov la cola del núcleo coge un trabajo nuevo en cuanto queda un hueco libre (antes esperaba a que terminara todo el lote).',
    tables: ['agt_conversations', 'agt_messages', 'jobs', 'ai_jobs']
  },
  {
    id: 'agt-trabajos',
    lane: 'Subagentes',
    name: 'Trabajos de los subagentes',
    description: 'El principal encarga trabajos (p. ej. al Revisor web: leer y analizar una página). El subagente lo hace en segundo plano con sus herramientas (lectura web de Anthropic, integraciones) y el informe llega a Enric por Telegram y queda en Agentes → Trabajos y en la conversación.',
    status: 'built',
    file: 'lib/agentes/jobs.ts',
    when: 'El planificador reclama un trabajo cada vuelta (tarea registrada en el núcleo).',
    ai: 'El análisis y el informe del subagente.',
    code: 'Reclamo atómico (FOR UPDATE SKIP LOCKED), reintento si se queda a medias más de 15 min (máx. 3) y aviso con clave única.',
    tables: ['agt_jobs', 'agt_agents', 'agt_messages'],
    runs: ['runScheduled']
  },
  {
    id: 'agt-integraciones',
    lane: 'Integraciones',
    name: 'Integraciones externas',
    description: 'DataForSEO (SERP y volúmenes), Microsoft Clarity (comportamiento), Google (Search Console, Analytics 4, Business Profile por OAuth) y Google Places (clave de API: reseñas de las fichas de la competencia; desde el 25 nov solo la conexión, la descarga llega después). Cada una da herramientas a los agentes cuando está conectada.',
    status: 'built',
    file: 'lib/agentes/integrations.ts',
    when: 'Cuando un agente usa una de sus herramientas.',
    ai: 'Nada (el agente interpreta los datos).',
    code: 'Credenciales cifradas en agt_integrations (nunca vuelven al navegador). Google: OAuth con estado firmado y token de refresco cifrado. Clarity: caché del día (10 consultas al día). Desde el 15 nov: gsc_rendimiento, ga4_informe y gbp_rendimiento (vistas, llamadas, clics a la web y cómo llegar de la ficha de Google) aceptan «cliente» y usan la propiedad principal de su ficha (si falta, lo dicen en vez de adivinar). Agentes registra en el núcleo el directorio de Google (webs de Search Console, propiedades de Analytics con la web de su flujo, fichas de Business Profile con su web) para asignarlas a las fichas.',
    tables: ['agt_integrations']
  }
,
  {
    id: 'agt-equipo',
    lane: 'Equipo',
    name: 'Jefe de operaciones: dudas del equipo',
    description:
      'Las personas del equipo escriben (o mandan un audio) por su chat de siempre y el jefe de operaciones (Opus 5.5, agente libre de solo lectura) les responde con la ficha del cliente, sus encargos, la base de conocimiento y los casos ya resueltos; si no hay nada propio, con su conocimiento general y diciéndolo. Si responden a un aviso de encargo, la duda llega con ese encargo. Botones: Me sirve · No me sirve (pide qué probó y escala) · Que lo vea Enric.',
    status: 'built',
    file: 'lib/agentes/team.ts',
    when: 'Cada mensaje libre de alguien del equipo por el bot principal, si el jefe está encendido (Agentes → Dudas del equipo; apagado de serie). Un mensaje en los minutos siguientes (30 por defecto) sigue la duda anterior. Enric lo prueba desde su chat con «/jefe tu duda» aunque esté apagado (le llegan la respuesta y las aprobaciones).',
    ai: 'El jefe decide qué consultar, cómo responder y si escala. Termina con responder_al_equipo (respuesta, fuente, ids, tema) o escalar_a_enric.',
    code: 'Garantías: la fuente se comprueba (base o casos sin consultarlos, o con ids que no existen = IA general); la IA general pasa por Enric mientras el ajuste esté en «aprobación»; red de seguridad (contraseñas, sueldo, despidos, quejas de clientes) que escala siempre; sin bucles: N dudas del mismo tema en 24 h sin resolver (3 por defecto) → «creo que no te estoy ayudando» y a Enric. «Me sirve» suma a las entradas de la base usadas; «no me sirve», resta. Operaciones solo pone el canal: el encargo respondido llega por el núcleo (replyToRequestId).',
    tables: ['agt_team_questions', 'agt_agents', 'agt_conversations', 'agt_messages', 'agt_integrations'],
    to: ['agt-equipo-enric']
  },
  {
    id: 'agt-equipo-enric',
    lane: 'Equipo',
    name: 'Lo que decide Enric y lo que se aprende',
    description:
      'Respuestas de IA general para aprobar y dudas escaladas llegan a Enric por el chat principal: ✅ Enviar · ✏️ Cambiar (dice qué y el jefe lo vuelve a analizar) · 📝 Responder yo · 🗑 Lo hablo yo. También en Agentes → Dudas del equipo. Cada respuesta suya o aprobada se envía a la persona y sale como propuesta de entrada para la base de conocimiento.',
    status: 'built',
    file: 'lib/agentes/team.ts',
    when: 'Al escalar o al proponer una respuesta de IA general; cuando Enric pulsa un botón o responde en la pantalla.',
    ai: 'Al pulsar «Cambiar», el jefe rehace la respuesta con la indicación de Enric (vuelve a Enric para aprobarla).',
    code: 'Botones x:tq:… registrados en el núcleo; los de Enric solo los acepta el dueño y los de la persona solo quien preguntó. Para aprender se guardan la primera propuesta, cada indicación de Enric con la versión anterior y la respuesta final; en dudas parecidas, el jefe recibe esos ejemplos (no se reentrena nada). Las dudas resueltas se vectorizan para casos_anteriores. Sección «Dudas del equipo» en el informe semanal (por fuente, escaladas, si sirvió, coste y temas que más cuestan).',
    tables: ['agt_team_questions', 'kb_articles']
  }
];
