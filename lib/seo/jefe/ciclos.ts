import 'server-only';

// SEO · Jefe SEO, D4: ciclos (estrategias trimestrales) propuestos desde el plan de servicio aprobado (docs/PLAN-SEO-JEFE.md).
// La propuesta (seo_jefe_proposals, tipo «ciclo») la calcula el código a partir de los frentes del trimestre (ciclo-rules.ts,
// 0 $). Un administrador la aprueba y entonces se crea la estrategia con createCycle de siempre (sin tocar materialize),
// enlazada al plan y a cada frente. Si aún hay una estrategia activa, queda aprobada y se crea en cuanto esa se cierre.
// Una pasada diaria propone el ciclo siguiente 21 días antes del final del activo (o en cuanto hay plan y no hay ciclo).
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { projects, seoCycles, seoJefeProposals, seoMasterPlanItems, seoMasterPlans, type SeoJefeProposal } from '@/lib/db/schema';
import { createCycle, CycleError, eligibilityContext } from '@/lib/seo/estrategia/ciclos';
import { eligibility, DEFAULT_RESERVE_PCT, type PlaybookKey } from '@/lib/seo/estrategia/playbooks';
import { CYCLE_MONTHS, deriveCycle, nextCycleStart, quarterAt, shouldProposeNext, type DerivedCycle } from '@/lib/seo/jefe/ciclo-rules';
import { PlanError } from '@/lib/seo/jefe/errors';

export type CyclePayload = DerivedCycle & { startsOn: string; months: number; name: string; thesis: string; planVersion: number; pendingCreate?: boolean; cycleId?: string; auto?: boolean };
export type CycleProposalView = Pick<SeoJefeProposal, 'id' | 'status' | 'baseVersion' | 'decidedBy' | 'decisionReason' | 'createdAt'> & { payload: CyclePayload };

const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function approved(tenantId: string, projectId: string) {
  const [p] = await db.select().from(seoMasterPlans).where(and(eq(seoMasterPlans.tenantId, tenantId), eq(seoMasterPlans.projectId, projectId), eq(seoMasterPlans.status, 'aprobado'))).limit(1);
  return p ?? null;
}
async function activeCycle(projectId: string) {
  const [c] = await db.select({ id: seoCycles.id, endsOn: seoCycles.endsOn }).from(seoCycles).where(and(eq(seoCycles.projectId, projectId), eq(seoCycles.status, 'activo'))).limit(1);
  return c ?? null;
}
async function openCycleProposal(projectId: string) {
  const rows = await db
    .select()
    .from(seoJefeProposals)
    .where(and(eq(seoJefeProposals.projectId, projectId), eq(seoJefeProposals.kind, 'ciclo'), inArray(seoJefeProposals.status, ['pendiente', 'aprobada'])))
    .orderBy(desc(seoJefeProposals.createdAt))
    .limit(5);
  // Abierta = pendiente de decidir, o aprobada pero aún sin crear (esperando a que se cierre la estrategia activa).
  return rows.find((r) => r.status === 'pendiente' || (r.payload as CyclePayload).pendingCreate) ?? null;
}

