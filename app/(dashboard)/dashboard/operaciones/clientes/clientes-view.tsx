'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  aiFillClient,
  deleteClient,
  deleteLevel,
  deleteService,
  importMissingClients,
  saveClient,
  saveLevel,
  saveService,
  setClientActive,
  type ClientDraft,
  type ClientInput
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

type Level = { key: string; label: string; defaultDays: number };
type Service = { key: string; label: string; active: boolean };
type Member = { id: string; username: string };
type Space = { id: string; name: string; lists: { id: string; name: string }[] };
type Option = { id: string; label: string };
type Msg = { type: 'ok' | 'error'; text: string } | null;

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MAX_RECORDING_SECONDS = 300;

const areaClass =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';

const emptyClient = (level: string): ClientView => ({
  id: '',
  name: '',
  aliases: [],
  clickupOptionId: '',
  usualSpaceId: '',
  usualListIds: [],
  level,
  deliveryDays: null,
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

export function ClientesView({
  clients,
  levels,
  services,
  members,
  spaces,
  options,
  missingOptions,
  duplicates
}: {
  clients: ClientView[];
  levels: Level[];
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

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-medium">Clientes</h2>
          <p className="text-sm text-muted-foreground">
            Una ficha por cliente: cómo se le llama, su nivel y plazo, qué servicios tiene y quién los lleva. El agente la
            usa al convertir notas (reconoce al cliente, propone fecha y responsable).
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowConfig((v) => !v)}>
            Niveles y servicios
          </Button>
          <Button size="sm" disabled={editing !== null} onClick={() => setEditing('new')}>
            Nuevo cliente
          </Button>
        </div>
      </div>

      {msg && <p className={`text-sm ${msg.type === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}

      {missingOptions > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm flex flex-wrap items-center gap-2">
          <span>
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
        <details className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
          <summary className="cursor-pointer">
            Posibles clientes duplicados ({duplicates.length}): revísalos y desactiva o añade nombres alternativos
          </summary>
          <ul className="mt-2 list-disc ml-5">
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

      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Buscar cliente"
          placeholder="Buscar por nombre o alias…"
          className="w-64"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          aria-label="Filtrar por nivel"
          className="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm"
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
          className="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'active' | 'inactive' | 'all')}
        >
          <option value="active">Activos</option>
          <option value="inactive">Desactivados</option>
          <option value="all">Todos</option>
        </select>
        <span className="text-xs text-muted-foreground">
          {shown.length} de {clients.length}
        </span>
      </div>

      {clients.length === 0 && editing !== 'new' ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center space-y-2">
          <p className="font-medium">Todavía no hay clientes</p>
          <p className="text-sm text-muted-foreground">Crea la primera ficha para que el agente reconozca a tus clientes.</p>
          <Button size="sm" onClick={() => setEditing('new')}>
            Nuevo cliente
          </Button>
        </div>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ningún cliente coincide con el filtro.</p>
      ) : (
        <div className="space-y-3">
          {shown.map((c) =>
            editing === c.id ? (
              <ClientForm
                key={c.id}
                initial={c}
                levels={levels}
                services={services}
                members={members}
                spaces={spaces}
                options={options}
                onCancel={() => setEditing(null)}
                onSaved={onSaved}
              />
            ) : (
              <div
                key={c.id}
                data-testid={`cliente-${c.name}`}
                className={`rounded-lg border p-4 space-y-2 ${c.active ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-75'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {c.name}
                      {!c.active && (
                        <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600">Desactivado</span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {levelOf.get(c.level)?.label ?? c.level} · plazo{' '}
                      {c.deliveryDays != null
                        ? `${daysWord(c.deliveryDays)} (propio)`
                        : `${daysWord(levelOf.get(c.level)?.defaultDays ?? 0)} (del nivel)`}
                      {c.clickupOptionId ? '' : ' · sin vincular a ClickUp'}
                      {c.requestCount > 0 ? ` · ${c.requestCount} encargo${c.requestCount === 1 ? '' : 's'}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" disabled={editing !== null || pending} onClick={() => setEditing(c.id)}>
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        act(() => setClientActive(c.id, !c.active), c.active ? 'Cliente desactivado.' : 'Cliente reactivado.')
                      }
                    >
                      {c.active ? 'Desactivar' : 'Reactivar'}
                    </Button>
                    {c.requestCount > 0 ? (
                      <span className="text-xs text-muted-foreground">Con encargos: solo se puede desactivar</span>
                    ) : (
                      <DeleteButton name={c.name} disabled={pending} onConfirm={() => act(() => deleteClient(c.id), 'Ficha eliminada.')} />
                    )}
                  </div>
                </div>
                {c.aliases.length > 0 && (
                  <p className="text-xs text-muted-foreground">También se le llama: {c.aliases.join(', ')}</p>
                )}
                {c.services.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {c.services.map((s) => (
                      <span key={s.key} className="rounded bg-orange-100 px-2 py-0.5 text-xs text-orange-800">
                        {serviceLabel.get(s.key) ?? s.key}
                        {s.responsibleClickupId
                          ? ` · ${members.find((m) => m.id === s.responsibleClickupId)?.username ?? '—'}`
                          : ''}
                      </span>
                    ))}
                  </div>
                )}
                {c.business && <p className="text-sm whitespace-pre-line">{c.business}</p>}
                {c.notes && (
                  <p className="text-xs text-muted-foreground whitespace-pre-line">
                    <span className="font-medium">Notas:</span> {c.notes}
                  </p>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function DeleteButton({ name, disabled, onConfirm }: { name: string; disabled: boolean; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setAsking(true)}>
        Eliminar
      </Button>
    );
  }
  return (
    <span className="flex items-center gap-1 text-sm">
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
    <div className="rounded-lg border-2 border-orange-300 bg-white p-4 space-y-4" data-testid="config-panel">
      <div className="flex items-center justify-between">
        <p className="font-medium">Niveles y servicios</p>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      </div>
      {msg && <p className={`text-sm ${msg.type === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}

      <div className="space-y-2">
        <Label>Niveles y plazo de entrega por defecto (días laborables)</Label>
        {levels.map((l) => (
          <LevelRow key={`${l.key}-${l.label}-${l.defaultDays}`} level={l} disabled={pending} run={run} />
        ))}
        <LevelRow level={null} disabled={pending} run={run} />
      </div>

      <div className="space-y-2">
        <Label>Servicios (el agente los reconoce en cada encargo)</Label>
        {services.map((s) => (
          <ServiceRow key={`${s.key}-${s.label}-${s.active}`} service={s} disabled={pending} run={run} />
        ))}
        <ServiceRow service={null} disabled={pending} run={run} />
      </div>
    </div>
  );
}

type Run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => void;

function LevelRow({ level, disabled, run }: { level: Level | null; disabled: boolean; run: Run }) {
  const [label, setLabel] = useState(level?.label ?? '');
  const [days, setDays] = useState(level?.defaultDays ?? 3);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input aria-label="Nombre del nivel" className="w-48" placeholder="Nuevo nivel…" value={label} onChange={(e) => setLabel(e.target.value)} />
      <Input
        aria-label="Días por defecto"
        type="number"
        min={0}
        max={60}
        className="w-20"
        value={days}
        onChange={(e) => setDays(Number(e.target.value))}
      />
      <span className="text-xs text-muted-foreground">días</span>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || !label.trim()}
        onClick={() => run(() => saveLevel({ key: level?.key ?? null, label, defaultDays: days }), level ? 'Nivel guardado.' : 'Nivel creado.')}
      >
        {level ? 'Guardar' : 'Añadir'}
      </Button>
      {level && (
        <Button size="sm" variant="ghost" disabled={disabled} onClick={() => run(() => deleteLevel(level.key), 'Nivel eliminado.')}>
          Eliminar
        </Button>
      )}
    </div>
  );
}

function ServiceRow({ service, disabled, run }: { service: Service | null; disabled: boolean; run: Run }) {
  const [label, setLabel] = useState(service?.label ?? '');
  const [active, setActive] = useState(service?.active ?? true);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input aria-label="Nombre del servicio" className="w-48" placeholder="Nuevo servicio…" value={label} onChange={(e) => setLabel(e.target.value)} />
      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-orange-500" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Activo
      </label>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || !label.trim()}
        onClick={() => run(() => saveService({ key: service?.key ?? null, label, active }), service ? 'Servicio guardado.' : 'Servicio creado.')}
      >
        {service ? 'Guardar' : 'Añadir'}
      </Button>
      {service && (
        <Button size="sm" variant="ghost" disabled={disabled} onClick={() => run(() => deleteService(service.key), 'Servicio eliminado.')}>
          Eliminar
        </Button>
      )}
    </div>
  );
}

// --- Formulario de la ficha -------------------------------------------------------------------

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
    <div className="space-y-1">
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

  return (
    <div className="rounded-lg border-2 border-orange-300 bg-white p-4 space-y-4" data-testid="cliente-form">
      <p className="font-medium">{isNew ? 'Nuevo cliente' : `Editar la ficha de ${initial.name}`}</p>

      <AiFill name={f.name} onDraft={applyDraft} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="c-name">Nombre *</Label>
          <Input id="c-name" value={f.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="c-option">Opción del campo «Cliente» de ClickUp</Label>
          <select id="c-option" className={areaClass} value={f.clickupOptionId} onChange={(e) => set({ clickupOptionId: e.target.value })}>
            <option value="">— Sin vincular —</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="c-aliases">Nombres alternativos (separados por comas)</Label>
          <Input
            id="c-aliases"
            placeholder="Ej.: plupilates, club pilates, cp"
            value={aliasText}
            onChange={(e) => {
              setAliasText(e.target.value);
              setDirty(true);
            }}
          />
          <p className="text-xs text-muted-foreground">Variantes y errores de dictado: así el agente reconoce al cliente.</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Espacio y listas habituales</Label>
        <select
          aria-label="Espacio habitual"
          className={areaClass}
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
          <div className="grid gap-1 sm:grid-cols-2 max-h-48 overflow-y-auto rounded border border-gray-200 p-2">
            {space.lists.map((l) => (
              <label key={l.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-orange-500"
                  checked={f.usualListIds.includes(l.id)}
                  onChange={(e) =>
                    set({ usualListIds: e.target.checked ? [...f.usualListIds, l.id] : f.usualListIds.filter((id) => id !== l.id) })
                  }
                />
                {l.name}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="c-level">Nivel</Label>
          <select id="c-level" className={areaClass} value={f.level} onChange={(e) => set({ level: e.target.value })}>
            {levels.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="c-days">Plazo de entrega (días laborables)</Label>
          <Input
            id="c-days"
            type="number"
            min={0}
            max={60}
            className="w-28"
            placeholder={String(levelDefault)}
            value={f.deliveryDays ?? ''}
            onChange={(e) => set({ deliveryDays: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </div>
        <p className="text-xs text-muted-foreground pb-2">
          Vacío = {daysWord(levelDefault)} (el del nivel).
        </p>
      </div>

      <div className="space-y-2">
        <Label>Servicios contratados y responsable habitual</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {services.map((s) => {
            const on = svc(s.key);
            return (
              <div key={s.key} className="flex items-center justify-between gap-2 rounded border border-gray-200 px-2 py-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-orange-500"
                    checked={Boolean(on)}
                    onChange={(e) => toggleService(s.key, e.target.checked)}
                  />
                  {s.label}
                  {!s.active && <span className="text-xs text-muted-foreground">(inactivo)</span>}
                </label>
                {on && (
                  <select
                    aria-label={`Responsable de ${s.label}`}
                    className="rounded border border-gray-300 bg-white px-1 py-0.5 text-sm"
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

      <div className="space-y-2">
        <Label>Dedicación</Label>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="c-hours" className="text-xs">Horas al mes</Label>
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
          <div className="space-y-1">
            <Label className="text-xs">Días de la semana en que se le trabaja (ninguno = L–V)</Label>
            <div className="flex gap-1.5">
              {DAY_LABELS.map((lbl, idx) => {
                const day = idx + 1;
                const on = f.workDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ workDays: on ? f.workDays.filter((d) => d !== day) : [...f.workDays, day].sort() })}
                    className={`h-8 w-8 rounded-full border text-sm ${on ? 'border-orange-500 bg-orange-500 text-white' : 'border-gray-300 bg-white text-gray-600'}`}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Webs y herramientas</Label>
        <p className="text-xs text-amber-700">Aquí no se guardan contraseñas ni accesos: solo dónde está cada cosa.</p>
        {f.tools.map((t, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Input aria-label="Herramienta" placeholder="GA4, Search Console, web…" className="w-44" value={t.name} onChange={(e) => set({ tools: f.tools.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
            <Input aria-label="Dirección" placeholder="https://…" className="w-56" value={t.url} onChange={(e) => set({ tools: f.tools.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
            <Input aria-label="Nota" placeholder="Nota" className="w-56" value={t.note} onChange={(e) => set({ tools: f.tools.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) })} />
            <Button size="sm" variant="ghost" onClick={() => set({ tools: f.tools.filter((_, j) => j !== i) })}>
              Quitar
            </Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => set({ tools: [...f.tools, { name: '', url: '', note: '' }] })}>
          Añadir web o herramienta
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {text('c-business', 'Negocio: a qué se dedica', 'business', 3)}
        {text('c-offerings', 'Productos o servicios que ofrece', 'offerings', 3)}
        <div className="space-y-1">
          <Label htmlFor="c-area">Zona</Label>
          <Input id="c-area" value={f.area} onChange={(e) => set({ area: e.target.value })} />
        </div>
        {text('c-audience', 'Público objetivo', 'audience', 2)}
      </div>

      {text('c-goals', 'Objetivos', 'goals', 2, 'Ej.: 30 leads al mes')}
      {text('c-strategy', 'Estrategia actual', 'strategy', 3)}
      {text('c-notes', 'Peculiaridades y notas', 'notes', 3)}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-orange-500" checked={f.active} onChange={(e) => set({ active: e.target.checked })} />
        Cliente activo (si se desactiva, el agente lo sigue reconociendo pero avisa en la revisión)
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={pending || !f.name.trim()} onClick={save}>
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
        {dirty && <span className="text-xs text-amber-700">Cambios sin guardar</span>}
        {msg && <span className={`text-sm ${msg.type === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</span>}
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
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        ✨ Rellenar con IA
      </Button>
    );
  }
  return (
    <div className="space-y-2 rounded-md border border-orange-200 bg-orange-50 p-3">
      <p className="text-sm font-medium">Rellenar con IA</p>
      <p className="text-xs text-muted-foreground">
        Pega un texto o graba un audio describiendo al cliente. La IA propone los campos y tú los revisas antes de
        guardar; solo cambia los que consiga deducir. No dictes contraseñas.
      </p>
      <textarea
        rows={5}
        className={areaClass}
        placeholder="Ej.: RF Serveis es una empresa de servicios de Barcelona. Llevamos su SEO y el mantenimiento de la web…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={pending || recording || transcribing || text.trim().length < 10} onClick={run}>
          {pending ? 'Pensando…' : 'Proponer campos'}
        </Button>
        {recording ? (
          <Button size="sm" variant="destructive" onClick={stop}>
            ⏹ Parar ({seconds}s)
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={pending || transcribing} onClick={start}>
            🎙 {transcribing ? 'Transcribiendo…' : 'Grabar audio'}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cerrar
        </Button>
        {msg && <span className={`text-xs ${msg.type === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
