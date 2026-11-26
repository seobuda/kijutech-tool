import 'server-only';

// SEO · Gasto en datos de pago por proyecto (parte 0, 26 nov 2026). Tope mensual por proyecto (ajuste «data_budget_usd»
// de seo_settings, 5 $ por defecto, decisión de Enric). Lo automático no gasta si se pasa del tope; lo que se pide a mano
// puede forzarse. Comprobar y gastar no es atómico: con estos importes se acepta (DISENO-SEO-PARTE0 §decisión 6).
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { seoDataSpend, seoSettings } from '@/lib/db/schema';

export const DEFAULT_DATA_BUDGET_USD = 5;

const monthStart = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

export async function dataBudgetUsd(): Promise<number> {
  const [r] = await db.select({ v: seoSettings.value }).from(seoSettings).where(eq(seoSettings.key, 'data_budget_usd')).limit(1);
  const n = Number(r?.v);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DATA_BUDGET_USD;
}

export async function dataSpentThisMonth(projectId: string, now = new Date()): Promise<number> {
  const [r] = await db
    .select({ usd: sql<string>`coalesce(sum(${seoDataSpend.costUsd}), 0)` })
    .from(seoDataSpend)
    .where(and(eq(seoDataSpend.projectId, projectId), gte(seoDataSpend.createdAt, monthStart(now))));
  return Number(r?.usd ?? 0);
}

/** ¿Cabe un gasto estimado de `usd` este mes? */
export async function canSpend(projectId: string, usd: number): Promise<{ ok: boolean; spent: number; budget: number }> {
  const [spent, budget] = await Promise.all([dataSpentThisMonth(projectId), dataBudgetUsd()]);
  return { ok: spent + usd <= budget, spent, budget };
}

export async function recordDataSpend(tenantId: string, projectId: string, provider: string, operation: string, usd: number): Promise<void> {
  if (!(usd > 0)) return;
  await db.insert(seoDataSpend).values({ tenantId, projectId, provider: provider.slice(0, 30), operation: operation.slice(0, 60), costUsd: usd.toFixed(4) });
}

export async function dataSpendSummary(projectId: string): Promise<{ spent: number; budget: number; byOperation: { operation: string; usd: number }[] }> {
  const [budget, rows] = await Promise.all([
    dataBudgetUsd(),
    db
      .select({ operation: seoDataSpend.operation, usd: sql<string>`sum(${seoDataSpend.costUsd})` })
      .from(seoDataSpend)
      .where(and(eq(seoDataSpend.projectId, projectId), gte(seoDataSpend.createdAt, monthStart())))
      .groupBy(seoDataSpend.operation)
  ]);
  const byOperation = rows.map((r) => ({ operation: r.operation, usd: Number(r.usd) }));
  return { spent: byOperation.reduce((a, b) => a + b.usd, 0), budget, byOperation };
}
