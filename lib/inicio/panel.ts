// Inicio (fase 1 de la reorganización UX, 20 nov 2026): datos del panel de administración y del inicio de cada
// persona. No tiene tablas propias: solo LEE lo que ya calculan Operaciones, Agentes, Conocimiento, Estrategia y
// Errores, para que la portada cuente en un vistazo qué espera de ti y cómo va cada área.
// Cada bloque es independiente: si uno falla, se registra y su tarjeta muestra «no disponible» sin tumbar el resto.
import 'server-only';
import { and, asc, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { agtTeamQuestions, kbArticles, opsAgentActions, opsBlockers, opsClientActivity, opsRequests, opsTeamProfiles } from '@/lib/db/schema';
import { reportError } from '@/lib/core/errors';
import { countByKind, getParaTi, KINDS } from '@/lib/inicio/para-ti';
import { evaluateClient, getLevels, listClients } from '@/lib/operaciones/clients';
import { getCurrentDays, getPersonDay, jornadaSettings } from '@/lib/operaciones/jornada';
import type { DayStatus } from '@/lib/operaciones/jornada-core';
import { getMyTimes } from '@/lib/operaciones/tiempos-overview';

/** Ejecuta un bloque del panel; si falla, lo registra y devuelve null (la tarjeta dice «no disponible»). */
export async function safeBlock<T>(tenantId: string, name: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    reportError({ error, source: 'inicio', area: name, severity: 'error', tenantId, message: `Inicio: no se pudo cargar «${name}»` });
    return null;
  }
}

// --- Lo que espera de ti --------------------------------------------------------------------------------------

export type WaitingItem = {
  key: string;
  label: string;
  count: number;
  href: string;
  /** Lo más antiguo que espera (para ordenar y para «espera desde hace…»). */
  oldest: Date | null;
  urgent?: boolean;
};

/** Recuento de lo que espera una decisión, por tipo, con enlace a Para ti filtrado. Sale de la misma fuente que Para ti. */
export async function getWaiting(tenantId: string): Promise<WaitingItem[]> {
  const { entries } = await getParaTi(tenantId);
  return countByKind(entries).map((c) => ({
    key: c.kind,
    label: KINDS[c.kind].label,
    count: c.count,
    href: `/dashboard/para-ti?tipo=${c.kind}`,
    oldest: c.oldest,
    urgent: c.urgent
  }));
}

// --- Clientes ---------------------------------------------------------------------------------------------------

export type ClientsSummary = {
  total: number;
  red: number;
  amber: number;
  green: number;
  gray: number;
  /** Los que piden atención (rojo primero), como mucho 5. */
  attention: { id: string; name: string; state: 'red' | 'amber'; note: string }[];
};

export async function getClientsSummary(tenantId: string): Promise<ClientsSummary> {
  const [clients, levels, activity] = await Promise.all([
    listClients(tenantId),
    getLevels(tenantId),
    db.select().from(opsClientActivity).where(eq(opsClientActivity.tenantId, tenantId))
  ]);
  const now = Date.now();
  const out: ClientsSummary = { total: 0, red: 0, amber: 0, green: 0, gray: 0, attention: [] };
  const attention: ClientsSummary['attention'] = [];
  for (const c of clients) {
    if (!c.active) continue;
    out.total++;
    const ev = evaluateClient(c, activity.find((a) => a.clientId === c.id) ?? null, levels, now);
    out[ev.state]++;
    if (ev.state === 'red' || ev.state === 'amber') attention.push({ id: c.id, name: c.name, state: ev.state, note: ev.note });
  }
  out.attention = attention.sort((a, b) => (a.state === b.state ? a.name.localeCompare(b.name, 'es') : a.state === 'red' ? -1 : 1)).slice(0, 5);
  return out;
}

// --- Equipo (jornada, sin ClickUp) ----------------------------------------------------------------------------

export type TeamNow = {
  enabled: boolean;
  people: { name: string; status: DayStatus; task: string | null }[];
  counts: Partial<Record<DayStatus, number>>;
};

