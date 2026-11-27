// SEO parte 10 · Autoridad (27 nov 2026; docs/DISENO-SEO-CIERRE.md §B): huecos filtrados y cobertura frente a Search Console.
import { describe, expect, it } from 'vitest';
import { coverageShare, filterGap } from '@/lib/seo/autoridad/rules';
import { SEO_KINDS } from '@/lib/seo/salud/kinds';
import { KIND_TECHNIQUE } from '@/lib/seo/plan/rules';
import { TECHNIQUE_BY_KEY } from '@/lib/core/techniques';

describe('autoridad: huecos', () => {
  it('2 o más competidores, rank 10+, sin directorios, sin repetir, más fuertes primero', () => {
    const g = filterGap(
      [
        { domain: 'www.gremi-tallers.cat', rank: 40, linksTo: ['a.com', 'b.com'] },
        { domain: 'gremi-tallers.cat', rank: 40, linksTo: ['a.com', 'b.com'] },
        { domain: 'facebook.com', rank: 99, linksTo: ['a.com', 'b.com'] },
        { domain: 'diarisabadell.cat', rank: 55, linksTo: ['a.com', 'c.com'] },
        { domain: 'blogbasura.xyz', rank: 3, linksTo: ['a.com', 'b.com'] },
        { domain: 'solo-uno.es', rank: 60, linksTo: ['a.com'] }
      ],
      3
    );
    expect(g.map((x) => x.domain)).toEqual(['diarisabadell.cat', 'gremi-tallers.cat']);
  });
  it('con un solo competidor basta con 1', () => {
    expect(filterGap([{ domain: 'x.es', rank: 20, linksTo: ['a.com'] }], 1)).toHaveLength(1);
  });
});

describe('autoridad: cobertura', () => {
  it('normaliza y cuenta', () => {
    expect(coverageShare(['https://www.A.com/x', 'b.com', 'c.com', 'c.com'], ['a.com', 'c.com', 'z.com'])).toEqual({ share: 2 / 3, found: 2, total: 3 });
    expect(coverageShare([], ['a.com'])).toEqual({ share: null, found: 0, total: 0 });
  });
});

describe('tipos y técnicas de las partes 10 y 11', () => {
  it('cada tipo nuevo existe y tiene técnica del núcleo', () => {
    for (const k of ['seo.link_gap', 'seo.ai_competitor_only']) {
      expect(SEO_KINDS.some((x) => x.kind === k)).toBe(true);
      const t = (KIND_TECHNIQUE as Record<string, string>)[k];
      expect(t).toBeTruthy();
      expect(TECHNIQUE_BY_KEY.has(t)).toBe(true);
    }
  });
});
