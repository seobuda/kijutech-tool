// SEO · Palabras A+B (26 nov 2026): la marca nunca pide página nueva; «sin página clara» frente a «página nueva»;
// oportunidades (tema sin página, elegir página, al alcance y CTR bajo) que van al plan; valor de negocio con lo que
// sabemos del cliente; temporada; y que el plan pesa por las impresiones de las búsquedas y por el valor.
import { describe, expect, it } from 'vitest';
import { buildTopics, expectedCtr, opportunities, queryStats, seasonality, topicGain, topicValue, type QueryPageRow } from '@/lib/seo/mapa/rules';
import { buildPlan, KIND_TECHNIQUE } from '@/lib/seo/plan/rules';
import { brandTokens } from '@/lib/seo/expediente/rules';

const row = (query: string, page: string, impressions: number, pos = 5, clicks = 1): QueryPageRow => ({ query, page, impressions, clicks, posSum: pos * impressions, clicksRecent: 0, clicksPrev: 0 });
const brand = brandTokens(['CM Ibérica']);

describe('Palabras: marca y estado de cada tema', () => {
  it('la marca sin página dominante va a la página que más ve (nunca «página nueva»)', () => {
    const stats = queryStats([
      row('cm iberica', 'https://w.es/', 50, 1, 20),
      row('cm iberica', 'https://w.es/contacto', 45, 2, 5),
      row('cm iberica opiniones', 'https://w.es/contacto', 30, 3, 2),
      row('cm iberica opiniones', 'https://w.es/', 25, 4, 1)
    ]);
    const topics = buildTopics(stats, { brandTokens: brand });
    expect(topics.every((t) => t.url !== null)).toBe(true);
    const b = topics.find((t) => t.metrics.esMarca)!;
    expect(b.url).toBe('https://w.es/'); // la portada es la mejor colocada en «cm iberica» (95 impresiones frente a 55)
    expect(b.queries.map((q) => q.query).sort()).toEqual(['cm iberica', 'cm iberica opiniones']);
  });

  it('sin página dominante pero con una en el top 20: «sin página clara» con su candidata; si no, página nueva', () => {
    const stats = queryStats([
      row('reforma nave industrial', 'https://w.es/naves', 300, 9),
      row('reforma nave industrial', 'https://w.es/', 300, 18),
      row('reformar naves industriales', 'https://w.es/naves', 100, 11),
      row('reformar naves industriales', 'https://w.es/', 100, 25),
      row('pintura de suelos industriales', 'https://w.es/blog/x', 200, 35),
      row('pintar suelos industriales', 'https://w.es/blog/y', 150, 40)
    ]);
    const topics = buildTopics(stats, { brandTokens: brand });
    const nave = topics.find((t) => t.name === 'reforma nave industrial')!;
    expect(nave.url).toBeNull();
    expect(nave.metrics.candidata).toBe('https://w.es/naves');
    expect(nave.metrics.candidataPos).toBe(9.5);
    const suelos = topics.find((t) => t.queries.some((q) => q.query.includes('suelos')))!;
    expect(suelos.url).toBeNull();
    expect(suelos.metrics.candidata).toBeUndefined();
  });
});

describe('Palabras: valor de negocio', () => {
  const t = (name: string, queries: string[] = []) => ({ name, queries: [name, ...queries].map((q) => ({ query: q, clicks: 0, impressions: 100, position: 5, clicksRecent: 0, clicksPrev: 0, dominant: null, share: 0, topPage: '', topPos: 5 })), metrics: { clics: 0, impresiones: 100, posicion: 5, ctr: 0, tendenciaPct: null, consultas: 1, marca: 0 } });

  it('servicio del cliente: más valor cuanto más arriba en su lista; si no es un servicio suyo, 1', () => {
    const ctx = { services: ['Reformas integrales', 'Naves industriales', 'Pintura'], avoid: [], prefer: [] };
    expect(topicValue(t('reformas integrales piso'), ctx)).toMatchObject({ valor: 3, servicio: 'Reformas integrales' });
    expect(topicValue(t('reforma nave industrial'), ctx)).toMatchObject({ valor: 2.5, servicio: 'Naves industriales' });
    expect(topicValue(t('pintura de fachadas'), ctx).valor).toBe(2);
    expect(topicValue(t('abogado laboral'), ctx)).toMatchObject({ valor: 1, servicio: null });
  });

  it('lo que el cliente dijo que no quiere baja el valor y se avisa; lo que más le interesa suma', () => {
    const ctx = { services: ['Reformas'], avoid: ['particulares, solo empresas'], prefer: ['naves y locales comerciales'] };
    const v = topicValue(t('reforma piso particular'), ctx);
    expect(v.valor).toBe(0.5);
    expect(v.aviso).toMatch(/no quiere/);
    expect(topicValue(t('reforma local comercial'), ctx).valor).toBe(3.0); // servicio (3, primero) + preferencia, con tope
    expect(topicValue(t('limpieza de naves'), { ...ctx, services: ['Pintura', 'Limpieza'] }).valor).toBe(3); // 2,5 + 0,5
  });

  it('sin datos del cliente, no se inventa: valor desconocido', () => {
    expect(topicValue(t('lo que sea'), { services: [], avoid: [], prefer: [] }).valor).toBeNull();
  });
});

