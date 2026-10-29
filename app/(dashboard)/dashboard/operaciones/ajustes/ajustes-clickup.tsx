'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  removeClickUpToken,
  saveClickUpToken,
  saveSelectedSpaces,
  saveTranscriptionModel,
  syncClickUpNow
} from '@/lib/operaciones/actions';
import type { ClickUpRequestStats } from '@/lib/operaciones/queries';

type StructureView = {
  syncedAt: string | null;
  workspaceName: string | null;
  membersCount: number;
  spaces: { id: string; name: string; selected: boolean; listCount: number }[];
};

const dateTimeFmt = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
});

export function AjustesClickUp({
  hasToken,
  updatedAt,
  transcriptionModel,
  structure,
  stats
}: {
  hasToken: boolean;
  updatedAt: string | null;
  transcriptionModel: string;
  structure: StructureView;
  stats: ClickUpRequestStats;
}) {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setMessage(null);
      const res = await saveClickUpToken(token);
      if (res.ok) {
        setToken('');
        setMessage({
          type: 'ok',
          text: 'Token guardado (cifrado). Se está sincronizando la estructura de ClickUp en segundo plano.'
        });
        router.refresh();
      } else {
        setMessage({ type: 'error', text: res.error });
      }
    });

  const test = () =>
    startTransition(async () => {
      setMessage(null);
      const res = await syncClickUpNow();
      if (res.ok) {
        setMessage({
          type: 'ok',
          text: `✅ Conectado al workspace «${res.workspaceName}»: ${res.members} miembros, ${res.spaces} espacios (${res.selected} seleccionados) y ${res.lists} listas guardadas.`
        });
      } else {
        setMessage({ type: 'error', text: `Error de conexión: ${res.error}` });
      }
      router.refresh();
    });

  const remove = () =>
    startTransition(async () => {
      if (!window.confirm('¿Eliminar el token de ClickUp y la caché de espacios y listas?')) return;
      await removeClickUpToken();
      setMessage({ type: 'ok', text: 'Token eliminado.' });
      router.refresh();
    });

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Token personal de ClickUp</CardTitle>
          <CardDescription>
            En ClickUp: tu avatar → Ajustes → Aplicaciones → «API Token». Se guarda cifrado y nunca
            se vuelve a mostrar.
            {hasToken && updatedAt && (
              <> Hay un token guardado (actualizado el {new Date(updatedAt).toLocaleString('es-ES')}).</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="clickup-token">
              {hasToken ? 'Sustituir token' : 'Token'} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="clickup-token"
              type="password"
              autoComplete="off"
              placeholder="pk_..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={pending || !token.trim()}>
              {hasToken ? 'Guardar nuevo token' : 'Guardar token'}
            </Button>
            <Button variant="outline" onClick={test} disabled={pending || !hasToken}>
              {pending ? 'Consultando…' : 'Probar conexión'}
            </Button>
            {hasToken && (
              <Button variant="ghost" onClick={remove} disabled={pending}>
                Eliminar token
              </Button>
            )}
          </div>
          {message && (
            <p
              data-testid="token-message"
              className={`text-sm ${message.type === 'ok' ? 'text-green-700' : 'text-red-600'}`}
            >
              {message.text}
            </p>
          )}
          {!hasToken && !message && (
            <p className="text-sm text-muted-foreground">
              Aún no hay token. Pégalo arriba y guárdalo para activar el Bloc de notas y «Equipo hoy».
            </p>
          )}
        </CardContent>
      </Card>

      {hasToken && <EspaciosCard structure={structure} />}

      <ModeloTranscripcion initial={transcriptionModel} />

      <PeticionesCard stats={stats} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function EspaciosCard({ structure }: { structure: StructureView }) {
  const router = useRouter();
  const initial = structure.spaces.filter((s) => s.selected).map((s) => s.id);
  const [selected, setSelected] = useState<string[]>(initial);
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const changed =
    selected.length !== initial.length || selected.some((id) => !initial.includes(id));

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const save = () =>
    startTransition(async () => {
      setMsg(null);
      const res = await saveSelectedSpaces(selected);
      setMsg(res.ok ? { type: 'ok', text: 'Selección guardada.' } : { type: 'error', text: res.error });
      router.refresh();
    });

  const sync = () =>
    startTransition(async () => {
      setMsg(null);
      const res = await syncClickUpNow();
      setMsg(
        res.ok
          ? { type: 'ok', text: `Actualizado: ${res.spaces} espacios, ${res.lists} listas, ${res.members} miembros.` }
          : { type: 'error', text: res.error }
      );
      router.refresh();
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Espacios que se sincronizan</CardTitle>
        <CardDescription>
          Solo los espacios marcados se guardan en la caché, se refrescan y aparecen en los
          desplegables del Bloc de notas y de «Nuevo encargo» y en «Equipo hoy».{' '}
          {structure.syncedAt
            ? `Última sincronización: ${dateTimeFmt.format(new Date(structure.syncedAt))} (se refresca sola si tiene más de 1 hora).`
            : 'Todavía no se ha sincronizado.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {structure.spaces.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay espacios guardados. Pulsa «Actualizar desde ClickUp».
          </p>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2">
            {structure.spaces.map((s) => (
              <li key={s.id}>
                <label className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selected.includes(s.id)}
                    onChange={() => toggle(s.id)}
                    disabled={pending}
                    className="h-4 w-4 accent-orange-500"
                  />
                  <span className="truncate">{s.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                    {s.selected ? `${s.listCount} listas` : 'no sincronizado'}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={pending || !changed || selected.length === 0}>
            {pending ? 'Guardando…' : `Guardar selección (${selected.length})`}
          </Button>
          <Button variant="outline" onClick={sync} disabled={pending}>
            Actualizar desde ClickUp
          </Button>
          <span className="text-xs text-muted-foreground">
            {structure.membersCount} miembros en el workspace
            {structure.workspaceName ? ` «${structure.workspaceName}»` : ''}
          </span>
        </div>
        {msg && (
          <p className={`text-sm ${msg.type === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>
        )}
      </CardContent>
    </Card>
  );
}

function ModeloTranscripcion({ initial }: { initial: string }) {
  const [model, setModel] = useState(initial);
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setMsg(null);
      const res = await saveTranscriptionModel(model);
      setMsg(res.ok ? { type: 'ok', text: 'Modelo guardado.' } : { type: 'error', text: res.error });
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transcripción de audio</CardTitle>
        <CardDescription>
          Modelo de Gemini que transcribe las grabaciones del Bloc de notas. Usa la clave de Gemini
          ya configurada en IA &amp; Modelos. Por defecto: gemini-flash-latest.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="transcription-model">Modelo</Label>
          <Input
            id="transcription-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gemini-flash-latest"
          />
        </div>
        <Button onClick={save} disabled={pending || !model.trim() || model.trim() === initial}>
          {pending ? 'Guardando…' : 'Guardar modelo'}
        </Button>
        {msg && (
          <p className={`text-sm ${msg.type === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>
        )}
      </CardContent>
    </Card>
  );
}

function PeticionesCard({ stats }: { stats: ClickUpRequestStats }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Peticiones a ClickUp (última hora)</CardTitle>
        <CardDescription>
          El token de ClickUp admite 100 peticiones por minuto. La herramienta espera antes de seguir al
          llegar a 80 y reintenta si ClickUp responde que se superó el límite. Los registros de más de 24 h
          se borran solos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4 text-sm" data-testid="request-stats">
          <div className="rounded-md border border-gray-200 p-3">
            <p className="text-xs text-muted-foreground">Última hora</p>
            <p className="text-xl font-medium">{stats.lastHour}</p>
          </div>
          <div className="rounded-md border border-gray-200 p-3">
            <p className="text-xs text-muted-foreground">Último minuto</p>
            <p className="text-xl font-medium">
              {stats.lastMinute} <span className="text-xs text-muted-foreground">/ 100</span>
            </p>
          </div>
          <div className="rounded-md border border-gray-200 p-3">
            <p className="text-xs text-muted-foreground">Máximo en un minuto</p>
            <p className="text-xl font-medium">{stats.peakPerMinute}</p>
          </div>
          <div className="rounded-md border border-gray-200 p-3">
            <p className="text-xs text-muted-foreground">Límite superado (429)</p>
            <p className={`text-xl font-medium ${stats.throttled > 0 ? 'text-red-600' : ''}`}>
              {stats.throttled}
            </p>
          </div>
        </div>

        {stats.byEndpoint.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay peticiones registradas en la última hora.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Consulta</th>
                  <th className="px-3 py-2 text-right">Peticiones</th>
                  <th className="px-3 py-2 text-right">Media</th>
                  <th className="px-3 py-2 text-right">429</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.byEndpoint.map((r) => (
                  <tr key={`${r.method} ${r.endpoint}`}>
                    <td className="px-3 py-1.5 font-mono text-xs">
                      {r.method} {r.endpoint}
                    </td>
                    <td className="px-3 py-1.5 text-right">{r.count}</td>
                    <td className="px-3 py-1.5 text-right">{r.avgMs} ms</td>
                    <td className="px-3 py-1.5 text-right">{r.throttled || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
