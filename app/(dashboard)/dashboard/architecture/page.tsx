import { redirect } from 'next/navigation';
import { getUser, getUserTenantRoleNames } from '@/lib/db/queries';
import { getSystemMap, getProcessMap, PROCESS_MAP_IDS } from '@/lib/architecture-map/registry';
import { getMapLive } from '@/lib/operaciones/map-live';
import { ArchitectureMapClient } from './architecture-map-client';

export default async function ArchitecturePage() {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  const roleNames = await getUserTenantRoleNames(user.id);
  if (!roleNames.includes('super_admin')) {
    redirect('/dashboard');
  }

  const systemNodes = getSystemMap();

  // Los dos procesos de detalle conocidos hoy se calculan aquí (Server
  // Component) y se pasan ya resueltos al cliente — getProcessMap() vive
  // en un módulo que importa fs (vía getSeoManifest), así que no puede
  // llamarse desde el componente cliente de React Flow.
  const processMaps = Object.fromEntries(PROCESS_MAP_IDS.map((id) => [id, getProcessMap(id)]));
  // Valores actuales del panel de Automatizaciones y última ejecución de cada proceso (mapa vivo).
  const live = await getMapLive(user.tenantId);

  return (
    <section className="flex-1 space-y-6 p-4 lg:p-8">
      <div>
        <h1 className="text-lg font-medium lg:text-2xl">Mapa Visual del Sistema</h1>
        <p className="text-sm text-muted-foreground">
          Cómo funciona Kijutech Tool, de un vistazo. Haz clic en un proceso con borde punteado para ver
          sus pasos internos; el icono ⓘ de cada paso muestra cuándo se ejecuta, qué decide la IA y qué el código, qué tablas y ajustes usa.
        </p>
      </div>

      <ArchitectureMapClient systemNodes={systemNodes} processMaps={processMaps} live={live} />
    </section>
  );
}