export async function getTeamNow(tenantId: string): Promise<TeamNow> {
  const [days, cfg] = await Promise.all([getCurrentDays(tenantId), jornadaSettings(tenantId)]);
  const people = [...days.values()]
    .map((d) => ({ name: d.person.name, status: d.state.status, task: d.state.activeTask?.name ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const counts: TeamNow['counts'] = {};
  for (const p of people) counts[p.status] = (counts[p.status] ?? 0) + 1;
  return { enabled: cfg.enabled, people, counts };
}

// --- Agentes -------------------------------------------------------------------------------------------------

export type AgentsSummary = {
  today: number;
  decided30: number;
  approved30: number;
  corrected30: number;
  rejected30: number;
  auto30: number;
  /** Aprobadas tal cual / decididas por una persona (30 días). null si no hay decisiones. */
  acceptance: number | null;
  questionsToday: number;
  questionsWithoutEnric: number;
};

export async function getAgentsSummary(tenantId: string, now = new Date()): Promise<AgentsSummary> {
  const since30 = new Date(now.getTime() - 30 * 86_400_000);
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const [byStatus, todayRows, qRows] = await Promise.all([
    db
      .select({ status: opsAgentActions.status, n: sql<number>`count(*)::int` })
      .from(opsAgentActions)
      .where(and(eq(opsAgentActions.tenantId, tenantId), gte(opsAgentActions.createdAt, since30)))
      .groupBy(opsAgentActions.status),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(opsAgentActions)
      .where(and(eq(opsAgentActions.tenantId, tenantId), gte(opsAgentActions.createdAt, startToday))),
    db
      .select({ answeredBy: agtTeamQuestions.answeredBy, n: sql<number>`count(*)::int` })
      .from(agtTeamQuestions)
      .where(and(eq(agtTeamQuestions.tenantId, tenantId), gte(agtTeamQuestions.createdAt, startToday)))
      .groupBy(agtTeamQuestions.answeredBy)
  ]);
  const n = (s: string) => byStatus.find((r) => r.status === s)?.n ?? 0;
  const approved = n('aprobado');
  const corrected = n('corregido');
  const rejected = n('rechazado');
  const decided = approved + corrected + rejected;
  const qTotal = qRows.reduce((a, r) => a + r.n, 0);
  return {
    today: todayRows[0]?.n ?? 0,
    decided30: decided,
    approved30: approved,
    corrected30: corrected,
    rejected30: rejected,
    auto30: n('auto'),
    acceptance: decided ? approved / decided : null,
    questionsToday: qTotal,
    questionsWithoutEnric: qRows.filter((r) => r.answeredBy && r.answeredBy !== 'enric').reduce((a, r) => a + r.n, 0)
  };
}

// --- Inicio de cada persona -------------------------------------------------------------------------------------

export type MyProfile = { name: string; clickupUserId: string | null } | null;

export async function getMyProfile(tenantId: string, userId: number): Promise<MyProfile> {
  const [p] = await db
    .select({ name: opsTeamProfiles.name, clickupUserId: opsTeamProfiles.clickupUserId })
    .from(opsTeamProfiles)
    .where(and(eq(opsTeamProfiles.tenantId, tenantId), eq(opsTeamProfiles.userId, userId)))
    .limit(1);
  return p ?? null;
}

export async function getMyDay(tenantId: string, clickupUserId: string) {
  const [day, cfg] = await Promise.all([getPersonDay(tenantId, clickupUserId), jornadaSettings(tenantId)]);
  return { enabled: cfg.enabled, state: day?.state ?? null, breakQuotaMin: cfg.breakQuotaMin };
}

const OPEN_FOR_PERSON: string[] = ['respondida', 'pendiente_aprobacion', 'escalada'];

/** Dudas que la persona preguntó al jefe de operaciones y siguen abiertas (como mucho 5). */
export async function getMyQuestions(tenantId: string, clickupUserId: string) {
  return db
    .select({ id: agtTeamQuestions.id, question: agtTeamQuestions.question, status: agtTeamQuestions.status, createdAt: agtTeamQuestions.createdAt })
    .from(agtTeamQuestions)
    .where(and(eq(agtTeamQuestions.tenantId, tenantId), eq(agtTeamQuestions.askedByClickupId, clickupUserId), inArray(agtTeamQuestions.status, OPEN_FOR_PERSON)))
    .orderBy(desc(agtTeamQuestions.createdAt))
    .limit(5);
}

/** Lo nuevo de la base de conocimiento: entradas publicadas en los últimos 14 días (como mucho 5). */
export async function getNewKnowledge(tenantId: string, now = new Date()) {
  const since = new Date(now.getTime() - 14 * 86_400_000);
  return db
    .select({ id: kbArticles.id, title: kbArticles.title, publishedAt: kbArticles.publishedAt })
    .from(kbArticles)
    .where(and(eq(kbArticles.tenantId, tenantId), eq(kbArticles.status, 'publicada'), gte(kbArticles.publishedAt, since)))
    .orderBy(desc(kbArticles.publishedAt))
    .limit(5);
}

// --- Lo urgente y las cifras de cada persona -----------------------------------------------------------------------

export type MyUrgent = {
  returned: { id: string; title: string; clientName: string | null; since: Date }[];
  blocked: { id: string; question: string; status: string; since: Date }[];
  /** Dudas respondidas a las que aún no ha dicho si le sirvió. */
  toRate: number;
};

/** Lo que pide algo a la persona: encargos devueltos, bloqueos sin resolver y dudas por valorar. */
export async function getMyUrgent(tenantId: string, clickupUserId: string): Promise<MyUrgent> {
  const [returned, blocked, rate] = await Promise.all([
    db
      .select({ id: opsRequests.id, title: opsRequests.title, clientName: opsRequests.clientName, since: opsRequests.workStatusAt })
      .from(opsRequests)
      .where(and(eq(opsRequests.tenantId, tenantId), eq(opsRequests.assigneeClickupId, clickupUserId), eq(opsRequests.workStatus, 'devuelto')))
      .orderBy(asc(opsRequests.workStatusAt))
      .limit(10),
    db
      .select({ id: opsBlockers.id, question: opsBlockers.question, status: opsBlockers.status, since: opsBlockers.createdAt })
      .from(opsBlockers)
      .where(and(eq(opsBlockers.tenantId, tenantId), eq(opsBlockers.askedByClickupId, clickupUserId), inArray(opsBlockers.status, ['abierto', 'escalado'])))
      .orderBy(asc(opsBlockers.createdAt))
      .limit(10),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(agtTeamQuestions)
      .where(and(eq(agtTeamQuestions.tenantId, tenantId), eq(agtTeamQuestions.askedByClickupId, clickupUserId), eq(agtTeamQuestions.status, 'respondida'), isNull(agtTeamQuestions.feedback)))
  ]);
  return { returned, blocked, toRate: rate[0]?.n ?? 0 };
}

export type MyStats = {
  days: number;
  /** Tareas terminadas con tiempo registrado. */
  finished: number;
  /** % de tareas dentro del margen de su tipo. */
  pctInside: number | null;
  /** % de veces que acertó su propia estimación. */
  precision: number | null;
  /** Tiempos pasados del margen pendientes de explicar (se hace desde Telegram). */
  pendingJustify: number;
  /** Encargos de la herramienta completados en el periodo y cuántos a tiempo. */
  completed: number;
  onTime: number;
};

const madridDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** Cifras propias de los últimos días: sin ranking ni comparación con nadie. */
export async function getMyStats(tenantId: string, clickupUserId: string, days = 7, now = new Date()): Promise<MyStats> {
  const since = new Date(now.getTime() - days * 86_400_000);
  const [times, done] = await Promise.all([
    getMyTimes(tenantId, clickupUserId, days),
    db
      .select({ dueDate: opsRequests.dueDate, at: opsRequests.workStatusAt })
      .from(opsRequests)
      .where(and(eq(opsRequests.tenantId, tenantId), eq(opsRequests.assigneeClickupId, clickupUserId), eq(opsRequests.workStatus, 'completado'), gte(opsRequests.workStatusAt, since)))
  ]);
  const withDue = done.filter((r) => r.dueDate);
  return {
    days,
    finished: times.stats.n,
    pctInside: times.stats.pctInside,
    precision: times.stats.precision,
    pendingJustify: times.stats.pendingJustify,
    completed: withDue.length,
    onTime: withDue.filter((r) => madridDay(new Date(r.at)) <= String(r.dueDate)).length
  };
}
