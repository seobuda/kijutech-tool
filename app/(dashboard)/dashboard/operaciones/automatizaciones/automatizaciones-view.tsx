'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

function Card1({ card, hasBot }: { card: CardView; hasBot: boolean }) {
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
    <Card id={`auto-${card.key}`} className="scroll-mt-4" data-testid={`auto-${card.key}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              {card.title}
              {card.customized && <span className="ml-2 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-normal text-orange-700">personalizada</span>}
            </CardTitle>
            <CardDescription className="mt-1">{card.what}</CardDescription>
          </div>
          {card.canDisable && (
            <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              {enabled ? 'Encendida' : 'Apagada'}
              <Switch checked={enabled} disabled={pending} onCheckedChange={toggle} aria-label={`Encender o apagar: ${card.title}`} />
            </label>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {card.link && (
          <p className="text-xs text-muted-foreground">
            <Link href={card.link.href} className="text-orange-600 hover:underline">
              {card.link.label}
            </Link>
          </p>
        )}

        {card.fields.length > 0 && (
          <div className="flex flex-wrap items-end gap-4">
            {card.fields.map((f) => (
              <div key={f.key} className="space-y-1">
                {f.type === 'bool' ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={Boolean(vals[f.key])} onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.checked }))} />
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
                      className={f.type === 'times' ? 'w-52' : 'w-36'}
                      value={String(vals[f.key])}
                      onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                    />
                  </>
                )}
                {f.help && <p className="max-w-xs text-[11px] text-muted-foreground">{f.help}</p>}
                {f.type !== 'bool' && String(f.default) !== String(vals[f.key]) && (
                  <p className="text-[11px] text-muted-foreground">Por defecto: {String(f.default)}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {card.template && (
          <div className="space-y-2">
            <Label htmlFor={`${card.key}-text`} className="text-xs">Texto del mensaje</Label>
            <textarea
              id={`${card.key}-text`}
              ref={area}
              rows={Math.min(10, Math.max(3, text.split('\n').length + 1))}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
              <span>Huecos (clic para insertar):</span>
              {card.template.placeholders.map((p) => (
                <button key={p.name} type="button" title={p.label} onClick={() => insert(p.name)} className="rounded border border-gray-300 px-1.5 py-0.5 font-mono hover:bg-gray-50">
                  {`{${p.name}}`}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Formato de Telegram: &lt;b&gt;negrita&lt;/b&gt;, &lt;i&gt;cursiva&lt;/i&gt;, &lt;u&gt;subrayado&lt;/u&gt;. Si un hueco opcional (fecha, cliente…) viene vacío, su línea desaparece.
            </p>
            <div>
              <p className="mb-1 text-xs font-medium">Vista previa (datos de ejemplo)</p>
              {'error' in preview ? (
                <p className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{preview.error}</p>
              ) : (
                <div
                  className="whitespace-pre-wrap rounded-md border border-sky-200 bg-sky-50 p-3 text-sm [&_a]:text-sky-700 [&_a]:underline"
                  data-testid={`auto-${card.key}-preview`}
                  dangerouslySetInnerHTML={{ __html: preview.html }}
                />
              )}
            </div>
            {text.trim() !== card.template.defaultText.trim() && (
              <button type="button" className="text-xs text-orange-600 hover:underline" onClick={() => setText(card.template!.defaultText)}>
                Volver al texto por defecto
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {(card.fields.length > 0 || card.template) && (
            <Button size="sm" disabled={pending || !dirty || ('error' in preview && Boolean(card.template))} onClick={save} data-testid={`auto-${card.key}-save`}>
              Guardar cambios
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !hasBot}
            onClick={() => run(() => sendAutomationTestAction(card.key, card.template ? text : undefined), '', false)}
            data-testid={`auto-${card.key}-test`}
          >
            Enviarme una prueba
          </Button>
          {card.customized && (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`¿Restaurar «${card.title}» a sus valores por defecto?`)) run(() => resetAutomationAction(card.key), 'Restaurada a sus valores por defecto.');
              }}
            >
              Restaurar valores
            </Button>
          )}
        </div>
        {msg && <p className={`text-xs ${msg.type === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
      </CardContent>
    </Card>
  );
}

export function AutomatizacionesView({
  cards,
  upcoming,
  changes,
  titles,
  testMode,
  hasBot
}: {
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
    <div className="space-y-6 py-4">
      <div>
        <h1 className="text-lg font-medium">Automatizaciones</h1>
        <p className="text-sm text-muted-foreground">
          Todos los tiempos, interruptores y textos de lo que el sistema hace solo. Los cambios se aplican en el siguiente ciclo (unos segundos), sin tocar código.
          Las horas de entrada, comida y silencio de cada persona se editan en{' '}
          <Link href="/dashboard/operaciones/equipo" className="text-orange-600 hover:underline">Equipo</Link>.
        </p>
        {testMode && (
          <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
            Modo pruebas activo: todos los avisos llegan solo a tu Telegram y no se aplica el silencio de las fichas.
          </p>
        )}
        {!hasBot && <p className="mt-2 text-xs text-red-600">Configura primero el bot en la pestaña Telegram para poder enviar pruebas.</p>}
      </div>

      <section className="space-y-3" data-testid="proximos-envios">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Próximos envíos (24 h)</h2>
          <Button size="sm" variant="outline" onClick={() => router.refresh()}>Actualizar</Button>
        </div>
        {upcoming.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-300 p-4 text-sm text-muted-foreground">
            No hay nada programado para las próximas 24 horas (fines de semana, personas sin vincular, automatizaciones apagadas o sin encargos pendientes).
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Cuándo (hora de Madrid)</th>
                  <th className="px-3 py-2">Destinatario</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((u, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="whitespace-nowrap px-3 py-2">{u.now ? 'En cuanto toque el ciclo' : whenLabel(u.at)}</td>
                    <td className="px-3 py-2">{u.who}</td>
                    <td className="px-3 py-2">{u.kind}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{u.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Automatizaciones</h2>
        {cards.map((c) => (
          <Card1 key={c.key} card={c} hasBot={hasBot} />
        ))}
      </section>

      <section className="space-y-3" data-testid="registro-cambios">
        <h2 className="font-medium">Registro de cambios</h2>
        {changes.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-300 p-4 text-sm text-muted-foreground">Todavía no se ha cambiado ningún ajuste.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Cuándo</th>
                  <th className="px-3 py-2">Quién</th>
                  <th className="px-3 py-2">Automatización</th>
                  <th className="px-3 py-2">Cambio</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={c.id} className="border-t border-gray-100">
                    <td className="whitespace-nowrap px-3 py-2">{new Intl.DateTimeFormat('es-ES', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(new Date(c.at))}</td>
                    <td className="px-3 py-2">{c.who}</td>
                    <td className="px-3 py-2">{titles[c.key] ?? c.key}</td>
                    <td className="px-3 py-2 text-xs">{describe(c)}</td>
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
