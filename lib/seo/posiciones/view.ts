import 'server-only';

// SEO · Posiciones: lo que enseña la pestaña del proyecto (parte 4, 26 nov 2026). Solo lectura.
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientCompetitors, projects, seoRankChecks, seoRankKeywords } from '@/lib/db/schema';
import { projectWebUrl } from '@/lib/seo/salud/audit';
import { host } from '@/lib/seo/expediente/rules';
import { visibilityShare } from '@/lib/seo/posiciones/rules';

export type PositionRow = {
  id: string;
  keyword: string;
  origin: string;
  language: string;
  status: string;
  volume: number | null;
  impressions: number | null;
  position: number | null;
  prev: number | null;
  url: string | null;
  localPack: boolean | null;
  localRank: number | null;
  aio: boolean | null;
  aioCites: boolean | null;
  history: (number | null)[];
  checkedAt: string | null;
};

export type PositionsView = {
  rows: PositionRow[];
  location: string | null;
  lastCheck: string | null;
  inProgress: number;
  failedLast: number;
  summary: { tracked: number; top3: number; top10: number; inPack: number; packs: number; aio: number; aioCites: number };
  share: { domain: string; share: number; isClient: boolean }[];
};

export async function getPositionsView(tenantId: string, projectId: string): Promise<PositionsView | null> {
  const [p] = await db.select({ clientId: projects.clientId }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  if (!p) return null;
  const kws = await db.select().from(seoRankKeywords).where(and(eq(seoRankKeywords.tenantId, tenantId), eq(seoRankKeywords.projectId, projectId))).orderBy(seoRankKeywords.createdAt);
  const checks = kws.length
    ? await db
        .select()
        .from(seoRankChecks)
        .where(and(eq(seoRankChecks.tenantId, tenantId), eq(seoRankChecks.projectId, projectId), sql`${seoRankChecks.createdAt} > now() - interval '120 days'`))
        .orderBy(desc(seoRankChecks.createdAt))
    : [];
  const byKw = new Map<string, typeof checks>();
  for (const c of checks) byKw.set(c.keywordId, [...(byKw.get(c.keywordId) ?? []), c]);
  const rows: PositionRow[] = kws
    .filter((k) => k.status !== 'quitada')
    .map((k) => {
      const done = (byKw.get(k.id) ?? []).filter((c) => c.status === 'hecha');
      const last = done[0];
      return {
        id: k.id,
        keyword: k.keyword,
        origin: k.origin,
        language: k.language,
        status: k.status,
        volume: k.volume,
        impressions: k.impressions,
        position: last?.position ?? null,
        prev: done[1]?.position ?? null,
        url: last?.url ?? null,
        localPack: last?.localPack ?? null,
        localRank: last?.localRank ?? null,
        aio: last?.aio ?? null,
        aioCites: last?.aioCites ?? null,
        history: done.slice(0, 8).map((c) => c.position).reverse(),
        checkedAt: last?.checkedAt?.toISOString() ?? null
      };
    });
  const lastRun = checks.find((c) => c.status === 'hecha');
  const latestRunRows = lastRun ? checks.filter((c) => c.runId === lastRun.runId) : [];
  const done = rows.filter((r) => r.checkedAt);
  // Cuota de visibilidad de la última consulta: el cliente frente a los competidores confirmados.
  const clientDomain = host(await projectWebUrl(tenantId, projectId));
  const comps = p.clientId ? await db.select({ value: clientCompetitors.domain }).from(clientCompetitors).where(and(eq(clientCompetitors.clientId, p.clientId), eq(clientCompetitors.status, 'confirmado'))) : [];
  const domains = [...new Set([clientDomain, ...comps.map((c) => host(c.value))].filter((d): d is string => Boolean(d)))].slice(0, 8);
  const volOf = new Map(kws.map((k) => [k.id, k.volume ?? k.impressions ?? null]));
  const shareMap = visibilityShare(latestRunRows.filter((c) => c.status === 'hecha').map((c) => ({ volume: volOf.get(c.keywordId) ?? null, top10: c.top10 ?? [] })), domains);
  return {
    rows,
    location: lastRun?.locationName ?? null,
    lastCheck: lastRun?.checkedAt?.toISOString() ?? null,
    inProgress: checks.filter((c) => c.status === 'pendiente' || c.status === 'enviada').length,
    failedLast: latestRunRows.filter((c) => c.status === 'fallida' || c.status === 'caducada').length,
    summary: {
      tracked: rows.filter((r) => r.status === 'activa').length,
      top3: done.filter((r) => r.position !== null && r.position <= 3).length,
      top10: done.filter((r) => r.position !== null && r.position <= 10).length,
      inPack: done.filter((r) => r.localRank !== null).length,
      packs: done.filter((r) => r.localPack).length,
      aio: done.filter((r) => r.aio).length,
      aioCites: done.filter((r) => r.aioCites).length
    },
    share: [...shareMap].map(([domain, share]) => ({ domain, share, isClient: domain === clientDomain })).sort((a, b) => b.share - a.share)
  };
}

/** Para «Consultar ahora»: ¿hay algo en curso o una consulta de hace menos de 12 h? */
export async function recentOrOpenCheck(projectId: string): Promise<boolean> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(seoRankChecks)
    .where(and(eq(seoRankChecks.projectId, projectId), sql`(${inArray(seoRankChecks.status, ['pendiente', 'enviada'])} OR ${seoRankChecks.postedAt} > now() - interval '12 hours')`));
  return Number(r?.n ?? 0) > 0;
}