/** Calcula y guarda la propuesta del siguiente ciclo. `auto`: la pasada diaria (no repite una fecha ya decidida). */
export async function proposeCycleFromPlan(tenantId: string, projectId: string, opts: { auto?: boolean; now?: Date } = {}): Promise<{ id: string; lines: number }> {
  const now = opts.now ?? new Date();
  const plan = await approved(tenantId, projectId);
  if (!plan) throw new PlanError('El proyecto no tiene plan de servicio aprobado: la estrategia trimestral sale de él.');
  const active = await activeCycle(projectId);
  if (!shouldProposeNext(now, active?.endsOn ?? null)) throw new PlanError('La estrategia activa aún no está cerca de terminar: el siguiente ciclo se propone 21 días antes de su final.');
  const start = nextCycleStart(now, active?.endsOn ?? null);
  const quarter = quarterAt(plan.startsOn, start);
  const quarters = Math.max(1, Math.round(plan.horizonMonths / 3));
  if (quarter > quarters) throw new PlanError(`El plan v${plan.version} termina antes del ${ymd(start)}: genera una versión nueva del plan.`);
  const [items, ectx] = await Promise.all([db.select().from(seoMasterPlanItems).where(eq(seoMasterPlanItems.planId, plan.id)), eligibilityContext(tenantId, projectId)]);
  const derived = deriveCycle(
    items.map((i) => ({ id: i.id, frenteKey: i.frenteKey, kind: i.kind, playbook: i.playbook, params: (i.params ?? {}) as Record<string, unknown>, title: i.title, fromQuarter: i.fromQuarter, toQuarter: i.toQuarter, priority: i.priority, sort: i.sort })),
    quarter,
    { eligible: eligibility(ectx).eligible as PlaybookKey[], monthlyHours: ectx.monthlyHours, reservePct: DEFAULT_RESERVE_PCT, services: ectx.services }
  );
  if (!derived.lines.length) throw new PlanError(`El trimestre ${quarter} del plan no tiene líneas que se puedan hacer ahora${derived.skipped.length ? `: ${derived.skipped.map((s) => `${s.title} (${s.reason})`).join('; ')}` : ''}.`);
  const payload: CyclePayload = {
    ...derived,
    startsOn: ymd(start),
    months: CYCLE_MONTHS,
    name: `T${quarter} del plan v${plan.version}`,
    thesis: `Trimestre ${quarter} del plan de servicio v${plan.version}: ${derived.lines.map((l) => l.title).join('; ')}.`.slice(0, 2000),
    planVersion: plan.version,
    auto: Boolean(opts.auto)
  };
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`seo_jefe_ciclo:${projectId}`}))`);
    const open = await tx
      .select({ id: seoJefeProposals.id, status: seoJefeProposals.status, payload: seoJefeProposals.payload })
      .from(seoJefeProposals)
      .where(and(eq(seoJefeProposals.projectId, projectId), eq(seoJefeProposals.kind, 'ciclo'), inArray(seoJefeProposals.status, ['pendiente', 'aprobada', 'rechazada'])))
      .orderBy(desc(seoJefeProposals.createdAt))
      .limit(10);
    if (open.some((o) => o.status === 'pendiente' || (o.status === 'aprobada' && (o.payload as CyclePayload).pendingCreate))) throw new PlanError('Ya hay una estrategia propuesta por el Jefe esperando: decide esa antes.');
    // La pasada diaria no vuelve a proponer una fecha que un admin ya rechazó o aprobó (a mano sí se puede).
    if (opts.auto && open.some((o) => (o.payload as CyclePayload).startsOn === payload.startsOn && (o.payload as CyclePayload).planVersion === plan.version)) throw new PlanError('Esa estrategia ya se decidió.');
    const [row] = await tx.insert(seoJefeProposals).values({ tenantId, projectId, kind: 'ciclo', basePlanId: plan.id, baseVersion: plan.version, payload, status: 'pendiente' }).returning({ id: seoJefeProposals.id });
    return { id: row.id, lines: derived.lines.length };
  });
}

/** Crea la estrategia de una propuesta aprobada. Devuelve el ciclo o null si aún hay una activa (se intenta en la pasada). */
async function createFromProposal(tenantId: string, projectId: string, p: SeoJefeProposal, by: string): Promise<string | null> {
  const pay = p.payload as CyclePayload;
  if (await activeCycle(projectId)) return null;
  // Si la fecha de inicio ya pasó (se aprobó tarde o esperaba a que cerrara la anterior), empieza esta semana.
  const startsOn = pay.startsOn < ymd(new Date()) ? ymd(nextCycleStart(new Date(), null)) : pay.startsOn;
  const cycleId = await createCycle(
    tenantId,
    projectId,
    { name: pay.name, months: pay.months, startsOn, thesis: pay.thesis, lines: pay.lines.map((l) => ({ playbook: l.playbook, params: l.params })), masterPlanId: p.basePlanId, masterItemIds: pay.lines.map((l) => l.masterItemId) },
    by
  );
  await db
    .update(seoJefeProposals)
    .set({ payload: { ...pay, pendingCreate: false, cycleId } })
    .where(eq(seoJefeProposals.id, p.id));
  return cycleId;
}

export async function decideCycleProposal(tenantId: string, projectId: string, id: string, accept: boolean, by: string, reason: string | null): Promise<{ cycleId: string | null }> {
  const why = reason?.trim() ?? '';
  if (!accept && why.length < 5) throw new PlanError('Escribe por qué no se hace: el Jefe lo tendrá en cuenta.');
  const [p] = await db.select().from(seoJefeProposals).where(and(eq(seoJefeProposals.id, id), eq(seoJefeProposals.tenantId, tenantId), eq(seoJefeProposals.projectId, projectId), eq(seoJefeProposals.kind, 'ciclo'))).limit(1);
  if (!p || p.status !== 'pendiente') throw new PlanError('Esa propuesta ya no está pendiente: recarga la página.');
  const plan = await approved(tenantId, projectId);
  if (accept && plan?.id !== p.basePlanId) throw new PlanError('El plan aprobado ha cambiado desde esta propuesta: pide una nueva.');
  const r = await db
    .update(seoJefeProposals)
    .set({ status: accept ? 'aprobada' : 'rechazada', decidedBy: by.slice(0, 120), decisionReason: why.slice(0, 2000) || null, decidedAt: new Date(), payload: accept ? { ...(p.payload as CyclePayload), pendingCreate: true } : p.payload })
    .where(and(eq(seoJefeProposals.id, id), eq(seoJefeProposals.status, 'pendiente')))
    .returning();
  if (!r.length) throw new PlanError('Esa propuesta ya no está pendiente: recarga la página.');
  if (!accept) return { cycleId: null };
  try {
    return { cycleId: await createFromProposal(tenantId, projectId, r[0], by) };
  } catch (e) {
    // No se pudo crear (p. ej. faltan las horas del proyecto): vuelve a pendiente con el motivo, nada a medias.
    await db.update(seoJefeProposals).set({ status: 'pendiente', decidedBy: null, decidedAt: null, payload: p.payload }).where(eq(seoJefeProposals.id, id));
    if (e instanceof CycleError) throw new PlanError(e.userMessage);
    throw e;
  }
}

export async function listCycleProposals(tenantId: string, projectId: string): Promise<CycleProposalView[]> {
  const rows = await db
    .select({ id: seoJefeProposals.id, status: seoJefeProposals.status, baseVersion: seoJefeProposals.baseVersion, decidedBy: seoJefeProposals.decidedBy, decisionReason: seoJefeProposals.decisionReason, createdAt: seoJefeProposals.createdAt, payload: seoJefeProposals.payload })
    .from(seoJefeProposals)
    .where(and(eq(seoJefeProposals.tenantId, tenantId), eq(seoJefeProposals.projectId, projectId), eq(seoJefeProposals.kind, 'ciclo')))
    .orderBy(desc(seoJefeProposals.createdAt))
    .limit(6);
  return rows.map((r) => ({ ...r, payload: r.payload as CyclePayload }));
}

/**
 * Pasada diaria (0 $): en cada proyecto con plan aprobado, crea la estrategia aprobada que esperaba a que cerrara la
 * anterior y propone la siguiente cuando toca. Nunca crea nada sin aprobar.
 */
export async function jefeCyclePass(tenantId: string, now = new Date()): Promise<{ propuestas: number; creadas: number }> {
  const plans = await db
    .select({ projectId: seoMasterPlans.projectId })
    .from(seoMasterPlans)
    .innerJoin(projects, eq(projects.id, seoMasterPlans.projectId))
    .where(and(eq(seoMasterPlans.tenantId, tenantId), eq(seoMasterPlans.status, 'aprobado'), eq(projects.service, 'seo')));
  let propuestas = 0;
  let creadas = 0;
  for (const { projectId } of plans) {
    try {
      const open = await openCycleProposal(projectId);
      if (open?.status === 'aprobada') {
        if (await createFromProposal(tenantId, projectId, open, open.decidedBy ?? 'Jefe SEO')) creadas++;
        continue;
      }
      if (open) continue;
      await proposeCycleFromPlan(tenantId, projectId, { auto: true, now });
      propuestas++;
    } catch (e) {
      if (!(e instanceof PlanError) && !(e instanceof CycleError)) console.error('[seo] jefe: ciclos desde el plan', projectId, e instanceof Error ? e.message : e);
    }
  }
  return { propuestas, creadas };
}
