'use server';

import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import { roles, userRoles, users } from '@/lib/db/schema';
import { hashPassword } from '@/lib/auth/session';
import { ROLE_NAMES } from '@/lib/auth/permissions';
import { validatedActionWithUser } from '@/lib/auth/middleware';

const createUserSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(100),
  email: z.string().trim().toLowerCase().email('Correo no válido').max(255),
  password: z.string().min(12, 'La contraseña debe tener al menos 12 caracteres').max(100),
  role: z.enum(ROLE_NAMES as [string, ...string[]], { message: 'Rol no válido' })
});

// Solo super_admin (se comprueba en el servidor dentro de validatedActionWithUser). El usuario
// nuevo nace en la misma cuenta (tenant) que quien lo crea: la cuenta nunca se elige desde el formulario.
export const createUserAction = validatedActionWithUser(
  createUserSchema,
  async (data, _formData, admin) => {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);
    if (existing) return { error: 'Ya existe un usuario con ese correo', name: data.name, email: data.email };

    const [role] = await db.select().from(roles).where(eq(roles.name, data.role)).limit(1);
    if (!role) return { error: 'Rol no válido', name: data.name, email: data.email };

    const passwordHash = await hashPassword(data.password);
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({ tenantId: admin.tenantId, name: data.name, email: data.email, passwordHash, role: 'member' })
        .returning({ id: users.id });
      await tx.insert(userRoles).values({ userId: created.id, roleId: role.id });
    });

    revalidatePath('/dashboard/usuarios');
    return { success: `Usuario ${data.email} creado con el rol ${data.role}.` };
  },
  'users'
);
