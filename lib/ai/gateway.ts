import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiJobs, aiModelPricing, aiPrompts, aiProviderSettings, tenants } from '@/lib/db/schema';
import { decrypt } from '@/lib/ai/encryption';
import { anthropicAdapter } from '@/lib/ai/adapters/anthropic';
import { openaiAdapter } from '@/lib/ai/adapters/openai';
import { geminiAdapter } from '@/lib/ai/adapters/gemini';
import { deepseekAdapter } from '@/lib/ai/adapters/deepseek';
import type { AIAdapter, AIMessage, AIResponse } from '@/lib/ai/types';

const ADAPTERS: Record<string, AIAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  gemini: geminiAdapter,
  deepseek: deepseekAdapter,
};

const CALL_TIMEOUT_MS = 60_000;

type CallAIParams = {
  tenantId: string;
  projectId?: string;
  function: string;
  messages: AIMessage[];
  preferredProvider?: string;
  promptKey?: string;
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

async function getModelPricing(provider: string, model: string) {
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

  return rows[0] ?? null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
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

export async function callAI(
  params: CallAIParams
): Promise<AIResponse & { jobId: string }> {
  const { tenantId, projectId, function: fn, messages, preferredProvider, promptKey } = params;

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
      },
    })
    .returning();

  try {
    const [tenant] = await db
      .select({ aiKeyModeAllowed: tenants.aiKeyModeAllowed })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      throw new Error('Tenant no encontrado');
    }

    const setting = await resolveProviderSetting(
      tenantId,
      tenant.aiKeyModeAllowed,
      preferredProvider
    );

    if (!setting.apiKeyEncrypted || !setting.apiKeyIv) {
      throw new Error(
        `La configuración de ${setting.provider} no tiene una API key cifrada válida`
      );
    }

    const apiKey = decrypt(setting.apiKeyEncrypted, setting.apiKeyIv);

    const adapter = ADAPTERS[setting.provider];
    if (!adapter) {
      throw new Error(`Proveedor de IA desconocido: ${setting.provider}`);
    }

    const response = await withTimeout(
      adapter.sendMessage(messages, setting.model, apiKey),
      CALL_TIMEOUT_MS
    );

    const pricing = await getModelPricing(response.provider, response.model);
    const estimatedCost = pricing
      ? (response.input_tokens / 1000) * Number(pricing.inputCostPer1k) +
        (response.output_tokens / 1000) * Number(pricing.outputCostPer1k)
      : null;

    await db
      .update(aiJobs)
      .set({
        status: 'completed',
        output: { content: response.content },
        provider: response.provider,
        model: response.model,
        keyModeUsed: setting.keyMode,
        inputTokens: response.input_tokens,
        outputTokens: response.output_tokens,
        estimatedCost: estimatedCost !== null ? estimatedCost.toFixed(6) : null,
        completedAt: new Date(),
      })
      .where(eq(aiJobs.id, job.id));

    return { ...response, jobId: job.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';

    await db
      .update(aiJobs)
      .set({
        status: 'failed',
        error: message,
        completedAt: new Date(),
      })
      .where(eq(aiJobs.id, job.id));

    throw error;
  }
}
