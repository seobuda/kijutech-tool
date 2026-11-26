// SEO parte 4 · posiciones (26 nov 2026; docs/DISENO-SEO-POSICIONES.md): semilla, idioma, ubicación, lectura de la SERP,
// caídas con margen, cuota de visibilidad y resumen de una respuesta de DataForSEO.
import { describe, expect, it } from 'vitest';
import { buildSeed, keywordLanguage, lostLocalPackState, pickLocation, rankDropState, readSerp, visibilityShare, zoneTowns, type HistoryPoint } from '@/lib/seo/posiciones/rules';
import { summarizeSerpItems } from '@/lib/agentes/integrations';
import { POSICIONES_KINDS, SALUD_KINDS } from '@/lib/seo/salud/kinds';
import { KIND_TECHNIQUE } from '@/lib/seo/plan/rules';

describe('posiciones: semilla', () => {
  it('servicio × población, GSC sin duplicados, marca y manuales primero; como mucho 50', () => {
    const seed = buildSeed({
      gscQueries: [
        { query: 'Reformas de oficinas Barcelona', impressions: 900 },
        { query: 'reforma local comercial', impressions: 500 },
        ...Array.from({ length: 60 }, (_, i) => ({ query: `búsqueda ${i}`, impressions: 10 }))
      ],
      services: ['Reformas de oficinas', 'Interiorismo de oficinas'],
      zona: 'Barcelona, Sabadell y el Vallès',
      brand: 'CM Ibérica',
      manual: ['naves industriales']
    });
    expect(seed.length).toBe(33); // 1 manual + 1 marca + 6 servicio × zona + 25 de GSC (tope)
    expect(seed[0]).toMatchObject({ keyword: 'naves industriales', origin: 'manual' });
    expect(seed[1]).toMatchObject({ origin: 'marca' });
    expect(seed.filter((s) => s.keyword === 'reformas de oficinas barcelona')).toHaveLength(1); // no se repite con GSC
    expect(seed.some((s) => s.keyword === 'interiorismo de oficinas sabadell' && s.origin === 'servicio_zona')).toBe(true);
  });

  it('poblaciones de la zona y sin zona no hay servicio × zona', () => {
    expect(zoneTowns('Barcelona, Sabadell y el Vallès Occidental')).toEqual(['Barcelona', 'Sabadell', 'Vallès Occidental']);
    expect(buildSeed({ gscQueries: [], services: ['Fontanería'], zona: null, brand: null, manual: [] })).toEqual([]);
  });

  it('idioma por búsqueda', () => {
    expect(keywordLanguage('reformes de cuines sabadell', ['es', 'ca'])).toBe('ca');
    expect(keywordLanguage('reformas de cocinas sabadell', ['es', 'ca'])).toBe('es');
    expect(keywordLanguage('reformes de cuines', ['es'])).toBe('es');
  });

  it('ubicación: ciudad exacta, si no la región, si no España (aproximada)', () => {
    const list = [
      { name: 'Sabadell,Catalonia,Spain', type: 'City' },
      { name: 'Barcelona,Catalonia,Spain', type: 'City' },
      { name: 'Catalonia,Spain', type: 'Autonomous Community' }
    ];
    expect(pickLocation(['Sabadell'], list)).toEqual({ name: 'Sabadell,Catalonia,Spain', approx: false });
    expect(pickLocation(['Catalonia'], list)).toEqual({ name: 'Catalonia,Spain', approx: true });
    expect(pickLocation(['Pueblo Inventado'], list)).toEqual({ name: 'Spain', approx: true });
  });
});

describe('posiciones: lectura de la SERP', () => {
  const serp = summarizeSerpItems([
    { type: 'local_pack', title: 'CM Ibérica Reformas', url: undefined, is_paid: false },
    { type: 'local_pack', title: 'Otra empresa', url: 'https://otra.com/' },
    { type: 'organic', rank_group: 1, domain: 'otra.com', url: 'https://otra.com/a' },
    { type: 'organic', rank_group: 4, domain: 'www.cm-iberica.net', url: 'https://cm-iberica.net/oficinas/' },
    { type: 'organic', rank_group: 9, domain: 'cm-iberica.net', url: 'https://cm-iberica.net/' },
    { type: 'ai_overview', references: [{ domain: 'cm-iberica.net', url: 'https://cm-iberica.net/' }] },
    { type: 'people_also_ask' }
  ]);

  it('resume posiciones, mapa, IA y características', () => {
    expect(serp.localPack.map((l) => l.title)).toEqual(['CM Ibérica Reformas', 'Otra empresa']);
    expect(serp.aio).toEqual({ present: true, domains: ['cm-iberica.net'] });
    expect(serp.features.sort()).toEqual(['ai_overview', 'local_pack', 'people_also_ask']);
  });

  it('el cliente: mejor posición, todas sus URLs, en el mapa por nombre aunque la ficha no tenga web, y citado por la IA', () => {
    const r = readSerp(serp, 'cm-iberica.net', ['cm', 'iberica']);
    expect(r).toMatchObject({ position: 4, url: 'https://cm-iberica.net/oficinas/', localPack: true, localRank: 1, aio: true, aioCites: true });
    expect(r.clientUrls).toHaveLength(2);
    expect(r.top10).toEqual(['otra.com', 'cm-iberica.net', 'cm-iberica.net']);
  });

  it('las fichas pagadas del mapa no cuentan', () => {
    const paid = summarizeSerpItems([{ type: 'local_pack', title: 'CM Ibérica', is_paid: true }, { type: 'local_pack', title: 'Otra' }]);
    expect(readSerp(paid, 'cm-iberica.net', ['cm', 'iberica']).localRank).toBeNull();
  });
});

describe('posiciones: caídas con margen y cuota', () => {
  const p = (position: number | null, ok = true, localRank: number | null = null, localPack = true): HistoryPoint => ({ position, ok, localRank, localPack });

  it('caída solo si las 2 últimas están fuera y antes estaba dentro; se cierra al volver al 8', () => {
    expect(rankDropState([p(12), p(14), p(5), p(6), p(7)], false)).toBe(true);
    expect(rankDropState([p(12), p(6), p(5), p(6)], false)).toBe(false); // una sola semana fuera: ruido
    expect(rankDropState([p(12), p(null, false), p(5)], false)).toBe(false); // una consulta fallida no cuenta
    expect(rankDropState([p(9), p(12)], true)).toBe(true); // sigue abierta hasta el 8
    expect(rankDropState([p(8), p(12)], true)).toBe(false);
  });

  it('salida del mapa: el mapa sigue, falta 2 veces y antes estaba', () => {
    expect(lostLocalPackState([p(5, true, null), p(5, true, null), p(5, true, 2)], false)).toBe(true);
    expect(lostLocalPackState([p(5, true, null, false), p(5, true, null, false), p(5, true, 2)], false)).toBe(false); // ya no hay mapa
  });

  it('cuota de visibilidad ponderada por volumen', () => {
    const s = visibilityShare(
      [
        { volume: 1000, top10: ['a.com', 'b.com'] },
        { volume: 10, top10: ['b.com', 'a.com'] }
      ],
      ['a.com', 'b.com']
    );
    expect(s.get('a.com')!).toBeGreaterThan(s.get('b.com')!);
  });

  it('los tipos de posiciones no están en la lista de la auditoría y tienen técnica', () => {
    const salud = new Set(SALUD_KINDS.map((k) => k.kind));
    for (const k of POSICIONES_KINDS) {
      expect(salud.has(k.kind)).toBe(false);
      expect(KIND_TECHNIQUE[k.kind], k.kind).toBeTruthy();
    }
  });
});
