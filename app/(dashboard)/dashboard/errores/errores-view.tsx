'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { AlertTriangle, Bug, CheckCircle2, ClipboardCopy, EyeOff, Loader2, RotateCcw, Search, Sparkles, Stethoscope, Wrench } from 'lucide-react';
import { Badge, EmptyState, Section, StatCard } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { Diagnosis } from '@/lib/core/error-rules';
import type { ErrorSettings } from '@/lib/core/errors';
import { errorBriefAction, requestDiagnosisAction, saveErrorNoteAction, saveErrorSettingsAction, setErrorStatusAction } from './actions';

export type GroupRow = {
  id: string;
  title: string;
  source: string;
  area: string;
  severity: string;
  status: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  diagnosed: boolean;
  diagnosing: boolean;
  system: boolean;
};
export type GroupDetail = GroupRow & {
  note: string;
  diagnosis: Diagnosis | null;
  diagnosisAt: string | null;
  diagnosisRequestedAt: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  reopenedCount: number;
  events: { id: string; at: string; message: string; stack: string | null; userMessage: string | null; context: string; actor: string | null; channel: string | null; path: string | null }[];
};

const SEV: Record<string, { label: string; tone: 'danger' | 'warning' | 'neutral' }> = {
  critico: { label: 'Crítico', tone: 'danger' },
  error: { label: 'Error', tone: 'warning' },
  aviso: { label: 'Aviso', tone: 'neutral' }
};
const STATUS: Record<string, { label: string; tone: 'brand' | 'info' | 'success' | 'neutral' }> = {
  nuevo: { label: 'Nuevo', tone: 'brand' },
  investigando: { label: 'Investigando', tone: 'info' },
  resuelto: { label: 'Resuelto', tone: 'success' },
  ignorado: { label: 'Ignorado', tone: 'neutral' }
};
const STATUS_TABS = [
  { key: 'abiertos', label: 'Abiertos' },
  { key: 'nuevo', label: 'Nuevos' },
  { key: 'investigando', label: 'Investigando' },
  { key: 'resuelto', label: 'Resueltos' },
  { key: 'ignorado', label: 'Ignorados' },
  { key: 'todos', label: 'Todos' }
];

