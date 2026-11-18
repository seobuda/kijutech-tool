// Salud del sistema (paso 4): reglas de las comprobaciones y ruta pública /api/health.
import { describe, expect, it } from 'vitest';
import { evaluate, type Snapshot } from '@/lib/operaciones/health';
import { GET as getHealthRoute } from '@/app/api/health/route';

const healthy: Snapshot = {
  heartbeatAgeS: 20,
  notificationsFailed: 0,
  notificationsStuck: 0,
  outboxFailed: 0,
  outboxStuck: 0,
  requestsError: 0,
  requestsStuck: 0,
  emailsError: 0,
  emailsStuck: 0,
  watchError: null,
  telegramError: null,
  aiFailedHour: 0,
  aiTotalHour: 4,
  clickupPeakPerMin: 12
};

const statusOf = (s: Partial<Snapshot>, key: string) => evaluate({ ...healthy, ...s }).find((c) => c.key === key)!.status;

describe('comprobaciones de salud', () => {
  it('con todo bien, todas en verde', () => {
    expect(evaluate(healthy).every((c) => c.status === 'ok')).toBe(true);
  });

  it('planificador sin latido > 3 min es crítico', () => {
    expect(statusOf({ heartbeatAgeS: 400 }, 'planificador')).toBe('critico');
  });

  it('avisos agotados son críticos; en cola mucho rato, aviso', () => {
    expect(statusOf({ notificationsFailed: 1 }, 'avisos')).toBe('critico');
    expect(statusOf({ notificationsStuck: 2 }, 'avisos')).toBe('aviso');
  });

  it('encargos con error de ClickUp son críticos, y atascados aviso', () => {
    expect(statusOf({ requestsError: 1 }, 'encargos')).toBe('critico');
    expect(statusOf({ requestsStuck: 1 }, 'encargos')).toBe('aviso');
  });

  it('IA: 3 fallos/hora es aviso y 10 crítico; el límite de ClickUp avisa al 80 %', () => {
    expect(statusOf({ aiFailedHour: 3 }, 'ia')).toBe('aviso');
    expect(statusOf({ aiFailedHour: 10 }, 'ia')).toBe('critico');
    expect(statusOf({ clickupPeakPerMin: 79 }, 'clickup_limite')).toBe('ok');
    expect(statusOf({ clickupPeakPerMin: 85 }, 'clickup_limite')).toBe('aviso');
  });

  it('vigilante: en producción, si nunca ha dejado constancia, avisa; en local no sale', () => {
    expect(statusOf({ watchdog: null, production: true }, 'vigilante')).toBe('aviso');
    expect(evaluate({ ...healthy, watchdog: null }).some((c) => c.key === 'vigilante')).toBe(false);
    expect(statusOf({ watchdog: { ageMin: 3, configured: true } }, 'vigilante')).toBe('ok');
    // Lo mismo con la copia diaria y la prueba de restauración (antes, sin registro, no salía nada).
    expect(statusOf({ production: true }, 'copia')).toBe('critico');
    expect(statusOf({ production: true }, 'restauracion')).toBe('aviso');
    expect(evaluate(healthy).some((c) => c.key === 'copia')).toBe(false);
  });

  it('cada problema trae su recomendación', () => {
    const bad = evaluate({ ...healthy, outboxFailed: 2, telegramError: '401', emailsError: 1, watchError: 'token' }).filter((c) => c.status !== 'ok');
    expect(bad.length).toBe(4);
    for (const c of bad) expect(c.recommendation.length).toBeGreaterThan(10);
  });
});

describe('/api/health', () => {
  it('responde JSON sin datos de cuentas y sin caché', async () => {
    const res = await getHealthRoute();
    expect([200, 503]).toContain(res.status);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['db', 'heartbeatAgeS', 'ok']); // db: solo si la base de datos responde (D12)
  });
});
