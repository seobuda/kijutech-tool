'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  aiModelPricing,
  aiProviderSettings,
  roles,
  tenants,
  userRoles,
} from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { encrypt } from '@/lib/ai/encryption';
import { AI_PROVIDERS, type AiProviderKey } from '@/lib/ai/provider-meta';
import { anthropicAdapter } from '@/lib/ai/adapters/anthropic';
import { openaiAdapter } from '@/lib/ai/adapters/openai';
import { geminiAdapter } from '@/lib/ai/adapters/gemini';
import { deepseekAdapter } from '@/lib/ai/adapters/deepseek';
import type { AIAdapter } from '@/lib/ai/types';

// Server Actions pierden el mensaje de los `throw` en el build de
// producción (Next.js los sustituye por un digest genérico). Por eso
// estas acciones nunca lanzan: devuelven { error } o { success: true }
// para que el mensaje real llegue al cliente.
export type ActionResult = { error: string } | { success: true };

const ADAPTERS: Record<AiProviderKey, AIAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  gemini: geminiAdapter,
  deepseek: deepseekAdapter,
};

async function getAssignedTenantRoles(userId: number) {
  return db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(eq(userRoles.userId, userId), isNull(userRoles.projectId)));
}

async function isSuperAdmin(userId: number) {
  const assigned = await getAssignedTenantRoles(userId);
  return assigned.some((r) => r.name === 'super_admin');
}

async function isTenantAdmin(userId: number) {
  const assigned = await getAssignedTenantRoles(userId);
  return assigned.some((r) => r.name === 'admin' || r.name === 'super_admin');
}

function isAiProvider(provider: string): provider is AiProviderKey {
  return (AI_PROVIDERS as readonly string[]).includes(provider);
}

type SaveProviderSettingsParams = {
  provider: string;
  model: string;
  apiKey?: string;
  isActive: boolean;
  isDefault: boolean;
  keyMode: 'platform' | 'byok';
  tenantId: string;
};

export async function saveProviderSettings(
  params: SaveProviderSettingsParams
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) {
    return { error: 'No autenticado' };
  }

  if (!isAiProvider(params.provider)) {
    return { error: `Proveedor desconocido: ${params.provider}` };
  }

  const model = params.model.trim();
  if (!model) {
    return { error: 'El modelo no puede estar vacío' };
  }

  let tenantId: string;

  if (params.keyMode === 'platform') {
    if (!(await isSuperAdmin(user.id))) {
      return { error: 'No autorizado: se requiere rol super_admin' };
    }
    tenantId = user.tenantId;
  } else {
    if (user.tenantId !== params.tenantId) {
      return { error: 'No autorizado para configurar claves de otro tenant' };
    }
    if (!(await isTenantAdmin(user.id))) {
      return { error: 'No autorizado: se requiere rol admin o super_admin' };
    }

    const [tenant] = await db
      .select({ aiKeyModeAllowed: tenants.aiKeyModeAllowed })
      .from(tenants)
      .where(eq(tenants.id, params.tenantId))
      .limit(1);

    if (!tenant || tenant.aiKeyModeAllowed === 'platform_only') {
      return { error: 'Este tenant no tiene BYOK habilitado' };
    }
    tenantId = params.tenantId;
  }

  const [existing] = await db
    .select({
      apiKeyEncrypted: aiProviderSettings.apiKeyEncrypted,
      apiKeyIv: aiProviderSettings.apiKeyIv,
    })
    .from(aiProviderSettings)
    .where(
      and(
        eq(aiProviderSettings.tenantId, tenantId),
        eq(aiProviderSettings.provider, params.provider)
      )
    )
    .limit(1);

  const newKey = params.apiKey?.trim();
  const hasExistingKey = Boolean(existing?.apiKeyEncrypted && existing?.apiKeyIv);

  if (params.isActive && !hasExistingKey && !newKey) {
    return { error: 'No puedes activar un proveedor sin una API key guardada' };
  }

  let apiKeyEncrypted: string | undefined;
  let apiKeyIv: string | undefined;

  if (newKey) {
    const adapter = ADAPTERS[params.provider];
    try {
      await adapter.sendMessage([{ role: 'user', content: 'di solo: ok' }], model, newKey);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      return { error: `La llamada de prueba a ${params.provider} falló: ${message}` };
    }

    const encryptedKey = encrypt(newKey);
    apiKeyEncrypted = encryptedKey.encrypted;
    apiKeyIv = encryptedKey.iv;
  }

  if (params.isDefault) {
    await db
      .update(aiProviderSettings)
      .set({ isDefault: false })
      .where(eq(aiProviderSettings.tenantId, tenantId));
  }

  await db
    .insert(aiProviderSettings)
    .values({
      tenantId,
      provider: params.provider,
      model,
      isActive: params.isActive,
      isDefault: params.isDefault,
      keyMode: params.keyMode,
      apiKeyEncrypted: apiKeyEncrypted ?? null,
      apiKeyIv: apiKeyIv ?? null,
    })
    .onConflictDoUpdate({
      target: [aiProviderSettings.tenantId, aiProviderSettings.provider],
      set: {
        model,
        isActive: params.isActive,
        isDefault: params.isDefault,
        keyMode: params.keyMode,
        updatedAt: new Date(),
        ...(apiKeyEncrypted && apiKeyIv ? { apiKeyEncrypted, apiKeyIv } : {}),
      },
    });

  return { success: true };
}

