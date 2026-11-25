'use client';

// Ficha del cliente → Preguntas (25 nov 2026). Todo lo de preguntar al cliente en un solo sitio, de arriba abajo:
//   1. A quién le llegan y de qué servicios salen (con el arreglo a mano si falta algo: marcar el contacto aquí mismo).
//   2. Lo que está en marcha: el correo que espera aprobación (aprobar, corregir o descartar aquí) y el cuestionario activo.
//   3. Por preguntar: agrupadas por servicio, se eligen, se editan o se quitan, y «Preparar envío» (correo o cuestionario).
//   4. Enviadas sin respuesta, respondidas (con su cita y a dónde fueron) y las que no aplican.
// El banco (las preguntas de cada servicio para todos los clientes) se edita en Clientes → Banco de preguntas.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, Clock, ExternalLink, Link2, ListChecks, Mail, MessageCircleQuestion, Pencil, Plus, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import type { ClientQuestionsView, ClientQuestionView } from '@/lib/core/questions';
import { EMAIL_MAX_QUESTIONS, ensureLink, fillTemplate, joinLabels, numberedList, suggestedDelivery, type Delivery } from '@/lib/core/questions-rules';
import { needsApproval } from '@/lib/core/comms-rules';
import {
  addLooseQuestionAction,
  addQuestionsRecipientAction,
  answerManuallyAction,
  cancelQuestionnaireAction,
  editClientQuestionAction,
  prepareQuestionsSendAction,
  setQuestionStatusAction,
  applyAnswerToFichaAction
} from '@/lib/core/questions-actions';
import { approveClientMessageAction, rejectClientMessageAction } from '@/lib/core/comms-actions';
import { areaClass, brandBtn, checkClass, fieldHint, MsgLine, selectClass, useRun } from '../ui';
import { EMPTY_DRAFT, ProposeBox, QuestionFields, targetLabel, type QuestionDraft } from '../preguntas-ui';

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const VIA: Record<string, string> = { correo: 'por correo', cuestionario: 'en el cuestionario', manual: 'apuntada a mano' };

type Props = {
  view: ClientQuestionsView;
  isAdmin: boolean;
  comms: { approval: string; tenantDefault: string };
  go: (tab: 'contactos' | 'operaciones') => void;
};

/** Grupo de una pregunta: General, su servicio, «datos que faltan» (de un módulo) o «solo para este cliente». */
function groupOf(q: ClientQuestionView, labels: Map<string, string>): string {
  if (q.origin === 'suelta') return 'Solo para este cliente';
  if (q.origin === 'dato') return `Datos que faltan${q.serviceKey ? ` (${labels.get(q.serviceKey) ?? q.serviceKey})` : ''}`;
  return q.serviceKey ? labels.get(q.serviceKey) ?? q.serviceKey : 'General';
}

function grouped(list: ClientQuestionView[], labels: Map<string, string>): [string, ClientQuestionView[]][] {
  const m = new Map<string, ClientQuestionView[]>();
  for (const q of list) {
    const g = groupOf(q, labels);
    m.set(g, [...(m.get(g) ?? []), q]);
  }
  return [...m.entries()];
}

