'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Bot, CheckCircle2, ChevronDown, CircleDashed, FlaskConical, Loader2, MessageSquareText, Play, Plus, Send, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState, Section, StatCard } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import {
  createSimRequestAction,
  getPruebasAction,
  pressSimButtonAction,
  runScenariosAction,
  sendSimTextAction
} from '@/lib/operaciones/sim/actions';
import type { ChatMessageView, ScenarioView } from '@/lib/operaciones/sim/runner';

type ChatKey = 'employee' | 'owner';
type ChatInfo = { key: ChatKey; name: string; role: string };

const fmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
const fmtTime = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Madrid' });
const TRIGGER: Record<string, string> = { claude: 'Claude', manual: 'a mano', despliegue: 'tras desplegar' };

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return 'ahora mismo';
  if (m < 60) return `hace ${m} min`;
  if (m < 48 * 60) return `hace ${Math.round(m / 60)} h`;
  return fmt.format(new Date(iso));
}

// Telegram admite un HTML muy reducido. Se escapa TODO y solo se devuelven esas etiquetas exactas (sin atributos,
// salvo enlaces http/https), así un texto del bot nunca puede meter código en la página.
function tgHtml(text: string): string {
  const esc = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .replace(/&lt;(\/?)(b|strong|i|em|u|ins|s|strike|del|code|pre|blockquote)&gt;/g, '<$1$2>')
    .replace(/&lt;a href="(https?:\/\/[^"<>\s]*)"&gt;/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="underline">')
    .replace(/&lt;\/a&gt;/g, '</a>');
}

function StatusIcon({ status, className }: { status: string | null; className?: string }) {
  if (status === 'ok') return <CheckCircle2 className={cn('size-4 text-success', className)} aria-label="Correcta" />;
  if (status === 'fallo') return <XCircle className={cn('size-4 text-destructive', className)} aria-label="Falla" />;
  if (status === 'en_curso') return <Loader2 className={cn('size-4 animate-spin text-info', className)} aria-label="En curso" />;
  return <CircleDashed className={cn('size-4 text-muted-foreground', className)} aria-label="Sin ejecutar" />;
}

