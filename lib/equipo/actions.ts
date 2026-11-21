'use server';
// Acciones del Equipo humano + IA (21 nov 2026): foto o avatar de personas y agentes, y departamento de cada persona.
// Foto de una persona: administración, o la propia persona en su ficha. Foto de un agente y departamentos: solo admin.
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { agtAgentAvatars, agtAgents, agtDepartments, opsTeamAvatars, opsTeamProfiles } from '@/lib/db/schema';
import { checkPermission } from '@/lib/auth/permissions';
import { parseAvatar } from '@/lib/equipo/avatar-rules';
import { publicError } from '@/lib/errors';

type Result = { ok: true; message: string } | { ok: false; message: string };
const UUID = /^[0-9a-f-]{36}$/i;
const done = (message: string): Result => {
  revalidatePath('/dashboard/equipo', 'layout');
  return { ok: true, message };
};

/** Sube o cambia la foto de una persona o de un agente. */
export async function setAvatar(kind: 'persona' | 'agente', id: string, dataUrl: string): Promise<Result> {
  const perm = await checkPermission('view');
  if (!perm.ok) return { ok: false, message: perm.error };
  if (!UUID.test(id) || (kind !== 'persona' && kind !== 'agente')) return { ok: false, message: 'Miembro no válido.' };
  const isAdmin = perm.roles.includes('admin') || perm.roles.includes('super_admin');
  const tenantId = perm.user.tenantId;
  const img = parseAvatar(dataUrl);
  if (!img.ok) return img;
  try {
    if (kind === 'persona') {
      const [p] = await db.select({ userId: opsTeamProfiles.userId }).from(opsTeamProfiles).where(and(eq(opsTeamProfiles.tenantId, tenantId), eq(opsTeamProfiles.id, id))).limit(1);
      if (!p) return { ok: false, message: 'No encuentro esa ficha.' };
      if (!isAdmin && p.userId !== perm.user.id) return { ok: false, message: 'Solo puedes cambiar tu propia foto.' };
      await db
        .insert(opsTeamAvatars)
        .values({ profileId: id, tenantId, mime: img.mime, data: img.data })
        .onConflictDoUpdate({ target: opsTeamAvatars.profileId, set: { mime: img.mime, data: img.data, updatedAt: new Date() } });
    } else {
      if (!isAdmin) return { ok: false, message: 'Solo administración puede cambiar la foto de un agente.' };
      const [a] = await db.select({ id: agtAgents.id }).from(agtAgents).where(and(eq(agtAgents.tenantId, tenantId), eq(agtAgents.id, id))).limit(1);
      if (!a) return { ok: false, message: 'No encuentro ese agente.' };
      await db
        .insert(agtAgentAvatars)
        .values({ agentId: id, tenantId, mime: img.mime, data: img.data })
        .onConflictDoUpdate({ target: agtAgentAvatars.agentId, set: { mime: img.mime, data: img.data, updatedAt: new Date() } });
    }
    return done('Foto guardada.');
  } catch (error) {
    return { ok: false, message: publicError(error, 'No se pudo guardar la foto.') };
  }
}

/** Quita la foto (vuelven las iniciales o el icono). */
export async function removeAvatar(kind: 'persona' | 'agente', id: string): Promise<Result> {
  const perm = await checkPermission('view');
  if (!perm.ok) return { ok: false, message: perm.error };
  if (!UUID.test(id)) return { ok: false, message: 'Miembro no válido.' };
  const isAdmin = perm.roles.includes('admin') || perm.roles.includes('super_admin');
  const tenantId = perm.user.tenantId;
  try {
    if (kind === 'persona') {
      const [p] = await db.select({ userId: opsTeamProfiles.userId }).from(opsTeamProfiles).where(and(eq(opsTeamProfiles.tenantId, tenantId), eq(opsTeamProfiles.id, id))).limit(1);
      if (!p) return { ok: false, message: 'No encuentro esa ficha.' };
      if (!isAdmin && p.userId !== perm.user.id) return { ok: false, message: 'Solo puedes cambiar tu propia foto.' };
      await db.delete(opsTeamAvatars).where(and(eq(opsTeamAvatars.tenantId, tenantId), eq(opsTeamAvatars.profileId, id)));
    } else {
      if (!isAdmin) return { ok: false, message: 'Solo administración puede cambiar la foto de un agente.' };
      await db.delete(agtAgentAvatars).where(and(eq(agtAgentAvatars.tenantId, tenantId), eq(agtAgentAvatars.agentId, id)));
    }
    return done('Foto quitada.');
  } catch (error) {
    return { ok: false, message: publicError(error, 'No se pudo quitar la foto.') };
  }
}

/** Cambia el departamento de una persona (organigrama). Vacío = sin departamento. */
export async function setPersonDepartment(profileId: string, departmentKey: string | null): Promise<Result> {
  const perm = await checkPermission('admin');
  if (!perm.ok) return { ok: false, message: perm.error };
  if (!UUID.test(profileId)) return { ok: false, message: 'Ficha no válida.' };
  const tenantId = perm.user.tenantId;
  const key = departmentKey?.trim() || null;
  try {
    if (key) {
      const [d] = await db.select({ key: agtDepartments.key }).from(agtDepartments).where(and(eq(agtDepartments.tenantId, tenantId), eq(agtDepartments.key, key))).limit(1);
      if (!d) return { ok: false, message: 'Ese departamento no existe.' };
    }
    const rows = await db
      .update(opsTeamProfiles)
      .set({ departmentKey: key, updatedAt: new Date() })
      .where(and(eq(opsTeamProfiles.tenantId, tenantId), eq(opsTeamProfiles.id, profileId)))
      .returning({ id: opsTeamProfiles.id });
    if (rows.length === 0) return { ok: false, message: 'No encuentro esa ficha.' };
    return done(key ? 'Departamento guardado.' : 'Sin departamento.');
  } catch (error) {
    return { ok: false, message: publicError(error, 'No se pudo guardar el departamento.') };
  }
}
