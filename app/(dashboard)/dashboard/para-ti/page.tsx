import Link from 'next/link';
import { ArrowRight, CheckCircle2, Inbox, Lock } from 'lucide-react';
import { requirePagePermission } from '@/lib/auth/permissions';
import { AutoRefresh } from '@/components/ui/auto-refresh';
import { Badge, EmptyState, PageContainer, PageHeader, Section } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { filterEntries, getParaTi, KIND_ORDER, KINDS, type DeptKey, type KindKey, type ParaTiEntry } from '@/lib/inicio/para-ti';
import { waitLabel } from '@/lib/operaciones/inbox';
import { isInboxOwner } from '@/lib/operaciones/inbox-owner';
import { BandejaList } from '../operaciones/bandeja/bandeja-list';
import { toBandejaItems } from '../operaciones/bandeja/items';

export const dynamic = 'force-dynamic';

// Para ti (fase 2 de la reorganización UX, 21 nov 2026): la bandeja única de administración. Todo lo que espera una
// decisión, de los 7 sitios donde estaba repartido, en una lista: lo urgente primero y, dentro, lo que más espera.
// Filtros por departamento y por tipo (?area= y ?tipo=). Las revisiones y los bloqueos se deciden aquí mismo con los
// botones de Mi bandeja, pero solo los decide quien lleva las operaciones: el resto de administradores los ve para estar
// al tanto. Lo demás enlaza a su elemento concreto.
export default async function ParaTiPage({ searchParams }: { searchParams: Promise<{ area?: string; tipo?: string }> }) {
  const user = await requirePagePermission('admin');
  const sp = await searchParams;
  const [data, owner] = await Promise.all([getParaTi(user.tenantId), isInboxOwner(user)]);
  const dept = data.depts.some((d) => d.key === sp.area) ? (sp.area as DeptKey) : null;
  const kind = sp.tipo && sp.tipo in KINDS ? (sp.tipo as KindKey) : null;

  const inDept = filterEntries(data.entries, { dept });
  const shown = filterEntries(inDept, { kind });
  // El dueño decide revisiones y bloqueos aquí mismo (con sus botones); el resto los ve en la lista, sin botones.
  const decideHere = owner ? shown.filter((e) => e.kind === 'revisiones' || e.kind === 'bloqueos') : [];
  const decideKeys = new Set(decideHere.map((e) => e.key));
  const rest = shown.filter((e) => !decideKeys.has(e.key));
  const bandeja = toBandejaItems(data.inbox.filter((i) => decideKeys.has(i.kind === 'blocker' ? `b-${i.blocker.id}` : `r-${i.req.id}`)));
  const ownerOnlyCount = owner ? 0 : shown.filter((e) => KINDS[e.kind].ownerOnly).length;

  const qs = (p: { area?: string | null; tipo?: string | null }) => {
    const q = new URLSearchParams();
    if (p.area) q.set('area', p.area);
    if (p.tipo) q.set('tipo', p.tipo);
    const s = q.toString();
    return `/dashboard/para-ti${s ? `?${s}` : ''}`;
  };
  const countIn = (d: DeptKey | null) => filterEntries(data.entries, { dept: d }).length;
  const kindCounts = KIND_ORDER.map((k) => ({ k, n: inDept.filter((e) => e.kind === k).length })).filter((x) => x.n > 0);

  return (
    <PageContainer className="space-y-5">
      <PageHeader
        icon={Inbox}
        title={data.entries.length ? `Para ti · ${data.entries.length}` : 'Para ti'}
        description="Todo lo que espera una decisión, en un solo sitio: lo urgente primero y, dentro, lo que más espera. Al resolverlo, desaparece de aquí."
        actions={<AutoRefresh className="text-sm" />}
      />

      {data.entries.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nada espera tu decisión"
          description="Cuando el equipo, los agentes o el sistema necesiten algo de ti, aparecerá aquí y en tu Inicio. Los avisos siguen llegando también por Telegram."
          action={<Link href="/dashboard" className="text-sm text-brand underline-offset-2 hover:underline">Volver a Inicio</Link>}
        />
      ) : (
        <>
          <nav aria-label="Filtrar" className="space-y-2">
            <div className="flex flex-wrap gap-1.5" role="list" aria-label="Departamento">
              <FilterChip href={qs({ tipo: kind })} active={!dept} label="Todo" n={countIn(null)} />
              {data.depts.map((d) => (
                <FilterChip key={d.key} href={qs({ area: d.key, tipo: kind })} active={dept === d.key} label={d.label} n={countIn(d.key)} />
              ))}
            </div>
            {kindCounts.length > 1 && (
              <div className="flex flex-wrap gap-1.5" role="list" aria-label="Tipo">
                <FilterChip href={qs({ area: dept })} active={!kind} label="Todos los tipos" small />
                {kindCounts.map(({ k, n }) => (
                  <FilterChip key={k} href={qs({ area: dept, tipo: k })} active={kind === k} label={KINDS[k].label} n={n} small />
                ))}
              </div>
            )}
          </nav>

          {ownerOnlyCount > 0 && (
            <p className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
              {ownerOnlyCount} de estas cosas (revisiones, bloqueos, correos y propuestas del agente) las decide quien lleva las operaciones. Las ves para
              estar al tanto.
            </p>
          )}

          {shown.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Nada en este filtro"
              description="Prueba con otro departamento o tipo."
              action={<Link href="/dashboard/para-ti" className="text-sm text-brand underline-offset-2 hover:underline">Quitar los filtros</Link>}
            />
          ) : (
            <>
              {bandeja.length > 0 && (
                <Section title={`Revisiones y bloqueos · ${bandeja.length}`} description="Decide aquí mismo: aceptar, devolver o responder.">
                  <div className="p-4">
                    <BandejaList items={bandeja} />
                  </div>
                </Section>
              )}
              {rest.length > 0 && (
                <Section title={bandeja.length ? `Lo demás · ${rest.length}` : undefined}>
                  <ul className="divide-y" data-testid="para-ti-lista">
                    {rest.map((e) => (
                      <EntryRow key={e.key} e={e} owner={owner} />
                    ))}
                  </ul>
                </Section>
              )}
            </>
          )}
        </>
      )}
    </PageContainer>
  );
}

