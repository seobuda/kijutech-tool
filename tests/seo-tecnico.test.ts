// SEO parte 1 · técnico completo (26 nov 2026; docs/DISENO-SEO-PARTE1.md): reglas puras nuevas de la auditoría.
import { describe, expect, it } from 'vitest';
import { genericAnchors, hreflangIssues, isGenericAnchor, langMissing, pageRegressions, redirectLoops, type TecnicoPage } from '@/lib/seo/salud/audit-rules-tecnico';
import { labFindings, labSyncSet, representativeUrls } from '@/lib/seo/vigilancia/rules';
import { summarizeLighthouse } from '@/lib/agentes/integrations';
import { SALUD_KINDS, SEO_KINDS } from '@/lib/seo/salud/kinds';
import { KIND_TECHNIQUE } from '@/lib/seo/plan/rules';

const page = (url: string, extra: Partial<TecnicoPage> = {}): TecnicoPage => ({
  url,
  urlHash: url,
  statusCode: 200,
  redirectTo: null,
  contentType: 'text/html',
  title: `T ${url}`,
  metaDescription: 'd',
  h1: ['h'],
  canonical: null,
  robotsMeta: null,
  xRobots: null,
  wordCount: 500,
  contentHash: url,
  simhash: '0',
  depth: 1,
  inSitemap: true,
  jsonld: null,
  schemaTypes: null,
  imagesWithoutAlt: 0,
  error: null,
  lang: 'es',
  hreflang: null,
  ...extra
});

