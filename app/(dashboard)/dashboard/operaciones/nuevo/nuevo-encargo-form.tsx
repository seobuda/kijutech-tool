'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  createRequest,
  prepareRequestWithAI,
  retryRequest
} from '@/lib/operaciones/request-actions';
import type { ClickUpSpaceWithLists } from '@/lib/operaciones/clickup';
import type { SyncResult } from '@/lib/operaciones/sync';

const PRIORITIES = [
  { value: '1', label: 'Urgente' },
  { value: '2', label: 'Alta' },
  { value: '3', label: 'Normal' },
  { value: '4', label: 'Baja' }
];

const selectClass =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';

export function NuevoEncargoForm({
  spaces,
  clientFields,
  members,
  meId
}: {
  spaces: ClickUpSpaceWithLists[];
  clientFields: Record<string, { name: string; options: { id: string; label: string }[] }>;
  members: { id: string; username: string }[];
  meId: string;
}) {
  const [listId, setListId] = useState('');
  // Los miembros salen de la caché (no se llama a ClickUp al elegir lista).
  const [assigneeId, setAssigneeId] = useState(members.some((m) => m.id === meId) ? meId : '');

  const [title, setTitle] = useState('');
  const [request, setRequest] = useState('');
  const [prepared, setPrepared] = useState('');
  const [missing, setMissing] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('3');
  const [clientOptionId, setClientOptionId] = useState('');
  const [clientHint, setClientHint] = useState(false); // la IA lo intentó y no encontró uno claro

  const [aiError, setAiError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [aiPending, startAi] = useTransition();
  const [sendPending, startSend] = useTransition();

  const allLists = spaces.flatMap((s) =>
    s.lists.map((l) => ({ ...l, spaceName: s.name }))
  );
  const listName = allLists.find((l) => l.id === listId)?.name ?? '';
  const clientField = (() => {
    const fid = allLists.find((l) => l.id === listId)?.clientFieldId;
    return fid ? clientFields[fid] ?? null : null;
  })();


  const prepare = () =>
    startAi(async () => {
      setAiError(null);
      const res = await prepareRequestWithAI({ title, request, listName, listId });
      if (!res.ok) {
        setAiError(res.error);
        return;
      }
      setTitle(res.prepared.title);
      setPrepared(res.prepared.description);
      setMissing(res.prepared.missingData);
      if (clientField) {
        setClientOptionId(res.prepared.clientOptionId);
        setClientHint(!res.prepared.clientOptionId);
      }
    });

  const send = () =>
    startSend(async () => {
      setFormError(null);
      setResult(null);
      const assignee = members.find((m) => String(m.id) === assigneeId);
      const res = await createRequest({
        listId,
        listName,
        title,
        request,
        preparedDescription: prepared,
        assigneeId: assignee ? String(assignee.id) : null,
        assigneeName: assignee?.username ?? null,
        dueDate: dueDate || null,
        priority: priority ? Number(priority) : null,
        clientOptionId: clientField ? clientOptionId : ''
      });
      if ('requestId' in res && res.requestId) setResult(res as SyncResult);
      else if (!res.ok) setFormError(res.error);
    });

  const retry = () =>
    startSend(async () => {
      if (result) setResult(await retryRequest(result.requestId));
    });

  const reset = () => {
    setTitle('');
    setRequest('');
    setPrepared('');
    setMissing([]);
    setDueDate('');
    setPriority('3');
    setClientOptionId('');
    setClientHint(false);
    setResult(null);
    setFormError(null);
    setAiError(null);
  };

  if (result?.ok) {
    return (
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>✅ Encargo {result.reused ? 'ya existía en ClickUp' : 'creado en ClickUp'}</CardTitle>
          <CardDescription>
            {result.reused
              ? 'Se encontró la tarea con la marca del encargo y se ha enlazado, sin crear un duplicado.'
              : 'La tarea ya está en la lista elegida.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <a href={result.taskUrl} target="_blank" rel="noopener noreferrer">
            <Button>Abrir tarea en ClickUp</Button>
          </a>
          <Link href="/dashboard/operaciones/encargos">
            <Button variant="outline">Ver encargos</Button>
          </Link>
          <Button variant="ghost" onClick={reset}>
            Crear otro encargo
          </Button>
        </CardContent>
      </Card>
    );
  }

  const canSend = Boolean(listId && title.trim() && request.trim());

  return (
    <div className="max-w-3xl space-y-6">
      {result && !result.ok && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-700">El encargo se guardó, pero no se pudo crear en ClickUp</CardTitle>
            <CardDescription className="text-red-700">{result.error}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={retry} disabled={sendPending}>
              {sendPending ? 'Reintentando…' : 'Reintentar'}
            </Button>
            <Link href="/dashboard/operaciones/encargos">
              <Button variant="outline">Ver encargos</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Nuevo encargo</CardTitle>
          <CardDescription>
            Los campos con <span className="text-red-500">*</span> son obligatorios.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="list">
              Lista de ClickUp <span className="text-red-500">*</span>
            </Label>
            <select
              id="list"
              className={selectClass}
              value={listId}
              onChange={(e) => {
                const fid = allLists.find((l) => l.id === e.target.value)?.clientFieldId;
                // El cliente elegido solo vale si la nueva lista usa el mismo campo.
                if (!fid || !clientFields[fid]?.options.some((o) => o.id === clientOptionId)) setClientOptionId('');
                setListId(e.target.value);
              }}
            >
              <option value="">Elige una lista…</option>
              {spaces.map((s) => (
                <optgroup key={s.id} label={s.name}>
                  {s.lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.folder ? `${l.folder} / ${l.name}` : l.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="request">
              Petición (texto libre) <span className="text-red-500">*</span>
            </Label>
            <textarea
              id="request"
              rows={5}
              className={selectClass}
              placeholder="Escríbelo como te salga: la IA lo convertirá en un encargo claro."
              value={request}
              onChange={(e) => setRequest(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={prepare}
                disabled={aiPending || !request.trim()}
              >
                {aiPending ? 'Preparando…' : '✨ Preparar con IA'}
              </Button>
              <span className="text-xs text-muted-foreground">
                Opcional. Rellena el título y la descripción para que los edites antes de enviar.
              </span>
            </div>
            {aiError && <p className="text-sm text-red-600">{aiError}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">
              Título <span className="text-red-500">*</span>
            </Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          {(prepared || missing.length > 0) && (
            <div className="space-y-2">
              <Label htmlFor="prepared">Descripción preparada (editable)</Label>
              {missing.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-medium">Faltan datos para poder ejecutar el encargo:</p>
                  <ul className="list-disc ml-5">
                    {missing.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs">
                    Complétalos en la descripción antes de enviar, o envía el encargo tal cual para que
                    se los pregunten a quien lo pidió.
                  </p>
                </div>
              )}
              <textarea
                id="prepared"
                rows={14}
                className={`${selectClass} font-mono`}
                value={prepared}
                onChange={(e) => setPrepared(e.target.value)}
              />
            </div>
          )}

          {listId && (
            <div className="space-y-2">
              <Label htmlFor="client">Cliente</Label>
              {clientField ? (
                <>
                  <select
                    id="client"
                    className={`${selectClass} ${clientHint && !clientOptionId ? 'border-amber-400' : ''}`}
                    value={clientOptionId}
                    onChange={(e) => setClientOptionId(e.target.value)}
                  >
                    <option value="">Sin cliente</option>
                    {clientField.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {clientHint && !clientOptionId && (
                    <p className="text-xs text-amber-700">
                      La IA no ha encontrado un cliente claro en la petición. Elígelo o déjalo vacío.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Esta lista no tiene campo «Cliente»: la tarea se creará sin él.
                </p>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="assignee">Responsable</Label>
              <select
                id="assignee"
                className={selectClass}
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                disabled={!listId}
              >
                <option value="">
                  {!listId ? 'Elige antes una lista' : 'Sin asignar'}
                </option>
                {members.map((m) => (
                  <option key={m.id} value={String(m.id)}>
                    {m.username}
                    {String(m.id) === meId ? ' (yo)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="due">Fecha de entrega</Label>
              <Input id="due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">Prioridad</Label>
              <select
                id="priority"
                className={selectClass}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={send} disabled={!canSend || sendPending}>
              {sendPending ? 'Enviando…' : 'Crear encargo en ClickUp'}
            </Button>
            <Link href="/dashboard/operaciones/encargos">
              <Button variant="ghost">Cancelar</Button>
            </Link>
          </div>
          {!prepared && request.trim() && (
            <p className="text-xs text-muted-foreground">
              Sin «Preparar con IA», la descripción de la tarea será tu petición original.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
