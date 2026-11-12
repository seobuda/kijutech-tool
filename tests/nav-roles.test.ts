import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OPERACIONES_TABS, visibleTabs, type Roles } from '@/components/app-shell/nav';

// Una pestaña cuya página exige admin no debe verla quien no lo es: si no, al pulsarla le redirige al Bloc
// sin explicación. El guard real sigue en la página; esto solo comprueba que menú y página coinciden.
const EDITOR: Roles = { isAdmin: false, isSuperAdmin: false, canAccessAi: false };
const ADMIN: Roles = { isAdmin: true, isSuperAdmin: false, canAccessAi: false };

function pageFile(href: string): string {
  return join(process.cwd(), 'app/(dashboard)', href, 'page.tsx');
}

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
