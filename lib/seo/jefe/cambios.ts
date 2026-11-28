import 'server-only';

// SEO · Jefe SEO, D3: cambios al plan propuestos desde la conversación con el Jefe (docs/PLAN-SEO-JEFE.md). El Jefe NUNCA
// toca el plan: deja una propuesta pendiente (seo_jefe_proposals, tipo «cambio») con lo que cambiaría, por qué y los datos
// del expediente que lo respaldan. Un administrador la acepta o la rechaza con motivo en la pantalla Plan de servicio.
// Aceptar tampoco toca el plan aprobado: los cambios aceptados entran en el prompt de la versión siguiente, que se revisa y
// se aprueba como siempre (una sola puerta de aprobación).
import { and, desc, eq, gte, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { seoJefeProposals, seoMasterPlanItems, seoMasterPlans, type SeoJefeProposal } from '@/lib/db/schema';
import { buildStrategicDossier } from '@/lib/seo/jefe/expediente';
import { validateEvidence } from '@/lib/seo/jefe/evidence';
import { KIND_LABEL, type FrenteKind } from '@/lib/seo/jefe/plan-rules';
import { PlanError } from '@/lib/seo/jefe/errors';

export const CHANGE_TYPES = ['anadir', 'quitar', 'mover', 'ajustar'] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];
export const CHANGE_LABEL: Record<ChangeType, string> = { anadir: 'Añadir frente', quitar: 'Quitar frente', mover: 'Mover de trimestre', ajustar: 'Ajustar frente' };
/** Como mucho tantas propuestas pendientes por proyecto (que el chat no llene la pantalla de sugerencias). */
export const MAX_PENDING_CHANGES = 8;

export type ChangePayload = {
  tipo: ChangeType;
  frente: string | null;
  titulo: string;
  detalle: string;
  motivo: string;
  evidencias: string[];
  descartadas: string[];
  /** En ese turno el Jefe había leído una web: lo que propone puede venir de un texto de fuera. */
  leyoWebs: boolean;
};

const clip = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Plan aprobado o, si no hay, la última versión en sombra: base de la conversación y de las propuestas. */
async function basePlan(tenantId: string, projectId: string) {
  const [p] = await db
    .select()
    .from(seoMasterPlans)
    .where(and(eq(seoMasterPlans.tenantId, tenantId), eq(seoMasterPlans.projectId, projectId), inArray(seoMasterPlans.status, ['aprobado', 'sombra', 'propuesto'])))
    .orderBy(sql`(${seoMasterPlans.status} = 'aprobado') DESC`, desc(seoMasterPlans.version))
    .limit(1);
  return p ?? null;
}

/** Crea una propuesta de cambio pendiente. Valida las evidencias contra el expediente (las inventadas se apartan). */
export async function proposePlanChange(
  tenantId: string,
  projectId: string,
  input: Record<string, unknown>,
  opts: { threadPeer: string | null; leyoWebs: boolean }
): Promise<{ id: string; version: number | null; rejected: string[] }> {
  const tipo = String(input.tipo ?? '') as ChangeType;
  if (!CHANGE_TYPES.includes(tipo)) throw new PlanError(`Tipo de cambio no válido: usa ${CHANGE_TYPES.join(', ')}.`);
  const titulo = clip(input.titulo, 160);
  const detalle = clip(input.detalle, 1500);
  const motivo = clip(input.motivo, 1500);
  if (titulo.length < 5 || motivo.length < 10) throw new PlanError('Falta el título del cambio o el motivo.');
  const frente = clip(input.frente, 120) || null;
  const plan = await basePlan(tenantId, projectId);
  if (frente && plan) {
    const [it] = await db.select({ id: seoMasterPlanItems.id }).from(seoMasterPlanItems).where(and(eq(seoMasterPlanItems.planId, plan.id), eq(seoMasterPlanItems.frenteKey, frente))).limit(1);
    if (!it && tipo !== 'anadir') throw new PlanError(`El plan v${plan.version} no tiene el frente «${frente}». Mira las claves con seo_plan_maestro.`);
  }
  const dossier = await buildStrategicDossier(tenantId, projectId);
  const ev = validateEvidence(input.evidencias, dossier.evidence);
  // Auditoría D3: sin al menos un dato real del expediente no hay propuesta (que un texto de una web no se cuele, vía la
  // propuesta, como criterio en el prompt del plan siguiente).
  if (!ev.ok.length) throw new PlanError(`Cita al menos un dato del expediente que lo respalde (p. ej. [Q:…], [H:…], [L:…])${ev.rejected.length ? `; estos no existen: ${ev.rejected.slice(0, 5).join(', ')}` : ''}.`);
  return db.transaction(async (tx) => {
    // Una propuesta a la vez por proyecto: el tope y el duplicado se comprueban bajo candado.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`seo_jefe_cambio:${projectId}`}))`);
    const pending = await tx
      .select({ id: seoJefeProposals.id, payload: seoJefeProposals.payload })
      .from(seoJefeProposals)
      .where(and(eq(seoJefeProposals.projectId, projectId), eq(seoJefeProposals.kind, 'cambio'), eq(seoJefeProposals.status, 'pendiente')));
    if (pending.length >= MAX_PENDING_CHANGES) throw new PlanError(`Ya hay ${pending.length} cambios pendientes de decidir en este proyecto: que los revisen antes de proponer más.`);
    const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const dup = pending.find((p) => norm(String((p.payload as ChangePayload).titulo ?? '')) === norm(titulo));
    if (dup) throw new PlanError('Ese cambio ya está propuesto y pendiente.');
    const payload: ChangePayload = { tipo, frente, titulo, detalle, motivo, evidencias: ev.ok.map((e) => e.id), descartadas: ev.rejected, leyoWebs: opts.leyoWebs };
    const [row] = await tx
      .insert(seoJefeProposals)
      .values({ tenantId, projectId, kind: 'cambio', basePlanId: plan?.id ?? null, baseVersion: plan?.version ?? null, payload, status: 'pendiente', threadPeer: opts.threadPeer?.slice(0, 200) ?? null })
      .returning({ id: seoJefeProposals.id });
    return { id: row.id, version: plan?.version ?? null, rejected: ev.rejected };
  });
}

