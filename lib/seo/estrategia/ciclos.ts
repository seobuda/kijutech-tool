import 'server-only';

// SEO · Estrategias por ciclos (docs/PLAN-SEO-CICLOS.md, fases A+C; aprobado por Enric el 27 nov 2026, con la auditoría
// Opus §11). Un ciclo es un periodo (trimestral por defecto) con 1-3 líneas del catálogo (playbooks.ts) repartidas en
// huecos semanales. Reglas clave:
// - Lo crea y lo aprueba un administrador. En los dos primeros ciclos de estrategia de un proyecto, un administrador
//   aprueba el lote de cada mes (approval_mode «lote_admin»); después, automático. Solo se encarga lo aprobado.
// - Se encarga lo de las próximas 2 semanas (nunca el trimestre entero a ClickUp), como mucho 10 por pasada.
// - Un solo camino por tipo: el contenido va por el brief (requestBrief → briefToTask, intervención «seo.brief»); lo demás
//   por una propuesta del plan con origen «ia» (approvePlanItem, intervención «seo.plan»).
// - Los temas se eligen al encargar (no al crear el calendario), sin repetir lo que ya tiene una propuesta reactiva abierta.
// - Un hueco sin aprobar 3 semanas después de su semana se salta con su motivo; cancelar el ciclo salta lo pendiente.
import { and, asc, desc, eq, gte, inArray, lt, lte, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientCompetitors, findings, projects, seoBriefs, seoCycleLines, seoCycleSlots, seoCycles, seoLinkSnapshots, seoLocalPlaces, seoPlanItems, seoTopics } from '@/lib/db/schema';
import { gscPropertiesForProject } from '@/lib/core/gsc';
import { projectWebUrl } from '@/lib/seo/salud/audit';
import { confirmedFacts } from '@/lib/seo/posiciones/posiciones';
import { approvePlanItem } from '@/lib/seo/plan/plan';
import { techniqueRecipe } from '@/lib/seo/plan/rules';
import { briefToTask, requestBrief } from '@/lib/seo/contenido/briefs';
import { eligibility, expandSlots, mondayOf, PLAYBOOKS, validateStrategy, weeksOf, type EligibilityContext, type LineInput, type PlaybookKey } from '@/lib/seo/estrategia/playbooks';

