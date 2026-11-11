'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Check,
  ClipboardList,
  Clock,
  Copy,
  Link2Off,
  Mic,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  Users,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge, EmptyState, StatCard } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { ClientMemoria } from './client-memoria';
import {
  aiFillClient,
  deleteClient,
  deleteLevel,
  deleteService,
  getClientMonthWork,
  importMissingClients,
  recalcClientActivity,
  saveClient,
  saveLevel,
  saveService,
  setClientActive,
  type ClientDraft,
  type ClientInput,
  type MonthWork
} from '@/lib/operaciones/client-actions';

export type ClientView = {
  id: string;
  name: string;
  aliases: string[];
  clickupOptionId: string;
  usualSpaceId: string;
  usualListIds: string[];
  level: string;
  deliveryDays: number | null;
  inactivityDays: number | null;
  planningDays: number | null;
  alertsEnabled: boolean;
  alert: {
    state: 'red' | 'amber' | 'green' | 'gray';
    note: string;
    lastActivityDays: number | null;
    hasData: boolean;
    windowDays: number;
    hoursMonth: number;
    completedMonth: number;
    upcoming: number;
    horizonDays: number;
  };
  monthlyHours: number | null;
  workDays: number[]; // vacío = lunes a viernes
  tools: { name: string; url: string; note: string }[];
  business: string;
  offerings: string;
  area: string;
  audience: string;
  goals: string;
  strategy: string;
  notes: string;
  active: boolean;
  services: { key: string; responsibleClickupId: string }[];
  requestCount: number;
};

type Level = { key: string; label: string; defaultDays: number; inactivityDays: number; planningDays: number };
type Service = { key: string; label: string; active: boolean };
type Member = { id: string; username: string };
type Space = { id: string; name: string; lists: { id: string; name: string }[] };
type Option = { id: string; label: string };
type Msg = { type: 'ok' | 'error'; text: string } | null;

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MAX_RECORDING_SECONDS = 300;

const focusRing = 'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40 focus-visible:border-brand';

const areaClass = cn(
  'w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground',
  focusRing
);
const selectClass = cn('h-9 rounded-md border border-input bg-card px-2.5 text-sm shadow-xs', focusRing);
const checkClass = 'size-4 shrink-0 rounded accent-[var(--brand)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';
const brandBtn = 'bg-brand text-white hover:bg-brand/90';
const dangerGhost = 'text-muted-foreground hover:bg-destructive-soft hover:text-destructive';

const emptyClient = (level: string): ClientView => ({
  id: '',
  name: '',
  aliases: [],
  clickupOptionId: '',
  usualSpaceId: '',
  usualListIds: [],
  level,
  deliveryDays: null,
  inactivityDays: null,
  planningDays: null,
  alertsEnabled: true,
  alert: { state: 'gray', note: '', lastActivityDays: null, hasData: false, windowDays: 0, hoursMonth: 0, completedMonth: 0, upcoming: 0, horizonDays: 0 },
  monthlyHours: null,
  workDays: [],
  tools: [],
  business: '',
  offerings: '',
  area: '',
  audience: '',
  goals: '',
  strategy: '',
  notes: '',
  active: true,
  services: [],
  requestCount: 0
});

const daysWord = (n: number) => `${n} día${n === 1 ? '' : 's'}`;

function MsgLine({ msg, className }: { msg: Msg; className?: string }) {
  if (!msg) return null;
  return (
    <p
      role={msg.type === 'error' ? 'alert' : 'status'}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm',
        msg.type === 'ok' ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive',
        className
      )}
    >
      {msg.type === 'ok' ? <Check className="size-3.5" aria-hidden /> : <AlertTriangle className="size-3.5" aria-hidden />}
      {msg.text}
    </p>
  );
}

