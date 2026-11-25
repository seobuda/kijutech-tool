import 'server-only';

// SEO · Plan de mejora (Hito 1, 23 nov 2026). Sin IA: las propuestas salen de los hallazgos abiertos (rules.ts).
//   - regeneratePlan: pone al día las propuestas pendientes del proyecto (una por técnica; lo ya aprobado o descartado
//     no se vuelve a proponer salvo que aparezcan hallazgos nuevos). Se llama al terminar cada auditoría y a mano.
//   - approvePlanItem: crea el encargo con el contrato del núcleo (workSource().createTask, con el proyecto), enlaza los
//     hallazgos al encargo y registra la intervención (técnica + hipótesis) en el núcleo.
//   - Cuando el encargo se termina, el núcleo marca la intervención como hecha y la propuesta pasa a «hecha».
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { findings, projects, seoPlanItems, type SeoPlanItem } from '@/lib/db/schema';
import { workSource } from '@/lib/core/capabilities';
import { registerJobKind } from '@/lib/core/jobs';
import { linkFindingToRequest } from '@/lib/core/findings';
import { gscPropertiesForProject } from '@/lib/core/gsc';
import { cancelIntervention, interventionsBySource, recordIntervention } from '@/lib/core/interventions';
import { SALUD_SOURCE } from '@/lib/seo/salud/audit';
import { SEO_KINDS } from '@/lib/seo/salud/kinds';
import { LOCAL_SOURCE } from '@/lib/seo/local/rules';
import { buildPlan, type PlanFinding, type PlanSeverity } from '@/lib/seo/plan/rules';

export const PLAN_SOURCE = 'seo.plan';
const LABELS = Object.fromEntries(SEO_KINDS.map((k) => [k.kind, k.title]));

export class PlanError extends Error {
  constructor(public userMessage: string) {
    super(userMessage);
  }
}

async function impressionsByUrl(tenantId: string, projectId: string): Promise<Map<string, number>> {
  const props = await gscPropertiesForProject(tenantId, projectId);
  if (!props.length) return new Map();
  const rows = (await db.execute(sql`
    SELECT p.url, sum(d.impressions)::int AS impressions
    FROM gsc_daily d JOIN gsc_pages p ON p.id = d.page_id
    WHERE d.property_id IN (${sql.join(props.map((p) => sql`${p.id}`), sql`, `)}) AND d.search_type = 1 AND d.date >= current_date - 90
    GROUP BY p.url`)) as unknown as { url: string; impressions: number }[];
  return new Map(rows.map((r) => [r.url, Number(r.impressions)]));
}

/** Las propuestas aprobadas cuyo encargo ya se terminó pasan a «hecha» (lo sabe el registro de intervenciones). */
async function markDone(tenantId: string, projectId: string): Promise<void> {
  const approved = await db
    .select({ id: seoPlanItems.id })
    .from(seoPlanItems)
    .where(and(eq(seoPlanItems.projectId, projectId), eq(seoPlanItems.tenantId, tenantId), eq(seoPlanItems.status, 'aprobada')));
  if (!approved.length) return;
  const done = (await interventionsBySource(tenantId, PLAN_SOURCE, approved.map((a) => a.id))).filter((i) => i.status === 'hecha').map((i) => i.sourceRef);
  if (done.length) await db.update(seoPlanItems).set({ status: 'hecha', updatedAt: new Date() }).where(inArray(seoPlanItems.id, done));
}

