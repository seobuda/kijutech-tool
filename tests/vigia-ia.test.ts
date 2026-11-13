// Vigía del gasto de IA, IA de reserva y reasignar desde el parte (13 nov 2026). Cálculo puro.
import { describe, expect, it } from 'vitest';
import { detectSpikes, explainSpike, forecastMonth, median, recommend, type DayStat, type FnStat } from '@/lib/operaciones/ai-watch';
import { shouldFallback } from '@/lib/ai/gateway';
import { AUTOPILOT_CALLBACK_RE } from '@/lib/operaciones/autopilot';

const day = (p: Partial<DayStat> = {}): DayStat => ({ calls: 10, usd: 0.1, inTok: 20000, outTok: 3000, failed: 0, fallback: 0, ...p });

describe('previsión y picos', () => {
  it('mediana y previsión de fin de mes', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
    // 20 $ gastados el día 10 de 30, 14 $ en 7 días → 2 $/día × 20 días = 60 $.
    expect(forecastMonth(20, 14, 10, 30)).toBe(60);
  });

  it('detecta el pico y explica el porqué', () => {
    const base = Array.from({ length: 14 }, () => day());
    const series = new Map([
      ['ops_email_reply', [...base, day({ calls: 40, usd: 1.2, inTok: 400000, outTok: 12000, failed: 6 })]],
      ['ops_blocker_triage', [...base, day({ usd: 0.12 })]]
    ]);
    const spikes = detectSpikes(series, 3);
    expect(spikes.map((s) => s.fn)).toEqual(['ops_email_reply']);
    const r = spikes[0].reasons.join(' | ');
    expect(r).toContain('40 llamadas');
    expect(r).toContain('entrada media');
    expect(r).toContain('fallidas');
  });

  it('sin pico por debajo del mínimo aunque sea mucho más que lo normal', () => {
    const base = Array.from({ length: 14 }, () => day({ usd: 0.01 }));
    expect(detectSpikes(new Map([['x', [...base, day({ usd: 0.2 })]]]), 3)).toEqual([]);
  });

  it('explica la reserva y una función nueva', () => {
    expect(explainSpike(day({ fallback: 2 }), [day()]).join(' ')).toContain('reserva');
    expect(explainSpike(day(), [day({ calls: 0, usd: 0, inTok: 0, outTok: 0 })]).join(' ')).toContain('no se usaba');
  });
});

describe('recomendaciones', () => {
  const fn = (p: Partial<FnStat>): FnStat => ({
    fn: 'f', model: 'claude-sonnet-4-6', calls30: 60, usd30: 6, usd7: 1.4, usdPrev7: 1.2, calls7: 20, avgIn: 1000, avgOut: 800, inUsdShare: 0.5, failed30: 0, fallback30: 0, uncosted30: 0, ...p
  });
  it('caché, modelo pequeño, fallos, reserva, previsión y gasto fuera de la herramienta', () => {
    const recs = recommend(
      [fn({ fn: 'grande', avgIn: 9000 }), fn({ fn: 'clasifica', avgOut: 150 }), fn({ fn: 'falla', failed30: 12 }), fn({ fn: 'reserva', fallback30: 2 })],
      { forecast: 120, budget: 80, orgOtherUsd: 50, toolMtd: 10 }
    );
    const titles = recs.map((r) => r.title).join(' | ');
    expect(recs[0].title).toContain('previsión');
    expect(titles).toContain('Caché de prompt en «grande»');
    expect(titles).toContain('Modelo más pequeño para «clasifica»');
    expect(titles).toContain('Fallos en «falla»');
    expect(titles).toContain('reserva');
    expect(titles).toContain('no es de la herramienta');
    expect(recs.find((r) => r.title.startsWith('Caché'))!.savingUsdMonth).toBeGreaterThan(0);
  });
  it('no recomienda modelo pequeño si ya es pequeño', () => {
    expect(recommend([fn({ model: 'claude-haiku-4-5', avgOut: 100 })], { forecast: 1, budget: 80, orgOtherUsd: null, toolMtd: 1 })).toEqual([]);
  });
});

describe('IA de reserva: cuándo se prueba otro proveedor', () => {
  it('sí ante fallos del proveedor; no ante una petición mal formada', () => {
    expect(shouldFallback('Anthropic API error (529): overloaded')).toBe(true);
    expect(shouldFallback('Anthropic API error (429): rate_limit_error')).toBe(true);
    expect(shouldFallback('Anthropic API error (401): invalid x-api-key')).toBe(true);
    expect(shouldFallback('Anthropic API error (400): Your credit balance is too low')).toBe(true);
    expect(shouldFallback('Llamada a la IA superó el timeout de 180s')).toBe(true);
    expect(shouldFallback('fetch failed')).toBe(true);
    expect(shouldFallback('Anthropic API error (400): messages: field required')).toBe(false);
  });
});

describe('botones del parte', () => {
  it('reasignar, mover a mañana y subir autonomía', () => {
    expect('ap:as:86c1abc:123456:654321'.match(AUTOPILOT_CALLBACK_RE)?.slice(1)).toEqual(['as', '86c1abc', '123456', '654321']);
    expect('ap:due:86c1abc'.match(AUTOPILOT_CALLBACK_RE)?.[1]).toBe('due');
    expect('ap:up:blocker_answer'.match(AUTOPILOT_CALLBACK_RE)?.[2]).toBe('blocker_answer');
    expect('ap:as:86c1abc:no-num:1'.match(AUTOPILOT_CALLBACK_RE)).toBeNull();
    expect('ap:as:86c1abc:123456:654321'.length).toBeLessThanOrEqual(64);
  });
});

describe('precio de respaldo', () => {
  it('cubre los modelos de Anthropic y acepta el sufijo de fecha', async () => {
    const { FALLBACK_PRICING } = await import('@/lib/ai/gateway');
    expect(FALLBACK_PRICING['anthropic/claude-sonnet-4-6']).toEqual(['0.003', '0.015']);
    const key = 'anthropic/claude-sonnet-4-6-20260101';
    const match = Object.keys(FALLBACK_PRICING).filter((k) => key.startsWith(`${k}-`)).sort((a, b) => b.length - a.length)[0];
    expect(match).toBe('anthropic/claude-sonnet-4-6');
  });
  it('recomienda poner precio si hay llamadas sin coste', () => {
    const r = recommend([{ fn: 'x', model: 'm-rara', calls30: 5, usd30: 0, usd7: 0, usdPrev7: 0, calls7: 2, avgIn: 100, avgOut: 50, inUsdShare: 0.5, failed30: 0, fallback30: 0, uncosted30: 5 }], { forecast: 0, budget: 80, orgOtherUsd: null, toolMtd: 0 });
    expect(r[0].title).toContain('sin precio');
  });
});
