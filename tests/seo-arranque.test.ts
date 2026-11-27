// SEO · Análisis inicial con etapas y puertas (docs/PLAN-SEO-JEFE.md, D0): clases de Search Console, conexiones que
// bloquean (solo las imprescindibles, decisión de Enric), «continuar sin esto» y avance etapa a etapa.
import { describe, expect, it } from 'vitest';
import { blockers, connections, evaluate, gscClass, progress, type Facts } from '@/lib/seo/arranque/rules';

const base: Facts = {
  web: { url: 'https://cliente.com', responds: true },
  gsc: 'con_datos',
  monthlyHours: 10,
  analytics: 'conectado',
  ficha: true,
  isLocal: true,
  accesoWeb: true,
  wordpress: 'falta',
  gohighlevel: 'falta',
  skipped: [],
  crawl: 'hecho',
  negocio: { propuesto: true, confirmado: true },
  competidores: 4,
  volumenes: 20,
  posiciones: true,
  temas: 12,
  diagnostico: true,
  planMaestro: 'ninguno'
};

describe('arranque: Search Console', () => {
  const today = new Date('2026-11-27T12:00:00Z');
  it('clasifica sin asignar, sin descargar, nueva, poco tráfico y con datos', () => {
    expect(gscClass({ assigned: false, firstDate: null, lastDate: null, impressions90: 0 }, today)).toBe('sin_asignar');
    expect(gscClass({ assigned: true, firstDate: null, lastDate: null, impressions90: 0 }, today)).toBe('sin_descargar');
    expect(gscClass({ assigned: true, firstDate: '2026-11-10', lastDate: '2026-11-25', impressions90: 50 }, today)).toBe('propiedad_nueva');
    expect(gscClass({ assigned: true, firstDate: '2025-01-01', lastDate: '2026-11-25', impressions90: 120 }, today)).toBe('poco_trafico');
    expect(gscClass({ assigned: true, firstDate: '2025-01-01', lastDate: '2026-11-25', impressions90: 5000 }, today)).toBe('con_datos');
  });
});

describe('arranque: conexiones', () => {
  it('solo bloquean la web, Search Console y las horas; lo demás avisa', () => {
    const rows = connections({ ...base, analytics: 'falta', ficha: false, accesoWeb: false });
    expect(blockers(rows)).toEqual([]);
    const ev = evaluate({ ...base, analytics: 'falta', ficha: false });
    expect(ev[0].status).toBe('hecho');
    expect(ev[0].note).toMatch(/Avisos: Google Analytics 4, Ficha de Google/);
  });
  it('sin horas o sin Search Console, bloqueado con el motivo; un admin puede continuar sin ello', () => {
    const ev = evaluate({ ...base, monthlyHours: null, gsc: 'sin_asignar' });
    expect(ev[0]).toMatchObject({ status: 'bloqueado' });
    expect(ev[0].note).toMatch(/Search Console, Horas/);
    expect(ev[1].status).toBe('pendiente');
    const skipped = evaluate({ ...base, gsc: 'sin_asignar', skipped: ['search_console'] });
    expect(skipped[0].status).toBe('hecho');
  });
  it('Search Console nuevo cuenta como conectado sin datos, no bloquea', () => {
    const rows = connections({ ...base, gsc: 'propiedad_nueva' });
    expect(rows.find((r) => r.key === 'search_console')?.status).toBe('conectado_sin_datos');
    expect(blockers(rows)).toEqual([]);
  });
  it('un negocio no local no necesita ficha', () => {
    expect(connections({ ...base, isLocal: false, ficha: false }).find((r) => r.key === 'ficha')?.status).toBe('no_aplica');
  });
});

describe('arranque: etapas', () => {
  it('avanza en orden y se para donde falta algo', () => {
    const ev = evaluate({ ...base, negocio: { propuesto: true, confirmado: false } });
    expect(ev.map((e) => e.status)).toEqual(['hecho', 'hecho', 'en_curso', 'pendiente', 'pendiente', 'pendiente', 'pendiente', 'pendiente']);
    expect(ev[2].note).toMatch(/confírmalos/);
  });
  it('sin historial de Search Console: datos y mapa «sin datos», el resto sigue', () => {
    const ev = evaluate({ ...base, gsc: 'propiedad_nueva', temas: 0 });
    expect(ev.find((e) => e.key === 'datos')?.status).toBe('sin_datos');
    expect(ev.find((e) => e.key === 'mapa')?.status).toBe('sin_datos');
    expect(ev.find((e) => e.key === 'diagnostico')?.status).toBe('hecho');
  });
  it('progreso', () => {
    const p = progress(evaluate(base));
    expect(p.done).toBe(7);
    expect(p.current?.key).toBe('plan');
  });
});
