// SEO parte 6, tanda 6a (técnico 2b): reglas puras nuevas.
import { describe, expect, it } from 'vitest';
import { extractPage } from '@/lib/core/crawl-extract';
import { detectTech, internalNofollow, isStagingUrl, schemaPhoneInconsistent, seoPluginsConflict, soft404Pages, soft404Site, stagingLeftovers } from '@/lib/seo/salud/audit-rules-2b';
import { isIndexable, type AuditPage } from '@/lib/seo/salud/audit-rules';
import { hackedPages, hackedQueries, isSpamText, siteLanguages } from '@/lib/seo/vigilancia/hackeo-rules';
import { SEO_KINDS } from '@/lib/seo/salud/kinds';
import { KIND_TECHNIQUE } from '@/lib/seo/plan/rules';
import { TECHNIQUE_BY_KEY } from '@/lib/core/techniques';

const page = (url: string, over: Partial<AuditPage & { facts: unknown; hreflang: unknown }> = {}): AuditPage & { facts?: never } =>
  ({
    url,
    urlHash: url,
    statusCode: 200,
    redirectTo: null,
    contentType: 'text/html',
    title: 'Título',
    metaDescription: null,
    h1: ['H1'],
    canonical: null,
    robotsMeta: null,
    xRobots: null,
    wordCount: 500,
    contentHash: null,
    simhash: null,
    depth: 1,
    inSitemap: false,
    jsonld: null,
    schemaTypes: null,
    imagesWithoutAlt: 0,
    error: null,
    ...over
  }) as never;

describe('extracción: generator y firmas', () => {
  it('lee el generator y la firma de Yoast y Rank Math', () => {
    const html = '<html><head><meta name="generator" content="WordPress 6.6.2"><!-- This site is optimized with the Yoast SEO plugin v23 --><script type="application/ld+json" class="rank-math-schema">{"@type":"Organization"}</script></head><body>hola</body></html>';
    const p = extractPage(html, 'https://w.es/');
    expect(p.generator).toBe('WordPress 6.6.2');
    expect(p.signatures.sort()).toEqual(['rankmath', 'yoast']);
  });
});

describe('soft 404', () => {
  it('por página: solo frases completas y con poco texto', () => {
    const f = soft404Pages([page('https://w.es/a', { title: 'Página no encontrada – W', wordCount: 80 }), page('https://w.es/peugeot-404', { title: 'Peugeot 404 de 1965', wordCount: 80 }), page('https://w.es/b', { h1: ["No s'ha trobat la pàgina"], wordCount: 50 })]);
    expect(f).toHaveLength(1);
    expect((f[0].evidence as { urls: string[] }).urls).toEqual(['https://w.es/a', 'https://w.es/b']);
  });
  it('de la web: 200 o redirección a la portada; errores = no se sabe', () => {
    expect(soft404Site('https://w.es/', [{ url: 'https://w.es/x', status: 404, location: null, error: null }])).toEqual([]);
    expect(soft404Site('https://w.es/', [{ url: 'https://w.es/x', status: 200, location: null, error: null }])).toHaveLength(1);
    expect(soft404Site('https://w.es/', [{ url: 'https://w.es/x', status: 301, location: 'https://w.es/', error: null }])).toHaveLength(1);
    expect(soft404Site('https://w.es/', [{ url: 'https://w.es/x', status: 403, location: null, error: null }])).toBeNull();
    expect(soft404Site('https://w.es/', [{ url: 'https://w.es/x', status: 0, location: null, error: 'timeout' }])).toBeNull();
    expect(soft404Site('https://w.es/', [{ url: 'http://w.es/x', status: 301, location: 'https://w.es/x', error: null }])).toBeNull();
  });
});

describe('staging', () => {
  it('reconoce staging y no la web real', () => {
    expect(isStagingUrl('https://staging.w.es/a', 'https://www.w.es/')).toBe(true);
    expect(isStagingUrl('https://staging2.w.es/a', 'https://w.es/')).toBe(true);
    expect(isStagingUrl('http://localhost:8080/a', 'https://w.es/')).toBe(true);
    expect(isStagingUrl('https://w.es/wp-staging/a', 'https://w.es/')).toBe(true);
    expect(isStagingUrl('https://misitio.kinsta.cloud/', 'https://w.es/')).toBe(true);
    expect(isStagingUrl('https://staging.otra.es/', 'https://w.es/')).toBe(false);
    expect(isStagingUrl('https://www.w.es/servicios', 'https://w.es/')).toBe(false);
    expect(isStagingUrl('https://www.wpengine.com/blog', 'https://w.es/')).toBe(false);
  });
  it('mira enlaces, recursos, canonical y JSON-LD', () => {
    const f = stagingLeftovers('https://w.es/', [
      page('https://w.es/', { facts: { ext: ['https://dev.w.es/contacto'], res: [] } }),
      page('https://w.es/b', { jsonld: { '@type': 'Organization', url: 'https://w.wpcomstaging.com/' } })
    ] as never);
    expect(f).toHaveLength(1);
    expect(f[0].value).toBe(2);
  });
});

