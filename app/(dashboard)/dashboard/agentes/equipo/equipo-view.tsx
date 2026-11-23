'use client';

// Dudas del equipo: interruptor y ajustes del jefe de Operaciones, y la lista de dudas con su fuente, coste y estado.
// Lo pendiente (aprobar una respuesta de IA general o una duda escalada) se decide aquí o por Telegram.
import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, MessageSquareReply, Send, Trash2, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import type { TeamSettings } from '@/lib/agentes/team';
import { answerQuestionAction, approveQuestionAction, discardQuestionAction, saveTeamSettingsAction } from '@/lib/agentes/team-actions';
import { areaClass, brandBtn, MsgLine, selectClass, useRun } from '../../clientes/ui';
import type { QuestionRow } from './rows';

const STATUS: Record<string, { label: string; tone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' }> = {
  respondida: { label: 'Respondida (esperando si le sirve)', tone: 'info' },
  pendiente_aprobacion: { label: 'Para que la apruebes', tone: 'brand' },
  escalada: { label: 'Escalada a ti', tone: 'warning' },
  resuelta: { label: 'Resuelta', tone: 'success' },
  cerrada: { label: 'Le sirvió', tone: 'success' },
  descartada: { label: 'Descartada', tone: 'neutral' }
};
const TIER: Record<string, string> = { ficha: '📒 Ficha y encargos', base: '📚 Base de conocimiento', casos: '🔁 Casos anteriores', general: '💡 IA general', enric: '💬 Tú' };
const REASON: Record<string, string> = { tema_sensible: 'tema que decides tú', sin_respuesta: 'sin respuesta', no_sirve: 'no le sirvió', pide_enric: 'pidió que lo vieras tú', intentos: 'varias preguntas sin resolver' };
const fmt = (iso: string) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const plain = (html: string) => html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export function EquipoView({ active, model, settings, rows, filter }: { active: boolean; model: string; settings: TeamSettings; rows: QuestionRow[]; filter: string }) {
  return (
    <div className="space-y-5">
      <SettingsPanel active={active} model={model} settings={settings} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href="/dashboard/agentes/equipo" className={cn('rounded-md px-2.5 py-1', filter === 'abiertas' ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground')}>
          Abiertas
        </Link>
        <Link href="/dashboard/agentes/equipo?estado=todas" className={cn('rounded-md px-2.5 py-1', filter === 'todas' ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground')}>
          Todas
        </Link>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={filter === 'abiertas' ? 'No hay dudas abiertas' : 'Todavía no hay dudas del equipo'}
          description={active ? 'Cuando alguien del equipo escriba al bot por su chat, su duda aparecerá aquí con la respuesta del jefe.' : 'El jefe de operaciones está apagado: enciéndelo arriba cuando quieras que conteste al equipo.'}
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((q) => (
            <QuestionCard key={q.id} q={q} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SettingsPanel({ active, model, settings }: { active: boolean; model: string; settings: TeamSettings }) {
  const [on, setOn] = useState(active);
  const [s, setS] = useState(settings);
  const { run, pending, msg } = useRun();
  const dirty = on !== active || JSON.stringify(s) !== JSON.stringify(settings);
  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 shadow-xs" aria-labelledby="h-jefe">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="h-jefe" className="text-sm font-semibold">
            Jefe de operaciones {model && <span className="font-normal text-muted-foreground">· {model}</span>}
          </h2>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground text-pretty">
            Contesta las dudas del equipo por su chat de siempre (el bot principal) con la ficha del cliente, los encargos, la base de conocimiento y los casos ya resueltos. Escala a ti lo que no le toca (plazos, precios, quejas, temas personales, accesos), lo que «no le sirve» y las dudas que vuelven una y otra vez. Avisa al equipo antes de encenderlo.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={on} onChange={(e) => setOn(e.target.checked)} />
          {on ? 'Encendido' : 'Apagado'}
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Respuestas de IA general</span>
          <select className={cn(selectClass, 'w-full')} value={s.generalAutonomy} onChange={(e) => setS({ ...s, generalAutonomy: e.target.value as TeamSettings['generalAutonomy'] })}>
            <option value="aprobacion">Con tu aprobación</option>
            <option value="autonomo">Las envía solo</option>
          </select>
          <span className="block text-xs text-muted-foreground">Lo que sale de la ficha, la base o un caso anterior se envía siempre solo.</span>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Escalar tras</span>
          <select className={cn(selectClass, 'w-full')} value={s.maxAttempts} onChange={(e) => setS({ ...s, maxAttempts: Number(e.target.value) })}>
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} preguntas del mismo tema sin resolver
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Un mensaje sigue la duda anterior durante</span>
          <select className={cn(selectClass, 'w-full')} value={s.followupMinutes} onChange={(e) => setS({ ...s, followupMinutes: Number(e.target.value) })}>
            {[10, 30, 60, 120].map((n) => (
              <option key={n} value={n}>
                {n} minutos
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button className={brandBtn} disabled={pending || !dirty} onClick={() => run(() => saveTeamSettingsAction({ active: on, settings: s }), on ? 'Guardado: el jefe de operaciones contesta al equipo.' : 'Guardado.')}>
          Guardar
        </Button>
        {dirty && <span className="text-xs text-warning-strong">Cambios sin guardar</span>}
        <MsgLine msg={msg} />
      </div>
    </section>
  );
}

/** Una duda con su respuesta y, si está abierta, los botones para decidirla. La usan Dudas del equipo y Para ti. */
export function QuestionCard({ q, as: Tag = 'li' }: { q: QuestionRow; as?: 'li' | 'div' }) {
  const [answer, setAnswer] = useState('');
  const { run, pending, msg } = useRun();
  const open = q.status === 'pendiente_aprobacion' || q.status === 'escalada';
  const st = STATUS[q.status] ?? { label: q.status, tone: 'neutral' as const };
  return (
    <Tag className="space-y-3 rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="text-sm font-medium text-foreground">{q.askedBy}</span>
        <span>{fmt(q.createdAt)}</span>
        <Badge tone={st.tone}>{st.label}</Badge>
        {q.tier && <span>{TIER[q.tier] ?? q.tier}</span>}
        {q.reason && <span>· {REASON[q.reason] ?? q.reason}</span>}
        {q.topic && <span>· {q.topic.replace(/_/g, ' ')}</span>}
        {q.costUsd > 0 && <span>· {q.costUsd.toFixed(3)} $</span>}
      </div>
      <p className="whitespace-pre-wrap text-sm">{q.question}</p>
      {q.followups.map((f, i) => (
        <p key={i} className="whitespace-pre-wrap border-l-2 pl-3 text-sm text-muted-foreground">
          {f}
        </p>
      ))}
      {q.feedbackNote && <p className="text-sm text-destructive">No le sirvió: {q.feedbackNote}</p>}
      {(q.finalAnswer || q.aiAnswer) && (
        <div className="rounded-lg bg-muted/60 p-3 text-sm">
          <p className="mb-1 text-xs font-semibold text-muted-foreground">{q.finalAnswer ? (q.answeredBy === 'enric' ? 'Tu respuesta' : 'Respuesta enviada') : 'Propuesta del jefe'}</p>
          <p className="whitespace-pre-wrap">{plain(q.finalAnswer || q.aiAnswer || '')}</p>
        </div>
      )}
      {q.revisions.length > 0 && <p className="text-xs text-muted-foreground">Cambios que pediste: {q.revisions.join(' · ')}</p>}
      {q.tools.length > 0 && <p className="text-xs text-muted-foreground">Consultó: {[...new Set(q.tools)].join(', ')}</p>}
      {open && (
        <div className="space-y-2 border-t pt-3">
          <textarea className={cn(areaClass, 'min-h-20')} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={`Tu respuesta para ${q.askedBy} (le llega tal cual por Telegram)`} maxLength={6000} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className={brandBtn} disabled={pending || !answer.trim()} onClick={() => run(() => answerQuestionAction(q.id, answer), `Respuesta enviada a ${q.askedBy}`, () => setAnswer(''))}>
              <MessageSquareReply aria-hidden />
              Enviar mi respuesta
            </Button>
            {q.aiAnswer && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => approveQuestionAction(q.id), `Propuesta enviada a ${q.askedBy}`)}>
                <Send aria-hidden />
                Enviar la propuesta
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => discardQuestionAction(q.id), `Duda de ${q.askedBy} marcada para hablarla en persona`)}>
              <Trash2 aria-hidden />
              Lo hablo yo con la persona
            </Button>
            <MsgLine msg={msg} />
          </div>
          <p className="text-xs text-muted-foreground">Para pedir cambios a la propuesta, usa «✏️ Cambiar» en Telegram. Lo que respondas o apruebes te llega también como propuesta para la base de conocimiento.</p>
        </div>
      )}
      {!open && q.status === 'resuelta' && (
        <p className="flex items-center gap-1 text-xs text-success">
          <CheckCircle2 className="size-3.5" aria-hidden />
          Resuelta{q.feedback === 'sirve' ? ' y le sirvió' : ''}
        </p>
      )}
    </Tag>
  );
}
