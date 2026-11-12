'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Mic, Pencil, Plus, Sparkles, Square, Star, Trash2, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge, EmptyState } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { CleanupPanel, type CleanupPersonView } from '../cleanup-panel';
import {
  aiFillProfile,
  createProfileForMember,
  deleteProfile,
  saveProfile,
  setProfileActive,
  type ProfileDraft,
  type ProfileInput
} from '@/lib/operaciones/profile-actions';

export type ProfileView = {
  id: string;
  name: string;
  clickupUserId: string;
  jobTitle: string;
  description: string;
  notes: string;
  workDays: number[];
  workStart: string;
  hoursPerDay: number;
  timezone: string;
  lunchStart: string;
  lunchEnd: string;
  quietStart: string;
  quietEnd: string;
  urgentBypassQuiet: boolean;
  active: boolean;
  workTypes: { key: string; role: 'primary' | 'support' }[];
};

type Member = { id: string; username: string };
type WorkType = { key: string; label: string };
type Msg = { type: 'ok' | 'error'; text: string } | null;

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const TIMEZONES = [
  'America/Santo_Domingo',
  'Europe/Madrid',
  'America/Mexico_City',
  'America/Bogota',
  'America/New_York',
  'America/Argentina/Buenos_Aires',
  'UTC'
];
const MAX_RECORDING_SECONDS = 300;

const areaClass =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand';

const emptyProfile = (): ProfileView => ({
  id: '',
  name: '',
  clickupUserId: '',
  jobTitle: '',
  description: '',
  notes: '',
  workDays: [1, 2, 3, 4, 5],
  workStart: '09:00',
  hoursPerDay: 8,
  timezone: 'America/Santo_Domingo',
  lunchStart: '',
  lunchEnd: '',
  quietStart: '',
  quietEnd: '',
  urgentBypassQuiet: false,
  active: true,
  workTypes: []
});

function daysLabel(days: number[]): string {
  const key = days.join(',');
  if (key === '1,2,3,4,5') return 'L–V';
  return days.map((d) => DAY_LABELS[d - 1]).join(' ');
}

// Bloque de campos del formulario con su título (solo presentación).
function FormGroup({
  title,
  hint,
  testId,
  children
}: {
  title: string;
  hint?: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="space-y-3" data-testid={testId}>
      <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</legend>
      {hint && <p className="-mt-1 text-xs text-muted-foreground text-pretty">{hint}</p>}
      {children}
    </fieldset>
  );
}

