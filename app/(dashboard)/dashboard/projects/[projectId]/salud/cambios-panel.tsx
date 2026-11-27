'use client';

// Proyecto → Salud → Páginas de dinero y Cambios en la web (SEO parte 6, 6b, 27 nov 2026). Las páginas que más importan,
// vigiladas cada pocas horas, y la línea de tiempo de lo que ha cambiado en la web (agrupada por día, plegable).
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, ExternalLink, Loader2, Pin, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, Section } from '@/components/ui/page';
import type { MoneyView } from '@/lib/seo/cambios/dinero';
import type { ChangeView } from '@/lib/seo/cambios/registro';
import { pinMoneyPageAction, unpinMoneyPageAction } from '@/lib/seo/cambios-actions';

const REASON: Record<string, string> = { home: 'Portada', top: 'Más clics', pinned: 'Fijada', encargo: 'Encargo' };
const FIELD: Record<string, string> = {
  title: 'Título',
  meta_description: 'Descripción',
  h1: 'H1',
  canonical: 'Canonical',
  indexable: 'Indexable',
  status: 'Respuesta',
  content: 'Texto',
  schema: 'Datos estructurados',
  url_new: 'Página nueva',
  url_gone: 'Página que ya no aparece',
  host: 'Dominio',
  tech: 'Tecnología'
};
const PENDING: Record<string, string> = { estado: 'no responde bien', noindex: 'noindex', canonical: 'canonical a otra', titulo: 'sin título', h1: 'sin H1', contenido: 'perdió texto' };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const day = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
const path = (u: string) => {
  try {
    const x = new URL(u);
    return x.pathname === '/' ? x.hostname : x.pathname;
  } catch {
    return u;
  }
};

