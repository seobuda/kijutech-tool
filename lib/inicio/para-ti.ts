// Para ti (fase 2 de la reorganización UX, 21 nov 2026): la bandeja única. Junta en una lista todo lo que espera una
// decisión y que antes estaba repartido en 7 sitios (Mi bandeja, propuestas del agente, correos, dudas del equipo,
// base de conocimiento, estratega, memoria de las fichas y errores). No tiene tabla propia: lee el estado de cada
// módulo. Lo urgente va primero y, dentro, lo que más espera. Cada elemento lleva su departamento para filtrar.
// KINDS es la única definición de los tipos: la usan Para ti, el Inicio («Lo que espera de ti») y el contador de la barra.
import 'server-only';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { agtDepartments, agtTeamQuestions, clientMemory, clients, estSuggestions, findings, kbArticles, opsAgentActions, opsInboundEmails, projects, seoLocalPlaces, seoPlanItems, type AgtTeamQuestion } from '@/lib/db/schema';
import { listErrorGroups } from '@/lib/core/errors';
import { getInbox, type InboxItem } from '@/lib/operaciones/inbox';
import { getPendingEmailProposals, type PendingEmail } from '@/lib/operaciones/owner-queue';
import { pendingEmailProposal } from '@/lib/operaciones/email-agent';
import { pendingClientMessages, type PendingMessage } from '@/lib/core/comms';

export type KindKey = 'bloqueos' | 'revisiones' | 'correos' | 'mensajes' | 'dudas' | 'agente' | 'estratega' | 'seo' | 'fichas' | 'base' | 'errores';
export type DeptKey = 'operaciones' | 'cuentas' | 'sistema';

export const KINDS: Record<KindKey, { label: string; dept: DeptKey; urgent: boolean; ownerOnly: boolean }> = {
  bloqueos: { label: 'Bloqueos del equipo', dept: 'operaciones', urgent: true, ownerOnly: true },
  dudas: { label: 'Dudas del equipo escaladas', dept: 'operaciones', urgent: true, ownerOnly: false },
  errores: { label: 'Errores críticos abiertos', dept: 'sistema', urgent: true, ownerOnly: false },
  revisiones: { label: 'Encargos por revisar', dept: 'operaciones', urgent: false, ownerOnly: true },
  correos: { label: 'Correos por responder', dept: 'operaciones', urgent: false, ownerOnly: true },
  // Cimientos (23 nov 2026): lo que el equipo o un agente quiere enviar a un cliente y espera aprobación.
  mensajes: { label: 'Correos a clientes por aprobar', dept: 'operaciones', urgent: false, ownerOnly: false },
  agente: { label: 'Propuestas del agente', dept: 'operaciones', urgent: false, ownerOnly: true },
  estratega: { label: 'Propuestas del estratega', dept: 'cuentas', urgent: false, ownerOnly: false },
  // Hito 1 SEO (23 nov 2026): propuestas del plan de mejora de un proyecto (una entrada por proyecto).
  seo: { label: 'Plan de mejora SEO por aprobar', dept: 'cuentas', urgent: false, ownerOnly: false },
  fichas: { label: 'Cambios propuestos en fichas', dept: 'cuentas', urgent: false, ownerOnly: false },
  base: { label: 'Entradas de la base por revisar', dept: 'operaciones', urgent: false, ownerOnly: false }
};
export const KIND_ORDER = Object.keys(KINDS) as KindKey[];

/** Nombres por defecto (si el organigrama no tiene ese departamento). */
const DEPT_FALLBACK: Record<DeptKey, string> = { operaciones: 'Operaciones', cuentas: 'Cuentas y Estrategia', sistema: 'Sistema' };

export type ParaTiEntry = {
  key: string;
  kind: KindKey;
  title: string;
  detail: string | null;
  clientName: string | null;
  since: Date;
  urgent: boolean;
  /** Dónde se resuelve. null si se resuelve aquí mismo (revisiones y bloqueos, con los botones de Mi bandeja). */
  href: string | null;
};

export type ParaTi = {
  entries: ParaTiEntry[];
  /** Revisiones y bloqueos completos: Para ti los muestra con sus botones de decidir (solo al dueño). */
  inbox: InboxItem[];
  emails: PendingEmail[];
  depts: { key: DeptKey; label: string }[];
};

