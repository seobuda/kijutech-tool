import type { ProcessStep } from '@/lib/ai/clustering/pipeline';

// Mapa del proceso "crear encargo → tarea en ClickUp". Vive aquí y no junto a
// syncToClickUp() (request-actions.ts) porque los archivos 'use server' solo
// pueden exportar funciones async.
export const OPS_REQUEST_PROCESS_MAP: ProcessStep[] = [
  {
    id: 'ops-note',
    name: 'Bloc de notas (escribir o dictar)',
    description:
      'Se escribe o se dicta una nota libre, con espacio de ClickUp y responsable. Se autoguarda cada pocos segundos y sobrevive a cerrar el navegador.',
    status: 'built',
    file: 'lib/operaciones/note-actions.ts',
    technicalDetail: {
      summary:
        'Tabla ops_notes (borrador / convertida). El audio se graba en el navegador (MediaRecorder), se guarda en ops_note_audios y se transcribe con Gemini; el texto se añade a la nota.',
      stack: ['MediaRecorder (navegador)', 'Gemini generateContent con audio en línea', 'Tablas ops_notes y ops_note_audios'],
      keyDecisions: [
        'El audio se guarda en la base de datos y SIEMPRE antes de transcribir: si la transcripción falla, no se pierde',
        'El modelo de transcripción es configurable (ops_settings) — gemini-2.5-flash ya no está disponible para claves nuevas',
        'Máximo 10 minutos por grabación',
      ],
    },
  },
  {
    id: 'ops-convert',
    name: 'Convertir nota en encargos (IA)',
    description:
      'La IA lee la nota y propone uno o varios encargos, cada uno con lista del espacio, responsable, cliente, fecha y prioridad. Lo que no es un encargo se lista aparte.',
    status: 'built',
    file: 'lib/operaciones/note-actions.ts',
    technicalDetail: {
      summary:
        'Una llamada a la IA con el prompt editable ops_note_to_requests. Se le pasan las listas reales del espacio y los miembros; el servidor descarta cualquier id de lista que no exista. El cliente se elige SOLO entre las opciones reales del campo personalizado "Cliente" de la lista de destino (caché ops_clickup_fields); si no coincide exactamente con una opción, queda vacío y la tarjeta avisa.',
      stack: ['callAI() — pasarela de IA', 'Prompt en ai_prompts (editable)', 'zod'],
      keyDecisions: [
        'Devuelve también no_convertido, que se muestra bajo las tarjetas para que nada se pierda',
        'La propuesta se guarda en la nota (jsonb) para sobrevivir a una recarga',
      ],
    },
  },
  {
    id: 'ops-prepare',
    name: 'Preparar con IA (encargo suelto, opcional)',
    description:
      'Convierte la petición escrita deprisa en un encargo claro: título, resultado esperado, pasos, criterios de aceptación y datos que faltan. Tú lo editas antes de enviar.',
    status: 'built',
    file: 'lib/operaciones/request-actions.ts',
    technicalDetail: {
      summary:
        'Una llamada a la IA con el prompt editable ops_prepare_request. Cada llamada queda registrada en ai_jobs.',
      stack: ['callAI() — pasarela de IA', 'Prompt en ai_prompts (editable)', 'zod para validar el JSON'],
      keyDecisions: [
        'Si no se usa, la descripción de la tarea es la petición original',
        'No inventa datos: lo que falta sale como preguntas en "Datos que faltan"',
      ],
    },
  },
  {
    id: 'ops-save',
    name: 'Guardar como pendiente',
    description: 'El encargo se guarda siempre primero en la base de datos, antes de hablar con ClickUp.',
    status: 'built',
    file: 'lib/operaciones/request-actions.ts',
    technicalDetail: {
      summary: 'Fila en ops_requests con estado pendiente_clickup. Así nunca se pierde un encargo aunque ClickUp falle.',
      stack: ['Tabla ops_requests'],
    },
  },
  {
    id: 'ops-create',
    name: 'Crear la tarea en ClickUp',
    description:
      'Se crea la tarea con su descripción, responsable, fecha (sin hora), prioridad y el campo personalizado Cliente (si la lista lo tiene). La descripción lleva la marca [kiju:ID].',
    status: 'built',
    file: 'lib/operaciones/clickup.ts',
    technicalDetail: {
      summary: 'POST /list/{id}/task con markdown_description y due_date_time=false.',
      stack: ['API v2 de ClickUp'],
    },
  },
  {
    id: 'ops-confirm',
    name: 'Confirmar o reintentar',
    description:
      'Si el encargo viene de una nota con audio, se adjunta a la tarea. Si ClickUp confirma, el encargo pasa a "creado". Si falla, queda en "error_sync" con el motivo y un botón Reintentar.',
    status: 'built',
    file: 'lib/operaciones/request-actions.ts',
    technicalDetail: {
      summary:
        'Antes de crear nada en un reintento se busca en la lista una tarea con la marca [kiju:ID]; si existe se enlaza en vez de duplicarla.',
      stack: ['Índice único parcial sobre clickup_task_id'],
      keyDecisions: ['Fallo simulable solo en desarrollo (OPS_SIMULATE_FAILURE o /tmp/ops-simulate-failure)'],
    },
  },
  {
    id: 'ops-telegram-notify',
    name: 'Aviso por Telegram',
    description:
      'Cuando ClickUp confirma la tarea, el responsable recibe en Telegram el título, la lista, la fecha de entrega (en su zona horaria), un resumen y el enlace, con los botones "▶️ Empezar ahora" y "🕐 Más tarde" (después, Bloqueado / Hecho / Hecho, ¿lo revisas?). En modo pruebas todo llega al dueño indicando a quién iba.',
    status: 'built',
    file: 'lib/operaciones/notifications.ts',
    technicalDetail: {
      summary:
        'Cada aviso es una fila de ops_notifications (pendiente / enviado / fallido) con clave única: nunca se envía dos veces. Los fallidos se reintentan con espera creciente (6 intentos). El resumen diario sale a la hora de entrada de cada persona, en su zona, de lunes a viernes, reutilizando la consulta de "Equipo hoy".',
      stack: ['API de Bots de Telegram (fetch)', 'Tabla ops_notifications', 'instrumentation.ts: escucha y planificador dentro del contenedor'],
      keyDecisions: [
        'Escucha por consulta periódica (long polling) en local; ruta /api/telegram/webhook preparada para un servidor',
        'Un candado de PostgreSQL asegura un solo proceso escuchando; un 409 de Telegram se muestra en Ajustes',
        'Chats no vinculados se ignoran; los códigos de vinculación sirven una sola vez; los botones solo cuentan desde el chat del responsable',
      ],
    },
  },
  {
    id: 'ops-workflow',
    name: 'El equipo responde desde Telegram',
    description:
      'El aviso de cada encargo lleva los botones Empezar, Bloqueado, Hecho y «Hecho, ¿lo revisas?». Cada pulsación cambia el estado de la tarea en ClickUp (o deja un comentario si la lista no tiene ese estado) y se registra con persona, encargo y hora exacta.',
    status: 'built',
    file: 'lib/operaciones/workflow.ts',
    technicalDetail: {
      summary:
        'Máquina de estados atómica: asignado → en_curso → (bloqueado) → en_revision → completado, con «devuelto» que vuelve a en curso. Los cambios en ClickUp van a una bandeja de salida (ops_clickup_outbox) con reintentos. La correspondencia con los estados de cada lista (ops_status_map) se propone por nombre y se edita en Ajustes.',
      stack: ['Tablas ops_status_map, ops_clickup_outbox, ops_request_events, ops_telegram_pending', 'Cliente de ClickUp con contador de peticiones'],
      keyDecisions: [
        'Pulsar dos veces un botón no repite nada (transición condicionada al estado de origen)',
        'Solo el responsable (o el dueño en modo pruebas) puede usar los botones de su encargo; Aceptar, Devolver y Responder solo el dueño',
        'Cada acción queda en ops_request_events para medir rendimiento más adelante',
      ],
    },
  },
  {
    id: 'ops-review',
    name: 'Revisión con revisor intercambiable',
    description:
      'Si el encargo requiere revisión (casilla en la revisión de la nota y en Nuevo encargo), «Hecho» pasa a «en revisión» y le llega al revisor con Aceptar (completa la tarea) o Devolver (pide motivo, vuelve a en curso y la persona lo recibe).',
    status: 'built',
    file: 'lib/operaciones/reviewers.ts',
    technicalDetail: {
      summary:
        'Cada encargo guarda un reviewer_key (hoy: owner o ninguno). Los revisores se registran en reviewers.ts con una sola función, requestReview(); un revisor automático futuro (por tipo de trabajo o por cliente) solo tendrá que llamar a acceptWork() o returnWork().',
      stack: ['reviewers.ts', 'Tipos de trabajo editables (ops_work_types)'],
    },
  },
  {
    id: 'ops-blockers',
    name: 'Bloqueos: el agente responde o lo escala',
    description:
      'Al pulsar Bloqueado, el bot pregunta qué necesita (texto o captura). La IA revisa la tarea, su descripción, la nota original y los comentarios: si la respuesta está ahí, responde a la persona citando la fuente; si no, te llega resumido con opciones y recomendación, y tu respuesta le llega a la persona y queda como comentario en ClickUp.',
    status: 'built',
    file: 'lib/operaciones/blockers.ts',
    technicalDetail: {
      summary:
        'Una llamada a la IA con el prompt editable ops_blocker_triage. Solo responde sola si devuelve la respuesta Y la fuente; con cualquier duda escala. Una captura sin texto va directa al dueño.',
      stack: ['callAI() — pasarela de IA', 'Prompt en ai_prompts (editable)', 'Tabla ops_blockers'],
    },
  },
  {
    id: 'ops-firewall',
    name: 'Cortafuegos de avisos y Mi bandeja',
    description:
      'Al dueño solo le llegan al instante los bloqueos y las revisiones de encargos urgentes. Todo lo demás va agrupado en dos resúmenes al día (13:00 y 18:00, hora de Madrid, configurables) y en la pestaña «Mi bandeja», ordenado por tiempo de espera.',
    status: 'built',
    file: 'lib/operaciones/digest.ts',
    technicalDetail: {
      summary:
        'El resumen se inserta primero con clave única (fecha y hora) para no duplicarse; si el servidor estuvo apagado a esa hora se envía hasta 3 h después. «Mi bandeja» se calcula del estado actual (encargos en revisión y bloqueos escalados), sin tabla propia.',
      stack: ['ops_notifications (kind digest)', 'inbox.ts'],
    },
  },
  {
    id: 'ops-team-profiles',
    name: 'Equipo: fichas y responsable propuesto',
    description:
      'Cada persona tiene una ficha (puesto, descripción, tipos de trabajo como función principal o de apoyo, horario y zona horaria). Al convertir una nota sin responsable, la IA propone a quien tiene ese tipo de trabajo como principal y explica por qué en una línea; tú puedes cambiarlo.',
    status: 'built',
    file: 'lib/operaciones/team-profiles.ts',
    technicalDetail: {
      summary:
        'Las fichas (ops_team_profiles y ops_team_profile_work_types) son la única fuente de zona horaria, hora de entrada y días laborables: los resúmenes de Telegram las leen de ahí. Las fichas activas con miembro de ClickUp se añaden al mismo prompt de conversión de notas (sin llamada extra a la IA). «Rellenar con IA» propone los campos de una ficha desde un texto o un audio y nunca guarda por su cuenta.',
      stack: ['Tablas ops_team_profiles y ops_team_profile_work_types', 'callAI() con prompts ops_note_to_requests y ops_profile_fill', 'Gemini para transcribir el audio'],
      keyDecisions: [
        'La IA solo propone a personas con ficha activa y miembro de ClickUp vinculado',
        'Un responsable elegido por ti en la nota manda sobre la propuesta',
        'La ficha lleva user_id para que más adelante cada miembro vea la suya (hoy solo la ve quien lleva las operaciones)',
      ],
    },
  },
  {
    id: 'ops-clients',
    name: 'Clientes: fichas, plazo y responsable habitual',
    description:
      'Cada cliente tiene una ficha (nombres alternativos, nivel y plazo, servicios con su responsable habitual, listas habituales, negocio y estrategia). Al convertir una nota, el agente reconoce al cliente por sus alias, propone la fecha según su plazo en días laborables y el responsable habitual del servicio, y rellena el campo Cliente de ClickUp.',
    status: 'built',
    file: 'lib/operaciones/clients.ts',
    technicalDetail: {
      summary:
        'La IA identifica (cliente por alias, servicio y lista) en la misma llamada de la conversión; el código decide: busca el cliente por nombre o alias si la IA no acierta, calcula la fecha contando días laborables y aplica el responsable. Prioridad del responsable: tarea propia → elegido o nombrado en la nota → habitual del cliente para ese servicio → propuesta por las fichas del Equipo. «Rellenar con IA» propone los campos de una ficha desde un texto o un audio y nunca guarda por su cuenta.',
      stack: ['Tablas ops_clients, ops_client_services, ops_client_levels y ops_services', 'callAI() con prompts ops_note_to_requests (v6) y ops_client_fill', 'Gemini para transcribir el audio'],
      keyDecisions: [
        'Niveles y servicios son tablas editables; se validan en el código, no con restricciones fijas',
        'La fecha no la calcula la IA: se cuentan días laborables desde hoy (los festivos no se tienen en cuenta)',
        'Un cliente desactivado se sigue reconociendo, pero la tarjeta de revisión muestra un aviso ámbar',
        'Una ficha con encargos no se puede borrar, solo desactivar',
        'En webs y herramientas no se guardan contraseñas',
      ],
    },
  },
  {
    id: 'ops-clickup-watch',
    name: 'Tareas de ClickUp en el circuito y recordatorios',
    description:
      'Cada 2-3 minutos se consulta ClickUp (una sola petición de workspace): una tarea creada o asignada allí a alguien con Telegram vinculado se convierte en encargo espejo y recibe el aviso con botones; si se cierra en ClickUp, el encargo se completa; si se reasigna, el aviso pasa a la nueva persona. Un recordatorio único si nadie empieza en 2 horas laborables.',
    status: 'built',
    file: 'lib/operaciones/watch.ts',
    technicalDetail: {
      summary:
        'Sin webhooks: el planificador (30 s) llama a runWatch, que se limita a una pasada cada ~2,5 min con date_updated_gt y un cursor guardado. Las decisiones son del código: marca [kiju:] = nuestra; tarea nueva (creada tras activar) o recién asignada (comparada con su instantánea) = espejo; el creador no se avisa a sí mismo; lo anterior a la activación solo se anota. Los recordatorios usan el horario de la ficha del Equipo; lo que sigue sin respuesta al terminar la jornada sale una vez en el primer resumen del dueño.',
      stack: ['Tablas ops_clickup_watch y ops_clickup_task_snapshots', 'ops_requests.origin / candidate_ids / reminded_at', 'Cliente de clickup.ts con contador de peticiones', 'ops_notifications (aviso y recordatorio con clave única)'],
      keyDecisions: [
        'Quien pulsa Empezar entre varios responsables avisados queda como responsable principal',
        'Quien pulsa «Más tarde» no recibe el recordatorio de 2 h, pero sí uno si vence hoy y pasa la mitad de su jornada',
        'Exige Telegram vinculado (en modo pruebas basta ser miembro de ClickUp)',
        'El cliente del encargo espejo se copia del campo Cliente de la tarea',
      ],
    },
  },
];
