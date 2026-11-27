import 'server-only';

// SEO · Autoridad (parte 10, 27 nov 2026; docs/DISENO-SEO-CIERRE.md §B con la auditoría Opus). DataForSEO Backlinks es de
// pago por uso desde el 1 jul 2026: misma cuenta, sin contrato. Apagada por proyecto hasta que alguien la enciende.
// - Cada mes: resumen de enlaces del cliente y de hasta 4 competidores confirmados, dominios nuevos y perdidos del cliente
//   y los huecos (dominios que enlazan a 2 o más competidores y no al cliente), filtrados (rank mínimo, sin directorios).
// - Tope propio («autoridad», 1,5 $ por defecto) dentro del general; coste estimado apuntado antes de cada petición.
// - «Probar cobertura» (admin, una vez al día): los dominios que enlazan al cliente, para compararlos con Search Console →
//   Enlaces. Criterio para encenderla en todos: que encuentre el 60 % o más de los de Search Console en 3 clientes.
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientCompetitors, projects, seoLinkSnapshots } from '@/lib/db/schema';
import { serpSource, type LinkSummary } from '@/lib/core/capabilities';
import { disableSchedule, ensureScheduleIfMissing, listSchedulesForScope, pauseSchedule } from '@/lib/core/jobs';
import { syncFindings } from '@/lib/core/findings';
import { canSpendOn, numberSetting, recordDataSpend, refundDataSpend } from '@/lib/seo/gasto';
import { projectBasics } from '@/lib/seo/posiciones/posiciones';
import { host } from '@/lib/seo/expediente/rules';
import { filterGap } from '@/lib/seo/autoridad/rules';

export const AUTORIDAD_KEY = 'seo.autoridad';
export const AUTORIDAD_SOURCE = 'seo.autoridad:enlaces';
export const AUTORIDAD_OP = 'autoridad';
const COST = { summary: 0.03, newLost: 0.03, gap: 0.04, coverage: 0.06 };

type Outcome = { status: 'ok' | 'aviso' | 'omitido'; summary: string };

const monthStart = () => {
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit' }).format(new Date()).split('-');
  return `${y}-${m}-01`;
};

export async function autoridadBudget(): Promise<number> {
  return numberSetting('autoridad_budget_usd', 1.5);
}

export async function isAutoridadOn(tenantId: string, projectId: string): Promise<boolean> {
  const rows = await listSchedulesForScope(tenantId, projectId);
  return rows.some((r) => r.processKey === AUTORIDAD_KEY && r.enabled);
}

export async function setAutoridad(tenantId: string, projectId: string, on: boolean): Promise<void> {
  if (on) {
    const created = await ensureScheduleIfMissing(tenantId, AUTORIDAD_KEY, projectId, 30 * 1440, new Date(Date.now() + 60_000));
    if (!created) await pauseSchedule(tenantId, AUTORIDAD_KEY, projectId, { enabled: true, pausedUntil: null });
  } else await disableSchedule(tenantId, AUTORIDAD_KEY, projectId);
}

