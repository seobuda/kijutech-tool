// Pestañas SEO de un proyecto (Hito 1, 23 nov 2026; Palabras desde el Hito 2): Salud técnica · Expediente · Palabras · Plan de mejora.
import Link from 'next/link';
import { Activity, Bot, ClipboardList, IdCard, KeyRound, LayoutDashboard, Link2, MapPin, Stethoscope, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { key: 'vivo', label: 'En vivo', icon: Activity },
  { key: 'salud', label: 'Salud técnica', icon: Stethoscope },
  { key: 'expediente', label: 'Expediente', icon: IdCard },
  { key: 'palabras', label: 'Palabras', icon: KeyRound },
  { key: 'posiciones', label: 'Posiciones', icon: TrendingUp },
  { key: 'local', label: 'Local', icon: MapPin },
  { key: 'ia', label: 'IA', icon: Bot },
  { key: 'autoridad', label: 'Autoridad', icon: Link2 },
  { key: 'plan', label: 'Plan de mejora', icon: ClipboardList }
] as const;

export function ProjectSeoNav({ projectId, active }: { projectId: string; active: (typeof TABS)[number]['key'] }) {
  return (
    <nav aria-label="Secciones del proyecto" className="flex flex-wrap gap-1 border-b">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/dashboard/projects/${projectId}/${t.key}`}
          aria-current={active === t.key ? 'page' : undefined}
          className={cn(
            '-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm',
            active === t.key ? 'border-brand font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <t.icon className="size-4" />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