export class CycleError extends Error {
  constructor(public userMessage: string) {
    super(userMessage);
  }
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const CONTENT: PlaybookKey[] = ['contenido_cadencia', 'paginas_servicio_zona', 'recuperacion_contenido'];
const MAX_PER_RUN = 10;

async function openKinds(projectId: string, kinds: string[]): Promise<{ id: string; kind: string; url: string | null; query: string | null; evidence: Record<string, unknown> }[]> {
  return db
    .select({ id: findings.id, kind: findings.kind, url: findings.url, query: findings.query, evidence: findings.evidence })
    .from(findings)
    .where(and(eq(findings.projectId, projectId), eq(findings.status, 'abierto'), inArray(findings.kind, kinds))) as Promise<{ id: string; kind: string; url: string | null; query: string | null; evidence: Record<string, unknown> }[]>;
}

/** Lo que el código sabe del proyecto para el catálogo (sin IA). */
export async function eligibilityContext(tenantId: string, projectId: string): Promise<EligibilityContext & { services: string[]; monthlyHours: number | null }> {
  const [p] = await db.select({ clientId: projects.clientId, monthlyHours: projects.monthlyHours }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  if (!p) throw new CycleError('Proyecto no encontrado.');
  const [web, props, facts, comps, places, topics, f, link] = await Promise.all([
    projectWebUrl(tenantId, projectId),
    gscPropertiesForProject(tenantId, projectId).catch(() => []),
    confirmedFacts(projectId),
    p.clientId ? db.select({ n: sql<number>`count(*)::int` }).from(clientCompetitors).where(and(eq(clientCompetitors.clientId, p.clientId), eq(clientCompetitors.status, 'confirmado'))) : Promise.resolve([{ n: 0 }]),
    p.clientId ? db.select({ n: sql<number>`count(*)::int` }).from(seoLocalPlaces).where(and(eq(seoLocalPlaces.clientId, p.clientId), eq(seoLocalPlaces.role, 'cliente'), eq(seoLocalPlaces.status, 'confirmada'))) : Promise.resolve([{ n: 0 }]),
    db.select({ n: sql<number>`count(*)::int` }).from(seoTopics).where(and(eq(seoTopics.projectId, projectId), eq(seoTopics.status, 'activo'), sql`coalesce((${seoTopics.metrics}->>'impresiones')::float, 0) > 0`)),
    openKinds(projectId, ['seo.striking_distance', 'seo.content_decay', 'seo.zone_page_missing', 'seo.schema_org_missing', 'seo.schema_fields_missing']),
    db.select({ gap: seoLinkSnapshots.gap }).from(seoLinkSnapshots).where(and(eq(seoLinkSnapshots.projectId, projectId), eq(seoLinkSnapshots.isClient, true))).orderBy(desc(seoLinkSnapshots.month)).limit(1)
  ]);
  const count = (k: string) => f.filter((x) => x.kind === k).length;
  return {
    hasWeb: Boolean(web),
    hasSearchConsole: props.length > 0,
    servicesConfirmed: facts.services.length,
    zoneConfirmed: Boolean(facts.zona),
    hasGoogleProfile: Number(places[0]?.n ?? 0) > 0,
    competitorsConfirmed: Number(comps[0]?.n ?? 0),
    topicsWithDemand: Number(topics[0]?.n ?? 0),
    strikingDistance: count('seo.striking_distance'),
    decliningPages: count('seo.content_decay'),
    linkGapDomains: link[0]?.gap?.length ?? 0,
    schemaMissing: count('seo.schema_org_missing') + count('seo.schema_fields_missing') > 0,
    zonesWithoutPage: count('seo.zone_page_missing'),
    services: facts.services,
    monthlyHours: p.monthlyHours != null ? Number(p.monthlyHours) : null
  };
}

/** Crea y activa un ciclo de estrategia a mano desde el catálogo (fase C, sin IA). Solo para administradores (lo comprueba la acción). */
export async function createCycle(
  tenantId: string,
  projectId: string,
  input: { name: string; months: number; startsOn: string; reservePct?: number; thesis?: string | null; lines: LineInput[] },
  by: string
): Promise<string> {
  const ctx = await eligibilityContext(tenantId, projectId);
  const monthlyHours = ctx.monthlyHours;
  if (monthlyHours == null) throw new CycleError('Pon antes las horas al mes del proyecto (Editar proyecto): sin ellas no se puede repartir la estrategia.');
  const months = [1, 3, 6, 12].includes(input.months) ? input.months : 3;
  const reservePct = Math.min(80, Math.max(0, Math.round(input.reservePct ?? 30)));
  const { eligible } = eligibility(ctx);
  const v = validateStrategy(input.lines, { eligible, months, monthlyHours: ctx.monthlyHours, reservePct, services: ctx.services });
  if (!v.ok) throw new CycleError(v.errors.join(' '));
  const start = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(input.startsOn) ? new Date(`${input.startsOn}T00:00:00Z`) : new Date());
  const end = addDays(start, weeksOf(months) * 7 - 1);
  return db.transaction(async (tx) => {
    const [active] = await tx.select({ id: seoCycles.id }).from(seoCycles).where(and(eq(seoCycles.projectId, projectId), eq(seoCycles.status, 'activo'))).limit(1);
    if (active) throw new CycleError('Ya hay una estrategia activa en este proyecto: ciérrala o cancélala antes.');
    const [{ seq, previous }] = (await tx.execute(sql`SELECT coalesce(max(seq), 0)::int + 1 AS seq, count(*) FILTER (WHERE kind = 'estrategia' AND status IN ('activo', 'cerrado', 'leido'))::int AS previous FROM seo_cycles WHERE project_id = ${projectId}`)) as unknown as { seq: number; previous: number }[];
    const [cycle] = await tx
      .insert(seoCycles)
      .values({
        tenantId,
        projectId,
        seq: Number(seq),
        kind: 'estrategia',
        name: input.name.trim().slice(0, 160) || `Estrategia ${seq}`,
        periodMonths: months,
        startsOn: ymd(start),
        endsOn: ymd(end),
        status: 'activo',
        monthlyHours: monthlyHours.toFixed(1),
        reservePct,
        // Decisión de Enric: en los dos primeros ciclos de estrategia, un administrador aprueba el lote de cada mes.
        approvalMode: Number(previous) < 2 ? 'lote_admin' : 'automatico',
        thesis: input.thesis?.trim().slice(0, 2000) || null,
        readDueOn: ymd(addDays(end, 90)),
        createdBy: by.slice(0, 120),
        approvedBy: by.slice(0, 120),
        approvedAt: new Date()
      })
      .returning({ id: seoCycles.id });
    for (const [i, l] of v.lines.entries()) {
      const pb = PLAYBOOKS[l.playbook];
      const [line] = await tx
        .insert(seoCycleLines)
        .values({ tenantId, cycleId: cycle.id, projectId, playbook: l.playbook, playbookVersion: pb.version, params: l.params, technique: pb.technique, hoursBudget: l.hours.toFixed(1), sort: i })
        .returning({ id: seoCycleLines.id });
      const slots = expandSlots(l.playbook, l.params, start, months);
      if (slots.length)
        await tx
          .insert(seoCycleSlots)
          .values(slots.map((s) => ({ tenantId, cycleId: cycle.id, lineId: line.id, projectId, dueWeek: s.week, n: s.n, title: `${pb.label} · ${pb.unitLabel} ${s.n}`, role: pb.role, estHours: pb.hoursPerUnit.toFixed(1) })))
          .onConflictDoNothing();
    }
    return cycle.id;
  });
}

/** Aprobar el lote de un mes (YYYY-MM) del ciclo activo. Solo administradores (lo comprueba la acción). */
export async function approveMonth(tenantId: string, projectId: string, month: string, by: string): Promise<number> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new CycleError('Mes no válido.');
  const from = `${month}-01`;
  const to = ymd(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)));
  const rows = await db
    .update(seoCycleSlots)
    .set({ status: 'aprobado', approvedBy: by.slice(0, 120), approvedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(seoCycleSlots.projectId, projectId), eq(seoCycleSlots.tenantId, tenantId), eq(seoCycleSlots.status, 'previsto'), gte(seoCycleSlots.dueWeek, from), lte(seoCycleSlots.dueWeek, to), sql`${seoCycleSlots.cycleId} IN (SELECT id FROM seo_cycles WHERE project_id = ${projectId} AND status = 'activo')`))
    .returning({ id: seoCycleSlots.id });
  return rows.length;
}

