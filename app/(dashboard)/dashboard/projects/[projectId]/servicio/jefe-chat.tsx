'use client';

// Plan de servicio → conversación con el Jefe SEO y cambios propuestos (D3, solo administradores). El envío no espera a la
// IA: se guarda el mensaje, el Jefe responde en segundo plano y esta pantalla lee el hilo cada pocos segundos hasta que
// llega la respuesta. Los cambios que propone quedan pendientes: aceptarlos no toca el plan, entran en la versión siguiente.
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, MessageSquare, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Section } from '@/components/ui/page';
import { MarkdownLite } from '@/components/ui/markdown-lite';
import type { AgentChatMessage } from '@/lib/core/capabilities';
import type { ChangeView } from '@/lib/seo/jefe/cambios';
import { decidePlanChangeAction, jefeThreadAction, sendJefeMessageAction } from '@/lib/seo/jefe-actions';

const CHANGE_LABEL: Record<string, string> = { anadir: 'Añadir frente', quitar: 'Quitar frente', mover: 'Mover de trimestre', ajustar: 'Ajustar frente' };
const STATUS: Record<string, { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' }> = {
  pendiente: { label: 'Pendiente', tone: 'warning' },
  aprobada: { label: 'Aceptado', tone: 'success' },
  rechazada: { label: 'Rechazado', tone: 'danger' },
  caducada: { label: 'Caducado', tone: 'neutral' },
  ajustada: { label: 'Ajustado', tone: 'success' }
};
const fmtTime = (d: string) => new Date(d).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
/** La respuesta web llega con <b>/<i> (formato del motor): se pasa a texto con formato sencillo, sin HTML. */
const toLite = (t: string) => t.replace(/<b>(.*?)<\/b>/g, '**$1**').replace(/<i>(.*?)<\/i>/g, '_$1_').replace(/<\/?[a-z][^>]*>/gi, '');

export function JefeChat({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  const load = useCallback(async () => {
    const r = await jefeThreadAction(projectId);
    if (!r.ok) return setError(r.error);
    setMessages(r.messages);
    setBusy(r.busy);
    setLoaded(true);
    // Llegó una respuesta nueva: puede haber dejado un cambio propuesto, se refresca la lista.
    if (lastCount.current && r.messages.length > lastCount.current && r.messages.at(-1)?.role === 'assistant') router.refresh();
    lastCount.current = r.messages.length;
  }, [projectId, router]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [busy, load]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length, busy]);

  const send = () =>
    start(async () => {
      setError(null);
      const r = await sendJefeMessageAction(projectId, text);
      if (!r.ok) return setError(r.error);
      setText('');
      setBusy(true);
      await load();
    });

  return (
    <Section
      title={
        <span className="flex items-center gap-1.5">
          <MessageSquare className="size-4" aria-hidden /> Hablar con el Jefe SEO
        </span>
      }
      description="Pregúntale por qué ha planteado algo, qué haría si cambia una circunstancia o pídele un cambio. Lee el plan y el expediente; si propone un cambio, aparece arriba para que lo aceptes o lo rechaces. Conversación compartida entre administradores. Opus 5.5: unos céntimos por mensaje, dentro del presupuesto del Jefe."
    >
      <div className="flex flex-col gap-3 p-5">
        <div className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto" aria-live="polite">
          {!loaded && <p className="text-sm text-muted-foreground">Cargando la conversación…</p>}
          {loaded && !messages.length && <p className="text-sm text-muted-foreground">Aún no habéis hablado. Prueba: «¿Por qué la ficha de Google va en el primer trimestre?» o «El cliente abre otra sede en Terrassa en marzo, ¿cambia algo?».</p>}
          {messages.map((m) => {
            if (m.role === 'user') {
              const i = m.content.indexOf(': ');
              const who = i > 0 && i < 80 ? m.content.slice(0, i) : '';
              return (
                <div key={m.id} className="self-end rounded-lg bg-muted px-3 py-2 text-sm md:max-w-[80%]">
                  <div className="mb-0.5 text-xs text-muted-foreground">
                    {who || 'Tú'} · {fmtTime(m.createdAt)}
                  </div>
                  <p className="whitespace-pre-wrap">{who ? m.content.slice(i + 2) : m.content}</p>
                </div>
              );
            }
            return (
              <div key={m.id} className="rounded-lg border px-3 py-2 text-sm md:max-w-[90%]">
                <div className="mb-0.5 text-xs text-muted-foreground">
                  Jefe SEO · {fmtTime(m.createdAt)}
                  {m.costUsd != null ? ` · ${m.costUsd.toFixed(2)} $` : ''}
                  {m.tools.length ? ` · consultó: ${m.tools.join(', ')}` : ''}
                </div>
                <MarkdownLite text={toLite(m.content)} className="flex flex-col gap-2" />
              </div>
            );
          })}
          {loaded && !busy && messages.at(-1)?.role === 'user' && (
            <p role="status" className="text-sm text-warning-strong">No llegó la respuesta del Jefe (quizá se reinició el servidor o tardó demasiado). Vuelve a enviar el mensaje.</p>
          )}
          {busy && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> El Jefe SEO está pensando (mira el plan y los datos; puede tardar un minuto)…
            </p>
          )}
          <div ref={endRef} />
        </div>
        <label className="text-sm">
          <span className="sr-only">Mensaje para el Jefe SEO</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim().length > 1 && !busy && !pending) send();
            }}
            rows={3}
            maxLength={4000}
            disabled={busy}
            className="w-full rounded-md border bg-background p-2 text-sm"
            placeholder={busy ? 'Espera a que responda…' : 'Escribe tu pregunta (Ctrl+Intro para enviar)'}
          />
        </label>
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={pending || busy || text.trim().length < 2} onClick={send}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Enviar
          </Button>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>
    </Section>
  );
}

