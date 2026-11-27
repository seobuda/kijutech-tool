// Navegación SEO de un proyecto (plan de UX del SEO v2, fase 1, 27 nov 2026, aprobado por Enric): 6 pestañas (Resumen ·
// Trabajo · Técnico · Búsquedas · Local · Resultados) con una segunda fila de secciones, el selector de proyecto (cambia
// de cliente sin volver a la lista, manteniendo la sección) y el engranaje con el expediente y la puesta en marcha.
// Registra la visita (fase 0: línea base del rediseño). Sustituye a las 10 pestañas en fila.
import Link from 'next/link';
import { unstable_cache } from 'next/cache';
import { and, asc, eq, ne } from 'drizzle-orm';
import { Activity, ClipboardList, LayoutDashboard, MapPin, Settings2, Stethoscope, TrendingUp } from 'lucide-react';
import { db } from '@/lib/db/drizzle';
import { clients, projects } from '@/lib/db/schema';
import { getUserIfAllowed } from '@/lib/auth/permissions';
import { logPageView } from '@/lib/core/usage';
import { cn } from '@/lib/utils';
import { ProjectSwitcher } from './project-switcher';

const GROUPS = [
  { key: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { key: 'trabajo', label: 'Trabajo', icon: ClipboardList },
  { key: 'tecnico', label: 'Técnico', icon: Stethoscope },
  { key: 'busquedas', label: 'Búsquedas', icon: TrendingUp },
  { key: 'local', label: 'Local', icon: MapPin },
  { key: 'resultados', label: 'Resultados', icon: Activity }
] as const;
type GroupKey = (typeof GROUPS)[number]['key'] | 'proyecto';

/** Cada sección (una ruta del proyecto) y su grupo. El orden dentro del grupo es el de la segunda fila. */
const SECTIONS = {
  resumen: { group: 'resumen', label: 'Resumen' },
  estrategia: { group: 'trabajo', label: 'Estrategia' },
  plan: { group: 'trabajo', label: 'Plan de mejora' },
  briefs: { group: 'trabajo', label: 'Briefs y artículos' },
  salud: { group: 'tecnico', label: 'Salud técnica' },
  autoridad: { group: 'tecnico', label: 'Autoridad' },
  posiciones: { group: 'busquedas', label: 'Posiciones' },
  palabras: { group: 'busquedas', label: 'Palabras y temas' },
  ia: { group: 'busquedas', label: 'Asistentes de IA' },
  local: { group: 'local', label: 'Local' },
  vivo: { group: 'resultados', label: 'Leads y visitas' },
  expediente: { group: 'proyecto', label: 'Expediente y puesta en marcha' }
} as const satisfies Record<string, { group: GroupKey; label: string }>;
export type SeoSection = keyof typeof SECTIONS;

/** Proyectos SEO de la cuenta para el selector, en caché 60 s por cuenta (no se consulta en cada pantalla). */
const seoProjectsOf = (tenantId: string) =>
  unstable_cache(
    () =>
      db
        .select({ id: projects.id, name: projects.name, clientName: clients.name })
        .from(projects)
        .leftJoin(clients, eq(clients.id, projects.clientId))
        .where(and(eq(projects.tenantId, tenantId), eq(projects.service, 'seo'), ne(projects.status, 'archived')))
        .orderBy(asc(projects.name))
        .limit(300),
    ['seo-nav-projects', tenantId],
    { revalidate: 60 }
  )();

const firstOf = (g: GroupKey) => (Object.keys(SECTIONS) as SeoSection[]).find((k) => SECTIONS[k].group === g)!;

export async function ProjectSeoNav({ projectId, active }: { projectId: string; active: SeoSection }) {
  const user = await getUserIfAllowed('view');
  const group = SECTIONS[active].group;
  const base = `/dashboard/projects/${projectId}`;
  const list = user ? await seoProjectsOf(user.tenantId).catch(() => []) : [];
  if (user) logPageView(user.tenantId, user.id, 'seo', active, projectId);
  const current = list.find((p) => p.id === projectId);
  const siblings = (Object.keys(SECTIONS) as SeoSection[]).filter((k) => SECTIONS[k].group === group);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ProjectSwitcher current={current ? { id: current.id, name: current.clientName ?? current.name } : null} projects={list.map((p) => ({ id: p.id, name: p.clientName ?? p.name, detail: p.clientName ? p.name : null }))} section={active} />
        <Link
          href={`${base}/expediente`}
          aria-current={active === 'expediente' ? 'page' : undefined}
          className={cn('inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm', active === 'expediente' ? 'border-brand bg-brand-soft text-brand' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}
        >
          <Settings2 className="size-4" aria-hidden />
          Expediente y puesta en marcha
        </Link>
      </div>
      <nav aria-label="Secciones del proyecto" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b">
        {GROUPS.map((g) => (
          <Link
            key={g.key}
            href={`${base}/${firstOf(g.key)}`}
            aria-current={group === g.key ? 'page' : undefined}
            className={cn('-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm', group === g.key ? 'border-brand font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
          >
            <g.icon className="size-4" aria-hidden />
            {g.label}
          </Link>
        ))}
      </nav>
      {siblings.length > 1 && (
        // Pestañas secundarias (texto subrayado), distintas de las pastillas de sub-vista de cada pantalla.
        <nav aria-label={`Apartados de ${GROUPS.find((g) => g.key === group)?.label ?? ''}`} className="flex flex-wrap gap-4 px-1">
          {siblings.map((k) => (
            <Link
              key={k}
              href={`${base}/${k}`}
              aria-current={k === active ? 'true' : undefined}
              className={cn('border-b-2 pb-1 text-sm', k === active ? 'border-foreground font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
            >
              {SECTIONS[k].label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
