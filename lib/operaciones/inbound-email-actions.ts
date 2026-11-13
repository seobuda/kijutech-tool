'use server';

// Acciones de la pestaña «Correos». Ver y actuar sobre correos pide `edit` (como el Bloc y las fichas);
// borrar de verdad pide `admin`. Todas filtran por la cuenta del usuario. Aquí no se llama a ninguna IA.
import { randomUUID } from 'crypto';
import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import { clients, opsInboundEmails } from '@/lib/db/schema';
import { checkPermission, requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { ClientError, saveContact } from '@/lib/core/clients';
import { ingestInboundEmail, recognizeSender } from '@/lib/operaciones/inbound-email';
import { INBOUND_STATUSES, validateInboundPayload } from '@/lib/operaciones/inbound-email-rules';
import { pendingEmailProposal } from '@/lib/operaciones/email-agent';

type Ok<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (e: unknown, fallback: string): { ok: false; error: string } => ({
  ok: false,
  error: publicError(e, fallback)
});

const refresh = () => revalidatePath('/dashboard/operaciones/correos');

export type InboundEmailRow = {
  id: string;
  fromAddress: string;
  fromName: string;
  subject: string;
  status: string;
  statusNote: string;
  clientId: string | null;
  clientName: string;
  matchedBy: string;
  authStatus: string;
  source: string;
  createdAt: string;
};

export type InboundEmailDetail = InboundEmailRow & {
  toAddress: string;
  bodyText: string;
  attachments: string[];
  sentAt: string | null;
  // Lo que entendió el agente y, si hay, su respuesta propuesta pendiente de aprobar (paso 3).
  aiSummary: string;
  pendingReply: {
    actionId: string;
    answer: string;
    requests: { title: string; listName: string; assigneeName: string; assigneeReason: string; dueDate: string; priority: number }[];
    addTo: { requestId: string; title: string; note: string } | null;
  } | null;
};

const rowSelect = {
  id: opsInboundEmails.id,
  fromAddress: opsInboundEmails.fromAddress,
  fromName: opsInboundEmails.fromName,
  subject: opsInboundEmails.subject,
  status: opsInboundEmails.status,
  statusNote: opsInboundEmails.statusNote,
  clientId: opsInboundEmails.clientId,
  clientName: clients.name,
  matchedBy: opsInboundEmails.matchedBy,
  authStatus: opsInboundEmails.authStatus,
  source: opsInboundEmails.source,
  createdAt: opsInboundEmails.createdAt
};

type DbRow = {
  id: string;
  fromAddress: string;
  fromName: string | null;
  subject: string;
  status: string;
  statusNote: string | null;
  clientId: string | null;
  clientName: string | null;
  matchedBy: string;
  authStatus: string;
  source: string;
  createdAt: Date;
};

const toRow = (r: DbRow): InboundEmailRow => ({
  id: r.id,
  fromAddress: r.fromAddress,
  fromName: r.fromName ?? '',
  subject: r.subject,
  status: r.status,
  statusNote: r.statusNote ?? '',
  clientId: r.clientId,
  clientName: r.clientName ?? '',
  matchedBy: r.matchedBy,
  authStatus: r.authStatus,
  source: r.source,
  createdAt: r.createdAt.toISOString()
});

export async function listInboundEmails(
  status?: string
): Promise<Ok<{ emails: InboundEmailRow[]; counts: Record<string, number>; canDelete: boolean }>> {
  try {
    const user = await requirePermission('edit');
    const canDelete = (await checkPermission('admin')).ok;
    const filter =
      status && (INBOUND_STATUSES as readonly string[]).includes(status)
        ? and(eq(opsInboundEmails.tenantId, user.tenantId), eq(opsInboundEmails.status, status))
        : eq(opsInboundEmails.tenantId, user.tenantId);
    const [rows, countRows] = await Promise.all([
      db
        .select(rowSelect)
        .from(opsInboundEmails)
        .leftJoin(clients, eq(clients.id, opsInboundEmails.clientId))
        .where(filter)
        .orderBy(desc(opsInboundEmails.createdAt))
        .limit(200),
      db
        .select({ status: opsInboundEmails.status, n: sql<number>`count(*)::int` })
        .from(opsInboundEmails)
        .where(eq(opsInboundEmails.tenantId, user.tenantId))
        .groupBy(opsInboundEmails.status)
    ]);
    const counts: Record<string, number> = {};
    for (const c of countRows) counts[c.status] = c.n;
    return { ok: true, emails: rows.map(toRow), counts, canDelete };
  } catch (e) {
    return fail(e, 'No se pudieron cargar los correos');
  }
}

export async function getInboundEmail(id: string): Promise<Ok<{ email: InboundEmailDetail }>> {
  try {
    const user = await requirePermission('edit');
    const [r] = await db
      .select({
        ...rowSelect,
        toAddress: opsInboundEmails.toAddress,
        bodyText: opsInboundEmails.bodyText,
        attachments: opsInboundEmails.attachments,
        sentAt: opsInboundEmails.sentAt,
        proposal: opsInboundEmails.proposal
      })
      .from(opsInboundEmails)
      .leftJoin(clients, eq(clients.id, opsInboundEmails.clientId))
      .where(and(eq(opsInboundEmails.id, id), eq(opsInboundEmails.tenantId, user.tenantId)))
      .limit(1);
    if (!r) return { ok: false, error: 'El correo no existe' };
    const names = Array.isArray(r.attachments)
      ? (r.attachments as { name?: unknown }[]).map((a) => String(a?.name ?? '')).filter(Boolean)
      : [];
    return {
      ok: true,
      email: {
        ...toRow(r),
        toAddress: r.toAddress ?? '',
        bodyText: r.bodyText,
        attachments: names,
        sentAt: r.sentAt ? r.sentAt.toISOString() : null,
        aiSummary: String((r.proposal as { resumen?: unknown } | null)?.resumen ?? ''),
        pendingReply: await pendingEmailProposal(user.tenantId, r.id)
      }
    };
  } catch (e) {
    return fail(e, 'No se pudo cargar el correo');
  }
}

// «Pegar un correo»: sirve para probar el sistema y para meter a mano un correo que no llegó por la vía normal.
export async function pasteInboundEmail(input: {
  from: string;
  subject: string;
  body: string;
}): Promise<Ok<{ id: string }>> {
  try {
    const user = await requirePermission('edit');
    const parsed = validateInboundPayload({
      messageId: `pegado-${randomUUID()}`,
      from: input.from,
      subject: input.subject,
      text: input.body,
      auth: 'none'
    });
    if (!parsed.ok) return { ok: false, error: parsed.error };
    if (!parsed.value.bodyText) return { ok: false, error: 'Pega el texto del correo' };
    const res = await ingestInboundEmail(user.tenantId, parsed.value, 'pegado');
    if (!res.ok) return { ok: false, error: res.error };
    refresh();
    return { ok: true, id: res.id };
  } catch (e) {
    return fail(e, 'No se pudo guardar el correo');
  }
}

// Asignar a mano el cliente de un correo (y, si se quiere, recordar al remitente como contacto del cliente).
export async function assignInboundEmailClient(input: {
  id: string;
  clientId: string;
  saveSender: boolean;
}): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    const [mail] = await db
      .select({
        id: opsInboundEmails.id,
        fromAddress: opsInboundEmails.fromAddress,
        fromName: opsInboundEmails.fromName,
        status: opsInboundEmails.status
      })
      .from(opsInboundEmails)
      .where(and(eq(opsInboundEmails.id, input.id), eq(opsInboundEmails.tenantId, user.tenantId)))
      .limit(1);
    if (!mail) return { ok: false, error: 'El correo no existe' };
    if (!['sin_cliente', 'nuevo', 'ignorado'].includes(mail.status)) {
      return { ok: false, error: 'Este correo ya se ha tramitado y no se puede reasignar' };
    }
    const [client] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, input.clientId), eq(clients.tenantId, user.tenantId)))
      .limit(1);
    if (!client) return { ok: false, error: 'La ficha no existe' };

    if (input.saveSender) {
      // El remitente pasa a ser un contacto de la ficha (así sus correos se reconocen solos).
      try {
        await saveContact(user.tenantId, input.clientId, { name: mail.fromName ?? '', email: mail.fromAddress });
      } catch (e) {
        // Si ya era contacto de esta misma ficha no es un problema; si es de otra, se avisa y no se asigna.
        if (!(e instanceof ClientError)) throw e;
        if (!e.userMessage.includes('ya está en esta ficha')) return { ok: false, error: e.userMessage };
      }
    }

    await db
      .update(opsInboundEmails)
      .set({ clientId: input.clientId, matchedBy: 'manual', status: 'nuevo', statusNote: null, updatedAt: new Date() })
      .where(and(eq(opsInboundEmails.id, input.id), eq(opsInboundEmails.tenantId, user.tenantId)));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo asignar el cliente');
  }
}

