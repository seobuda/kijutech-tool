import 'server-only';

// El agente de correo actuando como project manager (12 nov 2026):
//  - lee el HILO de la conversación (correos anteriores y lo que ya respondimos), sin texto citado duplicado;
//  - aprende de las CORRECCIONES de Enric (últimas respuestas corregidas, como ejemplos);
//  - cuando un correo pide trabajo, PROPONE el encargo con la misma inteligencia que el Bloc (lista, cliente,
//    responsable habitual o por fichas, fecha por el plazo del cliente) y mira la CARGA de cada persona;
//  - al aprobar, CREA de verdad el encargo en ClickUp por el envío fiable de siempre (y avisa al responsable).
import { and, desc, eq, gte, inArray, isNotNull, lt, ne } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  opsAgentActions,
  opsClients,
  opsInboundEmails,
  opsNotes,
  opsRequests,
  opsTeamProfiles,
  roles,
  userRoles,
  users,
  type OpsInboundEmail
} from '@/lib/db/schema';
import { getPrompt } from '@/lib/ai/gateway';
import { findClientInText, listClients } from '@/lib/operaciones/clients';
import { getStructure, validClient } from '@/lib/operaciones/structure';
import { NOTE_PROMPT_KEY, proposeRequests } from '@/lib/operaciones/request-proposer';
import { syncToClickUp } from '@/lib/operaciones/sync';
import { getTeamToday } from '@/lib/operaciones/team-today';
import { validWorkTypeKey } from '@/lib/operaciones/work-types';
import type { ProposalItem } from '@/lib/operaciones/note-types';

const clamp = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);

// --- Texto citado ----------------------------------------------------------------------------

/** Quita la parte citada de una respuesta («> …», «El … escribió:», «On … wrote:», «-----Original…»). */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^>/.test(t)) break;
    if (/^(El|On)\s.{4,200}(escribió|wrote)\s*:?\s*$/i.test(t)) break;
    if (/^-{2,}\s*(Original Message|Mensaje original)/i.test(t)) break;
    if (/^(De|From):\s.+@/i.test(t) && out.length > 0) break;
    out.push(line);
  }
  return out.join('\n').trim();
}

export const normalizeSubject = (s: string) =>
  s
    .replace(/^\s*((re|rv|fw|fwd|reenviar|resp)\s*:\s*)+/i, '')
    .trim()
    .toLowerCase();

// --- Hilo de la conversación ------------------------------------------------------------------

/** Correos anteriores del mismo hilo (mismo asunto y mismo remitente, 30 días) y lo que respondimos. */
export async function threadContext(tenantId: string, email: OpsInboundEmail): Promise<string> {
  const previous = (await threadEmails(tenantId, email)).slice(0, 4).reverse();
  if (previous.length === 0) return '(primer correo de la conversación)';

  const replies = await db
    .select({ inboundEmailId: opsAgentActions.inboundEmailId, final: opsAgentActions.final, decidedAt: opsAgentActions.decidedAt })
    .from(opsAgentActions)
    .where(
      and(
        eq(opsAgentActions.tenantId, tenantId),
        eq(opsAgentActions.kind, 'email_reply'),
        inArray(opsAgentActions.status, ['aprobado', 'corregido']),
        inArray(
          opsAgentActions.inboundEmailId,
          previous.map((p) => p.id)
        )
      )
    );
  const fmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  const blocks: string[] = [];
  for (const p of previous) {
    blocks.push(`[${fmt.format(p.createdAt)}] ${p.fromName || p.fromAddress} escribió:\n${clamp(stripQuoted(p.bodyText) || p.bodyText, 1500)}`);
    const r = replies.find((x) => x.inboundEmailId === p.id);
    const answer = (r?.final as { answer?: string } | null)?.answer;
    if (answer) blocks.push(`[${r?.decidedAt ? fmt.format(r.decidedAt) : '—'}] Nosotros (Equipo Kijutech) respondimos:\n${clamp(answer, 1500)}`);
  }
  return blocks.join('\n\n');
}

