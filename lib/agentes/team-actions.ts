'use server';

// Acciones de la pantalla Agentes → Equipo (dudas del equipo al jefe de Operaciones, 20 nov 2026). Solo admin.
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { db } from '@/lib/db/drizzle';
import { agtAgents } from '@/lib/db/schema';
import { ensureDefaultAgents, OPS_HEAD_KEY } from '@/lib/agentes/store';
import { saveTeamSettings, webAnswer, webApprove, webDiscard, type TeamSettings } from '@/lib/agentes/team';

type Res = { ok: true; message?: string } | { ok: false; error: string };
const refresh = () => revalidatePath('/dashboard/agentes/equipo');

/** Enciende o apaga al jefe de Operaciones y guarda sus ajustes. */
export async function saveTeamSettingsAction(input: { active: boolean; settings: Partial<TeamSettings> }): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    await ensureDefaultAgents(user.tenantId);
    await saveTeamSettings(user.tenantId, input.settings);
    await db.update(agtAgents).set({ active: Boolean(input.active), updatedAt: new Date() }).where(and(eq(agtAgents.tenantId, user.tenantId), eq(agtAgents.key, OPS_HEAD_KEY)));
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudieron guardar los ajustes') };
  }
}

export async function approveQuestionAction(id: string): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    const r = await webApprove(user.tenantId, id);
    refresh();
    return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.message };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo enviar') };
  }
}

export async function answerQuestionAction(id: string, text: string): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    const r = await webAnswer(user.tenantId, id, text);
    refresh();
    return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.message };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo enviar la respuesta') };
  }
}

export async function discardQuestionAction(id: string): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    const r = await webDiscard(user.tenantId, id);
    refresh();
    return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.message };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo descartar') };
  }
}
