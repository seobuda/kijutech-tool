// SEO · Local, tanda 5a: reglas PURAS de la ficha de Google (26 nov 2026; docs/DISENO-SEO-LOCAL.md). Sin base de datos ni
// red: identificar la ficha, comparar con lo confirmado, reseñas frente a la competencia y el enlace para pedir reseñas.
import { normPhone, normText } from '@/lib/seo/expediente/rules';
import type { FindingInput } from '@/lib/core/findings-rules';

export const FICHA_SOURCE = 'seo.local:ficha';

/** El cid de una URL de Google Maps («?cid=123…» o «!1s0x…:0xHEX»), o un cid pegado tal cual. null si no se reconoce. */
export function cidFromInput(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{6,25}$/.test(s)) return s;
  const q = s.match(/[?&]cid=(\d{6,25})/);
  if (q) return q[1];
  const hex = s.match(/0x[0-9a-f]+:0x([0-9a-f]+)/i);
  if (hex) {
    try {
      return BigInt(`0x${hex[1]}`).toString(10);
    } catch {
      return null;
    }
  }
  return null;
}

/** ¿Es la ficha del cliente? Coincide el dominio de su web o su teléfono (normalizados). */
export function matchesClient(info: { domain: string | null; phone: string | null }, client: { domains: string[]; phones: string[] }): boolean {
  const d = info.domain?.replace(/^www\./, '').toLowerCase();
  if (d && client.domains.some((x) => x && (d === x || d.endsWith(`.${x}`)))) return true;
  const p = normPhone(info.phone);
  return Boolean(p && client.phones.some((x) => normPhone(x) === p));
}

export type Baseline = { title: string | null; category: string | null; phone: string | null; domain: string | null; hours: Record<string, string> | null };

export const FIELD_LABEL: Record<keyof Baseline, string> = { title: 'nombre', category: 'categoría principal', phone: 'teléfono', domain: 'web', hours: 'horario' };

/** Campos que han cambiado frente a lo confirmado (texto normalizado; el horario por sus franjas, no por su texto). */
export function changedFields(base: Baseline, cur: Baseline): (keyof Baseline)[] {
  const out: (keyof Baseline)[] = [];
  if (normText(base.title) !== normText(cur.title)) out.push('title');
  if (base.category && cur.category && normText(base.category) !== normText(cur.category)) out.push('category');
  if (base.phone && normPhone(base.phone) !== normPhone(cur.phone)) out.push('phone');
  if (base.domain && (base.domain ?? '').replace(/^www\./, '') !== (cur.domain ?? '').replace(/^www\./, '')) out.push('domain');
  if (base.hours && cur.hours && JSON.stringify(base.hours) !== JSON.stringify(cur.hours)) out.push('hours');
  return out;
}

export type ReviewPoint = { rating: number | null; votes: number | null; takenAt: string };

/**
 * Reseñas por detrás de la competencia: con al menos 3 competidores con datos, el cliente tiene menos de la mitad de
 * reseñas que la mediana o (si ambos tienen 10+ reseñas) una nota 0,3 o más por debajo de la mediana.
 */
export function reviewsBehind(client: ReviewPoint, comps: ReviewPoint[]): { behind: boolean; medianVotes: number | null; medianRating: number | null } {
  const ok = comps.filter((c) => c.votes !== null && c.rating !== null);
  if (ok.length < 3 || client.votes === null) return { behind: false, medianVotes: null, medianRating: null };
  const med = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };
  const mv = med(ok.map((c) => c.votes!));
  const mr = med(ok.map((c) => c.rating!));
  const fewer = client.votes < mv / 2;
  const lower = client.rating !== null && client.votes >= 10 && mv >= 10 && client.rating <= mr - 0.3;
  return { behind: fewer || lower, medianVotes: mv, medianRating: Math.round(mr * 10) / 10 };
}

/**
 * Reseñas paradas: con 3 fotos o más que cubran 60 días o más, el número de reseñas no ha subido (Google borra reseñas
 * en oleadas, así que una sola comparación no basta). Fotos de la más reciente a la más antigua.
 */
export function reviewsStalled(history: ReviewPoint[]): boolean {
  const h = history.filter((x) => x.votes !== null);
  if (h.length < 3) return false;
  const days = (Date.parse(h[0].takenAt) - Date.parse(h[h.length - 1].takenAt)) / 86_400_000;
  if (days < 60) return false;
  const old = h.find((x) => (Date.parse(h[0].takenAt) - Date.parse(x.takenAt)) / 86_400_000 >= 60) ?? h[h.length - 1];
  return h[0].votes! <= old.votes!;
}

/** El enlace directo para que un cliente escriba una reseña. */
export const writeReviewLink = (placeId: string) => `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;

/** Hallazgos de la ficha del cliente: cerrada (solo confirmada), cambios frente a lo confirmado y reseñas. */
export function fichaFindings(input: {
  cid: string;
  url: string | null;
  closedConfirmed: 'cerrada_temporal' | 'cerrada_definitiva' | null;
  changed: (keyof Baseline)[];
  base: Baseline | null;
  cur: Baseline | null;
  behind: ReturnType<typeof reviewsBehind>;
  client: ReviewPoint;
  stalled: boolean;
}): FindingInput[] {
  const out: FindingInput[] = [];
  const k = (kind: string) => `${kind}:${input.cid}`;
  if (input.closedConfirmed) out.push({ kind: 'seo.gbp_closed', dedupeKey: k('seo.gbp_closed'), url: input.url, evidence: { status: input.closedConfirmed } });
  if (input.changed.length && input.base && input.cur) {
    out.push({ kind: 'seo.gbp_changed', dedupeKey: k('seo.gbp_changed'), url: input.url, metric: 'campos', value: input.changed.length, evidence: { fields: input.changed.map((f) => FIELD_LABEL[f]), before: Object.fromEntries(input.changed.map((f) => [f, input.base![f]])), now: Object.fromEntries(input.changed.map((f) => [f, input.cur![f]])) } });
  }
  if (input.behind.behind) out.push({ kind: 'seo.reviews_behind', dedupeKey: k('seo.reviews_behind'), url: input.url, metric: 'resenas', value: input.client.votes, evidence: { rating: input.client.rating, votes: input.client.votes, medianVotes: input.behind.medianVotes, medianRating: input.behind.medianRating } });
  if (input.stalled) out.push({ kind: 'seo.reviews_stalled', dedupeKey: k('seo.reviews_stalled'), url: input.url, metric: 'resenas', value: input.client.votes, evidence: {} });
  return out;
}