const fmt = (iso: string) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
function ago(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

type Filter = { status: string; source: string; severity: string; q: string };
function href(f: Filter, extra: Partial<Filter> & { id?: string | null } = {}): string {
  const p = new URLSearchParams();
  const v = { ...f, ...extra };
  if (v.status && v.status !== 'abiertos') p.set('estado', v.status);
  if (v.source) p.set('modulo', v.source);
  if (v.severity) p.set('gravedad', v.severity);
  if (v.q) p.set('q', v.q);
  if (extra.id) p.set('id', extra.id);
  const s = p.toString();
  return `/dashboard/errores${s ? `?${s}` : ''}`;
}

export function ErroresView({
  stats,
  groups,
  sources,
  filter,
  settings,
  detail
}: {
  stats: { open: number; fresh: number; new24: number; critical: number; diagnosed: number; events24: number };
  groups: GroupRow[];
  sources: string[];
  filter: Filter;
  settings: ErrorSettings;
  detail: GroupDetail | null;
}) {
  const router = useRouter();
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Abiertos" value={stats.open} hint={stats.critical ? `${stats.critical} críticos` : 'sin críticos'} icon={Bug} tone={stats.critical ? 'danger' : stats.open ? 'warning' : 'success'} />
        <StatCard label="Nuevos en 24 h" value={stats.new24} hint="errores distintos que aparecieron" icon={AlertTriangle} tone={stats.new24 ? 'warning' : 'neutral'} />
        <StatCard label="Veces en 24 h" value={stats.events24} hint="muestras guardadas (las repeticiones se cuentan)" icon={RotateCcw} />
        <StatCard label="Diagnosticados" value={`${stats.diagnosed} de ${stats.open}`} hint="abiertos con diagnóstico del Técnico" icon={Stethoscope} tone="info" />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Estado">
          {STATUS_TABS.map((t) => (
            <Link
              key={t.key}
              href={href(filter, { status: t.key })}
              className={cn('rounded-full border px-3 py-1 text-sm transition-colors', filter.status === t.key ? 'border-brand bg-brand-soft text-brand' : 'bg-card text-muted-foreground hover:text-foreground')}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <form action="/dashboard/errores" className="flex flex-wrap items-center gap-2">
          {filter.status !== 'abiertos' && <input type="hidden" name="estado" value={filter.status} />}
          <select name="modulo" defaultValue={filter.source} className="h-9 rounded-md border bg-card px-2 text-sm" aria-label="Módulo">
            <option value="">Todos los módulos</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select name="gravedad" defaultValue={filter.severity} className="h-9 rounded-md border bg-card px-2 text-sm" aria-label="Gravedad">
            <option value="">Cualquier gravedad</option>
            <option value="critico">Crítico</option>
            <option value="error">Error</option>
            <option value="aviso">Aviso</option>
          </select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input name="q" defaultValue={filter.q} placeholder="Buscar texto" className="h-9 w-48 pl-8" />
          </div>
          <Button type="submit" size="sm" variant="outline">
            Filtrar
          </Button>
        </form>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="min-w-0">
          {groups.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title={filter.status === 'abiertos' && !filter.source && !filter.severity && !filter.q ? 'Sin errores abiertos' : 'Nada con este filtro'}
              description={filter.status === 'abiertos' ? 'Cuando algo falle, aparecerá aquí y te avisaré por Telegram si es importante.' : 'Prueba con otro estado, módulo o texto.'}
              action={
                filter.status !== 'todos' ? (
                  <Link href={href(filter, { status: 'todos', source: '', severity: '', q: '' })} className="text-sm text-brand hover:underline">
                    Ver todos los errores
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
              {groups.map((g) => (
                <li key={g.id}>
                  <Link href={href(filter, { id: g.id })} className={cn('block px-4 py-3 transition-colors hover:bg-muted/50', detail?.id === g.id && 'bg-brand-soft/40')}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={SEV[g.severity]?.tone ?? 'neutral'} dot>
                        {SEV[g.severity]?.label ?? g.severity}
                      </Badge>
                      <Badge tone={STATUS[g.status]?.tone ?? 'neutral'}>{STATUS[g.status]?.label ?? g.status}</Badge>
                      {g.diagnosed && (
                        <Badge tone="info">
                          <Stethoscope /> Diagnóstico
                        </Badge>
                      )}
                      {g.diagnosing && (
                        <Badge tone="info">
                          <Loader2 className="animate-spin" /> Diagnosticando
                        </Badge>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                        {g.occurrences}× · {ago(g.lastSeen)}
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 break-words font-mono text-[13px]">{g.title}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {g.source}
                      {g.area ? ` · ${g.area}` : ''}
                      {g.system ? ' · sistema' : ''}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0">
          {detail ? (
            <Detail key={detail.id} d={detail} onDone={() => router.refresh()} closeHref={href(filter)} />
          ) : (
            <EmptyState icon={Bug} title="Elige un error" description="Verás cuándo y cuántas veces pasó, su traza, el contexto, el diagnóstico del Técnico de mantenimiento y lo que puedes hacer." className="py-20" />
          )}
        </div>
      </div>

      <SettingsSection settings={settings} onDone={() => router.refresh()} />
    </div>
  );
}

function Detail({ d, onDone, closeHref }: { d: GroupDetail; onDone: () => void; closeHref: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [note, setNote] = useState(d.note);
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) onDone();
    });
  const copy = () =>
    start(async () => {
      const r = await errorBriefAction(d.id);
      if (r.ok && r.text) {
        try {
          await navigator.clipboard.writeText(r.text);
          setMsg({ ok: true, text: 'Copiado: pégalo a Claude Code para que lo arregle.' });
        } catch {
          setMsg({ ok: false, text: 'El navegador no dejó copiar.' });
        }
      } else setMsg({ ok: false, text: r.message });
    });
  const open = d.status === 'nuevo' || d.status === 'investigando';
  const diagnosing = d.diagnosing;

  return (
    <Section
      title={
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone={SEV[d.severity]?.tone ?? 'neutral'} dot>
            {SEV[d.severity]?.label ?? d.severity}
          </Badge>
          <Badge tone={STATUS[d.status]?.tone ?? 'neutral'}>{STATUS[d.status]?.label ?? d.status}</Badge>
          <span className="text-sm font-normal text-muted-foreground">
            {d.source}
            {d.area ? ` · ${d.area}` : ''}
          </span>
        </span>
      }
      actions={
        <Link href={closeHref} className="text-sm text-muted-foreground hover:text-foreground">
          Cerrar
        </Link>
      }
    >
      <div className="space-y-5">
        <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-mono text-[13px]">{d.title}</pre>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Veces</dt>
            <dd className="font-medium tabular-nums">{d.occurrences}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Primera</dt>
            <dd className="font-medium">{fmt(d.firstSeen)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Última</dt>
            <dd className="font-medium">{fmt(d.lastSeen)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Reabierto</dt>
            <dd className="font-medium tabular-nums">{d.reopenedCount} veces</dd>
          </div>
        </dl>
        {d.resolvedAt && (
          <p className="text-sm text-muted-foreground">
            {d.status === 'ignorado' ? 'Ignorado' : 'Resuelto'} el {fmt(d.resolvedAt)}
            {d.resolvedBy ? ` por ${d.resolvedBy}` : ''}.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => run(() => requestDiagnosisAction(d.id))} disabled={pending || diagnosing}>
            {diagnosing ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {diagnosing ? 'Diagnosticando…' : d.diagnosis ? 'Diagnosticar de nuevo' : 'Diagnosticar con IA'}
          </Button>
          {d.status !== 'investigando' && open && (
            <Button size="sm" variant="outline" onClick={() => run(() => setErrorStatusAction(d.id, 'investigando'))} disabled={pending}>
              <Wrench /> Investigando
            </Button>
          )}
          {open ? (
            <>
              <Button size="sm" variant="outline" onClick={() => run(() => setErrorStatusAction(d.id, 'resuelto'))} disabled={pending}>
                <CheckCircle2 /> Resuelto
              </Button>
              <Button size="sm" variant="ghost" onClick={() => run(() => setErrorStatusAction(d.id, 'ignorado'))} disabled={pending}>
                <EyeOff /> Ignorar
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => run(() => setErrorStatusAction(d.id, 'nuevo'))} disabled={pending}>
              <RotateCcw /> Reabrir
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={copy} disabled={pending}>
            <ClipboardCopy /> Copiar para arreglarlo
          </Button>
        </div>
        {msg && <p className={cn('text-sm', msg.ok ? 'text-success' : 'text-destructive')}>{msg.text}</p>}

        <div className="rounded-lg border p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Stethoscope className="size-4 text-info" /> Diagnóstico del Técnico de mantenimiento
          </h3>
          {d.diagnosis ? (
            <div className="mt-3 space-y-2 text-sm">
              <p>
                <span className="font-medium">Causa: </span>
                {d.diagnosis.causa}
              </p>
              {d.diagnosis.evidencia && (
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Evidencia: </span>
                  {d.diagnosis.evidencia}
                </p>
              )}
              <p>
                <span className="font-medium">Arreglo propuesto: </span>
                <span className="whitespace-pre-wrap">{d.diagnosis.arreglo}</span>
              </p>
              {d.diagnosis.archivos.length > 0 && <p className="font-mono text-xs text-muted-foreground">{d.diagnosis.archivos.join(' · ')}</p>}
              <div className="flex flex-wrap gap-1.5">
                <Badge tone={d.diagnosis.riesgo === 'alto' ? 'danger' : d.diagnosis.riesgo === 'medio' ? 'warning' : 'success'}>Riesgo {d.diagnosis.riesgo}</Badge>
                <Badge tone="outline">Confianza {d.diagnosis.confianza}/10</Badge>
                {d.diagnosis.urgente && <Badge tone="danger">Urgente</Badge>}
                {d.diagnosisAt && <span className="text-xs text-muted-foreground">{fmt(d.diagnosisAt)}</span>}
              </div>
              <p className="text-xs text-muted-foreground">Para aplicarlo: «Copiar para arreglarlo» y pégalo a Claude Code; cuando esté desplegado, márcalo como resuelto.</p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {diagnosing ? 'Lo está mirando: el informe llegará por Telegram y quedará aquí.' : 'Aún sin diagnóstico. Pulsa «Diagnosticar con IA» (los errores nuevos importantes se diagnostican solos según los ajustes).'}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="err-note" className="text-sm font-medium">
            Nota
          </label>
          <textarea
            id="err-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={4000}
            placeholder="Qué se sabe, qué se ha probado, en qué commit se arregló…"
            className="w-full rounded-md border bg-card px-3 py-2 text-sm"
          />
          <Button size="sm" variant="outline" onClick={() => run(() => saveErrorNoteAction(d.id, note))} disabled={pending || note === d.note}>
            Guardar nota
          </Button>
        </div>

        <div>
          <h3 className="text-sm font-semibold">Últimas veces ({d.events.length})</h3>
          {d.events.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Sin muestras guardadas (se guardan unas pocas por hora; las antiguas se borran según los ajustes).</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {d.events.map((e, i) => (
                <li key={e.id}>
                  <details className="group rounded-lg border" open={i === 0}>
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2 text-sm">
                      <span className="font-medium">{fmt(e.at)}</span>
                      {e.channel && <Badge tone="outline">{e.channel}</Badge>}
                      {e.actor && <span className="text-muted-foreground">{e.actor}</span>}
                      {e.path && <span className="truncate font-mono text-xs text-muted-foreground">{e.path}</span>}
                    </summary>
                    <div className="space-y-2 border-t px-3 py-2 text-sm">
                      <pre className="whitespace-pre-wrap break-words font-mono text-xs">{e.message}</pre>
                      {e.userMessage && (
                        <p>
                          <span className="text-muted-foreground">Lo que vio la persona: </span>«{e.userMessage}»
                        </p>
                      )}
                      {e.context !== '{}' && <pre className="max-h-60 overflow-auto rounded bg-muted p-2 font-mono text-xs">{e.context}</pre>}
                      {e.stack && (
                        <details>
                          <summary className="cursor-pointer text-xs text-muted-foreground">Traza</summary>
                          <pre className="mt-1 max-h-72 overflow-auto rounded bg-muted p-2 font-mono text-[11px]">{e.stack}</pre>
                        </details>
                      )}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Section>
  );
}

function SettingsSection({ settings, onDone }: { settings: ErrorSettings; onDone: () => void }) {
  const [v, setV] = useState(settings);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = JSON.stringify(v) !== JSON.stringify(settings);
  const num = (k: 'maxDiagnosesPerDay' | 'retentionDays', min: number, max: number) => (
    <Input type="number" min={min} max={max} value={v[k]} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} className="h-9 w-24" />
  );
  return (
    <Section title="Ajustes" description="Avisos por Telegram, diagnóstico automático y cuánto se guarda.">
      <div className="grid gap-5 md:grid-cols-2">
        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="block text-sm font-medium">Avisar por Telegram</span>
            <span className="block text-xs text-muted-foreground">De un error nuevo o que vuelve tras resolverse (como mucho 6 por hora).</span>
          </span>
          <Switch checked={v.alerts} onCheckedChange={(c) => setV({ ...v, alerts: c })} />
        </label>
        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="block text-sm font-medium">Gravedad mínima para avisar</span>
            <span className="block text-xs text-muted-foreground">Los avisos (consola en amarillo) solo quedan en la lista.</span>
          </span>
          <select value={v.alertMinSeverity} onChange={(e) => setV({ ...v, alertMinSeverity: e.target.value as ErrorSettings['alertMinSeverity'] })} className="h-9 rounded-md border bg-card px-2 text-sm">
            <option value="aviso">Aviso</option>
            <option value="error">Error</option>
            <option value="critico">Crítico</option>
          </select>
        </label>
        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="block text-sm font-medium">Diagnóstico automático</span>
            <span className="block text-xs text-muted-foreground">El Técnico de mantenimiento mira solo los errores nuevos de gravedad «error» o más (gasta IA: unos céntimos cada uno).</span>
          </span>
          <Switch checked={v.autoDiagnose} onCheckedChange={(c) => setV({ ...v, autoDiagnose: c })} />
        </label>
        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="block text-sm font-medium">Diagnósticos automáticos al día</span>
            <span className="block text-xs text-muted-foreground">0 a 10, contando también los que pidas a mano. Todos gastan del presupuesto del mes del Técnico (Agentes).</span>
          </span>
          {num('maxDiagnosesPerDay', 0, 10)}
        </label>
        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="block text-sm font-medium">Días que se guardan</span>
            <span className="block text-xs text-muted-foreground">Muestras y errores cerrados sin actividad (7 a 365). Se guardan como mucho 50 muestras por error.</span>
          </span>
          {num('retentionDays', 7, 365)}
        </label>
      </div>
      <div className="mt-5 flex items-center gap-3">
        <Button
          size="sm"
          disabled={!changed || pending}
          onClick={() =>
            start(async () => {
              const r = await saveErrorSettingsAction(v);
              setMsg({ ok: r.ok, text: r.message });
              if (r.ok) onDone();
            })
          }
        >
          {pending && <Loader2 className="animate-spin" />} Guardar ajustes
        </Button>
        {changed && !pending && (
          <Button size="sm" variant="ghost" onClick={() => setV(settings)}>
            Descartar cambios
          </Button>
        )}
        {msg && <span className={cn('text-sm', msg.ok ? 'text-success' : 'text-destructive')}>{msg.text}</span>}
      </div>
    </Section>
  );
}
