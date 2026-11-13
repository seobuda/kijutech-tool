import { getSeoManifest } from '@/lib/seo/manifest';
import { CLUSTERING_PROCESS_MAP, type ProcessStep, type TechnicalDetail } from '@/lib/ai/clustering/pipeline';
import { COMPETITOR_ANALYSIS_PROCESS_MAP } from '@/lib/seo/competitor-analysis-builder';
import { OPS_MAPS } from '@/lib/operaciones/process-map';
import { SECURITY_PROCESS_MAP } from '@/lib/auth/security-process-map';
import { AGENTES_PROCESS_MAP } from '@/lib/agentes/process-map';
import { CLIENTES_PROCESS_MAP } from '@/lib/core/clients-process-map';

export interface SystemNode {
  id: string;
  name: string;
  description: string;
  status: 'built' | 'in_progress' | 'planned';
  icon: string; // nombre de icono lucide-react, resuelto en el cliente
  detailMapId?: string; // si existe, este nodo abre un diagrama de nivel 2
  // Fila visual en el nivel 1. 'infrastructure' = pilares del sistema
  // (persisten siempre, no son parte de la secuencia de ningún proyecto);
  // 'support' = procesos reales pero auxiliares, invocados desde dentro
  // del flujo en vez de ser un paso propio de él; 'flow' = etapas
  // secuenciales del wizard SEO (derivadas de modules/seo/manifest.json).
  // 'future' = pendientes en gris (todavía sin construir).
  group: 'infrastructure' | 'support' | 'flow' | 'future';
  technicalDetail?: TechnicalDetail;
  // Conexiones visuales extra (línea discontinua) hacia otros nodos del mismo nivel.
  edgesTo?: { id: string; label: string }[];
}

