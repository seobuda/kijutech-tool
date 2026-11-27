// Sub-vistas de una pestaña SEO (UX del 27 nov 2026): en vez de apilar todos los bloques en una página larga, cada pestaña
// enseña una vista a la vez (?vista=…). Enlaces normales: se pueden compartir y el botón «atrás» funciona.
import Link from 'next/link';
import { cn } from '@/lib/utils';

export type SubNavItem = { key: string; label: string; count?: number | null; alert?: boolean };

export function SubNav({ base, active, items }: { base: string; active: string; items: SubNavItem[] }) {
  return (
    <nav aria-label="Vistas de la pestaña" className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <Link
          key={it.key}
          href={`${base}?vista=${it.key}`}
          aria-current={active === it.key ? 'page' : undefined}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm',
            active === it.key ? 'border-brand bg-brand-soft font-medium text-brand' : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
          )}
        >
          {it.label}
          {it.count != null && it.count > 0 && <span className={cn('rounded-full px-1.5 text-xs', it.alert ? 'bg-destructive-soft text-destructive' : 'bg-muted text-muted-foreground')}>{it.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** La vista pedida si existe; si no, la primera. */
export function pickView<T extends string>(raw: string | undefined, keys: readonly T[]): T {
  return (keys as readonly string[]).includes(raw ?? '') ? (raw as T) : keys[0];
}
