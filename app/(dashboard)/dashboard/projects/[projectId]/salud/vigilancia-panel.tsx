'use client';

// Proyecto → Salud técnica → Vigilancia automática (SEO parte 0, 26 nov 2026): los procesos que se repiten solos en este
// proyecto (vigilancia de la web, auditoría, velocidad y detectores), con su frecuencia editable, pausa y «Comprobar
// ahora», y el gasto del mes en datos de pago frente al tope.
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pause, Play, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Section } from '@/components/ui/page';
import type { VigilanciaView } from '@/lib/seo/vigilancia/view';
import { everyLabel } from '@/lib/seo/vigilancia/rules';
import { pauseVigilanciaAction, runVigilanciaNowAction, setVigilanciaEveryAction } from '@/lib/seo/vigilancia-actions';

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const usd = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;

export function VigilanciaPanel({ projectId, view, canEdit }: { projectId: string; view: VigilanciaView; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const act = (key: string, fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, okText: string) => {
    setBusy(key);
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { type: 'ok', text: r.message ?? okText } : { type: 'error', text: r.error });
      setBusy(null);
      router.refresh();
    });
  };

  // Mientras algo está en cola o en marcha, la pantalla se refresca sola cada 15 s para enseñar el resultado.
  const anyRunning = view.processes.some((p) => p.running);
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(t);
  }, [anyRunning, router]);

  const pct = view.spend.budget > 0 ? Math.min(100, Math.round((view.spend.spent / view.spend.budget) * 100)) : 0;

  return (
    <Section
      title="Vigilancia automática"
      description="Lo que se repite solo en este proyecto. Si la web se cae o deja de indexarse, se vuelve a comprobar a los 30 minutos y, si sigue, te avisa por Telegram. Lo que encuentra aparece abajo como hallazgo."
    >
      {view.processes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin vigilancia: el proyecto necesita una web en su alcance (Editar proyecto → web del cliente).</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {view.processes.map((p) => {
            const paused = Boolean(p.pausedUntil);
            return (
              <li key={p.key} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {p.label}{' '}
                    {!p.enabled ? (
                      <Badge tone="neutral">Apagado</Badge>
                    ) : paused ? (
                      <Badge tone="warning">En pausa hasta el {fmt(p.pausedUntil)}</Badge>
                    ) : p.lastStatus === 'error' ? (
                      <Badge tone="danger">Falló la última vez</Badge>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.running ? (
                      <span className="inline-flex items-center gap-1 text-brand">
                        <Loader2 className="size-3 animate-spin" /> En marcha…
                      </span>
                    ) : (
                      <>Última: {fmt(p.last?.at ?? p.lastRunAt)}</>
                    )}{' '}
                    · Próxima: {paused ? '—' : fmt(p.nextRunAt)}
                  </p>
                  {p.last && !p.running && (
                    <p className={p.last.status === 'error' ? 'text-xs text-destructive' : p.last.status === 'aviso' ? 'text-xs text-warning-strong' : 'text-xs text-muted-foreground'}>
                      {p.last.status === 'omitido' ? 'No se hizo: ' : ''}
                      {p.last.summary}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`every-${p.key}`}>
                    Frecuencia de {p.label}
                  </label>
                  <select
                    id={`every-${p.key}`}
                    className="h-8 rounded-md border bg-background px-2 text-sm"
                    value={p.every}
                    disabled={!canEdit || pending}
                    onChange={(e) => act(p.key, () => setVigilanciaEveryAction(projectId, p.key, Number(e.target.value)), 'Frecuencia guardada.')}
                  >
                    {p.options.map((o) => (
                      <option key={o} value={o}>
                        {everyLabel(o)}
                      </option>
                    ))}
                  </select>
                  {canEdit && (
                    <>
                      <Button size="sm" variant="outline" disabled={pending || !p.enabled} onClick={() => act(p.key, () => runVigilanciaNowAction(projectId, p.key), 'En marcha.')}>
                        {busy === p.key && pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                        Comprobar ahora
                      </Button>
                      {paused ? (
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => act(p.key, () => pauseVigilanciaAction(projectId, p.key, 0), 'Reanudado.')}>
                          <Play className="size-3.5" />
                          Reanudar
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" disabled={pending || !p.enabled} onClick={() => act(p.key, () => pauseVigilanciaAction(projectId, p.key, 30), 'En pausa 30 días.')}>
                          <Pause className="size-3.5" />
                          Pausar 30 días
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {msg && (
        <p role="status" className={msg.type === 'ok' ? 'mt-2 text-sm text-success' : 'mt-2 text-sm text-destructive'}>
          {msg.text}
        </p>
      )}
      <div className="mt-4 rounded-lg border p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Gasto en datos de pago este mes</span>
          <span>
            {usd(view.spend.spent)} de {usd(view.spend.budget)}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Gasto del mes frente al tope">
          <div className={pct >= 100 ? 'h-full bg-destructive' : pct >= 80 ? 'h-full bg-warning' : 'h-full bg-brand'} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {view.spend.byOperation.length
            ? view.spend.byOperation.map((o) => `${o.operation}: ${usd(o.usd)}`).join(' · ')
            : 'Nada gastado este mes.'}{' '}
          Al llegar al tope, lo automático espera al mes siguiente. El tope se cambia en Configuración SEO.
        </p>
      </div>
    </Section>
  );
}
