import 'server-only';

// Módulo Estrategia: lectura y escritura de sus tablas (est_*). Sin red: los procesos están en processes.ts.
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  estClientSettings,
  estEvents,
  estHealthChecks,
  estKeywordHistory,
  estKeywords,
  estObjectives,
  estPlans,
  estProcessRuns,
  estSettings,
  estSignals,
  estTrackedUrls,
  estUrlDaily,
  estWorkFacts,
  type EstClientSettings,
  type EstEvent,
  type EstIssue,
  type EstObjective,
  type EstPlan,
  type EstProcessRun,
  type EstSettings,
  type EstSettingsState
} from '@/lib/db/schema';
import { getClient } from '@/lib/core/clients';
import { DEFAULT_PLANS, cleanConfig, effectiveProcesses, isYmd, jitterMinutes, type EffectiveProcess, type ProcessConfig, type Signal } from '@/lib/estrategia/rules';

export class EstError extends Error {
  constructor(public userMessage: string) {
    super(userMessage);
  }
}

async function ownClient(tenantId: string, clientId: string) {
  const c = await getClient(tenantId, clientId);
  if (!c) throw new EstError('Ese cliente no existe.');
  return c;
}

// --- Ajustes --------------------------------------------------------------------------------------------------------

export async function getSettings(tenantId: string): Promise<EstSettings> {
  const [row] = await db.select().from(estSettings).where(eq(estSettings.tenantId, tenantId)).limit(1);
  if (row) return row;
  await db.insert(estSettings).values({ tenantId }).onConflictDoNothing();
  const [created] = await db.select().from(estSettings).where(eq(estSettings.tenantId, tenantId)).limit(1);
  return created;
}

export type SettingsInput = Partial<{ onTrackPct: number; atRiskPct: number; graceDays: number; strikingFrom: number; strikingTo: number; minImpressions: number; alertsEnabled: boolean; askUrl: boolean; trackDays: number; aiMonthlyCapUsd: number }>;

const clampInt = (v: unknown, min: number, max: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : undefined);

export async function saveSettings(tenantId: string, input: SettingsInput): Promise<void> {
  const cur = await getSettings(tenantId);
  const next = {
    onTrackPct: clampInt(input.onTrackPct, 50, 100) ?? cur.onTrackPct,
    atRiskPct: clampInt(input.atRiskPct, 10, 95) ?? cur.atRiskPct,
    graceDays: clampInt(input.graceDays, 0, 365) ?? cur.graceDays,
    strikingFrom: clampInt(input.strikingFrom, 1, 50) ?? cur.strikingFrom,
    strikingTo: clampInt(input.strikingTo, 2, 100) ?? cur.strikingTo,
    minImpressions: clampInt(input.minImpressions, 1, 100000) ?? cur.minImpressions,
    trackDays: clampInt(input.trackDays, 30, 730) ?? cur.trackDays,
    alertsEnabled: typeof input.alertsEnabled === 'boolean' ? input.alertsEnabled : cur.alertsEnabled,
    askUrl: typeof input.askUrl === 'boolean' ? input.askUrl : cur.askUrl,
    aiMonthlyCapUsd: (clampInt(input.aiMonthlyCapUsd, 0, 1000) ?? Number(cur.aiMonthlyCapUsd)).toFixed(2)
  };
  if (next.atRiskPct >= next.onTrackPct) throw new EstError('El umbral de «en riesgo» tiene que ser menor que el de «en camino».');
  if (next.strikingFrom >= next.strikingTo) throw new EstError('La franja de posiciones no es válida (desde < hasta).');
  await db.update(estSettings).set({ ...next, updatedAt: new Date() }).where(eq(estSettings.tenantId, tenantId));
}

export async function saveSettingsState(tenantId: string, state: EstSettingsState): Promise<void> {
  await db.update(estSettings).set({ state }).where(eq(estSettings.tenantId, tenantId));
}

// --- Planes ---------------------------------------------------------------------------------------------------------