// Infraestructura núcleo real (no son etapas del wizard SEO, así que no
// viven en modules/seo/manifest.json).
const CORE_NODES: SystemNode[] = [
  {
    id: 'core-security',
    name: 'Seguridad',
    description:
      'Quién entra y qué puede hacer: inicio de sesión sin registro público, permisos por rol comprobados en el servidor, secretos fuera del código y pruebas automáticas.',
    status: 'built',
    icon: 'Shield',
    detailMapId: 'security',
    group: 'infrastructure',
    technicalDetail: {
      summary:
        'Defensa en capas: sesión firmada, límite de intentos, permisos por rol en cada acción y ruta de API, aislamiento entre cuentas, tokens enmascarados, secretos en .env, cabeceras de seguridad y una batería de pruebas (pnpm test) que falla si alguna capa se rompe.',
      stack: ['JWT (jose) + bcryptjs', 'Roles: lector, editor, admin, super_admin', 'Vitest'],
    },
  },
  {
    id: 'core-projects',
    name: 'Proyectos y Núcleo',
    description: 'La base del sistema: tenants, usuarios, roles y proyectos. Todo lo demás se construye sobre esto.',
    status: 'built',
    icon: 'FolderKanban',
    group: 'infrastructure',
  },
  {
    id: 'core-clientes',
    name: 'Clientes',
    description:
      'La ficha completa de cada cliente (núcleo): empresa y negocio, contactos y locales, webs y cuentas con su acceso, competencia, memoria y estado. La usan Operaciones, los agentes y SEO.',
    status: 'built',
    icon: 'Building2',
    detailMapId: 'clientes',
    group: 'infrastructure',
    technicalDetail: {
      summary:
        'Tablas del núcleo clients, client_contacts, client_locations, client_assets, client_competitors y client_memory (14 nov 2026, migración 0048). Operaciones guarda sus ajustes en ops_clients con el mismo id. Sección propia /dashboard/clientes con pestañas.',
      stack: ['lib/core/clients.ts (datos)', 'lib/core/client-rules.ts (reglas puras y completitud)', 'lib/core/client-actions.ts (acciones con permisos)'],
      keyDecisions: ['Cliente ≠ activo ≠ integración (patrón Semrush/AgencyAnalytics)', 'Mismo id que ops_clients: ninguna referencia se reescribió', 'Nunca contraseñas; contrato solo para administradores']
    },
  },
  {
    id: 'ai-gateway',
    name: 'Motor de IA',
    description:
      'El punto único por el que pasan todas las llamadas a modelos de IA, con control de coste y del proveedor activo.',
    status: 'built',
    icon: 'Sparkles',
    group: 'infrastructure',
    technicalDetail: {
      summary:
        'Punto único de entrada para toda llamada a un modelo de IA — resuelve qué proveedor y clave usar, cifra/descifra las claves, aplica timeout y calcula el coste.',
      stack: [
        '4 adaptadores: Anthropic, OpenAI, Gemini, DeepSeek',
        'AES-256-GCM para las claves (crypto nativo de Node)',
        'Tabla ai_jobs — tracking de cada llamada',
      ],
      keyDecisions: [
        'Timeout de 60s por llamada',
        'max_tokens configurable por llamada — antes cada adapter traía un límite fijo (4096 en Anthropic)',
        'Nunca loguea la clave descifrada',
      ],
    },
  },
  {
    id: 'brain-panel',
    name: 'Panel del Cerebro',
    description: 'Muestra cuánto ha aprendido el sistema con el uso y cuánto se gasta en IA cada mes.',
    status: 'built',
    icon: 'Brain',
    group: 'infrastructure',
    technicalDetail: {
      summary:
        'Panel de solo lectura sobre lo que el sistema ha aprendido con el uso (modificadores de intención, ejemplos de clustering validados, feedback) y cuánto se gasta en IA, desglosado por función.',
      stack: ['Queries de solo lectura sobre ai_intent_modifiers, ai_clustering_examples, ai_clustering_feedback, ai_jobs'],
      keyDecisions: [
        'Umbrales mostrados: 200 modificadores de intención, 50 ejemplos de clustering — el RAG real ya se activa automáticamente a partir de 5 ejemplos, un umbral técnico distinto y más bajo que el mostrado en el panel',
        'El botón "Activar" del pre-filtrado automático es un placeholder, todavía sin lógica real',
      ],
    },
  },
  {
    id: 'admin-seo',
    name: 'Admin SEO',
    description: 'Gestión de las tarjetas y la configuración propias del módulo SEO.',
    status: 'built',
    icon: 'BookOpen',
    group: 'infrastructure',
  },
  {
    id: 'operaciones',
    name: 'Operaciones',
    description:
      'Del texto suelto a la tarea completada: Bloc con IA, envío fiable a ClickUp, avisos y botones por Telegram, vigilancia de ClickUp, resúmenes, alertas de clientes y panel de Automatizaciones.',
    status: 'built',
    icon: 'FolderKanban',
    detailMapId: 'ops',
    group: 'infrastructure',
    edgesTo: [
      { id: 'future-subagentes', label: 'revisor intercambiable (reviewers.ts)' },
      { id: 'agentes', label: 'herramientas y canales por el registro del núcleo' }
    ],
    technicalDetail: {
      summary:
        'Módulo aparte del SEO. Un bloc de notas (texto o audio) que la IA convierte en encargos con cliente, responsable, fecha y lista; el envío a ClickUp es fiable (sin duplicados); el equipo trabaja desde botones de Telegram; el sistema vigila ClickUp, manda recordatorios y resúmenes y avisa de clientes sin actividad. Todo se ajusta desde el panel de Automatizaciones.',
      stack: ['API v2 de ClickUp (fetch nativo)', 'Bot de Telegram (long polling dentro del contenedor)', 'callAI() — pasarela de IA con prompts editables', 'Tablas ops_* (mapa detallado en el nivel siguiente)'],
      keyDecisions: [
        'Las decisiones las toma el código siempre que se pueda; la IA solo propone, transcribe o hace el triaje de bloqueos',
        'Una conexión por tenant; el token nunca sale del servidor',
        'Todas las llamadas a ClickUp pasan por un cliente con contador por minuto y caché',
        'Un solo proceso escucha el bot (candado de PostgreSQL)',
      ],
    },
  },
  {
    id: 'agentes',
    name: 'Agentes',
    description:
      'Agentes con rol con los que se habla por Telegram (texto y audio) o correo: consultan, proponen acciones con botones y encargan trabajos a subagentes (Revisor web). Integraciones: DataForSEO, Clarity y Google.',
    status: 'built',
    icon: 'Bot',
    detailMapId: 'agentes',
    group: 'infrastructure',
    technicalDetail: {
      summary:
        'Módulo propio (tablas agt_*). No importa otros módulos: usa el registro de capacidades del núcleo (lib/core/capabilities.ts), donde cada módulo publica sus herramientas y sus canales; lib/app-wiring.ts los conecta al arrancar.',
      stack: ['SDK oficial de Anthropic (@anthropic-ai/sdk) con uso de herramientas', 'Lectura web y búsqueda de Anthropic (herramientas de servidor)', 'OpenAI para la voz (transcripción y voz)', 'Integraciones por API (DataForSEO, Clarity, Google OAuth)'],
      keyDecisions: [
        'Las acciones que cambian algo se proponen con botones (motor de acciones) y la autonomía sube por herramienta con datos',
        'Contexto corto: resumen + últimos mensajes, para que cada mensaje cueste poco',
        'El webhook de Telegram responde al momento y el agente trabaja en segundo plano (sin respuestas duplicadas)',
        'Credenciales cifradas; lo que llega de webs y correos es dato, nunca instrucción'
      ]
    }
  },
  {
    id: 'integraciones',
    name: 'Integraciones',
    description: 'Las conexiones con el exterior: ClickUp (caché y contador de peticiones), Telegram y la IA, con el prompt que usa cada función.',
    status: 'built',
    icon: 'Sparkles',
    detailMapId: 'ops_integrations',
    group: 'infrastructure',
  },
];