export type ChangeView = Pick<SeoJefeProposal, 'id' | 'status' | 'baseVersion' | 'decidedBy' | 'decisionReason' | 'createdAt' | 'decidedAt'> & { payload: ChangePayload };

/** Propuestas de cambio del proyecto: las pendientes y las decididas en los últimos 90 días. */
export async function listPlanChanges(tenantId: string, projectId: string): Promise<ChangeView[]> {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const rows = await db
    .select({ id: seoJefeProposals.id, status: seoJefeProposals.status, baseVersion: seoJefeProposals.baseVersion, decidedBy: seoJefeProposals.decidedBy, decisionReason: seoJefeProposals.decisionReason, createdAt: seoJefeProposals.createdAt, decidedAt: seoJefeProposals.decidedAt, payload: seoJefeProposals.payload })
    .from(seoJefeProposals)
    .where(and(eq(seoJefeProposals.tenantId, tenantId), eq(seoJefeProposals.projectId, projectId), eq(seoJefeProposals.kind, 'cambio'), or(eq(seoJefeProposals.status, 'pendiente'), gte(seoJefeProposals.createdAt, since))))
    .orderBy(sql`(${seoJefeProposals.status} = 'pendiente') DESC`, desc(seoJefeProposals.createdAt))
    .limit(30);
  return rows.map((r) => ({ ...r, payload: r.payload as ChangePayload }));
}

/** Al aprobarse una versión del plan, los cambios y ciclos pendientes propuestos sobre versiones anteriores caducan. */
export async function expireStaleChanges(tx: Pick<typeof db, 'update'>, projectId: string, approvedVersion: number): Promise<void> {
  await tx
    .update(seoJefeProposals)
    .set({ status: 'caducada', decisionReason: `Se aprobó la versión ${approvedVersion} del plan antes de decidirlo.`, decidedAt: new Date() })
    .where(and(eq(seoJefeProposals.projectId, projectId), inArray(seoJefeProposals.kind, ['cambio', 'ciclo', 'revision']), eq(seoJefeProposals.status, 'pendiente'), sql`coalesce(${seoJefeProposals.baseVersion}, 0) < ${approvedVersion}`));
  // Estrategias aprobadas que esperaban a crearse sobre un plan anterior: tampoco valen ya.
  await tx
    .update(seoJefeProposals)
    .set({ status: 'caducada', decisionReason: `Se aprobó la versión ${approvedVersion} del plan antes de crearla.`, payload: sql`${seoJefeProposals.payload} || '{"pendingCreate": false}'::jsonb` })
    .where(and(eq(seoJefeProposals.projectId, projectId), eq(seoJefeProposals.kind, 'ciclo'), eq(seoJefeProposals.status, 'aprobada'), sql`${seoJefeProposals.payload}->>'pendingCreate' = 'true'`, sql`coalesce(${seoJefeProposals.baseVersion}, 0) < ${approvedVersion}`));
}

/** Aceptar o rechazar un cambio. Rechazar exige motivo (el Jefe lo lee en la siguiente versión). */
export async function decidePlanChange(tenantId: string, projectId: string, id: string, status: 'aprobada' | 'rechazada', by: string, reason: string | null): Promise<void> {
  const why = reason?.trim() ?? '';
  if (status === 'rechazada' && why.length < 5) throw new PlanError('Escribe por qué se rechaza: el Jefe lo tendrá en cuenta.');
  const r = await db
    .update(seoJefeProposals)
    .set({ status, decidedBy: by.slice(0, 120), decisionReason: why.slice(0, 2000) || null, decidedAt: new Date() })
    .where(and(eq(seoJefeProposals.id, id), eq(seoJefeProposals.tenantId, tenantId), eq(seoJefeProposals.projectId, projectId), eq(seoJefeProposals.kind, 'cambio'), eq(seoJefeProposals.status, 'pendiente')))
    .returning({ id: seoJefeProposals.id });
  if (!r.length) throw new PlanError('Ese cambio ya no está pendiente: recarga la página.');
}

