'use client';

// Pestaña «Correos»: los correos de clientes que han llegado, de qué cliente son y qué se ha hecho con
// cada uno. Todo lo que se pinta del correo va como TEXTO (React lo escapa): nunca como HTML.
import { useCallback, useEffect, useState, useTransition } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Building2,
  Mail,
  PencilLine,
  Send,
  Check,
  ClipboardPaste,
  EyeOff,
  Inbox,
  Paperclip,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Trash2,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge, EmptyState, Skeleton } from '@/components/ui/page';
import { cn } from '@/lib/utils';
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
import {
  approveEmailReplyAction,
  connectEmailAction,
  getEmailConnectionStatus,
  rejectEmailReplyAction
} from '@/lib/operaciones/email-agent-actions';

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
type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const statusLabel = (s: string) => INBOUND_STATUS_LABELS[s as InboundStatus] ?? s;
const statusTone = (s: string): Tone =>
  s === 'nuevo'
    ? 'success'
    : s === 'sin_cliente'
      ? 'warning'
      : s === 'error'
        ? 'danger'
        : s === 'propuesto' || s === 'interpretando'
          ? 'info'
          : 'neutral';

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={statusTone(status)} dot>
      {statusLabel(status)}
    </Badge>
  );
}

const MATCH_LABELS: Record<string, string> = {
  email: 'por su correo exacto',
  domain: 'por el dominio de su empresa',
  manual: 'asignado a mano',
  ambiguo: 'dos fichas lo reclaman',
  ninguno: 'sin reconocer'
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Fecha compacta para la bandeja: hora si es de hoy, día y mes si no.
const fmtShort = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {})
  });
};

const initialOf = (m: { fromName: string; fromAddress: string }) =>
  (m.fromName.trim() || m.fromAddress.trim() || '?').charAt(0).toUpperCase();

function MsgLine({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
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
  );
}

function AuthBadge({ auth }: { auth: string }) {
  if (auth === 'pass') {
    return (
      <Badge tone="success">
        <ShieldCheck aria-hidden />
        Remitente verificado
      </Badge>
    );
  }
  if (auth === 'fail') {
    return (
      <Badge tone="danger">
        <ShieldAlert aria-hidden />
        Autenticación fallida: podría estar suplantado
      </Badge>
    );
  }
  return (
    <Badge tone="neutral">
      <ShieldQuestion aria-hidden />
      Remitente sin verificar
    </Badge>
  );
}

