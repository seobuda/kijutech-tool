import 'server-only';

// Módulo Estrategia, fase 2: el estratega. Una vez por semana (o cada 15 días, según el plan), ante una alerta grave o
// a mano, prepara el EXPEDIENTE de un cliente (objetivos, cifras, señales, palabras clave, consultas y páginas de
// Search Console, salud de la web, trabajo hecho con su antes y después, encargos abiertos, horas, propuestas
// anteriores con sus motivos y lo que suele tardar el equipo) y se lo da a Opus, que devuelve propuestas en JSON.
// El código valida cada propuesta (evidencia que esté en el expediente, sin duplicar trabajo, horas del equipo,
// prioridad ICE y recorte a las horas que quedan) y las manda por Telegram con botones: crear encargo, ajustar, más
// adelante o no (con motivo). Nunca cambia nada en la web del cliente; los encargos se crean solo con aprobación.
//
// Los análisis van en cola (est_analyses): el planificador solo los pide y un trabajador aparte los hace de uno en
// uno, para que una llamada larga a Opus no frene el resto de procesos.
import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiJobs, estAnalyses, estSuggestions, type EstAnalysis, type EstSuggestion } from '@/lib/db/schema';
import { externalEvents, kpiProvider, projectDossierSections, telegramOutbound, workSource } from '@/lib/core/capabilities';
import { getClientSheet, sheetText } from '@/lib/core/clients';
import { recordIntervention } from '@/lib/core/interventions';
import { techniqueFromCategory } from '@/lib/core/techniques';
import { callAI, getPrompt } from '@/lib/ai/gateway';
import { extractJsonFromLLMResponse } from '@/lib/ai/parsers/json-extractor';
import { publicError } from '@/lib/errors';
import { addDays, madridNow, PROCESS, WORK_CATEGORY_LABEL } from '@/lib/estrategia/rules';
import {
  DEFAULT_STRATEGIST,
  REJECT_REASONS,
  analysisKeyboard,
  analysisMessage,
  cleanStrategistOutput,
  cleanStrategistSettings,
  estimateHours,
  fitToHours,
  fmtHours,
  iceScore,
  isDuplicate,
  normQuery,
  normUrl,
  qualityStats,
  reasonKeyboard,
  validEvidence,
  type Button,
  type Effort,
  type EvidenceRefs,
  type RejectReason,
  type StrategistSettings
} from '@/lib/estrategia/strategist-rules';
import { clientEffective, getSettings, listSignals, patchSettingsState } from '@/lib/estrategia/store';
import { aiSpentThisMonth, seoCoverage, loadCtx, search, type Ctx } from '@/lib/estrategia/processes';
import { clientStrategy } from '@/lib/estrategia/report';

export const STRATEGIST_PROMPT = 'est_strategist';
export const STRATEGIST_MODEL = 'claude-opus-5-5';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const untrusted = (s: string) => `<<<DATO NO FIABLE ${s.replace(/<<<|>>>/g, '')} FIN>>>`;
const BASE_URL = () => (process.env.BASE_URL || '').replace(/\/$/, '');
const tabUrl = (clientId: string) => (BASE_URL() ? `${BASE_URL()}/dashboard/clientes/${clientId}?tab=estrategia` : null);

export class StrategistError extends Error {
  constructor(public userMessage: string) {
    super(userMessage);
  }
}

// --- Ajustes (en est_settings.state, sin tocar la tabla) -----------------------------------------------------------

export async function strategistSettings(tenantId: string): Promise<StrategistSettings> {
  return cleanStrategistSettings((await getSettings(tenantId)).state.strategist ?? DEFAULT_STRATEGIST);
}

export async function saveStrategistSettings(tenantId: string, input: unknown): Promise<StrategistSettings> {
  const clean = cleanStrategistSettings(input);
  await patchSettingsState(tenantId, { strategist: clean });
  return clean;
}

async function setAwaiting(tenantId: string, chatId: string, value: { id: string; mode: 'ajustar' | 'motivo' } | null): Promise<void> {
  const cur = (await getSettings(tenantId)).state.awaiting ?? {};
  const next = { ...cur };
  // Lo que lleva más de un día esperando ya no vale.
  for (const [k, v] of Object.entries(next)) if (Date.now() - Date.parse(v.at) > 86_400_000) delete next[k];
  if (value) next[chatId] = { ...value, at: new Date().toISOString() };
  else delete next[chatId];
  await patchSettingsState(tenantId, { awaiting: next });
}

// --- Cola de análisis -----------------------------------------------------------------------------------------------

/** Pide un análisis de un cliente. Si ya hay uno en cola o en marcha, no se duplica. */
export async function queueAnalysis(tenantId: string, clientId: string, trigger: 'programado' | 'alerta' | 'manual', opts: { reason?: string; by?: string } = {}): Promise<{ ok: boolean; message: string; id: string | null }> {
  // Solo clientes de la cuenta con plan de seguimiento (el cliente puede venir de una acción web).
  const eff = await clientEffective(tenantId, clientId);
  if (!eff) return { ok: false, message: 'Ese cliente no tiene plan de seguimiento: actívalo antes en Estrategia.', id: null };
  const [open] = await db
    .select({ id: estAnalyses.id })
    .from(estAnalyses)
    .where(and(eq(estAnalyses.tenantId, tenantId), eq(estAnalyses.clientId, clientId), inArray(estAnalyses.status, ['pendiente', 'en_curso'])))
    .limit(1);
  if (open) return { ok: false, message: 'Ya hay un análisis de este cliente en marcha.', id: open.id };
  const [row] = await db
    .insert(estAnalyses)
    .values({ tenantId, clientId, trigger, reason: opts.reason?.slice(0, 500) ?? null, requestedBy: opts.by?.slice(0, 120) ?? null })
    .returning({ id: estAnalyses.id });
  return { ok: true, message: 'Análisis en cola: tardará unos minutos.', id: row.id };
}

/** Proceso «estratega» del plan: pide el análisis programado (lo hace el trabajador de la cola). */
export async function runEstratega(ctx: Ctx): Promise<{ status: 'ok' | 'omitido'; summary: string }> {
  const r = await queueAnalysis(ctx.tenantId, ctx.clientId, 'programado');
  return { status: r.ok ? 'ok' : 'omitido', summary: r.ok ? 'Análisis del estratega en cola.' : r.message };
}

