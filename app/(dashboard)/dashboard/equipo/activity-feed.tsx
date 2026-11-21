// Actividad del día de personas y agentes en un solo registro, como un canal de equipo: quién hizo qué y cuándo.
import { Bot, UserRound } from 'lucide-react';
import type { ActivityItem } from '@/lib/equipo/team';

const hhmm = (d: Date) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }).format(d);

export function ActivityFeed({ items, empty }: { items: ActivityItem[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ol className="space-y-2.5" aria-label="Actividad de hoy">
      {items.map((i) => (
        <li key={i.key} className="flex gap-2.5 text-sm">
          <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border bg-muted text-muted-foreground" aria-hidden>
            {i.whoKind === 'agente' ? <Bot className="size-3.5" /> : <UserRound className="size-3.5" />}
          </span>
          <span className="min-w-0">
            <span className="font-medium">{i.who}</span> <span className="text-muted-foreground">{i.text}</span>
            <span className="block text-xs text-muted-foreground tabular-nums">{hhmm(i.at)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
