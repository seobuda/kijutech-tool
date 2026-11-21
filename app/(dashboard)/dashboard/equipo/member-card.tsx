// Tarjeta de un miembro del equipo (persona o agente) en el organigrama.
import Link from 'next/link';
import { Badge } from '@/components/ui/page';
import { MemberAvatar } from '@/components/equipo/member-avatar';
import { cn } from '@/lib/utils';
import type { Member } from '@/lib/equipo/team';

const DOT: Record<Member['status']['tone'], string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  info: 'bg-info',
  brand: 'bg-brand',
  neutral: 'bg-muted-foreground/40'
};

export const memberHref = (m: Pick<Member, 'kind' | 'id'>) => `/dashboard/equipo/${m.kind}/${m.id}`;

export function MemberCard({ m, linkable, head }: { m: Member; linkable: boolean; head?: boolean }) {
  const body = (
    <>
      <MemberAvatar name={m.name} kind={m.kind} avatarUrl={m.avatarUrl} initials={m.initials} hue={m.hue} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-medium">{m.name}</span>
          {head && <Badge tone="brand">Jefe</Badge>}
          <Badge tone={m.kind === 'agente' ? 'info' : 'neutral'}>{m.kind === 'agente' ? 'IA' : 'Humano'}</Badge>
        </span>
        {m.role && <span className="block truncate text-xs text-muted-foreground">{m.role}</span>}
        <span className="mt-0.5 flex items-center gap-1.5 text-xs">
          <span className={cn('size-1.5 shrink-0 rounded-full', DOT[m.status.tone])} aria-hidden />
          <span>{m.status.label}</span>
          {m.status.detail && <span className="truncate text-muted-foreground">· {m.status.detail}</span>}
        </span>
      </span>
    </>
  );
  const cls = cn('flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm', head && 'border-brand/40', !m.active && 'opacity-60');
  return linkable ? (
    <Link href={memberHref(m)} className={cn(cls, 'transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
