'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { opsNotes, opsRequests, type OpsNote } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { getUserIfAllowed, requirePermission, type Permission } from '@/lib/auth/permissions';
import { getPrompt } from '@/lib/ai/gateway';
import { getClickUpToken } from '@/lib/operaciones/queries';
import { validWorkTypeKey } from '@/lib/operaciones/work-types';
import { getStructure, validClient } from '@/lib/operaciones/structure';
import { syncToClickUp, type SyncResult } from '@/lib/operaciones/sync';
import {
  CONVERSION_TIMEOUT_MS,
  normalizeConversionState,
  type ConversionState,
  type ProposalItem
} from '@/lib/operaciones/note-types';
import { publicError } from '@/lib/errors';
import { NOTE_PROMPT_KEY, proposeRequests, type NotePrompt } from '@/lib/operaciones/request-proposer';
import { compareNoteProposal, recordAction } from '@/lib/operaciones/agent-actions';

// ---------------------------------------------------------------------------
// Autoguardado
// ---------------------------------------------------------------------------

export type SaveNoteInput = {
  id: string | null;
  content: string;
  spaceId: string | null;
  spaceName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
};

// Crea la nota la primera vez y la actualiza después. Solo se editan borradores.
export async function saveNote(
  input: SaveNoteInput
): Promise<{ ok: true; id: string; savedAt: string } | { ok: false; error: string }> {
  const user = await getUserIfAllowed('edit');
  if (!user) return { ok: false, error: 'No tienes permiso para hacer esto' };

  const values = {
    content: input.content,
    clickupSpaceId: input.spaceId || null,
    clickupSpaceName: input.spaceName || null,
    assigneeClickupId: input.assigneeId || null,
    assigneeName: input.assigneeName || null,
    updatedAt: new Date()
  };

  if (!input.id) {
    const [row] = await db
      .insert(opsNotes)
      .values({ ...values, tenantId: user.tenantId, createdBy: user.id })
      .returning({ id: opsNotes.id, updatedAt: opsNotes.updatedAt });
    return { ok: true, id: row.id, savedAt: row.updatedAt.toISOString() };
  }

  const [row] = await db
    .update(opsNotes)
    .set(values)
    .where(
      and(
        eq(opsNotes.id, input.id),
        eq(opsNotes.tenantId, user.tenantId),
        eq(opsNotes.status, 'borrador')
      )
    )
    .returning({ id: opsNotes.id, updatedAt: opsNotes.updatedAt });
  if (!row) return { ok: false, error: 'La nota no existe o ya está convertida' };
  return { ok: true, id: row.id, savedAt: row.updatedAt.toISOString() };
}

export async function deleteNote(noteId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getUserIfAllowed('edit');
  if (!user) return { ok: false, error: 'No tienes permiso para hacer esto' };
  await db.delete(opsNotes).where(and(eq(opsNotes.id, noteId), eq(opsNotes.tenantId, user.tenantId)));
  revalidatePath('/dashboard/operaciones');
  return { ok: true };
}

