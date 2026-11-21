import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAV, breadcrumbs, flatNav } from '@/components/app-shell/nav';
import { ADMIN_TOUR, TEAM_TOUR, availableSteps, nav, tourSeenKey } from '@/components/guia/steps';
import { GLOSSARY } from '@/app/(dashboard)/dashboard/ayuda/glossary';

// Fase 5 UX (21 nov 2026): la visita guiada y el glosario no deben quedarse desfasados cuando cambie el menú.
const pageExists = (href: string) => existsSync(join(process.cwd(), 'app/(dashboard)', href.split('?')[0], 'page.tsx'));

describe('Glosario', () => {
  it('cada enlace lleva a una página que existe', () => {
    for (const g of GLOSSARY) for (const t of g.terms) if (t.href) expect(pageExists(t.href), t.href).toBe(true);
  });

  it('no repite términos', () => {
    const all = GLOSSARY.flatMap((g) => g.terms.map((t) => t.term.toLowerCase()));
    expect(new Set(all).size).toBe(all.length);
  });

  it('explica los cinco espacios', () => {
    const terms = GLOSSARY.flatMap((g) => g.terms.map((t) => t.term));
    for (const label of NAV[0].items.map((i) => i.label)) expect(terms, label).toContain(label);
  });
});

describe('Visita guiada', () => {
  const navHrefs = new Set(flatNav(NAV).map((x) => x.item.href));

  it('cada paso que señala el menú apunta a una entrada que existe', () => {
    for (const s of [...ADMIN_TOUR, ...TEAM_TOUR]) {
      const m = s.target?.match(/^\[data-tour="nav:(.+)"\]$/);
      if (m) expect(navHrefs.has(m[1]), `${s.id} → ${m[1]}`).toBe(true);
    }
  });

  it('empieza con una bienvenida centrada y termina en el botón de ayuda (para poder repetirla)', () => {
    for (const tour of [ADMIN_TOUR, TEAM_TOUR]) {
      expect(tour[0].target).toBeUndefined();
      expect(tour[tour.length - 1].target).toBe('[data-tour="ayuda"]');
      expect(new Set(tour.map((s) => s.id)).size).toBe(tour.length);
    }
  });

  it('se salta los pasos cuyo elemento no está (p. ej. lo de admin para el equipo)', () => {
    const shown = availableSteps(ADMIN_TOUR, (sel) => sel !== nav('/dashboard/para-ti'));
    expect(shown.map((s) => s.id)).not.toContain('para-ti');
    expect(shown[0].id).toBe('hola');
  });

  it('recuerda que ya la vio por usuario', () => {
    expect(tourSeenKey(7)).not.toBe(tourSeenKey(8));
  });
});

describe('Migas de pan', () => {
  it('cada pantalla del menú tiene un nombre legible (no la ruta en minúsculas)', () => {
    const hrefs = [...flatNav(NAV).map((x) => x.item.href), '/dashboard/ayuda', '/dashboard/conocimiento/nueva', '/dashboard/agentes/trabajos'];
    for (const href of hrefs) {
      const crumbs = breadcrumbs(href.split('?')[0]);
      for (const c of crumbs) expect(c.label.charAt(0), `${href} → «${c.label}»`).toBe(c.label.charAt(0).toUpperCase());
    }
  });
});
