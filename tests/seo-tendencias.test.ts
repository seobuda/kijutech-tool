// SEO parte 11: tendencias por técnica entre clientes y factor del plan (reglas puras del núcleo).
import { describe, expect, it } from 'vitest';
import { pickCheckpoint, planFactors, randomEffects, techniqueTrends, type InterventionLite } from '@/lib/core/technique-trends-rules';
import { buildPlan } from '@/lib/seo/plan/rules';

const iv = (id: string, client: string, technique: string, effect: number, over: Partial<InterventionLite> = {}, cp: Record<string, unknown> = {}): InterventionLite => ({
  id,
  clientId: client,
  technique,
  taxonomyVersion: 1,
  source: 'seo.plan',
  windowDays: 56,
  checkpoints: [
    { days: 28, valid: true, effectLog: 9, se: 0.1, metric: 'clics' },
    { days: 56, valid: true, effectLog: effect, se: 0.1, metric: 'clics', clicksEffectLog: effect, clicksSe: 0.1, clicksValid: true, confounders: [], ...cp }
  ],
  ...over
});

describe('tendencias por técnica', () => {
  it('un punto por intervención: el primero ≥ ventana', () => {
    expect(pickCheckpoint(iv('a', 'c1', 't', 0.2))?.days).toBe(56);
    expect(pickCheckpoint(iv('a', 'c1', 't', 0.2, { windowDays: 70 }))).toBeNull();
  });
  it('fuera inválidos, con solapes y de Estrategia; cada cliente cuenta una vez', () => {
    const list = [
      iv('a', 'c1', 'enlazado_interno', 0.3),
      iv('b', 'c1', 'enlazado_interno', 0.1),
      iv('c', 'c2', 'enlazado_interno', 0.2),
      iv('d', 'c3', 'enlazado_interno', 0.9, {}, { valid: false }),
      iv('e', 'c4', 'enlazado_interno', 0.9, {}, { confounders: ['x'] }),
      iv('f', 'c5', 'enlazado_interno', 0.9, { source: 'estrategia' })
    ];
    const [t] = techniqueTrends(list);
    expect(t.n).toBe(3);
    expect(t.clients).toBe(2);
    expect(t.label).toBe('pocos casos');
    expect(t.effectPct).toBeCloseTo((Math.exp(0.2) - 1) * 100, 0);
  });
  it('efectos aleatorios: igual efecto = sin heterogeneidad', () => {
    const r = randomEffects([
      { y: 0.2, v: 0.01 },
      { y: 0.2, v: 0.04 }
    ])!;
    expect(r.mu).toBeCloseTo(0.2);
    expect(r.tau2).toBe(0);
  });
  it('factor del plan solo con aprendizaje (50 casos, 10 clientes), centrado y acotado', () => {
    const many = (tech: string, e: number) => Array.from({ length: 50 }, (_, i) => iv(`${tech}${i}`, `c${i % 10}`, tech, e));
    expect(planFactors(techniqueTrends(many('enlazado_interno', 0.1).slice(0, 40))).size).toBe(0);
    const f = planFactors(techniqueTrends([...many('enlazado_interno', 0.4), ...many('encabezados', 0.0), ...many('titulo_reescrito', 2)]));
    expect(f.get('enlazado_interno')!).toBeGreaterThan(1);
    expect(f.get('encabezados')!).toBeLessThan(1);
    expect(f.get('enlazado_interno')!).toBeLessThanOrEqual(1.25);
    expect(f.has('titulo_reescrito')).toBe(false);
  });
  it('heterogeneidad: τ² > 0 con efectos dispersos', () => {
    const r = randomEffects([
      { y: 0.0, v: 0.01 },
      { y: 0.6, v: 0.01 },
      { y: 0.3, v: 0.01 }
    ])!;
    // Q = 18, c = 200 − 300/300 = 200 → τ² = (18 − 2) / 200 ≈ 0,08 (a mano, con pesos 100).
    expect(r.tau2).toBeCloseTo(0.08, 2);
    expect(r.mu).toBeCloseTo(0.3);
  });
  it('sin clics válidos suficientes, no hay factor', () => {
    const many = Array.from({ length: 50 }, (_, i) => iv(`x${i}`, `c${i % 10}`, 'enlazado_interno', 0.4, {}, { clicksValid: i < 10 }));
    expect(planFactors(techniqueTrends(many)).size).toBe(0);
  });
  it('el factor ordena dentro de la prioridad, nunca la cambia', () => {
    const findings = [
      { id: '1', kind: 'seo.h1_missing', severity: 'aviso', url: 'https://w.es/a', query: null, value: null, evidence: {} },
      { id: '2', kind: 'seo.anchor_generic', severity: 'aviso', url: 'https://w.es/b', query: null, value: null, evidence: {} }
    ] as never;
    const base = buildPlan(findings, new Map(), null);
    const boosted = buildPlan(findings, new Map(), null, {}, new Map([[base[base.length - 1].technique, 1.25]]));
    expect(boosted.map((d) => d.priority)).toEqual(base.map((d) => d.priority));
    // Con la misma prioridad, el potenciado pasa delante.
    if (base[0].priority === base[base.length - 1].priority) expect(boosted[0].technique).toBe(base[base.length - 1].technique);
  });
});