// Respuesta que propone el agente: se envía tal cual, se corrige antes de enviar o se descarta.
// Nunca sale nada sin pulsar aquí o en Telegram.
function ReplyProposal({
  proposal,
  disabled,
  onApprove,
  onReject
}: {
  proposal: { actionId: string; answer: string };
  disabled: boolean;
  onApprove: (corrected?: string) => void;
  onReject: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(proposal.answer);
  const areaId = `reply-${proposal.actionId}`;
  return (
    <section className="mt-5 rounded-xl border border-brand/30 bg-brand-soft/50 p-4" aria-labelledby={`${areaId}-t`}>
      <h3 id={`${areaId}-t`} className="flex items-center gap-1.5 text-sm font-semibold text-brand">
        <Bot className="size-4" aria-hidden />
        Respuesta propuesta por el agente
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Se enviará desde el buzón del agente al remitente, en el mismo hilo y con copia oculta para ti.
      </p>
      {editing ? (
        <>
          <label htmlFor={areaId} className="sr-only">
            Respuesta corregida
          </label>
          <textarea
            id={areaId}
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="mt-3 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
        </>
      ) : (
        <p className="mt-3 whitespace-pre-wrap rounded-lg bg-card px-3 py-2.5 text-sm">{proposal.answer}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          className="bg-brand text-white hover:bg-brand/90"
          disabled={disabled || (editing && !text.trim())}
          onClick={() => onApprove(editing && text.trim() !== proposal.answer.trim() ? text : undefined)}
        >
          <Send aria-hidden />
          {editing ? 'Enviar mi versión' : 'Enviar respuesta'}
        </Button>
        {!editing ? (
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => setEditing(true)}>
            <PencilLine aria-hidden />
            Corregir
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => {
              setEditing(false);
              setText(proposal.answer);
            }}
          >
            Cancelar corrección
          </Button>
        )}
        <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={disabled} onClick={onReject}>
          Descartar
        </Button>
      </div>
    </section>
  );
}

// Estado del buzón del agente (solo administración): conectar Resend con la clave de API.
function MailboxCard() {
  const [status, setStatus] = useState<{ connected: boolean; webhook: boolean; address: string; bcc: string | null } | null>(null);
  const [key, setKey] = useState('');
  const [note, setNote] = useState<Msg>(null);
  const [busy, startBusy] = useTransition();

  const refresh = useCallback(async () => {
    const res = await getEmailConnectionStatus();
    if (res.ok) setStatus({ connected: res.connected, webhook: res.webhook, address: res.address, bcc: res.bcc });
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!status) return null; // sin permiso de administración (o cargando): no se enseña
  const ready = status.connected && status.webhook;
  return (
    <section className="rounded-xl border bg-card p-4 shadow-xs" aria-labelledby="buzon-t">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="buzon-t" className="flex items-center gap-2 text-sm font-semibold">
            <Mail className="size-4 text-brand" aria-hidden />
            Buzón del agente: <span className="font-mono text-xs">{status.address}</span>
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {ready
              ? `Conectado. Los correos que lleguen se interpretan solos y la respuesta te llega a Telegram para aprobarla${status.bcc ? `; recibes copia oculta en ${status.bcc}` : ''}.`
              : status.connected
                ? 'Clave guardada, pero falta el webhook (solo se crea en el servidor con https).'
                : 'Sin conectar. Pega la clave de API de Resend para empezar a recibir y responder.'}
          </p>
        </div>
        <Badge tone={ready ? 'success' : status.connected ? 'warning' : 'neutral'} dot>
          {ready ? 'Activo' : status.connected ? 'A medias' : 'Sin conectar'}
        </Badge>
      </div>
      {!ready && (
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setNote(null);
            startBusy(async () => {
              const res = await connectEmailAction(key);
              if (!res.ok) return setNote({ type: 'error', text: res.error });
              setKey('');
              setNote({
                type: 'ok',
                text:
                  res.webhook === 'sin_url_publica'
                    ? 'Clave guardada. El webhook se crea al conectar desde el servidor (https).'
                    : 'Buzón conectado.'
              });
              await refresh();
            });
          }}
        >
          <label htmlFor="resend-key" className="sr-only">
            Clave de API de Resend
          </label>
          <input
            id="resend-key"
            type="password"
            autoComplete="off"
            placeholder="re_…"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="h-9 min-w-[240px] flex-1 rounded-lg border border-input bg-background px-3 text-sm shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
          <Button type="submit" size="sm" className="h-9 bg-brand text-white hover:bg-brand/90" disabled={busy || !key.trim()}>
            Conectar
          </Button>
        </form>
      )}
      {note && <MsgLine msg={note} />}
    </section>
  );
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

  if (loadError) {
    return (
      <p role="alert" className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-destructive">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        No se pudieron cargar los correos: {loadError}
      </p>
    );
  }
  if (emails === null) {
    return (
      <div className="space-y-3" aria-busy="true">
        <p className="text-sm text-muted-foreground">Cargando correos…</p>
        <div className="divide-y rounded-xl border bg-card">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ----- Detalle -----
  if (detail) {
    const canAssign = ['sin_cliente', 'nuevo', 'ignorado'].includes(detail.status);
    const canIgnore = ['nuevo', 'sin_cliente', 'informativo', 'error'].includes(detail.status);
    const canReopen = ['ignorado', 'sin_cliente', 'descartado'].includes(detail.status);
    return (
      <div className="space-y-4 animate-fade-up">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground hover:text-foreground"
          onClick={() => {
            setDetail(null);
            setAskDelete(false);
            setAssignTo('');
          }}
        >
          <ArrowLeft aria-hidden />
          Volver a la lista
        </Button>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
          {/* Correo */}
          <article className="min-w-0 rounded-xl border bg-card shadow-xs" aria-labelledby="correo-asunto">
            <header className="space-y-3 border-b px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 id="correo-asunto" className="min-w-0 text-lg font-semibold tracking-tight break-words text-balance">
                  {detail.subject || '(sin asunto)'}
                </h2>
                <StatusBadge status={detail.status} />
              </div>
              <div className="flex items-start gap-3">
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand"
                  aria-hidden
                >
                  {initialOf(detail)}
                </span>
                <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                  <p className="break-words">
                    <span className="sr-only">De: </span>
                    {detail.fromName ? <span className="font-medium">{detail.fromName} </span> : null}
                    <span className="text-muted-foreground">&lt;{detail.fromAddress}&gt;</span>
                  </p>
                  {detail.toAddress && (
                    <p className="break-words text-xs text-muted-foreground">
                      Para: <span className="text-foreground/80">{detail.toAddress}</span>
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Recibido el {fmt(detail.createdAt)}
                    {detail.sentAt ? ` · enviado el ${fmt(detail.sentAt)}` : ''} · {detail.source === 'pegado' ? 'pegado a mano' : 'llegó por correo'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <AuthBadge auth={detail.authStatus} />
              </div>
            </header>

            <div className="px-4 py-4 sm:px-5">
              {detail.aiSummary && (
                <p className="mb-4 flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                  <Bot className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                  <span>
                    <span className="font-medium">Lo que entendió el agente: </span>
                    {detail.aiSummary}
                  </span>
                </p>
              )}
              <h3 className="sr-only">Texto del correo</h3>
              <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground">
                {detail.bodyText || '(sin texto)'}
              </pre>
              {detail.pendingReply && (
                <ReplyProposal
                  key={detail.pendingReply.actionId}
                  proposal={detail.pendingReply}
                  disabled={pending}
                  onApprove={(text) =>
                    run(
                      () => approveEmailReplyAction(detail.pendingReply!.actionId, text),
                      'Respuesta enviada',
                      undefined,
                      detail.id
                    )
                  }
                  onReject={() =>
                    run(() => rejectEmailReplyAction(detail.pendingReply!.actionId), 'Respuesta descartada', undefined, detail.id)
                  }
                />
              )}
              {detail.attachments.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
                  <Paperclip className="size-3.5 shrink-0" aria-hidden />
                  <span>Adjuntos (no se descargan):</span>
                  {detail.attachments.map((a, i) => (
                    <Badge key={`${a}-${i}`} tone="outline" className="max-w-full truncate">
                      {a}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </article>

          {/* Panel lateral: cliente y acciones */}
          <aside className="space-y-4">
            <section className="rounded-xl border bg-card shadow-xs" aria-labelledby="correo-cliente">
              <h3 id="correo-cliente" className="border-b px-4 py-3 text-sm font-semibold">
                Cliente
              </h3>
              <div className="space-y-3 p-4">
                {detail.clientName ? (
                  <div className="flex items-start gap-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <Building2 className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 text-sm">
                      <p className="font-medium break-words">{detail.clientName}</p>
                      <p className="text-xs text-muted-foreground">{MATCH_LABELS[detail.matchedBy] ?? detail.matchedBy}</p>
                    </div>
                  </div>
                ) : (
                  <Badge tone="warning" dot>
                    Cliente sin reconocer
                  </Badge>
                )}
                {detail.statusNote && <p className="text-sm text-muted-foreground">{detail.statusNote}</p>}
                {detail.status === 'nuevo' && (
                  <p className="rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
                    El correo está reconocido. Interpretarlo y proponer encargos llegará en el siguiente paso; por ahora queda guardado aquí.
                  </p>
                )}

                {canAssign && (
                  <div className="space-y-2.5 border-t pt-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs" htmlFor="assign-client">
                        {detail.clientName ? 'Cambiar de cliente' : 'Asignar a un cliente'}
                      </Label>
                      <select id="assign-client" className={cn(selectClass, 'w-full')} value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                        <option value="">Elige una ficha…</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 shrink-0 accent-[var(--brand)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                        checked={saveSender}
                        onChange={(e) => setSaveSender(e.target.checked)}
                      />
                      <span className="min-w-0 break-words">Recordar a {detail.fromAddress} como contacto</span>
                    </label>
                    <Button
                      size="sm"
                      className={cn(brandBtn, 'w-full')}
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
              </div>
            </section>

            {(canIgnore || canReopen || canDelete) && (
              <section className="rounded-xl border bg-card shadow-xs" aria-labelledby="correo-acciones">
                <h3 id="correo-acciones" className="border-b px-4 py-3 text-sm font-semibold">
                  Acciones
                </h3>
                <div className="flex flex-wrap items-center gap-2 p-4">
                  {canIgnore && (
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => ignoreInboundEmail(detail.id), 'Correo ignorado', undefined, detail.id)}>
                      <EyeOff aria-hidden />
                      Ignorar
                    </Button>
                  )}
                  {canReopen && (
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => reopenInboundEmail(detail.id), 'Correo reabierto', undefined, detail.id)}>
                      <RotateCcw aria-hidden />
                      Volver a considerarlo
                    </Button>
                  )}
                  {canDelete &&
                    (askDelete ? (
                      <span
                        role="group"
                        aria-label="Confirmar eliminación"
                        className="flex w-full flex-wrap items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive-soft px-2.5 py-2 text-sm text-destructive"
                      >
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
                      <Button size="sm" variant="ghost" className={dangerGhost} disabled={pending} onClick={() => setAskDelete(true)}>
                        <Trash2 aria-hidden />
                        Eliminar
                      </Button>
                    ))}
                </div>
              </section>
            )}

            <MsgLine msg={msg} />
          </aside>
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
    <div className="space-y-4 animate-fade-up">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">Correos del agente</h2>
          <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground text-pretty">
            Aquí llegan los correos de clientes y del equipo. El agente reconoce de quién es cada uno, lo resume y te propone una respuesta;
            nunca envía nada sin tu aprobación.
          </p>
        </div>
        <Button size="sm" variant="outline" className="shrink-0 self-start" aria-expanded={pasting} onClick={() => setPasting((v) => !v)}>
          {pasting ? <X aria-hidden /> : <ClipboardPaste aria-hidden />}
          {pasting ? 'Cerrar' : 'Pegar un correo'}
        </Button>
      </div>
      <MailboxCard />

      {/* Filtros por estado */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="inline-flex min-w-max items-center gap-1 rounded-lg border bg-muted/50 p-1" role="group" aria-label="Filtrar por estado">
          {chips.map((c) => {
            const active = filter === c.key;
            return (
              <button
                key={c.key || 'todos'}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(c.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  focusRing,
                  active ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:bg-card/60 hover:text-foreground'
                )}
              >
                {c.label}
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[11px] tabular-nums',
                    active ? 'bg-brand-soft text-brand' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {c.n}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {pasting && (
        <section className="space-y-3 rounded-xl border border-brand/30 bg-card p-4 shadow-sm animate-fade-up sm:p-5" aria-labelledby="pegar-titulo">
          <div>
            <h3 id="pegar-titulo" className="text-sm font-semibold">
              Pegar un correo
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Para probar el sistema o meter a mano un correo que no llegó solo. Se trata igual que uno recibido (pero sin verificar al remitente).
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="gap-1 text-xs" htmlFor="p-from">
                De <span className="text-destructive">*</span>
              </Label>
              <Input id="p-from" aria-required placeholder="Nombre <persona@empresa.com>" value={pFrom} onChange={(e) => setPFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="p-subject">Asunto</Label>
              <Input id="p-subject" value={pSubject} onChange={(e) => setPSubject(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="gap-1 text-xs" htmlFor="p-body">
              Texto del correo <span className="text-destructive">*</span>
            </Label>
            <textarea id="p-body" aria-required rows={6} className={fieldClass} value={pBody} onChange={(e) => setPBody(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              className={brandBtn}
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
        </section>
      )}

      <MsgLine msg={msg} />

      {emails.length === 0 ? (
        total === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Aún no ha llegado ningún correo."
            description={
              <>
                Cuando un cliente escriba y la regla de Gmail reenvíe una copia, aparecerá aquí. Mientras tanto puedes probarlo con «Pegar un correo».
                Recuerda dar de alta los contactos de cada cliente (Clientes → Editar → Contactos y memoria) para que se reconozcan.
              </>
            }
            action={
              !pasting ? (
                <Button size="sm" variant="outline" onClick={() => setPasting(true)}>
                  <ClipboardPaste aria-hidden />
                  Pegar un correo
                </Button>
              ) : undefined
            }
          />
        ) : (
          <EmptyState icon={Inbox} title="No hay correos con este estado." className="py-10" />
        )
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs" aria-label="Bandeja de correos" aria-busy={pending}>
          {emails.map((m) => {
            const unread = m.status === 'nuevo' || m.status === 'sin_cliente';
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => open(m.id)}
                  className={cn(
                    'group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/50 sm:px-5',
                    unread && 'bg-brand-soft/20'
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold',
                      unread ? 'bg-brand-soft text-brand' : 'bg-muted text-muted-foreground'
                    )}
                    aria-hidden
                  >
                    {initialOf(m)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className={cn('truncate text-sm', unread ? 'font-semibold' : 'font-medium')}>
                        {m.fromName || m.fromAddress}
                      </span>
                      <time dateTime={m.createdAt} title={fmt(m.createdAt)} className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {fmtShort(m.createdAt)}
                      </time>
                    </span>
                    <span className={cn('mt-0.5 block truncate text-sm', unread ? 'text-foreground' : 'text-foreground/80')}>
                      {m.subject || '(sin asunto)'}
                    </span>
                    {(m.fromName || m.statusNote) && (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {m.fromName ? m.fromAddress : ''}
                        {m.fromName && m.statusNote ? ' · ' : ''}
                        {m.statusNote}
                      </span>
                    )}
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={m.status} />
                      {m.clientName && (
                        <Badge tone="outline">
                          <Building2 aria-hidden />
                          {m.clientName}
                        </Badge>
                      )}
                      {m.authStatus === 'fail' && (
                        <Badge tone="danger">
                          <ShieldAlert aria-hidden />
                          Autenticación fallida
                        </Badge>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
