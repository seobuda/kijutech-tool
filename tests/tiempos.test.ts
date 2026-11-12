// Tiempos de tarea (5B): cálculo puro y el circuito completo de punta a punta, como lo viviría una persona
// (empezar con una tarea, estimar, descansar, cambiar de tarea, elegir el tipo, terminar, explicar el exceso) y
// como lo ve el sistema (filas de ops_task_times, registros de la jornada, pestaña Tiempos). Telegram y
// «Equipo hoy» se interceptan; el reloj se simula. Todo lo demás es código real contra la base de datos.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

const h = vi.hoisted(() => ({
  tenant: '' as string,
  cfg: null as unknown,
  owner: null as unknown,
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
    decodeBotToken: () => 'TOKEN-DE-PRUEBA',
    getOwnerMember: async (t: string) => (t === h.tenant ? h.owner : m.getOwnerMember(t))
  };
});
vi.mock('@/lib/operaciones/team-today', async (orig) => {
  const m = await orig<typeof import('@/lib/operaciones/team-today')>();
  return {
    ...m,
    getTeamToday: async () => ({
      members: [
        {
          member: { id: '900000012', username: 'Leo Prueba' },
          overdue: [],
          today: [{ id: 'tt-tk1', name: 'Artículo sobre pilates', url: 'https://app.clickup.com/t/tt-tk1', dueDate: null, status: 'open', listName: 'Blog', listId: null, assigneeIds: [] }]
        }
      ],
      truncated: false,
      fetchedAt: Date.now(),
      requests: 0,
      cached: true,
      workspaceName: 'Prueba',
      spacesCount: 1
    })
  };
});

import { db } from '@/lib/db/drizzle';
import {
  opsAutomations,
  opsRequests,
  opsTaskTimes,
  opsTeamProfiles,
  opsTelegramMembers,
  opsWorkEvents,
  opsWorkTypes,
  tenants,
  users
} from '@/lib/db/schema';
import { processNotifications } from '@/lib/operaciones/notifications';
import { handleUpdate } from '@/lib/operaciones/telegram-handler';
import { localTimeMs, shiftDate, todayIn } from '@/lib/operaciones/jornada';
import { computeDay, type DayEvent } from '@/lib/operaciones/jornada-core';
import { onTaskFinished } from '@/lib/operaciones/tiempos';
import { getMyTimes, getTiemposOverview } from '@/lib/operaciones/tiempos-overview';
import { estimateOptions, precisionHit, suggestBand, taskMinutes, verdictFor } from '@/lib/operaciones/tiempos-core';
import type { TgUpdate } from '@/lib/operaciones/telegram';

// --- Cálculo puro --------------------------------------------------------------------------

const MIN = 60_000;
const ev = (kind: DayEvent['kind'], at: number, task: DayEvent['task'] = null): DayEvent => ({
  id: `${kind}-${at}`,
  kind,
  at: at * MIN,
  plannedMinutes: null,
  reason: null,
  source: 'telegram',
  task
});

