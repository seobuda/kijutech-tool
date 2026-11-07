'use client';

// Pestaña «Correos»: los correos de clientes que han llegado, de qué cliente son y qué se ha hecho con
// cada uno. Todo lo que se pinta del correo va como TEXTO (React lo escapa): nunca como HTML.
import { useCallback, useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  assignInboundEmailClient,
  deleteInboundEmail,
  getInboundEmail,
  ignoreInboundEmail,
  listInboundEmails,
  pasteInboundEmail,
  reopenInboundEmail,
  type InboundEmailDetail,
  type InboundEmailRow
} from '@/lib/operaciones/inbound-email-actions';
import { INBOUND_STATUS_LABELS, type InboundStatus } from '@/lib/operaciones/inbound-email-rules';

const fieldClass =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const selectClass = 'rounded-md border border-gray-300 bg-white px-2 py-2 text-sm';

type Msg = { type: 'ok' | 'error'; text: string } | null;
type Result = { ok: boolean; error?: string };

const statusLabel = (s: string) => INBOUND_STATUS_LABELS[s as InboundStatus] ?? s;
const statusClass = (s: string) =>
  s === 'nuevo'
    ? 'bg-green-100 text-green-800'
    : s === 'sin_cliente'
      ? 'bg-amber-100 text-amber-800'
      : s === 'error'
        ? 'bg-red-100 text-red-800'
        : 'bg-gray-100 text-gray-700';

