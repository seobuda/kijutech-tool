// Tiempos de tarea (paso 5B): datos de la pestaña Equipo → Tiempos (admin) y de Mi panel.
// Solo lee de la base de datos (ops_task_times, ops_work_types); no llama a ClickUp.
import 'server-only';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsTaskTimes, opsWorkTypes, type OpsTaskTime } from '@/lib/db/schema';
import { loadClosedTimes, tiemposSettings } from '@/lib/operaciones/tiempos';
import { median, OVER_REASONS, suggestBand, type Verdict } from '@/lib/operaciones/tiempos-core';

export type TypeRow = {
  key: string;
  label: string;
  minMinutes: number | null;
  maxMinutes: number | null;
  n: number;
  median: number | null;
  pctInside: number | null; // % dentro del margen (de las que tenían margen)
  suggestion: { min: number; max: number; n: number } | null;
};

export type PersonRow = {
  clickupUserId: string;
  name: string;
  n: number;
  totalMin: number;
  pctInside: number | null;
  precision: number | null; // % de estimaciones acertadas
  estimated: number; // tareas con estimación
  pendingJustify: number;
};

export type TimeRow = {
  id: string;
  doneAt: string | null;
  person: string;
  task: string;
  type: string | null;
  minutes: number | null;
  estimate: number | null;
  bandMin: number | null;
  bandMax: number | null;
  verdict: Verdict | null;
  hit: boolean | null;
  justifyStatus: string;
  reason: string | null;
  url: string | null;
  note: string | null;
  source: string;
  voided: boolean;
  voidReason: string | null;
};

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);

function toRow(r: OpsTaskTime, labels: Map<string, string>): TimeRow {
  return {
    id: r.id,
    doneAt: r.doneAt?.toISOString() ?? null,
    person: r.personName,
    task: r.taskName,
    type: r.workTypeKey ? (labels.get(r.workTypeKey) ?? r.workTypeKey) : null,
    minutes: r.workedMinutes,
    estimate: r.estimateMinutes,
    bandMin: r.bandMin,
    bandMax: r.bandMax,
    verdict: r.verdict as Verdict | null,
    hit: r.precisionHit,
    justifyStatus: r.justifyStatus,
    reason: r.overReason ? (OVER_REASONS[r.overReason as keyof typeof OVER_REASONS] ?? r.overReason) : null,
    url: r.evidenceUrl,
    note: r.overNote,
    source: r.source,
    voided: Boolean(r.voidedAt),
    voidReason: r.voidReason
  };
}

function personStats(rows: OpsTaskTime[]): Omit<PersonRow, 'clickupUserId' | 'name'> {
  const banded = rows.filter((r) => r.verdict && r.verdict !== 'sin_margen');
  const est = rows.filter((r) => r.precisionHit !== null);
  return {
    n: rows.length,
    totalMin: rows.reduce((s, r) => s + (r.workedMinutes ?? 0), 0),
    pctInside: pct(banded.filter((r) => r.verdict === 'dentro').length, banded.length),
    precision: pct(est.filter((r) => r.precisionHit).length, est.length),
    estimated: est.length,
    pendingJustify: rows.filter((r) => r.justifyStatus === 'pendiente').length
  };
}

export async function getTiemposOverview(tenantId: string, days: number) {
  const settings = await tiemposSettings(tenantId);
  const since = new Date(Date.now() - days * 86_400_000);
  const types = await db.select().from(opsWorkTypes).where(eq(opsWorkTypes.tenantId, tenantId)).orderBy(opsWorkTypes.sortOrder);
  const labels = new Map(types.map((t) => [t.key, t.label]));
  const all = await loadClosedTimes(tenantId, { since, includeVoided: true });
  const valid = all.filter((r) => !r.voidedAt);
  // Para proponer márgenes se mira más atrás (120 días) que el periodo de la pantalla.
  const long = days >= 120 ? valid : await loadClosedTimes(tenantId, { since: new Date(Date.now() - 120 * 86_400_000) });

  const typeRows: TypeRow[] = types
    .filter((t) => t.active)
    .map((t) => {
      const mine = valid.filter((r) => r.workTypeKey === t.key);
      const banded = mine.filter((r) => r.verdict && r.verdict !== 'sin_margen');
      const samples = long.filter((r) => r.workTypeKey === t.key && (r.workedMinutes ?? 0) > 0).map((r) => r.workedMinutes!);
      return {
        key: t.key,
        label: t.label,
        minMinutes: t.minMinutes,
        maxMinutes: t.maxMinutes,
        n: mine.length,
        median: median(mine.map((r) => r.workedMinutes ?? 0)),
        pctInside: pct(banded.filter((r) => r.verdict === 'dentro').length, banded.length),
        suggestion: suggestBand(samples, settings.minSamples)
      };
    });

  const byPerson = new Map<string, OpsTaskTime[]>();
  for (const r of valid) byPerson.set(r.clickupUserId, [...(byPerson.get(r.clickupUserId) ?? []), r]);
  const people: PersonRow[] = [...byPerson.entries()]
    .map(([u, rows]) => ({ clickupUserId: u, name: rows[0].personName, ...personStats(rows) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const open = await db
    .select()
    .from(opsTaskTimes)
    .where(and(eq(opsTaskTimes.tenantId, tenantId), eq(opsTaskTimes.status, 'abierta'), isNull(opsTaskTimes.voidedAt)))
    .orderBy(desc(opsTaskTimes.startedAt))
    .limit(50);

  return {
    settings,
    days,
    types: typeRows,
    people,
    outliers: all.filter((r) => r.verdict === 'pasado' || r.verdict === 'rapido').slice(0, 100).map((r) => toRow(r, labels)),
    recent: all.slice(0, 100).map((r) => toRow(r, labels)),
    open: open.map((r) => ({ id: r.id, person: r.personName, task: r.taskName, type: r.workTypeKey ? (labels.get(r.workTypeKey) ?? r.workTypeKey) : null, startedAt: r.startedAt.toISOString(), estimate: r.estimateMinutes }))
  };
}

export type TiemposOverview = Awaited<ReturnType<typeof getTiemposOverview>>;

/** Mi panel: lo de una sola persona (sus tareas y su precisión) frente a la mediana del equipo por tipo. */
export async function getMyTimes(tenantId: string, clickupUserId: string, days: number) {
  const since = new Date(Date.now() - days * 86_400_000);
  const types = await db.select().from(opsWorkTypes).where(eq(opsWorkTypes.tenantId, tenantId));
  const labels = new Map(types.map((t) => [t.key, t.label]));
  const team = await loadClosedTimes(tenantId, { since });
  const mine = team.filter((r) => r.clickupUserId === clickupUserId);
  const byType = [...new Set(mine.map((r) => r.workTypeKey).filter((k): k is string => Boolean(k)))].map((k) => ({
    key: k,
    label: labels.get(k) ?? k,
    n: mine.filter((r) => r.workTypeKey === k).length,
    myMedian: median(mine.filter((r) => r.workTypeKey === k).map((r) => r.workedMinutes ?? 0)),
    teamMedian: median(team.filter((r) => r.workTypeKey === k).map((r) => r.workedMinutes ?? 0))
  }));
  return { stats: personStats(mine), byType, recent: mine.slice(0, 30).map((r) => toRow(r, labels)) };
}
