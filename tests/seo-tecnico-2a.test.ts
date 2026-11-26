// SEO parte 1, técnico 2a (26 nov 2026): petición blindada contra DNS rebinding, robots.txt como Googlebot y rastreadores
// de IA, enlaces rotos hacia otras webs y «cómo verificaremos» en cada intervención.
import { describe, expect, it } from 'vitest';
import { privateIp, publicLookup, publicFetch, fetchPublic } from '@/lib/core/net';
import { aiCrawlerIssues, robotsGoogleIssues, type TecnicoPage } from '@/lib/seo/salud/audit-rules-tecnico';
import { checkOrder, classifyExternal, externalFindings } from '@/lib/seo/salud/externos-rules';
import { verifyPlan } from '@/lib/core/techniques';
import { completeHypothesis } from '@/lib/core/interventions';
import { EXTERNOS_KINDS, SALUD_KINDS } from '@/lib/seo/salud/kinds';
import { KIND_TECHNIQUE } from '@/lib/seo/plan/rules';
import { extractPage } from '@/lib/core/crawl-extract';

const page = (url: string, extra: Partial<TecnicoPage> = {}): TecnicoPage => ({
  url,
  urlHash: url,
  statusCode: 200,
  redirectTo: null,
  contentType: 'text/html',
  title: 't',
  metaDescription: 'd',
  h1: ['h'],
  canonical: null,
  robotsMeta: null,
  xRobots: null,
  wordCount: 300,
  contentHash: url,
  simhash: '0',
  depth: 1,
  inSitemap: false,
  jsonld: null,
  schemaTypes: null,
  imagesWithoutAlt: 0,
  error: null,
  ...extra
});

describe('red blindada (DNS rebinding)', () => {
  it('direcciones privadas, también IPv6 y mapeadas', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.20.0.5', '169.254.169.254', '::1', 'fd00::1', '::ffff:10.0.0.1']) expect(privateIp(ip), ip).toBe(true);
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700::1111']) expect(privateIp(ip), ip).toBe(false);
  });

  it('el lookup del socket rechaza un nombre que resuelve a la red interna', async () => {
    const err = await new Promise<NodeJS.ErrnoException | null>((resolve) => publicLookup('localhost', {}, (e) => resolve(e)));
    expect(err?.code).toBe('EPRIVATEADDR');
  });

  it('publicFetch y fetchPublic no salen a la red interna', async () => {
    await expect(publicFetch('http://127.0.0.1/')).rejects.toThrow(/no permitida/);
    expect(await fetchPublic('http://localhost.localdomain.test/')).toEqual({ error: 'Dirección no permitida (solo webs públicas).' });
  });
});

describe('robots.txt como Googlebot', () => {
  it('CSS/JS de la propia web bloqueados y páginas del sitemap bloqueadas', () => {
    const robots = 'User-agent: *\nDisallow: /wp-content/plugins/\nDisallow: /privado/';
    const pages = [
      page('https://w.com/', { facts: { res: ['https://w.com/wp-content/plugins/x/a.js', 'https://cdn.otro.com/b.js', 'https://w.com/wp-content/themes/t/s.css'] } }),
      page('https://w.com/privado/a', { inSitemap: true })
    ];
    const f = robotsGoogleIssues('https://w.com/', robots, pages);
    expect(f.map((x) => x.kind).sort()).toEqual(['seo.robots_blocks_resources', 'seo.sitemap_blocked']);
    expect(f.find((x) => x.kind === 'seo.robots_blocks_resources')?.value).toBe(1);
    expect(robotsGoogleIssues('https://w.com/', 'User-agent: *\nDisallow:', pages)).toEqual([]);
  });

  it('rastreadores de IA: los de búsqueda son aviso; solo los de entrenamiento, informativo', () => {
    const solo = aiCrawlerIssues('https://w.com/', 'User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow:');
    expect(solo[0].severity).toBe('info');
    expect(solo[0].evidence).toMatchObject({ search: [], training: ['GPTBot'] });
    const busq = aiCrawlerIssues('https://w.com/', 'User-agent: PerplexityBot\nDisallow: /');
    expect(busq[0].severity).toBe('aviso');
    expect(aiCrawlerIssues('https://w.com/', 'User-agent: *\nDisallow: /wp-admin/')).toEqual([]);
  });

  it('el extractor guarda CSS y JS de la página', () => {
    const p = extractPage('<html><head><link rel="stylesheet" href="/a.css"><script src="https://w.com/b.js"></script></head><body>x</body></html>', 'https://w.com/');
    expect(p.resources).toEqual(['https://w.com/a.css', 'https://w.com/b.js']);
  });
});

