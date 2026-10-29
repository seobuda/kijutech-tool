'use server';

import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { opsNotes, opsRequests } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { callAI, getPrompt } from '@/lib/ai/gateway';
import { extractJsonFromLLMResponse } from '@/lib/ai/parsers/json-extractor';
import { getClickUpToken } from '@/lib/operaciones/queries';
import { getSpaceLists, getWorkspaces, OPS_TIMEZONE } from '@/lib/operaciones/clickup';
import { syncToClickUp, type SyncResult } from '@/lib/operaciones/sync';
import { buildDescription, fillTemplate } from '@/lib/operaciones/format';
import type { NoteProposal, ProposalItem } from '@/lib/operaciones/note-types';

const NOTE_PROMPT_KEY = 'ops_note_to_requests';
const CONVERT_MAX_TOKENS = 6000;

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
  const user = await getUser();
  if (!user) return { ok: false, error: 'No autenticado' };

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
  const user = await getUser();
  if (!user) return { ok: false, error: 'No autenticado' };
  await db.delete(opsNotes).where(and(eq(opsNotes.id, noteId), eq(opsNotes.tenantId, user.tenantId)));
  revalidatePath('/dashboard/operaciones');
  return { ok: true };
}

// Vuelve de la pantalla de revisión a la nota (descarta la propuesta de la IA).
export async function discardProposal(noteId: string): Promise<{ ok: true }> {
  const user = await getUser();
  if (user) {
    await db
      .update(opsNotes)
      .set({ proposal: null })
      .where(and(eq(opsNotes.id, noteId), eq(opsNotes.tenantId, user.tenantId)));
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Convertir nota en encargos (IA)
// ---------------------------------------------------------------------------

const aiItemSchema = z.object({
  titulo: z.string().default(''),
  resultado_esperado: z.string().default(''),
  pasos: z.array(z.string()).default([]),
  criterios_aceptacion: z.array(z.string()).default([]),
  datos_que_faltan: z.array(z.string()).default([]),
  lista_id: z.coerce.string().default(''),
  responsable: z.string().default(''),
  fecha: z.string().default(''),
  prioridad: z.coerce.number().default(3)
});

const aiResponseSchema = z.object({
  encargos: z.array(aiItemSchema).default([]),
  no_convertido: z.array(z.string()).default([])
});

export async function convertNote(
  noteId: string
): Promise<{ ok: true; proposal: NoteProposal } | { ok: false; error: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'No autenticado' };

  const [note] = await db
    .select()
    .from(opsNotes)
    .where(and(eq(opsNotes.id, noteId), eq(opsNotes.tenantId, user.tenantId)))
    .limit(1);
  if (!note) return { ok: false, error: 'Nota no encontrada' };
  if (note.status !== 'borrador') return { ok: false, error: 'Esta nota ya está convertida' };
  if (!note.content.trim()) return { ok: false, error: 'La nota está vacía' };
  if (!note.clickupSpaceId) return { ok: false, error: 'Elige primero el espacio de ClickUp' };

  const conn = await getClickUpToken(user.tenantId);
  if (!conn) return { ok: false, error: 'Conecta ClickUp primero en Ajustes' };

  const prompt = await getPrompt(NOTE_PROMPT_KEY);
  if (!prompt) {
    return {
      ok: false,
      error: `El prompt "${NOTE_PROMPT_KEY}" no existe o está desactivado (IA & Modelos → Prompts)`
    };
  }

  let lists, members;
  try {
    const workspaces = await getWorkspaces(conn.token);
    const workspace = workspaces.find((w) => w.id === conn.workspaceId) ?? workspaces[0];
    members = workspace?.members ?? [];
    lists = await getSpaceLists(conn.token, note.clickupSpaceId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo leer ClickUp' };
  }
  if (lists.length === 0) return { ok: false, error: 'El espacio elegido no tiene listas' };

  const today = new Intl.DateTimeFormat('es-ES', { timeZone: OPS_TIMEZONE, dateStyle: 'full' }).format(
    new Date()
  );
  const userPrompt = fillTemplate(prompt.user_prompt_template, {
    fecha_hoy: today,
    espacio: note.clickupSpaceName ?? note.clickupSpaceId,
    responsable_seleccionado: note.assigneeName ?? 'ninguno',
    listas: lists
      .map((l) => `- id: ${l.id} | nombre: ${l.folder ? `${l.folder} / ` : ''}${l.name}`)
      .join('\n'),
    miembros: members.map((m) => `- ${m.username}`).join('\n') || '- (sin datos)',
    nota: note.content.trim()
  });

  let response;
  try {
    response = await callAI({
      tenantId: user.tenantId,
      function: 'ops_note_to_requests',
      promptKey: NOTE_PROMPT_KEY,
      maxTokens: CONVERT_MAX_TOKENS,
      messages: [
        { role: 'system', content: prompt.system_prompt },
        { role: 'user', content: userPrompt }
      ]
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'La llamada a la IA falló' };
  }

  let parsed;
  try {
    parsed = aiResponseSchema.parse(extractJsonFromLLMResponse(response.content));
  } catch {
    return { ok: false, error: 'La IA no devolvió un JSON válido. Inténtalo de nuevo.' };
  }

  const validListIds = new Set(lists.map((l) => l.id));
  const byName = new Map(members.map((m) => [m.username.trim().toLowerCase(), m]));

  const items: ProposalItem[] = parsed.encargos.map((e) => {
    const proposed = byName.get(e.responsable.trim().toLowerCase());
    return {
      key: randomUUID(),
      title: e.titulo.trim(),
      description: buildDescription(e),
      missingData: e.datos_que_faltan,
      // Solo listas reales del espacio: si la IA se inventa un id, queda vacío.
      listId: validListIds.has(e.lista_id) ? e.lista_id : '',
      assigneeId: proposed ? String(proposed.id) : note.assigneeClickupId ?? '',
      assigneeName: proposed ? proposed.username : note.assigneeName ?? '',
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(e.fecha) ? e.fecha : '',
      priority: e.prioridad >= 1 && e.prioridad <= 4 ? Math.round(e.prioridad) : 3
    };
  });

  const proposal: NoteProposal = { items, notConverted: parsed.no_convertido };
  await db.update(opsNotes).set({ proposal }).where(eq(opsNotes.id, noteId));
  return { ok: true, proposal };
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
  priority: z.number().int().min(1).max(4).default(3)
});

export type SendNoteResult =
  | { ok: true; results: { key: string; title: string; result: SyncResult }[] }
  | { ok: false; error: string };

export async function sendNoteRequests(
  noteId: string,
  rawItems: z.input<typeof sendItemSchema>[]
): Promise<SendNoteResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'No autenticado' };

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

  const conn = await getClickUpToken(user.tenantId);
  if (!conn) return { ok: false, error: 'Conecta ClickUp primero en Ajustes' };

  // Solo listas reales del espacio de la nota.
  let lists;
  try {
    lists = await getSpaceLists(conn.token, note.clickupSpaceId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo leer ClickUp' };
  }
  const listNames = new Map(lists.map((l) => [l.id, l.name]));
  const bad = items.find((i) => !listNames.has(i.listId));
  if (bad) return { ok: false, error: `La lista elegida para «${bad.title}» no es del espacio de la nota` };

  // 1) Todos los encargos se guardan primero como pendiente_clickup, vinculados a la nota…
  const rows = await db
    .insert(opsRequests)
    .values(
      items.map((i) => ({
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
        status: 'pendiente_clickup',
        noteId: note.id
      }))
    )
    .returning({ id: opsRequests.id });

  // …y la nota pasa a "convertida" (ya no se puede reenviar; los fallos se reintentan desde Encargos).
  await db
    .update(opsNotes)
    .set({ status: 'convertida', convertedAt: new Date(), updatedAt: new Date() })
    .where(eq(opsNotes.id, note.id));

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
