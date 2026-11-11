'use client';

// «Contactos y memoria» de una ficha de cliente. Todo se guarda al momento (no depende de «Guardar
// ficha»): cada cambio llama a su acción del servidor, que comprueba los permisos.
import { useCallback, useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

const fieldClass =
  'w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand';
const selectClass = 'rounded-md border border-input bg-card px-2 py-2 text-sm';

type Msg = { type: 'ok' | 'error'; text: string } | null;
type Result = { ok: boolean; error?: string };

function ConfirmDelete({ what, disabled, onConfirm }: { what: string; disabled: boolean; onConfirm: () => void }) {
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
    return <p className="text-sm text-destructive">No se pudo cargar contactos y memoria: {loadError}</p>;
  }
  if (senders === null) {
    return <p className="text-sm text-muted-foreground">Cargando contactos y memoria…</p>;
  }

  const memoryRow = (m: ClientMemoryView) => {
    const isEditing = editing?.id === m.id;
    return (
      <li key={m.id} className="rounded-md border border-border p-2 text-sm">
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
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-xs text-foreground/80">
                {MEMORY_KIND_LABELS[m.kind] ?? m.kind}
              </span>
              <span className="whitespace-pre-wrap break-words">{m.text}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {m.sourceType === 'manual' ? 'escrito a mano' : `de ${m.sourceType}`} · {new Date(m.createdAt).toLocaleDateString('es-ES')}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {m.status === 'propuesto' && (
                <>
                  <Button size="sm" disabled={pending} onClick={() => run(() => decideClientMemory(m.id, 'aceptado'), 'Dato aceptado')}>
                    Aceptar
                  </Button>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => decideClientMemory(m.id, 'descartado'), 'Dato descartado')}>
                    Descartar
                  </Button>
                </>
              )}
              {m.status === 'aceptado' && (
                <>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditing({ id: m.id, kind: m.kind, text: m.text })}>
                    Editar
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => decideClientMemory(m.id, 'descartado'), 'Dato descartado')}>
                    Descartar
                  </Button>
                </>
              )}
              {m.status === 'descartado' && (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => decideClientMemory(m.id, 'aceptado'), 'Dato recuperado')}>
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
    <div className="space-y-5 rounded-lg border border-brand/30 bg-brand-soft/40 p-3">
      <div>
        <h4 className="text-sm font-semibold">Contactos y memoria</h4>
        <p className="text-xs text-muted-foreground">
          Se guardan al momento, sin pulsar «Guardar ficha». Sin contraseñas ni accesos. Solo los datos <strong>aceptados</strong> se usan como contexto.
        </p>
      </div>

      {/* Contactos */}
      <section className="space-y-2" aria-label="Contactos del cliente">
        <Label>Contactos (de quién son los correos)</Label>
        {senders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay contactos. Añade los correos o el dominio del cliente para que el sistema reconozca sus emails.
          </p>
        ) : (
          <ul className="space-y-1">
            {senders.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card p-2 text-sm">
                <div className={s.active ? '' : 'text-muted-foreground line-through'}>
                  <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-xs">{s.kind === 'email' ? 'Correo' : 'Dominio'}</span>
                  <span className="font-medium">{s.value}</span>
                  {(s.name || s.role) && <span className="ml-2 text-xs text-muted-foreground">{[s.name, s.role].filter(Boolean).join(' · ')}</span>}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setClientSenderActive(s.id, !s.active), s.active ? 'Contacto pausado' : 'Contacto activado')}>
                    {s.active ? 'Pausar' : 'Activar'}
                  </Button>
                  {canDelete && <ConfirmDelete what="este contacto" disabled={pending} onConfirm={() => run(() => deleteClientSender(s.id), 'Contacto eliminado')} />}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs" htmlFor={`s-kind-${clientId}`}>Tipo</Label>
            <select id={`s-kind-${clientId}`} className={selectClass} value={sKind} onChange={(e) => setSKind(e.target.value as 'email' | 'domain')}>
              <option value="email">Correo concreto</option>
              <option value="domain">Todo un dominio</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor={`s-value-${clientId}`}>{sKind === 'email' ? 'Correo *' : 'Dominio *'}</Label>
            <Input id={`s-value-${clientId}`} className="w-60" placeholder={sKind === 'email' ? 'persona@empresa.com' : 'empresa.com'} value={sValue} onChange={(e) => setSValue(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor={`s-name-${clientId}`}>Nombre</Label>
            <Input id={`s-name-${clientId}`} className="w-40" placeholder="Opcional" value={sName} onChange={(e) => setSName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor={`s-role-${clientId}`}>Cargo o rol</Label>
            <Input id={`s-role-${clientId}`} className="w-40" placeholder="Opcional" value={sRole} onChange={(e) => setSRole(e.target.value)} />
          </div>
          <Button size="sm" disabled={pending || !sValue.trim()} onClick={addSender}>
            Añadir contacto
          </Button>
        </div>
      </section>

      {/* Memoria */}
      <section className="space-y-2" aria-label="Memoria del cliente">
        <Label>Memoria (lo que hay que recordar de este cliente)</Label>

        {proposed.length > 0 && (
          <div className="space-y-1 rounded-md border border-warning/45 bg-warning-soft p-2">
            <p className="text-xs font-medium text-warning-strong">Propuestos por la IA, pendientes de revisar ({proposed.length})</p>
            <ul className="space-y-1">{proposed.map(memoryRow)}</ul>
          </div>
        )}

        {accepted.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay nada en la memoria. Anota preferencias, promesas, decisiones o restricciones del cliente (ej.: «Prefiere que le llamemos antes de cambiar el diseño»).
          </p>
        ) : (
          <ul className="space-y-1">{accepted.map(memoryRow)}</ul>
        )}

        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor={`m-kind-${clientId}`}>Tipo</Label>
              <select id={`m-kind-${clientId}`} className={selectClass} value={mKind} onChange={(e) => setMKind(e.target.value)}>
                {MEMORY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {MEMORY_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[16rem] flex-1 space-y-1">
              <Label className="text-xs" htmlFor={`m-text-${clientId}`}>Dato *</Label>
              <textarea id={`m-text-${clientId}`} rows={2} maxLength={MEMORY_MAX_CHARS} className={fieldClass} value={mText} onChange={(e) => setMText(e.target.value)} />
            </div>
            <Button size="sm" disabled={pending || !mText.trim()} onClick={addMemory}>
              Añadir a la memoria
            </Button>
          </div>
        </div>

        {discarded.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-xs text-muted-foreground">Descartados ({discarded.length})</summary>
            <ul className="mt-1 space-y-1 opacity-80">{discarded.map(memoryRow)}</ul>
          </details>
        )}
      </section>

      {msg && <p className={`text-sm ${msg.type === 'ok' ? 'text-success' : 'text-destructive'}`}>{msg.text}</p>}
    </div>
  );
}
