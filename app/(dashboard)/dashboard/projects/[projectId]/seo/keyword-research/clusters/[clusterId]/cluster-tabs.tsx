'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { segment: 'competitors', label: 'Competidores SERP' },
  { segment: 'content-plan', label: 'Estrategia de contenido' },
];

export function ClusterTabs({ basePath }: { basePath: string }) {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 border-b">
      {TABS.map((tab) => {
        const isActive = pathname === `${basePath}/${tab.segment}`;
        return (
          <Link
            key={tab.segment}
            href={`${basePath}/${tab.segment}`}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              isActive
                ? 'border-orange-500 text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