/** Cancelar el ciclo activo: lo pendiente se salta y las propuestas sin encargar caducan. Lo ya encargado sigue su curso. */
export async function cancelCycle(tenantId: string, projectId: string, cycleId: string, reason: string): Promise<void> {
  await db.transaction(async (tx) => {
    const r = await tx.update(seoCycles).set({ status: 'cancelado', closedAt: new Date(), updatedAt: new Date() }).where(and(eq(seoCycles.id, cycleId), eq(seoCycles.projectId, projectId), eq(seoCycles.tenantId, tenantId), eq(seoCycles.status, 'activo'))).returning({ id: seoCycles.id });
    if (!r.length) throw new CycleError('La estrategia no está activa.');
    await tx.update(seoCycleSlots).set({ status: 'saltado', skipReason: `Estrategia cancelada: ${reason}`.slice(0, 300), updatedAt: new Date() }).where(and(eq(seoCycleSlots.cycleId, cycleId), inArray(seoCycleSlots.status, ['previsto', 'aprobado'])));
    await tx.update(seoPlanItems).set({ status: 'caducada', updatedAt: new Date() }).where(and(eq(seoPlanItems.cycleId, cycleId), eq(seoPlanItems.status, 'pendiente')));
  });
}

/** Tema para un hueco de contenido: el de más valor sin brief del ciclo ni propuesta reactiva abierta. */
async function pickContent(tenantId: string, projectId: string, playbook: PlaybookKey): Promise<{ keyword: string; topicKey: string | null; targetUrl: string | null; findingIds: string[] } | null> {
  const taken = new Set(
    (await db.select({ k: seoBriefs.keyword }).from(seoBriefs).where(and(eq(seoBriefs.projectId, projectId), ne(seoBriefs.status, 'archivado')))).map((r) => r.k.toLowerCase())
  );
  const reactive = new Set((await db.select({ f: seoPlanItems.findingIds }).from(seoPlanItems).where(and(eq(seoPlanItems.projectId, projectId), inArray(seoPlanItems.status, ['pendiente', 'aprobada'])))).flatMap((r) => r.f));
  if (playbook === 'paginas_servicio_zona' || playbook === 'recuperacion_contenido') {
    const kind = playbook === 'paginas_servicio_zona' ? 'seo.zone_page_missing' : 'seo.content_decay';
    for (const f of await openKinds(projectId, [kind])) {
      if (reactive.has(f.id)) continue;
      const kw = String(f.query ?? f.evidence?.query ?? f.evidence?.busqueda ?? '').trim();
      if (kw.length < 3 || taken.has(kw.toLowerCase())) continue;
      return { keyword: kw, topicKey: null, targetUrl: playbook === 'recuperacion_contenido' ? f.url : null, findingIds: [f.id] };
    }
    return null;
  }
  const topics = await db
    .select({ topicKey: seoTopics.topicKey, name: seoTopics.name, url: seoTopics.url, metrics: seoTopics.metrics })
    .from(seoTopics)
    .where(and(eq(seoTopics.projectId, projectId), eq(seoTopics.tenantId, tenantId), eq(seoTopics.status, 'activo')))
    .orderBy(desc(sql`coalesce((${seoTopics.metrics}->>'valor')::float, 1) * coalesce((${seoTopics.metrics}->>'impresiones')::float, 0)`))
    .limit(60);
  for (const t of topics) {
    if ((t.metrics as Record<string, unknown>).esMarca) continue;
    if (taken.has(t.name.toLowerCase())) continue;
    return { keyword: t.name, topicKey: t.topicKey, targetUrl: null, findingIds: [] };
  }
  return null;
}

