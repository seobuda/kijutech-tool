import 'server-only';

// SEO · Diagnóstico de caídas en capas (parte 8). Al final de los detectores semanales: si los clics totales (con las
// búsquedas anónimas: gsc_daily_totals) caen, se buscan las capas con evidencia reciente y queda un hallazgo con la foto.
// Ventana cerrada 2 días antes del último dato (los últimos son provisionales); si los datos son viejos, no decide nada.
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { findings, seoChangeLog } from '@/lib/db/schema';
import { syncFindings } from '@/lib/core/findings';
import { DIAG_KIND, DIAG_SOURCE, diagnoseLayers, dropState, weekKey, type Totals } from '@/lib/seo/medir/diagnostico-rules';

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function totals(propertyId: number, from: string, to: string): Promise<Totals> {
  const [r] = (await db.execute(sql`SELECT coalesce(sum(clicks),0)::int AS c, coalesce(sum(impressions),0)::int AS i FROM gsc_daily_totals WHERE property_id = ${propertyId} AND search_type = 1 AND date BETWEEN ${from}::date AND ${to}::date`)) as unknown as { c: number; i: number }[];
  return { clicks: Number(r?.c ?? 0), impressions: Number(r?.i ?? 0) };
}

export async function runDiagnostico(tenantId: string, projectId: string, prop: { id: number; firstDate: string | null; lastDate: string | null }): Promise<string | null> {
  if (!prop.lastDate) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (prop.lastDate < addDays(today, -4)) return 'diagnóstico: datos de Search Console atrasados';
  const end = addDays(prop.lastDate, -2);
  const cur = await totals(prop.id, addDays(end, -27), end);
  const prev = await totals(prop.id, addDays(end, -55), addDays(end, -28));
  const yoyAvail = prop.firstDate && prop.firstDate <= addDays(end, -364 - 27);
  const yoy = yoyAvail ? await totals(prop.id, addDays(end, -364 - 27), addDays(end, -364)) : null;
  const [open] = await db.select({ dedupeKey: findings.dedupeKey, evidence: findings.evidence }).from(findings).where(and(eq(findings.projectId, projectId), eq(findings.kind, DIAG_KIND), eq(findings.status, 'abierto'))).limit(1);
  const base = Number((open?.evidence as { anterior?: { clicks?: number }; base?: number } | null)?.base ?? (open?.evidence as { anterior?: { clicks?: number } } | null)?.anterior?.clicks ?? 0) || null;
  const st = dropState(cur, prev, yoy, Boolean(open), base);
  if (!st.drop) {
    await syncFindings(tenantId, projectId, DIAG_SOURCE, [], [DIAG_KIND]);
    return 'sin caída de tráfico';
  }
  // Evidencia que empezó cerca de la caída (6 semanas antes del final de la ventana).
  const since = new Date(`${addDays(end, -42)}T00:00:00Z`);
  const recent = await db.select({ kind: findings.kind, url: findings.url }).from(findings).where(and(eq(findings.projectId, projectId), eq(findings.status, 'abierto'), gte(findings.firstSeen, since)));
  const ch = (await db
    .select({ field: seoChangeLog.field, n: sql<number>`count(*)::int` })
    .from(seoChangeLog)
    .where(and(eq(seoChangeLog.projectId, projectId), gte(seoChangeLog.detectedAt, since), inArray(seoChangeLog.field, ['title', 'canonical', 'content', 'url_gone', 'host', 'indexable', 'status', 'h1'])))
    .groupBy(seoChangeLog.field)) as { field: string; n: number }[];
  const layers = diagnoseLayers({ cur, prev, yoy, recentFindings: recent, changes: Object.fromEntries(ch.map((c) => [c.field, Number(c.n)])) });
  const key = open?.dedupeKey ?? `${DIAG_KIND}:${weekKey(end)}`;
  await syncFindings(tenantId, projectId, DIAG_SOURCE, [
    { kind: DIAG_KIND, dedupeKey: key, metric: 'clics_28d', value: cur.clicks, severity: 'importante', evidence: { base: base ?? prev.clicks, caidaPct: Math.round(st.pct * 100), interanualPct: st.yoyPct === null ? null : Math.round(st.yoyPct * 100), actual: cur, anterior: prev, anioAnterior: yoy, capas: layers, hasta: end } }
  ], [DIAG_KIND]);
  return `caída de clics ${Math.round(st.pct * 100)} %: ${layers.length ? layers.map((l) => l.capa).join(', ') : 'sin causa clara'}`;
}
