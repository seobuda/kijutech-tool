// SEO · Posiciones: reglas PURAS (parte 4, 26 nov 2026; docs/DISENO-SEO-POSICIONES.md). Semilla de búsquedas a seguir,
// lectura compacta de una SERP, cuota de visibilidad y caídas. Sin base de datos ni red.
import { normText } from '@/lib/seo/expediente/rules';

export type SeedOrigin = 'gsc' | 'servicio_zona' | 'marca' | 'manual';
export type SeedKeyword = { keyword: string; origin: SeedOrigin; impressions?: number };

export const MAX_KEYWORDS = 50;
const MAX_SERVICE_ZONE = 15;
const MAX_GSC = 25;

/** Forma canónica para comparar búsquedas (minúsculas, sin tildes ni signos, espacios simples). */
export const kwKey = (k: string) => normText(k);

/** Poblaciones de la zona («Sabadell, Terrassa y el Vallès» → [sabadell, terrassa, valles]). */
export function zoneTowns(zona: string | null): string[] {
  if (!zona) return [];
  return [
    ...new Set(
      zona
        .split(/,|;|\/|\by\b|\bi\b|\n/i)
        .map((t) => t.replace(/\b(el|la|els|les|l'|del|de la|comarca de|provincia de|área metropolitana de|area metropolitana de)\b/gi, ' ').trim())
        .filter((t) => t.length >= 3 && t.length <= 30 && t.split(/\s+/).length <= 3)
    )
  ].slice(0, 5);
}

/**
 * La semilla: búsquedas de GSC sin marca (las de más impresiones), servicio × población (como mucho 15, primero la
 * población principal), la marca y las que añada una persona. Sin duplicados y como mucho 50. Las manuales mandan.
 */
export function buildSeed(input: { gscQueries: { query: string; impressions: number }[]; services: string[]; zona: string | null; brand: string | null; manual: string[] }): SeedKeyword[] {
  const out: SeedKeyword[] = [];
  const seen = new Set<string>();
  const push = (keyword: string, origin: SeedOrigin, impressions?: number) => {
    const k = kwKey(keyword);
    if (!k || k.length < 3 || seen.has(k) || out.length >= MAX_KEYWORDS) return;
    seen.add(k);
    out.push({ keyword: keyword.trim().toLowerCase().slice(0, 120), origin, impressions });
  };
  for (const m of input.manual) push(m, 'manual');
  if (input.brand) push(input.brand, 'marca');
  const towns = zoneTowns(input.zona);
  let sz = 0;
  // Primero cada servicio con la población principal; luego con las demás.
  for (const town of towns) {
    for (const s of input.services) {
      if (sz >= MAX_SERVICE_ZONE) break;
      // Si el servicio ya lleva una población, no se le añade otra.
      const base = s.trim().toLowerCase();
      if (towns.some((t) => kwKey(base).includes(kwKey(t)))) continue;
      const before = out.length;
      push(`${base} ${town.toLowerCase()}`, 'servicio_zona');
      if (out.length > before) sz++;
    }
  }
  let g = 0;
  for (const q of [...input.gscQueries].sort((a, b) => b.impressions - a.impressions)) {
    if (g >= MAX_GSC) break;
    const before = out.length;
    push(q.query, 'gsc', q.impressions);
    if (out.length > before) g++;
  }
  return out;
}

/** CTR aproximado por posición orgánica (curva pública media; solo para ponderar la cuota de visibilidad). */
const CTR = [0, 0.28, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018];
export const ctrAt = (pos: number | null) => (pos && pos >= 1 && pos <= 10 ? CTR[pos] : 0);

/**
 * Cuota de visibilidad de cada dominio en un conjunto de búsquedas: suma del CTR de su posición en el top 10, ponderada
 * por el volumen de la búsqueda si se conoce (si no, peso 1), sobre el total posible. 0-100.
 */
export function visibilityShare(rows: { volume: number | null; top10: string[] }[], domains: string[]): Map<string, number> {
  const share = new Map<string, number>(domains.map((d) => [d, 0]));
  let max = 0;
  for (const r of rows) {
    const w = r.volume && r.volume > 0 ? r.volume : 1;
    max += w * CTR[1];
    r.top10.forEach((d, i) => {
      if (share.has(d)) share.set(d, share.get(d)! + w * ctrAt(i + 1));
    });
  }
  for (const [d, v] of share) share.set(d, max ? Math.round((v / max) * 1000) / 10 : 0);
  return share;
}

// --- Idioma y ubicación ----------------------------------------------------------------------------------------------

/** Marcas típicas del catalán escrito (para el idioma de cada búsqueda; si no hay pistas, el idioma principal del proyecto). */
const CA_MARKERS = /(ç|l·l|\b(amb|per a|dels|els|les|a prop|preu|preus|barri|reformes|reparació|serveis|empresa de|botiga|perruqueria|fusteria|lampisteria|lampista|advocats|gestoria a)\b)/i;
export function keywordLanguage(keyword: string, projectLangs: string[]): string {
  const main = projectLangs[0] === 'ca' ? 'ca' : 'es';
  if (projectLangs.includes('ca') && CA_MARKERS.test(keyword)) return 'ca';
  return main === 'ca' && !CA_MARKERS.test(keyword) && projectLangs.includes('es') ? 'es' : main;
}

/**
 * Ubicación de DataForSEO para el proyecto: la población principal de la zona si está en su lista (City), si no la
 * provincia o comunidad que la contenga por nombre, y si no, España (`approx` = true: se avisa en la pantalla).
 */
export function pickLocation(towns: string[], list: { name: string; type: string }[]): { name: string; approx: boolean } {
  const norm = (s: string) => normText(s);
  for (const t of towns) {
    const k = norm(t);
    const city = list.find((l) => /city|municipality/i.test(l.type) && norm(l.name.split(',')[0]) === k);
    if (city) return { name: city.name, approx: false };
  }
  for (const t of towns) {
    const k = norm(t);
    const region = list.find((l) => /province|region|county|autonomous/i.test(l.type) && norm(l.name.split(',')[0]).includes(k));
    if (region) return { name: region.name, approx: true };
  }
  return { name: 'Spain', approx: true };
}

// --- Lectura de una SERP para el cliente -----------------------------------------------------------------------------

export type SerpForClient = {
  organic: { rank: number; domain: string; url: string }[];
  localPack: { rank: number; title: string; domain: string | null; paid: boolean }[];
  aio: { present: boolean; domains: string[] };
  features: string[];
};
export type CheckRow = { position: number | null; url: string | null; clientUrls: string[]; localPack: boolean; localRank: number | null; aio: boolean; aioCites: boolean; features: string[]; top10: string[]; top10Urls: string[] };

const sameDomain = (a: string | null | undefined, b: string) => Boolean(a) && (a === b || a!.endsWith(`.${b}`));

/** Lo que interesa de una SERP para un cliente: su mejor posición y URL, todas sus URLs, el mapa (por dominio o por nombre, sin fichas pagadas), la IA y el top 10. */
export function readSerp(serp: SerpForClient, clientDomain: string, brandTokens: string[]): CheckRow {
  const mine = serp.organic.filter((o) => sameDomain(o.domain, clientDomain)).sort((a, b) => a.rank - b.rank);
  const lp = serp.localPack.filter((l) => !l.paid);
  const nameMatch = (title: string) => {
    const t = normText(title);
    return brandTokens.length > 0 && brandTokens.every((b) => t.includes(b));
  };
  const inPack = lp.find((l) => sameDomain(l.domain, clientDomain) || nameMatch(l.title));
  return {
    position: mine[0]?.rank ?? null,
    url: mine[0]?.url ?? null,
    clientUrls: [...new Set(mine.map((m) => m.url))].slice(0, 10),
    localPack: lp.length > 0,
    localRank: inPack ? lp.indexOf(inPack) + 1 : null,
    aio: serp.aio.present,
    aioCites: serp.aio.domains.some((d) => sameDomain(d, clientDomain)),
    features: serp.features,
    top10: serp.organic.filter((o) => o.rank <= 10).sort((a, b) => a.rank - b.rank).map((o) => o.domain),
    top10Urls: serp.organic.filter((o) => o.rank <= 10).sort((a, b) => a.rank - b.rank).map((o) => o.url)
  };
}

// --- Caídas con margen (histéresis) ----------------------------------------------------------------------------------

export type HistoryPoint = { position: number | null; localPack: boolean; localRank: number | null; ok: boolean };

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};

/**
 * ¿Ha caído de verdad? (historia de la más reciente a la más antigua; solo consultas que salieron bien)
 * - Entra si las 2 últimas están fuera del top 10 (o sin posición) y antes estaba dentro (mediana de las 3 anteriores ≤ 10).
 * - Si ya estaba abierta, sigue hasta que vuelva al 8 o mejor.
 */
export function rankDropState(history: HistoryPoint[], wasOpen: boolean): boolean {
  const h = history.filter((x) => x.ok);
  if (h.length < 2) return wasOpen;
  const out = (p: number | null) => p === null || p > 10;
  if (wasOpen) return !(h[0].position !== null && h[0].position <= 8);
  const before = h.slice(2, 5).map((x) => x.position).filter((p): p is number => p !== null);
  const med = median(before);
  return out(h[0].position) && out(h[1].position) && med !== null && med <= 10;
}

/** ¿Ha salido del mapa? El paquete sigue existiendo, el cliente falta en las 2 últimas y antes estaba en alguna de las 3 anteriores. */
export function lostLocalPackState(history: HistoryPoint[], wasOpen: boolean): boolean {
  const h = history.filter((x) => x.ok);
  if (h.length < 2) return wasOpen;
  if (wasOpen) return h[0].localRank === null;
  const missing = h[0].localPack && h[1].localPack && h[0].localRank === null && h[1].localRank === null;
  return missing && h.slice(2, 5).some((x) => x.localRank !== null);
}

/** Búsqueda «importante» para avisar de caídas: de servicio × zona, marca o manual, o de GSC con 100+ impresiones. */
export const isImportant = (k: { origin: string; impressions: number | null }) => k.origin !== 'gsc' || (k.impressions ?? 0) >= 100;
