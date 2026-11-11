import 'server-only';

// Motor de acciones del agente (paso 2). Toda propuesta del agente se registra aquí con la
// decisión humana, para medir cuánto acierta y subir su autonomía por tipo con datos.
//   - autonomo:   el agente actúa solo (estado «auto»);
//   - aprobacion: propone y Enric aprueba con un botón (estado «aprobado») o corrige («corregido»);
//   - sombra:     propone pero no se le enseña a nadie; se guarda lo que hizo el humano para comparar.
// Diseño: docs/DISENO-MOTOR-ACCIONES.md.
import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsAgentActions, opsSettings, type OpsAgentAction } from '@/lib/db/schema';

export type AgentKind = 'blocker_answer' | 'note_conversion';
export type Autonomy = 'sombra' | 'aprobacion' | 'autonomo';
export type ActionStatus = 'propuesto' | 'aprobado' | 'corregido' | 'rechazado' | 'auto' | 'sombra';

export const AUTONOMY_LABEL: Record<Autonomy, string> = {
  sombra: 'En sombra',
  aprobacion: 'Con tu aprobación',
  autonomo: 'Autónomo'
};

export const AGENT_KINDS: Record<
  AgentKind,
  { label: string; description: string; defaultAutonomy: Autonomy; allowed: Autonomy[] }
> = {
  blocker_answer: {
    label: 'Responder bloqueos',
    description:
      'Cuando alguien pulsa «Bloqueado», la IA busca la respuesta en la tarea. Autónomo: responde sola si cita una fuente fiable. Con tu aprobación: te propone la respuesta y la envías con un botón.',
    defaultAutonomy: 'autonomo',
    allowed: ['sombra', 'aprobacion', 'autonomo']
  },
  note_conversion: {
    label: 'Convertir notas en encargos',
    description:
      'La IA propone los encargos de una nota y tú los revisas en pantalla antes de enviarlos. Se mide cuántas propuestas envías sin tocar.',
    defaultAutonomy: 'aprobacion',
    allowed: ['aprobacion']
  }
};

export const isAgentKind = (k: string): k is AgentKind => k in AGENT_KINDS;
const settingKey = (kind: AgentKind) => `agent_autonomy:${kind}`;

export async function getAutonomy(tenantId: string, kind: AgentKind): Promise<Autonomy> {
  const [row] = await db
    .select({ value: opsSettings.value })
    .from(opsSettings)
    .where(and(eq(opsSettings.tenantId, tenantId), eq(opsSettings.key, settingKey(kind))))
    .limit(1);
  const v = row?.value as Autonomy | undefined;
  return v && AGENT_KINDS[kind].allowed.includes(v) ? v : AGENT_KINDS[kind].defaultAutonomy;
}

export async function setAutonomy(tenantId: string, kind: AgentKind, level: Autonomy): Promise<void> {
  if (!AGENT_KINDS[kind].allowed.includes(level)) throw new Error('Ese nivel no está disponible para esta acción');
  await db
    .insert(opsSettings)
    .values({ tenantId, key: settingKey(kind), value: level })
    .onConflictDoUpdate({
      target: [opsSettings.tenantId, opsSettings.key],
      set: { value: level, updatedAt: new Date() }
    });
}

