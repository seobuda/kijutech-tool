// SEO · Jefe SEO, D2 (docs/PLAN-SEO-JEFE.md §4): el código valida el plan de Opus (evidencias, líneas, trimestres, horas) y
// lo puntúa por reglas; el examen del prompt se corrige sin IA.
import { describe, expect, it } from 'vitest';
import { extractJson, scorePlan, validatePlan } from '@/lib/seo/jefe/plan-rules';
import { gradePlan, planEvalCases } from '@/lib/seo/jefe/plan-eval-cases';

const cases = planEvalCases();
const rota = cases.find((c) => c.key === 'web-rota')!;
const ctx = { evidence: rota.evidence, eligible: rota.eligible, blocked: rota.blocked, horizonMonths: 12, monthlyHours: rota.monthlyHours };
const good = {
  tesis: 'Primero quitar lo que impide que Google vea las páginas importantes; después empujar las búsquedas de reformas que ya están cerca del top 3.',
  diagnostico: [{ texto: 'Hay páginas importantes fuera del índice.', evidencias: ['H:seo.noindex_important'] }],
  frentes: [
    { clave: 'rendimiento:indexacion', tipo: 'rendimiento', linea: null, titulo: 'Quitar noindex y arreglar enlaces rotos', por_que: 'Bloquea todo lo demás.', evidencias: ['H:seo.noindex_important', 'H:seo.broken_internal'], desde_trimestre: 1, hasta_trimestre: 1, prioridad: 1 },
    { clave: 'existente:reformas', tipo: 'existente', linea: 'refuerzo_al_alcance', parametros: { porMes: 2 }, titulo: 'Empujar reformas integrales', por_que: 'Está en la 8.', evidencias: ['Q:reformas integrales terrassa', 'Q:reformar baño terrassa'], desde_trimestre: 1, hasta_trimestre: 2, prioridad: 2 },
    { clave: 'local:ficha', tipo: 'local', linea: 'local_ficha_resenas', titulo: 'Ficha de Google', por_que: 'Cuando se confirme.', evidencias: ['H:seo.title_missing'], desde_trimestre: 2, hasta_trimestre: 3, prioridad: 3 }
  ],
  riesgos: ['Que la web tarde en reindexarse'],
  lo_que_no_se: ['Si hay ficha de Google'],
  alternativas_descartadas: [{ opcion: 'Blog semanal', motivo: 'pocas horas' }],
  confianza: 'media'
};

describe('Jefe SEO D2: validación del plan', () => {
  it('extrae el JSON aunque venga entre ```', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('nada')).toBeNull();
  });
  it('un plan bueno pasa; la línea bloqueada en el T1 se mueve al T2 condicionada', () => {
    const early = { ...good, frentes: good.frentes.map((f) => (f.tipo === 'local' ? { ...f, desde_trimestre: 1 } : f)) };
    const v = validatePlan(early, ctx);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.rejectedEvidence).toEqual([]);
    expect(v.warnings.join(' ')).toMatch(/no se puede hacer ahora/);
    const local = v.plan.frentes.find((f) => f.kind === 'local')!;
    expect(local.fromQuarter).toBe(2);
    expect(local.conditional).toMatch(/ficha/);
    expect(v.plan.frentes[0].kind).toBe('rendimiento');
  });
  it('descarta evidencias inventadas y frentes sin respaldo', () => {
    const v = validatePlan({ ...good, frentes: [...good.frentes, { clave: 'contenido:x', tipo: 'contenido', linea: 'contenido_cadencia', titulo: 'Blog', por_que: 'x', evidencias: ['Q:inventada'], desde_trimestre: 2, hasta_trimestre: 4 }] }, ctx);
    expect(v.ok && v.plan.frentes.some((f) => f.frenteKey === 'contenido:x')).toBe(false);
    expect(v.rejectedEvidence).toContain('Q:inventada');
  });
  it('rechaza línea que no corresponde al tipo y tipos desconocidos; sin frentes válidos no hay plan', () => {
    const v = validatePlan({ tesis: good.tesis, frentes: [{ tipo: 'contenido', linea: 'autoridad_enlaces', titulo: 'x', evidencias: ['S:gsc'] }, { tipo: 'magia', titulo: 'y', evidencias: ['S:gsc'] }] }, ctx);
    expect(v.ok).toBe(false);
  });
  it('trimestres dentro del horizonte y como mucho 10 frentes', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ clave: `rendimiento:f${i}`, tipo: 'rendimiento', linea: null, titulo: `F${i}`, por_que: 'x', evidencias: ['H:seo.title_missing'], desde_trimestre: 9, hasta_trimestre: 12 }));
    const v = validatePlan({ ...good, frentes: many }, ctx);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.plan.frentes.length).toBe(10);
    expect(v.plan.frentes.every((f) => f.fromQuarter === 4 && f.toQuarter === 4)).toBe(true);
  });
  it('avisa si el primer trimestre no cabe en las horas', () => {
    const v = validatePlan({ ...good, frentes: [{ ...good.frentes[1], parametros: { porMes: 99 } }] }, { ...ctx, monthlyHours: 2 });
    expect(v.ok && v.warnings.some((w) => /primer trimestre necesita/.test(w))).toBe(true);
  });
});

