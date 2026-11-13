'use server';

// Acciones web de Operaciones sobre los clientes (14 nov 2026: la ficha está en el núcleo, lib/core/client-actions.ts):
//   - Ajustes de Operaciones de un cliente: ClickUp, espacio y listas, nivel, plazo, servicios, alertas, horas y días.
//   - Crear fichas para las opciones del campo «Cliente» de ClickUp que aún no la tienen.
//   - Niveles y servicios (catálogos).
//   - «Rellenar con IA»: texto o audio → propuesta de la ficha completa con vista previa; nada se guarda hasta «Aplicar».
import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import { clients as coreClients, opsClientLevels, opsClientServices, opsClients, opsServices } from '@/lib/db/schema';
import { checkPermission, requirePermission, type Permission } from '@/lib/auth/permissions';
import { callAI, getPrompt } from '@/lib/ai/gateway';
import { extractJsonFromLLMResponse } from '@/lib/ai/parsers/json-extractor';
import { fillTemplate } from '@/lib/operaciones/format';
import { getStructure } from '@/lib/operaciones/structure';
import { getLevels, getServices, listClients, DEFAULT_LEVEL } from '@/lib/operaciones/clients';
import { getMonthWork, runActivityNow, type MonthWorkItem } from '@/lib/operaciones/client-activity';
import { replaceServices, upsertOpsSettings, type OpsSettingsInput } from '@/lib/operaciones/client-ops';
import { applyClientPlan, loadTarget, planClientChange, planLines, type AgentClientInput, type PlanLine } from '@/lib/operaciones/client-write';
import { ClientError } from '@/lib/core/clients';
import { publicError } from '@/lib/errors';

type Ok<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (e: unknown, fallback: string): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof ClientError ? e.userMessage : publicError(e, fallback)
});

async function requireManager(permission: Permission = 'edit') {
  return requirePermission(permission);
}

const refresh = (id?: string) => {
  revalidatePath('/dashboard/clientes');
  if (id) revalidatePath(`/dashboard/clientes/${id}`);
};

// --- Ajustes de Operaciones de un cliente -------------------------------------------------------------------------

export type ClientOpsInput = {
  clickupOptionId: string; // '' = sin vincular
  usualSpaceId: string;
  usualListIds: string[];
  level: string;
  deliveryDays: number | null;
  inactivityDays: number | null;
  planningDays: number | null;
  alertsEnabled: boolean;
  monthlyHours: number | null;
  workDays: number[];
  services: { key: string; responsibleClickupId: string }[];
};

export async function saveClientOps(clientId: string, input: ClientOpsInput): Promise<Ok> {
  try {
    const user = await requireManager('edit');
    const settings: OpsSettingsInput = {
      clickupOptionId: input.clickupOptionId,
      usualSpaceId: input.usualSpaceId,
      usualListIds: input.usualListIds,
      level: input.level,
      deliveryDays: input.deliveryDays,
      inactivityDays: input.inactivityDays,
      planningDays: input.planningDays,
      alertsEnabled: input.alertsEnabled,
      monthlyHours: input.monthlyHours,
      workDays: input.workDays
    };
    await upsertOpsSettings(user.tenantId, clientId, settings);
    await replaceServices(user.tenantId, clientId, input.services.map((s) => ({ key: s.key, responsibleClickupId: s.responsibleClickupId || null })));
    refresh(clientId);
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudieron guardar los ajustes de Operaciones');
  }
}

