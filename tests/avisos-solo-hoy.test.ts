// Avisos de encargo solo el día que toca (23 nov 2026; lo detectó Jesús). Cálculo puro y circuito real contra la base de
// datos: un encargo para otro día no avisa al asignarse, queda programado a la hora de entrada de ese día y sale entonces;
// si entretanto se empezó, ya no sale; los de hoy, sin fecha y urgentes avisan al momento. Telegram se intercepta y el
// reloj se simula.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';

const h = vi.hoisted(() => ({
  tenant: '' as string,
  cfg: null as unknown,
  sent: [] as { method: string; params: Record<string, unknown> }[],
  msgId: 1
}));

vi.mock('@/lib/operaciones/telegram', async (orig) => {
  const m = await orig<typeof import('@/lib/operaciones/telegram')>();
  return {
    ...m,
    tg: vi.fn(async (_token: string, method: string, params: Record<string, unknown> = {}) => {
      h.sent.push({ method, params });
      return method === 'sendMessage' ? { message_id: h.msgId++ } : true;
    })
  };
});
vi.mock('@/lib/operaciones/telegram-config', async (orig) => {
  const m = await orig<typeof import('@/lib/operaciones/telegram-config')>();
  return {
    ...m,
    getTelegramConfig: async (t: string) => (t === h.tenant ? h.cfg : m.getTelegramConfig(t)),
    decodeBotToken: () => 'TOKEN-DE-PRUEBA'
  };
});

import { db } from '@/lib/db/drizzle';
import { opsAutomations, opsNotifications, opsRequests, opsTeamProfiles, opsTelegramMembers, tenants, users } from '@/lib/db/schema';
import { enqueueNewRequestNotification, processNotifications } from '@/lib/operaciones/notifications';
import { deferredNoticeAt } from '@/lib/operaciones/deferred-notice';
import { invalidateAutomations } from '@/lib/operaciones/automations';
import type { Schedule } from '@/lib/operaciones/team-profiles';

// Lunes 23 nov 2026, 10:00 en Madrid (09:00 UTC).
const NOW = Date.UTC(2026, 10, 23, 9, 0);
const sch: Schedule = {
  timezone: 'Europe/Madrid',
  workStart: '09:00',
  workDays: [1, 2, 3, 4, 5],
  hoursPerDay: 8,
  active: true,
  lunchStart: null,
  lunchEnd: null,
  quietStart: null,
  quietEnd: null,
  urgentBypassQuiet: false
};

describe('avisos de encargo: cuándo salen (cálculo)', () => {
  it('hoy, sin fecha, vencido o urgente: al momento', () => {
    expect(deferredNoticeAt(sch, { dueDate: null, priority: 3 }, NOW)).toBeNull();
    expect(deferredNoticeAt(sch, { dueDate: '2026-11-23', priority: 3 }, NOW)).toBeNull();
    expect(deferredNoticeAt(sch, { dueDate: '2026-11-20', priority: 3 }, NOW)).toBeNull();
    expect(deferredNoticeAt(sch, { dueDate: '2026-11-25', priority: 1 }, NOW)).toBeNull();
    expect(deferredNoticeAt({ ...sch, active: false }, { dueDate: '2026-11-25', priority: 3 }, NOW)).toBeNull();
  });

  it('otro día: ese día a su hora de entrada, en su zona', () => {
    // Miércoles 25, 09:00 en Madrid = 08:00 UTC.
    expect(deferredNoticeAt(sch, { dueDate: '2026-11-25', priority: 3 }, NOW)).toEqual({ at: Date.UTC(2026, 10, 25, 8, 0), day: '2026-11-25' });
    // En Santo Domingo (UTC-4), las 09:00 son las 13:00 UTC.
    expect(deferredNoticeAt({ ...sch, timezone: 'America/Santo_Domingo' }, { dueDate: '2026-11-25', priority: 2 }, NOW)?.at).toBe(Date.UTC(2026, 10, 25, 13, 0));
  });

  it('si ese día no trabaja (fin de semana o ausencia), el último día laborable antes', () => {
    // Domingo 29 → viernes 27.
    expect(deferredNoticeAt(sch, { dueDate: '2026-11-29', priority: 3 }, NOW)?.day).toBe('2026-11-27');
    // Ausente el miércoles 25 → martes 24.
    expect(deferredNoticeAt({ ...sch, daysOff: new Set(['2026-11-25']) }, { dueDate: '2026-11-25', priority: 3 }, NOW)?.day).toBe('2026-11-24');
    // Viernes, encargo para el domingo: el último laborable antes es hoy → al momento.
    expect(deferredNoticeAt(sch, { dueDate: '2026-11-29', priority: 3 }, Date.UTC(2026, 10, 27, 9, 0))).toBeNull();
  });

  it('la hora de entrada cae en su silencio: sale en el minuto permitido más cercano', () => {
    const r = deferredNoticeAt({ ...sch, quietStart: '08:00', quietEnd: '09:30' }, { dueDate: '2026-11-25', priority: 3 }, NOW);
    expect(r?.at).toBe(Date.UTC(2026, 10, 25, 8, 30));
  });
});

