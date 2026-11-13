'use client';

// Lista de clientes (núcleo): estado, completitud de la ficha y semáforo de Operaciones. Cada fila abre la ficha.
// «Nuevo cliente» crea la ficha con nombre y estado (o con «Rellenar con IA») y lleva a ella.
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Building2, CalendarClock, ChevronRight, ClipboardList, Clock, Link2Off, Plus, RefreshCw, Search, Settings2, Sparkles, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge, EmptyState, StatCard } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { CLIENT_STATUSES, STATUS_LABEL, type ClientStatus } from '@/lib/core/client-rules';
import { createClientAction } from '@/lib/core/client-actions';
import { importMissingClients, recalcClientActivity } from '@/lib/operaciones/client-actions';
import { AiFill } from './ai-fill';
import { AlertLine, ConfigPanel, type AlertView, type Level, type Service } from './ops-parts';
import { brandBtn, MsgLine, selectClass, type Msg } from './ui';

export type ClientRow = {
  id: string;
  name: string;
  aliases: string[];
  status: string;
  level: string;
  levelLabel: string;
  linked: boolean;
  services: string[];
  business: string;
  completeness: number;
  missing: number;
  requestCount: number;
  monthlyHours: number | null;
  alert: AlertView;
};

export const STATUS_TONE: Record<string, 'brand' | 'success' | 'warning' | 'neutral' | 'info'> = {
  prospecto: 'info',
  onboarding: 'brand',
  activo: 'success',
  pausado: 'warning',
  baja: 'neutral'
};

/** Barra de completitud: verde a partir del 80 %, ámbar desde el 50 %. Se lee como progreso, no como reproche. */
export function CompletenessBar({ pct, className }: { pct: number; className?: string }) {
  const tone = pct >= 80 ? 'bg-success' : pct >= 50 ? 'bg-warning' : 'bg-brand';
  return (
    <span className={cn('inline-flex items-center gap-2', className)} title={`Ficha completa al ${pct} %`}>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Ficha completa">
        <span className={cn('block h-full rounded-full', tone)} style={{ width: `${pct}%` }} />
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">{pct} %</span>
    </span>
  );
}

