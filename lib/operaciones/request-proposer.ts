import 'server-only';

// «Texto → encargos propuestos»: la misma inteligencia para el Bloc de notas y para los correos del agente.
// La IA propone (prompt ops_note_to_requests) y el código valida y decide: lista real del espacio, cliente
// por alias, responsable (tarea propia → nombrado → habitual del cliente para el servicio → fichas del Equipo)
// y fecha por el plazo del cliente. Sale de la caché: NO llama a ClickUp.
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { callAI } from '@/lib/ai/gateway';
import { extractJsonFromLLMResponse } from '@/lib/ai/parsers/json-extractor';
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
import { getWorkTypeOptions } from '@/lib/operaciones/work-types';
import { clientFieldForList, getStructure, matchClientOption, validClient } from '@/lib/operaciones/structure';
import { buildDescription, fillTemplate, isOwnTask } from '@/lib/operaciones/format';
import { publicError } from '@/lib/errors';
import type { ProposalItem } from '@/lib/operaciones/note-types';

export const NOTE_PROMPT_KEY = 'ops_note_to_requests';
// Cada encargo ocupa ~400-600 tokens de salida: 8000 da para unos 12-15.
const CONVERT_MAX_TOKENS = 8000;

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

export type NotePrompt = { system_prompt: string; user_prompt_template: string };

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


export type ProposeInput = {
  text: string;
  spaceId: string;
  spaceName: string;
  assigneeClickupId: string | null;
  assigneeName: string | null;
};

export async function proposeRequests(
  tenantId: string,
  input: ProposeInput,
  prompt: NotePrompt,
  step: (s: string) => Promise<void> = async () => undefined
): Promise<{ items: ProposalItem[]; notConverted: string[] }> {
  await step('Leyendo las listas del espacio (caché)…');
  // Listas y miembros salen de la caché de la base de datos: convertir una nota NO llama a ClickUp.
  const structure = await getStructure(tenantId);
  const members = structure.members.map((m) => ({ id: Number(m.id), username: m.username }));
  const lists = structure.spaces.find((s) => s.id === input.spaceId)?.lists ?? [];
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
    espacio: input.spaceName,
    responsable_seleccionado: input.assigneeName ?? 'ninguno',
    // Quien lleva las operaciones (el dueño del token de ClickUp): sus tareas propias le van siempre a él.
    yo: structure.meUsername ?? 'ninguno',
    listas: lists
      .map((l) => `- id: ${l.id} | nombre: ${l.folder ? `${l.folder} / ` : ''}${l.name}`)
      .join('\n'),
    miembros: members.map((m) => `- ${m.username}`).join('\n') || '- (sin datos)',
    clientes: clientOptionsPrompt(lists, structure.clientFields),
    tipos: workTypes.map((t) => `- ${t.key}: ${t.label}`).join('\n'),
    alias_clientes: clientCardsPrompt(clients, input.spaceId, lists),
    servicios: services.map((s) => `- ${s.key}: ${s.label}`).join('\n') || '- (ninguno)',
    fichas: await profilesForPrompt(tenantId, new Map(structure.members.map((m) => [m.id, m.username]))),
    nota: input.text.trim()
  });

  await step(`Preparando encargos con IA… (${lists.length} listas, ${input.text.trim().length} caracteres)`);
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
    throw new Error(`La IA falló: ${publicError(e, 'error desconocido')}`);
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
    c.usualSpaceId === input.spaceId ? c.usualListIds.filter((id) => validListIds.has(id)) : [];

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
      findClientInText(clients, input.text) ??
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
    let assigneeId = input.assigneeClickupId ?? '';
    let assigneeName = input.assigneeName ?? '';
    let assigneeReason = '';
    if (own && me) {
      assigneeId = me.id;
      assigneeName = me.username;
    } else {
      const habitual = serviceKey
        ? client?.services.find((s) => s.serviceKey === serviceKey)?.responsibleClickupId
        : null;
      const explicit = proposed && (Boolean(input.assigneeClickupId) || !e.motivo_responsable.trim());
      if (explicit) {
        assigneeId = String(proposed.id);
        assigneeName = proposed.username;
      } else if (!input.assigneeClickupId && habitual && memberNames.has(habitual)) {
        assigneeId = habitual;
        assigneeName = memberNames.get(habitual)!;
        assigneeReason = `Responsable habitual de ${serviceLabel.get(serviceKey) ?? serviceKey} para ${client!.name}.`;
      } else if (proposed) {
        assigneeId = String(proposed.id);
        assigneeName = proposed.username;
        // El motivo solo se muestra cuando no había responsable elegido y lo propuso la IA con las fichas.
        assigneeReason = !input.assigneeClickupId ? e.motivo_responsable.trim().slice(0, 200) : '';
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


  return { items, notConverted: parsed.no_convertido };
}