/** Planes de la cuenta (los de partida se crean la primera vez). */
export async function listPlans(tenantId: string): Promise<EstPlan[]> {
  const rows = await db.select().from(estPlans).where(eq(estPlans.tenantId, tenantId)).orderBy(asc(estPlans.sort), asc(estPlans.name));
  if (rows.length) return rows;
  await db
    .insert(estPlans)
    .values(DEFAULT_PLANS.map((p, i) => ({ tenantId, key: p.key, name: p.name, description: p.description, processes: p.processes, sort: (i + 1) * 10 })))
    .onConflictDoNothing();
  return db.select().from(estPlans).where(eq(estPlans.tenantId, tenantId)).orderBy(asc(estPlans.sort), asc(estPlans.name));
}

export type PlanInput = { id?: string | null; name: string; description?: string; processes: unknown; copyFrom?: string | null };

export async function savePlan(tenantId: string, input: PlanInput): Promise<string> {
  const name = String(input.name ?? '').trim().slice(0, 80);
  if (!name) throw new EstError('El plan necesita un nombre.');
  const processes = cleanConfig(input.processes);
  const description = String(input.description ?? '').trim().slice(0, 500);
  if (input.id) {
    const [row] = await db
      .update(estPlans)
      .set({ name, description, processes, updatedAt: new Date() })
      .where(and(eq(estPlans.id, input.id), eq(estPlans.tenantId, tenantId)))
      .returning({ id: estPlans.id });
    if (!row) throw new EstError('Ese plan no existe.');
    await resyncRunsForPlan(tenantId, row.id);
    return row.id;
  }
  const plans = await listPlans(tenantId);
  const key = `plan_${Date.now().toString(36)}`;
  const [row] = await db
    .insert(estPlans)
    .values({ tenantId, key, name, description, processes, sort: (Math.max(0, ...plans.map((p) => p.sort)) || 0) + 10 })
    .returning({ id: estPlans.id });
  return row.id;
}

export async function deletePlan(tenantId: string, id: string): Promise<void> {
  const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(estClientSettings).where(and(eq(estClientSettings.tenantId, tenantId), eq(estClientSettings.planId, id)));
  if (Number(n?.n ?? 0) > 0) throw new EstError(`Ese plan lo usan ${n!.n} cliente(s): pásalos antes a otro plan.`);
  await db.delete(estPlans).where(and(eq(estPlans.id, id), eq(estPlans.tenantId, tenantId)));
}

// --- Seguimiento de cada cliente --------------------------------------------------------------------------------------

export async function getClientSettings(tenantId: string, clientId: string): Promise<EstClientSettings | null> {
  const [row] = await db.select().from(estClientSettings).where(and(eq(estClientSettings.tenantId, tenantId), eq(estClientSettings.clientId, clientId))).limit(1);
  return row ?? null;
}

export async function listClientSettings(tenantId: string): Promise<EstClientSettings[]> {
  return db.select().from(estClientSettings).where(eq(estClientSettings.tenantId, tenantId));
}

export async function clientEffective(tenantId: string, clientId: string): Promise<{ settings: EstClientSettings; plan: EstPlan; processes: EffectiveProcess[] } | null> {
  const s = await getClientSettings(tenantId, clientId);
  if (!s) return null;
  const [plan] = await db.select().from(estPlans).where(and(eq(estPlans.id, s.planId), eq(estPlans.tenantId, tenantId))).limit(1);
  if (!plan) return null;
  return { settings: s, plan, processes: effectiveProcesses(plan.processes, s.overrides) };
}

/** Asigna un plan (o lo quita con null: el cliente deja de tener seguimiento; lo guardado se conserva). */
export async function setClientPlan(tenantId: string, clientId: string, planId: string | null): Promise<void> {
  await ownClient(tenantId, clientId);
  if (!planId) {
    await db.delete(estProcessRuns).where(and(eq(estProcessRuns.tenantId, tenantId), eq(estProcessRuns.clientId, clientId)));
    await db.delete(estClientSettings).where(and(eq(estClientSettings.tenantId, tenantId), eq(estClientSettings.clientId, clientId)));
    return;
  }
  const [plan] = await db.select({ id: estPlans.id }).from(estPlans).where(and(eq(estPlans.id, planId), eq(estPlans.tenantId, tenantId))).limit(1);
  if (!plan) throw new EstError('Ese plan no existe.');
  await db
    .insert(estClientSettings)
    .values({ tenantId, clientId, planId })
    .onConflictDoUpdate({ target: estClientSettings.clientId, set: { planId, updatedAt: new Date() } });
  await syncRuns(tenantId, clientId);
}

