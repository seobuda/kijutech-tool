import 'server-only';

// Núcleo: registro de intervenciones (Hito 1 SEO, 23 nov 2026; docs/DISENO-TECNICO-HITO1.md §4 y §9).
// Cada encargo aprobado por un módulo (plan de mejora de SEO, propuestas de Estrategia, después Ads) se registra aquí con
// su técnica y su hipótesis EN EL MOMENTO de aprobarlo: es el dato que no se puede recuperar después. La fecha de
// «hecho» la pone el núcleo preguntando cada hora a la fuente de trabajo (workSource().requestStatus): la fuente no
// tiene que avisar, y sirve igual con ClickUp o con la herramienta que lo sustituya. Este archivo no importa módulos.
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clients, interventions, type Intervention, type InterventionHypothesis } from '@/lib/db/schema';
import { workSource } from '@/lib/core/capabilities';
import { ensureSchedule, registerJobKind, registerProcess } from '@/lib/core/jobs';
import { normalizeTechnique, TAXONOMY_VERSION, TECHNIQUE_BY_KEY, verifyPlan, type TechniqueDomain } from '@/lib/core/techniques';

export const INTERVENTIONS_SYNC = 'core.interventions.sync';

export type InterventionInput = {
  tenantId: string;
  clientId: string;
  projectId?: string | null;
  domain: TechniqueDomain;
  technique: string;
  urls?: string[];
  queries?: string[];
  hypothesis?: InterventionHypothesis;
  source: string;
  sourceRef: string;
  requestRef?: string | null;
  createdBy?: string | null;
};

/** Hipótesis completa: lo que falte se rellena con lo típico de la técnica (métrica y ventana), siempre «sube». */
export function completeHypothesis(technique: string, h: InterventionHypothesis | undefined): InterventionHypothesis {
  const t = TECHNIQUE_BY_KEY.get(technique);
  const direction = h?.direction === 'baja' ? 'baja' : 'sube';
  const out: InterventionHypothesis = { metric: h?.metric || t?.metric || 'clics', direction, windowDays: clampInt(h?.windowDays, 7, 365) ?? t?.windowDays ?? 56 };
  const mag = Number(h?.magnitudePct);
  if (Number.isFinite(mag) && mag > 0) out.magnitudePct = Math.min(1000, Math.round(mag));
  out.verify = h?.verify ?? verifyPlan(technique, out.metric!, out.windowDays!);
  return out;
}
function clampInt(v: unknown, min: number, max: number): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.max(min, Math.min(max, Math.round(n))) : null;
}

const cleanList = (xs: string[] | undefined, max: number) => [...new Set((xs ?? []).map((x) => x.trim()).filter(Boolean))].slice(0, max).map((x) => x.slice(0, 2000));

/**
 * Registra (o actualiza, si ya estaba: misma fuente y misma referencia) una intervención. Copia el tipo de negocio de la
 * ficha del cliente y da de alta, si no lo estaba, el proceso horario que pone la fecha de «hecho».
 */
export async function recordIntervention(input: InterventionInput): Promise<Intervention> {
  const [client] = await db
    .select({ businessType: clients.businessType })
    .from(clients)
    .where(and(eq(clients.id, input.clientId), eq(clients.tenantId, input.tenantId)))
    .limit(1);
  if (!client) throw new Error('Cliente no encontrado para la intervención');
  const technique = normalizeTechnique(input.technique);
  const values = {
    tenantId: input.tenantId,
    clientId: input.clientId,
    projectId: input.projectId ?? null,
    domain: input.domain,
    technique,
    taxonomyVersion: TAXONOMY_VERSION,
    businessType: client.businessType,
    urls: cleanList(input.urls, 200),
    queries: cleanList(input.queries, 50),
    hypothesis: completeHypothesis(technique, input.hypothesis),
    source: input.source.slice(0, 40),
    sourceRef: input.sourceRef.slice(0, 60),
    requestRef: input.requestRef?.slice(0, 60) ?? null,
    createdBy: input.createdBy?.slice(0, 120) ?? null
  };
  const [row] = await db
    .insert(interventions)
    .values(values)
    .onConflictDoUpdate({
      target: [interventions.tenantId, interventions.source, interventions.sourceRef],
      set: { technique: values.technique, urls: values.urls, queries: values.queries, hypothesis: values.hypothesis, requestRef: sql`coalesce(excluded.request_ref, ${interventions.requestRef})`, updatedAt: new Date() }
    })
    .returning();
  if (row.requestRef && row.status === 'prevista') await ensureSchedule(input.tenantId, INTERVENTIONS_SYNC, '', 60);
  return row;
}

