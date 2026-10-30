'use server';

import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { opsNotes, opsRequests, type OpsNote } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { callAI, getPrompt } from '@/lib/ai/gateway';
import { extractJsonFromLLMResponse } from '@/lib/ai/parsers/json-extractor';
import { getClickUpToken } from '@/lib/operaciones/queries';
import { OPS_TIMEZONE } from '@/lib/operaciones/clickup';
import { profilesForPrompt } from '@/lib/operaciones/team-profiles';
import {
  addWorkingDays,
  clientDeliveryDays,
  findClientByName,
  findClientInText,
  getLevels,
  getServices,
  listClients,
  type ClientWithServices
} from '@/lib/operaciones/clients';
import { getWorkTypeOptions, validWorkTypeKey } from '@/lib/operaciones/work-types';
import { clientFieldForList, getStructure, matchClientOption, validClient } from '@/lib/operaciones/structure';
import { syncToClickUp, type SyncResult } from '@/lib/operaciones/sync';
import { buildDescription, fillTemplate, isOwnTask } from '@/lib/operaciones/format';
import {
  CONVERSION_TIMEOUT_MS,
  normalizeConversionState,
  type ConversionState,
  type ProposalItem
} from '@/lib/operaciones/note-types';

const NOTE_PROMPT_KEY = 'ops_note_to_requests';
// Cada encargo ocupa ~400-600 tokens de salida: 8000 da para unos 12-15.
const CONVERT_MAX_TOKENS = 8000;

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
// Convertir nota en encargos (IA) — en segundo plano
// ---------------------------------------------------------------------------
// Leer las listas y llamar a la IA puede tardar, así que no se hace dentro de la
// petición del botón: startConversion() valida, lanza el trabajo y vuelve al
// instante. El avance (paso actual, resultado o error) se guarda en
// ops_notes.proposal; la pantalla lo consulta con getConversionState(). Así
// sobrevive a cambiar de pestaña o recargar, y nunca se queda "pensando".

const aiItemSchema = z.object({
  titulo: z.string().default(''),
  resultado_esperado: z.string().default(''),
  pasos: z.array(z.string()).default([]),
  criterios_aceptacion: z.array(z.string()).default([]),
  datos_que_faltan: z.array(z.string()).default([]),
  lista_id: z.coerce.string().default(''),
  responsable: z.string().default(''),
  fecha: z.string().default(''),
  prioridad: z.coerce.number().default(3),
  cliente: z.string().default(''),
  tipo_trabajo: z.string().default(''),
  motivo_responsable: z.string().default(''),
  servicio: z.string().default('')
});

const aiResponseSchema = z.object({
  encargos: z.array(aiItemSchema).default([]),
  no_convertido: z.array(z.string()).default([])
});

type NotePrompt = { system_prompt: string; user_prompt_template: string };

async function setConversionState(noteId: string, state: ConversionState) {
  await db.update(opsNotes).set({ proposal: state }).where(eq(opsNotes.id, noteId));
}

