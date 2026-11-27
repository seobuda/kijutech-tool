// SEO · Contenido (parte 9a, 27 nov 2026; docs/DISENO-SEO-CONTENIDO.md con la auditoría Opus). Reglas PURAS: subtemas que
// la competencia trata (sin las palabras de la búsqueda), preguntas, palabras recomendadas, nota de una página frente al
// brief, enlazado interno sugerido y contenido que pierde tráfico. Sin IA, sin red.
import { sha1 } from '@/lib/core/crawl-extract';
import type { FindingInput } from '@/lib/core/findings-rules';
import { normText } from '@/lib/seo/expediente/rules';
import { tokens } from '@/lib/seo/mapa/rules';

export type CompetitorPage = { url: string; h2: string[]; h3: string[]; words: number };
export type Subtopic = { label: string; sites: number; examples: string[] };

/** Encabezados genéricos que salen en muchas webs y no son subtemas. */
const GENERIC = /^(contacto|contactanos|contáctanos|sobre nosotros|quienes somos|quiénes somos|nuestros servicios|servicios|blog|ultimas entradas|últimas entradas|entradas recientes|siguenos|síguenos|categorias|categorías|compartir|comentarios|deja un comentario|newsletter|suscribete|suscríbete|politica de privacidad|aviso legal|resumen|indice|índice|tabla de contenidos|conclusion|conclusión|preguntas frecuentes|faq)$/i;

const headTokens = (h: string, queryTokens: Set<string>) => new Set([...tokens(h)].filter((t) => !queryTokens.has(t)));

/** Subtemas tratados por 2 o más webs (Jaccard ≥ 0,5 de los encabezados sin las palabras de la búsqueda). */
export function subtopics(pages: CompetitorPage[], query: string, minSites = 2, max = 25): Subtopic[] {
  const q = tokens(query);
  type G = { toks: Set<string>; sites: Set<string>; heads: string[] };
  const groups: G[] = [];
  for (const p of pages) {
    for (const h of [...p.h2, ...p.h3]) {
      const clean = h.replace(/\s+/g, ' ').trim();
      if (clean.length < 4 || clean.length > 120 || GENERIC.test(normText(clean))) continue;
      const t = headTokens(clean, q);
      if (!t.size) continue;
      let best: G | null = null;
      let bestJ = 0;
      for (const g of groups) {
        const inter = [...t].filter((x) => g.toks.has(x)).length;
        const j = inter / (t.size + g.toks.size - inter || 1);
        if (j >= 0.5 && j > bestJ) {
          best = g;
          bestJ = j;
        }
      }
      if (best) {
        best.sites.add(p.url);
        best.heads.push(clean);
      } else groups.push({ toks: t, sites: new Set([p.url]), heads: [clean] });
    }
  }
  return groups
    .filter((g) => g.sites.size >= minSites)
    .sort((a, b) => b.sites.size - a.sites.size || b.heads.length - a.heads.length)
    .slice(0, max)
    .map((g) => ({ label: [...g.heads].sort((a, b) => a.length - b.length)[0], sites: g.sites.size, examples: [...new Set(g.heads)].slice(0, 3) }));
}

const QUESTION = /^(qué|que|cómo|como|cuánto|cuanto|cuándo|cuando|dónde|donde|por qué|porque|cuál|cual|quién|quien|què|com|quant|quan|on|per què)\b/i;
/** Preguntas: encabezados con «?» o que empiezan como pregunta (es y ca), sin repetir. */
export function questions(pages: CompetitorPage[], max = 15): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of pages)
    for (const h of [...p.h2, ...p.h3]) {
      const c = h.replace(/\s+/g, ' ').trim();
      if (!(c.endsWith('?') || QUESTION.test(c)) || c.length > 140) continue;
      const k = [...tokens(c)].sort().join(' ');
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(c);
    }
  return out.slice(0, max);
}

/** Palabras recomendadas: la mediana del contenido principal de la competencia, entre 300 y 2500. null si hay menos de 2. */
export function recommendedWords(pages: CompetitorPage[]): number | null {
  const w = pages.map((p) => p.words).filter((x) => x >= 100).sort((a, b) => a - b);
  if (w.length < 2) return null;
  const m = w[Math.floor((w.length - 1) / 2)];
  return Math.max(300, Math.min(2500, Math.round(m / 50) * 50));
}

export type Score = { score: number; missing: string[]; covered: string[]; words: number; wordsLow: boolean; queryInTitle: boolean; queryInH1: boolean };
/**
 * Nota de una página frente al brief: subtemas cubiertos (aparecen en el texto) 70 %, búsqueda en el título y el H1 30 %.
 * Las palabras solo restan si quedan por debajo del 50 % de lo recomendado (rellenar no sube la nota).
 */
