import { describe, expect, it } from 'vitest';
import {
  MEMORY_MAX_CHARS,
  matchSender,
  normalizeSender,
  validateMemoryText,
  type SenderLike
} from '@/lib/operaciones/client-memory-rules';

describe('normalizeSender', () => {
  it('normaliza un correo (minúsculas, espacios, «Nombre <correo>»)', () => {
    expect(normalizeSender('email', '  Ana.Lopez@Empresa.COM ')).toEqual({ ok: true, kind: 'email', value: 'ana.lopez@empresa.com' });
    expect(normalizeSender('email', 'Ana López <ana@empresa.com>')).toEqual({ ok: true, kind: 'email', value: 'ana@empresa.com' });
  });

  it('rechaza correos mal formados', () => {
    for (const v of ['', 'sin-arroba', 'a@b', '@empresa.com', 'a b@empresa.com', 'a@empresa..com', `${'x'.repeat(65)}@empresa.com`]) {
      expect(normalizeSender('email', v).ok, v).toBe(false);
    }
  });

  it('normaliza un dominio (quita @ y www.)', () => {
    expect(normalizeSender('domain', '@Empresa.com')).toEqual({ ok: true, kind: 'domain', value: 'empresa.com' });
    expect(normalizeSender('domain', 'www.empresa.es')).toEqual({ ok: true, kind: 'domain', value: 'empresa.es' });
  });

  it('rechaza dominios mal formados', () => {
    for (const v of ['', 'empresa', '-empresa.com', 'empresa .com', 'empresa.com/ruta', 'http://empresa.com']) {
      expect(normalizeSender('domain', v).ok, v).toBe(false);
    }
  });

  it('NO admite proveedores públicos como dominio, pero sí como dirección exacta', () => {
    for (const d of ['gmail.com', 'GMAIL.com', '@hotmail.es', 'outlook.com', 'icloud.com', 'yahoo.es']) {
      const r = normalizeSender('domain', d);
      expect(r.ok, d).toBe(false);
    }
    expect(normalizeSender('email', 'persona@gmail.com')).toEqual({ ok: true, kind: 'email', value: 'persona@gmail.com' });
  });

  it('rechaza un tipo desconocido', () => {
    expect(normalizeSender('url', 'empresa.com').ok).toBe(false);
  });
});

describe('validateMemoryText', () => {
  it('compacta espacios y acepta texto normal', () => {
    expect(validateMemoryText('  Prefiere   que le llamemos\nantes  ')).toEqual({ ok: true, text: 'Prefiere que le llamemos antes' });
  });

  it('rechaza vacío y exceso de longitud', () => {
    expect(validateMemoryText('   ').ok).toBe(false);
    expect(validateMemoryText('x'.repeat(MEMORY_MAX_CHARS)).ok).toBe(true);
    expect(validateMemoryText('x'.repeat(MEMORY_MAX_CHARS + 1)).ok).toBe(false);
  });

  it('rechaza contraseñas y accesos', () => {
    for (const t of ['contraseña: abc123', 'Contrasena = hola', 'password: x', 'el pwd=secreto', 'clave de acceso: 1234']) {
      expect(validateMemoryText(t).ok, t).toBe(false);
    }
    // Hablar de contraseñas sin dar una no es un problema.
    expect(validateMemoryText('Nos pasará las contraseñas por su gestor de claves').ok).toBe(true);
  });
});

describe('matchSender', () => {
  const s = (clientId: string, kind: 'email' | 'domain', value: string, active = true): SenderLike => ({ clientId, kind, value, active });

  it('la dirección exacta gana al dominio', () => {
    const senders = [s('A', 'domain', 'empresa.com'), s('B', 'email', 'jefe@empresa.com')];
    expect(matchSender(senders, 'jefe@empresa.com')).toEqual({ clientId: 'B', by: 'email' });
    expect(matchSender(senders, 'otro@empresa.com')).toEqual({ clientId: 'A', by: 'domain' });
  });

  it('no distingue mayúsculas ni espacios', () => {
    expect(matchSender([s('A', 'email', 'a@x.com')], '  A@X.COM ')).toEqual({ clientId: 'A', by: 'email' });
  });

  it('ignora contactos pausados', () => {
    expect(matchSender([s('A', 'domain', 'empresa.com', false)], 'x@empresa.com')).toBeNull();
  });

  it('un remitente desconocido no se asigna a nadie', () => {
    expect(matchSender([s('A', 'domain', 'empresa.com')], 'x@otra.com')).toBeNull();
    expect(matchSender([s('A', 'domain', 'empresa.com')], 'sin-arroba')).toBeNull();
    expect(matchSender([], 'x@empresa.com')).toBeNull();
  });

  it('un subdominio NO hereda el dominio (no se adivina)', () => {
    expect(matchSender([s('A', 'domain', 'empresa.com')], 'x@mail.empresa.com')).toBeNull();
  });

  it('si dos clientes reclaman el mismo dominio, no adivina', () => {
    const r = matchSender([s('A', 'domain', 'grupo.com'), s('B', 'domain', 'grupo.com')], 'x@grupo.com');
    expect(r).toEqual({ ambiguous: ['A', 'B'] });
  });

  it('un correo falso con el dominio parecido no coincide', () => {
    expect(matchSender([s('A', 'domain', 'empresa.com')], 'x@empresa.com.evil.io')).toBeNull();
    expect(matchSender([s('A', 'domain', 'empresa.com')], 'x@evil-empresa.com')).toBeNull();
  });
});