export function ClientesView({
  rows,
  levels,
  services,
  runInfo,
  missingOptions,
  duplicates,
  isAdmin
}: {
  rows: ClientRow[];
  levels: Level[];
  services: Service[];
  runInfo: { lastRun: string | null; lastError: string | null };
  missingOptions: number;
  duplicates: [string, string][];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();
  const [showConfig, setShowConfig] = useState(false);
  const [creating, setCreating] = useState<null | 'form' | 'ia'>(null);
  const [newName, setNewName] = useState('');
  const [newStatus, setNewStatus] = useState<ClientStatus>('onboarding');
  const [q, setQ] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('trabajando');

  const needle = q.trim().toLowerCase();
  const shown = rows.filter(
    (c) =>
      (statusFilter === 'todos' || (statusFilter === 'trabajando' ? c.status === 'activo' || c.status === 'onboarding' : c.status === statusFilter)) &&
      (!levelFilter || c.level === levelFilter) &&
      (!needle || [c.name, ...c.aliases].some((t) => t.toLowerCase().includes(needle)))
  );

  const working = rows.filter((c) => c.status === 'activo' || c.status === 'onboarding');
  const redCount = working.filter((c) => c.alert.state === 'red').length;
  const unplannedCount = working.filter((c) => c.alert.hasData && c.alert.horizonDays > 0 && c.alert.upcoming === 0).length;
  const avgComplete = working.length ? Math.round(working.reduce((n, c) => n + c.completeness, 0) / working.length) : 0;

  const create = () =>
    startTransition(async () => {
      setMsg(null);
      const res = await createClientAction({ name: newName, status: newStatus });
      if (!res.ok) return setMsg({ type: 'error', text: res.error });
      router.push(`/dashboard/clientes/${res.id}`);
    });

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">Clientes</h1>
          <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground text-pretty">
            Toda la información de cada cliente en un sitio: empresa y negocio, contactos, webs y cuentas, competencia y memoria. La usan el equipo, Operaciones y los agentes.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setMsg(null);
                const res = await recalcClientActivity();
                setMsg(res.ok ? { type: 'ok', text: res.message } : { type: 'error', text: res.error });
                router.refresh();
              })
            }
          >
            <RefreshCw className={cn(pending && 'animate-spin')} aria-hidden />
            Recalcular actividad
          </Button>
          {isAdmin && (
            <Button size="sm" variant="outline" aria-expanded={showConfig} onClick={() => setShowConfig((v) => !v)}>
              <Settings2 aria-hidden />
              Niveles y servicios
            </Button>
          )}
          <Button size="sm" variant="outline" className="border-brand/40 text-brand hover:bg-brand-soft hover:text-brand" disabled={creating !== null} onClick={() => setCreating('ia')}>
            <Sparkles aria-hidden />
            Nuevo con IA
          </Button>
          <Button size="sm" className={brandBtn} disabled={creating !== null} onClick={() => setCreating('form')}>
            <Plus aria-hidden />
            Nuevo cliente
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Clientes trabajando" value={working.length} hint={`${rows.length} fichas en total`} icon={Users} tone="brand" />
        <StatCard label="En alerta roja" value={redCount} hint="Sin actividad reciente" icon={AlertTriangle} tone={redCount > 0 ? 'danger' : 'neutral'} />
        <StatCard label="Sin trabajo planificado" value={unplannedCount} hint="Sin tareas con fecha en el horizonte" icon={CalendarClock} tone={unplannedCount > 0 ? 'warning' : 'neutral'} />
        <StatCard label="Fichas completas" value={`${avgComplete} %`} hint="Media de los clientes trabajando" icon={ClipboardList} tone={avgComplete >= 80 ? 'success' : 'info'} />
      </div>

      <div className="flex flex-col gap-2">
        <MsgLine msg={msg} className="self-start" />
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5 shrink-0" aria-hidden />
          <span>
            Actividad calculada{' '}
            {runInfo.lastRun ? `el ${new Date(runInfo.lastRun).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid' })}` : '— todavía no (pulsa «Recalcular actividad»)'}; se actualiza sola cada madrugada.
            {runInfo.lastError && <span className="text-destructive"> Último error: {runInfo.lastError}</span>}
          </span>
        </p>
      </div>

      {creating === 'form' && (
        <div className="flex flex-col gap-3 rounded-xl border border-brand/40 bg-card p-4 shadow-md sm:flex-row sm:items-end" data-testid="nuevo-cliente">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="n-name" className="gap-1">
              Nombre del cliente <span className="text-destructive">*</span>
            </Label>
            <Input id="n-name" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && newName.trim() && create()} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="n-status">Estado</Label>
            <select id="n-status" className={cn(selectClass, 'w-full sm:w-40')} value={newStatus} onChange={(e) => setNewStatus(e.target.value as ClientStatus)}>
              {CLIENT_STATUSES.filter((s) => s !== 'baja').map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className={cn(brandBtn, 'h-9')} disabled={pending || !newName.trim()} onClick={create}>
              Crear y abrir la ficha
            </Button>
            <Button size="sm" variant="ghost" className="h-9" onClick={() => setCreating(null)}>
              <X aria-hidden />
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {creating === 'ia' && <AiFill clientId={null} onClose={() => setCreating(null)} />}

      {missingOptions > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm">
          <AlertTriangle className="size-4 shrink-0 text-warning-strong" aria-hidden />
          <span className="min-w-0 flex-1">
            Hay {missingOptions} opci{missingOptions === 1 ? 'ón' : 'ones'} del campo «Cliente» de ClickUp sin ficha.
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await importMissingClients();
                setMsg(r.ok ? { type: 'ok', text: `${r.created} ficha${r.created === 1 ? '' : 's'} creada${r.created === 1 ? '' : 's'}.` } : { type: 'error', text: r.error });
                router.refresh();
              })
            }
          >
            Crear fichas
          </Button>
        </div>
      )}

      {duplicates.length > 0 && (
        <details className="group rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            <AlertTriangle className="size-4 shrink-0 text-warning-strong" aria-hidden />
            Posibles clientes duplicados ({duplicates.length}): revísalos y dales de baja o añade nombres alternativos
          </summary>
          <ul className="mt-2 ml-6 list-disc space-y-0.5">
            {duplicates.map(([a, b]) => (
              <li key={`${a}|${b}`}>
                {a} ↔ {b}
              </li>
            ))}
          </ul>
        </details>
      )}

      {showConfig && <ConfigPanel levels={levels} services={services} onClose={() => setShowConfig(false)} />}

      <div className="flex flex-col gap-2 rounded-xl border bg-card p-2 shadow-xs sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Buscar cliente" placeholder="Buscar por nombre o alias…" className="h-9 pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Filtrar por estado" className={cn(selectClass, 'min-w-0 flex-1 sm:flex-none')} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="trabajando">Activos y en onboarding</option>
            {CLIENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
            <option value="todos">Todos</option>
          </select>
          <select aria-label="Filtrar por nivel" className={cn(selectClass, 'min-w-0 flex-1 sm:flex-none')} value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
            <option value="">Todos los niveles</option>
            {levels.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
          <span className="px-1 text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {shown.length} de {rows.length}
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Todavía no hay clientes"
          description="Crea la primera ficha (o cuéntale el cliente a la IA) para que el equipo y los agentes lo conozcan."
          action={
            <Button size="sm" className={brandBtn} onClick={() => setCreating('form')}>
              <Plus aria-hidden />
              Nuevo cliente
            </Button>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState icon={Search} title="Ningún cliente coincide con el filtro." className="py-10" />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs" aria-label="Lista de clientes">
          {shown.map((c) => (
            <li key={c.id} data-testid={`cliente-${c.name}`} className={cn('transition-colors hover:bg-muted/30', c.status === 'baja' && 'bg-muted/40')}>
              <Link href={`/dashboard/clientes/${c.id}`} className="flex items-start gap-3 px-4 py-3.5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand sm:px-5">
                <div className={cn('min-w-0 flex-1 space-y-1.5', c.status === 'baja' && 'opacity-75')}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="truncate font-medium">{c.name}</p>
                    <Badge tone={STATUS_TONE[c.status] ?? 'neutral'}>{STATUS_LABEL[c.status as ClientStatus] ?? c.status}</Badge>
                    {!c.linked && (
                      <Badge tone="outline" className="text-muted-foreground">
                        <Link2Off aria-hidden />
                        sin vincular a ClickUp
                      </Badge>
                    )}
                  </div>
                  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/80">{c.levelLabel}</span>
                    {c.services.length > 0 && (
                      <>
                        <span aria-hidden>·</span>
                        <span>{c.services.join(', ')}</span>
                      </>
                    )}
                    {c.requestCount > 0 && (
                      <>
                        <span aria-hidden>·</span>
                        <span>{`${c.requestCount} encargo${c.requestCount === 1 ? '' : 's'}`}</span>
                      </>
                    )}
                  </p>
                  {(c.status === 'activo' || c.status === 'onboarding') && <AlertLine alert={c.alert} monthlyHours={c.monthlyHours} />}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <CompletenessBar pct={c.completeness} />
                  {c.missing > 0 && <span className="text-xs text-muted-foreground">faltan {c.missing} datos</span>}
                </div>
                <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
