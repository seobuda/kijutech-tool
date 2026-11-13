import 'server-only';

// Voz de los agentes (13 nov 2026) con la clave de OpenAI guardada en IA y modelos (la misma de la IA de reserva).
//   - Entrada: los audios de Telegram (OGG/Opus) se transcriben con «gpt-transcribe» en español; si el modelo no está
//     disponible se prueba «gpt-4o-mini-transcribe». Máximo 25 MB por audio (límite de OpenAI).
//   - Salida: el texto de la respuesta se convierte en voz con «gpt-4o-mini-tts» en formato Opus. Telegram necesita
//     OGG/Opus para una nota de voz: se comprueba la cabecera «OggS»; si no lo es, no se manda como nota de voz.
//     OpenAI anuncia la retirada de gpt-4o-mini-tts en enero de 2027: el modelo se cambia en AGT_TTS_MODEL.
// Cada llamada queda en ai_jobs con un coste APROXIMADO (precio por minuto o por carácter de lista de OpenAI, por confirmar).
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiJobs, aiProviderSettings } from '@/lib/db/schema';
import { decrypt } from '@/lib/ai/encryption';

const STT_MODELS = (process.env.AGT_STT_MODELS || 'gpt-transcribe,gpt-4o-mini-transcribe').split(',').map((s) => s.trim()).filter(Boolean);
const TTS_MODEL = process.env.AGT_TTS_MODEL || 'gpt-4o-mini-tts';
export const VOICES = ['marin', 'cedar', 'coral', 'sage', 'nova', 'ash', 'ballad', 'verse', 'alloy', 'echo', 'shimmer', 'onyx', 'fable'] as const;
const STT_USD_PER_MIN = 0.006; // aproximado (por confirmar con la página de precios de OpenAI)
const TTS_USD_PER_1K_CHARS = 0.015; // aproximado

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
  let lastError = '';
  for (const model of STT_MODELS) {
    const form = new FormData();
    form.append('model', model);
    form.append('file', new Blob([audio.data], { type: audio.mimeType.split(';')[0] || 'audio/ogg' }), `audio.${extFor(audio.mimeType)}`);
    if (model === 'gpt-transcribe') form.append('languages[]', 'es');
    else form.append('language', 'es');
    form.append('prompt', 'Conversación de trabajo de una agencia de marketing digital (SEO, Google Ads, WordPress, ClickUp). Nombres del equipo y de clientes.');
    try {
      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: AbortSignal.timeout(90_000)
      });
      if (!res.ok) {
        lastError = `OpenAI (${res.status})`;
        // Modelo no disponible o parámetro no aceptado: se prueba el siguiente. Otros errores, también (uno de reserva).
        continue;
      }
      const json = (await res.json()) as { text?: string };
      const text = (json.text ?? '').trim();
      const cost = audio.seconds ? (audio.seconds / 60) * STT_USD_PER_MIN : null;
      await logJob(tenantId, fn, model, true, cost, { seconds: audio.seconds, bytes: audio.data.byteLength });
      return { ok: true, text, model };
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'error de red';
    }
  }
  await logJob(tenantId, fn, STT_MODELS[0] ?? 'stt', false, null, { seconds: audio.seconds }, lastError);
  return { ok: false, error: `No he podido transcribir el audio (${lastError}).` };
}

/** Texto para leer en voz alta: sin HTML ni enlaces, recortado (lo largo se lee en el mensaje escrito). */
export function speakableText(html: string, max = 1200): string {
  let t = html
    .replace(/<a [^>]*>(.*?)<\/a>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/https?:\/\/\S+/g, 'el enlace del mensaje')
    .replace(/[•·]/g, ',')
    .replace(/\n{2,}/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length > max) t = `${t.slice(0, t.lastIndexOf('.', max) > max * 0.5 ? t.lastIndexOf('.', max) + 1 : max)} El resto te lo dejo por escrito.`;
  return t;
}

export const isOgg = (b: Uint8Array) => b.length > 4 && b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53; // «OggS»

export async function speak(tenantId: string, text: string, voice: string | null): Promise<{ ok: true; ogg: Uint8Array } | { ok: false; error: string }> {
  const key = await getOpenAiKey(tenantId);
  if (!key) return { ok: false, error: 'Sin clave de OpenAI.' };
  const input = text.slice(0, 4000);
  if (!input) return { ok: false, error: 'Nada que decir.' };
  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: TTS_MODEL,
        voice: voice && (VOICES as readonly string[]).includes(voice) ? voice : 'marin',
        input,
        response_format: 'opus',
        instructions: 'Habla en español de España, con tono cercano, seguro y profesional, a ritmo natural, como un compañero de trabajo.'
      }),
      signal: AbortSignal.timeout(60_000)
    });
    if (!res.ok) {
      await logJob(tenantId, 'agt_voz_salida', TTS_MODEL, false, null, { chars: input.length }, `OpenAI (${res.status})`);
      return { ok: false, error: `OpenAI (${res.status})` };
    }
    const ogg = new Uint8Array(await res.arrayBuffer());
    await logJob(tenantId, 'agt_voz_salida', TTS_MODEL, true, (input.length / 1000) * TTS_USD_PER_1K_CHARS, { chars: input.length, ogg: isOgg(ogg) });
    if (!isOgg(ogg)) return { ok: false, error: 'El audio no viene en OGG.' };
    return { ok: true, ogg };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error de red' };
  }
}
