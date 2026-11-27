// Semáforo único de gravedad (plan de UX del SEO v2, 27 nov 2026, principio 6). El color nunca va solo: siempre icono +
// texto (accesibilidad). Lo usan SEO y, después, Para ti y Operaciones para hablar el mismo idioma visual.
import { AlertOctagon, AlertTriangle, CircleCheck, Info, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SeverityKey = 'critico' | 'importante' | 'aviso' | 'info' | 'bien';

export const SEVERITY: Record<SeverityKey, { label: string; icon: LucideIcon; className: string; order: number }> = {
  critico: { label: 'Crítico', icon: AlertOctagon, className: 'bg-destructive-soft text-destructive', order: 0 },
  importante: { label: 'Importante', icon: AlertTriangle, className: 'bg-warning-soft text-warning-strong', order: 1 },
  aviso: { label: 'Aviso', icon: Info, className: 'bg-info-soft text-info', order: 2 },
  info: { label: 'Info', icon: Info, className: 'bg-muted text-muted-foreground', order: 3 },
  bien: { label: 'Bien', icon: CircleCheck, className: 'bg-success-soft text-success', order: 4 }
};

export const severityOrder = (s: string) => SEVERITY[(s as SeverityKey)]?.order ?? 9;

/** Insignia de gravedad: icono + texto (+ número opcional). */
export function SeverityBadge({ severity, count, label, className }: { severity: string; count?: number; label?: string; className?: string }) {
  const s = SEVERITY[(severity as SeverityKey)] ?? SEVERITY.info;
  const Icon = s.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', s.className, className)}>
      <Icon className="size-3.5" aria-hidden />
      {label ?? s.label}
      {count != null && <span className="tabular-nums">· {count}</span>}
    </span>
  );
}
