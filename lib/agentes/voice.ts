import 'server-only';

// Voz de los agentes (13 nov 2026) con la clave de OpenAI guardada en IA y modelos (la misma de la IA de reserva).
//   - Entrada: los audios de Telegram (OGG/Opus) se transcriben en español con el primer modelo disponible de la lista
//     (por defecto «gpt-transcribe» y, de reserva, «gpt-4o-mini-transcribe»). Máximo 25 MB por audio (límite de OpenAI).
//   - Salida: el texto de la respuesta se convierte en voz (por defecto «gpt-4o-mini-tts», voz «marin»). Para Telegram en
//     Opus: se comprueba la cabecera «OggS» antes de mandarlo como nota de voz. Para escuchar en la web, en MP3.
//   - Ajustes (Agentes → Voz): modelo de voz, velocidad, tono (instrucciones) y modelos de transcripción. Se guardan como la
//     integración «voz» en agt_integrations (es un servicio externo; sin tabla nueva). La voz concreta va en la ficha del
//     agente. OpenAI anuncia la retirada de gpt-4o-mini-tts en enero de 2027: se cambia aquí sin tocar código.
// Cada llamada queda en ai_jobs con un coste APROXIMADO (precio de lista de OpenAI por minuto o por carácter, por confirmar).
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { agtIntegrations, aiJobs, aiProviderSettings } from '@/lib/db/schema';
import { decrypt } from '@/lib/ai/encryption';

export const VOICES = ['marin', 'cedar', 'coral', 'sage', 'nova', 'ash', 'ballad', 'verse', 'alloy', 'echo', 'shimmer', 'onyx', 'fable'] as const;
const STT_USD_PER_MIN = 0.006; // aproximado (por confirmar con la página de precios de OpenAI)
const TTS_USD_PER_1K_CHARS = 0.015; // aproximado

export const DEFAULT_TONE =
  'Eres un compañero de trabajo español hablando por una nota de voz. Habla en español de España con acento peninsular, de forma cercana, cálida y natural, con entonación expresiva y pausas naturales entre frases, como en una conversación real; nada de tono de locutor ni de lectura. Ritmo tranquilo.';

export type VoiceSettings = {
  ttsModel: string;
  defaultVoice: string;
  speed: number; // 0.25–4; 1 = normal
  tone: string; // instrucciones de estilo para el modelo de voz
  sttModels: string[];
};

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  ttsModel: process.env.AGT_TTS_MODEL || 'gpt-4o-mini-tts',
  defaultVoice: 'marin',
  speed: 1,
  tone: DEFAULT_TONE,
  sttModels: (process.env.AGT_STT_MODELS || 'gpt-transcribe,gpt-4o-mini-transcribe').split(',').map((s) => s.trim()).filter(Boolean)
};

const VOICE_PROVIDER = 'voz';

export async function getVoiceSettings(tenantId: string): Promise<VoiceSettings> {
  const [r] = await db.select({ config: agtIntegrations.config }).from(agtIntegrations).where(and(eq(agtIntegrations.tenantId, tenantId), eq(agtIntegrations.provider, VOICE_PROVIDER))).limit(1);
  const c = (r?.config ?? {}) as Partial<VoiceSettings>;
  return {
    ttsModel: typeof c.ttsModel === 'string' && c.ttsModel ? c.ttsModel : DEFAULT_VOICE_SETTINGS.ttsModel,
    defaultVoice: typeof c.defaultVoice === 'string' && (VOICES as readonly string[]).includes(c.defaultVoice) ? c.defaultVoice : DEFAULT_VOICE_SETTINGS.defaultVoice,
    speed: typeof c.speed === 'number' && c.speed >= 0.25 && c.speed <= 4 ? c.speed : DEFAULT_VOICE_SETTINGS.speed,
    tone: typeof c.tone === 'string' && c.tone.trim() ? c.tone : DEFAULT_VOICE_SETTINGS.tone,
    sttModels: Array.isArray(c.sttModels) && c.sttModels.length ? c.sttModels.map(String) : DEFAULT_VOICE_SETTINGS.sttModels
  };
}

export async function saveVoiceSettings(tenantId: string, s: VoiceSettings): Promise<void> {
  const values = { status: 'conectada', config: s, updatedAt: new Date() };
  await db
    .insert(agtIntegrations)
    .values({ tenantId, provider: VOICE_PROVIDER, ...values })
    .onConflictDoUpdate({ target: [agtIntegrations.tenantId, agtIntegrations.provider], set: values });
}

/** Clave de OpenAI activa (de plataforma o propia). */
export async function getOpenAiKey(tenantId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(aiProviderSettings)
    .where(and(eq(aiProviderSettings.provider, 'openai'), eq(aiProviderSettings.isActive, true), inArray(aiProviderSettings.keyMode, ['platform', 'byok'])))
    .orderBy(desc(aiProviderSettings.isDefault));
  const row = rows.find((r) => (r.keyMode === 'platform' || r.tenantId === tenantId) && r.apiKeyEncrypted && r.apiKeyIv);
  return row ? decrypt(row.apiKeyEncrypted!, row.apiKeyIv!) : null;
}

async function logJob(tenantId: string, fn: string, model: string, ok: boolean, cost: number | null, input: Record<string, unknown>, error?: string) {
  await db.insert(aiJobs).values({
    tenantId,
    function: fn,
    status: ok ? 'completed' : 'failed',
    provider: 'openai',
    model,
    input,
    estimatedCost: cost !== null ? cost.toFixed(6) : null,
    error: error ?? null,
    completedAt: new Date()
  });
}