// Pendientes (en gris): todavía sin construir. Cada uno con una frase de qué será.
const FUTURE_NODES: SystemNode[] = [
  { id: 'future-servidor', name: 'Servidor', status: 'in_progress', icon: 'Circle', group: 'future', description: 'En marcha desde el 5 nov en brain.kijutech.com (DigitalOcean, HTTPS automático, base de datos limpia, secretos nuevos, copia diaria y snapshots). Telegram ya recibe por webhook (verificado el 6 nov). Falta: sacar las copias fuera de DigitalOcean (NAS y Google Drive), CSP con nonce y, más adelante, el proxy de Cloudflare.' },
  { id: 'future-jornada', name: 'Jornada real', status: 'built', icon: 'Circle', group: 'future', description: 'Construido (paso 5A): entrada al empezar una tarea desde Telegram, descansos con cupo, comida, salidas con motivo, cierre automático, avisos retenidos y pestaña Equipo → Jornada. Detalle en el mapa de Operaciones → Jornada real.' },
  { id: 'future-tiempos', name: 'Tiempos por tarea', status: 'built', icon: 'Circle', group: 'future', description: 'Construido (paso 5B): una tarea activa a la vez (las pausas no cuentan), estimación propia de un toque con feedback de precisión, margen editable por tipo con propuesta a partir de lo real, motivo y URL si se pasa, pestaña Equipo → Tiempos y Mi panel. Detalle en el mapa de Operaciones → Tiempos de tarea.' },
  { id: 'future-juego', name: 'Temporadas, niveles y misiones', status: 'planned', icon: 'Circle', group: 'future', description: 'Paso 5C: puntos por resultado (a tiempo, calidad, precisión, jornada), niveles por especialidad, rachas con comodines, misión semanal, objetivo de equipo, sin ranking, y bonus progresivo por temporadas trimestrales. Diseño en docs/DISENO-RENDIMIENTO-EQUIPO.md.' },
  { id: 'future-niveles', name: 'Niveles y recompensas', status: 'planned', icon: 'Circle', group: 'future', description: 'Progreso visible, carreras con formaciones desbloqueables y bonos mensuales que se pueden perder, con un salario base que solo sube.' },
  { id: 'future-subagentes', name: 'Subagentes por área', status: 'built', icon: 'Circle', group: 'future', description: 'Agentes de IA por área o por cliente que revisan el trabajo antes que tú, con su ficha y su criterio (por ejemplo, redacción con el tono de cada cliente o diseño web con tu criterio). Se enchufan como revisor intercambiable.' },
  { id: 'future-diccionario', name: 'Diccionario de la agencia', status: 'planned', icon: 'Circle', group: 'future', description: 'Herramientas, clientes y personas, más los errores de tu dictado por voz. En parte ya lo cubren los nombres alternativos de las fichas de clientes.' },
  { id: 'future-audio-telegram', name: 'Audios al bot de Telegram', status: 'built', icon: 'Circle', group: 'future', description: 'Construido (13 nov): se habla con el agente principal por audio y contesta también con voz. Ver el módulo Agentes.' },
  { id: 'future-email', name: 'Entrada de trabajo por email', status: 'planned', icon: 'Circle', group: 'future', description: 'Reenviar un email a una dirección propia para que se convierta en una nota y, de ahí, en encargos.' },
  { id: 'future-reglas', name: 'Reglas que aprenden de mis respuestas', status: 'planned', icon: 'Circle', group: 'future', description: 'Reglas de decisión que se aprenden de cómo respondes a bloqueos y revisiones, para que el agente resuelva más solo.' },
  { id: 'future-seo-auto', name: 'SEO automatizado', status: 'planned', icon: 'Circle', group: 'future', description: 'Auditoría por API, competidores desde la SERP y volúmenes de búsqueda con DataForSEO, sin cargas manuales.' },
  { id: 'future-deuda', name: 'Deuda técnica', status: 'planned', icon: 'Circle', group: 'future', detailMapId: 'tech_debt', description: 'Columnas obsoletas por borrar, datos y tareas de prueba, festivos en los días laborables y textos de «Respuesta» y «Devuelto» fijos en el código.' },
];

