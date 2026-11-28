// SEO · Jefe SEO D6 (revisor): permiso de decidir las estrategias del Jefe. Lector no; editor solo con la autonomía ganada
// (más del 70 % de 10 aprobadas); administrador siempre. Permisos y autonomía simulados; la acción es la de verdad.
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ perms: [] as string[], autonomy: false }));
vi.mock('@/lib/auth/permissions', async (orig) => {
  const m = await orig<typeof import('@/lib/auth/permissions')>();
  const user = { id: 1, tenantId: '00000000-0000-4000-8000-0000000000aa', name: 'Prueba', email: 'x@kijutech.invalid' };
  return {
    ...m,
    requirePermission: async (p: string) => {
      if (!h.perms.includes(p)) throw new Error('No autorizado');
      return user;
    },
    checkPermission: async (p: string) => (h.perms.includes(p) ? { ok: true, user, roles: [] } : { ok: false, error: 'No autorizado' })
  };
});
vi.mock('@/lib/seo/jefe/metricas', async (orig) => {
  const m = await orig<typeof import('@/lib/seo/jefe/metricas')>();
  return { ...m, accountCycleAutonomy: async () => ({ decided: 10, approved: h.autonomy ? 8 : 5, rate: h.autonomy ? 0.8 : 0.5, enabled: h.autonomy, missing: 0 }) };
});
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

import { decideCycleAction } from '@/lib/seo/jefe-actions';

const P = '00000000-0000-4000-8000-0000000000bb';
const X = '00000000-0000-4000-8000-0000000000cc';

describe('Jefe SEO D6: quién decide las estrategias del Jefe', () => {
  it('un lector no puede', async () => {
    h.perms = ['view'];
    const r = await decideCycleAction(P, X, true, '');
    expect(r.ok).toBe(false);
  });
  it('un editor sin la autonomía ganada no puede', async () => {
    h.perms = ['view', 'edit'];
    h.autonomy = false;
    const r = await decideCycleAction(P, X, true, '');
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/administrador/) });
  });
  it('un editor con la autonomía ganada pasa el permiso (y luego se comprueba el proyecto)', async () => {
    h.perms = ['view', 'edit'];
    h.autonomy = true;
    const r = await decideCycleAction(P, X, true, '');
    expect(r).toEqual({ ok: false, error: 'Propuesta no encontrada' });
  });
  it('un administrador pasa siempre', async () => {
    h.perms = ['view', 'edit', 'admin'];
    h.autonomy = false;
    const r = await decideCycleAction(P, X, true, '');
    expect(r).toEqual({ ok: false, error: 'Propuesta no encontrada' });
  });
});
