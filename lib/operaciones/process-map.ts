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
      'La IA lee la nota y propone uno o varios encargos, cada uno con lista del espacio, responsable, fecha y prioridad. Lo que no es un encargo se lista aparte.',
    status: 'built',
    file: 'lib/operaciones/note-actions.ts',
    technicalDetail: {
      summary:
        'Una llamada a la IA con el prompt editable ops_note_to_requests. Se le pasan las listas reales del espacio y los miembros; el servidor descarta cualquier id de lista que no exista.',
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
      'Se crea la tarea con su descripción, responsable, fecha (sin hora) y prioridad. La descripción lleva la marca [kiju:ID].',
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
];