/** Ajustes propios de un cliente (frecuencia o encendido de un proceso); null en un proceso = volver a la del plan. */
export async function saveClientOverride(tenantId: string, clientId: string, process: string, value: { on: boolean; every: number } | null): Promise<void> {
  const s = await getClientSettings(tenantId, clientId);
  if (!s) throw new EstError('Ese cliente no tiene seguimiento activo.');
  const overrides: ProcessConfig = { ...s.overrides };
  if (value === null) delete overrides[process];
  else Object.assign(overrides, cleanConfig({ [process]: value }));
  await db.update(estClientSettings).set({ overrides, updatedAt: new Date() }).where(eq(estClientSettings.clientId, clientId));
  await syncRuns(tenantId, clientId);
}

export async function pauseClient(tenantId: string, clientId: string, until: string | null): Promise<void> {
  if (until !== null && !isYmd(until)) throw new EstError('La fecha no es válida.');
  const r = await db.update(estClientSettings).set({ pausedUntil: until, updatedAt: new Date() }).where(and(eq(estClientSettings.tenantId, tenantId), eq(estClientSettings.clientId, clientId))).returning({ id: estClientSettings.clientId });
  if (!r.length) throw new EstError('Ese cliente no tiene seguimiento activo.');
}

// --- Agenda de procesos ---------------------------------------------------------------------------------------------

/**
 * Deja una fila de agenda por cada proceso activo y ejecutable del cliente (los «por evento» no tienen agenda) y quita
 * las de los procesos apagados. Si cambia la frecuencia, la próxima ejecución se recalcula desde la última.
 */
export async function syncRuns(tenantId: string, clientId: string): Promise<void> {
  const eff = await clientEffective(tenantId, clientId);
  const wanted = new Map((eff?.processes ?? []).filter((p) => p.on && p.runnable && p.every > 0).map((p) => [p.key as string, p]));
  const existing = await db.select().from(estProcessRuns).where(and(eq(estProcessRuns.tenantId, tenantId), eq(estProcessRuns.clientId, clientId)));
  const drop = existing.filter((r) => !wanted.has(r.process)).map((r) => r.id);
  if (drop.length) await db.delete(estProcessRuns).where(inArray(estProcessRuns.id, drop));
  const now = Date.now();
  for (const [key, p] of wanted) {
    const cur = existing.find((r) => r.process === key);
    if (!cur) {
      // Primera vez: en la próxima hora, repartido por cliente y proceso.
      await db
        .insert(estProcessRuns)
        .values({ tenantId, clientId, process: key, nextRunAt: new Date(now + jitterMinutes(`${clientId}:${key}`) * 60_000) })
        .onConflictDoNothing();
    } else if (cur.lastRunAt) {
      const next = new Date(cur.lastRunAt.getTime() + p.every * 86_400_000);
      if (Math.abs(next.getTime() - cur.nextRunAt.getTime()) > 3 * 3_600_000 && cur.errorCount === 0) await db.update(estProcessRuns).set({ nextRunAt: next }).where(eq(estProcessRuns.id, cur.id));
    }
  }
}

async function resyncRunsForPlan(tenantId: string, planId: string): Promise<void> {
  const rows = await db.select({ clientId: estClientSettings.clientId }).from(estClientSettings).where(and(eq(estClientSettings.tenantId, tenantId), eq(estClientSettings.planId, planId)));
  for (const r of rows) await syncRuns(tenantId, r.clientId);
}

export async function listRuns(tenantId: string, clientId?: string): Promise<EstProcessRun[]> {
  return db
    .select()
    .from(estProcessRuns)
    .where(clientId ? and(eq(estProcessRuns.tenantId, tenantId), eq(estProcessRuns.clientId, clientId)) : eq(estProcessRuns.tenantId, tenantId))
    .orderBy(asc(estProcessRuns.nextRunAt));
}

