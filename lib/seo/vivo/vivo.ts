import 'server-only';

// SEO · Panel en vivo e informe mensual (parte 12, 27 nov 2026; docs/DISENO-SEO-CIERRE.md §D con la auditoría Opus).
// - El panel solo lee tablas propias (leads del núcleo, Search Console descargada, intervenciones, posiciones y panel de
//   IA): ninguna llamada externa al pintar.
// - El informe es un BORRADOR determinista que entra en la bandeja de mensajes al cliente SIEMPRE con aprobación
//   (forceApproval, auditoría grave 1) y una sola vez por proyecto y mes (dedupeKey). Nunca se envía solo.
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clients, interventions, projects, seoPlanItems } from '@/lib/db/schema';
import { gscPropertiesForProject } from '@/lib/core/gsc';
import { leadsSummary, type LeadsSummary } from '@/lib/core/connections';
import { createClientMessage } from '@/lib/core/comms';
import { getPositionsView } from '@/lib/seo/posiciones/view';
import { getAiPanelView } from '@/lib/seo/panel-ia/panel';
import { monthlyReportText } from '@/lib/seo/vivo/report-rules';

export type LiveView = {
  clientId: string | null;
  clientName: string;
  leads: LeadsSummary | null;
  gscMonthly: { month: string; clicks: number; impressions: number }[];
  pageClicks: Record<string, number>;
  work: { title: string; doneAt: string | null; verdict: string | null }[];
  positions: { top3: number; top10: number; tracked: number } | null;
  ai: { share: number | null; answers: number } | null;
};

const TECH_TITLE = (t: string) => t.replace(/_/g, ' ');
const normUrl = (u: string) => u.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');

export async function getLiveView(tenantId: string, projectId: string): Promise<LiveView | null> {
  const [p] = await db.select({ clientId: projects.clientId, clientName: clients.name, name: projects.name }).from(projects).leftJoin(clients, eq(clients.id, projects.clientId)).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  if (!p) return null;
  const props = await gscPropertiesForProject(tenantId, projectId).catch(() => []);
  const ids = props.map((x) => x.id);
  const [leads, monthly, pages, work, pos, ai] = await Promise.all([
    p.clientId ? leadsSummary(tenantId, p.clientId, 12).catch(() => null) : Promise.resolve(null),
    ids.length
      ? (db.execute(sql`SELECT to_char(date, 'YYYY-MM') AS month, sum(clicks)::int AS clicks, sum(impressions)::int AS impressions FROM gsc_daily_totals
          WHERE property_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) AND search_type = 1 AND date >= (date_trunc('month', now()) - interval '12 months')::date
          GROUP BY 1 ORDER BY 1`) as unknown as Promise<{ month: string; clicks: number; impressions: number }[]>)
      : Promise.resolve([]),
    ids.length
      ? (db.execute(sql`SELECT pg.url, sum(d.clicks)::int AS clicks FROM gsc_daily d JOIN gsc_pages pg ON pg.id = d.page_id
          WHERE d.property_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) AND d.search_type = 1 AND d.date >= current_date - 90
          GROUP BY pg.url ORDER BY 2 DESC LIMIT 300`) as unknown as Promise<{ url: string; clicks: number }[]>)
      : Promise.resolve([]),
    db
      .select({ technique: interventions.technique, doneAt: interventions.doneAt, outcome: interventions.outcome })
      .from(interventions)
      .where(and(eq(interventions.projectId, projectId), eq(interventions.tenantId, tenantId), eq(interventions.status, 'hecha'), gte(interventions.doneAt, new Date(Date.now() - 120 * 86_400_000))))
      .orderBy(desc(interventions.doneAt))
      .limit(20),
    getPositionsView(tenantId, projectId).catch(() => null),
    getAiPanelView(tenantId, projectId).catch(() => null)
  ]);
  const pageClicks: Record<string, number> = {};
  for (const r of pages) pageClicks[normUrl(r.url)] = (pageClicks[normUrl(r.url)] ?? 0) + Number(r.clicks);
  let aiOut: LiveView['ai'] = null;
  if (ai && ai.months[0]) {
    const m = ai.months[0];
    const cells = Object.values(ai.grid).flatMap((byMonth) => Object.values(byMonth[m] ?? {}));
    const n = cells.reduce((a, c) => a + c.n, 0);
    aiOut = { share: n ? cells.reduce((a, c) => a + c.client, 0) / n : null, answers: n };
  }
  return {
    clientId: p.clientId,
    clientName: p.clientName ?? p.name,
    leads,
    gscMonthly: monthly.map((r) => ({ month: r.month, clicks: Number(r.clicks), impressions: Number(r.impressions) })),
    pageClicks,
    work: work.map((w) => ({ title: TECH_TITLE(w.technique), doneAt: w.doneAt?.toISOString() ?? null, verdict: ((w.outcome ?? {}) as { verdict?: string }).verdict ?? (w.outcome ? null : 'pendiente') })),
    positions: pos ? { top3: pos.summary.top3, top10: pos.summary.top10, tracked: pos.summary.tracked } : null,
    ai: aiOut
  };
}