/**
 * Análisis por alerta (objetivo que pasa a desviado, caída fuerte): solo si el plan lo incluye, como mucho
 * «alertsPerMonth» al mes por cliente y nunca si hubo otro análisis en los últimos 3 días.
 */
export async function maybeAlertAnalysis(ctx: Ctx, reason: string): Promise<boolean> {
  if (!ctx.processes.some((p) => p.key === 'alerta_estratega' && p.on && p.runnable)) return false;
  const cfg = await strategistSettings(ctx.tenantId);
  if (cfg.alertsPerMonth <= 0) return false;
  const monthStart = new Date(`${ctx.today.slice(0, 7)}-01T00:00:00Z`);
  const recent = await db
    .select({ trigger: estAnalyses.trigger, createdAt: estAnalyses.createdAt })
    .from(estAnalyses)
    .where(and(eq(estAnalyses.clientId, ctx.clientId), gte(estAnalyses.createdAt, new Date(Math.min(monthStart.getTime(), Date.now() - 3 * 86_400_000)))));
  if (recent.some((r) => Date.now() - r.createdAt.getTime() < 3 * 86_400_000)) return false;
  if (recent.filter((r) => r.trigger === 'alerta' && r.createdAt >= monthStart).length >= cfg.alertsPerMonth) return false;
  return (await queueAnalysis(ctx.tenantId, ctx.clientId, 'alerta', { reason })).ok;
}

const G = globalThis as unknown as { __kijuEstWorker?: Set<string>; __kijuEstSweep?: Map<string, number> };

/** Trabajador de la cola: un análisis cada vez por cuenta. Cada hora caduca las propuestas viejas. */
export async function runPendingAnalyses(tenantId: string, now = new Date()): Promise<number> {
  const busy = (G.__kijuEstWorker ??= new Set());
  if (busy.has(tenantId)) return 0;
  busy.add(tenantId);
  try {
    const sweep = (G.__kijuEstSweep ??= new Map());
    if (Date.now() - (sweep.get(tenantId) ?? 0) > 3_600_000) {
      sweep.set(tenantId, Date.now());
      await sweepSuggestions(tenantId, now);
    }
    // Un análisis que lleva más de 15 minutos «en curso» se cortó (reinicio): se marca como fallido.
    await db
      .update(estAnalyses)
      .set({ status: 'error', error: 'Se interrumpió (reinicio del servidor). Vuelve a pedirlo.', finishedAt: now })
      .where(and(eq(estAnalyses.tenantId, tenantId), eq(estAnalyses.status, 'en_curso'), lt(estAnalyses.startedAt, new Date(now.getTime() - 15 * 60_000))));
    const [next] = await db
      .select()
      .from(estAnalyses)
      .where(and(eq(estAnalyses.tenantId, tenantId), eq(estAnalyses.status, 'pendiente')))
      .orderBy(asc(estAnalyses.createdAt))
      .limit(1);
    if (!next) return 0;
    await executeAnalysis(next, now);
    return 1;
  } finally {
    busy.delete(tenantId);
  }
}

/** Caduca las pendientes viejas. Las aplazadas cuyo plazo pasó dejan de contar como repetidas: se pueden volver a proponer. */
async function sweepSuggestions(tenantId: string, now: Date): Promise<void> {
  const cfg = await strategistSettings(tenantId);
  await db
    .update(estSuggestions)
    .set({ status: 'caducada', updatedAt: now })
    .where(and(eq(estSuggestions.tenantId, tenantId), eq(estSuggestions.status, 'pendiente'), lt(estSuggestions.createdAt, new Date(now.getTime() - cfg.expireDays * 86_400_000))));
}

// --- Expediente -----------------------------------------------------------------------------------------------------

export type Dossier = {
  text: string;
  refs: EvidenceRefs;
  objectiveCodes: Map<string, string>;
  existingTitles: string[];
  workTypes: Set<string>;
  effort: Effort;
  remainingHours: number | null;
  clientName: string;
};

const pctChange = (cur: number | null, prev: number | null): string => (cur === null || prev === null || prev === 0 ? '' : `${cur >= prev ? '+' : ''}${Math.round(((cur - prev) / prev) * 100)} %`);
// Los porcentajes de Rendimiento ya vienen en escala 0-100 (ratio() de lib/rendimiento/rules.ts): no se multiplican.
const fmtNum = (v: number | null, format: string): string => (v === null ? '—' : format === 'pct' ? `${Math.round(v * 10) / 10} %` : format === 'dec' ? String(Math.round(v * 10) / 10) : String(Math.round(v)));