describe('tiempos: cálculo puro', () => {
  const A = { clickupTaskId: 'A', name: 'Tarea A' };
  const B = { clickupTaskId: 'B', name: 'Tarea B' };

  it('reparte lo trabajado por tarea activa y no cuenta las pausas', () => {
    const st = computeDay(
      [ev('entrada', 0, A), ev('descanso', 10), ev('vuelta', 15), ev('tarea', 20, B), ev('tarea', 30, A), ev('salida', 50)],
      100 * MIN
    );
    expect(st.workedMin).toBe(45);
    expect(taskMinutes([st], 'A', 0, 100 * MIN)).toBe(35);
    expect(taskMinutes([st], 'B', 0, 100 * MIN)).toBe(10);
    // Recortado al periodo de esta vez (p. ej. se terminó a los 40).
    expect(taskMinutes([st], 'A', 0, 40 * MIN)).toBe(25);
  });

  it('un cambio de tarea durante una pausa fija la tarea para cuando vuelva', () => {
    const st = computeDay([ev('entrada', 0, A), ev('descanso', 10), ev('tarea', 12, B), ev('vuelta', 15)], 25 * MIN);
    expect(st.activeTask?.clickupTaskId).toBe('B');
    expect(taskMinutes([st], 'A', 0, 25 * MIN)).toBe(10);
    expect(taskMinutes([st], 'B', 0, 25 * MIN)).toBe(10);
  });

  it('no se puede cambiar de tarea sin haber empezado la jornada', () => {
    const st = computeDay([ev('tarea', 5, A)], 20 * MIN);
    expect(st.status).toBe('sin_empezar');
    expect(st.taskPieces).toHaveLength(0);
  });

  it('resultado frente al margen', () => {
    expect(verdictFor(25, 20, 30)).toBe('dentro');
    expect(verdictFor(31, 20, 30)).toBe('pasado');
    expect(verdictFor(10, 20, 30)).toBe('rapido');
    expect(verdictFor(10, null, null)).toBe('sin_margen');
    expect(verdictFor(500, null, 30)).toBe('pasado');
  });

  it('la precisión cuenta por los dos lados (inflar la estimación no sirve)', () => {
    expect(precisionHit(30, 34, 20)).toBe(true);
    expect(precisionHit(30, 22, 20)).toBe(false);
    expect(precisionHit(60, 30, 20)).toBe(false); // estimó de más
    expect(precisionHit(10, 14, 20)).toBe(true); // mínimo 5 min de tolerancia
  });

  it('opciones de estimación alrededor de lo habitual', () => {
    expect(estimateOptions(null, 20, 30)).toEqual([15, 25, 40]);
    expect(estimateOptions(60, 20, 30)).toEqual([40, 60, 90]);
    expect(estimateOptions(null, null, null)).toEqual([20, 30, 45]);
  });

  it('propone un margen con suficientes tareas', () => {
    expect(suggestBand([20, 25], 3)).toBeNull();
    expect(suggestBand([18, 22, 25, 27, 30, 41, 24, 26], 8)).toEqual({ min: 20, max: 30, n: 8 });
  });
});

// --- Circuito completo ---------------------------------------------------------------------

const SLUG = 'seg-test-tiempos-circuito';
const OWNER = '900000011';
const EMP = '900000012';
const OWNER_CHAT = 92001;
const EMP_CHAT = 92002;
const TZ = 'Europe/Madrid';
const DAY = shiftDate(todayIn(TZ), -2);
const T0 = localTimeMs(TZ, DAY, '10:00');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let upd = 1;
let req1 = '';
let req2 = '';

async function flush() {
  for (let i = 0; i < 6; i++) {
    await sleep(40);
    await processNotifications(h.tenant);
  }
}
const at = (minutes: number) => vi.setSystemTime(T0 + minutes * MIN);
const toEmp = () => h.sent.filter((s) => s.method === 'sendMessage' && s.params.chat_id === EMP_CHAT);
const buttonsOf = (s: { params: Record<string, unknown> } | undefined) =>
  ((s?.params.reply_markup as { inline_keyboard?: { text: string; callback_data: string }[][] } | undefined)?.inline_keyboard ?? []).flat();
const lastWith = (needle: string) => [...toEmp()].reverse().find((s) => String(s.params.text).includes(needle));
const lastAnswer = () => h.sent.filter((s) => s.method === 'answerCallbackQuery').at(-1)?.params.text;

async function press(data: string, chat = EMP_CHAT) {
  const u: TgUpdate = {
    update_id: upd++,
    callback_query: { id: `cb${upd}`, from: { id: chat } as never, message: { message_id: 1, chat: { id: chat, type: 'private' } as never }, data }
  };
  await handleUpdate(h.tenant, 'TOKEN-DE-PRUEBA', u);
  await flush();
}
async function say(text: string, chat = EMP_CHAT) {
  await handleUpdate(h.tenant, 'TOKEN-DE-PRUEBA', { update_id: upd++, message: { message_id: upd, chat: { id: chat, type: 'private' } as never, text } });
  await flush();
}
const times = () => db.select().from(opsTaskTimes).where(eq(opsTaskTimes.tenantId, h.tenant));
const rowFor = async (task: string) => (await times()).find((r) => r.clickupTaskId === task && !r.voidedAt)!;

