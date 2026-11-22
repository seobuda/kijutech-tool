import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiJobs, aiModelPricing, aiPrompts, aiProviderSettings, tenants } from '@/lib/db/schema';
import { decrypt } from '@/lib/ai/encryption';
import { DEFAULT_EMBEDDING_MODEL } from '@/lib/ai/provider-meta';
import { anthropicAdapter } from '@/lib/ai/adapters/anthropic';
import { openaiAdapter } from '@/lib/ai/adapters/openai';
import { geminiAdapter } from '@/lib/ai/adapters/gemini';
import { deepseekAdapter } from '@/lib/ai/adapters/deepseek';
import { AIBilledError, type AIAdapter, type AIMessage, type AIResponse } from '@/lib/ai/types';
import { reportError } from '@/lib/core/errors';
import { currentEvalRunId } from '@/lib/ai/eval-tag';

const ADAPTERS: Record<string, AIAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  gemini: geminiAdapter,
  deepseek: deepseekAdapter,
};

export function getAdapter(provider: string): AIAdapter | null {
  return ADAPTERS[provider] ?? null;
}

export const CALL_TIMEOUT_MS = 180_000;

type CallAIParams = {
  tenantId: string;
  projectId?: string;
  function: string;
  messages: AIMessage[];
  preferredProvider?: string;
  promptKey?: string;
  // Opcional — cada adapter usa su propio default si no se especifica
  // (ver DEFAULT_MAX_TOKENS en adapters/anthropic.ts, el único que lo
  // exige como campo obligatorio de su API).
  maxTokens?: number;
  /**
   * Modelo concreto para esta llamada (p. ej. uno pequeño y barato para clasificar). Solo se usa si el proveedor activo
   * es el de ese modelo (Anthropic para «claude-…»); si no, se usa el modelo configurado en IA y modelos.
   */
  model?: string;
  /** Tiempo máximo de esta llamada (por defecto CALL_TIMEOUT_MS). Las largas (estratega con Opus) necesitan más. */
  timeoutMs?: number;
};

export async function getPrompt(
  key: string
): Promise<{ system_prompt: string; user_prompt_template: string } | null> {
  const [row] = await db
    .select({
      systemPrompt: aiPrompts.systemPrompt,
      userPromptTemplate: aiPrompts.userPromptTemplate,
    })
    .from(aiPrompts)
    .where(and(eq(aiPrompts.key, key), eq(aiPrompts.isActive, true)))
    .limit(1);

  if (!row) {
    return null;
  }

  return { system_prompt: row.systemPrompt, user_prompt_template: row.userPromptTemplate };
}

async function findProviderSetting(
  tenantId: string,
  keyMode: 'platform' | 'byok',
  preferredProvider?: string
) {
  const conditions = [
    eq(aiProviderSettings.keyMode, keyMode),
    eq(aiProviderSettings.isActive, true),
  ];

  if (keyMode === 'byok') {
    conditions.push(eq(aiProviderSettings.tenantId, tenantId));
  }
  if (preferredProvider) {
    conditions.push(eq(aiProviderSettings.provider, preferredProvider));
  }

  const rows = await db
    .select()
    .from(aiProviderSettings)
    .where(and(...conditions))
    .orderBy(desc(aiProviderSettings.isDefault))
    .limit(1);

  return rows[0] ?? null;
}

async function resolveProviderSetting(
  tenantId: string,
  keyModeAllowed: string,
  preferredProvider?: string
) {
  if (keyModeAllowed === 'byok_required') {
    const setting = await findProviderSetting(tenantId, 'byok', preferredProvider);
    if (!setting) {
      throw new Error(
        'Este tenant requiere BYOK pero no hay ninguna clave propia activa configurada'
      );
    }
    return setting;
  }

  if (keyModeAllowed === 'byok_allowed') {
    const byok = await findProviderSetting(tenantId, 'byok', preferredProvider);
    if (byok) return byok;
  }

  const platform = await findProviderSetting(tenantId, 'platform', preferredProvider);
  if (!platform) {
    throw new Error('No hay ninguna clave de IA activa disponible para este tenant');
  }
  return platform;
}

