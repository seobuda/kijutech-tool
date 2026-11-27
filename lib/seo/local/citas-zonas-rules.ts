// SEO · Local, tanda 5c: NAP antiguo publicado, directorios por sector, páginas de zona según la demanda y páginas puerta
// (27 nov 2026; docs/DISENO-SEO-CITAS-ZONAS.md con la auditoría Opus). Reglas PURAS.
import { normPhone, normText } from '@/lib/seo/expediente/rules';

export const PUERTAS_SOURCE = 'seo.salud:puertas';
export const NAP_SOURCE = 'seo.local:nap_antiguo';

// --- NAP antiguo ---------------------------------------------------------------------------------------------------------

const digits = (s: string) => s.replace(/\D/g, '');
/** Los 9 dígitos de un teléfono español (sin +34). null si no lo es. */
export function phone9(p: string | null | undefined): string | null {
  const n = normPhone(p ?? '');
  if (!n) return null;
  const d = digits(n).replace(/^34(?=\d{9}$)/, '');
  return /^[6789]\d{8}$/.test(d) ? d : null;
}

/** Búsqueda de Google con el teléfono en sus formatos habituales (fijo 93 123 45 67; móvil 600 12 34 56). */
export function phoneQuery(p9: string): string {
  const f = p9.startsWith('6') || p9.startsWith('7') ? [`${p9.slice(0, 3)} ${p9.slice(3, 5)} ${p9.slice(5, 7)} ${p9.slice(7)}`, `${p9.slice(0, 3)} ${p9.slice(3, 6)} ${p9.slice(6)}`] : [`${p9.slice(0, 2)} ${p9.slice(2, 5)} ${p9.slice(5, 7)} ${p9.slice(7)}`, `${p9.slice(0, 3)} ${p9.slice(3, 5)} ${p9.slice(5, 7)} ${p9.slice(7)}`, `${p9.slice(0, 3)} ${p9.slice(3, 6)} ${p9.slice(6)}`];
  return [p9, ...f].map((x) => `"${x}"`).join(' OR ');
}

/** Resultados (de otra web que no es la del cliente) donde el teléfono aparece de verdad en el título o el fragmento. */
export function phoneHits(results: { url: string; domain: string; title: string; description?: string }[], p9: string, clientDomain: string | null): string[] {
  return results
    .filter((r) => !clientDomain || !(r.domain === clientDomain || r.domain.endsWith(`.${clientDomain}`)))
    .filter((r) => digits(`${r.title} ${r.description ?? ''}`).includes(p9))
    .map((r) => r.url)
    .slice(0, 10);
}

/** Teléfonos antiguos o distintos del actual que conoce el sistema (expediente, fotos de la ficha), sin repetir; como mucho 3. */
export function oldPhones(known: (string | null | undefined)[], current: string | null): string[] {
  const cur = phone9(current);
  return [...new Set(known.map(phone9).filter((p): p is string => Boolean(p) && p !== cur))].slice(0, 3);
}

// --- Directorios por sector (revisión manual) --------------------------------------------------------------------------

export type Directory = { name: string; search: (q: string) => string };
const enc = encodeURIComponent;
const GENERAL: Directory[] = [
  { name: 'Páginas Amarillas', search: (q) => `https://www.google.com/search?q=${enc(`site:paginasamarillas.es ${q}`)}` },
  { name: 'QDQ', search: (q) => `https://www.google.com/search?q=${enc(`site:qdq.com ${q}`)}` },
  { name: 'Cylex', search: (q) => `https://www.google.com/search?q=${enc(`site:cylex.es ${q}`)}` },
  { name: 'Facebook', search: (q) => `https://www.google.com/search?q=${enc(`site:facebook.com ${q}`)}` },
  { name: 'Apple Business Connect (Mapas de Apple)', search: () => 'https://businessconnect.apple.com/' },
  { name: 'Bing Places', search: () => 'https://www.bingplaces.com/' }
];
const SECTOR: { re: RegExp; dirs: Directory[] }[] = [
  { re: /(dentist|cl[ií]nica|m[eé]dic|fisioterap|psic[oó]log|salud|podolog|[oó]ptic)/i, dirs: [{ name: 'Doctoralia', search: (q) => `https://www.google.com/search?q=${enc(`site:doctoralia.es ${q}`)}` }, { name: 'Top Doctors', search: (q) => `https://www.google.com/search?q=${enc(`site:topdoctors.es ${q}`)}` }] },
  { re: /(restaurante|\bbar\b|cafeter|pizzer|hotel|alojamiento)/i, dirs: [{ name: 'TripAdvisor', search: (q) => `https://www.google.com/search?q=${enc(`site:tripadvisor.es ${q}`)}` }, { name: 'TheFork', search: (q) => `https://www.google.com/search?q=${enc(`site:thefork.es ${q}`)}` }] },
  { re: /(reforma|fontaner|electricist|carpinter|pintor|cerrajer|construcci|instalacion|climatizaci|mudanz|limpieza)/i, dirs: [{ name: 'Habitissimo', search: (q) => `https://www.google.com/search?q=${enc(`site:habitissimo.es ${q}`)}` }, { name: 'Cronoshare', search: (q) => `https://www.google.com/search?q=${enc(`site:cronoshare.com ${q}`)}` }] }
];
/** Directorios a revisar a mano para este negocio: los del sector (por su categoría) y los generales. */
export function directoriesFor(category: string | null): Directory[] {
  const sector = SECTOR.filter((s) => category && s.re.test(category)).flatMap((s) => s.dirs);
  return [...sector, ...GENERAL];
}