const KIND_BY_PLAYBOOK: Partial<Record<PlaybookKey, string[]>> = {
  refuerzo_al_alcance: ['seo.striking_distance'],
  datos_estructurados: ['seo.schema_org_missing', 'seo.schema_fields_missing'],
  autoridad_enlaces: ['seo.link_gap']
};

/**
 * Pasada diaria (y al aprobar): salta lo que no se aprobó a tiempo, aprueba solo en modo automático, encarga lo aprobado
 * de las próximas 2 semanas y marca hecho lo terminado. Idempotente.
 */
export async function materialize(tenantId: string, projectId: string, by = 'estrategia'): Promise<{ encargados: number; saltados: number; hechos: number; errores: string[] }> {
  const [cycle] = await db.select().from(seoCycles).where(and(eq(seoCycles.projectId, projectId), eq(seoCycles.tenantId, tenantId), eq(seoCycles.status, 'activo'))).limit(1);
  const out = { encargados: 0, saltados: 0, hechos: 0, errores: [] as string[] };
  if (!cycle) return out;
  const today = new Date();
  const horizon = ymd(addDays(today, 14));
  // 1) Sin aprobar 3 semanas después de su semana → saltado.
  const skipped = await db
    .update(seoCycleSlots)
    .set({ status: 'saltado', skipReason: 'No se aprobó a tiempo', updatedAt: new Date() })
    .where(and(eq(seoCycleSlots.cycleId, cycle.id), eq(seoCycleSlots.status, 'previsto'), lt(seoCycleSlots.dueWeek, ymd(addDays(today, -21)))))
    .returning({ id: seoCycleSlots.id });
  out.saltados = skipped.length;
  // 2) Automático: se aprueba solo lo de las próximas 2 semanas.
  if (cycle.approvalMode === 'automatico')
    await db.update(seoCycleSlots).set({ status: 'aprobado', approvedBy: 'automático', approvedAt: new Date(), updatedAt: new Date() }).where(and(eq(seoCycleSlots.cycleId, cycle.id), eq(seoCycleSlots.status, 'previsto'), lte(seoCycleSlots.dueWeek, horizon)));
  // 3) Hecho: propuestas hechas o briefs publicados.
  const done = (await db.execute(sql`
    UPDATE seo_cycle_slots s SET status = 'hecho', updated_at = now()
    WHERE s.cycle_id = ${cycle.id} AND s.status = 'encargado' AND (
      EXISTS (SELECT 1 FROM seo_plan_items p WHERE p.id = s.plan_item_id AND p.status = 'hecha') OR
      EXISTS (SELECT 1 FROM seo_briefs b WHERE b.id = s.brief_id AND b.status = 'usado'))
    RETURNING s.id`)) as unknown as { id: string }[];
  out.hechos = done.length;
  // 4) Encargar lo aprobado hasta 2 semanas vista y los briefs que ya están listos. El cupo (MAX_PER_RUN) cuenta acciones
  // con efecto (briefs pedidos y encargos), no los huecos que solo esperan su brief.
  const lines = new Map((await db.select().from(seoCycleLines).where(eq(seoCycleLines.cycleId, cycle.id))).map((l) => [l.id, l]));
  const due = await db
    .select()
    .from(seoCycleSlots)
    .where(and(eq(seoCycleSlots.cycleId, cycle.id), eq(seoCycleSlots.status, 'aprobado'), lte(seoCycleSlots.dueWeek, horizon)))
    .orderBy(asc(seoCycleSlots.dueWeek), asc(seoCycleSlots.n))
    .limit(200);
  let actions = 0;
  for (const s of due) {
    if (actions >= MAX_PER_RUN) break;
    const line = lines.get(s.lineId);
    if (!line || line.status !== 'activa') continue;
    const pb = PLAYBOOKS[line.playbook as PlaybookKey];
    if (!pb) continue;
    const dueDate = ymd(addDays(new Date(`${s.dueWeek}T00:00:00Z`) < today ? today : new Date(`${s.dueWeek}T00:00:00Z`), 4));
    try {
      if (CONTENT.includes(pb.key)) {
        // Contenido: un solo camino, el del brief. Primero se prepara; cuando está listo, se encarga al redactor.
        if (!s.briefId) {
          // Reserva atómica (revisor): dos pasadas a la vez no piden dos briefs (dos SERP de pago) para el mismo hueco.
          const claimed = await db
            .update(seoCycleSlots)
            .set({ interventionSource: 'reservando', updatedAt: new Date() })
            .where(and(eq(seoCycleSlots.id, s.id), sql`${seoCycleSlots.briefId} IS NULL`, sql`(${seoCycleSlots.interventionSource} IS NULL OR ${seoCycleSlots.updatedAt} < now() - interval '30 minutes')`))
            .returning({ id: seoCycleSlots.id });
          if (!claimed.length) continue;
          actions++;
          const pick = await pickContent(tenantId, projectId, pb.key);
          if (!pick) {
            await db.update(seoCycleSlots).set({ status: 'saltado', skipReason: 'No quedan temas con demanda sin trabajar', updatedAt: new Date() }).where(eq(seoCycleSlots.id, s.id));
            out.saltados++;
            continue;
          }
          const briefId = await requestBrief(tenantId, projectId, { keyword: pick.keyword, topicKey: pick.topicKey, targetUrl: pick.targetUrl }, by);
          await db.update(seoBriefs).set({ cycleLineId: line.id }).where(eq(seoBriefs.id, briefId));
          await db.update(seoCycleSlots).set({ briefId, interventionSource: null, keyword: pick.keyword.slice(0, 200), topicKey: pick.topicKey, targetUrl: pick.targetUrl, findingIds: pick.findingIds, title: `${pb.label}: ${pick.keyword}`.slice(0, 300), updatedAt: new Date() }).where(eq(seoCycleSlots.id, s.id));
          continue;
        }
        const [b] = await db.select({ status: seoBriefs.status, data: seoBriefs.data, updatedAt: seoBriefs.updatedAt }).from(seoBriefs).where(eq(seoBriefs.id, s.briefId)).limit(1);
        // Brief fallido o atascado más de 24 h: el hueco se salta con su motivo (no se queda esperando para siempre).
        if (!b || b.status === 'fallido' || b.status === 'archivado' || (b.status === 'preparando' && Date.now() - b.updatedAt.getTime() > 86_400_000)) {
          await db.update(seoCycleSlots).set({ status: 'saltado', skipReason: 'No se pudo preparar el brief', updatedAt: new Date() }).where(eq(seoCycleSlots.id, s.id));
          out.saltados++;
          continue;
        }
        if (!['borrador', 'listo'].includes(b.status)) continue; // aún preparándose
        const already = (b.data as { request?: { ref?: string | null } }).request?.ref;
        if (!already) {
          actions++;
          const r = await briefToTask(tenantId, projectId, s.briefId, by);
          if (!r.ok) throw new Error(r.message);
          const [after] = await db.select({ data: seoBriefs.data }).from(seoBriefs).where(eq(seoBriefs.id, s.briefId)).limit(1);
          if (!(after?.data as { request?: { ref?: string | null } } | undefined)?.request?.ref) continue; // otro proceso lo está encargando
        }
        await db.update(seoCycleSlots).set({ status: 'encargado', interventionSource: 'seo.brief', interventionRef: s.briefId, updatedAt: new Date() }).where(eq(seoCycleSlots.id, s.id));
        out.encargados++;
        continue;
      }
      // Lo demás: una propuesta del plan con origen «ia» y su encargo.
      const kinds = KIND_BY_PLAYBOOK[pb.key] ?? [];
      const reactive = new Set((await db.select({ f: seoPlanItems.findingIds }).from(seoPlanItems).where(and(eq(seoPlanItems.projectId, projectId), inArray(seoPlanItems.status, ['pendiente', 'aprobada'])))).flatMap((r) => r.f));
      const used = new Set((await db.select({ f: seoCycleSlots.findingIds }).from(seoCycleSlots).where(and(eq(seoCycleSlots.cycleId, cycle.id), ne(seoCycleSlots.id, s.id)))).flatMap((r) => r.f));
      const f = kinds.length ? (await openKinds(projectId, kinds)).find((x) => !reactive.has(x.id) && !used.has(x.id)) : undefined;
      const title = `${pb.label}${f?.url ? `: ${f.url.replace(/^https?:\/\/[^/]+/, '') || '/'}` : f?.query ? `: ${f.query}` : ` · ${pb.unitLabel} ${s.n}`}`.slice(0, 300);
      const [item] = await db
        .insert(seoPlanItems)
        .values({
          tenantId,
          projectId,
          planKey: `ciclo:${s.id}`,
          title,
          description: `${pb.description}\n\n${techniqueRecipe(pb.technique) ?? ''}`.trim().slice(0, 8000),
          technique: pb.technique,
          findingIds: f ? [f.id] : [],
          urls: f?.url ? [f.url] : [],
          priority: 2,
          estHours: Number(s.estHours).toFixed(1),
          origin: 'ia',
          cycleId: cycle.id,
          cycleLineId: line.id,
          evidence: { ciclo: cycle.name, linea: pb.label }
        })
        .onConflictDoNothing()
        .returning({ id: seoPlanItems.id });
      const itemId = item?.id ?? (await db.select({ id: seoPlanItems.id }).from(seoPlanItems).where(and(eq(seoPlanItems.projectId, projectId), eq(seoPlanItems.planKey, `ciclo:${s.id}`))).limit(1))[0]?.id;
      if (!itemId) continue;
      await db.update(seoCycleSlots).set({ planItemId: itemId, findingIds: f ? [f.id] : [], title, updatedAt: new Date() }).where(eq(seoCycleSlots.id, s.id));
      const [cur] = await db.select({ status: seoPlanItems.status, ref: seoPlanItems.requestRef }).from(seoPlanItems).where(eq(seoPlanItems.id, itemId)).limit(1);
      if (!(cur?.status === 'aprobada' && cur.ref)) {
        actions++;
        const r = await approvePlanItem(tenantId, projectId, itemId, by, { dueDate, note: `Estrategia «${cycle.name}» · ${pb.label}` });
        if (!r.ok) throw new Error(r.message);
      }
      await db.update(seoCycleSlots).set({ status: 'encargado', interventionSource: 'seo.plan', interventionRef: itemId, updatedAt: new Date() }).where(eq(seoCycleSlots.id, s.id));
      out.encargados++;
    } catch (e) {
      out.errores.push(`${s.title}: ${e instanceof Error ? e.message.slice(0, 160) : 'error'}`);
    }
  }
  // 5) Cierre automático: pasado el final y sin nada por aprobar ni aprobado sin encargar, el ciclo queda «cerrado»
  // (la lectura de resultados llega en read_due_on).
  if (ymd(today) > cycle.endsOn) {
    const [left] = await db.select({ n: sql<number>`count(*)::int` }).from(seoCycleSlots).where(and(eq(seoCycleSlots.cycleId, cycle.id), inArray(seoCycleSlots.status, ['previsto', 'aprobado'])));
    if (Number(left?.n ?? 0) === 0) await db.update(seoCycles).set({ status: 'cerrado', closedAt: new Date(), updatedAt: new Date() }).where(and(eq(seoCycles.id, cycle.id), eq(seoCycles.status, 'activo')));
  }
  return out;
}

