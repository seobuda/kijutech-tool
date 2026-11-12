'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { sectionOf } from '@/components/app-shell/nav';
import { PageHeader } from '@/components/ui/page';

// Cabecera y pestañas de la sección actual del módulo (Operaciones, Equipo o Sistema): barra con iconos,
// desplazable en móvil, con la activa resaltada.
export function OperacionesTabs() {
  const pathname = usePathname();
  const section = sectionOf(pathname);
  return (
    <>
      <PageHeader icon={section.icon} title={section.label} description={section.description} />
      <nav
        aria-label={`Secciones de ${section.label}`}
        className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] lg:-mx-8 lg:px-8 [&::-webkit-scrollbar]:hidden"
      >
        <div className="inline-flex min-w-full items-center gap-1 border-b">
          {section.tabs.map((t) => {
            const active = pathname === t.href || (t.href !== '/dashboard/operaciones' && pathname.startsWith(`${t.href}/`));
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative -mb-px flex h-10 shrink-0 items-center gap-2 px-3 text-sm transition-colors',
                  active ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <t.icon className={cn('size-4', active ? 'text-brand' : 'text-muted-foreground/80 group-hover:text-foreground')} />
                {t.label}
                <span
                  className={cn(
                    'absolute inset-x-2 bottom-0 h-0.5 rounded-full transition-colors',
                    active ? 'bg-brand' : 'bg-transparent group-hover:bg-border'
                  )}
                  aria-hidden
                />
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
