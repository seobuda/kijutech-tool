'use client';

// Banco de preguntas (25 nov 2026). Arriba, una pastilla por grupo (General, cada servicio y «Textos de los correos»);
// debajo, las preguntas de ese grupo en el orden en que se hacen, cada una editable en su sitio. Sin ventanas: todo se
// edita en la misma línea. Cambiar una pregunta pone al día las que aún no se han enviado a ningún cliente.
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Mail, MessageCircleQuestion, Pencil, Plus, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, PageHeader } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { ANSWER_TYPE_LABELS, COMMS_TEMPLATE_INFO, COMMS_TEMPLATE_KEYS, fillTemplate, numberedList, type AnswerType, type CommsTemplateKey } from '@/lib/core/questions-rules';
import { createTemplateAction, deleteTemplateAction, moveTemplateAction, resetCommsTemplateAction, saveCommsTemplateAction, updateTemplateAction } from '@/lib/core/questions-actions';
import type { CommsTemplateView } from '@/lib/core/questions';
import { areaClass, brandBtn, ConfirmDelete, fieldHint, MsgLine, useRun } from '../ui';
import { EMPTY_DRAFT, ProposeBox, QuestionFields, targetLabel, whenLabel, type QuestionDraft } from '../preguntas-ui';

export type BankTemplate = {
  id: string;
  serviceKey: string | null;
  text: string;
  help: string;
  answerType: string;
  target: string;
  askWhen: string;
  repeatDays: number | null;
  active: boolean;
  origin: string;
  updatedBy: string | null;
  updatedAt: string;
};

const TEXTS = 'textos';
const GENERAL = 'general';

