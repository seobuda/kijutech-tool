'use client';

// Piezas comunes de las Preguntas al cliente (25 nov 2026): el formulario de una pregunta (texto, para qué, tipo de
// respuesta, dónde se guarda y cuándo se pregunta) y «Proponer con IA». Las usan el Banco de preguntas y la pestaña
// Preguntas de la ficha de cada cliente.
import { useState, useTransition } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { ANSWER_TYPE_LABELS, ANSWER_TYPES, BANK_TARGETS, TARGET_LABELS, type ProposedQuestion } from '@/lib/core/questions-rules';
import { proposeQuestionsAction } from '@/lib/core/questions-actions';
import { areaClass, brandBtn, checkClass, fieldHint, MsgLine, selectClass, type Msg } from './ui';

export type QuestionDraft = { text: string; help: string; answerType: string; target: string; askWhen: string; repeatDays: number | null; active?: boolean };
export const EMPTY_DRAFT: QuestionDraft = { text: '', help: '', answerType: 'texto', target: 'memoria', askWhen: 'alta', repeatDays: null, active: true };

export const whenLabel = (askWhen: string, repeatDays: number | null) => (askWhen === 'periodica' && repeatDays ? `Cada ${repeatDays} días` : 'Al empezar');
export const targetLabel = (t: string) => TARGET_LABELS[t] ?? (t.startsWith('seo:') ? 'Expediente SEO' : t);

/** Formulario de una pregunta. `withWhen`: en el banco se elige cuándo se pregunta; en un cliente, no. */
export function QuestionFields({ value, onChange, withWhen, withActive }: { value: QuestionDraft; onChange: (v: QuestionDraft) => void; withWhen?: boolean; withActive?: boolean }) {
  const set = (patch: Partial<QuestionDraft>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-3">
      <label className="grid gap-1 text-sm">
        <span className="font-medium">
          Pregunta <span className="text-destructive">*</span>
        </span>
        <textarea className={areaClass} rows={2} value={value.text} maxLength={500} onChange={(e) => set({ text: e.target.value })} placeholder="¿Qué queréis conseguir en los próximos 6 a 12 meses?" />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Para qué la preguntamos</span>
        <Input value={value.help} maxLength={500} onChange={(e) => set({ help: e.target.value })} placeholder="Con esto fijamos los objetivos y medimos si el trabajo funciona." />
        <span className={fieldHint}>Lo ve el cliente debajo de la pregunta y ayuda a la IA a leer su respuesta.</span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Tipo de respuesta</span>
          <select className={selectClass} value={value.answerType} onChange={(e) => set({ answerType: e.target.value })}>
            {ANSWER_TYPES.filter((t) => t !== 'direccion').map((t) => (
              <option key={t} value={t}>
                {ANSWER_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Dónde se guarda la respuesta</span>
          <select className={selectClass} value={value.target} onChange={(e) => set({ target: e.target.value })}>
            {BANK_TARGETS.map((t) => (
              <option key={t} value={t}>
                {TARGET_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {withWhen && (
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="grid gap-1">
            <span className="font-medium">Cuándo se pregunta</span>
            <select className={selectClass} value={value.askWhen} onChange={(e) => set({ askWhen: e.target.value, repeatDays: e.target.value === 'periodica' ? value.repeatDays ?? 90 : null })}>
              <option value="alta">Una vez, al empezar</option>
              <option value="periodica">Cada cierto tiempo</option>
            </select>
          </label>
          {value.askWhen === 'periodica' && (
            <label className="grid gap-1">
              <span className="font-medium">Cada cuántos días</span>
              <Input type="number" min={7} max={730} className="w-28" value={value.repeatDays ?? 90} onChange={(e) => set({ repeatDays: Number(e.target.value) || null })} />
            </label>
          )}
          {withActive && (
            <label className="flex items-center gap-2 pb-2">
              <input type="checkbox" className={checkClass} checked={value.active !== false} onChange={(e) => set({ active: e.target.checked })} />
              Activa (se pregunta a los clientes)
            </label>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * «Proponer con IA»: se describe qué se necesita saber y la IA propone preguntas; se marcan las buenas y se añaden.
 * No se guarda nada hasta pulsar «Añadir».
 */
export function ProposeBox({
  serviceKey,
  clientId,
  placeholder,
  onAdd,
  onClose
}: {
  serviceKey: string | null;
  clientId?: string;
  placeholder: string;
  onAdd: (items: ProposedQuestion[]) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}) {
  const [goal, setGoal] = useState('');
  const [items, setItems] = useState<ProposedQuestion[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();

  const propose = () =>
    start(async () => {
      setMsg(null);
      const r = await proposeQuestionsAction({ serviceKey, goal, clientId: clientId ?? null });
      if (!r.ok) return setMsg({ type: 'error', text: r.error });
      setItems(r.proposals);
      setPicked(new Set(r.proposals.map((_, i) => i)));
    });
  const add = () =>
    start(async () => {
      const chosen = (items ?? []).filter((_, i) => picked.has(i));
      if (!chosen.length) return setMsg({ type: 'error', text: 'Marca al menos una pregunta' });
      const r = await onAdd(chosen);
      if (!r.ok) return setMsg({ type: 'error', text: r.error ?? 'No se pudieron añadir' });
      onClose();
    });

  return (
    <div className="space-y-3 rounded-xl border border-brand/30 bg-brand-soft/40 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="size-4 text-brand" aria-hidden />
        Proponer preguntas con IA
      </div>
      <label className="grid gap-1 text-sm">
        <span>¿Qué necesitas saber?</span>
        <textarea className={areaClass} rows={2} value={goal} maxLength={600} onChange={(e) => setGoal(e.target.value)} placeholder={placeholder} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className={brandBtn} disabled={pending} onClick={propose}>
          {pending && !items ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
          {items ? 'Proponer otras' : 'Proponer'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      </div>
      {pending && !items && <p className={fieldHint}>Pensando las preguntas… tarda unos segundos.</p>}
      <MsgLine msg={msg} />
      {items && items.length > 0 && (
        <div className="space-y-2">
          <p className={fieldHint}>Marca las que quieras añadir. Luego podrás editarlas.</p>
          <ul className="space-y-1.5">
            {items.map((q, i) => (
              <li key={i}>
                <label className={cn('flex cursor-pointer gap-2.5 rounded-lg border bg-card p-2.5 text-sm', picked.has(i) ? 'border-brand/40' : 'opacity-70')}>
                  <input
                    type="checkbox"
                    className={cn(checkClass, 'mt-0.5')}
                    checked={picked.has(i)}
                    onChange={(e) => {
                      const next = new Set(picked);
                      if (e.target.checked) next.add(i);
                      else next.delete(i);
                      setPicked(next);
                    }}
                  />
                  <span className="min-w-0 space-y-1">
                    <span className="block">{q.text}</span>
                    {q.help && <span className="block text-xs text-muted-foreground">{q.help}</span>}
                    <span className="flex flex-wrap gap-1">
                      <Badge tone="neutral">{ANSWER_TYPE_LABELS[q.answerType]}</Badge>
                      <Badge tone="neutral">{targetLabel(q.target)}</Badge>
                      {q.askWhen === 'periodica' && <Badge tone="info">{whenLabel(q.askWhen, q.repeatDays)}</Badge>}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <Button size="sm" className={brandBtn} disabled={pending || !picked.size} onClick={add}>
            Añadir {picked.size} {picked.size === 1 ? 'pregunta' : 'preguntas'}
          </Button>
        </div>
      )}
    </div>
  );
}