describe('Jefe SEO D2: arreglos de la auditoría', () => {
  it('un frente sostenido solo por datos de otro tipo se descarta', () => {
    const v = validatePlan({ ...good, frentes: [...good.frentes, { clave: 'contenido:z', tipo: 'contenido', linea: 'contenido_cadencia', titulo: 'Z', por_que: 'x', evidencias: ['S:gsc'], desde_trimestre: 2, hasta_trimestre: 3 }] }, ctx);
    expect(v.ok && v.plan.frentes.some((f) => f.frenteKey === 'contenido:z')).toBe(false);
  });
  it('demasiado inventado = plan no aceptado', () => {
    const v = validatePlan({ ...good, diagnostico: [{ texto: 'x', evidencias: ['H:a', 'H:b', 'H:c', 'H:d', 'H:e', 'H:f'] }] }, ctx);
    expect(v.ok).toBe(false);
  });
  it('reutiliza la clave del frente anterior del mismo tipo y línea', () => {
    const v = validatePlan(good, { ...ctx, previous: [{ frenteKey: 'existente:reformas_terrassa', kind: 'existente', playbook: 'refuerzo_al_alcance' }] });
    expect(v.ok && v.plan.frentes.some((f) => f.frenteKey === 'existente:reformas_terrassa')).toBe(true);
  });
});

describe('Jefe SEO D2: puntuador y examen', () => {
  it('el puntuador avisa si con fallos críticos el plan empieza por contenido', () => {
    const v = validatePlan({ ...good, frentes: [{ clave: 'contenido:cocinas', tipo: 'contenido', linea: 'contenido_cadencia', titulo: 'Cocinas', por_que: 'x', evidencias: ['Q:precio reforma cocina', 'T:reforma_cocina'], desde_trimestre: 1, hasta_trimestre: 4, prioridad: 1 }] }, ctx);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const s = scorePlan(v.plan, rota.evidence);
    expect(s.score).toBeLessThan(80);
    expect(s.divergences.join(' ')).toMatch(/Arreglos técnicos/);
    const okScore = validatePlan(good, ctx);
    expect(okScore.ok && scorePlan(okScore.plan, rota.evidence).score).toBeGreaterThanOrEqual(90);
  });
  it('el examen aprueba el plan bueno y suspende uno con datos inventados', () => {
    expect(gradePlan(good, rota).every((c) => c.pass)).toBe(true);
    const badChecks = gradePlan({ ...good, diagnostico: [{ texto: 'x', evidencias: ['H:no.existe'] }] }, rota);
    expect(badChecks.find((c) => c.name === 'ninguna evidencia inventada')?.pass).toBe(false);
    expect(gradePlan(null, rota)[0].pass).toBe(false);
  });
  it('los casos del examen son coherentes (cada caso tiene expediente y líneas)', () => {
    expect(cases.length).toBe(3);
    for (const c of cases) {
      expect(c.evidence.size).toBeGreaterThan(2);
      expect(c.text).toContain('[');
      expect(c.eligible.length).toBeGreaterThan(0);
    }
  });
});