const LIMIT = 100;
const clip = (s: string | null | undefined, n = 160) => (s ? (s.length > n ? `${s.slice(0, n - 1)}…` : s) : null);

/** Todo lo que espera una decisión, ya ordenado (urgente primero; dentro, lo que más espera). */
export async function getParaTi(tenantId: string): Promise<ParaTi> {
  const [inbox, emails, agentRows, questions, kb, suggestions, memory, errors, deptRows, outgoing, seoPlans, seoEvents, seoPlaces] = await Promise.all([
    getInbox(tenantId),
    getPendingEmailProposals(tenantId),
    db
      .select({ id: opsAgentActions.id, summary: opsAgentActions.summary, createdAt: opsAgentActions.createdAt })
      .from(opsAgentActions)
      // Las respuestas a bloqueos van con su bloqueo y las de correos con «Correos».
      .where(and(eq(opsAgentActions.tenantId, tenantId), eq(opsAgentActions.status, 'propuesto'), inArray(opsAgentActions.kind, ['note_conversion', 'agent_tool'])))
      .orderBy(asc(opsAgentActions.createdAt))
      .limit(LIMIT),
    db
      .select({ id: agtTeamQuestions.id, question: agtTeamQuestions.question, by: agtTeamQuestions.askedByName, status: agtTeamQuestions.status, createdAt: agtTeamQuestions.createdAt, escalatedAt: agtTeamQuestions.escalatedAt })
      .from(agtTeamQuestions)
      .where(and(eq(agtTeamQuestions.tenantId, tenantId), inArray(agtTeamQuestions.status, ['pendiente_aprobacion', 'escalada'])))
      .orderBy(asc(agtTeamQuestions.createdAt))
      .limit(LIMIT),
    db
      .select({ id: kbArticles.id, title: kbArticles.title, createdAt: kbArticles.createdAt })
      .from(kbArticles)
      .where(and(eq(kbArticles.tenantId, tenantId), eq(kbArticles.status, 'propuesta')))
      .orderBy(asc(kbArticles.createdAt))
      .limit(LIMIT),
    db
      .select({ id: estSuggestions.id, title: estSuggestions.title, clientId: estSuggestions.clientId, client: clients.name, createdAt: estSuggestions.createdAt })
      .from(estSuggestions)
      .leftJoin(clients, eq(clients.id, estSuggestions.clientId))
      .where(and(eq(estSuggestions.tenantId, tenantId), eq(estSuggestions.status, 'pendiente')))
      .orderBy(asc(estSuggestions.createdAt))
      .limit(LIMIT),
    db
      .select({ id: clientMemory.id, text: clientMemory.text, kind: clientMemory.kind, clientId: clientMemory.clientId, client: clients.name, createdAt: clientMemory.createdAt })
      .from(clientMemory)
      .leftJoin(clients, eq(clients.id, clientMemory.clientId))
      .where(and(eq(clientMemory.tenantId, tenantId), eq(clientMemory.status, 'propuesto')))
      .orderBy(asc(clientMemory.createdAt))
      .limit(LIMIT),
    listErrorGroups(tenantId, { status: 'abiertos', severity: 'critico' }, LIMIT),
    db.select({ key: agtDepartments.key, name: agtDepartments.name }).from(agtDepartments).where(eq(agtDepartments.tenantId, tenantId)),
    pendingClientMessages(tenantId, LIMIT),
    db
      .select({ projectId: seoPlanItems.projectId, project: projects.name, client: clients.name, n: sql<number>`count(*)::int`, since: sql<Date>`min(${seoPlanItems.createdAt})`, hours: sql<number>`sum(${seoPlanItems.estHours})::float` })
      .from(seoPlanItems)
      .innerJoin(projects, eq(projects.id, seoPlanItems.projectId))
      .leftJoin(clients, eq(clients.id, projects.clientId))
      .where(and(eq(seoPlanItems.tenantId, tenantId), eq(seoPlanItems.status, 'pendiente'), sql`${projects.status} <> 'archived'`))
      .groupBy(seoPlanItems.projectId, projects.name, clients.name)
      .limit(LIMIT),
    // Simulación SEO del 27 nov (atasco 7): eventos, no solo propuestas. Críticos recientes y caída de visitas abiertos.
    // Una fila por proyecto (sin archivados), con caché de 60 s por cuenta: Para ti se pide en cada carga de la barra.
    seoEventsCached(tenantId),
    // Ficha de Google del cliente propuesta y sin confirmar (con su proyecto SEO, para enlazar a Local).
    db
      .select({ clientId: seoLocalPlaces.clientId, client: clients.name, title: seoLocalPlaces.title, since: seoLocalPlaces.createdAt, projectId: sql<string | null>`(SELECT p.id FROM projects p WHERE p.client_id = ${seoLocalPlaces.clientId} AND p.service = 'seo' AND p.status <> 'archived' LIMIT 1)` })
      .from(seoLocalPlaces)
      .innerJoin(clients, eq(clients.id, seoLocalPlaces.clientId))
      .where(and(eq(seoLocalPlaces.tenantId, tenantId), eq(seoLocalPlaces.role, 'cliente'), eq(seoLocalPlaces.status, 'propuesta')))
      .limit(LIMIT)
  ]);

  const entries: ParaTiEntry[] = [];
  const push = (e: Omit<ParaTiEntry, 'urgent'> & { urgent?: boolean }) => entries.push({ ...e, urgent: e.urgent ?? KINDS[e.kind].urgent });

  for (const i of inbox) {
    if (i.kind === 'blocker') {
      push({ key: `b-${i.blocker.id}`, kind: 'bloqueos', title: i.req.title, detail: clip(`${i.blocker.askedByName ?? 'Alguien'}: ${i.blocker.question}`), clientName: i.req.clientName, since: i.since, href: null });
    } else {
      push({ key: `r-${i.req.id}`, kind: 'revisiones', title: i.req.title, detail: i.req.assigneeName ? `Lo entrega ${i.req.assigneeName}` : null, clientName: i.req.clientName, since: i.since, href: null, urgent: i.req.priority === 1 });
    }
  }
  for (const e of emails) push({ key: `c-${e.actionId}`, kind: 'correos', title: e.subject || '(sin asunto)', detail: e.top ? 'Cliente Top' : null, clientName: e.clientName ?? e.from, since: e.since, href: e.emailId ? `/dashboard/operaciones/correos?id=${e.emailId}` : '/dashboard/operaciones/correos' });
  for (const m of outgoing) push({ key: `o-${m.id}`, kind: 'mensajes', title: m.subject, detail: `De ${m.author} · para ${m.to.join(', ')}`, clientName: m.clientName, since: m.since, href: null });
  for (const a of agentRows) push({ key: `a-${a.id}`, kind: 'agente', title: clip(a.summary, 140) ?? 'Propuesta del agente', detail: null, clientName: null, since: a.createdAt, href: '/dashboard/operaciones/agente' });
  for (const q of questions) {
    push({ key: `q-${q.id}`, kind: 'dudas', title: clip(q.question, 140) ?? '', detail: `${q.by} · ${q.status === 'escalada' ? 'escalada a ti' : 'respuesta pendiente de tu aprobación'}`, clientName: null, since: q.escalatedAt ?? q.createdAt, href: '/dashboard/agentes/equipo' });
  }
  for (const k of kb) push({ key: `k-${k.id}`, kind: 'base', title: k.title, detail: null, clientName: null, since: k.createdAt, href: `/dashboard/conocimiento/${k.id}` });
  for (const s of suggestions) push({ key: `s-${s.id}`, kind: 'estratega', title: s.title, detail: null, clientName: s.client, since: s.createdAt, href: `/dashboard/clientes/${s.clientId}?tab=estrategia` });
  for (const p of seoPlans) push({ key: `p-${p.projectId}`, kind: 'seo', title: `${Number(p.n)} propuesta(s) para ${p.project}`, detail: `${Number(p.hours).toLocaleString('es-ES', { maximumFractionDigits: 1 })} h estimadas`, clientName: p.client, since: new Date(p.since), href: `/dashboard/projects/${p.projectId}/plan` });
  for (const e of seoEvents) {
    if (Number(e.drop) > 0) push({ key: `se-${e.projectId}-caida`, kind: 'seo', title: `Caída de visitas en ${e.project}`, detail: 'Diagnóstico por capas en Salud', clientName: e.client, since: new Date(e.since), href: `/dashboard/projects/${e.projectId}/salud`, urgent: true });
    if (Number(e.crit) > 0) push({ key: `se-${e.projectId}-critico`, kind: 'seo', title: `${Number(e.crit)} problema(s) crítico(s) en ${e.project}`, detail: 'Mira el Resumen del proyecto', clientName: e.client, since: new Date(e.since), href: `/dashboard/projects/${e.projectId}/resumen`, urgent: true });
  }
  for (const pl of seoPlaces) push({ key: `sf-${pl.clientId}`, kind: 'seo', title: `Confirmar su ficha de Google: ${pl.title}`, detail: 'Sin confirmar no se vigila la ficha ni se mide el mapa', clientName: pl.client, since: pl.since, href: pl.projectId ? `/dashboard/projects/${pl.projectId}/local` : '/dashboard/projects' });
  for (const m of memory) push({ key: `m-${m.id}`, kind: 'fichas', title: clip(m.text, 140) ?? '', detail: m.kind, clientName: m.client, since: m.createdAt, href: `/dashboard/clientes/${m.clientId}?tab=memoria` });
  for (const g of errors) push({ key: `e-${g.id}`, kind: 'errores', title: g.title, detail: `${g.source}${g.area ? ` · ${g.area}` : ''} · ${g.occurrences} vez/veces`, clientName: null, since: g.firstSeen, href: `/dashboard/errores?id=${g.id}` });

  entries.sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.since.getTime() - b.since.getTime());

  const names = new Map(deptRows.map((d) => [d.key, d.name]));
  const depts = (Object.keys(DEPT_FALLBACK) as DeptKey[]).map((key) => ({ key, label: names.get(key) ?? DEPT_FALLBACK[key] }));
  return { entries, inbox, emails, depts };
}

