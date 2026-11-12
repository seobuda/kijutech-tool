// Jornada real (paso 5A): cálculo del estado del día, transiciones permitidas, horas locales,
// minutos realmente trabajados (recordatorios) y el formato de los botones del bot.
import { describe, expect, it } from 'vitest';
import { computeDay, lunchPlannedMin, transitionError, type DayEvent } from '@/lib/operaciones/jornada-core';
import { localTimeMs, pickOpenDate, shiftDate } from '@/lib/operaciones/jornada';
import { isWorkMoment, workingMinutesBetween } from '@/lib/operaciones/reminders';
import { JORNADA_CALLBACK_RE, JORNADA_COMMAND_RE, buildStartPrompt, panelButtons } from '@/lib/operaciones/jornada-bot';
import type { Schedule } from '@/lib/operaciones/team-profiles';

const T0 = Date.parse('2026-11-12T13:00:00Z'); // 09:00 en Santo Domingo
const min = (m: number) => T0 + m * 60_000;
let n = 0;
const ev = (kind: DayEvent['kind'], at: number, extra: Partial<DayEvent> = {}): DayEvent => ({
  id: `e${n++}`,
  kind,
  at,
  plannedMinutes: null,
  reason: null,
  source: 'telegram',
  task: null,
  ...extra
});

const sch: Schedule = {
  timezone: 'America/Santo_Domingo',
  workStart: '09:00',
  workDays: [1, 2, 3, 4, 5],
  hoursPerDay: 8,
  active: true,
  lunchStart: '13:00',
  lunchEnd: '14:00',
  quietStart: null,
  quietEnd: null,
  urgentBypassQuiet: false
};

describe('estado del día', () => {
  it('sin registros: sin empezar y 0 minutos', () => {
    const st = computeDay([], min(60));
    expect(st.status).toBe('sin_empezar');
    expect(st.workedMin).toBe(0);
  });

  it('entrada, descanso, comida y salida: minutos trabajados sin pausas', () => {
    const st = computeDay(
      [
        ev('entrada', min(0), { task: { name: 'Artículo X' } }),
        ev('descanso', min(60), { plannedMinutes: 10 }),
        ev('vuelta', min(75)),
        ev('comida', min(240), { plannedMinutes: 60 }),
        ev('vuelta', min(320)),
        ev('salida', min(480))
      ],
      min(600)
    );
    expect(st.status).toBe('terminado');
    expect(st.firstTask?.name).toBe('Artículo X');
    expect(st.breakMin).toBe(15);
    expect(st.breakCount).toBe(1);
    expect(st.lunchMin).toBe(80);
    expect(st.workedMin).toBe(480 - 15 - 80);
    expect(st.salidaSource).toBe('telegram');
  });

  it('una pausa en curso cuenta hasta ahora y deja de sumar trabajo', () => {
    const st = computeDay([ev('entrada', min(0)), ev('salida_urgente', min(100), { reason: 'médico' })], min(130));
    expect(st.status).toBe('fuera');
    expect(st.current?.reason).toBe('médico');
    expect(st.exitMin).toBe(30);
    expect(st.workedMin).toBe(100);
  });

  it('el orden de llegada no importa (se ordena por hora)', () => {
    const st = computeDay([ev('vuelta', min(20)), ev('entrada', min(0)), ev('descanso', min(10), { plannedMinutes: 5 })], min(30));
    expect(st.status).toBe('trabajando');
    expect(st.breakMin).toBe(10);
    expect(st.workedMin).toBe(20);
  });

  it('salir en mitad de una pausa la cierra', () => {
    const st = computeDay([ev('entrada', min(0)), ev('descanso', min(50)), ev('salida', min(60), { source: 'auto' })], min(200));
    expect(st.status).toBe('terminado');
    expect(st.breakMin).toBe(10);
    expect(st.workedMin).toBe(50);
    expect(st.salidaSource).toBe('auto');
  });

  it('volver a empezar tras terminar abre otro tramo', () => {
    const st = computeDay([ev('entrada', min(0)), ev('salida', min(60)), ev('entrada', min(120))], min(150));
    expect(st.status).toBe('trabajando');
    expect(st.entradaAt).toBe(min(0));
    expect(st.workedMin).toBe(90);
  });

  it('ausencia con motivo', () => {
    const st = computeDay([ev('ausencia', min(0), { reason: 'vacaciones' })], min(10));
    expect(st.status).toBe('ausente');
    expect(st.absenceReason).toBe('vacaciones');
  });

  it('registros sin sentido se ignoran (vuelta sin pausa, comida sin entrada)', () => {
    const st = computeDay([ev('vuelta', min(0)), ev('comida', min(5))], min(10));
    expect(st.status).toBe('sin_empezar');
  });
});

