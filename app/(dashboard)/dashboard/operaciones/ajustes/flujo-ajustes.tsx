'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { addWorkType, saveStatusMapping, updateWorkType } from '@/lib/operaciones/flow-actions';

type Values = { inProgress: string | null; inReview: string | null; done: string | null };
type Group = { key: string; statuses: string[]; listIds: string[]; listNames: string[]; values: Values; edited: boolean };
type WorkType = { key: string; label: string; active: boolean };

const selectClass =
  'w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';

export function FlujoAjustes({ groups, workTypes }: { groups: Group[]; workTypes: WorkType[] }) {
  return (
    <div className="space-y-6 max-w-5xl">
      <StatusMapping groups={groups} />
      <WorkTypes types={workTypes} />
    </div>
  );
}

function StatusMapping({ groups }: { groups: Group[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Estados de ClickUp para el flujo</CardTitle>
        <CardDescription>
          Cuando alguien pulsa «Empezar», «Hecho» o se acepta una revisión, la tarea cambia a estos estados. La
          propuesta se calcula por nombre y puedes cambiarla. Si una lista no tiene el equivalente, déjalo en «(solo
          comentario)»: la herramienta dejará un comentario en la tarea y no cambiará su estado. Las listas con los mismos
          estados se agrupan: lo que cambies aquí vale para todas las de su grupo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aún no hay estados en la caché. Pulsa «Actualizar desde ClickUp» (arriba) para traerlos.
          </p>
        )}
        {groups.map((g) => (
          <GroupRow key={g.key} group={g} />
        ))}
      </CardContent>
    </Card>
  );
}

function GroupRow({ group }: { group: Group }) {
  const router = useRouter();
  const [v, setV] = useState<Values>(group.values);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(group.values);

  const field = (label: string, key: keyof Values) => (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <select className={selectClass} value={v[key] ?? ''} onChange={(e) => setV({ ...v, [key]: e.target.value || null })}>
        <option value="">(solo comentario)</option>
        {group.statuses.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="rounded-md border border-gray-200 p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-sm">
          <p className="font-medium">
            {group.listIds.length} lista{group.listIds.length === 1 ? '' : 's'}
            {group.edited && <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">editado</span>}
          </p>
          <p className="text-xs text-muted-foreground">Estados: {group.statuses.join(' · ')}</p>
        </div>
        <button type="button" className="text-xs text-orange-600 hover:underline" onClick={() => setOpen(!open)}>
          {open ? 'Ocultar listas' : 'Ver listas'}
        </button>
      </div>
      {open && <p className="text-xs text-muted-foreground">{group.listNames.join(' · ')}</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        {field('▶️ En curso', 'inProgress')}
        {field('👀 En revisión', 'inReview')}
        {field('✅ Completado', 'done')}
      </div>
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={pending || !dirty}
          onClick={() =>
            startTransition(async () => {
              const res = await saveStatusMapping(group.listIds, v);
              setMsg(res.ok ? { ok: true, text: 'Guardado.' } : { ok: false, text: res.error });
              router.refresh();
            })
          }
        >
          Guardar
        </Button>
        {msg && <span className={`text-xs ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</span>}
      </div>
    </div>
  );
}

function WorkTypes({ types }: { types: WorkType[] }) {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setMsg(null);
      const res = await fn();
      if (!res.ok) setMsg(res.error ?? 'Error');
      router.refresh();
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tipos de trabajo</CardTitle>
        <CardDescription>
          Cada encargo tiene un tipo de trabajo. La IA lo propone al convertir una nota y se puede cambiar en la
          revisión. Hoy solo se guarda; más adelante servirá para elegir revisores automáticos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {types.map((t) => (
          <TypeRow key={t.key} type={t} pending={pending} run={run} />
        ))}
        <div className="flex gap-2 pt-2">
          <Input
            className="max-w-xs"
            placeholder="Nuevo tipo (ej.: Email marketing)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Button
            size="sm"
            disabled={pending || !label.trim()}
            onClick={() =>
              run(async () => {
                const r = await addWorkType(label);
                if (r.ok) setLabel('');
                return r;
              })
            }
          >
            Añadir
          </Button>
        </div>
        {msg && <p className="text-xs text-red-600">{msg}</p>}
      </CardContent>
    </Card>
  );
}

function TypeRow({
  type,
  pending,
  run
}: {
  type: WorkType;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [name, setName] = useState(type.label);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input className={`max-w-xs ${type.active ? '' : 'opacity-50'}`} value={name} onChange={(e) => setName(e.target.value)} />
      <Button
        size="sm"
        variant="outline"
        disabled={pending || name.trim() === type.label}
        onClick={() => run(() => updateWorkType(type.key, { label: name }))}
      >
        Renombrar
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => run(() => updateWorkType(type.key, { active: !type.active }))}
      >
        {type.active ? 'Desactivar' : 'Activar'}
      </Button>
      <span className="text-xs text-muted-foreground">{type.key}</span>
    </div>
  );
}
