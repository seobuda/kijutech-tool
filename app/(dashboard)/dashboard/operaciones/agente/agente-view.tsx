'use client';

import { useState, useTransition } from 'react';
import { Bot, CheckCircle2, Clock, Lightbulb, PencilLine, Sparkles, XCircle } from 'lucide-react';
import { Badge, EmptyState, Section, StatCard } from '@/components/ui/page';
import { AutoRefresh } from '@/components/ui/auto-refresh';
import { cn } from '@/lib/utils';
import { setAgentAutonomyAction } from '@/lib/operaciones/agent-panel-actions';
import type { Autonomy, KindStats } from '@/lib/operaciones/agent-actions';

type Recent = {
  id: string;
  kind: string;
  status: string;
  summary: string;
  proposal: unknown;
  final: unknown;
  decidedByName: string | null;
  decidedVia: string | null;
  createdAt: string;
  decidedAt: string | null;
};

const LEVEL_LABEL: Record<Autonomy, string> = {
  sombra: 'En sombra',
  aprobacion: 'Con tu aprobación',
  autonomo: 'Autónomo'
};

const LEVEL_HELP: Record<Autonomy, string> = {
  sombra: 'Propone sin enseñar nada; solo mide.',
  aprobacion: 'Propone y tú decides con un botón.',
  autonomo: 'Actúa solo y queda registrado.'
};

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand' }> = {
  aprobado: { label: 'Aprobada a la primera', tone: 'success' },
  corregido: { label: 'Corregida', tone: 'warning' },
  rechazado: { label: 'Descartada', tone: 'danger' },
  auto: { label: 'Autónoma', tone: 'brand' },
  propuesto: { label: 'Pendiente de ti', tone: 'info' },
  sombra: { label: 'En sombra', tone: 'neutral' }
};

const KIND_LABEL: Record<string, string> = {
  blocker_answer: 'Responder bloqueo',
  note_conversion: 'Convertir nota'
};

