import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  projects,
  seoClusterCompetitors,
  seoKickoffAnswers,
  seoKwClusterKeywords,
  seoKwClusters,
} from '@/lib/db/schema';
import type { ScrapedData } from './competitor-scraper';
import type { ProcessStep } from '@/lib/ai/clustering/pipeline';

// Keys reales de seo_kickoff_answers (confirmadas contra la BD — las que
// se asumieron originalmente, business_type/main_services/etc., no
// existen en ningún proyecto). El label es el nombre en español que ve el
// LLM en el prompt; kickoffAnswers se construye más abajo usando este
// label como clave del Record en vez de la key cruda de la BD, así que
// prompt.ts no necesita conocer estas keys — su formatKickoffAnswers()
// ya cae a `?? key` cuando no encuentra la key en su propio diccionario,
// y esa key ya es el label correcto.
const KICKOFF_LABELS: Record<string, string> = {
  servicio_rentable: 'Servicio principal',
  zona_geografica: 'Zona geográfica',
  competidores_directos: 'Competidores directos',
  competidores_posicionamiento: 'Referentes SEO',
  cliente_no_deseado: 'Cliente no deseado',
  estrategia_previa: 'Estrategia previa',
  redes_sociales: 'Redes sociales activas',
};
const KICKOFF_KEYS = Object.keys(KICKOFF_LABELS);

const MIN_COMPETITORS = 3;
const MAX_KEYWORDS = 10;
const MAX_FAQS = 5;
const MAX_H2S = 8;
const MAX_CTAS = 3;

export type AnalysisContextKeyword = {
  keyword: string;
  monthlyVolume: number | null;
  difficulty: number | null;
  isPrimary: boolean;
};

export type AnalysisContextCompetitor = {
  url: string;
  data: ScrapedData;
};

export type AnalysisContext = {
  project: { name: string; domain: string | null; location: string | null };
  kickoffAnswers: Record<string, string>;
  cluster: {
    title: string;
    targetUrl: string | null;
    difficulty: string | null;
    contentType: string | null;
  };
  keywords: AnalysisContextKeyword[];
  competitors: AnalysisContextCompetitor[];
};

export type BuildAnalysisContextResult =
  | { ok: true; context: AnalysisContext }
  | { ok: false; error: string };

// Mapa de arquitectura (Parte A) — mismo patrón que CLUSTERING_PROCESS_MAP
// en lib/ai/clustering/pipeline.ts, co-ubicado con el código real de este
// flujo. No vive en lib/seo/competitor-actions.ts (que orquesta los pasos
// saveCompetitorUrls → performScrape → generateCompetitorAnalysis) porque
// ese archivo lleva 'use server' — Next.js exige que un archivo así solo
// exporte funciones async, así que una constante como esta rompería el
// build. El parser real (lib/ai/parsers/competitor-analysis.ts) devuelve 3
// campos, no 5 "entregables" separados — recommendations (hasta 8,
// priorizadas), recommended_structure (hasta 5 secciones) y summary; la
// descripción del último paso refleja eso.
export const COMPETITOR_ANALYSIS_PROCESS_MAP: ProcessStep[] = [
  {
    id: 'competitor-urls',
    name: 'URLs de competidores',
    description: 'El usuario indica hasta 5 páginas de la competencia que ya posicionan para este cluster.',
    status: 'built',
    file: 'lib/seo/competitor-actions.ts',
  },
  {
    id: 'scraping',
    name: 'Extracción de contenido',
    description:
      'Descarga cada página y analiza su título, encabezados, preguntas frecuentes y llamadas a la acción.',
    status: 'built',
    file: 'lib/seo/competitor-scraper.ts',
  },
  {
    id: 'context-building',
    name: 'Construcción de contexto',
    description:
      'Combina lo extraído de la competencia con las keywords del cluster y las respuestas del kickoff del proyecto.',
    status: 'built',
    file: 'lib/seo/competitor-analysis-builder.ts',
  },
  {
    id: 'ai-analysis',
    name: 'Análisis con IA',
    description: 'La inteligencia artificial compara toda la competencia recopilada y redacta una guía de acción.',
    status: 'built',
    file: 'lib/seo/competitor-analysis-prompt.ts',
  },
  {
    id: 'actionable-guide',
    name: 'Guía accionable',
    description:
      'Recomendaciones priorizadas, estructura de contenido sugerida y un resumen ejecutivo, listos para el equipo.',
    status: 'built',
    file: 'lib/ai/parsers/competitor-analysis.ts',
  },
];