/** Todo lo que el estratega necesita saber del cliente, en texto, y lo que se puede citar como evidencia. */
export async function buildDossier(tenantId: string, clientId: string, now = new Date()): Promise<Dossier | null> {
  const ctx = await loadCtx(tenantId, clientId, now);
  const view = await clientStrategy(tenantId, clientId);
  if (!ctx || !view) return null;
  const today = ctx.today;
  const ws = workSource();
  const refs: EvidenceRefs = { urls: new Set(), queries: new Set(), signals: new Set(), objectives: new Set(), keywords: new Set(), kpis: new Set() };
  const addUrl = (u: string | null | undefined) => u && refs.urls.add(normUrl(u));
  const out: string[] = [];
  const section = (title: string, lines: string[]) => {
    if (lines.length) out.push(`## ${title}\n${lines.join('\n')}`);
  };

  // Cliente y ficha.
  const sheet = await getClientSheet(tenantId, clientId).catch(() => null);
  const planName = view.plans.find((p) => p.id === view.planId)?.name ?? '—';
  section('Cliente', [`Nombre: ${view.clientName}`, `Plan de seguimiento: ${planName}`, `Webs: ${ctx.homes.join(', ') || '(sin web en la ficha)'}`, `Search Console: ${ctx.gsc ? 'conectado' : 'no disponible'}`]);
  if (sheet) section('Ficha del cliente (sector, servicios, público, objetivos de negocio, memoria)', [untrusted(sheetText(sheet, { withContract: false }).slice(0, 5000))]);

  // Horas.
  const w = view.workload;
  const remainingHours = w?.monthlyHours ? Math.max(0, Math.round((w.monthlyHours - (w.hoursMonth ?? 0)) * 2) / 2) : null;
  section('Horas', [
    `Contratadas al mes: ${w?.monthlyHours ?? 'sin dato'} · llevadas este mes: ${w?.hoursMonth ?? 'sin dato'} · quedan: ${remainingHours ?? 'sin dato'}`,
    `Encargos abiertos: ${w?.openTasks ?? 'sin dato'} · encargos planificados en los próximos días: ${w?.upcoming ?? 'sin dato'}`
  ]);

  // Objetivos.
  const objectiveCodes = new Map<string, string>();
  const objLines: string[] = [];
  view.objectives
    .filter((o) => o.status === 'activo')
    .forEach((o, i) => {
      const code = `O${i + 1}`;
      objectiveCodes.set(code, o.id);
      refs.objectives.add(code);
      objLines.push(`[${code}] ${o.title} · ${o.kpiLabel ?? o.kind} · partida ${fmtNum(o.baseline, o.format)} → meta ${fmtNum(o.target, o.format)} (rango ${fmtNum(o.targetLow, o.format)}–${fmtNum(o.targetHigh, o.format)}) · del ${o.start} al ${o.due} (${o.elapsedPct} % del plazo) · estado: ${o.healthLabel} · actual ${fmtNum(o.actual, o.format)}, esperado hoy ${fmtNum(o.expected, o.format)}${o.note ? ` · ${o.note}` : ''}`);
    });
  section('Objetivos activos (cita su código: O1, O2…)', objLines.length ? objLines : ['(no tiene objetivos activos)']);

  // Cifras: 28 días frente a los 28 anteriores y al mismo tramo del año pasado.
  const prov = kpiProvider();
  const kpiLines: string[] = [];
  for (const k of prov?.list() ?? []) {
    const last = await prov!.lastDay(tenantId, clientId, k.key).catch(() => null);
    if (!last) continue;
    const r = (from: string, to: string) => ({ from, to });
    const ranges = [r(addDays(last, -27), last), r(addDays(last, -55), addDays(last, -28)), r(addDays(last, -27 - 364), addDays(last, -364))];
    const [cur, prev, yoy] = await prov!.values(tenantId, clientId, k.key, ranges).catch(() => [null, null, null]);
    if (cur === null) continue;
    refs.kpis.add(normQuery(k.key));
    refs.kpis.add(normQuery(k.label));
    kpiLines.push(`${k.label} (${k.key}): ${fmtNum(cur, k.format)} · antes ${fmtNum(prev, k.format)} ${pctChange(cur, prev)} · año pasado ${fmtNum(yoy, k.format)} ${pctChange(cur, yoy)}${k.lowerBetter ? ' (menos es mejor)' : ''}`);
  }
  section(`Cifras (28 días hasta el último dato frente a los 28 anteriores y al año pasado)`, kpiLines.length ? kpiLines : ['(sin datos de Google asignados)']);

  // Señales abiertas, con su evidencia.
  const signals = (await listSignals(tenantId, clientId, { open: true })).slice(0, 40);
  const sigLines = signals.map((s, i) => {
    const code = `S${i + 1}`;
    refs.signals.add(code);
    const ev = s.evidence as Record<string, unknown>;
    for (const v of Object.values(ev)) if (typeof v === 'string' && /^https?:\/\//.test(v)) addUrl(v);
    if (typeof ev.query === 'string') refs.queries.add(normQuery(ev.query));
    if (typeof ev.page === 'string') addUrl(ev.page);
    return `[${code}] ${s.severity} · ${s.kind} · ${untrusted(s.title)}${s.detail ? ` · ${untrusted(s.detail.slice(0, 300))}` : ''} · datos: ${JSON.stringify(ev).slice(0, 300)} · vista desde ${s.firstSeenAt.toISOString().slice(0, 10)}`;
  });
  section('Señales abiertas (oportunidades y problemas detectados; cita su código: S1, S2…)', sigLines.length ? sigLines : ['(ninguna)']);

  // Palabras clave seguidas.
  const kwLines = view.keywords
    .filter((k) => k.active)
    .slice(0, 60)
    .map((k) => {
      refs.keywords.add(normQuery(k.keyword));
      addUrl(k.targetUrl);
      return `${untrusted(k.keyword)} · posición ${k.position ?? '—'} (antes ${k.prevPosition ?? '—'}) · clics ${k.clicks ?? '—'} · impresiones ${k.impressions ?? '—'}${k.targetUrl ? ` · URL objetivo ${k.targetUrl}` : ''}${k.critical ? ' · crítica' : ''}`;
    });
  section('Palabras clave que sigue el cliente (últimas 4 semanas)', kwLines.length ? kwLines : ['(ninguna)']);

  // Consultas y páginas de Search Console.
  if (ctx.gsc) {
    const to = addDays(today, -3);
    const [queries, pages] = await Promise.all([
      search(ctx, { from: addDays(to, -27), to, dimensions: ['query'], limit: 300 }).catch(() => []),
      search(ctx, { from: addDays(to, -27), to, dimensions: ['page'], limit: 100 }).catch(() => [])
    ]);
    const qLines = queries
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 40)
      .map((q) => {
        const key = String(q.keys[0] ?? '');
        refs.queries.add(normQuery(key));
        return `${untrusted(key)} · clics ${Math.round(q.clicks)} · impresiones ${Math.round(q.impressions)} · CTR ${Math.round(q.ctr * 1000) / 10} % · posición ${Math.round(q.position * 10) / 10}`;
      });
    section(`Consultas con más impresiones en Google (del ${addDays(to, -27)} al ${to})`, qLines);
    const pLines = pages
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 25)
      .map((p) => {
        const url = String(p.keys[0] ?? '');
        addUrl(url);
        return `${url} · clics ${Math.round(p.clicks)} · impresiones ${Math.round(p.impressions)} · CTR ${Math.round(p.ctr * 1000) / 10} % · posición ${Math.round(p.position * 10) / 10}`;
      });
    section(`Páginas con más clics (mismo periodo)`, pLines);
  }

  // Salud de la web (si la vigila el módulo SEO, va en su apartado del proyecto y aquí no se repite lo antiguo).
  const hLines: string[] = [];
  const seoCovers = await seoCoverage(tenantId, clientId).catch(() => new Set<string>());
  for (const kind of (['critico', 'salud', 'velocidad'] as const).filter((k) => !seoCovers.has(k))) {
    const h = view.health[kind];
    if (!h) continue;
    hLines.push(`${kind} (${h.checkedAt.slice(0, 10)}): ${h.status}`);
    for (const i of h.issues.slice(0, 15)) {
      addUrl(i.url);
      hLines.push(`  - ${i.severity} · ${i.code}${i.url ? ` · ${i.url}` : ''} · ${i.detail.slice(0, 160)}`);
    }
    if (kind === 'velocidad' && h.metrics) hLines.push(`  métricas: ${JSON.stringify(h.metrics).slice(0, 400)}`);
  }
  section('Salud de la web (última revisión de cada tipo)', hLines.length ? hLines : [seoCovers.size ? '(la vigila el módulo SEO: ver los hallazgos del proyecto SEO más abajo)' : '(sin revisiones todavía)']);

  // Trabajo hecho y URLs trabajadas.
  const since90 = addDays(today, -90);
  const work = view.work.filter((x) => x.doneOn >= since90);
  section(
    'Trabajo hecho (90 días)',
    work.length
      ? work.slice(0, 60).map((x) => {
          x.urls.forEach(addUrl);
          return `${x.doneOn} · ${x.categoryLabel} · ${untrusted(x.title.slice(0, 160))}${x.urls.length ? ` · ${x.urls.slice(0, 3).join(' ')}` : ''}${x.hours !== null ? ` · ${fmtHours(x.hours)}` : ''}`;
        })
      : ['(sin encargos terminados registrados)']
  );
  section(
    'URLs trabajadas: antes y después del cambio (señal, no prueba de causa)',
    view.tracked.slice(0, 30).map((t) => {
      addUrl(t.url);
      const perDay = (x: { clicks: number; impressions: number; days: number; dataDays: number }) => (x.days ? `${Math.round((x.clicks / x.days) * 10) / 10} clics/día, ${Math.round(x.impressions / x.days)} impr./día (${x.days} días, ${x.dataDays} con impresiones)` : 'sin datos');
      return `${t.url} · cambio ${t.changedOn}${t.crawledOn ? ` · Google la rastreó el ${t.crawledOn}` : ' · Google aún no la ha vuelto a rastrear'} · antes: ${perDay(t.before)} · después: ${perDay(t.after)}${t.enoughData ? '' : ' · pocos datos todavía'}${t.reason ? ` · ${untrusted(t.reason.slice(0, 120))}` : ''}`;
    })
  );

  // Lo que saben los departamentos de los proyectos del cliente (Hito 2 SEO, 24 nov 2026): hallazgos, plan de mejora,
  // temas del mapa de palabras y competencia. Llega por el núcleo (sin leer tablas de otro módulo); sus URLs y
  // búsquedas se pueden citar como evidencia.
  for (const sec of await projectDossierSections(tenantId, clientId)) {
    sec.urls?.forEach(addUrl);
    sec.queries?.forEach((q) => refs.queries.add(normQuery(q)));
    // Lleva búsquedas y nombres de páginas de fuera: dato no fiable (nunca instrucciones).
    section(sec.title, [untrusted(sec.lines.slice(0, 60).join('\n'))]);
  }

  // Encargos abiertos.
  const open = (await ws?.clientOpen?.(tenantId, clientId).catch(() => [])) ?? [];
  section('Encargos abiertos (no los repitas)', open.length ? open.slice(0, 50).map((o) => `${untrusted(o.title.slice(0, 160))} · ${o.workType ?? 'sin tipo'} · ${o.status}${o.dueDate ? ` · para el ${o.dueDate}` : ''}`) : ['(ninguno)']);

  // Propuestas anteriores con su resultado.
  const prevSugs = await db
    .select()
    .from(estSuggestions)
    .where(and(eq(estSuggestions.clientId, clientId), gte(estSuggestions.createdAt, new Date(now.getTime() - 120 * 86_400_000))))
    .orderBy(desc(estSuggestions.createdAt))
    .limit(60);
  section(
    'Propuestas anteriores del estratega (120 días)',
    prevSugs.length
      ? prevSugs.map((s) => `${s.createdAt.toISOString().slice(0, 10)} · ${s.status}${s.rejectReason ? ` (${REJECT_REASONS[s.rejectReason as RejectReason] ?? s.rejectReason}${s.rejectNote ? `: ${untrusted(s.rejectNote.slice(0, 200))}` : ''})` : ''}${s.status === 'aplazada' && s.snoozeUntil ? ` hasta el ${s.snoozeUntil}` : ''}${s.executedAt ? ' · hecha' : ''} · ${s.title}`)
      : ['(es el primer análisis)']
  );

  // Esfuerzo del equipo y tipos de trabajo.
  const effort: Effort = (await ws?.effortByType?.(tenantId, 180).catch(() => ({}))) ?? {};
  const types = (await ws?.workTypes?.(tenantId).catch(() => [])) ?? [];
  section('Tipos de trabajo (clave = nombre)', types.length ? types.map((t) => `${t.key} = ${t.label}`) : ['(sin tipos)']);
  const effLines = Object.entries(effort)
    .filter(([, e]) => e.n >= 2)
    .map(([k, e]) => `${types.find((t) => t.key === k)?.label ?? k}: mediana ${fmtHours(e.medianMinutes / 60)} (${e.n} encargos)`);
  section('Lo que suele tardar el equipo por tipo de trabajo (180 días)', effLines.length ? effLines : ['(sin tiempos registrados todavía: estima tú)']);

  // Calendario.
  const events = await externalEvents(tenantId, addDays(today, -90), addDays(today, 30)).catch(() => []);
  section('Calendario (actualizaciones de Google, festivos, incidencias)', events.map((e) => `${e.date}${e.endDate ? `–${e.endDate}` : ''} · ${e.kind} · ${untrusted(e.title)}`));

  const existingTitles = [...open.map((o) => o.title), ...work.map((x) => x.title), ...prevSugs.filter((s) => s.status !== 'caducada' && !(s.status === 'aplazada' && s.snoozeUntil && s.snoozeUntil <= today)).map((s) => s.title)];
  const text = out.join('\n\n').slice(0, 60_000);
  return { text, refs, objectiveCodes, existingTitles, workTypes: new Set(types.map((t) => t.key)), effort, remainingHours, clientName: view.clientName };
}

