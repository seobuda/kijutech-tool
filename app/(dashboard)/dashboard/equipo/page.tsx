import Link from 'next/link';
import { Suspense } from 'react';
import { Activity, Crown, Settings2, UsersRound } from 'lucide-react';
import { requirePagePermission, getTenantRoleNames } from '@/lib/auth/permissions';
import { Button } from '@/components/ui/button';
import { PageContainer, PageHeader, Section } from '@/components/ui/page';
import { getActivityToday, getTeamOrg, type OrgDept } from '@/lib/equipo/team';
import { getMyProfile, safeBlock } from '@/lib/inicio/panel';
import { Loading, Unavailable } from '../_inicio/parts';
import { ActivityFeed } from './activity-feed';
import { MemberCard } from './member-card';

export const dynamic = 'force-dynamic';

// Equipo (fase 3 de la reorganización UX, 21 nov 2026): personas y agentes de IA como un solo equipo. Portada con el
// organigrama (Dirección → departamentos con su jefe → personas y agentes), el estado de cada uno y, para administración,
// la actividad de hoy en un solo registro. El resto del equipo ve el organigrama y entra solo en su propia ficha.
export default async function EquipoPage() {
  const user = await requirePagePermission('view');
  const roles = await getTenantRoleNames(user.id);
  const isAdmin = roles.includes('admin') || roles.includes('super_admin');
  const [org, me] = await Promise.all([
    safeBlock(user.tenantId, 'organigrama', () => getTeamOrg(user.tenantId, { withDetail: isAdmin })),
    safeBlock(user.tenantId, 'ficha propia', () => getMyProfile(user.tenantId, user.id))
  ]);
  const myId = me?.id;
  const linkable = (id: string) => isAdmin || id === myId;

  const people = org?.all.filter((m) => m.kind === 'persona').length ?? 0;
  const agents = org?.all.filter((m) => m.kind === 'agente' && m.active).length ?? 0;
  const working = org?.all.filter((m) => m.status.label === 'Trabajando').length ?? 0;

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        icon={UsersRound}
        title="Equipo"
        description="Personas y agentes de IA como un solo equipo: quién está en cada departamento, qué está haciendo cada uno y lo que ha pasado hoy."
        actions={
          isAdmin && (
            <>
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/operaciones/equipo-hoy">
                  <Activity aria-hidden /> Tareas de hoy
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/agentes/departamentos">
                  <Settings2 aria-hidden /> Departamentos
                </Link>
              </Button>
            </>
          )
        }
      >
        {org && (
          <p className="text-sm text-muted-foreground">
            {people} persona(s) · {agents} agente(s) activos · <span className="text-foreground">{working} trabajando ahora</span>
          </p>
        )}
      </PageHeader>

      {!org ? (
        <Section>
          <div className="p-5">
            <Unavailable what="el organigrama" />
          </div>
        </Section>
      ) : (
        <div className={isAdmin ? 'grid gap-6 xl:grid-cols-3' : ''}>
          <div className="space-y-4 xl:col-span-2" data-testid="organigrama">
            <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-xs">
              <span className="grid size-11 place-items-center rounded-full bg-brand text-white" aria-hidden>
                <Crown className="size-5" />
              </span>
              <span>
                <span className="block font-semibold">Dirección</span>
                <span className="block text-sm text-muted-foreground">{direccionLine(org.depts)}</span>
              </span>
            </div>
            {sortDepts(org.depts).map((d) => (
              <DeptBlock key={d.key} d={d} linkable={linkable} nested={d.reportsTo === 'gabinete'} />
            ))}
            {org.unassigned.length > 0 && (
              <Section title="Sin departamento" description={isAdmin ? 'Asígnalos desde su ficha para que aparezcan en su departamento.' : undefined}>
                <div className="grid gap-2 p-4 sm:grid-cols-2">
                  {org.unassigned.map((m) => (
                    <MemberCard key={`${m.kind}-${m.id}`} m={m} linkable={linkable(m.id)} />
                  ))}
                </div>
              </Section>
            )}
          </div>
          {isAdmin && (
            <Section title="Actividad de hoy" description="Lo que han hecho personas y agentes, lo más reciente arriba." className="self-start">
              <div className="p-4">
                <Suspense fallback={<Loading text="Cargando la actividad…" />}>
                  <TodayFeed tenantId={user.tenantId} />
                </Suspense>
              </div>
            </Section>
          )}
        </div>
      )}
    </PageContainer>
  );
}

function direccionLine(depts: OrgDept[]): string {
  const list = (xs: OrgDept[]) => xs.map((d) => d.name).join(', ');
  const top = depts.filter((d) => d.reportsTo !== 'gabinete');
  const under = depts.filter((d) => d.reportsTo === 'gabinete');
  return `De Dirección dependen: ${list(top) || 'nadie todavía'}.${under.length ? ` De Gabinete: ${list(under)}.` : ''}`;
}

/** Primero lo que reporta a Dirección; Gabinete seguido de sus departamentos. */
function sortDepts(depts: OrgDept[]): OrgDept[] {
  const top = depts.filter((d) => d.reportsTo !== 'gabinete');
  const under = depts.filter((d) => d.reportsTo === 'gabinete');
  return top.flatMap((d) => (d.key === 'gabinete' ? [d, ...under] : [d])).concat(top.some((d) => d.key === 'gabinete') ? [] : under);
}

function DeptBlock({ d, linkable, nested }: { d: OrgDept; linkable: (id: string) => boolean; nested: boolean }) {
  return (
    <Section title={d.name} description={nested ? 'Depende de Gabinete' : 'Depende de Dirección'} className={nested ? 'ml-4 border-l-4 border-l-brand/30 sm:ml-8' : undefined}>
      <div className="space-y-2 p-4">
        {d.head ? (
          <MemberCard m={d.head} head linkable={linkable(d.head.id)} />
        ) : (
          <p className="text-sm text-muted-foreground">Todavía sin jefe.</p>
        )}
        {d.members.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {d.members.map((m) => (
              <MemberCard key={`${m.kind}-${m.id}`} m={m} linkable={linkable(m.id)} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nadie más en este departamento todavía.</p>
        )}
      </div>
    </Section>
  );
}

async function TodayFeed({ tenantId }: { tenantId: string }) {
  const items = await safeBlock(tenantId, 'actividad de hoy', () => getActivityToday(tenantId, { limit: 40 }));
  if (!items) return <Unavailable what="la actividad" />;
  return <ActivityFeed items={items} empty="Nada todavía hoy. Aquí irá apareciendo lo que hagan personas y agentes." />;
}
