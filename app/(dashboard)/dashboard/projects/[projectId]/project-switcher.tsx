'use client';

// Selector de proyecto (plan de UX del SEO v2, fase 1): cambia de cliente sin volver a la lista y se queda en la misma
// sección. Con buscador; se cierra con Escape o al hacer clic fuera.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

type P = { id: string; name: string; detail: string | null };

export function ProjectSwitcher({ current, projects, section }: { current: { id: string; name: string } | null; projects: P[]; section: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      btn.current?.focus();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const shown = projects.filter((p) => !q || norm(`${p.name} ${p.detail ?? ''}`).includes(norm(q)));
  return (
    <div ref={box} className="relative">
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="selector-proyectos"
        className="inline-flex max-w-[80vw] items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm font-medium hover:bg-accent"
      >
        <span className="truncate">{current?.name ?? 'Elige un proyecto'}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      {open && (
        <div id="selector-proyectos" className="absolute left-0 z-30 mt-1 w-80 max-w-[90vw] rounded-lg border bg-popover p-2 shadow-lg">
          <label className="flex items-center gap-2 rounded-md border px-2">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente…" aria-label="Buscar proyecto" className="h-8 w-full bg-transparent text-sm outline-none" />
          </label>
          <ul className="mt-2 max-h-72 overflow-y-auto" aria-label="Proyectos">
            {shown.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/dashboard/projects/${p.id}/${section}`}
                  onClick={() => setOpen(false)}
                  aria-current={p.id === current?.id ? 'true' : undefined}
                  className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent', p.id === current?.id && 'font-medium')}
                >
                  <Check className={cn('size-4 shrink-0', p.id === current?.id ? 'text-brand' : 'invisible')} aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate">{p.name}</span>
                    {p.detail && <span className="block truncate text-xs text-muted-foreground">{p.detail}</span>}
                  </span>
                </Link>
              </li>
            ))}
            {!shown.length && <li className="px-2 py-1.5 text-sm text-muted-foreground">Ningún proyecto coincide.</li>}
          </ul>
          <Link href="/dashboard/projects" className="mt-1 block border-t px-2 pt-2 text-xs text-muted-foreground hover:text-foreground">
            Ver todos los proyectos
          </Link>
        </div>
      )}
    </div>
  );
}
