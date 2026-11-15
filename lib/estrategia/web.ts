import 'server-only';

// Módulo Estrategia: comprobaciones de la web de un cliente (no necesitan credenciales): respuesta de una página
// (siguiendo redirecciones), certificado SSL, robots.txt, sitemap y PageSpeed Insights (Core Web Vitals).
// Solo se piden URLs públicas: nunca direcciones internas (localhost, redes privadas, nombres sin dominio).
import tls from 'node:tls';
import { isIP } from 'node:net';
import { parseHtml, type PageFacts } from '@/lib/estrategia/rules';

const UA = 'Mozilla/5.0 (compatible; KijutechMonitor/1.0)';
const TIMEOUT = 15_000;
const MAX_BYTES = 400_000;

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
  if (isIP(h)) {
    if (isIP(h) === 6) return false;
    const [a, b] = h.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224) return false;
  }
  return true;
}

async function readText(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.length;
  }
  void reader.cancel().catch(() => undefined);
  return new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks));
}

/** Pide una página siguiendo hasta 5 redirecciones y saca lo que importa para el SEO. */
export async function fetchPage(url: string): Promise<PageFacts | { error: string }> {
  let current = url;
  for (let hop = 0; hop <= 5; hop++) {
    if (!isPublicUrl(current)) return { error: 'URL no pública' };
    let res: Response;
    try {
      res = await fetch(current, { redirect: 'manual', headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }, signal: AbortSignal.timeout(TIMEOUT) });
    } catch (e) {
      const msg = e instanceof Error ? (e.name === 'TimeoutError' ? 'tarda demasiado (más de 15 s)' : e.message) : 'error de red';
      return { error: msg.slice(0, 150) };
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      void res.body?.cancel().catch(() => undefined);
      current = new URL(res.headers.get('location')!, current).toString();
      continue;
    }
    const type = res.headers.get('content-type') ?? '';
    const html = /html|xml/i.test(type) ? await readText(res) : (void res.body?.cancel().catch(() => undefined), '');
    const p = parseHtml(html);
    return { status: res.status, finalUrl: current, redirects: hop, noindex: p.noindex, title: p.title, description: p.description, canonical: p.canonical, xRobots: res.headers.get('x-robots-tag') };
  }
  return { error: 'demasiadas redirecciones' };
}

/** Texto de un archivo público pequeño (robots.txt, sitemap). null si no existe o falla. */
export async function fetchText(url: string): Promise<string | null> {
  if (!isPublicUrl(url)) return null;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) {
      void res.body?.cancel().catch(() => undefined);
      return null;
    }
    return await readText(res);
  } catch {
    return null;
  }
}

/** Días que le quedan al certificado SSL (negativo = caducado). null si no se pudo comprobar. */
export function sslDaysLeft(host: string): Promise<number | null> {
  if (!isPublicUrl(`https://${host}/`)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: 10_000, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      const t = cert?.valid_to ? Date.parse(cert.valid_to) : NaN;
      resolve(Number.isFinite(t) ? Math.floor((t - Date.now()) / 86_400_000) : null);
    });
    socket.on('error', () => resolve(null));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });
  });
}

export type SpeedResult = {
  url: string;
  score: number | null; // 0-100 (laboratorio)
  field: { lcpMs: number | null; inpMs: number | null; cls: number | null; category: string | null; origin: boolean } | null;
};

type PsiResp = {
  loadingExperience?: { overall_category?: string; metrics?: Record<string, { percentile?: number; category?: string }> };
  originLoadingExperience?: { overall_category?: string; metrics?: Record<string, { percentile?: number; category?: string }> };
  lighthouseResult?: { categories?: { performance?: { score?: number } } };
};

/** PageSpeed Insights (móvil). Usa PAGESPEED_API_KEY del .env si existe; sin clave, Google limita mucho las peticiones. */
export async function pageSpeed(url: string): Promise<SpeedResult | { error: string }> {
  if (!isPublicUrl(url)) return { error: 'URL no pública' };
  const q = new URLSearchParams({ url, strategy: 'mobile', category: 'performance' });
  if (process.env.PAGESPEED_API_KEY) q.set('key', process.env.PAGESPEED_API_KEY);
  try {
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, { signal: AbortSignal.timeout(90_000) });
    if (!res.ok) return { error: res.status === 429 ? 'Google limita las peticiones sin clave (añade PAGESPEED_API_KEY)' : `PageSpeed respondió ${res.status}` };
    const j = (await res.json()) as PsiResp;
    const page = j.loadingExperience?.metrics && Object.keys(j.loadingExperience.metrics).length ? j.loadingExperience : null;
    const exp = page ?? (j.originLoadingExperience?.metrics ? j.originLoadingExperience : null);
    const m = exp?.metrics ?? {};
    const score = j.lighthouseResult?.categories?.performance?.score;
    return {
      url,
      score: typeof score === 'number' ? Math.round(score * 100) : null,
      field: exp
        ? {
            lcpMs: m.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null,
            inpMs: m.INTERACTION_TO_NEXT_PAINT?.percentile ?? null,
            cls: typeof m.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile === 'number' ? m.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : null,
            category: exp.overall_category ?? null,
            origin: !page
          }
        : null
    };
  } catch (e) {
    return { error: e instanceof Error && e.name === 'TimeoutError' ? 'PageSpeed tardó demasiado' : 'No se pudo consultar PageSpeed' };
  }
}

/** Ejecuta tareas con un máximo de N a la vez. */
export async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    })
  );
  return out;
}