function FilterChip({ href, active, label, n, small }: { href: string; active: boolean; label: string; n?: number; small?: boolean }) {
  return (
    <Link
      role="listitem"
      href={href}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring',
        small ? 'h-7 text-xs' : 'h-8 text-sm',
        active ? 'border-brand/50 bg-brand-soft text-foreground' : 'bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      {label}
      {n !== undefined && <span className="tabular-nums text-muted-foreground">{n}</span>}
    </Link>
  );
}

function EntryRow({ e, owner }: { e: ParaTiEntry; owner: boolean }) {
  const meta = [e.clientName, e.detail].filter(Boolean).join(' · ');
  const body = (
    <>
      <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', e.urgent ? 'bg-destructive' : 'bg-transparent')} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge tone={e.urgent ? 'danger' : 'neutral'}>{KINDS[e.kind].label}</Badge>
          <span className="font-medium">{e.title}</span>
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {meta ? `${meta} · ` : ''}espera {waitLabel(e.since)}
          {!e.href && !owner && ' · lo decide quien lleva las operaciones'}
        </span>
      </span>
      {e.href && (
        <span className="inline-flex shrink-0 items-center gap-1 text-sm text-brand">
          Resolver <ArrowRight className="size-3.5" aria-hidden />
        </span>
      )}
    </>
  );
  const cls = 'flex items-start gap-3 px-5 py-3 text-sm';
  return (
    <li>
      {e.href ? (
        <Link href={e.href} className={cn(cls, 'transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring')}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}
