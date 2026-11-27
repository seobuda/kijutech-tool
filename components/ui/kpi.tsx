// Tarjeta de cifra (plan de UX del SEO v2, 27 nov 2026, principios 3 y 4): valor grande, variación frente al periodo
// anterior y, con pocos datos, «sin datos suficientes» en lugar de un porcentaje alarmista. Puro (sin datos ni red).
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Variación honesta: null si alguno de los dos periodos tiene menos de `minBase` (con 40 clics, un −18 % es ruido).
 * `invert`: cuando bajar es bueno (p. ej. la posición media).
 */
export function honestDelta(now: number | null | undefined, prev: number | null | undefined, minBase = 30): { pct: number; good: boolean | null } | null {
  if (now == null || prev == null || prev < minBase || now < 0) return null;
  if (prev === 0) return null;
  const pct = Math.round(((now - prev) / prev) * 100);
  return { pct, good: pct === 0 ? null : pct > 0 };
}

export function KpiCard({
  label,
  value,
  hint,
  now,
  prev,
  minBase = 30,
  invert = false,
  href,
  className
}: {
  label: string;
  value: React.ReactNode;
  /** Frase corta debajo (p. ej. «de 10 h del contrato»). */
  hint?: React.ReactNode;
  now?: number | null;
  prev?: number | null;
  minBase?: number;
  invert?: boolean;
  href?: string;
  className?: string;
}) {
  const d = now !== undefined ? honestDelta(now, prev, minBase) : undefined;
  const good = d && d.good !== null ? (invert ? !d.good : d.good) : null;
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {d === null && now !== undefined ? (
        <p className="text-xs text-muted-foreground">Sin datos suficientes para comparar</p>
      ) : d ? (
        <p className={cn('inline-flex items-center gap-0.5 text-xs font-medium', good === null ? 'text-muted-foreground' : good ? 'text-success' : 'text-destructive')}>
          {d.pct === 0 ? <Minus className="size-3.5" aria-hidden /> : d.pct > 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
          {d.pct > 0 ? '+' : ''}
          {d.pct} % <span className="font-normal text-muted-foreground">frente al periodo anterior</span>
        </p>
      ) : null}
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  const cls = cn('flex flex-col rounded-xl border bg-card p-4', href && 'transition-colors hover:bg-accent', className);
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
