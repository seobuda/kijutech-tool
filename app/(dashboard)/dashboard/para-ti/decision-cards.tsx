'use client';

// Para ti: decidir aquí mismo los correos (respuesta que propone el agente) y las propuestas de los agentes. Las mismas
// acciones que la pestaña Correos y los botones de Telegram: lo que se decide aquí ya no se puede decidir allí.
// Todo lo que viene del correo se pinta como TEXTO (React lo escapa), nunca como HTML.
import Link from 'next/link';
import { Bot, Check, Mail, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/page';
import { approveEmailReplyAction, rejectEmailReplyAction } from '@/lib/operaciones/email-agent-actions';
import { decideAgentToolAction } from '@/lib/operaciones/agent-capabilities-actions';
import { approveClientMessageAction, rejectClientMessageAction } from '@/lib/core/comms-actions';
import { useState } from 'react';
import { PencilLine, Send } from 'lucide-react';
import type { InboundEmailDetail } from '@/lib/operaciones/inbound-email-actions';
import { brandBtn, MsgLine, useRun } from '../clientes/ui';
import { ReplyProposal } from '../operaciones/correos/reply-proposal';

export type EmailCard = {
  actionId: string;
  emailId: string;
  subject: string;
  who: string;
  top: boolean;
  wait: string;
  aiSummary: string;
  excerpt: string;
  proposal: NonNullable<InboundEmailDetail['pendingReply']>;
};

export function EmailDecisionCard({ c }: { c: EmailCard }) {
  const { run, pending, msg } = useRun();
  const doesWork = c.proposal.requests.length > 0 || Boolean(c.proposal.addTo);
  return (
    <article className="rounded-xl border bg-card p-4 shadow-xs" aria-labelledby={`mail-${c.actionId}`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={`mail-${c.actionId}`} className="flex items-center gap-1.5 font-medium">
            <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{c.subject}</span>
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {c.who}
            {c.top && ' · cliente Top'} · espera {c.wait}
          </p>
        </div>
        <Link href={`/dashboard/operaciones/correos?id=${c.emailId}`} className="text-sm text-brand underline-offset-2 hover:underline">
          Ver el correo completo
        </Link>
      </header>
      {c.aiSummary && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
          <Bot className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
          <span>
            <span className="font-medium">Lo que entendió el agente: </span>
            {c.aiSummary}
          </span>
        </p>
      )}
      {c.excerpt && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Texto del correo</summary>
          <p className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border px-3 py-2">{c.excerpt}</p>
        </details>
      )}
      <ReplyProposal
        proposal={c.proposal}
        disabled={pending}
        onApprove={(text, create) =>
          run(() => approveEmailReplyAction(c.actionId, text, create), create && doesWork ? `Hecho: «${c.subject}» aprobado y aplicado` : `Respuesta enviada a ${c.who}`)
        }
        onReject={() => run(() => rejectEmailReplyAction(c.actionId), `Respuesta a «${c.subject}» descartada`)}
      />
      <MsgLine msg={msg} className="mt-2" />
    </article>
  );
}

export type ToolCard = { id: string; summary: string; agent: string | null; requestedBy: string | null; wait: string };

export function ToolDecisionCard({ c }: { c: ToolCard }) {
  const { run, pending, msg } = useRun();
  // Al decidir, la página se refresca y la propuesta desaparece; si falla, se queda con el motivo.
  const short = c.summary.length > 80 ? `${c.summary.slice(0, 79)}…` : c.summary;
  const decide = (approve: boolean) => run(() => decideAgentToolAction(c.id, approve), approve ? `Hecho: ${short}` : `Descartada: ${short}`);
  return (
    <li className="space-y-3 rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge tone="info">
          <Bot className="size-3" aria-hidden />
          {c.agent ? `Agente ${c.agent.replace(/_/g, ' ')}` : 'Agente'}
        </Badge>
        {c.requestedBy && <span>lo pidió {c.requestedBy}</span>}
        <span>· espera {c.wait}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm">{c.summary}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className={brandBtn} disabled={pending} onClick={() => decide(true)}>
          <Check aria-hidden />
          Hacerlo
        </Button>
        <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={pending} onClick={() => decide(false)}>
          <X aria-hidden />
          Descartar
        </Button>
        <MsgLine msg={msg} />
      </div>
    </li>
  );
}

// Correo a un cliente que ha preparado el equipo o un agente (cimientos, 23 nov 2026): enviar, corregir o descartar.
export type MessageCard = { id: string; clientName: string; kind: string; subject: string; body: string; author: string; to: string[]; wait: string };

export function MessageDecisionCard({ c }: { c: MessageCard }) {
  const { run, pending, msg } = useRun();
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(c.subject);
  const [body, setBody] = useState(c.body);
  const changed = editing && (subject.trim() !== c.subject.trim() || body.trim() !== c.body.trim());
  return (
    <li className="space-y-3 rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge tone="info">
          <Mail className="size-3" aria-hidden />
          {c.kind}
        </Badge>
        <span className="text-sm font-medium text-foreground">{c.clientName}</span>
        <span>· lo ha preparado {c.author}</span>
        <span>· espera {c.wait}</span>
      </div>
      <p className="text-xs text-muted-foreground">Para: {c.to.join(', ')}</p>
      {editing ? (
        <div className="space-y-2">
          <label className="sr-only" htmlFor={`sub-${c.id}`}>
            Asunto
          </label>
          <input id={`sub-${c.id}`} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} />
          <label className="sr-only" htmlFor={`body-${c.id}`}>
            Texto
          </label>
          <textarea id={`body-${c.id}`} rows={8} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm" value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
      ) : (
        <div className="rounded-lg bg-muted/60 p-3 text-sm">
          <p className="font-medium">{c.subject}</p>
          <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className={brandBtn}
          disabled={pending || (editing && (!subject.trim() || !body.trim()))}
          onClick={() => run(() => approveClientMessageAction(c.id, changed ? { subject, body } : undefined), `Correo a ${c.clientName} aprobado: sale en un momento`)}
        >
          <Send aria-hidden />
          {changed ? 'Enviar mi versión' : 'Enviar'}
        </Button>
        {!editing ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setEditing(true)}>
            <PencilLine aria-hidden />
            Corregir
          </Button>
        ) : (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setEditing(false); setSubject(c.subject); setBody(c.body); }}>
            Cancelar corrección
          </Button>
        )}
        <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={pending} onClick={() => run(() => rejectClientMessageAction(c.id), `Correo a ${c.clientName} descartado`)}>
          <X aria-hidden />
          Descartar
        </Button>
        <MsgLine msg={msg} />
      </div>
    </li>
  );
}
