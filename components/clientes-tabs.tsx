// Pestañas del espacio Clientes (fase 4 de la reorganización UX, 21 nov 2026): las vistas de TODOS los clientes juntas.
// Lo de un cliente concreto está en su ficha (Encargos, Rendimiento, Estrategia y SEO como pestañas).
import Link from 'next/link';
import { Compass, FolderKanban, IdCard, LineChart, MessageCircleQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'fichas', href: '/dashboard/clientes', label: 'Fichas', icon: IdCard },
  { key: 'rendimiento', href: '/dashboard/rendimiento', label: 'Rendimiento web', icon: LineChart },
  { key: 'estrategia', href: '/dashboard/estrategia', label: 'Estrategia', icon: Compass },
  { key: 'seo', href: '/dashboard/projects', label: 'Proyectos SEO', icon: FolderKanban },
  // 25 nov 2026: las preguntas de cada servicio para todos los clientes (las de un cliente, en su ficha → Preguntas).
  { key: 'preguntas', href: '/dashboard/clientes/preguntas', label: 'Banco de preguntas', icon: MessageCircleQuestion }
] as const;

export type ClientesTabKey = (typeof TABS)[number]['key'];

export function ClientesTabs({ active }: { active: ClientesTabKey }) {
  return (
    <nav aria-label="Vistas de clientes" className="-mx-1 flex gap-1 overflow-x-auto border-b px-1">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? 'page' : undefined}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
            t.key === active ? 'border-brand text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <t.icon className="size-4" aria-hidden />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