export async function getModelPricing(provider: string, model: string) {
  const today = new Date().toISOString().slice(0, 10);

  const rows = await db
    .select()
    .from(aiModelPricing)
    .where(
      and(
        eq(aiModelPricing.provider, provider),
        eq(aiModelPricing.model, model),
        lte(aiModelPricing.effectiveFrom, today),
        or(isNull(aiModelPricing.effectiveTo), gte(aiModelPricing.effectiveTo, today))
      )
    )
    .orderBy(desc(aiModelPricing.effectiveFrom))
    .limit(1);

  if (rows[0]) return rows[0];
  // Sin fila en la tabla (p. ej. una instalación nueva): precio oficial de respaldo para no registrar el coste vacío,
  // que dejaría al vigía de gasto en 0 $. La tabla editable siempre manda sobre esto.
  // La API puede devolver el modelo con sufijo de fecha: se acepta por prefijo (el más largo).
  const key = `${provider}/${model}`;
  const fbKey = FALLBACK_PRICING[key] ? key : Object.keys(FALLBACK_PRICING).filter((k) => key.startsWith(`${k}-`)).sort((a, b) => b.length - a.length)[0];
  const fb = fbKey ? FALLBACK_PRICING[fbKey] : undefined;
  return fb ? { provider, model, inputCostPer1k: fb[0], outputCostPer1k: fb[1], fallback: true as const } : null;
}

// Precios de lista por 1.000 tokens (USD), de la tabla oficial de Anthropic a 3 nov 2026 (entrada, salida).
// Solo se usan si ai_model_pricing no tiene el modelo.
export const FALLBACK_PRICING: Record<string, [string, string]> = {
  'anthropic/claude-sonnet-4-6': ['0.003', '0.015'],
  'anthropic/claude-sonnet-5': ['0.002', '0.010'],
  'anthropic/claude-sonnet-5-5': ['0.002', '0.010'],
  'anthropic/claude-opus-4-6': ['0.005', '0.025'],
  'anthropic/claude-opus-4-7': ['0.005', '0.025'],
  'anthropic/claude-opus-4-8': ['0.005', '0.025'],
  'anthropic/claude-opus-5': ['0.005', '0.025'],
  'anthropic/claude-opus-5-5': ['0.004', '0.020'],
  'anthropic/claude-haiku-4-5': ['0.001', '0.005'],
  'anthropic/claude-haiku-5-5': ['0.0001', '0.0005']
};

/**
 * Llama al adaptador con tiempo máximo y CANCELA la petición al vencer (17 nov 2026: antes solo se dejaba de esperar,
 * la petición seguía viva y el proveedor la cobraba sin quedar registrada).
 */
