'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AlertTriangle, ArrowUpRight, CalendarClock, FlaskConical, History, RefreshCw, RotateCcw, Send } from 'lucide-react';
import { Badge } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { CleanupPanel, type CleanupPersonView } from '../cleanup-panel';
import {
  previewTemplateAction,
  resetAutomationAction,
  saveAutomationAction,
  sendAutomationTestAction,
  setWatchEnabledAction
} from '@/lib/operaciones/automation-actions';

export type CardView = {
  key: string;
  title: string;
  what: string;
  canDisable: boolean;
  enabled: boolean;
  link: { href: string; label: string } | null;
  fields: {
    key: string;
    label: string;
    type: 'number' | 'times' | 'time' | 'bool';
    unit: string | null;
    min: number | null;
    max: number | null;
    help: string | null;
    default: number | string | boolean;
    value: number | string | boolean;
  }[];
  template: {
    value: string;
    isDefault: boolean;
    defaultText: string;
    placeholders: { name: string; label: string }[];
    preview: string;
  } | null;
  customized: boolean;
};

type Upcoming = { at: number; who: string; kind: string; note: string | null; now: boolean };
type Change = { id: string; key: string; field: string; oldValue: string | null; newValue: string | null; at: number; who: string };
type Msg = { type: 'ok' | 'error'; text: string } | null;

const TZ = 'Europe/Madrid';
const dayOf = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ms));
const hhmm = (ms: number) => new Intl.DateTimeFormat('es-ES', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));

function whenLabel(ms: number): string {
  const today = dayOf(Date.now());
  const d = dayOf(ms);
  const tomorrow = dayOf(Date.now() + 24 * 3600_000);
  const label = d === today ? 'Hoy' : d === tomorrow ? 'Mañana' : d;
  return `${label} ${hhmm(ms)}`;
}

const FIELD_LABEL: Record<string, string> = { enabled: 'Encendida', template: 'Texto', reset: 'Restaurar valores' };