describe('parte 1: reglas técnicas', () => {
  it('detecta un bucle de redirecciones una sola vez, y no una cadena normal', () => {
    const loop = [page('https://w.com/a', { statusCode: 301, redirectTo: 'https://w.com/b' }), page('https://w.com/b', { statusCode: 301, redirectTo: 'https://w.com/a' })];
    expect(redirectLoops(loop)).toHaveLength(1);
    const chain = [page('https://w.com/a', { statusCode: 301, redirectTo: 'https://w.com/b' }), page('https://w.com/b', { statusCode: 301, redirectTo: 'https://w.com/c' }), page('https://w.com/c')];
    expect(redirectLoops(chain)).toEqual([]);
  });

  it('anchors genéricos: solo si casi todos los enlaces lo son y hay al menos 3', () => {
    expect(isGenericAnchor('Leer más »')).toBe(true);
    expect(isGenericAnchor('Llegir més')).toBe(true);
    expect(isGenericAnchor('')).toBe(true);
    expect(isGenericAnchor('Reformas de cocinas')).toBe(false);
    const pages = [page('/x'), page('/y')];
    const f = genericAnchors(pages, [
      { toHash: '/x', anchor: 'leer más', n: 9 },
      { toHash: '/x', anchor: 'Servicio X', n: 1 },
      { toHash: '/y', anchor: 'aquí', n: 2 },
      { toHash: '/y', anchor: 'Servicio Y', n: 2 }
    ]);
    expect(f.map((x) => x.url)).toEqual(['/x']);
    expect(f[0].value).toBe(90);
  });

  it('hreflang: código no válido, sin vuelta y hacia una página rota', () => {
    const es = page('https://w.com/es/', { hreflang: [{ lang: 'es', url: 'https://w.com/es/' }, { lang: 'ca', url: 'https://w.com/ca/' }, { lang: 'catalan', url: 'https://w.com/ca/' }] });
    const ca = page('https://w.com/ca/', { hreflang: [{ lang: 'ca', url: 'https://w.com/ca/' }] });
    const kinds = hreflangIssues([es, ca]).map((f) => f.kind).sort();
    expect(kinds).toEqual(['seo.hreflang_invalid', 'seo.hreflang_not_reciprocal']);
    const caRota = page('https://w.com/ca/', { statusCode: 404 });
    expect(hreflangIssues([page('https://w.com/es/', { hreflang: [{ lang: 'ca', url: 'https://w.com/ca/' }] }), caRota]).map((f) => f.kind)).toEqual(['seo.hreflang_broken']);
    const ok = page('https://w.com/ca/', { hreflang: [{ lang: 'es', url: 'https://w.com/es/' }] });
    expect(hreflangIssues([page('https://w.com/es/', { hreflang: [{ lang: 'ca', url: 'https://w.com/ca/' }, { lang: 'x-default', url: 'https://w.com/es/' }] }), ok])).toEqual([]);
  });

  it('lang: un solo hallazgo para la web con el recuento', () => {
    const f = langMissing('https://w.com/', [page('/a', { lang: null }), page('/b', { lang: '' }), page('/c')]);
    expect(f).toHaveLength(1);
    expect(f[0].value).toBe(2);
    expect(langMissing('https://w.com/', [page('/c')])).toEqual([]);
  });

  it('regresiones: solo páginas que se han vuelto a pedir y antes eran indexables; nada si el rastreo falló mucho', () => {
    const prev = [page('/a'), page('/b'), page('/c', { robotsMeta: 'noindex' }), page('/d')];
    const cur = [page('/a', { statusCode: 404 }), page('/b', { robotsMeta: 'noindex, follow' }), page('/c', { statusCode: 404 }), page('/e')];
    const f = pageRegressions(cur, prev);
    expect(f.map((x) => `${x.url}:${x.evidence?.now}`)).toEqual(['/a:error 404', '/b:noindex']);
    // «/d» no aparece en el rastreo actual: no se da por desaparecida.
    const caido = [page('/a', { statusCode: 404 }), ...Array.from({ length: 5 }, (_, i) => page(`/z${i}`, { statusCode: null, error: 'timeout' }))];
    expect(pageRegressions(caido, prev)).toEqual([]);
  });

  it('laboratorio (Lighthouse): resumen de auditorías y hallazgos', () => {
    const lab = summarizeLighthouse({
      categories: { performance: { score: 0.42 } },
      audits: {
        viewport: { score: 0 },
        'is-on-https': { score: 0, details: { items: [{ url: 'http://w.com/a.jpg' }] } },
        'unsized-images': { score: 0, details: { items: [{}, {}, {}, {}] } },
        'uses-optimized-images': { score: 0, details: { overallSavingsBytes: 200 * 1024 } },
        'modern-image-formats': { score: 0, details: { overallSavingsBytes: 100 * 1024 } },
        'total-byte-weight': { score: 0, numericValue: 3 * 1024 * 1024 }
      }
    });
    expect(lab).toMatchObject({ score: 42, viewportOk: false, httpsOk: false, unsizedImages: 4, imageSavingsKb: 300, totalKb: 3072, imagesKnown: true });
    const f = labFindings([{ url: 'https://w.com/', ...lab }]);
    expect(f.map((x) => x.kind).sort()).toEqual(['seo.images_heavy', 'seo.images_unsized', 'seo.mixed_content', 'seo.viewport_missing']);
    expect(labFindings([{ url: 'https://w.com/', ...summarizeLighthouse({ audits: { viewport: { score: 1 }, 'is-on-https': { score: 1 } } }) }])).toEqual([]);
    expect(representativeUrls('https://w.com/', ['https://w.com/blog/a', 'https://w.com/blog/b', 'https://w.com/servicios/x'], 3)).toEqual(['https://w.com/', 'https://w.com/blog/a', 'https://w.com/servicios/x']);
  });

  it('los tipos de la auditoría están en SALUD_KINDS (si no, la auditoría nunca los resolvería)', () => {
    const salud = new Set(SALUD_KINDS.map((k) => k.kind));
    for (const k of ['seo.page_regressed', 'seo.redirect_loop', 'seo.anchor_generic', 'seo.hreflang_invalid', 'seo.hreflang_not_reciprocal', 'seo.hreflang_broken', 'seo.lang_missing']) expect(salud.has(k), k).toBe(true);
  });

  it('regresiones: un 403/429/503 (cortafuegos) no es una página rota', () => {
    const prev = [page('/a'), page('/b'), page('/c'), page('/d'), page('/e'), page('/f')];
    expect(pageRegressions([page('/a', { statusCode: 403 }), page('/b'), page('/c'), page('/d'), page('/e'), page('/f')], prev)).toEqual([]);
    expect(pageRegressions(prev.map((p) => ({ ...p, statusCode: 429 })), prev)).toEqual([]);
  });

  it('Lighthouse nuevo (insights) y sin auditorías de imágenes', () => {
    const nuevo = summarizeLighthouse({ audits: { 'image-delivery-insight': { score: 0, details: { items: [{ wastedBytes: 100 * 1024 }, { wastedBytes: 80 * 1024 }] } } } });
    expect(nuevo).toMatchObject({ imageSavingsKb: 180, imagesKnown: true });
    const sin = summarizeLighthouse({ audits: { viewport: { score: 1 } } });
    expect(sin.imagesKnown).toBe(false);
    expect(labFindings([{ url: 'https://w.com/', ...sin, imageSavingsKb: 999, unsizedImages: 9 }])).toEqual([]);
  });

  it('laboratorio: solo se resuelve lo de las páginas medidas', () => {
    const open = [
      { kind: 'seo.viewport_missing', dedupeKey: 'seo.viewport_missing:https://w.com/a', url: 'https://w.com/a', value: null, evidence: {} },
      { kind: 'seo.viewport_missing', dedupeKey: 'seo.viewport_missing:https://w.com/b', url: 'https://w.com/b', value: null, evidence: {} }
    ];
    // «a» se midió y ya está bien (no viene en lo nuevo): se resuelve; «b» falló: se conserva.
    const set = labSyncSet([], new Set(['https://w.com/a']), open);
    expect(set.map((f) => f.url)).toEqual(['https://w.com/b']);
    expect(representativeUrls('https://w.com/', ['https://w.com/x'], 3, ['https://w.com/b'])).toEqual(['https://w.com/b', 'https://w.com/', 'https://w.com/x']);
  });

  it('cada tipo de SEO tiene técnica en el plan', () => {
    for (const k of SEO_KINDS) expect(KIND_TECHNIQUE[k.kind], k.kind).toBeTruthy();
  });
});