// Procesos de apoyo: funcionalidad real con su propio detailMapId, pero
// no es una etapa del manifest — se invoca desde dentro de un paso del
// flujo (aquí, desde un cluster ya creado en "Keyword Research", paso 4),
// no como paso propio y secuencial del wizard. Se muestra en su propia
// fila para no confundirla con los pilares de infraestructura.
const SUPPORT_NODES: SystemNode[] = [
  {
    id: 'competitor-analysis',
    name: 'Análisis de Competidores',
    description:
      'Compara automáticamente un cluster de keywords con las páginas de la competencia que ya posicionan y genera una guía de acción.',
    status: 'built',
    icon: 'Target',
    detailMapId: 'competitor_analysis',
    group: 'support',
    technicalDetail: {
      summary:
        'Compara automáticamente hasta 5 páginas de competidores ya posicionadas, extrayendo su estructura con regex (sin librerías de parseo HTML) y pasando ese contexto a un LLM para generar recomendaciones. Ver el detalle paso a paso para cada capa.',
      stack: ['fetch() nativo + parsing por regex (sin cheerio/jsdom)'],
      keyDecisions: [
        'Mínimo 3 competidores con scraping completado (scrape_status = "done") para poder generar el análisis',
        'Contexto truncado (máx. 10 keywords, 5 FAQs, 8 H2s, 3 CTAs por competidor) para controlar el tamaño del prompt',
      ],
    },
  },
];

// Etapas del wizard SEO que ya tienen pantalla propia funcionando —
// cualquier otra etapa del manifest se muestra como 'planned'. Es una
// lista a mano porque "¿tiene página construida?" no es algo derivable
// del manifest.json en sí (el manifest no distingue construido de
// planeado, solo declara el orden del wizard).
const BUILT_STAGE_KEYS = new Set(['onboarding', 'kickoff', 'audit', 'keyword_research']);

const STAGE_ICONS: Record<string, string> = {
  onboarding: 'Rocket',
  kickoff: 'Flag',
  audit: 'Stethoscope',
  keyword_research: 'Search',
  strategy: 'Map',
  execution: 'Hammer',
  reporting: 'BarChart3',
  notebooklm: 'NotebookText',
};

const STAGE_DESCRIPTIONS: Record<string, string> = {
  onboarding: 'Primer contacto con el cliente: mide dónde está hoy antes de empezar a trabajar.',
  kickoff: 'Recoge la información de negocio necesaria para diseñar la estrategia.',
  audit: 'Radiografía inicial del sitio web: qué funciona y qué hay que arreglar primero.',
  keyword_research: 'Busca, agrupa y prioriza las palabras clave que van a guiar el contenido del proyecto.',
  strategy: 'Convierte los clusters de keywords en un plan de contenido priorizado.',
  execution: 'Seguimiento de la creación real del contenido planificado.',
  reporting: 'Informes periódicos de resultados para el cliente.',
  notebooklm: 'Exporta el conocimiento del proyecto para consulta rápida.',
};

export function getSystemMap(): SystemNode[] {
  const manifest = getSeoManifest();

  const stageNodes: SystemNode[] = [...manifest.stages]
    .sort((a, b) => a.order - b.order)
    .map((stage) => ({
      id: stage.key,
      name: stage.name,
      description: STAGE_DESCRIPTIONS[stage.key] ?? stage.name,
      status: BUILT_STAGE_KEYS.has(stage.key) ? 'built' : 'planned',
      icon: STAGE_ICONS[stage.key] ?? 'Circle',
      group: 'flow' as const,
      ...(stage.key === 'keyword_research' ? { detailMapId: 'clustering' } : {}),
    }));

  return [...CORE_NODES, ...SUPPORT_NODES, ...stageNodes, ...FUTURE_NODES];
}

// Todos los mapas de detalle conocidos (el Server Component los resuelve y los pasa al cliente).
export const PROCESS_MAP_IDS = ['clustering', 'competitor_analysis', 'security', 'agentes', 'clientes', ...Object.keys(OPS_MAPS)];

export function getProcessMap(detailMapId: string): ProcessStep[] {
  switch (detailMapId) {
    case 'clustering':
      return CLUSTERING_PROCESS_MAP;
    case 'competitor_analysis':
      return COMPETITOR_ANALYSIS_PROCESS_MAP;
    case 'security':
      return SECURITY_PROCESS_MAP;
    case 'agentes':
      return AGENTES_PROCESS_MAP;
    case 'clientes':
      return CLIENTES_PROCESS_MAP;
    default:
      return OPS_MAPS[detailMapId] ?? [];
  }
}
