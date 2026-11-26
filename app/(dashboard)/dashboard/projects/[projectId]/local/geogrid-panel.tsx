'use client';

// Proyecto → Local → Mapa por zonas (SEO parte 5b, 27 nov 2026): cuadrícula 5×5 alrededor del negocio con el puesto en el
// mapa de Google desde cada punto (sin teselas de mapa: ni dependencias ni datos a terceros), la comparación con la
// medición anterior y los competidores con nombre sospechoso (descartar o sugerir la edición a Google, a mano).
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Grid3x3, Loader2, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, Section } from '@/components/ui/page';
import type { GeogridView, GridCell } from '@/lib/seo/local/geogrid-view';
import { checkGeogridNowAction } from '@/lib/seo/local-actions';
import { decideSaludFindingAction } from '@/lib/seo/salud-actions';

const tone = (c: GridCell) => (c.status !== 'hecha' ? 'bg-muted text-muted-foreground' : c.rank === null ? 'bg-destructive/20 text-destructive' : c.rank <= 3 ? 'bg-success/25 text-success' : c.rank <= 10 ? 'bg-warning/25 text-warning-strong' : 'bg-destructive/15 text-destructive');
const label = (c: GridCell) => (c.status === 'pendiente' || c.status === 'enviada' ? '…' : c.status !== 'hecha' ? '·' : c.rank === null ? '20+' : String(c.rank));

export function GeogridPanel({ projectId, grid, canEdit }: { projectId: string; grid: GeogridView; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  useEffect(() => {
    if (!grid.inProgress) return;
    const t = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(t);
  }, [grid.inProgress, router]);
  const act = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, ok?: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.message || ok ? { type: 'ok', text: r.message ?? ok! } : null) : { type: 'error', text: r.error });
      router.refresh();
    });

  return (
    <Section
      title="Mapa por zonas"
      description="En qué puesto del mapa de Google sale desde cada punto de una cuadrícula alrededor del negocio (norte arriba; el centro es su ficha). Verde: top 3; ámbar: 4-10; rojo: más abajo o no sale. Se mide cada mes en horario comercial."
      actions={
        canEdit ? (
          <Button size="sm" variant="outline" disabled={pending || grid.inProgress > 0} onClick={() => act(() => checkGeogridNowAction(projectId))}>
            {grid.inProgress ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            {grid.inProgress ? `Midiendo (${grid.inProgress})…` : 'Medir ahora'}
          </Button>
        ) : undefined
      }
    >
      {msg && (
        <p role="status" className={msg.type === 'ok' ? 'mb-2 text-sm text-success' : 'mb-2 text-sm text-destructive'}>
          {msg.text}
        </p>
      )}
      {!grid.runs.length ? (
        <EmptyState icon={Grid3x3} title="Aún no hay mediciones" description="Necesita la ficha de Google confirmada (arriba), sus servicios confirmados en el Expediente y saber cómo atiende. Se mide sola cada mes o con «Medir ahora»." />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {grid.runs.map((r) => (
            <div key={r.keyword}>
              <p className="font-medium">«{r.keyword}»</p>
              <p className="mb-2 text-xs text-muted-foreground">
                {new Date(r.createdAt).toLocaleDateString('es-ES', { dateStyle: 'medium' })} · cubre ± {Math.round(r.stepKm * 2 * 10) / 10} km
              </p>
              <div className="grid w-fit grid-cols-5 gap-1" role="table" aria-label={`Puesto en el mapa para «${r.keyword}» por zonas`}>
                {r.cells.map((c) => (
                  <div
                    key={`${c.row}-${c.col}`}
                    role="cell"
                    title={c.top.length ? `Top 3 aquí: ${c.top.map((t) => `${t.r}. ${t.t}`).join(' · ')}` : undefined}
                    className={`flex size-11 items-center justify-center rounded text-sm font-semibold tabular-nums ${tone(c)} ${c.row === 2 && c.col === 2 ? 'ring-2 ring-brand' : ''}`}
                  >
                    {label(c)}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-sm">
                Media: <b className="tabular-nums">{r.avg ?? '—'}</b>
                {r.prevAvg !== null && <span className="text-muted-foreground"> (antes {r.prevAvg})</span>} · Top 3: <b className="tabular-nums">{r.top3Pct} %</b>
                {r.prevTop3Pct !== null && <span className="text-muted-foreground"> (antes {r.prevTop3Pct} %)</span>}
              </p>
            </div>
          ))}
        </div>
      )}
      {grid.suspicious.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Competidores con nombre sospechoso</p>
          <p className="mb-2 text-xs text-muted-foreground">Google exige que el nombre sea el real del negocio. Si este nombre está relleno de palabras clave, se puede sugerir la corrección en su ficha («Sugerir una edición» → nombre). Si su rótulo real es así, descártalo y no volverá a salir.</p>
          <ul className="flex flex-col gap-2">
            {grid.suspicious.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
                <span className="font-medium">{s.title}</span>
                <span className="text-xs text-muted-foreground">
                  {s.signals.join(' · ')}
                  {s.points ? ` · top 3 en ${s.points} puntos` : ''}
                </span>
                {s.url && (
                  <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline underline-offset-2">
                    Ver en Maps <ExternalLink className="size-3" />
                  </a>
                )}
                {canEdit && (
                  <Button size="sm" variant="ghost" className="ml-auto h-7" disabled={pending} onClick={() => act(() => decideSaludFindingAction(projectId, s.id, 'descartado', 'Nombre real del negocio'), 'Descartado: no volverá a salir.')}>
                    <X className="size-3.5" />
                    Es su nombre real
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
