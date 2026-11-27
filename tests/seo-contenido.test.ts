// SEO parte 9a (contenido): contenido principal (núcleo) y reglas puras del brief, la nota, el enlazado y el decay.
import { describe, expect, it } from 'vitest';
import { extractMain } from '@/lib/core/crawl-extract';
import { contentDecay, linkSuggestions, questions, recommendedWords, scorePage, subtopics } from '@/lib/seo/contenido/rules';
import { SEO_KINDS } from '@/lib/seo/salud/kinds';
import { KIND_TECHNIQUE } from '@/lib/seo/plan/rules';
import { TECHNIQUE_BY_KEY } from '@/lib/core/techniques';

describe('contenido principal', () => {
  it('sin menú, pie, barra lateral ni cookies', () => {
    const html = `<html><body><header><h2>Menú</h2></header><nav><h2>Servicios</h2></nav><main><h2>Precio de una reforma de cocina</h2><p>${'palabra '.repeat(120)}</p><h3>¿Cuánto tarda?</h3></main><aside><h2>Entradas recientes</h2></aside><div class="cookie-banner"><h2>Usamos cookies</h2></div><footer><h2>Contacto</h2></footer></body></html>`;
    const m = extractMain(html);
    expect(m.h2).toEqual(['Precio de una reforma de cocina']);
    expect(m.h3).toEqual(['¿Cuánto tarda?']);
    expect(m.words).toBeGreaterThanOrEqual(120);
    expect(m.text).not.toContain('Entradas recientes');
  });
});

const comp = (url: string, h2: string[], words = 900) => ({ url, h2, h3: [], words });
describe('brief', () => {
  it('subtemas en 2+ webs, sin las palabras de la búsqueda y sin genéricos', () => {
    const s = subtopics(
      [
        comp('https://a.es/x', ['Precio reforma cocina Barcelona', 'Materiales para la encimera', 'Contacto']),
        comp('https://b.es/x', ['Cuánto cuesta reformar la cocina', 'Encimeras: materiales', 'Ventajas de reformar la cocina']),
        comp('https://c.es/x', ['Precios de reforma de cocina', 'Contacto'])
      ],
      'reforma cocina barcelona'
    );
    const labels = s.map((x) => x.label.toLowerCase());
    expect(labels.some((l) => l.includes('precio'))).toBe(true);
    expect(labels.some((l) => l.includes('encimera'))).toBe(true);
    expect(labels.some((l) => l.includes('contacto'))).toBe(false);
    // «Ventajas» solo en una web: no es subtema.
    expect(labels.some((l) => l.includes('ventaja'))).toBe(false);
  });
  it('preguntas y palabras recomendadas', () => {
    expect(questions([comp('https://a.es', ['¿Cuánto cuesta?', 'Cómo elegir caldera', 'Nuestros trabajos'])])).toEqual(['¿Cuánto cuesta?', 'Cómo elegir caldera']);
    expect(recommendedWords([comp('a', [], 800), comp('b', [], 1200), comp('c', [], 4000)])).toBe(1200);
    expect(recommendedWords([comp('a', [], 800)])).toBeNull();
  });
  it('nota: subtemas cubiertos en el texto; rellenar no sube la nota', () => {
    const brief = { query: 'reforma cocina', subtopics: [{ label: 'Precio de la reforma', sites: 3, examples: [] }, { label: 'Materiales de encimera', sites: 2, examples: [] }], words: 1000 };
    const s = scorePage({ title: 'Reforma de cocina en Sabadell', h1: 'Reforma de cocinas', text: 'el precio de cada reforma depende', words: 800 }, brief);
    expect(s.missing).toEqual(['Materiales de encimera']);
    expect(s.score).toBe(65);
    expect(scorePage({ title: 'x', h1: 'y', text: '', words: 100 }, brief).wordsLow).toBe(true);
  });
});

describe('enlazado interno', () => {
  const pages = [
    { url: 'https://w.es/cocinas', title: 'Reformas de cocinas', h1: null, headings: [], ok: true },
    { url: 'https://w.es/blog/ideas-cocina-pequena', title: 'Ideas para reformar una cocina pequeña', h1: null, headings: [], ok: true },
    { url: 'https://w.es/aviso-legal', title: 'Aviso legal cocina', h1: null, headings: [], ok: true },
    { url: 'https://w.es/banos', title: 'Reforma de baños en Sabadell', h1: null, headings: [], ok: true }
  ];
  it('páginas del tema que no enlazan ya, sin legales ni el destino; la zona no cuenta', () => {
    const r = linkSuggestions('https://w.es/cocinas/', 'reforma cocina sabadell', ['Sabadell'], pages, new Set(), false, new Map(), ['reforma de cocina']);
    expect(r.map((x) => x.from)).toEqual(['https://w.es/blog/ideas-cocina-pequena']);
    expect(linkSuggestions('https://w.es/cocinas', 'reforma cocina', [], pages, new Set(['https://w.es/blog/ideas-cocina-pequena']), false, new Map(), [])).toHaveLength(0);
    // Si casi todas enlazan (menú), no cuenta como «ya enlaza».
    expect(linkSuggestions('https://w.es/cocinas', 'reforma cocina', [], pages, new Set(['https://w.es/blog/ideas-cocina-pequena']), true, new Map(), [])).toHaveLength(1);
  });
});

describe('contenido que pierde tráfico', () => {
  it('caída a 90 días, sin temporada; causa probable', () => {
    const f = contentDecay([
      { url: 'https://w.es/a', cur: 40, prev: 100, yoy: 110, posCur: 9, posPrev: 4, impCur: 2000, impPrev: 2100 },
      { url: 'https://w.es/b', cur: 40, prev: 100, yoy: 45, posCur: 4, posPrev: 4, impCur: 1000, impPrev: 2000 },
      { url: 'https://w.es/c', cur: 10, prev: 20, yoy: null, posCur: 5, posPrev: 5, impCur: 100, impPrev: 100 },
      { url: 'https://w.es/d', cur: 50, prev: 100, yoy: null, posCur: 5, posPrev: 5, impCur: 1000, impPrev: 1000 }
    ]);
    expect(f.map((x) => x.url)).toEqual(['https://w.es/a', 'https://w.es/d']);
    expect((f[0].evidence as { causa: string }).causa).toBe('posicion');
    expect((f[1].evidence as { causa: string }).causa).toBe('ctr');
    expect(f[1].severity).toBe('info');
  });
  it('el tipo existe y tiene técnica', () => {
    expect(SEO_KINDS.some((k) => k.kind === 'seo.content_decay')).toBe(true);
    expect(TECHNIQUE_BY_KEY.has(KIND_TECHNIQUE['seo.content_decay'])).toBe(true);
  });
});
