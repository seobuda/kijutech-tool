// SEO parte 8 (medir y explicar): reglas puras de medición (núcleo) y del diagnóstico de caídas (SEO).
import { describe, expect, it } from 'vitest';
import { didEffect, incrementalClicks, NOT_MEASURABLE, preTrendOk, verdictOf, windows, type WeekPoint } from '@/lib/core/measure-rules';
import { urlVariants } from '@/lib/core/measure';
import { diagnoseLayers, dropState, weekKey } from '@/lib/seo/medir/diagnostico-rules';
import { FIELDS_BY_TECHNIQUE } from '@/lib/seo/medir/evidence';
import { SEO_KINDS } from '@/lib/seo/salud/kinds';
import { KIND_TECHNIQUE } from '@/lib/seo/plan/rules';
import { TECHNIQUE_BY_KEY } from '@/lib/core/techniques';

const series = (n: number, t: number, c: number, noise = 0): WeekPoint[] => Array.from({ length: n }, (_, i) => ({ week: `w${i}`, treated: t + (i % 2 ? noise : -noise), control: c }));

describe('diferencias en diferencias', () => {
  it('efecto positivo claro = funcionó; negativo claro = no funcionó', () => {
    const pre = series(8, 100, 1000, 3);
    expect(verdictOf({ pre, post: series(8, 150, 1000, 3), metric: 'clics', baseTotal: 800 }).verdict).toBe('funciono');
    expect(verdictOf({ pre, post: series(8, 60, 1000, 3), metric: 'clics', baseTotal: 800 }).verdict).toBe('no_funciono');
  });
  it('si el control sube igual, no hay efecto (temporada)', () => {
    const r = verdictOf({ pre: series(8, 100, 1000, 3), post: series(8, 150, 1500, 3), metric: 'clics', baseTotal: 800 });
    expect(r.verdict).toBe('no_concluyente');
    expect(Math.abs(r.effectPct)).toBeLessThan(2);
  });
  it('posición: bajar el número es mejorar (signo invertido)', () => {
    const e = didEffect(series(6, 12, 20), series(6, 6, 20), true);
    expect(e.effectLog).toBeGreaterThan(0);
  });
  it('pocos datos o tendencias no paralelas = no concluyente', () => {
    expect(verdictOf({ pre: series(8, 5, 1000), post: series(8, 20, 1000), metric: 'clics', baseTotal: 10 }).verdict).toBe('no_concluyente');
    // Antes ya venía cayendo mucho frente al resto (regresión a la media): no se concluye.
    const falling: WeekPoint[] = [200, 190, 180, 170, 60, 50, 40, 30].map((t, i) => ({ week: `w${i}`, treated: t, control: 1000 }));
    expect(preTrendOk(falling)).toBe(false);
    expect(verdictOf({ pre: falling, post: series(8, 150, 1000), metric: 'clics', baseTotal: 900 }).verdict).toBe('no_concluyente');
  });
  it('ventanas sin el intervalo dudoso + 7 días', () => {
    const w = windows({ from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-10-20T00:00:00Z') }, 28);
    expect(w.pre[1].toISOString().slice(0, 10)).toBe('2026-10-01');
    expect(w.post[0].toISOString().slice(0, 10)).toBe('2026-10-27');
  });
  it('clics incrementales y técnicas no medibles', () => {
    expect(incrementalClicks(150, Math.log(1.5))).toBe(50);
    expect(NOT_MEASURABLE.has('velocidad')).toBe(true);
    expect(NOT_MEASURABLE.has('titulo_reescrito')).toBe(false);
    expect(FIELDS_BY_TECHNIQUE.titulo_reescrito).toEqual(['title']);
  });
  it('variantes de URL para cruzar con Search Console', () => {
    const v = urlVariants('https://www.w.es/servicio/');
    expect(v).toContain('https://w.es/servicio');
    expect(v).toContain('http://www.w.es/servicio/');
  });
});

describe('diagnóstico de caídas', () => {
  it('histéresis y mínimo de clics', () => {
    expect(dropState({ clicks: 700, impressions: 1 }, { clicks: 1000, impressions: 1 }, null, false).drop).toBe(true);
    expect(dropState({ clicks: 850, impressions: 1 }, { clicks: 1000, impressions: 1 }, null, false).drop).toBe(false);
    expect(dropState({ clicks: 850, impressions: 1 }, { clicks: 1000, impressions: 1 }, null, true).drop).toBe(true);
    expect(dropState({ clicks: 50, impressions: 1 }, { clicks: 150, impressions: 1 }, null, false).drop).toBe(false);
    // Abierto tras una caída en escalón: el mes anterior ya es bajo, pero frente a la base del episodio sigue abierto.
    expect(dropState({ clicks: 700, impressions: 1 }, { clicks: 700, impressions: 1 }, null, true, 1000).drop).toBe(true);
    expect(dropState({ clicks: 950, impressions: 1 }, { clicks: 700, impressions: 1 }, null, true, 1000).drop).toBe(false);
    // Frente al año anterior no cae (temporada): no se abre.
    expect(dropState({ clicks: 700, impressions: 1 }, { clicks: 1000, impressions: 1 }, { clicks: 700, impressions: 1 }, false).drop).toBe(false);
  });
  it('capas: demanda primero, luego técnica, cambios y CTR', () => {
    const l = diagnoseLayers({
      cur: { clicks: 600, impressions: 6000 },
      prev: { clicks: 1000, impressions: 10000 },
      yoy: null,
      recentFindings: [{ kind: 'seo.home_noindex', url: null }],
      changes: { title: 12 }
    });
    expect(l.map((x) => x.capa)).toEqual(['demanda', 'tecnica', 'cambios']);
    const ctr = diagnoseLayers({ cur: { clicks: 600, impressions: 9800 }, prev: { clicks: 1000, impressions: 10000 }, yoy: null, recentFindings: [], changes: {} });
    expect(ctr.map((x) => x.capa)).toEqual(['ctr']);
  });
  it('semana del episodio', () => {
    expect(weekKey('2026-11-27')).toBe('2026-11-23');
  });
  it('el tipo nuevo existe y tiene técnica', () => {
    expect(SEO_KINDS.some((k) => k.kind === 'seo.traffic_drop_diagnosed')).toBe(true);
    expect(TECHNIQUE_BY_KEY.has(KIND_TECHNIQUE['seo.traffic_drop_diagnosed'])).toBe(true);
  });
});
