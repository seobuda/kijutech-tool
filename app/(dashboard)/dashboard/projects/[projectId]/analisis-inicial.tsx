'use client';

// Análisis inicial del proyecto (docs/PLAN-SEO-JEFE.md, D0): mapa de etapas con su estado, lo que falta y quién lo hace,
// las conexiones, «Empezar análisis» y, para administradores, «Continuar sin esto». El color nunca va solo (icono y texto).
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Circle, Clock, Hand, Loader2, MinusCircle, Play, RefreshCw, SkipForward, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import type { SetupView } from '@/lib/seo/arranque/arranque';
import { CONN_LABEL, STAGE_LABEL, type StageStatus } from '@/lib/seo/arranque/rules';
import { advanceNowAction, skipSetupItemAction, startAnalysisAction } from '@/lib/seo/arranque-actions';

const ST: Record<StageStatus, { label: string; icon: typeof Check; cls: string }> = {
  hecho: { label: 'Hecho', icon: Check, cls: 'bg-success-soft text-success' },
  sin_datos: { label: 'Sin datos', icon: MinusCircle, cls: 'bg-muted text-muted-foreground' },
  omitido: { label: 'Omitido', icon: SkipForward, cls: 'bg-muted text-muted-foreground' },
  en_curso: { label: 'En curso', icon: Loader2, cls: 'bg-info-soft text-info' },
  esperando_persona: { label: 'Te toca', icon: Hand, cls: 'bg-warning-soft text-warning-strong' },
  bloqueado: { label: 'Bloqueado', icon: AlertTriangle, cls: 'bg-destructive-soft text-destructive' },
  error: { label: 'Error', icon: XCircle, cls: 'bg-destructive-soft text-destructive' },
  pendiente: { label: 'Pendiente', icon: Circle, cls: 'bg-muted text-muted-foreground' }
};
const CONN_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = { conectado: 'success', conectado_sin_datos: 'info', falta: 'warning', error: 'danger', no_aplica: 'neutral' };
const CONN_TEXT: Record<string, string> = { conectado: 'Conectado', conectado_sin_datos: 'Sin datos aún', falta: 'Falta', error: 'Error', no_aplica: 'No aplica' };

export function AnalisisInicial({ projectId, view, canEdit, isAdmin }: { projectId: string; view: SetupView; canEdit: boolean; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [skipping, setSkipping] = useState<string | null>(null);
  const [why, setWhy] = useState('');
  const act = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.message ?? 'Hecho.' } : { ok: false, text: r.error });
      if (r.ok) setSkipping(null);
      router.refresh();
    });
  const open = view.run?.status === 'abierta';
  const p = view.progress;

  const skipBox = (key: string) =>
    skipping === key && (
      <div className="mt-1 flex flex-wrap gap-2">
        <Input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Por qué se continúa sin esto" aria-label={`Por qué se continúa sin ${key}`} className="h-8 max-w-xs" />
        <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => skipSetupItemAction(projectId, key, why))}>
          Continuar sin esto
        </Button>
      </div>
    );

  return (
    <section className="rounded-xl border bg-card p-4" aria-labelledby="analisis-t">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="analisis-t" className="font-semibold">
            Análisis inicial · {p.done} de {p.total}
          </h2>
          <p className="text-sm text-muted-foreground">
            {!view.run
              ? 'Recorre en orden las conexiones, la web, el negocio, los datos, el mercado y el diagnóstico, y se para donde falte algo.'
              : open
                ? `En marcha desde el ${new Date(view.run.startedAt).toLocaleDateString('es-ES')}: avanza solo cada 10 minutos.`
                : `Completado el ${new Date(view.run.startedAt).toLocaleDateString('es-ES')}.`}
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            {!open && (
              <Button size="sm" disabled={pending} onClick={() => act(() => startAnalysisAction(projectId))}>
                <Play className="size-3.5" />
                {view.run ? 'Volver a analizar' : 'Empezar análisis'}
              </Button>
            )}
            {open && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => advanceNowAction(projectId))}>
                <RefreshCw className="size-3.5" />
                Avanzar ahora
              </Button>
            )}
          </div>
        )}
      </div>
      {msg && <p role="status" className={cn('mt-2 text-sm', msg.ok ? 'text-success' : 'text-destructive')}>{msg.text}</p>}

      <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8" aria-label="Etapas del análisis">
        {view.stages.map((s, i) => {
          const m = ST[s.status];
          const Icon = m.icon;
          return (
            <li key={s.key} className="flex flex-col gap-1 rounded-lg border p-2">
              <span className="text-[11px] text-muted-foreground">{i + 1}</span>
              <span className="text-xs font-medium leading-tight">{STAGE_LABEL[s.key]}</span>
              <span className={cn('inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', m.cls)}>
                <Icon className={cn('size-3', s.status === 'en_curso' && 'animate-spin')} aria-hidden />
                {m.label}
              </span>
            </li>
          );
        })}
      </ol>

      {p.needsPerson.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {p.needsPerson.map((s) => (
            <li key={s.key} className="rounded-lg border border-warning/40 bg-warning-soft/30 p-3 text-sm">
              <p>
                <strong>{STAGE_LABEL[s.key]}:</strong> {s.note}
                {s.who && <span className="text-muted-foreground"> ({s.who === 'admin' ? 'lo hace un administrador' : 'lo puede hacer el equipo'})</span>}
              </p>
              {isAdmin && ['web', 'negocio', 'datos', 'mapa', 'mercado'].includes(s.key) && skipping !== `stage:${s.key}` && (
                <button type="button" className="mt-1 text-xs text-muted-foreground underline" aria-label={`Continuar sin la etapa ${STAGE_LABEL[s.key]}`} onClick={() => setSkipping(`stage:${s.key}`)}>
                  Continuar sin esta etapa…
                </button>
              )}
              {skipBox(`stage:${s.key}`)}
            </li>
          ))}
        </ul>
      )}

      <details className="mt-4" key={view.connections.some((c) => c.blocking && (c.status === 'falta' || c.status === 'error') && !c.skipped) ? 'abierto' : 'cerrado'} open={view.connections.some((c) => c.blocking && (c.status === 'falta' || c.status === 'error') && !c.skipped) || undefined}>
        <summary className="cursor-pointer text-sm font-medium">Conexiones</summary>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {view.connections.map((c) => (
            <li key={c.key} className="rounded-md border p-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{CONN_LABEL[c.key]}</span>
                <Badge tone={CONN_TONE[c.status] ?? 'neutral'}>{c.skipped ? 'Omitido' : CONN_TEXT[c.status]}</Badge>
                {c.blocking && <span className="text-[11px] text-muted-foreground">imprescindible</span>}
              </div>
              <p className="text-xs text-muted-foreground">{c.note}</p>
              {isAdmin && c.blocking && !c.skipped && (c.status === 'falta' || c.status === 'error') && skipping !== `conn:${c.key}` && (
                <button type="button" className="mt-1 text-xs text-muted-foreground underline" aria-label={`Continuar sin ${CONN_LABEL[c.key]}`} onClick={() => setSkipping(`conn:${c.key}`)}>
                  Continuar sin esto…
                </button>
              )}
              {skipBox(`conn:${c.key}`)}
            </li>
          ))}
        </ul>
      </details>
      {view.run?.lastError && (
        <p className="mt-2 flex items-center gap-1 text-xs text-destructive">
          <Clock className="size-3" aria-hidden />
          Último empujón con error: {view.run.lastError}
        </p>
      )}
    </section>
  );
}
