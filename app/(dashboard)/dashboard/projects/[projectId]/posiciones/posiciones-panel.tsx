'use client';

// Proyecto → Posiciones: parte interactiva (añadir, pausar o quitar búsquedas, consultar ahora) y la tabla con la
// posición, el cambio, el mapa, la IA y la evolución. Mientras hay una consulta en curso, se refresca sola.
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Bot, Loader2, MapPin, Minus, Pause, Play, Plus, RefreshCw, TrendingUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState, Section } from '@/components/ui/page';
import type { PositionRow, PositionsView } from '@/lib/seo/posiciones/view';
import { addRankKeywordAction, checkPositionsNowAction, setRankKeywordStatusAction } from '@/lib/seo/posiciones-actions';

const ORIGIN: Record<string, string> = { gsc: 'Search Console', servicio_zona: 'Servicio + zona', marca: 'Marca', manual: 'Añadida a mano' };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const path = (u: string | null) => {
  if (!u) return '';
  try {
    return decodeURI(new URL(u).pathname) || '/';
  } catch {
    return u;
  }
};

function Delta({ now, prev }: { now: number | null; prev: number | null }) {
  if (now === null || prev === null) return <span className="text-xs text-muted-foreground">—</span>;
  const d = prev - now;
  if (d === 0) return <Minus className="size-3.5 text-muted-foreground" aria-label="Igual" />;
  return d > 0 ? (
    <span className="inline-flex items-center text-xs text-success">
      <ArrowUp className="size-3.5" aria-hidden />
      {d}
    </span>
  ) : (
    <span className="inline-flex items-center text-xs text-destructive">
      <ArrowDown className="size-3.5" aria-hidden />
      {-d}
    </span>
  );
}

