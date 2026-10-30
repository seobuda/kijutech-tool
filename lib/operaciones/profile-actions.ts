'use server';

// Acciones web de la sección «Equipo»: crear, editar, desactivar y borrar fichas, y el botón
// «Rellenar con IA» (propone los campos; nunca guarda por su cuenta).
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { opsTeamProfileWorkTypes, opsTeamProfiles, opsWorkTypes } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { callAI, getPrompt } from '@/lib/ai/gateway';
import { extractJsonFromLLMResponse } from '@/lib/ai/parsers/json-extractor';
import { fillTemplate } from '@/lib/operaciones/format';
import { isValidTimezone } from '@/lib/operaciones/notifications';
import { getStructure } from '@/lib/operaciones/structure';
import {
  canManageProfiles,
  DEFAULT_TEAM_TIMEZONE,
  OWNER_TIMEZONE,
  type WorkTypeRole
} from '@/lib/operaciones/team-profiles';

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

const refresh = () => {
  revalidatePath('/dashboard/operaciones/equipo');
  revalidatePath('/dashboard/operaciones/telegram');
};

export type ProfileInput = {
  id: string | null;
  name: string;
  clickupUserId: string; // '' = sin miembro de ClickUp vinculado
  jobTitle: string;
  description: string;
  notes: string;
  workDays: number[];
  workStart: string;
  hoursPerDay: number;
  timezone: string;
  // Comida y silencio (HH:MM; vacío = sin hueco): en ese hueco no se le envía nada.
  lunchStart: string;
  lunchEnd: string;
  quietStart: string;
  quietEnd: string;
  urgentBypassQuiet: boolean;
  active: boolean;
  workTypes: { key: string; role: WorkTypeRole }[];
};

