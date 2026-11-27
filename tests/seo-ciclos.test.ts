// SEO · estrategias por ciclos (docs/PLAN-SEO-CICLOS.md, 27 nov 2026): catálogo, elegibilidad, validación de horas y
// calendario. Y que el plan por reglas no toca el trabajo de una estrategia.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { availableHours, cleanParams, eligibility, expandSlots, lineHours, mondayOf, PLAYBOOKS, validateStrategy, type EligibilityContext } from '@/lib/seo/estrategia/playbooks';
import { TECHNIQUE_BY_KEY } from '@/lib/core/techniques';

const full: EligibilityContext = { hasWeb: true, hasSearchConsole: true, servicesConfirmed: 3, zoneConfirmed: true, hasGoogleProfile: true, competitorsConfirmed: 3, topicsWithDemand: 10, strikingDistance: 5, decliningPages: 2, linkGapDomains: 8, schemaMissing: true, zonesWithoutPage: 2 };

describe('ciclos: catálogo', () => {
  it('cada línea usa una técnica del núcleo (para medir y aprender entre clientes)', () => {
    for (const pb of Object.values(PLAYBOOKS)) if (pb.key !== 'cimientos') expect(TECHNIQUE_BY_KEY.has(pb.technique), pb.key).toBe(true);
  });
  it('elegibilidad con motivo', () => {
    const e = eligibility({ ...full, zoneConfirmed: false, linkGapDomains: 0, hasGoogleProfile: false });
    expect(e.eligible).toContain('contenido_cadencia');
    expect(e.eligible).not.toContain('cimientos');
    expect(e.blocked.find((b) => b.key === 'paginas_servicio_zona')?.why).toMatch(/zona/);
    expect(e.blocked.find((b) => b.key === 'autoridad_enlaces')?.why).toMatch(/huecos/);
  });
  it('parámetros al rango', () => {
    expect(cleanParams('contenido_cadencia', { porSemana: 9, tipos: ['comparativo', 'inventado', 'autoridad'], servicioFoco: 'reformas' }, ['reformas'])).toEqual({ porSemana: 3, tipos: ['comparativo', 'autoridad'], servicioFoco: 'reformas' });
    expect(cleanParams('contenido_cadencia', { tipos: [] })).toEqual({ porSemana: 1, tipos: ['servicio'], servicioFoco: 'todos' });
  });
});

describe('ciclos: horas', () => {
  it('disponibles = meses × horas × (1 − reserva)', () => {
    expect(availableHours(10, 3)).toBe(21);
    expect(availableHours(null, 3)).toBeNull();
  });
  it('2 artículos/semana en un trimestre no caben en 10 h/mes; 1 cabe con poco más', () => {
    const r = validateStrategy([{ playbook: 'contenido_cadencia', params: { porSemana: 2, tipos: ['comparativo', 'autoridad'] } }], { eligible: eligibility(full).eligible, months: 3, monthlyHours: 10 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/solo hay 21 h/);
    expect(lineHours('contenido_cadencia', { porSemana: 1 }, 3)).toBe(26);
    const ok = validateStrategy([{ playbook: 'contenido_cadencia', params: { porSemana: 1 } }], { eligible: eligibility(full).eligible, months: 3, monthlyHours: 10, hoursPerUnit: { contenido_cadencia: 1.5 } });
    expect(ok.ok).toBe(true);
  });
  it('rechaza líneas inventadas, repetidas, no elegibles, más de 3 o ciclo demasiado corto', () => {
    const elig = eligibility({ ...full, hasGoogleProfile: false }).eligible;
    const r = validateStrategy(
      [{ playbook: 'inventada' }, { playbook: 'refuerzo_al_alcance' }, { playbook: 'refuerzo_al_alcance' }, { playbook: 'local_ficha_resenas' }],
      { eligible: elig, months: 3, monthlyHours: null }
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' | ')).toMatch(/Como mucho 3.*no está en el catálogo.*repetida/s);
    const short = validateStrategy([{ playbook: 'contenido_cadencia' }], { eligible: elig, months: 1, monthlyHours: null });
    expect(short.ok).toBe(false);
  });
});

describe('ciclos: calendario', () => {
  it('12-13 semanas × 1 artículo = un hueco por semana, desde el lunes', () => {
    const s = expandSlots('contenido_cadencia', { porSemana: 1 }, new Date('2026-12-03T10:00:00Z'), 3);
    expect(s.length).toBe(13);
    expect(s[0].week).toBe('2026-11-30');
    expect(s[1].week).toBe('2026-12-07');
  });
  it('2 por semana = dos huecos en la misma semana; por mes = espaciados', () => {
    const s = expandSlots('contenido_cadencia', { porSemana: 2 }, new Date('2026-12-07T00:00:00Z'), 1);
    expect(s.slice(0, 2).map((x) => x.week)).toEqual(['2026-12-07', '2026-12-07']);
    const m = expandSlots('refuerzo_al_alcance', { porMes: 2 }, new Date('2026-12-07T00:00:00Z'), 3);
    expect(m.length).toBe(6);
    expect(new Set(m.map((x) => x.week)).size).toBe(6);
  });
  it('lunes de una fecha', () => {
    expect(mondayOf(new Date('2026-11-29T23:00:00Z')).toISOString().slice(0, 10)).toBe('2026-11-23');
  });
});

describe('ciclos: el plan por reglas no toca el trabajo de una estrategia', () => {
  it('regeneratePlan solo empareja y caduca lo de origen «reglas»', () => {
    const src = readFileSync('lib/seo/plan/plan.ts', 'utf8');
    expect(src).toContain("const ruleItems = items.filter((i) => i.origin === 'reglas');");
    expect(src).toContain('const same = ruleItems.filter(');
    expect(src).toContain('const stale = ruleItems.filter(');
  });
});
