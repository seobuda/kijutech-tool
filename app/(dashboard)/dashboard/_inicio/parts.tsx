// Piezas comunes de Inicio: saludo, tarjeta de área y avisos de carga o de bloque no disponible.
import Link from 'next/link';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/page';

export function greeting(now = new Date()): string {
  const h = Number(new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: 'numeric', hour12: false }).format(now));
  if (h >= 6 && h < 14) return 'Buenos días';
  if (h >= 14 && h < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

export function todayLabel(now = new Date()): string {
  const s = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Tarjeta de un área: título con icono, contenido y un enlace «Ver…» a su sección. */
export function HomeCard({
  title,
  icon: Icon,
  href,
  linkLabel,
  className,
  children,
  testId
}: {
  title: string;
  icon: LucideIcon;
  href?: string;
  linkLabel?: string;
  className?: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section className={cn('flex flex-col rounded-xl border bg-card shadow-xs', className)} data-testid={testId}>
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <Icon className="size-4 text-brand" aria-hidden />
          {title}
        </h2>
        {href && (
          <Link href={href} className="inline-flex items-center gap-1 rounded text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            {linkLabel ?? 'Ver'}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        )}
      </div>
      <div className="flex-1 px-5 py-4">{children}</div>
    </section>
  );
}

export function Unavailable({ what }: { what: string }) {
  return <p className="text-sm text-muted-foreground">No se ha podido cargar {what}. Ya ha quedado registrado; vuelve a intentarlo en un rato.</p>;
}

export function Loading({ text }: { text: string }) {
  return (
    <div className="space-y-2" aria-busy="true">
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-brand/70 border-t-transparent" aria-hidden />
        {text}
      </p>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

export function Dot({ tone }: { tone: 'red' | 'amber' | 'green' | 'gray' }) {
  const cls = { red: 'bg-destructive', amber: 'bg-warning', green: 'bg-success', gray: 'bg-muted-foreground/40' }[tone];
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', cls)} aria-hidden />;
}
