import 'server-only';

// Módulo Google Ads · datos de las pantallas del paso 2 (Hoy, Cartera y Cuenta). Funciones internas (no se exportan desde
// 'use server'): quien las llama ya comprobó el permiso. Sin llamadas a Google: todo sale de lo guardado. Las cifras van
// en la moneda de cada cuenta y nunca se suman entre monedas distintas.
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adsBudgets, adsCampaigns } from '@/lib/db/schema';
import { accountViews, type AdsAccountView } from '@/lib/ads/access';
import { coverageSummary, type AccountCoverage, type CoverageSummary } from '@/lib/ads/health';
import { KIND_INFO, MAX_POSTPONES, monthPace, morningCut, nextReviewDate, RESPONSE_LABEL, type FindingKind, type ResponseKind } from '@/lib/ads/finding-rules';
import * as fs from '@/lib/ads/findings-store';
import { addDays, zonedParts } from '@/lib/ads/rules';
import { getSettingsRow, lastChangeEvents } from '@/lib/ads/store';
import { auditStatusByAccount } from '@/lib/ads/audit-store';

const DEFAULT_TZ = 'Europe/Madrid';
const round2 = (v: number) => Math.round(v * 100) / 100;

// --- Hallazgos ---------------------------------------------------------------------------------------------------------

export type FindingResponseView = { response: string; label: string; reason: string | null; until: string | null; at: string; user: string | null };
export type FindingView = {
  id: string;
  kind: string;
  kindN: number;
  kindLabel: string;
  title: string;
  lines: string[];
  related: string[];
  accountId: string | null;
  accountName: string | null;
  campaignName: string | null;
  simulated: boolean;
  channel: string;
  recipient: string;
  severity: string;
  fyi: boolean;
  status: string;
  exposure: number | null;
  currency: string | null;
  confidence: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  daysOpen: number;
  silencedUntil: string | null;
  /** Silencio o espera vencidos: vuelve a pedir atención. */
  overdue: boolean;
  uncheckedSince: string | null;
  notifyState: string | null;
  resolvedAt: string | null;
  responses: FindingResponseView[];
  lastResponse: string | null;
  postponesLeft: number;
};

function toView(f: fs.FindingListRow, responses: fs.ResponseRow[], now: Date): FindingView {
  const ev = (f.evidence ?? {}) as { lines?: string[]; related?: string[]; fyi?: boolean; vencido?: boolean };
  const mine = responses.filter((r) => r.findingId === f.id);
  const last = mine[mine.length - 1]?.response ?? null;
  const info = KIND_INFO[f.kind as FindingKind];
  const overdue = (f.status === 'abierto' || f.status === 'silenciado') && Boolean(f.silencedUntil && f.silencedUntil < now && last);
  return {
    id: f.id,
    kind: f.kind,
    kindN: info?.n ?? 0,
    kindLabel: info?.label ?? f.kind,
    title: f.title,
    lines: Array.isArray(ev.lines) ? ev.lines.map(String) : [],
    related: Array.isArray(ev.related) ? ev.related.map(String) : [],
    accountId: f.accountId,
    accountName: f.accountName,
    campaignName: f.campaignName,
    simulated: Boolean(f.simulated),
    channel: f.channel,
    recipient: f.recipient,
    severity: f.severity,
    fyi: Boolean(ev.fyi),
    status: f.status,
    exposure: f.exposure === null ? null : Number(f.exposure),
    currency: f.currency,
    confidence: f.confidence,
    firstSeenAt: f.firstSeenAt.toISOString(),
    lastSeenAt: f.lastSeenAt.toISOString(),
    daysOpen: Math.max(0, Math.floor((now.getTime() - f.firstSeenAt.getTime()) / 86_400_000)),
    silencedUntil: f.silencedUntil?.toISOString() ?? null,
    overdue,
    uncheckedSince: f.uncheckedSince?.toISOString() ?? null,
    notifyState: f.notifyState,
    resolvedAt: f.resolvedAt?.toISOString() ?? null,
    responses: mine.map((r) => ({ response: r.response, label: RESPONSE_LABEL[r.response as ResponseKind] ?? r.response, reason: r.reason, until: r.until, at: r.createdAt.toISOString(), user: r.userName })),
    lastResponse: last,
    postponesLeft: Math.max(0, MAX_POSTPONES - mine.filter((r) => r.response === 'posponer').length)
  };
}