function truncateScrapedData(data: ScrapedData): ScrapedData {
  return {
    ...data,
    faqs: data.faqs.slice(0, MAX_FAQS),
    h2s: data.h2s.slice(0, MAX_H2S),
    ctaTexts: data.ctaTexts.slice(0, MAX_CTAS),
  };
}

export async function buildAnalysisContext(
  clusterId: string,
  tenantId: string
): Promise<BuildAnalysisContextResult> {
  const [cluster] = await db
    .select()
    .from(seoKwClusters)
    .where(eq(seoKwClusters.id, clusterId))
    .limit(1);

  if (!cluster) {
    return { ok: false, error: 'Cluster no encontrado' };
  }

  const [project] = await db
    .select({ name: projects.name, domain: projects.domain, location: projects.location })
    .from(projects)
    .where(eq(projects.id, cluster.projectId))
    .limit(1);

  if (!project) {
    return { ok: false, error: 'Proyecto no encontrado' };
  }

  const kickoffRows = await db
    .select({ questionKey: seoKickoffAnswers.questionKey, answer: seoKickoffAnswers.answer })
    .from(seoKickoffAnswers)
    .where(
      and(
        eq(seoKickoffAnswers.projectId, cluster.projectId),
        inArray(seoKickoffAnswers.questionKey, KICKOFF_KEYS)
      )
    );

  const kickoffAnswers: Record<string, string> = {};
  for (const row of kickoffRows) {
    if (row.answer) kickoffAnswers[KICKOFF_LABELS[row.questionKey] ?? row.questionKey] = row.answer;
  }

  const keywords = await db
    .select({
      keyword: seoKwClusterKeywords.keyword,
      monthlyVolume: seoKwClusterKeywords.monthlyVolume,
      difficulty: seoKwClusterKeywords.difficulty,
      isPrimary: seoKwClusterKeywords.isPrimary,
    })
    .from(seoKwClusterKeywords)
    .where(eq(seoKwClusterKeywords.clusterId, clusterId))
    .orderBy(desc(seoKwClusterKeywords.isPrimary), desc(seoKwClusterKeywords.monthlyVolume))
    .limit(MAX_KEYWORDS);

  const competitorRows = await db
    .select({ url: seoClusterCompetitors.url, rawScrapedData: seoClusterCompetitors.rawScrapedData })
    .from(seoClusterCompetitors)
    .where(
      and(
        eq(seoClusterCompetitors.clusterId, clusterId),
        eq(seoClusterCompetitors.tenantId, tenantId),
        eq(seoClusterCompetitors.scrapeStatus, 'done')
      )
    )
    .orderBy(seoClusterCompetitors.position);

  const competitors: AnalysisContextCompetitor[] = competitorRows
    .filter((row) => row.rawScrapedData !== null)
    .map((row) => ({
      url: row.url,
      data: truncateScrapedData(row.rawScrapedData as ScrapedData),
    }));

  if (competitors.length < MIN_COMPETITORS) {
    return {
      ok: false,
      error:
        'Necesitas al menos 3 competidores analizados para generar el análisis. Espera a que termine el scraping.',
    };
  }

  return {
    ok: true,
    context: {
      project,
      kickoffAnswers,
      cluster: {
        title: cluster.title,
        targetUrl: cluster.targetUrl,
        difficulty: cluster.difficulty,
        // No hay una columna "strategy_badge" en seo_kw_clusters — el campo
        // más cercano al "badge estratégico" del cluster es content_type
        // (landing_transaccional, articulo_pilar...), que es lo que
        // cluster-card.tsx ya muestra como badge principal.
        contentType: cluster.contentType,
      },
      keywords,
      competitors,
    },
  };
}
