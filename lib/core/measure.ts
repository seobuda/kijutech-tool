import 'server-only';

// Núcleo: medir «¿funcionó?» cada intervención hecha (SEO parte 8, 27 nov 2026; docs/DISENO-SEO-MEDIR.md con la auditoría
// Opus). Proceso diario de la cuenta «core.interventions.measure»: para cada intervención hecha, la fecha real (la da el
// módulo por la capacidad de evidencia; si no, la del encargo), y en cada punto de control (28, 56 y 90 días) la serie
// semanal de Search Console de sus páginas frente al resto de la web → veredicto. Guarda en interventions.outcome (fusiona).
// Este archivo no importa módulos.
import { and, eq, isNotNull, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { interventions, type Intervention } from '@/lib/db/schema';
import { interventionEvidence } from '@/lib/core/capabilities';
import { gscPropertiesForProject } from '@/lib/core/gsc';
import { registerJobKind, registerProcess } from '@/lib/core/jobs';
import { CHECKPOINTS, GAP_DAYS, incrementalClicks, MEASURE_METHOD, NOT_MEASURABLE, verdictOf, windows, type WeekPoint } from '@/lib/core/measure-rules';

export const MEASURE_PROCESS = 'core.interventions.measure';
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Variantes de una URL (barra final, www, http/https) para cruzarla con gsc_pages. */
export function urlVariants(u: string): string[] {
  try {
    const x = new URL(u);
    const hosts = [x.hostname.replace(/^www\./, ''), `www.${x.hostname.replace(/^www\./, '')}`];
    const path = x.pathname.replace(/\/+$/, '');
    const out: string[] = [];
    for (const proto of ['https:', 'http:']) for (const h of hosts) for (const p of [path || '/', `${path}/`]) out.push(`${proto}//${h}${p}${x.search}`);
    return [...new Set(out)];
  } catch {
    return [u];
  }
}

async function pageIds(propertyId: number, urls: string[]): Promise<number[]> {
  const v = [...new Set(urls.flatMap(urlVariants))].slice(0, 2000);
  if (!v.length) return [];
  const rows = (await db.execute(sql`SELECT id FROM gsc_pages WHERE property_id = ${propertyId} AND url IN (${sql.join(v.map((x) => sql`${x}`), sql`, `)})`)) as unknown as { id: number }[];
  return [...rows].map((r) => Number(r.id));
}
const idList = (ids: number[]) => sql.raw(`(${ids.map((n) => Math.trunc(Number(n))).filter(Number.isFinite).join(',') || '0'})`);

/** Serie semanal: clics o impresiones de las tratadas y del resto (sin las excluidas). */
async function weeklySum(propertyId: number, field: 'clicks' | 'impressions', treated: number[], excluded: number[], from: Date, to: Date): Promise<WeekPoint[]> {
  const rows = (await db.execute(sql`
    SELECT to_char(date_trunc('week', date), 'YYYY-MM-DD') AS w,
      coalesce(sum(${sql.raw(field)}) FILTER (WHERE page_id IN ${idList(treated)}), 0)::float AS t,
      coalesce(sum(${sql.raw(field)}) FILTER (WHERE page_id NOT IN ${idList(excluded)}), 0)::float AS c
    FROM gsc_daily WHERE property_id = ${propertyId} AND search_type = 1 AND date >= ${iso(from)}::date AND date < ${iso(to)}::date
    GROUP BY 1 ORDER BY 1`)) as unknown as { w: string; t: number; c: number }[];
  return [...rows].map((r) => ({ week: r.w, treated: Number(r.t), control: Number(r.c) }));
}

/**
 * Posición o CTR semanal con una CESTA FIJA de búsquedas (las de más impresiones en el periodo previo), ponderada por esas
 * impresiones previas: aparecer en búsquedas nuevas no «empeora» la media. CTR en tanto por mil.
 */
async function weeklyBasket(propertyId: number, kind: 'posicion' | 'ctr', pages: number[], notPages: number[], preFrom: Date, preTo: Date, from: Date, to: Date): Promise<{ series: Map<string, number>; base: number }> {
  const filter = pages.length ? sql`page_id IN ${idList(pages)}` : sql`page_id NOT IN ${idList(notPages)}`;
  const basket = (await db.execute(sql`
    SELECT query_id AS q, sum(impressions)::float AS imp FROM gsc_daily
    WHERE property_id = ${propertyId} AND search_type = 1 AND date >= ${iso(preFrom)}::date AND date < ${iso(preTo)}::date AND ${filter}
    GROUP BY 1 ORDER BY 2 DESC LIMIT 200`)) as unknown as { q: number; imp: number }[];
  const w = new Map([...basket].map((b) => [Number(b.q), Number(b.imp)]));
  const base = [...w.values()].reduce((s, x) => s + x, 0);
  if (!w.size) return { series: new Map(), base: 0 };
  const rows = (await db.execute(sql`
    SELECT to_char(date_trunc('week', date), 'YYYY-MM-DD') AS wk, query_id AS q, sum(clicks)::float AS c, sum(impressions)::float AS i, sum(pos_sum)::float AS p
    FROM gsc_daily WHERE property_id = ${propertyId} AND search_type = 1 AND date >= ${iso(from)}::date AND date < ${iso(to)}::date AND ${filter} AND query_id IN ${idList([...w.keys()])}
    GROUP BY 1, 2`)) as unknown as { wk: string; q: number; c: number; i: number; p: number }[];
  const acc = new Map<string, { num: number; den: number }>();
  for (const r of rows) {
    const i = Number(r.i);
    if (!i) continue;
    const weight = w.get(Number(r.q)) ?? 0;
    const value = kind === 'posicion' ? Number(r.p) / i : (Number(r.c) / i) * 1000;
    const a = acc.get(r.wk) ?? { num: 0, den: 0 };
    a.num += value * weight;
    a.den += weight;
    acc.set(r.wk, a);
  }
  return { series: new Map([...acc].map(([k, a]) => [k, a.num / a.den])), base };
}

/** Solo semanas COMPLETAS dentro de [from, to): sin días cambiados en «antes» ni semanas de un día en «después». */
const within = (pts: WeekPoint[], from: Date, to: Date) =>
  pts.filter((p) => {
    const start = new Date(`${p.week}T00:00:00Z`).getTime();
    return start >= from.getTime() && start + 7 * DAY <= to.getTime();
  });

type Checkpoint = Record<string, unknown> & { days: number };
type Outcome = Record<string, unknown> & { checkpoints?: Checkpoint[] };

/** Mide una intervención en el punto de control que toque. Devuelve el outcome fusionado, o null si aún no toca. */
export async function measureOne(i: Intervention, now = new Date()): Promise<Outcome | null> {
  const prev = (i.outcome ?? {}) as Outcome;
  const done = new Set((prev.checkpoints ?? []).map((c) => c.days));
  if (CHECKPOINTS.every((d) => done.has(d)) || prev.verdict === 'no_medible') return null;
  if (!i.doneAt || !i.projectId) return null;
  if (NOT_MEASURABLE.has(i.technique) || !i.urls.length) {
    return { ...prev, method: MEASURE_METHOD, verdict: 'no_medible', reasons: [NOT_MEASURABLE.has(i.technique) ? 'técnica de toda la web o de la ficha: no se mide con Search Console por página' : 'sin páginas'] };
  }
  // Fecha real: el módulo (registro de cambios) o, si no consta, la del encargo.
  const ev = interventionEvidence(i.domain);
  const since = i.createdAt;
  let effective = prev.effective as { from: string; to: string; source: string } | undefined;
  if (!effective || effective.source === 'encargo') {
    const e = await ev?.effective(i.tenantId, i.projectId, i.urls, i.technique, since).catch(() => null);
    const fromE = e && i.doneAt >= e.from && i.doneAt <= e.to ? { from: i.doneAt, to: i.doneAt, source: 'encargo+registro' } : e;
    effective = fromE ? { from: fromE.from.toISOString(), to: fromE.to.toISOString(), source: fromE.source } : { from: i.doneAt.toISOString(), to: i.doneAt.toISOString(), source: 'encargo' };
  }
  const eff = { from: new Date(effective.from), to: new Date(effective.to) };
  const doneState = (await ev?.isDone(i.tenantId, i.projectId, i.urls, i.technique, since).catch(() => 'sin_datos' as const)) ?? 'sin_datos';
  const due = CHECKPOINTS.filter((d) => !done.has(d) && now.getTime() >= eff.to.getTime() + (GAP_DAYS + d + 3) * DAY);
  if (!due.length) {
    const prevDone = (prev.done as { status?: string } | undefined)?.status;
    if (prev.effective && prevDone === doneState) return null;
    return { ...prev, method: MEASURE_METHOD, effective, done: { status: doneState, at: now.toISOString() } };
  }
  const cp = due[0];
  const props = (await gscPropertiesForProject(i.tenantId, i.projectId)).filter((p) => p.status === 'activa' && p.lastDate);
  const prop = props.sort((a, b) => Number(b.kind === 'dominio') - Number(a.kind === 'dominio'))[0];
  if (!prop) return { ...prev, method: MEASURE_METHOD, effective, verdict: 'sin_datos', reasons: ['sin Search Console'] };
  const w = windows(eff, cp);
  if (prop.lastDate! < iso(w.post[1])) return null; // aún no hay datos hasta el final de la ventana
  const treated = await pageIds(prop.id, i.urls);
  // Control: el resto de la web, sin las páginas de otras intervenciones del proyecto en el periodo.
  const others = await db
    .select({ id: interventions.id, urls: interventions.urls, createdAt: interventions.createdAt, doneAt: interventions.doneAt })
    .from(interventions)
    .where(and(eq(interventions.projectId, i.projectId), sql`${interventions.id} <> ${i.id}`, sql`${interventions.status} <> 'cancelada'`, lt(interventions.createdAt, w.post[1])));
  const inPeriod = others.filter((o) => !o.doneAt || o.doneAt >= w.pre[0]);
  const otherIds = await pageIds(prop.id, inPeriod.flatMap((o) => o.urls).slice(0, 500));
  const myKeys = new Set(i.urls.flatMap(urlVariants));
  const confounders = inPeriod.filter((o) => o.urls.some((u) => urlVariants(u).some((v) => myKeys.has(v)))).map((o) => o.id);
  const excluded = [...new Set([...treated, ...otherIds])];
  const metric = String(i.hypothesis?.metric ?? 'clics');
  const invert = metric === 'posicion';
  let pre: WeekPoint[] = [];
  let post: WeekPoint[] = [];
  let baseTotal = 0;
  if (metric === 'posicion' || metric === 'ctr') {
    const t = await weeklyBasket(prop.id, metric, treated, [], w.pre[0], w.pre[1], w.pre[0], w.post[1]);
    const c = await weeklyBasket(prop.id, metric, [], excluded, w.pre[0], w.pre[1], w.pre[0], w.post[1]);
    const weeks = [...t.series.keys()].filter((k) => c.series.has(k)).sort();
    const pts = weeks.map((k) => ({ week: k, treated: t.series.get(k)!, control: c.series.get(k)! }));
    baseTotal = Math.round(t.base);
    pre = within(pts, w.pre[0], w.pre[1]);
    post = within(pts, w.post[0], w.post[1]);
  } else {
    const pts = await weeklySum(prop.id, metric === 'impresiones' ? 'impressions' : 'clicks', treated, excluded, w.pre[0], w.post[1]);
    pre = within(pts, w.pre[0], w.pre[1]);
    post = within(pts, w.post[0], w.post[1]);
    baseTotal = Math.round(pre.reduce((s, p) => s + p.treated, 0));
  }
  const v = verdictOf({ pre, post, metric, baseTotal, invert });
  // Si el registro dice que el cambio no está en la web, no se atribuye nada.
  if (doneState === 'no_hecho' && v.verdict !== 'no_concluyente') {
    v.verdict = 'no_concluyente';
    v.reasons.push('no consta el cambio en la web (registro de cambios)');
  }
  // Clics incrementales (siempre por clics, para el informe): una sola vez si hay intervenciones solapadas (se marca).
  const clicksPts = metric === 'clics' ? [...pre, ...post] : await weeklySum(prop.id, 'clicks', treated, excluded, w.pre[0], w.post[1]);
  const cPost = within(clicksPts, w.post[0], w.post[1]);
  const cPre = within(clicksPts, w.pre[0], w.pre[1]);
  const cv = verdictOf({ pre: cPre, post: cPost, metric: 'clics', baseTotal: Math.round(cPre.reduce((s2, p) => s2 + p.treated, 0)) });
  const checkpoint: Checkpoint = {
    days: cp,
    windows: { pre: [iso(w.pre[0]), iso(w.pre[1])], post: [iso(w.post[0]), iso(w.post[1])], gapDays: GAP_DAYS },
    metric,
    verdict: treated.length ? v.verdict : 'sin_datos',
    reasons: treated.length ? v.reasons : ['sus páginas no tienen datos en Search Console'],
    effectLog: Math.round(v.effectLog * 1000) / 1000,
    se: Math.round(v.se * 1000) / 1000,
    t: Math.round(v.t * 100) / 100,
    effectPct: v.effectPct,
    preTrend: v.preTrend,
    baseTotal,
    pages: treated.length,
    controlExcluded: excluded.length,
    incrementalClicks: confounders.length || (cv.verdict !== 'funciono' && cv.verdict !== 'no_funciono') || v.verdict === 'no_concluyente' ? null : incrementalClicks(cPost.reduce((s2, p) => s2 + p.treated, 0), cv.effectLog)
  };
  const checkpoints = [...(prev.checkpoints ?? []).filter((c) => c.days !== cp), checkpoint].sort((a, b) => a.days - b.days);
  return { ...prev, method: MEASURE_METHOD, effective, done: { status: doneState, at: now.toISOString() }, direction: 'mejora', propertyId: prop.id, confounders, checkpoints, verdict: checkpoint.verdict, effectPct: checkpoint.effectPct };
}

export async function measureInterventions(tenantId: string, now = new Date()): Promise<{ checked: number; measured: number }> {
  const list = await db
    .select()
    .from(interventions)
    .where(
      and(
        eq(interventions.tenantId, tenantId),
        eq(interventions.status, 'hecha'),
        isNotNull(interventions.doneAt),
        isNotNull(interventions.projectId),
        lt(interventions.doneAt, new Date(now.getTime() - 14 * DAY)),
        sql`coalesce(${interventions.outcome}->>'verdict', '') <> 'no_medible'`,
        sql`jsonb_array_length(coalesce(${interventions.outcome}->'checkpoints', '[]'::jsonb)) < ${CHECKPOINTS.length}`
      )
    )
    .orderBy(sql`${interventions.measuredAt} ASC NULLS FIRST`, interventions.doneAt)
    .limit(300);
  let measured = 0;
  for (const i of list) {
    const o = await measureOne(i, now).catch((e) => {
      console.error('[núcleo] medir intervención:', e instanceof Error ? e.message : e);
      return null;
    });
    if (!o) continue;
    await db.update(interventions).set({ outcome: o, measuredAt: now, updatedAt: now }).where(eq(interventions.id, i.id));
    measured++;
  }
  return { checked: list.length, measured };
}

let registered = false;
export function registerMeasureJobs(): void {
  if (registered) return;
  registered = true;
  registerJobKind({ kind: MEASURE_PROCESS, timeoutS: 600, maxConcurrent: 1, maxAttempts: 2, run: async (ctx) => measureInterventions(ctx.tenantId) });
  registerProcess({ key: MEASURE_PROCESS, scopeType: 'cuenta', label: 'Intervenciones: medir si funcionaron (Search Console)', defaultEveryMinutes: 1440, enqueue: () => ({ kind: MEASURE_PROCESS, priority: 8 }) });
}