export function PreguntasTab({ view, isAdmin, comms, go }: Props) {
  const labels = useMemo(() => new Map(view.services.map((s) => [s.key, s.label])), [view.services]);
  const byStatus = (s: string) => view.questions.filter((q) => q.status === s);
  const pending = byStatus('pendiente');
  // Las que van en el correo que espera aprobación aún no han salido: se enseñan aparte.
  const waitingId = view.pendingMessage?.id ?? null;
  const waiting = byStatus('enviada').filter((q) => waitingId && q.messageId === waitingId);
  const sent = byStatus('enviada').filter((q) => !(waitingId && q.messageId === waitingId));
  const answered = byStatus('respondida').sort((a, b) => (b.answeredAt ?? '').localeCompare(a.answeredAt ?? ''));
  const notApplicable = byStatus('no_aplica');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(pending.map((q) => q.id)));
  const [preparing, setPreparing] = useState(false);
  const [adding, setAdding] = useState<null | 'manual' | 'ia'>(null);
  const { run, pending: busy, msg } = useRun();
  const approval = needsApproval(comms.tenantDefault, comms.approval);
  // Las nuevas que aparezcan (p. ej. tras añadir una) entran marcadas.
  const pendingIds = pending.map((q) => q.id).join(',');
  const [seen, setSeen] = useState(pendingIds);
  if (seen !== pendingIds) {
    const prev = new Set(seen.split(','));
    const next = new Set([...selected].filter((id) => pending.some((q) => q.id === id)));
    for (const q of pending) if (!prev.has(q.id)) next.add(q.id);
    setSelected(next);
    setSeen(pendingIds);
  }
  const chosen = pending.filter((q) => selected.has(q.id));
  const canSend = view.recipients.length > 0 && !view.pendingMessage;

  return (
    <div className="space-y-4">
      <Header view={view} labels={labels} go={go} isAdmin={isAdmin} />
      <MsgLine msg={msg} />

      {view.pendingMessage && <PendingApproval message={view.pendingMessage} isAdmin={isAdmin} count={waiting.length} withLink={Boolean(view.questionnaire && view.questionnaire.messageId === waitingId)} />}
      {view.questionnaire && view.questionnaire.messageId !== waitingId && <ActiveQuestionnaire clientId={view.clientId} qn={view.questionnaire} />}

      {/* Por preguntar */}
      <section id="por-preguntar" className="scroll-mt-4 rounded-xl border bg-card shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold">Por preguntar ({pending.length})</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Marca las que quieras enviar. Hasta {EMAIL_MAX_QUESTIONS} van en un correo corto; con más, el cliente recibe un enlace a un cuestionario en línea.
            </p>
          </div>
          {pending.length > 0 && pending.length <= 5 && !preparing && (
            <Button size="sm" className={brandBtn} disabled={busy || !chosen.length || !canSend} onClick={() => setPreparing(true)} title={!canSend ? (view.pendingMessage ? 'Primero aprueba o descarta el correo que está esperando' : 'Nadie recibe las preguntas de este cliente') : undefined}>
              <Send aria-hidden />
              Preparar envío ({chosen.length})
            </Button>
          )}
        </div>
        <div className="space-y-4 p-5">
          {preparing && (
            <PrepareSend
              view={view}
              chosen={chosen}
              labels={labels}
              approval={approval}
              onDone={() => setPreparing(false)}
            />
          )}
          {!pending.length && (
            <p className="text-sm text-muted-foreground">
              No queda nada por preguntar. Las preguntas salen solas de los servicios que le hacemos; también puedes añadir una solo para este cliente.
            </p>
          )}
          {grouped(pending, labels).map(([g, list]) => (
            <div key={g} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g}</h3>
                {!preparing && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      const all = list.every((q) => selected.has(q.id));
                      const next = new Set(selected);
                      for (const q of list) if (all) next.delete(q.id);
                      else next.add(q.id);
                      setSelected(next);
                    }}
                  >
                    {list.every((q) => selected.has(q.id)) ? 'Desmarcar todas' : 'Marcar todas'}
                  </button>
                )}
              </div>
              <ul className="divide-y rounded-lg border">
                {list.map((q) => (
                  <PendingRow
                    key={q.id}
                    q={q}
                    checked={selected.has(q.id)}
                    locked={preparing}
                    onToggle={(v) => {
                      const next = new Set(selected);
                      if (v) next.add(q.id);
                      else next.delete(q.id);
                      setSelected(next);
                    }}
                  />
                ))}
              </ul>
            </div>
          ))}
          {!preparing && (
            <div className="space-y-3 border-t pt-4">
              {adding === null && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setAdding('manual')}>
                    <Plus aria-hidden />
                    Añadir pregunta solo para este cliente
                  </Button>
                  <Button size="sm" variant="outline" className="border-brand/40 text-brand hover:bg-brand-soft hover:text-brand" onClick={() => setAdding('ia')}>
                    <Sparkles aria-hidden />
                    Proponer con IA
                  </Button>
                </div>
              )}
              {adding === 'manual' && <AddLoose clientId={view.clientId} onClose={() => setAdding(null)} />}
              {adding === 'ia' && (
                <ProposeBox
                  serviceKey={null}
                  clientId={view.clientId}
                  placeholder="Ej.: todo lo que necesitamos para configurar su primera campaña de Google Ads"
                  onClose={() => setAdding(null)}
                  onAdd={async (items) => {
                    for (const it of items) {
                      const r = await addLooseQuestionAction(view.clientId, { text: it.text, help: it.help, answerType: it.answerType, target: it.target });
                      if (!r.ok) return r;
                    }
                    run(async () => ({ ok: true }), `${items.length} ${items.length === 1 ? 'pregunta añadida' : 'preguntas añadidas'}.`);
                    return { ok: true };
                  }}
                />
              )}
            </div>
          )}
        </div>
        {/* Con muchas preguntas, el botón de enviar se queda a la vista abajo. */}
        {!preparing && pending.length > 5 && (
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-b-xl border-t bg-card/95 px-5 py-3 backdrop-blur">
            <span className="text-sm text-muted-foreground">
              {chosen.length} de {pending.length} marcadas · irán por {suggestedDelivery(chosen.length) === 'cuestionario' ? 'cuestionario en línea' : 'correo'}
            </span>
            <Button size="sm" className={brandBtn} disabled={busy || !chosen.length || !canSend} onClick={() => { setPreparing(true); document.getElementById('por-preguntar')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
              <Send aria-hidden />
              Preparar envío ({chosen.length})
            </Button>
          </div>
        )}
      </section>

      {waiting.length > 0 && (
        <Collapsible title={`Preparadas, esperando aprobación (${waiting.length})`} icon={Mail}>
          <p className="mb-2 text-sm text-muted-foreground">Aún no han salido. Si se descarta el correo, vuelven a «por preguntar».</p>
          <ul className="divide-y rounded-lg border">
            {waiting.map((q) => (
              <li key={q.id} className="px-3 py-2 text-sm">
                {q.text}
              </li>
            ))}
          </ul>
        </Collapsible>
      )}

      {sent.length > 0 && (
        <Collapsible title={`Enviadas, esperando respuesta (${sent.length})`} icon={Clock} open>
          <ul className="divide-y rounded-lg border">
            {sent.map((q) => (
              <SentRow key={q.id} q={q} />
            ))}
          </ul>
        </Collapsible>
      )}

      {answered.length > 0 && (
        <Collapsible title={`Respondidas (${answered.length})`} icon={ListChecks} open={answered.length <= 12}>
          <ul className="divide-y rounded-lg border">
            {answered.map((q) => (
              <AnsweredRow key={q.id} q={q} />
            ))}
          </ul>
        </Collapsible>
      )}

      {notApplicable.length > 0 && (
        <Collapsible title={`No aplican a este cliente (${notApplicable.length})`} icon={X}>
          <ul className="divide-y rounded-lg border">
            {notApplicable.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{q.text}</span>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => setQuestionStatusAction(q.id, 'pendiente'), 'Vuelve a «por preguntar».')}>
                  <RotateCcw aria-hidden />
                  Recuperar
                </Button>
              </li>
            ))}
          </ul>
        </Collapsible>
      )}
    </div>
  );
}

