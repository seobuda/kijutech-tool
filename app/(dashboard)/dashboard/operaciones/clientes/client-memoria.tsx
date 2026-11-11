'use client';

// «Contactos y memoria» de una ficha de cliente. Todo se guarda al momento (no depende de «Guardar
// ficha»): cada cambio llama a su acción del servidor, que comprueba los permisos.
import { useCallback, useEffect, useState, useTransition } from 'react';
import { AlertTriangle, AtSign, Brain, Check, Globe, Pause, Pencil, Play, Plus, RotateCcw, Sparkles, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge, Skeleton } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import {
  addClientMemory,
  addClientSender,
  decideClientMemory,
  deleteClientMemory,
  deleteClientSender,
  listClientMemory,
  setClientSenderActive,
  updateClientMemory,
  type ClientMemoryView,
  type ClientSenderView
} from '@/lib/operaciones/client-memory-actions';
import { MEMORY_KINDS, MEMORY_KIND_LABELS, MEMORY_MAX_CHARS } from '@/lib/operaciones/client-memory-rules';

const focusRing = 'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40 focus-visible:border-brand';
const fieldClass = cn(
  'w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground',
  focusRing
);
const selectClass = cn('h-9 rounded-md border border-input bg-card px-2.5 text-sm shadow-xs', focusRing);
const brandBtn = 'bg-brand text-white hover:bg-brand/90';
const dangerGhost = 'text-muted-foreground hover:bg-destructive-soft hover:text-destructive';

type Msg = { type: 'ok' | 'error'; text: string } | null;
type Result = { ok: boolean; error?: string };

const STATUS_BADGE: Record<string, { tone: 'warning' | 'success' | 'neutral'; label: string }> = {
  propuesto: { tone: 'warning', label: 'Propuesto' },
  aceptado: { tone: 'success', label: 'Aceptado' },
  descartado: { tone: 'neutral', label: 'Descartado' }
};

