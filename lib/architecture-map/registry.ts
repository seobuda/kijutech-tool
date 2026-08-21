import { getSeoManifest } from '@/lib/seo/manifest';
import { CLUSTERING_PROCESS_MAP, type ProcessStep, type TechnicalDetail } from '@/lib/ai/clustering/pipeline';
import { COMPETITOR_ANALYSIS_PROCESS_MAP } from '@/lib/seo/competitor-analysis-builder';

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
  group: 'infrastructure' | 'support' | 'flow';
  technicalDetail?: TechnicalDetail;
}

// Infraestructura núcleo real (no son etapas del wizard SEO, así que no
// viven en modules/seo/manifest.json).
const CORE_NODES: SystemNode[] = [
  {
    id: 'core-projects',
    name: 'Proyectos y Núcleo',
    description: 'La base del sistema: tenants, usuarios, roles y proyectos. Todo lo demás se construye sobre esto.',
    status: 'built',
    icon: 'FolderKanban',
    group: 'infrastructure',
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

  return [...CORE_NODES, ...SUPPORT_NODES, ...stageNodes];
}

export function getProcessMap(detailMapId: string): ProcessStep[] {
  switch (detailMapId) {
    case 'clustering':
      return CLUSTERING_PROCESS_MAP;
    case 'competitor_analysis':
      return COMPETITOR_ANALYSIS_PROCESS_MAP;
    default:
      return [];
  }
}
