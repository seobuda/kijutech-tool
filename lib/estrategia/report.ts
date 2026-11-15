import 'server-only';

// Módulo Estrategia: lo que se enseña (pestaña de la ficha, panel central, informe semanal y herramienta del agente).
import { getClient, listCoreClients } from '@/lib/core/clients';
import { kpiProvider, workSource, type KpiInfo, type WorkItem } from '@/lib/core/capabilities';
import type { EstHealthCheck, EstPlan } from '@/lib/db/schema';
import {
  HEALTH_LABEL,
  PROCESS,
  PROCESSES,
  WORK_CATEGORY_LABEL,
  addDays,
  addMonths,
  daysBetween,
  dependencyWarnings,
  frequencyLabel,
  madridNow,
  monthEnd,
  monthStart,
  perMonth,
  proposeTargets,
  type EffectiveProcess,
  type Health
} from '@/lib/estrategia/rules';
import {
  clientEffective,
  keywordHistory,
  latestHealth,
  listClientSettings,
  listKeywords,
  listObjectives,
  listPlans,
  listRuns,
  listSignals,
  listTrackedUrls,
  listWorkFacts,
  urlSummaries
} from '@/lib/estrategia/store';
import { evaluateObjective, loadCtx, searchTopQueries } from '@/lib/estrategia/processes';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export type ProcessView = EffectiveProcess & { label: string; description: string; cost: string; frequencies: number[]; phase: number; frequencyLabel: string; lastRunAt: string | null; nextRunAt: string | null; status: string | null; summary: string | null; lastError: string | null };
export type ObjectiveView = {
  id: string;
  title: string;
  kind: string;
  kpiKey: string | null;
  kpiLabel: string | null;
  format: 'int' | 'pct' | 'dec';
  lowerBetter: boolean;
  baseline: number | null;
  baselineYoy: number | null;
  target: number | null;
  targetLow: number | null;
  targetHigh: number | null;
  curve: string;
  start: string;
  due: string;
  status: string;
  priority: number;
  notes: string;
  health: Health;
  healthLabel: string;
  actual: number | null;
  expected: number | null;
  progressPct: number | null;
  note: string;
  elapsedPct: number;
};
export type TrackedView = { id: string; url: string; reason: string; changedOn: string; crawledOn: string | null; indexState: string | null; activeUntil: string; before: { clicks: number; impressions: number; days: number }; after: { clicks: number; impressions: number; days: number }; enoughData: boolean };
export type WorkView = { taskId: string; title: string; category: string; categoryLabel: string; urls: string[]; keywords: string[]; kpis: string[]; hours: number | null; doneOn: string; urlStatus: string; extraction: string };

export type ClientStrategy = {
  clientId: string;
  clientName: string;
  plans: { id: string; name: string; description: string }[];
  planId: string | null;
  pausedUntil: string | null;
  processes: ProcessView[];
  warnings: string[];
  objectives: ObjectiveView[];
  kpis: KpiInfo[];
  keywords: { id: string; keyword: string; targetUrl: string | null; critical: boolean; active: boolean; position: number | null; prevPosition: number | null; clicks: number | null; impressions: number | null; checkedOn: string | null; spark: (number | null)[] }[];
  health: { critico: HealthView | null; salud: HealthView | null; velocidad: HealthView | null };
  signals: { id: string; kind: string; severity: string; title: string; detail: string; status: string; firstSeen: string; lastSeen: string }[];
  work: WorkView[];
  pendingWork: { taskId: string; title: string; doneOn: string }[];
  tracked: TrackedView[];
  workload: Awaited<ReturnType<NonNullable<ReturnType<typeof workSource>>['workload']>> | null;
  hasGsc: boolean;
  today: string;
};
export type HealthView = { checkedAt: string; status: string; issues: EstHealthCheck['issues']; metrics: Record<string, unknown> };

const healthView = (h: EstHealthCheck | undefined): HealthView | null => (h ? { checkedAt: h.checkedAt.toISOString(), status: h.status, issues: h.issues, metrics: h.metrics } : null);