async function findingViews(tenantId: string, opts: { accountId?: string; includeClosedDays?: number }, simulatedMode: boolean, now: Date): Promise<FindingView[]> {
  const rows = (await fs.listFindings(tenantId, opts)).filter((f) => f.accountId === null || Boolean(f.simulated) === simulatedMode);
  const responses = await fs.responsesFor(tenantId, rows.map((r) => r.id));
  return rows.map((r) => toView(r, responses, now));
}

// --- Hoy ---------------------------------------------------------------------------------------------------------------

export type TodayView = {
  coverage: CoverageSummary;
  accounts: AdsAccountView[];
  changes: Awaited<ReturnType<typeof lastChangeEvents>>;
  shadow: boolean;
  evaluatedAt: string | null;
  unchecked: { accounts: number; lines: string[] };
  urgent: FindingView[];
  decide: { decisions: FindingView[]; fyi: FindingView[]; below: FindingView[] };
  waiting: FindingView[];
  overdue: FindingView[];
  following: FindingView[];
  technical: FindingView[];
};

export async function todayView(tenantId: string, now: Date = new Date()): Promise<TodayView> {
  const settings = await getSettingsRow(tenantId);
  const sim = settings?.authMode === 'sim';
  const coverage = await coverageSummary(tenantId, now);
  const accounts = (await accountViews(tenantId)).filter((a) => a.tracked);
  const all = await findingViews(tenantId, {}, sim, now);
  const live = all.filter((f) => f.status === 'abierto' || f.status === 'silenciado');
  const technical = live.filter((f) => f.recipient === 'tecnico' && f.status === 'abierto');
  const gestor = live.filter((f) => f.recipient !== 'tecnico');
  const overdue = gestor.filter((f) => f.overdue);
  const notOverdue = gestor.filter((f) => !f.overdue);
  const open = notOverdue.filter((f) => f.status === 'abierto');
  const urgent = open.filter((f) => f.channel === 'interrupcion');
  const parte = open.filter((f) => f.channel !== 'interrupcion');
  const cut = morningCut(parte.map((f) => ({ ...f, firstSeenAt: new Date(f.firstSeenAt) })));
  const back = (list: { id: string }[]) => list.map((x) => parte.find((f) => f.id === x.id)!);
  const silenced = notOverdue.filter((f) => f.status === 'silenciado');
  const waiting = silenced.filter((f) => f.lastResponse === 'esperando_cliente' || f.lastResponse === 'encargar');
  const following = silenced.filter((f) => !waiting.includes(f));
  // Reglas que no se pudieron comprobar (cabecera: «comprobadas X de Y»; aquí, cuántas cuentas tienen alguna regla ciega).
  const runs = await fs.listRuleRuns(tenantId);
  const tracked = new Set(accounts.map((a) => a.id));
  const blind = new Map<string, string[]>();
  for (const r of runs) if (r.outcome === 'no_comprobado' && r.accountId && tracked.has(r.accountId)) blind.set(r.accountId, [...(blind.get(r.accountId) ?? []), `${KIND_INFO[r.rule as FindingKind]?.label ?? r.rule}: ${r.reason ?? 'sin motivo'}`]);
  const lastEval = runs.map((r) => r.evaluatedAt.getTime()).sort((a, b) => b - a)[0];
  const names = new Map(accounts.map((a) => [a.id, a.name ?? a.customerIdLabel]));
  return {
    coverage,
    accounts,
    changes: await lastChangeEvents(tenantId, 10),
    shadow: !settings?.alertsEnabled,
    evaluatedAt: lastEval ? new Date(lastEval).toISOString() : null,
    unchecked: { accounts: blind.size, lines: [...blind].flatMap(([id, l]) => l.slice(0, 3).map((x) => `${names.get(id) ?? id} · ${x}`)).slice(0, 12) },
    urgent,
    decide: { decisions: back(cut.decisions), fyi: back(cut.fyi), below: back(cut.below) },
    waiting,
    overdue,
    following,
    technical
  };
}

