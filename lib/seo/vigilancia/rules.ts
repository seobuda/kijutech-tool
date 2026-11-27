// SEO · Vigilancia continua: reglas puras (parte 0, 26 nov 2026; docs/DISENO-SEO-PARTE0.md). Sin base de datos ni red:
// se prueban en tests/seo-vigilancia.test.ts. Trasladan la lógica buena de Estrategia (vigilancia crítica, velocidad y
// páginas en caída) al módulo SEO por proyecto, sin importar Estrategia.
import { parseRobots } from '@/lib/core/robots';
import type { FindingInput } from '@/lib/core/findings-rules';

export const VIGILANCIA_SOURCE = 'seo.vigilancia:web';
export const VELOCIDAD_SOURCE = 'seo.velocidad:crux';
export const DETECTORES_SOURCE = 'seo.detectores:gsc';
/** Fuentes de la vigilancia continua (se ven en Salud y entran en el plan de mejora). */
export const VIGILANCIA_SOURCES = [VIGILANCIA_SOURCE, VELOCIDAD_SOURCE, DETECTORES_SOURCE];

/** Frecuencias que se pueden elegir por proceso (minutos) y la de por defecto. */
export const SEO_PROCESSES = {
  'seo.vigilancia': { label: 'Vigilancia de la web (caída, noindex, robots, SSL)', every: 60, options: [60, 360, 1440] },
  'seo.auditoria': { label: 'Auditoría completa (rastreo de hasta 500 páginas)', every: 30 * 1440, options: [7 * 1440, 14 * 1440, 30 * 1440, 90 * 1440] },
  'seo.velocidad': { label: 'Velocidad real de los usuarios (Core Web Vitals)', every: 30 * 1440, options: [7 * 1440, 14 * 1440, 30 * 1440] },
  'seo.detectores': { label: 'Mapa de palabras, páginas en caída e indexación', every: 7 * 1440, options: [3 * 1440, 7 * 1440, 14 * 1440, 30 * 1440] },
  'seo.posiciones': { label: 'Posiciones en Google (búsquedas que se siguen, mapa e IA)', every: 7 * 1440, options: [7 * 1440, 14 * 1440, 30 * 1440] },
  'seo.local': { label: 'Ficha de Google y reseñas (cliente y competencia)', every: 7 * 1440, options: [7 * 1440, 14 * 1440, 30 * 1440] },
  'seo.geogrid': { label: 'Mapa por zonas (geo-grid de Google Maps)', every: 30 * 1440, options: [14 * 1440, 30 * 1440, 60 * 1440] },
  'seo.nap': { label: 'Teléfonos antiguos publicados en otras webs', every: 90 * 1440, options: [30 * 1440, 90 * 1440, 180 * 1440] }
} as const;
export type SeoProcessKey = keyof typeof SEO_PROCESSES;
export const SEO_PROCESS_KEYS = Object.keys(SEO_PROCESSES) as SeoProcessKey[];
export const isSeoProcessKey = (k: string): k is SeoProcessKey => k in SEO_PROCESSES;

export function everyLabel(min: number): string {
  if (min < 1440) return min % 60 === 0 ? `cada ${min / 60} h` : `cada ${min} min`;
  const d = Math.round(min / 1440);
  return d === 1 ? 'cada día' : `cada ${d} días`;
}

/** ¿robots.txt prohíbe a Google toda la web? (Disallow: / sin un Allow que abra algo para Googlebot). */
export function robotsBlocksAll(txt: string): boolean {
  const r = parseRobots(txt, 'googlebot');
  return r.disallow.some((d) => d === '/' || d === '/*') && !r.allow.some((a) => a.length > 1);
}

export type HomeCheck =
  | { error: string }
  | { status: number; finalUrl: string; noindex: boolean };