export function ClientesView({
  clients,
  levels,
  runInfo,
  services,
  members,
  spaces,
  options,
  missingOptions,
  duplicates
}: {
  clients: ClientView[];
  levels: Level[];
  runInfo: { lastRun: string | null; lastError: string | null };
  services: Service[];
  members: Member[];
  spaces: Space[];
  options: Option[];
  missingOptions: number;
  duplicates: [string, string][];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null); // id de ficha, 'new' o null
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();
  const [showConfig, setShowConfig] = useState(false);
  const [q, setQ] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const levelOf = new Map(levels.map((l) => [l.key, l]));
  const serviceLabel = new Map(services.map((s) => [s.key, s.label]));

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) =>
    startTransition(async () => {
      setMsg(null);
      const res = await fn();
      setMsg(res.ok ? { type: 'ok', text: okText } : { type: 'error', text: res.error ?? 'Error' });
      router.refresh();
    });

  const onSaved = (text: string) => {
    setEditing(null);
    setMsg({ type: 'ok', text });
    router.refresh();
  };

  const needle = q.trim().toLowerCase();
  const shown = clients.filter(
    (c) =>
      (statusFilter === 'all' || (statusFilter === 'active') === c.active) &&
      (!levelFilter || c.level === levelFilter) &&
      (!needle || [c.name, ...c.aliases].some((t) => t.toLowerCase().includes(needle)))
  );

  // Cifras de la cabecera: solo con los datos que ya tiene la pantalla (sin consultas nuevas).
  const activeClients = clients.filter((c) => c.active);
  const redCount = activeClients.filter((c) => c.alert.state === 'red').length;
  const unplannedCount = activeClients.filter((c) => c.alert.hasData && c.alert.horizonDays > 0 && c.alert.upcoming === 0).length;
  const incompleteCount = activeClients.filter((c) => !c.clickupOptionId || c.services.length === 0 || !c.business.trim()).length;

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Encabezado compacto de la sección */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">Clientes</h2>
          <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground text-pretty">
            Una ficha por cliente: cómo se le llama, su nivel y plazo, qué servicios tiene y quién los lleva. El agente la
            usa al convertir notas (reconoce al cliente, propone fecha y responsable).
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
            {pending ? 'Calculando…' : 'Recalcular actividad'}
          </Button>
          <Button size="sm" variant="outline" aria-expanded={showConfig} onClick={() => setShowConfig((v) => !v)}>
            <Settings2 aria-hidden />
            Niveles y servicios
          </Button>
          <Button size="sm" className={brandBtn} disabled={editing !== null} onClick={() => setEditing('new')}>
            <Plus aria-hidden />
            Nuevo cliente
          </Button>
        </div>
      </div>

      {/* Cifras */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total de clientes"
          value={clients.length}
          hint={`${activeClients.length} activo${activeClients.length === 1 ? '' : 's'}`}
          icon={Users}
          tone="brand"
        />
        <StatCard label="En alerta roja" value={redCount} hint="Clientes activos" icon={AlertTriangle} tone={redCount > 0 ? 'danger' : 'neutral'} />
        <StatCard
          label="Sin trabajo planificado"
          value={unplannedCount}
          hint="Sin tareas con fecha en el horizonte"
          icon={CalendarClock}
          tone={unplannedCount > 0 ? 'warning' : 'neutral'}
        />
        <StatCard
          label="Fichas sin completar"
          value={incompleteCount}
          hint="Sin vincular, sin servicios o sin negocio"
          icon={ClipboardList}
          tone={incompleteCount > 0 ? 'info' : 'neutral'}
        />
      </div>

      <div className="flex flex-col gap-2">
        <MsgLine msg={msg} className="self-start" />
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5 shrink-0" aria-hidden />
          <span>
            Actividad calculada{' '}
            {runInfo.lastRun
              ? `el ${new Date(runInfo.lastRun).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid' })}`
              : '— todavía no (pulsa «Recalcular actividad»)'}
            ; se actualiza sola cada madrugada.
            {runInfo.lastError && <span className="text-destructive"> Último error: {runInfo.lastError}</span>}
          </span>
        </p>
      </div>

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
              act(async () => {
                const r = await importMissingClients();
                return r.ok ? { ok: true } : r;
              }, 'Fichas creadas.')
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
            Posibles clientes duplicados ({duplicates.length}): revísalos y desactiva o añade nombres alternativos
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

      {editing === 'new' && (
        <ClientForm
          key="new"
          initial={emptyClient(levels.find((l) => l.key === 'standard')?.key ?? levels[0]?.key ?? '')}
          levels={levels}
          services={services}
          members={members}
          spaces={spaces}
          options={options}
          onCancel={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}

      {/* Barra de filtros */}
      <div className="flex flex-col gap-2 rounded-xl border bg-card p-2 shadow-xs sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            aria-label="Buscar cliente"
            placeholder="Buscar por nombre o alias…"
            className="h-9 pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filtrar por nivel"
            className={cn(selectClass, 'min-w-0 flex-1 sm:flex-none')}
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
          >
            <option value="">Todos los niveles</option>
            {levels.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por estado"
            className={cn(selectClass, 'min-w-0 flex-1 sm:flex-none')}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'active' | 'inactive' | 'all')}
          >
            <option value="active">Activos</option>
            <option value="inactive">Desactivados</option>
            <option value="all">Todos</option>
          </select>
          <span className="px-1 text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {shown.length} de {clients.length}
          </span>
        </div>
      </div>

      {clients.length === 0 && editing !== 'new' ? (
        <EmptyState
          icon={Building2}
          title="Todavía no hay clientes"
          description="Crea la primera ficha para que el agente reconozca a tus clientes."
          action={
            <Button size="sm" className={brandBtn} onClick={() => setEditing('new')}>
              <Plus aria-hidden />
              Nuevo cliente
            </Button>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState icon={Search} title="Ningún cliente coincide con el filtro." className="py-10" />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs" aria-label="Lista de clientes">
          {shown.map((c) =>
            editing === c.id ? (
              <li key={c.id} className="bg-muted/40 p-2 sm:p-3">
                <ClientForm
                  initial={c}
                  levels={levels}
                  services={services}
                  members={members}
                  spaces={spaces}
                  options={options}
                  onCancel={() => setEditing(null)}
                  onSaved={onSaved}
                />
              </li>
            ) : (
              <li
                key={c.id}
                data-testid={`cliente-${c.name}`}
                className={cn('px-4 py-3.5 transition-colors hover:bg-muted/30 sm:px-5', !c.active && 'bg-muted/40')}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className={cn('min-w-0 flex-1 space-y-1.5', !c.active && 'opacity-75')}>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="truncate font-medium">{c.name}</p>
                      {!c.active && <Badge tone="neutral">Desactivado</Badge>}
                      {!c.clickupOptionId && (
                        <Badge tone="outline" className="text-muted-foreground">
                          <Link2Off aria-hidden />
                          sin vincular a ClickUp
                        </Badge>
                      )}
                    </div>
                    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/80">{levelOf.get(c.level)?.label ?? c.level}</span>
                      <span aria-hidden>·</span>
                      <span>
                        plazo{' '}
                        {c.deliveryDays != null
                          ? `${daysWord(c.deliveryDays)} (propio)`
                          : `${daysWord(levelOf.get(c.level)?.defaultDays ?? 0)} (del nivel)`}
                      </span>
                      {c.requestCount > 0 && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{`${c.requestCount} encargo${c.requestCount === 1 ? '' : 's'}`}</span>
                        </>
                      )}
                    </p>
                    <AlertLine c={c} />
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1 sm:justify-end">
                    <Button size="sm" variant="outline" disabled={editing !== null || pending} onClick={() => setEditing(c.id)}>
                      <Pencil aria-hidden />
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        act(() => setClientActive(c.id, !c.active), c.active ? 'Cliente desactivado.' : 'Cliente reactivado.')
                      }
                    >
                      <Power aria-hidden />
                      {c.active ? 'Desactivar' : 'Reactivar'}
                    </Button>
                    {c.requestCount > 0 ? (
                      <span className="px-1 text-xs text-muted-foreground">Con encargos: solo se puede desactivar</span>
                    ) : (
                      <DeleteButton name={c.name} disabled={pending} onConfirm={() => act(() => deleteClient(c.id), 'Ficha eliminada.')} />
                    )}
                  </div>
                </div>

                {(c.aliases.length > 0 || c.services.length > 0 || c.business || c.notes || c.clickupOptionId) && (
                  <div className={cn('mt-3 space-y-2', !c.active && 'opacity-75')}>
                    {c.aliases.length > 0 && (
                      <p className="text-xs text-muted-foreground">También se le llama: {c.aliases.join(', ')}</p>
                    )}
                    {c.services.length > 0 && (
                      <div className="flex flex-wrap gap-1.5" aria-label="Servicios contratados">
                        {c.services.map((s) => (
                          <Badge key={s.key} tone="brand">
                            {serviceLabel.get(s.key) ?? s.key}
                            {s.responsibleClickupId
                              ? ` · ${members.find((m) => m.id === s.responsibleClickupId)?.username ?? '—'}`
                              : ''}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {c.business && <p className="line-clamp-3 text-sm whitespace-pre-line text-foreground/90">{c.business}</p>}
                    {c.notes && (
                      <p className="text-xs text-muted-foreground whitespace-pre-line">
                        <span className="font-medium">Notas:</span> {c.notes}
                      </p>
                    )}
                    {c.clickupOptionId && <MonthWorkButton clientId={c.id} name={c.name} />}
                  </div>
                )}
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}

function DeleteButton({ name, disabled, onConfirm }: { name: string; disabled: boolean; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button size="sm" variant="ghost" className={dangerGhost} disabled={disabled} onClick={() => setAsking(true)}>
        <Trash2 aria-hidden />
        Eliminar
      </Button>
    );
  }
  return (
    <span
      role="group"
      aria-label="Confirmar eliminación"
      className="flex flex-wrap items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive-soft px-2 py-1 text-sm text-destructive"
    >
      ¿Eliminar la ficha de {name}?
      <Button
        size="sm"
        variant="destructive"
        disabled={disabled}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        Sí, eliminar
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
        No
      </Button>
    </span>
  );
}

// --- Niveles y servicios ----------------------------------------------------------------------

function ConfigPanel({ levels, services, onClose }: { levels: Level[]; services: Service[]; onClose: () => void }) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) =>
    startTransition(async () => {
      setMsg(null);
      const res = await fn();
      setMsg(res.ok ? { type: 'ok', text: okText } : { type: 'error', text: res.error ?? 'Error' });
      router.refresh();
    });

  return (
    <section className="rounded-xl border bg-card shadow-sm animate-fade-up" data-testid="config-panel" aria-labelledby="config-title">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <Settings2 className="size-4 text-brand" aria-hidden />
          <h3 id="config-title" className="text-[15px] font-semibold">
            Niveles y servicios
          </h3>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X aria-hidden />
          Cerrar
        </Button>
      </div>
      <div className="space-y-6 p-4 sm:p-5">
        <MsgLine msg={msg} />

        <div className="space-y-2">
          <Label className="leading-snug">
            Niveles: plazo de entrega (días laborables), días sin actividad para alertar y horizonte de trabajo planificado
          </Label>
          <div className="divide-y rounded-lg border">
            {levels.map((l) => (
              <LevelRow key={`${l.key}-${l.label}-${l.defaultDays}-${l.inactivityDays}-${l.planningDays}`} level={l} disabled={pending} run={run} />
            ))}
            <LevelRow level={null} disabled={pending} run={run} />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="leading-snug">Servicios (el agente los reconoce en cada encargo)</Label>
          <div className="divide-y rounded-lg border">
            {services.map((s) => (
              <ServiceRow key={`${s.key}-${s.label}-${s.active}`} service={s} disabled={pending} run={run} />
            ))}
            <ServiceRow service={null} disabled={pending} run={run} />
          </div>
        </div>
      </div>
    </section>
  );
}

type Run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => void;

function LevelRow({ level, disabled, run }: { level: Level | null; disabled: boolean; run: Run }) {
  const [label, setLabel] = useState(level?.label ?? '');
  const [days, setDays] = useState(level?.defaultDays ?? 3);
  const [inact, setInact] = useState(level?.inactivityDays ?? 14);
  const [plan, setPlan] = useState(level?.planningDays ?? 14);
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5', !level && 'bg-muted/30')}>
      <Input aria-label="Nombre del nivel" className="h-8 w-full sm:w-44" placeholder="Nuevo nivel…" value={label} onChange={(e) => setLabel(e.target.value)} />
      <span className="flex items-center gap-1.5">
        <Input
          aria-label="Días por defecto"
          type="number"
          min={0}
          max={60}
          className="h-8 w-16"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        />
        <span className="text-xs text-muted-foreground">días de entrega</span>
      </span>
      <span className="flex items-center gap-1.5">
        <Input aria-label="Días sin actividad" type="number" min={1} max={90} className="h-8 w-16" value={inact} onChange={(e) => setInact(Number(e.target.value))} />
        <span className="text-xs text-muted-foreground">sin actividad</span>
      </span>
      <span className="flex items-center gap-1.5">
        <Input aria-label="Horizonte de trabajo planificado" type="number" min={0} max={60} className="h-8 w-16" value={plan} onChange={(e) => setPlan(Number(e.target.value))} />
        <span className="text-xs text-muted-foreground">planificado (0 = sin alerta)</span>
      </span>
      <span className="ml-auto flex items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || !label.trim()}
          onClick={() => run(() => saveLevel({ key: level?.key ?? null, label, defaultDays: days, inactivityDays: inact, planningDays: plan }), level ? 'Nivel guardado.' : 'Nivel creado.')}
        >
          {level ? 'Guardar' : (
            <>
              <Plus aria-hidden />
              Añadir
            </>
          )}
        </Button>
        {level && (
          <Button size="sm" variant="ghost" className={dangerGhost} disabled={disabled} onClick={() => run(() => deleteLevel(level.key), 'Nivel eliminado.')}>
            Eliminar
          </Button>
        )}
      </span>
    </div>
  );
}

function ServiceRow({ service, disabled, run }: { service: Service | null; disabled: boolean; run: Run }) {
  const [label, setLabel] = useState(service?.label ?? '');
  const [active, setActive] = useState(service?.active ?? true);
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5', !service && 'bg-muted/30')}>
      <Input aria-label="Nombre del servicio" className="h-8 w-full sm:w-56" placeholder="Nuevo servicio…" value={label} onChange={(e) => setLabel(e.target.value)} />
      <label className="flex items-center gap-1.5 text-sm">
        <input type="checkbox" className={checkClass} checked={active} onChange={(e) => setActive(e.target.checked)} />
        Activo
      </label>
      <span className="ml-auto flex items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || !label.trim()}
          onClick={() => run(() => saveService({ key: service?.key ?? null, label, active }), service ? 'Servicio guardado.' : 'Servicio creado.')}
        >
          {service ? 'Guardar' : (
            <>
              <Plus aria-hidden />
              Añadir
            </>
          )}
        </Button>
        {service && (
          <Button size="sm" variant="ghost" className={dangerGhost} disabled={disabled} onClick={() => run(() => deleteService(service.key), 'Servicio eliminado.')}>
            Eliminar
          </Button>
        )}
      </span>
    </div>
  );
}

// --- Formulario de la ficha -------------------------------------------------------------------

// Bloque del formulario: título y descripción a la izquierda (en pantallas anchas) y campos a la derecha.
function FormSection({
  title,
  description,
  children
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <fieldset className="m-0 grid min-w-0 gap-4 border-0 border-t px-4 py-5 sm:px-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
      <legend className="sr-only">{title}</legend>
      <div aria-hidden>
        <p className="text-sm font-semibold">{title}</p>
        {description && <p className="mt-1 text-xs text-muted-foreground text-pretty">{description}</p>}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </fieldset>
  );
}

function ClientForm({
  initial,
  levels,
  services,
  members,
  spaces,
  options,
  onCancel,
  onSaved
}: {
  initial: ClientView;
  levels: Level[];
  services: Service[];
  members: Member[];
  spaces: Space[];
  options: Option[];
  onCancel: () => void;
  onSaved: (text: string) => void;
}) {
  const [f, setF] = useState<ClientView>(initial);
  const [aliasText, setAliasText] = useState(initial.aliases.join(', '));
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();
  const isNew = !initial.id;

  const set = (patch: Partial<ClientView>) => {
    setF((cur) => ({ ...cur, ...patch }));
    setDirty(true);
  };

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const levelDefault = levels.find((l) => l.key === f.level)?.defaultDays ?? 0;
  const space = spaces.find((s) => s.id === f.usualSpaceId);
  const svc = (key: string) => f.services.find((s) => s.key === key);
  const toggleService = (key: string, on: boolean) =>
    set({ services: on ? [...f.services, { key, responsibleClickupId: '' }] : f.services.filter((s) => s.key !== key) });
  const setResponsible = (key: string, id: string) =>
    set({ services: f.services.map((s) => (s.key === key ? { ...s, responsibleClickupId: id } : s)) });

  const applyDraft = (d: ClientDraft) => {
    setF((cur) => ({
      ...cur,
      name: d.name ?? cur.name,
      level: d.level ?? cur.level,
      deliveryDays: d.deliveryDays ?? cur.deliveryDays,
      services: d.services ?? cur.services,
      monthlyHours: d.monthlyHours ?? cur.monthlyHours,
      workDays: d.workDays ?? cur.workDays,
      tools: d.tools ?? cur.tools,
      business: d.business ?? cur.business,
      offerings: d.offerings ?? cur.offerings,
      area: d.area ?? cur.area,
      audience: d.audience ?? cur.audience,
      goals: d.goals ?? cur.goals,
      strategy: d.strategy ?? cur.strategy,
      notes: d.notes ?? cur.notes,
      aliases: d.aliases ? [...new Set([...cur.aliases, ...d.aliases])] : cur.aliases
    }));
    if (d.aliases) {
      const merged = [...new Set([...aliasText.split(',').map((a) => a.trim()).filter(Boolean), ...d.aliases])];
      setAliasText(merged.join(', '));
    }
    setDirty(true);
  };

  const save = () =>
    startTransition(async () => {
      setMsg(null);
      const input: ClientInput = {
        id: isNew ? null : initial.id,
        name: f.name,
        aliases: aliasText.split(',').map((a) => a.trim()).filter(Boolean),
        clickupOptionId: f.clickupOptionId,
        usualSpaceId: f.usualSpaceId,
        usualListIds: f.usualListIds,
        level: f.level,
        deliveryDays: f.deliveryDays,
        inactivityDays: f.inactivityDays,
        planningDays: f.planningDays,
        alertsEnabled: f.alertsEnabled,
        monthlyHours: f.monthlyHours,
        workDays: f.workDays,
        tools: f.tools,
        business: f.business,
        offerings: f.offerings,
        area: f.area,
        audience: f.audience,
        goals: f.goals,
        strategy: f.strategy,
        notes: f.notes,
        active: f.active,
        services: f.services
      };
      const res = await saveClient(input);
      if (res.ok) {
        setDirty(false);
        onSaved(isNew ? 'Cliente creado.' : 'Ficha guardada.');
      } else setMsg({ type: 'error', text: res.error });
    });

  const text = (id: string, label: string, key: keyof ClientView, rows = 2, placeholder?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        rows={rows}
        className={areaClass}
        placeholder={placeholder}
        value={String(f[key] ?? '')}
        onChange={(e) => set({ [key]: e.target.value } as Partial<ClientView>)}
      />
    </div>
  );

  const fieldHint = 'text-xs text-muted-foreground';

  return (
    <div className="rounded-xl border border-brand/40 bg-card shadow-md ring-1 ring-brand/10 animate-fade-up" data-testid="cliente-form">
      {/* Cabecera del formulario */}
      <div className="flex flex-col gap-3 rounded-t-xl bg-muted/30 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">{isNew ? 'Nuevo cliente' : `Editar la ficha de ${initial.name}`}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Los campos con <span className="text-destructive">*</span> son obligatorios.
          </p>
        </div>
        <div className="sm:max-w-[60%]">
          <AiFill name={f.name} onDraft={applyDraft} />
        </div>
      </div>

      <FormSection title="Datos" description="Cómo se llama el cliente, cómo se le reconoce en ClickUp y dónde se le trabaja.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="c-name" className="gap-1">
              Nombre <span className="text-destructive">*</span>
            </Label>
            <Input id="c-name" aria-required value={f.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-option">Opción del campo «Cliente» de ClickUp</Label>
            <select id="c-option" className={cn(selectClass, 'w-full')} value={f.clickupOptionId} onChange={(e) => set({ clickupOptionId: e.target.value })}>
              <option value="">— Sin vincular —</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="c-aliases">Nombres alternativos (separados por comas)</Label>
            <Input
              id="c-aliases"
              aria-describedby="c-aliases-hint"
              placeholder="Ej.: plupilates, club pilates, cp"
              value={aliasText}
              onChange={(e) => {
                setAliasText(e.target.value);
                setDirty(true);
              }}
            />
            <p id="c-aliases-hint" className={fieldHint}>
              Variantes y errores de dictado: así el agente reconoce al cliente.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="c-space">Espacio y listas habituales</Label>
          <select
            id="c-space"
            aria-label="Espacio habitual"
            className={cn(selectClass, 'w-full')}
            value={f.usualSpaceId}
            onChange={(e) => set({ usualSpaceId: e.target.value, usualListIds: [] })}
          >
            <option value="">— Sin espacio habitual —</option>
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {space && (
            <div className="grid max-h-48 gap-1 overflow-y-auto rounded-lg border bg-muted/20 p-2 sm:grid-cols-2" role="group" aria-label="Listas habituales">
              {space.lists.map((l) => (
                <label key={l.id} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    className={checkClass}
                    checked={f.usualListIds.includes(l.id)}
                    onChange={(e) =>
                      set({ usualListIds: e.target.checked ? [...f.usualListIds, l.id] : f.usualListIds.filter((id) => id !== l.id) })
                    }
                  />
                  <span className="min-w-0 truncate">{l.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="c-level">Nivel</Label>
            <select id="c-level" className={cn(selectClass, 'w-full')} value={f.level} onChange={(e) => set({ level: e.target.value })}>
              {levels.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-days">Plazo de entrega (días laborables)</Label>
            <Input
              id="c-days"
              type="number"
              min={0}
              max={60}
              aria-describedby="c-days-hint"
              placeholder={String(levelDefault)}
              value={f.deliveryDays ?? ''}
              onChange={(e) => set({ deliveryDays: e.target.value === '' ? null : Number(e.target.value) })}
            />
            <p id="c-days-hint" className={fieldHint}>
              Vacío = {daysWord(levelDefault)} (el del nivel).
            </p>
          </div>
        </div>
      </FormSection>

      <FormSection title="Servicios" description="Qué tiene contratado, quién lo lleva y cuánta dedicación necesita.">
        <div className="space-y-1.5">
          <Label>Servicios contratados y responsable habitual</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {services.map((s) => {
              const on = svc(s.key);
              return (
                <div
                  key={s.key}
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors',
                    on ? 'border-brand/40 bg-brand-soft/50' : 'bg-card'
                  )}
                >
                  <label className="flex min-w-0 items-center gap-2 text-sm">
                    <input type="checkbox" className={checkClass} checked={Boolean(on)} onChange={(e) => toggleService(s.key, e.target.checked)} />
                    <span className="truncate">{s.label}</span>
                    {!s.active && <span className="text-xs text-muted-foreground">(inactivo)</span>}
                  </label>
                  {on && (
                    <select
                      aria-label={`Responsable de ${s.label}`}
                      className={cn(selectClass, 'h-8 max-w-full text-xs')}
                      value={on.responsibleClickupId}
                      onChange={(e) => setResponsible(s.key, e.target.value)}
                    >
                      <option value="">Sin responsable</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.username}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="c-hours">Horas al mes</Label>
            <Input
              id="c-hours"
              type="number"
              min={0}
              step={0.5}
              className="w-28"
              value={f.monthlyHours ?? ''}
              onChange={(e) => set({ monthlyHours: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label id="c-workdays-label">Días de la semana en que se le trabaja (ninguno = L–V)</Label>
            <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="c-workdays-label">
              {DAY_LABELS.map((lbl, idx) => {
                const day = idx + 1;
                const on = f.workDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ workDays: on ? f.workDays.filter((d) => d !== day) : [...f.workDays, day].sort() })}
                    className={cn(
                      'size-9 rounded-full border text-sm font-medium transition-colors',
                      focusRing,
                      on ? 'border-brand bg-brand text-white' : 'border-input bg-card text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Webs y herramientas</Label>
          <p className="flex items-center gap-1.5 text-xs text-warning-strong">
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
            Aquí no se guardan contraseñas ni accesos: solo dónde está cada cosa.
          </p>
          {f.tools.length > 0 && (
            <div className="space-y-2">
              {f.tools.map((t, i) => (
                <div key={i} className="grid gap-2 rounded-lg border bg-muted/20 p-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
                  <Input aria-label="Herramienta" placeholder="GA4, Search Console, web…" className="h-8" value={t.name} onChange={(e) => set({ tools: f.tools.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                  <Input aria-label="Dirección" placeholder="https://…" className="h-8" value={t.url} onChange={(e) => set({ tools: f.tools.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
                  <Input aria-label="Nota" placeholder="Nota" className="h-8" value={t.note} onChange={(e) => set({ tools: f.tools.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) })} />
                  <Button size="sm" variant="ghost" className={cn(dangerGhost, 'justify-self-start')} onClick={() => set({ tools: f.tools.filter((_, j) => j !== i) })}>
                    <X aria-hidden />
                    Quitar
                  </Button>
                </div>
              ))}
            </div>
          )}
          <Button size="sm" variant="outline" onClick={() => set({ tools: [...f.tools, { name: '', url: '', note: '' }] })}>
            <Plus aria-hidden />
            Añadir web o herramienta
          </Button>
        </div>
      </FormSection>

      <FormSection title="Estrategia" description="Contexto del negocio que el agente usa para entender los encargos.">
        <div className="grid gap-4 sm:grid-cols-2">
          {text('c-business', 'Negocio: a qué se dedica', 'business', 3)}
          {text('c-offerings', 'Productos o servicios que ofrece', 'offerings', 3)}
          <div className="space-y-1.5">
            <Label htmlFor="c-area">Zona</Label>
            <Input id="c-area" value={f.area} onChange={(e) => set({ area: e.target.value })} />
          </div>
          {text('c-audience', 'Público objetivo', 'audience', 2)}
        </div>
        {text('c-goals', 'Objetivos', 'goals', 2, 'Ej.: 30 leads al mes')}
        {text('c-strategy', 'Estrategia actual', 'strategy', 3)}
        {text('c-notes', 'Peculiaridades y notas', 'notes', 3)}
      </FormSection>

      <FormSection title="Alertas" description="Cuándo avisar de que un cliente lleva tiempo sin actividad o sin trabajo planificado.">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className={cn(checkClass, 'mt-0.5')}
            checked={f.alertsEnabled}
            onChange={(e) => set({ alertsEnabled: e.target.checked })}
          />
          Genera alertas (solo si tiene algún servicio contratado u horas al mes)
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="c-inact">Días sin actividad para alertar</Label>
            <Input
              id="c-inact"
              type="number"
              min={1}
              max={90}
              placeholder={String(levels.find((l) => l.key === f.level)?.inactivityDays ?? '')}
              value={f.inactivityDays ?? ''}
              onChange={(e) => set({ inactivityDays: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-plan">Horizonte de trabajo planificado (días, 0 = sin alerta)</Label>
            <Input
              id="c-plan"
              type="number"
              min={0}
              max={60}
              placeholder={String(levels.find((l) => l.key === f.level)?.planningDays ?? '')}
              value={f.planningDays ?? ''}
              onChange={(e) => set({ planningDays: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </div>
        </div>
        <p className={fieldHint}>Vacío = el del nivel.</p>
      </FormSection>

      <FormSection title="Contactos y memoria" description="De quién son los correos y qué hay que recordar del cliente.">
        {isNew ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Guarda la ficha para poder añadir contactos y memoria del cliente.
          </p>
        ) : (
          <ClientMemoria clientId={initial.id} />
        )}
      </FormSection>

      <FormSection title="Estado">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className={cn(checkClass, 'mt-0.5')} checked={f.active} onChange={(e) => set({ active: e.target.checked })} />
          Cliente activo (si se desactiva, el agente lo sigue reconociendo pero avisa en la revisión)
        </label>
      </FormSection>

      {/* Pie fijo con las acciones */}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 rounded-b-xl border-t bg-card/95 px-4 py-3 backdrop-blur sm:px-5">
        <Button size="sm" className={brandBtn} disabled={pending || !f.name.trim()} onClick={save}>
          {pending ? 'Guardando…' : 'Guardar ficha'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (!dirty || window.confirm('Hay cambios sin guardar. ¿Descartarlos?')) onCancel();
          }}
        >
          Cancelar
        </Button>
        {dirty && (
          <Badge tone="warning" dot>
            Cambios sin guardar
          </Badge>
        )}
        <MsgLine msg={msg} />
      </div>
    </div>
  );
}

// «Rellenar con IA»: texto pegado o audio grabado → la IA propone los campos (no guarda nada).
function AiFill({ name, onDraft }: { name: string; onDraft: (d: ClientDraft) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
    if (timer.current) clearInterval(timer.current);
  };

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      if (recorder.current && recorder.current.state !== 'inactive') {
        recorder.current.onstop = null;
        recorder.current.stream.getTracks().forEach((t) => t.stop());
      }
    },
    []
  );

  const start = async () => {
    setMsg(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMsg({ type: 'error', text: 'Este navegador no permite grabar audio.' });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMsg({ type: 'error', text: 'No se pudo acceder al micrófono (permiso denegado).' });
      return;
    }
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks.current = [];
    mr.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      setTranscribing(true);
      try {
        const form = new FormData();
        form.append('audio', new Blob(chunks.current, { type: mr.mimeType || 'audio/webm' }), 'cliente.webm');
        // Misma ruta que la ficha del Equipo: solo transcribe, no guarda el audio.
        const res = await fetch('/api/operaciones/equipo-audio', { method: 'POST', body: form });
        const json = (await res.json()) as { transcript?: string; error?: string };
        if (json.error) setMsg({ type: 'error', text: json.error });
        else if (json.transcript) {
          setText((cur) => (cur ? `${cur}\n${json.transcript}` : json.transcript!));
          setMsg({ type: 'ok', text: 'Audio transcrito: revisa el texto y pulsa «Proponer campos».' });
        } else setMsg({ type: 'error', text: 'No se oyó ninguna voz en el audio.' });
      } catch {
        setMsg({ type: 'error', text: 'No se pudo enviar el audio.' });
      } finally {
        setTranscribing(false);
      }
    };
    recorder.current = mr;
    mr.start();
    setSeconds(0);
    setRecording(true);
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_RECORDING_SECONDS) stop();
        return s + 1;
      });
    }, 1000);
  };

  const run = () =>
    startTransition(async () => {
      setMsg(null);
      const res = await aiFillClient(text, name);
      if (!res.ok) {
        setMsg({ type: 'error', text: res.error });
        return;
      }
      onDraft(res.draft);
      setMsg({ type: 'ok', text: 'Propuesta aplicada al formulario: revísala y pulsa «Guardar ficha».' });
    });

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="border-brand/40 text-brand hover:bg-brand-soft hover:text-brand" onClick={() => setOpen(true)}>
        <Sparkles aria-hidden />
        Rellenar con IA
      </Button>
    );
  }
  return (
    <div className="w-full space-y-2.5 rounded-lg border border-brand/30 bg-brand-soft p-3 sm:min-w-[22rem]">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-brand" aria-hidden />
        <p className="text-sm font-medium">Rellenar con IA</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Pega un texto o graba un audio describiendo al cliente. La IA propone los campos y tú los revisas antes de
        guardar; solo cambia los que consiga deducir. No dictes contraseñas.
      </p>
      <textarea
        rows={5}
        aria-label="Descripción del cliente para la IA"
        className={areaClass}
        placeholder="Ej.: RF Serveis es una empresa de servicios de Barcelona. Llevamos su SEO y el mantenimiento de la web…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className={brandBtn} disabled={pending || recording || transcribing || text.trim().length < 10} onClick={run}>
          {pending ? 'Pensando…' : 'Proponer campos'}
        </Button>
        {recording ? (
          <Button size="sm" variant="destructive" onClick={stop}>
            <Square className="fill-current" aria-hidden />
            Parar ({seconds}s)
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={pending || transcribing} onClick={start}>
            <Mic aria-hidden />
            {transcribing ? 'Transcribiendo…' : 'Grabar audio'}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cerrar
        </Button>
      </div>
      {msg && (
        <p role={msg.type === 'error' ? 'alert' : 'status'} className={`text-xs ${msg.type === 'ok' ? 'text-success' : 'text-destructive'}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

// --- Semáforo y trabajo del mes ---------------------------------------------------------------

const DOT_TONE: Record<ClientView['alert']['state'], 'danger' | 'warning' | 'success' | 'neutral'> = {
  red: 'danger',
  amber: 'warning',
  green: 'success',
  gray: 'neutral'
};
const DOT_LABEL: Record<string, string> = { red: 'Rojo', amber: 'Ámbar', green: 'Verde', gray: 'Gris' };

function AlertLine({ c }: { c: ClientView }) {
  const a = c.alert;
  const hours = a.hasData
    ? `≈${a.hoursMonth.toLocaleString('es-ES', { maximumFractionDigits: 1 })}${c.monthlyHours ? ` / ${c.monthlyHours.toLocaleString('es-ES')}` : ''} h este mes`
    : null;
  const last = !a.hasData
    ? null
    : a.lastActivityDays === null
      ? `sin actividad en más de ${a.windowDays} días`
      : a.lastActivityDays === 0
        ? 'última actividad hoy'
        : `última actividad hace ${a.lastActivityDays} día${a.lastActivityDays === 1 ? '' : 's'}`;
  const facts: string[] = [];
  if (last) facts.push(last);
  if (hours) facts.push(hours);
  if (a.hasData) facts.push(`${a.completedMonth} completadas este mes`);
  if (a.hasData && a.horizonDays > 0) facts.push(`${a.upcoming} con fecha en ${a.horizonDays} días`);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" data-testid="semaforo">
      <Badge tone={DOT_TONE[a.state]} dot aria-label={`Semáforo: ${DOT_LABEL[a.state]}`}>
        {a.state === 'gray' ? a.note || DOT_LABEL[a.state] : DOT_LABEL[a.state]}
      </Badge>
      {facts.map((t, i) => (
        <span key={i} className="flex items-center gap-2 text-muted-foreground">
          {i > 0 && <span aria-hidden>·</span>}
          {t}
        </span>
      ))}
      {(a.state === 'red' || a.state === 'amber') && <span className="font-medium text-warning-strong">{a.note}</span>}
    </div>
  );
}

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' });

function MonthWorkButton({ clientId, name }: { clientId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<'current' | 'previous'>('current');
  const [work, setWork] = useState<MonthWork | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const load = (m: 'current' | 'previous') =>
    startTransition(async () => {
      setError(null);
      setCopied(false);
      const res = await getClientMonthWork(clientId, m);
      if (res.ok) setWork(res.work);
      else {
        setWork(null);
        setError(res.error);
      }
    });

  const text = work
    ? [`Trabajo de ${name} · ${work.label}`, ...work.items.map((i) => `• ${i.title} — ${fmtDay(i.doneMs)}${i.people.length ? ` — ${i.people.join(', ')}` : ''}`)].join('\n')
    : '';

  if (!open) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        data-testid="trabajo-mes"
        onClick={() => {
          setOpen(true);
          load(month);
        }}
      >
        <ClipboardList aria-hidden />
        Trabajo de este mes
      </Button>
    );
  }
  return (
    <div className="space-y-2.5 rounded-lg border bg-muted/40 p-3" data-testid="trabajo-mes-panel">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">Trabajo completado</p>
        <select
          aria-label="Mes"
          className={cn(selectClass, 'h-8')}
          value={month}
          onChange={(e) => {
            const m = e.target.value as 'current' | 'previous';
            setMonth(m);
            load(m);
          }}
        >
          <option value="current">Este mes</option>
          <option value="previous">Mes anterior</option>
        </select>
        {work && <span className="text-xs text-muted-foreground first-letter:uppercase">{work.label}</span>}
        <span className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={!work || work.items.length === 0}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                setCopied(true);
              } catch {
                setError('No se pudo copiar: selecciona el texto a mano.');
              }
            }}
          >
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cerrar
          </Button>
        </span>
      </div>
      {pending && <p className="text-sm text-muted-foreground">Cargando de ClickUp…</p>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {work && !pending && (
        <>
          {work.truncated && <p className="text-xs text-warning-strong">Hay demasiadas tareas y la lista puede estar incompleta.</p>}
          {work.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay tareas completadas de este cliente en ese mes.</p>
          ) : (
            <ul className="divide-y rounded-md border bg-card text-sm" data-testid="trabajo-mes-lista">
              {work.items.map((i, idx) => (
                <li key={idx} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-1.5">
                  <a href={i.url} target="_blank" rel="noopener noreferrer" className="min-w-0 text-brand hover:underline">
                    {i.title}
                  </a>
                  <span className="text-xs text-muted-foreground">
                    {fmtDay(i.doneMs)}
                    {i.people.length ? ` — ${i.people.join(', ')}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {work.cleaned.length > 0 && (
            <div className="space-y-1 border-t pt-2" data-testid="trabajo-mes-limpieza">
              <p className="text-xs font-medium text-muted-foreground">
                Cerradas en limpieza ({work.cleaned.length}): trabajo antiguo o que no se hizo; no cuentan en el total.
              </p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {work.cleaned.map((i, idx) => (
                  <li key={idx}>
                    • <a href={i.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{i.title}</a> — {fmtDay(i.doneMs)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