export async function startConversion(
  noteId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
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
  const user = await getUser();
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
    const message = e instanceof Error ? e.message : 'Error desconocido al convertir la nota';
    try {
      await setConversionState(note.id, { state: 'error', error: message });
    } catch {
      // si ni siquiera se puede guardar el error, lo detecta el control de caducidad
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Bloque {clientes} del prompt: las opciones reales del campo "Cliente", agrupadas por campo
// (casi siempre es el mismo campo en todas las listas, así que sale una sola vez).
function clientOptionsPrompt(
  lists: { id: string; clientFieldId?: string | null }[],
  fields: Record<string, { name: string; options: { label: string }[] }>
): string {
  const groups = new Map<string, string[]>();
  const without: string[] = [];
  for (const l of lists) {
    if (l.clientFieldId && fields[l.clientFieldId]) {
      groups.set(l.clientFieldId, [...(groups.get(l.clientFieldId) ?? []), l.id]);
    } else without.push(l.id);
  }
  if (groups.size === 0) return '(ninguna lista de este espacio tiene campo Cliente: deja cliente vacío)';
  const out: string[] = [];
  for (const [fid, ids] of groups) {
    const scope = ids.length === lists.length ? 'TODAS las listas' : `solo las listas con id: ${ids.join(', ')}`;
    out.push(`Opciones válidas (${scope}):\n${fields[fid].options.map((o) => `- ${o.label}`).join('\n')}`);
  }
  if (without.length > 0) out.push(`Listas SIN campo Cliente (deja cliente vacío): ${without.join(', ')}`);
  return out.join('\n\n');
}

// Cliente propuesto por la IA, validado contra las opciones REALES del campo de la lista elegida:
// si no coincide exactamente con una opción (o la lista no tiene el campo), queda vacío.
function pickClient(
  structure: Awaited<ReturnType<typeof getStructure>>,
  listId: string,
  text: string
): { clientOptionId: string; clientName: string } {
  const f = clientFieldForList(structure, listId);
  const opt = f ? matchClientOption(f.options, text) : null;
  return { clientOptionId: opt?.id ?? '', clientName: opt?.label ?? '' };
}

// Bloque {alias_clientes}: solo los clientes con nombres alternativos o con listas habituales en este espacio.
function clientCardsPrompt(
  clients: ClientWithServices[],
  spaceId: string,
  lists: { id: string; name: string; folder?: string | null }[]
): string {
  const listName = new Map(lists.map((l) => [l.id, `${l.folder ? `${l.folder} / ` : ''}${l.name}`]));
  const out: string[] = [];
  for (const c of clients) {
    const usual = c.usualSpaceId === spaceId ? c.usualListIds.filter((id) => listName.has(id)) : [];
    if (c.aliases.length === 0 && usual.length === 0) continue;
    const lines = [`- ${c.clickupOptionLabel ?? c.name}`];
    if (c.aliases.length > 0) lines.push(`  también se le llama: ${c.aliases.join(', ')}`);
    if (usual.length > 0) lines.push(`  listas habituales en este espacio: ${usual.map((id) => `${id} (${listName.get(id)})`).join('; ')}`);
    out.push(lines.join('\n'));
  }
  return out.join('\n') || '- (ninguno)';
}

async function doConversion(
  note: OpsNote,
  tenantId: string,
  conn: { token: string; workspaceId: string | null },
  prompt: NotePrompt,
  step: (s: string) => Promise<void>,
  ctl: { cancelled: boolean }
) {
  await step('Leyendo las listas del espacio (caché)…');
  // Listas y miembros salen de la caché de la base de datos: convertir una nota NO llama a ClickUp.
  const structure = await getStructure(tenantId);
  const members = structure.members.map((m) => ({ id: Number(m.id), username: m.username }));
  const lists = structure.spaces.find((s) => s.id === note.clickupSpaceId)?.lists ?? [];
  if (lists.length === 0) {
    throw new Error(
      'No hay listas de ese espacio en la caché. Comprueba en Ajustes que el espacio está seleccionado y pulsa «Actualizar desde ClickUp».'
    );
  }

  const workTypes = await getWorkTypeOptions(tenantId);
  const [clients, levels, allServices] = await Promise.all([
    listClients(tenantId),
    getLevels(tenantId),
    getServices(tenantId)
  ]);
  const services = allServices.filter((s) => s.active);
  const validTypes = new Set(workTypes.map((t) => t.key));
  const today = new Intl.DateTimeFormat('es-ES', { timeZone: OPS_TIMEZONE, dateStyle: 'full' }).format(
    new Date()
  );
  const userPrompt = fillTemplate(prompt.user_prompt_template, {
    fecha_hoy: today,
    espacio: note.clickupSpaceName ?? note.clickupSpaceId!,
    responsable_seleccionado: note.assigneeName ?? 'ninguno',
    // Quien lleva las operaciones (el dueño del token de ClickUp): sus tareas propias le van siempre a él.
    yo: structure.meUsername ?? 'ninguno',
    listas: lists
      .map((l) => `- id: ${l.id} | nombre: ${l.folder ? `${l.folder} / ` : ''}${l.name}`)
      .join('\n'),
    miembros: members.map((m) => `- ${m.username}`).join('\n') || '- (sin datos)',
    clientes: clientOptionsPrompt(lists, structure.clientFields),
    tipos: workTypes.map((t) => `- ${t.key}: ${t.label}`).join('\n'),
    alias_clientes: clientCardsPrompt(clients, note.clickupSpaceId!, lists),
    servicios: services.map((s) => `- ${s.key}: ${s.label}`).join('\n') || '- (ninguno)',
    fichas: await profilesForPrompt(tenantId, new Map(structure.members.map((m) => [m.id, m.username]))),
    nota: note.content.trim()
  });

  await step(`Preparando encargos con IA… (${lists.length} listas, ${note.content.trim().length} caracteres)`);
  let response;
  try {
    response = await callAI({
      tenantId,
      function: 'ops_note_to_requests',
      promptKey: NOTE_PROMPT_KEY,
      maxTokens: CONVERT_MAX_TOKENS,
      messages: [
        { role: 'system', content: prompt.system_prompt },
        { role: 'user', content: userPrompt }
      ]
    });
  } catch (e) {
    throw new Error(`La IA falló: ${e instanceof Error ? e.message : 'error desconocido'}`);
  }

  await step('Revisando la respuesta de la IA…');
  let parsed;
  try {
    parsed = aiResponseSchema.parse(extractJsonFromLLMResponse(response.content));
  } catch {
    // Sin la llave de cierre final, la respuesta se cortó por el límite de tokens.
    const cut = !response.content.trim().endsWith('}');
    throw new Error(
      cut
        ? 'La respuesta de la IA se cortó (la nota genera demasiados encargos para un solo intento). Divide la nota en dos e inténtalo de nuevo.'
        : 'La IA no devolvió un JSON válido. Inténtalo de nuevo.'
    );
  }

  const validListIds = new Set(lists.map((l) => l.id));
  const byName = new Map(members.map((m) => [m.username.trim().toLowerCase(), m]));

  // Quien lleva las operaciones (dueño del token): sus tareas propias le van SIEMPRE a él,
  // aunque el responsable seleccionado sea otra persona (ver isOwnTask en format.ts).
  const me = structure.meId
    ? { id: structure.meId, username: structure.meUsername ?? '' }
    : null;

  const validServiceKeys = new Set(services.map((s) => s.key));
  const serviceLabel = new Map(allServices.map((s) => [s.key, s.label]));
  const levelLabel = new Map(levels.map((l) => [l.key, l.label]));
  const memberNames = new Map(members.map((m) => [String(m.id), m.username]));
  const allOptions = Object.values(structure.clientFields).flatMap((f) => f.options);
  const usualLists = (c: ClientWithServices) =>
    c.usualSpaceId === note.clickupSpaceId ? c.usualListIds.filter((id) => validListIds.has(id)) : [];

  const items: ProposalItem[] = parsed.encargos.map((e) => {
    const own = Boolean(me && isOwnTask(e.titulo));
    const proposed = byName.get(e.responsable.trim().toLowerCase());
    const serviceKey = validServiceKeys.has(e.servicio.trim()) ? e.servicio.trim() : '';
    const priority = e.prioridad >= 1 && e.prioridad <= 4 ? Math.round(e.prioridad) : 3;

    // Cliente: la IA identifica, el código decide. 1) la opción que dijo la IA (o un nombre/alias suyo),
    // 2) si no, nombres o alias dentro del encargo, 3) si no, dentro de la nota (solo si sale uno).
    const aiOption = matchClientOption(allOptions, e.cliente);
    const client =
      (aiOption ? clients.find((c) => c.clickupOptionId === aiOption.id) : null) ??
      findClientByName(clients, e.cliente) ??
      findClientInText(clients, `${e.titulo} ${e.resultado_esperado}`) ??
      findClientInText(clients, note.content) ??
      null;

    // Lista: la que dijo la IA; si no hay, la primera lista habitual del cliente en este espacio.
    const listId = validListIds.has(e.lista_id) ? e.lista_id : (client ? usualLists(client)[0] : undefined) ?? '';
    const clientFields = client?.clickupOptionId
      ? validClient(structure, listId, client.clickupOptionId)
      : { clientOptionId: null, clientName: null };
    const pickedClient = client
      ? { clientOptionId: clientFields.clientOptionId ?? '', clientName: clientFields.clientName ?? '' }
      : pickClient(structure, listId, e.cliente);

    // Responsable (prioridad): tarea propia → persona nombrada en la nota (o responsable elegido) →
    // responsable habitual del cliente para ese servicio → propuesta de la IA con las fichas del Equipo.
    let assigneeId = note.assigneeClickupId ?? '';
    let assigneeName = note.assigneeName ?? '';
    let assigneeReason = '';
    if (own && me) {
      assigneeId = me.id;
      assigneeName = me.username;
    } else {
      const habitual = serviceKey
        ? client?.services.find((s) => s.serviceKey === serviceKey)?.responsibleClickupId
        : null;
      const explicit = proposed && (Boolean(note.assigneeClickupId) || !e.motivo_responsable.trim());
      if (explicit) {
        assigneeId = String(proposed.id);
        assigneeName = proposed.username;
      } else if (!note.assigneeClickupId && habitual && memberNames.has(habitual)) {
        assigneeId = habitual;
        assigneeName = memberNames.get(habitual)!;
        assigneeReason = `Responsable habitual de ${serviceLabel.get(serviceKey) ?? serviceKey} para ${client!.name}.`;
      } else if (proposed) {
        assigneeId = String(proposed.id);
        assigneeName = proposed.username;
        // El motivo solo se muestra cuando no había responsable elegido y lo propuso la IA con las fichas.
        assigneeReason = !note.assigneeClickupId ? e.motivo_responsable.trim().slice(0, 200) : '';
      }
    }

    // Fecha: la de la nota manda; si no hay, el plazo del cliente en días laborables (no para tareas propias).
    let dueDate = /^\d{4}-\d{2}-\d{2}$/.test(e.fecha) ? e.fecha : '';
    let dueReason = '';
    if (!dueDate && client && !own) {
      const days = clientDeliveryDays(client, levels);
      if (days != null) {
        dueDate = addWorkingDays(days, client.workDays, OPS_TIMEZONE);
        dueReason = `Plazo de ${client.name} (nivel ${levelLabel.get(client.level) ?? client.level}): ${days} día${days === 1 ? '' : 's'} laborable${days === 1 ? '' : 's'}.`;
      }
    }

    return {
      key: randomUUID(),
      title: e.titulo.trim(),
      description: buildDescription(e),
      missingData: e.datos_que_faltan,
      listId,
      assigneeId,
      assigneeName,
      assigneeReason,
      dueDate,
      dueReason,
      priority,
      ...pickedClient,
      clientWarning: client && !client.active ? 'Este cliente está desactivado' : '',
      serviceKey,
      workTypeKey: validTypes.has(e.tipo_trabajo.trim()) ? e.tipo_trabajo.trim() : '',
      requiresReview: false
    };
  });

  if (ctl.cancelled) return;
  await setConversionState(note.id, { state: 'done', items, notConverted: parsed.no_convertido });
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

  // Solo listas reales del espacio de la nota, leídas de la caché (sin llamar a ClickUp).
  const structure = await getStructure(user.tenantId);
  const lists = structure.spaces.find((s) => s.id === note.clickupSpaceId)?.lists ?? [];
  const listNames = new Map(lists.map((l) => [l.id, l.name]));
  const bad = items.find((i) => !listNames.has(i.listId));
  if (bad) return { ok: false, error: `La lista elegida para «${bad.title}» no es del espacio de la nota` };

  const typeKeys = await Promise.all(items.map((i) => validWorkTypeKey(user.tenantId, i.workTypeKey)));

  // 1) Todos los encargos se guardan primero como pendiente_clickup, vinculados a la nota…
  const rows = await db
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