/** Correos anteriores del mismo hilo (mismo remitente y asunto, 30 días), del más reciente al más antiguo. */
async function threadEmails(tenantId: string, email: OpsInboundEmail): Promise<OpsInboundEmail[]> {
  const subject = normalizeSubject(email.subject);
  if (!subject) return [];
  const since = new Date(email.createdAt.getTime() - 30 * 86_400_000);
  return (
    await db
      .select()
      .from(opsInboundEmails)
      .where(
        and(
          eq(opsInboundEmails.tenantId, tenantId),
          eq(opsInboundEmails.fromAddress, email.fromAddress),
          ne(opsInboundEmails.id, email.id),
          gte(opsInboundEmails.createdAt, since),
          lt(opsInboundEmails.createdAt, email.createdAt)
        )
      )
      .orderBy(desc(opsInboundEmails.createdAt))
      .limit(20)
  ).filter((e) => normalizeSubject(e.subject) === subject);
}

/** La tarea que ya salió de este hilo (si se creó al aprobar un correo anterior), para añadirle datos. */
export async function threadRequest(
  tenantId: string,
  email: OpsInboundEmail
): Promise<{ requestId: string; title: string } | null> {
  const previous = await threadEmails(tenantId, email);
  if (previous.length === 0) return null;
  const [row] = await db
    .select({ requestId: opsAgentActions.requestId, title: opsRequests.title })
    .from(opsAgentActions)
    .innerJoin(opsRequests, eq(opsRequests.id, opsAgentActions.requestId))
    .where(
      and(
        eq(opsAgentActions.tenantId, tenantId),
        eq(opsAgentActions.kind, 'email_reply'),
        inArray(opsAgentActions.status, ['aprobado', 'corregido']),
        isNotNull(opsAgentActions.requestId),
        inArray(
          opsAgentActions.inboundEmailId,
          previous.map((p) => p.id)
        )
      )
    )
    .orderBy(desc(opsAgentActions.decidedAt))
    .limit(1);
  return row?.requestId ? { requestId: row.requestId, title: row.title } : null;
}

// --- Aprender de las correcciones -------------------------------------------------------------

export async function recentCorrections(tenantId: string, limit = 5): Promise<string> {
  const rows = await db
    .select({ proposal: opsAgentActions.proposal, final: opsAgentActions.final })
    .from(opsAgentActions)
    .where(
      and(
        eq(opsAgentActions.tenantId, tenantId),
        eq(opsAgentActions.kind, 'email_reply'),
        eq(opsAgentActions.status, 'corregido')
      )
    )
    .orderBy(desc(opsAgentActions.decidedAt))
    .limit(limit);
  if (rows.length === 0) return '(todavía ninguna)';
  return rows
    .map((r, i) => {
      const before = (r.proposal as { answer?: string }).answer ?? '';
      const after = (r.final as { answer?: string } | null)?.answer ?? '';
      return `Ejemplo ${i + 1}\nPropusiste:\n${clamp(before, 700)}\nEnric envió:\n${clamp(after, 700)}`;
    })
    .join('\n\n');
}

// --- Carga de trabajo del equipo ------------------------------------------------------------------

export type Load = { clickupId: string; name: string; overdue: number; today: number; open: number };

const OPEN_STATES = ['asignado', 'en_curso', 'devuelto', 'bloqueado'];

/**
 * Carga de cada persona activa del equipo: vencidas y de hoy en ClickUp («Equipo hoy», caché de 2 min,
 * una consulta agrupada) y encargos abiertos de la herramienta. Si ClickUp no responde, solo lo segundo.
 */
export async function teamLoad(tenantId: string): Promise<Load[]> {
  const profiles = await db
    .select({ clickupUserId: opsTeamProfiles.clickupUserId, name: opsTeamProfiles.name })
    .from(opsTeamProfiles)
    .where(and(eq(opsTeamProfiles.tenantId, tenantId), eq(opsTeamProfiles.active, true), isNotNull(opsTeamProfiles.clickupUserId)));
  const open = await db
    .select({ assignee: opsRequests.assigneeClickupId })
    .from(opsRequests)
    .where(and(eq(opsRequests.tenantId, tenantId), inArray(opsRequests.workStatus, OPEN_STATES)));
  let today: Awaited<ReturnType<typeof getTeamToday>> | null = null;
  try {
    today = await getTeamToday(tenantId);
  } catch {
    today = null;
  }
  return profiles.map((p) => {
    const m = today?.members.find((x) => x.member.id === p.clickupUserId);
    return {
      clickupId: p.clickupUserId!,
      name: p.name,
      overdue: m?.overdue.length ?? 0,
      today: m?.today.length ?? 0,
      open: open.filter((o) => o.assignee === p.clickupUserId).length
    };
  });
}

