// SEO parte 5c: reglas puras de teléfonos antiguos, directorios, páginas de zona y páginas puerta.
import { describe, expect, it } from 'vitest';
import { directoriesFor, doorwayCandidates, doorwayGroups, hasTown, jaccard, missingZonePages, oldPhones, ownText, phone9, phoneHits, phoneQuery, shingles, textBlocks } from '@/lib/seo/local/citas-zonas-rules';
import { SEO_KINDS } from '@/lib/seo/salud/kinds';
import { KIND_TECHNIQUE } from '@/lib/seo/plan/rules';
import { TECHNIQUE_BY_KEY } from '@/lib/core/techniques';

describe('teléfonos antiguos', () => {
  it('normaliza a 9 dígitos españoles', () => {
    expect(phone9('+34 938 12 34 56')).toBe('938123456');
    expect(phone9('600-12-34-56')).toBe('600123456');
    expect(phone9('12345')).toBeNull();
    expect(phone9(null)).toBeNull();
  });
  it('la búsqueda lleva los formatos habituales', () => {
    const q = phoneQuery('938123456');
    expect(q).toContain('"938123456"');
    expect(q).toContain('"93 812 34 56"');
    expect(phoneQuery('600123456')).toContain('"600 12 34 56"');
  });
  it('quita el actual y repetidos, como mucho 3', () => {
    expect(oldPhones(['938123456', '+34938123456', '938000000', '600111222', '611222333', '622333444'], '938123456')).toEqual(['938000000', '600111222', '611222333']);
  });
  it('solo cuenta resultados de otras webs con el teléfono en el texto', () => {
    const r = [
      { url: 'https://cliente.es/contacto', domain: 'cliente.es', title: 'Tel 93 800 00 00', description: '' },
      { url: 'https://www.cliente.es/x', domain: 'www.cliente.es', title: '938000000', description: '' },
      { url: 'https://paginasamarillas.es/a', domain: 'paginasamarillas.es', title: 'Clínica', description: 'Llámanos al 938 00 00 00' },
      { url: 'https://otra.es/b', domain: 'otra.es', title: 'Otra cosa', description: 'nada' }
    ];
    expect(phoneHits(r, '938000000', 'cliente.es')).toEqual(['https://paginasamarillas.es/a']);
  });
});

describe('directorios por sector', () => {
  it('añade los del sector a los generales', () => {
    const names = directoriesFor('Clínica dental').map((d) => d.name);
    expect(names).toContain('Doctoralia');
    expect(names).toContain('Páginas Amarillas');
    expect(directoriesFor(null).map((d) => d.name)).not.toContain('Doctoralia');
    expect(directoriesFor('Fontanero').map((d) => d.name)).toContain('Habitissimo');
  });
});

describe('páginas de zona', () => {
  it('población con límites de palabra', () => {
    expect(hasTown('fontanero vic', 'Vic')).toBe(true);
    expect(hasTown('servicio técnico', 'Vic')).toBe(false);
    expect(hasTown('fontanero-sant-cugat', 'Sant Cugat')).toBe(true);
  });
  const pages = [
    { url: 'https://w.es/fontanero-sabadell', title: 'Fontanero en Sabadell', h1: [] },
    { url: 'https://w.es/blog/terrassa-tuberias', title: 'Tuberías en Terrassa', h1: [] }
  ];
  it('solo con demanda, fuera del top 10 y sin página propia (el blog no cuenta)', () => {
    const kws = [
      { keyword: 'fontanero sabadell', volume: 50, impressions: 10, position: 25 },
      { keyword: 'fontanero terrassa', volume: 30, impressions: null, position: null },
      { keyword: 'fontanero rubi', volume: 0, impressions: 0, position: null },
      { keyword: 'fontanero badalona', volume: 40, impressions: 0, position: 4 }
    ];
    expect(missingZonePages(kws, ['Sabadell', 'Terrassa', 'Rubi', 'Badalona'], pages)).toEqual([{ town: 'Terrassa', keyword: 'fontanero terrassa' }]);
  });
});