/** Clics de Search Console de una página (para cruzar con los leads): por URL normalizada. */
export function clicksFor(view: LiveView, url: string): number | null {
  const v = view.pageClicks[normUrl(url)];
  return v === undefined ? null : v;
}

/** Prepara el borrador del informe del mes pasado y lo deja en la bandeja con aprobación obligatoria. */
export async function draftMonthlyReport(tenantId: string, projectId: string, by: { name: string; userId: number | null }): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  const v = await getLiveView(tenantId, projectId);
  if (!v || !v.clientId) return { ok: false, error: 'El proyecto no tiene cliente.' };
  const now = new Date();
  const ref = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const prev = new Date(now.getFullYear(), now.getMonth() - 2, 15);
  const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const monthLabel = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(ref);
  const m = v.leads?.byMonth.find((x) => x.month === ym(ref));
  const mp = v.leads?.byMonth.find((x) => x.month === ym(prev));
  const g = v.gscMonthly.find((x) => x.month === ym(ref));
  const gp = v.gscMonthly.find((x) => x.month === ym(prev));
  const next = await db
    .select({ title: seoPlanItems.title })
    .from(seoPlanItems)
    .where(and(eq(seoPlanItems.projectId, projectId), inArray(seoPlanItems.status, ['aprobada', 'pendiente'])))
    .orderBy(seoPlanItems.priority)
    .limit(5)
    .catch(() => [] as { title: string }[]);
  const text = monthlyReportText({
    clientName: v.clientName,
    monthLabel,
    leads: { connected: Boolean(v.leads?.connected), month: m?.total ?? 0, prev: mp?.total ?? 0, organic: m?.organico ?? 0, topPages: (v.leads?.byPage ?? []).slice(0, 3).map((p) => ({ url: p.url.replace(/^https?:\/\//, ''), n: p.n })) },
    gsc: { clicks: g?.clicks ?? null, prevClicks: gp?.clicks ?? null, impressions: g?.impressions ?? null },
    positions: v.positions,
    ai: v.ai,
    work: v.work.filter((w) => w.doneAt && w.doneAt.slice(0, 7) === ym(ref)).map((w) => ({ title: w.title.charAt(0).toUpperCase() + w.title.slice(1), verdict: w.verdict })),
    next: next.map((n) => n.title)
  });
  const r = await createClientMessage({
    tenantId,
    clientId: v.clientId,
    projectId,
    kind: 'informes',
    subject: text.subject,
    body: text.body,
    author: { kind: 'persona', name: by.name, userId: by.userId },
    dedupeKey: `informe:${projectId}:${ym(ref)}`,
    forceApproval: true
  });
  if (!r.ok) return r.reason === 'duplicado' ? { ok: true, created: false } : { ok: false, error: r.detail };
  return { ok: true, created: true };
}