export function scorePage(page: { title: string | null; h1: string | null; text: string; words: number }, brief: { query: string; subtopics: Subtopic[]; words: number | null }): Score {
  const textToks = tokens(page.text);
  const q = tokens(brief.query);
  const covered: string[] = [];
  const missing: string[] = [];
  for (const s of brief.subtopics) {
    const t = headTokens(s.label, q);
    const hit = t.size ? [...t].filter((x) => textToks.has(x)).length / t.size >= 0.6 : true;
    (hit ? covered : missing).push(s.label);
  }
  const has = (x: string | null) => {
    const tt = tokens(x ?? '');
    return q.size > 0 && [...q].filter((w) => tt.has(w)).length / q.size >= 0.6;
  };
  const queryInTitle = has(page.title);
  const queryInH1 = has(page.h1);
  const wordsLow = brief.words != null && page.words < brief.words * 0.5;
  const cov = brief.subtopics.length ? covered.length / brief.subtopics.length : 1;
  let score = Math.round(cov * 70 + (queryInTitle ? 15 : 0) + (queryInH1 ? 15 : 0));
  if (wordsLow) score = Math.max(0, score - 15);
  return { score, missing, covered, words: page.words, wordsLow, queryInTitle, queryInH1 };
}

// --- Enlazado interno -----------------------------------------------------------------------------------------------

const NOT_LINKABLE = /\/(aviso-legal|avis-legal|legal|privacidad|privacy|politica|cookies?|galetes|terminos|condiciones|tag|etiqueta|category|categoria|author|autor|page\/\d+|feed|carrito|cart|checkout|mi-cuenta|my-account|wp-json|search|buscar)(\/|$|-)/i;
export type LinkPage = { url: string; title: string | null; h1: string | null; headings: string[]; ok: boolean };
/**
 * Páginas que deberían enlazar al destino: hablan del tema (tokens de la búsqueda sin la zona) y no lo enlazan ya desde el
 * contenido (los enlaces de plantilla, presentes en más de la mitad de las páginas, no cuentan como «ya enlaza»). Texto
 * del enlace variado entre las búsquedas del tema. Como mucho 10, primero las de más clics.
 */
export function linkSuggestions(target: string, query: string, zoneWords: string[], pages: LinkPage[], linkersToTarget: Set<string>, templateLink: boolean, clicks: Map<string, number>, anchors: string[], max = 10): { from: string; anchor: string }[] {
  const zone = new Set(zoneWords.flatMap((z) => [...tokens(z)]));
  const q = new Set([...tokens(query)].filter((t) => !zone.has(t)));
  if (!q.size) return [];
  const norm = (u: string) => u.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
  const tgt = norm(target);
  const cand = pages
    .filter((p) => p.ok && norm(p.url) !== tgt && !NOT_LINKABLE.test(p.url))
    .filter((p) => templateLink || !linkersToTarget.has(p.url))
    .filter((p) => {
      // Por raíz (5 letras: «reforma» = «reformar»), y al menos el 60 % de las palabras del tema.
      const roots = new Set([...tokens([p.title ?? '', p.h1 ?? '', ...p.headings].join(' '))].map((w) => w.slice(0, 5)));
      return [...q].filter((w) => roots.has(w.slice(0, 5))).length / q.size >= 0.6;
    })
    .sort((a, b) => (clicks.get(b.url) ?? 0) - (clicks.get(a.url) ?? 0))
    .slice(0, max);
  const pool = anchors.length ? anchors : [query];
  return cand.map((p, i) => ({ from: p.url, anchor: pool[i % pool.length] }));
}

// --- Contenido que pierde tráfico ------------------------------------------------------------------------------------

export type DecayRow = { url: string; cur: number; prev: number; yoy: number | null; posCur: number | null; posPrev: number | null; impCur: number; impPrev: number };
/**
 * Páginas con 30+ clics en los 90 días previos que caen un 30 %+ en los últimos 90 (y frente al año anterior si hay datos;
 * si no, solo info). Causa probable: posición (contenido), CTR con la misma posición (IA o la SERP) o demanda.
 */
export function contentDecay(rows: DecayRow[], max = 15): FindingInput[] {
  const out: (FindingInput & { _w: number })[] = [];
  for (const r of rows) {
    if (r.prev < 30) continue;
    const pct = r.cur / r.prev - 1;
    if (pct > -0.3) continue;
    const yoyPct = r.yoy && r.yoy > 0 ? r.cur / r.yoy - 1 : null;
    if (yoyPct !== null && yoyPct > -0.3) continue; // el año pasado por estas fechas también era así: temporada
    const posDrop = r.posCur != null && r.posPrev != null && r.posCur - r.posPrev >= 2;
    const impPct = r.impPrev > 0 ? r.impCur / r.impPrev - 1 : 0;
    const causa = posDrop ? 'posicion' : impPct > -0.15 ? 'ctr' : 'demanda';
    out.push({
      kind: 'seo.content_decay',
      dedupeKey: `seo.content_decay:${sha1(r.url).slice(0, 16)}`,
      url: r.url,
      metric: 'clics_90d',
      value: r.cur,
      severity: yoyPct === null ? 'info' : undefined,
      evidence: { antes: r.prev, ahora: r.cur, caidaPct: Math.round(pct * 100), interanualPct: yoyPct === null ? null : Math.round(yoyPct * 100), causa, posicion: { antes: r.posPrev, ahora: r.posCur } },
      _w: r.prev - r.cur
    });
  }
  return out
    .sort((a, b) => b._w - a._w)
    .slice(0, max)
    .map(({ _w, ...f }) => {
      void _w;
      return f;
    });
}