// --- Cartera -----------------------------------------------------------------------------------------------------------

export type Measurement = 'rota' | 'sana' | 'sin_datos' | 'no_comprobado' | 'sin_evaluar';
export type PortfolioRow = {
  accountId: string;
  name: string;
  customerIdLabel: string;
  simulated: boolean;
  clientId: string | null;
  clientName: string | null;
  level: string | null;
  currency: string | null;
  checked: boolean;
  problems: string[];
  spentMonth: number;
  projection: number;
  reference: { amount: number; mode: 'acuerdo' | 'presupuestos' } | null;
  paceRatio: number | null;
  paceComplete: boolean;
  cpl30: number | null;
  conv30: number;
  target: { value: number; kind: 'acordado' | 'provisional' | 'linea_base' } | null;
  conv7: number;
  measurement: Measurement;
  measurementNote: string | null;
  openFindings: number;
  urgentFindings: number;
  lastChange: { at: string; actor: string; email: string | null } | null;
  lastReview: { at: string; by: string | null; note: string | null } | null;
  nextReview: string | null;
  reviewOverdue: boolean;
  goalKind: 'acordado' | 'provisional' | null;
  /** Paso 3: auditoría de higiene. «pendiente» = sin auditar o sin leer; «hecha» = leída. */
  audit: { state: 'sin_auditar' | 'por_leer' | 'leida'; at: string | null; mal: number; confirmar: number; regressed: number; pending: number };
};

