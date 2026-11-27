// SEO · Jefe SEO: orden por cómo atiende el negocio y evidencias de la ficha de Google (análisis de Fable 5.2, opción C;
// decisiones de Enric del 27 nov 2026).
import { describe, expect, it } from 'vitest';
import { localEvidence, localProfile, localSignal } from '@/lib/seo/jefe/local-profile';
import { scorePlan, signals, validatePlan } from '@/lib/seo/jefe/plan-rules';
import { gradePlan, planEvalCases } from '@/lib/seo/jefe/plan-eval-cases';

const now = new Date('2026-11-27T12:00:00Z');

describe('Jefe SEO local: perfil', () => {
  it('manda cómo atiende; si no está, la ficha confirmada indica local físico', () => {
    expect(localProfile({ atencion: 'online', businessType: null, hasGoogleProfile: true })).toBe('online');
    expect(localProfile({ atencion: 'domicilio', businessType: null, hasGoogleProfile: false })).toBe('area_servicio');
    expect(localProfile({ atencion: 'ambos', businessType: null, hasGoogleProfile: false })).toBe('area_servicio');
    expect(localProfile({ atencion: 'local', businessType: null, hasGoogleProfile: false })).toBe('local_fisico');
    expect(localProfile({ atencion: null, businessType: 'Organization', hasGoogleProfile: false })).toBe('sin_publico');
    expect(localProfile({ atencion: null, businessType: 'Organization', hasGoogleProfile: true })).toBe('desconocido');
    expect(localProfile({ atencion: null, businessType: null, hasGoogleProfile: true })).toBe('local_fisico');
    expect(localProfile({ atencion: null, businessType: null, hasGoogleProfile: false })).toBe('desconocido');
  });
});

describe('Jefe SEO local: evidencias L:', () => {
  it('sin ficha en un negocio local: L:sin_ficha; en uno online, nada', () => {
    expect(localEvidence({ profile: 'area_servicio', snapshot: null, reviews: null, grids: [], napOpen: null, now }).map((e) => e.id)).toEqual(['L:sin_ficha', 'L:nap']);
    expect(localEvidence({ profile: 'online', snapshot: null, reviews: null, grids: [], napOpen: null, now })).toEqual([]);
  });
  it('lo no medido dice «sin medir», nunca 0', () => {
    const ev = localEvidence({
      profile: 'local_fisico',
      snapshot: { cid: '9', title: 'X', category: null, additional: 0, hasHours: false, status: null, isClaimed: null, rating: null, votes: null, takenAt: '2026-11-20T00:00:00Z' },
      reviews: { behind: false, medianVotes: null, medianRating: null, stalled: false, newVotes90: null },
      grids: [],
      napOpen: null,
      now
    });
    const ficha = ev.find((e) => e.id === 'L:ficha:9')!;
    expect(ficha.data.reclamada).toBe('sin medir');
    expect(ficha.data.fotoDias).toBe(8);
    expect(ev.find((e) => e.id === 'L:resenas:9')!.data.porDetras).toMatch(/sin medir/);
    expect(ev.find((e) => e.id === 'L:nap')!.data.incoherencias).toBe('sin medir');
  });
  it('la señal local sube con ficha sin reclamar, reseñas por detrás y mapa flojo', () => {
    const s = localSignal([
      { id: 'L:ficha:1', type: 'L', label: '', data: { reclamada: 'no', categoria: 'x', categoriasExtra: 1, horario: 'sí' } },
      { id: 'L:resenas:1', type: 'L', label: '', data: { porDetras: 'sí', paradas: 'no' } },
      { id: 'L:mapa:x', type: 'L', label: '', data: { top3Pct: 10 } }
    ]);
    expect(s).toEqual({ signal: 7, reviewsNeedWork: true, basicsMissing: true });
  });
});

const caseOf = (k: string) => planEvalCases().find((c) => c.key === k)!;
const ctxOf = (c: ReturnType<typeof caseOf>) => ({ evidence: c.evidence, eligible: c.eligible, blocked: c.blocked, horizonMonths: 12, monthlyHours: c.monthlyHours });
const base = { tesis: 'Plan de prueba con una tesis suficientemente larga para pasar.', riesgos: ['x'], lo_que_no_se: ['y'], confianza: 'media' };

