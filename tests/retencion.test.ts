// Limpieza semanal de registros antiguos (D4 + D5, 19 nov 2026): qué borra, qué conserva y cuándo actúa.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiJobs, opsClickupOutbox, opsInboundEmails, opsNotifications, opsRequestEvents, opsSettings, tenants } from '@/lib/db/schema';
import { registerRetention } from '@/lib/core/capabilities';
import { purgeOldRecords, runRetentionCleanup, getLastRetention } from '@/lib/operaciones/retention';

const SLUG = 'prueba-retencion';
const OTHER = 'prueba-retencion-otra';
// Domingo 22 nov 2026, 06:30 en Madrid.
const NOW = new Date('2026-11-22T05:30:00Z');
const OLD = new Date('2026-04-01T10:00:00Z'); // más de 6 meses
const RECENT = new Date('2026-07-01T10:00:00Z'); // menos de 6 meses, más de 90 días
const FRESH = new Date('2026-11-15T10:00:00Z'); // menos de 90 días
let tid = '';
let other = '';
const hookCalls: { tenantId: string; cutoff: Date }[] = [];

async function cleanup() {
  const rows = await db.select({ id: tenants.id }).from(tenants).where(inArray(tenants.slug, [SLUG, OTHER]));
  if (rows.length) await db.delete(tenants).where(inArray(tenants.id, rows.map((r) => r.id)));
}

async function seed(t: string) {
  await db.insert(aiJobs).values([
    { tenantId: t, function: 'old', status: 'completed', input: { prompt: 'datos del cliente' }, output: { content: 'respuesta' }, estimatedCost: '0.120000', inputTokens: 100, outputTokens: 50, createdAt: RECENT },
    { tenantId: t, function: 'fresh', status: 'completed', input: { prompt: 'reciente' }, output: { content: 'ok' }, createdAt: FRESH },
    { tenantId: t, function: 'running', status: 'processing', input: { prompt: 'en curso' }, createdAt: RECENT }
  ]);
  await db.insert(opsNotifications).values([
    { tenantId: t, kind: 'test', dedupeKey: 'old-sent', payload: {}, status: 'enviado', createdAt: OLD },
    { tenantId: t, kind: 'test', dedupeKey: 'old-pending', payload: {}, status: 'pendiente', createdAt: OLD },
    { tenantId: t, kind: 'test', dedupeKey: 'recent-sent', payload: {}, status: 'enviado', createdAt: RECENT }
  ]);
  await db.insert(opsClickupOutbox).values([
    { tenantId: t, action: 'comment', payload: {}, dedupeKey: 'old-done', status: 'hecho', createdAt: OLD },
    { tenantId: t, action: 'comment', payload: {}, dedupeKey: 'old-pending', status: 'pendiente', createdAt: OLD }
  ]);
  await db.insert(opsRequestEvents).values([
    { tenantId: t, eventType: 'start', createdAt: OLD },
    { tenantId: t, eventType: 'start', createdAt: RECENT }
  ]);
  await db.insert(opsInboundEmails).values([
    { tenantId: t, messageId: `${t}-old-done`, fromAddress: 'a@b.com', status: 'descartado', createdAt: OLD },
    { tenantId: t, messageId: `${t}-old-open`, fromAddress: 'a@b.com', status: 'propuesto', createdAt: OLD }
  ]);
}

describe('limpieza de registros antiguos', () => {
  beforeAll(async () => {
    await cleanup();
    const [t] = await db.insert(tenants).values({ name: 'Prueba retención', slug: SLUG }).returning();
    const [o] = await db.insert(tenants).values({ name: 'Prueba retención otra', slug: OTHER }).returning();
    tid = t.id;
    other = o.id;
    await seed(tid);
    await seed(other);
    registerRetention('prueba', async (tenantId, cutoff) => {
      hookCalls.push({ tenantId, cutoff });
      return 7;
    });
  });
  afterAll(cleanup);

  it('borra lo antiguo ya resuelto, conserva lo pendiente y no toca otras cuentas', async () => {
    const r = await purgeOldRecords(tid, 6, 90, NOW);
    expect(r).toMatchObject({ ok: true, aiJobs: 1, notifications: 1, outbox: 1, events: 1, emails: 1 });
    expect(r.modules.prueba).toBe(7);
    expect(hookCalls.at(-1)?.tenantId).toBe(tid);
    expect(hookCalls.at(-1)?.cutoff.toISOString().slice(0, 10)).toBe('2026-05-22');

    const notifs = await db.select({ k: opsNotifications.dedupeKey }).from(opsNotifications).where(eq(opsNotifications.tenantId, tid));
    expect(notifs.map((n) => n.k).sort()).toEqual(['old-pending', 'recent-sent']);
    const outbox = await db.select({ k: opsClickupOutbox.dedupeKey }).from(opsClickupOutbox).where(eq(opsClickupOutbox.tenantId, tid));
    expect(outbox.map((n) => n.k)).toEqual(['old-pending']);
    const emails = await db.select({ s: opsInboundEmails.status }).from(opsInboundEmails).where(eq(opsInboundEmails.tenantId, tid));
    expect(emails.map((e) => e.s)).toEqual(['propuesto']);
    const events = await db.select().from(opsRequestEvents).where(eq(opsRequestEvents.tenantId, tid));
    expect(events).toHaveLength(1);

    // La otra cuenta sigue intacta.
    const otherNotifs = await db.select().from(opsNotifications).where(eq(opsNotifications.tenantId, other));
    expect(otherNotifs).toHaveLength(3);
  });

  it('de los trabajos de IA vacía el texto pero guarda coste y tokens; no toca los recientes ni los en curso', async () => {
    const jobs = await db.select().from(aiJobs).where(eq(aiJobs.tenantId, tid));
    const old = jobs.find((j) => j.function === 'old')!;
    expect(old.input).toEqual({});
    expect(old.output).toEqual({ purgado: true });
    expect(old.estimatedCost).toBe('0.120000');
    expect(old.inputTokens).toBe(100);
    expect(jobs.find((j) => j.function === 'fresh')!.input).toEqual({ prompt: 'reciente' });
    expect(jobs.find((j) => j.function === 'running')!.input).toEqual({ prompt: 'en curso' });
    // Una segunda pasada no vuelve a contar lo ya purgado.
    expect((await purgeOldRecords(tid, 6, 90, NOW)).aiJobs).toBe(0);
  });

  it('el planificador solo actúa el domingo desde las 05:00 de Madrid y una vez por semana', async () => {
    await db.delete(opsSettings).where(and(eq(opsSettings.tenantId, other), eq(opsSettings.key, 'retention_last')));
    expect(await runRetentionCleanup(other, new Date('2026-11-21T10:00:00Z'))).toBeNull(); // sábado
    expect(await runRetentionCleanup(other, new Date('2026-11-22T03:00:00Z'))).toBeNull(); // domingo 04:00 Madrid
    const r = await runRetentionCleanup(other, NOW);
    expect(r?.ok).toBe(true);
    expect(r?.notifications).toBe(1);
    expect((await getLastRetention(other))?.at).toBe(NOW.toISOString());
    expect(await runRetentionCleanup(other, new Date(NOW.getTime() + 3_600_000))).toBeNull(); // misma semana
  });
});