describe('páginas puerta', () => {
  const body = (town: string) => `<p>Somos fontaneros profesionales en ${town} con más de veinte años de experiencia arreglando fugas, cambiando calderas y reparando tuberías en cualquier vivienda o local de ${town} y alrededores sin compromiso alguno.</p><p>Llámanos y un técnico de ${town} irá a tu casa el mismo día, con presupuesto cerrado antes de empezar, garantía de un año en todas las reparaciones y precios claros sin sorpresas.</p>`;
  const nav = '<nav><p>Inicio Servicios Contacto Blog Quiénes somos</p></nav><footer><p>Fontaneros SL · Todos los derechos reservados 2026</p></footer>';
  it('quita lo común con la portada y tapa la población', () => {
    const home = new Set(textBlocks(`<html>${nav}<p>Bienvenido a la web de los mejores fontaneros</p></html>`));
    const t = ownText(textBlocks(`<html>${nav}${body('Sabadell')}</html>`), home, ['Sabadell']);
    expect(t).not.toContain('sabadell');
    expect(t).toContain('poblacionx');
    expect(t).not.toContain('derechos reservados');
  });
  it('agrupa 3 o más casi iguales y no las distintas', () => {
    const towns = ['Sabadell', 'Terrassa', 'Rubí', 'Badalona'];
    const pages = towns.map((t) => ({ url: `https://w.es/fontanero-${t.toLowerCase()}`, text: ownText(textBlocks(body(t)), new Set(), towns) }));
    pages.push({ url: 'https://w.es/calderas', text: ownText(textBlocks('<p>Instalamos calderas de condensación de todas las marcas con financiación a doce meses, revisión anual incluida y certificado oficial para la comunidad autónoma, además de ayudas públicas disponibles este año.</p>'), new Set(), towns) });
    const g = doorwayGroups(pages);
    expect(g).toHaveLength(1);
    expect(g[0]).toHaveLength(4);
    expect(g[0]).not.toContain('https://w.es/calderas');
  });
  it('dos iguales no son grupo', () => {
    const pages = ['A', 'B'].map((t) => ({ url: `https://w.es/${t}`, text: ownText(textBlocks(body(t)), new Set(), []) }));
    expect(doorwayGroups(pages)).toHaveLength(0);
  });
  it('candidatas por población o por patrón de URL repetido', () => {
    const c = doorwayCandidates(
      [
        { url: 'https://w.es/servicio-mataro', title: 'Servicio' },
        { url: 'https://w.es/servicio-granollers', title: 'Servicio' },
        { url: 'https://w.es/servicio-manresa', title: 'Servicio' },
        { url: 'https://w.es/sobre-nosotros', title: 'Nosotros en Sabadell' },
        { url: 'https://w.es/contacto', title: 'Contacto' }
      ],
      ['Sabadell']
    );
    expect(c.urls).toHaveLength(4);
    expect(c.urls).not.toContain('https://w.es/contacto');
    expect(c.slugTowns).toContain('mataro');
  });
  it('una URL con un % suelto no rompe nada', () => {
    expect(() => doorwayCandidates([{ url: 'https://w.es/ofertas-50%/', title: 'Ofertas' }], ['Sabadell'])).not.toThrow();
    expect(missingZonePages([{ keyword: 'fontanero sabadell', volume: 5, impressions: 0, position: null }], ['Sabadell'], [{ url: 'https://w.es/x-50%', title: null, h1: [] }])).toHaveLength(1);
  });
  it('jaccard básico', () => {
    expect(jaccard(shingles('a b c d'), shingles('a b c d'))).toBe(1);
    expect(jaccard(new Set(), new Set(['x']))).toBe(0);
  });
});

describe('tipos y técnicas de la 5c', () => {
  it('cada tipo nuevo existe y tiene técnica', () => {
    for (const k of ['seo.zone_page_missing', 'seo.old_nap_found', 'seo.doorway_pages']) {
      expect(SEO_KINDS.some((x) => x.kind === k)).toBe(true);
      const t = (KIND_TECHNIQUE as Record<string, string>)[k];
      expect(t).toBeTruthy();
      expect(TECHNIQUE_BY_KEY.has(t)).toBe(true);
    }
  });
});