export function PruebasView({ initialScenarios, initialMessages, chats }: { initialScenarios: ScenarioView[]; initialMessages: ChatMessageView[]; chats: ChatInfo[] }) {
  const [scenarios, setScenarios] = useState(initialScenarios);
  const [messages, setMessages] = useState(initialMessages);
  const [chat, setChat] = useState<ChatKey>('employee');
  const [runFilter, setRunFilter] = useState<{ id: string; title: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async (c: ChatKey = chat, runId: string | null = runFilter?.id ?? null) => {
    const r = await getPruebasAction(c, runId);
    if (r.ok) {
      setScenarios(r.scenarios);
      setMessages(r.messages);
    }
  }, [chat, runFilter]);

  // En directo: cada 5 s con la pestaña visible (y no mientras corre una tanda, que ya refresca al terminar).
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible' && !running) void refresh();
    }, 5000);
    return () => clearInterval(t);
  }, [refresh, running]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, chat]);

  const counts = useMemo(() => {
    const ok = scenarios.filter((s) => s.last?.status === 'ok').length;
    const fail = scenarios.filter((s) => s.last?.status === 'fallo').length;
    return { ok, fail, never: scenarios.length - ok - fail };
  }, [scenarios]);
  const areas = useMemo(() => [...new Set(scenarios.map((s) => s.area))], [scenarios]);

  function run(keys: string[] | 'all', label: string) {
    setError(null);
    setNotice(null);
    setRunning(label);
    startTransition(async () => {
      const r = await runScenariosAction(keys);
      setRunning(null);
      if (!r.ok) return setError(r.error);
      const failed = r.results.filter((x) => x.status !== 'ok');
      setNotice(failed.length ? `${failed.length} de ${r.results.length} fallan.` : `${r.results.length} de ${r.results.length} correctas.`);
      if (r.results.length === 1) {
        setRunFilter({ id: r.results[0].runId, title: r.results[0].title });
        setOpen(r.results[0].key);
        await refresh(chat, r.results[0].runId);
      } else await refresh(chat, null);
    });
  }

  function switchChat(c: ChatKey) {
    setChat(c);
    void refresh(c);
  }

  function showRun(id: string, title: string) {
    setRunFilter({ id, title });
    void refresh(chat, id);
  }

  function clearFilter() {
    setRunFilter(null);
    void refresh(chat, null);
  }

  function press(m: ChatMessageView, row: number, col: number) {
    setError(null);
    startTransition(async () => {
      const r = await pressSimButtonAction(m.id, row, col);
      if (!r.ok) setError(r.error);
      await refresh();
    });
  }

  function send() {
    const t = text.trim();
    if (!t) return;
    setError(null);
    startTransition(async () => {
      const r = await sendSimTextAction(chat, t);
      if (!r.ok) return setError(r.error);
      setText('');
      await refresh();
    });
  }

  function createRequest() {
    const t = newTitle.trim();
    if (!t) return;
    setError(null);
    startTransition(async () => {
      const r = await createSimRequestAction(t, urgent);
      if (!r.ok) return setError(r.error);
      setNewTitle('');
      setUrgent(false);
      setRunFilter(null);
      setChat('employee');
      await refresh('employee', null);
    });
  }

  const current = chats.find((c) => c.key === chat)!;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <FlaskConical className="size-5 text-brand" aria-hidden /> Pruebas simuladas
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Casos reales de punta a punta en un <b>entorno de pruebas aislado</b>: «Kiju IA (pruebas)» recibe los avisos y pulsa los botones como lo haría
            una persona. Nada sale a Telegram, ClickUp ni a la IA, y nada aparece en tus resúmenes ni en los de tu equipo.
          </p>
        </div>
        <Button onClick={() => run('all', 'todas')} disabled={pending || Boolean(running)}>
          {running === 'todas' ? <Loader2 className="animate-spin" /> : <Play />} Ejecutar todas
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Correctas" value={counts.ok} hint="En su última ejecución" icon={CheckCircle2} tone="success" />
        <StatCard label="Fallan" value={counts.fail} hint={counts.fail ? 'Mira sus pasos y la conversación' : 'Ninguna'} icon={XCircle} tone={counts.fail ? 'danger' : 'neutral'} />
        <StatCard label="Sin ejecutar" value={counts.never} hint="Nunca se han lanzado" icon={CircleDashed} tone="neutral" />
      </div>

      {(error || notice || running) && (
        <p role="status" className={cn('rounded-lg border px-3 py-2 text-sm', error ? 'border-destructive/40 bg-destructive-soft text-destructive' : 'bg-muted')}>
          {error ?? (running ? `Ejecutando ${running === 'todas' ? 'todas las pruebas' : `«${running}»`}… (unos segundos por prueba)` : notice)}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <Section title="Escenarios" description="Cada uno es un caso completo; el resultado es el de su última ejecución.">
          {scenarios.length === 0 ? (
            <EmptyState icon={FlaskConical} title="Aún no hay escenarios" />
          ) : (
            <div className="space-y-5">
              {areas.map((area) => (
                <div key={area}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{area}</h3>
                  <ul className="divide-y rounded-lg border">
                    {scenarios
                      .filter((s) => s.area === area)
                      .map((s) => {
                        const isOpen = open === s.key;
                        return (
                          <li key={s.key} className="p-3">
                            <div className="flex items-start gap-3">
                              <StatusIcon status={s.last?.status ?? null} className="mt-0.5 shrink-0" />
                              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(isOpen ? null : s.key)} aria-expanded={isOpen}>
                                <span className="flex items-center gap-1 font-medium">
                                  {s.title}
                                  <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} aria-hidden />
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  {s.last ? `${ago(s.last.startedAt)} · ${TRIGGER[s.last.trigger] ?? s.last.trigger}` : 'Sin ejecutar'}
                                  {s.history.length > 1 && (
                                    <span className="ml-2 inline-flex gap-0.5 align-middle" aria-label="Últimas ejecuciones">
                                      {s.history.slice(0, 8).reverse().map((h) => (
                                        <span key={h.id} className={cn('inline-block size-1.5 rounded-full', h.status === 'ok' ? 'bg-success' : h.status === 'fallo' ? 'bg-destructive' : 'bg-muted-foreground')} />
                                      ))}
                                    </span>
                                  )}
                                </span>
                              </button>
                              <Button size="sm" variant="outline" onClick={() => run([s.key], s.title)} disabled={pending || Boolean(running)} aria-label={`Ejecutar «${s.title}»`}>
                                {running === s.title ? <Loader2 className="animate-spin" /> : <Play />}
                              </Button>
                            </div>
                            {isOpen && (
                              <div className="mt-3 space-y-3 pl-7">
                                <p className="text-sm text-muted-foreground">{s.description}</p>
                                {s.last ? (
                                  <>
                                    {s.last.error && <p className="rounded-md bg-destructive-soft px-2 py-1 text-sm text-destructive">{s.last.error}</p>}
                                    <ol className="space-y-1 text-sm">
                                      {s.last.steps.map((st, i) => (
                                        <li key={i} className="flex gap-2">
                                          {st.ok ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" /> : <XCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />}
                                          <span>
                                            {st.label}
                                            {st.detail && <span className="block text-xs text-muted-foreground">{st.detail}</span>}
                                          </span>
                                        </li>
                                      ))}
                                    </ol>
                                    <Button size="sm" variant="ghost" onClick={() => showRun(s.last!.id, s.title)}>
                                      <MessageSquareText /> Ver su conversación
                                    </Button>
                                  </>
                                ) : (
                                  <p className="text-sm text-muted-foreground">Pulsa ▶ para lanzarla.</p>
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Section>

        <section aria-label="Telegram simulado" className="flex min-h-[560px] flex-col overflow-hidden rounded-xl border bg-card lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
          <div className="border-b p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Bot className="size-4 text-brand" aria-hidden /> Telegram simulado
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm" role="tablist">
              {chats.map((c) => (
                <button
                  key={c.key}
                  role="tab"
                  aria-selected={chat === c.key}
                  onClick={() => switchChat(c.key)}
                  className={cn('truncate rounded-md px-2 py-1', chat === c.key ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground')}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{current.role}</p>
            {runFilter && (
              <p className="mt-2 flex items-center justify-between gap-2 rounded-md bg-info-soft px-2 py-1 text-xs text-info">
                <span className="truncate">Solo la ejecución de «{runFilter.title}»</span>
                <button className="shrink-0 underline" onClick={clearFilter}>
                  Ver todo
                </button>
              </p>
            )}
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto bg-muted/40 p-3" aria-live="polite">
            {messages.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Sin mensajes todavía. Lanza una prueba o crea un encargo de prueba.</p>
            ) : (
              messages.map((m) =>
                m.direction === 'aviso' ? (
                  <p key={m.id} className="mx-auto w-fit max-w-[85%] rounded-full bg-foreground/80 px-3 py-1 text-center text-xs text-background">
                    {m.text}
                  </p>
                ) : (
                  <div key={m.id} className={cn('flex flex-col', m.direction === 'persona' ? 'items-end' : 'items-start')}>
                    <div
                      className={cn(
                        'max-w-[88%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                        m.direction === 'persona' ? 'rounded-br-sm bg-brand text-white' : 'rounded-bl-sm bg-background',
                        m.deleted && 'opacity-50'
                      )}
                    >
                      {m.direction === 'bot' ? (
                        <div className="whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: tgHtml(m.text) }} />
                      ) : (
                        <div className="whitespace-pre-wrap break-words">{m.text}</div>
                      )}
                      <div className={cn('mt-1 text-right text-[10px]', m.direction === 'persona' ? 'text-white/70' : 'text-muted-foreground')}>
                        {m.deleted ? 'borrado · ' : m.edited ? 'editado · ' : ''}
                        {fmtTime.format(new Date(m.at))}
                      </div>
                    </div>
                    {m.direction === 'bot' && m.buttons.length > 0 && !m.deleted && (
                      <div className="mt-1 grid w-[88%] gap-1">
                        {m.buttons.map((row, r) => (
                          <div key={r} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
                            {row.map((b, c) => (
                              <button
                                key={c}
                                type="button"
                                disabled={pending}
                                onClick={() => press(m, r, c)}
                                className="truncate rounded-lg border bg-background/80 px-2 py-1.5 text-xs font-medium hover:bg-background disabled:opacity-60"
                              >
                                {b.text}
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              )
            )}
            <div ref={endRef} />
          </div>

          <div className="space-y-2 border-t p-3">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Escribir como ${current.name}…`} maxLength={2000} aria-label="Mensaje" />
              <Button type="submit" size="icon" disabled={pending || !text.trim()} aria-label="Enviar">
                <Send />
              </Button>
            </form>
            {chat === 'employee' && (
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  createRequest();
                }}
              >
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Nuevo encargo de prueba…" maxLength={200} className="min-w-0 flex-1" aria-label="Título del encargo de prueba" />
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> urgente
                </label>
                <Button type="submit" size="sm" variant="outline" disabled={pending || !newTitle.trim()}>
                  <Plus /> Crear
                </Button>
              </form>
            )}
            <p className="text-[11px] text-muted-foreground">
              {runFilter ? 'Viendo una ejecución pasada; los botones actúan sobre el estado actual.' : 'Puedes pulsar los botones y escribir: es el mismo bot, pero aislado.'}{' '}
              <Badge tone="neutral" className="ml-1">
                {messages.length} mensajes
              </Badge>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