const extFor = (mime: string) => (/mpeg|mp3/.test(mime) ? 'mp3' : /mp4|m4a|aac/.test(mime) ? 'm4a' : /wav/.test(mime) ? 'wav' : /webm/.test(mime) ? 'webm' : 'ogg');

export type Transcription = { ok: true; text: string; model: string } | { ok: false; error: string };

export async function transcribe(tenantId: string, audio: { data: ArrayBuffer; mimeType: string; seconds: number | null }, fn = 'agt_voz_entrada'): Promise<Transcription> {
  const key = await getOpenAiKey(tenantId);
  if (!key) return { ok: false, error: 'No hay clave de OpenAI activa (IA y modelos): hace falta para entender audios.' };
  if (audio.data.byteLength > 25 * 1024 * 1024) return { ok: false, error: 'El audio pasa de 25 MB.' };
  const { sttModels } = await getVoiceSettings(tenantId);
  let lastError = '';
  for (const model of sttModels) {
    const form = new FormData();
    form.append('model', model);
    form.append('file', new Blob([audio.data], { type: audio.mimeType.split(';')[0] || 'audio/ogg' }), `audio.${extFor(audio.mimeType)}`);
    if (model === 'gpt-transcribe') form.append('languages[]', 'es');
    else form.append('language', 'es');
    form.append('prompt', 'Conversación de trabajo de una agencia de marketing digital (SEO, Google Ads, WordPress, ClickUp). Nombres del equipo y de clientes.');
    try {
      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(90_000) });
      if (!res.ok) {
        lastError = `OpenAI (${res.status})`;
        continue; // modelo no disponible o parámetro no aceptado: se prueba el siguiente
      }
      const json = (await res.json()) as { text?: string };
      const cost = audio.seconds ? (audio.seconds / 60) * STT_USD_PER_MIN : null;
      await logJob(tenantId, fn, model, true, cost, { seconds: audio.seconds, bytes: audio.data.byteLength });
      return { ok: true, text: (json.text ?? '').trim(), model };
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'error de red';
    }
  }
  await logJob(tenantId, fn, sttModels[0] ?? 'stt', false, null, { seconds: audio.seconds }, lastError);
  return { ok: false, error: `No he podido transcribir el audio (${lastError}).` };
}

/** Texto para leer en voz alta: sin HTML, enlaces, emojis ni viñetas; recortado (lo largo se lee en el mensaje escrito). */
export function speakableText(html: string, max = 1200): string {
  let t = html
    .replace(/<a [^>]*>(.*?)<\/a>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/https?:\/\/\S+/g, 'el enlace del mensaje')
    .replace(/\p{Extended_Pictographic}|️|‍/gu, '')
    .replace(/^\s*[—–\-•·*]\s+/gm, '')
    .replace(/[—–]/g, ', ')
    .replace(/[•·]/g, ',')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, '. ')
    .replace(/\s*\.\s*\./g, '.')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,])/g, '$1')
    .trim();
  if (t.length > max) t = `${t.slice(0, t.lastIndexOf('.', max) > max * 0.5 ? t.lastIndexOf('.', max) + 1 : max)} El resto te lo dejo por escrito.`;
  return t;
}

export const isOgg = (b: Uint8Array) => b.length > 4 && b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53; // «OggS»

export type SpeakOptions = { format?: 'opus' | 'mp3'; override?: Partial<VoiceSettings> & { voice?: string }; fn?: string };

export async function speak(tenantId: string, text: string, voice: string | null, opts: SpeakOptions = {}): Promise<{ ok: true; audio: Uint8Array; ogg: Uint8Array } | { ok: false; error: string }> {
  const key = await getOpenAiKey(tenantId);
  if (!key) return { ok: false, error: 'Sin clave de OpenAI (IA y modelos).' };
  const s = { ...(await getVoiceSettings(tenantId)), ...(opts.override ?? {}) };
  const input = text.slice(0, 4000);
  if (!input) return { ok: false, error: 'Nada que decir.' };
  const chosen = opts.override?.voice ?? voice ?? s.defaultVoice;
  const format = opts.format ?? 'opus';
  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: s.ttsModel,
        voice: (VOICES as readonly string[]).includes(chosen) ? chosen : 'marin',
        input,
        response_format: format,
        speed: s.speed,
        // tts-1 y tts-1-hd no admiten instrucciones de estilo.
        ...(/^tts-1/.test(s.ttsModel) ? {} : { instructions: s.tone.slice(0, 4000) })
      }),
      signal: AbortSignal.timeout(60_000)
    });
    if (!res.ok) {
      const detail = ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? '';
      await logJob(tenantId, opts.fn ?? 'agt_voz_salida', s.ttsModel, false, null, { chars: input.length }, `OpenAI (${res.status}) ${detail}`.slice(0, 300));
      return { ok: false, error: `OpenAI (${res.status})${detail ? `: ${detail.slice(0, 160)}` : ''}` };
    }
    const audio = new Uint8Array(await res.arrayBuffer());
    await logJob(tenantId, opts.fn ?? 'agt_voz_salida', s.ttsModel, true, (input.length / 1000) * TTS_USD_PER_1K_CHARS, { chars: input.length, format, voice: chosen });
    if (format === 'opus' && !isOgg(audio)) return { ok: false, error: 'El audio no viene en OGG.' };
    return { ok: true, audio, ogg: audio };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error de red' };
  }
}