describe('Palabras: oportunidades', () => {
  const stats = queryStats([
    row('reforma nave industrial', 'https://w.es/naves', 2000, 9, 10),
    row('reforma nave industrial', 'https://w.es/', 2000, 18, 5),
    row('pintura suelos industriales', 'https://w.es/blog/x', 400, 35, 0),
    row('pintar suelos industriales', 'https://w.es/blog/y', 300, 40, 0),
    row('reformas de oficinas', 'https://w.es/oficinas', 900, 7, 20),
    row('rehabilitacion fachadas', 'https://w.es/fachadas', 1200, 4, 2),
    row('cm iberica', 'https://w.es/', 800, 5, 10)
  ]);
  const topics = buildTopics(stats, { brandTokens: brand });

  it('salen tema sin página clara, página nueva, al alcance y CTR bajo; nunca de la marca', () => {
    const o = opportunities(topics, stats, brand);
    const kinds = (k: string) => o.filter((x) => x.kind === k);
    expect(kinds('seo.topic_unclear_page').map((x) => x.url)).toEqual(['https://w.es/naves']);
    expect(kinds('seo.topic_unclear_page')[0].severity).toBe('importante'); // 4000 impresiones
    expect(kinds('seo.topic_new_page')).toHaveLength(1);
    expect(kinds('seo.striking_distance').map((x) => x.query).sort()).toEqual(['reformas de oficinas', 'rehabilitacion fachadas']);
    expect(kinds('seo.low_ctr').map((x) => x.url)).toContain('https://w.es/fachadas'); // posición 4 con 2 clics de 1200
    expect(o.some((x) => x.query === 'cm iberica')).toBe(false);
    for (const x of o) expect(x.gain).toBeGreaterThanOrEqual(0);
  });

  it('lo que el cliente no quiere no propone trabajo', () => {
    const ts = buildTopics(stats, { brandTokens: brand });
    for (const t of ts) if (t.name.includes('suelos')) t.metrics.valor = 0.5;
    expect(opportunities(ts, stats, brand).some((x) => x.kind === 'seo.topic_new_page')).toBe(false);
  });

  it('clics posibles: prudentes y nunca negativos', () => {
    expect(expectedCtr(3)).toBeGreaterThan(expectedCtr(9));
    for (const t of topics) expect(topicGain(t)).toBeGreaterThanOrEqual(0);
    expect(topicGain(topics.find((t) => t.metrics.esMarca)!)).toBe(0);
  });
});

describe('Palabras: temporada', () => {
  const m = (month: string, impressions: number, clicks = 1) => ({ query: 'piscinas', month, impressions, clicks });
  it('con 12 meses: los meses fuertes; con 15: frente al año pasado', () => {
    const rows = [];
    for (let i = 0; i < 16; i++) {
      const d = new Date(Date.UTC(2026, 9 - i, 1));
      const mo = d.getUTCMonth();
      rows.push(m(d.toISOString().slice(0, 10), mo >= 4 && mo <= 6 ? 400 : 100, i < 3 ? 30 : i >= 12 && i <= 14 ? 20 : 5));
    }
    const s = seasonality(['piscinas'], rows, '2026-10-01');
    expect(s.mesesFuertes).toBe('may, jun, jul');
    expect(s.interanualPct).toBe(50);
  });
  it('sin un año de datos no se inventa nada', () => {
    expect(seasonality(['piscinas'], [m('2026-10-01', 100)], '2026-10-01')).toEqual({ interanualPct: null, mesesFuertes: null });
  });
});

describe('Plan: oportunidades del mapa y prioridad por impacto y valor', () => {
  it('cada oportunidad tiene su técnica', () => {
    for (const k of ['seo.topic_new_page', 'seo.topic_unclear_page', 'seo.striking_distance', 'seo.low_ctr']) expect(KIND_TECHNIQUE[k]).toBeTruthy();
  });

  it('una canibalización de muchas impresiones ya no queda detrás de un arreglo menor por pesar solo su página', () => {
    const plan = buildPlan(
      [
        { id: 'c', kind: 'seo.cannibalization', severity: 'aviso', url: 'https://w.es/a', query: 'reforma oficinas', impressions: 13631 },
        { id: 'i', kind: 'seo.images_without_alt', severity: 'aviso', url: 'https://w.es/b' }
      ],
      new Map([['https://w.es/a', 10], ['https://w.es/b', 200]]),
      null
    );
    expect(plan[0].technique).toBe('canibalizacion_resuelta');
    expect(plan[0].evidence.impressions).toBe(13631);
    expect(plan[0].description).toContain('reforma oficinas (13631 impresiones en 90 días)');
  });

  it('a igual impacto, un servicio prioritario va antes que algo que no le interesa', () => {
    const plan = buildPlan(
      [
        { id: 'a', kind: 'seo.topic_new_page', severity: 'aviso', url: null, query: 'tema A', impressions: 1000, valor: 0.5 },
        { id: 'b', kind: 'seo.striking_distance', severity: 'aviso', url: 'https://w.es/b', query: 'tema B', impressions: 1000, valor: 3 }
      ],
      new Map(),
      null
    );
    expect(plan.map((p) => p.technique)).toEqual(['optimizar_al_alcance', 'nueva_pagina_tema']);
    expect(plan.find((p) => p.technique === 'nueva_pagina_tema')!.estHours).toBe(4);
  });
});
