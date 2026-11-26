// SEO · Local, tanda 5b: geo-grid y nombres sospechosos en Maps (27 nov 2026; docs/DISENO-SEO-GEOGRID.md con la auditoría).
// Reglas PURAS: cuadrícula, puesto del cliente, resumen y comparación, nombres sospechosos y franja horaria de envío.
import { normText } from '@/lib/seo/expediente/rules';

export const GEOGRID_SOURCE = 'seo.local:geogrid';
export const GRID_SIZE = 5;
export const OUT_RANK = 21;

/** Paso y zoom según cómo atiende el negocio: en su local, cuadrícula de ±1 km; a domicilio, ±3 km. Online: sin cuadrícula. */
export function gridParams(atencion: string | null): { stepKm: number; zoom: number } | null {
  if (atencion === 'online') return null;
  return atencion === 'domicilio' || atencion === 'ambos' ? { stepKm: 1.5, zoom: 13 } : { stepKm: 0.5, zoom: 14 };
}

const r7 = (x: number) => Math.round(x * 1e7) / 1e7;

/** Puntos de la cuadrícula (fila 0 = norte), separados `stepKm`: Δlat = d/111,32 y Δlng = d/(111,32·cos lat). */
export function gridPoints(lat: number, lng: number, stepKm: number, size = GRID_SIZE): { row: number; col: number; lat: number; lng: number }[] {
  const half = (size - 1) / 2;
  const dLat = stepKm / 111.32;
  const dLng = stepKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  const out: { row: number; col: number; lat: number; lng: number }[] = [];
  for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) out.push({ row, col, lat: r7(lat + (half - row) * dLat), lng: r7(lng + (col - half) * dLng) });
  return out;
}

export const coordinate = (lat: number, lng: number, zoom: number) => `${r7(lat)},${r7(lng)},${zoom}z`;

/** Puesto del cliente en un punto: solo por cid (o place_id); los anuncios ya vienen fuera. Si no sale, null. */
export function clientRank(items: { rank: number; cid: string | null; placeId: string | null }[], cid: string, placeId: string | null): number | null {
  const hit = items.find((i) => (i.cid && i.cid === cid) || (placeId && i.placeId === placeId));
  return hit ? hit.rank : null;
}

/** Resumen de una ejecución: media de puesto (fuera = 21), % de puntos en el top 3 y puntos con dato. */
export function summarize(ranks: (number | null | undefined)[]): { avg: number | null; top3Pct: number; measured: number } {
  const got = ranks.filter((r) => r !== undefined) as (number | null)[];
  if (!got.length) return { avg: null, top3Pct: 0, measured: 0 };
  const vals = got.map((r) => (r === null || r > 20 ? OUT_RANK : r));
  return { avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10, top3Pct: Math.round((got.filter((r) => r !== null && r <= 3).length / got.length) * 100), measured: got.length };
}

export type RunKey = { keyword: string; lat: number; lng: number; stepKm: number; zoom: number };
/** Solo se comparan ejecuciones con los mismos parámetros (centro, paso, zoom y búsqueda). */
export const comparable = (a: RunKey, b: RunKey) => a.keyword === b.keyword && a.stepKm === b.stepKm && a.zoom === b.zoom && Math.abs(a.lat - b.lat) < 1e-4 && Math.abs(a.lng - b.lng) < 1e-4;

/** Caída: la media empeora 3+ y al menos 8 puntos bajan 3+ puestos (mismos puntos, ejecuciones completas al 80 %). */
export function gridDrop(cur: (number | null)[], prev: (number | null)[]): boolean {
  if (cur.length !== prev.length || !cur.length) return false;
  const v = (r: number | null) => (r === null || r > 20 ? OUT_RANK : r);
  const a = summarize(cur);
  const b = summarize(prev);
  if (a.avg === null || b.avg === null || a.measured < cur.length * 0.8 || b.measured < prev.length * 0.8) return false;
  const worse = cur.filter((r, i) => v(r) - v(prev[i]) >= 3).length;
  return a.avg - b.avg >= 3 && worse >= 8;
}

const FILLERS = /\b(24\s?h|24\s?horas|urgente?s?|barat[oa]s?|econ[oó]mic[oa]s?|mejor(es)?|top|n[ºo°]\s?1|express|r[aá]pid[oa]s?|low cost|ofertas?|abierto 24)\b/i;

/**
 * ¿Nombre sospechoso de relleno con palabras clave? Hacen falta 2 señales independientes (servicio + población a la vez,
 * rellenos tipo «24h/urgente/barato», separadores con varios tramos, o más de 40 caracteres). No se marca si el nombre
 * coincide con la raíz de su dominio (suele ser el nombre real del negocio).
 */
export function suspiciousName(title: string, domain: string | null, services: string[], towns: string[]): { suspicious: boolean; signals: string[] } {
  const t = normText(title);
  const signals: string[] = [];
  const hasService = services.some((s) => normText(s).split(' ').filter((w) => w.length >= 5).some((w) => t.includes(w.replace(/s$/, ''))));
  const hasTown = towns.some((x) => normText(x).length >= 4 && t.includes(normText(x)));
  if (hasService && hasTown) signals.push('servicio y población en el nombre');
  if (FILLERS.test(title)) signals.push('reclamos como «24h», «urgente» o «barato»');
  // Tramos separados por « | », « - », « – » o « · » (con espacios: «Gas-Natural» no cuenta).
  if (title.split(/\s?\|\s?|\s[-–·]\s/).filter((x) => x.trim().length > 2).length >= 3) signals.push('varios tramos separados');
  if (title.length > 40) signals.push('nombre muy largo');
  const root = (domain ?? '').replace(/^www\./, '').split('.')[0].replace(/[^a-z0-9]/g, '');
  const compact = t.replace(/[^a-z0-9]/g, '');
  if (root.length >= 4 && (compact.startsWith(root) || root.startsWith(compact.slice(0, Math.max(4, root.length))))) return { suspicious: false, signals };
  return { suspicious: signals.length >= 2, signals };
}

/** Quita las poblaciones de una búsqueda (en Maps la ubicación la da el punto). */
export function stripTowns(keyword: string, towns: string[]): string {
  let k = ` ${keyword.toLowerCase()} `;
  for (const t of towns) k = k.replace(new RegExp(`\\s(en\\s|a\\s)?${t.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s`, 'g'), ' ');
  return k.replace(/\s+/g, ' ').trim();
}

/** Hora de Madrid (0-23) y día de la semana (0 = domingo) de una fecha. */
function madrid(d: Date): { hour: number; dow: number; ymd: string } {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? '';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return { hour: Number(get('hour')) % 24, dow: days.indexOf(get('weekday')), ymd: `${get('year')}-${get('month')}-${get('day')}` };
}

/** ¿Es franja de envío? Días laborables de 10:00 a 11:59 en Madrid (Maps favorece a los negocios abiertos). */
export function inSendWindow(d: Date): boolean {
  const m = madrid(d);
  return m.dow >= 1 && m.dow <= 5 && m.hour >= 10 && m.hour < 12;
}

/** Siguiente momento dentro de la franja (en pasos de 30 min; como mucho 8 días). */
export function nextSendWindow(from: Date): Date {
  let t = new Date(Math.ceil(from.getTime() / 1_800_000) * 1_800_000);
  for (let i = 0; i < 8 * 48 && !inSendWindow(t); i++) t = new Date(t.getTime() + 1_800_000);
  return t;
}