/**
 * Cambios aceptados que la versión siguiente del plan debe incorporar: los propuestos sobre la versión aprobada vigente (o
 * sin plan aprobado, todos los aceptados en los últimos 180 días). Al aprobarse una versión nueva, dejan de salir solos.
 */
export async function acceptedChangesForNextPlan(tenantId: string, projectId: string, approvedVersion: number | null): Promise<ChangePayload[]> {
  const rows = await db
    .select({ payload: seoJefeProposals.payload })
    .from(seoJefeProposals)
    .where(
      and(
        eq(seoJefeProposals.tenantId, tenantId),
        eq(seoJefeProposals.projectId, projectId),
        eq(seoJefeProposals.kind, 'cambio'),
        eq(seoJefeProposals.status, 'aprobada'),
        approvedVersion != null ? gte(seoJefeProposals.baseVersion, approvedVersion) : gte(seoJefeProposals.createdAt, new Date(Date.now() - 180 * 86_400_000))
      )
    )
    .orderBy(desc(seoJefeProposals.decidedAt))
    .limit(10);
  return rows.map((r) => r.payload as ChangePayload);
}

/** Resumen del plan para el chat del Jefe: versión, tesis, frentes con su clave, avisos del código y cambios pendientes. */
export async function planSummaryForAgent(tenantId: string, projectId: string, name: string): Promise<string> {
  const plan = await basePlan(tenantId, projectId);
  if (!plan) return `«${name}» aún no tiene plan de servicio. Se genera en Trabajo → Plan de servicio (lo pide un administrador).`;
  const [items, changes] = await Promise.all([
    db.select().from(seoMasterPlanItems).where(eq(seoMasterPlanItems.planId, plan.id)).orderBy(seoMasterPlanItems.fromQuarter, seoMasterPlanItems.priority, seoMasterPlanItems.sort),
    listPlanChanges(tenantId, projectId)
  ]);
  const scorer = (plan.scorer ?? {}) as { score?: number; divergences?: string[]; warnings?: string[]; profile?: string };
  // Títulos, tesis y motivos los escribió la IA a partir de datos de webs: se leen como dato, no como instrucciones.
  const out = [
    `Plan de servicio de «${name}»: versión ${plan.version} (${plan.status === 'aprobado' ? 'APROBADA, vigente' : `${plan.status}, aún sin aprobar`}), ${plan.horizonMonths} meses desde ${String(plan.startsOn).slice(0, 10)}, confianza ${plan.confidence ?? '—'}.`,
    `Tesis: ${clip(plan.thesis, 1200)}`,
    'Frentes (clave · tipo · línea · trimestres · prioridad · título · por qué · evidencias):',
    ...items.map((i) => `- ${i.frenteKey} · ${KIND_LABEL[i.kind as FrenteKind] ?? i.kind} · ${i.playbook ?? 'sin línea'} · T${i.fromQuarter}-T${i.toQuarter} · P${i.priority} · ${clip(i.title, 140)} · ${clip(i.rationale, 300)} · ${i.evidence.map((e) => e.id).slice(0, 6).join(', ')}`)
  ];
  if (scorer.divergences?.length || scorer.warnings?.length) out.push(`Avisos del código${scorer.score != null ? ` (orden ${scorer.score}/100)` : ''}: ${[...(scorer.divergences ?? []), ...(scorer.warnings ?? [])].map((w) => clip(w, 200)).join(' | ')}`);
  if (plan.reviewNote) out.push(`Nota de la revisión: ${clip(plan.reviewNote, 600)}`);
  const pend = changes.filter((c) => c.status === 'pendiente');
  const decided = changes.filter((c) => c.status !== 'pendiente').slice(0, 6);
  if (pend.length) out.push(`Cambios propuestos pendientes de decidir (${pend.length}/${MAX_PENDING_CHANGES}): ${pend.map((c) => `${CHANGE_LABEL[c.payload.tipo] ?? c.payload.tipo}: ${clip(c.payload.titulo, 120)}`).join('; ')}`);
  if (decided.length) out.push(`Cambios ya decididos: ${decided.map((c) => `${clip(c.payload.titulo, 100)} → ${c.status}${c.decisionReason ? ` (${clip(c.decisionReason, 200)})` : ''}`).join('; ')}`);
  return out.join('\n').slice(0, 14_000);
}