export function EquipoView({
  profiles,
  members,
  withoutProfile,
  workTypes,
  cleanupPeople,
  testMode
}: {
  cleanupPeople: CleanupPersonView[];
  testMode: boolean;
  profiles: ProfileView[];
  members: Member[];
  withoutProfile: Member[];
  workTypes: WorkType[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null); // id de ficha, 'new' o null
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();
  const typeLabel = new Map(workTypes.map((t) => [t.key, t.label]));

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

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">Equipo</h2>
          <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground text-pretty">
            Una ficha por persona: qué hace, en qué destaca y cuándo trabaja. El agente la usa para proponer quién
            hace cada encargo, y los resúmenes diarios usan su zona horaria y su hora de entrada.
          </p>
        </div>
        <Button
          size="sm"
          className="shrink-0 self-start bg-brand text-white hover:bg-brand/90"
          disabled={editing !== null}
          onClick={() => setEditing('new')}
        >
          <Plus aria-hidden />
          Nueva ficha
        </Button>
      </div>

      {msg && (
        <p
          role="status"
          className={cn(
            'rounded-lg px-3 py-2 text-sm',
            msg.type === 'ok' ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive'
          )}
        >
          {msg.text}
        </p>
      )}

      <CleanupPanel people={cleanupPeople} testMode={testMode} />

      {withoutProfile.length > 0 && (
        <div className="space-y-2.5 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-warning-strong">
            <UserPlus className="size-4" aria-hidden />
            Miembros de ClickUp sin ficha:
          </p>
          <div className="flex flex-wrap gap-2">
            {withoutProfile.map((m) => (
              <Button
                key={m.id}
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => act(() => createProfileForMember(m.id), `Ficha de ${m.username} creada.`)}
              >
                <Plus aria-hidden />
                Crear ficha de {m.username}
              </Button>
            ))}
          </div>
        </div>
      )}

      {editing === 'new' && (
        <ProfileForm
          key="new"
          initial={emptyProfile()}
          members={members}
          workTypes={workTypes}
          onCancel={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}

      {profiles.length === 0 && editing !== 'new' ? (
        <EmptyState
          icon={Users}
          title="Todavía no hay fichas"
          description="Crea la primera para que el agente sepa quién hace qué."
          action={
            <Button size="sm" className="bg-brand text-white hover:bg-brand/90" onClick={() => setEditing('new')}>
              <Plus aria-hidden />
              Nueva ficha
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {profiles.map((p) =>
            editing === p.id ? (
              <div key={p.id} className="md:col-span-2">
                <ProfileForm
                  initial={p}
                  members={members}
                  workTypes={workTypes}
                  onCancel={() => setEditing(null)}
                  onSaved={onSaved}
                />
              </div>
            ) : (
              <article
                key={p.id}
                data-testid={`perfil-${p.name}`}
                className={cn(
                  'flex flex-col rounded-xl border shadow-xs',
                  p.active ? 'bg-card' : 'bg-muted/50 opacity-75'
                )}
              >
                <header className="flex items-start gap-3 p-4 pb-3">
                  <span
                    className={cn(
                      'grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold',
                      p.active ? 'bg-brand-soft text-brand' : 'bg-muted text-muted-foreground'
                    )}
                    aria-hidden
                  >
                    {initials(p.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <span className="truncate">{p.name}</span>
                      {!p.active && <Badge tone="neutral">Desactivada</Badge>}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">{p.jobTitle || 'Sin puesto'}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {p.clickupUserId
                        ? `ClickUp: ${members.find((m) => m.id === p.clickupUserId)?.username ?? p.clickupUserId}`
                        : 'sin miembro de ClickUp'}
                    </p>
                  </div>
                </header>

                <div className="flex-1 space-y-3 px-4 pb-4">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="size-3.5 shrink-0" aria-hidden />
                    {daysLabel(p.workDays)} · entrada {p.workStart} · {p.hoursPerDay} h/día · {p.timezone}
                  </p>
                  {p.workTypes.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {p.workTypes.map((t) => (
                        <Badge key={t.key} tone={t.role === 'primary' ? 'brand' : 'neutral'}>
                          {t.role === 'primary' && <Star aria-hidden />}
                          {typeLabel.get(t.key) ?? t.key}
                          {t.role === 'support' ? ' (apoyo)' : ''}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Sin tipos de trabajo asignados.</p>
                  )}
                  {p.description && <p className="line-clamp-4 text-sm whitespace-pre-line">{p.description}</p>}
                  {p.notes && (
                    <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground whitespace-pre-line">
                      <span className="font-medium">Notas:</span> {p.notes}
                    </p>
                  )}
                </div>

                <footer className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
                  <Button size="sm" variant="outline" disabled={editing !== null || pending} onClick={() => setEditing(p.id)}>
                    <Pencil aria-hidden />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      act(() => setProfileActive(p.id, !p.active), p.active ? 'Ficha desactivada.' : 'Ficha reactivada.')
                    }
                  >
                    {p.active ? 'Desactivar' : 'Reactivar'}
                  </Button>
                  <DeleteButton
                    name={p.name}
                    disabled={pending}
                    onConfirm={() => act(() => deleteProfile(p.id), 'Ficha eliminada.')}
                  />
                </footer>
              </article>
            )
          )}
        </div>
      )}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function DeleteButton({ name, disabled, onConfirm }: { name: string; disabled: boolean; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="ml-auto text-muted-foreground hover:text-destructive"
        disabled={disabled}
        onClick={() => setAsking(true)}
      >
        <Trash2 aria-hidden />
        Eliminar
      </Button>
    );
  }
  return (
    <span role="alert" className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
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

function ProfileForm({
  initial,
  members,
  workTypes,
  onCancel,
  onSaved
}: {
  initial: ProfileView;
  members: Member[];
  workTypes: WorkType[];
  onCancel: () => void;
  onSaved: (text: string) => void;
}) {
  const [f, setF] = useState<ProfileView>(initial);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();
  const isNew = !initial.id;

  const set = (patch: Partial<ProfileView>) => {
    setF((cur) => ({ ...cur, ...patch }));
    setDirty(true);
  };

  // Aviso si se cierra la pestaña con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const roleOf = (key: string) => f.workTypes.find((t) => t.key === key)?.role ?? '';
  const setRole = (key: string, role: string) => {
    const rest = f.workTypes.filter((t) => t.key !== key);
    set({ workTypes: role === 'primary' || role === 'support' ? [...rest, { key, role }] : rest });
  };

  const applyDraft = (d: ProfileDraft) => {
    setF((cur) => ({
      ...cur,
      name: d.name ?? cur.name,
      clickupUserId: d.clickupUserId ?? cur.clickupUserId,
      jobTitle: d.jobTitle ?? cur.jobTitle,
      description: d.description ?? cur.description,
      notes: d.notes ?? cur.notes,
      workDays: d.workDays ?? cur.workDays,
      workStart: d.workStart ?? cur.workStart,
      hoursPerDay: d.hoursPerDay ?? cur.hoursPerDay,
      timezone: d.timezone ?? cur.timezone,
      workTypes: d.workTypes ?? cur.workTypes
    }));
    setDirty(true);
  };

  const save = () =>
    startTransition(async () => {
      setMsg(null);
      const input: ProfileInput = {
        id: isNew ? null : initial.id,
        name: f.name,
        clickupUserId: f.clickupUserId,
        jobTitle: f.jobTitle,
        description: f.description,
        notes: f.notes,
        workDays: f.workDays,
        workStart: f.workStart,
        hoursPerDay: f.hoursPerDay,
        timezone: f.timezone,
        lunchStart: f.lunchStart,
        lunchEnd: f.lunchEnd,
        quietStart: f.quietStart,
        quietEnd: f.quietEnd,
        urgentBypassQuiet: f.urgentBypassQuiet,
        active: f.active,
        workTypes: f.workTypes
      };
      const res = await saveProfile(input);
      if (res.ok) {
        setDirty(false);
        onSaved(isNew ? 'Ficha creada.' : 'Ficha guardada.');
      } else setMsg({ type: 'error', text: res.error });
    });

  return (
    <div className="overflow-hidden rounded-xl border border-brand/45 bg-card shadow-md ring-1 ring-brand/20" data-testid="perfil-form">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-5 py-3.5">
        <p className="text-[15px] font-semibold">{isNew ? 'Nueva ficha' : `Editar la ficha de ${initial.name}`}</p>
      </div>

      <div className="space-y-6 p-5">
      <AiFill onDraft={applyDraft} />
      <FormGroup title="Datos básicos" hint="Los campos con * son obligatorios.">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="p-name">Nombre *</Label>
          <Input id="p-name" value={f.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="p-clickup">Miembro de ClickUp vinculado</Label>
          <select
            id="p-clickup"
            className={areaClass}
            value={f.clickupUserId}
            onChange={(e) => set({ clickupUserId: e.target.value })}
          >
            <option value="">— Sin vincular (no se le podrán asignar tareas) —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.username}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="p-title">Puesto o rol</Label>
          <Input id="p-title" value={f.jobTitle} onChange={(e) => set({ jobTitle: e.target.value })} />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="p-desc">Descripción</Label>
        <textarea
          id="p-desc"
          rows={4}
          className={areaClass}
          placeholder="Cómo es, en qué destaca, a qué presta atención…"
          value={f.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </div>
      </FormGroup>

      <FormGroup title="Tipos de trabajo que hace">
        <div className="grid gap-2 sm:grid-cols-2">
          {workTypes.map((t) => (
            <div
              key={t.key}
              className={cn(
                'flex items-center justify-between gap-2 rounded-lg border px-3 py-2',
                roleOf(t.key) === 'primary' && 'border-brand/40 bg-brand-soft/50'
              )}
            >
              <span className="min-w-0 truncate text-sm">{t.label}</span>
              <select
                aria-label={`Función en ${t.label}`}
                className="shrink-0 rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                value={roleOf(t.key)}
                onChange={(e) => setRole(t.key, e.target.value)}
              >
                <option value="">No lo hace</option>
                <option value="primary">★ Función principal</option>
                <option value="support">Apoyo</option>
              </select>
            </div>
          ))}
        </div>
      </FormGroup>

      <FormGroup title="Horario">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Días de trabajo">
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
                  on ? 'border-brand/70 bg-brand text-white' : 'border-input bg-background text-muted-foreground hover:bg-muted'
                )}
              >
                {lbl}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="p-start" className="text-xs">Hora de entrada</Label>
            <Input id="p-start" type="time" className="w-32" value={f.workStart} onChange={(e) => set({ workStart: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-hours" className="text-xs">Horas por día</Label>
            <Input
              id="p-hours"
              type="number"
              min={0.05}
              max={24}
              step={0.05}
              className="w-28"
              value={f.hoursPerDay}
              onChange={(e) => set({ hoursPerDay: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-tz" className="text-xs">Zona horaria</Label>
            <Input id="p-tz" list="tz-equipo" className="w-full sm:w-60" value={f.timezone} onChange={(e) => set({ timezone: e.target.value })} />
            <datalist id="tz-equipo">
              {TIMEZONES.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </div>
        </div>
      </FormGroup>

      <FormGroup
        title="Comida y horas de silencio"
        hint="En estos huecos (hora de su zona) no se le envía nada: lo que caiga dentro se retrasa hasta que termine (y los resúmenes programados salen en el momento permitido más cercano). Deja vacío para no aplicar."
        testId="perfil-silencio"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="p-lunch-a" className="text-xs">Comida: de</Label>
            <Input id="p-lunch-a" type="time" className="w-32" value={f.lunchStart} onChange={(e) => set({ lunchStart: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-lunch-b" className="text-xs">a</Label>
            <Input id="p-lunch-b" type="time" className="w-32" value={f.lunchEnd} onChange={(e) => set({ lunchEnd: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-quiet-a" className="text-xs">Silencio: de</Label>
            <Input id="p-quiet-a" type="time" className="w-32" value={f.quietStart} onChange={(e) => set({ quietStart: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-quiet-b" className="text-xs">a</Label>
            <Input id="p-quiet-b" type="time" className="w-32" value={f.quietEnd} onChange={(e) => set({ quietEnd: e.target.value })} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--brand)]"
            checked={f.urgentBypassQuiet}
            onChange={(e) => set({ urgentBypassQuiet: e.target.checked })}
          />
          Los urgentes pueden saltarse el silencio
        </label>
      </FormGroup>

      <FormGroup title="Notas y estado">
      <div className="space-y-1">
        <Label htmlFor="p-notes">Notas</Label>
        <textarea id="p-notes" rows={2} className={areaClass} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-[var(--brand)]"
          checked={f.active}
          onChange={(e) => set({ active: e.target.checked })}
        />
        Ficha activa (si se desactiva, el agente no le propone encargos)
      </label>
      </FormGroup>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-5 py-3">
        <Button
          size="sm"
          className="bg-brand text-white hover:bg-brand/90"
          disabled={pending || !f.name.trim()}
          onClick={save}
        >
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
        {dirty && <span className="text-xs text-warning-strong">Cambios sin guardar</span>}
        {msg && (
          <span role="status" className={`text-sm ${msg.type === 'ok' ? 'text-success' : 'text-destructive'}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}

// «Rellenar con IA»: texto pegado o audio grabado → la IA propone los campos (no guarda nada).
function AiFill({ onDraft }: { onDraft: (d: ProfileDraft) => void }) {
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
        form.append('audio', new Blob(chunks.current, { type: mr.mimeType || 'audio/webm' }), 'ficha.webm');
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
      const res = await aiFillProfile(text);
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
        <Sparkles className="text-brand" aria-hidden />
        Rellenar con IA
      </Button>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border border-brand/30 bg-brand-soft p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="size-4 text-brand" aria-hidden />
        Rellenar con IA
      </p>
      <p className="text-xs text-muted-foreground">
        Pega un texto o graba un audio describiendo a la persona. La IA propone los campos y tú los revisas antes de
        guardar; solo cambia los campos que consiga deducir.
      </p>
      <textarea
        rows={4}
        aria-label="Texto que describe a la persona"
        className={areaClass}
        placeholder="Ej.: Jesús lleva los cambios en webs WordPress, es muy meticuloso, trabaja 7 horas…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="bg-brand text-white hover:bg-brand/90"
          disabled={pending || recording || transcribing || text.trim().length < 10}
          onClick={run}
        >
          {pending ? 'Pensando…' : 'Proponer campos'}
        </Button>
        {recording ? (
          <Button size="sm" variant="destructive" onClick={stop}>
            <Square aria-hidden />
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
        {msg && <span className={`text-xs ${msg.type === 'ok' ? 'text-success' : 'text-destructive'}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
