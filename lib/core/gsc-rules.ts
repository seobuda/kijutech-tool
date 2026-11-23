// Search Console en detalle: reglas puras (cimientos, 23 nov 2026). Se prueban sin base de datos ni Google.
import { createHash } from 'crypto';

export const SEARCH_TYPES = { web: 1, image: 2, video: 3, news: 4, discover: 5, googleNews: 6 } as const;
export type SearchTypeName = keyof typeof SEARCH_TYPES;
export const DEVICES: Record<string, number> = { MOBILE: 1, DESKTOP: 2, TABLET: 3 };

/** Huella estable de un texto (consulta o URL) para los diccionarios. */
export function textHash(s: string): string {
  return createHash('sha1').update(s).digest('hex');
}

/** Nombre de la partición mensual de gsc_daily para una fecha (gsc_daily_y2026m11). */
export function partitionName(date: string): string {
  const [y, m] = date.split('-');
  return `gsc_daily_y${y}m${m}`;
}

/** Límites [desde, hasta) de la partición del mes de una fecha. */
export function partitionBounds(date: string): { from: string; to: string } {
  const [y, m] = date.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { from: `${y}-${String(m).padStart(2, '0')}-01`, to: next };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
};
export { addDays as gscAddDays };

/** Días que se vuelven a pedir cada día: los últimos `days` hasta hoy menos el retraso (Google corrige los recientes). */
export function dailyWindow(today: Date, lagDays = 2, days = 4): string[] {
  const end = addDays(ymd(today), -lagDays);
  return Array.from({ length: days }, (_, i) => addDays(end, -(days - 1 - i)));
}

/**
 * Siguiente tramo del histórico hacia atrás: desde el cursor (excluido) `chunk` días, sin pasar de `minDate`.
 * null cuando ya no queda nada que pedir.
 */
export function backfillChunk(cursor: string, minDate: string, chunk = 14): string[] | null {
  const days: string[] = [];
  let d = addDays(cursor, -1);
  while (d >= minDate && days.length < chunk) {
    days.push(d);
    d = addDays(d, -1);
  }
  return days.length ? days : null;
}

/** Hasta dónde llega el histórico de Search Console (16 meses ≈ 486 días). */
export function historyStart(today: Date, historyDays = 486): string {
  return addDays(ymd(today), -historyDays);
}

export type GscApiRow = { keys: string[]; clicks: number; impressions: number; position: number };

/** posición × impresiones: se guarda así para poder sumar y volver a la posición media con pos_sum / impresiones. */
export function posSum(position: number, impressions: number): number {
  return (Number(position) || 0) * (Number(impressions) || 0);
}

/** Clics de consultas anónimas: total del día menos la suma de las filas con consulta (nunca negativo). */
export function anonymousClicks(totalClicks: number, queryClicks: number): number {
  return Math.max(0, Math.round(totalClicks) - Math.round(queryClicks));
}

/** Porcentaje de clics anónimos de un periodo (null si no hay clics). */
export function anonymousShare(totalClicks: number, queryClicks: number): number | null {
  if (totalClicks <= 0) return null;
  return anonymousClicks(totalClicks, queryClicks) / totalClicks;
}

/** Normaliza una fila de detalle consulta × página × dispositivo de la API. null si le falta algo. */
export function detailRow(r: GscApiRow): { query: string; page: string; device: number; clicks: number; impressions: number; posSum: number } | null {
  const [query, page, device] = r.keys ?? [];
  if (!query || !page) return null;
  return {
    query: query.slice(0, 2000),
    page: page.slice(0, 2000),
    device: DEVICES[String(device ?? '').toUpperCase()] ?? 1,
    clicks: Math.round(r.clicks) || 0,
    impressions: Math.round(r.impressions) || 0,
    posSum: posSum(r.position, r.impressions)
  };
}

/** Tipo de propiedad por su identificador: «sc-domain:…» es de dominio; una URL, de prefijo. */
export function propertyKind(siteUrl: string): 'dominio' | 'prefijo' | 'plataforma' {
  if (/^sc-domain:/i.test(siteUrl)) return 'dominio';
  if (/^https?:\/\//i.test(siteUrl)) return 'prefijo';
  return 'plataforma';
}

/** ¿Merece reintento un error de Google? (límite de peticiones o fallo temporal del servidor). */
export function isRetryableGoogleError(message: string): boolean {
  return /\((429|500|502|503|504)\)|quota|rate limit|backend error/i.test(message);
}