/** Hallazgos de la vigilancia a partir de lo que se ha comprobado de la portada, robots.txt y el certificado. */
export function vigilanciaFindings(home: string, check: HomeCheck, robotsTxt: string | null, sslDays: number | null): FindingInput[] {
  const out: FindingInput[] = [];
  if ('error' in check) out.push({ kind: 'seo.site_down', dedupeKey: `seo.site_down:${home}`, url: home, evidence: { error: check.error } });
  else if (check.status >= 500) out.push({ kind: 'seo.site_down', dedupeKey: `seo.site_down:${home}`, url: home, metric: 'status', value: check.status, evidence: { status: check.status } });
  else if (check.status >= 400) {
    // 401/403/429 suelen ser un cortafuegos que bloquea a nuestro robot, no la web rota: aviso, sin despertar a nadie.
    const blocked = [401, 403, 429].includes(check.status);
    out.push({ kind: 'seo.home_error', dedupeKey: `seo.home_error:${home}`, url: home, severity: blocked ? 'aviso' : 'critico', metric: 'status', value: check.status, evidence: { status: check.status, maybeFirewall: blocked } });
  }
  else if (check.noindex) out.push({ kind: 'seo.home_noindex', dedupeKey: `seo.home_noindex:${home}`, url: check.finalUrl, evidence: {} });
  if (robotsTxt && robotsBlocksAll(robotsTxt)) out.push({ kind: 'seo.robots_block_all', dedupeKey: `seo.robots_block_all:${home}`, url: new URL('/robots.txt', home).toString(), evidence: {} });
  if (sslDays !== null && sslDays < 14) {
    out.push({ kind: 'seo.ssl_expiring', dedupeKey: `seo.ssl_expiring:${home}`, url: home, severity: sslDays < 0 ? 'critico' : 'importante', metric: 'dias', value: sslDays, evidence: { daysLeft: sslDays } });
  }
  return out;
}

/** ¿Hay que avisar ya? Solo en la pasada de confirmación (30 min después) y si sigue habiendo algo crítico. */
export function shouldAlert(confirmPass: boolean, current: FindingInput[], severityOf: (f: FindingInput) => string): boolean {
  return confirmPass && current.some((f) => severityOf(f) === 'critico');
}

export type CwvRow = { url: string; lcpMs: number | null; inpMs: number | null; cls: number | null; category: 'FAST' | 'AVERAGE' | 'SLOW' | null; scope: 'url' | 'origin' };

export function velocidadFindings(rows: CwvRow[]): FindingInput[] {
  const out: FindingInput[] = [];
  // Si varias URLs caen en los datos del origen, es el mismo dato: un solo hallazgo para el origen.
  const seenOrigin = new Set<string>();
  for (const r of rows) {
    if (r.category !== 'SLOW' && r.category !== 'AVERAGE') continue;
    let key = r.url;
    if (r.scope === 'origin') {
      try {
        key = new URL(r.url).origin;
      } catch {
        continue;
      }
      if (seenOrigin.has(key)) continue;
      seenOrigin.add(key);
    }
    const kind = r.category === 'SLOW' ? 'seo.cwv_slow' : 'seo.cwv_average';
    out.push({ kind, dedupeKey: `${kind}:${key}`, url: key, metric: 'lcp_ms', value: r.lcpMs, evidence: { lcpMs: r.lcpMs, inpMs: r.inpMs, cls: r.cls, scope: r.scope } });
  }
  return out;
}

const pct = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

/**
 * Páginas que pierden clics: 4 semanas frente a las 4 anteriores, con al menos `minClicks` antes y una caída del 30 %
 * o más. Si hay datos del año anterior y entonces también cayó (al menos la mitad), se marca como temporada (info).
 * `yoy` = null cuando el histórico no llega: entonces no se afirma nada de la temporada.
 */
export function pageDropFindings(cur: Map<string, number>, prev: Map<string, number>, yoy: { cur: Map<string, number>; prev: Map<string, number> } | null, minClicks = 30): FindingInput[] {
  const out: (FindingInput & { lost: number })[] = [];
  for (const [page, before] of prev) {
    if (before < minClicks) continue;
    const now = cur.get(page) ?? 0;
    const change = pct(now, before);
    if (change === null || change > -30) continue;
    const ly = yoy ? pct(yoy.cur.get(page) ?? 0, yoy.prev.get(page) ?? 0) : null;
    const seasonal = ly !== null && ly <= change / 2;
    out.push({
      kind: 'seo.page_drop',
      dedupeKey: `seo.page_drop:${page}`,
      url: page,
      severity: seasonal ? 'info' : change <= -50 ? 'importante' : 'aviso',
      metric: 'cambio_clics_pct',
      value: change,
      evidence: { clicks: now, prevClicks: before, change, yoyChange: ly, seasonal, yoyKnown: yoy !== null },
      lost: before - now
    });
  }
  return out
    .sort((a, b) => b.lost - a.lost)
    .slice(0, 15)
    .map(({ lost: _lost, ...f }) => f);
}

