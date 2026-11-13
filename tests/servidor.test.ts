// Servidor y costes de DigitalOcean (13 nov 2026): cálculo puro y comprobaciones de Salud.
import { describe, expect, it } from 'vitest';
import { forecastInfra, infraRecommendations, monthlyEstimate, nextSize, percentile, type Droplet, type InfraData } from '@/lib/operaciones/infra-watch';
import { evaluate, type Snapshot } from '@/lib/operaciones/health';

const drop = (p: Partial<Droplet>): Droplet => ({ id: 1, name: 'kijutech-brain', size: 's-1vcpu-2gb', memoryMb: 2048, vcpus: 1, diskGb: 50, priceMonthly: 12, backups: true, createdAt: '2026-11-04T00:00:00Z', ...p });
const sizes = [
  { slug: 's-1vcpu-2gb', memoryMb: 2048, vcpus: 1, diskGb: 50, priceMonthly: 12 },
  { slug: 's-2vcpu-4gb', memoryMb: 4096, vcpus: 2, diskGb: 80, priceMonthly: 24 },
  { slug: 's-4vcpu-8gb', memoryMb: 8192, vcpus: 4, diskGb: 160, priceMonthly: 48 }
];

describe('costes', () => {
  it('estimación mensual: servidores + 20 % de copias + snapshots por GB', () => {
    const e = monthlyEstimate([drop({}), drop({ id: 2, name: 'otro', priceMonthly: 7, backups: false })], [{ name: 's', createdAt: '2020-01-01', sizeGb: 10 }]);
    expect(e).toEqual({ total: 22, droplets: 19, backups: 2.4, snapshots: 0.6 });
  });
  it('previsión lineal del mes y percentil', () => {
    expect(forecastInfra(13.54, 13, 30)).toBe(31.25);
    // Con el coste fijo actual (36,95 $/mes): 13,54 + 36,95 × 17/30 = 34,48 (aunque un servidor naciera a mitad de mes).
    expect(forecastInfra(13.54, 13, 30, 36.95)).toBe(34.48);
    expect(percentile([1, 2, 3, 4, 100], 95)).toBe(100);
    expect(percentile([], 95)).toBeNull();
  });
  it('propone el tamaño más barato con el doble de memoria', () => {
    expect(nextSize(drop({}), sizes)?.slug).toBe('s-2vcpu-4gb');
  });
});

describe('recomendaciones del servidor', () => {
  const base: InfraData = {
    fetchedAt: new Date().toISOString(),
    error: null,
    mtdUsd: 10,
    invoices: [],
    droplets: [drop({})],
    snapshots: [],
    sizes,
    capacity: { dropletName: 'kijutech-brain', memTotalMb: 1968, memUsedPctNow: 40, memUsedPctMax24h: 50, memUsedPctP95_24h: 45, diskUsedPct: 30, loadP95PerCpu: 0.4 }
  };
  it('todo bien: nada que recomendar', () => {
    expect(infraRecommendations(base, { memPct: 85, forecast: 30, budget: 45 })).toEqual([]);
  });
  it('memoria alta con su ampliación y precio, disco, snapshots antiguos y presupuesto', () => {
    const r = infraRecommendations(
      {
        ...base,
        capacity: { ...base.capacity!, memUsedPctP95_24h: 90, memUsedPctMax24h: 96, diskUsedPct: 85, loadP95PerCpu: 1.2 },
        snapshots: [{ name: 'viejo', createdAt: '2022-01-01T00:00:00Z', sizeGb: 10 }]
      },
      { memPct: 85, forecast: 60, budget: 45 }
    );
    const titles = r.map((x) => x.title);
    expect(titles[0]).toContain('presupuesto');
    expect(titles).toContain('Memoria del servidor casi llena');
    expect(titles).toContain('CPU del servidor al límite');
    expect(titles).toContain('Disco del servidor casi lleno');
    expect(titles).toContain('Snapshots antiguos');
    expect(r.find((x) => x.title.startsWith('Memoria'))!.detail).toContain('s-2vcpu-4gb');
    expect(r.find((x) => x.title.startsWith('Memoria'))!.deltaUsdMonth).toBe(12);
    expect(r.find((x) => x.title.startsWith('Snapshots'))!.deltaUsdMonth).toBe(-0.6);
  });
});

describe('Salud: memoria y CPU del servidor', () => {
  const healthy: Snapshot = {
    heartbeatAgeS: 20, notificationsFailed: 0, notificationsStuck: 0, outboxFailed: 0, outboxStuck: 0, requestsError: 0, requestsStuck: 0,
    emailsError: 0, emailsStuck: 0, watchError: null, telegramError: null, aiFailedHour: 0, aiTotalHour: 0, clickupPeakPerMin: 1
  };
  const st = (s: Partial<Snapshot>, key: string) => evaluate({ ...healthy, ...s }).find((c) => c.key === key)?.status;
  it('aviso, crítico y sin dato', () => {
    expect(st({ serverMem: { p95: 50, max: 60, limit: 85, upgrade: null } }, 'servidor_memoria')).toBe('ok');
    expect(st({ serverMem: { p95: 88, max: 92, limit: 85, upgrade: 'x' } }, 'servidor_memoria')).toBe('aviso');
    expect(st({ serverMem: { p95: 90, max: 98, limit: 85, upgrade: 'x' } }, 'servidor_memoria')).toBe('critico');
    expect(st({ serverLoadPerCpu: 2 }, 'servidor_cpu')).toBe('aviso');
    expect(st({ serverLoadPerCpu: 0.5 }, 'servidor_cpu')).toBe('ok');
    expect(st({}, 'servidor_memoria')).toBeUndefined();
  });
});