type SeoEventRow = { projectId: string; project: string; client: string | null; crit: number; drop: number; since: Date };
const GSE = globalThis as unknown as { __kijuParaTiSeo?: Map<string, { at: number; v: SeoEventRow[] }> };
/** Eventos SEO por proyecto (críticos de 14 días y caída abierta), sin archivados; caché de 60 s por cuenta. */
async function seoEventsCached(tenantId: string): Promise<SeoEventRow[]> {
  const cache = (GSE.__kijuParaTiSeo ??= new Map());
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < 60_000) return hit.v;
  const v = (await db
    .select({
      projectId: projects.id,
      project: projects.name,
      client: clients.name,
      crit: sql<number>`count(*) FILTER (WHERE ${findings.severity} = 'critico' AND ${findings.firstSeen} > now() - interval '14 days')::int`,
      drop: sql<number>`count(*) FILTER (WHERE ${findings.kind} = 'seo.traffic_drop_diagnosed')::int`,
      since: sql<Date>`min(${findings.firstSeen})`
    })
    .from(findings)
    .innerJoin(projects, eq(projects.id, findings.projectId))
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(findings.tenantId, tenantId), eq(findings.status, 'abierto'), sql`${projects.status} <> 'archived'`, sql`((${findings.severity} = 'critico' AND ${findings.firstSeen} > now() - interval '14 days') OR ${findings.kind} = 'seo.traffic_drop_diagnosed')`))
    .groupBy(projects.id, projects.name, clients.name)
    .orderBy(sql`min(${findings.firstSeen})`)
    .limit(LIMIT)) as SeoEventRow[];
  cache.set(tenantId, { at: Date.now(), v });
  return v;
}