export async function ignoreInboundEmail(id: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    const res = await db
      .update(opsInboundEmails)
      .set({ status: 'ignorado', statusNote: 'Ignorado a mano', decidedBy: user.id, decidedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(opsInboundEmails.id, id),
          eq(opsInboundEmails.tenantId, user.tenantId),
          inArray(opsInboundEmails.status, ['nuevo', 'sin_cliente', 'informativo', 'error'])
        )
      )
      .returning({ id: opsInboundEmails.id });
    if (res.length === 0) return { ok: false, error: 'El correo no existe o ya se ha tramitado' };
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo ignorar el correo');
  }
}

// Volver a considerar un correo ignorado: se reconoce otra vez al remitente (p. ej. tras añadir su contacto).
export async function reopenInboundEmail(id: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    const [mail] = await db
      .select({ fromAddress: opsInboundEmails.fromAddress, status: opsInboundEmails.status })
      .from(opsInboundEmails)
      .where(and(eq(opsInboundEmails.id, id), eq(opsInboundEmails.tenantId, user.tenantId)))
      .limit(1);
    if (!mail) return { ok: false, error: 'El correo no existe' };
    if (!['ignorado', 'sin_cliente', 'descartado'].includes(mail.status)) {
      return { ok: false, error: 'Este correo no se puede reabrir' };
    }
    const rec = await recognizeSender(user.tenantId, mail.fromAddress);
    await db
      .update(opsInboundEmails)
      .set({
        clientId: rec.clientId,
        matchedBy: rec.matchedBy,
        status: rec.status,
        statusNote: rec.matchedBy === 'ambiguo' ? 'Dos fichas reclaman este remitente: asígnalo a mano' : null,
        decidedBy: null,
        decidedAt: null,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(opsInboundEmails.id, id),
          eq(opsInboundEmails.tenantId, user.tenantId),
          notInArray(opsInboundEmails.status, ['aprobado', 'interpretando'])
        )
      );
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo reabrir el correo');
  }
}

export async function deleteInboundEmail(id: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    const res = await db
      .delete(opsInboundEmails)
      .where(and(eq(opsInboundEmails.id, id), eq(opsInboundEmails.tenantId, user.tenantId)))
      .returning({ id: opsInboundEmails.id });
    if (res.length === 0) return { ok: false, error: 'El correo no existe' };
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo eliminar el correo');
  }
}