export async function sendWithTimeout(adapter: AIAdapter, messages: AIMessage[], model: string, apiKey: string, maxTokens: number | undefined, ms: number): Promise<AIResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await adapter.sendMessage(messages, model, apiKey, maxTokens, ctrl.signal);
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error(`Llamada a la IA superó el timeout de ${ms / 1000}s`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Llamada a la IA superó el timeout de ${ms / 1000}s`)),
      ms
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

// Resuelve qué proveedor/modelo/key usar para un tenant y descifra la
// key, sin crear ningún ai_job — lo usa callAI() internamente, y
// también el pipeline de clustering (lib/ai/clustering/), que necesita
// la key ya resuelta para pasarla tanto a la Capa 1 (embeddings) como a
// la Capa 4 (LLM) sin resolverla dos veces.
export async function resolveActiveProvider(
  tenantId: string,
  preferredProvider?: string
): Promise<{ provider: string; model: string; apiKey: string; keyMode: string }> {
  const [tenant] = await db
    .select({ aiKeyModeAllowed: tenants.aiKeyModeAllowed })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) {
    throw new Error('Tenant no encontrado');
  }

  const setting = await resolveProviderSetting(tenantId, tenant.aiKeyModeAllowed, preferredProvider);

  if (!setting.apiKeyEncrypted || !setting.apiKeyIv) {
    throw new Error(
      `La configuración de ${setting.provider} no tiene una API key cifrada válida`
    );
  }

  return {
    provider: setting.provider,
    model: setting.model,
    apiKey: decrypt(setting.apiKeyEncrypted, setting.apiKeyIv),
    keyMode: setting.keyMode,
  };
}

// Resuelve el proveedor/modelo/key a usar para EMBEDDINGS, que puede ser
// distinto del proveedor de chat resuelto por resolveActiveProvider().
// Recibe el keyMode ya resuelto (devuelto por resolveActiveProvider) en
// vez de volver a mirar tenants.aiKeyModeAllowed, para no resolver el
// tenant dos veces — ver el pipeline de clustering (lib/seo/kw-ai-actions.ts),
// que llama a ambas en la misma petición.
export async function getEmbeddingConfig(
  tenantId: string,
  keyMode: 'platform' | 'byok'
): Promise<{ provider: string; model: string; apiKey: string }> {
  const setting = await findProviderSetting(tenantId, keyMode);
  if (!setting) {
    throw new Error('No hay ninguna configuración de IA activa para este tenant');
  }
  if (!setting.apiKeyEncrypted || !setting.apiKeyIv) {
    throw new Error(
      `La configuración de ${setting.provider} no tiene una API key cifrada válida`
    );
  }

  // Sin proveedor de embeddings propio configurado → usa el proveedor de
  // chat también para embeddings, con su modelo de embeddings por
  // defecto (nunca el modelo de CHAT configurado — p.ej. "claude-sonnet-4-6"
  // no es un modelo de embeddings válido para la API de Voyage).
  if (!setting.embeddingProvider) {
    const model = DEFAULT_EMBEDDING_MODEL[setting.provider];
    if (!model) {
      throw new Error(
        `${setting.provider} no tiene un modelo de embeddings por defecto — configura un proveedor de embeddings específico en IA & Modelos`
      );
    }
    return {
      provider: setting.provider,
      model,
      apiKey: decrypt(setting.apiKeyEncrypted, setting.apiKeyIv),
    };
  }

  const apiKey =
    setting.embeddingApiKeyEncrypted && setting.embeddingApiKeyIv
      ? decrypt(setting.embeddingApiKeyEncrypted, setting.embeddingApiKeyIv)
      : decrypt(setting.apiKeyEncrypted, setting.apiKeyIv);

  return {
    provider: setting.embeddingProvider,
    model: setting.embeddingModel || DEFAULT_EMBEDDING_MODEL[setting.embeddingProvider],
    apiKey,
  };
}

/** Coste en USD de una llamada según ai_model_pricing (null si el modelo no tiene precio). */
async function costOf(provider: string, model: string, input: number, output: number): Promise<number | null> {
  const pricing = await getModelPricing(provider, model);
  return pricing ? (input / 1000) * Number(pricing.inputCostPer1k) + (output / 1000) * Number(pricing.outputCostPer1k) : null;
}

export async function callAI(
  params: CallAIParams
): Promise<AIResponse & { jobId: string }> {
  const { tenantId, projectId, function: fn, messages, preferredProvider, promptKey, maxTokens } = params;
  const timeoutMs = Math.min(900_000, Math.max(10_000, params.timeoutMs ?? CALL_TIMEOUT_MS));
  const modelFor = (provider: string, configured: string) => (params.model && provider === 'anthropic' && /^claude-[a-z0-9-]+$/.test(params.model) ? params.model : configured);

  // Si se pasa promptKey, se carga aquí únicamente para dejar constancia
  // en el job de qué prompt estaba activo en el momento de la llamada —
  // el contenido del prompt ya viene incorporado en `messages`, construido
  // por quien llama (ver lib/seo/kw-ai-actions.ts).
  const promptUsed = promptKey ? await getPrompt(promptKey) : null;

  const [job] = await db
    .insert(aiJobs)
    .values({
      tenantId,
      projectId: projectId ?? null,
      function: fn,
      status: 'processing',
      input: {
        messages,
        preferredProvider: preferredProvider ?? null,
        promptKey: promptKey ?? null,
        promptFoundActive: promptKey ? Boolean(promptUsed) : null,
        // Llamada hecha dentro de un examen de prompt (lib/ai/prompt-evals.ts): así se suma su coste exacto.
        ...(currentEvalRunId() ? { evalRunId: currentEvalRunId() } : {}),
      },
    })
    .returning();

  // Lo cobrado en intentos que fallaron (respuesta vacía o cortada del proveedor principal antes de la reserva).
  const billed = { input: 0, output: 0, cost: 0, unpriced: false };
  const addBilled = async (e: unknown) => {
    if (!(e instanceof AIBilledError)) return;
    const c = await costOf(e.usage.provider, e.usage.model, e.usage.input_tokens, e.usage.output_tokens);
    billed.input += e.usage.input_tokens;
    billed.output += e.usage.output_tokens;
    if (c === null) billed.unpriced = true;
    else billed.cost += c;
  };

  const finish = async (
    response: AIResponse,
    keyMode: string,
    fallback: { from: string; reason: string } | null
  ) => {
    const own = await costOf(response.provider, response.model, response.input_tokens, response.output_tokens);
    const estimatedCost = own !== null ? own + billed.cost : billed.cost > 0 ? billed.cost : null;
    await db
      .update(aiJobs)
      .set({
        status: 'completed',
        output: fallback ? { content: response.content, fallback } : { content: response.content },
        provider: response.provider,
        model: response.model,
        keyModeUsed: keyMode,
        inputTokens: response.input_tokens + billed.input,
        outputTokens: response.output_tokens + billed.output,
        estimatedCost: estimatedCost !== null ? estimatedCost.toFixed(6) : null,
        completedAt: new Date(),
      })
      .where(eq(aiJobs.id, job.id));
    return { ...response, jobId: job.id };
  };

  let primary: { provider: string; model: string } | null = null;
  try {
    const setting = await resolveActiveProvider(tenantId, preferredProvider);
    setting.model = modelFor(setting.provider, setting.model);
    primary = { provider: setting.provider, model: setting.model };

    const adapter = ADAPTERS[setting.provider];
    if (!adapter) {
      throw new Error(`Proveedor de IA desconocido: ${setting.provider}`);
    }

    const response = await sendWithTimeout(adapter, messages, setting.model, setting.apiKey, maxTokens, timeoutMs);
    return await finish(response, setting.keyMode, null);
  } catch (error) {
    let message = error instanceof Error ? error.message : 'Error desconocido';
    await addBilled(error).catch(() => {});

    // IA de reserva (13 nov 2026): si el fallo es del proveedor (caído, saturado, sin saldo, clave rechazada,
    // modelo retirado, tiempo agotado) y hay otra clave activa de OTRO proveedor, se reintenta una vez con ella.
    // Queda anotado en el job (output.fallback) para que el vigía de gasto lo cuente y avise.
    if (primary && shouldFallback(message)) {
      try {
        const alt = await resolveFallbackProvider(tenantId, primary.provider);
        if (alt) {
          const altAdapter = ADAPTERS[alt.provider];
          if (altAdapter) {
            const response = await sendWithTimeout(altAdapter, messages, alt.model, alt.apiKey, maxTokens, timeoutMs);
            return await finish(response, alt.keyMode, {
              from: `${primary.provider}/${primary.model}`,
              reason: message.slice(0, 300),
            });
          }
        }
      } catch (fallbackError) {
        await addBilled(fallbackError).catch(() => {});
        message = `${message} · Reserva: ${fallbackError instanceof Error ? fallbackError.message : 'error desconocido'}`;
      }
    }

    await db
      .update(aiJobs)
      .set({
        status: 'failed',
        error: message,
        // Aunque falle, lo que el proveedor cobró cuenta para el vigía y los topes (I3).
        ...(billed.input || billed.output
          ? { inputTokens: billed.input, outputTokens: billed.output, estimatedCost: billed.cost > 0 || !billed.unpriced ? billed.cost.toFixed(6) : null }
          : {}),
        completedAt: new Date(),
      })
      .where(eq(aiJobs.id, job.id));
    reportError({ message, source: 'ia', area: `ia ${fn}`, tenantId, context: { aiJobId: job.id, proveedor: primary?.provider ?? null, modelo: primary?.model ?? null, maxTokens: maxTokens ?? null, promptKey: promptKey ?? null } });

    throw error;
  }
}

/**
 * ¿El fallo es del proveedor y merece probar la reserva? Sí: caído o saturado (5xx, 529), límite (429), clave
 * rechazada (401/403), modelo retirado (404), sin saldo (400 con «credit/balance/billing»), tiempo agotado o red.
 * No: una petición mal formada (400 normal), que fallaría igual con otro proveedor.
 */
export function shouldFallback(message: string): boolean {
  const m = message.match(/\((\d{3})\)/);
  if (m) {
    const status = Number(m[1]);
    if ([401, 403, 404, 408, 429, 500, 502, 503, 504, 529].includes(status)) return true;
    if (status === 400) return /credit|balance|billing|quota|saldo/i.test(message);
    return false;
  }
  return /timeout|superó el timeout|fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up/i.test(message);
}

/** Otra clave activa de un proveedor distinto (respetando el modo de claves del tenant), o null. */
export async function resolveFallbackProvider(
  tenantId: string,
  excludeProvider: string
): Promise<{ provider: string; model: string; apiKey: string; keyMode: string } | null> {
  const [tenant] = await db
    .select({ aiKeyModeAllowed: tenants.aiKeyModeAllowed })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!tenant) return null;
  const modes: ('platform' | 'byok')[] =
    tenant.aiKeyModeAllowed === 'byok_required' ? ['byok'] : tenant.aiKeyModeAllowed === 'byok_allowed' ? ['byok', 'platform'] : ['platform'];
  for (const keyMode of modes) {
    const rows = await db
      .select()
      .from(aiProviderSettings)
      .where(
        and(
          eq(aiProviderSettings.keyMode, keyMode),
          eq(aiProviderSettings.isActive, true),
          ...(keyMode === 'byok' ? [eq(aiProviderSettings.tenantId, tenantId)] : [])
        )
      )
      .orderBy(desc(aiProviderSettings.isDefault));
    const alt = rows.find((r) => r.provider !== excludeProvider && r.apiKeyEncrypted && r.apiKeyIv && ADAPTERS[r.provider]);
    if (alt) {
      return { provider: alt.provider, model: alt.model, apiKey: decrypt(alt.apiKeyEncrypted!, alt.apiKeyIv!), keyMode };
    }
  }
  return null;
}
