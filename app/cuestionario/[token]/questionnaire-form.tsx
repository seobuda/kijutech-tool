'use client';

// Formulario del cuestionario (25 nov 2026): una tarjeta por pregunta, guardado automático al dejar de escribir y un
// botón final «Enviar respuestas». Lo que queda en blanco no se envía (el equipo puede volver a preguntarlo).
import { useEffect, useRef, useState, useTransition } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PublicQuestionnaire } from '@/lib/core/questions';
import { saveQuestionnaireAnswerAction, submitQuestionnaireAction } from '@/lib/core/questionnaire-actions';

type Q = PublicQuestionnaire['questions'][number];
type Addr = { calle: string; codigo_postal: string; poblacion: string; provincia: string };
type Val = string | Addr;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const inputClass =
  'w-full rounded-lg border border-input bg-card px-3 py-2 text-base shadow-xs placeholder:text-muted-foreground focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40 sm:text-sm';

function initial(q: Q): Val {
  if (q.answerType === 'direccion') {
    const v = (q.value && typeof q.value === 'object' ? q.value : {}) as Partial<Addr>;
    return { calle: v.calle ?? '', codigo_postal: v.codigo_postal ?? '', poblacion: v.poblacion ?? '', provincia: v.provincia ?? '' };
  }
  if (q.answerType === 'lista' && Array.isArray(q.value)) return (q.value as string[]).join('\n');
  return q.text_value ?? '';
}
const filled = (v: Val) => (typeof v === 'string' ? v.trim().length > 0 : Object.values(v).some((x) => x.trim()));