// Crea una ficha (núcleo + ajustes con la vinculación) por cada opción del campo Cliente que aún no la tiene.
export async function importMissingClients(): Promise<Ok<{ created: number }>> {
  try {
    const user = await requireManager('edit');
    const structure = await getStructure(user.tenantId);
    const all = await listClients(user.tenantId);
    const linked = new Set(all.map((c) => c.clickupOptionId).filter(Boolean));
    const names = new Set(all.map((c) => c.name.trim().toLowerCase()));
    const options = new Map<string, string>();
    for (const f of Object.values(structure.clientFields)) for (const o of f.options) options.set(o.id, o.label);
    let created = 0;
    for (const [id, label] of options) {
      if (linked.has(id)) continue;
      // Si ya hay una ficha con ese nombre sin vincular, se vincula en vez de duplicarla.
      const existing = all.find((c) => !c.clickupOptionId && c.name.trim().toLowerCase() === label.trim().toLowerCase());
      if (existing) {
        await upsertOpsSettings(user.tenantId, existing.id, { clickupOptionId: id });
        continue;
      }
      if (names.has(label.trim().toLowerCase())) continue;
      const [row] = await db.insert(coreClients).values({ tenantId: user.tenantId, name: label.slice(0, 255), status: 'activo' }).returning({ id: coreClients.id });
      await db.insert(opsClients).values({ id: row.id, tenantId: user.tenantId, level: DEFAULT_LEVEL, clickupOptionId: id, clickupOptionLabel: label }).onConflictDoNothing();
      names.add(label.trim().toLowerCase());
      created++;
    }
    refresh();
    return { ok: true, created };
  } catch (e) {
    return fail(e, 'No se pudieron crear las fichas');
  }
}

// --- Niveles y servicios (catálogos editables) ------------------------------------------------

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);

export async function saveLevel(input: {
  key: string | null;
  label: string;
  defaultDays: number;
  inactivityDays: number;
  planningDays: number;
}): Promise<Ok> {
  try {
    const user = await requireManager('admin');
    const label = input.label.trim().slice(0, 60);
    if (!label) return { ok: false, error: 'El nombre del nivel es obligatorio' };
    if (!(Number.isInteger(input.defaultDays) && input.defaultDays >= 0 && input.defaultDays <= 60)) {
      return { ok: false, error: 'El plazo debe ser un número entero de días entre 0 y 60' };
    }
    if (!(Number.isInteger(input.inactivityDays) && input.inactivityDays >= 1 && input.inactivityDays <= 90)) {
      return { ok: false, error: 'Los días sin actividad deben estar entre 1 y 90' };
    }
    if (!(Number.isInteger(input.planningDays) && input.planningDays >= 0 && input.planningDays <= 60)) {
      return { ok: false, error: 'El horizonte de trabajo planificado debe estar entre 0 y 60 días (0 = desactivado)' };
    }
    if (input.key) {
      const res = await db
        .update(opsClientLevels)
        .set({ label, defaultDays: input.defaultDays, inactivityDays: input.inactivityDays, planningDays: input.planningDays })
        .where(and(eq(opsClientLevels.tenantId, user.tenantId), eq(opsClientLevels.key, input.key)))
        .returning({ id: opsClientLevels.id });
      if (res.length === 0) return { ok: false, error: 'El nivel no existe' };
    } else {
      const key = slug(label);
      if (!key) return { ok: false, error: 'Pon un nombre con letras o números' };
      const levels = await getLevels(user.tenantId);
      if (levels.some((l) => l.key === key)) return { ok: false, error: 'Ya hay un nivel con ese nombre' };
      await db
        .insert(opsClientLevels)
        .values({
          tenantId: user.tenantId,
          key,
          label,
          defaultDays: input.defaultDays,
          inactivityDays: input.inactivityDays,
          planningDays: input.planningDays,
          sortOrder: levels.length + 1
        });
    }
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo guardar el nivel');
  }
}

export async function deleteLevel(key: string): Promise<Ok> {
  try {
    const user = await requireManager('admin');
    const used = await db
      .select({ id: opsClients.id })
      .from(opsClients)
      .where(and(eq(opsClients.tenantId, user.tenantId), eq(opsClients.level, key)));
    // (Un cliente sin ajustes guardados usa el nivel por defecto: no bloquea el borrado de otro nivel.)
    if (used.length > 0) return { ok: false, error: `${used.length} cliente(s) tienen este nivel: cámbiales el nivel primero.` };
    const levels = await getLevels(user.tenantId);
    if (levels.length <= 1) return { ok: false, error: 'Tiene que quedar al menos un nivel' };
    await db.delete(opsClientLevels).where(and(eq(opsClientLevels.tenantId, user.tenantId), eq(opsClientLevels.key, key)));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo eliminar el nivel');
  }
}