function ConfirmDelete({ what, disabled, onConfirm }: { what: string; disabled: boolean; onConfirm: () => void }) {
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
      ¿Eliminar {what}?
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

function SubHeading({ icon: Icon, title, hint, count }: { icon: typeof AtSign; title: string; hint: string; count?: number }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0">
        <h5 className="flex items-center gap-2 text-sm font-semibold">
          {title}
          {count !== undefined && count > 0 && <Badge tone="neutral">{count}</Badge>}
        </h5>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

export function ClientMemoria({ clientId }: { clientId: string }) {
  const [senders, setSenders] = useState<ClientSenderView[] | null>(null);
  const [memory, setMemory] = useState<ClientMemoryView[]>([]);
  const [canDelete, setCanDelete] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const res = await listClientMemory(clientId);
    if (!res.ok) {
      setLoadError(res.error);
      return;
    }
    setLoadError(null);
    setSenders(res.senders);
    setMemory(res.memory);
    setCanDelete(res.canDelete);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Ejecuta una acción, muestra el resultado y recarga la lista.
  const run = (fn: () => Promise<Result>, okText: string, after?: () => void) => {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setMsg({ type: 'error', text: res.error ?? 'No se pudo completar' });
        return;
      }
      setMsg({ type: 'ok', text: okText });
      after?.();
      await load();
    });
  };

  // --- Contactos ---
  const [sKind, setSKind] = useState<'email' | 'domain'>('email');
  const [sValue, setSValue] = useState('');
  const [sName, setSName] = useState('');
  const [sRole, setSRole] = useState('');

  const addSender = () =>
    run(
      () => addClientSender({ clientId, kind: sKind, value: sValue, name: sName, role: sRole }),
      'Contacto añadido',
      () => {
        setSValue('');
        setSName('');
        setSRole('');
      }
    );

  // --- Memoria ---
  const [mKind, setMKind] = useState<string>('preferencia');
  const [mText, setMText] = useState('');
  const [editing, setEditing] = useState<{ id: string; kind: string; text: string } | null>(null);

  const addMemory = () => run(() => addClientMemory({ clientId, kind: mKind, text: mText }), 'Dato guardado', () => setMText(''));

  const proposed = memory.filter((m) => m.status === 'propuesto');
  const accepted = memory.filter((m) => m.status === 'aceptado');
  const discarded = memory.filter((m) => m.status === 'descartado');

  if (loadError) {
    return (
      <p role="alert" className="flex items-center gap-2 rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        No se pudo cargar contactos y memoria: {loadError}
      </p>
    );
  }
  if (senders === null) {
    return (
      <div className="space-y-2" aria-busy="true">
        <p className="text-sm text-muted-foreground">Cargando contactos y memoria…</p>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-3/4" />
      </div>
    );
  }

  const memoryRow = (m: ClientMemoryView) => {
    const isEditing = editing?.id === m.id;
    const status = STATUS_BADGE[m.status];
    return (
      <li key={m.id} className="rounded-lg border bg-card p-3 text-sm shadow-xs">
        {isEditing ? (
          <div className="space-y-2">
            <select
              aria-label="Tipo de dato"
              className={selectClass}
              value={editing.kind}
              onChange={(e) => setEditing({ ...editing, kind: e.target.value })}
            >
              {MEMORY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {MEMORY_KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <textarea
              aria-label="Texto del dato"
              rows={3}
              maxLength={MEMORY_MAX_CHARS}
              className={fieldClass}
              value={editing.text}
              onChange={(e) => setEditing({ ...editing, text: e.target.value })}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className={brandBtn}
                disabled={pending || !editing.text.trim()}
                onClick={() =>
                  run(() => updateClientMemory({ id: m.id, kind: editing.kind, text: editing.text }), 'Dato actualizado', () =>
                    setEditing(null)
                  )
                }
              >
                Guardar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="outline">{MEMORY_KIND_LABELS[m.kind] ?? m.kind}</Badge>
                {status ? (
                  <Badge tone={status.tone} dot>
                    {status.label}
                  </Badge>
                ) : (
                  <Badge tone="neutral">{m.status}</Badge>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words">{m.text}</p>
              <p className="text-xs text-muted-foreground">
                {m.sourceType === 'manual' ? 'escrito a mano' : `de ${m.sourceType}`} · {new Date(m.createdAt).toLocaleDateString('es-ES')}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1">
              {m.status === 'propuesto' && (
                <>
                  <Button size="sm" className={brandBtn} disabled={pending} onClick={() => run(() => decideClientMemory(m.id, 'aceptado'), 'Dato aceptado')}>
                    <Check aria-hidden />
                    Aceptar
                  </Button>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => decideClientMemory(m.id, 'descartado'), 'Dato descartado')}>
                    <X aria-hidden />
                    Descartar
                  </Button>
                </>
              )}
              {m.status === 'aceptado' && (
                <>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditing({ id: m.id, kind: m.kind, text: m.text })}>
                    <Pencil aria-hidden />
                    Editar
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => decideClientMemory(m.id, 'descartado'), 'Dato descartado')}>
                    <X aria-hidden />
                    Descartar
                  </Button>
                </>
              )}
              {m.status === 'descartado' && (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => decideClientMemory(m.id, 'aceptado'), 'Dato recuperado')}>
                  <RotateCcw aria-hidden />
                  Recuperar
                </Button>
              )}
              {canDelete && <ConfirmDelete what="este dato" disabled={pending} onConfirm={() => run(() => deleteClientMemory(m.id), 'Dato eliminado')} />}
            </div>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        Se guardan al momento, sin pulsar «Guardar ficha». Sin contraseñas ni accesos. Solo los datos <strong>aceptados</strong> se usan como contexto.
      </p>

      {/* Contactos */}
      <section className="space-y-3" aria-label="Contactos del cliente">
        <SubHeading icon={AtSign} title="Contactos" hint="De quién son los correos." count={senders.length} />
        {senders.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
            Aún no hay contactos. Añade los correos o el dominio del cliente para que el sistema reconozca sus emails.
          </p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {senders.map((s) => (
              <li
                key={s.id}
                className={cn('flex flex-col gap-2 rounded-lg border bg-card p-3 text-sm shadow-xs', !s.active && 'bg-muted/40')}
              >
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                    {s.kind === 'email' ? <AtSign className="size-4" aria-hidden /> : <Globe className="size-4" aria-hidden />}
                  </span>
                  <div className={cn('min-w-0 flex-1', !s.active && 'text-muted-foreground')}>
                    <p className={cn('truncate font-medium', !s.active && 'line-through')} title={s.value}>
                      {s.value}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge tone="outline">{s.kind === 'email' ? 'Correo' : 'Dominio'}</Badge>
                      {!s.active && <Badge tone="neutral">Pausado</Badge>}
                      {(s.name || s.role) && <span className="text-xs text-muted-foreground">{[s.name, s.role].filter(Boolean).join(' · ')}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1">
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setClientSenderActive(s.id, !s.active), s.active ? 'Contacto pausado' : 'Contacto activado')}>
                    {s.active ? <Pause aria-hidden /> : <Play aria-hidden />}
                    {s.active ? 'Pausar' : 'Activar'}
                  </Button>
                  {canDelete && <ConfirmDelete what="este contacto" disabled={pending} onConfirm={() => run(() => deleteClientSender(s.id), 'Contacto eliminado')} />}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-3 rounded-lg border border-dashed bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor={`s-kind-${clientId}`}>Tipo</Label>
            <select id={`s-kind-${clientId}`} className={cn(selectClass, 'w-full')} value={sKind} onChange={(e) => setSKind(e.target.value as 'email' | 'domain')}>
              <option value="email">Correo concreto</option>
              <option value="domain">Todo un dominio</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="gap-1 text-xs" htmlFor={`s-value-${clientId}`}>
              {sKind === 'email' ? 'Correo' : 'Dominio'} <span className="text-destructive">*</span>
            </Label>
            <Input id={`s-value-${clientId}`} aria-required placeholder={sKind === 'email' ? 'persona@empresa.com' : 'empresa.com'} value={sValue} onChange={(e) => setSValue(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor={`s-name-${clientId}`}>Nombre</Label>
            <Input id={`s-name-${clientId}`} placeholder="Opcional" value={sName} onChange={(e) => setSName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor={`s-role-${clientId}`}>Cargo o rol</Label>
            <Input id={`s-role-${clientId}`} placeholder="Opcional" value={sRole} onChange={(e) => setSRole(e.target.value)} />
          </div>
          <Button size="sm" variant="outline" className="h-9 sm:col-span-2 lg:col-span-1" disabled={pending || !sValue.trim()} onClick={addSender}>
            <Plus aria-hidden />
            Añadir contacto
          </Button>
        </div>
      </section>

      {/* Memoria */}
      <section className="space-y-3" aria-label="Memoria del cliente">
        <SubHeading icon={Brain} title="Memoria" hint="Lo que hay que recordar de este cliente." count={accepted.length} />

        {proposed.length > 0 && (
          <div className="space-y-2 rounded-lg border border-warning/40 bg-warning-soft p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-warning-strong">
              <Sparkles className="size-3.5" aria-hidden />
              Propuestos por la IA, pendientes de revisar ({proposed.length})
            </p>
            <ul className="space-y-2">{proposed.map(memoryRow)}</ul>
          </div>
        )}

        {accepted.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground text-pretty">
            Aún no hay nada en la memoria. Anota preferencias, promesas, decisiones o restricciones del cliente (ej.: «Prefiere que le llamemos antes de cambiar el diseño»).
          </p>
        ) : (
          <ul className="space-y-2">{accepted.map(memoryRow)}</ul>
        )}

        <div className="grid gap-3 rounded-lg border border-dashed bg-muted/20 p-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor={`m-kind-${clientId}`}>Tipo</Label>
            <select id={`m-kind-${clientId}`} className={cn(selectClass, 'w-full')} value={mKind} onChange={(e) => setMKind(e.target.value)}>
              {MEMORY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {MEMORY_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="gap-1 text-xs" htmlFor={`m-text-${clientId}`}>
              Dato <span className="text-destructive">*</span>
            </Label>
            <textarea id={`m-text-${clientId}`} aria-required rows={2} maxLength={MEMORY_MAX_CHARS} className={fieldClass} value={mText} onChange={(e) => setMText(e.target.value)} />
          </div>
          <div className="sm:col-span-2 sm:flex sm:justify-end">
            <Button size="sm" variant="outline" disabled={pending || !mText.trim()} onClick={addMemory}>
              <Plus aria-hidden />
              Añadir a la memoria
            </Button>
          </div>
        </div>

        {discarded.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
              Descartados ({discarded.length})
            </summary>
            <ul className="mt-2 space-y-2 opacity-80">{discarded.map(memoryRow)}</ul>
          </details>
        )}
      </section>

      {msg && (
        <p
          role={msg.type === 'error' ? 'alert' : 'status'}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm',
            msg.type === 'ok' ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive'
          )}
        >
          {msg.type === 'ok' ? <Check className="size-3.5" aria-hidden /> : <AlertTriangle className="size-3.5" aria-hidden />}
          {msg.text}
        </p>
      )}
    </div>
  );
}