async function domains(tenantId: string, projectId: string): Promise<{ client: string | null; competitors: string[] }> {
  const basics = await projectBasics(tenantId, projectId);
  const [p] = await db.select({ clientId: projects.clientId }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  const comps = p?.clientId
    ? await db.select({ domain: clientCompetitors.domain }).from(clientCompetitors).where(and(eq(clientCompetitors.clientId, p.clientId), eq(clientCompetitors.status, 'confirmado'), eq(clientCompetitors.kind, 'directo')))
    : [];
  const client = basics?.domain ?? null;
  return { client, competitors: [...new Set(comps.map((c) => host(c.domain)).filter((d): d is string => Boolean(d) && d !== client))].slice(0, 4) };
}

/** Gasta con el tope de Autoridad: apunta el estimado antes, ajusta al alza después. Devuelve null si no cabe. */
async function spend<T extends { costUsd: number }>(tenantId: string, projectId: string, label: string, estimate: number, fn: () => Promise<T>): Promise<T | null> {
  if (!(await canSpendOn(projectId, AUTORIDAD_OP, estimate, await autoridadBudget())).ok) return null;
  await recordDataSpend(tenantId, projectId, 'serp', `${AUTORIDAD_OP}: ${label}`, estimate);
  try {
    const r = await fn();
    if (r.costUsd > estimate) await recordDataSpend(tenantId, projectId, 'serp', `${AUTORIDAD_OP}: ${label} (ajuste)`, r.costUsd - estimate);
    return r;
  } catch (e) {
    const c = (e as { costUsd?: number }).costUsd;
    if (c === undefined && e instanceof Error && /^DataForSEO( \(4\d\d\)|:)/.test(e.message)) await refundDataSpend(tenantId, projectId, 'serp', `${AUTORIDAD_OP}: ${label}`, estimate);
    else if (c !== undefined && c > estimate) await recordDataSpend(tenantId, projectId, 'serp', `${AUTORIDAD_OP}: ${label} (ajuste)`, c - estimate);
    throw e;
  }
}

export async function runAutoridad(tenantId: string, projectId: string): Promise<Outcome> {
  const src = serpSource();
  if (!src?.links || !(await src.isConnected(tenantId).catch(() => false))) return { status: 'omitido', summary: 'DataForSEO no está conectado (Agentes → Integraciones).' };
  const d = await domains(tenantId, projectId);
  if (!d.client) return { status: 'omitido', summary: 'El proyecto no tiene web en su alcance.' };
  const month = monthStart();
  const done = new Set((await db.select({ domain: seoLinkSnapshots.domain }).from(seoLinkSnapshots).where(and(eq(seoLinkSnapshots.projectId, projectId), eq(seoLinkSnapshots.month, month)))).map((r) => r.domain));
  let calls = 0;
  let stopped = false;
  const links = src.links;
  for (const dom of [d.client, ...d.competitors]) {
    if (done.has(dom)) continue;
    const isClient = dom === d.client;
    const s = await spend(tenantId, projectId, `resumen ${dom}`, COST.summary, () => links.summary(tenantId, dom)).catch((e) => {
      console.error('[seo] autoridad: resumen', dom, e instanceof Error ? e.message : e);
      return undefined;
    });
    if (s === null) {
      stopped = true;
      break;
    }
    if (!s) continue;
    calls++;
    let newLost: { month: string; newDomains: number; lostDomains: number }[] = [];
    let gap: { domain: string; rank: number | null; linksTo: string[] }[] = [];
    let cost = s.costUsd;
    if (isClient) {
      const from = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
      const nl = await spend(tenantId, projectId, 'nuevos y perdidos', COST.newLost, () => links.newLost(tenantId, dom, from)).catch(() => undefined);
      if (nl) {
        newLost = nl.months.slice(-12);
        cost += nl.costUsd;
        calls++;
      }
      if (d.competitors.length >= 2) {
        const g = await spend(tenantId, projectId, 'huecos', COST.gap, () => links.intersection(tenantId, d.competitors, [dom], 100)).catch(() => undefined);
        if (g) {
          gap = filterGap(g.domains, d.competitors.length);
          cost += g.costUsd;
          calls++;
        }
      }
    }
    await db
      .insert(seoLinkSnapshots)
      .values({ tenantId, projectId, domain: dom, isClient, month, summary: s.summary as unknown as Record<string, unknown>, gap, newLost, costUsd: cost.toFixed(4) })
      .onConflictDoNothing();
  }
  await syncLinkFindings(tenantId, projectId).catch((e) => console.error('[seo] autoridad: hallazgos', e instanceof Error ? e.message : e));
  return { status: stopped ? 'aviso' : 'ok', summary: `${calls} consulta(s) de enlaces (${d.competitors.length} competidor(es) confirmado(s)).${stopped ? ' Parado por el tope de Autoridad del mes.' : ''}${d.competitors.length < 2 ? ' Con menos de 2 competidores confirmados no se buscan huecos.' : ''}` };
}

/** Un hallazgo por proyecto si hay 5 o más huecos de calidad: se propone «Conseguir enlaces externos». */
async function syncLinkFindings(tenantId: string, projectId: string): Promise<void> {
  const [c] = await db.select({ gap: seoLinkSnapshots.gap, month: seoLinkSnapshots.month }).from(seoLinkSnapshots).where(and(eq(seoLinkSnapshots.projectId, projectId), eq(seoLinkSnapshots.isClient, true))).orderBy(desc(seoLinkSnapshots.month)).limit(1);
  const gap = c?.gap ?? [];
  const out = gap.length >= 5 ? [{ kind: 'seo.link_gap', dedupeKey: `seo.link_gap:${projectId}`, metric: 'dominios', value: gap.length, evidence: { dominios: gap.slice(0, 15).map((g) => g.domain), mes: c?.month } }] : [];
  await syncFindings(tenantId, projectId, AUTORIDAD_SOURCE, out, ['seo.link_gap']);
}

/** Prueba de cobertura (admin, una vez al día): los dominios que enlazan al cliente según DataForSEO. */
export async function coverageTest(tenantId: string, projectId: string): Promise<{ ok: true; domains: string[]; total: number | null } | { ok: false; error: string }> {
  const src = serpSource();
  if (!src?.links) return { ok: false, error: 'DataForSEO no está conectado.' };
  const d = await domains(tenantId, projectId);
  if (!d.client) return { ok: false, error: 'El proyecto no tiene web en su alcance.' };
  const G = globalThis as unknown as { __kijuCoverage?: Map<string, string> };
  const today = new Date().toISOString().slice(0, 10);
  const seen = (G.__kijuCoverage ??= new Map());
  if (seen.get(projectId) === today) return { ok: false, error: 'La prueba de cobertura ya se hizo hoy en este proyecto.' };
  const links = src.links;
  const r = await spend(tenantId, projectId, 'prueba de cobertura', COST.coverage, () => links.referringDomains(tenantId, d.client!, 1000)).catch((e) => ({ error: e instanceof Error ? e.message : 'error' }));
  if (r === null) return { ok: false, error: 'No cabe en el tope de Autoridad de este mes.' };
  if ('error' in r) return { ok: false, error: 'DataForSEO no respondió. Inténtalo más tarde.' };
  seen.set(projectId, today);
  return { ok: true, domains: r.domains.slice(0, 500), total: r.total };
}

export type AutoridadView = {
  on: boolean;
  budget: number;
  spentOp: number;
  client: string | null;
  rows: { domain: string; isClient: boolean; month: string; summary: LinkSummary }[];
  gap: { domain: string; rank: number | null; linksTo: string[] }[];
  newLost: { month: string; newDomains: number; lostDomains: number }[];
  history: { month: string; referringDomains: number | null }[];
};

export async function getAutoridadView(tenantId: string, projectId: string): Promise<AutoridadView> {
  const [on, snaps, spent, budget, d] = await Promise.all([
    isAutoridadOn(tenantId, projectId),
    db.select().from(seoLinkSnapshots).where(and(eq(seoLinkSnapshots.projectId, projectId), eq(seoLinkSnapshots.tenantId, tenantId))).orderBy(desc(seoLinkSnapshots.month)).limit(80),
    canSpendOn(projectId, AUTORIDAD_OP, 0, Number.MAX_SAFE_INTEGER),
    autoridadBudget(),
    domains(tenantId, projectId)
  ]);
  const lastMonth = snaps[0]?.month ? String(snaps[0].month) : null;
  const latest = snaps.filter((s) => String(s.month) === lastMonth);
  const clientRow = latest.find((s) => s.isClient);
  return {
    on,
    budget,
    spentOp: spent.spentOp,
    client: d.client,
    rows: latest.map((s) => ({ domain: s.domain, isClient: s.isClient, month: String(s.month).slice(0, 7), summary: s.summary as unknown as LinkSummary })).sort((a, b) => Number(b.isClient) - Number(a.isClient) || (b.summary.referringDomains ?? 0) - (a.summary.referringDomains ?? 0)),
    gap: clientRow?.gap ?? [],
    newLost: clientRow?.newLost ?? [],
    history: snaps.filter((s) => s.isClient).map((s) => ({ month: String(s.month).slice(0, 7), referringDomains: (s.summary as unknown as LinkSummary).referringDomains })).reverse()
  };
}
