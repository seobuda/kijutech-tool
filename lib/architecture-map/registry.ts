import { getSeoManifest } from '@/lib/seo/manifest';
import { CLUSTERING_PROCESS_MAP, type ProcessStep } from '@/lib/ai/clustering/pipeline';
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
  },
  {
    id: 'brain-panel',
    name: 'Panel del Cerebro',
    description: 'Muestra cuánto ha aprendido el sistema con el uso y cuánto se gasta en IA cada mes.',
    status: 'built',
    icon: 'Brain',
    group: 'infrastructure',
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
