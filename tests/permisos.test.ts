import { describe, expect, it, vi } from 'vitest';
import { roleAllows, type Permission } from '@/lib/auth/permissions';
import { maskSecret } from '@/lib/auth/mask';
import { publicError } from '@/lib/errors';

// Matriz de permisos: es la fuente de verdad de quién puede hacer qué.
describe('matriz de permisos por rol', () => {
  const tabla: Record<string, Record<Permission, boolean>> = {
    super_admin: { view: true, edit: true, admin: true, users: true },
    admin: { view: true, edit: true, admin: true, users: false },
    editor: { view: true, edit: true, admin: false, users: false },
    lector: { view: true, edit: false, admin: false, users: false }
  };

  for (const [rol, permisos] of Object.entries(tabla)) {
    for (const [permiso, esperado] of Object.entries(permisos)) {
      it(`${rol} ${esperado ? 'puede' : 'NO puede'} «${permiso}»`, () => {
        expect(roleAllows([rol], permiso as Permission)).toBe(esperado);
      });
    }
  }

  it('sin ningún rol no se puede nada, ni ver', () => {
    for (const p of ['view', 'edit', 'admin', 'users'] as Permission[]) {
      expect(roleAllows([], p)).toBe(false);
    }
  });

  it('un rol desconocido no concede nada', () => {
    expect(roleAllows(['hacker', 'owner'], 'view')).toBe(false);
  });
});

describe('tokens enmascarados', () => {
  it('muestra solo el principio y los 4 últimos caracteres', () => {
    expect(maskSecret('pk_1234567890abcdefa1b2')).toBe('pk_…a1b2');
  });
  it('en valores cortos no revela el principio', () => {
    expect(maskSecret('abcd1234')).toBe('…34');
  });
  it('nunca devuelve el valor completo', () => {
    const t = 'pk_secreto_muy_largo_9999';
    expect(maskSecret(t)).not.toContain('secreto');
  });
  it('vacío → null', () => {
    expect(maskSecret('')).toBeNull();
    expect(maskSecret(null)).toBeNull();
  });
});

describe('errores para el usuario', () => {
  it('oculta el detalle técnico de la base de datos y lo manda a los logs', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const msg = publicError(new Error('Failed query: select * from users where password_hash = $1'), 'No se pudo guardar');
    expect(msg).toBe('No se pudo guardar');
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
  it('oculta errores de red y trazas', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(publicError(new Error('connect ECONNREFUSED 10.0.0.5:5432'), 'Error')).toBe('Error');
    expect(publicError(new Error('boom at foo (/app/lib/x.ts:10:5)'), 'Error')).toBe('Error');
    log.mockRestore();
  });
  it('deja pasar los mensajes pensados para la persona', () => {
    expect(publicError(new Error('Escribe el motivo de la devolución'), 'Error')).toBe('Escribe el motivo de la devolución');
  });
});