export async function saveService(input: { key: string | null; label: string; active: boolean }): Promise<Ok> {
  try {
    const user = await requireManager('admin');
    const label = input.label.trim().slice(0, 100);
    if (!label) return { ok: false, error: 'El nombre del servicio es obligatorio' };
    if (input.key) {
      const res = await db
        .update(opsServices)
        .set({ label, active: input.active })
        .where(and(eq(opsServices.tenantId, user.tenantId), eq(opsServices.key, input.key)))
        .returning({ id: opsServices.id });
      if (res.length === 0) return { ok: false, error: 'El servicio no existe' };
    } else {
      const key = slug(label);
      if (!key) return { ok: false, error: 'Pon un nombre con letras o números' };
      const services = await getServices(user.tenantId);
      if (services.some((s) => s.key === key)) return { ok: false, error: 'Ya hay un servicio con ese nombre' };
      await db.insert(opsServices).values({ tenantId: user.tenantId, key, label, sortOrder: services.length + 1 });
    }
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo guardar el servicio');
  }
}

export async function deleteService(key: string): Promise<Ok> {
  try {
    const user = await requireManager('admin');
    const ids = (await db.select({ id: coreClients.id }).from(coreClients).where(eq(coreClients.tenantId, user.tenantId))).map((c) => c.id);
    const used =
      ids.length === 0
        ? []
        : await db
            .select({ id: opsClientServices.id })
            .from(opsClientServices)
            .where(and(eq(opsClientServices.serviceKey, key), inArray(opsClientServices.clientId, ids)));
    if (used.length > 0) return { ok: false, error: `${used.length} cliente(s) lo tienen contratado: quítaselo primero (o desactívalo).` };
    await db.delete(opsServices).where(and(eq(opsServices.tenantId, user.tenantId), eq(opsServices.key, key)));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo eliminar el servicio');
  }
}

// --- Rellenar con IA (ficha completa) -----------------------------------------------------------------------------

const CLIENT_PROMPT_KEY = 'ops_client_fill';

export type ClientProposal = { mode: 'crear' | 'editar'; name: string; input: AgentClientInput; lines: PlanLine[]; warnings: string[] };

/**
 * Texto (o transcripción de un audio) → propuesta de la ficha completa con su vista previa. No guarda nada.
 * `clientId` = la ficha que se está editando (null = cliente nuevo).
 */
export async function aiProposeClient(text: string, clientId: string | null): Promise<Ok<{ proposal: ClientProposal }>> {
  try {
    const user = await requireManager('edit');
    const clean = text.trim();
    if (clean.length < 10) return { ok: false, error: 'Escribe o graba algo más del cliente (mínimo una frase).' };
    if (clean.length > 12000) return { ok: false, error: 'El texto es demasiado largo (máximo 12.000 caracteres).' };
    const prompt = await getPrompt(CLIENT_PROMPT_KEY);
    if (!prompt) return { ok: false, error: `El prompt «${CLIENT_PROMPT_KEY}» no está activo (IA & Modelos).` };
    const target = clientId ? await loadTarget(user.tenantId, clientId) : null;
    if (clientId && !target) return { ok: false, error: 'La ficha no existe' };

    const [levels, services, structure] = await Promise.all([getLevels(user.tenantId), getServices(user.tenantId), getStructure(user.tenantId)]);
    const userPrompt = fillTemplate(prompt.user_prompt_template, {
      cliente_actual: target ? target.sheet.client.name : '(cliente nuevo)',
      niveles: levels.map((l) => `- ${l.key}: ${l.label} (plazo por defecto ${l.defaultDays} días)`).join('\n'),
      servicios: services.filter((s) => s.active).map((s) => `- ${s.key}: ${s.label}`).join('\n') || '- (ninguno)',
      miembros: structure.members.map((m) => `- ${m.username}`).join('\n') || '- (sin datos)',
      texto: clean
    });
    let response;
    try {
      response = await callAI({
        tenantId: user.tenantId,
        function: 'ops_client_fill',
        promptKey: CLIENT_PROMPT_KEY,
        maxTokens: 4000,
        messages: [
          { role: 'system', content: prompt.system_prompt },
          { role: 'user', content: userPrompt }
        ]
      });
    } catch (e) {
      return { ok: false, error: `La IA falló: ${publicError(e, 'error desconocido')}` };
    }
    let input: AgentClientInput;
    try {
      const raw = extractJsonFromLLMResponse(response.content);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('no es un objeto');
      input = raw as AgentClientInput;
    } catch {
      return { ok: false, error: 'La IA no devolvió un JSON válido. Inténtalo de nuevo.' };
    }
    if (target) input.nombre = input.nombre || target.sheet.client.name;
    const withContract = (await checkPermission('admin')).ok;
    const res = await planClientChange(user.tenantId, target ? 'editar' : 'crear', input, target, { withContract });
    if ('error' in res) return { ok: false, error: res.error };
    return { ok: true, proposal: { mode: res.plan.mode, name: res.plan.name, input, lines: planLines(res.plan, levels), warnings: res.plan.warnings } };
  } catch (e) {
    return fail(e, 'No se pudo rellenar con IA');
  }
}

