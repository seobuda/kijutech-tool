// Revisión de autonomía (12 nov 2026): calendario, plazos del dueño, informes, piloto automático y salud ampliada.
// Cálculo puro y una integración con la base de datos (cuenta de prueba propia, se borra al terminar).
// «Equipo hoy» (ClickUp) y Telegram se interceptan.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

const h = vi.hoisted(() => ({ tenant: '' as string }));

vi.mock('@/lib/operaciones/team-today', async (orig) => {
  const m = await orig<typeof import('@/lib/operaciones/team-today')>();
  return {
    ...m,
    getTeamToday: async () => ({
      members: [
        {
          member: { id: '900000022', username: 'Ana Prueba' },
          overdue: [],
          today: [{ id: 'au-tk1', name: 'Informe mensual', url: 'https://app.clickup.com/t/au-tk1', dueDate: null, status: 'open', listName: 'SEO', listId: null, assigneeIds: [] }]
        },
        { member: { id: '900000023', username: 'Beto Prueba' }, overdue: [], today: [] }
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
import { opsAutomations, opsRequestEvents, opsRequests, opsTeamProfiles, tenants, users } from '@/lib/db/schema';
import {
  agencyHolidays,
  daysOffFor,
  expandRange,
  getCalendar,
  offEntry,
  saveCalendar,
  validateEntry,
  type CalendarEntry
} from '@/lib/operaciones/calendar';
import { getScheduleMap, scheduleOrDefault, worksOn } from '@/lib/operaciones/team-profiles';
import { addWorkingDays } from '@/lib/operaciones/clients';
import { isWorkDay, shiftDate, todayIn } from '@/lib/operaciones/jornada';
import { isWorkMoment } from '@/lib/operaciones/reminders';
import { overdueItems, ownerAwake, type PendingEmail } from '@/lib/operaciones/owner-queue';
import { buildMorningBrief, buildWeeklyReport, firstWorkdayOfMonth, mondayOf, suggestCover, weekRange, weeklyText } from '@/lib/operaciones/reports';
import { nextWorkday, shouldDemote, shouldPromote } from '@/lib/operaciones/autopilot';
import { evaluate, type Snapshot } from '@/lib/operaciones/health';
import type { InboxItem } from '@/lib/operaciones/inbox';

const entry = (e: Partial<CalendarEntry>): CalendarEntry => ({
  id: 'x',
  kind: 'festivo',
  from: '2026-12-08',
  to: '2026-12-08',
  name: 'Inmaculada',
  users: null,
  createdBy: 'test',
  createdAt: '',
  ...e
});

describe('calendario (puro)', () => {
  it('expande rangos con los extremos incluidos y con tope', () => {
    expect(expandRange('2026-12-24', '2026-12-26')).toEqual(['2026-12-24', '2026-12-25', '2026-12-26']);
    expect(expandRange('2026-01-01', '2027-12-31').length).toBe(121);
  });

  it('un festivo sin personas aplica a todos; unas vacaciones solo a su persona', () => {
    const cal = [entry({}), entry({ id: 'v', kind: 'vacaciones', from: '2026-12-21', to: '2026-12-23', name: 'Navidad', users: ['A'] })];
    expect(daysOffFor(cal, 'A').has('2026-12-22')).toBe(true);
    expect(daysOffFor(cal, 'B').has('2026-12-22')).toBe(false);
    expect(daysOffFor(cal, 'B').has('2026-12-08')).toBe(true);
    expect(offEntry(cal, 'A', '2026-12-21')?.name).toBe('Navidad');
    expect([...agencyHolidays(cal)]).toEqual(['2026-12-08']);
  });

  it('valida las entradas', () => {
    expect(validateEntry({ kind: 'festivo', from: '2026-12-08', to: '2026-12-08', name: 'X', users: null })).toBeNull();
    expect(validateEntry({ kind: 'vacaciones', from: '2026-12-08', to: '2026-12-09', name: 'X', users: null })).toMatch(/persona/);
    expect(validateEntry({ kind: 'festivo', from: '2026-12-09', to: '2026-12-08', name: 'X', users: null })).toMatch(/anterior/);
    expect(validateEntry({ kind: 'festivo', from: '2026-02-30', to: '2026-03-01', name: 'X', users: null })).toMatch(/Fechas/);
    expect(validateEntry({ kind: 'festivo', from: '2026-12-08', to: '2026-12-08', name: ' ', users: null })).toMatch(/nombre/);
  });

  it('worksOn, isWorkDay y los minutos laborables respetan los días libres', () => {
    const sch = { ...scheduleOrDefault(new Map(), 'x'), timezone: 'UTC', workStart: '09:00', hoursPerDay: 8, daysOff: new Set(['2026-12-08']) };
    expect(worksOn(sch, '2026-12-08')).toBe(false); // martes festivo
    expect(worksOn(sch, '2026-12-09')).toBe(true);
    expect(worksOn(sch, '2026-12-12')).toBe(false); // sábado
    expect(isWorkDay(sch, '2026-12-08')).toBe(false);
    expect(isWorkMoment(sch, Date.parse('2026-12-08T10:00:00Z'))).toBe(false);
    expect(isWorkMoment(sch, Date.parse('2026-12-09T10:00:00Z'))).toBe(true);
  });

  it('los plazos en días laborables saltan los festivos', () => {
    const now = new Date('2026-12-07T10:00:00Z'); // lunes
    expect(addWorkingDays(2, null, 'UTC', now)).toBe('2026-12-09');
    expect(addWorkingDays(2, null, 'UTC', now, new Set(['2026-12-08']))).toBe('2026-12-10');
  });
});

describe('plazos del dueño (puro)', () => {
  const now = Date.parse('2026-11-13T12:00:00Z');
  const req = { id: 'r1', title: 'Revisar home', assigneeName: 'Ana' };
  const inbox = [
    { kind: 'review', since: new Date(now - 25 * 3600_000), req },
    { kind: 'review', since: new Date(now - 2 * 3600_000), req: { ...req, id: 'r2' } }
  ] as unknown as InboxItem[];
  const email = (h: number, top: boolean): PendingEmail => ({ actionId: `a${h}${top}`, emailId: null, subject: 'Hola', from: 'x', clientName: 'C', top, since: new Date(now - h * 3600_000) });
  const cfg = { enabled: true, reviewH: 24, blockerH: 2, emailH: 4, topEmailH: 1 };

  it('solo lo que ha pasado su plazo; los clientes Top antes', () => {
    const out = overdueItems(cfg, inbox, [email(2, false), email(2, true), email(5, false)], now);
    expect(out.map((o) => o.id)).toEqual(['r1', 'a2true', 'a5false']);
  });

  it('no molesta de noche ni en fin de semana', () => {
    expect(ownerAwake('Europe/Madrid', new Date('2026-11-13T10:00:00Z'))).toBe(true); // viernes 11:00
    expect(ownerAwake('Europe/Madrid', new Date('2026-11-13T21:00:00Z'))).toBe(false); // viernes 22:00
    expect(ownerAwake('Europe/Madrid', new Date('2026-11-14T10:00:00Z'))).toBe(false); // sábado
  });
});

describe('informes y piloto automático (puro)', () => {
  it('semanas de lunes a domingo en Madrid', () => {
    expect(mondayOf('2026-11-12')).toBe('2026-11-09');
    expect(mondayOf('2026-11-15')).toBe('2026-11-09');
    expect(mondayOf('2026-11-16')).toBe('2026-11-16');
    const w = weekRange('2026-11-09');
    expect(w.to).toBe('2026-11-16');
    expect(new Date(w.fromMs).toISOString()).toBe('2026-11-08T23:00:00.000Z');
  });

  it('sugiere a quien trabaja hoy con menos tareas, nunca a la persona ausente', () => {
    const load = [
      { id: 'A', name: 'Ana', working: false, tasks: 0 },
      { id: 'B', name: 'Beto', working: true, tasks: 4 },
      { id: 'C', name: 'Cris', working: true, tasks: 1 }
    ];
    expect(suggestCover(load, 'A')?.name).toBe('Cris');
    expect(suggestCover(load.slice(0, 1), 'A')).toBeNull();
  });

  it('primer día laborable del mes y siguiente día laborable con festivos', () => {
    expect(firstWorkdayOfMonth('2026-11-20', new Set())).toBe('2026-11-02'); // el 1 es domingo
    expect(firstWorkdayOfMonth('2026-12-15', new Set(['2026-12-01']))).toBe('2026-12-02');
    expect(nextWorkday('2026-12-04', new Set(['2026-12-07', '2026-12-08']))).toBe('2026-12-09'); // viernes → miércoles
  });

  it('la autonomía solo baja sola y solo se propone subir con datos', () => {
    expect(shouldDemote({ autonomy: 'autonomo', approved: 7, corrected: 3, rejected: 1 })).toBe(true);
    expect(shouldDemote({ autonomy: 'autonomo', approved: 5, corrected: 3, rejected: 0 })).toBe(false); // < 10 decisiones
    expect(shouldDemote({ autonomy: 'aprobacion', approved: 0, corrected: 20, rejected: 0 })).toBe(false);
    expect(shouldPromote({ autonomy: 'aprobacion', allowed: ['aprobacion', 'autonomo'], approved: 30, corrected: 1, rejected: 0 })).toBe(true);
    expect(shouldPromote({ autonomy: 'aprobacion', allowed: ['sombra', 'aprobacion'], approved: 50, corrected: 0, rejected: 0 })).toBe(false); // correos: nunca
  });
});

describe('salud ampliada (puro)', () => {
  const base: Snapshot = {
    heartbeatAgeS: 20, notificationsFailed: 0, notificationsStuck: 0, outboxFailed: 0, outboxStuck: 0, requestsError: 0, requestsStuck: 0,
    emailsError: 0, emailsStuck: 0, watchError: null, telegramError: null, aiFailedHour: 0, aiTotalHour: 0, clickupPeakPerMin: 1
  };
  const st = (s: Partial<Snapshot>, key: string) => evaluate({ ...base, ...s }).find((c) => c.key === key)?.status;

  it('gasto de IA frente al tope', () => {
    const b = { enabled: true, daily: 5, monthly: 60 };
    expect(st({ aiBudget: b, aiSpendDay: 1, aiSpendMonth: 10 }, 'ia_gasto')).toBe('ok');
    expect(st({ aiBudget: b, aiSpendDay: 4.2, aiSpendMonth: 10 }, 'ia_gasto')).toBe('aviso');
    expect(st({ aiBudget: b, aiSpendDay: 1, aiSpendMonth: 61 }, 'ia_gasto')).toBe('critico');
    expect(st({ aiBudget: { ...b, enabled: false }, aiSpendDay: 99, aiSpendMonth: 99 }, 'ia_gasto')).toBeUndefined();
  });

  it('disco y copia diaria (sin dato, sin comprobación)', () => {
    expect(st({ diskUsedPct: 50 }, 'disco')).toBe('ok');
    expect(st({ diskUsedPct: 85 }, 'disco')).toBe('aviso');
    expect(st({ diskUsedPct: 95 }, 'disco')).toBe('critico');
    expect(st({ backupAgeH: 10 }, 'copia')).toBe('ok');
    expect(st({ backupAgeH: 30 }, 'copia')).toBe('aviso');
    expect(st({ backupAgeH: 60 }, 'copia')).toBe('critico');
    expect(st({ backupAgeH: null }, 'copia')).toBeUndefined();
  });
});

// --- Integración con la base de datos ----------------------------------------------------------

const SLUG = 'seg-test-autonomia';
const ANA = '900000022';
const BETO = '900000023';
const TZ = 'Europe/Madrid';

async function cleanup() {
  const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, SLUG));
  if (!t) return;
  await db.delete(opsRequests).where(eq(opsRequests.tenantId, t.id));
  await db.delete(users).where(eq(users.tenantId, t.id));
  await db.delete(tenants).where(eq(tenants.id, t.id));
}

describe('calendario e informes con la base de datos', () => {
  beforeAll(async () => {
    await cleanup();
    const [t] = await db.insert(tenants).values({ name: 'Prueba autonomía', slug: SLUG }).returning();
    h.tenant = t.id;
    await db.insert(opsTeamProfiles).values([
      { tenantId: t.id, clickupUserId: ANA, name: 'Ana Prueba', timezone: TZ, workDays: '1,2,3,4,5,6,7', workStart: '00:00', hoursPerDay: '8' },
      { tenantId: t.id, clickupUserId: BETO, name: 'Beto Prueba', timezone: TZ, workDays: '1,2,3,4,5,6,7', workStart: '00:00', hoursPerDay: '8' }
    ]);
    await db.insert(opsAutomations).values({ tenantId: t.id, key: 'autopilot', enabled: true, config: { absenceReassign: true } });
  });
  afterAll(cleanup);

  it('unas vacaciones guardadas hacen libre el día en el horario de la persona (y solo de ella)', async () => {
    const today = todayIn(TZ);
    await saveCalendar(h.tenant, [entry({ id: '11111111-1111-1111-1111-111111111111', kind: 'vacaciones', from: today, to: shiftDate(today, 3), name: 'Vacaciones', users: [ANA] })]);
    expect((await getCalendar(h.tenant)).length).toBe(1);
    const map = await getScheduleMap(h.tenant);
    expect(isWorkDay(scheduleOrDefault(map, ANA), today)).toBe(false);
    expect(isWorkDay(scheduleOrDefault(map, BETO), today)).toBe(true);
  });

  it('el parte de la mañana avisa de lo que se cae y propone quién puede llevarlo', async () => {
    const b = await buildMorningBrief(h.tenant);
    expect(b.notable).toBe(true);
    expect(b.text).toContain('Ana Prueba');
    expect(b.text).toContain('Vacaciones');
    expect(b.text).toContain('Se cae hoy');
    expect(b.text).toContain('Beto Prueba');
    expect(b.buttons.flat().map((x) => x.data)).toContain('ap:due:au-tk1');
  });

  it('el informe semanal cuenta entregas y si fueron a tiempo (consultas reales)', async () => {
    const monday = mondayOf(todayIn(TZ));
    const [u] = await db.insert(users).values({ tenantId: h.tenant, email: `autonomia-${Date.now()}@test.local`, passwordHash: 'x' }).returning({ id: users.id });
    const base = { tenantId: h.tenant, createdBy: u.id, clickupListId: 'L1', originalRequest: 'x', preparedDescription: 'x', status: 'creado', assigneeClickupId: BETO, assigneeName: 'Beto Prueba' };
    const [r1] = await db.insert(opsRequests).values({ ...base, title: 'A tiempo', dueDate: shiftDate(monday, 6) }).returning();
    const [r2] = await db.insert(opsRequests).values({ ...base, title: 'Tarde', dueDate: shiftDate(monday, -3) }).returning();
    const at = new Date(weekRange(monday).fromMs + 12 * 3600_000); // lunes a mediodía
    await db.insert(opsRequestEvents).values([
      { tenantId: h.tenant, requestId: r1.id, personClickupUserId: BETO, personName: 'Beto Prueba', eventType: 'done', createdAt: at },
      { tenantId: h.tenant, requestId: r2.id, personClickupUserId: BETO, personName: 'Beto Prueba', eventType: 'done_review', createdAt: at }
    ]);
    const r = await buildWeeklyReport(h.tenant, monday);
    const beto = r.people.find((p) => p.u === BETO)!;
    expect(beto.delivered).toBe(2);
    expect(beto.withDue).toBe(2);
    expect(beto.onTime).toBe(1);
    expect(r.team.onTimePct).toBe(50);
    expect(r.prevTeam?.delivered).toBe(0);
    const text = weeklyText(r, null);
    expect(text).toContain('Informe semanal');
    expect(text).toContain('a tiempo 50 %');
  });
});