/** Todo lo de la pestaña «Estrategia» de un cliente. */
export async function clientStrategy(tenantId: string, clientId: string): Promise<ClientStrategy | null> {
  const client = await getClient(tenantId, clientId);
  if (!client) return null;
  const today = madridNow().date;
  const plans = await listPlans(tenantId);
  const eff = await clientEffective(tenantId, clientId);
  const kpis = kpiProvider()?.list() ?? [];
  const base: ClientStrategy = {
    clientId,
    clientName: client.name,
    plans: plans.map((p) => ({ id: p.id, name: p.name, description: p.description })),
    planId: eff?.plan.id ?? null,
    pausedUntil: eff?.settings.pausedUntil ?? null,
    processes: [],
    warnings: [],
    objectives: [],
    kpis,
    keywords: [],
    health: { critico: null, salud: null, velocidad: null },
    signals: [],
    work: [],
    pendingWork: [],
    tracked: [],
    workload: null,
    hasGsc: false,
    today
  };
  if (!eff) return base;
  const runs = await listRuns(tenantId, clientId);
  base.processes = eff.processes.map((p) => {
    const d = PROCESS[p.key];
    const r = runs.find((x) => x.process === p.key);
    return { ...p, label: d.label, description: d.description, cost: d.cost, frequencies: d.frequencies, phase: d.phase, frequencyLabel: frequencyLabel(p.every), lastRunAt: r?.lastRunAt?.toISOString() ?? null, nextRunAt: r?.nextRunAt.toISOString() ?? null, status: r?.status ?? null, summary: r?.summary ?? null, lastError: r?.lastError ?? null };
  });
  base.warnings = dependencyWarnings(eff.processes.filter((p) => p.runnable));
  const ctx = await loadCtx(tenantId, clientId);
  base.hasGsc = Boolean(ctx?.gsc);
  if (ctx) {
    for (const o of await listObjectives(tenantId, clientId)) {
      const info = kpis.find((k) => k.key === o.kpiKey) ?? null;
      const r = o.status === 'activo' ? await evaluateObjective(ctx, o).catch(() => null) : null;
      const health = (o.status === 'logrado' ? 'logrado' : r?.health ?? (o.lastHealth as Health) ?? 'sin_datos') as Health;
      const total = Math.max(1, daysBetween(o.startDate, o.dueDate));
      base.objectives.push({
        id: o.id,
        title: o.title,
        kind: o.kind,
        kpiKey: o.kpiKey,
        kpiLabel: info?.label ?? null,
        format: info?.format ?? 'int',
        lowerBetter: info?.lowerBetter ?? false,
        baseline: o.baselineValue,
        baselineYoy: o.baselineYoy,
        target: o.targetValue,
        targetLow: o.targetLow,
        targetHigh: o.targetHigh,
        curve: o.curve,
        start: o.startDate,
        due: o.dueDate,
        status: o.status,
        priority: o.priority,
        notes: o.notes ?? '',
        health,
        healthLabel: o.status === 'activo' ? HEALTH_LABEL[health] : o.status === 'logrado' ? 'Logrado' : o.status === 'no_logrado' ? 'No logrado' : 'Descartado',
        actual: r?.actual ?? o.lastValue,
        expected: r?.expected ?? null,
        progressPct: r?.progressPct ?? null,
        note: r?.note ?? '',
        elapsedPct: Math.max(0, Math.min(100, Math.round((daysBetween(o.startDate, today) / total) * 100)))
      });
    }
  }
  const words = await listKeywords(tenantId, clientId);
  const hist = await keywordHistory(words.map((w) => w.id), addDays(today, -60));
  base.keywords = words.map((w) => {
    const h = hist.filter((x) => x.keywordId === w.id);
    const spark: (number | null)[] = [];
    for (let i = 7; i >= 0; i--) {
      const to = addDays(today, -3 - i * 7);
      const xs = h.filter((x) => x.date > addDays(to, -7) && x.date <= to);
      const imp = xs.reduce((a, b) => a + b.impressions, 0);
      spark.push(imp > 0 ? Math.round((xs.reduce((a, b) => a + b.position * b.impressions, 0) / imp) * 10) / 10 : null);
    }
    return { id: w.id, keyword: w.keyword, targetUrl: w.targetUrl, critical: w.critical, active: w.active, position: w.lastPosition, prevPosition: w.prevPosition, clicks: w.lastClicks, impressions: w.lastImpressions, checkedOn: w.lastCheckedOn, spark };
  });
  const h = await latestHealth(tenantId, clientId);
  base.health = { critico: healthView(h.latest.critico), salud: healthView(h.latest.salud), velocidad: healthView(h.latest.velocidad) };
  base.signals = (await listSignals(tenantId, clientId))
    .filter((s) => s.status === 'abierta' || Date.now() - s.lastSeenAt.getTime() < 30 * 86_400_000)
    .map((s) => ({ id: s.id, kind: s.kind, severity: s.severity, title: s.title, detail: s.detail ?? '', status: s.status, firstSeen: s.firstSeenAt.toISOString(), lastSeen: s.lastSeenAt.toISOString() }));
  const facts = await listWorkFacts(tenantId, clientId);
  base.work = facts.map((f) => ({ taskId: f.taskId, title: f.title, category: f.category, categoryLabel: WORK_CATEGORY_LABEL[f.category as keyof typeof WORK_CATEGORY_LABEL] ?? f.category, urls: f.urls, keywords: f.keywords, kpis: f.kpis, hours: f.hours !== null ? Number(f.hours) : null, doneOn: f.doneOn, urlStatus: f.urlStatus, extraction: f.extraction }));
  // Encargos terminados aún sin procesar (p. ej. anteriores a activar el plan): se pueden añadir a mano.
  const ws = workSource();
  if (ws) {
    const done: WorkItem[] = await ws.clientCompleted(tenantId, clientId, 90).catch(() => []);
    const known = new Set(facts.map((f) => f.taskId));
    base.pendingWork = done.filter((d) => !known.has(d.taskId)).slice(-30).reverse().map((d) => ({ taskId: d.taskId, title: d.title, doneOn: madridNow(new Date(d.doneAt)).date }));
    base.workload = await ws.workload(tenantId, clientId).catch(() => null);
  }
  const tracked = await listTrackedUrls(tenantId, clientId);
  const daily = await urlSummaries(tracked.map((t) => t.id));
  base.tracked = tracked.map((t) => {
    const xs = daily.filter((d) => d.id === t.id);
    const start = t.crawledOn ?? t.changedOn;
    const before = xs.filter((d) => d.date < t.changedOn && d.date >= addDays(t.changedOn, -28));
    const after = xs.filter((d) => d.date >= start);
    const sum = (a: typeof xs) => ({ clicks: a.reduce((s, d) => s + d.clicks, 0), impressions: a.reduce((s, d) => s + d.impressions, 0), days: a.length });
    const b = sum(before);
    const a = sum(after);
    return { id: t.id, url: t.url, reason: t.reason ?? '', changedOn: t.changedOn, crawledOn: t.crawledOn, indexState: t.indexState, activeUntil: t.activeUntil, before: b, after: a, enoughData: a.days >= 28 && b.days >= 14 && b.impressions + a.impressions >= 100 };
  });
  return base;
}