// --- Cabecera: servicios y destinatarios ----------------------------------------------------------------------------

function Header({ view, labels, go, isAdmin }: { view: ClientQuestionsView; labels: Map<string, string>; go: Props['go']; isAdmin: boolean }) {
  const [contact, setContact] = useState(view.candidates[0]?.id ?? '');
  const { run, pending } = useRun();
  const svc = view.clientServices.map((k) => labels.get(k) ?? k);
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border bg-card text-brand">
            <MessageCircleQuestion className="size-4.5" aria-hidden />
          </span>
          <div className="min-w-0 space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Se le pregunta lo de: </span>
              <strong>{['General', ...svc].join(' · ')}</strong>{' '}
              <button type="button" className="text-brand hover:underline" onClick={() => go('operaciones')}>
                Cambiar servicios
              </button>
            </p>
            {!svc.length && <p className={fieldHint}>No tiene servicios marcados: solo salen las preguntas generales y los datos que le falten a algún departamento.</p>}
            {view.recipients.length > 0 ? (
              <p>
                <span className="text-muted-foreground">Las recibe: </span>
                {view.recipients.map((r) => `${r.name} <${r.email}>`).join(', ')}{' '}
                <button type="button" className="text-brand hover:underline" onClick={() => go('contactos')}>
                  Cambiar
                </button>
              </p>
            ) : null}
          </div>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/clientes/preguntas">
            {isAdmin ? <Pencil aria-hidden /> : <ExternalLink aria-hidden />}
            {isAdmin ? 'Editar el banco de preguntas' : 'Ver el banco de preguntas'}
          </Link>
        </Button>
      </div>
      {view.recipients.length === 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm">
          <span className="font-medium">Nadie recibe las preguntas de este cliente.</span>
          {view.candidates.length > 0 ? (
            <>
              <select aria-label="Contacto que recibirá las preguntas" className={selectClass} value={contact} onChange={(e) => setContact(e.target.value)}>
                {view.candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.email})
                  </option>
                ))}
              </select>
              <Button size="sm" className={brandBtn} disabled={pending || !contact} onClick={() => run(() => addQuestionsRecipientAction(view.clientId, contact), 'Ese contacto recibirá las preguntas.')}>
                <Check aria-hidden />
                Que las reciba
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => go('contactos')}>
              Añadir un contacto con correo
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// --- Lo que está en marcha ----------------------------------------------------------------------------------------