/** Desde qué fecha hay histórico suficiente para comparar con el año anterior. */
export function yoyAvailable(firstDate: string | null, needFrom: string): boolean {
  return Boolean(firstDate && firstDate <= needFrom);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export type LabRow = { url: string; viewportOk: boolean | null; httpsOk: boolean | null; insecureRequests: string[]; unsizedImages: number; imageSavingsKb: number; totalKb: number | null; score: number | null; imagesKnown: boolean };

/** Tipos que salen de la prueba de laboratorio (se sincronizan con la fuente de velocidad). */
export const LAB_KINDS = ['seo.viewport_missing', 'seo.mixed_content', 'seo.images_unsized', 'seo.images_heavy'];

/**
 * Hallazgos de la prueba de laboratorio (Lighthouse) de unas pocas páginas representativas: sin viewport móvil,
 * contenido mixto (recursos http en una página https), imágenes sin tamaño (3 o más) e imágenes que se pueden aligerar
 * (150 KB o más de ahorro).
 */
export function labFindings(rows: LabRow[]): FindingInput[] {
  const out: FindingInput[] = [];
  for (const r of rows) {
    const k = r.url;
    if (r.viewportOk === false) out.push({ kind: 'seo.viewport_missing', dedupeKey: `seo.viewport_missing:${k}`, url: r.url });
    const isHttps = r.url.startsWith('https://');
    if (isHttps && (r.insecureRequests.length || r.httpsOk === false)) out.push({ kind: 'seo.mixed_content', dedupeKey: `seo.mixed_content:${k}`, url: r.url, metric: 'recursos', value: r.insecureRequests.length, evidence: { samples: r.insecureRequests.slice(0, 10) } });
    if (r.imagesKnown && r.unsizedImages >= 3) out.push({ kind: 'seo.images_unsized', dedupeKey: `seo.images_unsized:${k}`, url: r.url, metric: 'imagenes', value: r.unsizedImages });
    if (r.imagesKnown && r.imageSavingsKb >= 150) out.push({ kind: 'seo.images_heavy', dedupeKey: `seo.images_heavy:${k}`, url: r.url, metric: 'ahorro_kb', value: r.imageSavingsKb, evidence: { totalKb: r.totalKb, score: r.score } });
  }
  return out;
}

/** Páginas representativas para la prueba de laboratorio: la portada y las más visitadas de secciones distintas. */
export function representativeUrls(home: string, topByClicks: string[], max = 5, keep: string[] = []): string[] {
  // Primero las que ya tienen hallazgos abiertos (para poder resolverlos al arreglarse), luego la portada.
  const out = [...new Set([...keep, home])].slice(0, max);
  const seen = new Set<string>(['/']);
  for (const u of topByClicks) {
    if (out.length >= max) break;
    let seg: string;
    try {
      const x = new URL(u);
      seg = `/${x.pathname.split('/').filter(Boolean)[0] ?? ''}`;
    } catch {
      continue;
    }
    if (seen.has(seg) || out.includes(u)) continue;
    seen.add(seg);
    out.push(u);
  }
  // Si casi todo cuelga de la raíz (permalinks planos de WordPress), se completa con las más visitadas.
  for (const u of topByClicks) {
    if (out.length >= max) break;
    if (!out.includes(u)) out.push(u);
  }
  return out;
}

/**
 * Qué hallazgos del laboratorio se pueden resolver en esta pasada: solo los de las URLs medidas (si una falló, lo suyo
 * no se toca). Devuelve, además de lo nuevo, los abiertos de las URLs no medidas para que syncFindings los conserve.
 */
export function labSyncSet(found: FindingInput[], measured: Set<string>, openLab: { kind: string; dedupeKey: string; url: string | null; value: number | null; evidence: Record<string, unknown> }[]): FindingInput[] {
  const keep = openLab.filter((f) => !f.url || !measured.has(f.url)).map((f) => ({ kind: f.kind, dedupeKey: f.dedupeKey, url: f.url, value: f.value, evidence: f.evidence }));
  return [...found, ...keep];
}