// --- Ejecución de un análisis ---------------------------------------------------------------------------------------

async function finishAnalysis(id: string, patch: Partial<typeof estAnalyses.$inferInsert>): Promise<void> {
  await db.update(estAnalyses).set({ ...patch, finishedAt: new Date() }).where(eq(estAnalyses.id, id));
}

export async function executeAnalysis(a: EstAnalysis, now = new Date()): Promise<void> {
  const claimed = await db
    .update(estAnalyses)
    .set({ status: 'en_curso', startedAt: now })
    .where(and(eq(estAnalyses.id, a.id), eq(estAnalyses.status, 'pendiente')))
    .returning({ id: estAnalyses.id });
  if (!claimed.length) return;
  try {
    const settings = await getSettings(a.tenantId);
    if ((await aiSpentThisMonth(a.tenantId, now)) >= Number(settings.aiMonthlyCapUsd)) {
      await finishAnalysis(a.id, { status: 'omitido', error: 'Se alcanzó el tope de gasto de IA del módulo este mes (Estrategia → Ajustes).' });
      return;
    }
    const prompt = await getPrompt(STRATEGIST_PROMPT);
    if (!prompt) {
      await finishAnalysis(a.id, { status: 'omitido', error: 'El prompt del estratega está desactivado (IA y modelos → Prompts).' });
      return;
    }
    const dossier = await buildDossier(a.tenantId, a.clientId, now);
    if (!dossier) {
      await finishAnalysis(a.id, { status: 'omitido', error: 'El cliente ya no tiene plan de seguimiento.' });
      return;
    }
    const cfg = await strategistSettings(a.tenantId);
    const motivo = a.trigger === 'alerta' ? `Alerta: ${a.reason ?? 'algo grave'}. Céntrate en eso primero.` : a.trigger === 'manual' ? `Pedido a mano${a.requestedBy ? ` por ${a.requestedBy}` : ''}.` : 'Revisión periódica según su plan.';
    const vals: Record<string, string> = { hoy: madridNow(now).date, motivo, expediente: dossier.text, max_propuestas: String(cfg.maxSuggestions) };
    const fill = (t: string) => t.replace(/\{(hoy|motivo|expediente|max_propuestas)\}/g, (_m, k: string) => vals[k] ?? '');
    const res = await callAI({
      tenantId: a.tenantId,
      function: 'est_strategist',
      promptKey: STRATEGIST_PROMPT,
      model: STRATEGIST_MODEL,
      // Opus 5.5 siempre piensa y el pensamiento cuenta en max_tokens: margen para pensar y escribir el JSON.
      maxTokens: 16000,
      // Expediente grande + pensar + 16 000 tokens pueden pasar de los 180 s por defecto.
      timeoutMs: 600_000,
      messages: [
        { role: 'system', content: fill(prompt.system_prompt) },
        { role: 'user', content: fill(prompt.user_prompt_template) }
      ]
    });
    const out = cleanStrategistOutput(extractJsonFromLLMResponse(res.content), cfg.maxSuggestions);

    // Validación en el código: evidencia del expediente, sin duplicados, tipo de trabajo conocido, horas y prioridad.
    const discarded: { title: string; reason: string }[] = [];
    const seen: string[] = [...dossier.existingTitles];
    const valid = [];
    for (const p of out.proposals) {
      const ev = validEvidence(p, dossier.refs);
      if (!ev.length) {
        discarded.push({ title: p.title, reason: 'Sin evidencia que esté en el expediente' });
        continue;
      }
      const dup = isDuplicate(p.title, seen);
      if (dup) {
        discarded.push({ title: p.title, reason: `Repite «${dup.slice(0, 80)}»` });
        continue;
      }
      seen.push(p.title);
      const workType = dossier.workTypes.has(p.workType) ? p.workType : null;
      const est = estimateHours({ hours: p.hours, workType: workType ?? '' }, dossier.effort);
      valid.push({ ...p, workType, evidence: ev, hours: est.hours, hoursAi: p.hours, hoursSource: est.source, ice: iceScore(p.impact, p.confidence, est.hours) });
    }
    const { keep, cut } = fitToHours(valid, dossier.remainingHours, cfg.maxSuggestions);
    for (const c of cut) discarded.push({ title: c.title, reason: dossier.remainingHours !== null ? 'No cabe en las horas que quedan o pasa del máximo de propuestas' : 'Pasa del máximo de propuestas' });

    const [job] = await db.select({ cost: aiJobs.estimatedCost }).from(aiJobs).where(eq(aiJobs.id, res.jobId)).limit(1);
    // Propuestas y cierre del análisis en una sola transacción (C7): o se guardan todas y el análisis queda «hecho»,
    // o ninguna (y el análisis queda en error, sin propuestas sueltas).
    const inserted: EstSuggestion[] = await db.transaction(async (tx) => {
      const rows: EstSuggestion[] = [];
      for (const [i, p] of keep.entries()) {
        const description = p.overHours ? `${p.description}\n\n⚠️ No cabe en las horas que quedan este mes: para el mes que viene o ampliar horas.` : p.description;
        const [row] = await tx
          .insert(estSuggestions)
          .values({
            tenantId: a.tenantId,
            clientId: a.clientId,
            analysisId: a.id,
            objectiveId: dossier.objectiveCodes.get(p.objectiveRef.toUpperCase().replace(/[^A-Z0-9]/g, '')) ?? null,
            rank: i + 1,
            title: p.title,
            description,
            workType: p.workType,
            category: p.category,
            evidence: p.evidence,
            expected: p.expected,
            impact: p.impact,
            confidence: p.confidence,
            hours: p.hours.toFixed(2),
            hoursAi: p.hoursAi.toFixed(2),
            hoursSource: p.hoursSource,
            ice: p.ice.toFixed(3)
          })
          .returning();
        rows.push(row);
      }
      await tx
        .update(estAnalyses)
        .set({
        finishedAt: new Date(),
        status: 'hecho',
        summary: out.summary || 'Sin resumen.',
        diagnosis: { diagnostico: out.diagnosis, aprendizajes: out.learnings },
        discarded,
        proposed: rows.length,
        dossierChars: dossier.text.length,
        model: res.model?.slice(0, 80) ?? null,
        aiJobId: res.jobId,
        costUsd: job?.cost ?? null,
        error: null
      }).where(eq(estAnalyses.id, a.id));
      return rows;
    });
    if (inserted.length || a.trigger === 'alerta') {
      const html = analysisMessage({
        clientName: dossier.clientName,
        trigger: a.trigger,
        reason: a.reason,
        summary: out.summary,
        suggestions: inserted.map((s, i) => ({ rank: s.rank, title: s.title, description: s.description, impact: s.impact, confidence: s.confidence, hours: Number(s.hours), hoursSource: s.hoursSource, evidence: s.evidence, overHours: keep[i]?.overHours })),
        link: tabUrl(a.clientId)
      });
      // El aviso falla aparte: el análisis ya está hecho (y pagado) y sus propuestas se ven en la ficha.
      try {
        await telegramOutbound()?.notifyOwner(a.tenantId, `est:analisis:${a.id}`, html, analysisKeyboard(inserted.map((s) => ({ id: s.id, rank: s.rank }))));
      } catch (e) {
        console.error('[estrategia] aviso del estratega por Telegram:', e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    console.error('[estrategia] estratega:', e instanceof Error ? e.message : e);
    await finishAnalysis(a.id, { status: 'error', error: publicError(e, 'Falló el análisis del estratega').slice(0, 500) });
  }
}

// --- Decisiones -----------------------------------------------------------------------------------------------------

export type Decision = { kind: 'aprobar' } | { kind: 'ajustar'; note: string } | { kind: 'aplazar' } | { kind: 'rechazar'; reason: RejectReason; note?: string };

/**
 * Decide una propuesta pendiente (o aplazada). Primero se reclama (cambio de estado condicionado), así un botón pulsado
 * dos veces o un reintento de Telegram nunca crea dos encargos. Aprobar o ajustar crea el encargo en Operaciones.
 */
export async function decideSuggestion(tenantId: string, id: string, d: Decision, by: string): Promise<{ ok: boolean; message: string; url?: string | null }> {
  const [s] = await db.select().from(estSuggestions).where(and(eq(estSuggestions.tenantId, tenantId), eq(estSuggestions.id, id))).limit(1);
  if (!s) throw new StrategistError('Esa propuesta ya no existe.');
  if (!['pendiente', 'aplazada', 'caducada'].includes(s.status)) return { ok: false, message: `Ya está decidida: ${s.status === 'rechazada' ? 'rechazada' : s.status === 'aplazada' ? 'más adelante' : 'encargo creado'}.` };
  const now = new Date();
  const status = d.kind === 'aprobar' ? 'aprobada' : d.kind === 'ajustar' ? 'ajustada' : d.kind === 'aplazar' ? 'aplazada' : 'rechazada';
  if (d.kind === 'aplazar' && s.status === 'aplazada') return { ok: false, message: 'Ya está para más adelante.' };
  const cfg = await strategistSettings(tenantId);
  const claimed = await db
    .update(estSuggestions)
    .set({
      status,
      decidedBy: by.slice(0, 120),
      decidedAt: now,
      updatedAt: now,
      snoozeUntil: d.kind === 'aplazar' ? addDays(madridNow(now).date, cfg.snoozeDays) : s.snoozeUntil,
      rejectReason: d.kind === 'rechazar' ? d.reason : null,
      rejectNote: d.kind === 'rechazar' ? (d.note?.slice(0, 1000) ?? null) : null,
      adjustNote: d.kind === 'ajustar' ? d.note.slice(0, 2000) : null
    })
    .where(and(eq(estSuggestions.id, id), eq(estSuggestions.status, s.status)))
    .returning({ id: estSuggestions.id });
  if (!claimed.length) return { ok: false, message: 'Otra persona la acaba de decidir.' };
  if (d.kind === 'aplazar') return { ok: true, message: `⏸️ Para más adelante (vuelve a salir tras el ${addDays(madridNow(now).date, cfg.snoozeDays)}).` };
  if (d.kind === 'rechazar') return { ok: true, message: `✖️ Descartada: ${REJECT_REASONS[d.reason].toLowerCase()}.` };

  // Si no se llegó a crear nada, la propuesta vuelve a como estaba (17 nov 2026): antes quedaba «Encargo creado» sin
  // encargo, contaba como aceptada y no había forma de reintentar. Si Operaciones guardó el encargo (aunque ClickUp
  // fallara), ya existe y no se devuelve: así nunca hay dos.
  const undo = async (error: string) =>
    db
      .update(estSuggestions)
      .set({ status: s.status, decidedBy: s.decidedBy, decidedAt: s.decidedAt, adjustNote: s.adjustNote, taskError: error.slice(0, 500), updatedAt: new Date() })
      .where(and(eq(estSuggestions.id, id), eq(estSuggestions.status, status)));

  // Crear el encargo.
  const ws = workSource();
  if (!ws?.createTask) {
    await undo('Operaciones no está disponible para crear encargos.');
    return { ok: false, message: 'No se pudo crear el encargo (Operaciones no disponible): la propuesta sigue pendiente; inténtalo más tarde.' };
  }
  const evidence = s.evidence.map((e) => `- ${e.dato || e.ref}${e.periodo ? ` (${e.periodo})` : ''}: ${e.ref}`).join('\n');
  const description = [
    s.description,
    d.kind === 'ajustar' ? `\n**Ajuste de ${by}:** ${d.note}` : '',
    evidence ? `\n**Evidencia:**\n${evidence}` : '',
    s.expected?.metrica ? `\n**Cómo sabremos si funciona:** ${s.expected.metrica}${s.expected.donde ? ` en ${s.expected.donde}` : ''}${typeof s.expected.cambio_pct === 'number' ? `, ${s.expected.cambio_pct > 0 ? '+' : ''}${s.expected.cambio_pct} %` : ''}${s.expected.dias ? ` en unos ${s.expected.dias} días` : ''}.` : '',
    `\n_Propuesto por el estratega (${fmtHours(Number(s.hours))} estimadas)._`
  ]
    .filter(Boolean)
    .join('\n');
  const r = await ws.createTask(tenantId, { clientId: s.clientId, title: s.title, description, workType: s.workType, requestedBy: by });
  if (!r.ok && !r.ref) {
    await undo(r.message);
    return { ok: false, message: `No se creó el encargo: ${r.message} La propuesta sigue pendiente para reintentarlo.` };
  }
  await db
    .update(estSuggestions)
    .set({ taskRef: r.ref, taskUrl: r.url, taskError: r.ok ? null : r.message.slice(0, 500), updatedAt: new Date() })
    .where(eq(estSuggestions.id, id));
  // Registro de intervenciones del núcleo (Hito 1 SEO, 23 nov 2026): técnica e hipótesis del encargo, para medir después
  // qué funciona. Un fallo aquí no deshace la aprobación.
  try {
    const pct = typeof s.expected?.cambio_pct === 'number' ? s.expected.cambio_pct : null;
    await recordIntervention({
      tenantId,
      clientId: s.clientId,
      domain: 'seo',
      technique: techniqueFromCategory(s.category),
      hypothesis: {
        metric: s.expected?.metrica?.slice(0, 60) || undefined,
        direction: pct !== null && pct < 0 ? 'baja' : 'sube',
        magnitudePct: pct !== null ? Math.abs(pct) : undefined,
        windowDays: s.expected?.dias || undefined
      },
      source: 'estrategia',
      sourceRef: s.id,
      requestRef: r.ref,
      createdBy: by
    });
  } catch (e) {
    console.error('[estrategia] registrar intervención:', e instanceof Error ? e.message : e);
  }
  return r.ok ? { ok: true, message: `✅ ${r.message}`, url: r.url } : { ok: false, message: `Aprobada, pero el encargo no se creó: ${r.message}` };
}

/** Un encargo nacido de una propuesta se ha terminado: cuenta para la tasa de ejecución. */
export async function markSuggestionExecuted(tenantId: string, taskRef: string): Promise<void> {
  await db
    .update(estSuggestions)
    .set({ executedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(estSuggestions.tenantId, tenantId), eq(estSuggestions.taskRef, taskRef), sql`${estSuggestions.executedAt} IS NULL`));
}

// --- Telegram: botones y respuestas escritas ------------------------------------------------------------------------

async function pendingKeyboard(analysisId: string): Promise<Button[][]> {
  const rows = await db
    .select({ id: estSuggestions.id, rank: estSuggestions.rank })
    .from(estSuggestions)
    .where(and(eq(estSuggestions.analysisId, analysisId), eq(estSuggestions.status, 'pendiente')))
    .orderBy(asc(estSuggestions.rank));
  return analysisKeyboard(rows);
}

/** Botón «x:est:…» de un mensaje del estratega. Solo quien lleva las operaciones decide. */
export async function handleStrategistButton(i: { tenantId: string; data: string; chatId: string; by: string; isOwner: boolean }) {
  if (!i.isOwner) return { answer: 'Solo quien lleva las operaciones decide las propuestas.', alert: true };
  const m = i.data.match(/^(ok|aj|pa|no|bk|r:(yh|ne|pi|sh|ot)):([0-9a-f-]{36})$/);
  if (!m) return { answer: 'Botón no válido.', alert: true };
  const id = m[3];
  const [s] = await db.select().from(estSuggestions).where(and(eq(estSuggestions.tenantId, i.tenantId), eq(estSuggestions.id, id))).limit(1);
  if (!s) return { answer: 'Esa propuesta ya no existe.', alert: true, keyboard: null };
  const action = m[1];
  if (action === 'bk') return { keyboard: await pendingKeyboard(s.analysisId) };
  if (s.status !== 'pendiente') return { answer: 'Esa propuesta ya está decidida.', keyboard: await pendingKeyboard(s.analysisId) };
  if (action === 'no') return { keyboard: reasonKeyboard(s.id, s.rank), answer: '¿Por qué no?' };
  if (action === 'aj') {
    await setAwaiting(i.tenantId, i.chatId, { id: s.id, mode: 'ajustar' });
    return { awaitText: `✏️ <b>${esc(s.title)}</b>\n¿Qué cambias? Escríbelo y creo el encargo con tu ajuste.` };
  }
  if (action === 'r:ot') {
    await setAwaiting(i.tenantId, i.chatId, { id: s.id, mode: 'motivo' });
    return { awaitText: `✍️ <b>${esc(s.title)}</b>\n¿Por qué no? (lo tendrá en cuenta en los próximos análisis)` };
  }
  const decision: Decision = action === 'ok' ? { kind: 'aprobar' } : action === 'pa' ? { kind: 'aplazar' } : { kind: 'rechazar', reason: ({ yh: 'ya_hecho', ne: 'no_encaja', pi: 'poco_impacto', sh: 'sin_horas' } as const)[m[2] as 'yh' | 'ne' | 'pi' | 'sh'] };
  const r = await decideSuggestion(i.tenantId, s.id, decision, i.by);
  return {
    answer: r.message.slice(0, 190),
    alert: !r.ok,
    keyboard: await pendingKeyboard(s.analysisId),
    reply: action === 'ok' ? `${esc(r.message)}${r.url ? `\n<a href="${esc(r.url)}">Abrir en ClickUp</a>` : ''}\n<i>${esc(s.title)}</i>` : undefined
  };
}

/** Texto que el estratega pidió tras «Ajustar» u «Otro motivo». */
export async function handleStrategistText(i: { tenantId: string; chatId: string; text: string; by: string; isOwner: boolean }): Promise<string> {
  if (!i.isOwner) return 'Solo quien lleva las operaciones decide las propuestas.';
  const w = (await getSettings(i.tenantId)).state.awaiting?.[i.chatId];
  if (!w) return 'Eso ya no está activo.';
  await setAwaiting(i.tenantId, i.chatId, null);
  const text = i.text.trim();
  if (!text) return 'No he recibido nada; vuelve a pulsar el botón.';
  const r = await decideSuggestion(i.tenantId, w.id, w.mode === 'ajustar' ? { kind: 'ajustar', note: text } : { kind: 'rechazar', reason: 'otro', note: text }, i.by).catch((e) => ({ ok: false, message: e instanceof StrategistError ? e.userMessage : 'No se pudo guardar.', url: null }));
  return `${esc(r.message)}${'url' in r && r.url ? `\n<a href="${esc(r.url)}">Abrir en ClickUp</a>` : ''}`;
}

// --- Lectura para las pantallas -------------------------------------------------------------------------------------

export type SuggestionView = {
  id: string;
  analysisId: string;
  rank: number;
  title: string;
  description: string;
  workType: string | null;
  category: string;
  categoryLabel: string;
  evidence: { tipo: string; ref: string; periodo: string; dato: string }[];
  expected: { metrica?: string; donde?: string; cambio_pct?: number; dias?: number };
  impact: number;
  confidence: number;
  hours: number;
  hoursSource: string;
  ice: number;
  status: string;
  rejectReason: string | null;
  rejectNote: string | null;
  adjustNote: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  snoozeUntil: string | null;
  taskUrl: string | null;
  taskError: string | null;
  executed: boolean;
  objectiveId: string | null;
  createdAt: string;
};
export type AnalysisView = { id: string; trigger: string; reason: string | null; status: string; summary: string | null; diagnosis: string[]; learnings: string[]; discarded: { title: string; reason: string }[]; proposed: number; costUsd: number | null; error: string | null; createdAt: string; finishedAt: string | null; requestedBy: string | null };

export const suggestionView = (s: EstSuggestion): SuggestionView => ({
  id: s.id,
  analysisId: s.analysisId,
  rank: s.rank,
  title: s.title,
  description: s.description,
  workType: s.workType,
  category: s.category,
  categoryLabel: WORK_CATEGORY_LABEL[s.category as keyof typeof WORK_CATEGORY_LABEL] ?? s.category,
  evidence: s.evidence,
  expected: s.expected ?? {},
  impact: s.impact,
  confidence: s.confidence,
  hours: Number(s.hours),
  hoursSource: s.hoursSource,
  ice: Number(s.ice),
  status: s.status,
  rejectReason: s.rejectReason,
  rejectNote: s.rejectNote,
  adjustNote: s.adjustNote,
  decidedBy: s.decidedBy,
  decidedAt: s.decidedAt?.toISOString() ?? null,
  snoozeUntil: s.snoozeUntil,
  taskUrl: s.taskUrl,
  taskError: s.taskError,
  executed: Boolean(s.executedAt),
  objectiveId: s.objectiveId,
  createdAt: s.createdAt.toISOString()
});

export const analysisView = (a: EstAnalysis): AnalysisView => {
  const d = a.diagnosis as { diagnostico?: string[]; aprendizajes?: string[] } | string[];
  return {
    id: a.id,
    trigger: a.trigger,
    reason: a.reason,
    status: a.status,
    summary: a.summary,
    diagnosis: Array.isArray(d) ? d : (d.diagnostico ?? []),
    learnings: Array.isArray(d) ? [] : (d.aprendizajes ?? []),
    discarded: a.discarded ?? [],
    proposed: a.proposed,
    costUsd: a.costUsd !== null ? Number(a.costUsd) : null,
    error: a.error,
    createdAt: a.createdAt.toISOString(),
    finishedAt: a.finishedAt?.toISOString() ?? null,
    requestedBy: a.requestedBy
  };
};

/** Lo del estratega para la pestaña de un cliente: análisis recientes y propuestas (pendientes primero). */
export async function clientStrategist(tenantId: string, clientId: string) {
  const [analyses, suggestions] = await Promise.all([
    db.select().from(estAnalyses).where(and(eq(estAnalyses.tenantId, tenantId), eq(estAnalyses.clientId, clientId))).orderBy(desc(estAnalyses.createdAt)).limit(12),
    db.select().from(estSuggestions).where(and(eq(estSuggestions.tenantId, tenantId), eq(estSuggestions.clientId, clientId))).orderBy(desc(estSuggestions.createdAt)).limit(80)
  ]);
  return { analyses: analyses.map(analysisView), suggestions: suggestions.map(suggestionView) };
}

/** Propuestas de toda la cuenta en un periodo (para la pestaña Calidad). */
export async function tenantSuggestions(tenantId: string, sinceDays: number) {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const [sugs, analyses] = await Promise.all([
    db.select().from(estSuggestions).where(and(eq(estSuggestions.tenantId, tenantId), gte(estSuggestions.createdAt, since))),
    db
      .select({ clientId: estAnalyses.clientId, status: estAnalyses.status, trigger: estAnalyses.trigger, cost: estAnalyses.costUsd, createdAt: estAnalyses.createdAt })
      .from(estAnalyses)
      .where(and(eq(estAnalyses.tenantId, tenantId), gte(estAnalyses.createdAt, since)))
  ]);
  return { sugs, analyses };
}

export type QualityView = {
  days: number;
  stats: ReturnType<typeof qualityStats>;
  analyses: { total: number; done: number; failed: number; skipped: number; byAlert: number; manual: number; costUsd: number };
  byClient: { clientId: string; stats: ReturnType<typeof qualityStats>; analyses: number; costUsd: number }[];
};

/** Calidad del estratega en los últimos «days» días: aceptación, ejecución, motivos de rechazo, coste y por cliente. */
export async function strategistQuality(tenantId: string, days: number, now = new Date()): Promise<QualityView> {
  const { sugs, analyses } = await tenantSuggestions(tenantId, days);
  const cost = (list: { cost: string | null }[]) => Math.round(list.reduce((t, a) => t + (a.cost !== null ? Number(a.cost) : 0), 0) * 100) / 100;
  const clientIds = [...new Set([...sugs.map((s) => s.clientId), ...analyses.map((a) => a.clientId)])];
  return {
    days,
    stats: qualityStats(sugs, now),
    analyses: {
      total: analyses.length,
      done: analyses.filter((a) => a.status === 'hecho').length,
      failed: analyses.filter((a) => a.status === 'error').length,
      skipped: analyses.filter((a) => a.status === 'omitido').length,
      byAlert: analyses.filter((a) => a.trigger === 'alerta').length,
      manual: analyses.filter((a) => a.trigger === 'manual').length,
      costUsd: cost(analyses)
    },
    byClient: clientIds.map((clientId) => {
      const mine = analyses.filter((a) => a.clientId === clientId);
      return { clientId, stats: qualityStats(sugs.filter((s) => s.clientId === clientId), now), analyses: mine.length, costUsd: cost(mine) };
    })
  };
}

/** Texto corto de las propuestas pendientes de un cliente (para la herramienta del agente). */
export async function pendingSuggestionsText(tenantId: string, clientId: string): Promise<string> {
  const rows = await db
    .select()
    .from(estSuggestions)
    .where(and(eq(estSuggestions.tenantId, tenantId), eq(estSuggestions.clientId, clientId), eq(estSuggestions.status, 'pendiente')))
    .orderBy(desc(estSuggestions.createdAt))
    .limit(10);
  if (!rows.length) return '';
  return `Propuestas del estratega pendientes de decidir:\n${rows.map((s) => `- ${s.title} (impacto ${s.impact}/10, confianza ${s.confidence}/10, ${fmtHours(Number(s.hours))})`).join('\n')}`;
}

export const STRATEGIST_PROCESS_LABEL = PROCESS.estratega.label;
