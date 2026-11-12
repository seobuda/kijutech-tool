'use client';

// Paleta de comandos (Ctrl+K / ⌘K): ir a cualquier pantalla o acción rápida escribiendo.
// Sin dependencias nuevas: Radix Dialog + filtrado propio, navegable con flechas y Enter.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { CornerDownLeft, Search, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OPERACIONES_TABS, visibleTabs, type NavGroup, type Roles } from './nav';

type Cmd = { id: string; label: string; group: string; href: string; icon: LucideIcon; keywords?: string };

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

// Puntuación sencilla: todas las palabras deben aparecer; premia el inicio del título.
function score(cmd: Cmd, q: string): number {
  if (!q) return 1;
  const hay = normalize(`${cmd.label} ${cmd.group} ${cmd.keywords ?? ''}`);
  const words = normalize(q).split(/\s+/).filter(Boolean);
  if (!words.every((w) => hay.includes(w))) return 0;
  const label = normalize(cmd.label);
  return (label.startsWith(words[0]) ? 3 : 0) + (label.includes(words[0]) ? 2 : 0) + 1;
}

export function CommandPalette({
  open,
  onOpenChange,
  groups,
  roles
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  groups: NavGroup[];
  roles: Roles;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const all = useMemo<Cmd[]>(() => {
    const nav = groups.flatMap((g) =>
      g.items.map((i) => ({ id: i.href, label: i.label, group: g.label, href: i.href, icon: i.icon, keywords: i.keywords }))
    );
    const ops = visibleTabs(OPERACIONES_TABS, roles).map((t) => ({
      id: `ops:${t.href}`,
      label: t.label,
      group: 'Operaciones',
      href: t.href,
      icon: t.icon,
      keywords: t.keywords
    }));
    return [...ops, ...nav.filter((n) => !ops.some((o) => o.href === n.href))];
  }, [groups, roles]);

  const results = useMemo(
    () =>
      all
        .map((c) => ({ c, s: score(c, q) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.c),
    [all, q]
  );

  useEffect(() => setSel(0), [q, open]);
  useEffect(() => {
    if (!open) setQ('');
  }, [open]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const go = (c: Cmd | undefined) => {
    if (!c) return;
    onOpenChange(false);
    router.push(c.href);
  };

  // Agrupar manteniendo el orden por puntuación.
  const grouped: { group: string; items: { c: Cmd; i: number }[] }[] = [];
  results.forEach((c, i) => {
    let g = grouped.find((x) => x.group === c.group);
    if (!g) grouped.push((g = { group: c.group, items: [] }));
    g.items.push({ c, i });
  });

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSel((s) => Math.min(s + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSel((s) => Math.max(s - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              go(results[sel]);
            }
          }}
        >
          <DialogPrimitive.Title className="sr-only">Buscar en la herramienta</DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ir a… (encargos, clientes, bloc, ajustes)"
              className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
              aria-label="Buscar"
              role="combobox"
              aria-expanded
              aria-controls="cmdk-list"
              aria-activedescendant={results[sel] ? `cmd-${sel}` : undefined}
            />
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">Esc</kbd>
          </div>
          <div ref={listRef} id="cmdk-list" role="listbox" className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
            {results.length === 0 && (
              <div className="px-3 py-10 text-center text-sm text-muted-foreground">Nada coincide con «{q}».</div>
            )}
            {grouped.map((g) => (
              <div key={g.group} className="mb-1">
                <div className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {g.group}
                </div>
                {g.items.map(({ c, i }) => (
                  <button
                    key={c.id}
                    id={`cmd-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={i === sel}
                    type="button"
                    onMouseMove={() => setSel(i)}
                    onClick={() => go(c)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                      i === sel ? 'bg-accent text-accent-foreground' : 'text-foreground/90'
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-7 place-items-center rounded-md border bg-card',
                        i === sel && 'border-brand/40 text-brand'
                      )}
                    >
                      <c.icon className="size-4" />
                    </span>
                    <span className="flex-1 truncate">{c.label}</span>
                    {i === sel && <CornerDownLeft className="size-3.5 text-muted-foreground" />}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 border-t bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
            <span>
              <kbd className="font-mono">↑↓</kbd> moverse
            </span>
            <span>
              <kbd className="font-mono">Enter</kbd> abrir
            </span>
            <span className="ml-auto">Ctrl K en cualquier pantalla</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