export type CycleView = {
  eligibility: Awaited<ReturnType<typeof eligibilityContext>>;
  blocked: { key: PlaybookKey; why: string }[];
  eligible: PlaybookKey[];
  active: (typeof seoCycles.$inferSelect & {
    lines: (typeof seoCycleLines.$inferSelect & { label: string; planned: number; done: number; encargados: number; overdue: number; saltados: number; hoursUsed: number })[];
    months: { month: string; slots: (typeof seoCycleSlots.$inferSelect & { line: string })[]; pendingApproval: number }[];
    cohort: { published: number; clicks: number; impressions: number };
  }) | null;
  history: { id: string; name: string; status: string; startsOn: string; endsOn: string; kind: string }[];
};

/** Vista de la sección «Estrategia» (solo tablas propias). */
export async function getCycleView(tenantId: string, projectId: string): Promise<CycleView> {
  const ctx = await eligibilityContext(tenantId, projectId);
  const el = eligibility(ctx);
  const cycles = await db.select().from(seoCycles).where(and(eq(seoCycles.projectId, projectId), eq(seoCycles.tenantId, tenantId))).orderBy(desc(seoCycles.seq));
  const active = cycles.find((c) => c.status === 'activo') ?? null;
  const history = cycles.filter((c) => c !== active).map((c) => ({ id: c.id, name: c.name, status: c.status, startsOn: c.startsOn, endsOn: c.endsOn, kind: c.kind }));
  if (!active) return { eligibility: ctx, blocked: el.blocked, eligible: el.eligible, active: null, history };
  const [lines, slots] = await Promise.all([
    db.select().from(seoCycleLines).where(eq(seoCycleLines.cycleId, active.id)).orderBy(asc(seoCycleLines.sort)),
    db.select().from(seoCycleSlots).where(eq(seoCycleSlots.cycleId, active.id)).orderBy(asc(seoCycleSlots.dueWeek), asc(seoCycleSlots.n))
  ]);
  const today = ymd(new Date());
  const weekAgo = ymd(addDays(new Date(), -7));
  const label = new Map(lines.map((l) => [l.id, PLAYBOOKS[l.playbook as PlaybookKey]?.label ?? l.playbook]));
  const linesOut = lines.map((l) => {
    const mine = slots.filter((s) => s.lineId === l.id);
    return {
      ...l,
      label: label.get(l.id)!,
      planned: mine.filter((s) => s.status !== 'saltado').length,
      done: mine.filter((s) => s.status === 'hecho').length,
      encargados: mine.filter((s) => s.status === 'encargado').length,
      saltados: mine.filter((s) => s.status === 'saltado').length,
      overdue: mine.filter((s) => ['aprobado', 'encargado'].includes(s.status) && s.dueWeek < weekAgo).length,
      hoursUsed: Math.round(mine.filter((s) => s.status === 'encargado' || s.status === 'hecho').reduce((a, s) => a + Number(s.estHours), 0) * 10) / 10
    };
  });
  const byMonth = new Map<string, (typeof seoCycleSlots.$inferSelect & { line: string })[]>();
  for (const s of slots) byMonth.set(s.dueWeek.slice(0, 7), [...(byMonth.get(s.dueWeek.slice(0, 7)) ?? []), { ...s, line: label.get(s.lineId) ?? '' }]);
  // Marcador mínimo de la cohorte de contenido: URL publicadas desde briefs del ciclo y sus clics e impresiones en Search
  // Console desde que se publicaron (sin las búsquedas anónimas, que gsc_daily no guarda por página).
  const published = await db
    .select({ url: seoBriefs.publishedUrl })
    .from(seoBriefs)
    .where(and(eq(seoBriefs.projectId, projectId), inArray(seoBriefs.cycleLineId, lines.map((l) => l.id).length ? lines.map((l) => l.id) : ['00000000-0000-0000-0000-000000000000']), eq(seoBriefs.status, 'usado')));
  let cohort = { published: published.length, clicks: 0, impressions: 0 };
  const urls = published.map((p) => p.url).filter((u): u is string => Boolean(u));
  const props = urls.length ? await gscPropertiesForProject(tenantId, projectId).catch(() => []) : [];
  if (urls.length && props.length) {
    const [r] = (await db.execute(sql`
      SELECT coalesce(sum(d.clicks), 0)::int AS clicks, coalesce(sum(d.impressions), 0)::int AS impressions
      FROM gsc_daily d JOIN gsc_pages pg ON pg.id = d.page_id
      WHERE d.property_id IN (${sql.join(props.map((p) => sql`${p.id}`), sql`, `)}) AND d.search_type = 1 AND d.date >= ${active.startsOn}
        AND pg.url IN (${sql.join(urls.map((u) => sql`${u}`), sql`, `)})`)) as unknown as { clicks: number; impressions: number }[];
    cohort = { published: published.length, clicks: Number(r?.clicks ?? 0), impressions: Number(r?.impressions ?? 0) };
  }
  return {
    eligibility: ctx,
    blocked: el.blocked,
    eligible: el.eligible,
    active: {
      ...active,
      lines: linesOut,
      months: [...byMonth.entries()].map(([month, ss]) => ({ month, slots: ss, pendingApproval: ss.filter((s) => s.status === 'previsto').length })),
      cohort
    },
    history
  };
}

/** Pasada diaria de todos los proyectos con ciclo activo de la cuenta. */
export async function materializeAll(tenantId: string): Promise<void> {
  const rows = await db.select({ projectId: seoCycles.projectId }).from(seoCycles).where(and(eq(seoCycles.tenantId, tenantId), eq(seoCycles.status, 'activo')));
  for (const r of rows) {
    const res = await materialize(tenantId, r.projectId).catch((e) => ({ errores: [e instanceof Error ? e.message : 'error'] }));
    if (res.errores?.length) console.error('[seo] estrategia: materializar', r.projectId, res.errores.slice(0, 3).join(' | '));
  }
}

