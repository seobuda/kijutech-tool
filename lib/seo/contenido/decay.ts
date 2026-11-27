import 'server-only';

// SEO · Contenido que pierde tráfico (parte 9a): en los detectores semanales. 90 días frente a los 90 anteriores (y frente
// a los mismos 90 del año anterior si hay histórico); causa probable por posición, CTR o demanda. Lo decide contentDecay.
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import type { FindingInput } from '@/lib/core/findings-rules';
import { contentDecay, type DecayRow } from '@/lib/seo/contenido/rules';

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function window(propertyId: number, from: string, to: string): Promise<Map<string, { c: number; i: number; p: number | null }>> {
  const rows = (await db.execute(sql`
    SELECT p.url AS url, sum(d.clicks)::int AS c, sum(d.impressions)::int AS i, CASE WHEN sum(d.impressions) > 0 THEN sum(d.pos_sum) / sum(d.impressions) END AS pos
    FROM gsc_daily d JOIN gsc_pages p ON p.id = d.page_id
    WHERE d.property_id = ${propertyId} AND d.search_type = 1 AND d.date BETWEEN ${from}::date AND ${to}::date
    GROUP BY p.url`)) as unknown as { url: string; c: number; i: number; pos: number | null }[];
  return new Map([...rows].map((r) => [r.url, { c: Number(r.c), i: Number(r.i), p: r.pos == null ? null : Number(r.pos) }]));
}

export async function computeDecay(prop: { id: number; firstDate: string | null; lastDate: string | null }): Promise<FindingInput[]> {
  if (!prop.lastDate) return [];
  const end = addDays(prop.lastDate, -2);
  const cur = await window(prop.id, addDays(end, -89), end);
  const prev = await window(prop.id, addDays(end, -179), addDays(end, -90));
  const hasYoy = Boolean(prop.firstDate && prop.firstDate <= addDays(end, -364 - 89));
  const yoy = hasYoy ? await window(prop.id, addDays(end, -364 - 89), addDays(end, -364)) : null;
  const rows: DecayRow[] = [];
  for (const [url, p] of prev) {
    if (p.c < 30) continue;
    const c = cur.get(url) ?? { c: 0, i: 0, p: null };
    rows.push({ url, cur: c.c, prev: p.c, yoy: yoy ? (yoy.get(url)?.c ?? 0) : null, posCur: c.p, posPrev: p.p, impCur: c.i, impPrev: p.i });
  }
  return contentDecay(rows);
}
