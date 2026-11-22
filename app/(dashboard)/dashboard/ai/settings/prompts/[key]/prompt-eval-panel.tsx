'use client';

// Examen del prompt (22 nov 2026): último resultado, en claro; botón para pasarlo (versión guardada o borrador sin
// guardar) e historial para ver si el prompt empeora con el tiempo. Mientras hay uno en marcha, la pantalla se
// actualiza sola cada pocos segundos.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/page';
import { useAutoRefresh } from '@/components/ui/auto-refresh';
import { startPromptEvalAction } from './eval-actions';

export type EvalRunView = {
  id: string;
  promptVersion: number | null;
  draft: boolean;
  status: string;
  passedChecks: number;
  totalChecks: number;
  minScorePct: number;
  passed: boolean | null;
  result: { cases?: { key: string; title?: string; text?: string; checks: { name: string; pass: boolean; detail: string }[] }[]; skipped?: string[] };
  error: string | null;
  costUsd: string | null;
  startedAt: Date;
  finishedAt: Date | null;
};

export type EvalState = 'sin-examen' | 'sin-examinar' | 'aprobado' | 'suspendido' | 'en-curso' | 'error';

const STATE: Record<EvalState, { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  'sin-examen': { label: 'Nunca examinado', tone: 'warning' },
  'sin-examinar': { label: 'Cambiado sin examinar', tone: 'warning' },
  aprobado: { label: 'Aprobado', tone: 'success' },
  suspendido: { label: 'Suspendido', tone: 'danger' },
  'en-curso': { label: 'Examinando…', tone: 'info' },
  error: { label: 'El examen falló', tone: 'danger' }
};

const fmtDate = (d: Date) => new Date(d).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
const pct = (r: EvalRunView) => (r.totalChecks ? Math.round((r.passedChecks / r.totalChecks) * 100) : 0);
const usd = (s: string | null) => (s === null ? '—' : `${Number(s).toFixed(3).replace('.', ',')} $`);

function RunDetail({ run }: { run: EvalRunView }) {
  const cases = run.result.cases ?? [];
  const bad = cases.filter((c) => c.checks.some((k) => !k.pass));
  return (
    <div className="space-y-2 text-sm">
      {run.error && <p className="text-destructive">{run.error}</p>}
      {cases.length > 0 && (
        <ul className="space-y-1.5">
          {cases.map((c) => {
            const ok = c.checks.every((k) => k.pass);
            return (
              <li key={c.key}>
                <span className={ok ? 'text-success' : 'text-destructive'}>{ok ? '✓' : '✗'}</span> {c.title ?? c.key}
                {!ok && (
                  <span className="text-muted-foreground">
                    {' — '}
                    {c.checks
                      .filter((k) => !k.pass)
                      .map((k) => `${k.name}: ${k.detail}`)
                      .join(' · ')}
                  </span>
                )}
                {c.text && !ok && <div className="text-xs text-muted-foreground ml-4">Nota: «{c.text}»</div>}
              </li>
            );
          })}
        </ul>
      )}
      {!bad.length && cases.length > 0 && <p className="text-muted-foreground">Todos los casos bien.</p>}
      {(run.result.skipped ?? []).length > 0 && (
        <p className="text-xs text-muted-foreground">Sin caso (faltan datos): {(run.result.skipped ?? []).join(' · ')}</p>
      )}
    </div>
  );
}

export function PromptEvalPanel({
  promptKey,
  version,
  state,
  summary,
  costHint,
  minScore,
  runs,
  draft,
  dirty
}: {
  promptKey: string;
  version: number;
  state: EvalState;
  summary: string;
  costHint: string;
  minScore: number;
  runs: EvalRunView[];
  draft: { systemPrompt: string; userPromptTemplate: string };
  dirty: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const running = state === 'en-curso';
  useAutoRefresh(() => router.refresh(), 5000, running);

  const last = runs.find((r) => r.status !== 'en_curso') ?? null;
  const st = STATE[state];

  const launch = (useDraft: boolean) => {
    setMsg(null);
    start(async () => {
      const r = await startPromptEvalAction(promptKey, useDraft ? draft : null);
      setMsg({ ok: r.ok, text: r.message });
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex flex-wrap items-center gap-2">
          <GraduationCap className="h-4 w-4" />
          Examen del prompt
          <Badge tone={st.tone} dot>
            {st.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {summary} Aprueba con {Math.round(minScore * 100)} % de comprobaciones bien. Cuesta {costHint}.
        </p>
        {state === 'sin-examinar' && (
          <p className="text-sm text-warning-strong">
            La versión {version} no se ha examinado: el último examen es de otra versión. Pásalo para saber si el cambio acierta igual.
          </p>
        )}

        {last ? (
          <div className="rounded-md border p-3 space-y-2">
            <p className="text-sm font-medium">
              Último examen: {last.status === 'error' ? 'no terminó' : `${last.passedChecks} de ${last.totalChecks} bien (${pct(last)} %) · ${last.passed ? 'aprobado' : 'suspendido'}`}
              <span className="font-normal text-muted-foreground">
                {' '}
                · {last.draft ? 'borrador sin guardar' : `versión ${last.promptVersion}`} · {fmtDate(last.startedAt)} · {usd(last.costUsd)}
              </span>
            </p>
            <RunDetail run={last} />
          </div>
        ) : (
          !running && <p className="text-sm text-muted-foreground">Todavía no se ha pasado ningún examen a este prompt.</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => launch(false)} disabled={pending || running}>
            {pending || running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {running ? 'Examinando… (unos minutos)' : `Pasar examen a la versión ${version}`}
          </Button>
          {dirty && (
            <Button type="button" variant="outline" size="sm" onClick={() => launch(true)} disabled={pending || running}>
              Examinar el borrador sin guardarlo
            </Button>
          )}
        </div>
        {dirty && !running && (
          <p className="text-xs text-muted-foreground">
            Tienes cambios sin guardar: puedes examinarlos antes de dejarlos activos. El examen del borrador no cuenta como examen de la versión guardada.
          </p>
        )}
        {msg && <p className={`text-sm ${msg.ok ? 'text-muted-foreground' : 'text-destructive'}`}>{msg.text}</p>}

        {runs.length > 1 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Historial ({runs.length})</summary>
            <ul className="mt-2 space-y-2">
              {runs.map((r) => (
                <li key={r.id} className="border-t pt-2">
                  <details>
                    <summary className="cursor-pointer">
                      {fmtDate(r.startedAt)} · {r.draft ? 'borrador' : `v${r.promptVersion}`} ·{' '}
                      {r.status === 'en_curso'
                        ? 'en marcha'
                        : r.status === 'error'
                          ? 'no terminó'
                          : `${pct(r)} % · ${r.passed ? 'aprobado' : 'suspendido'}`}{' '}
                      · {usd(r.costUsd)}
                    </summary>
                    <div className="mt-2 ml-4">
                      <RunDetail run={r} />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