export function QuestionnaireForm({ token, clientName, expiresAt, questions }: { token: string; clientName: string; expiresAt: string; questions: Q[] }) {
  const [values, setValues] = useState<Record<string, Val>>(() => Object.fromEntries(questions.map((q) => [q.id, initial(q)])));
  const [states, setStates] = useState<Record<string, SaveState>>({});
  const [done, setDone] = useState<{ answered: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const open = questions.filter((q) => !q.answered);
  const answeredCount = questions.filter((q) => q.answered || filled(values[q.id])).length;

  const save = async (q: Q, v: Val) => {
    setStates((s) => ({ ...s, [q.id]: 'saving' }));
    const payload = q.answerType === 'lista' && typeof v === 'string' ? v.split('\n').map((x) => x.trim()).filter(Boolean) : v;
    const r = await saveQuestionnaireAnswerAction(token, q.id, payload);
    setStates((s) => ({ ...s, [q.id]: r.ok ? 'saved' : 'error' }));
    if (!r.ok) setError(r.error);
    return r.ok;
  };
  const change = (q: Q, v: Val) => {
    setValues((s) => ({ ...s, [q.id]: v }));
    clearTimeout(timers.current[q.id]);
    timers.current[q.id] = setTimeout(() => void save(q, v), 900);
  };
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  const submit = () =>
    start(async () => {
      setError(null);
      // Lo que aún esté esperando su guardado automático se guarda ahora.
      // Lo que falló antes se reintenta.
      for (const q of open) {
        if (timers.current[q.id] || states[q.id] === 'error') {
          clearTimeout(timers.current[q.id]);
          delete timers.current[q.id];
          if (!(await save(q, values[q.id]))) return;
        }
      }
      const r = await submitQuestionnaireAction(token);
      if (!r.ok) return setError(r.error);
      setDone({ answered: r.answered, total: r.total });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

  if (done) {
    return (
      <div className="rounded-2xl border bg-card p-6 shadow-xs sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight">¡Muchas gracias!</h1>
        <p className="mt-2 text-muted-foreground">
          Hemos recibido vuestras respuestas ({done.answered} de {done.total}). Con esto ya podemos ponernos a trabajar. Si queréis añadir o cambiar algo, respondednos al correo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Unas preguntas para {clientName}</h1>
        <p className="text-muted-foreground text-pretty">
          Respondedlas a vuestro ritmo: lo que escribís se guarda solo y podéis volver más tarde con el mismo enlace. Si alguna no aplica, dejadla en blanco. Cuando terminéis, pulsad «Enviar respuestas».
        </p>
        <p className="text-sm text-muted-foreground">
          El enlace funciona hasta el {new Date(expiresAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}.
        </p>
      </header>

      <ol className="space-y-4">
        {questions.map((q, i) => (
          <li key={q.id} className="space-y-3">
            {(i === 0 || questions[i - 1].group !== q.group) && <h2 className="px-1 pt-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{q.group}</h2>}
            <div className="rounded-2xl border bg-card p-4 shadow-xs sm:p-5">
            <div className="mb-3 flex items-start gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand tabular-nums">{i + 1}</span>
              <div className="min-w-0">
                <label htmlFor={`q-${q.id}`} className="font-medium text-pretty">
                  {q.text}
                </label>
                {q.help && <p className="mt-0.5 text-sm text-muted-foreground">{q.help}</p>}
              </div>
            </div>
            {q.answered ? (
              <p className="flex items-center gap-1.5 text-sm text-success">
                <Check className="size-4" aria-hidden />
                Ya la habéis respondido: {q.text_value}
              </p>
            ) : (
              <Field q={q} value={values[q.id]} onChange={(v) => change(q, v)} />
            )}
            <SaveLine state={states[q.id]} />
            </div>
          </li>
        ))}
      </ol>

      <div className="sticky bottom-0 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {answeredCount} de {questions.length} con respuesta
          </p>
          <Button className="bg-brand text-white hover:bg-brand/90" disabled={pending} onClick={submit}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            Enviar respuestas
          </Button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function Field({ q, value, onChange }: { q: Q; value: Val; onChange: (v: Val) => void }) {
  const id = `q-${q.id}`;
  if (q.answerType === 'direccion') {
    const a = value as Addr;
    const set = (k: keyof Addr, v: string) => onChange({ ...a, [k]: v });
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <input id={id} className={cn(inputClass, 'sm:col-span-2')} placeholder="Calle y número" value={a.calle} onChange={(e) => set('calle', e.target.value)} autoComplete="street-address" maxLength={200} />
        <input className={inputClass} placeholder="Código postal" value={a.codigo_postal} onChange={(e) => set('codigo_postal', e.target.value)} autoComplete="postal-code" inputMode="numeric" maxLength={10} />
        <input className={inputClass} placeholder="Población" value={a.poblacion} onChange={(e) => set('poblacion', e.target.value)} autoComplete="address-level2" maxLength={120} />
        <input className={cn(inputClass, 'sm:col-span-2')} placeholder="Provincia" value={a.provincia} onChange={(e) => set('provincia', e.target.value)} autoComplete="address-level1" maxLength={120} />
      </div>
    );
  }
  const v = value as string;
  if (q.answerType === 'si_no') {
    const yes = /^s[ií]/i.test(v);
    const no = /^no(?![a-z])/i.test(v);
    const rest = v.replace(/^(s[ií]|no)(?![a-z])[.,:]?\s*/i, '');
    return (
      <div className="space-y-2">
        <div role="radiogroup" aria-labelledby={id} className="flex gap-2">
          {['Sí', 'No'].map((opt) => {
            const on = opt === 'Sí' ? yes : no;
            return (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange(rest ? `${opt}. ${rest}` : opt)}
                className={cn('min-w-20 rounded-lg border px-4 py-2 text-sm font-medium transition-colors', on ? 'border-brand bg-brand-soft text-brand' : 'bg-card hover:bg-muted')}
              >
                {opt}
              </button>
            );
          })}
        </div>
        <textarea className={inputClass} rows={2} placeholder="¿Algo que añadir? (opcional)" value={rest} maxLength={1500} onChange={(e) => onChange(`${yes ? 'Sí' : no ? 'No' : ''}${yes || no ? '. ' : ''}${e.target.value}`)} />
      </div>
    );
  }
  if (q.answerType === 'numero' || q.answerType === 'fecha') {
    return <input id={id} className={inputClass} value={v} maxLength={200} onChange={(e) => onChange(e.target.value)} placeholder={q.answerType === 'numero' ? 'Por ejemplo: 600 € al mes' : 'Por ejemplo: antes de marzo'} />;
  }
  return (
    <textarea
      id={id}
      className={inputClass}
      rows={q.answerType === 'lista' ? 4 : 3}
      value={v}
      maxLength={q.answerType === 'lista' ? 3000 : 4000}
      onChange={(e) => onChange(e.target.value)}
      placeholder={q.answerType === 'lista' ? 'Uno por línea' : 'Escribid aquí vuestra respuesta'}
    />
  );
}

function SaveLine({ state }: { state?: SaveState }) {
  if (!state || state === 'idle') return null;
  return (
    <p className={cn('mt-1.5 text-xs', state === 'error' ? 'text-destructive' : 'text-muted-foreground')} aria-live="polite">
      {state === 'saving' ? 'Guardando…' : state === 'saved' ? 'Guardado' : 'No se ha podido guardar: lo intentaremos al enviar.'}
    </p>
  );
}
