import { redirect } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { checkPermission } from '@/lib/auth/permissions';
import { EmptyState, PageContainer } from '@/components/ui/page';
import { AdminHome } from './_inicio/admin-home';
import { TeamHome } from './_inicio/team-home';

export const dynamic = 'force-dynamic';

// Inicio (fase 1 de la reorganización UX, 20 nov 2026): la portada de la herramienta. Antes redirigía al Bloc de notas.
// - super_admin y admin: panel con lo que espera de ti y el resumen de cada área (el admin, sin costes ni plataforma).
// - el resto del equipo: su propio día (tareas, jornada, dudas y lo nuevo de la base), sin datos de los demás.
// No usa requirePagePermission: esa función manda aquí a quien no tiene permiso y, sin rol, sería un bucle.
export default async function InicioPage() {
  const res = await checkPermission('view');
  if (!res.ok) {
    if (res.error === 'No autenticado') redirect('/sign-in');
    return (
      <PageContainer>
        <EmptyState
          icon={ShieldAlert}
          title="Tu usuario todavía no tiene un rol"
          description="Pide a quien administra la herramienta que te asigne uno en Usuarios. Hasta entonces no puedes ver ninguna sección."
        />
      </PageContainer>
    );
  }
  const { user, roles } = res;
  const isSuperAdmin = roles.includes('super_admin');
  const isAdmin = isSuperAdmin || roles.includes('admin');
  const firstName = (user.name || user.email.split('@')[0]).split(/\s+/)[0];
  if (isAdmin) return <AdminHome tenantId={user.tenantId} firstName={firstName} withCosts={isSuperAdmin} />;
  return <TeamHome tenantId={user.tenantId} userId={user.id} firstName={firstName} />;
}