/** Pone al día las propuestas del proyecto con los hallazgos abiertos. */
export async function regeneratePlan(tenantId: string, projectId: string): Promise<{ pending: number; created: number; expired: number }> {
  const [project] = await db.select({ monthlyHours: projects.monthlyHours }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  if (!project) throw new PlanError('Proyecto no encontrado');
  await markDone(tenantId, projectId);
  const [open, items, impressions] = await Promise.all([
    db
      .select({ id: findings.id, kind: findings.kind, severity: findings.severity, url: findings.url, query: findings.query, evidence: findings.evidence })
      .from(findings)
      .where(and(eq(findings.projectId, projectId), eq(findings.tenantId, tenantId), inArray(findings.source, [SALUD_SOURCE, LOCAL_SOURCE, 'seo.mapa:gsc']), eq(findings.status, 'abierto'))),
    db.select().from(seoPlanItems).where(and(eq(seoPlanItems.projectId, projectId), eq(seoPlanItems.tenantId, tenantId))),
    impressionsByUrl(tenantId, projectId)
  ]);
  // Lo que ya está en una propuesta decidida (aprobada, hecha o descartada) no se vuelve a proponer.
  const covered = new Set(items.filter((i) => i.status !== 'pendiente' && i.status !== 'caducada').flatMap((i) => i.findingIds));
  // Las búsquedas y temas del mapa traen sus impresiones y su valor de negocio en la evidencia.
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const free: PlanFinding[] = open
    .filter((f) => !covered.has(f.id))
    .map((f) => {
      const e = (f.evidence ?? {}) as Record<string, unknown>;
      return { id: f.id, kind: f.kind, url: f.url, query: f.query, severity: f.severity as PlanSeverity, impressions: num(e.impresiones), valor: num(e.valor) };
    });
  const drafts = buildPlan(free, impressions, project.monthlyHours != null ? Number(project.monthlyHours) : null, LABELS);

  let created = 0;
  const keep = new Set<string>();
  for (const d of drafts) {
    const same = items.filter((i) => i.technique === d.technique);
    const pending = same.find((i) => i.status === 'pendiente');
    const values = {
      title: d.title,
      description: d.description,
      findingIds: d.findingIds,
      urls: d.urls,
      priority: d.priority,
      score: d.score,
      estHours: d.estHours.toFixed(1),
      hypothesis: d.hypothesis,
      evidence: d.evidence,
      updatedAt: new Date()
    };
    if (pending) {
      await db.update(seoPlanItems).set(values).where(eq(seoPlanItems.id, pending.id));
      keep.add(pending.id);
    } else {
      // Clave nueva por técnica (técnica#n): una propuesta decidida nunca se reutiliza.
      const n = same.reduce((m, i) => Math.max(m, Number(i.planKey.split('#')[1] ?? 0)), 0) + 1;
      const [row] = await db
        .insert(seoPlanItems)
        .values({ tenantId, projectId, planKey: `${d.technique}#${n}`, technique: d.technique, origin: 'reglas', ...values })
        .returning({ id: seoPlanItems.id });
      keep.add(row.id);
      created++;
    }
  }
  // Pendientes que ya no tienen hallazgos detrás (se arreglaron o se descartaron): caducan.
  const stale = items.filter((i) => i.status === 'pendiente' && !keep.has(i.id)).map((i) => i.id);
  if (stale.length) await db.update(seoPlanItems).set({ status: 'caducada', updatedAt: new Date() }).where(inArray(seoPlanItems.id, stale));
  return { pending: keep.size, created, expired: stale.length };
}

export async function listPlanItems(tenantId: string, projectId: string): Promise<SeoPlanItem[]> {
  return db
    .select()
    .from(seoPlanItems)
    .where(and(eq(seoPlanItems.projectId, projectId), eq(seoPlanItems.tenantId, tenantId)))
    .orderBy(asc(seoPlanItems.priority), sql`${seoPlanItems.score} DESC`);
}

/** Aprueba una propuesta: encargo (con el proyecto), hallazgos enlazados e intervención registrada. */
export async function approvePlanItem(tenantId: string, projectId: string, itemId: string, by: string, note?: string): Promise<{ ok: boolean; message: string; url: string | null }> {
  const [project] = await db.select({ clientId: projects.clientId }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  if (!project?.clientId) throw new PlanError('El proyecto no tiene cliente: no se puede crear el encargo.');
  const ws = workSource();
  if (!ws?.createTask) throw new PlanError('Operaciones no está disponible para crear encargos: inténtalo más tarde.');
  // Se reclama la propuesta (de pendiente a aprobada) para que dos personas no creen dos encargos.
  const [item] = await db
    .update(seoPlanItems)
    .set({ status: 'aprobada', decidedBy: by.slice(0, 120), decidedAt: new Date(), requestError: null, updatedAt: new Date() })
    .where(and(eq(seoPlanItems.id, itemId), eq(seoPlanItems.projectId, projectId), eq(seoPlanItems.tenantId, tenantId), eq(seoPlanItems.status, 'pendiente')))
    .returning();
  if (!item) throw new PlanError('Otra persona la acaba de decidir o ya no está pendiente.');
  const description = [item.description, note?.trim() ? `\n**Nota de ${by}:** ${note.trim().slice(0, 1000)}` : '', `\n_Plan de mejora SEO del proyecto (${Number(item.estHours)} h estimadas)._`].filter(Boolean).join('\n');
  const r = await ws.createTask(tenantId, { clientId: project.clientId, title: item.title, description, workType: null, requestedBy: by, projectId });
  if (!r.ok && !r.ref) {
    // No se creó nada: vuelve a pendiente para reintentarlo.
    await db.update(seoPlanItems).set({ status: 'pendiente', decidedBy: null, decidedAt: null, requestError: r.message.slice(0, 500), updatedAt: new Date() }).where(eq(seoPlanItems.id, item.id));
    return { ok: false, message: `No se creó el encargo: ${r.message} La propuesta sigue pendiente.`, url: null };
  }
  await db.update(seoPlanItems).set({ requestRef: r.ref, requestUrl: r.url, requestError: r.ok ? null : r.message.slice(0, 500), updatedAt: new Date() }).where(eq(seoPlanItems.id, item.id));
  if (r.ref) {
    for (const fid of item.findingIds) await linkFindingToRequest(tenantId, fid, r.ref).catch(() => undefined);
  }
  try {
    await recordIntervention({
      tenantId,
      clientId: project.clientId,
      projectId,
      domain: 'seo',
      technique: item.technique,
      urls: item.urls,
      hypothesis: item.hypothesis,
      source: PLAN_SOURCE,
      sourceRef: item.id,
      requestRef: r.ref,
      createdBy: by
    });
  } catch (e) {
    console.error('[seo] registrar intervención:', e instanceof Error ? e.message : e);
  }
  return { ok: r.ok, message: r.ok ? r.message : `Aprobada, pero: ${r.message}`, url: r.url };
}

export async function discardPlanItem(tenantId: string, projectId: string, itemId: string, by: string, note: string | null): Promise<boolean> {
  const r = await db
    .update(seoPlanItems)
    .set({ status: 'descartada', decidedBy: by.slice(0, 120), decidedAt: new Date(), rejectNote: note?.trim().slice(0, 1000) || null, updatedAt: new Date() })
    .where(and(eq(seoPlanItems.id, itemId), eq(seoPlanItems.projectId, projectId), eq(seoPlanItems.tenantId, tenantId), eq(seoPlanItems.status, 'pendiente')))
    .returning({ id: seoPlanItems.id });
  return r.length > 0;
}

/** Vuelve a proponer una descartada (sus hallazgos vuelven a contar en el siguiente plan). */
export async function reopenPlanItem(tenantId: string, projectId: string, itemId: string): Promise<boolean> {
  const r = await db
    .update(seoPlanItems)
    .set({ status: 'caducada', updatedAt: new Date() })
    .where(and(eq(seoPlanItems.id, itemId), eq(seoPlanItems.projectId, projectId), eq(seoPlanItems.tenantId, tenantId), eq(seoPlanItems.status, 'descartada')))
    .returning({ id: seoPlanItems.id });
  if (r.length) {
    await cancelIntervention(tenantId, PLAN_SOURCE, itemId);
    await regeneratePlan(tenantId, projectId);
  }
  return r.length > 0;
}

let registered = false;
/** Trabajo de la cola: rehacer el plan (lo encola la auditoría al terminar). */
export function registerPlanJobs(): void {
  if (registered) return;
  registered = true;
  registerJobKind({ kind: 'seo.plan.regenerate', timeoutS: 120, maxConcurrent: 2, maxAttempts: 2, run: async (ctx, payload) => regeneratePlan(ctx.tenantId, String(payload.projectId ?? '')) });
}
