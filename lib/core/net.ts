import 'server-only';

// Red (núcleo, 17 nov 2026): comprobar que una URL es pública antes de pedirla, para que una URL escrita por una persona
// (ficha de cliente, competidor SEO) no pueda apuntar a la red interna del servidor (SSRF). Antes vivía en
// lib/estrategia/web.ts; ahora la usan también otros módulos (SEO: scraper de competidores).
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';
import zlib from 'node:zlib';

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

export function privateIp(ip: string): boolean {
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
 * Resolución DNS que solo deja conectar a direcciones públicas. Se usa como `lookup` del socket: la dirección que se
 * comprueba es exactamente a la que se conecta (sin una segunda resolución), así un dominio no puede cambiar su DNS
 * entre la comprobación y la conexión para apuntar a la red interna (DNS rebinding; auditoría SEO parte 1, 26 nov 2026).
 */
export function publicLookup(hostname: string, options: dns.LookupOptions, cb: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return cb(err, '', 0);
    const list = (addrs as dns.LookupAddress[]).filter((a) => !privateIp(a.address));
    if (!list.length || list.length !== (addrs as dns.LookupAddress[]).length) {
      const e = new Error('Dirección no permitida (solo webs públicas).') as NodeJS.ErrnoException;
      e.code = 'EPRIVATEADDR';
      return cb(e, '', 0);
    }
    if (options.all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}

export type PublicFetchInit = { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal };

/**
 * Una sola petición HTTP(S) a una web pública, SIN seguir redirecciones (el que llama decide), conectando solo a
 * direcciones públicas validadas al conectar. Devuelve una Response estándar (cuerpo descomprimido). Sustituye al fetch
 * global para pedir webs de terceros (clientes, competidores, enlaces externos).
 */
export function publicFetch(url: string, init: PublicFetchInit = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return reject(new Error('URL no válida'));
    }
    if (!isPublicUrl(url)) return reject(new Error('Dirección no permitida (solo webs públicas).'));
    const mod = u.protocol === 'https:' ? https : http;
    const host = u.hostname.replace(/^\[|\]$/g, '');
    const req = mod.request(
      {
        protocol: u.protocol,
        hostname: host,
        port: u.port || undefined,
        path: `${u.pathname}${u.search}`,
        method: init.method ?? 'GET',
        headers: { 'accept-encoding': 'gzip, deflate, br', ...(init.headers ?? {}) },
        lookup: isIP(host) ? undefined : publicLookup,
        signal: init.signal,
        servername: isIP(host) ? undefined : host
      },
      (res) => {
        const enc = String(res.headers['content-encoding'] ?? '').toLowerCase();
        let stream: NodeJS.ReadableStream = res;
        if (enc === 'gzip' || enc === 'x-gzip') stream = res.pipe(zlib.createGunzip());
        else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());
        // Si quien lee cancela (tope de tamaño), se cierra también la conexión, no solo el descompresor.
        if (stream !== res) (stream as NodeJS.ReadableStream & { on: (e: string, f: () => void) => void }).on('close', () => res.destroy());
        const headers = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          if (v == null || k === 'content-encoding' || k === 'content-length') continue;
          if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
          else headers.set(k, String(v));
        }
        const status = res.statusCode ?? 0;
        // Response no admite cuerpo con 204/304 ni estados fuera de 200-599.
        const noBody = status === 204 || status === 304 || (init.method ?? 'GET').toUpperCase() === 'HEAD';
        const body = noBody ? null : (Readable.toWeb(stream as Readable) as unknown as ReadableStream);
        if (noBody) res.resume();
        try {
          resolve(new Response(body, { status: status >= 200 && status <= 599 ? status : 599, headers }));
        } catch (e) {
          reject(e);
        }
      }
    );
    req.on('error', reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}

/**
 * Petición que solo sigue redirecciones hacia direcciones públicas (cada salto se comprueba al conectar; como mucho 5).
 * Devuelve la respuesta final o un error legible.
 */
export async function fetchPublic(url: string, init: PublicFetchInit = {}, maxRedirects = 5): Promise<{ res: Response; url: string } | { error: string }> {
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    if (!(await resolvesPublic(current))) return { error: 'Dirección no permitida (solo webs públicas).' };
    let res: Response;
    try {
      res = await publicFetch(current, init);
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code === 'EPRIVATEADDR') return { error: 'Dirección no permitida (solo webs públicas).' };
      throw e;
    }
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
