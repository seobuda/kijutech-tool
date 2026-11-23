'use server';

import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import {
  clients,
  projectModules,
  projects,
  userRoles,
  type NewProject
} from '@/lib/db/schema';
import { validatedActionWithUser } from '@/lib/auth/middleware';
import { getUser, getUserTenantRoleNames } from '@/lib/db/queries';
import { primaryDomainOf, setProjectScope } from '@/lib/projects/scope';

const MANAGE_PROJECT_ROLES = ['admin', 'super_admin'];

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

// Cimientos (23 nov 2026): un proyecto pertenece SIEMPRE a un cliente y elige su alcance (webs, Search Console,
// fichas…) de entre las cuentas de ese cliente. Un cliente puede tener varios proyectos.
const createProjectSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(200),
  clientId: z.string().uuid('Elige el cliente del proyecto'),
  service: z.enum(['seo', 'ads', 'web', 'otro']).default('seo'),
  monthlyHours: z.preprocess(emptyToUndefined, z.coerce.number().min(0).max(1000).optional()),
  location: z.preprocess(emptyToUndefined, z.string().max(255).optional()),
  // Cuentas del alcance, separadas por comas (el formulario las junta en un campo oculto).
  assets: z.preprocess(emptyToUndefined, z.string().max(4000).optional())
});

const assetList = (v?: string) => (v ?? '').split(',').map((x) => x.trim()).filter((x) => /^[0-9a-f-]{36}$/i.test(x));

async function clientOf(tenantId: string, clientId: string) {
  const [c] = await db.select({ id: clients.id, name: clients.name }).from(clients).where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId))).limit(1);
  return c ?? null;
}

export const createProject = validatedActionWithUser(
  createProjectSchema,
  async (data, _, user) => {
    const client = await clientOf(user.tenantId, data.clientId);
    if (!client) return { error: 'Cliente no encontrado' };
    const newProject: NewProject = {
      tenantId: user.tenantId,
      name: data.name,
      clientId: client.id,
      // Nombre del cliente también en texto: lo leen pantallas antiguas del SEO de agosto.
      clientName: client.name,
      service: data.service,
      monthlyHours: data.monthlyHours === undefined ? null : String(data.monthlyHours),
      location: data.location ?? null,
      createdBy: user.id
    };
    const [row] = await db.insert(projects).values(newProject).returning({ id: projects.id });
    await setProjectScope(user.tenantId, row.id, assetList(data.assets));
    const domain = await primaryDomainOf(user.tenantId, row.id);
    if (domain) await db.update(projects).set({ domain }).where(eq(projects.id, row.id));

    redirect('/dashboard/projects');
  },
  'edit'
);

const updateProjectSchema = createProjectSchema.extend({
  id: z.string().min(1)
});

export const updateProject = validatedActionWithUser(
  updateProjectSchema,
  async (data, _, user) => {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, data.id))
      .limit(1);

    if (!project || project.tenantId !== user.tenantId) {
      return { error: 'Proyecto no encontrado' };
    }
    const client = await clientOf(user.tenantId, data.clientId);
    if (!client) return { error: 'Cliente no encontrado' };

    await db
      .update(projects)
      .set({
        name: data.name,
        clientId: client.id,
        clientName: client.name,
        service: data.service,
        monthlyHours: data.monthlyHours === undefined ? null : String(data.monthlyHours),
        location: data.location ?? null,
        updatedAt: new Date()
      })
      .where(eq(projects.id, data.id));
    await setProjectScope(user.tenantId, data.id, assetList(data.assets));
    const domain = await primaryDomainOf(user.tenantId, data.id);
    await db.update(projects).set({ domain }).where(eq(projects.id, data.id));

    redirect('/dashboard/projects');
  },
  'edit'
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
