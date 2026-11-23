// Hito 2 SEO (24 nov 2026, migración 0062): mapa de palabras (reglas puras): página dominante, agrupado por palabras,
// temas, canibalización con señal temporal y clics anónimos; y que el plan convierte la canibalización en propuesta.
import { describe, expect, it } from 'vitest';
import { anonymousShare, buildTopics, cannibalization, lexicalGroups, queryStats, type QueryPageRow, type WeekRow } from '@/lib/seo/mapa/rules';
import { buildPlan } from '@/lib/seo/plan/rules';
import { brandTokens } from '@/lib/seo/expediente/rules';
import { isAggregator, rankCompetitors, seedQueries } from '@/lib/seo/competencia/rules';

const row = (query: string, page: string, impressions: number, pos = 5, clicks = 1, recent = 0, prev = 0): QueryPageRow => ({ query, page, impressions, clicks, posSum: pos * impressions, clicksRecent: recent, clicksPrev: prev });

describe('Mapa de palabras: página dominante', () => {
  it('una consulta va a la página que Google más le muestra si es clara (≥ 60 % y posición ≤ 30)', () => {
    const s = queryStats([
      row('reforma baño valencia', 'https://w.es/banos', 90),
      row('reforma baño valencia', 'https://w.es/', 10),
      row('reformas oficinas', 'https://w.es/oficinas', 50),
      row('reformas oficinas', 'https://w.es/locales', 50),
      row('pintor barato', 'https://w.es/pintura', 40, 45),
      row('ruido', 'https://w.es/', 3)
    ]);
    const by = new Map(s.map((x) => [x.query, x]));
    expect(by.get('reforma baño valencia')?.dominant).toBe('https://w.es/banos');
    expect(by.get('reformas oficinas')?.dominant).toBeNull(); // 50/50: no hay una clara
    expect(by.get('pintor barato')?.dominant).toBeNull(); // posición 45: Google no la ve como suya
    expect(by.has('ruido')).toBe(false); // < 10 impresiones
    expect(by.get('reforma baño valencia')?.position).toBe(5);
  });
});

describe('Mapa de palabras: temas', () => {
  it('agrupa por palabras compartidas', () => {
    const g = lexicalGroups(['pintor valencia', 'pintores en valencia', 'reforma cocina', 'reformas de cocinas', 'abogado']);
    expect(g.map((x) => x.sort()).sort()).toEqual([['abogado'], ['pintor valencia', 'pintores en valencia'], ['reforma cocina', 'reformas de cocinas']]);
  });

  it('temas por página y temas «página nueva»; la marca se cuenta; el ruido suelto se descarta', () => {
    const stats = queryStats([
      row('reforma baño valencia', 'https://w.es/banos', 100, 4, 10, 6, 2),
      row('reformar baño precio', 'https://w.es/banos', 60, 6, 3, 2, 1),
      row('cm iberica', 'https://w.es/', 80, 1, 40),
      row('reformas oficinas', 'https://w.es/oficinas', 50, 12),
      row('reformas oficinas', 'https://w.es/locales', 50, 14),
      row('reforma de oficinas barcelona', 'https://w.es/oficinas', 30, 25),
      row('reforma de oficinas barcelona', 'https://w.es/locales', 30, 22),
      row('pintor barato', 'https://w.es/pintura', 20, 45)
    ]);
    const topics = buildTopics(stats, { brandTokens: brandTokens(['CM Ibérica']) });
    const banos = topics.find((t) => t.url === 'https://w.es/banos')!;
    expect(banos.origin).toBe('pagina');
    expect(banos.name).toBe('reforma baño valencia');
    expect(banos.metrics).toMatchObject({ clics: 13, impresiones: 160, consultas: 2, tendenciaPct: null });
    expect(topics.find((t) => t.url === 'https://w.es/')!.metrics.marca).toBe(1);
    const nueva = topics.find((t) => t.origin === 'parecido')!;
    expect(nueva.url).toBeNull();
    expect(nueva.queries.map((q) => q.query).sort()).toEqual(['reforma de oficinas barcelona', 'reformas oficinas']);
    expect(topics.some((t) => t.queries.some((q) => q.query === 'pintor barato'))).toBe(false); // una sola, < 50 impresiones
    for (let i = 1; i < topics.length; i++) expect(topics[i - 1].metrics.impresiones).toBeGreaterThanOrEqual(topics[i].metrics.impresiones);
  });

  it('la clave de un tema por página no cambia entre ejecuciones', () => {
    const a = buildTopics(queryStats([row('x y z', 'https://w.es/a', 100)]));
    const b = buildTopics(queryStats([row('otra', 'https://w.es/a', 300)]));
    expect(a[0].topicKey).toBe(b[0].topicKey);
  });

  it('tendencia con clics suficientes', () => {
    const t = buildTopics(queryStats([row('a b c', 'https://w.es/a', 100, 3, 30, 20, 10)]));
    expect(t[0].metrics.tendenciaPct).toBe(100);
  });
});