function Spark({ values }: { values: (number | null)[] }) {
  const pts = values.map((v, i) => ({ i, v })).filter((p) => p.v !== null) as { i: number; v: number }[];
  if (pts.length < 2) return null;
  const w = 64;
  const h = 18;
  const n = Math.max(1, values.length - 1);
  // Posición 1 arriba, 21+ abajo.
  const y = (v: number) => (Math.min(v, 21) - 1) / 20 * h;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="text-brand" role="img" aria-label={`Evolución: ${values.map((v) => v ?? '>20').join(', ')}`}>
      <polyline points={pts.map((p) => `${(p.i / n) * w},${y(p.v)}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function PosicionesPanel({ projectId, view, canEdit }: { projectId: string; view: PositionsView; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [kw, setKw] = useState('');
  const [showPaused, setShowPaused] = useState(false);

  useEffect(() => {
    if (!view.inProgress) return;
    const t = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(t);
  }, [view.inProgress, router]);

  const act = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, ok?: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.message || ok ? { type: 'ok', text: r.message ?? ok! } : null) : { type: 'error', text: r.error });
      router.refresh();
    });

  const active = view.rows.filter((r) => r.status === 'activa');
  const paused = view.rows.filter((r) => r.status === 'pausada');
  const s = view.summary;

  const consult = canEdit && (
    <Button size="sm" variant="outline" disabled={pending || view.inProgress > 0} onClick={() => act(() => checkPositionsNowAction(projectId))}>
      {view.inProgress ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
      {view.inProgress ? `Consultando (${view.inProgress})…` : 'Consultar ahora'}
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      {msg && (
        <p role="status" className={msg.type === 'ok' ? 'text-sm text-success' : 'text-sm text-destructive'}>
          {msg.text}
        </p>
      )}
      {!view.rows.length ? (
        <EmptyState
          icon={TrendingUp}
          title="Aún no hay búsquedas que seguir"
          description="Se preparan solas con la primera consulta semanal: las principales de Search Console, sus servicios × su zona (confírmalos en el Expediente) y su marca. Puedes lanzarla ya o añadir búsquedas a mano."
          action={consult || undefined}
        />
      ) : (
        <>
          <Section
            title="Resumen de la última consulta"
            description={`${fmt(view.lastCheck)} · desde ${view.location ?? '—'} · móvil${view.failedLast ? ` · ${view.failedLast} búsqueda(s) sin respuesta` : ''}`}
            actions={consult || undefined}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="En el top 3" value={`${s.top3} de ${s.tracked}`} />
              <Stat label="En la 1.ª página" value={`${s.top10} de ${s.tracked}`} />
              <Stat label="En el mapa" value={`${s.inPack} de ${s.packs}`} hint="Búsquedas en las que sale en el mapa, de las que tienen mapa" />
              <Stat label="Le cita la IA" value={`${s.aioCites} de ${s.aio}`} hint="AI Overview que citan su web, de los que hay" />
            </div>
            {view.share.length > 1 && (
              <div className="mt-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cuota de visibilidad (top 10, ponderada por búsquedas)</p>
                <ul className="flex flex-col gap-1">
                  {view.share.map((d) => (
                    <li key={d.domain} className="flex items-center gap-2 text-sm">
                      <span className={`w-48 truncate ${d.isClient ? 'font-semibold' : ''}`}>{d.domain}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded bg-muted">
                        <span className={`block h-full ${d.isClient ? 'bg-brand' : 'bg-muted-foreground/40'}`} style={{ width: `${Math.min(100, d.share)}%` }} />
                      </span>
                      <span className="w-12 text-right tabular-nums">{d.share} %</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>

          <Section title={`Búsquedas que se siguen (${active.length})`} description="Posición del resultado normal (sin dato = más allá del 20), cambio frente a la semana anterior, mapa, IA y evolución.">
            {canEdit && (
              <form
                className="mb-3 flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  act(() => addRankKeywordAction(projectId, kw), 'Añadida: entra en la próxima consulta.');
                  setKw('');
                }}
              >
                <label className="sr-only" htmlFor="kw-new">
                  Búsqueda nueva
                </label>
                <Input id="kw-new" className="h-9 max-w-sm" value={kw} onChange={(e) => setKw(e.target.value)} placeholder="p. ej. reformas de oficinas barcelona" />
                <Button size="sm" type="submit" disabled={pending || kw.trim().length < 3}>
                  <Plus className="size-3.5" />
                  Añadir búsqueda
                </Button>
              </form>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">Búsqueda</th>
                    <th className="px-2 font-medium">Posición</th>
                    <th className="px-2 font-medium">Cambio</th>
                    <th className="px-2 font-medium">Mapa</th>
                    <th className="px-2 font-medium">IA</th>
                    <th className="px-2 font-medium">Evolución</th>
                    <th className="px-2 font-medium">Búsquedas/mes</th>
                    {canEdit && <th className="pl-2" />}
                  </tr>
                </thead>
                <tbody>
                  {active.map((r) => (
                    <Row key={r.id} r={r} canEdit={canEdit} pending={pending} onStatus={(st) => act(() => setRankKeywordStatusAction(projectId, r.id, st))} />
                  ))}
                </tbody>
              </table>
            </div>
            {paused.length > 0 && (
              <div className="mt-3">
                <Button size="sm" variant="ghost" onClick={() => setShowPaused(!showPaused)}>
                  {showPaused ? 'Ocultar' : 'Ver'} las pausadas ({paused.length})
                </Button>
                {showPaused && (
                  <ul className="mt-1 flex flex-col gap-1 text-sm">
                    {paused.map((r) => (
                      <li key={r.id} className="flex items-center gap-2">
                        <span className="text-muted-foreground">{r.keyword}</span>
                        {canEdit && (
                          <Button size="sm" variant="ghost" className="h-7" disabled={pending} onClick={() => act(() => setRankKeywordStatusAction(projectId, r.id, 'activa'))}>
                            <Play className="size-3.5" />
                            Reanudar
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border p-3" title={hint}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Row({ r, canEdit, pending, onStatus }: { r: PositionRow; canEdit: boolean; pending: boolean; onStatus: (s: 'pausada' | 'quitada') => void }) {
  return (
    <tr className="border-b last:border-0 align-top">
      <td className="py-2 pr-2">
        <p className="font-medium">{r.keyword}</p>
        <p className="text-xs text-muted-foreground">
          {ORIGIN[r.origin] ?? r.origin}
          {r.language === 'ca' ? ' · catalán' : ''}
          {r.url ? ` · ${path(r.url)}` : ''}
        </p>
      </td>
      <td className="px-2 tabular-nums">{r.checkedAt ? (r.position ?? <span className="text-muted-foreground">&gt;20</span>) : <span className="text-muted-foreground">pendiente</span>}</td>
      <td className="px-2">
        <Delta now={r.position} prev={r.prev} />
      </td>
      <td className="px-2">
        {r.localPack ? (
          r.localRank ? (
            <Badge tone="success">
              <MapPin className="size-3" /> {r.localRank}.º
            </Badge>
          ) : (
            <Badge tone="warning">No sale</Badge>
          )
        ) : (
          <span className="text-xs text-muted-foreground">sin mapa</span>
        )}
      </td>
      <td className="px-2">
        {r.aio ? (
          r.aioCites ? (
            <Badge tone="success">
              <Bot className="size-3" /> le cita
            </Badge>
          ) : (
            <Badge tone="neutral">no le cita</Badge>
          )
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-2">
        <Spark values={r.history} />
      </td>
      <td className="px-2 tabular-nums text-muted-foreground">{r.volume ?? '—'}</td>
      {canEdit && (
        <td className="pl-2 text-right">
          <span className="inline-flex gap-1">
            <Button size="sm" variant="ghost" className="h-7 px-2" aria-label={`Pausar «${r.keyword}»`} disabled={pending} onClick={() => onStatus('pausada')}>
              <Pause className="size-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2" aria-label={`Quitar «${r.keyword}»`} disabled={pending} onClick={() => onStatus('quitada')}>
              <X className="size-3.5" />
            </Button>
          </span>
        </td>
      )}
    </tr>
  );
}
