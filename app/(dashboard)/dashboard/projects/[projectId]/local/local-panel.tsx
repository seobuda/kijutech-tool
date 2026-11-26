'use client';

// Proyecto → Local: identificar la ficha de Google (proponer, confirmar o pegar el enlace de Maps), ver lo vigilado y los
// cambios (aceptarlos si los hicimos nosotros), reseñas frente a la competencia y el enlace para conseguir reseñas.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, ExternalLink, Loader2, MapPin, RefreshCw, Search, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState, Section } from '@/components/ui/page';
import type { LocalView, PlaceView } from '@/lib/seo/local/view';
import { acceptPlaceChangesAction, checkLocalNowAction, decidePlaceAction, proposeClientPlaceAction, proposeCompetitorPlacesAction, setPlaceFromUrlAction } from '@/lib/seo/local-actions';

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  abierta: { label: 'Abierta', tone: 'success' },
  cerrada_temporal: { label: 'Cerrada temporalmente', tone: 'danger' },
  cerrada_definitiva: { label: 'Cerrada definitivamente', tone: 'danger' }
};
const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('es-ES', { dateStyle: 'medium' }) : '—');
const mapsUrl = (cid: string) => `https://maps.google.com/?cid=${cid}`;

export function LocalPanel({ projectId, view, canEdit, clientName }: { projectId: string; view: LocalView; canEdit: boolean; clientName: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [url, setUrl] = useState('');
  const [compUrl, setCompUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const act = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, ok?: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.message || ok ? { type: 'ok', text: r.message ?? ok! } : null) : { type: 'error', text: r.error });
      router.refresh();
    });

  if (!view.clientId) return <EmptyState icon={MapPin} title="El proyecto no tiene cliente" description="Edita el proyecto y elige el cliente: la ficha de Google es del cliente." />;

  const message = `Hola, ¡gracias por confiar en ${clientName}! Si te ha gustado nuestro trabajo, nos ayudaría muchísimo que nos dejaras una reseña en Google (es un minuto): ${view.reviewLink ?? ''}`;
  const clientProposals = view.proposals.filter((p) => p.role === 'cliente');
  const compProposals = view.proposals.filter((p) => p.role === 'competidor');

  return (
    <div className="flex flex-col gap-6">
      {msg && (
        <p role="status" className={msg.type === 'ok' ? 'text-sm text-success' : 'text-sm text-destructive'}>
          {msg.text}
        </p>
      )}

      <Section
        title="Su ficha de Google"
        description="La que vigilamos. Los cambios se comparan con lo confirmado: si un cambio lo hicimos nosotros, acéptalo."
        actions={
          canEdit && view.client ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => checkLocalNowAction(projectId))}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Comprobar ahora
            </Button>
          ) : undefined
        }
      >
        {view.client ? (
          <ClientCard p={view.client} canEdit={canEdit} pending={pending} onAccept={() => act(() => acceptPlaceChangesAction(projectId, view.client!.id))} />
        ) : (
          <div className="flex flex-col gap-3">
            {clientProposals.length > 0 ? (
              clientProposals.map((p) => (
                <div key={p.id} className="rounded-lg border p-3">
                  <PlaceLine p={p} />
                  <p className={p.matches ? 'mt-1 text-xs text-success' : 'mt-1 text-xs text-warning-strong'}>{p.matches ? 'Coincide su web o su teléfono con la ficha del cliente.' : 'No coincide ni la web ni el teléfono: comprueba que sea la suya.'}</p>
                  {canEdit && (
                    <span className="mt-2 flex gap-2">
                      <Button size="sm" className="bg-brand text-white hover:bg-brand/90" disabled={pending} onClick={() => act(() => decidePlaceAction(projectId, p.id, 'confirmada'), 'Confirmada: desde ahora se vigila cada semana.')}>
                        <Check className="size-3.5" />
                        Es la suya
                      </Button>
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => decidePlaceAction(projectId, p.id, 'descartada'))}>
                        <X className="size-3.5" />
                        No es la suya
                      </Button>
                    </span>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Aún no sabemos cuál es su ficha de Google.</p>
            )}
            {canEdit && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => proposeClientPlaceAction(projectId))}>
                  <Search className="size-3.5" />
                  Buscarla por nombre y población
                </Button>
                <span className="text-xs text-muted-foreground">o</span>
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(() => setPlaceFromUrlAction(projectId, url, 'cliente'));
                    setUrl('');
                  }}
                >
                  <label className="sr-only" htmlFor="maps-url">
                    Enlace de Google Maps de su ficha
                  </label>
                  <Input id="maps-url" className="h-9" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Pega el enlace de su ficha en Google Maps" />
                  <Button size="sm" type="submit" disabled={pending || url.trim().length < 6}>
                    Guardar
                  </Button>
                </form>
              </div>
            )}
          </div>
        )}
      </Section>

      <Section
        title="Reseñas frente a la competencia"
        description="Nota, número de reseñas y reseñas nuevas al mes (aproximado, por la diferencia entre comprobaciones). Solo competidores con ficha confirmada."
        actions={
          canEdit ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => proposeCompetitorPlacesAction(projectId))}>
              <Search className="size-3.5" />
              Buscar las fichas de los competidores
            </Button>
          ) : undefined
        }
      >
        {compProposals.length > 0 && (
          <div className="mb-3 rounded-lg border border-warning/40 bg-warning-soft p-3">
            <p className="mb-2 text-sm font-medium">Fichas propuestas para los competidores: confirma que son las suyas.</p>
            <ul className="flex flex-col gap-2">
              {compProposals.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{p.competitorName ?? '—'}</span>→<PlaceLine p={p} compact />
                  {canEdit && (
                    <span className="ml-auto flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7" disabled={pending} onClick={() => act(() => decidePlaceAction(projectId, p.id, 'confirmada'))}>
                        <Check className="size-3.5" />
                        Sí
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7" disabled={pending} onClick={() => act(() => decidePlaceAction(projectId, p.id, 'descartada'))}>
                        <X className="size-3.5" />
                        No
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-2 font-medium">Negocio</th>
                <th className="px-2 font-medium">Nota</th>
                <th className="px-2 font-medium">Reseñas</th>
                <th className="px-2 font-medium">Nuevas al mes</th>
                <th className="px-2 font-medium">Categoría</th>
              </tr>
            </thead>
            <tbody>
              {[...(view.client ? [view.client] : []), ...view.competitors].map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className={`py-2 pr-2 ${p.role === 'cliente' ? 'font-semibold' : ''}`}>{p.snap?.title ?? p.title}</td>
                  <td className="px-2 tabular-nums">
                    {p.snap?.rating ?? '—'} <Star className="inline size-3 text-warning" aria-hidden />
                  </td>
                  <td className="px-2 tabular-nums">{p.snap?.votes ?? '—'}</td>
                  <td className="px-2 tabular-nums text-muted-foreground">{p.votesMonth ?? '—'}</td>
                  <td className="px-2 text-muted-foreground">{p.snap?.category ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canEdit && (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              act(() => setPlaceFromUrlAction(projectId, compUrl, 'competidor'));
              setCompUrl('');
            }}
          >
            <label className="sr-only" htmlFor="comp-url">
              Enlace de Google Maps de un competidor
            </label>
            <Input id="comp-url" className="h-9 max-w-md" value={compUrl} onChange={(e) => setCompUrl(e.target.value)} placeholder="Añadir un competidor: pega su enlace de Google Maps" />
            <Button size="sm" type="submit" variant="outline" disabled={pending || compUrl.trim().length < 6}>
              Añadir
            </Button>
          </form>
        )}
      </Section>

      <Section title="Conseguir reseñas" description="Enlace directo para que sus clientes escriban una reseña, y un texto para enviarlo por WhatsApp o correo. Lo ideal: pedirla justo después de cada trabajo, varias al mes.">
        {view.reviewLink ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <code className="max-w-full truncate rounded bg-muted px-2 py-1 text-xs">{view.reviewLink}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard?.writeText(view.reviewLink!).then(() => setCopied(true)).catch(() => undefined);
                }}
              >
                <Copy className="size-3.5" />
                {copied ? 'Copiado' : 'Copiar enlace'}
              </Button>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Texto propuesto (cópialo y adáptalo):</p>
              <p className="rounded-lg border bg-muted/40 p-3 text-sm">{message}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aparece cuando su ficha de Google esté confirmada.</p>
        )}
      </Section>
    </div>
  );
}