export function CambiosPanel({ projectId, money, changes, canEdit }: { projectId: string; money: MoneyView[]; changes: ChangeView[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [url, setUrl] = useState('');
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const act = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.message ? { type: 'ok', text: r.message } : null) : { type: 'error', text: r.error });
      router.refresh();
    });

  // Cambios agrupados por día y, dentro, por página: se ve el resumen y se despliega el detalle.
  const days = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = f ? changes.filter((c) => c.url.toLowerCase().includes(f) || (FIELD[c.field] ?? c.field).toLowerCase().includes(f)) : changes;
    const m = new Map<string, Map<string, ChangeView[]>>();
    for (const c of list) {
      const d = c.detectedAt.slice(0, 10);
      const byUrl = m.get(d) ?? new Map<string, ChangeView[]>();
      byUrl.set(c.url, [...(byUrl.get(c.url) ?? []), c]);
      m.set(d, byUrl);
    }
    return [...m].map(([d, byUrl]) => ({ d, iso: [...byUrl.values()][0][0].detectedAt, pages: [...byUrl] }));
  }, [changes, filter]);

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Páginas de dinero"
        description="Las páginas que más importan, comprobadas cada pocas horas: si una deja de responder, pasa a noindex, cambia el canonical, se queda sin título o H1 o pierde la mitad del texto, se confirma a los 30 min y avisa. La portada, las 5 con más clics y las de encargos en curso entran solas."
      >
        {msg && <p role="status" className={msg.type === 'ok' ? 'mb-2 text-sm text-success' : 'mb-2 text-sm text-destructive'}>{msg.text}</p>}
        {money.length ? (
          <ul className="divide-y rounded-md border text-sm">
            {money.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <a href={m.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-medium hover:underline" title={m.url}>
                  {m.title || path(m.url)}
                  <span className="ml-2 font-normal text-muted-foreground">{path(m.url)}</span>
                </a>
                {m.reasons.map((r) => (
                  <Badge key={r} tone="outline">{REASON[r] ?? r}</Badge>
                ))}
                {m.pending ? (
                  <Badge tone="warning">Confirmando: {PENDING[m.pending] ?? m.pending}</Badge>
                ) : m.failStreak >= 2 ? (
                  <Badge tone="outline">No se pudo leer ({m.failStreak})</Badge>
                ) : m.status != null ? (
                  <Badge tone={m.status >= 200 && m.status < 300 && m.indexable ? "success" : "danger"}>{m.status >= 200 && m.status < 300 ? (m.indexable ? 'Bien' : 'noindex') : m.status}</Badge>
                ) : (
                  <Badge tone="outline">Sin comprobar</Badge>
                )}
                <span className="text-xs text-muted-foreground">{fmt(m.lastCheckedAt)}</span>
                {canEdit && m.reasons.includes('pinned') && (
                  <Button size="icon" variant="ghost" className="size-7" aria-label="Quitar de las fijadas" disabled={pending} onClick={() => act(() => unpinMoneyPageAction(projectId, m.id))}>
                    <X className="size-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Aún no hay páginas vigiladas: se añaden solas en la próxima pasada (portada y las de más clics).</p>
        )}
        {canEdit && (
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim()) act(() => pinMoneyPageAction(projectId, url.trim()));
              setUrl('');
            }}
          >
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… (una página de la web del proyecto)" className="max-w-md" aria-label="Página a fijar" />
            <Button type="submit" size="sm" variant="outline" disabled={pending || !url.trim()}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Pin className="size-3.5" />}
              Fijar una página
            </Button>
          </form>
        )}
      </Section>

      <Section title="Cambios en la web" description="Lo que ha cambiado (últimos 90 días): entre un rastreo y el anterior, y en las páginas de dinero. Sirve para saber cuándo se hizo un cambio y relacionarlo con subidas o bajadas. No son problemas: los problemas son los hallazgos.">
        {changes.length ? (
          <>
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar por página o por tipo de cambio" className="mb-3 max-w-sm" aria-label="Filtrar cambios" />
            <div className="flex flex-col gap-2">
              {days.map((g) => {
                const isOpen = open === g.d;
                const total = g.pages.reduce((s, [, cs]) => s + cs.length, 0);
                const kinds = [...new Set(g.pages.flatMap(([, cs]) => cs.map((c) => FIELD[c.field] ?? c.field)))];
                return (
                  <div key={g.d} className="rounded-md border">
                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : g.d)}>
                      {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      <span className="font-medium capitalize">{day(g.iso)}</span>
                      <span className="text-muted-foreground">
                        {total} cambio{total === 1 ? '' : 's'} en {g.pages.length} página{g.pages.length === 1 ? '' : 's'} · {kinds.slice(0, 4).join(', ')}
                        {kinds.length > 4 ? '…' : ''}
                      </span>
                    </button>
                    {isOpen && (
                      <ul className="divide-y border-t text-sm">
                        {g.pages.map(([u, cs]) => (
                          <li key={u} className="px-3 py-2">
                            <p className="font-medium">
                              {u === '*' ? (
                                'Toda la web (cambio de plantilla)'
                              ) : (
                                <a href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
                                  {path(u)}
                                  <ExternalLink className="size-3" />
                                </a>
                              )}
                            </p>
                            <ul className="mt-1 flex flex-col gap-1">
                              {cs.map((c) => (
                                <li key={c.id} className="text-muted-foreground">
                                  <span className="text-foreground">{FIELD[c.field] ?? c.field}</span>
                                  {c.extra && typeof c.extra.pages === 'number' ? ` (${c.extra.pages} páginas)` : ''}: {c.before ? <span className="line-through">{c.before.slice(0, 140)}</span> : null}
                                  {c.before && c.after ? ' → ' : ''}
                                  {c.after ? <span>{c.after.slice(0, 140)}</span> : null}
                                  <span className="ml-2 text-xs">({c.source === 'dinero' ? 'vigilancia' : 'rastreo'}{c.prevObservedAt ? `, entre ${fmt(c.prevObservedAt)} y ${fmt(c.detectedAt)}` : ''})</span>
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Aún no hay cambios: se apuntan a partir del segundo rastreo y de la segunda comprobación de las páginas de dinero.</p>
        )}
      </Section>
    </div>
  );
}
