'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { AlertTriangle, Loader2, Play, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Section } from '@/components/ui/page';
import { previewVoiceAction, saveVoiceSettingsAction } from '@/lib/agentes/actions';
import type { VoiceSettings } from '@/lib/agentes/voice';

const area = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-brand';
const SAMPLE = 'Hola Enric, ¿qué tal? Te cuento cómo va el día: Jesús ya está con el formulario de CM Ibérica y Mayelin termina hoy el artículo de Athos. ¿Quieres que mire algo más?';
const TONES: { label: string; text: string }[] = [
  { label: 'Compañero cercano', text: '' },
  { label: 'Profesional y sereno', text: 'Habla en español de España con acento peninsular, tono profesional, sereno y seguro, como un jefe de proyecto que informa a su director. Pausas naturales, sin prisa, nada de tono de locutor.' },
  { label: 'Enérgico y positivo', text: 'Habla en español de España con acento peninsular, tono enérgico, positivo y motivador, sonriendo al hablar, con entonación viva y natural, como un compañero animado. Sin exagerar.' }
];

export function VozView({ settings, defaultTone, voices, hasKey, agentVoices }: { settings: VoiceSettings; defaultTone: string; voices: string[]; hasKey: boolean; agentVoices: { name: string; voice: string | null }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [s, setS] = useState<VoiceSettings>(settings);
  const [text, setText] = useState(SAMPLE);
  const [audio, setAudio] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof VoiceSettings>(k: K, v: VoiceSettings[K]) => setS((x) => ({ ...x, [k]: v }));

  const preview = () =>
    start(async () => {
      setMsg(null);
      const r = await previewVoiceAction({ text, settings: s });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setAudio(`data:audio/mpeg;base64,${r.mp3}`);
    });
  const save = () =>
    start(async () => {
      const r = await saveVoiceSettingsAction(s);
      setMsg(r.ok ? { ok: true, text: 'Guardado: los próximos audios sonarán así.' } : { ok: false, text: r.error });
      router.refresh();
    });

  return (
    <div className="space-y-6">
      {!hasKey && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning-strong">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>No hay clave de OpenAI activa en IA y modelos: sin ella los agentes no entienden audios ni hablan.</p>
        </div>
      )}
      <Section title="Cómo suena" description="Prueba combinaciones y escucha el resultado antes de guardar. Cada prueba cuesta menos de un céntimo.">
        <div className="space-y-4 px-5 py-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              <span className="mb-1 block font-medium">Voz</span>
              <select className="h-9 w-full rounded-md border bg-background px-2" value={s.defaultVoice} onChange={(e) => set('defaultVoice', e.target.value)}>
                {voices.map((v) => (
                  <option key={v} value={v}>
                    {v}
                    {v === 'marin' || v === 'cedar' ? ' (recomendada)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block font-medium">Velocidad: {s.speed.toFixed(2)}×</span>
              <input type="range" min={0.8} max={1.3} step={0.05} value={s.speed} onChange={(e) => set('speed', Number(e.target.value))} className="w-full" aria-label="Velocidad" />
            </label>
            <label>
              <span className="mb-1 block font-medium">Modelo de voz</span>
              <Input value={s.ttsModel} onChange={(e) => set('ttsModel', e.target.value)} />
            </label>
          </div>
          <div>
            <span className="mb-1 block font-medium">Tono (instrucciones para la voz)</span>
            <div className="mb-2 flex flex-wrap gap-2">
              {TONES.map((t) => (
                <Button key={t.label} type="button" size="sm" variant="outline" onClick={() => set('tone', t.text || defaultTone)}>
                  {t.label}
                </Button>
              ))}
            </div>
            <textarea className={area} rows={4} value={s.tone} onChange={(e) => set('tone', e.target.value)} aria-label="Tono" />
          </div>
          <label className="block">
            <span className="mb-1 block font-medium">Frase de prueba</span>
            <textarea className={area} rows={3} maxLength={600} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={preview} disabled={pending || !hasKey || !text.trim()}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />} Escuchar
            </Button>
            <Button variant="outline" onClick={save} disabled={pending}>
              <Save className="size-4" aria-hidden /> Guardar
            </Button>
            {msg && (
              <p role="status" className={msg.ok ? 'text-success' : 'text-destructive'}>
                {msg.text}
              </p>
            )}
          </div>
          {audio && <audio controls autoPlay src={audio} className="w-full" />}
          <p className="text-xs text-muted-foreground">
            La voz de cada agente se puede cambiar en su ficha (Agentes → Editar → Voz).{' '}
            {agentVoices.map((a) => `${a.name}: ${a.voice ?? 'la de aquí'}`).join(' · ')}
          </p>
        </div>
      </Section>
      <Section title="Cómo entiende los audios" description="Modelos de transcripción en orden: si el primero no está disponible se usa el siguiente. Siempre en español.">
        <div className="px-5 py-4 text-sm">
          <Input value={s.sttModels.join(', ')} onChange={(e) => set('sttModels', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} aria-label="Modelos de transcripción" />
          <p className="mt-2 text-xs text-muted-foreground">Por defecto «gpt-transcribe» y, de reserva, «gpt-4o-mini-transcribe». Guarda con el botón de arriba.</p>
        </div>
      </Section>
    </div>
  );
}
