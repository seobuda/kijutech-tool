import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAV, NEW_ACTIONS, OPERACIONES_TABS, activeChild, flatNav, isActive, visibleActions, visibleNav, visibleTabs, type Roles } from '@/components/app-shell/nav';

// Una pestaña cuya página exige admin no debe verla quien no lo es: si no, al pulsarla le redirige sin explicación.
// El guard real sigue en la página; esto solo comprueba que menú y página coinciden.
const LECTOR: Roles = { isAdmin: false, isSuperAdmin: false, canAccessAi: false, canEdit: false };
const EDITOR: Roles = { isAdmin: false, isSuperAdmin: false, canAccessAi: false, canEdit: true };
const ADMIN: Roles = { isAdmin: true, isSuperAdmin: false, canAccessAi: false, canEdit: true };
const SUPER: Roles = { isAdmin: true, isSuperAdmin: true, canAccessAi: true, canEdit: true };

const ROOT = join(process.cwd(), 'app/(dashboard)');
const RANK = { view: 0, edit: 1, admin: 2, users: 3 } as const;

function pageFile(href: string): string {
  return join(ROOT, href.split('?')[0], 'page.tsx');
}

/** Permiso que exige una ruta: el mayor entre su página y los layouts que la envuelven. */
function requiredPermission(href: string): keyof typeof RANK {
  let level: keyof typeof RANK = 'view';
  const bump = (file: string) => {
    if (!existsSync(file)) return;
    const m = readFileSync(file, 'utf8').match(/requirePagePermission\('(\w+)'\)/);
    if (m && RANK[m[1] as keyof typeof RANK] > RANK[level]) level = m[1] as keyof typeof RANK;
  };
  bump(pageFile(href));
  let dir = dirname(pageFile(href));
  while (dir.startsWith(ROOT)) {
    bump(join(dir, 'layout.tsx'));
    dir = dirname(dir);
  }
  return level;
}

const roleRank = (r: Roles) => (r.isSuperAdmin ? 3 : r.isAdmin ? 2 : r.canEdit ? 1 : 0);

describe('Pestañas de Operaciones según el rol', () => {
  it('cada pestaña tiene su página', () => {
    for (const t of OPERACIONES_TABS) expect(existsSync(pageFile(t.href)), t.href).toBe(true);
  });

  it('las pestañas de páginas solo para admin se ocultan al editor y se muestran al admin', () => {
    const editorHrefs = new Set(visibleTabs(OPERACIONES_TABS, EDITOR).map((t) => t.href));
    const adminHrefs = new Set(visibleTabs(OPERACIONES_TABS, ADMIN).map((t) => t.href));
    for (const t of OPERACIONES_TABS) {
      const adminPage = readFileSync(pageFile(t.href), 'utf8').includes("requirePagePermission('admin')");
      expect(editorHrefs.has(t.href), `${t.href} visible para editor`).toBe(!adminPage);
      expect(adminHrefs.has(t.href), `${t.href} visible para admin`).toBe(true);
    }
  });
});

describe('Barra lateral en cinco espacios (fase 1 UX)', () => {
  const all = [...flatNav(NAV).map((x) => x.item), ...NEW_ACTIONS];

  it('cada entrada, subentrada y acción de «Nuevo» lleva a una página que existe', () => {
    for (const i of all) expect(existsSync(pageFile(i.href)), i.href).toBe(true);
  });

  it('nadie ve en el menú una entrada cuya página no puede abrir', () => {
    for (const roles of [LECTOR, EDITOR, ADMIN, SUPER]) {
      const visible = [...flatNav(visibleNav(roles)).map((x) => x.item), ...visibleActions(roles)];
      for (const i of visible) {
        expect(RANK[requiredPermission(i.href)] <= roleRank(roles), `${i.href} visible con rango ${roleRank(roles)}`).toBe(true);
      }
    }
  });

  it('los espacios son Inicio, Mis tareas, Para ti, Clientes, Equipo y Conocimiento, y lo técnico va en Ajustes', () => {
    expect(NAV[0].items.map((i) => i.label)).toEqual(['Inicio', 'Mis tareas', 'Para ti', 'Clientes', 'Equipo', 'Conocimiento']);
    expect(NAV.map((g) => g.label)).toEqual(['Espacios', 'Ajustes', 'Cuenta']);
  });

  it('el lector ve un menú corto y sin nada de administración ni de crear', () => {
    const labels = flatNav(visibleNav(LECTOR)).map((x) => x.item.label);
    expect(labels).toEqual(['Inicio', 'Mis tareas', 'Equipo', 'Personas', 'Conocimiento', 'Mi cuenta']);
    expect(visibleActions(LECTOR)).toHaveLength(0);
  });

  it('no hay dos entradas con el mismo nombre', () => {
    for (const roles of [EDITOR, SUPER]) {
      const top = visibleNav(roles).flatMap((g) => g.items.map((i) => i.label));
      expect(new Set(top).size, top.join(', ')).toBe(top.length);
    }
  });

  it('marca el espacio y la subentrada correctos', () => {
    const [espacios] = NAV;
    const equipo = espacios.items.find((i) => i.label === 'Equipo')!;
    const paraTi = espacios.items.find((i) => i.label === 'Para ti')!;
    const inicio = espacios.items.find((i) => i.label === 'Inicio')!;
    expect(isActive(inicio, '/dashboard')).toBe(true);
    expect(isActive(inicio, '/dashboard/clientes')).toBe(false);
    expect(activeChild(equipo, '/dashboard/agentes/departamentos')?.label).toBe('Organigrama');
    expect(activeChild(equipo, '/dashboard/agentes/conversaciones')?.label).toBe('Agentes de IA');
    expect(activeChild(equipo, '/dashboard/operaciones/jornada')?.label).toBe('Personas');
    expect(activeChild(paraTi, '/dashboard/operaciones')?.label).toBe('Bloc de notas');
    expect(isActive(paraTi, '/dashboard/operaciones/equipo-hoy')).toBe(false);
  });
});