function PendingApproval({ message, isAdmin, count, withLink }: { message: NonNullable<ClientQuestionsView['pendingMessage']>; isAdmin: boolean; count: number; withLink: boolean }) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(message.subject);
  const [body, setBody] = useState(message.body);
  const { run, pending, msg } = useRun();
  return (
    <div className="space-y-3 rounded-xl border border-warning/40 bg-warning-soft p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-sm">
          <p className="font-medium">
            <Mail className="mr-1.5 inline size-4" aria-hidden />
            Correo de preguntas esperando aprobación
          </p>
          <p className="text-foreground/80">
            «{message.subject}» para {message.to.join(', ') || '—'} · preparado el {fmtDate(message.createdAt)}
          </p>
          <p className="text-foreground/80">
            {count} {count === 1 ? 'pregunta' : 'preguntas'}
            {withLink ? ' en un cuestionario en línea: el enlace le llega al aprobar el correo (y funciona 30 días).' : ' en el correo.'} No sale nada hasta que se apruebe.
          </p>
        </div>
        {isAdmin ? (
          <div className="flex flex-wrap gap-2">
            {!editing && (
              <Button size="sm" className={brandBtn} disabled={pending} onClick={() => run(() => approveClientMessageAction(message.id), 'Aprobado: sale ahora.')}>
                <Send aria-hidden />
                Aprobar y enviar
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
              <Pencil aria-hidden />
              {editing ? 'Cerrar' : 'Revisar el texto'}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => rejectClientMessageAction(message.id, 'Descartado desde la ficha (Preguntas)'), 'Descartado: las preguntas vuelven a «por preguntar».')}>
              Descartar
            </Button>
          </div>
        ) : (
          <p className={fieldHint}>Lo aprueba un administrador (en Para ti o por Telegram).</p>
        )}
      </div>
      {editing && (
        <div className="space-y-2">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Asunto" />
          <textarea className={areaClass} rows={12} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Texto del correo" />
          <Button size="sm" className={brandBtn} disabled={pending} onClick={() => run(() => approveClientMessageAction(message.id, { subject, body }), 'Corregido y aprobado: sale ahora.')}>
            <Send aria-hidden />
            Aprobar con estos cambios
          </Button>
        </div>
      )}
      <MsgLine msg={msg} />
    </div>
  );
}

