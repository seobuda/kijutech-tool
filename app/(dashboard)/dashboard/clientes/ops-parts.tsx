'use client';

// Lo que aporta Operaciones a la sección Clientes: semáforo de actividad, trabajo del mes, niveles y servicios y la
// pestaña «Operaciones» de la ficha (ClickUp, nivel, plazo, servicios con responsable, alertas, horas y días).
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ClipboardList, Copy, Plus, Settings2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { deleteLevel, deleteService, getClientMonthWork, saveClientOps, saveLevel, saveService, type MonthWork } from '@/lib/operaciones/client-actions';
import { brandBtn, checkClass, dangerGhost, fieldHint, focusRing, FormSection, MsgLine, selectClass, type Msg } from './ui';

export type Level = { key: string; label: string; defaultDays: number; inactivityDays: number; planningDays: number };
export type Service = { key: string; label: string; active: boolean };
export type Member = { id: string; username: string };
export type Space = { id: string; name: string; lists: { id: string; name: string }[] };
export type Option = { id: string; label: string };

export type AlertView = {
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

export type OpsView = {
  clickupOptionId: string;
  usualSpaceId: string;
  usualListIds: string[];
  level: string;
  deliveryDays: number | null;
  inactivityDays: number | null;
  planningDays: number | null;
  alertsEnabled: boolean;
  monthlyHours: number | null;
  workDays: number[];
  services: { key: string; responsibleClickupId: string }[];
};

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const daysWord = (n: number) => `${n} día${n === 1 ? '' : 's'}`;

// --- Semáforo --------------------------------------------------------------------------------------------------

const DOT_TONE: Record<AlertView['state'], 'danger' | 'warning' | 'success' | 'neutral'> = { red: 'danger', amber: 'warning', green: 'success', gray: 'neutral' };
const DOT_LABEL: Record<string, string> = { red: 'Rojo', amber: 'Ámbar', green: 'Verde', gray: 'Gris' };

export function AlertLine({ alert: a, monthlyHours }: { alert: AlertView; monthlyHours: number | null }) {
  const hours = a.hasData ? `≈${a.hoursMonth.toLocaleString('es-ES', { maximumFractionDigits: 1 })}${monthlyHours ? ` / ${monthlyHours.toLocaleString('es-ES')}` : ''} h este mes` : null;
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

// --- Trabajo del mes -------------------------------------------------------------------------------------------

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' });

export function MonthWorkButton({ clientId, name }: { clientId: string; name: string }) {
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

  const text = work ? [`Trabajo de ${name} · ${work.label}`, ...work.items.map((i) => `• ${i.title} — ${fmtDay(i.doneMs)}${i.people.length ? ` — ${i.people.join(', ')}` : ''}`)].join('\n') : '';

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
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
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
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
              <p className="text-xs font-medium text-muted-foreground">Cerradas en limpieza ({work.cleaned.length}): trabajo antiguo o que no se hizo; no cuentan en el total.</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {work.cleaned.map((i, idx) => (
                  <li key={idx}>
                    •{' '}
                    <a href={i.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {i.title}
                    </a>{' '}
                    — {fmtDay(i.doneMs)}
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

// --- Niveles y servicios ---------------------------------------------------------------------------------------

type Run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => void;

export function ConfigPanel({ levels, services, onClose }: { levels: Level[]; services: Service[]; onClose: () => void }) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();
  const run: Run = (fn, okText) =>
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
            Niveles y servicios (Operaciones)
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
          <Label className="leading-snug">Niveles: plazo de entrega (días laborables), días sin actividad para alertar y horizonte de trabajo planificado</Label>
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

function LevelRow({ level, disabled, run }: { level: Level | null; disabled: boolean; run: Run }) {
  const [label, setLabel] = useState(level?.label ?? '');
  const [days, setDays] = useState(level?.defaultDays ?? 3);
  const [inact, setInact] = useState(level?.inactivityDays ?? 14);
  const [plan, setPlan] = useState(level?.planningDays ?? 14);
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5', !level && 'bg-muted/30')}>
      <Input aria-label="Nombre del nivel" className="h-8 w-full sm:w-44" placeholder="Nuevo nivel…" value={label} onChange={(e) => setLabel(e.target.value)} />
      <span className="flex items-center gap-1.5">
        <Input aria-label="Días por defecto" type="number" min={0} max={60} className="h-8 w-16" value={days} onChange={(e) => setDays(Number(e.target.value))} />
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
          {level ? (
            'Guardar'
          ) : (
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
        <Button size="sm" variant="outline" disabled={disabled || !label.trim()} onClick={() => run(() => saveService({ key: service?.key ?? null, label, active }), service ? 'Servicio guardado.' : 'Servicio creado.')}>
          {service ? (
            'Guardar'
          ) : (
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

// --- Pestaña «Operaciones» de la ficha -----------------------------------------------------------------------------

export function OpsForm({
  clientId,
  initial,
  levels,
  services,
  members,
  spaces,
  options
}: {
  clientId: string;
  initial: OpsView;
  levels: Level[];
  services: Service[];
  members: Member[];
  spaces: Space[];
  options: Option[];
}) {
  const router = useRouter();
  const [f, setF] = useState<OpsView>(initial);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<OpsView>) => {
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
  const toggleService = (key: string, on: boolean) => set({ services: on ? [...f.services, { key, responsibleClickupId: '' }] : f.services.filter((s) => s.key !== key) });
  const setResponsible = (key: string, id: string) => set({ services: f.services.map((s) => (s.key === key ? { ...s, responsibleClickupId: id } : s)) });

  const save = () =>
    startTransition(async () => {
      setMsg(null);
      const res = await saveClientOps(clientId, f);
      if (res.ok) {
        setDirty(false);
        setMsg({ type: 'ok', text: 'Ajustes de Operaciones guardados.' });
        router.refresh();
      } else setMsg({ type: 'error', text: res.error });
    });

  return (
    <div className="rounded-xl border bg-card shadow-xs" data-testid="ops-form">
      <FormSection title="ClickUp" description="Cómo se reconoce al cliente en ClickUp y dónde se le trabaja normalmente.">
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
        <div className="space-y-1.5">
          <Label htmlFor="c-space">Espacio y listas habituales</Label>
          <select id="c-space" className={cn(selectClass, 'w-full')} value={f.usualSpaceId} onChange={(e) => set({ usualSpaceId: e.target.value, usualListIds: [] })}>
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
                    onChange={(e) => set({ usualListIds: e.target.checked ? [...f.usualListIds, l.id] : f.usualListIds.filter((id) => id !== l.id) })}
                  />
                  <span className="min-w-0 truncate">{l.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </FormSection>

      <FormSection title="Nivel y plazo" description="La prioridad del cliente y en cuántos días laborables se le entrega.">
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
            <Input id="c-days" type="number" min={0} max={60} placeholder={String(levelDefault)} value={f.deliveryDays ?? ''} onChange={(e) => set({ deliveryDays: e.target.value === '' ? null : Number(e.target.value) })} />
            <p className={fieldHint}>Vacío = {daysWord(levelDefault)} (el del nivel).</p>
          </div>
        </div>
      </FormSection>

      <FormSection title="Servicios" description="Qué tiene contratado, quién lo lleva y cuánta dedicación necesita.">
        <div className="grid gap-2 sm:grid-cols-2">
          {services.map((s) => {
            const on = svc(s.key);
            return (
              <div key={s.key} className={cn('flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors', on ? 'border-brand/40 bg-brand-soft/50' : 'bg-card')}>
                <label className="flex min-w-0 items-center gap-2 text-sm">
                  <input type="checkbox" className={checkClass} checked={Boolean(on)} onChange={(e) => toggleService(s.key, e.target.checked)} />
                  <span className="truncate">{s.label}</span>
                  {!s.active && <span className="text-xs text-muted-foreground">(inactivo)</span>}
                </label>
                {on && (
                  <select aria-label={`Responsable de ${s.label}`} className={cn(selectClass, 'h-8 max-w-full text-xs')} value={on.responsibleClickupId} onChange={(e) => setResponsible(s.key, e.target.value)}>
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
        <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="c-hours">Horas al mes</Label>
            <Input id="c-hours" type="number" min={0} step={0.5} className="w-28" value={f.monthlyHours ?? ''} onChange={(e) => set({ monthlyHours: e.target.value === '' ? null : Number(e.target.value) })} />
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
                    className={cn('size-9 rounded-full border text-sm font-medium transition-colors', focusRing, on ? 'border-brand bg-brand text-white' : 'border-input bg-card text-muted-foreground hover:bg-muted')}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </FormSection>

      <FormSection title="Alertas" description="Cuándo avisar de que el cliente lleva tiempo sin actividad o sin trabajo planificado.">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className={cn(checkClass, 'mt-0.5')} checked={f.alertsEnabled} onChange={(e) => set({ alertsEnabled: e.target.checked })} />
          Genera alertas (solo si está activo y tiene algún servicio u horas al mes)
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="c-inact">Días sin actividad para alertar</Label>
            <Input id="c-inact" type="number" min={1} max={90} placeholder={String(levels.find((l) => l.key === f.level)?.inactivityDays ?? '')} value={f.inactivityDays ?? ''} onChange={(e) => set({ inactivityDays: e.target.value === '' ? null : Number(e.target.value) })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-plan">Horizonte de trabajo planificado (días, 0 = sin alerta)</Label>
            <Input id="c-plan" type="number" min={0} max={60} placeholder={String(levels.find((l) => l.key === f.level)?.planningDays ?? '')} value={f.planningDays ?? ''} onChange={(e) => set({ planningDays: e.target.value === '' ? null : Number(e.target.value) })} />
          </div>
        </div>
        <p className={fieldHint}>Vacío = el del nivel.</p>
      </FormSection>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 rounded-b-xl border-t bg-card/95 px-4 py-3 backdrop-blur sm:px-5">
        <Button size="sm" className={brandBtn} disabled={pending || !dirty} onClick={save}>
          {pending ? 'Guardando…' : 'Guardar ajustes'}
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