export async function dueRuns(tenantId: string, now: Date, limit: number): Promise<EstProcessRun[]> {
  return db
    .select()
    .from(estProcessRuns)
    .where(and(eq(estProcessRuns.tenantId, tenantId), lte(estProcessRuns.nextRunAt, now)))
    .orderBy(asc(estProcessRuns.nextRunAt))
    .limit(limit);
}

export async function updateRun(id: string, patch: Partial<typeof estProcessRuns.$inferInsert>): Promise<void> {
  await db.update(estProcessRuns).set(patch).where(eq(estProcessRuns.id, id));
}

/** «Ejecutar ahora» desde la pestaña: adelanta la próxima ejecución de un proceso (o de todos). */
export async function runSoon(tenantId: string, clientId: string, process?: string): Promise<number> {
  const r = await db
    .update(estProcessRuns)
    .set({ nextRunAt: new Date() })
    .where(and(eq(estProcessRuns.tenantId, tenantId), eq(estProcessRuns.clientId, clientId), process ? eq(estProcessRuns.process, process) : sql`true`))
    .returning({ id: estProcessRuns.id });
  return r.length;
}

// --- Objetivos ------------------------------------------------------------------------------------------------------

export async function listObjectives(tenantId: string, clientId?: string): Promise<EstObjective[]> {
  return db
    .select()
    .from(estObjectives)
    .where(clientId ? and(eq(estObjectives.tenantId, tenantId), eq(estObjectives.clientId, clientId)) : eq(estObjectives.tenantId, tenantId))
    .orderBy(asc(estObjectives.status), asc(estObjectives.priority), asc(estObjectives.dueDate));
}