export async function deleteProviderKey(
  provider: string,
  tenantId: string
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) {
    return { error: 'No autenticado' };
  }

  const [row] = await db
    .select()
    .from(aiProviderSettings)
    .where(
      and(
        eq(aiProviderSettings.tenantId, tenantId),
        eq(aiProviderSettings.provider, provider)
      )
    )
    .limit(1);

  if (!row) {
    return { error: 'No hay ninguna configuración guardada para este proveedor' };
  }

  if (row.keyMode === 'platform') {
    if (!(await isSuperAdmin(user.id))) {
      return { error: 'No autorizado: se requiere rol super_admin' };
    }
  } else {
    if (user.tenantId !== tenantId) {
      return { error: 'No autorizado para eliminar la clave de otro tenant' };
    }
    if (!(await isTenantAdmin(user.id))) {
      return { error: 'No autorizado: se requiere rol admin o super_admin' };
    }
  }

  await db
    .update(aiProviderSettings)
    .set({
      apiKeyEncrypted: null,
      apiKeyIv: null,
      isActive: false,
      isDefault: false,
      updatedAt: new Date(),
    })
    .where(eq(aiProviderSettings.id, row.id));

  return { success: true };
}

export async function updateModelPricing(
  id: string,
  inputCost: number,
  outputCost: number,
  effectiveTo?: string
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) {
    return { error: 'No autenticado' };
  }
  if (!(await isSuperAdmin(user.id))) {
    return { error: 'No autorizado: se requiere rol super_admin' };
  }

  if (inputCost < 0 || outputCost < 0) {
    return { error: 'Los precios no pueden ser negativos' };
  }

  await db
    .update(aiModelPricing)
    .set({
      inputCostPer1k: inputCost.toFixed(6),
      outputCostPer1k: outputCost.toFixed(6),
      effectiveTo: effectiveTo || null,
    })
    .where(eq(aiModelPricing.id, id));

  return { success: true };
}

export async function addModelPricing(
  provider: string,
  model: string,
  inputCost: number,
  outputCost: number
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) {
    return { error: 'No autenticado' };
  }
  if (!(await isSuperAdmin(user.id))) {
    return { error: 'No autorizado: se requiere rol super_admin' };
  }

  if (!isAiProvider(provider)) {
    return { error: `Proveedor desconocido: ${provider}` };
  }
  const trimmedModel = model.trim();
  if (!trimmedModel) {
    return { error: 'El modelo no puede estar vacío' };
  }
  if (inputCost < 0 || outputCost < 0) {
    return { error: 'Los precios no pueden ser negativos' };
  }

  await db.insert(aiModelPricing).values({
    provider,
    model: trimmedModel,
    inputCostPer1k: inputCost.toFixed(6),
    outputCostPer1k: outputCost.toFixed(6),
  });

  return { success: true };
}

export async function updateTenantAiMode(
  tenantId: string,
  mode: string
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) {
    return { error: 'No autenticado' };
  }
  if (!(await isSuperAdmin(user.id))) {
    return { error: 'No autorizado: se requiere rol super_admin' };
  }

  if (!['platform_only', 'byok_allowed', 'byok_required'].includes(mode)) {
    return { error: `Modo desconocido: ${mode}` };
  }

  await db
    .update(tenants)
    .set({ aiKeyModeAllowed: mode })
    .where(eq(tenants.id, tenantId));

  return { success: true };
}
