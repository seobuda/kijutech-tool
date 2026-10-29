'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { opsRequests } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { callAI, getPrompt } from '@/lib/ai/gateway';
import { extractJsonFromLLMResponse } from '@/lib/ai/parsers/json-extractor';
import { OPS_TIMEZONE } from '@/lib/operaciones/clickup';
import { syncToClickUp, type SyncResult } from '@/lib/operaciones/sync';
import { buildDescription, fillTemplate } from '@/lib/operaciones/format';
import { clientFieldForList, getStructure, matchClientOption, validClient } from '@/lib/operaciones/structure';

const PREPARE_MAX_TOKENS = 2000;
const PREPARE_PROMPT_KEY = 'ops_prepare_request';

// ---------------------------------------------------------------------------
// Preparar con IA
// ---------------------------------------------------------------------------

const preparedSchema = z.object({
  titulo: z.string().default(''),
  resultado_esperado: z.string().default(''),
  pasos: z.array(z.string()).default([]),
  criterios_aceptacion: z.array(z.string()).default([]),
  datos_que_faltan: z.array(z.string()).default([]),
  cliente: z.string().default('')
});

export type PreparedRequest = {
  title: string;
  description: string; // markdown listo para editar y enviar
  missingData: string[];
  clientOptionId: string; // '' = la IA no encontró un cliente claro (o la lista no tiene el campo)
};

export async function prepareRequestWithAI(input: {
  title: string;
  request: string;
  listName: string;
  listId?: string;
}): Promise<{ ok: true; prepared: PreparedRequest } | { ok: false; error: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'No autenticado' };

  const request = input.request.trim();
  if (!request) return { ok: false, error: 'Escribe primero la petición en texto libre' };

  const prompt = await getPrompt(PREPARE_PROMPT_KEY);
  if (!prompt) {
    return {
      ok: false,
      error: `El prompt "${PREPARE_PROMPT_KEY}" no existe o está desactivado (IA & Modelos → Prompts)`
    };
  }

  const today = new Intl.DateTimeFormat('es-ES', {
    timeZone: OPS_TIMEZONE,
    dateStyle: 'full'
  }).format(new Date());

  // Opciones reales del campo "Cliente" de la lista de destino (de la caché).
  const clientField = input.listId ? clientFieldForList(await getStructure(user.tenantId), input.listId) : null;

  const userPrompt = fillTemplate(prompt.user_prompt_template, {
    fecha_hoy: today,
    lista: input.listName || 'sin especificar',
    titulo: input.title.trim() || 'sin título',
    peticion: request,
    clientes: clientField
      ? clientField.options.map((o) => `- ${o.label}`).join('\n')
      : '(esta lista no tiene campo Cliente: deja cliente vacío)'
  });

  let response;
  try {
    response = await callAI({
      tenantId: user.tenantId,
      function: 'ops_prepare_request',
      promptKey: PREPARE_PROMPT_KEY,
      maxTokens: PREPARE_MAX_TOKENS,
      messages: [
        { role: 'system', content: prompt.system_prompt },
        { role: 'user', content: userPrompt }
      ]
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'La llamada a la IA falló' };
  }

  try {
    const parsed = preparedSchema.parse(extractJsonFromLLMResponse(response.content));
    return {
      ok: true,
      prepared: {
        title: parsed.titulo.trim() || input.title.trim(),
        description: buildDescription(parsed),
        missingData: parsed.datos_que_faltan,
        clientOptionId: (clientField && matchClientOption(clientField.options, parsed.cliente)?.id) || ''
      }
    };
  } catch {
    return { ok: false, error: 'La IA no devolvió un JSON válido. Inténtalo de nuevo.' };
  }
}

// ---------------------------------------------------------------------------
// Crear encargo + envío a ClickUp
// ---------------------------------------------------------------------------

const createSchema = z.object({
  listId: z.string().min(1, 'Elige una lista de destino'),
  listName: z.string().default(''),
  title: z.string().trim().min(1, 'El título es obligatorio').max(500),
  request: z.string().trim().min(1, 'La petición es obligatoria'),
  // Vacío = no se usó "Preparar con IA": se toma la petición original.
  preparedDescription: z.string().default(''),
  assigneeId: z.string().nullable().default(null),
  assigneeName: z.string().nullable().default(null),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  priority: z.number().int().min(1).max(4).nullable().default(null),
  clientOptionId: z.string().default('')
});

export type CreateRequestInput = z.input<typeof createSchema>;

export async function createRequest(
  raw: CreateRequestInput
): Promise<SyncResult | { ok: false; requestId?: undefined; error: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'No autenticado' };

  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };
  const d = parsed.data;

  // 1) Se guarda SIEMPRE primero, como pendiente_clickup.
  const [row] = await db
    .insert(opsRequests)
    .values({
      tenantId: user.tenantId,
      createdBy: user.id,
      clickupListId: d.listId,
      clickupListName: d.listName || null,
      title: d.title,
      originalRequest: d.request,
      preparedDescription: d.preparedDescription.trim() || d.request,
      assigneeClickupId: d.assigneeId,
      assigneeName: d.assigneeName,
      dueDate: d.dueDate,
      priority: d.priority,
      ...validClient(await getStructure(user.tenantId), d.listId, d.clientOptionId),
      status: 'pendiente_clickup'
    })
    .returning({ id: opsRequests.id });

  revalidatePath('/dashboard/operaciones/encargos');
  return syncToClickUp(row.id, user.tenantId, false);
}

export async function retryRequest(requestId: string): Promise<SyncResult> {
  const user = await getUser();
  if (!user) return { ok: false, requestId, error: 'No autenticado' };
  return syncToClickUp(requestId, user.tenantId, true);
}
