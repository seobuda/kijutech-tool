// 16-17 nov 2026: con Sonnet 5.5 la respuesta empieza con un bloque `thinking` y el adaptador leía solo el primero,
// así que «crear encargo» por Telegram recibía un texto vacío. Sin red ni base de datos.
import { afterAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { anthropicAdapter, anthropicStop, anthropicText } from '@/lib/ai/adapters/anthropic';
import { finishResponse } from '@/lib/ai/adapters/common';
import { geminiOutputTokens, geminiStop, geminiText } from '@/lib/ai/adapters/gemini';
import { openaiAdapter } from '@/lib/ai/adapters/openai';
import { AIBilledError } from '@/lib/ai/types';
import { callAI } from '@/lib/ai/gateway';
import { encrypt } from '@/lib/ai/encryption';
import { db } from '@/lib/db/drizzle';
import { aiJobs, aiProviderSettings, tenants } from '@/lib/db/schema';

describe('adaptador de Anthropic: texto de la respuesta', () => {
  it('salta los bloques de pensamiento y une todos los de texto', () => {
    expect(
      anthropicText({
        content: [{ type: 'thinking', text: undefined }, { type: 'text', text: '{"encargos":' }, { type: 'text', text: '[]}' }],
        stop_reason: 'end_turn'
      })
    ).toBe('{"encargos":[]}');
  });

  it('sigue funcionando con una respuesta sin pensamiento', () => {
    expect(anthropicText({ content: [{ type: 'text', text: 'hola' }], stop_reason: 'end_turn' })).toBe('hola');
  });

  it('sin texto queda vacío (lo decide finishResponse)', () => {
    expect(anthropicText({ content: [{ type: 'thinking' }], stop_reason: 'max_tokens' })).toBe('');
    expect(anthropicText({})).toBe('');
  });
});

// I5 + I6: vacía, cortada o rechazada no es una respuesta válida en ningún proveedor; el error dice el motivo real.
describe('IA: respuestas inservibles en los cuatro adaptadores (I5, I6, I7)', () => {
  const base = { content: '', input_tokens: 10, output_tokens: 20, model: 'm', provider: 'anthropic' };
  it('finishResponse: vacía, cortada y rechazada lanzan AIBilledError con los tokens', () => {
    expect(() => finishResponse(base, 'cut', 'max_tokens')).toThrow(/límite de tokens antes de escribir/);
    expect(() => finishResponse({ ...base, content: '{"a":' }, 'cut', 'max_tokens')).toThrow(/cortó la respuesta/);
    expect(() => finishResponse({ ...base, content: 'no' }, 'refusal', 'refusal')).toThrow(/rechazó/);
    expect(() => finishResponse(base, 'ok', 'end_turn')).toThrow(/vacía/);
    try {
      finishResponse(base, 'cut', 'max_tokens');
    } catch (e) {
      expect(e).toBeInstanceOf(AIBilledError);
      expect((e as AIBilledError).usage.output_tokens).toBe(20);
    }
    expect(finishResponse({ ...base, content: 'hola' }, 'ok', 'end_turn').content).toBe('hola');
    expect(anthropicStop('max_tokens')).toBe('cut');
    expect(anthropicStop('refusal')).toBe('refusal');
  });
  it('Gemini: une las partes sin el pensamiento, cuenta el pensamiento como salida y reconoce el corte', () => {
    const d = { candidates: [{ content: { parts: [{ text: 'pienso…', thought: true }, { text: 'ho' }, { text: 'la' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2, thoughtsTokenCount: 30 } };
    expect(geminiText(d)).toBe('hola');
    expect(geminiOutputTokens(d)).toBe(32);
    expect(geminiStop(d)).toBe('ok');
    expect(geminiStop({ candidates: [{ finishReason: 'MAX_TOKENS' }] })).toBe('cut');
    expect(geminiStop({ promptFeedback: { blockReason: 'SAFETY' } })).toBe('refusal');
  });
  it('OpenAI pide max_completion_tokens y una respuesta vacía falla', async () => {
    const f = vi.fn(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body)).max_completion_tokens).toBe(100);
      return new Response(JSON.stringify({ choices: [{ message: { content: '' }, finish_reason: 'length' }], usage: { prompt_tokens: 3, completion_tokens: 100 } }), { status: 200 });
    });
    vi.stubGlobal('fetch', f);
    await expect(openaiAdapter.sendMessage([{ role: 'user', content: 'x' }], 'gpt-5', 'k', 100)).rejects.toBeInstanceOf(AIBilledError);
    vi.unstubAllGlobals();
  });
});

// I3 (revisión del 17 nov): una respuesta vacía se cobra igual; su coste debe quedar en ai_jobs aunque el job falle.
describe('IA: lo cobrado en una llamada fallida cuenta para el gasto (I3)', () => {
  const SLUG = 'seg-test-ia-cobrado';
  const empty = () =>
    new Response(JSON.stringify({ content: [{ type: 'thinking' }], stop_reason: 'max_tokens', usage: { input_tokens: 1000, output_tokens: 500 } }), { status: 200 });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await db.delete(tenants).where(eq(tenants.slug, SLUG));
  });

  it('el adaptador lanza AIBilledError con los tokens', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => empty()));
    const err = await anthropicAdapter.sendMessage([{ role: 'user', content: 'hola' }], 'claude-haiku-5-5', 'k').catch((e) => e);
    expect(err).toBeInstanceOf(AIBilledError);
    expect((err as AIBilledError).usage).toMatchObject({ input_tokens: 1000, output_tokens: 500, provider: 'anthropic' });
    vi.unstubAllGlobals();
  });

  it('callAI guarda tokens y coste en el job fallido', async () => {
    await db.delete(tenants).where(eq(tenants.slug, SLUG));
    const [t] = await db.insert(tenants).values({ name: 'Prueba IA cobrada', slug: SLUG, aiKeyModeAllowed: 'byok_required' }).returning();
    const k = encrypt('clave-falsa');
    await db.insert(aiProviderSettings).values({ tenantId: t.id, provider: 'anthropic', model: 'claude-haiku-5-5', apiKeyEncrypted: k.encrypted, apiKeyIv: k.iv, isActive: true, isDefault: true, keyMode: 'byok' });
    vi.stubGlobal('fetch', vi.fn(async () => empty()));
    await expect(callAI({ tenantId: t.id, function: 'prueba_cobrado', messages: [{ role: 'user', content: 'hola' }] })).rejects.toThrow(/vacía/);
    vi.unstubAllGlobals();
    const [job] = await db.select().from(aiJobs).where(eq(aiJobs.tenantId, t.id));
    expect(job.status).toBe('failed');
    expect(job.inputTokens).toBe(1000);
    expect(job.outputTokens).toBe(500);
    expect(Number(job.estimatedCost)).toBeGreaterThan(0);
  });
});