/** Partida de un objetivo: media mensual de los 3 últimos meses completos (y la del mismo tramo del año pasado) y metas orientativas. */
export async function objectiveBaseline(tenantId: string, clientId: string, kpiKey: string, months: number) {
  const prov = kpiProvider();
  const info = prov?.list().find((k) => k.key === kpiKey);
  if (!prov || !info) return null;
  const last = await prov.lastDay(tenantId, clientId, kpiKey);
  if (!last) return { info, baseline: null, yoy: null, proposals: null, last: null };
  // Último mes completo con datos: si el último día no es fin de mes, el mes anterior.
  const lastFull = monthEnd(last) === last ? monthStart(last) : addMonths(monthStart(last), -1);
  const ms = [addMonths(lastFull, -2), addMonths(lastFull, -1), lastFull];
  const ranges = [...ms, ...ms.map((m) => addMonths(m, -12))].map((m) => ({ from: m, to: monthEnd(m) }));
  const vals = await prov.values(tenantId, clientId, kpiKey, ranges);
  const avg = (xs: (number | null)[], mm: string[]) => {
    const ok = xs.map((v, i) => (v === null ? null : info.summable ? perMonth(v, daysBetween(mm[i], monthEnd(mm[i])) + 1, true)! : v)).filter((v): v is number => v !== null);
    return ok.length ? Math.round((ok.reduce((a, b) => a + b, 0) / ok.length) * 100) / 100 : null;
  };
  const baseline = avg(vals.slice(0, 3), ms);
  const yoy = avg(vals.slice(3), ms.map((m) => addMonths(m, -12)));
  return { info, baseline, yoy, proposals: baseline !== null ? proposeTargets(baseline, months, info.lowerBetter) : null, last };
}

