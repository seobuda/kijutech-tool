import 'server-only';

// SEO · Plan de mejora (Hito 1, 23 nov 2026). Sin IA: las propuestas salen de los hallazgos abiertos (rules.ts).
//   - regeneratePlan: pone al día las propuestas pendientes del proyecto (una por técnica; lo ya aprobado o descartado
//     no se vuelve a proponer salvo que aparezcan hallazgos nuevos). Se llama al terminar cada auditoría y a mano.
//   - approvePlanItem: crea el encargo con el contrato del núcleo (workSource().createTask, con el proyecto), enlaza los
//     hallazgos al encargo y registra la intervención (técnica + hipótesis) en el núcleo.
//   - Cuando el encargo se termina, el núcleo marca la intervención como hecha y la propuesta pasa a «hecha».
//   Desde el 26 nov 2026 (Plan A+B): al aprobar se puede elegir lista, responsable, fecha, título, horas y quitar páginas
//   (sin IA si se elige la lista); descartar lleva motivo y actúa (el cliente no lo quiere → a su memoria; ya está hecho
//   → se vuelve a auditar); el plan se reparte por meses (planSchedule) y a principios de mes se avisa por Telegram.
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clients, findings, projects, seoPlanItems, type SeoPlanItem } from '@/lib/db/schema';
import { registerScheduled, telegramOutbound, workSource, type RequestStatus, type TaskOptions } from '@/lib/core/capabilities';
import { addMemory } from '@/lib/core/clients';
import { registerJobKind } from '@/lib/core/jobs';
import { linkFindingToRequest } from '@/lib/core/findings';
import { gscPropertiesForProject } from '@/lib/core/gsc';
import { cancelIntervention, completeHypothesis, interventionsBySource, recordIntervention } from '@/lib/core/interventions';
import { SALUD_SOURCE, startProjectAudit } from '@/lib/seo/salud/audit';
import { enqueueKeywordMap } from '@/lib/seo/mapa/mapa';
import { SEO_KINDS } from '@/lib/seo/salud/kinds';
import { LOCAL_SOURCE } from '@/lib/seo/local/rules';
import { VIGILANCIA_SOURCES } from '@/lib/seo/vigilancia/rules';
import { buildPlan, scheduleMonths, type PlanFinding, type PlanSeverity } from '@/lib/seo/plan/rules';

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
      .where(and(eq(findings.projectId, projectId), eq(findings.tenantId, tenantId), inArray(findings.source, [SALUD_SOURCE, LOCAL_SOURCE, 'seo.mapa:gsc', 'seo.salud:externos', 'seo.posiciones:serp', 'seo.local:ficha', 'seo.local:geogrid', 'seo.local:nap_antiguo', 'seo.salud:puertas', 'seo.vigilancia:hackeo', ...VIGILANCIA_SOURCES]), eq(findings.status, 'abierto'))),
    db.select().from(seoPlanItems).where(and(eq(seoPlanItems.projectId, projectId), eq(seoPlanItems.tenantId, tenantId))),
    impressionsByUrl(tenantId, projectId)
  ]);
  // Lo que ya está en una propuesta decidida (aprobada, hecha o descartada) no se vuelve a proponer.
  const covered = new Set(items.filter((i) => i.status !== 'pendiente' && i.status !== 'caducada').flatMap((i) => i.findingIds));
  // Las búsquedas y temas del mapa traen sus impresiones y su valor de negocio en la evidencia.
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  // Las URLs de un grupo de páginas puerta no se proponen además como duplicadas (misma técnica, tarea doble).
  const doorwayUrls = new Set(open.filter((f) => f.kind === 'seo.doorway_pages').flatMap((f) => ((f.evidence as { urls?: string[] } | null)?.urls ?? [])));
  const free: PlanFinding[] = open
    .filter((f) => !covered.has(f.id))
    .filter((f) => !((f.kind === 'seo.near_duplicate' || f.kind === 'seo.duplicate_content') && f.url && doorwayUrls.has(f.url)))
    .map((f) => {
      const e = (f.evidence ?? {}) as Record<string, unknown>;
      return { id: f.id, kind: f.kind, url: f.url, query: f.query, severity: f.severity as PlanSeverity, impressions: num(e.impresiones), valor: num(e.valor), gain: num(e.clicsMes) };
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

export type ApproveOptions = {
  note?: string;
  title?: string;
  estHours?: number;
  /** Páginas que se quedan en el encargo (las quitadas vuelven a proponerse en la siguiente tanda). */
  urls?: string[];
  listId?: string | null;
  assigneeId?: string | null;
  dueDate?: string | null;
};

const PRIORITY_TO_TASK: Record<number, number> = { 1: 2, 2: 3, 3: 4 };

/** Aprueba una propuesta: encargo (con el proyecto), hallazgos enlazados e intervención registrada. */
export async function approvePlanItem(tenantId: string, projectId: string, itemId: string, by: string, opts: ApproveOptions | string = {}): Promise<{ ok: boolean; message: string; url: string | null }> {
  const o: ApproveOptions = typeof opts === 'string' ? { note: opts } : opts;
  const [project] = await db.select({ clientId: projects.clientId, name: projects.name }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
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
  // Lo que cambió la persona: título, horas y páginas (las quitadas, y sus hallazgos, quedan para la siguiente tanda).
  const title = o.title?.trim() ? o.title.trim().slice(0, 300) : item.title;
  const estHours = o.estHours && o.estHours > 0 && o.estHours <= 200 ? Math.round(o.estHours * 10) / 10 : Number(item.estHours);
  const keepUrls = o.urls ? item.urls.filter((u) => o.urls!.includes(u)) : item.urls;
  const dropped = item.urls.filter((u) => !keepUrls.includes(u));
  let findingIds = item.findingIds;
  let description = item.description;
  if (dropped.length) {
    const fs = await db.select({ id: findings.id, url: findings.url }).from(findings).where(inArray(findings.id, item.findingIds));
    const droppedSet = new Set(dropped);
    findingIds = fs.filter((f) => !f.url || !droppedSet.has(f.url)).map((f) => f.id);
    description = description
      .split('\n')
      .filter((l) => !dropped.some((u) => l.startsWith(`- ${u}`)))
      .join('\n');
  }
  if (title !== item.title || estHours !== Number(item.estHours) || dropped.length) {
    await db.update(seoPlanItems).set({ title, estHours: estHours.toFixed(1), urls: keepUrls, findingIds, description, updatedAt: new Date() }).where(eq(seoPlanItems.id, item.id));
  }
  const hyp = completeHypothesis(item.technique, item.hypothesis ?? undefined);
  const full = [description, hyp.verify ? `\n**Cómo verificaremos:** ${hyp.verify.how}` : '', o.note?.trim() ? `\n**Nota de ${by}:** ${o.note.trim().slice(0, 1000)}` : '', `\n_Plan de mejora SEO del proyecto ${project.name} (${estHours} h estimadas)._`].filter(Boolean).join('\n');
  const r = await ws.createTask(tenantId, {
    clientId: project.clientId,
    title,
    description: full,
    workType: null,
    requestedBy: by,
    projectId,
    listId: o.listId || null,
    assigneeId: o.assigneeId || null,
    dueDate: o.dueDate || null,
    priority: PRIORITY_TO_TASK[item.priority] ?? 3,
    origin: `Plan de mejora SEO (${project.name})`
  });
  if (!r.ok && !r.ref) {
    // No se creó nada: vuelve a pendiente para reintentarlo.
    await db.update(seoPlanItems).set({ status: 'pendiente', decidedBy: null, decidedAt: null, requestError: r.message.slice(0, 500), updatedAt: new Date() }).where(eq(seoPlanItems.id, item.id));
    return { ok: false, message: `No se creó el encargo: ${r.message} La propuesta sigue pendiente.`, url: null };
  }
  await db.update(seoPlanItems).set({ requestRef: r.ref, requestUrl: r.url, requestError: r.ok ? null : r.message.slice(0, 500), updatedAt: new Date() }).where(eq(seoPlanItems.id, item.id));
  if (r.ref) {
    for (const fid of findingIds) await linkFindingToRequest(tenantId, fid, r.ref).catch(() => undefined);
  }
  try {
    await recordIntervention({
      tenantId,
      clientId: project.clientId,
      projectId,
      domain: 'seo',
      technique: item.technique,
      urls: keepUrls,
      hypothesis: item.hypothesis,
      source: PLAN_SOURCE,
      sourceRef: item.id,
      requestRef: r.ref,
      createdBy: by
    });
  } catch (e) {
    console.error('[seo] registrar intervención:', e instanceof Error ? e.message : e);
  }
  // Si se quitaron páginas, el plan las vuelve a proponer en la siguiente tanda.
  if (dropped.length) await regeneratePlan(tenantId, projectId).catch(() => undefined);
  return { ok: r.ok, message: r.ok ? r.message : `Aprobada, pero: ${r.message}`, url: r.url };
}

/** Aprueba de una vez lo que cabe este mes, con las opciones por defecto (responsable del servicio, lista habitual). */
export async function approveThisMonth(tenantId: string, projectId: string, by: string): Promise<{ approved: number; failed: string[] }> {
  const sched = await planSchedule(tenantId, projectId);
  const ids = sched.items.filter((i) => i.month === 0).map((i) => i.id);
  const failed: string[] = [];
  let approved = 0;
  for (const id of ids) {
    const d = sched.defaults;
    try {
      const r = await approvePlanItem(tenantId, projectId, id, by, { listId: d?.listId ?? null, assigneeId: d?.assigneeId ?? null, dueDate: sched.dueDate });
      if (r.ok) approved++;
      else failed.push(r.message);
    } catch (e) {
      failed.push(e instanceof PlanError ? e.userMessage : 'error');
    }
  }
  return { approved, failed };
}

export const DISCARD_REASONS = {
  no_aplica: 'No aplica a esta web',
  ya_hecho: 'Ya está hecho',
  no_prioritario: 'No es prioritario',
  cliente_no: 'El cliente no lo quiere'
} as const;
export type DiscardReason = keyof typeof DISCARD_REASONS;

/**
 * Descarta una propuesta con su motivo, y el motivo actúa: «ya está hecho» vuelve a pasar la auditoría (lo arreglado
 * se cierra solo); «el cliente no lo quiere» lo guarda en su memoria (el mapa deja de proponerlo y los agentes lo saben).
 */
export async function discardPlanItem(tenantId: string, projectId: string, itemId: string, by: string, note: string | null, reason: DiscardReason | null = null): Promise<boolean> {
  const label = reason ? DISCARD_REASONS[reason] : null;
  const text = [label, note?.trim()].filter(Boolean).join(': ').slice(0, 1000) || null;
  const r = await db
    .update(seoPlanItems)
    .set({ status: 'descartada', decidedBy: by.slice(0, 120), decidedAt: new Date(), rejectNote: text, updatedAt: new Date() })
    .where(and(eq(seoPlanItems.id, itemId), eq(seoPlanItems.projectId, projectId), eq(seoPlanItems.tenantId, tenantId), eq(seoPlanItems.status, 'pendiente')))
    .returning();
  if (!r.length) return false;
  const item = r[0];
  try {
    if (reason === 'ya_hecho') {
      await startProjectAudit(tenantId, projectId);
    } else if (reason === 'cliente_no') {
      const [p] = await db.select({ clientId: projects.clientId }).from(projects).where(eq(projects.id, projectId)).limit(1);
      if (p?.clientId) {
        const qs = await db.select({ query: findings.query }).from(findings).where(inArray(findings.id, item.findingIds));
        const about = [...new Set(qs.map((q) => q.query).filter((q): q is string => Boolean(q)))].slice(0, 8);
        const what = about.length ? about.join(', ') : item.title;
        await addMemory(tenantId, p.clientId, { kind: 'restriccion', text: `No quiere: ${what}${note?.trim() ? ` (${note.trim().slice(0, 300)})` : ''}`.slice(0, 1000), status: 'aceptado', sourceType: 'manual', sourceId: item.id, by: null });
        await enqueueKeywordMap(tenantId, projectId);
      }
    }
  } catch (e) {
    console.error('[seo] motivo del descarte:', e instanceof Error ? e.message : e);
  }
  return true;
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

// --- Reparto por meses, estado de lo aprobado y aviso mensual (26 nov 2026) -------------------------------------------

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** Nombre del mes a «offset» meses de hoy (zona de Madrid). */
export function monthName(offset: number, now = new Date()): string {
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit' }).format(now).split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return MONTHS[d.getUTCMonth()];
}
function monthStartMadrid(now = new Date()): Date {
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit' }).format(now).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

export type PlanSchedule = {
  monthlyHours: number | null;
  usedThisMonth: number;
  items: { id: string; month: number }[];
  /** Opciones para crear el encargo (listas, personas y lo que se pondría por defecto). */
  options: TaskOptions | null;
  defaults: TaskOptions['defaults'] | null;
  /** Fecha por defecto: hoy + plazo del cliente (o 7 días), nunca después de fin de mes si cabe este mes. */
  dueDate: string;
  status: Record<string, RequestStatus>;
};

/** El plan repartido por meses con las horas del proyecto, las opciones del encargo y el estado de lo aprobado. */
export async function planSchedule(tenantId: string, projectId: string): Promise<PlanSchedule> {
  const [project] = await db.select({ monthlyHours: projects.monthlyHours, clientId: projects.clientId }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  if (!project) throw new PlanError('Proyecto no encontrado');
  const items = await listPlanItems(tenantId, projectId);
  const start = monthStartMadrid();
  const usedThisMonth = items.filter((i) => (i.status === 'aprobada' || i.status === 'hecha') && i.decidedAt && i.decidedAt >= start).reduce((a, i) => a + Number(i.estHours), 0);
  const pending = items.filter((i) => i.status === 'pendiente');
  const sched = scheduleMonths(
    pending.map((i) => ({ id: i.id, estHours: Number(i.estHours), priority: i.priority, severity: (i.evidence as { severity?: string }).severity ?? null })),
    project.monthlyHours != null ? Number(project.monthlyHours) : null,
    usedThisMonth
  );
  const ws = workSource();
  const options = project.clientId && ws?.taskOptions ? await ws.taskOptions(tenantId, project.clientId, 'seo').catch(() => null) : null;
  const days = options?.defaults.dueDays ?? 7;
  const due = new Date(Date.now() + Math.max(1, days) * 86_400_000);
  const refs = items.filter((i) => i.requestRef && (i.status === 'aprobada' || i.status === 'hecha')).map((i) => i.requestRef!);
  const st = refs.length && ws?.requestStatus ? await ws.requestStatus(tenantId, refs).catch(() => []) : [];
  return {
    monthlyHours: project.monthlyHours != null ? Number(project.monthlyHours) : null,
    usedThisMonth: Math.round(usedThisMonth * 10) / 10,
    items: pending.map((i) => ({ id: i.id, month: sched.get(i.id) ?? 0 })),
    options,
    defaults: options?.defaults ?? null,
    dueDate: due.toISOString().slice(0, 10),
    status: Object.fromEntries(st.map((x) => [x.ref, x]))
  };
}

const esc = (s2: string) => s2.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const G = globalThis as unknown as { __kijuPlanNotice?: Map<string, number> };

/**
 * A principios de mes (la primera vez que corre en los 7 primeros días, entre las 8 y las 20 de Madrid), un solo aviso por Telegram
 * con lo que cabe este mes en cada proyecto que tiene propuestas pendientes. Una vez por mes y cuenta (clave única).
 */
export async function monthlyPlanNotice(tenantId: string, now = new Date()): Promise<boolean> {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }).format(now));
  const day = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', day: '2-digit' }).format(now));
  // Solo la primera semana del mes y en horario de trabajo.
  if (day > 7 || hour < 8 || hour >= 20) return false;
  const rows = await db
    .select({ projectId: seoPlanItems.projectId, project: projects.name, client: clients.name })
    .from(seoPlanItems)
    .innerJoin(projects, eq(projects.id, seoPlanItems.projectId))
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(seoPlanItems.tenantId, tenantId), eq(seoPlanItems.status, 'pendiente')))
    .groupBy(seoPlanItems.projectId, projects.name, clients.name);
  if (!rows.length) return false;
  const lines: string[] = [];
  for (const r of rows.slice(0, 15)) {
    const sch = await planSchedule(tenantId, r.projectId).catch(() => null);
    if (!sch) continue;
    const items = await listPlanItems(tenantId, r.projectId);
    const now0 = new Set(sch.items.filter((i) => i.month === 0).map((i) => i.id));
    const these = items.filter((i) => now0.has(i.id));
    if (!these.length) continue;
    const h = these.reduce((a, i) => a + Number(i.estHours), 0);
    lines.push(`• <b>${esc(r.client ?? r.project)}</b>: ${these.length} propuesta(s), ${h.toLocaleString('es-ES', { maximumFractionDigits: 1 })} h${sch.monthlyHours ? ` de ${sch.monthlyHours} h` : ''}`);
  }
  if (!lines.length) return false;
  const base = (process.env.BASE_URL || '').replace(/\/+$/, '');
  const ym = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit' }).format(now);
  await telegramOutbound()?.notifyOwner(
    tenantId,
    `seo.plan.mes:${ym}`,
    `📅 <b>Plan de mejora SEO de ${monthName(0, now)}</b>: lo que cabe este mes, listo para aprobar.\n${lines.join('\n')}${base ? `\n\nEn cada proyecto → Plan de mejora → «Aprobar lo de este mes» (${base}/dashboard/para-ti).` : ''}`
  );
  return true;
}

let registered = false;
/** Trabajo de la cola: rehacer el plan (lo encola la auditoría al terminar). */
export function registerPlanJobs(): void {
  if (registered) return;
  registered = true;
  registerJobKind({ kind: 'seo.plan.regenerate', timeoutS: 120, maxConcurrent: 2, maxAttempts: 2, run: async (ctx, payload) => regeneratePlan(ctx.tenantId, String(payload.projectId ?? '')) });
  // Aviso de principios de mes: se mira como mucho una vez cada hora por proceso (la clave del aviso evita repetirlo).
  registerScheduled('plan de mejora: aviso mensual', async (tenantId) => {
    const key = Math.floor(Date.now() / 3_600_000);
    const seen = (G.__kijuPlanNotice ??= new Map());
    if (seen.get(tenantId) === key) return;
    seen.set(tenantId, key);
    await monthlyPlanNotice(tenantId);
  });
}