describe('Mapa de palabras: canibalización y clics anónimos', () => {
  const w = (query: string, page: string, week: string, impressions: number, pos = 8): WeekRow => ({ query, page, week, impressions, posSum: pos * impressions });

  it('dos páginas que se turnan el primer puesto al menos dos veces', () => {
    const rows = [
      w('reforma oficinas', 'A', '2026-10-05', 30), w('reforma oficinas', 'B', '2026-10-05', 10),
      w('reforma oficinas', 'B', '2026-10-12', 30), w('reforma oficinas', 'A', '2026-10-12', 5),
      w('reforma oficinas', 'A', '2026-10-19', 30),
      // estable: siempre A
      w('estable', 'A', '2026-10-05', 40), w('estable', 'B', '2026-10-05', 5), w('estable', 'A', '2026-10-12', 40),
      // se turnan pero fuera del top 20: no cuenta
      w('lejos', 'A', '2026-10-05', 40, 40), w('lejos', 'B', '2026-10-12', 40, 40), w('lejos', 'A', '2026-10-19', 40, 40)
    ];
    const c = cannibalization(rows);
    expect(c).toEqual([{ query: 'reforma oficinas', pages: ['A', 'B'], switches: 2, weeks: 3 }]);
  });

  it('clics anónimos', () => {
    expect(anonymousShare(100, 60)).toBeCloseTo(0.4);
    expect(anonymousShare(0, 0)).toBeNull();
    expect(anonymousShare(10, 20)).toBe(0);
  });

  it('la canibalización entra en el plan como su técnica', () => {
    const plan = buildPlan([{ id: 'c1', kind: 'seo.cannibalization', severity: 'aviso', url: 'https://w.es/a', query: 'reforma oficinas' }], new Map(), null);
    expect(plan[0].technique).toBe('canibalizacion_resuelta');
    expect(plan[0].estHours).toBe(1);
  });
});

describe('Competencia: reglas', () => {
  const serp = (domains: string[], local: string[] = []) => ({
    organic: domains.map((d, i) => ({ rank: i + 1, domain: d, url: `https://${d}/x`, title: d })),
    localPack: local.map((d, i) => ({ rank: i + 1, title: `Local ${d}`, domain: d, rating: 4.5, reviews: 20 })),
    costUsd: 0.002
  });

  it('propone los dominios que salen en varias búsquedas, sin el propio, y marca los directorios', () => {
    const results = [
      { query: 'a', serp: serp(['www.rival.es', 'habitissimo.es', 'cliente.es', 'suelto.es']) },
      { query: 'b', serp: serp(['rival.es', 'habitissimo.es', 'otro.es']) },
      { query: 'c', serp: serp(['rival.es', 'otro.es'], ['local1.es']) }
    ];
    const c = rankCompetitors(results, ['cliente.es']);
    expect(c.map((x) => x.domain)).toEqual(['rival.es', 'habitissimo.es', 'otro.es']);
    expect(c[0]).toMatchObject({ kind: 'directo', appearances: 3, avgPosition: 1 });
    expect(c[1].kind).toBe('agregador');
    expect(c.some((x) => x.domain === 'cliente.es' || x.domain === 'suelto.es')).toBe(false);
  });

  it('el paquete local cuenta aunque salga en pocas búsquedas', () => {
    const results = [
      { query: 'a', serp: serp([], ['taller.es']) },
      { query: 'b', serp: serp([], ['taller.es']) },
      { query: 'c', serp: serp([]) },
      { query: 'd', serp: serp([]) },
      { query: 'e', serp: serp([]) },
      { query: 'f', serp: serp([]) }
    ];
    const c = rankCompetitors(results, []);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ domain: 'taller.es', inLocalPack: 2, rating: 4.5, localName: 'Local taller.es' });
  });

  it('directorios y semillas', () => {
    expect(isAggregator('www.habitissimo.es')).toBe(true);
    expect(isAggregator('es.wikipedia.org')).toBe(true);
    expect(isAggregator('reformasgarcia.es')).toBe(false);
    const seeds = seedQueries({ topics: [{ name: 'cm iberica', isBrand: true, impressions: 900 }, { name: 'reforma oficinas', isBrand: false, impressions: 300 }, { name: 'Reformas de oficinas Madrid', isBrand: false, impressions: 10 }], services: ['Reformas de oficinas'], city: 'Madrid' });
    expect(seeds).toEqual(['Reformas de oficinas Madrid', 'reforma oficinas']);
  });
});
