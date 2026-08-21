import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  seoClusterContentPlan,
  seoClusterCompetitors,
  seoKwClusterKeywords,
  seoKwClusters,
  type SeoClusterContentPlan,
} from '@/lib/db/schema';
import type { ScrapedData } from './competitor-scraper';

export async function getContentPlan(clusterId: string, tenantId: string) {
  const [row] = await db
    .select()
    .from(seoClusterContentPlan)
    .where(and(eq(seoClusterContentPlan.clusterId, clusterId), eq(seoClusterContentPlan.tenantId, tenantId)))
    .limit(1);

  return row ?? null;
}

// Upsert sobre el UNIQUE(cluster_id): la fila puede no existir todavía si
// esta es la primera vez que Jesús pega preguntas para este cluster.
export async function saveManualQuestions(
  clusterId: string,
  tenantId: string,
  questions: string[]
): Promise<SeoClusterContentPlan> {
  // INSERT ... ON CONFLICT DO UPDATE ... RETURNING siempre devuelve
  // exactamente una fila (la insertada o la actualizada) — el `!` es
  // seguro, TypeScript solo no puede saberlo por la firma de drizzle.
  const [row] = await db
    .insert(seoClusterContentPlan)
    .values({ clusterId, tenantId, manualQuestions: questions })
    .onConflictDoUpdate({
      target: seoClusterContentPlan.clusterId,
      set: { manualQuestions: questions, updatedAt: new Date() },
    })
    .returning();

  return row!;
}

// Mismo upsert — generar el plan puede ser lo primero que hace el usuario
// en esta pestaña, sin haber guardado preguntas manuales antes.
export async function saveContentPlanAnalysis(data: {
  clusterId: string;
  tenantId: string;
  analysisJson: unknown;
  modelUsed?: string | null;
  tokensUsed?: number | null;
  costEstimate?: string | null;
}): Promise<SeoClusterContentPlan> {
  const [row] = await db
    .insert(seoClusterContentPlan)
    .values({
      clusterId: data.clusterId,
      tenantId: data.tenantId,
      analysisJson: data.analysisJson,
      modelUsed: data.modelUsed,
      tokensUsed: data.tokensUsed,
      costEstimate: data.costEstimate,
    })
    .onConflictDoUpdate({
      target: seoClusterContentPlan.clusterId,
      set: {
        analysisJson: data.analysisJson,
        modelUsed: data.modelUsed,
        tokensUsed: data.tokensUsed,
        costEstimate: data.costEstimate,
        updatedAt: new Date(),
      },
    })
    .returning();

  return row!;
}

// Fuente A del plan de contenido. seo_kw_raw NO tiene columna
// search_intent propia (verificado en schema.ts) — la única intención
// clasificada y persistida vive en seo_kw_clusters, a nivel de cluster
// confirmado. "Keyword informacional disponible" se interpreta aquí como
// "keyword que ya pertenece a un cluster confirmado del proyecto con
// search_intent = 'informacional'" — es la única lectura que corresponde
// a datos que "ya están en BD", sin inventar una columna que no existe.
//
// Primera versión de esta query hacía JOIN contra seo_kw_raw para traer
// solo keywords "reales" (con volumen de SE Ranking) — se descartó tras
// probar con datos reales: los clusters informacionales de este proyecto
// (ej. "Beneficios del Pilates", "Pilates vs Yoga") están compuestos por
// keywords SUGERIDAS por la Capa 4 del clustering, que nunca pasaron por
// seo_kw_raw (se crean directamente en seo_kw_cluster_keywords con
// monthly_volume null). El JOIN contra seo_kw_raw devolvía 0 filas
// siempre en ese caso — exactamente el escenario más común para
// keywords informacionales en un proyecto de servicios locales. Se lee
// directo de seo_kw_cluster_keywords, sin pasar por seo_kw_raw.
export async function getUnusedInformationalKeywords(projectId: string, excludeClusterId: string) {
  return db
    .select({
      id: seoKwClusterKeywords.id,
      keyword: seoKwClusterKeywords.keyword,
      monthlyVolume: seoKwClusterKeywords.monthlyVolume,
    })
    .from(seoKwClusterKeywords)
    .innerJoin(seoKwClusters, eq(seoKwClusters.id, seoKwClusterKeywords.clusterId))
    .where(
      and(
        eq(seoKwClusters.projectId, projectId),
        eq(seoKwClusters.searchIntent, 'informacional'),
        sql`${seoKwClusters.id} != ${excludeClusterId}`
      )
    );
}

// Fuente C del plan de contenido — reutiliza raw_scraped_data ya guardado
// en Bloque 1, sin scraping nuevo. Si no hay ningún competidor con
// scrape_status = 'done' todavía, devuelve listas vacías: es un estado
// válido (cluster sin análisis de competidores todavía), no un error.
export async function getCompetitorContentGap(
  clusterId: string,
  tenantId: string
): Promise<{ h2s: string[]; faqQuestions: string[]; competitorCount: number }> {
  const rows = await db
    .select({ rawScrapedData: seoClusterCompetitors.rawScrapedData })
    .from(seoClusterCompetitors)
    .where(
      and(
        eq(seoClusterCompetitors.clusterId, clusterId),
        eq(seoClusterCompetitors.tenantId, tenantId),
        eq(seoClusterCompetitors.scrapeStatus, 'done')
      )
    );

  const h2s: string[] = [];
  const faqQuestions: string[] = [];

  for (const row of rows) {
    const data = row.rawScrapedData as ScrapedData | null;
    if (!data) continue;
    h2s.push(...data.h2s);
    faqQuestions.push(...data.faqs.map((f) => f.question));
  }

  return { h2s, faqQuestions, competitorCount: rows.length };
}
