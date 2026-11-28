import 'server-only';

// SEO · Jefe SEO, D6: revisión del plan (versión n+1) propuesta sola, sin gastar. Una pasada diaria mira cada plan aprobado
// y, si hay un motivo (actualización de Google terminada, estrategia cerrada o datos maduros a los 28 y 90 días), deja una
// propuesta «revision» en Plan de servicio. Un administrador decide: «Generar la revisión» (Opus, ~0,6 $, con los topes de
// siempre) o «No hace falta» con motivo. Un motivo ya tratado no se repite; al aprobarse otra versión, lo pendiente caduca.
import { and, desc, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { kbFeedItems, projects, seoCycles, seoJefeProposals, seoMasterPlans, type SeoJefeProposal } from '@/lib/db/schema';
import { PlanError } from '@/lib/seo/jefe/errors';
import { requestMasterPlan } from '@/lib/seo/jefe/plan';
import { nextRevisionTrigger } from '@/lib/seo/jefe/revision-rules';

export type RevisionPayload = { trigger: string; reason: string; planVersion: number };
export type RevisionView = Pick<SeoJefeProposal, 'id' | 'status' | 'baseVersion' | 'decidedBy' | 'decisionReason' | 'createdAt'> & { payload: RevisionPayload };

export async function jefeRevisionPass(tenantId: string, now = new Date()): Promise<{ propuestas: number }> {
  const plans = await db
    .select({ id: seoMasterPlans.id, projectId: seoMasterPlans.projectId, version: seoMasterPlans.version, decidedAt: seoMasterPlans.decidedAt, createdAt: seoMasterPlans.createdAt })
    .from(seoMasterPlans)
    .innerJoin(projects, eq(projects.id, seoMasterPlans.projectId))
    .where(and(eq(seoMasterPlans.tenantId, tenantId), eq(seoMasterPlans.status, 'aprobado'), eq(projects.service, 'seo')));
  if (!plans.length) return { propuestas: 0 };
  const cores = await db
    .select({ id: kbFeedItems.id, title: kbFeedItems.title, endsAt: kbFeedItems.endsAt })
    .from(kbFeedItems)
    .where(and(eq(kbFeedItems.tenantId, tenantId), eq(kbFeedItems.domain, 'seo'), eq(kbFeedItems.kind, 'core_update'), isNotNull(kbFeedItems.endsAt), gt(kbFeedItems.endsAt, new Date(now.getTime() - 120 * 86_400_000))))
    .limit(20);
  let propuestas = 0;
  for (const p of plans) {
    const approvedAt = p.decidedAt ?? p.createdAt;
    const [props, cycles, draft] = await Promise.all([
      db.select({ status: seoJefeProposals.status, payload: seoJefeProposals.payload }).from(seoJefeProposals).where(and(eq(seoJefeProposals.projectId, p.projectId), eq(seoJefeProposals.kind, 'revision'), eq(seoJefeProposals.basePlanId, p.id))),
      db.select({ id: seoCycles.id, name: seoCycles.name, closedAt: seoCycles.closedAt }).from(seoCycles).where(and(eq(seoCycles.projectId, p.projectId), inArray(seoCycles.status, ['cerrado', 'leido']), isNotNull(seoCycles.closedAt), gt(seoCycles.closedAt, approvedAt))),
      db.select({ id: seoMasterPlans.id }).from(seoMasterPlans).where(and(eq(seoMasterPlans.projectId, p.projectId), inArray(seoMasterPlans.status, ['borrador', 'sombra', 'propuesto']), sql`${seoMasterPlans.version} > ${p.version}`)).limit(1)
    ]);
    // Ya hay una revisión pendiente o una versión nueva en marcha o por revisar: nada.
    if (props.some((x) => x.status === 'pendiente') || draft.length) continue;
    const t = nextRevisionTrigger({
      approvedAt,
      now,
      coreUpdatesEnded: cores.filter((c) => c.endsAt).map((c) => ({ id: c.id, title: c.title, endsAt: c.endsAt! })),
      cyclesClosed: cycles.filter((c) => c.closedAt).map((c) => ({ id: c.id, name: c.name, closedAt: c.closedAt! })),
      handled: new Set(props.map((x) => String((x.payload as RevisionPayload).trigger ?? '')))
    });
    if (!t) continue;
    const payload: RevisionPayload = { trigger: t.key, reason: t.reason, planVersion: p.version };
    await db.insert(seoJefeProposals).values({ tenantId, projectId: p.projectId, kind: 'revision', basePlanId: p.id, baseVersion: p.version, payload, status: 'pendiente' });
    propuestas++;
  }
  return { propuestas };
}

export async function pendingRevision(tenantId: string, projectId: string): Promise<RevisionView | null> {
  const [r] = await db
    .select({ id: seoJefeProposals.id, status: seoJefeProposals.status, baseVersion: seoJefeProposals.baseVersion, decidedBy: seoJefeProposals.decidedBy, decisionReason: seoJefeProposals.decisionReason, createdAt: seoJefeProposals.createdAt, payload: seoJefeProposals.payload })
    .from(seoJefeProposals)
    .where(and(eq(seoJefeProposals.tenantId, tenantId), eq(seoJefeProposals.projectId, projectId), eq(seoJefeProposals.kind, 'revision'), eq(seoJefeProposals.status, 'pendiente')))
    .orderBy(desc(seoJefeProposals.createdAt))
    .limit(1);
  return r ? { ...r, payload: r.payload as RevisionPayload } : null;
}

/** Generar la revisión (encola la versión nueva con los topes de siempre) o descartarla con motivo. */
export async function decideRevision(tenantId: string, projectId: string, id: string, accept: boolean, by: string, reason: string | null): Promise<{ version: number | null }> {
  const why = reason?.trim() ?? '';
  if (!accept && why.length < 5) throw new PlanError('Escribe por qué no hace falta revisarlo: el Jefe lo tendrá en cuenta.');
  const [p] = await db.select().from(seoJefeProposals).where(and(eq(seoJefeProposals.id, id), eq(seoJefeProposals.tenantId, tenantId), eq(seoJefeProposals.projectId, projectId), eq(seoJefeProposals.kind, 'revision'))).limit(1);
  if (!p || p.status !== 'pendiente') throw new PlanError('Esa propuesta ya no está pendiente: recarga la página.');
  // Revisor: primero se reclama la propuesta (dos admins a la vez no generan dos versiones ni pagan dos veces).
  const claimed = await db
    .update(seoJefeProposals)
    .set({ status: accept ? 'aprobada' : 'rechazada', decidedBy: by.slice(0, 120), decisionReason: why.slice(0, 2000) || null, decidedAt: new Date() })
    .where(and(eq(seoJefeProposals.id, id), eq(seoJefeProposals.status, 'pendiente')))
    .returning({ id: seoJefeProposals.id });
  if (!claimed.length) throw new PlanError('Esa propuesta ya no está pendiente: recarga la página.');
  let version: number | null = null;
  if (accept) {
    try {
      const [base] = await db.select({ horizon: seoMasterPlans.horizonMonths }).from(seoMasterPlans).where(eq(seoMasterPlans.id, p.basePlanId ?? '00000000-0000-0000-0000-000000000000')).limit(1);
      version = (await requestMasterPlan(tenantId, projectId, by, base?.horizon ?? 12)).version;
      await db.update(seoJefeProposals).set({ edits: { version } }).where(eq(seoJefeProposals.id, id));
    } catch (e) {
      // Si los topes no dejan generarla, la propuesta vuelve a pendiente y se ve el motivo.
      await db.update(seoJefeProposals).set({ status: 'pendiente', decidedBy: null, decisionReason: null, decidedAt: null }).where(eq(seoJefeProposals.id, id));
      throw e;
    }
  }
  return { version };
}
