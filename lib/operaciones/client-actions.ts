'use server';

// Acciones web de la sección «Clientes»: crear, editar, desactivar y borrar fichas, niveles y servicios,
// y el botón «Rellenar con IA» (propone los campos; nunca guarda por su cuenta).
import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import {
  opsClientLevels,
  opsClientServices,
  opsClients,
  opsServices,
  type OpsClientTool
} from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { callAI, getPrompt } from '@/lib/ai/gateway';
import { extractJsonFromLLMResponse } from '@/lib/ai/parsers/json-extractor';
import { fillTemplate } from '@/lib/operaciones/format';
import { getStructure } from '@/lib/operaciones/structure';
import { canManageProfiles } from '@/lib/operaciones/team-profiles';
import { getLevels, getServices, requestCountsByOption } from '@/lib/operaciones/clients';
import { getMonthWork, runActivityNow, type MonthWorkItem } from '@/lib/operaciones/client-activity';

type Ok<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (e: unknown, fallback: string): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof Error ? e.message : fallback
});

async function requireManager() {
  const user = await getUser();
  if (!user || !canManageProfiles(user)) throw new Error('No autenticado');
  return user;
}

const refresh = () => revalidatePath('/dashboard/operaciones/clientes');

export type ClientInput = {
  id: string | null;
  name: string;
  aliases: string[];
  clickupOptionId: string; // '' = sin vincular
  usualSpaceId: string;
  usualListIds: string[];
  level: string;
  deliveryDays: number | null; // null = el del nivel
  inactivityDays: number | null; // null = el del nivel
  planningDays: number | null; // null = el del nivel; 0 = desactivado
  alertsEnabled: boolean;
  monthlyHours: number | null;
  workDays: number[]; // vacío = lunes a viernes
  tools: OpsClientTool[];
  business: string;
  offerings: string;
  area: string;
  audience: string;
  goals: string;
  strategy: string;
  notes: string;
  active: boolean;
  services: { key: string; responsibleClickupId: string }[];
};

// Las herramientas no pueden llevar contraseñas (decisión del usuario): se rechaza algo que lo parezca.
const SECRET_RE = /(contrase[ñn]a|password|passwd|pwd|clave de acceso)\s*[:=]/i;

type StructureLike = Awaited<ReturnType<typeof getStructure>>;

function clientOptions(structure: StructureLike): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of Object.values(structure.clientFields)) for (const o of f.options) m.set(o.id, o.label);
  return m;
}