function ActiveQuestionnaire({ clientId, qn }: { clientId: string; qn: NonNullable<ClientQuestionsView['questionnaire']> }) {
  const { run, pending, msg } = useRun();
  const [asking, setAsking] = useState(false);
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-info/30 bg-info-soft p-4 text-sm">
      <div className="space-y-0.5">
        <p className="font-medium">
          <Link2 className="mr-1.5 inline size-4" aria-hidden />
          Cuestionario en línea enviado el {fmtDate(qn.createdAt)}
        </p>
        <p className="text-foreground/80">
          {qn.answered} de {qn.total} respondidas{qn.drafts ? ` · ${qn.drafts} a medias (aún no ha pulsado «Enviar»)` : ''} ·{' '}
          {qn.lastSeenAt ? `lo abrió por última vez el ${fmtDate(qn.lastSeenAt)}` : 'aún no lo ha abierto'} · el enlace funciona hasta el {fmtDate(qn.expiresAt)}
        </p>
        <MsgLine msg={msg} />
      </div>
      {asking ? (
        <span className="flex flex-wrap items-center gap-1.5">
          ¿Anularlo? Lo ya escrito se guarda; lo demás vuelve a «por preguntar».
          <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(() => cancelQuestionnaireAction(clientId, qn.id), 'Cuestionario anulado.')}>
            Sí, anular
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
            No
          </Button>
        </span>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setAsking(true)}>
          Anular el enlace
        </Button>
      )}
    </div>
  );
}

// --- Preparar el envío -----------------------------------------------------------------------------------------------

function PrepareSend({ view, chosen, labels, approval, onDone }: { view: ClientQuestionsView; chosen: ClientQuestionView[]; labels: Map<string, string>; approval: boolean; onDone: () => void }) {
  const suggested = suggestedDelivery(chosen.length);
  const render = (d: Delivery) => {
    const tpl = view.templates[d === 'cuestionario' ? 'preguntas_cuestionario' : 'preguntas_correo'];
    const services = [...new Set(chosen.map((q) => q.serviceKey).filter((k): k is string => Boolean(k)))].map((k) => labels.get(k) ?? k);
    const vars = { cliente: view.clientName, n: String(chosen.length), preguntas: numberedList(chosen.map((q) => q.text)), servicios: joinLabels(services) || 'nuestro trabajo' };
    return { subject: fillTemplate(tpl.subject, vars), body: fillTemplate(d === 'cuestionario' ? ensureLink(tpl.body) : tpl.body, vars) };
  };
  const [delivery, setDelivery] = useState<Delivery>(suggested);
  const [text, setText] = useState(() => render(suggested));
  const { run, pending, msg } = useRun();
  const change = (d: Delivery) => {
    setDelivery(d);
    setText(render(d));
  };
  return (
    <div className="space-y-3 rounded-xl border border-brand/30 bg-brand-soft/30 p-4">
      <p className="text-sm font-medium">Preparar el envío de {chosen.length} {chosen.length === 1 ? 'pregunta' : 'preguntas'}</p>
      <div role="radiogroup" aria-label="Cómo se envían" className="grid gap-2 sm:grid-cols-2">
        {(['correo', 'cuestionario'] as Delivery[]).map((d) => (
          <label key={d} className={cn('flex cursor-pointer gap-2.5 rounded-lg border bg-card p-3 text-sm', delivery === d ? 'border-brand ring-1 ring-brand/30' : '')}>
            <input type="radio" name="delivery" className="mt-0.5 accent-[var(--brand)]" checked={delivery === d} onChange={() => change(d)} />
            <span>
              <span className="font-medium">
                {d === 'correo' ? 'Correo con las preguntas' : 'Cuestionario en línea'}
                {d === suggested && <Badge tone="brand" className="ml-1.5">Recomendado</Badge>}
              </span>
              <span className="block text-xs text-muted-foreground">
                {d === 'correo' ? 'El cliente contesta al correo y la IA lee cada respuesta.' : `Recibe un enlace privado (30 días) y responde a su ritmo; lo que escribe se guarda solo.`}
              </span>
            </span>
          </label>
        ))}
      </div>
      <div className="space-y-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Asunto</span>
          <Input value={text.subject} onChange={(e) => setText({ ...text, subject: e.target.value })} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Texto</span>
          <textarea className={areaClass} rows={Math.min(22, 8 + (delivery === 'correo' ? chosen.length : 0))} value={text.body} onChange={(e) => setText({ ...text, body: e.target.value })} />
          <span className={fieldHint}>
            {delivery === 'cuestionario' ? '{enlace} y {caduca} se rellenan al preparar el envío. ' : ''}
            Puedes cambiar lo que quieras solo para este correo. El texto de siempre se edita en el banco de preguntas (Textos de los correos).
          </span>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className={brandBtn}
          disabled={pending}
          onClick={() =>
            run(
              () => prepareQuestionsSendAction(view.clientId, { ids: chosen.map((q) => q.id), delivery, subject: text.subject, body: text.body }),
              approval ? 'Preparado: espera tu aprobación (aquí arriba, en Para ti o por Telegram).' : 'Preparado: sale ahora.',
              onDone
            )
          }
        >
          <Send aria-hidden />
          {approval ? 'Preparar para aprobar' : 'Enviar'}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={onDone}>
          Cancelar
        </Button>
        <span className={fieldHint}>{approval ? 'No sale hasta que se apruebe.' : 'Este cliente no pide aprobación: sale directamente.'}</span>
      </div>
      <MsgLine msg={msg} />
    </div>
  );
}