export async function recordAction(input: {
  tenantId: string;
  kind: AgentKind;
  status: ActionStatus;
  autonomy: Autonomy;
  summary: string;
  proposal: unknown;
  final?: unknown;
  requestId?: string | null;
  blockerId?: string | null;
  noteId?: string | null;
  decidedByName?: string | null;
  decidedVia?: 'telegram' | 'panel' | 'agente' | null;
  dedupeKey: string;
}): Promise<OpsAgentAction | null> {
  const decided = input.status !== 'propuesto' && input.status !== 'sombra';
  const [row] = await db
    .insert(opsAgentActions)
    .values({
      tenantId: input.tenantId,
      kind: input.kind,
      status: input.status,
      autonomy: input.autonomy,
      summary: input.summary.slice(0, 500),
      proposal: input.proposal ?? {},
      final: input.final ?? null,
      requestId: input.requestId ?? null,
      blockerId: input.blockerId ?? null,
      noteId: input.noteId ?? null,
      decidedByName: input.decidedByName ?? null,
      decidedVia: input.decidedVia ?? null,
      decidedAt: decided ? new Date() : null,
      executedAt: input.status === 'auto' || input.status === 'aprobado' || input.status === 'corregido' ? new Date() : null,
      dedupeKey: input.dedupeKey
    })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

export async function getAction(tenantId: string, id: string): Promise<OpsAgentAction | null> {
  const [row] = await db
    .select()
    .from(opsAgentActions)
    .where(and(eq(opsAgentActions.id, id), eq(opsAgentActions.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

// Propuesta abierta (o en sombra) ligada a un bloqueo.
export async function getOpenActionForBlocker(tenantId: string, blockerId: string): Promise<OpsAgentAction | null> {
  const [row] = await db
    .select()
    .from(opsAgentActions)
    .where(
      and(
        eq(opsAgentActions.tenantId, tenantId),
        eq(opsAgentActions.blockerId, blockerId),
        inArray(opsAgentActions.status, ['propuesto', 'sombra'])
      )
    )
    .orderBy(desc(opsAgentActions.createdAt))
    .limit(1);
  return row ?? null;
}

// Decisión atómica: solo pasa si sigue «propuesto» (o «sombra», que solo guarda lo que hizo el humano).
export async function decideAction(
  tenantId: string,
  id: string,
  decision: { status: 'aprobado' | 'corregido' | 'rechazado'; via: 'telegram' | 'panel'; byName: string; final?: unknown }
): Promise<OpsAgentAction | null> {
  const [current] = await db
    .select({ status: opsAgentActions.status })
    .from(opsAgentActions)
    .where(and(eq(opsAgentActions.id, id), eq(opsAgentActions.tenantId, tenantId)))
    .limit(1);
  if (!current) return null;
  // Solo se decide lo que sigue abierto: una propuesta ya aprobada, corregida o descartada no cambia.
  if (current.status !== 'propuesto' && current.status !== 'sombra') return null;
  // En sombra no hay decisión que medir como acierto: se guarda lo que se hizo y se deja en «sombra».
  const status = current.status === 'sombra' ? 'sombra' : decision.status;
  const [row] = await db
    .update(opsAgentActions)
    .set({
      status,
      final: decision.final ?? null,
      decidedByName: decision.byName,
      decidedVia: decision.via,
      decidedAt: new Date(),
      executedAt: decision.status === 'rechazado' ? null : new Date()
    })
    .where(
      and(
        eq(opsAgentActions.id, id),
        eq(opsAgentActions.tenantId, tenantId),
        eq(opsAgentActions.status, current.status),
        // Atómico frente a dos pulsaciones a la vez (también en sombra, que solo se anota una vez).
        isNull(opsAgentActions.decidedAt)
      )
    )
    .returning();
  return row ?? null;
}

// --- Estadísticas del panel «Agente» ---------------------------------------------------

export type KindStats = {
  kind: AgentKind;
  label: string;
  description: string;
  autonomy: Autonomy;
  allowed: Autonomy[];
  total: number;
  approved: number; // aprobadas a la primera
  corrected: number;
  rejected: number;
  auto: number;
  pending: number;
  shadow: number;
  hitRate: number | null; // aprobadas / decididas (0-1)
  avgDecisionMin: number | null;
  recommendation: string | null;
};

const MIN_FOR_RECOMMENDATION = 30;

export function recommend(s: Pick<KindStats, 'autonomy' | 'allowed' | 'approved' | 'corrected' | 'rejected'>): string | null {
  const decided = s.approved + s.corrected + s.rejected;
  if (decided < MIN_FOR_RECOMMENDATION) return null;
  const rate = s.approved / decided;
  if (s.autonomy === 'aprobacion' && rate >= 0.95 && s.allowed.includes('autonomo')) {
    return `${Math.round(rate * 100)} % aprobadas a la primera en ${decided} propuestas: puedes pasarla a autónomo.`;
  }
  if (s.autonomy === 'autonomo' && rate < 0.8) {
    return `Solo el ${Math.round(rate * 100)} % aprobadas a la primera: conviene volver a «con tu aprobación».`;
  }
  return null;
}

export async function getAgentStats(tenantId: string, days = 30): Promise<KindStats[]> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select({
      kind: opsAgentActions.kind,
      status: opsAgentActions.status,
      n: sql<number>`count(*)::int`,
      avgMin: sql<number | null>`avg(extract(epoch from (${opsAgentActions.decidedAt} - ${opsAgentActions.createdAt})) / 60)
        filter (where ${opsAgentActions.decidedVia} in ('telegram', 'panel'))`
    })
    .from(opsAgentActions)
    .where(and(eq(opsAgentActions.tenantId, tenantId), gte(opsAgentActions.createdAt, since)))
    .groupBy(opsAgentActions.kind, opsAgentActions.status);

  const out: KindStats[] = [];
  for (const kind of Object.keys(AGENT_KINDS) as AgentKind[]) {
    const meta = AGENT_KINDS[kind];
    const mine = rows.filter((r) => r.kind === kind);
    const count = (st: ActionStatus) => mine.find((r) => r.status === st)?.n ?? 0;
    const decidedRows = mine.filter((r) => r.avgMin !== null);
    const weight = decidedRows.reduce((a, r) => a + r.n, 0);
    const avg = weight ? decidedRows.reduce((a, r) => a + Number(r.avgMin) * r.n, 0) / weight : null;
    const s = {
      kind,
      label: meta.label,
      description: meta.description,
      autonomy: await getAutonomy(tenantId, kind),
      allowed: meta.allowed,
      total: mine.reduce((a, r) => a + r.n, 0),
      approved: count('aprobado'),
      corrected: count('corregido'),
      rejected: count('rechazado'),
      auto: count('auto'),
      pending: count('propuesto'),
      shadow: count('sombra'),
      hitRate: null as number | null,
      avgDecisionMin: avg === null ? null : Math.round(avg),
      recommendation: null as string | null
    };
    const decided = s.approved + s.corrected + s.rejected;
    s.hitRate = decided ? s.approved / decided : null;
    s.recommendation = recommend(s);
    out.push(s);
  }
  return out;
}

export async function listRecentActions(tenantId: string, limit = 40): Promise<OpsAgentAction[]> {
  return db
    .select()
    .from(opsAgentActions)
    .where(eq(opsAgentActions.tenantId, tenantId))
    .orderBy(desc(opsAgentActions.createdAt))
    .limit(limit);
}

// --- Conversión de notas: ¿se envió lo que propuso la IA? ------------------------------

type Comparable = { key: string; title: string; listId: string; assigneeId: string; dueDate: string; priority: number };

export function compareNoteProposal(
  proposed: Comparable[],
  sent: Comparable[]
): { status: 'aprobado' | 'corregido'; changed: number; removed: number; added: number } {
  const byKey = new Map(proposed.map((p) => [p.key, p]));
  let changed = 0;
  let added = 0;
  for (const s of sent) {
    const p = byKey.get(s.key);
    if (!p) {
      added++;
      continue;
    }
    const same =
      p.title.trim() === s.title.trim() &&
      p.listId === s.listId &&
      (p.assigneeId || '') === (s.assigneeId || '') &&
      (p.dueDate || '') === (s.dueDate || '') &&
      p.priority === s.priority;
    if (!same) changed++;
  }
  const sentKeys = new Set(sent.map((s) => s.key));
  const removed = proposed.filter((p) => !sentKeys.has(p.key)).length;
  return { status: changed + removed + added === 0 ? 'aprobado' : 'corregido', changed, removed, added };
}