export const loadScore = (l: Load) => l.overdue * 2 + l.today + l.open;
export const loadLabel = (l: Load) => `${l.overdue} vencidas · ${l.today} hoy · ${l.open} encargos abiertos`;

// --- Proponer el encargo de un correo ---------------------------------------------------------------

export type EmailRequestItem = {
  title: string;
  description: string;
  listId: string;
  listName: string;
  spaceId: string;
  assigneeId: string;
  assigneeName: string;
  assigneeReason: string;
  dueDate: string;
  dueReason: string;
  priority: number;
  clientOptionId: string;
  workTypeKey: string;
};

/** Espacio de ClickUp para el encargo: el habitual del cliente, el del cliente nombrado en el texto, o el último usado en el Bloc. */
async function pickSpace(tenantId: string, email: OpsInboundEmail, text: string): Promise<string | null> {
  if (email.clientId) {
    const [c] = await db
      .select({ space: opsClients.usualSpaceId })
      .from(opsClients)
      .where(and(eq(opsClients.id, email.clientId), eq(opsClients.tenantId, tenantId)))
      .limit(1);
    if (c?.space) return c.space;
  }
  const named = findClientInText(await listClients(tenantId), text);
  if (named?.usualSpaceId) return named.usualSpaceId;
  const [lastNote] = await db
    .select({ space: opsNotes.clickupSpaceId })
    .from(opsNotes)
    .where(and(eq(opsNotes.tenantId, tenantId), isNotNull(opsNotes.clickupSpaceId)))
    .orderBy(desc(opsNotes.updatedAt))
    .limit(1);
  return lastNote?.space ?? null;
}

export async function proposeEmailRequests(
  tenantId: string,
  email: OpsInboundEmail,
  summary: { resumen: string; encargo: string }
): Promise<EmailRequestItem[]> {
  const body = stripQuoted(email.bodyText) || email.bodyText;
  const text = [
    `Correo de ${email.fromName || email.fromAddress} <${email.fromAddress}>. Asunto: ${email.subject}`,
    clamp(body, 6000),
    summary.encargo ? `Trabajo que pide (resumen del agente): ${summary.encargo}` : ''
  ]
    .filter(Boolean)
    .join('\n\n');
  const spaceId = await pickSpace(tenantId, email, text);
  if (!spaceId) return [];
  const structure = await getStructure(tenantId);
  const space = structure.spaces.find((s) => s.id === spaceId);
  if (!space) return [];
  const prompt = await getPrompt(NOTE_PROMPT_KEY);
  if (!prompt) return [];

  const { items } = await proposeRequests(
    tenantId,
    { text, spaceId, spaceName: space.name, assigneeClickupId: null, assigneeName: null },
    prompt
  );
  const listName = new Map(space.lists.map((l) => [l.id, l.name]));
  const valid = items.filter((i) => i.listId && listName.has(i.listId)).slice(0, 3);
  if (valid.length === 0) return [];

  // Como un PM: si el responsable propuesto va muy cargado, se propone a la persona menos cargada
  // que ya trabaja en ese tipo de trabajo (o del equipo) y se dice por qué. Enric puede cambiarlo.
  const loads = await teamLoad(tenantId);
  return valid.map((i) => {
    let { assigneeId, assigneeName, assigneeReason } = i;
    const current = loads.find((l) => l.clickupId === assigneeId);
    const others = loads.filter((l) => l.clickupId !== assigneeId).sort((a, b) => loadScore(a) - loadScore(b));
    if (current && others[0] && loadScore(current) >= 8 && loadScore(others[0]) <= loadScore(current) / 2) {
      assigneeReason = `${current.name} va muy cargado (${loadLabel(current)}); propongo a ${others[0].name} (${loadLabel(others[0])}).`;
      assigneeId = others[0].clickupId;
      assigneeName = others[0].name;
    } else if (!assigneeId && others[0]) {
      assigneeReason = `Sin responsable claro: propongo a la persona menos cargada (${loadLabel(others[0])}).`;
      assigneeId = others[0].clickupId;
      assigneeName = others[0].name;
    }
    return {
      title: i.title,
      description: i.description,
      listId: i.listId,
      listName: listName.get(i.listId) ?? '',
      spaceId,
      assigneeId,
      assigneeName,
      assigneeReason: assigneeReason ?? '',
      dueDate: i.dueDate,
      dueReason: i.dueReason ?? '',
      priority: i.priority,
      clientOptionId: i.clientOptionId ?? '',
      workTypeKey: i.workTypeKey ?? ''
    };
  });
}

