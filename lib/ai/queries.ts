import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiJobs, aiModelPricing, aiProviderSettings, tenants } from '@/lib/db/schema';

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
