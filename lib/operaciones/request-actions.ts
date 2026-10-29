'use server';

import fs from 'fs';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { opsRequests } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { callAI, getPrompt } from '@/lib/ai/gateway';
import { extractJsonFromLLMResponse } from '@/lib/ai/parsers/json-extractor';
import { getClickUpToken } from '@/lib/operaciones/queries';
import {
  ClickUpError,
  createTask,
  findTaskByMarker,
  getListMembers,
  OPS_TIMEZONE,
  type ClickUpMember
} from '@/lib/operaciones/clickup';

const PREPARE_MAX_TOKENS = 2000;
const PREPARE_PROMPT_KEY = 'ops_prepare_request';

// ---------------------------------------------------------------------------
// Miembros de una lista (para el desplegable de responsable)
// ---------------------------------------------------------------------------

export async function getListMembersAction(
  listId: string
): Promise<{ ok: true; members: ClickUpMember[] } | { ok: false; error: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'No autenticado' };
  const conn = await getClickUpToken(user.tenantId);
  if (!conn) return { ok: false, error: 'Conecta ClickUp primero en Ajustes' };
  try {
    return { ok: true, members: await getListMembers(conn.token, listId) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudieron cargar los miembros' };
  }
}

// ---------------------------------------------------------------------------
// Preparar con IA
// ---------------------------------------------------------------------------

const preparedSchema = z.object({
  titulo: z.string().default(''),
  resultado_esperado: z.string().default(''),
  pasos: z.array(z.string()).default([]),
  criterios_aceptacion: z.array(z.string()).default([]),
  datos_que_faltan: z.array(z.string()).default([])
});

export type PreparedRequest = {
  title: string;
  description: string; // markdown listo para editar y enviar
  missingData: string[];
};

function fillTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? vars[key] : m));
}

function buildDescription(p: z.infer<typeof preparedSchema>): string {
  const parts: string[] = [];
  if (p.resultado_esperado.trim()) parts.push(`## Resultado esperado\n${p.resultado_esperado.trim()}`);
  if (p.pasos.length) parts.push(`## Pasos\n${p.pasos.map((s, i) => `${i + 1}. ${s}`).join('\n')}`);
  if (p.criterios_aceptacion.length)
    parts.push(`## Criterios de aceptación\n${p.criterios_aceptacion.map((c) => `- [ ] ${c}`).join('\n')}`);
  if (p.datos_que_faltan.length)
    parts.push(`## Datos que faltan\n${p.datos_que_faltan.map((q) => `- ${q}`).join('\n')}`);
  return parts.join('\n\n');
}

export async function prepareRequestWithAI(input: {
  title: string;
  request: string;
  listName: string;
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

  const userPrompt = fillTemplate(prompt.user_prompt_template, {
    fecha_hoy: today,
    lista: input.listName || 'sin especificar',
    titulo: input.title.trim() || 'sin título',
    peticion: request
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
        missingData: parsed.datos_que_faltan
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
  priority: z.number().int().min(1).max(4).nullable().default(null)
});

export type CreateRequestInput = z.input<typeof createSchema>;

export type SyncResult =
  | { ok: true; requestId: string; taskUrl: string; reused: boolean }
  | { ok: false; requestId: string; error: string };

// Solo desarrollo: fuerza un fallo para probar el reintento.
//  - "before": falla antes de llamar a ClickUp (no se crea nada).
//  - "after":  ClickUp CREA la tarea pero se pierde la confirmación; el
//              reintento debe encontrarla por su marca y no duplicarla.
// Se activa con la variable OPS_SIMULATE_FAILURE o, sin tocar la config de
// Docker, creando el archivo /tmp/ops-simulate-failure con ese valor dentro.
function simulatedFailure(): 'before' | 'after' | null {
  let mode = process.env.OPS_SIMULATE_FAILURE?.trim();
  if (!mode) {
    try {
      mode = fs.readFileSync('/tmp/ops-simulate-failure', 'utf8').trim();
    } catch {
      mode = undefined;
    }
  }
  return mode === 'before' || mode === 'after' ? mode : null;
}

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

async function syncToClickUp(
  requestId: string,
  tenantId: string,
  isRetry: boolean
): Promise<SyncResult> {
  const [row] = await db
    .select()
    .from(opsRequests)
    .where(and(eq(opsRequests.id, requestId), eq(opsRequests.tenantId, tenantId)))
    .limit(1);
  if (!row) return { ok: false, requestId, error: 'Encargo no encontrado' };

  if (row.status === 'creado' && row.clickupTaskUrl) {
    return { ok: true, requestId, taskUrl: row.clickupTaskUrl, reused: true };
  }

  const markFailed = async (message: string): Promise<SyncResult> => {
    await db
      .update(opsRequests)
      .set({ status: 'error_sync', errorMessage: message, updatedAt: new Date() })
      .where(eq(opsRequests.id, requestId));
    revalidatePath('/dashboard/operaciones/encargos');
    return { ok: false, requestId, error: message };
  };

  try {
    const conn = await getClickUpToken(tenantId);
    if (!conn) throw new Error('ClickUp no está conectado (falta el token en Ajustes)');

    const marker = `[kiju:${row.id}]`;

    // En un reintento, antes de crear nada se comprueba si la tarea ya existe
    // en la lista (p. ej. se creó pero no llegó la confirmación).
    let task: { id: string; url: string } | null = null;
    let reused = false;
    if (isRetry) {
      task = await findTaskByMarker(conn.token, row.clickupListId, marker);
      reused = Boolean(task);
    }

    if (!task) {
      const sim = simulatedFailure();
      if (sim === 'before') {
        throw new Error('Fallo simulado (modo desarrollo: antes de llamar a ClickUp)');
      }

      task = await createTask(conn.token, row.clickupListId, {
        name: row.title,
        description: `${row.preparedDescription}\n\n${marker}`,
        assigneeId: row.assigneeClickupId ? Number(row.assigneeClickupId) : null,
        dueDate: row.dueDate,
        priority: row.priority
      });

      if (sim === 'after') {
        throw new Error(
          'Fallo simulado (modo desarrollo: la tarea SÍ se creó en ClickUp pero se perdió la confirmación)'
        );
      }
    }

    // 2) Confirmado por ClickUp → se guarda id y URL y pasa a "creado".
    await db
      .update(opsRequests)
      .set({
        status: 'creado',
        clickupTaskId: task.id,
        clickupTaskUrl: task.url,
        errorMessage: null,
        syncedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(opsRequests.id, requestId));

    revalidatePath('/dashboard/operaciones/encargos');
    return { ok: true, requestId, taskUrl: task.url, reused };
  } catch (e) {
    const message =
      e instanceof ClickUpError || e instanceof Error ? e.message : 'Error desconocido al enviar a ClickUp';
    return markFailed(message);
  }
}