/** Recuento por tipo (Inicio y barra lateral). */
export function countByKind(entries: ParaTiEntry[]): { kind: KindKey; count: number; oldest: Date | null; urgent: boolean }[] {
  return KIND_ORDER.map((kind) => {
    const list = entries.filter((e) => e.kind === kind);
    return { kind, count: list.length, oldest: list.length ? list.reduce((m, e) => (e.since < m ? e.since : m), list[0].since) : null, urgent: list.some((e) => e.urgent) };
  });
}

/** Filtro puro de Para ti: por departamento y por tipo. */
export function filterEntries(entries: ParaTiEntry[], f: { dept?: string | null; kind?: string | null }): ParaTiEntry[] {
  return entries.filter((e) => (!f.dept || KINDS[e.kind].dept === f.dept) && (!f.kind || e.kind === f.kind));
}

// --- Decidir aquí mismo (23 nov 2026) ------------------------------------------------------------------------------
// Además de revisiones y bloqueos, Para ti deja decidir sin salir de la página los correos (la respuesta que propone el
// agente), las propuestas de los agentes (✅ Hacerlo / ✖️ Descartar) y las dudas del equipo. Solo se carga al pintar la
// página (el contador de la barra no lo necesita). Los demás tipos siguen enlazando a su pantalla.