const MATCH_LABELS: Record<string, string> = {
  email: 'por su correo exacto',
  domain: 'por el dominio de su empresa',
  manual: 'asignado a mano',
  ambiguo: 'dos fichas lo reclaman',
  ninguno: 'sin reconocer'
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function AuthBadge({ auth }: { auth: string }) {
  if (auth === 'pass') return <span className="rounded bg-green-50 px-1.5 py-0.5 text-xs text-green-700">Remitente verificado</span>;
  if (auth === 'fail') {
    return <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">⚠ Autenticación fallida: podría estar suplantado</span>;
  }
  return <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">Remitente sin verificar</span>;
}

export function CorreosView({ clients }: { clients: { id: string; name: string }[] }) {
  const [filter, setFilter] = useState<string>('');
  const [emails, setEmails] = useState<InboundEmailRow[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [canDelete, setCanDelete] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detail, setDetail] = useState<InboundEmailDetail | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const res = await listInboundEmails(filter || undefined);
    if (!res.ok) {
      setLoadError(res.error);
      return;
    }
    setLoadError(null);
    setEmails(res.emails);
    setCounts(res.counts);
    setCanDelete(res.canDelete);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = (id: string) => {
    setMsg(null);
    startTransition(async () => {
      const res = await getInboundEmail(id);
      if (!res.ok) {
        setMsg({ type: 'error', text: res.error });
        return;
      }
      setDetail(res.email);
    });
  };

  // Ejecuta una acción, muestra el resultado, recarga la lista y, si hay un correo abierto, lo refresca.
  const run = (fn: () => Promise<Result>, okText: string, after?: () => void, reopenId?: string) => {
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
      if (reopenId) {
        const d = await getInboundEmail(reopenId);
        if (d.ok) setDetail(d.email);
      }
    });
  };

  // --- Pegar un correo ---
  const [pasting, setPasting] = useState(false);
  const [pFrom, setPFrom] = useState('');
  const [pSubject, setPSubject] = useState('');
  const [pBody, setPBody] = useState('');

  // --- Asignar cliente ---
  const [assignTo, setAssignTo] = useState('');
  const [saveSender, setSaveSender] = useState(true);
  const [askDelete, setAskDelete] = useState(false);

  if (loadError) return <p className="text-sm text-red-600">No se pudieron cargar los correos: {loadError}</p>;
  if (emails === null) return <p className="text-sm text-muted-foreground">Cargando correos…</p>;

  // ----- Detalle -----
  if (detail) {
    const canAssign = ['sin_cliente', 'nuevo', 'ignorado'].includes(detail.status);
    const canIgnore = ['nuevo', 'sin_cliente', 'informativo', 'error'].includes(detail.status);
    const canReopen = ['ignorado', 'sin_cliente', 'descartado'].includes(detail.status);
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setDetail(null);
            setAskDelete(false);
            setAssignTo('');
          }}
        >
          ← Volver a la lista
        </Button>

        <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold break-words">{detail.subject || '(sin asunto)'}</h2>
            <span className={`rounded px-2 py-0.5 text-xs ${statusClass(detail.status)}`}>{statusLabel(detail.status)}</span>
          </div>
          <p className="text-sm break-words">
            <strong>De:</strong> {detail.fromName ? `${detail.fromName} ` : ''}
            <span className="text-muted-foreground">&lt;{detail.fromAddress}&gt;</span>
          </p>
          {detail.toAddress && (
            <p className="text-sm break-words">
              <strong>Para:</strong> {detail.toAddress}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Recibido el {fmt(detail.createdAt)}
            {detail.sentAt ? ` · enviado el ${fmt(detail.sentAt)}` : ''} · {detail.source === 'pegado' ? 'pegado a mano' : 'llegó por correo'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <AuthBadge auth={detail.authStatus} />
            {detail.clientName ? (
              <span className="text-sm">
                Cliente: <strong>{detail.clientName}</strong> <span className="text-xs text-muted-foreground">({MATCH_LABELS[detail.matchedBy] ?? detail.matchedBy})</span>
              </span>
            ) : (
              <span className="text-sm text-amber-700">Cliente sin reconocer</span>
            )}
          </div>
          {detail.statusNote && <p className="text-sm text-muted-foreground">{detail.statusNote}</p>}
          {detail.attachments.length > 0 && (
            <p className="text-xs text-muted-foreground">Adjuntos (no se descargan): {detail.attachments.join(', ')}</p>
          )}
          {detail.status === 'nuevo' && (
            <p className="rounded-md bg-gray-50 p-2 text-xs text-muted-foreground">
              El correo está reconocido. Interpretarlo y proponer encargos llegará en el siguiente paso; por ahora queda guardado aquí.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <Label className="mb-2 block">Texto del correo</Label>
          <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-md bg-gray-50 p-3 text-sm">
            {detail.bodyText || '(sin texto)'}
          </pre>
        </div>

        <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
          {canAssign && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="assign-client">
                  {detail.clientName ? 'Cambiar de cliente' : 'Asignar a un cliente'}
                </Label>
                <select id="assign-client" className={selectClass} value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                  <option value="">Elige una ficha…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-1 pb-2 text-sm">
                <input type="checkbox" checked={saveSender} onChange={(e) => setSaveSender(e.target.checked)} />
                Recordar a {detail.fromAddress} como contacto
              </label>
              <Button
                size="sm"
                disabled={pending || !assignTo}
                onClick={() =>
                  run(
                    () => assignInboundEmailClient({ id: detail.id, clientId: assignTo, saveSender }),
                    'Cliente asignado',
                    () => setAssignTo(''),
                    detail.id
                  )
                }
              >
                Asignar
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {canIgnore && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => ignoreInboundEmail(detail.id), 'Correo ignorado', undefined, detail.id)}>
                Ignorar
              </Button>
            )}
            {canReopen && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => reopenInboundEmail(detail.id), 'Correo reabierto', undefined, detail.id)}>
                Volver a considerarlo
              </Button>
            )}
            {canDelete &&
              (askDelete ? (
                <span className="flex items-center gap-1 text-sm">
                  ¿Eliminar este correo? No se puede deshacer.
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={pending}
                    onClick={() =>
                      run(() => deleteInboundEmail(detail.id), 'Correo eliminado', () => {
                        setDetail(null);
                        setAskDelete(false);
                      })
                    }
                  >
                    Sí, eliminar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAskDelete(false)}>
                    No
                  </Button>
                </span>
              ) : (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => setAskDelete(true)}>
                  Eliminar
                </Button>
              ))}
          </div>
          {msg && <p className={`text-sm ${msg.type === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
        </div>
      </div>
    );
  }

  // ----- Lista -----
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const chips: { key: string; label: string; n: number }[] = [
    { key: '', label: 'Todos', n: total },
    ...(['nuevo', 'sin_cliente', 'ignorado', 'informativo', 'interpretando', 'propuesto', 'aprobado', 'descartado', 'error'] as const)
      .filter((s) => (counts[s] ?? 0) > 0 || s === filter || s === 'nuevo' || s === 'sin_cliente' || s === 'ignorado')
      .map((s) => ({ key: s, label: statusLabel(s), n: counts[s] ?? 0 }))
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Correos de clientes</h2>
        <p className="text-sm text-muted-foreground">
          Aquí llegan los correos de tus clientes y se reconoce de quién es cada uno. Un correo nunca crea nada por sí solo: es un dato que
          una persona revisa.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <button
            key={c.key || 'todos'}
            type="button"
            onClick={() => setFilter(c.key)}
            className={`rounded-full border px-3 py-1 text-xs ${
              filter === c.key ? 'border-orange-500 bg-orange-50 text-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {c.label} ({c.n})
          </button>
        ))}
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => setPasting((v) => !v)}>
          {pasting ? 'Cerrar' : 'Pegar un correo'}
        </Button>
      </div>

      {pasting && (
        <div className="space-y-2 rounded-lg border border-orange-200 bg-orange-50/40 p-3">
          <p className="text-xs text-muted-foreground">
            Para probar el sistema o meter a mano un correo que no llegó solo. Se trata igual que uno recibido (pero sin verificar al remitente).
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="p-from">De *</Label>
              <Input id="p-from" placeholder="Nombre <persona@empresa.com>" value={pFrom} onChange={(e) => setPFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="p-subject">Asunto</Label>
              <Input id="p-subject" value={pSubject} onChange={(e) => setPSubject(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="p-body">Texto del correo *</Label>
            <textarea id="p-body" rows={6} className={fieldClass} value={pBody} onChange={(e) => setPBody(e.target.value)} />
          </div>
          <Button
            size="sm"
            disabled={pending || !pFrom.trim() || !pBody.trim()}
            onClick={() =>
              run(() => pasteInboundEmail({ from: pFrom, subject: pSubject, body: pBody }), 'Correo guardado', () => {
                setPFrom('');
                setPSubject('');
                setPBody('');
                setPasting(false);
              })
            }
          >
            Guardar correo
          </Button>
        </div>
      )}

      {msg && <p className={`text-sm ${msg.type === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}

      {emails.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-muted-foreground">
          {total === 0 ? (
            <>
              <p className="font-medium text-gray-700">Aún no ha llegado ningún correo.</p>
              <p className="mt-1">
                Cuando un cliente escriba y la regla de Gmail reenvíe una copia, aparecerá aquí. Mientras tanto puedes probarlo con «Pegar un correo».
                Recuerda dar de alta los contactos de cada cliente (Clientes → Editar → Contactos y memoria) para que se reconozcan.
              </p>
            </>
          ) : (
            <p>No hay correos con este estado.</p>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
          {emails.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => open(m.id)}
                className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.subject || '(sin asunto)'}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.fromName ? `${m.fromName} · ` : ''}
                    {m.fromAddress}
                    {m.clientName ? ` · ${m.clientName}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${statusClass(m.status)}`}>{statusLabel(m.status)}</span>
                  <span className="text-xs text-muted-foreground">{fmt(m.createdAt)}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
