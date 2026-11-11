// Piezas comunes de página: cabecera, tarjeta de cifra, estado vacío, insignia y esqueleto.
// Úsalas en toda pantalla nueva para que la herramienta se vea como un único producto.
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PageContainer({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-8 lg:py-8', className)} {...props} />;
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
  children
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          {Icon && (
            <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border bg-card text-brand shadow-xs">
              <Icon className="size-5" />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
            {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground text-pretty">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium [&_svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-muted text-muted-foreground',
        brand: 'border-transparent bg-brand-soft text-brand',
        success: 'border-transparent bg-success-soft text-success',
        warning: 'border-transparent bg-warning-soft text-warning-strong',
        danger: 'border-transparent bg-destructive-soft text-destructive',
        info: 'border-transparent bg-info-soft text-info',
        outline: 'border-border bg-transparent text-foreground'
      }
    },
    defaultVariants: { tone: 'neutral' }
  }
);

export function Badge({
  className,
  tone,
  dot,
  children,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { dot?: boolean }) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  className
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}) {
  const toneCls = {
    neutral: 'text-muted-foreground bg-muted',
    brand: 'text-brand bg-brand-soft',
    success: 'text-success bg-success-soft',
    warning: 'text-warning-strong bg-warning-soft',
    danger: 'text-destructive bg-destructive-soft',
    info: 'text-info bg-info-soft'
  }[tone];
  return (
    <div className={cn('rounded-xl border bg-card p-4 shadow-xs', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {Icon && (
          <span className={cn('grid size-8 place-items-center rounded-lg', toneCls)}>
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 px-6 py-14 text-center',
        className
      )}
    >
      {Icon && (
        <span className="mb-4 grid size-12 place-items-center rounded-2xl border bg-card text-muted-foreground shadow-xs">
          <Icon className="size-6" />
        </span>
      )}
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground text-pretty">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}

export function Section({
  title,
  description,
  actions,
  className,
  children
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn('rounded-xl border bg-card shadow-xs', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