export type ObjectiveInput = {
  id?: string | null;
  title: string;
  kind: 'kpi' | 'hito';
  kpiKey?: string | null;
  baselineValue?: number | null;
  baselineYoy?: number | null;
  targetValue?: number | null;
  targetLow?: number | null;
  targetHigh?: number | null;
  curve?: 's' | 'lineal';
  startDate: string;
  dueDate: string;
  priority?: number;
  notes?: string;
  source?: 'manual' | 'agente' | 'sistema';
  createdBy?: number | null;
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export async function saveObjective(tenantId: string, clientId: string, input: ObjectiveInput, validKpis: string[]): Promise<string> {
  await ownClient(tenantId, clientId);
  const title = String(input.title ?? '').trim().slice(0, 200);
  if (!title) throw new EstError('El objetivo necesita un título.');
  const kind = input.kind === 'hito' ? 'hito' : 'kpi';
  if (!isYmd(input.startDate) || !isYmd(input.dueDate)) throw new EstError('Las fechas no son válidas.');
  if (input.dueDate <= input.startDate) throw new EstError('La fecha límite tiene que ser posterior al inicio.');
  const kpiKey = kind === 'kpi' ? String(input.kpiKey ?? '') : null;
  if (kind === 'kpi' && !validKpis.includes(kpiKey!)) throw new EstError('Elige la cifra que mide el objetivo.');
  const target = num(input.targetValue);
  if (kind === 'kpi' && target === null) throw new EstError('Falta la meta.');
  const values = {
    title,
    kind,
    kpiKey,
    baselineValue: num(input.baselineValue),
    baselineYoy: num(input.baselineYoy),
    targetValue: kind === 'kpi' ? target : null,
    targetLow: num(input.targetLow),
    targetHigh: num(input.targetHigh),
    curve: input.curve === 'lineal' ? 'lineal' : 's',
    startDate: input.startDate,
    dueDate: input.dueDate,
    priority: Math.min(3, Math.max(1, Math.round(Number(input.priority ?? 2)) || 2)),
    notes: String(input.notes ?? '').trim().slice(0, 2000) || null,
    updatedAt: new Date()
  };
  if (input.id) {
    const [row] = await db
      .update(estObjectives)
      .set({ ...values, lastHealth: null })
      .where(and(eq(estObjectives.id, input.id), eq(estObjectives.tenantId, tenantId), eq(estObjectives.clientId, clientId)))
      .returning({ id: estObjectives.id });
    if (!row) throw new EstError('Ese objetivo no existe.');
    return row.id;
  }
  const [row] = await db
    .insert(estObjectives)
    .values({ tenantId, clientId, ...values, source: input.source ?? 'manual', createdBy: input.createdBy ?? null })
    .returning({ id: estObjectives.id });
  return row.id;
}

export async function closeObjective(tenantId: string, id: string, status: 'logrado' | 'no_logrado' | 'descartado' | 'activo'): Promise<void> {
  const [o] = await db.select().from(estObjectives).where(and(eq(estObjectives.id, id), eq(estObjectives.tenantId, tenantId))).limit(1);
  if (!o) throw new EstError('Ese objetivo no existe.');
  await db
    .update(estObjectives)
    .set(status === 'activo' ? { status, closedAt: null, finalValue: null, updatedAt: new Date() } : { status, closedAt: new Date(), finalValue: o.lastValue, updatedAt: new Date() })
    .where(eq(estObjectives.id, id));
}

export async function deleteObjective(tenantId: string, id: string): Promise<void> {
  await db.delete(estObjectives).where(and(eq(estObjectives.id, id), eq(estObjectives.tenantId, tenantId)));
}

export async function updateObjectiveHealth(id: string, health: string, value: number | null): Promise<void> {
  await db.update(estObjectives).set({ lastHealth: health, lastHealthAt: new Date(), lastValue: value }).where(eq(estObjectives.id, id));
}

// --- Palabras clave -------------------------------------------------------------------------------------------------

export async function listKeywords(tenantId: string, clientId: string) {
  return db.select().from(estKeywords).where(and(eq(estKeywords.tenantId, tenantId), eq(estKeywords.clientId, clientId))).orderBy(desc(estKeywords.critical), asc(estKeywords.keyword));
}

export async function addKeywords(tenantId: string, clientId: string, words: string[], opts: { critical?: boolean; targetUrl?: string | null } = {}): Promise<number> {
  await ownClient(tenantId, clientId);
  const clean = [...new Set(words.map((w) => String(w).trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200)).filter((w) => w.length >= 2))].slice(0, 200);
  if (!clean.length) return 0;
  const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(estKeywords).where(eq(estKeywords.clientId, clientId));
  if (Number(n?.n ?? 0) + clean.length > 300) throw new EstError('Como mucho 300 palabras clave por cliente.');
  const target = opts.targetUrl && /^https?:\/\//i.test(opts.targetUrl) ? opts.targetUrl.slice(0, 2000) : null;
  const r = await db
    .insert(estKeywords)
    .values(clean.map((keyword) => ({ tenantId, clientId, keyword, critical: Boolean(opts.critical), targetUrl: target })))
    .onConflictDoNothing()
    .returning({ id: estKeywords.id });
  return r.length;
}

export async function updateKeyword(tenantId: string, id: string, patch: { critical?: boolean; active?: boolean; targetUrl?: string | null }): Promise<void> {
  const set: Partial<typeof estKeywords.$inferInsert> = {};
  if (typeof patch.critical === 'boolean') set.critical = patch.critical;
  if (typeof patch.active === 'boolean') set.active = patch.active;
  if (patch.targetUrl !== undefined) set.targetUrl = patch.targetUrl && /^https?:\/\//i.test(patch.targetUrl) ? patch.targetUrl.slice(0, 2000) : null;
  if (!Object.keys(set).length) return;
  await db.update(estKeywords).set(set).where(and(eq(estKeywords.id, id), eq(estKeywords.tenantId, tenantId)));
}

export async function deleteKeyword(tenantId: string, id: string): Promise<void> {
  await db.delete(estKeywords).where(and(eq(estKeywords.id, id), eq(estKeywords.tenantId, tenantId)));
}

export async function saveKeywordHistory(rows: { keywordId: string; date: string; position: number; clicks: number; impressions: number }[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 1000) {
    await db
      .insert(estKeywordHistory)
      .values(rows.slice(i, i + 1000))
      .onConflictDoUpdate({ target: [estKeywordHistory.keywordId, estKeywordHistory.date], set: { position: sql`excluded.position`, clicks: sql`excluded.clicks`, impressions: sql`excluded.impressions` } });
  }
}

