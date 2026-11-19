// Pruebas simuladas (19 nov 2026): los escenarios pasan en el entorno de pruebas, nada sale a internet (Telegram,
// ClickUp, IA) y la cuenta real no recibe ni un encargo, aviso o cambio.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsClickupOutbox, opsNotifications, opsRequests, opsSimEnvironments, opsSimMessages, opsSimRuns, opsTelegramConfig, tenants, users } from '@/lib/db/schema';
import { ensureSimEnvironment, isSimTenant, simChatIds } from '@/lib/operaciones/sim/env';
import { runScenarios } from '@/lib/operaciones/sim/runner';
import { SCENARIOS } from '@/lib/operaciones/sim/scenarios';
import { tg, TelegramError } from '@/lib/operaciones/telegram';

const SLUG = 'seg-test-pruebas-simuladas';
let owner = '';
let simTenant = '';
const outside: string[] = [];

async function cleanup() {
  const rows = await db.select({ id: tenants.id }).from(tenants).where(inArray(tenants.slug, [SLUG, `${SLUG}-pruebas`]));
  if (!rows.length) return;
  const ids = rows.map((r) => r.id);
  // Los encargos simulados apuntan al usuario que los «creó»: primero ellos.
  await db.delete(opsRequests).where(inArray(opsRequests.tenantId, ids));
  await db.delete(users).where(inArray(users.tenantId, ids));
  await db.delete(opsSimEnvironments).where(inArray(opsSimEnvironments.tenantId, ids));
  await db.delete(tenants).where(inArray(tenants.id, ids));
}

describe('pruebas simuladas', () => {
  beforeAll(async () => {
    await cleanup();
    const [t] = await db.insert(tenants).values({ name: 'Prueba simulador', slug: SLUG }).returning();
    owner = t.id;
    await db.insert(users).values({ tenantId: owner, email: `${SLUG}@ejemplo.invalid`, passwordHash: 'x', name: 'Prueba' });
    // Cualquier llamada a internet desde el simulador es un fallo de aislamiento.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      outside.push(String(input instanceof Request ? input.url : input));
      throw new Error('Llamada a internet durante las pruebas simuladas');
    });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });

  it('crea el entorno aislado: cuenta aparte, bot simulado, IA bloqueada, chats negativos', async () => {
    const env = await ensureSimEnvironment(owner);
    simTenant = env.simTenantId;
    expect(simTenant).not.toBe(owner);
    expect(await isSimTenant(simTenant)).toBe(true);
    expect(await isSimTenant(owner)).toBe(false);
    const [cfg] = await db.select().from(opsTelegramConfig).where(eq(opsTelegramConfig.tenantId, simTenant));
    expect(cfg.receiveMode).toBe('simulado');
    const [t] = await db.select().from(tenants).where(eq(tenants.id, simTenant));
    expect(t.aiKeyModeAllowed).toBe('byok_required');
    const ids = simChatIds(simTenant);
    expect(ids.owner).toBeLessThan(0);
    expect(ids.employee).toBeLessThan(0);
    // Idempotente.
    expect((await ensureSimEnvironment(owner)).simTenantId).toBe(simTenant);
  });

  it('todos los escenarios pasan', async () => {
    const r = await runScenarios(owner, 'all', 'claude', 'vitest');
    const failed = r.results.filter((x) => x.status !== 'ok').map((x) => `${x.key}: ${x.error}`);
    expect(r.error).toBeUndefined();
    expect(failed).toEqual([]);
    expect(r.results).toHaveLength(SCENARIOS.length);
    const runs = await db.select().from(opsSimRuns).where(eq(opsSimRuns.tenantId, owner));
    expect(runs.every((x) => x.status === 'ok' && x.finishedAt)).toBe(true);
  }, 240_000);

  it('nada sale a internet', () => {
    expect(outside).toEqual([]);
  });

  it('la cuenta real no recibe nada: ni encargos, ni avisos, ni cambios hacia ClickUp', async () => {
    expect(await db.select().from(opsRequests).where(eq(opsRequests.tenantId, owner))).toHaveLength(0);
    expect(await db.select().from(opsNotifications).where(eq(opsNotifications.tenantId, owner))).toHaveLength(0);
    expect(await db.select().from(opsClickupOutbox).where(eq(opsClickupOutbox.tenantId, owner))).toHaveLength(0);
    // Y la conversación queda en la cuenta de pruebas, asociada a sus ejecuciones.
    const msgs = await db.select().from(opsSimMessages).where(eq(opsSimMessages.tenantId, simTenant));
    expect(msgs.length).toBeGreaterThan(10);
    expect(msgs.every((m) => m.runId)).toBe(true);
  });

  it('una segunda tanda a la vez se rechaza', async () => {
    const [a, b] = await Promise.all([runScenarios(owner, ['visto'], 'claude', 'vitest'), runScenarios(owner, ['visto'], 'claude', 'vitest')]);
    expect([a.error, b.error].filter(Boolean)).toHaveLength(1);
  }, 60_000);

  it('un token simulado sin simulador registrado no sale a internet', async () => {
    const G = globalThis as unknown as { __kijuSimTelegram?: unknown };
    const saved = G.__kijuSimTelegram;
    G.__kijuSimTelegram = undefined;
    try {
      await expect(tg('SIM:00000000-0000-0000-0000-000000000000', 'sendMessage', { chat_id: -1, text: 'x' })).rejects.toBeInstanceOf(TelegramError);
    } finally {
      G.__kijuSimTelegram = saved;
    }
    expect(outside).toEqual([]);
  });
});
