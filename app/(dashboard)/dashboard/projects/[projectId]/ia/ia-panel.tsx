'use client';

// Proyecto → IA: preguntas (proponer, añadir, activar, quitar), «Preguntar ahora» y la tabla pregunta × asistente con la
// presencia del cliente del último mes, quién sale en su lugar y la última respuesta (texto plano: nunca HTML ajeno).
import { Fragment, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Check, Loader2, Plus, RefreshCw, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState, Section } from '@/components/ui/page';
import type { AiPanelView } from '@/lib/seo/panel-ia/panel';
import { AI_ASSISTANTS, ASSISTANT_LABEL, MAX_AI_QUESTIONS } from '@/lib/seo/panel-ia/rules';
import { addAiQuestionAction, proposeAiQuestionsAction, runAiPanelNowAction, setAiQuestionStatusAction } from '@/lib/seo/cierre-actions';

type Res = { ok: true; message?: string } | { ok: false; error: string };

function Cell({ c }: { c?: { n: number; client: number; competitors: string[] } }) {
  if (!c) return <span className="text-xs text-muted-foreground">—</span>;
  const tone = c.client === c.n ? 'success' : c.client > 0 ? 'warning' : 'danger';
  return (
    <div className="flex flex-col gap-0.5">
      <Badge tone={tone}>{c.client > 0 ? `Sale ${c.client}/${c.n}` : `No sale (0/${c.n})`}</Badge>
      {c.competitors.length > 0 && <span className="text-xs text-muted-foreground">{c.competitors.slice(0, 2).join(', ')}</span>}
    </div>
  );
}

export function IaPanel({ projectId, view, canEdit }: { projectId: string; view: AiPanelView; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!view.pending) return;
    const t = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(t);
  }, [view.pending, router]);

  const act = (fn: () => Promise<Res>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.message ? { type: 'ok', text: r.message } : null) : { type: 'error', text: r.error });
      if (r.ok) after?.();
      router.refresh();
    });

  const active = view.questions.filter((x) => x.status === 'activa');
  const proposed = view.questions.filter((x) => x.status === 'propuesta');
  const month = view.months[0] ?? null;

  const runNow = canEdit && active.length > 0 && (
    <Button size="sm" variant="outline" disabled={pending || view.pending > 0} onClick={() => act(() => runAiPanelNowAction(projectId))}>
      {view.pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
      {view.pending ? `Preguntando (${view.pending})…` : 'Preguntar ahora'}
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      {msg && (
        <p role="status" className={msg.type === 'ok' ? 'text-sm text-success' : 'text-sm text-destructive'}>
          {msg.text}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Gasto del panel este mes: <strong>{view.spentOp.toFixed(2)} $</strong> de {view.budget} $ (dentro del tope de datos del proyecto). Unos 0,03 $ por pregunta y muestra.
      </p>

      {!view.questions.length ? (
        <EmptyState
          icon={Bot}
          title="Aún no hay preguntas"
          description="Propón las preguntas a partir de sus servicios y su zona (confirmados en el Expediente) y de los temas con más valor, o escribe las tuyas. Hasta que actives alguna no se gasta nada."
          action={
            canEdit ? (
              <Button size="sm" disabled={pending} onClick={() => act(() => proposeAiQuestionsAction(projectId))}>
                <Sparkles className="size-3.5" />
                Proponer preguntas
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <Section
            title={`Resultados${month ? ` · ${month}` : ''}`}
            description="Por pregunta y asistente, en cuántas respuestas del mes sale el negocio (nombrado o con su web citada) y qué competidor confirmado sale. Pulsa una pregunta para ver la última respuesta y sus fuentes."
            actions={runNow || undefined}
          >
            {!active.length ? (
              <p className="text-sm text-muted-foreground">Activa alguna pregunta (abajo) para empezar.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Pregunta</th>
                      {AI_ASSISTANTS.map((a) => (
                        <th key={a} className="py-2 pr-3 font-medium">
                          {ASSISTANT_LABEL[a]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {active.map((x) => (
                      <Fragment key={x.id}>
                        <tr className="border-b align-top">
                          <td className="py-2 pr-3">
                            <button type="button" className="text-left hover:underline" aria-expanded={open === x.id} onClick={() => setOpen(open === x.id ? null : x.id)}>
                              {x.question}
                            </button>
                          </td>
                          {AI_ASSISTANTS.map((a) => (
                            <td key={a} className="py-2 pr-3">
                              <Cell c={month ? view.grid[x.id]?.[month]?.[a] : undefined} />
                            </td>
                          ))}
                        </tr>
                        {open === x.id && (
                          <tr className="border-b bg-muted/40">
                            <td colSpan={AI_ASSISTANTS.length + 1} className="p-3">
                              <div className="grid gap-3 md:grid-cols-2">
                                {AI_ASSISTANTS.map((a) => {
                                  const l = view.last[x.id]?.[a];
                                  return (
                                    <div key={a} className="rounded-md border bg-background p-3">
                                      <p className="mb-1 text-xs font-semibold">
                                        {ASSISTANT_LABEL[a]} {l ? `· ${new Date(l.at).toLocaleDateString('es-ES')}` : ''}
                                      </p>
                                      {l ? (
                                        <>
                                          <p className="whitespace-pre-line text-xs text-muted-foreground">{l.excerpt ?? '(sin texto)'}</p>
                                          {l.sources.length > 0 && <p className="mt-1 text-xs">Fuentes: {l.sources.join(', ')}</p>}
                                        </>
                                      ) : (
                                        <p className="text-xs text-muted-foreground">Aún sin respuesta.</p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title={`Preguntas (${active.length} de ${MAX_AI_QUESTIONS} activas)`} description="Escríbelas como las haría un cliente. Solo se preguntan las activas.">
            <div className="flex flex-col gap-3">
              {canEdit && (
                <form
                  className="flex flex-wrap gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(() => addAiQuestionAction(projectId, q), () => setQ(''));
                  }}
                >
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="¿Cuál es el mejor taller de motos en Sabadell?" className="max-w-md" aria-label="Pregunta nueva" maxLength={300} />
                  <Button type="submit" size="sm" disabled={pending || !q.trim()}>
                    <Plus className="size-3.5" />
                    Añadir
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => act(() => proposeAiQuestionsAction(projectId))}>
                    <Sparkles className="size-3.5" />
                    Proponer más
                  </Button>
                </form>
              )}
              {proposed.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Propuestas (sin activar)</p>
                  <ul className="flex flex-col gap-1">
                    {proposed.map((x) => (
                      <li key={x.id} className="flex items-center gap-2 text-sm">
                        <span className="flex-1">{x.question}</span>
                        {canEdit && (
                          <>
                            <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => setAiQuestionStatusAction(projectId, x.id, 'activa'))}>
                              <Check className="size-3.5" />
                              Activar
                            </Button>
                            <Button size="sm" variant="ghost" disabled={pending} aria-label="Descartar" onClick={() => act(() => setAiQuestionStatusAction(projectId, x.id, 'quitada'))}>
                              <X className="size-3.5" />
                            </Button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {active.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activas</p>
                  <ul className="flex flex-col gap-1">
                    {active.map((x) => (
                      <li key={x.id} className="flex items-center gap-2 text-sm">
                        <span className="flex-1">{x.question}</span>
                        <Badge tone="neutral">{x.origin === 'manual' ? 'A mano' : 'Propuesta'}</Badge>
                        {canEdit && (
                          <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => setAiQuestionStatusAction(projectId, x.id, 'quitada'))}>
                            <X className="size-3.5" />
                            Quitar
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
