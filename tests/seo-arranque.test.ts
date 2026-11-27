// SEO · Análisis inicial (docs/PLAN-SEO-JEFE.md, D0, con la auditoría Opus): clases de Search Console, conexiones que
// bloquean (solo las imprescindibles), dependencias reales entre etapas, estados de error y de espera, «continuar sin esto».
import { describe, expect, it } from 'vitest';
import { actionsFor, blockers, connections, evaluate, gscClass, progress, type Facts } from '@/lib/seo/arranque/rules';

const base: Facts = {
  web: { url: 'https://cliente.com' },
  gsc: 'con_datos',
  monthlyHours: 10,
  analytics: true,
  isLocal: true,
  ficha: true,
  accesoWeb: true,
  dataforseo: true,
  budgetOk: true,
  wordpress: 'falta',
  gohighlevel: 'falta',
  crawl: 'reciente',
  crawlError: null,
  negocio: { propuesto: true, confirmado: true },
  competidores: { confirmados: 4, propuestos: 4 },
  volumenes: 20,
  temas: 12,
  planMaestro: 'ninguno',
  skipped: []
};
const st = (f: Facts) => Object.fromEntries(evaluate(f).map((r) => [r.key, r.status]));

describe('arranque: Search Console', () => {
  const today = new Date('2026-11-27T12:00:00Z');
  const g = { assigned: true, status: 'activa', lastDate: '2026-11-25', backfillDone: true, firstImpressionDate: '2025-01-01', impressions90: 5000 };
  it('clasifica con la descarga terminada y el primer día con impresiones', () => {
    expect(gscClass({ ...g, assigned: false }, today)).toBe('sin_asignar');
    expect(gscClass({ ...g, status: 'error' }, today)).toBe('error');
    expect(gscClass({ ...g, backfillDone: false }, today)).toBe('sin_descargar');
    expect(gscClass({ ...g, firstImpressionDate: '2026-11-10' }, today)).toBe('propiedad_nueva');
    expect(gscClass({ ...g, impressions90: 120 }, today)).toBe('poco_trafico');
    expect(gscClass(g, today)).toBe('con_datos');
  });
});

describe('arranque: conexiones', () => {
  it('solo bloquean web, Search Console y horas; lo demás avisa', () => {
    expect(blockers(connections({ ...base, analytics: false, ficha: false, accesoWeb: false }))).toEqual([]);
    const ev = evaluate({ ...base, analytics: false, ficha: false });
    expect(ev[0].status).toBe('hecho');
    expect(ev[0].note).toMatch(/Avisos: Google Analytics 4, Ficha de Google/);
  });
  it('sin horas o con Search Console sin permiso, bloqueado; un admin puede continuar sin ello', () => {
    const ev = evaluate({ ...base, monthlyHours: null, gsc: 'error' });
    expect(ev[0]).toMatchObject({ status: 'bloqueado', who: 'admin' });
    expect(ev[0].note).toMatch(/Search Console, Horas/);
    expect(st({ ...base, gsc: 'sin_asignar', skipped: ['conn:search_console'] }).conexiones).toBe('hecho');
  });
  it('un negocio no local no necesita ficha', () => {
    expect(connections({ ...base, isLocal: false, ficha: false }).find((r) => r.key === 'ficha')?.status).toBe('no_aplica');
  });
});

describe('arranque: dependencias reales (auditoría, grave 1)', () => {
  it('sin historial de Search Console: datos y mapa «sin datos» y el mercado sigue (no se atasca)', () => {
    const s = st({ ...base, gsc: 'propiedad_nueva', temas: 0 });
    expect(s.datos).toBe('sin_datos');
    expect(s.mapa).toBe('sin_datos');
    expect(s.mercado).toBe('hecho');
    expect(s.diagnostico).toBe('hecho');
  });
  it('el mercado espera al negocio confirmado, no a Search Console', () => {
    const s = st({ ...base, gsc: 'sin_descargar', negocio: { propuesto: true, confirmado: false } });
    expect(s.negocio).toBe('esperando_persona');
    expect(s.mercado).toBe('pendiente');
    expect(s.datos).toBe('en_curso');
  });
});

describe('arranque: error y espera (auditoría, grave 2)', () => {
  it('rastreo fallido, sin DataForSEO, sin presupuesto y competencia por confirmar', () => {
    expect(st({ ...base, crawl: 'error', crawlError: '403' }).web).toBe('error');
    expect(st({ ...base, dataforseo: false }).mercado).toBe('esperando_persona');
    expect(st({ ...base, budgetOk: false }).mercado).toBe('error');
    const e = evaluate({ ...base, competidores: { confirmados: 1, propuestos: 4 } }).find((r) => r.key === 'mercado')!;
    expect(e.status).toBe('esperando_persona');
    expect(e.note).toMatch(/3 competidor/);
  });
  it('un admin puede continuar sin una etapa', () => {
    expect(st({ ...base, competidores: { confirmados: 1, propuestos: 1 }, skipped: ['stage:mercado'] }).mercado).toBe('omitido');
  });
});

describe('arranque: revisor', () => {
  it('3 intentos sin resultado → espera a una persona', () => {
    const f = { ...base, competidores: { confirmados: 0, propuestos: 0 }, volumenes: 0, exhausted: ['competencia'] };
    const r = evaluate(f).find((x) => x.key === 'mercado')!;
    expect(r.status).toBe('esperando_persona');
    expect(r.note).toMatch(/3 veces/);
  });
  it('con la web omitida, la propuesta del negocio no espera al rastreo', () => {
    const f = { ...base, crawl: 'error' as const, negocio: { propuesto: false, confirmado: false }, skipped: ['stage:web'] };
    expect(actionsFor(evaluate(f), f)).toContain('propuesta_negocio');
  });
});

describe('arranque: acciones y progreso', () => {
  it('no se vuelve a rastrear con un rastreo reciente; se empuja lo que toca', () => {
    expect(actionsFor(evaluate({ ...base }), base)).toEqual([]);
    expect(actionsFor(evaluate({ ...base, crawl: 'antiguo' }), { ...base, crawl: 'antiguo' })).toContain('rastreo');
    const f = { ...base, competidores: { confirmados: 0, propuestos: 0 }, volumenes: 0 };
    expect(actionsFor(evaluate(f), f)).toEqual(['competencia', 'demanda', 'posiciones']);
  });
  it('progreso y quién tiene que hacer algo', () => {
    const p = progress(evaluate({ ...base, negocio: { propuesto: true, confirmado: false } }));
    expect(p.current?.key).toBe('negocio');
    expect(p.needsPerson.map((r) => r.key)).toEqual(['negocio']);
  });
});