function PlaceLine({ p, compact }: { p: PlaceView; compact?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">{p.snap?.title ?? p.title}</span>
      {!compact && p.snap?.category && <span className="text-muted-foreground">{p.snap.category}</span>}
      {p.snap?.rating != null && (
        <span className="text-muted-foreground">
          {p.snap.rating} ★ ({p.snap.votes ?? 0})
        </span>
      )}
      <a href={mapsUrl(p.cid)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline underline-offset-2">
        Ver en Maps <ExternalLink className="size-3" />
      </a>
    </span>
  );
}

function ClientCard({ p, canEdit, pending, onAccept }: { p: PlaceView; canEdit: boolean; pending: boolean; onAccept: () => void }) {
  const st = p.snap?.status ? STATUS[p.snap.status] : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <PlaceLine p={p} />
        {st && <Badge tone={st.tone}>{st.label}</Badge>}
        {p.snap?.isClaimed === false && <Badge tone="warning">Sin reclamar</Badge>}
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div>
          <dt className="inline text-muted-foreground">Categoría: </dt>
          <dd className="inline">{p.snap?.category ?? '—'}{p.snap?.additionalCategories?.length ? ` (+ ${p.snap.additionalCategories.join(', ')})` : ''}</dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Teléfono: </dt>
          <dd className="inline">{p.snap?.phone ?? '—'}</dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Web: </dt>
          <dd className="inline">{p.snap?.domain ?? '—'}</dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Última comprobación: </dt>
          <dd className="inline">{fmt(p.snap?.takenAt)}</dd>
        </div>
      </dl>
      {p.changed.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm">
          <p>
            Ha cambiado respecto a lo confirmado: <b>{p.changed.join(', ')}</b>. Si no lo pedimos, revísalo en Business Profile (pueden ser ediciones de Google).
          </p>
          {canEdit && (
            <Button size="sm" variant="outline" className="mt-2" disabled={pending} onClick={onAccept}>
              Lo cambiamos nosotros: aceptar el cambio
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