// --- Páginas de zona según la demanda --------------------------------------------------------------------------------

/** ¿Aparece la población como palabras completas (normalizadas) en el texto? «Vic» no está en «servicio». */
export function hasTown(text: string | null | undefined, town: string): boolean {
  const t = normText(town);
  if (!t) return false;
  return ` ${normText(text ?? '').replace(/-/g, ' ')} `.includes(` ${t} `);
}

const isBlog = (u: string) => /\/(blog|noticias|news|articulos?|tag|category|categoria)\//i.test(u);

/**
 * Poblaciones con demanda y sin página propia: búsquedas «servicio + población» con volumen o impresiones, fuera del
 * top 10, cuya población no sale en el título, el H1 o la URL de ninguna página indexable que no sea del blog.
 */
export function missingZonePages(keywords: { keyword: string; volume: number | null; impressions: number | null; position: number | null }[], towns: string[], pages: { url: string; title: string | null; h1: string[] }[]): { town: string; keyword: string }[] {
  const out: { town: string; keyword: string }[] = [];
  const seen = new Set<string>();
  const own = pages.filter((p) => !isBlog(p.url));
  for (const k of keywords) {
    if (!((k.volume ?? 0) > 0 || (k.impressions ?? 0) > 0)) continue;
    if (k.position !== null && k.position <= 10) continue;
    const town = towns.find((t) => hasTown(k.keyword, t));
    if (!town || seen.has(normText(town))) continue;
    const covered = own.some((p) => hasTown(p.title, town) || p.h1.some((h) => hasTown(h, town)) || hasTown(decodeURIComponent(new URL(p.url).pathname).replace(/[/_]/g, ' '), town));
    if (covered) continue;
    seen.add(normText(town));
    out.push({ town, keyword: k.keyword });
  }
  return out;
}

// --- Páginas puerta --------------------------------------------------------------------------------------------------

/** Texto visible por bloques (párrafos, encabezados, listas), sin scripts ni estilos. */
export function textBlocks(html: string): string[] {
  return html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|h[1-6]|li|div|section|article|td|br|header|footer|nav)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 20);
}

/** El texto propio de una página: sin los bloques que también están en la portada (menú, pie) y con las poblaciones tapadas. */
export function ownText(blocks: string[], homeBlocks: Set<string>, towns: string[]): string {
  let t = blocks.filter((b) => !homeBlocks.has(b)).join(' ');
  t = normText(t);
  for (const town of towns.map(normText).filter(Boolean).sort((a, b) => b.length - a.length)) t = ` ${t} `.split(` ${town} `).join(' poblacionx ').trim();
  return t;
}

export function shingles(text: string, n = 3): Set<string> {
  const w = text.split(' ').filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Grupos de 3+ páginas casi iguales (Jaccard ≥ 0,8 de su texto propio con la población tapada). */
export function doorwayGroups(pages: { url: string; text: string }[], threshold = 0.8): string[][] {
  const sh = pages.map((p) => shingles(p.text));
  const parent = pages.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < pages.length; i++) for (let j = i + 1; j < pages.length; j++) if (sh[i].size >= 20 && sh[j].size >= 20 && jaccard(sh[i], sh[j]) >= threshold) parent[find(i)] = find(j);
  const groups = new Map<number, string[]>();
  pages.forEach((p, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), p.url]));
  return [...groups.values()].filter((g) => g.length >= 3);
}

/** Candidatas: páginas con una población en el título o la URL, o de un patrón de URL repetido (prefijo común, 3+). */
export function doorwayCandidates(pages: { url: string; title: string | null }[], towns: string[], max = 20): { urls: string[]; slugTowns: string[] } {
  const byTown = pages.filter((p) => towns.some((t) => hasTown(p.title, t) || hasTown(decodeURIComponent(new URL(p.url).pathname).replace(/[/_]/g, ' '), t)));
  const groups = new Map<string, { url: string; tail: string }[]>();
  for (const p of pages) {
    const path = new URL(p.url).pathname.replace(/\/+$/, '');
    const m = path.match(/^(.*\/[a-z0-9-]+?)-([a-z0-9]+(?:-[a-z0-9]+)?)$/i);
    if (!m) continue;
    groups.set(m[1], [...(groups.get(m[1]) ?? []), { url: p.url, tail: m[2] }]);
  }
  const byPattern = [...groups.values()].filter((g) => g.length >= 3).flat();
  const urls = [...new Set([...byTown.map((p) => p.url), ...byPattern.map((p) => p.url)])].slice(0, max);
  const slugTowns = [...new Set(byPattern.map((p) => p.tail.replace(/-/g, ' ')))];
  return { urls, slugTowns };
}