// Vuelve de la pantalla de revisión a la nota (descarta la propuesta de la IA).
export async function discardProposal(noteId: string): Promise<{ ok: true }> {
  const user = await getUserIfAllowed('edit');
  if (user) {
    await db
      .update(opsNotes)
      .set({ proposal: null })
      .where(and(eq(opsNotes.id, noteId), eq(opsNotes.tenantId, user.tenantId)));
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Convertir nota en encargos (IA) — en segundo plano
// ---------------------------------------------------------------------------
// Leer las listas y llamar a la IA puede tardar, así que no se hace dentro de la
// petición del botón: startConversion() valida, lanza el trabajo y vuelve al
// instante. El avance (paso actual, resultado o error) se guarda en
// ops_notes.proposal; la pantalla lo consulta con getConversionState(). Así
// sobrevive a cambiar de pestaña o recargar, y nunca se queda "pensando".


async function setConversionState(noteId: string, state: ConversionState) {
  await db.update(opsNotes).set({ proposal: state }).where(eq(opsNotes.id, noteId));
}

export async function startConversion(
  noteId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getUserIfAllowed('edit');
  if (!user) return { ok: false, error: 'No tienes permiso para hacer esto' };

  const [note] = await db
    .select()
    .from(opsNotes)
    .where(and(eq(opsNotes.id, noteId), eq(opsNotes.tenantId, user.tenantId)))
    .limit(1);
  if (!note) return { ok: false, error: 'Nota no encontrada' };
  if (note.status !== 'borrador') return { ok: false, error: 'Esta nota ya está convertida' };
  if (!note.content.trim()) return { ok: false, error: 'La nota está vacía' };
  if (!note.clickupSpaceId) return { ok: false, error: 'Elige primero el espacio de ClickUp' };

  // Ya hay una conversión en marcha: no se lanza otra.
  if (normalizeConversionState(note.proposal)?.state === 'processing') return { ok: true };

  const conn = await getClickUpToken(user.tenantId);
  if (!conn) return { ok: false, error: 'Conecta ClickUp primero en Ajustes' };

  const prompt = await getPrompt(NOTE_PROMPT_KEY);
  if (!prompt) {
    return {
      ok: false,
      error: `El prompt "${NOTE_PROMPT_KEY}" no existe o está desactivado (IA & Modelos → Prompts)`
    };
  }

  await setConversionState(note.id, {
    state: 'processing',
    step: 'Empezando…',
    startedAt: new Date().toISOString()
  });

  // Sin await: sigue en segundo plano. runConversion nunca lanza (guarda el error).
  void runConversion(note, user.tenantId, conn, prompt);
  return { ok: true };
}

export async function getConversionState(noteId: string): Promise<ConversionState | null> {
  const user = await getUserIfAllowed('edit');
  if (!user) return null;
  const [note] = await db
    .select({ proposal: opsNotes.proposal })
    .from(opsNotes)
    .where(and(eq(opsNotes.id, noteId), eq(opsNotes.tenantId, user.tenantId)))
    .limit(1);
  return note ? normalizeConversionState(note.proposal) : null;
}

async function runConversion(
  note: OpsNote,
  tenantId: string,
  conn: { token: string; workspaceId: string | null },
  prompt: NotePrompt
) {
  const startedAt = new Date().toISOString();
  const ctl = { cancelled: false };
  const step = async (s: string) => {
    if (!ctl.cancelled) await setConversionState(note.id, { state: 'processing', step: s, startedAt });
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const watchdog = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctl.cancelled = true;
      reject(
        new Error(
          'La conversión tardó más de 2,5 minutos y se canceló. Inténtalo de nuevo (si la nota es muy larga, divídela en dos).'
        )
      );
    }, CONVERSION_TIMEOUT_MS);
  });

  try {
    await Promise.race([doConversion(note, tenantId, conn, prompt, step, ctl), watchdog]);
  } catch (e) {
    ctl.cancelled = true;
    const message = publicError(e, 'Error desconocido al convertir la nota');
    try {
      await setConversionState(note.id, { state: 'error', error: message });
    } catch {
      // si ni siquiera se puede guardar el error, lo detecta el control de caducidad
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function doConversion(
  note: OpsNote,
  tenantId: string,
  _conn: { token: string; workspaceId: string | null },
  prompt: NotePrompt,
  step: (s: string) => Promise<void>,
  ctl: { cancelled: boolean }
) {
  const { items, notConverted } = await proposeRequests(
    tenantId,
    {
      text: note.content,
      spaceId: note.clickupSpaceId!,
      spaceName: note.clickupSpaceName ?? note.clickupSpaceId!,
      assigneeClickupId: note.assigneeClickupId,
      assigneeName: note.assigneeName
    },
    prompt,
    step
  );
  if (ctl.cancelled) return;
  await setConversionState(note.id, { state: 'done', items, notConverted });
}

// ---------------------------------------------------------------------------
// Enviar todo
// ---------------------------------------------------------------------------

const sendItemSchema = z.object({
  key: z.string(),
  title: z.string().trim().min(1, 'Todos los encargos necesitan título').max(500),
  description: z.string().default(''),
  listId: z.string().min(1, 'Elige una lista para cada encargo'),
  assigneeId: z.string().default(''),
  assigneeName: z.string().default(''),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).default(''),
  priority: z.number().int().min(1).max(4).default(3),
  clientOptionId: z.string().default(''),
  workTypeKey: z.string().default(''),
  requiresReview: z.boolean().default(false)
});

export type SendNoteResult =
  | { ok: true; results: { key: string; title: string; result: SyncResult }[] }
  | { ok: false; error: string };

export async function sendNoteRequests(
  noteId: string,
  rawItems: z.input<typeof sendItemSchema>[]
): Promise<SendNoteResult> {
  const user = await getUserIfAllowed('edit');
  if (!user) return { ok: false, error: 'No tienes permiso para hacer esto' };

  const parsed = z.array(sendItemSchema).min(1, 'No hay encargos que enviar').safeParse(rawItems);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };
  const items = parsed.data;

  const [note] = await db
    .select()
    .from(opsNotes)
    .where(and(eq(opsNotes.id, noteId), eq(opsNotes.tenantId, user.tenantId)))
    .limit(1);
  if (!note) return { ok: false, error: 'Nota no encontrada' };
  // Evita duplicar encargos si se pulsa dos veces "Enviar todo".
  if (note.status !== 'borrador') return { ok: false, error: 'Esta nota ya está convertida' };
  if (!note.clickupSpaceId) return { ok: false, error: 'La nota no tiene espacio de ClickUp' };

  // Solo listas reales del espacio de la nota, leídas de la caché (sin llamar a ClickUp).
  const structure = await getStructure(user.tenantId);
  const lists = structure.spaces.find((s) => s.id === note.clickupSpaceId)?.lists ?? [];
  const listNames = new Map(lists.map((l) => [l.id, l.name]));
  const bad = items.find((i) => !listNames.has(i.listId));
  if (bad) return { ok: false, error: `La lista elegida para «${bad.title}» no es del espacio de la nota` };

  const typeKeys = await Promise.all(items.map((i) => validWorkTypeKey(user.tenantId, i.workTypeKey)));

  // 1) En una transacción: primero se RECLAMA la nota (solo si sigue en borrador) y después se
  //    guardan los encargos como pendiente_clickup. Un doble clic o dos pestañas ya no duplican:
  //    la segunda petición no consigue reclamarla y no inserta nada.
  const rows = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(opsNotes)
      .set({ status: 'convertida', convertedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(opsNotes.id, note.id), eq(opsNotes.status, 'borrador')))
      .returning({ id: opsNotes.id });
    if (!claimed) return null;
    return tx
    .insert(opsRequests)
    .values(
      items.map((i, idx) => ({
        tenantId: user.tenantId,
        createdBy: user.id,
        clickupListId: i.listId,
        clickupListName: listNames.get(i.listId) ?? null,
        title: i.title,
        originalRequest: note.content,
        preparedDescription: i.description.trim() || note.content,
        assigneeClickupId: i.assigneeId || null,
        assigneeName: i.assigneeName || null,
        dueDate: i.dueDate || null,
        priority: i.priority,
        ...validClient(structure, i.listId, i.clientOptionId),
        workTypeKey: typeKeys[idx],
        reviewerKey: i.requiresReview ? 'owner' : null,
        status: 'pendiente_clickup',
        noteId: note.id
      }))
    )
    .returning({ id: opsRequests.id });
  });
  // La nota ya estaba convertida (otra petición la reclamó antes): no se repite nada.
  // Desde aquí no se puede reenviar; los fallos se reintentan desde Encargos.
  if (!rows) return { ok: false, error: 'Esta nota ya está convertida' };

  // Motor de acciones: ¿se envió lo que propuso la IA tal cual (aprobada a la primera) o se tocó?
  // Nunca debe estropear el envío: cualquier fallo aquí solo se anota en el log.
  try {
    const conv = normalizeConversionState(note.proposal);
    if (conv?.state === 'done' && conv.items.length) {
      const cmp = compareNoteProposal(conv.items, items);
      await recordAction({
        tenantId: user.tenantId,
        kind: 'note_conversion',
        status: cmp.status,
        autonomy: 'aprobacion',
        summary: `${items.length} encargo(s) desde una nota: ${items.map((i) => i.title).join(' · ')}`,
        proposal: { items: conv.items.map((i) => ({ title: i.title, listId: i.listId, assigneeName: i.assigneeName, dueDate: i.dueDate, priority: i.priority })) },
        final: {
          items: items.map((i) => ({ title: i.title, listId: i.listId, assigneeName: i.assigneeName, dueDate: i.dueDate, priority: i.priority })),
          changed: cmp.changed,
          removed: cmp.removed,
          added: cmp.added
        },
        noteId: note.id,
        decidedByName: user.name || user.email,
        decidedVia: 'panel',
        dedupeKey: `note:${note.id}`
      });
    }
  } catch (e) {
    console.error('[agente] no se pudo registrar la conversión:', e instanceof Error ? e.message : e);
  }

  // 2) Cada encargo usa el mismo envío fiable del paso 3 (uno tras otro, por el límite de ClickUp).
  const results: { key: string; title: string; result: SyncResult }[] = [];
  for (const [idx, row] of rows.entries()) {
    results.push({
      key: items[idx].key,
      title: items[idx].title,
      result: await syncToClickUp(row.id, user.tenantId, false)
    });
  }

  revalidatePath('/dashboard/operaciones');
  revalidatePath('/dashboard/operaciones/encargos');
  return { ok: true, results };
}
