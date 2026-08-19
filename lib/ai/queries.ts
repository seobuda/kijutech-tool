import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  aiJobs,
  aiModelPricing,
  aiPrompts,
  aiProviderSettings,
  tenants,
  users,
} from '@/lib/db/schema';

export async function getAiProviderSettings(
  tenantId: string,
  keyMode?: 'platform' | 'byok'
) {
  const conditions = [eq(aiProviderSettings.tenantId, tenantId)];
  if (keyMode) {
    conditions.push(eq(aiProviderSettings.keyMode, keyMode));
  }

  return db
    .select()
    .from(aiProviderSettings)
    .where(and(...conditions))
    .orderBy(asc(aiProviderSettings.provider));
}

export async function getAiModelPricing() {
  return db
    .select()
    .from(aiModelPricing)
    .orderBy(
      asc(aiModelPricing.provider),
      asc(aiModelPricing.model),
      desc(aiModelPricing.effectiveFrom)
    );
}

export async function getAiJobs(tenantId: string, limit = 50) {
  return db
    .select()
    .from(aiJobs)
    .where(eq(aiJobs.tenantId, tenantId))
    .orderBy(desc(aiJobs.createdAt))
    .limit(limit);
}

export async function getTenantAiMode(tenantId: string) {
  const [tenant] = await db
    .select({ aiKeyModeAllowed: tenants.aiKeyModeAllowed })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  return tenant?.aiKeyModeAllowed ?? 'platform_only';
}

export async function getTenantsWithAiMode() {
  return db
    .select({
      id: tenants.id,
      name: tenants.name,
      aiKeyModeAllowed: tenants.aiKeyModeAllowed,
    })
    .from(tenants)
    .orderBy(asc(tenants.name));
}

export async function getAiPrompt(key: string) {
  const [row] = await db
    .select({
      id: aiPrompts.id,
      key: aiPrompts.key,
      name: aiPrompts.name,
      description: aiPrompts.description,
      systemPrompt: aiPrompts.systemPrompt,
      userPromptTemplate: aiPrompts.userPromptTemplate,
      isActive: aiPrompts.isActive,
      version: aiPrompts.version,
      updatedAt: aiPrompts.updatedAt,
      updatedByName: users.name,
      updatedByEmail: users.email,
    })
    .from(aiPrompts)
    .leftJoin(users, eq(aiPrompts.updatedBy, users.id))
    .where(eq(aiPrompts.key, key))
    .limit(1);

  return row ?? null;
}

export async function getAiPrompts() {
  return db.select().from(aiPrompts).orderBy(asc(aiPrompts.name));
}

// Igual que getAiPrompts() pero con el nombre de quién hizo la última
// edición, necesario para la columna "Última actualización" de la lista.
export async function getAiPromptsWithUpdater() {
  return db
    .select({
      id: aiPrompts.id,
      key: aiPrompts.key,
      name: aiPrompts.name,
      description: aiPrompts.description,
      isActive: aiPrompts.isActive,
      version: aiPrompts.version,
      updatedAt: aiPrompts.updatedAt,
      updatedByName: users.name,
      updatedByEmail: users.email,
    })
    .from(aiPrompts)
    .leftJoin(users, eq(aiPrompts.updatedBy, users.id))
    .orderBy(asc(aiPrompts.name));
}

export async function getAiJobsMonthlyTotals(tenantId: string) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [row] = await db
    .select({
      count: sql<number>`count(*)`,
      totalTokens: sql<number>`coalesce(sum(coalesce(${aiJobs.inputTokens}, 0) + coalesce(${aiJobs.outputTokens}, 0)), 0)`,
      totalCost: sql<string>`coalesce(sum(${aiJobs.estimatedCost}), 0)`,
    })
    .from(aiJobs)
    .where(and(eq(aiJobs.tenantId, tenantId), gte(aiJobs.createdAt, monthStart)));

  return {
    count: Number(row?.count ?? 0),
    totalTokens: Number(row?.totalTokens ?? 0),
    totalCost: Number(row?.totalCost ?? 0),
  };
}

// Réplica de solo-lectura de la resolución de proveedor que hace
// lib/ai/gateway.ts (resolveProviderSetting), para mostrar en UI qué
// proveedor/modelo se usaría sin llegar a intentar una llamada real.
export async function getActiveProviderForTenant(
  tenantId: string
): Promise<{ provider: string; model: string } | null> {
  const keyModeAllowed = await getTenantAiMode(tenantId);

  async function findActive(keyMode: 'platform' | 'byok') {
    const conditions = [
      eq(aiProviderSettings.keyMode, keyMode),
      eq(aiProviderSettings.isActive, true),
    ];
    if (keyMode === 'byok') {
      conditions.push(eq(aiProviderSettings.tenantId, tenantId));
    }

    const [row] = await db
      .select({ provider: aiProviderSettings.provider, model: aiProviderSettings.model })
      .from(aiProviderSettings)
      .where(and(...conditions))
      .orderBy(desc(aiProviderSettings.isDefault))
      .limit(1);

    return row ?? null;
  }

  if (keyModeAllowed === 'byok_required') {
    return findActive('byok');
  }

  if (keyModeAllowed === 'byok_allowed') {
    const byok = await findActive('byok');
    if (byok) return byok;
  }

  return findActive('platform');
}