function ChangeItem({ projectId, c }: { projectId: string; c: ChangeView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const st = STATUS[c.status] ?? { label: c.status, tone: 'neutral' as const };
  const p = c.payload;
  const decide = (accept: boolean) =>
    start(async () => {
      const r = await decidePlanChangeAction(projectId, c.id, accept, reason);
      setMsg(r.ok ? { ok: true, text: r.message ?? 'Hecho.' } : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });
  return (
    <li className="flex flex-col gap-1.5 px-5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{p.titulo}</span>
        <Badge tone="neutral">{CHANGE_LABEL[p.tipo] ?? p.tipo}</Badge>
        <Badge tone={st.tone}>{st.label}</Badge>
        {c.baseVersion != null && <span className="text-xs text-muted-foreground">sobre la v{c.baseVersion}</span>}
        {p.frente && <span className="font-mono text-[11px] text-muted-foreground">{p.frente}</span>}
      </div>
      {p.detalle && <p className="text-sm">{p.detalle}</p>}
      <p className="text-sm text-muted-foreground">Por qué: {p.motivo}</p>
      <p className="text-xs text-muted-foreground">
        Datos que lo respaldan: <span className="font-mono">{p.evidencias.join(' · ')}</span>
      </p>
      {p.leyoWebs && <p className="text-xs text-warning-strong">En esa respuesta el Jefe leyó una web: comprueba que el cambio sale de los datos y no de un texto de fuera.</p>}
      {c.status !== 'pendiente' && (
        <p className="text-xs text-muted-foreground">
          {c.decidedBy ? `${c.decidedBy}: ` : ''}
          {c.decisionReason ?? '—'}
        </p>
      )}
      {c.status === 'pendiente' && (
        <div className="flex flex-col gap-2 pt-1">
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} className="h-9 rounded-md border bg-background px-2 text-sm" placeholder="Comentario (obligatorio para rechazar)" aria-label={`Comentario sobre «${p.titulo}»`} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={() => decide(true)}>
              <Check className="size-4" /> Aceptar para la próxima versión
            </Button>
            <Button size="sm" variant="outline" disabled={pending || reason.trim().length < 5} onClick={() => decide(false)}>
              <X className="size-4" /> Rechazar
            </Button>
          </div>
        </div>
      )}
      {msg && <p role="status" className={msg.ok ? 'text-sm text-success' : 'text-sm text-destructive'}>{msg.text}</p>}
    </li>
  );
}

export function PlanChanges({ projectId, changes }: { projectId: string; changes: ChangeView[] }) {
  if (!changes.length) return null;
  const pending = changes.filter((c) => c.status === 'pendiente');
  const decided = changes.filter((c) => c.status !== 'pendiente');
  return (
    <Section
      title={`Cambios propuestos por el Jefe${pending.length ? ` · ${pending.length} pendiente(s)` : ''}`}
      description="Salen de la conversación con el Jefe. Aceptar no cambia el plan aprobado: el cambio entra en la próxima versión (genérala cuando quieras), que revisas y apruebas como siempre. Si apruebas otra versión antes de decidir, los pendientes caducan."
    >
      <ul className="divide-y">
        {pending.map((c) => (
          <ChangeItem key={c.id} projectId={projectId} c={c} />
        ))}
      </ul>
      {decided.length > 0 && (
        <details className="border-t px-5 py-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">Ya decididos ({decided.length})</summary>
          <ul className="divide-y">
            {decided.map((c) => (
              <ChangeItem key={c.id} projectId={projectId} c={c} />
            ))}
          </ul>
        </details>
      )}
    </Section>
  );
}
