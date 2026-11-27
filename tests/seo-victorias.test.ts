// Victorias rápidas de la simulación (27 nov): la puesta en marcha pide también la ficha de Google y el acceso a la web.
import { describe, expect, it } from 'vitest';
import { readiness } from '@/lib/seo/alta/rules';

const base = { web: true, gscAssigned: true, gscHasData: true, audited: true, mapBuilt: true, negocio: true, servicios: true, zona: true, contacto: true, atencion: true, idiomas: true, competencia: 3 };

describe('puesta en marcha ampliada', () => {
  it('sin los datos nuevos, igual que antes (11)', () => {
    expect(readiness(base).total).toBe(11);
  });
  it('con ficha y acceso: 13, y lo que falta se ve', () => {
    const r = readiness({ ...base, ficha: false, accesoWeb: true });
    expect(r.total).toBe(13);
    expect(r.items.filter((i) => !i.ok).map((i) => i.key)).toEqual(['ficha']);
  });
});