const EMP = '900000077';
const CHAT = 770077;
const SLUG = 'seg-test-avisos-solo-hoy';

async function cleanup() {
  const [t] = await db.select().from(tenants).where(eq(tenants.slug, SLUG));
  if (!t) return;
  await db.delete(opsNotifications).where(eq(opsNotifications.tenantId, t.id));
  await db.delete(opsRequests).where(eq(opsRequests.tenantId, t.id));
  await db.delete(users).where(eq(users.tenantId, t.id));
  await db.delete(tenants).where(eq(tenants.id, t.id));
}

describe('avisos de encargo: circuito con la cola real', () => {
  let base: Record<string, unknown> = {};
  // El encolado lanza el envío sin esperarlo (y la cola es de una en una): se espera a que termine y se pasa otra vez.
  const settle = async () => {
    const g = globalThis as unknown as { __kijuNotifBusy?: boolean };
    for (let i = 0; i < 100 && g.__kijuNotifBusy; i++) await new Promise((r) => setTimeout(r, 20));
    await processNotifications(h.tenant);
  };
  const arrive = (id: string) => db.update(opsNotifications).set({ nextAttemptAt: sql`now() - interval '1 minute'` }).where(eq(opsNotifications.id, id));
  const sentTo = () => h.sent.filter((s) => s.method === 'sendMessage' && s.params.chat_id === CHAT);
  const newReq = async (title: string, extra: Record<string, unknown>) => {
    const [r] = await db.insert(opsRequests).values({ ...(base as typeof opsRequests.$inferInsert), title, clickupTaskId: `ash-${Math.random().toString(36).slice(2, 8)}`, ...extra }).returning();
    await enqueueNewRequestNotification(r.id);
    await settle();
    const [n] = await db.select().from(opsNotifications).where(eq(opsNotifications.requestId, r.id));
    return { req: r, notice: n };
  };

  beforeAll(async () => {
    await cleanup();
    const [t] = await db.insert(tenants).values({ name: 'Prueba avisos solo hoy', slug: SLUG }).returning();
    h.tenant = t.id;
    h.cfg = { id: 'fake', tenantId: t.id, testMode: false };
    await db.insert(opsTelegramMembers).values({ tenantId: t.id, clickupUserId: EMP, username: 'Jesús Prueba', telegramChatId: CHAT });
    await db.insert(opsTeamProfiles).values({ tenantId: t.id, clickupUserId: EMP, name: 'Jesús Prueba', timezone: 'Europe/Madrid', workDays: '1,2,3,4,5', workStart: '09:00', hoursPerDay: '8' });
    const [u] = await db.insert(users).values({ tenantId: t.id, email: `avisos-hoy-${Date.now()}@test.local`, passwordHash: 'x' }).returning({ id: users.id });
    base = { tenantId: t.id, createdBy: u.id, clickupListId: 'L1', clickupListName: 'Web', originalRequest: 'x', preparedDescription: 'x', status: 'creado', assigneeClickupId: EMP, assigneeName: 'Jesús Prueba', clickupTaskUrl: 'https://app.clickup.com/t/x', priority: 3 };
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterAll(async () => {
    vi.useRealTimers();
    await cleanup();
  });

  it('para hoy: avisa al momento, con botones', async () => {
    const before = sentTo().length;
    const { notice } = await newReq('Cambiar el teléfono', { dueDate: '2026-11-23' });
    expect(notice.status).toBe('enviado');
    expect(sentTo().length).toBe(before + 1);
  });

  it('urgente para otro día: avisa al momento', async () => {
    const before = sentTo().length;
    const { notice } = await newReq('Arreglar la web caída', { dueDate: '2026-11-26', priority: 1 });
    expect(notice.status).toBe('enviado');
    expect(sentTo().length).toBe(before + 1);
  });

  it('para otro día: no avisa ahora; sale ese día a su hora de entrada, con botones', async () => {
    const before = sentTo().length;
    const { req, notice } = await newReq('Revisar el informe SEO', { dueDate: '2026-11-25' });
    expect(notice.status).toBe('pendiente');
    expect(notice.nextAttemptAt.getTime()).toBe(Date.UTC(2026, 10, 25, 8, 0));
    expect((notice.payload as { deferredTo?: string }).deferredTo).toBe('2026-11-25');
    expect(sentTo().length).toBe(before);

    // Antes de su hora no sale.
    await settle();
    expect(sentTo().length).toBe(before);

    // Llega su hora (la cola compara con la hora de la base de datos): sale, con «Empezar ahora».
    vi.setSystemTime(Date.UTC(2026, 10, 25, 8, 1));
    await arrive(notice.id);
    await settle();
    const msgs = sentTo();
    expect(msgs.length).toBe(before + 1);
    expect(String(msgs.at(-1)!.params.text)).toContain('Revisar el informe SEO');
    expect(JSON.stringify(msgs.at(-1)!.params.reply_markup)).toContain(`st:${req.id}`);
    vi.setSystemTime(NOW);
  });

  it('si se empezó o cambió de persona antes de su día, ya no se manda', async () => {
    const before = sentTo().length;
    const a = await newReq('Publicar el artículo', { dueDate: '2026-11-26' });
    const b = await newReq('Subir las fotos', { dueDate: '2026-11-26' });
    await db.update(opsRequests).set({ workStatus: 'en_curso' }).where(eq(opsRequests.id, a.req.id));
    await db.update(opsRequests).set({ assigneeClickupId: '900000078', assigneeName: 'Otra persona' }).where(eq(opsRequests.id, b.req.id));
    vi.setSystemTime(Date.UTC(2026, 10, 26, 8, 1));
    await arrive(a.notice.id);
    await arrive(b.notice.id);
    await settle();
    expect(sentTo().length).toBe(before);
    for (const id of [a.notice.id, b.notice.id]) {
      const [n] = await db.select().from(opsNotifications).where(eq(opsNotifications.id, id));
      expect(n.status).toBe('enviado');
      expect(n.sentAt).toBeNull();
      expect((n.payload as { skipped?: string }).skipped).toMatch(/ya no hacía falta/);
    }
    vi.setSystemTime(NOW);
  });

  it('con el ajuste apagado en el panel, avisa al momento como antes', async () => {
    await db.insert(opsAutomations).values({ tenantId: h.tenant, key: 'new_request', enabled: true, config: { onlyToday: false } });
    invalidateAutomations(h.tenant);
    const before = sentTo().length;
    const { notice } = await newReq('Montar la campaña', { dueDate: '2026-11-27' });
    expect(notice.status).toBe('enviado');
    expect(sentTo().length).toBe(before + 1);
  });
});