async function cleanup() {
  const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, SLUG));
  if (!t) return;
  await db.delete(opsRequests).where(eq(opsRequests.tenantId, t.id));
  await db.delete(users).where(eq(users.tenantId, t.id));
  await db.delete(tenants).where(eq(tenants.id, t.id)); // lo demás cae en cascada
}

describe('circuito de tiempos de tarea (persona y sistema)', () => {
  beforeAll(async () => {
    await cleanup();
    const [t] = await db.insert(tenants).values({ name: 'Prueba tiempos', slug: SLUG }).returning();
    h.tenant = t.id;
    h.cfg = { id: 'fake', tenantId: t.id, testMode: false };
    const [owner] = await db.insert(opsTelegramMembers).values({ tenantId: t.id, clickupUserId: OWNER, username: 'Dueño', telegramChatId: OWNER_CHAT }).returning();
    h.owner = owner;
    await db.insert(opsTelegramMembers).values({ tenantId: t.id, clickupUserId: EMP, username: 'Leo Prueba', telegramChatId: EMP_CHAT });
    await db.insert(opsTeamProfiles).values({ tenantId: t.id, clickupUserId: EMP, name: 'Leo Prueba', timezone: TZ, workDays: '1,2,3,4,5,6,7', workStart: '10:00', hoursPerDay: '8' });
    await db.insert(opsAutomations).values([
      { tenantId: t.id, key: 'jornada', enabled: true, config: { repingMin: 60, maxPings: 1, emailPing: false, breakQuotaMin: 20, lunchMarginMin: 10, autoCloseMin: 120, holdNotices: true } },
      { tenantId: t.id, key: 'tiempos', enabled: true, config: { askEstimate: true, askJustify: true, precisionPct: 20, minSamples: 8 } }
    ]);
    await db.insert(opsWorkTypes).values([
      { tenantId: t.id, key: 'articulo', label: 'Artículo', sortOrder: 1, minMinutes: 20, maxMinutes: 30 },
      { tenantId: t.id, key: 'cambio_web', label: 'Cambio web', sortOrder: 2 }
    ]);
    const [u] = await db.insert(users).values({ tenantId: t.id, email: `tiempos-${Date.now()}@test.local`, passwordHash: 'x' }).returning({ id: users.id });
    const base = { tenantId: t.id, createdBy: u.id, clickupListId: 'L1', originalRequest: 'x', preparedDescription: 'x', status: 'creado', assigneeClickupId: EMP, assigneeName: 'Leo Prueba' };
    const [r1] = await db.insert(opsRequests).values({ ...base, title: 'Artículo sobre pilates', clickupTaskId: 'tt-tk1', workTypeKey: 'articulo' }).returning();
    const [r2] = await db.insert(opsRequests).values({ ...base, title: 'Cambiar el banner', clickupTaskId: 'tt-tk2' }).returning();
    req1 = r1.id;
    req2 = r2.id;
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterAll(async () => {
    vi.useRealTimers();
    await cleanup();
  });

  it('empezar la jornada con una tarea abre su tiempo y pide la estimación', async () => {
    at(0);
    await press(`jw:st:tt-tk1:${EMP}`);
    const row = await rowFor('tt-tk1');
    expect(row.status).toBe('abierta');
    expect(row.workTypeKey).toBe('articulo');
    const [req] = await db.select().from(opsRequests).where(eq(opsRequests.id, req1));
    expect(req.workStatus).toBe('en_curso');
    const ask = lastWith('¿Cuánto crees que te llevará?');
    expect(buttonsOf(ask).map((b) => b.callback_data)).toEqual([`tt:e:15:${row.id}`, `tt:e:25:${row.id}`, `tt:e:40:${row.id}`, `tt:e:0:${row.id}`]);
    // Una sola pregunta aunque empezar también pase por «Empezar» del encargo.
    expect(toEmp().filter((s) => String(s.params.text).includes('¿Cuánto crees')).length).toBe(1);
  });

  it('un botón de otra persona no cuenta', async () => {
    const row = await rowFor('tt-tk1');
    await press(`tt:e:25:${row.id}`, OWNER_CHAT);
    expect(lastAnswer()).toBe('Este botón no es tuyo.');
    expect((await rowFor('tt-tk1')).estimateMinutes).toBeNull();
  });

  it('estima con un toque', async () => {
    const row = await rowFor('tt-tk1');
    await press(`tt:e:25:${row.id}`);
    expect((await rowFor('tt-tk1')).estimateMinutes).toBe(25);
    expect(lastAnswer()).toContain('25 min');
  });

  it('descanso de 5 minutos: no cuenta para la tarea', async () => {
    at(10);
    await press(`jw:br:5:${EMP}`);
    at(15);
    await press(`jw:bk:-:${EMP}`);
    const evs = await db.select().from(opsWorkEvents).where(eq(opsWorkEvents.tenantId, h.tenant));
    expect(evs.map((e) => e.kind)).toEqual(['entrada', 'descanso', 'vuelta']);
  });

  it('cambiar de tarea: la nueva sin tipo pregunta el tipo y luego la estimación', async () => {
    at(20);
    await press(`jw:cw:-:${EMP}`);
    const prompt = lastWith('¿A qué tarea cambias?');
    const data = buttonsOf(prompt).map((b) => b.callback_data);
    expect(data).toContain(`jw:sw:tt-tk2:${EMP}`);
    expect(data).not.toContain(`jw:sw:tt-tk1:${EMP}`); // la activa no se ofrece
    await press(`jw:sw:tt-tk2:${EMP}`);
    expect(lastWith('Ahora con')).toBeTruthy();
    const row2 = await rowFor('tt-tk2');
    expect(row2.workTypeKey).toBeNull();
    const typeAsk = lastWith('¿Qué tipo de tarea es?');
    expect(buttonsOf(typeAsk).map((b) => b.callback_data)).toContain(`tt:t:cambio_web:${row2.id}`);
    await press(`tt:t:cambio_web:${row2.id}`);
    expect((await rowFor('tt-tk2')).workTypeKey).toBe('cambio_web');
    const [req] = await db.select().from(opsRequests).where(eq(opsRequests.id, req2));
    expect(req.workTypeKey).toBe('cambio_web'); // el encargo hereda el tipo
    expect(req.workStatus).toBe('en_curso');
    const est = lastWith('¿Cuánto crees que te llevará?');
    expect(buttonsOf(est).map((b) => b.callback_data)).toContain(`tt:e:30:${row2.id}`);
    await press(`tt:e:0:${row2.id}`); // saltar
    expect((await rowFor('tt-tk2')).estimateMinutes).toBeNull();
  });

  it('volver a la primera tarea no abre otra fila', async () => {
    at(30);
    await press(`jw:sw:tt-tk1:${EMP}`);
    expect((await times()).filter((r) => r.clickupTaskId === 'tt-tk1')).toHaveLength(1);
  });

  it('Hecho: 35 min reales (sin el descanso), por encima del margen, feedback y «¿con qué sigues?»', async () => {
    at(50);
    await press(`dn:${req1}`);
    await press(`sk:d:${req1}`);
    const row = await rowFor('tt-tk1');
    expect(row.status).toBe('cerrada');
    expect(row.workedMinutes).toBe(35); // 0–10 + 15–20 + 30–50
    expect(row.verdict).toBe('pasado');
    expect(row.bandMin).toBe(20);
    expect(row.bandMax).toBe(30);
    expect(row.precisionHit).toBe(false); // estimó 25, tolerancia 5
    expect(row.justifyStatus).toBe('pendiente');
    const fb = lastWith('35 min de trabajo');
    expect(String(fb?.params.text)).toContain('Estimaste 25');
    expect(String(fb?.params.text)).toContain('¿Qué la complicó?');
    expect(buttonsOf(fb).map((b) => b.callback_data)).toContain(`tt:r:gr:${row.id}`);
    const next = lastWith('¿Con qué sigues?');
    expect(buttonsOf(next).map((b) => b.callback_data)).toContain(`jw:sw:tt-tk2:${EMP}`);
  });

  it('explica el exceso: motivo con un botón y URL escrita', async () => {
    const row = await rowFor('tt-tk1');
    await press(`tt:r:gr:${row.id}`);
    expect(lastWith('Pégame la <b>URL</b>')).toBeTruthy();
    await say('https://ejemplo.com/articulo-pilates se alargó la revisión');
    const done = await rowFor('tt-tk1');
    expect(done.justifyStatus).toBe('enviada');
    expect(done.overReason).toBe('gr');
    expect(done.evidenceUrl).toBe('https://ejemplo.com/articulo-pilates');
    expect(done.overNote).toBe('se alargó la revisión');
  });

  it('cerrada directamente en ClickUp: se cierra igual con lo trabajado (sin margen)', async () => {
    at(60);
    await onTaskFinished(h.tenant, { clickupTaskId: 'tt-tk2', title: 'Cambiar el banner' }, { source: 'clickup' });
    await flush();
    const row = await rowFor('tt-tk2');
    expect(row.status).toBe('cerrada');
    expect(row.source).toBe('clickup');
    expect(row.workedMinutes).toBe(10); // 20–30
    expect(row.verdict).toBe('sin_margen');
    expect(row.justifyStatus).toBe('no_necesaria');
  });

  it('la pestaña Tiempos y Mi panel lo reflejan', async () => {
    vi.useRealTimers();
    const o = await getTiemposOverview(h.tenant, 30);
    expect(o.settings.on).toBe(true);
    expect(o.people).toHaveLength(1);
    expect(o.people[0]).toMatchObject({ n: 2, totalMin: 45, pctInside: 0, precision: 0, estimated: 1, pendingJustify: 0 });
    expect(o.outliers.map((r) => r.task)).toEqual(['Artículo sobre pilates']);
    expect(o.outliers[0].reason).toBe('Era más grande de lo esperado');
    expect(o.types.find((t) => t.key === 'articulo')).toMatchObject({ n: 1, median: 35, minMinutes: 20, maxMinutes: 30 });
    expect(o.open).toHaveLength(0);
    const mine = await getMyTimes(h.tenant, EMP, 30);
    expect(mine.stats.n).toBe(2);
    expect(mine.byType.map((t) => t.key).sort()).toEqual(['articulo', 'cambio_web']);
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  it('con los tiempos apagados, cambiar de tarea sigue funcionando pero no se mide', async () => {
    await db.update(opsAutomations).set({ enabled: false }).where(and(eq(opsAutomations.tenantId, h.tenant), eq(opsAutomations.key, 'tiempos')));
    const { invalidateAutomations } = await import('@/lib/operaciones/automations');
    invalidateAutomations(h.tenant);
    at(70);
    await press(`jw:so:-:${EMP}`);
    await say('Reunión con el cliente');
    const evs = await db.select().from(opsWorkEvents).where(eq(opsWorkEvents.tenantId, h.tenant));
    expect(evs.at(-1)?.kind).toBe('tarea');
    expect((evs.at(-1)?.task as { name: string }).name).toBe('Reunión con el cliente');
    expect((await times()).filter((r) => r.status === 'abierta')).toHaveLength(0);
  });

  it('tras terminar la jornada, «Empezar» en un aviso no la reabre (sin falsos positivos)', async () => {
    at(80);
    await press(`jw:en:-:${EMP}`);
    const before = (await db.select().from(opsWorkEvents).where(eq(opsWorkEvents.tenantId, h.tenant))).length;
    const { onTaskStarted } = await import('@/lib/operaciones/tiempos');
    at(90);
    const r = await onTaskStarted(h.tenant, { clickupUserId: EMP, name: 'Leo Prueba' }, { clickupTaskId: 'tt-tk2', name: 'Cambiar el banner' });
    expect(r.ok).toBe(false);
    expect((await db.select().from(opsWorkEvents).where(eq(opsWorkEvents.tenantId, h.tenant))).length).toBe(before);
  });
});