export async function keywordHistory(keywordIds: string[], from: string) {
  if (!keywordIds.length) return [];
  return db.select().from(estKeywordHistory).where(and(inArray(estKeywordHistory.keywordId, keywordIds), gte(estKeywordHistory.date, from))).orderBy(asc(estKeywordHistory.date));
}

export async function updateKeywordSummary(id: string, patch: Partial<typeof estKeywords.$inferInsert>): Promise<void> {
  await db.update(estKeywords).set(patch).where(eq(estKeywords.id, id));
}

// --- Salud de la web ------------------------------------------------------------------------------------------------

export async function saveHealthCheck(tenantId: string, clientId: string, kind: 'critico' | 'salud' | 'velocidad', status: 'ok' | 'aviso' | 'critico', metrics: Record<string, unknown>, issues: EstIssue[]): Promise<void> {
  await db.insert(estHealthChecks).values({ tenantId, clientId, kind, status, metrics, issues: issues.slice(0, 200) });
  // Solo se guardan las últimas 20 de cada tipo y cliente.
  await db.execute(sql`DELETE FROM est_health_checks WHERE id IN (SELECT id FROM est_health_checks WHERE client_id = ${clientId} AND kind = ${kind} ORDER BY checked_at DESC OFFSET 20)`);
}

export async function latestHealth(tenantId: string, clientId: string) {
  const rows = await db
    .select()
    .from(estHealthChecks)
    .where(and(eq(estHealthChecks.tenantId, tenantId), eq(estHealthChecks.clientId, clientId)))
    .orderBy(desc(estHealthChecks.checkedAt))
    .limit(30);
  const out: Partial<Record<'critico' | 'salud' | 'velocidad', (typeof rows)[number]>> = {};
  for (const r of rows) if (!out[r.kind as 'critico']) out[r.kind as 'critico'] = r;
  return { latest: out, history: rows };
}

// --- Señales --------------------------------------------------------------------------------------------------------

/**
 * Guarda las señales de una pasada de un detector: las nuevas se abren, las que siguen se actualizan (sin reabrir las
 * descartadas) y las abiertas de esos tipos que ya no aparecen se dan por resueltas. Devuelve las nuevas.
 */
export async function upsertSignals(tenantId: string, clientId: string, kinds: string[], found: Signal[]): Promise<Signal[]> {
  const existing = kinds.length ? await db.select().from(estSignals).where(and(eq(estSignals.clientId, clientId), inArray(estSignals.kind, kinds))) : [];
  const byKey = new Map(existing.map((s) => [s.dedupeKey, s]));
  const now = new Date();
  const fresh: Signal[] = [];
  const seen = new Set<string>();
  for (const f of found) {
    const key = f.key.slice(0, 300);
    if (seen.has(key)) continue;
    seen.add(key);
    const cur = byKey.get(key);
    if (!cur) {
      await db.insert(estSignals).values({ tenantId, clientId, kind: f.kind, dedupeKey: key, severity: f.severity, title: f.title.slice(0, 300), detail: f.detail, evidence: f.evidence }).onConflictDoNothing();
      fresh.push(f);
    } else {
      const reopen = cur.status === 'resuelta';
      await db
        .update(estSignals)
        .set({ severity: f.severity, title: f.title.slice(0, 300), detail: f.detail, evidence: f.evidence, lastSeenAt: now, ...(reopen ? { status: 'abierta', resolvedAt: null, notifiedAt: null } : {}) })
        .where(eq(estSignals.id, cur.id));
      if (reopen) fresh.push(f);
    }
  }
  const gone = existing.filter((s) => s.status === 'abierta' && !seen.has(s.dedupeKey)).map((s) => s.id);
  if (gone.length) await db.update(estSignals).set({ status: 'resuelta', resolvedAt: now }).where(inArray(estSignals.id, gone));
  return fresh;
}