describe('transiciones', () => {
  it('no se puede ir a comer sin empezar, ni volver sin pausa, ni empezar dos veces', () => {
    expect(transitionError('sin_empezar', 'comida')).toMatch(/no has empezado/);
    expect(transitionError('trabajando', 'vuelta')).toMatch(/ninguna pausa/);
    expect(transitionError('trabajando', 'entrada')).toMatch(/Ya estás/);
    expect(transitionError('descanso', 'descanso')).toMatch(/He vuelto/);
    expect(transitionError('trabajando', 'ausencia')).toMatch(/Ya has empezado/);
  });
  it('lo normal sí se permite', () => {
    expect(transitionError('sin_empezar', 'entrada')).toBeNull();
    expect(transitionError('trabajando', 'descanso')).toBeNull();
    expect(transitionError('fuera', 'salida')).toBeNull();
    expect(transitionError('comida', 'vuelta')).toBeNull();
    expect(transitionError('terminado', 'entrada')).toBeNull();
  });
});

describe('fechas y horas locales', () => {
  it('localTimeMs convierte una hora local de la ficha a UTC', () => {
    expect(new Date(localTimeMs('America/Santo_Domingo', '2026-11-12', '09:00')).toISOString()).toBe('2026-11-12T13:00:00.000Z');
    expect(new Date(localTimeMs('Europe/Madrid', '2026-11-12', '09:00')).toISOString()).toBe('2026-11-12T08:00:00.000Z');
    expect(new Date(localTimeMs('Europe/Madrid', '2026-07-01', '09:00')).toISOString()).toBe('2026-07-01T07:00:00.000Z');
  });
  it('shiftDate cruza meses', () => {
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('si sigue trabajando pasada la medianoche, el día abierto es el de ayer', () => {
    const y = [ev('entrada', min(0))];
    expect(pickOpenDate('2026-11-13', [], y, min(900))).toBe('2026-11-12');
    expect(pickOpenDate('2026-11-13', [], [ev('entrada', min(0)), ev('salida', min(60))], min(900))).toBe('2026-11-13');
  });
  it('duración de la comida según la ficha', () => {
    expect(lunchPlannedMin('13:00', '14:30')).toBe(90);
    expect(lunchPlannedMin(null, null)).toBe(60);
  });
});

describe('minutos laborables', () => {
  it('la comida de la ficha ya no cuenta como jornada', () => {
    expect(isWorkMoment(sch, Date.parse('2026-11-12T17:30:00Z'))).toBe(false); // 13:30 local
    expect(isWorkMoment(sch, Date.parse('2026-11-12T16:30:00Z'))).toBe(true); // 12:30 local
    // De 09:00 a 15:00 locales: 6 h menos 1 h de comida.
    expect(workingMinutesBetween(sch, min(0), min(360))).toBe(300);
  });
  it('con la jornada real, los días fichados cuentan solo lo trabajado', () => {
    const actual = { days: new Set(['2026-11-12']), intervals: [[min(60), min(120)]] as [number, number][] };
    expect(workingMinutesBetween(sch, min(0), min(360), Infinity, actual)).toBe(60);
  });
});

describe('bot de la jornada', () => {
  it('los botones caben en el límite de Telegram y los reconoce el manejador', () => {
    const st = computeDay([ev('entrada', min(0))], min(10));
    const rows = panelButtons(st, '123456789');
    expect(rows.flat().length).toBeGreaterThan(3);
    for (const b of rows.flat()) {
      expect(b.data.length).toBeLessThanOrEqual(64);
      expect(b.data).toMatch(JORNADA_CALLBACK_RE);
    }
    expect('jw:st:86c1abcde:123456789').toMatch(JORNADA_CALLBACK_RE);
    expect('jw:fx:2026-11-12:123456789').toMatch(JORNADA_CALLBACK_RE);
    expect('jw:st:86c1abcde').not.toMatch(JORNADA_CALLBACK_RE);
  });
  it('comandos', () => {
    expect('/descanso 10').toMatch(JORNADA_COMMAND_RE);
    expect('/salir tengo médico').toMatch(JORNADA_COMMAND_RE);
    expect('/termino').toMatch(JORNADA_COMMAND_RE);
    expect('/sugerencia algo').not.toMatch(JORNADA_COMMAND_RE);
  });
  it('en pausa solo se ofrece «He vuelto»', () => {
    const st = computeDay([ev('entrada', min(0)), ev('comida', min(10))], min(20));
    expect(panelButtons(st, '1').flat().map((b) => b.text)).toEqual(['↩️ He vuelto']);
  });
  it('exporta el generador de los buenos días', () => {
    expect(typeof buildStartPrompt).toBe('function');
  });
});

// --- Integración con la base de datos: una persona de prueba registra su día desde el bot ----------
import { afterAll, beforeAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsRequestEvents, opsTeamProfiles, opsWorkEvents } from '@/lib/db/schema';
import { addCorrection, getPersonDay, recordWorkEvent, todayIn, voidWorkEvent } from '@/lib/operaciones/jornada';
import { cleanupFixtures, createFixtures, type Fixtures } from './fixtures';

const TEST_USER = '999000111';
let fx: Fixtures;

async function cleanupJornada() {
  await db.delete(opsWorkEvents).where(eq(opsWorkEvents.clickupUserId, TEST_USER));
  await db.delete(opsRequestEvents).where(eq(opsRequestEvents.personClickupUserId, TEST_USER));
  await db.delete(opsTeamProfiles).where(eq(opsTeamProfiles.clickupUserId, TEST_USER));
}

describe('registro real en la base de datos', () => {
  beforeAll(async () => {
    fx = await createFixtures();
    await cleanupJornada();
    await db.insert(opsTeamProfiles).values({ tenantId: fx.kijutechTenantId, clickupUserId: TEST_USER, name: 'seg-test-jornada', timezone: 'UTC' });
  });
  afterAll(async () => {
    await cleanupJornada();
    await cleanupFixtures();
  });

  const person = { clickupUserId: TEST_USER, name: 'seg-test-jornada' };

  it('sin ficha no se registra nada', async () => {
    const r = await recordWorkEvent(fx.kijutechTenantId, { clickupUserId: '999000222', name: 'x' }, 'entrada', { source: 'telegram' });
    expect(r.ok).toBe(false);
  });

  it('no puede ir a comer sin empezar; empieza con una tarea, descansa y vuelve', async () => {
    const t = fx.kijutechTenantId;
    const bad = await recordWorkEvent(t, person, 'comida', { source: 'telegram', plannedMinutes: 60 });
    expect(bad.ok).toBe(false);
    const start = await recordWorkEvent(t, person, 'entrada', { source: 'telegram', task: { name: 'Artículo de prueba', clickupTaskId: 'abc' } });
    expect(start.ok && start.day.state.status).toBe('trabajando');
    expect(start.ok && start.day.date).toBe(todayIn('UTC'));
    const brk = await recordWorkEvent(t, person, 'descanso', { source: 'telegram', plannedMinutes: 10 });
    expect(brk.ok && brk.day.state.status).toBe('descanso');
    const again = await recordWorkEvent(t, person, 'descanso', { source: 'telegram', plannedMinutes: 10 });
    expect(again.ok).toBe(false);
    const back = await recordWorkEvent(t, person, 'vuelta', { source: 'telegram' });
    expect(back.ok && back.day.state.status).toBe('trabajando');
    const ev = await db.select().from(opsRequestEvents).where(and(eq(opsRequestEvents.personClickupUserId, TEST_USER), eq(opsRequestEvents.eventType, 'jornada')));
    expect(ev.length).toBe(3); // cada acción queda también en el registro de eventos
  });

  it('salida urgente con motivo, salida y corrección sin borrar nada', async () => {
    const t = fx.kijutechTenantId;
    const out = await recordWorkEvent(t, person, 'salida_urgente', { source: 'telegram', reason: 'médico' });
    expect(out.ok && out.day.state.current?.reason).toBe('médico');
    const end = await recordWorkEvent(t, person, 'salida', { source: 'auto' });
    expect(end.ok && end.day.state.salidaSource).toBe('auto');
    const voided = await voidWorkEvent(t, end.ok ? end.eventId : '', 'Prueba', 'hora incorrecta');
    expect(voided?.voidedByName).toBe('Prueba');
    expect((await voidWorkEvent(t, end.ok ? end.eventId : '', 'Prueba', 'otra vez'))).toBeNull();
    const day = await getPersonDay(t, TEST_USER);
    expect(day?.state.status).toBe('fuera'); // la salida anulada ya no cuenta
    await addCorrection(t, { clickupUserId: TEST_USER, date: day!.date, kind: 'salida', at: new Date(), reason: 'corrección', plannedMinutes: null }, { id: fx.users.admin.id, name: 'Prueba' });
    const fixed = await getPersonDay(t, TEST_USER);
    expect(fixed?.state.status).toBe('terminado');
    const rows = await db.select().from(opsWorkEvents).where(eq(opsWorkEvents.clickupUserId, TEST_USER));
    expect(rows.some((r) => r.voidedAt)).toBe(true);
    expect(rows.some((r) => r.source === 'correccion')).toBe(true);
  });
});