export function BancoView({
  templates,
  services,
  comms,
  isAdmin,
  initial
}: {
  templates: BankTemplate[];
  services: { key: string; label: string }[];
  comms: Record<CommsTemplateKey, CommsTemplateView>;
  isAdmin: boolean;
  initial: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const groups = [{ key: GENERAL, label: 'General' }, ...services];
  const valid = (k: string | null) => (k && (k === TEXTS || groups.some((g) => g.key === k)) ? k : GENERAL);
  const [tab, setTab] = useState(valid(initial));
  const go = (k: string) => {
    setTab(k);
    router.replace(`${pathname}?s=${k}`, { scroll: false });
  };
  const count = (k: string) => templates.filter((t) => (k === GENERAL ? t.serviceKey === null : t.serviceKey === k) && t.active).length;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={MessageCircleQuestion}
        title="Banco de preguntas"
        description="Lo que se pregunta a cada cliente según los servicios que le hacemos (se marcan en su ficha → Operaciones). Las generales se preguntan a todos. Las de un cliente concreto, su envío y sus respuestas están en su ficha → Preguntas."
      />
      {!isAdmin && <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">Solo un administrador puede cambiar el banco. Si echas algo en falta, añádelo como pregunta suelta en la ficha del cliente.</p>}

      <nav aria-label="Grupos de preguntas" className="flex flex-wrap gap-1.5">
        {groups.map((g) => (
          <button
            key={g.key}
            type="button"
            aria-pressed={tab === g.key}
            onClick={() => go(g.key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
              tab === g.key ? 'border-brand bg-brand-soft font-medium text-brand' : 'bg-card text-muted-foreground hover:text-foreground'
            )}
          >
            {g.label}
            <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{count(g.key)}</span>
          </button>
        ))}
        <span className="mx-1 w-px self-stretch bg-border" aria-hidden />
        <button
          type="button"
          aria-pressed={tab === TEXTS}
          onClick={() => go(TEXTS)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
            tab === TEXTS ? 'border-brand bg-brand-soft font-medium text-brand' : 'bg-card text-muted-foreground hover:text-foreground'
          )}
        >
          <Mail className="size-3.5" aria-hidden />
          Textos de los correos
        </button>
      </nav>

      {tab === TEXTS ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {COMMS_TEMPLATE_KEYS.map((k) => (
            <CommsTemplateCard key={k} tpl={comms[k]} isAdmin={isAdmin} />
          ))}
        </div>
      ) : (
        <Group
          key={tab}
          serviceKey={tab === GENERAL ? null : tab}
          label={groups.find((g) => g.key === tab)?.label ?? ''}
          items={templates.filter((t) => (tab === GENERAL ? t.serviceKey === null : t.serviceKey === tab))}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}

function Group({ serviceKey, label, items, isAdmin }: { serviceKey: string | null; label: string; items: BankTemplate[]; isAdmin: boolean }) {
  const [adding, setAdding] = useState<null | 'manual' | 'ia'>(null);
  const [draft, setDraft] = useState<QuestionDraft>(EMPTY_DRAFT);
  const { run, pending, msg } = useRun();
  const active = items.filter((t) => t.active);
  const inactive = items.filter((t) => !t.active);
  return (
    <section className="rounded-xl border bg-card shadow-xs">
      <div className="border-b px-5 py-4">
        <h2 className="text-[15px] font-semibold">
          {label} · {active.length} {active.length === 1 ? 'pregunta' : 'preguntas'}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {serviceKey === null ? 'Se preguntan a todos los clientes.' : `Se preguntan a los clientes que tienen marcado «${label}».`} En este orden. Cambiar una pone al día las que aún no se han enviado; las ya enviadas o respondidas no cambian.
        </p>
      </div>
      <div className="space-y-4 p-5">
        {!items.length && <p className="text-sm text-muted-foreground">Aún no hay preguntas para {label}. Añade la primera o pide a la IA que te proponga unas cuantas.</p>}
        {active.length > 0 && (
          <ol className="divide-y rounded-lg border">
            {active.map((t, i) => (
              <TemplateRow key={t.id} t={t} n={i + 1} first={i === 0} last={i === active.length - 1} isAdmin={isAdmin} />
            ))}
          </ol>
        )}
        {inactive.length > 0 && (
          <details className="rounded-lg border">
            <summary className="cursor-pointer px-3 py-2 text-sm text-muted-foreground">Desactivadas ({inactive.length}): no se preguntan</summary>
            <ul className="divide-y border-t">
              {inactive.map((t) => (
                <TemplateRow key={t.id} t={t} isAdmin={isAdmin} />
              ))}
            </ul>
          </details>
        )}
        {isAdmin && (
          <div className="space-y-3 border-t pt-4">
            {adding === null && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setAdding('manual')}>
                  <Plus aria-hidden />
                  Añadir pregunta
                </Button>
                <Button size="sm" variant="outline" className="border-brand/40 text-brand hover:bg-brand-soft hover:text-brand" onClick={() => setAdding('ia')}>
                  <Sparkles aria-hidden />
                  Proponer con IA
                </Button>
              </div>
            )}
            {adding === 'manual' && (
              <div className="space-y-3 rounded-xl border p-4">
                <p className="text-sm font-medium">Nueva pregunta para {label}</p>
                <QuestionFields value={draft} onChange={setDraft} withWhen />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className={brandBtn}
                    disabled={pending || draft.text.trim().length < 5}
                    onClick={() =>
                      run(
                        () => createTemplateAction({ serviceKey, text: draft.text, help: draft.help || null, answerType: draft.answerType, target: draft.target, askWhen: draft.askWhen, repeatDays: draft.repeatDays }),
                        'Pregunta añadida al banco.',
                        () => {
                          setDraft(EMPTY_DRAFT);
                          setAdding(null);
                        }
                      )
                    }
                  >
                    Añadir
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAdding(null)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
            {adding === 'ia' && (
              <ProposeBox
                serviceKey={serviceKey}
                placeholder={serviceKey === null ? 'Ej.: lo que necesita saber cualquier departamento para empezar con un cliente' : `Ej.: todo lo necesario para empezar a trabajar ${label} con un cliente nuevo`}
                onClose={() => setAdding(null)}
                onAdd={async (list) => {
                  for (const it of list) {
                    const r = await createTemplateAction({ serviceKey, text: it.text, help: it.help, answerType: it.answerType, target: it.target, askWhen: it.askWhen, repeatDays: it.repeatDays }, true);
                    if (!r.ok) return r;
                  }
                  run(async () => ({ ok: true }), `${list.length} ${list.length === 1 ? 'pregunta añadida' : 'preguntas añadidas'} al banco.`);
                  return { ok: true };
                }}
              />
            )}
          </div>
        )}
        <MsgLine msg={msg} />
      </div>
    </section>
  );
}

function TemplateRow({ t, n, first, last, isAdmin }: { t: BankTemplate; n?: number; first?: boolean; last?: boolean; isAdmin: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<QuestionDraft>({ text: t.text, help: t.help, answerType: t.answerType, target: t.target, askWhen: t.askWhen, repeatDays: t.repeatDays, active: t.active });
  const { run, pending, msg } = useRun();
  if (editing) {
    return (
      <li className="space-y-3 bg-muted/20 p-4">
        <QuestionFields value={draft} onChange={setDraft} withWhen withActive />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className={brandBtn}
            disabled={pending || draft.text.trim().length < 5}
            onClick={() =>
              run(
                () => updateTemplateAction(t.id, { text: draft.text, help: draft.help || null, answerType: draft.answerType, target: draft.target, askWhen: draft.askWhen, repeatDays: draft.repeatDays, active: draft.active !== false }),
                'Pregunta guardada.',
                () => setEditing(false)
              )
            }
          >
            Guardar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
          <span className="ml-auto">
            <ConfirmDelete what="esta pregunta del banco (las ya enviadas o respondidas se quedan en cada cliente)" disabled={pending} onConfirm={() => run(() => deleteTemplateAction(t.id), 'Pregunta eliminada.')} />
          </span>
        </div>
        <MsgLine msg={msg} />
      </li>
    );
  }
  return (
    <li className={cn('flex items-start gap-3 px-3 py-2.5 text-sm', !t.active && 'opacity-60')}>
      {n !== undefined && <span className="mt-0.5 w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{n}.</span>}
      <div className="min-w-0 flex-1 space-y-1">
        <p>{t.text}</p>
        {t.help && <p className="text-xs text-muted-foreground">{t.help}</p>}
        <p className="flex flex-wrap gap-1">
          <Badge tone="neutral">{ANSWER_TYPE_LABELS[t.answerType as AnswerType] ?? t.answerType}</Badge>
          <Badge tone="neutral">{targetLabel(t.target)}</Badge>
          <Badge tone={t.askWhen === 'periodica' ? 'info' : 'neutral'}>{whenLabel(t.askWhen, t.repeatDays)}</Badge>
          {t.origin === 'ia' && <Badge tone="brand">Propuesta por la IA</Badge>}
        </p>
        <MsgLine msg={msg} />
      </div>
      {isAdmin && (
        <div className="flex shrink-0 items-center gap-0.5">
          {t.active && (
            <>
              <Button size="icon" variant="ghost" className="size-8" disabled={pending || first} onClick={() => run(() => moveTemplateAction(t.id, 'up'), 'Orden cambiado.')} aria-label="Subir">
                <ArrowUp aria-hidden />
              </Button>
              <Button size="icon" variant="ghost" className="size-8" disabled={pending || last} onClick={() => run(() => moveTemplateAction(t.id, 'down'), 'Orden cambiado.')} aria-label="Bajar">
                <ArrowDown aria-hidden />
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            Editar
          </Button>
        </div>
      )}
    </li>
  );
}

const SAMPLE = {
  cliente: 'Reformas Ejemplo',
  n: '3',
  servicios: 'SEO',
  preguntas: numberedList(['¿Qué queréis conseguir en los próximos 6 a 12 meses?', '¿En qué poblaciones queréis conseguir clientes?', '¿Tenéis fotos de trabajos que podamos usar en la web?']),
  enlace: 'https://…/cuestionario/(enlace privado)',
  caduca: '25 de diciembre de 2026'
};

function CommsTemplateCard({ tpl, isAdmin }: { tpl: CommsTemplateView; isAdmin: boolean }) {
  const info = COMMS_TEMPLATE_INFO[tpl.key];
  const [subject, setSubject] = useState(tpl.subject);
  const [body, setBody] = useState(tpl.body);
  const [preview, setPreview] = useState(false);
  const { run, pending, msg } = useRun();
  const dirty = subject !== tpl.subject || body !== tpl.body;
  return (
    <section className="space-y-3 rounded-xl border bg-card p-5 shadow-xs">
      <div>
        <h2 className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
          {info.title}
          {tpl.custom ? <Badge tone="info">Texto propio</Badge> : <Badge tone="neutral">Texto por defecto</Badge>}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{info.when}</p>
        <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          Huecos que se rellenan solos:
          {info.placeholders.map((p) => (
            <code key={p} className="rounded bg-muted px-1 py-0.5 text-foreground">
              {p}
            </code>
          ))}
        </p>
      </div>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Asunto</span>
        <Input value={subject} disabled={!isAdmin} onChange={(e) => setSubject(e.target.value)} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Texto</span>
        <textarea className={areaClass} rows={12} value={body} disabled={!isAdmin} onChange={(e) => setBody(e.target.value)} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {isAdmin && (
          <Button size="sm" className={brandBtn} disabled={pending || !dirty} onClick={() => run(() => saveCommsTemplateAction(tpl.key, subject, body), 'Texto guardado: se usará en los próximos envíos.')}>
            Guardar
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setPreview((v) => !v)} aria-expanded={preview}>
          {preview ? 'Ocultar ejemplo' : 'Ver cómo queda'}
        </Button>
        {isAdmin && tpl.custom && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => resetCommsTemplateAction(tpl.key), 'Vuelve el texto por defecto.')}>
            <RotateCcw aria-hidden />
            Volver al texto por defecto
          </Button>
        )}
        {tpl.updatedBy && <span className={fieldHint}>Cambiado por {tpl.updatedBy}</span>}
      </div>
      {preview && (
        <div className="space-y-1 rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="font-medium">{fillTemplate(subject, SAMPLE)}</p>
          <p className="whitespace-pre-line text-foreground/80">{fillTemplate(body, SAMPLE)}</p>
        </div>
      )}
      <MsgLine msg={msg} />
    </section>
  );
}
