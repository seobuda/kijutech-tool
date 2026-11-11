'use client';

import { useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ExternalLink, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
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
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60';

const Required = () => (
  <span className="text-destructive" aria-hidden>
    *
  </span>
);

// Bloque de campos con título y número de paso (solo presentación).
function FormGroup({ step, title, hint, children }: { step: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 border-t px-5 py-5 md:grid-cols-[200px_1fr] md:gap-6">
      <legend className="sr-only">{title}</legend>
      <div className="flex items-start gap-2.5" aria-hidden>
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand">
          {step}
        </span>
        <div>
          <p className="text-sm font-semibold">{title}</p>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground text-pretty">{hint}</p>}
        </div>
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </fieldset>
  );
}

export function NuevoEncargoForm({
  spaces,
  clientFields,
  workTypes,
  members,
  meId
}: {
  spaces: ClickUpSpaceWithLists[];
  clientFields: Record<string, { name: string; options: { id: string; label: string }[] }>;
  workTypes: { key: string; label: string }[];
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
  const [workTypeKey, setWorkTypeKey] = useState('');
  const [requiresReview, setRequiresReview] = useState(false);
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
        clientOptionId: clientField ? clientOptionId : '',
        workTypeKey,
        requiresReview
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
    setWorkTypeKey('');
    setRequiresReview(false);
    setClientHint(false);
    setResult(null);
    setFormError(null);
    setAiError(null);
  };

  if (result?.ok) {
    return (
      <div className="max-w-3xl rounded-xl border bg-card p-6 shadow-xs" role="status">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-success-soft text-success" aria-hidden>
            <CheckCircle2 className="size-6" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">
              Encargo {result.reused ? 'ya existía en ClickUp' : 'creado en ClickUp'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              {result.reused
                ? 'Se encontró la tarea con la marca del encargo y se ha enlazado, sin crear un duplicado.'
                : 'La tarea ya está en la lista elegida.'}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild className="bg-brand text-white hover:bg-brand/90">
                <a href={result.taskUrl} target="_blank" rel="noopener noreferrer">
                  Abrir tarea en ClickUp
                  <ExternalLink aria-hidden />
                </a>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/operaciones/encargos">Ver encargos</Link>
              </Button>
              <Button variant="ghost" onClick={reset}>
                Crear otro encargo
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const canSend = Boolean(listId && title.trim() && request.trim());

  return (
    <div className="max-w-4xl space-y-4">
      {result && !result.ok && (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive-soft p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
            <div className="min-w-0 space-y-3">
              <div>
                <p className="font-medium text-destructive">El encargo se guardó, pero no se pudo crear en ClickUp</p>
                <p className="mt-0.5 text-sm text-destructive">{result.error}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={retry} disabled={sendPending}>
                  <RotateCcw className={cn(sendPending && 'animate-spin')} aria-hidden />
                  {sendPending ? 'Reintentando…' : 'Reintentar'}
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/dashboard/operaciones/encargos">Ver encargos</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <section className="rounded-xl border bg-card shadow-xs" aria-labelledby="nuevo-encargo-titulo">
        <div className="px-5 py-4">
          <h2 id="nuevo-encargo-titulo" className="text-[15px] font-semibold">
            Nuevo encargo
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Los campos con <span className="text-destructive">*</span> son obligatorios.
          </p>
        </div>

        <FormGroup step={1} title="Destino" hint="Dónde se creará la tarea en ClickUp.">
          <div className="space-y-2">
            <Label htmlFor="list">
              Lista de ClickUp <Required />
            </Label>
            <select
              id="list"
              required
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

          {listId && (
            <div className="space-y-2">
              <Label htmlFor="client">Cliente</Label>
              {clientField ? (
                <>
                  <select
                    id="client"
                    className={cn(selectClass, clientHint && !clientOptionId && 'border-warning/70')}
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
                    <p className="text-xs text-warning-strong">
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
        </FormGroup>

        <FormGroup step={2} title="Qué hay que hacer" hint="Escribe la petición y, si quieres, deja que la IA la ordene.">
          <div className="space-y-2">
            <Label htmlFor="request">
              Petición (texto libre) <Required />
            </Label>
            <textarea
              id="request"
              rows={5}
              required
              className={selectClass}
              placeholder="Escríbelo como te salga: la IA lo convertirá en un encargo claro."
              value={request}
              onChange={(e) => setRequest(e.target.value)}
            />
            <div className="flex flex-col gap-2 rounded-lg border border-dashed bg-muted/30 p-3 sm:flex-row sm:items-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={prepare}
                disabled={aiPending || !request.trim()}
              >
                <Sparkles className={cn('text-brand', aiPending && 'animate-pulse')} aria-hidden />
                {aiPending ? 'Preparando…' : 'Preparar con IA'}
              </Button>
              <span className="text-xs text-muted-foreground">
                Opcional. Rellena el título y la descripción para que los edites antes de enviar.
              </span>
            </div>
            {aiError && (
              <p role="alert" className="text-sm text-destructive">
                {aiError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">
              Título <Required />
            </Label>
            <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          {(prepared || missing.length > 0) && (
            <div className="space-y-2">
              <Label htmlFor="prepared">Descripción preparada (editable)</Label>
              {missing.length > 0 && (
                <div className="flex items-start gap-2.5 rounded-lg border border-warning/45 bg-warning-soft p-3 text-sm text-warning-strong">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <div className="min-w-0">
                    <p className="font-medium">Faltan datos para poder ejecutar el encargo:</p>
                    <ul className="ml-5 list-disc">
                      {missing.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                    <p className="mt-1 text-xs">
                      Complétalos en la descripción antes de enviar, o envía el encargo tal cual para que
                      se los pregunten a quien lo pidió.
                    </p>
                  </div>
                </div>
              )}
              <textarea
                id="prepared"
                rows={14}
                className={cn(selectClass, 'font-mono')}
                value={prepared}
                onChange={(e) => setPrepared(e.target.value)}
              />
            </div>
          )}
        </FormGroup>

        <FormGroup step={3} title="Quién y cuándo" hint="Responsable, plazo y cómo se cierra.">
          <div className="grid gap-4 sm:grid-cols-2">
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
              <Label htmlFor="worktype">Tipo de trabajo</Label>
              <select
                id="worktype"
                className={selectClass}
                value={workTypeKey}
                onChange={(e) => setWorkTypeKey(e.target.value)}
              >
                <option value="">Sin tipo</option>
                {workTypes.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
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
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/40">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--brand)]"
              checked={requiresReview}
              onChange={(e) => setRequiresReview(e.target.checked)}
            />
            <span className="font-medium">Requiere mi revisión</span>
          </label>
        </FormGroup>

        <div className="space-y-2 rounded-b-xl border-t bg-muted/30 px-5 py-4">
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {!prepared && request.trim()
                ? 'Sin «Preparar con IA», la descripción de la tarea será tu petición original.'
                : null}
            </p>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Button asChild variant="ghost">
                <Link href="/dashboard/operaciones/encargos">Cancelar</Link>
              </Button>
              <Button className="bg-brand text-white hover:bg-brand/90" onClick={send} disabled={!canSend || sendPending}>
                {sendPending ? 'Enviando…' : 'Crear encargo en ClickUp'}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