export async function listSignals(tenantId: string, clientId?: string, opts: { open?: boolean } = {}) {
  const conds = [eq(estSignals.tenantId, tenantId)];
  if (clientId) conds.push(eq(estSignals.clientId, clientId));
  if (opts.open) conds.push(eq(estSignals.status, 'abierta'));
  return db.select().from(estSignals).where(and(...conds)).orderBy(desc(estSignals.lastSeenAt)).limit(clientId ? 200 : 1000);
}

export async function setSignalStatus(tenantId: string, id: string, status: 'abierta' | 'atendida' | 'descartada'): Promise<void> {
  const r = await db.update(estSignals).set({ status, resolvedAt: status === 'abierta' ? null : new Date() }).where(and(eq(estSignals.id, id), eq(estSignals.tenantId, tenantId))).returning({ id: estSignals.id });
  if (!r.length) throw new EstError('Esa señal no existe.');
}

export async function markSignalsNotified(ids: string[]): Promise<void> {
  if (ids.length) await db.update(estSignals).set({ notifiedAt: new Date() }).where(inArray(estSignals.id, ids));
}

// --- Trabajo hecho y URLs trabajadas -------------------------------------------------------------------------------

export async function getWorkFact(tenantId: string, taskId: string) {
  const [row] = await db.select().from(estWorkFacts).where(and(eq(estWorkFacts.tenantId, tenantId), eq(estWorkFacts.taskId, taskId))).limit(1);
  return row ?? null;
}

export async function insertWorkFact(values: typeof estWorkFacts.$inferInsert): Promise<string | null> {
  const [row] = await db.insert(estWorkFacts).values(values).onConflictDoNothing().returning({ id: estWorkFacts.id });
  return row?.id ?? null;
}

export async function updateWorkFact(id: string, patch: Partial<typeof estWorkFacts.$inferInsert>): Promise<void> {
  await db.update(estWorkFacts).set({ ...patch, updatedAt: new Date() }).where(eq(estWorkFacts.id, id));
}

export async function listWorkFacts(tenantId: string, clientId: string, sinceDays = 365) {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10);
  return db.select().from(estWorkFacts).where(and(eq(estWorkFacts.tenantId, tenantId), eq(estWorkFacts.clientId, clientId), gte(estWorkFacts.doneOn, since))).orderBy(desc(estWorkFacts.doneOn)).limit(300);
}

/** Empieza (o renueva) el seguimiento diario de una URL trabajada. */
export async function trackUrl(tenantId: string, clientId: string, input: { url: string; property: string; reason: string; workFactId: string | null; changedOn: string; trackDays: number }): Promise<void> {
  const activeUntil = new Date(Date.parse(`${input.changedOn}T12:00:00Z`) + input.trackDays * 86_400_000).toISOString().slice(0, 10);
  await db
    .insert(estTrackedUrls)
    .values({ tenantId, clientId, url: input.url.slice(0, 2000), property: input.property, reason: input.reason.slice(0, 300), workFactId: input.workFactId, changedOn: input.changedOn, activeUntil })
    .onConflictDoUpdate({
      target: [estTrackedUrls.clientId, estTrackedUrls.url],
      // Un cambio nuevo en la misma página: se reinicia la espera del rastreo y se alarga el seguimiento.
      set: { reason: input.reason.slice(0, 300), workFactId: input.workFactId, changedOn: input.changedOn, crawledOn: null, activeUntil, property: input.property }
    });
}

export async function listTrackedUrls(tenantId: string, clientId?: string, opts: { activeOn?: string } = {}) {
  const conds = [eq(estTrackedUrls.tenantId, tenantId)];
  if (clientId) conds.push(eq(estTrackedUrls.clientId, clientId));
  if (opts.activeOn) conds.push(gte(estTrackedUrls.activeUntil, opts.activeOn));
  return db.select().from(estTrackedUrls).where(and(...conds)).orderBy(desc(estTrackedUrls.changedOn));
}

export async function updateTrackedUrl(id: string, patch: Partial<typeof estTrackedUrls.$inferInsert>): Promise<void> {
  await db.update(estTrackedUrls).set(patch).where(eq(estTrackedUrls.id, id));
}