/** Consultas con más impresiones que aún no se siguen (para «Sugerir palabras»). */
export async function suggestKeywords(tenantId: string, clientId: string): Promise<{ keyword: string; impressions: number; clicks: number; position: number }[]> {
  const ctx = await loadCtx(tenantId, clientId);
  if (!ctx?.gsc) return [];
  const have = new Set((await listKeywords(tenantId, clientId)).map((k) => k.keyword));
  const rows = await searchTopQueries(ctx, 60);
  return rows.filter((r) => !have.has(r.keyword)).slice(0, 40);
}

export type OverviewRow = {
  clientId: string;
  name: string;
  plan: string;
  planId: string;
  paused: string | null;
  health: Partial<Record<Health, number>>;
  objectives: number;
  signals: { critico: number; aviso: number; info: number };
  web: string | null;
  errors: number;
  hours: { used: number | null; contracted: number | null };
  lastRun: string | null;
};

/** Panel central: todos los clientes con seguimiento. */
export async function strategyOverview(tenantId: string): Promise<{ rows: OverviewRow[]; withoutPlan: { id: string; name: string; status: string }[]; plans: EstPlan[] }> {
  const [settings, plans, clients, signals, objectives, runs] = await Promise.all([listClientSettings(tenantId), listPlans(tenantId), listCoreClients(tenantId), listSignals(tenantId, undefined, { open: true }), listObjectives(tenantId), listRuns(tenantId)]);
  const planName = new Map(plans.map((p) => [p.id, p.name]));
  const byId = new Map(clients.map((c) => [c.id, c]));
  const ws = workSource();
  const rows: OverviewRow[] = [];
  for (const s of settings) {
    const c = byId.get(s.clientId);
    if (!c) continue;
    const objs = objectives.filter((o) => o.clientId === s.clientId && o.status === 'activo');
    const health: Partial<Record<Health, number>> = {};
    for (const o of objs) {
      const h = (o.lastHealth ?? 'sin_datos') as Health;
      health[h] = (health[h] ?? 0) + 1;
    }
    const sig = signals.filter((x) => x.clientId === s.clientId);
    const myRuns = runs.filter((r) => r.clientId === s.clientId);
    const crit = myRuns.find((r) => r.process === 'critico');
    const w = ws ? await ws.workload(tenantId, s.clientId).catch(() => null) : null;
    const last = myRuns.map((r) => r.lastRunAt?.toISOString() ?? '').sort().pop() || null;
    rows.push({
      clientId: s.clientId,
      name: c.name,
      plan: planName.get(s.planId) ?? '—',
      planId: s.planId,
      paused: s.pausedUntil,
      health,
      objectives: objs.length,
      signals: { critico: sig.filter((x) => x.severity === 'critico').length, aviso: sig.filter((x) => x.severity === 'aviso').length, info: sig.filter((x) => x.severity === 'info').length },
      web: crit ? (crit.status === 'ok' ? 'ok' : crit.status) : null,
      errors: myRuns.filter((r) => r.errorCount > 0).length,
      hours: { used: w?.hoursMonth ?? null, contracted: w?.monthlyHours ?? null },
      lastRun: last
    });
  }
  const has = new Set(settings.map((s) => s.clientId));
  return { rows: rows.sort((a, b) => a.name.localeCompare(b.name, 'es')), withoutPlan: clients.filter((c) => !has.has(c.id) && c.status !== 'baja').map((c) => ({ id: c.id, name: c.name, status: c.status })), plans };
}