/** Se descartó el trabajo antes de hacerse (p. ej. se borró el encargo o se deshizo la aprobación). */
export async function cancelIntervention(tenantId: string, source: string, sourceRef: string): Promise<void> {
  await db
    .update(interventions)
    .set({ status: 'cancelada', updatedAt: new Date() })
    .where(and(eq(interventions.tenantId, tenantId), eq(interventions.source, source), eq(interventions.sourceRef, sourceRef), eq(interventions.status, 'prevista')));
}

/** Pone la fecha de «hecho» a las intervenciones previstas cuyo encargo ya terminó. */
export async function syncInterventionStatus(tenantId: string): Promise<{ checked: number; done: number }> {
  const ws = workSource();
  if (!ws?.requestStatus) return { checked: 0, done: 0 };
  const open = await db
    .select({ id: interventions.id, requestRef: interventions.requestRef })
    .from(interventions)
    .where(and(eq(interventions.tenantId, tenantId), eq(interventions.status, 'prevista'), isNotNull(interventions.requestRef)))
    .limit(2000);
  let done = 0;
  for (let i = 0; i < open.length; i += 500) {
    const chunk = open.slice(i, i + 500);
    const status = await ws.requestStatus(tenantId, chunk.map((r) => r.requestRef!));
    const byRef = new Map(status.map((s) => [s.ref, s]));
    for (const r of chunk) {
      const s = byRef.get(r.requestRef!);
      if (!s) continue;
      if (s.cancelled) {
        await db.update(interventions).set({ status: 'cancelada', updatedAt: new Date() }).where(eq(interventions.id, r.id));
      } else if (s.doneAt) {
        await db.update(interventions).set({ status: 'hecha', doneAt: new Date(s.doneAt), updatedAt: new Date() }).where(eq(interventions.id, r.id));
        done++;
      }
    }
  }
  return { checked: open.length, done };
}

/** Intervenciones de un proyecto (para las pantallas del módulo). */
export async function listProjectInterventions(tenantId: string, projectId: string, limit = 200): Promise<Intervention[]> {
  return db
    .select()
    .from(interventions)
    .where(and(eq(interventions.tenantId, tenantId), eq(interventions.projectId, projectId)))
    .orderBy(sql`${interventions.createdAt} DESC`)
    .limit(limit);
}

/** Intervenciones por referencia de origen (p. ej. las propuestas de un plan). */
export async function interventionsBySource(tenantId: string, source: string, sourceRefs: string[]): Promise<Intervention[]> {
  if (!sourceRefs.length) return [];
  return db
    .select()
    .from(interventions)
    .where(and(eq(interventions.tenantId, tenantId), eq(interventions.source, source), inArray(interventions.sourceRef, sourceRefs)));
}

let registered = false;
export function registerInterventionJobs(): void {
  if (registered) return;
  registered = true;
  registerJobKind({ kind: INTERVENTIONS_SYNC, timeoutS: 120, maxConcurrent: 1, maxAttempts: 2, run: async (ctx) => syncInterventionStatus(ctx.tenantId) });
  registerProcess({ key: INTERVENTIONS_SYNC, scopeType: 'cuenta', label: 'Intervenciones: fecha de «hecho» de los encargos', defaultEveryMinutes: 60, enqueue: () => ({ kind: INTERVENTIONS_SYNC, priority: 8 }) });
}