export async function saveProfile(input: ProfileInput): Promise<Ok<{ id: string }>> {
  try {
    const user = await requireManager();
    const name = input.name.trim();
    if (!name) return { ok: false, error: 'El nombre es obligatorio' };
    if (!isValidTimezone(input.timezone)) {
      return { ok: false, error: 'Zona horaria no válida (ej.: America/Santo_Domingo, Europe/Madrid)' };
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.workStart)) {
      return { ok: false, error: 'La hora de entrada debe tener formato HH:MM (ej.: 09:00)' };
    }
    if (!(input.hoursPerDay > 0 && input.hoursPerDay <= 24)) {
      return { ok: false, error: 'Las horas por día deben estar entre 0,5 y 24' };
    }
    const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
    for (const [label, a, b] of [
      ['La comida', input.lunchStart, input.lunchEnd],
      ['El silencio', input.quietStart, input.quietEnd]
    ] as const) {
      if (!a && !b) continue;
      if (!hhmm.test(a) || !hhmm.test(b) || a === b) return { ok: false, error: `${label}: indica la hora de inicio y la de fin (distintas, formato HH:MM) o deja ambas vacías` };
    }
    const days = [...new Set(input.workDays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort();
    if (days.length === 0) return { ok: false, error: 'Marca al menos un día laborable' };

    let clickupUserId: string | null = null;
    if (input.clickupUserId) {
      const structure = await getStructure(user.tenantId);
      if (!structure.members.some((m) => m.id === input.clickupUserId)) {
        return { ok: false, error: 'Ese miembro de ClickUp no existe (actualiza desde ClickUp en Ajustes)' };
      }
      clickupUserId = input.clickupUserId;
      const [dup] = await db
        .select({ id: opsTeamProfiles.id, name: opsTeamProfiles.name })
        .from(opsTeamProfiles)
        .where(and(eq(opsTeamProfiles.tenantId, user.tenantId), eq(opsTeamProfiles.clickupUserId, clickupUserId)))
        .limit(1);
      if (dup && dup.id !== input.id) {
        return { ok: false, error: `Ese miembro de ClickUp ya está vinculado a la ficha de ${dup.name}` };
      }
    }

    const validKeys = new Set(
      (await db.select({ key: opsWorkTypes.key }).from(opsWorkTypes).where(eq(opsWorkTypes.tenantId, user.tenantId))).map(
        (t) => t.key
      )
    );
    const types = new Map<string, WorkTypeRole>();
    for (const t of input.workTypes) {
      if (validKeys.has(t.key) && (t.role === 'primary' || t.role === 'support')) types.set(t.key, t.role);
    }

    const values = {
      name: name.slice(0, 255),
      clickupUserId,
      jobTitle: input.jobTitle.trim().slice(0, 150) || null,
      description: input.description.trim() || null,
      notes: input.notes.trim() || null,
      workDays: days.join(','),
      workStart: input.workStart,
      hoursPerDay: String(input.hoursPerDay),
      timezone: input.timezone,
      lunchStart: input.lunchStart || null,
      lunchEnd: input.lunchEnd || null,
      quietStart: input.quietStart || null,
      quietEnd: input.quietEnd || null,
      urgentBypassQuiet: input.urgentBypassQuiet,
      active: input.active,
      updatedAt: new Date()
    };

    const id = await db.transaction(async (tx) => {
      let profileId = input.id;
      if (profileId) {
        const res = await tx
          .update(opsTeamProfiles)
          .set(values)
          .where(and(eq(opsTeamProfiles.id, profileId), eq(opsTeamProfiles.tenantId, user.tenantId)))
          .returning({ id: opsTeamProfiles.id });
        if (res.length === 0) throw new Error('La ficha no existe');
      } else {
        const [row] = await tx
          .insert(opsTeamProfiles)
          .values({ ...values, tenantId: user.tenantId })
          .returning({ id: opsTeamProfiles.id });
        profileId = row.id;
      }
      await tx.delete(opsTeamProfileWorkTypes).where(eq(opsTeamProfileWorkTypes.profileId, profileId));
      if (types.size > 0) {
        await tx
          .insert(opsTeamProfileWorkTypes)
          .values([...types].map(([workTypeKey, role]) => ({ profileId: profileId!, workTypeKey, role })));
      }
      return profileId;
    });
    refresh();
    return { ok: true, id };
  } catch (e) {
    return fail(e, 'No se pudo guardar la ficha');
  }
}

// Ficha nueva para un miembro de ClickUp que aún no la tiene.
export async function createProfileForMember(clickupUserId: string): Promise<Ok<{ id: string }>> {
  try {
    const user = await requireManager();
    const structure = await getStructure(user.tenantId);
    const m = structure.members.find((x) => x.id === clickupUserId);
    if (!m) return { ok: false, error: 'Miembro de ClickUp no encontrado' };
    const [row] = await db
      .insert(opsTeamProfiles)
      .values({
        tenantId: user.tenantId,
        clickupUserId: m.id,
        name: m.username,
        timezone: m.id === structure.meId ? OWNER_TIMEZONE : DEFAULT_TEAM_TIMEZONE
      })
      .onConflictDoNothing()
      .returning({ id: opsTeamProfiles.id });
    refresh();
    return { ok: true, id: row?.id ?? '' };
  } catch (e) {
    return fail(e, 'No se pudo crear la ficha');
  }
}

export async function setProfileActive(id: string, active: boolean): Promise<Ok> {
  try {
    const user = await requireManager();
    await db
      .update(opsTeamProfiles)
      .set({ active, updatedAt: new Date() })
      .where(and(eq(opsTeamProfiles.id, id), eq(opsTeamProfiles.tenantId, user.tenantId)));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo cambiar el estado');
  }
}

export async function deleteProfile(id: string): Promise<Ok> {
  try {
    const user = await requireManager();
    await db.delete(opsTeamProfiles).where(and(eq(opsTeamProfiles.id, id), eq(opsTeamProfiles.tenantId, user.tenantId)));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo eliminar la ficha');
  }
}

// --- Rellenar con IA -------------------------------------------------------------------------

const PROFILE_PROMPT_KEY = 'ops_profile_fill';

const aiProfileSchema = z.object({
  nombre: z.string().default(''),
  miembro_clickup: z.string().default(''),
  puesto: z.string().default(''),
  descripcion: z.string().default(''),
  tipos_principales: z.array(z.string()).default([]),
  tipos_apoyo: z.array(z.string()).default([]),
  dias: z.array(z.coerce.number()).default([]),
  hora_entrada: z.string().default(''),
  horas_dia: z.coerce.number().default(0),
  zona_horaria: z.string().default(''),
  notas: z.string().default('')
});

// Propuesta de la IA ya validada contra datos reales (tipos y miembros existentes). Los campos que la
// IA no pudo deducir vienen como null: la pantalla no toca lo que ya tenía el formulario.
export type ProfileDraft = {
  name: string | null;
  clickupUserId: string | null;
  jobTitle: string | null;
  description: string | null;
  notes: string | null;
  workDays: number[] | null;
  workStart: string | null;
  hoursPerDay: number | null;
  timezone: string | null;
  workTypes: { key: string; role: WorkTypeRole }[] | null;
};

export async function aiFillProfile(text: string): Promise<Ok<{ draft: ProfileDraft }>> {
  try {
    const user = await requireManager();
    const clean = text.trim();
    if (clean.length < 10) return { ok: false, error: 'Escribe o graba algo más de la persona (mínimo una frase).' };
    if (clean.length > 12000) return { ok: false, error: 'El texto es demasiado largo (máximo 12.000 caracteres).' };

    const prompt = await getPrompt(PROFILE_PROMPT_KEY);
    if (!prompt) return { ok: false, error: `El prompt «${PROFILE_PROMPT_KEY}» no está activo (IA & Modelos).` };

    const structure = await getStructure(user.tenantId);
    const types = await db
      .select()
      .from(opsWorkTypes)
      .where(and(eq(opsWorkTypes.tenantId, user.tenantId), eq(opsWorkTypes.active, true)));
    const validKeys = new Set(types.map((t) => t.key));

    const userPrompt = fillTemplate(prompt.user_prompt_template, {
      tipos: types.map((t) => `- ${t.key}: ${t.label}`).join('\n'),
      miembros: structure.members.map((m) => `- ${m.username}`).join('\n') || '- (sin datos)',
      texto: clean
    });

    let response;
    try {
      response = await callAI({
        tenantId: user.tenantId,
        function: 'ops_profile_fill',
        promptKey: PROFILE_PROMPT_KEY,
        maxTokens: 1500,
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
      p = aiProfileSchema.parse(extractJsonFromLLMResponse(response.content));
    } catch {
      return { ok: false, error: 'La IA no devolvió un JSON válido. Inténtalo de nuevo.' };
    }

    const member = structure.members.find((m) => m.username.trim().toLowerCase() === p.miembro_clickup.trim().toLowerCase());
    const roles = new Map<string, WorkTypeRole>();
    for (const k of p.tipos_apoyo) if (validKeys.has(k.trim())) roles.set(k.trim(), 'support');
    for (const k of p.tipos_principales) if (validKeys.has(k.trim())) roles.set(k.trim(), 'primary');
    const days = [...new Set(p.dias.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort();
    const orNull = (s: string) => (s.trim() ? s.trim() : null);

    return {
      ok: true,
      draft: {
        name: orNull(p.nombre),
        clickupUserId: member?.id ?? null,
        jobTitle: orNull(p.puesto),
        description: orNull(p.descripcion),
        notes: orNull(p.notas),
        workDays: days.length ? days : null,
        workStart: /^([01]\d|2[0-3]):[0-5]\d$/.test(p.hora_entrada.trim()) ? p.hora_entrada.trim() : null,
        hoursPerDay: p.horas_dia > 0 && p.horas_dia <= 24 ? p.horas_dia : null,
        timezone: isValidTimezone(p.zona_horaria.trim()) && p.zona_horaria.trim() ? p.zona_horaria.trim() : null,
        workTypes: roles.size ? [...roles].map(([key, role]) => ({ key, role })) : null
      }
    };
  } catch (e) {
    return fail(e, 'No se pudo rellenar con IA');
  }
}
