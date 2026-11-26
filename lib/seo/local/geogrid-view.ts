import 'server-only';

// SEO · Local, tanda 5b: lo que enseña «Mapa por zonas» en la pestaña Local. Solo lectura.
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { findings, seoGeogridPoints, seoGeogridRuns } from '@/lib/db/schema';
import { comparable, GEOGRID_SOURCE, summarize } from '@/lib/seo/local/geogrid-rules';

export type GridCell = { row: number; col: number; rank: number | null; status: string; top: { r: number; t: string }[] };
export type GridRunView = { keyword: string; stepKm: number; zoom: number; createdAt: string; cells: GridCell[]; avg: number | null; top3Pct: number; prevAvg: number | null; prevTop3Pct: number | null };
export type GeogridView = { runs: GridRunView[]; inProgress: number; suspicious: { id: string; title: string; url: string | null; signals: string[]; points: number | null }[] };

export async function getGeogridView(tenantId: string, projectId: string): Promise<GeogridView> {
  const runs = await db.select().from(seoGeogridRuns).where(and(eq(seoGeogridRuns.tenantId, tenantId), eq(seoGeogridRuns.projectId, projectId))).orderBy(desc(seoGeogridRuns.createdAt)).limit(30);
  const suspicious = (
    await db
      .select({ id: findings.id, url: findings.url, value: findings.value, evidence: findings.evidence })
      .from(findings)
      .where(and(eq(findings.tenantId, tenantId), eq(findings.projectId, projectId), eq(findings.source, GEOGRID_SOURCE), eq(findings.kind, 'seo.maps_spam'), eq(findings.status, 'abierto')))
  ).map((f) => {
    const e = (f.evidence ?? {}) as { title?: string; signals?: string[] };
    return { id: f.id, title: e.title ?? '—', url: f.url, signals: e.signals ?? [], points: f.value };
  });
  if (!runs.length) return { runs: [], inProgress: 0, suspicious };
  const batch = runs[0].batchId;
  const latest = runs.filter((r) => r.batchId === batch);
  const pts = await db.select().from(seoGeogridPoints).where(inArray(seoGeogridPoints.runId, latest.map((r) => r.id)));
  const inProgress = pts.filter((p) => p.status === 'pendiente' || p.status === 'enviada').length;
  const out: GridRunView[] = [];
  for (const r of latest) {
    const mine = pts.filter((p) => p.runId === r.id).sort((a, b) => a.row - b.row || a.col - b.col);
    const cells: GridCell[] = mine.map((p) => ({ row: p.row, col: p.col, rank: p.rank, status: p.status, top: (p.results ?? []).slice(0, 3).map((x) => ({ r: x.r, t: x.t })) }));
    const sum = summarize(mine.map((p) => (p.status === 'hecha' ? p.rank : undefined)));
    const prev = runs.find((x) => x.batchId !== batch && x.keyword === r.keyword && x.createdAt < r.createdAt && comparable(x, r));
    let prevSum: ReturnType<typeof summarize> | null = null;
    if (prev) {
      const pp = await db.select({ rank: seoGeogridPoints.rank, status: seoGeogridPoints.status }).from(seoGeogridPoints).where(eq(seoGeogridPoints.runId, prev.id));
      prevSum = summarize(pp.map((p) => (p.status === 'hecha' ? p.rank : undefined)));
    }
    out.push({ keyword: r.keyword, stepKm: r.stepKm, zoom: r.zoom, createdAt: r.createdAt.toISOString(), cells, avg: sum.avg, top3Pct: sum.top3Pct, prevAvg: prevSum?.avg ?? null, prevTop3Pct: prevSum ? prevSum.top3Pct : null });
  }
  return { runs: out, inProgress, suspicious };
}