export async function deleteTrackedUrl(tenantId: string, id: string): Promise<void> {
  await db.delete(estTrackedUrls).where(and(eq(estTrackedUrls.id, id), eq(estTrackedUrls.tenantId, tenantId)));
}

export async function saveUrlDaily(trackedUrlId: string, rows: { date: string; clicks: number; impressions: number; ctr: number; position: number }[]): Promise<void> {
  const vals = rows.filter((r) => isYmd(r.date)).map((r) => ({ trackedUrlId, date: r.date, clicks: Math.round(r.clicks) || 0, impressions: Math.round(r.impressions) || 0, ctr: Number(r.ctr) || 0, position: Number(r.position) || 0 }));
  for (let i = 0; i < vals.length; i += 1000) {
    await db
      .insert(estUrlDaily)
      .values(vals.slice(i, i + 1000))
      .onConflictDoUpdate({ target: [estUrlDaily.trackedUrlId, estUrlDaily.date], set: { clicks: sql`excluded.clicks`, impressions: sql`excluded.impressions`, ctr: sql`excluded.ctr`, position: sql`excluded.position` } });
  }
}

/** Clics e impresiones de las URLs seguidas: 28 días antes del cambio y desde el rastreo (o el cambio). */
export async function urlSummaries(ids: string[]) {
  if (!ids.length) return [];
  return db
    .select({ id: estUrlDaily.trackedUrlId, date: estUrlDaily.date, clicks: estUrlDaily.clicks, impressions: estUrlDaily.impressions, position: estUrlDaily.position })
    .from(estUrlDaily)
    .where(inArray(estUrlDaily.trackedUrlId, ids))
    .orderBy(asc(estUrlDaily.date));
}

// --- Calendario de eventos ------------------------------------------------------------------------------------------

export async function listEvents(tenantId: string, from?: string, to?: string): Promise<EstEvent[]> {
  const conds = [eq(estEvents.tenantId, tenantId)];
  if (to) conds.push(lte(estEvents.date, to));
  if (from) conds.push(or(gte(estEvents.date, from), gte(estEvents.endDate, from))!);
  return db.select().from(estEvents).where(and(...conds)).orderBy(desc(estEvents.date)).limit(500);
}

export type EventInput = { id?: string | null; date: string; endDate?: string | null; kind: string; title: string; notes?: string; createdBy?: number | null };

export async function saveEvent(tenantId: string, input: EventInput): Promise<string> {
  if (!isYmd(input.date)) throw new EstError('La fecha no es válida.');
  const endDate = input.endDate ? (isYmd(input.endDate) ? input.endDate : null) : null;
  if (endDate && endDate < input.date) throw new EstError('La fecha de fin es anterior a la de inicio.');
  const kind = ['google', 'festivo', 'datos', 'otro'].includes(input.kind) ? input.kind : 'otro';
  const title = String(input.title ?? '').trim().slice(0, 200);
  if (!title) throw new EstError('Pon un título al evento.');
  const values = { date: input.date, endDate, kind, title, notes: String(input.notes ?? '').trim().slice(0, 1000) || null };
  if (input.id) {
    const [row] = await db.update(estEvents).set(values).where(and(eq(estEvents.id, input.id), eq(estEvents.tenantId, tenantId))).returning({ id: estEvents.id });
    if (!row) throw new EstError('Ese evento no existe.');
    return row.id;
  }
  const [row] = await db.insert(estEvents).values({ tenantId, ...values, createdBy: input.createdBy ?? null }).returning({ id: estEvents.id });
  return row.id;
}

export async function deleteEvent(tenantId: string, id: string): Promise<void> {
  await db.delete(estEvents).where(and(eq(estEvents.id, id), eq(estEvents.tenantId, tenantId)));
}

/** Para el núcleo (Rendimiento): eventos que se solapan con un periodo. */
export async function eventsOverlapping(tenantId: string, from: string, to: string) {
  return db
    .select()
    .from(estEvents)
    .where(and(eq(estEvents.tenantId, tenantId), lte(estEvents.date, to), or(gte(estEvents.date, from), gte(estEvents.endDate, from), and(isNull(estEvents.endDate), gte(estEvents.date, from)))!))
    .orderBy(asc(estEvents.date));
}

