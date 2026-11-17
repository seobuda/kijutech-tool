// 16-17 nov 2026: con Sonnet 5.5 la respuesta empieza con un bloque `thinking` y el adaptador leía solo el primero,
// así que «crear encargo» por Telegram recibía un texto vacío. Sin red ni base de datos.
import { afterAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { anthropicAdapter, anthropicText } from '@/lib/ai/adapters/anthropic';
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

  it('sin texto lanza un error con el motivo (así queda como fallo en ai_jobs)', () => {
    expect(() => anthropicText({ content: [{ type: 'thinking' }], stop_reason: 'max_tokens' })).toThrow(/límite de tokens/);
    expect(() => anthropicText({ content: [], stop_reason: 'refusal' })).toThrow(/rechazó/);
    expect(() => anthropicText({})).toThrow(/vacía/);
  });

  it('una respuesta cortada con algo de texto se devuelve (quien llama detecta el corte)', () => {
    expect(anthropicText({ content: [{ type: 'thinking' }, { type: 'text', text: '{"a":' }], stop_reason: 'max_tokens' })).toBe('{"a":');
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
