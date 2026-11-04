import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { roles, userRoles, users } from '@/lib/db/schema';
import { requirePagePermission } from '@/lib/auth/permissions';
import { CrearUsuarioForm } from './crear-usuario-form';

export const dynamic = 'force-dynamic';

export default async function UsuariosPage() {
  const admin = await requirePagePermission('users');

  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: roles.name })
    .from(users)
    .leftJoin(userRoles, and(eq(userRoles.userId, users.id), isNull(userRoles.projectId)))
    .leftJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(eq(users.tenantId, admin.tenantId), isNull(users.deletedAt)))
    .orderBy(users.id);

  return (
    <section className="flex-1 p-4 lg:p-8 space-y-8">
      <div>
        <h1 className="text-lg lg:text-2xl font-medium">Usuarios</h1>
        <p className="text-sm text-muted-foreground">
          No hay registro público: los usuarios los da de alta un super admin.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-medium">Usuarios de la cuenta</h2>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Correo</th>
                <th className="px-3 py-2">Rol</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="px-3 py-2">{u.name ?? '—'}</td>
                  <td className="px-3 py-2">{u.email}</td>
                  <td className="px-3 py-2">{u.role ?? 'sin rol (sin acceso)'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-medium">Nuevo usuario</h2>
        <CrearUsuarioForm />
      </div>
    </section>
  );
}
