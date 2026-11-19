// Pruebas simuladas (19 nov 2026): los escenarios pasan en el entorno de pruebas, nada sale a internet (Telegram,
// ClickUp, IA) y la cuenta real no recibe ni un encargo, aviso o cambio. Fase 2: jornada y tiempos con reloj simulado
// (se encienden solo mientras corren), el escenario de ClickUp real fuera de «todas» y «Pedir una prueba».
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsAutomations, opsClickupOutbox, opsNotifications, opsRequests, opsSimEnvironments, opsSimMessages, opsSimRuns, opsTelegramConfig, opsTelegramMembers, tenants, users } from '@/lib/db/schema';
import { getAuto, saveAutomation } from '@/lib/operaciones/automations';
import { addTestRequest, listTestRequests, markTestRequestsDone, TestRequestError, withdrawTestRequest } from '@/lib/operaciones/sim/requests';
import { ensureSimEnvironment, isSimTenant, SIM_EMPLOYEE_ID, SIM_OWNER_ID, simChatIds } from '@/lib/operaciones/sim/env';
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

  it('todos los escenarios pasan, sin escribir errores en el log', async () => {
    // Un console.error en producción va al registro de errores como fallo de la cuenta REAL y avisa a Enric: una tanda
    // de pruebas no puede escribir ninguno (pasó en el despliegue del 19 nov con los buenos días sin ClickUp).
    const logged: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void logged.push(a.map(String).join(' ')));
    const r = await runScenarios(owner, 'all', 'claude', 'vitest');
    spy.mockRestore();
    expect(logged).toEqual([]);
    const failed = r.results.filter((x) => x.status !== 'ok').map((x) => `${x.key}: ${x.error}`);
    expect(r.error).toBeUndefined();
    expect(failed).toEqual([]);
    // «Todas» = las internas: el escenario que sale a ClickUp de verdad no entra (ni en las del despliegue).
    const internal = SCENARIOS.filter((s) => !s.external);
    expect(SCENARIOS.some((s) => s.external)).toBe(true);
    expect(r.results.map((x) => x.key)).toEqual(internal.map((s) => s.key));
    const runs = await db.select().from(opsSimRuns).where(eq(opsSimRuns.tenantId, owner));
    expect(runs.every((x) => x.status === 'ok' && x.finishedAt)).toBe(true);
  }, 240_000);

  it('jornada y tiempos vuelven a quedar apagadas en la cuenta de pruebas', async () => {
    expect(await db.select().from(opsAutomations).where(eq(opsAutomations.tenantId, simTenant))).toHaveLength(0);
    expect((await getAuto(simTenant, 'jornada')).enabled).toBe(false);
  });

  it('los miembros simulados tienen ids numéricos (los botones de jornada y tiempos los exigen)', async () => {
    const ms = await db.select().from(opsTelegramMembers).where(eq(opsTelegramMembers.tenantId, simTenant));
    expect(ms.map((m) => m.clickupUserId).sort()).toEqual([SIM_OWNER_ID, SIM_EMPLOYEE_ID].sort());
    expect(ms.every((m) => /^\d+$/.test(m.clickupUserId))).toBe(true);
  });

  it('no quedan avisos pendientes en la cuenta de pruebas (nadie más los enviaría)', async () => {
    const pend = (await db.select().from(opsNotifications).where(eq(opsNotifications.tenantId, simTenant))).filter((n) => n.status === 'pendiente');
    expect(pend.map((n) => `${n.kind} ${n.dedupeKey} próximo ${n.nextAttemptAt.toISOString()}`)).toEqual([]);
  });

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

  it('Pedir una prueba: se guarda, se retira y pasa a hecha cuando su escenario existe', async () => {
    await expect(addTestRequest(owner, 'corto', 'Enric')).rejects.toBeInstanceOf(TestRequestError);
    const a = await addTestRequest(owner, 'Si pulsa Bloqueado y manda un audio, el bloqueo me llega con el audio transcrito', 'Enric');
    const b = await addTestRequest(owner, 'Un encargo urgente fuera de horario me llega igualmente', 'Enric');
    expect((await listTestRequests(owner)).filter((r) => r.status === 'pendiente')).toHaveLength(2);
    await withdrawTestRequest(owner, b.id);
    await expect(withdrawTestRequest(owner, b.id)).rejects.toBeInstanceOf(TestRequestError);
    await markTestRequestsDone(owner, [{ requestId: a.id, scenarioKey: 'aviso-encargo' }]);
    const list = await listTestRequests(owner);
    expect(list.find((r) => r.id === a.id)).toMatchObject({ status: 'hecha', scenarioKey: 'aviso-encargo' });
    expect(list.find((r) => r.id === b.id)?.status).toBe('retirada');
  });

  it('una automatización apagada de serie (jornada) se puede encender y apagar desde el panel', async () => {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.tenantId, owner));
    expect((await getAuto(owner, 'jornada')).enabled).toBe(false);
    expect(await saveAutomation(owner, u.id, 'jornada', { enabled: true })).toEqual({ ok: true });
    expect((await getAuto(owner, 'jornada')).enabled).toBe(true);
    expect(await saveAutomation(owner, u.id, 'jornada', { enabled: false })).toEqual({ ok: true });
    expect((await getAuto(owner, 'jornada')).enabled).toBe(false);
  });
});