describe('enlaces rotos hacia otras webs', () => {
  it('solo 404/410 y DNS inexistente son rotos; bloqueos y 5xx no se saben', () => {
    expect(classifyExternal(404, null).state).toBe('roto');
    expect(classifyExternal(200, null).state).toBe('ok');
    expect(classifyExternal(403, null).state).toBe('desconocido');
    expect(classifyExternal(503, null).state).toBe('desconocido');
    expect(classifyExternal(0, 'ENOTFOUND').state).toBe('dns');
    expect(classifyExternal(0, 'timeout').state).toBe('desconocido');
  });

  it('conserva lo no decidido, y un DNS inexistente pasa a aviso en la segunda pasada', () => {
    const results = new Map([
      ['https://a.com/x', { state: 'roto' as const, status: 404 }],
      ['https://b.com/', { state: 'dns' as const, status: 0 }],
      ['https://c.com/', { state: 'desconocido' as const, status: 503 }]
    ]);
    const linked = new Map([
      ['https://a.com/x', ['https://w.com/1', 'https://w.com/2']],
      ['https://b.com/', ['https://w.com/3']],
      ['https://c.com/', ['https://w.com/4']]
    ]);
    const open = [{ kind: 'seo.external_broken', dedupeKey: 'k-c', url: 'https://w.com/4', value: 1, evidence: { target: 'https://c.com/' } }];
    const f = externalFindings(results, linked, new Set(), open);
    expect(f.map((x) => x.evidence?.target ?? '').sort()).toEqual(['https://a.com/x', 'https://b.com/', 'https://c.com/']);
    expect(f.find((x) => x.evidence?.target === 'https://b.com/')?.severity).toBe('info');
    expect(externalFindings(results, linked, new Set(['https://b.com/']), []).find((x) => x.evidence?.target === 'https://b.com/')?.severity).toBe('aviso');
    expect(checkOrder(['https://z.com', 'https://c.com/'], new Set(['https://c.com/']), 'r')[0]).toBe('https://c.com/');
    // Si el enlace ya no está en la web, el hallazgo abierto no se arrastra: se resuelve.
    const quitado = externalFindings(new Map(), new Map(), new Set(), [{ kind: 'seo.external_broken', dedupeKey: 'k', url: 'https://w.com/1', value: 1, severity: 'info', evidence: { target: 'https://x.com/vieja' } }]);
    expect(quitado).toEqual([]);
    const sigue = externalFindings(new Map(), new Map([['https://x.com/vieja', ['https://w.com/1']]]), new Set(), [{ kind: 'seo.external_broken', dedupeKey: 'k', url: 'https://w.com/1', value: 1, severity: 'info', evidence: { target: 'https://x.com/vieja' } }]);
    expect(sigue[0].severity).toBe('info');
  });

  it('los tipos están en listas que se resuelven bien y tienen técnica', () => {
    const salud = new Set(SALUD_KINDS.map((k) => k.kind));
    for (const k of ['seo.robots_blocks_resources', 'seo.sitemap_blocked', 'seo.ai_crawlers_blocked']) expect(salud.has(k), k).toBe(true);
    expect(salud.has('seo.external_broken')).toBe(false);
    expect(EXTERNOS_KINDS.map((k) => k.kind)).toEqual(['seo.external_broken']);
    for (const k of [...SALUD_KINDS, ...EXTERNOS_KINDS]) expect(KIND_TECHNIQUE[k.kind], k.kind).toBeTruthy();
  });
});

describe('cómo verificaremos', () => {
  it('técnico: nueva auditoría; velocidad: medición; contenido: Search Console', () => {
    expect(verifyPlan('canonical_corregido', 'impresiones', 42).check).toBe('reauditoria');
    expect(verifyPlan('imagenes_optimizadas', 'clics', 56).check).toBe('velocidad');
    expect(verifyPlan('optimizar_al_alcance', 'clics', 42)).toMatchObject({ check: 'gsc', checkAfterDays: 42 });
    expect(verifyPlan('canonical_corregido', 'impresiones', 42).how).toMatch(/no concluyente/);
  });
  it('la hipótesis de cada intervención lo lleva', () => {
    expect(completeHypothesis('sitemap_corregido', undefined).verify?.check).toBe('reauditoria');
  });
});