export async function portfolioView(tenantId: string, now: Date = new Date(), onlyAccountId?: string): Promise<{ rows: PortfolioRow[]; coverage: CoverageSummary; currencies: string[] }> {
  const settings = await getSettingsRow(tenantId);
  const sim = settings?.authMode === 'sim';
  const coverage = await coverageSummary(tenantId, now);
  const accounts = (await accountViews(tenantId)).filter((a) => a.tracked && (!onlyAccountId || a.id === onlyAccountId));
  const ids = accounts.map((a) => a.id);
  const minToday = zonedParts(now, DEFAULT_TZ).date;
  const daily = await fs.dailyTotalsByAccount(ids, addDays(minToday, -125), addDays(minToday, 1));
  const covered = await fs.coveredDaysByAccount(ids, addDays(minToday, -125), addDays(minToday, 1));
  const budgets = ids.length ? await db.select().from(adsBudgets).where(and(eq(adsBudgets.tenantId, tenantId), inArray(adsBudgets.accountId, ids))) : [];
  const camps = ids.length ? await db.select().from(adsCampaigns).where(and(eq(adsCampaigns.tenantId, tenantId), inArray(adsCampaigns.accountId, ids))) : [];
  const goals = await fs.latestGoals(tenantId);
  const runs = await fs.listRuleRuns(tenantId);
  const findings = await findingViews(tenantId, {}, sim, now);
  const changes = await fs.lastChangeByAccount(tenantId);
  const reviews = await fs.lastReviews(tenantId);
  const audits = await auditStatusByAccount(tenantId, ids);
  const rows: PortfolioRow[] = accounts.map((a) => {
    const acc = coverage.accounts.find((c) => c.accountId === a.id) as AccountCoverage | undefined;
    // El día y el mes en la zona de cada cuenta, como las reglas (revisor, 28 nov).
    const tz = a.timeZone || DEFAULT_TZ;
    const today = zonedParts(now, tz).date;
    const yesterday = addDays(today, -1);
    const mine = daily.filter((d) => d.accountId === a.id);
    const cov = covered.get(a.id) ?? new Set<string>();
    const goal = a.clientId ? goals.get(a.clientId) : undefined;
    const pace = monthPace({
      today,
      covered: cov,
      daily: mine.map((d) => ({ campaignNativeId: '', day: d.day, cost: d.cost, impressions: 0, clicks: d.clicks, conversions: d.conversions })),
      goal: goal ? { kind: goal.kind as 'provisional' | 'acordado', cplMax: goal.cplMax ? Number(goal.cplMax) : null, budgetUsual: goal.budgetUsual ? Number(goal.budgetUsual) : null } : null,
      budgets: budgets.filter((b) => b.accountId === a.id).map((b) => ({ nativeId: b.nativeId, amount: b.amount ? Number(b.amount) : null, period: b.period, status: b.status })),
      campaigns: camps.filter((c) => c.accountId === a.id).map((c) => ({ nativeId: c.nativeId, name: c.name, status: c.status, servingStatus: c.servingStatus, channelType: c.channelType, budgetNativeId: c.budgetNativeId, startDate: c.startDate, endDate: c.endDate, adSchedule: c.adSchedule ?? null }))
    });
    const sum = (from: string, to: string, f: 'cost' | 'conversions') => mine.filter((d) => d.day >= from && d.day <= to).reduce((s, d) => s + d[f], 0);
    const cost30 = sum(addDays(today, -30), yesterday, 'cost');
    const conv30 = sum(addDays(today, -30), yesterday, 'conversions');
    const costBase = sum(addDays(today, -120), addDays(today, -31), 'cost');
    const convBase = sum(addDays(today, -120), addDays(today, -31), 'conversions');
    const target: PortfolioRow['target'] = goal?.cplMax ? { value: Number(goal.cplMax), kind: goal.kind as 'acordado' | 'provisional' } : convBase > 0 ? { value: round2(costBase / convBase), kind: 'linea_base' } : null;
    const m = runs.find((r) => r.accountId === a.id && r.rule === 'medicion_rota');
    const measurement: Measurement = !m ? 'sin_evaluar' : m.outcome === 'hallazgo' ? 'rota' : m.outcome === 'no_comprobado' ? 'no_comprobado' : m.reason?.startsWith('sin datos para afirmar') ? 'sin_datos' : 'sana';
    const f = findings.filter((x) => x.accountId === a.id && (x.status === 'abierto' || x.status === 'silenciado'));
    const ch = changes.get(a.id);
    const rv = reviews.get(a.id);
    const nextReview = rv?.nextReviewOn ?? null;
    return {
      accountId: a.id,
      name: a.name ?? a.customerIdLabel,
      customerIdLabel: a.customerIdLabel,
      simulated: a.simulated,
      clientId: a.clientId,
      clientName: a.clientName,
      level: a.level,
      currency: a.currency,
      checked: acc?.checked ?? false,
      problems: (acc?.problems ?? []).map((p) => `${p.label}: ${p.health}`),
      spentMonth: round2(sum(`${today.slice(0, 8)}01`, today, 'cost')),
      projection: pace.projection,
      reference: pace.reference,
      paceRatio: pace.ratio === null ? null : round2(pace.ratio),
      paceComplete: pace.complete,
      cpl30: conv30 > 0 ? round2(cost30 / conv30) : null,
      conv30: round2(conv30),
      target,
      conv7: round2(sum(addDays(today, -7), yesterday, 'conversions')),
      measurement,
      measurementNote: m?.reason ?? null,
      openFindings: f.length,
      urgentFindings: f.filter((x) => x.channel === 'interrupcion' && x.status === 'abierto').length,
      lastChange: ch ? { at: ch.changeAt.toISOString(), actor: ch.actorClass, email: ch.userEmail } : null,
      lastReview: rv ? { at: rv.reviewedAt.toISOString(), by: rv.reviewer, note: rv.note } : null,
      nextReview,
      reviewOverdue: !rv || (nextReview !== null && nextReview < today),
      goalKind: goal ? (goal.kind as 'acordado' | 'provisional') : null,
      audit: (() => {
        const au = audits.get(a.id);
        if (!au) return { state: 'sin_auditar' as const, at: null, mal: 0, confirmar: 0, regressed: 0, pending: 0 };
        return { state: au.readAt ? ('leida' as const) : ('por_leer' as const), at: au.createdAt.toISOString(), mal: au.mal, confirmar: au.confirmar, regressed: au.regressed, pending: au.pending };
      })()
    };
  });
  return { rows, coverage, currencies: [...new Set(rows.map((r) => r.currency).filter((c): c is string => Boolean(c)))] };
}

// --- Cuenta (expediente mínimo) ----------------------------------------------------------------------------------------

