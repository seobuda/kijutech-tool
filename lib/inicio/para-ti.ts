// Para ti (fase 2 de la reorganización UX, 21 nov 2026): la bandeja única. Junta en una lista todo lo que espera una
// decisión y que antes estaba repartido en 7 sitios (Mi bandeja, propuestas del agente, correos, dudas del equipo,
// base de conocimiento, estratega, memoria de las fichas y errores). No tiene tabla propia: lee el estado de cada
// módulo. Lo urgente va primero y, dentro, lo que más espera. Cada elemento lleva su departamento para filtrar.
// KINDS es la única definición de los tipos: la usan Para ti, el Inicio («Lo que espera de ti») y el contador de la barra.
import 'server-only';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { agtDepartments, agtTeamQuestions, clientMemory, clients, estSuggestions, kbArticles, opsAgentActions, opsInboundEmails, type AgtTeamQuestion } from '@/lib/db/schema';
import { listErrorGroups } from '@/lib/core/errors';
import { getInbox, type InboxItem } from '@/lib/operaciones/inbox';
import { getPendingEmailProposals, type PendingEmail } from '@/lib/operaciones/owner-queue';
import { pendingEmailProposal } from '@/lib/operaciones/email-agent';
import { pendingClientMessages, type PendingMessage } from '@/lib/core/comms';

export type KindKey = 'bloqueos' | 'revisiones' | 'correos' | 'mensajes' | 'dudas' | 'agente' | 'estratega' | 'fichas' | 'base' | 'errores';
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
  const [inbox, emails, agentRows, questions, kb, suggestions, memory, errors, deptRows, outgoing] = await Promise.all([
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
    pendingClientMessages(tenantId, LIMIT)
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
  for (const m of memory) push({ key: `m-${m.id}`, kind: 'fichas', title: clip(m.text, 140) ?? '', detail: m.kind, clientName: m.client, since: m.createdAt, href: `/dashboard/clientes/${m.clientId}?tab=memoria` });
  for (const g of errors) push({ key: `e-${g.id}`, kind: 'errores', title: g.title, detail: `${g.source}${g.area ? ` · ${g.area}` : ''} · ${g.occurrences} vez/veces`, clientName: null, since: g.firstSeen, href: `/dashboard/errores?id=${g.id}` });

  entries.sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.since.getTime() - b.since.getTime());

  const names = new Map(deptRows.map((d) => [d.key, d.name]));
  const depts = (Object.keys(DEPT_FALLBACK) as DeptKey[]).map((key) => ({ key, label: names.get(key) ?? DEPT_FALLBACK[key] }));
  return { entries, inbox, emails, depts };
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
