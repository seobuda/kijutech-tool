import 'server-only';

// Red (núcleo, 17 nov 2026): comprobar que una URL es pública antes de pedirla, para que una URL escrita por una persona
// (ficha de cliente, competidor SEO) no pueda apuntar a la red interna del servidor (SSRF). Antes vivía en
// lib/estrategia/web.ts; ahora la usan también otros módulos (SEO: scraper de competidores).
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

/** Solo http(s) a nombres públicos: evita que una URL mal puesta en una ficha apunte a la red interna. */
export function isPublicUrl(u: string): boolean {
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const h = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h.includes('.') || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return false;
  if (isIP(h)) return isIP(h) === 4 && !privateV4(h);
  return true;
}

function privateV4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

function privateIp(ip: string): boolean {
  if (isIP(ip) === 4) return privateV4(ip);
  const v = ip.toLowerCase();
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return privateV4(mapped[1]);
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb');
}

/** El nombre resuelve solo a direcciones públicas (evita dominios que apuntan a la red interna). */
export async function resolvesPublic(u: string): Promise<boolean> {
  if (!isPublicUrl(u)) return false;
  const host = new URL(u).hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return true; // ya comprobada arriba
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !privateIp(a.address));
  } catch {
    return false;
  }
}

/**
 * fetch que solo sigue redirecciones hacia direcciones públicas (cada salto se comprueba; como mucho 5). Devuelve la
 * respuesta final o un error legible.
 */
export async function fetchPublic(url: string, init: Omit<RequestInit, 'redirect'> = {}, maxRedirects = 5): Promise<{ res: Response; url: string } | { error: string }> {
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    if (!(await resolvesPublic(current))) return { error: 'Dirección no permitida (solo webs públicas).' };
    const res = await fetch(current, { ...init, redirect: 'manual' });
    const loc = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!loc) return { res, url: current };
    void res.body?.cancel().catch(() => undefined);
    try {
      current = new URL(loc, current).toString();
    } catch {
      return { error: 'Redirección no válida.' };
    }
  }
  return { error: 'Demasiadas redirecciones.' };
}