const fmt = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Madrid'
});

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)} %`);

function proposalText(kind: string, p: unknown): string {
  const v = (p ?? {}) as { answer?: string; items?: { title: string }[] };
  if (kind === 'blocker_answer') return v.answer ?? '';
  if (Array.isArray(v.items)) return v.items.map((i) => i.title).join(' · ');
  return '';
}

function AutonomyPicker({ s }: { s: KindStats }) {
  const [level, setLevel] = useState<Autonomy>(s.autonomy);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const choose = (l: Autonomy) => {
    if (l === level) return;
    const prev = level;
    setLevel(l);
    setError(null);
    start(async () => {
      const res = await setAgentAutonomyAction(s.kind, l);
      if (!res.ok) {
        setLevel(prev);
        setError(res.error);
      }
    });
  };
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label={`Autonomía de «${s.label}»`} className="inline-flex rounded-lg border bg-muted/50 p-0.5">
        {(['sombra', 'aprobacion', 'autonomo'] as Autonomy[]).map((l) => {
          const allowed = s.allowed.includes(l);
          return (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={level === l}
              disabled={!allowed || pending}
              onClick={() => choose(l)}
              title={allowed ? LEVEL_HELP[l] : 'No disponible para esta acción'}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                level === l ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {LEVEL_LABEL[l]}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{LEVEL_HELP[level]}</p>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function AgenteView({ stats, recent }: { stats: KindStats[]; recent: Recent[] }) {
  const total = stats.reduce((a, s) => a + s.total, 0);
  const approved = stats.reduce((a, s) => a + s.approved, 0);
  const corrected = stats.reduce((a, s) => a + s.corrected, 0);
  const rejected = stats.reduce((a, s) => a + s.rejected, 0);
  const auto = stats.reduce((a, s) => a + s.auto, 0);
  const decided = approved + corrected + rejected;
  const withTime = stats.filter((s) => s.avgDecisionMin !== null);
  const avgMin = withTime.length
    ? Math.round(withTime.reduce((a, s) => a + (s.avgDecisionMin ?? 0), 0) / withTime.length)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-lg font-semibold">
          <span className="flex items-center gap-2">
            <Bot className="size-5 text-brand" />
            Agente
          </span>
          <AutoRefresh everyMs={30_000} className="text-xs font-normal" />
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Lo que el agente propone y lo que decides tú, de los últimos 30 días. Con estos datos se decide cuándo puede
          actuar solo en cada tipo de tarea.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Propuestas" value={total} hint={`${auto} hechas en autónomo`} icon={Sparkles} tone="brand" />
        <StatCard
          label="Aprobadas a la primera"
          value={pct(decided ? approved / decided : null)}
          hint={`${approved} de ${decided} decididas por ti`}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard label="Corregidas" value={corrected} hint={`${rejected} descartadas`} icon={PencilLine} tone="warning" />
        <StatCard
          label="Tiempo medio de decisión"
          value={avgMin === null ? '—' : avgMin < 60 ? `${avgMin} min` : `${Math.round(avgMin / 60)} h`}
          hint="Desde que propone hasta que decides"
          icon={Clock}
          tone="info"
        />
      </div>

      <Section title="Autonomía por tipo de acción" description="Solo administración. Cada cambio se aplica a las propuestas nuevas.">
        <div className="divide-y">
          {stats.map((s) => (
            <div key={s.kind} className="grid gap-4 py-4 first:pt-0 last:pb-0 lg:grid-cols-[1fr_auto] lg:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{s.label}</h3>
                  <Badge tone="outline">{s.total} en 30 días</Badge>
                  {s.hitRate !== null && <Badge tone={s.hitRate >= 0.9 ? 'success' : 'warning'}>{pct(s.hitRate)} de acierto</Badge>}
                  {s.pending > 0 && <Badge tone="info">{s.pending} pendientes</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
                <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                  <div>
                    <dt className="inline">Aprobadas: </dt>
                    <dd className="inline font-medium text-foreground">{s.approved}</dd>
                  </div>
                  <div>
                    <dt className="inline">Corregidas: </dt>
                    <dd className="inline font-medium text-foreground">{s.corrected}</dd>
                  </div>
                  <div>
                    <dt className="inline">Descartadas: </dt>
                    <dd className="inline font-medium text-foreground">{s.rejected}</dd>
                  </div>
                  <div>
                    <dt className="inline">Autónomas: </dt>
                    <dd className="inline font-medium text-foreground">{s.auto}</dd>
                  </div>
                  {s.shadow > 0 && (
                    <div>
                      <dt className="inline">En sombra: </dt>
                      <dd className="inline font-medium text-foreground">{s.shadow}</dd>
                    </div>
                  )}
                </dl>
                {s.quality && s.quality.proposals > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Calidad de las respuestas: <span className="font-medium text-foreground">{pct(s.quality.endsWithQuestion / s.quality.proposals)}</span>{' '}
                    acaban con pregunta ·{' '}
                    <span className={cn('font-medium', s.quality.promises ? 'text-destructive' : 'text-foreground')}>{s.quality.promises}</span>{' '}
                    prometen acciones que no hace el sistema
                  </p>
                )}
                {s.recommendation && (
                  <p className="mt-3 flex items-start gap-2 rounded-lg bg-brand-soft px-3 py-2 text-sm">
                    <Lightbulb className="mt-0.5 size-4 shrink-0 text-brand" />
                    {s.recommendation}
                  </p>
                )}
              </div>
              <AutonomyPicker s={s} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Últimas acciones" description="Qué propuso el agente y qué se hizo al final.">
        {recent.length === 0 ? (
          <EmptyState
            icon={Bot}
            title="Aún no hay acciones registradas"
            description="Aparecerán al convertir una nota en encargos o cuando el agente revise un bloqueo."
            className="border-0 bg-transparent py-8"
          />
        ) : (
          <div className="-mx-5 -mb-5 overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cuándo</th>
                  <th>Tipo</th>
                  <th>Propuesta</th>
                  <th>Resultado</th>
                  <th>Quién</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((a) => {
                  const st = STATUS[a.status] ?? { label: a.status, tone: 'neutral' as const };
                  const proposed = proposalText(a.kind, a.proposal);
                  const finalText = proposalText(a.kind, a.final);
                  return (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap text-muted-foreground">{fmt.format(new Date(a.createdAt))}</td>
                      <td className="whitespace-nowrap">{KIND_LABEL[a.kind] ?? a.kind}</td>
                      <td className="min-w-[280px] max-w-[520px]">
                        <p className="line-clamp-2 text-sm">{a.summary}</p>
                        {proposed && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">Propuso: {proposed}</p>}
                        {a.status === 'corregido' && finalText && finalText !== proposed && (
                          <p className="mt-1 line-clamp-2 text-xs text-warning-strong">Se hizo: {finalText}</p>
                        )}
                      </td>
                      <td>
                        <Badge tone={st.tone} dot>
                          {st.label}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap text-muted-foreground">
                        {a.decidedByName ?? '—'}
                        {a.decidedVia && <span className="text-xs"> · {a.decidedVia === 'telegram' ? 'Telegram' : a.decidedVia === 'panel' ? 'web' : 'agente'}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <XCircle className="size-3.5" />
        Una propuesta descartada no se ejecuta; el bloqueo sigue esperando tu respuesta en «Mi bandeja».
      </p>
    </div>
  );
}
