// SEO · pendientes de D0 (28 nov 2026): la descarga del histórico de Search Console que no termina se marca como error en
// el análisis inicial (antes se quedaba «descargando» para siempre).
import { describe, expect, it } from 'vitest';
import { evaluate, gscStuck } from '@/lib/seo/arranque/rules';

const now = new Date('2026-11-28T12:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe('D0: descarga de Search Console atascada', () => {
  it('normal: horas o pocos días avanzando; atascada: 5 días o más y sin avanzar en 2', () => {
    expect(gscStuck({ downloading: true, assignedAt: daysAgo(1), lastSyncAt: daysAgo(0.1) }, now)).toBe(false);
    expect(gscStuck({ downloading: true, assignedAt: daysAgo(6), lastSyncAt: daysAgo(0.5) }, now)).toBe(false);
    expect(gscStuck({ downloading: true, assignedAt: daysAgo(6), lastSyncAt: daysAgo(3) }, now)).toBe(true);
    expect(gscStuck({ downloading: true, assignedAt: daysAgo(6), lastSyncAt: null }, now)).toBe(true);
    // Revisor: una propiedad antigua reasignada que sí avanza no está atascada.
    expect(gscStuck({ downloading: true, assignedAt: daysAgo(30), lastSyncAt: daysAgo(0.1) }, now)).toBe(false);
    expect(gscStuck({ downloading: false, assignedAt: daysAgo(30), lastSyncAt: null }, now)).toBe(false);
  });
  it('la etapa de datos pasa a error y espera a un administrador', () => {
    const base = { web: { url: 'https://x.com' }, gsc: 'sin_descargar' as const, monthlyHours: 10, analytics: false, isLocal: false, ficha: false, accesoWeb: false, dataforseo: false, budgetOk: true, wordpress: 'falta' as const, gohighlevel: 'falta' as const, crawl: 'reciente' as const, crawlError: null, negocio: { propuesto: false, confirmado: false }, competidores: { confirmados: 0, propuestos: 0 }, volumenes: 0, temas: 0, planMaestro: 'ninguno' as const, skipped: [] };
    expect(evaluate(base).find((s) => s.key === 'datos')?.status).toBe('en_curso');
    const stuck = evaluate({ ...base, gscStuck: true }).find((s) => s.key === 'datos');
    expect(stuck).toMatchObject({ status: 'error', who: 'admin' });
  });
});