/** Coste estimado de un plan al mes (fase 1: casi todo es gratis; la extracción usa un modelo muy barato). */
export function planCostNote(processes: Record<string, { on: boolean; every: number }>): string {
  const on = PROCESSES.filter((p) => processes[p.key]?.on);
  const ai = on.filter((p) => p.cost === 'ia' && p.phase > 1);
  const parts = ['Procesos de la fase 1: sin coste de IA (la extracción de encargos, céntimos al mes).'];
  if (ai.length) parts.push(`Con el estratega y los informes (fases 2 y 3) se estima ≈ ${on.some((p) => p.key === 'estratega' && processes.estratega.every <= 7) ? '1,5-2' : '0,6-1'} $/cliente/mes.`);
  if (on.some((p) => p.cost === 'dataforseo')) parts.push('La competencia usará DataForSEO (pocos dólares al mes).');
  return parts.join(' ');
}

/** Apartado del informe semanal: clientes con algo que contar (objetivos que empeoran, problemas en la web, oportunidades). */
export async function weeklyLines(tenantId: string): Promise<string[] | null> {
  const { rows } = await strategyOverview(tenantId);
  if (!rows.length) return null;
  const lines: string[] = [];
  for (const r of rows) {
    const bits: string[] = [];
    const bad = (r.health.desviado ?? 0) + (r.health.en_riesgo ?? 0) + (r.health.vencido ?? 0);
    if (r.objectives) bits.push(`objetivos: ${r.health.en_camino ?? 0} en camino${bad ? `, <b>${bad} mal</b>` : ''}${r.health.logrado ? `, ${r.health.logrado} logrado(s)` : ''}`);
    if (r.signals.critico) bits.push(`🚨 ${r.signals.critico} problema(s) crítico(s)`);
    if (r.signals.aviso) bits.push(`⚠️ ${r.signals.aviso} aviso(s)`);
    if (r.signals.info) bits.push(`${r.signals.info} oportunidad(es)`);
    if (bits.length) lines.push(`• <b>${esc(r.name)}</b> (${esc(r.plan)}): ${bits.join(' · ')}`);
  }
  return lines.length ? lines : [`${rows.length} cliente(s) con seguimiento, sin novedades.`];
}

/** Texto para el agente: plan, objetivos, señales abiertas y salud de la web de un cliente. */
export async function strategyText(tenantId: string, clientId: string): Promise<string | null> {
  const s = await clientStrategy(tenantId, clientId);
  if (!s) return null;
  if (!s.planId) return `${s.clientName} no tiene seguimiento de estrategia activo (se activa en su ficha → Estrategia eligiendo un plan).`;
  const plan = s.plans.find((p) => p.id === s.planId)?.name ?? '';
  const out = [`Estrategia de ${s.clientName} (plan «${plan}»${s.pausedUntil ? `, en pausa hasta el ${s.pausedUntil}` : ''}).`];
  const fmt = (v: number | null) => (v === null ? '—' : Math.round(v * 10) / 10);
  if (s.objectives.length) {
    out.push('Objetivos:');
    for (const o of s.objectives) out.push(`- ${o.title}: ${o.healthLabel}${o.kind === 'kpi' ? ` (${o.kpiLabel}: partida ${fmt(o.baseline)}, ahora ${fmt(o.actual)}, meta ${fmt(o.target)} el ${o.due})` : ` (fecha ${o.due})`}${o.note ? `. ${o.note}` : ''}`);
  } else out.push('Sin objetivos.');
  const open = s.signals.filter((x) => x.status === 'abierta');
  if (open.length) {
    out.push(`Señales abiertas (${open.length}):`);
    for (const x of open.slice(0, 15)) out.push(`- [${x.severity}] ${x.title}`);
  }
  const web = s.health.critico;
  if (web) out.push(`Web: ${web.status === 'ok' ? 'correcta' : web.issues.map((i) => i.detail).join('; ')} (comprobada ${web.checkedAt.slice(0, 10)}).`);
  if (s.keywords.length) out.push(`Palabras clave seguidas: ${s.keywords.slice(0, 15).map((k) => `${k.keyword} (${k.position === null ? 'sin datos' : `pos. ${fmt(k.position)}`})`).join(', ')}.`);
  if (s.work.length) out.push(`Trabajo reciente: ${s.work.slice(0, 8).map((w) => `${w.doneOn} ${w.categoryLabel}: ${w.title}`).join(' | ')}.`);
  return out.join('\n');
}

