// SEO parte 6, tanda 6b: registro de cambios entre rastreos y condiciones de las páginas de dinero (reglas puras).
import { describe, expect, it } from 'vitest';
import { canAdvanceBaseline, diffCrawls, inconclusive, moneyCondition, snapDiffs, snapOf, type DiffPage } from '@/lib/seo/cambios/rules';
import { sameUrl } from '@/lib/seo/salud/audit-rules';
import { ownUrl, moneyKey } from '@/lib/seo/cambios/dinero';
import type { MoneySnap } from '@/lib/db/schema';

const pg = (url: string, over: Partial<DiffPage> = {}): DiffPage => ({
  url,
  statusCode: 200,
  contentType: 'text/html',
  title: `T ${url}`,
  metaDescription: 'd',
  h1: ['H'],
  canonical: null,
  robotsMeta: null,
  xRobots: null,
  wordCount: 400,
  simhash: '0000000000000000',
  jsonld: null,
  schemaTypes: null,
  ...over
});

describe('registro de cambios entre rastreos', () => {
  it('título, noindex y altas/bajas', () => {
    const prev = [pg('https://w.es/'), pg('https://w.es/a'), pg('https://w.es/b')];
    const cur = [pg('https://w.es/'), pg('https://w.es/a', { title: 'Nuevo' }), pg('https://w.es/c'), pg('https://w.es/b', { robotsMeta: 'noindex' })];
    const rows = diffCrawls(prev, cur, { prevTruncated: false, curTruncated: false });
    const f = rows.map((r) => `${r.field}:${r.url}`).sort();
    expect(f).toEqual(['indexable:https://w.es/b', 'title:https://w.es/a', 'url_new:https://w.es/c'].sort());
  });
  it('sin altas ni bajas si un rastreo se cortó', () => {
    const rows = diffCrawls([pg('https://w.es/'), pg('https://w.es/x')], [pg('https://w.es/'), pg('https://w.es/y')], { prevTruncated: true, curTruncated: false });
    expect(rows.filter((r) => r.field === 'url_new' || r.field === 'url_gone')).toHaveLength(0);
  });
  it('bloqueos > 20 % = no se compara; una página bloqueada se salta', () => {
    const prev = Array.from({ length: 10 }, (_, i) => pg(`https://w.es/${i}`));
    const cur = prev.map((p, i) => (i < 3 ? { ...p, statusCode: 403 } : p));
    expect(diffCrawls(prev, cur, { prevTruncated: false, curTruncated: false })).toHaveLength(0);
    const cur2 = prev.map((p, i) => (i === 0 ? { ...p, statusCode: 403, title: null } : p));
    expect(diffCrawls(prev, cur2, { prevTruncated: false, curTruncated: false })).toHaveLength(0);
  });
  it('cambio de plantilla: una fila «*» con las URLs, más las importantes', () => {
    const prev = Array.from({ length: 25 }, (_, i) => pg(`https://w.es/p${i}`, { title: `Servicio ${i} | Viejo` }));
    const cur = prev.map((p, i) => ({ ...p, title: `Servicio ${i} - Nuevo` }));
    const rows = diffCrawls(prev, cur, { prevTruncated: false, curTruncated: false, important: new Set(['https://w.es/p3']) });
    expect(rows.filter((r) => r.url === '*')).toHaveLength(1);
    expect((rows.find((r) => r.url === '*')!.extra as { pages: number }).pages).toBe(25);
    expect(rows.filter((r) => r.url === 'https://w.es/p3')).toHaveLength(1);
    expect(rows).toHaveLength(2);
  });
  it('cambio de host (http→https o www): empareja por ruta', () => {
    const prev = [pg('http://w.es/'), pg('http://w.es/a')];
    const cur = [pg('https://www.w.es/'), pg('https://www.w.es/a', { title: 'Otro' })];
    const rows = diffCrawls(prev, cur, { prevTruncated: false, curTruncated: false });
    expect(rows.some((r) => r.field === 'title' && r.url === 'https://www.w.es/a')).toBe(true);
    expect(rows.some((r) => r.field === 'url_new' || r.field === 'url_gone')).toBe(false);
  });
});

const snap = (o: Partial<MoneySnap> = {}): MoneySnap => ({ status: 200, title: 'T', h1: 'H', canonical: null, indexable: true, words: 400, simhash: '0000000000000000', at: '2026-11-27T00:00:00Z', ...o });

describe('páginas de dinero', () => {
  const U = 'https://w.es/servicio';
  it('condiciones relativas a la referencia', () => {
    expect(moneyCondition(snap(), snap({ indexable: false }), false, sameUrl, U)).toBe('noindex');
    expect(moneyCondition(snap({ indexable: false }), snap({ indexable: false }), false, sameUrl, U)).toBeNull();
    expect(moneyCondition(snap(), snap({ status: 404, indexable: false }), false, sameUrl, U)).toBe('estado');
    expect(moneyCondition(snap(), snap({ status: 404 }), true, sameUrl, U)).toBeNull();
    expect(moneyCondition(snap(), snap({ canonical: 'https://w.es/otra' }), false, sameUrl, U)).toBe('canonical');
    expect(moneyCondition(snap(), snap({ canonical: U }), false, sameUrl, U)).toBeNull();
    expect(moneyCondition(snap(), snap({ words: 150 }), false, sameUrl, U)).toBe('contenido');
    expect(moneyCondition(snap(), snap({ title: null }), false, sameUrl, U)).toBe('titulo');
  });
  it('403, 429, 5xx y error de red = no concluyente', () => {
    for (const s of [0, 403, 429, 503]) {
      expect(inconclusive(snap({ status: s }))).toBe(true);
      expect(moneyCondition(snap(), snap({ status: s }), false, sameUrl, U)).toBeNull();
    }
  });
  it('la referencia no avanza con una erosión grande', () => {
    expect(canAdvanceBaseline(snap(), snap({ words: 390 }))).toBe(true);
    expect(canAdvanceBaseline(snap(), snap({ words: 250 }))).toBe(false);
  });
  it('registro: título y texto que persiste', () => {
    expect(snapDiffs(snap(), snap({ title: 'Nuevo' }), null).map((d) => d.field)).toEqual(['title']);
    const stable = snap({ words: 400, simhash: '0000000000000000' });
    const changed = snap({ words: 900, simhash: 'ffff000000000000' });
    // Primera vez que cambia (no persiste todavía): nada; la siguiente, sí.
    expect(snapDiffs(stable, changed, stable).some((d) => d.field === 'content')).toBe(false);
    expect(snapDiffs(changed, changed, stable).some((d) => d.field === 'content')).toBe(true);
  });
  it('foto de una página leída y no leída', () => {
    expect(snapOf(0, null, null, new Date()).indexable).toBe(false);
    expect(snapOf(200, 'noindex', { title: 'T', h1: ['H'], canonical: null, robotsMeta: null, wordCount: 10, simhash: '0' }, new Date()).indexable).toBe(false);
  });
  it('solo páginas de la propia web; clave con versión', () => {
    expect(ownUrl('/contacto', 'https://w.es/')).toBe('https://w.es/contacto');
    expect(ownUrl('https://otra.es/x', 'https://w.es/')).toBeNull();
    expect(ownUrl('http://127.0.0.1/', 'https://w.es/')).toBeNull();
    expect(moneyKey('abcdef0123456789aa', 'noindex', 2)).toBe('seo.money_page_changed:abcdef0123456789:noindex:v2');
  });
});
