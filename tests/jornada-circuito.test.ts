// Jornada real (5A): el circuito completo de punta a punta, como lo viviría una persona del equipo y como lo
// ve el sistema. Telegram, ClickUp («Equipo hoy») y el correo se interceptan; el reloj se simula para
// recorrer en segundos un día de prueba de 20 minutos y el día siguiente. Todo lo demás es código real
// contra la base de datos: el manejador del bot, el planificador, la cola de avisos y las consultas.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

const h = vi.hoisted(() => ({
  tenant: '' as string,
  cfg: null as unknown,
  owner: null as unknown,
  sent: [] as { method: string; params: Record<string, unknown> }[],
  emails: [] as { to: string; subject: string }[],
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
          member: { id: '900000002', username: 'Ana Prueba' },
          overdue: [],
          today: [{ id: 'tk1', name: 'Artículo de prueba', url: 'https://app.clickup.com/t/tk1', dueDate: null, status: 'open', listName: 'Blog', listId: null, assigneeIds: [] }]
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
vi.mock('@/lib/operaciones/resend', async (orig) => {
  const m = await orig<typeof import('@/lib/operaciones/resend')>();
  return {
    ...m,
    getEmailConfig: async () => ({ apiKey: 'k', webhookSecret: null, webhookId: null, address: 'agente@test.local', fromName: 'Equipo', bcc: 'dueno@test.local' }),
    sendInternalEmail: async (_c: unknown, input: { to: string; subject: string }) => {
      h.emails.push(input);
      return { id: 'e' };
    }
  };
});

import { db } from '@/lib/db/drizzle';
import { opsAutomations, opsClickupMembers, opsNotifications, opsTeamProfiles, opsTelegramMembers, opsWorkEvents, tenants } from '@/lib/db/schema';
import { enqueueNotification, processNotifications } from '@/lib/operaciones/notifications';
import { handleUpdate } from '@/lib/operaciones/telegram-handler';
import { runJornada } from '@/lib/operaciones/jornada-worker';
import { buildJornadaDigestSection, getPersonDay, localTimeMs, shiftDate, todayIn, workedIntervals } from '@/lib/operaciones/jornada';
import { getJornadaOverview } from '@/lib/operaciones/jornada-overview';
import type { TgUpdate } from '@/lib/operaciones/telegram';

const SLUG = 'seg-test-jornada-circuito';
const OWNER = '900000001';
const EMP = '900000002';
const OWNER_CHAT = 91001;
const EMP_CHAT = 91002;
const TZ = 'Europe/Madrid';

// Día de prueba: anteayer a las 10:00 de Madrid (en el pasado, para que la base de datos vea los avisos como vencidos).
const DAY1 = shiftDate(todayIn(TZ), -2);
const DAY2 = shiftDate(DAY1, 1);
const T0 = localTimeMs(TZ, DAY1, '10:00');
const T2 = localTimeMs(TZ, DAY2, '10:00');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let upd = 1;

async function flush() {
  for (let i = 0; i < 6; i++) {
    await sleep(40);
    await processNotifications(h.tenant);
  }
}
async function at(base: number, minutes: number) {
  vi.setSystemTime(base + minutes * 60_000);
}
async function tick() {
  await runJornada(h.tenant);
  await flush();
}
const toEmp = () => h.sent.filter((s) => s.method === 'sendMessage' && s.params.chat_id === EMP_CHAT);
const textsSince = (n: number) => toEmp().slice(n).map((s) => String(s.params.text));
const lastText = () => String(toEmp().at(-1)?.params.text ?? '');
const buttonsOf = (s: { params: Record<string, unknown> }) =>
  ((s.params.reply_markup as { inline_keyboard?: { text: string; callback_data: string }[][] } | undefined)?.inline_keyboard ?? []).flat();

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
const events = () => db.select().from(opsWorkEvents).where(eq(opsWorkEvents.tenantId, h.tenant)).orderBy(opsWorkEvents.at);

async function cleanup() {
  await db.delete(tenants).where(eq(tenants.slug, SLUG)); // todo lo demás cae en cascada
}

describe('circuito completo de la jornada (empleado y sistema)', () => {
  beforeAll(async () => {
    await cleanup();
    const [t] = await db.insert(tenants).values({ name: 'Prueba jornada', slug: SLUG }).returning();
    h.tenant = t.id;
    h.cfg = { id: 'fake', tenantId: t.id, testMode: false };
    const [owner] = await db.insert(opsTelegramMembers).values({ tenantId: t.id, clickupUserId: OWNER, username: 'Dueño', telegramChatId: OWNER_CHAT }).returning();
    h.owner = owner;
    await db.insert(opsTelegramMembers).values({ tenantId: t.id, clickupUserId: EMP, username: 'Ana Prueba', telegramChatId: EMP_CHAT });
    await db.insert(opsClickupMembers).values({ tenantId: t.id, clickupUserId: EMP, username: 'Ana Prueba', email: 'ana@test.local' });
    await db.insert(opsTeamProfiles).values({
      tenantId: t.id,
      clickupUserId: EMP,
      name: 'Ana Prueba',
      timezone: TZ,
      workDays: '1,2,3,4,5,6,7',
      workStart: '10:00',
      hoursPerDay: '0.25',
      lunchStart: '10:08',
      lunchEnd: '10:10'
    });
    // Los mismos valores del plan de pruebas.
    await db.insert(opsAutomations).values({
      tenantId: t.id,
      key: 'jornada',
      enabled: true,
      config: { repingMin: 5, maxPings: 1, emailPing: true, breakQuotaMin: 1, lunchMarginMin: 0, autoCloseMin: 5, holdNotices: true }
    });
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterAll(async () => {
    vi.useRealTimers();
    await cleanup();
  });

  it('T+0: llegan los buenos días con sus tareas y los botones para empezar', async () => {
    await at(T0, 0.5);
    await tick();
    const msgs = toEmp();
    expect(msgs.length).toBe(1);
    expect(String(msgs[0].params.text)).toContain('Buenos días, Ana Prueba');
    expect(String(msgs[0].params.text)).toContain('Artículo de prueba');
    const data = buttonsOf(msgs[0]).map((b) => b.callback_data);
    expect(data).toContain(`jw:st:tk1:${EMP}`);
    expect(data).toContain(`jw:ab:-:${EMP}`);
    // Al dueño no le llega nada (no ficha) y no se ha registrado ninguna entrada sola.
    expect(h.sent.some((s) => s.method === 'sendMessage' && s.params.chat_id === OWNER_CHAT)).toBe(false);
    expect((await events()).length).toBe(0);
  });

  it('T+5: sin respuesta, un reintento por Telegram y por correo; después, ninguno más (máximo 1)', async () => {
    await at(T0, 3);
    await tick();
    expect(toEmp().length).toBe(1);
    await at(T0, 5.6);
    await tick();
    expect(lastText()).toContain('¿Empezamos, Ana Prueba?');
    expect(h.emails).toHaveLength(1);
    expect(h.emails[0].to).toBe('ana@test.local');
    await at(T0, 11);
    await tick();
    expect(toEmp().length).toBe(2);
  });

  it('un botón de otra persona no cuenta', async () => {
    await at(T0, 6.8);
    await press(`jw:st:tk1:${EMP}`, OWNER_CHAT);
    const ans = h.sent.filter((s) => s.method === 'answerCallbackQuery').at(-1);
    expect(ans?.params.text).toBe('Este botón no es tuyo.');
    expect((await events()).length).toBe(0);
  });

  it('T+7: pulsa la tarea y queda registrada la entrada con esa tarea', async () => {
    await at(T0, 7);
    await press(`jw:st:tk1:${EMP}`);
    expect(lastText()).toContain('Entrada registrada a las 10:07');
    expect(lastText()).toContain('Artículo de prueba');
    const ev = await events();
    expect(ev.map((e) => e.kind)).toEqual(['entrada']);
    expect((ev[0].task as { name: string }).name).toBe('Artículo de prueba');
    expect((await getPersonDay(h.tenant, EMP))?.state.status).toBe('trabajando');
  });

  it('T+7: /descanso 2 avisa de que pasa el cupo; mientras descansa, un aviso normal espera', async () => {
    await at(T0, 7.2);
    await say('/descanso 2');
    expect(lastText()).toContain('Descanso de 2 min');
    expect(lastText()).toContain('pasas tu cupo de 1 min');
    await enqueueNotification({ tenantId: h.tenant, kind: 'reply', dedupeKey: 'prueba-aviso-retenido', forClickupUserId: EMP, forName: 'Ana Prueba', payload: { text: 'Aviso de prueba retenido' } });
    await flush();
    expect(toEmp().some((s) => String(s.params.text).includes('Aviso de prueba retenido'))).toBe(false);
    const [n] = await db.select().from(opsNotifications).where(and(eq(opsNotifications.tenantId, h.tenant), eq(opsNotifications.dedupeKey, 'prueba-aviso-retenido')));
    expect((n.payload as { heldByJornada?: boolean }).heldByJornada).toBe(true);
  });

  it('T+9: «¿Has vuelto?» llega aunque sea su hueco de comida; «He vuelto» cierra la pausa', async () => {
    await at(T0, 9.4);
    await tick();
    expect(lastText()).toContain('Se acabó tu descanso de 2 min');
    await press(`jw:bk:-:${EMP}`);
    expect(lastText()).toContain('De vuelta');
  });

  it('T+9: «Tengo que salir» exige el motivo y lo guarda', async () => {
    await at(T0, 9.6);
    await press(`jw:ex:-:${EMP}`);
    expect(lastText()).toContain('¿Por qué tienes que salir?');
    await say('no');
    expect(lastText()).toContain('más de detalle');
    await say('Cita médica');
    expect(lastText()).toContain('Anotado');
    await at(T0, 9.9);
    await press(`jw:bk:-:${EMP}`);
    const out = (await events()).find((e) => e.kind === 'salida_urgente');
    expect(out?.reason).toBe('Cita médica');
  });

  it('T+10: el aviso retenido sale ya fuera de su hueco de comida, con la persona trabajando', async () => {
    await at(T0, 10.2);
    await flush();
    expect(toEmp().some((s) => String(s.params.text).includes('Aviso de prueba retenido'))).toBe(true);
  });

  it('T+10: comida sin marcar → el bot pregunta; «Voy ahora» y, si se alarga, «¿Has vuelto?»', async () => {
    await at(T0, 10.4);
    await tick();
    expect(lastText()).toContain('No has marcado la comida');
    await press(`jw:lu:-:${EMP}`);
    expect(lastText()).toContain('Tienes 2 min');
    await at(T0, 12.6);
    await tick();
    expect(lastText()).toContain('comiendo');
    await press(`jw:bk:-:${EMP}`);
    await say('/jornada');
    expect(lastText()).toContain('Trabajando');
    expect(lastText()).toContain('Entrada: 10:07');
  });

  it('T+15: «¿Terminas?»; sin respuesta, cierre automático a la hora de fin; no deja terminar dos veces', async () => {
    const before = toEmp().length;
    await at(T0, 15.5);
    await tick();
    expect(textsSince(before).join('\n')).toContain('Tu horario termina a las 10:15');
    await at(T0, 20.5);
    await tick();
    const end = (await events()).find((e) => e.kind === 'salida');
    expect(end?.source).toBe('auto');
    expect(end?.at.getTime()).toBe(T0 + 15 * 60_000);
    await say('/termino');
    expect(lastText()).toContain('ya terminó');
  });

  it('la pestaña Jornada y los minutos reales reflejan el día', async () => {
    const o = await getJornadaOverview(h.tenant, DAY1, new Date());
    const p = o.people.find((x) => x.clickupUserId === EMP)!;
    expect(p.entrada).toBe('10:07');
    expect(p.firstTask).toBe('Artículo de prueba');
    expect(p.breakCount).toBe(1);
    expect(p.breakOver).toBeGreaterThan(0);
    expect(p.exits[0].reason).toBe('Cita médica');
    expect(p.lunchMin).toBe(2);
    expect(p.salidaAuto).toBe(true);
    expect(p.workedMin).toBeGreaterThan(0);
    const iv = (await workedIntervals(h.tenant, [EMP], DAY1, DAY1)).get(EMP)!;
    const worked = Math.round(iv.intervals.reduce((s, [a, b]) => s + (b - a), 0) / 60000);
    expect(worked).toBe(p.workedMin);
  });

  it('día siguiente: buenos días + pregunta por el cierre automático; corrige la hora y la salida queda corregida', async () => {
    await at(T2, 0.5);
    const before = toEmp().length;
    await tick();
    const fresh = toEmp().slice(before);
    expect(fresh.map((s) => String(s.params.text)).join('\n')).toContain('Buenos días');
    const fix = fresh.find((s) => String(s.params.text).includes('no marcaste «Termino»'));
    expect(fix).toBeTruthy();
    expect(buttonsOf(fix!).map((b) => b.callback_data)).toContain(`jw:fx:${DAY1}:${EMP}`);
    await press(`jw:fx:${DAY1}:${EMP}`);
    expect(lastText()).toContain('¿A qué hora saliste?');
    await say('10:14');
    expect(lastText()).toContain('saliste a las 10:14');
    const ev = await events();
    expect(ev.find((e) => e.kind === 'salida' && e.source === 'auto')?.voidedAt).toBeTruthy();
    expect(ev.find((e) => e.kind === 'salida' && e.source === 'correccion')?.at.getTime()).toBe(T0 + 14 * 60_000);
  });

  it('el resumen del dueño cuenta el día anterior ya corregido', async () => {
    const s = await buildJornadaDigestSection(h.tenant, new Date());
    expect(s).toContain('Ana Prueba');
    expect(s).toContain('entró 10:07');
    expect(s).toContain('«Cita médica»');
    expect(s).toContain('sobre el cupo');
    expect(s).toContain('salió 10:14');
    expect(s).not.toContain('sin marcar');
  });

  it('día siguiente: «Hoy no trabajo» con motivo y ya no hay reintentos', async () => {
    await at(T2, 1);
    await press(`jw:ab:-:${EMP}`);
    expect(lastText()).toContain('¿Por qué no trabajas hoy?');
    await say('Vacaciones');
    expect(lastText()).toContain('hoy no trabajas');
    const before = toEmp().length;
    await at(T2, 7);
    await tick();
    expect(toEmp().length).toBe(before);
    expect((await getPersonDay(h.tenant, EMP))?.state.status).toBe('ausente');
  });

  it('/ayuda explica los comandos de la jornada', async () => {
    await say('/ayuda');
    expect(lastText()).toContain('/descanso 10');
    expect(lastText()).toContain('/termino');
  });
});
