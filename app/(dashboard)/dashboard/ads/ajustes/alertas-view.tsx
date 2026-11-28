'use client';

// Ajustes del paso 2 de Google Ads (solo admin): avisos (modo sombra o encendidos), horario y días, tope de
// interrupciones al día, umbrales de partida de las reglas y «Evaluar ahora». Cada bloque guarda por separado y dice qué
// ha pasado. Los avisos salen solo por la cola de avisos del núcleo (al dueño) y nunca en modo simulado.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BellRing, CircleCheck, RefreshCw, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Section } from '@/components/ui/page';
import { evaluateAdsNowAction, saveAdsAlertSettingsAction } from '@/lib/ads/actions';
import { DEFAULT_THRESHOLDS, THRESHOLD_LIMITS, type Thresholds } from '@/lib/ads/thresholds';
import type { PublicAdsSettings } from '@/lib/ads/settings';

type Msg = { ok: boolean; text: string } | null;
function Flash({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p role="status" className={msg.ok ? 'flex items-start gap-1.5 text-sm text-success' : 'flex items-start gap-1.5 text-sm text-destructive'}>
      {msg.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <span>{msg.text}</span>
    </p>
  );
}

const DAYS = [
  { n: 1, label: 'L' },
  { n: 2, label: 'M' },
  { n: 3, label: 'X' },
  { n: 4, label: 'J' },
  { n: 5, label: 'V' },
  { n: 6, label: 'S' },
  { n: 7, label: 'D' }
];

export function AlertasView({ settings }: { settings: PublicAdsSettings }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [alertMsg, setAlertMsg] = useState<Msg>(null);
  const [thrMsg, setThrMsg] = useState<Msg>(null);
  const [evalMsg, setEvalMsg] = useState<Msg>(null);
  const [hours, setHours] = useState(settings.alertHours);
  const [days, setDays] = useState<number[]>(settings.alertDays.split(',').map(Number).filter(Boolean));
  const [max, setMax] = useState(String(settings.maxInterruptionsPerDay));
  const [thr, setThr] = useState<Record<string, string>>(Object.fromEntries(Object.entries(settings.thresholds).map(([k, v]) => [k, String(v)])));
  const isSim = settings.authMode === 'sim';
  const connected = settings.authMode !== 'none';

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  const saveAlerts = (enabled?: boolean) =>
    run(async () => {
      const r = await saveAdsAlertSettingsAction({ ...(enabled !== undefined ? { alertsEnabled: enabled } : {}), alertHours: hours, alertDays: days, maxInterruptionsPerDay: Number(max) });
      setAlertMsg(r.ok ? { ok: true, text: enabled === true ? 'Avisos encendidos: las interrupciones salen por Telegram (al dueño) en horario laboral, con el tope del día.' : enabled === false ? 'Avisos apagados: vuelve el modo sombra (se guardan y se ven en Hoy, sin enviar).' : 'Horario, días y tope guardados.' } : { ok: false, text: r.error });
    });
  const saveThresholds = (reset = false) =>
    run(async () => {
      const values = reset ? DEFAULT_THRESHOLDS : Object.fromEntries(Object.entries(thr).map(([k, v]) => [k, Number(String(v).replace(',', '.'))]));
      const r = await saveAdsAlertSettingsAction({ thresholds: values as Partial<Thresholds> });
      if (r.ok && reset) setThr(Object.fromEntries(Object.entries(DEFAULT_THRESHOLDS).map(([k, v]) => [k, String(v)])));
      setThrMsg(r.ok ? { ok: true, text: reset ? 'Umbrales vueltos a los de partida. Se aplican en la próxima evaluación.' : 'Umbrales guardados. Se aplican en la próxima evaluación (o pulsa «Evaluar ahora»).' } : { ok: false, text: r.error });
    });
  const evaluate = () =>
    run(async () => {
      const r = await evaluateAdsNowAction();
      setEvalMsg(r.ok ? { ok: true, text: `Evaluadas ${r.accounts} cuentas: ${r.opened} hallazgos nuevos y ${r.resolved} resueltos. Míralos en Google Ads → Hoy.` } : { ok: false, text: r.error });
    });

  return (
    <div id="avisos" className="space-y-6">
      <Section
        title="Avisos (paso 2)"
        description="Por defecto en modo sombra: los hallazgos se guardan y se ven en Hoy, pero no se envía nada. Encendidos, las interrupciones salen por la cola de avisos al dueño, solo en horario laboral y con un tope al día (lo demás va junto en un mensaje), y por la mañana un parte con 5 decisiones y 3 «para que lo sepas»."
        actions={<BellRing className="size-4 text-muted-foreground" aria-hidden />}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Switch aria-label="Encender los avisos" checked={settings.alertsEnabled} disabled={pending || isSim || !connected} onCheckedChange={(v) => saveAlerts(v)} />
            <span className="text-sm">{settings.alertsEnabled ? 'Avisos encendidos' : 'Modo sombra (no se envía nada)'}</span>
            {isSim && <span className="text-xs text-muted-foreground">En modo simulado no se encienden: las cuentas son inventadas.</span>}
            {!connected && <span className="text-xs text-muted-foreground">Conecta antes Google Ads.</span>}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm">
              Horario *
              <Input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="09:00-19:00" />
              <span className="text-xs text-muted-foreground">Hora de Madrid. Lo de fuera de horario sale al abrir el siguiente día laborable si sigue abierto.</span>
            </label>
            <fieldset className="flex flex-col gap-1 text-sm">
              <legend>Días *</legend>
              <div className="flex gap-1">
                {DAYS.map((d) => (
                  <Button key={d.n} type="button" size="sm" variant={days.includes(d.n) ? 'default' : 'outline'} aria-pressed={days.includes(d.n)} onClick={() => setDays(days.includes(d.n) ? days.filter((x) => x !== d.n) : [...days, d.n].sort())}>
                    {d.label}
                  </Button>
                ))}
              </div>
              <span className="text-xs text-muted-foreground">Los festivos de la agencia aún no se descuentan.</span>
            </fieldset>
            <label className="flex flex-col gap-1 text-sm">
              Interrupciones al día (máx.) *
              <Input type="number" min={0} max={10} value={max} onChange={(e) => setMax(e.target.value)} />
              <span className="text-xs text-muted-foreground">Por persona. A partir de ahí, todas juntas en un solo mensaje.</span>
            </label>
          </div>
          <Button size="sm" onClick={() => saveAlerts()} disabled={pending || !connected}>
            Guardar horario y tope
          </Button>
          <Flash msg={alertMsg} />
        </div>
      </Section>

      <Section title="Umbrales de las reglas" description="Valores de partida de la investigación (PRO-01, 05, 07, 08, 13 y 5.1). Se calibran en modo sombra antes de encender los avisos. Todo en la moneda de cada cuenta." actions={<SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden />}>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(THRESHOLD_LIMITS) as (keyof Thresholds)[]).map((k) => (
              <label key={k} className="flex flex-col gap-1 text-sm">
                <span>{THRESHOLD_LIMITS[k].label}</span>
                <Input type="number" step="any" min={THRESHOLD_LIMITS[k].min} max={THRESHOLD_LIMITS[k].max} value={thr[k] ?? ''} onChange={(e) => setThr({ ...thr, [k]: e.target.value })} />
                <span className="text-xs text-muted-foreground">
                  De {THRESHOLD_LIMITS[k].min} a {THRESHOLD_LIMITS[k].max} · de partida {DEFAULT_THRESHOLDS[k]}
                </span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => saveThresholds()} disabled={pending || !connected}>
              Guardar umbrales
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (window.confirm('¿Volver todos los umbrales a los valores de partida?')) saveThresholds(true);
              }}
              disabled={pending || !connected}
            >
              Volver a los de partida
            </Button>
          </div>
          <Flash msg={thrMsg} />
        </div>
      </Section>

      <Section title="Evaluar ahora" description="Pasa todas las reglas por todas las cuentas con lo ya descargado (no llama a Google). Normalmente se hace sola al terminar cada descarga.">
        <div className="space-y-2">
          <Button size="sm" variant="outline" onClick={evaluate} disabled={pending || !connected}>
            <RefreshCw aria-hidden /> Evaluar ahora
          </Button>
          <Flash msg={evalMsg} />
        </div>
      </Section>
    </div>
  );
}