function Card1({ card, hasBot, extra }: { card: CardView; hasBot: boolean; extra?: React.ReactNode }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(card.enabled);
  const [vals, setVals] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(card.fields.map((f) => [f.key, f.type === 'bool' ? Boolean(f.value) : String(f.value)]))
  );
  const [text, setText] = useState(card.template?.value ?? '');
  const [preview, setPreview] = useState<{ html: string } | { error: string }>({ html: card.template?.preview ?? '' });
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);

  // Si el servidor refresca la tarjeta (guardar, restaurar), se vuelve a leer su estado.
  useEffect(() => {
    setEnabled(card.enabled);
    setVals(Object.fromEntries(card.fields.map((f) => [f.key, f.type === 'bool' ? Boolean(f.value) : String(f.value)])));
    setText(card.template?.value ?? '');
    setPreview({ html: card.template?.preview ?? '' });
  }, [card]);

  // Vista previa en vivo con datos de ejemplo (espera a que se deje de escribir).
  useEffect(() => {
    if (!card.template) return;
    const t = setTimeout(async () => {
      const r = await previewTemplateAction(card.key, text);
      setPreview(r.ok ? { html: r.html } : { error: r.error });
    }, 350);
    return () => clearTimeout(t);
  }, [text, card.key, card.template]);

  const dirty =
    card.fields.some((f) => String(vals[f.key]) !== String(f.value)) || (card.template ? text.trim() !== card.template.value.trim() : false);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, ok: string, refresh = true) =>
    startTransition(async () => {
      setMsg(null);
      const r = await fn();
      setMsg(r.ok ? { type: 'ok', text: r.message ?? ok } : { type: 'error', text: r.error ?? 'Error' });
      if (refresh && r.ok) router.refresh();
    });

  const toggle = (next: boolean) => {
    const prev = enabled;
    setEnabled(next);
    startTransition(async () => {
      setMsg(null);
      const r = card.key === 'watch' ? await setWatchEnabledAction(next) : await saveAutomationAction(card.key, { enabled: next });
      if (r.ok) {
        setMsg({ type: 'ok', text: (r as { message?: string }).message ?? (next ? 'Encendida.' : 'Apagada.') });
        router.refresh();
      } else {
        setEnabled(prev);
        setMsg({ type: 'error', text: r.error });
      }
    });
  };

  const save = () =>
    run(
      () =>
        saveAutomationAction(card.key, {
          config: Object.fromEntries(card.fields.map((f) => [f.key, f.type === 'bool' ? vals[f.key] : vals[f.key]])),
          ...(card.template ? { template: text } : {})
        }),
      'Guardado. Se aplica en el próximo ciclo, sin reiniciar nada.'
    );

  const insert = (name: string) => {
    const el = area.current;
    const tag = `{${name}}`;
    if (!el) return setText((t) => t + tag);
    const s = el.selectionStart ?? text.length;
    const e = el.selectionEnd ?? text.length;
    setText(text.slice(0, s) + tag + text.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + tag.length, s + tag.length);
    });
  };

  return (
    <article
      id={`auto-${card.key}`}
      className={cn(
        'scroll-mt-4 rounded-xl border bg-card shadow-xs transition-colors',
        card.canDisable && !enabled && 'bg-muted/30'
      )}
      data-testid={`auto-${card.key}`}
      aria-labelledby={`auto-${card.key}-titulo`}
    >
      <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h3 id={`auto-${card.key}-titulo`} className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
            {card.title}
            {card.customized && <Badge tone="brand">personalizada</Badge>}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">{card.what}</p>
          {card.link && (
            <Link
              href={card.link.href}
              className="mt-1.5 inline-flex items-center gap-1 rounded-sm text-xs font-medium text-brand hover:underline"
            >
              {card.link.label}
              <ArrowUpRight className="size-3" aria-hidden />
            </Link>
          )}
        </div>
        {card.canDisable && (
          <label className="flex shrink-0 items-center gap-2.5 rounded-full border bg-background py-1 pr-1 pl-3 text-xs font-medium">
            <span className={enabled ? 'text-success' : 'text-muted-foreground'}>{enabled ? 'Encendida' : 'Apagada'}</span>
            <Switch checked={enabled} disabled={pending} onCheckedChange={toggle} aria-label={`Encender o apagar: ${card.title}`} />
          </label>
        )}
      </header>

      <div className="space-y-5 px-5 pb-4">
        {card.fields.length > 0 && (
          <div className="grid gap-4 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {card.fields.map((f) => (
              <div key={f.key} className="min-w-0 space-y-1.5">
                {f.type === 'bool' ? (
                  <label className="flex items-center gap-2 pt-1 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--brand)]"
                      checked={Boolean(vals[f.key])}
                      onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.checked }))}
                    />
                    {f.label}
                  </label>
                ) : (
                  <>
                    <Label htmlFor={`${card.key}-${f.key}`} className="text-xs">
                      {f.label}
                      {f.type === 'number' && f.min !== null ? ` (${f.min}–${f.max}${f.unit ? ` ${f.unit}` : ''})` : f.unit ? ` (${f.unit})` : ''}
                    </Label>
                    <Input
                      id={`${card.key}-${f.key}`}
                      type={f.type === 'number' ? 'number' : f.type === 'time' ? 'time' : 'text'}
                      min={f.min ?? undefined}
                      max={f.max ?? undefined}
                      className="w-full bg-background"
                      value={String(vals[f.key])}
                      onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                    />
                  </>
                )}
                {f.help && <p className="text-[11px] text-muted-foreground text-pretty">{f.help}</p>}
                {f.type !== 'bool' && String(f.default) !== String(vals[f.key]) && (
                  <p className="text-[11px] text-warning-strong">Por defecto: {String(f.default)}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {card.template && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor={`${card.key}-text`} className="text-xs">
                Texto del mensaje
              </Label>
              <textarea
                id={`${card.key}-text`}
                ref={area}
                rows={Math.min(10, Math.max(3, text.split('\n').length + 1))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                <span>Huecos (clic para insertar):</span>
                {card.template.placeholders.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    title={p.label}
                    aria-label={`Insertar ${p.label}`}
                    onClick={() => insert(p.name)}
                    className="rounded-md border border-input bg-background px-1.5 py-0.5 font-mono transition-colors hover:border-brand/50 hover:bg-brand-soft hover:text-brand"
                  >
                    {`{${p.name}}`}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground text-pretty">
                Formato de Telegram: &lt;b&gt;negrita&lt;/b&gt;, &lt;i&gt;cursiva&lt;/i&gt;, &lt;u&gt;subrayado&lt;/u&gt;. Si un hueco opcional (fecha, cliente…) viene vacío, su línea desaparece.
              </p>
              {text.trim() !== card.template.defaultText.trim() && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-brand hover:underline"
                  onClick={() => setText(card.template!.defaultText)}
                >
                  <RotateCcw className="size-3" aria-hidden />
                  Volver al texto por defecto
                </button>
              )}
            </div>
            <div className="min-w-0">
              <p className="mb-2 text-xs font-medium">Vista previa (datos de ejemplo)</p>
              {'error' in preview ? (
                <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive-soft p-3 text-xs text-destructive">
                  {preview.error}
                </p>
              ) : (
                <div className="rounded-xl border bg-muted/40 p-3">
                  <div
                    className="max-w-sm whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-info/30 bg-info-soft px-3.5 py-2.5 text-sm shadow-xs break-words [&_a]:text-info [&_a]:underline"
                    data-testid={`auto-${card.key}-preview`}
                    dangerouslySetInnerHTML={{ __html: preview.html }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {extra}
      </div>

      <footer className="flex flex-col gap-2 border-t bg-muted/20 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-h-4 text-xs">
          {msg ? (
            <p role="status" className={msg.type === 'ok' ? 'text-success' : 'text-destructive'}>
              {msg.text}
            </p>
          ) : dirty ? (
            <p className="text-warning-strong">Cambios sin guardar</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {card.customized && (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`¿Restaurar «${card.title}» a sus valores por defecto?`)) run(() => resetAutomationAction(card.key), 'Restaurada a sus valores por defecto.');
              }}
            >
              <RotateCcw aria-hidden />
              Restaurar valores
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !hasBot}
            onClick={() => run(() => sendAutomationTestAction(card.key, card.template ? text : undefined), '', false)}
            data-testid={`auto-${card.key}-test`}
          >
            <Send aria-hidden />
            Enviarme una prueba
          </Button>
          {(card.fields.length > 0 || card.template) && (
            <Button
              size="sm"
              className="bg-brand text-white hover:bg-brand/90"
              disabled={pending || !dirty || ('error' in preview && Boolean(card.template))}
              onClick={save}
              data-testid={`auto-${card.key}-save`}
            >
              Guardar cambios
            </Button>
          )}
        </div>
      </footer>
    </article>
  );
}

export function AutomatizacionesView({
  cards,
  upcoming,
  changes,
  titles,
  testMode,
  hasBot,
  cleanupPeople
}: {
  cleanupPeople: CleanupPersonView[];
  cards: CardView[];
  upcoming: Upcoming[];
  changes: Change[];
  titles: Record<string, string>;
  testMode: boolean;
  hasBot: boolean;
}) {
  const router = useRouter();
  const describe = (c: Change) => {
    const field = FIELD_LABEL[c.field] ?? c.field.replace('config.', '');
    if (c.field === 'template') return 'Texto del mensaje modificado';
    return `${field}: ${c.oldValue ?? '—'} → ${c.newValue ?? '—'}`;
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h2 className="text-[15px] font-semibold">Automatizaciones</h2>
          <p className="mt-0.5 text-sm text-muted-foreground text-pretty">
            Todos los tiempos, interruptores y textos de lo que el sistema hace solo. Los cambios se aplican en el siguiente ciclo (unos segundos), sin tocar código.
            Las horas de entrada, comida y silencio de cada persona se editan en{' '}
            <Link href="/dashboard/operaciones/equipo" className="rounded-sm font-medium text-brand hover:underline">
              Equipo
            </Link>
            .
          </p>
        </div>
        {testMode && (
          <p className="flex items-start gap-2 rounded-lg border border-warning/45 bg-warning-soft px-3 py-2 text-xs text-warning-strong">
            <FlaskConical className="mt-px size-3.5 shrink-0" aria-hidden />
            Modo pruebas activo: todos los avisos llegan solo a tu Telegram y no se aplica el silencio de las fichas.
          </p>
        )}
        {!hasBot && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive-soft px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
            Configura primero el bot en la pestaña Telegram para poder enviar pruebas.
          </p>
        )}
        {cards.length > 1 && (
          <nav aria-label="Ir a una automatización" className="flex flex-wrap gap-1.5">
            {cards.map((c) => (
              <a
                key={c.key}
                href={`#auto-${c.key}`}
                className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground"
              >
                {c.canDisable && (
                  <span
                    aria-hidden
                    className={cn('size-1.5 rounded-full', c.enabled ? 'bg-success' : 'bg-muted-foreground/40')}
                  />
                )}
                {c.title}
              </a>
            ))}
          </nav>
        )}
      </div>

      <section className="overflow-hidden rounded-xl border bg-card shadow-xs" data-testid="proximos-envios" aria-labelledby="proximos-titulo">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
            <h3 id="proximos-titulo" className="text-[15px] font-semibold">
              Próximos envíos (24 h)
            </h3>
            {upcoming.length > 0 && <Badge tone="neutral">{upcoming.length}</Badge>}
          </div>
          <Button size="sm" variant="outline" onClick={() => router.refresh()}>
            <RefreshCw aria-hidden />
            Actualizar
          </Button>
        </div>
        {upcoming.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground text-pretty">
            No hay nada programado para las próximas 24 horas (fines de semana, personas sin vincular, automatizaciones apagadas o sin encargos pendientes).
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Cuándo (hora de Madrid)</th>
                  <th scope="col">Destinatario</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((u, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap">
                      {u.now ? <Badge tone="info" dot>En cuanto toque el ciclo</Badge> : whenLabel(u.at)}
                    </td>
                    <td className="whitespace-nowrap">{u.who}</td>
                    <td className="whitespace-nowrap">{u.kind}</td>
                    <td className="text-xs text-muted-foreground">{u.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="automatizaciones-lista">
        <h3 id="automatizaciones-lista" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Automatizaciones
        </h3>
        {cards.map((c) => (
          <Card1
            key={c.key}
            card={c}
            hasBot={hasBot}
            extra={c.key === 'cleanup' ? <CleanupPanel people={cleanupPeople} testMode={testMode} /> : undefined}
          />
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-xs" data-testid="registro-cambios" aria-labelledby="registro-titulo">
        <div className="flex items-center gap-2 border-b px-5 py-3.5">
          <History className="size-4 text-muted-foreground" aria-hidden />
          <h3 id="registro-titulo" className="text-[15px] font-semibold">
            Registro de cambios
          </h3>
        </div>
        {changes.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Todavía no se ha cambiado ningún ajuste.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Cuándo</th>
                  <th scope="col">Quién</th>
                  <th scope="col">Automatización</th>
                  <th scope="col">Cambio</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={c.id}>
                    <td className="whitespace-nowrap text-muted-foreground">
                      {new Intl.DateTimeFormat('es-ES', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(new Date(c.at))}
                    </td>
                    <td className="whitespace-nowrap">{c.who}</td>
                    <td>{titles[c.key] ?? c.key}</td>
                    <td className="text-xs">{describe(c)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
