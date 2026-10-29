'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/dashboard/operaciones', label: 'Bloc de notas' },
  { href: '/dashboard/operaciones/equipo-hoy', label: 'Equipo hoy' },
  { href: '/dashboard/operaciones/encargos', label: 'Encargos' },
  { href: '/dashboard/operaciones/nuevo', label: 'Nuevo encargo' },
  { href: '/dashboard/operaciones/ajustes', label: 'Ajustes ClickUp' }
];

export function OperacionesTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-gray-200">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3 py-2 text-sm -mb-px border-b-2 ${
              active
                ? 'border-orange-500 text-gray-900 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