describe('Jefe SEO local: puntuador por perfil', () => {
  it('los hallazgos locales cuentan como señal local (antes casi nunca casaban)', () => {
    const sig = signals(new Map([['H:seo.reviews_behind', { id: 'H:seo.reviews_behind', type: 'H', label: '', data: { gravedad: 'aviso' } }], ['H:seo.geogrid_drop', { id: 'H:seo.geogrid_drop', type: 'H', label: '', data: { gravedad: 'importante' } }], ['H:seo.zone_page_missing', { id: 'H:seo.zone_page_missing', type: 'H', label: '', data: { gravedad: 'info' } }]]));
    expect(sig.local).toBe(3);
    expect(sig.servicio_zona).toBe(2);
    expect(sig.rendimiento).toBe(0);
  });
  it('clínica con ficha floja: aprueba si la ficha va en el T1 y avisa si no', () => {
    const c = caseOf('clinica-ficha-floja');
    const good = {
      ...base,
      frentes: [
        { clave: 'local:ficha', tipo: 'local', linea: 'local_ficha_resenas', parametros: { porMes: 2 }, titulo: 'Reseñas y ficha', por_que: 'Va muy por detrás.', evidencias: ['L:resenas:111', 'L:mapa:fisioterapia sabadell'], desde_trimestre: 1, hasta_trimestre: 4, prioridad: 1 },
        { clave: 'contenido:suelo', tipo: 'contenido', linea: 'contenido_cadencia', parametros: { porMes: 1 }, titulo: 'Suelo pélvico', por_que: 'Demanda sin página.', evidencias: ['Q:fisioterapia suelo pelvico sabadell', 'T:suelo_pelvico'], desde_trimestre: 2, hasta_trimestre: 3, prioridad: 2 }
      ]
    };
    expect(gradePlan(good, c).every((x) => x.pass)).toBe(true);
    const bad = { ...good, frentes: [{ ...good.frentes[1], desde_trimestre: 1, prioridad: 1 }] };
    const v = validatePlan(bad, ctxOf(c));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const s = scorePlan(v.plan, c.evidence, 'local_fisico');
    expect(s.divergences.join(' ')).toMatch(/ficha de Google en el primer trimestre/);
    expect(gradePlan(bad, c).find((x) => x.name === 'empieza por local')?.pass).toBe(false);
  });
  it('tienda online: la ficha en el T1 suspende', () => {
    const c = caseOf('tienda-online');
    const plan = {
      ...base,
      frentes: [
        { clave: 'existente:recambios', tipo: 'existente', linea: 'refuerzo_al_alcance', parametros: { porMes: 2 }, titulo: 'Empujar recambios', por_que: 'Cerca del top.', evidencias: ['Q:recambios moto online', 'Q:pastillas freno moto'], desde_trimestre: 1, hasta_trimestre: 2, prioridad: 1 },
        { clave: 'local:ficha', tipo: 'local', linea: null, titulo: 'Crear ficha', por_que: 'x', evidencias: ['H:seo.title_missing'], desde_trimestre: 1, hasta_trimestre: 1, prioridad: 1 }
      ]
    };
    expect(gradePlan(plan, c).find((x) => x.name === 'no empieza por local')?.pass).toBe(false);
    expect(gradePlan({ ...plan, frentes: [plan.frentes[0]] }, c).every((x) => x.pass)).toBe(true);
  });
  it('ficha fuerte: la campaña de reseñas sin datos que la pidan se avisa y suspende', () => {
    const c = caseOf('local-ficha-fuerte');
    const plan = {
      ...base,
      frentes: [
        { clave: 'existente:optica', tipo: 'existente', linea: 'refuerzo_al_alcance', parametros: { porMes: 2 }, titulo: 'Empujar óptica', por_que: 'Cerca del top.', evidencias: ['Q:optica terrassa', 'Q:lentillas terrassa'], desde_trimestre: 1, hasta_trimestre: 2, prioridad: 1 },
        { clave: 'local:mantener', tipo: 'local', linea: null, titulo: 'Revisar categorías y servicios de la ficha', por_que: 'Básico.', evidencias: ['L:ficha:222', 'L:nap'], desde_trimestre: 1, hasta_trimestre: 1, prioridad: 3 }
      ]
    };
    expect(gradePlan(plan, c).every((x) => x.pass)).toBe(true);
    const withReviews = { ...plan, frentes: [...plan.frentes, { clave: 'local:resenas', tipo: 'local', linea: 'local_ficha_resenas', titulo: 'Campaña de reseñas', por_que: 'x', evidencias: ['L:resenas:222'], desde_trimestre: 2, hasta_trimestre: 4, prioridad: 2 }] };
    expect(gradePlan(withReviews, c).find((x) => x.name === 'sin la línea local_ficha_resenas')?.pass).toBe(false);
  });
  it('reformas a domicilio sin ficha: frente local sin línea en el T1', () => {
    const c = caseOf('reformas-domicilio-sin-ficha');
    const plan = {
      ...base,
      frentes: [
        { clave: 'local:reclamar', tipo: 'local', linea: null, titulo: 'Identificar o reclamar la ficha de Google', por_que: 'No hay ficha.', evidencias: ['L:sin_ficha', 'L:nap'], desde_trimestre: 1, hasta_trimestre: 1, prioridad: 1 },
        { clave: 'servicio_zona:poblaciones', tipo: 'servicio_zona', linea: 'paginas_servicio_zona', titulo: 'Páginas de población', por_que: 'Búsquedas sin página.', evidencias: ['H:seo.zone_page_missing', 'Q:reformas sant cugat'], desde_trimestre: 1, hasta_trimestre: 2, prioridad: 2 }
      ]
    };
    expect(gradePlan(plan, c).every((x) => x.pass)).toBe(true);
  });
});
