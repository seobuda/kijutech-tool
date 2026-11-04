'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';

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
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-medium">Equipo</h2>
          <p className="text-sm text-muted-foreground">
            Una ficha por persona: qué hace, en qué destaca y cuándo trabaja. El agente la usa para proponer quién
            hace cada encargo, y los resúmenes diarios usan su zona horaria y su hora de entrada.
          </p>
        </div>
        <Button size="sm" disabled={editing !== null} onClick={() => setEditing('new')}>
          Nueva ficha
        </Button>
      </div>

      {msg && <p className={`text-sm ${msg.type === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}

      <CleanupPanel people={cleanupPeople} testMode={testMode} />

      {withoutProfile.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm space-y-2">
          <p>Miembros de ClickUp sin ficha:</p>
          <div className="flex flex-wrap gap-2">
            {withoutProfile.map((m) => (
              <Button
                key={m.id}
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => act(() => createProfileForMember(m.id), `Ficha de ${m.username} creada.`)}
              >
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
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center space-y-2">
          <p className="font-medium">Todavía no hay fichas</p>
          <p className="text-sm text-muted-foreground">Crea la primera para que el agente sepa quién hace qué.</p>
          <Button size="sm" onClick={() => setEditing('new')}>
            Nueva ficha
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {profiles.map((p) =>
            editing === p.id ? (
              <ProfileForm
                key={p.id}
                initial={p}
                members={members}
                workTypes={workTypes}
                onCancel={() => setEditing(null)}
                onSaved={onSaved}
              />
            ) : (
              <div
                key={p.id}
                data-testid={`perfil-${p.name}`}
                className={`rounded-lg border p-4 space-y-2 ${p.active ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-75'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {p.name}
                      {!p.active && (
                        <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600">Desactivada</span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {p.jobTitle || 'Sin puesto'} ·{' '}
                      {p.clickupUserId
                        ? `ClickUp: ${members.find((m) => m.id === p.clickupUserId)?.username ?? p.clickupUserId}`
                        : 'sin miembro de ClickUp'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={editing !== null || pending} onClick={() => setEditing(p.id)}>
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
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {daysLabel(p.workDays)} · entrada {p.workStart} · {p.hoursPerDay} h/día · {p.timezone}
                </p>
                {p.workTypes.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {p.workTypes.map((t) => (
                      <span
                        key={t.key}
                        className={`rounded px-2 py-0.5 text-xs ${t.role === 'primary' ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-700'}`}
                      >
                        {t.role === 'primary' ? '★ ' : ''}
                        {typeLabel.get(t.key) ?? t.key}
                        {t.role === 'support' ? ' (apoyo)' : ''}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Sin tipos de trabajo asignados.</p>
                )}
                {p.description && <p className="text-sm whitespace-pre-line">{p.description}</p>}
                {p.notes && (
                  <p className="text-xs text-muted-foreground whitespace-pre-line">
                    <span className="font-medium">Notas:</span> {p.notes}
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
    <div className="rounded-lg border-2 border-orange-300 bg-white p-4 space-y-4" data-testid="perfil-form">
      <p className="font-medium">{isNew ? 'Nueva ficha' : `Editar la ficha de ${initial.name}`}</p>

      <AiFill onDraft={applyDraft} />

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

      <div className="space-y-2">
        <Label>Tipos de trabajo que hace</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {workTypes.map((t) => (
            <div key={t.key} className="flex items-center justify-between gap-2 rounded border border-gray-200 px-2 py-1">
              <span className="text-sm">{t.label}</span>
              <select
                aria-label={`Función en ${t.label}`}
                className="rounded border border-gray-300 bg-white px-1 py-0.5 text-sm"
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
      </div>

      <div className="space-y-2">
        <Label>Horario</Label>
        <div className="flex flex-wrap gap-1.5">
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
              min={0.5}
              max={24}
              step={0.5}
              className="w-28"
              value={f.hoursPerDay}
              onChange={(e) => set({ hoursPerDay: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-tz" className="text-xs">Zona horaria</Label>
            <Input id="p-tz" list="tz-equipo" className="w-60" value={f.timezone} onChange={(e) => set({ timezone: e.target.value })} />
            <datalist id="tz-equipo">
              {TIMEZONES.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </div>
        </div>
      </div>

      <div className="space-y-2" data-testid="perfil-silencio">
        <Label>Comida y horas de silencio</Label>
        <p className="text-xs text-muted-foreground">
          En estos huecos (hora de su zona) no se le envía nada: lo que caiga dentro se retrasa hasta que termine (y los resúmenes programados salen en el momento permitido más cercano). Deja vacío para no aplicar.
        </p>
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
          <input type="checkbox" checked={f.urgentBypassQuiet} onChange={(e) => set({ urgentBypassQuiet: e.target.checked })} />
          Los urgentes pueden saltarse el silencio
        </label>
      </div>

      <div className="space-y-1">
        <Label htmlFor="p-notes">Notas</Label>
        <textarea id="p-notes" rows={2} className={areaClass} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 accent-orange-500"
          checked={f.active}
          onChange={(e) => set({ active: e.target.checked })}
        />
        Ficha activa (si se desactiva, el agente no le propone encargos)
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
        ✨ Rellenar con IA
      </Button>
    );
  }
  return (
    <div className="space-y-2 rounded-md border border-orange-200 bg-orange-50 p-3">
      <p className="text-sm font-medium">Rellenar con IA</p>
      <p className="text-xs text-muted-foreground">
        Pega un texto o graba un audio describiendo a la persona. La IA propone los campos y tú los revisas antes de
        guardar; solo cambia los campos que consiga deducir.
      </p>
      <textarea
        rows={4}
        className={areaClass}
        placeholder="Ej.: Jesús lleva los cambios en webs WordPress, es muy meticuloso, trabaja 7 horas…"
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