describe('nofollow interno', () => {
  it('cuenta páginas indexables, no las legales', () => {
    const pages = [page('https://w.es/servicios'), page('https://w.es/aviso-legal'), page('https://w.es/x', { robotsMeta: 'noindex' }), page('https://w.es/asesoria-legal-empresas')];
    const m = new Map([
      ['https://w.es/servicios', 3],
      ['https://w.es/aviso-legal', 20],
      ['https://w.es/x', 2],
      ['https://w.es/asesoria-legal-empresas', 1]
    ]);
    const f = internalNofollow(pages, m, isIndexable);
    expect(f).toHaveLength(1);
    expect(f[0].value).toBe(2);
  });
});

describe('teléfonos distintos en el schema', () => {
  const org = (tel: string) => ({ '@type': 'LocalBusiness', name: 'W', telephone: tel });
  it('avisa con una sede y teléfonos distintos; no con varias sedes', () => {
    const pages = [page('https://w.es/', { jsonld: org('+34 938 12 34 56') }), page('https://w.es/b', { jsonld: org('938123456') }), page('https://w.es/c', { jsonld: org('600 11 22 33') })];
    expect(schemaPhoneInconsistent(pages, false)).toHaveLength(1);
    expect(schemaPhoneInconsistent(pages.slice(0, 2), false)).toHaveLength(0);
    expect(schemaPhoneInconsistent(pages, true)).toHaveLength(0);
  });
});

describe('tecnología y plugins de SEO', () => {
  it('WordPress, tema, plugins y conflicto de SEO', () => {
    const t = detectTech([
      { facts: { gen: 'WordPress 6.6', res: ['https://w.es/wp-content/themes/astra/style.css', 'https://w.es/wp-content/plugins/elementor/a.js', 'https://w.es/wp-content/plugins/wordpress-seo/x.css'], sig: ['rankmath'] } }
    ]);
    expect(t.cms).toBe('WordPress');
    expect(t.version).toBe('6.6');
    expect(detectTech([{ facts: { gen: 'Elementor 3.18', res: ['https://w.es/wp-content/plugins/elementor/a.js'] } }]).version).toBeNull();
    expect(t.theme).toBe('astra');
    expect(t.plugins).toContain('elementor');
    expect(t.seoPlugins).toEqual(['rankmath', 'yoast']);
    expect(seoPluginsConflict('https://w.es/', t)).toHaveLength(1);
    expect(seoPluginsConflict('https://w.es/', { ...t, seoPlugins: ['yoast'] })).toHaveLength(0);
  });
});

describe('hackeo', () => {
  const es = new Set(['es', 'ca']);
  it('lista estrecha con límites de palabra', () => {
    expect(isSpamText('cialis 20mg precio', es)).toBe(true);
    expect(isSpamText('rolex replica barato', es)).toBe(true);
    expect(isSpamText('ブランド コピー', es)).toBe(true);
    expect(isSpamText('ford escort segunda mano', es)).toBe(false);
    expect(isSpamText('xxx edició festa major', es)).toBe(false);
    expect(isSpamText('réplica de muebles antiguos', es)).toBe(false);
    expect(isSpamText('ブランド', new Set(['ja']))).toBe(false);
  });
  it('idiomas de la web', () => {
    expect([...siteLanguages([{ lang: 'es-ES', hreflang: [{ lang: 'zh-cn' }] }])].sort()).toEqual(['es', 'zh']);
  });
  it('crítico si las URLs no son de la web; aviso si lo son', () => {
    const qs = ['cialis', 'viagra barata', 'kamagra'].map((q) => ({ query: q, impressions: 5, urls: ['https://w.es/farmacia'] }));
    const known = new Set(['https://w.es/farmacia']);
    expect(hackedQueries(qs, es, known)[0].severity).toBe('aviso');
    expect(hackedQueries(qs, es, new Set())[0].severity).toBe('critico');
    expect(hackedQueries(qs.slice(0, 2), es, known)).toHaveLength(0);
    // Sin rastreo completo no se sabe qué es ajeno: aviso.
    expect(hackedQueries(qs, es, null)[0].severity).toBe('aviso');
  });
  it('páginas basura: hacen falta 2', () => {
    expect(hackedPages([{ url: 'https://w.es/cialis-online' }], es)).toHaveLength(0);
    expect(hackedPages([{ url: 'https://w.es/cialis-online' }, { url: 'https://w.es/%E3%83%96%E3%83%A9%E3%83%B3%E3%83%89' }], es)).toHaveLength(1);
  });
});

describe('tipos y técnicas de la parte 6', () => {
  it('cada tipo nuevo existe y tiene técnica', () => {
    for (const k of ['seo.soft_404', 'seo.soft_404_site', 'seo.staging_links', 'seo.internal_nofollow', 'seo.schema_inconsistent', 'seo.seo_plugins_conflict', 'seo.hacked_queries', 'seo.hacked_pages']) {
      expect(SEO_KINDS.some((x) => x.kind === k)).toBe(true);
      expect(TECHNIQUE_BY_KEY.has(KIND_TECHNIQUE[k])).toBe(true);
    }
  });
});
