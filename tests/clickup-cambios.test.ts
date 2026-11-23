// Cambios hechos en ClickUp → encargo de la herramienta (23 nov 2026). La vigilancia real (runWatch) contra la base de
// datos, con la lectura de ClickUp simulada y Telegram interceptado: fecha, prioridad, título, descripción y cliente se
// copian al encargo y sus avisos se ponen al día (los programados cambian de día o salen ya; los enviados se reescriben);
// los responsables añadidos o quitados entran o salen del encargo. Sin falsos cambios cuando ClickUp devuelve lo mismo
// con otro formato.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import type { WatchTask } from '@/lib/operaciones/clickup';

const h = vi.hoisted(() => ({
  tenant: '' as string,
  cfg: null as unknown,
  structure: null as unknown,
  tasks: [] as WatchTask[],
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
vi.mock('@/lib/operaciones/clickup', async (orig) => {
  const m = await orig<typeof import('@/lib/operaciones/clickup')>();
  return { ...m, fetchWatchTasks: async () => ({ tasks: h.tasks, truncated: false, requests: 1 }) };
});
vi.mock('@/lib/operaciones/queries', async (orig) => {
  const m = await orig<typeof import('@/lib/operaciones/queries')>();
  return { ...m, getClickUpToken: async (t: string) => (t === h.tenant ? { token: 'x', workspaceId: 'w' } : m.getClickUpToken(t)) };
});
vi.mock('@/lib/operaciones/structure', async (orig) => {
  const m = await orig<typeof import('@/lib/operaciones/structure')>();
  return { ...m, getStructure: async (t: string) => (t === h.tenant ? h.structure : m.getStructure(t)) };
});

import { db } from '@/lib/db/drizzle';
import {
  opsClickupTaskSnapshots,
  opsClickupWatch,
  opsNotifications,
  opsRequestEvents,
  opsRequests,
  opsTeamProfiles,
  opsTelegramMembers,
  tenants,
  users
} from '@/lib/db/schema';
import { madridNoonMs } from '@/lib/operaciones/clickup';
import { enqueueNewRequestNotification, processNotifications } from '@/lib/operaciones/notifications';
import { runWatch } from '@/lib/operaciones/watch';

// Lunes 23 nov 2026, 10:00 en Madrid.
const NOW = Date.UTC(2026, 10, 23, 9, 0);
const SLUG = 'seg-test-clickup-cambios';
const ANA = '900000081';
const BEA = '900000082';
const CARLOS = '900000083'; // sin Telegram
const CHAT = { [ANA]: 780081, [BEA]: 780082 } as Record<string, number>;

async function cleanup() {
  const [t] = await db.select().from(tenants).where(eq(tenants.slug, SLUG));
  if (!t) return;
  await db.delete(opsRequestEvents).where(eq(opsRequestEvents.tenantId, t.id));
  await db.delete(opsNotifications).where(eq(opsNotifications.tenantId, t.id));
  await db.delete(opsRequests).where(eq(opsRequests.tenantId, t.id));
  await db.delete(opsClickupTaskSnapshots).where(eq(opsClickupTaskSnapshots.tenantId, t.id));
  await db.delete(opsClickupWatch).where(eq(opsClickupWatch.tenantId, t.id));
  await db.delete(opsTeamProfiles).where(eq(opsTeamProfiles.tenantId, t.id));
  await db.delete(opsTelegramMembers).where(eq(opsTelegramMembers.tenantId, t.id));
  await db.delete(users).where(eq(users.tenantId, t.id));
  await db.delete(tenants).where(eq(tenants.id, t.id));
}

let stamp = NOW;
function task(id: string, o: Partial<WatchTask> & { assigneeIds?: string[] } = {}): WatchTask {
  const { assigneeIds, ...rest } = o;
  return {
    id,
    name: 'Revisar el informe SEO',
    url: `https://app.clickup.com/t/${id}`,
    description: 'Qué hay que hacer\nRevisar el informe y enviarlo',
    markdown: '## Qué hay que hacer\n\n* Revisar el informe y enviarlo',
    statusName: 'to do',
    statusType: 'open',
    listId: 'L1',
    listName: 'Web',
    assignees: (assigneeIds ?? [ANA]).map((a) => ({ id: a, username: a })),
    creatorId: '1',
    createdMs: NOW - 3600_000,
    updatedMs: ++stamp,
    closedMs: null,
    dueMs: madridNoonMs('2026-11-25'),
    priority: 3,
    dropdowns: { F1: { optionId: 'o1', label: 'Athos', fieldName: 'Cliente' } },
    ...rest
  };
}

describe('cambios hechos en ClickUp llegan al encargo', () => {
  let base: Record<string, unknown> = {};
  const settle = async () => {
    const g = globalThis as unknown as { __kijuNotifBusy?: boolean };
    for (let i = 0; i < 100 && g.__kijuNotifBusy; i++) await new Promise((r) => setTimeout(r, 20));
    await processNotifications(h.tenant);
    for (let i = 0; i < 100 && g.__kijuNotifBusy; i++) await new Promise((r) => setTimeout(r, 20));
  };
  const watch = async (...tasks: WatchTask[]) => {
    h.tasks = tasks;
    await db.update(opsClickupWatch).set({ lastRunAt: null }).where(eq(opsClickupWatch.tenantId, h.tenant));
    await runWatch(h.tenant, new Date());
    await settle();
  };
  const reqOf = async (id: string) => (await db.select().from(opsRequests).where(eq(opsRequests.id, id)))[0];
  const noticesOf = (id: string) => db.select().from(opsNotifications).where(and(eq(opsNotifications.requestId, id), eq(opsNotifications.kind, 'new_request')));
  const eventsOf = (id: string, type: string) =>
    db.select().from(opsRequestEvents).where(and(eq(opsRequestEvents.requestId, id), eq(opsRequestEvents.eventType, type)));
  const sentTo = (who: string) => h.sent.filter((s) => s.method === 'sendMessage' && s.params.chat_id === CHAT[who]);
  const newReq = async (taskId: string, extra: Record<string, unknown> = {}) => {
    const [r] = await db
      .insert(opsRequests)
      .values({ ...(base as typeof opsRequests.$inferInsert), clickupTaskId: taskId, clickupTaskUrl: `https://app.clickup.com/t/${taskId}`, ...extra })
      .returning();
    await enqueueNewRequestNotification(r.id);
    await settle();
    return r;
  };

  beforeAll(async () => {
    await cleanup();
    const [t] = await db.insert(tenants).values({ name: 'Prueba cambios de ClickUp', slug: SLUG }).returning();
    h.tenant = t.id;
    h.cfg = { id: 'fake', tenantId: t.id, testMode: false };
    h.structure = {
      connected: true,
      syncedAt: null,
      workspaceId: 'w',
      workspaceName: 'Prueba',
      meId: null,
      meUsername: null,
      spaces: [
        {
          id: 'S1',
          name: 'Clientes',
          selected: true,
          lists: [
            { id: 'L1', name: 'Web', clientFieldId: 'F1' },
            { id: 'L2', name: 'SEO', clientFieldId: null }
          ]
        }
      ],
      members: [
        { id: ANA, username: 'Ana' },
        { id: BEA, username: 'Bea' },
        { id: CARLOS, username: 'Carlos' }
      ],
      clientFields: { F1: { name: 'Cliente', options: [{ id: 'o1', label: 'Athos' }, { id: 'o2', label: 'Bravo' }] } }
    };
    for (const [id, name] of [[ANA, 'Ana'], [BEA, 'Bea']]) {
      await db.insert(opsTelegramMembers).values({ tenantId: t.id, clickupUserId: id, username: name, telegramChatId: CHAT[id] });
      await db.insert(opsTeamProfiles).values({ tenantId: t.id, clickupUserId: id, name, timezone: 'Europe/Madrid', workDays: '1,2,3,4,5', workStart: '09:00', hoursPerDay: '8' });
    }
    const [u] = await db.insert(users).values({ tenantId: t.id, email: `clickup-cambios-${Date.now()}@test.local`, passwordHash: 'x' }).returning({ id: users.id });
    await db.insert(opsClickupWatch).values({ tenantId: t.id, enabled: true, activatedAt: new Date(NOW - 86_400_000), cursorMs: NOW - 60_000 });
    base = {
      tenantId: t.id,
      createdBy: u.id,
      clickupListId: 'L1',
      clickupListName: 'Web',
      title: 'Revisar el informe SEO',
      originalRequest: 'revisa el informe',
      preparedDescription: '## Qué hay que hacer\n- Revisar el informe y enviarlo',
      status: 'creado',
      assigneeClickupId: ANA,
      assigneeName: 'Ana',
      dueDate: '2026-11-25',
      priority: 3,
      clientOptionId: 'o1',
      clientName: 'Athos'
    };
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterAll(async () => {
    vi.useRealTimers();
    await cleanup();
  });

  it('si ClickUp devuelve lo mismo con otro formato (y la marca), no cambia nada', async () => {
    const r = await newReq('cc-igual');
    const [before] = await noticesOf(r.id);
    expect(before.status).toBe('pendiente'); // para el miércoles: programado
    await watch(task('cc-igual', { markdown: `## Qué hay que hacer\n\n* Revisar el informe y enviarlo\n\n## Transcripción del audio\nhola\n\n[kiju:${r.id}]` }));
    expect(await eventsOf(r.id, 'clickup_updated')).toHaveLength(0);
    const [after] = await noticesOf(r.id);
    expect(after.nextAttemptAt.getTime()).toBe(before.nextAttemptAt.getTime());
    expect((await reqOf(r.id)).preparedDescription).toBe(base.preparedDescription);
  });

  it('fecha movida: el aviso programado cambia de día; movida a hoy, sale ya', async () => {
    const r = await newReq('cc-fecha');
    await watch(task('cc-fecha', { dueMs: madridNoonMs('2026-11-27') }));
    expect((await reqOf(r.id)).dueDate).toBe('2026-11-27');
    let [n] = await noticesOf(r.id);
    expect(n.status).toBe('pendiente');
    expect(n.nextAttemptAt.getTime()).toBe(Date.UTC(2026, 10, 27, 8, 0));
    expect((n.payload as { deferredTo?: string }).deferredTo).toBe('2026-11-27');
    const [ev] = await eventsOf(r.id, 'clickup_updated');
    expect(ev.payload).toMatchObject({ fecha: { from: '2026-11-25', to: '2026-11-27' } });

    const before = sentTo(ANA).length;
    await watch(task('cc-fecha', { dueMs: madridNoonMs('2026-11-23') }));
    [n] = await noticesOf(r.id);
    expect(n.status).toBe('enviado');
    expect(sentTo(ANA).length).toBe(before + 1);
    expect(String(sentTo(ANA).at(-1)!.params.text)).toContain('lun');
  });

  it('pasada a urgente en ClickUp: el aviso programado sale ya', async () => {
    const r = await newReq('cc-urgente');
    await watch(task('cc-urgente', { priority: 1 }));
    expect((await reqOf(r.id)).priority).toBe(1);
    const [n] = await noticesOf(r.id);
    expect(n.status).toBe('enviado');
  });

  it('título, descripción y cliente cambiados: se copian y el aviso enviado se reescribe', async () => {
    const r = await newReq('cc-texto', { dueDate: '2026-11-23' }); // para hoy: el aviso sale al momento
    let [n] = await noticesOf(r.id);
    expect(n.status).toBe('enviado');
    h.sent.length = 0;
    await watch(
      task('cc-texto', {
        name: 'Revisar y enviar el informe SEO de noviembre',
        dueMs: madridNoonMs('2026-11-23'),
        markdown: '## Resultado esperado\n\nInforme enviado al cliente antes de las 14:00',
        description: 'Resultado esperado\nInforme enviado al cliente antes de las 14:00',
        dropdowns: { F1: { optionId: 'o2', label: 'Bravo', fieldName: 'Cliente' } }
      })
    );
    const req = await reqOf(r.id);
    expect(req.title).toBe('Revisar y enviar el informe SEO de noviembre');
    expect(req.preparedDescription).toContain('antes de las 14:00');
    expect(req.clientName).toBe('Bravo');
    [n] = await noticesOf(r.id);
    expect((n.payload as { text: string }).text).toContain('de noviembre');
    const edit = h.sent.find((s) => s.method === 'editMessageText' && s.params.chat_id === CHAT[ANA]);
    expect(String(edit?.params.text)).toContain('de noviembre');
    expect(String(edit?.params.text)).toContain('antes de las 14:00');
    expect(sentTo(ANA)).toHaveLength(0); // se reescribe, no se manda otro
  });

  it('una lista sin campo «Cliente»: el cliente de la herramienta se respeta', async () => {
    const r = await newReq('cc-lista', { clickupListId: 'L2', clickupListName: 'SEO' });
    await watch(task('cc-lista', { listId: 'L2', listName: 'SEO', dropdowns: {} }));
    const req = await reqOf(r.id);
    expect(req.clientName).toBe('Athos');
    expect(await eventsOf(r.id, 'clickup_updated')).toHaveLength(0);
  });

  it('alguien añadido sin empezar: entra como candidato y se le avisa; quitado: sale', async () => {
    const r = await newReq('cc-mas', { dueDate: '2026-11-23' });
    await watch(task('cc-mas', { dueMs: madridNoonMs('2026-11-23') })); // primera lectura: solo Ana
    const before = sentTo(BEA).length;
    await watch(task('cc-mas', { dueMs: madridNoonMs('2026-11-23'), assigneeIds: [ANA, BEA] }));
    let req = await reqOf(r.id);
    expect(req.candidateIds).toEqual([ANA, BEA]);
    expect(req.assigneeClickupId).toBe(ANA);
    expect(sentTo(BEA).length).toBe(before + 1);
    expect(String(sentTo(BEA).at(-1)!.params.text)).toContain('añadido en ClickUp');

    await watch(task('cc-mas', { dueMs: madridNoonMs('2026-11-23'), assigneeIds: [ANA] }));
    req = await reqOf(r.id);
    expect(req.candidateIds).toEqual([ANA]);
  });

  it('se quita a quien lo estaba haciendo: vuelve a «asignado» para quien queda y se le avisa', async () => {
    const r = await newReq('cc-quita', { dueDate: '2026-11-23', candidateIds: [ANA, BEA] });
    await db.update(opsRequests).set({ workStatus: 'en_curso' }).where(eq(opsRequests.id, r.id));
    await watch(task('cc-quita', { dueMs: madridNoonMs('2026-11-23'), assigneeIds: [ANA, BEA] }));
    const before = sentTo(BEA).length;
    await watch(task('cc-quita', { dueMs: madridNoonMs('2026-11-23'), assigneeIds: [BEA] }));
    const req = await reqOf(r.id);
    expect(req.workStatus).toBe('asignado');
    expect(req.assigneeClickupId).toBe(BEA);
    expect(sentTo(BEA).length).toBe(before + 1);
    expect(String(sentTo(BEA).at(-1)!.params.text)).toContain('reasignado en ClickUp');
  });

  it('pasada a alguien sin Telegram: figura como responsable, sin aviso', async () => {
    const r = await newReq('cc-carlos', { dueDate: '2026-11-23' });
    const total = h.sent.filter((s) => s.method === 'sendMessage').length;
    await watch(task('cc-carlos', { dueMs: madridNoonMs('2026-11-23'), assigneeIds: [CARLOS] }));
    const req = await reqOf(r.id);
    expect(req.assigneeClickupId).toBe(CARLOS);
    expect(req.assigneeName).toBe('Carlos');
    expect(req.candidateIds).toEqual([]);
    expect(h.sent.filter((s) => s.method === 'sendMessage').length).toBe(total);
    const [ev] = await eventsOf(r.id, 'reassigned');
    expect(ev.payload).toMatchObject({ sinTelegram: true });
  });

  it('un aviso programado de quien ya no lleva el encargo no sale', async () => {
    const r = await newReq('cc-prog'); // para el miércoles: programado para Ana
    await watch(task('cc-prog'));
    await watch(task('cc-prog', { assigneeIds: [BEA] }));
    const all = await noticesOf(r.id);
    const ana = all.find((n) => n.forClickupUserId === ANA || n.forClickupUserId === null)!;
    const bea = all.find((n) => n.forClickupUserId === BEA)!;
    expect(bea.status).toBe('pendiente'); // también programado para su día
    await db.update(opsNotifications).set({ nextAttemptAt: sql`now() - interval '1 minute'` }).where(eq(opsNotifications.id, ana.id));
    await settle();
    const [after] = await db.select().from(opsNotifications).where(eq(opsNotifications.id, ana.id));
    expect((after.payload as { skipped?: string }).skipped).toMatch(/ya no hacía falta/);
  });
});
