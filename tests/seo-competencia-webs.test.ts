// SEO · Comparación de webs con la competencia (Hito 2, 24 nov 2026): reglas puras.
import { describe, expect, it } from 'vitest';
import { canonicalSchemaType, compareSites, gapQueries, ownPositions, siteProfile, type CrawledPage } from '@/lib/seo/competencia/compare';
import type { SerpResult } from '@/lib/core/capabilities';

const page = (url: string, extra: Partial<CrawledPage> = {}): CrawledPage => ({
  url,
  statusCode: 200,
  title: null,
  h1: null,
  robotsMeta: null,
  canonical: null,
  wordCount: 500,
  schemaTypes: null,
  fetchMs: 300,
  ...extra
});
const SERVICES = ['Limpieza de oficinas', 'Limpieza de cristales'];

describe('competencia: perfil de una web', () => {
  it('servicio con página propia (URL, título o H1); las no indexables no cuentan', () => {
    const p = siteProfile('www.rival.es', [
      page('https://rival.es/limpieza-oficinas/'),
      page('https://rival.es/cristales', { title: 'Limpieza de cristales en Barcelona', robotsMeta: 'noindex' }),
      page('https://rival.es/contacto', { statusCode: 404 })
    ], SERVICES);
    expect(p.domain).toBe('rival.es');
    expect(p.pages).toBe(1);
    expect(p.services['Limpieza de oficinas']).toBe('https://rival.es/limpieza-oficinas/');
    expect(p.services['Limpieza de cristales']).toBeNull();
  });

  it('una etiqueta o categoría del blog no es la página del servicio', () => {
    const p = siteProfile('rival.es', [page('https://rival.es/tag/limpieza-de-oficinas/'), page('https://rival.es/category/limpieza-cristales/')], SERVICES);
    expect(Object.values(p.services)).toEqual([null, null]);
  });

  it('los subtipos de LocalBusiness cuentan como LocalBusiness', () => {
    expect(canonicalSchemaType('Plumber')).toBe('LocalBusiness');
    expect(canonicalSchemaType('HomeAndConstructionBusiness')).toBe('LocalBusiness');
    expect(canonicalSchemaType('Organization')).toBe('Organization');
    expect(canonicalSchemaType('https://schema.org/FAQPage')).toBe('FAQPage');
  });
});

describe('competencia: conclusiones', () => {
  const client = siteProfile('cliente.es', [page('https://cliente.es/', { fetchMs: 1800, wordCount: 150 })], SERVICES);
  const a = siteProfile('a.es', [page('https://a.es/limpieza-de-cristales', { schemaTypes: ['LocalBusiness', 'FAQPage'], wordCount: 700 })], SERVICES);
  const b = siteProfile('b.es', [page('https://b.es/', { title: 'Limpieza de cristales', schemaTypes: ['Dentist'], wordCount: 900, fetchMs: 400 })], SERVICES);

  it('servicios, datos estructurados, servidor y texto', () => {
    const t = compareSites(client, [a, b]);
    expect(t[0]).toBe('«Limpieza de cristales»: a.es y b.es tienen una página propia y la web del cliente no.');
    expect(t.some((x) => x.startsWith('Datos estructurados LocalBusiness: los usan a.es y b.es'))).toBe(true);
    expect(t.some((x) => x.startsWith('Datos estructurados FAQPage: los usa a.es'))).toBe(true);
    expect(t.some((x) => x.includes('responde más lento') && x.includes('1800 ms'))).toBe(true);
    expect(t.some((x) => x.includes('menos texto'))).toBe(true);
  });

  it('sin rastreo del cliente lo dice; sin competidores rastreados no dice nada', () => {
    expect(compareSites(null, [a])[0]).toContain('Falta el rastreo de la web del cliente');
    expect(compareSites(client, [])).toEqual([]);
  });
});

describe('competencia: huecos', () => {
  const serp = (domains: string[]): SerpResult => ({ organic: domains.map((d, i) => ({ rank: i + 1, domain: d, url: `https://${d}/`, title: d })), localPack: [], costUsd: 0 });
  it('posición del cliente por búsqueda (con o sin www) y búsquedas donde sale el rival y el cliente no', () => {
    const own = ownPositions([
      { query: 'limpieza oficinas barcelona', serp: serp(['a.es', 'www.cliente.es']) },
      { query: 'limpieza cristales barcelona', serp: serp(['a.es', 'b.es']) }
    ], ['cliente.es']);
    expect(own).toEqual({ 'limpieza oficinas barcelona': 2, 'limpieza cristales barcelona': null });
    expect(gapQueries(['limpieza oficinas barcelona', 'limpieza cristales barcelona', 'otra'], own)).toEqual(['limpieza cristales barcelona']);
  });
});
