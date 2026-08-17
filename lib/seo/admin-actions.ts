'use server';

import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import {
  seoKnowledgeCards,
  seoSettings,
  userRoles,
  roles,
  type NewSeoKnowledgeCard
} from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { validatedActionWithUser } from '@/lib/auth/middleware';

const ADMIN_ROLES = ['admin', 'super_admin'];

async function getAssignedTenantRoles(userId: number) {
  return db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(eq(userRoles.userId, userId), isNull(userRoles.projectId)));
}

async function assertSeoAdmin(userId: number) {
  const assignedRoles = await getAssignedTenantRoles(userId);

  const isAdmin = assignedRoles.some((r) => ADMIN_ROLES.includes(r.name));
  if (!isAdmin) {
    throw new Error('No autorizado: se requiere rol admin o super_admin');
  }
}

async function assertSuperAdmin(userId: number) {
  const assignedRoles = await getAssignedTenantRoles(userId);

  const isSuperAdmin = assignedRoles.some((r) => r.name === 'super_admin');
  if (!isSuperAdmin) {
    throw new Error('No autorizado: se requiere rol super_admin');
  }
}

export type ActionState = {
  error?: string;
  success?: string;
};

const cardSchema = z.object({
  stageKey: z.string().min(1, 'La etapa es obligatoria'),
  order: z.coerce.number().int(),
  title: z.string().min(1, 'El título es obligatorio').max(200),
  content: z.string().min(1, 'El contenido es obligatorio'),
  cardType: z.enum(['concept', 'tip', 'warning', 'tutor_reminder']),
  contextKey: z
    .string()
    .max(100)
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
});

export const createKnowledgeCard = validatedActionWithUser(
  cardSchema,
  async (data, _, user) => {
    await assertSeoAdmin(user.id);

    const newCard: NewSeoKnowledgeCard = data;
    await db.insert(seoKnowledgeCards).values(newCard);

    redirect('/dashboard/seo/admin/cards');
  }
);

const updateCardSchema = cardSchema.extend({
  id: z.string().min(1)
});

export const updateKnowledgeCard = validatedActionWithUser(
  updateCardSchema,
  async (data, _, user) => {
    await assertSeoAdmin(user.id);

    const { id, ...rest } = data;
    await db
      .update(seoKnowledgeCards)
      .set(rest)
      .where(eq(seoKnowledgeCards.id, id));

    redirect('/dashboard/seo/admin/cards');
  }
);

const deleteCardSchema = z.object({
  id: z.string().min(1)
});

export const deleteKnowledgeCard = validatedActionWithUser(
  deleteCardSchema,
  async (data, _, user) => {
    await assertSeoAdmin(user.id);

    await db.delete(seoKnowledgeCards).where(eq(seoKnowledgeCards.id, data.id));

    redirect('/dashboard/seo/admin/cards');
  }
);

export async function reorderKnowledgeCard(id: string, newOrder: number) {
  const user = await getUser();
  if (!user) {
    throw new Error('No autenticado');
  }
  await assertSeoAdmin(user.id);

  await db
    .update(seoKnowledgeCards)
    .set({ order: newOrder })
    .where(eq(seoKnowledgeCards.id, id));
}

export async function updateSeoSetting(key: string, value: string) {
  const user = await getUser();
  if (!user) {
    throw new Error('No autenticado');
  }
  await assertSuperAdmin(user.id);

  await db
    .update(seoSettings)
    .set({ value, updatedAt: new Date() })
    .where(eq(seoSettings.key, key));
}