const DECIDE_LIMIT = 30;

export type EmailDecision = {
  key: string;
  email: PendingEmail;
  /** Lo que entendió el agente del correo y el principio del texto (solo texto: React lo escapa). */
  aiSummary: string;
  excerpt: string;
  proposal: NonNullable<Awaited<ReturnType<typeof pendingEmailProposal>>>;
};

export type ToolDecision = { key: string; id: string; summary: string; agent: string | null; requestedBy: string | null; since: Date };

export type ParaTiDecisions = { emails: EmailDecision[]; tools: ToolDecision[]; questions: AgtTeamQuestion[]; messages: PendingMessage[] };

/** Clave de la entrada de Para ti que corresponde a cada decisión (para cruzarla con los filtros). */
export const decisionKey = { email: (actionId: string) => `c-${actionId}`, tool: (id: string) => `a-${id}`, question: (id: string) => `q-${id}`, message: (id: string) => `o-${id}` };

const EXCERPT = 600;

export async function getParaTiDecisions(tenantId: string, emails: PendingEmail[]): Promise<ParaTiDecisions> {
  const withEmail = emails.filter((e): e is PendingEmail & { emailId: string } => Boolean(e.emailId)).slice(0, DECIDE_LIMIT);
  const [bodies, proposals, toolRows, questions, messages] = await Promise.all([
    withEmail.length
      ? db
          .select({ id: opsInboundEmails.id, bodyText: opsInboundEmails.bodyText, proposal: opsInboundEmails.proposal })
          .from(opsInboundEmails)
          .where(and(eq(opsInboundEmails.tenantId, tenantId), inArray(opsInboundEmails.id, withEmail.map((e) => e.emailId))))
      : Promise.resolve([]),
    Promise.all(withEmail.map((e) => pendingEmailProposal(tenantId, e.emailId))),
    db
      .select({ id: opsAgentActions.id, summary: opsAgentActions.summary, proposal: opsAgentActions.proposal, createdAt: opsAgentActions.createdAt })
      .from(opsAgentActions)
      .where(and(eq(opsAgentActions.tenantId, tenantId), eq(opsAgentActions.status, 'propuesto'), eq(opsAgentActions.kind, 'agent_tool')))
      .orderBy(asc(opsAgentActions.createdAt))
      .limit(DECIDE_LIMIT),
    db
      .select()
      .from(agtTeamQuestions)
      .where(and(eq(agtTeamQuestions.tenantId, tenantId), inArray(agtTeamQuestions.status, ['pendiente_aprobacion', 'escalada'])))
      .orderBy(asc(agtTeamQuestions.createdAt))
      .limit(DECIDE_LIMIT),
    pendingClientMessages(tenantId, DECIDE_LIMIT)
  ]);
  const byId = new Map(bodies.map((b) => [b.id, b]));
  const emailDecisions: EmailDecision[] = [];
  withEmail.forEach((e, i) => {
    const p = proposals[i];
    // Sin propuesta legible (o ya decidida entre las dos lecturas) se queda en la lista con su enlace.
    if (!p || p.actionId !== e.actionId) return;
    const b = byId.get(e.emailId);
    const body = (b?.bodyText ?? '').trim();
    emailDecisions.push({
      key: decisionKey.email(e.actionId),
      email: e,
      aiSummary: String((b?.proposal as { resumen?: unknown } | null)?.resumen ?? ''),
      excerpt: body.length > EXCERPT ? `${body.slice(0, EXCERPT - 1)}…` : body,
      proposal: p
    });
  });
  const tools: ToolDecision[] = toolRows.map((t) => {
    const p = (t.proposal ?? {}) as { agent?: unknown; requestedBy?: unknown };
    return {
      key: decisionKey.tool(t.id),
      id: t.id,
      summary: t.summary,
      agent: typeof p.agent === 'string' ? p.agent : null,
      requestedBy: typeof p.requestedBy === 'string' ? p.requestedBy : null,
      since: t.createdAt
    };
  });
  return { emails: emailDecisions, tools, questions, messages };
}