// --- Crear los encargos de verdad ---------------------------------------------------------------------

async function ownerUserId(tenantId: string): Promise<number | null> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(users.tenantId, tenantId), eq(roles.name, 'super_admin')))
    .orderBy(users.id)
    .limit(1);
  return row?.id ?? null;
}

/**
 * Crea los encargos (pendiente_clickup → ClickUp) con el envío fiable de siempre: marca [kiju:ID], reintento
 * sin duplicados y aviso por Telegram al responsable cuando ClickUp confirma. Devuelve los creados.
 */
export async function createEmailRequests(
  tenantId: string,
  email: OpsInboundEmail,
  items: EmailRequestItem[]
): Promise<{ id: string; title: string; ok: boolean; taskUrl?: string; error?: string }[]> {
  const createdBy = await ownerUserId(tenantId);
  if (!createdBy) throw new Error('No hay ningún administrador en la cuenta');
  const structure = await getStructure(tenantId);
  const origin = `Correo de ${email.fromName || email.fromAddress} <${email.fromAddress}> — «${email.subject}»`;
  const out: { id: string; title: string; ok: boolean; taskUrl?: string; error?: string }[] = [];
  for (const item of items) {
    const [row] = await db
      .insert(opsRequests)
      .values({
        tenantId,
        createdBy,
        clickupListId: item.listId,
        clickupListName: item.listName || null,
        title: item.title,
        originalRequest: `${origin}\n\n${clamp(stripQuoted(email.bodyText) || email.bodyText, 8000)}`,
        preparedDescription: `${item.description}\n\n---\nOrigen: ${origin}`,
        assigneeClickupId: item.assigneeId || null,
        assigneeName: item.assigneeName || null,
        dueDate: item.dueDate || null,
        priority: item.priority,
        ...validClient(structure, item.listId, item.clientOptionId),
        workTypeKey: await validWorkTypeKey(tenantId, item.workTypeKey),
        status: 'pendiente_clickup'
      })
      .returning({ id: opsRequests.id });
    const res = await syncToClickUp(row.id, tenantId, false);
    out.push(res.ok ? { id: row.id, title: item.title, ok: true, taskUrl: res.taskUrl } : { id: row.id, title: item.title, ok: false, error: res.error });
  }
  return out;
}

/** Frase verídica que se añade a la respuesta SOLO cuando el encargo se ha creado de verdad. */
export function createdSentence(items: { title: string }[], details: EmailRequestItem[]): string {
  const fmt = (ymd: string) => {
    const [y, m, d] = ymd.split('-');
    return `${d}/${m}/${y}`;
  };
  if (items.length === 1) {
    const d = details[0];
    const who = d?.assigneeName ? ` y lo lleva ${d.assigneeName}` : '';
    const when = d?.dueDate ? `, con fecha prevista el ${fmt(d.dueDate)}` : '';
    return `Lo hemos registrado como tarea («${items[0].title}»)${who}${when}.`;
  }
  return `Lo hemos registrado como ${items.length} tareas: ${items.map((i) => `«${i.title}»`).join(', ')}.`;
}

/** Inserta la frase antes de la firma («Un saludo,») o al final. */
export function withSentence(answer: string, sentence: string): string {
  const idx = answer.search(/\n\s*Un saludo,/i);
  if (idx === -1) return `${answer.trim()}\n\n${sentence}`;
  return `${answer.slice(0, idx).trimEnd()}\n\n${sentence}${answer.slice(idx)}`;
}
