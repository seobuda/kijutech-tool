'use client';

// Proyecto → Palabras → Demanda (SEO parte 7, 27 nov 2026): lo que se busca y la web todavía no capta. Ideas de Google Ads
// agrupadas por si ya tienen página o no (plegables), para decidir cuáles seguir; y la intención real de los temas.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, ChevronRight, Lightbulb, Loader2, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Section } from '@/components/ui/page';
import type { DemandView, IdeaView } from '@/lib/seo/demanda/demanda';
import { generateIdeasAction, runDemandNowAction, setIdeaStatusAction } from '@/lib/seo/demanda-actions';

const INTENT: Record<string, string> = { local: 'Local (mapa)', transaccional: 'Contratar / comprar', informacional: 'Informarse', mixta: 'Mixta' };
const fmt = (n: number | null) => (n == null ? '—' : n.toLocaleString('es-ES'));

export function DemandaPanel({ projectId, view, canEdit }: { projectId: string; view: DemandView; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>('sin');
  const act = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.message ? { type: 'ok', text: r.message } : null) : { type: 'error', text: r.error });
      router.refresh();
    });

  const followed = view.ideas.filter((i) => i.status === 'seguida');
  const fresh = view.ideas.filter((i) => i.status === 'nueva');
  const groups: { key: string; title: string; hint: string; list: IdeaView[] }[] = [
    { key: 'sin', title: 'Sin página en la web', hint: 'Demanda que la web no puede captar todavía: candidatas a página nueva.', list: fresh.filter((i) => !i.topicUrl) },
    { key: 'con', title: 'Con un tema que ya tiene página', hint: 'Se pueden trabajar reforzando esa página.', list: fresh.filter((i) => i.topicUrl) },
    { key: 'seguidas', title: 'Seguidas en Posiciones', hint: 'Se comprueba su posición cada semana.', list: followed }
  ];
  const intents = Object.entries(view.intents).sort((a, b) => b[1] - a[1]);

  return (
    <Section
      title="Demanda"
      description="Lo que se busca en Google (volumen de Google Ads de las 3 búsquedas principales de cada tema: el total real es mayor) y la intención real de cada tema según los resultados de Google. Las ideas salen de sus servicios confirmados: decide cuáles seguir."
      actions={
        canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => runDemandNowAction(projectId))}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Volumen e intención
            </Button>
            <Button size="sm" disabled={pending} onClick={() => act(() => generateIdeasAction(projectId))}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Lightbulb className="size-3.5" />}
              Buscar ideas (≈ 0,09 $)
            </Button>
          </div>
        ) : undefined
      }
    >
      {msg && <p role="status" className={msg.type === 'ok' ? 'mb-2 text-sm text-success' : 'mb-2 text-sm text-destructive'}>{msg.text}</p>}
      <dl className="mb-4 grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-md border px-3 py-2">
          <dt className="text-muted-foreground">Búsquedas con volumen</dt>
          <dd className="text-lg font-semibold">{fmt(view.volumes)}</dd>
        </div>
        <div className="rounded-md border px-3 py-2">
          <dt className="text-muted-foreground">Temas con intención (SERP real)</dt>
          <dd className="text-lg font-semibold">{fmt(view.serps)}</dd>
        </div>
        <div className="rounded-md border px-3 py-2">
          <dt className="text-muted-foreground">Intención más frecuente</dt>
          <dd className="font-medium">{intents.length ? intents.map(([k, n]) => `${INTENT[k] ?? k} (${n})`).slice(0, 2).join(' · ') : '—'}</dd>
        </div>
      </dl>
      {view.ideas.length ? (
        <div className="flex flex-col gap-2">
          {groups.map((g) => {
            const isOpen = open === g.key;
            const vol = g.list.reduce((s, i) => s + (i.volume ?? 0), 0);
            return (
              <div key={g.key} className="rounded-md border">
                <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : g.key)}>
                  {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  <span className="font-medium">{g.title}</span>
                  <span className="text-muted-foreground">
                    {g.list.length} búsqueda{g.list.length === 1 ? '' : 's'} · {fmt(vol)} al mes
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t px-3 py-2">
                    <p className="mb-2 text-xs text-muted-foreground">{g.hint}</p>
                    {g.list.length ? (
                      <ul className="divide-y text-sm">
                        {g.list.slice(0, 50).map((i) => (
                          <li key={i.id} className="flex flex-wrap items-center gap-2 py-1.5">
                            <span className="min-w-0 flex-1 font-medium">{i.keyword}</span>
                            <span className="text-muted-foreground">{fmt(i.volume)}/mes</span>
                            {i.intent && <Badge tone="outline">{INTENT[i.intent] ?? i.intent}</Badge>}
                            {i.topicName && <span className="max-w-[14rem] truncate text-xs text-muted-foreground" title={i.topicName}>tema: {i.topicName}</span>}
                            {canEdit && i.status === 'nueva' && (
                              <>
                                <Button size="sm" variant="outline" className="h-7" disabled={pending} onClick={() => act(() => setIdeaStatusAction(projectId, i.id, 'seguida'))}>
                                  <Check className="size-3.5" />
                                  Seguir
                                </Button>
                                <Button size="icon" variant="ghost" className="size-7" aria-label="Descartar idea" disabled={pending} onClick={() => act(() => setIdeaStatusAction(projectId, i.id, 'descartada'))}>
                                  <X className="size-3.5" />
                                </Button>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nada aquí.</p>
                    )}
                    {g.list.length > 50 && <p className="mt-1 text-xs text-muted-foreground">Y {g.list.length - 50} más, de menos volumen.</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Aún no hay ideas. Con «Buscar ideas» se piden a Google Ads a partir de sus servicios confirmados (hace falta tenerlos en el Expediente).</p>
      )}
    </Section>
  );
}
