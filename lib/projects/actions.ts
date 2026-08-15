'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { projects, type NewProject } from '@/lib/db/schema';
import { validatedActionWithUser } from '@/lib/auth/middleware';

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
