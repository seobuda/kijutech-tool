// SEO parte 7 (demanda): reglas puras.
import { describe, expect, it } from 'vitest';
import { closestTopic, demandWithoutPage, filterIdeas, isNoise, keywordKey, sameIntentPairs, serpIntent, topicVolume, urlType } from '@/lib/seo/demanda/rules';
import { SEO_KINDS } from '@/lib/seo/salud/kinds';
import { KIND_TECHNIQUE } from '@/lib/seo/plan/rules';
import { TECHNIQUE_BY_KEY } from '@/lib/core/techniques';

describe('normalizar y volumen de un tema', () => {
  it('variantes cercanas comparten clave', () => {
    expect(keywordKey('Fontaneros Sabadell')).toBe(keywordKey('fontanero en sabadell'));
    expect(keywordKey('reforma cocina')).toBe(keywordKey('cocina reforma'));
  });
  it('el volumen no se infla con variantes (máximo por clave, suma entre claves)', () => {
    const vol = new Map([
      [keywordKey('fontanero sabadell'), 320],
      [keywordKey('desatascos sabadell'), 90]
    ]);
    expect(topicVolume(['fontanero sabadell', 'fontaneros sabadell', 'desatascos sabadell'], (k) => vol.get(k))).toBe(410);
    expect(topicVolume(['nada'], () => null)).toBeNull();
  });
});

describe('intención por la SERP', () => {
  it('tipo de URL', () => {
    expect(urlType('https://www.habitissimo.es/presupuestos/x')).toBe('directorio');
    expect(urlType('https://w.es/blog/como-elegir-caldera')).toBe('articulo');
    expect(urlType('https://w.es/fontanero-sabadell')).toBe('servicio');
    expect(isNoise('https://es-es.facebook.com/x')).toBe(true);
  });
  it('local, informacional, transaccional y mixta', () => {
    expect(serpIntent(['https://a.es/'], ['local_pack'], 'fontanero').intent).toBe('local');
    const arts = Array.from({ length: 6 }, (_, i) => `https://s${i}.es/blog/guia-${i}`).concat(['https://a.es/', 'https://b.es/']);
    expect(serpIntent(arts, [], 'cuánto cuesta una reforma').intent).toBe('informacional');
    const serv = Array.from({ length: 8 }, (_, i) => `https://s${i}.es/servicio`);
    expect(serpIntent(serv, [], 'empresa reformas').intent).toBe('transaccional');
  });
});

describe('validación de temas con la SERP', () => {
  const urls = (p: string, n: number) => Array.from({ length: n }, (_, i) => `https://comp${i}.es/${p}`);
  const shared = urls('x', 5);
  it('misma intención: 4+ URLs compartidas, páginas distintas', () => {
    const t = [
      { topicKey: 'a', name: 'reformas cocina', url: 'https://w.es/cocinas', position: 8, top10: [...shared, ...urls('a', 5)] },
      { topicKey: 'b', name: 'reforma de cocinas', url: 'https://w.es/reforma-cocina', position: 12, top10: [...shared, ...urls('b', 5)] }
    ];
    expect(sameIntentPairs(t, 'w.es', new Set())).toHaveLength(1);
    // Directorios y la propia web no cuentan.
    const noisy = [
      { ...t[0], top10: ['https://www.habitissimo.es/1', 'https://www.facebook.com/2', 'https://w.es/3', 'https://www.paginasamarillas.es/4', 'https://www.cronoshare.com/5', ...urls('a', 5)] },
      { ...t[1], top10: ['https://www.habitissimo.es/1', 'https://www.facebook.com/2', 'https://w.es/3', 'https://www.paginasamarillas.es/4', 'https://www.cronoshare.com/5', ...urls('b', 5)] }
    ];
    expect(sameIntentPairs(noisy, 'w.es', new Set())).toHaveLength(0);
    // Las dos en el top 3, o con canibalización abierta: no.
    expect(sameIntentPairs(t.map((x) => ({ ...x, position: 2 })), 'w.es', new Set())).toHaveLength(0);
    expect(sameIntentPairs(t, 'w.es', new Set(['https://w.es/cocinas']))).toHaveLength(0);
  });
});

describe('ideas', () => {
  it('filtra marcas de la competencia, largas, sin volumen y conocidas', () => {
    const ideas = [
      { keyword: 'fontanero sabadell', volume: 300, cpc: 2, competition: 'high' },
      { keyword: 'fontaneria garcia sabadell', volume: 50, cpc: 1, competition: 'low' },
      { keyword: 'x'.repeat(90), volume: 10, cpc: null, competition: null },
      { keyword: 'desatascos baratos', volume: 0, cpc: null, competition: null },
      { keyword: 'fontaneros sabadell', volume: 290, cpc: 2, competition: 'high' }
    ];
    const out = filterIdeas(ideas, { competitorTokens: [['fontaneria', 'garcia']], avoid: [], known: new Set() });
    expect(out.map((i) => i.keyword)).toEqual(['fontanero sabadell']);
  });
  it('tema más parecido y demanda sin página', () => {
    expect(closestTopic('reforma cocina sabadell', [{ topicKey: 't1', queries: ['reformas de cocina sabadell'] }, { topicKey: 't2', queries: ['baños'] }])).toBe('t1');
    expect(closestTopic('pintor', [{ topicKey: 't1', queries: ['reformas de cocina'] }])).toBeNull();
    const f = demandWithoutPage([
      { keyword: 'a', volume: 100, topicHasPage: false, intent: null },
      { keyword: 'b', volume: 100, topicHasPage: true, intent: null },
      { keyword: 'c', volume: 10, topicHasPage: false, intent: null }
    ]);
    expect(f.map((x) => x.query)).toEqual(['a']);
    expect(f[0].value).toBe(5);
  });
});

describe('tipos y técnicas de la parte 7', () => {
  it('cada tipo nuevo existe y tiene técnica', () => {
    for (const k of ['seo.serp_same_intent', 'seo.demand_no_page']) {
      expect(SEO_KINDS.some((x) => x.kind === k)).toBe(true);
      expect(TECHNIQUE_BY_KEY.has(KIND_TECHNIQUE[k])).toBe(true);
    }
  });
});
