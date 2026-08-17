'use server';

import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import {
  projectModules,
  projects,
  userRoles,
  type NewProject
} from '@/lib/db/schema';
import { validatedActionWithUser } from '@/lib/auth/middleware';
import { getUser, getUserTenantRoleNames } from '@/lib/db/queries';

const MANAGE_PROJECT_ROLES = ['admin', 'super_admin'];

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

const createProjectSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(200),
  clientName: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
  domain: z.preprocess(emptyToUndefined, z.string().max(255).optional())
});

export const createProject = validatedActionWithUser(
  createProjectSchema,
  async (data, _, user) => {
    const { name, clientName, domain } = data;

    const newProject: NewProject = {
      tenantId: user.tenantId,
      name,
      clientName: clientName ?? null,
      domain: domain ?? null,
      createdBy: user.id
    };

    await db.insert(projects).values(newProject);

    redirect('/dashboard/projects');
  }
);

async function assertCanManageProject(projectId: string) {
  const user = await getUser();
  if (!user) {
    throw new Error('No autenticado');
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    throw new Error('Proyecto no encontrado');
  }

  if (project.tenantId !== user.tenantId) {
    throw new Error('No autorizado: el proyecto no pertenece a tu tenant');
  }

  const roleNames = await getUserTenantRoleNames(user.id);
  if (!roleNames.some((r) => MANAGE_PROJECT_ROLES.includes(r))) {
    throw new Error('No autorizado: se requiere rol admin o super_admin');
  }

  return project;
}

export async function archiveProject(projectId: string) {
  await assertCanManageProject(projectId);

  await db
    .update(projects)
    .set({ status: 'archived' })
    .where(eq(projects.id, projectId));
}

export async function restoreProject(projectId: string) {
  await assertCanManageProject(projectId);

  await db
    .update(projects)
    .set({ status: 'active' })
    .where(eq(projects.id, projectId));
}

export async function deleteProjectPermanently(
  projectId: string,
  confirmationText: string
) {
  const project = await assertCanManageProject(projectId);

  if (project.status !== 'archived') {
    throw new Error(
      'Solo se pueden borrar permanentemente proyectos archivados'
    );
  }

  if (confirmationText !== 'BORRAR') {
    throw new Error('Confirmación incorrecta');
  }

  await db.transaction(async (tx) => {
    await tx.delete(userRoles).where(eq(userRoles.projectId, projectId));
    await tx
      .delete(projectModules)
      .where(eq(projectModules.projectId, projectId));
    await tx.delete(projects).where(eq(projects.id, projectId));
  });
}
