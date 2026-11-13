'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, MessagesSquare, ListChecks, Plug } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/dashboard/agentes', label: 'Agentes', icon: Bot },
  { href: '/dashboard/agentes/conversaciones', label: 'Conversaciones', icon: MessagesSquare },
  { href: '/dashboard/agentes/trabajos', label: 'Trabajos', icon: ListChecks },
  { href: '/dashboard/agentes/integraciones', label: 'Integraciones', icon: Plug }
];

export function AgentesTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Secciones de Agentes" className="flex flex-wrap gap-1 border-b">
      {TABS.map((t) => {
        const active = path === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={cn('-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm', active ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
          >
            <t.icon className="size-4" aria-hidden /> {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
