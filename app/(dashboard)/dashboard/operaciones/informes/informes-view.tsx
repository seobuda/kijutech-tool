'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, Copy, FileText, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Section, StatCard } from '@/components/ui/page';
import type { WeeklyReport } from '@/lib/operaciones/reports';

const pctText = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : '—');
const hours = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
const dlt = (cur: number | null, prev: number | null, unit = '') => {
  if (cur === null || prev === null) return undefined;
  const d = Math.round((cur - prev) * 10) / 10;
  return d === 0 ? 'igual que la semana anterior' : `${d > 0 ? '+' : ''}${d}${unit} frente a la anterior`;
};

export function WeeklyView({ report: r, weeks }: { report: WeeklyReport; weeks: { monday: string; label: string }[] }) {
  const router = useRouter();
  const t = r.team;
  const p = r.prevTeam;
  return (
    <div className="space-y-5">
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Semana</span>
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={r.monday}
          onChange={(e) => router.push(`?vista=semana&semana=${e.target.value}`)}
        >
          {weeks.map((w) => (
            <option key={w.monday} value={w.monday}>
              {w.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Entregas" value={String(t.delivered)} hint={dlt(t.delivered, p?.delivered ?? null)} />
        <StatCard label="A tiempo" value={t.onTimePct === null ? '—' : `${t.onTimePct} %`} hint={dlt(t.onTimePct, p?.onTimePct ?? null, ' pt')} />
        <StatCard label="Horas trabajadas" value={r.jornadaOn ? `${t.workedH} h` : '—'} hint={r.jornadaOn ? dlt(t.workedH, p?.workedH ?? null, ' h') : 'Con la jornada encendida'} />
        <StatCard label="Precisión de estimación" value={t.precisionPct === null ? '—' : `${t.precisionPct} %`} hint={t.precisionPct === null ? 'Con los tiempos de tarea encendidos' : dlt(t.precisionPct, p?.precisionPct ?? null, ' pt')} />
      </div>

      <Section title="Equipo" description="Por persona, en orden alfabético (sin ranking). A tiempo = entregado no más tarde que la fecha del encargo.">
        {r.people.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">Sin actividad registrada esta semana.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full text-sm">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Días</th>
                  <th>Horas</th>
                  <th>Entregas</th>
                  <th>A tiempo</th>
                  <th>Precisión</th>
                  <th>Sobre margen</th>
                  <th>Bloqueos</th>
                  <th>Avisos</th>
                </tr>
              </thead>
              <tbody>
                {r.people.map((x) => (
                  <tr key={x.u}>
                    <td className="font-medium">{x.name}</td>
                    <td>{r.jornadaOn ? `${x.daysWorked}${x.absences ? ` (+${x.absences} aus.)` : ''}` : '—'}</td>
                    <td>{r.jornadaOn ? hours(x.workedMin) : '—'}</td>
                    <td>{x.delivered}</td>
                    <td>{pctText(x.onTime, x.withDue)}</td>
                    <td>{x.estimated ? pctText(x.hits, x.estimated) : '—'}</td>
                    <td>{x.over || '—'}</td>
                    <td>{x.blocked || '—'}</td>
                    <td className="space-x-1">
                      {x.autoClosed > 0 && <Badge tone="warning">{x.autoClosed} sin marcar salida</Badge>}
                      {x.breakOverDays > 0 && <Badge tone="warning">{x.breakOverDays} día(s) sobre cupo</Badge>}
                      {!x.autoClosed && !x.breakOverDays && '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t px-5 py-3 text-sm text-muted-foreground">
          Bloqueos: {t.blocked} (la IA resolvió {t.blockedByAi}) · recordatorios enviados: {t.reminders}
        </p>
      </Section>

      <div className="grid gap-5 md:grid-cols-2">
        <Section title="Clientes">
          <ul className="space-y-1 px-5 py-4 text-sm">
            <li>En alerta ahora: {r.clients.inactive} sin actividad · {r.clients.unplanned} sin trabajo planificado</li>
            <li>Correos recibidos: {r.clients.emailsIn} · respuestas enviadas: {r.clients.emailsAnswered}</li>
            <li>
              <Link className="text-primary underline-offset-2 hover:underline" href="/dashboard/clientes">
                Ver el semáforo de clientes
              </Link>
            </li>
          </ul>
        </Section>
        <Section title="Sistema">
          <ul className="space-y-1 px-5 py-4 text-sm">
            <li>
              {r.system.incidents.length ? `${r.system.incidents.length} incidencia(s)` : 'Sin incidencias'}
              {r.system.downMin ? ` · ${r.system.downMin} min parado` : ''}
            </li>
            {r.system.incidents.slice(0, 6).map((i, k) => (
              <li key={k} className="text-muted-foreground">
                {i.severity === 'critico' ? '🔴' : '🟠'} {i.title}
                {i.minutes !== null ? ` (${i.minutes} min)` : ' (abierta)'}
              </li>
            ))}
            <li>IA: {r.system.aiUsd.toFixed(2)} $ · ClickUp: {r.system.clickupRequests} peticiones</li>
          </ul>
        </Section>
      </div>

      <Section title="Agente" description="Últimos 7 días. Las propuestas de subir la autonomía también te llegan los lunes por Telegram.">
        <ul className="divide-y text-sm">
          {r.agent.map((a) => (
            <li key={a.label} className="px-5 py-3">
              <p className="font-medium">
                {a.label} <Badge tone="neutral">{a.autonomy}</Badge>
              </p>
              <p className="text-muted-foreground">
                {a.decided} decididas · {a.hitRate === null ? '—' : `${a.hitRate} %`} aprobadas tal cual{a.auto ? ` · ${a.auto} actuó solo` : ''}
              </p>
              {a.recommendation && <p className="mt-1">💡 {a.recommendation}</p>}
            </li>
          ))}
        </ul>
      </Section>

      <p className="text-sm text-muted-foreground">
        {r.pending.count ? `Te esperan ${r.pending.count} decisiones (lo más antiguo, ${r.pending.oldest}).` : 'Nada esperando tu decisión.'}{' '}
        <Link className="text-primary underline-offset-2 hover:underline" href="/dashboard/operaciones/bandeja">
          Mi bandeja
        </Link>
      </p>
    </div>
  );
}

export function MorningPreview({ text, notable }: { text: string; notable: boolean }) {
  return (
    <Section
      title="Parte de hoy (vista previa)"
      description={notable ? 'Así sería el parte si se enviara ahora.' : 'Ahora mismo no hay nada que contar: el parte no se enviaría.'}
    >
      <div className="flex gap-3 px-5 py-4">
        <Sun className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <pre className="whitespace-pre-wrap font-sans text-sm">{text}</pre>
      </div>
    </Section>
  );
}

export type Draft = { client: string; count: number; text: string };

export function MonthDrafts({ drafts, label, offset, error, withoutField }: { drafts: Draft[]; label: string; offset: 0 | -1; error: string | null; withoutField: number }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (d: Draft) => {
    try {
      await navigator.clipboard.writeText(d.text);
      setCopied(d.client);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant={offset === -1 ? 'default' : 'outline'}>
          <Link href="?vista=mes">Mes pasado</Link>
        </Button>
        <Button asChild size="sm" variant={offset === 0 ? 'default' : 'outline'}>
          <Link href="?vista=mes&mes=actual">Este mes (hasta hoy)</Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground text-pretty">
        Borradores de {label}: tareas cerradas en ClickUp con el campo «Cliente» de cada ficha (las cerradas en una limpieza de vencidas no
        cuentan). Revísalos antes de enviarlos: el texto no sale solo hacia el cliente.
        {withoutField > 0 && ` ${withoutField} cliente(s) activos no tienen su opción del campo «Cliente» enlazada y no aparecen.`}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!error && drafts.length === 0 ? (
        <EmptyState icon={FileText} title="Sin trabajo cerrado" description={`Ningún cliente tiene tareas cerradas en ${label}.`} />
      ) : (
        drafts.map((d) => (
          <Section
            key={d.client}
            title={`${d.client} · ${d.count} tarea(s)`}
            actions={
              <Button size="sm" variant="outline" onClick={() => copy(d)}>
                {copied === d.client ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {copied === d.client ? 'Copiado' : 'Copiar'}
              </Button>
            }
          >
            <pre className="whitespace-pre-wrap px-5 py-4 font-sans text-sm">{d.text}</pre>
          </Section>
        ))
      )}
    </div>
  );
}
