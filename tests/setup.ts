import { vi } from 'vitest';

/**
 * Lo único que se simula es el entorno de Next.js (cookies, cabeceras, redirecciones, caché).
 * La autenticación NO se simula: las pruebas usan cookies de sesión reales firmadas con
 * AUTH_SECRET, de modo que se ejecuta el código de verdad (getUser, roles, guards...).
 */
type Holder = { token: string | null };
const holder: Holder = ((globalThis as unknown as { __segSession?: Holder }).__segSession ??= { token: null });

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'session' && holder.token ? { name, value: holder.token } : undefined),
    set: (name: string, value: string) => {
      if (name === 'session') holder.token = value;
    },
    delete: (name: string) => {
      if (name === 'session') holder.token = null;
    }
  }),
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.7' })
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  }
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn
}));