// --- Filas ------------------------------------------------------------------------------------------------------------

function PendingRow({ q, checked, locked, onToggle }: { q: ClientQuestionView; checked: boolean; locked: boolean; onToggle: (v: boolean) => void }) {
  const [mode, setMode] = useState<null | 'edit' | 'answer'>(null);
  const [text, setText] = useState(q.text);
  const [help, setHelp] = useState(q.help ?? '');
  const [answer, setAnswer] = useState('');
  const { run, pending, msg } = useRun();
  return (
    <li className={cn('space-y-2 px-3 py-2.5 text-sm', !checked && !mode && 'opacity-75')}>
      <div className="flex items-start gap-2.5">
        <input type="checkbox" aria-label="Incluir en el envío" className={cn(checkClass, 'mt-0.5')} checked={checked} disabled={locked} onChange={(e) => onToggle(e.target.checked)} />
        <div className="min-w-0 flex-1">
          <p>{q.text}</p>
          <p className="text-xs text-muted-foreground">
            {q.help ? `${q.help} ` : ''}
            <span className="text-muted-foreground/70">→ {targetLabel(q.target)}</span>
            {q.customText && q.origin !== 'suelta' && <span className="ml-1.5 text-info">· texto cambiado para este cliente</span>}
          </p>
        </div>
        {!locked && !mode && (
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => setMode('answer')} title="Ya sabemos la respuesta (p. ej. nos lo dijo por teléfono): apúntala y no se le pregunta">
              Ya lo sé
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode('edit')} title="Cambiar el texto solo para este cliente">
              <Pencil aria-hidden />
              <span className="sr-only">Editar</span>
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setQuestionStatusAction(q.id, 'no_aplica'), q.origin === 'suelta' ? 'Pregunta quitada.' : 'Quitada: no se le preguntará a este cliente.')} title="No aplica a este cliente: no se le pregunta">
              No aplica
            </Button>
          </div>
        )}
      </div>
      {mode === 'edit' && (
        <div className="space-y-2 pl-6">
          <textarea className={areaClass} rows={2} value={text} onChange={(e) => setText(e.target.value)} aria-label="Pregunta" />
          <Input value={help} onChange={(e) => setHelp(e.target.value)} placeholder="Para qué la preguntamos (opcional)" aria-label="Para qué la preguntamos" />
          <div className="flex gap-2">
            <Button size="sm" className={brandBtn} disabled={pending} onClick={() => run(() => editClientQuestionAction(q.id, text, help || null), 'Pregunta cambiada para este cliente.', () => setMode(null))}>
              Guardar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {mode === 'answer' && (
        <div className="space-y-2 pl-6">
          <textarea className={areaClass} rows={2} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={q.answerType === 'lista' ? 'Un elemento por línea' : 'Lo que nos dijo'} aria-label="Respuesta" />
          <div className="flex gap-2">
            <Button size="sm" className={brandBtn} disabled={pending || !answer.trim()} onClick={() => run(() => answerManuallyAction(q.id, answer), 'Respuesta guardada.', () => setMode(null))}>
              Guardar la respuesta
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      <MsgLine msg={msg} />
    </li>
  );
}

function SentRow({ q }: { q: ClientQuestionView }) {
  const [answering, setAnswering] = useState(false);
  const [answer, setAnswer] = useState(q.draft ?? '');
  const { run, pending, msg } = useRun();
  return (
    <li className="space-y-2 px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p>{q.text}</p>
          <p className="text-xs text-muted-foreground">
            Enviada {q.via ? VIA[q.via] : ''} el {fmtDate(q.askedAt)}
            {q.draft ? ` · el cliente ha empezado a responder: «${q.draft.slice(0, 120)}${q.draft.length > 120 ? '…' : ''}»` : ''}
          </p>
        </div>
        {!answering && (
          <div className="flex shrink-0 gap-1">
            <Button size="sm" variant="ghost" onClick={() => setAnswering(true)}>
              Responder a mano
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setQuestionStatusAction(q.id, 'pendiente'), 'Vuelve a «por preguntar».')}>
              <RotateCcw aria-hidden />
              Volver a preguntar
            </Button>
          </div>
        )}
      </div>
      {answering && (
        <div className="space-y-2">
          <textarea className={areaClass} rows={2} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Lo que contestó" aria-label="Respuesta" />
          <div className="flex gap-2">
            <Button size="sm" className={brandBtn} disabled={pending || !answer.trim()} onClick={() => run(() => answerManuallyAction(q.id, answer), 'Respuesta guardada.', () => setAnswering(false))}>
              Guardar la respuesta
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAnswering(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      <MsgLine msg={msg} />
    </li>
  );
}

function AnsweredRow({ q }: { q: ClientQuestionView }) {
  const { run, pending, msg } = useRun();
  const showQuote = q.answeredVia === 'correo' && q.answerQuote && q.answerQuote !== q.answerText;
  return (
    <li className="space-y-1 px-3 py-2.5 text-sm">
      <p className="text-muted-foreground">{q.text}</p>
      <p className="font-medium whitespace-pre-line">{q.answerText}</p>
      {showQuote && <p className="text-xs italic text-muted-foreground">Dijo: «{q.answerQuote}»</p>}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>
          {q.answeredVia ? VIA[q.answeredVia] : ''} · {fmtDate(q.answeredAt)}
          {q.answeredBy ? ` · ${q.answeredBy}` : ''}
        </span>
        {q.applied === 'aplicada' && <Badge tone="success">Guardada en {targetLabel(q.target)}</Badge>}
        {q.applied === 'distinta' && (
          <span className="inline-flex flex-wrap items-center gap-1.5 rounded-md bg-warning-soft px-2 py-0.5 text-warning-strong">
            En la ficha pone otra cosa{q.fichaNow ? `: «${q.fichaNow.slice(0, 80)}${q.fichaNow.length > 80 ? '…' : ''}»` : ''}
            <button type="button" className="font-medium underline underline-offset-2" disabled={pending} onClick={() => run(() => applyAnswerToFichaAction(q.id), 'Ficha actualizada con la respuesta.')}>
              Usar esta respuesta
            </button>
          </span>
        )}
        <button type="button" className="ml-auto inline-flex items-center gap-1 hover:text-foreground" disabled={pending} onClick={() => run(() => setQuestionStatusAction(q.id, 'pendiente'), 'Se le volverá a preguntar.')}>
          <RotateCcw className="size-3" aria-hidden />
          Volver a preguntar
        </button>
      </div>
      <MsgLine msg={msg} />
    </li>
  );
}

function AddLoose({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const [draft, setDraft] = useState<QuestionDraft>(EMPTY_DRAFT);
  const { run, pending, msg } = useRun();
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <p className="text-sm font-medium">Pregunta solo para este cliente</p>
      <QuestionFields value={draft} onChange={setDraft} />
      <div className="flex gap-2">
        <Button size="sm" className={brandBtn} disabled={pending || draft.text.trim().length < 5} onClick={() => run(() => addLooseQuestionAction(clientId, { text: draft.text, help: draft.help || null, answerType: draft.answerType, target: draft.target }), 'Pregunta añadida.', onClose)}>
          Añadir
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
      </div>
      <p className={fieldHint}>Si es una pregunta que querrás hacer a todos los clientes de un servicio, mejor añádela al banco de preguntas.</p>
      <MsgLine msg={msg} />
    </div>
  );
}

function Collapsible({ title, icon: Icon, open, children }: { title: string; icon: typeof Clock; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group rounded-xl border bg-card shadow-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
        <Icon className="size-4 text-muted-foreground" aria-hidden />
        {title}
        <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="px-5 pb-5">{children}</div>
    </details>
  );
}