export async function saveClient(input: ClientInput): Promise<Ok<{ id: string }>> {
  try {
    const user = await requireManager();
    const name = input.name.trim();
    if (!name) return { ok: false, error: 'El nombre es obligatorio' };

    const [levels, services, structure] = await Promise.all([
      getLevels(user.tenantId),
      getServices(user.tenantId),
      getStructure(user.tenantId)
    ]);
    if (!levels.some((l) => l.key === input.level)) return { ok: false, error: 'El nivel elegido no existe' };
    if (input.deliveryDays != null && !(Number.isInteger(input.deliveryDays) && input.deliveryDays >= 0 && input.deliveryDays <= 60)) {
      return { ok: false, error: 'El plazo debe ser un número entero de días entre 0 y 60' };
    }
    if (input.monthlyHours != null && !(input.monthlyHours >= 0 && input.monthlyHours <= 1000)) {
      return { ok: false, error: 'Las horas al mes deben estar entre 0 y 1000' };
    }

    // Opción de ClickUp: tiene que existir y no estar vinculada a otra ficha.
    let optionId: string | null = null;
    let optionLabel: string | null = null;
    if (input.clickupOptionId) {
      optionLabel = clientOptions(structure).get(input.clickupOptionId) ?? null;
      if (!optionLabel) return { ok: false, error: 'Esa opción del campo Cliente no existe (actualiza desde ClickUp en Ajustes)' };
      optionId = input.clickupOptionId;
      const [dup] = await db
        .select({ id: opsClients.id, name: opsClients.name })
        .from(opsClients)
        .where(and(eq(opsClients.tenantId, user.tenantId), eq(opsClients.clickupOptionId, optionId)))
        .limit(1);
      if (dup && dup.id !== input.id) {
        return { ok: false, error: `Esa opción de ClickUp ya está vinculada a la ficha «${dup.name}»` };
      }
    }

    // Espacio y listas habituales: reales y de ese espacio.
    let spaceId: string | null = null;
    let listIds: string[] = [];
    if (input.usualSpaceId) {
      const space = structure.spaces.find((s) => s.id === input.usualSpaceId);
      if (!space) return { ok: false, error: 'El espacio habitual no existe' };
      spaceId = space.id;
      const valid = new Set(space.lists.map((l) => l.id));
      listIds = [...new Set(input.usualListIds.filter((id) => valid.has(id)))];
    }

    const aliases = [...new Set(input.aliases.map((a) => a.trim()).filter(Boolean))].map((a) => a.slice(0, 120)).slice(0, 30);
    const tools = input.tools
      .map((t) => ({ name: t.name.trim().slice(0, 100), url: t.url.trim().slice(0, 500), note: t.note.trim().slice(0, 300) }))
      .filter((t) => t.name || t.url);
    if (tools.some((t) => SECRET_RE.test(`${t.name} ${t.url} ${t.note}`))) {
      return { ok: false, error: 'En webs y herramientas no se guardan contraseñas: quítalas del texto.' };
    }

    const serviceKeys = new Set(services.map((s) => s.key));
    const memberIds = new Set(structure.members.map((m) => m.id));
    const svc = new Map<string, string | null>();
    for (const s of input.services) {
      if (!serviceKeys.has(s.key)) continue;
      svc.set(s.key, s.responsibleClickupId && memberIds.has(s.responsibleClickupId) ? s.responsibleClickupId : null);
    }

    const days = [...new Set(input.workDays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort();
    const okDays = (n: number | null, min: number, max: number) => n === null || (Number.isInteger(n) && n >= min && n <= max);
    if (!okDays(input.inactivityDays, 1, 90)) return { ok: false, error: 'Los días sin actividad deben estar entre 1 y 90' };
    if (!okDays(input.planningDays, 0, 60)) return { ok: false, error: 'El horizonte de trabajo planificado debe estar entre 0 y 60 días (0 = desactivado)' };
    const orNull = (s: string) => (s.trim() ? s.trim() : null);
    const values = {
      name: name.slice(0, 255),
      aliases,
      clickupOptionId: optionId,
      clickupOptionLabel: optionLabel,
      usualSpaceId: spaceId,
      usualListIds: listIds,
      level: input.level,
      deliveryDays: input.deliveryDays,
      inactivityDays: input.inactivityDays,
      planningDays: input.planningDays,
      alertsEnabled: input.alertsEnabled,
      monthlyHours: input.monthlyHours != null ? String(input.monthlyHours) : null,
      // L–V o vacío = lunes a viernes (null).
      workDays: days.length > 0 && days.join(',') !== '1,2,3,4,5' ? days.join(',') : null,
      tools,
      business: orNull(input.business),
      offerings: orNull(input.offerings),
      area: orNull(input.area)?.slice(0, 255) ?? null,
      audience: orNull(input.audience),
      goals: orNull(input.goals),
      strategy: orNull(input.strategy),
      notes: orNull(input.notes),
      active: input.active,
      updatedAt: new Date()
    };

    const id = await db.transaction(async (tx) => {
      let clientId = input.id;
      if (clientId) {
        const res = await tx
          .update(opsClients)
          .set(values)
          .where(and(eq(opsClients.id, clientId), eq(opsClients.tenantId, user.tenantId)))
          .returning({ id: opsClients.id });
        if (res.length === 0) throw new Error('La ficha no existe');
      } else {
        const [row] = await tx
          .insert(opsClients)
          .values({ ...values, tenantId: user.tenantId })
          .returning({ id: opsClients.id });
        clientId = row.id;
      }
      await tx.delete(opsClientServices).where(eq(opsClientServices.clientId, clientId));
      if (svc.size > 0) {
        await tx
          .insert(opsClientServices)
          .values([...svc].map(([serviceKey, responsibleClickupId]) => ({ clientId: clientId!, serviceKey, responsibleClickupId })));
      }
      return clientId;
    });
    refresh();
    return { ok: true, id };
  } catch (e) {
    return fail(e, 'No se pudo guardar la ficha');
  }
}

export async function setClientActive(id: string, active: boolean): Promise<Ok> {
  try {
    const user = await requireManager();
    await db
      .update(opsClients)
      .set({ active, updatedAt: new Date() })
      .where(and(eq(opsClients.id, id), eq(opsClients.tenantId, user.tenantId)));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo cambiar el estado');
  }
}

// Solo se borra una ficha sin encargos; si los tiene, hay que desactivarla.
export async function deleteClient(id: string): Promise<Ok> {
  try {
    const user = await requireManager();
    const [c] = await db
      .select()
      .from(opsClients)
      .where(and(eq(opsClients.id, id), eq(opsClients.tenantId, user.tenantId)))
      .limit(1);
    if (!c) return { ok: false, error: 'La ficha no existe' };
    if (c.clickupOptionId) {
      const n = (await requestCountsByOption(user.tenantId)).get(c.clickupOptionId) ?? 0;
      if (n > 0) return { ok: false, error: `Tiene ${n} encargo${n === 1 ? '' : 's'}: no se puede eliminar, desactívala.` };
    }
    await db.delete(opsClients).where(eq(opsClients.id, id));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo eliminar la ficha');
  }
}

// Crea una ficha (solo nombre y vinculación) por cada opción del campo Cliente que aún no la tiene.
export async function importMissingClients(): Promise<Ok<{ created: number }>> {
  try {
    const user = await requireManager();
    const structure = await getStructure(user.tenantId);
    const linked = new Set(
      (
        await db
          .select({ o: opsClients.clickupOptionId })
          .from(opsClients)
          .where(eq(opsClients.tenantId, user.tenantId))
      ).map((r) => r.o)
    );
    const missing = [...clientOptions(structure)].filter(([id]) => !linked.has(id));
    if (missing.length > 0) {
      await db
        .insert(opsClients)
        .values(missing.map(([id, label]) => ({ tenantId: user.tenantId, name: label, clickupOptionId: id, clickupOptionLabel: label })))
        .onConflictDoNothing();
    }
    refresh();
    return { ok: true, created: missing.length };
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
    const user = await requireManager();
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
    const user = await requireManager();
    const used = await db
      .select({ id: opsClients.id })
      .from(opsClients)
      .where(and(eq(opsClients.tenantId, user.tenantId), eq(opsClients.level, key)));
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
    const user = await requireManager();
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
    const user = await requireManager();
    const ids = (await db.select({ id: opsClients.id }).from(opsClients).where(eq(opsClients.tenantId, user.tenantId))).map((c) => c.id);
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

// --- Rellenar con IA --------------------------------------------------------------------------

const CLIENT_PROMPT_KEY = 'ops_client_fill';

const aiClientSchema = z.object({
  nombre: z.string().default(''),
  nombres_alternativos: z.array(z.string()).default([]),
  nivel: z.string().default(''),
  plazo_dias: z.coerce.number().nullable().default(null),
  servicios: z.array(z.object({ servicio: z.string().default(''), responsable: z.string().default('') })).default([]),
  horas_mes: z.coerce.number().default(0),
  dias_trabajo: z.array(z.coerce.number()).default([]),
  herramientas: z.array(z.object({ nombre: z.string().default(''), url: z.string().default(''), nota: z.string().default('') })).default([]),
  negocio: z.string().default(''),
  productos_servicios: z.string().default(''),
  zona: z.string().default(''),
  publico: z.string().default(''),
  objetivos: z.string().default(''),
  estrategia: z.string().default(''),
  notas: z.string().default('')
});

// Propuesta ya validada contra datos reales. Lo que la IA no pudo deducir viene como null.
export type ClientDraft = {
  name: string | null;
  aliases: string[] | null;
  level: string | null;
  deliveryDays: number | null;
  services: { key: string; responsibleClickupId: string }[] | null;
  monthlyHours: number | null;
  workDays: number[] | null;
  tools: OpsClientTool[] | null;
  business: string | null;
  offerings: string | null;
  area: string | null;
  audience: string | null;
  goals: string | null;
  strategy: string | null;
  notes: string | null;
};

export async function aiFillClient(text: string, currentName: string): Promise<Ok<{ draft: ClientDraft }>> {
  try {
    const user = await requireManager();
    const clean = text.trim();
    if (clean.length < 10) return { ok: false, error: 'Escribe o graba algo más del cliente (mínimo una frase).' };
    if (clean.length > 12000) return { ok: false, error: 'El texto es demasiado largo (máximo 12.000 caracteres).' };

    const prompt = await getPrompt(CLIENT_PROMPT_KEY);
    if (!prompt) return { ok: false, error: `El prompt «${CLIENT_PROMPT_KEY}» no está activo (IA & Modelos).` };

    const [levels, services, structure] = await Promise.all([
      getLevels(user.tenantId),
      getServices(user.tenantId),
      getStructure(user.tenantId)
    ]);
    const activeServices = services.filter((s) => s.active);
    const userPrompt = fillTemplate(prompt.user_prompt_template, {
      cliente_actual: currentName.trim() || '(sin nombre todavía)',
      niveles: levels.map((l) => `- ${l.key}: ${l.label} (plazo por defecto ${l.defaultDays} días)`).join('\n'),
      servicios: activeServices.map((s) => `- ${s.key}: ${s.label}`).join('\n') || '- (ninguno)',
      miembros: structure.members.map((m) => `- ${m.username}`).join('\n') || '- (sin datos)',
      texto: clean
    });

    let response;
    try {
      response = await callAI({
        tenantId: user.tenantId,
        function: 'ops_client_fill',
        promptKey: CLIENT_PROMPT_KEY,
        maxTokens: 2500,
        messages: [
          { role: 'system', content: prompt.system_prompt },
          { role: 'user', content: userPrompt }
        ]
      });
    } catch (e) {
      return { ok: false, error: `La IA falló: ${e instanceof Error ? e.message : 'error desconocido'}` };
    }
    let p;
    try {
      p = aiClientSchema.parse(extractJsonFromLLMResponse(response.content));
    } catch {
      return { ok: false, error: 'La IA no devolvió un JSON válido. Inténtalo de nuevo.' };
    }

    const validServices = new Set(activeServices.map((s) => s.key));
    const byName = new Map(structure.members.map((m) => [m.username.trim().toLowerCase(), m.id]));
    const svc = new Map<string, string>();
    for (const s of p.servicios) {
      const key = s.servicio.trim();
      if (validServices.has(key)) svc.set(key, byName.get(s.responsable.trim().toLowerCase()) ?? '');
    }
    const level = levels.find((l) => l.key === p.nivel.trim())?.key ?? null;
    const days = [...new Set(p.dias_trabajo.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort();
    const tools = p.herramientas
      .map((t) => ({ name: t.nombre.trim().slice(0, 100), url: t.url.trim().slice(0, 500), note: t.nota.trim().slice(0, 300) }))
      .filter((t) => (t.name || t.url) && !SECRET_RE.test(`${t.name} ${t.url} ${t.note}`));
    const orNull = (s: string) => (s.trim() ? s.trim() : null);
    const aliases = [...new Set(p.nombres_alternativos.map((a) => a.trim()).filter(Boolean))];

    return {
      ok: true,
      draft: {
        name: orNull(p.nombre),
        aliases: aliases.length ? aliases : null,
        level,
        deliveryDays: p.plazo_dias != null && Number.isInteger(p.plazo_dias) && p.plazo_dias >= 0 && p.plazo_dias <= 60 ? p.plazo_dias : null,
        services: svc.size ? [...svc].map(([key, responsibleClickupId]) => ({ key, responsibleClickupId })) : null,
        monthlyHours: p.horas_mes > 0 && p.horas_mes <= 1000 ? p.horas_mes : null,
        workDays: days.length ? days : null,
        tools: tools.length ? tools : null,
        business: orNull(p.negocio),
        offerings: orNull(p.productos_servicios),
        area: orNull(p.zona),
        audience: orNull(p.publico),
        goals: orNull(p.objetivos),
        strategy: orNull(p.estrategia),
        notes: orNull(p.notas)
      }
    };
  } catch (e) {
    return fail(e, 'No se pudo rellenar con IA');
  }
}

// --- Actividad y trabajo del mes (paso 6D) ------------------------------------------------------

// Botón «Recalcular ahora»: misma pasada que la nocturna.
export async function recalcClientActivity(): Promise<Ok<{ message: string }>> {
  try {
    const user = await requireManager();
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
    const user = await requireManager();
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
