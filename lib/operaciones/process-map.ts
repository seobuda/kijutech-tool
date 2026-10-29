import type { ProcessStep } from '@/lib/ai/clustering/pipeline';

// Mapa del proceso "crear encargo → tarea en ClickUp". Vive aquí y no junto a
// syncToClickUp() (request-actions.ts) porque los archivos 'use server' solo
// pueden exportar funciones async.
export const OPS_REQUEST_PROCESS_MAP: ProcessStep[] = [
  {
    id: 'ops-prepare',
    name: 'Preparar con IA (opcional)',
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
      'Si ClickUp confirma, se guarda el id y la URL y el encargo pasa a "creado". Si falla, queda en "error_sync" con el motivo y un botón Reintentar.',
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