export type AccountDetail = {
  account: AdsAccountView;
  row: PortfolioRow | null;
  coverage: AccountCoverage | null;
  simulatedMode: boolean;
  goal: { version: number; kind: string; cplMax: number | null; budgetUsual: number | null; validFrom: string; baselineFrom: string | null; baselineTo: string | null; notes: string | null } | null;
  provisional: { allowed: boolean; reason: string | null };
  findings: FindingView[];
  changes: { at: string; email: string | null; actor: string; resourceType: string | null; operation: string | null; campaign: string | null; fields: string[] }[];
  reviews: { at: string; by: string | null; note: string | null; next: string | null }[];
  rules: { rule: string; label: string; outcome: string; reason: string | null; at: string }[];
  suggestedNextReview: string;
};

export async function accountDetail(tenantId: string, accountId: string, now: Date = new Date()): Promise<AccountDetail | null> {
  const settings = await getSettingsRow(tenantId);
  const sim = settings?.authMode === 'sim';
  const account = (await accountViews(tenantId)).find((a) => a.id === accountId);
  if (!account) return null;
  const portfolio = await portfolioView(tenantId, now, accountId);
  const goalRow = account.clientId ? await fs.latestGoal(tenantId, account.clientId) : null;
  const camps = await db.select({ nativeId: adsCampaigns.nativeId, name: adsCampaigns.name }).from(adsCampaigns).where(eq(adsCampaigns.accountId, accountId));
  const campName = new Map(camps.map((c) => [c.nativeId, c.name]));
  const today = zonedParts(now, DEFAULT_TZ).date;
  let provisional: AccountDetail['provisional'] = { allowed: true, reason: null };
  if (account.simulated) provisional = { allowed: false, reason: 'Las cuentas simuladas no tienen cliente: el objetivo es del cliente.' };
  else if (!account.clientId) provisional = { allowed: false, reason: 'Vincula antes la cuenta con su cliente (Ajustes de Google Ads): el objetivo es del cliente.' };
  else if (goalRow) provisional = { allowed: false, reason: goalRow.kind === 'provisional' ? 'Ya tiene un objetivo provisional congelado.' : 'Ya tiene un objetivo acordado con el cliente.' };
  else if (account.level === 'A') provisional = { allowed: false, reason: 'Un cliente de nivel A necesita un objetivo acordado: baja el nivel a B en Ajustes si quieres fijar uno provisional.' };
  return {
    account,
    row: portfolio.rows.find((r) => r.accountId === accountId) ?? null,
    coverage: portfolio.coverage.accounts.find((c) => c.accountId === accountId) ?? null,
    simulatedMode: sim,
    goal: goalRow ? { version: goalRow.version, kind: goalRow.kind, cplMax: goalRow.cplMax ? Number(goalRow.cplMax) : null, budgetUsual: goalRow.budgetUsual ? Number(goalRow.budgetUsual) : null, validFrom: goalRow.validFrom, baselineFrom: goalRow.frozenBaselineFrom, baselineTo: goalRow.frozenBaselineTo, notes: goalRow.notes } : null,
    provisional,
    findings: await findingViews(tenantId, { accountId, includeClosedDays: 30 }, sim, now),
    changes: (await fs.changesOf(accountId, 60)).map((c) => ({ at: c.changeAt.toISOString(), email: c.userEmail, actor: c.actorClass, resourceType: c.resourceType, operation: c.operation, campaign: c.campaignNativeId ? (campName.get(c.campaignNativeId) ?? c.campaignNativeId) : null, fields: c.changedFields.slice(0, 4) })),
    reviews: (await fs.listReviews(tenantId, accountId, 20)).map((r) => ({ at: r.reviewedAt.toISOString(), by: r.reviewer, note: r.note, next: r.nextReviewOn })),
    rules: (await fs.listRuleRuns(tenantId, accountId)).map((r) => ({ rule: r.rule, label: KIND_INFO[r.rule as FindingKind]?.label ?? r.rule, outcome: r.outcome, reason: r.reason, at: r.evaluatedAt.toISOString() })).sort((x, y) => (KIND_INFO[x.rule as FindingKind]?.n ?? 99) - (KIND_INFO[y.rule as FindingKind]?.n ?? 99)),
    suggestedNextReview: nextReviewDate(today, account.level)
  };
}