/** Aplica una propuesta: se vuelve a validar en el servidor (lo que llega del navegador no se da por bueno). */
export async function applyClientProposal(input: AgentClientInput, clientId: string | null): Promise<Ok<{ id: string; problems: string[] }>> {
  try {
    const user = await requireManager('edit');
    const target = clientId ? await loadTarget(user.tenantId, clientId) : null;
    if (clientId && !target) return { ok: false, error: 'La ficha no existe' };
    const withContract = (await checkPermission('admin')).ok;
    const res = await planClientChange(user.tenantId, target ? 'editar' : 'crear', input, target, { withContract });
    if ('error' in res) return { ok: false, error: res.error };
    const applied = await applyClientPlan(user.tenantId, res.plan, user.id);
    if (!applied.ok) return { ok: false, error: applied.text };
    refresh(applied.id);
    return { ok: true, id: applied.id, problems: applied.problems };
  } catch (e) {
    return fail(e, 'No se pudo aplicar la propuesta');
  }
}

// --- Actividad y trabajo del mes (paso 6D) ------------------------------------------------------

// Botón «Recalcular ahora»: misma pasada que la nocturna.
export async function recalcClientActivity(): Promise<Ok<{ message: string }>> {
  try {
    const user = await requireManager('edit');
    const r = await runActivityNow(user.tenantId);
    refresh();
    return {
      ok: true,
      message: `Actividad recalculada: ${r.clients} clientes, ${r.tasks} tareas leídas en ${r.requests} ${r.requests === 1 ? 'petición' : 'peticiones'}${r.truncated ? ' (la consulta se cortó: hay demasiadas tareas)' : ''}.`
    };
  } catch (e) {
    return fail(e, 'No se pudo recalcular la actividad');
  }
}

export type MonthWork = { label: string; items: MonthWorkItem[]; cleaned: MonthWorkItem[]; truncated: boolean };

// «Trabajo de este mes»: tareas completadas del cliente en el mes actual o el anterior.
export async function getClientMonthWork(clientId: string, month: 'current' | 'previous'): Promise<Ok<{ work: MonthWork }>> {
  try {
    const user = await requireManager('view');
    const [c] = await db
      .select({ clickupOptionId: opsClients.clickupOptionId })
      .from(opsClients)
      .where(and(eq(opsClients.id, clientId), eq(opsClients.tenantId, user.tenantId)))
      .limit(1);
    if (!c) return { ok: false, error: 'La ficha no existe' };
    if (!c.clickupOptionId) return { ok: false, error: 'Este cliente no está vinculado a una opción de ClickUp' };
    return { ok: true, work: await getMonthWork(user.tenantId, c, month === 'previous' ? -1 : 0) };
  } catch (e) {
    return fail(e, 'No se pudo cargar el trabajo del mes');
  }
}
