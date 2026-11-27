// SEO · Jefe SEO, D5: el investigador de novedades. Partes PURAS: qué novedades se le pasan a la IA (filtro por código, sin
// gastar) y cómo se valida lo que devuelve (enlaces solo de lo leído y nivel nunca por encima de la fuente).
// Tests: tests/seo-jefe-d5.test.ts.
import { PLAYBOOKS, type PlaybookKey } from '@/lib/seo/estrategia/playbooks';

export type NewsLevel = 'oficial' | 'reputada' | 'rumor';
export type NewsItem = { id: string; title: string; summary: string | null; url: string | null; publishedAt: string | null; sourceLabel: string; level: NewsLevel };
export type Finding = { titulo: string; que_cambia: string; nivel: NewsLevel; fuentes: string[]; fecha: string | null; lineas: PlaybookKey[]; a_quien_afecta: string; que_hacer: string; importancia: 'alta' | 'media' | 'baja' };

/** Cada cuánto pasa el investigador (días) y cuánto mira hacia atrás la primera vez. */
export const INVESTIGATE_EVERY_DAYS = 3;
export const FIRST_WINDOW_DAYS = 7;
/** Como mucho tantas novedades a la IA (las más pertinentes) y tantas propuestas a la base por pasada. */
export const MAX_ITEMS_TO_AI = 40;
export const MAX_PROPOSALS = 3;

const RANK: Record<NewsLevel, number> = { rumor: 0, reputada: 1, oficial: 2 };
export const levelFromSource = (l: string): NewsLevel => (l === 'oficial' ? 'oficial' : l === 'reputada' ? 'reputada' : 'rumor');

// Señales de que una novedad toca lo que hace la agencia (pymes locales en España: técnico, contenido, local, enlaces, IA).
const TOPICS: [RegExp, number][] = [
  [/\b(core|spam|ranking|algorithm|algoritmo)\b.{0,20}\b(update|actualizaci)/i, 5],
  [/\b(google business profile|business profile|ficha de google|google maps|local (seo|pack|search)|reviews?|reseñas)\b/i, 4],
  [/\b(ai overviews?|ai mode|sge|chatgpt|perplexity|gemini|llm|generative|respuestas de ia|aeo|geo)\b/i, 3],
  [/\b(search console|crawl|crawling|indexing|index|rastreo|indexaci|robots\.txt|sitemap|canonical|core web vitals|inp|page experience)\b/i, 3],
  [/\b(structured data|schema|datos estructurados|rich results?)\b/i, 3],
  [/\b(helpful content|e-?e-?a-?t|content quality|contenido)\b/i, 2],
  [/\b(backlinks?|link building|enlaces)\b/i, 2],
  [/\b(google|bing)\b/i, 1]
];

/** Puntuación de pertinencia por código (0 = no tiene que ver con nuestro trabajo). */
export function relevance(i: Pick<NewsItem, 'title' | 'summary'>): number {
  const text = `${i.title} ${i.summary ?? ''}`;
  return TOPICS.reduce((a, [re, w]) => a + (re.test(text) ? w : 0), 0);
}

/** Lo que se le pasa a la IA: lo oficial siempre; lo demás solo si es pertinente; por nivel, pertinencia y fecha. */
export function prefilter(items: NewsItem[], max = MAX_ITEMS_TO_AI): NewsItem[] {
  return items
    .map((i) => ({ i, r: relevance(i) }))
    .filter(({ i, r }) => i.level === 'oficial' || r >= 2)
    .sort((a, b) => RANK[b.i.level] - RANK[a.i.level] || b.r - a.r || String(b.i.publishedAt ?? '').localeCompare(String(a.i.publishedAt ?? '')))
    .slice(0, max)
    .map(({ i }) => i);
}

const clip = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * Valida lo que devuelve la IA: solo enlaces de las novedades que se le pasaron (lo demás se quita; sin ninguno, fuera),
 * nivel como mucho el de la mejor fuente citada (una opinión nunca pasa por oficial), líneas del catálogo y textos cortos.
 */
export function validateFindings(raw: unknown, items: NewsItem[]): { ok: Finding[]; rejected: string[] } {
  const byUrl = new Map(items.filter((i) => i.url).map((i) => [i.url as string, i]));
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { hallazgos?: unknown }).hallazgos) ? ((raw as { hallazgos: unknown[] }).hallazgos as Record<string, unknown>[]) : [];
  const ok: Finding[] = [];
  const rejected: string[] = [];
  for (const h of list.slice(0, 10)) {
    if (!h || typeof h !== 'object') continue;
    const titulo = clip(h.titulo, 160);
    const fuentes = (Array.isArray(h.fuentes) ? h.fuentes : []).map((u) => String(u).trim()).filter((u) => byUrl.has(u));
    if (titulo.length < 5 || !fuentes.length) {
      rejected.push(titulo || '(sin título)');
      continue;
    }
    const best = Math.max(...fuentes.map((u) => RANK[byUrl.get(u)!.level]));
    const asked = RANK[levelFromSource(String(h.nivel ?? 'rumor') === 'rumor' ? 'comunidad' : String(h.nivel))];
    const nivel = (Object.keys(RANK) as NewsLevel[]).find((k) => RANK[k] === Math.min(best, asked)) ?? 'rumor';
    const lineas = (Array.isArray(h.lineas) ? h.lineas : []).map(String).filter((k): k is PlaybookKey => k in PLAYBOOKS && k !== 'cimientos');
    const importancia = h.importancia === 'alta' || h.importancia === 'media' ? h.importancia : 'baja';
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(h.fecha ?? '')) ? String(h.fecha) : (byUrl.get(fuentes[0])!.publishedAt?.slice(0, 10) ?? null);
    ok.push({ titulo, que_cambia: clip(h.que_cambia, 1200), nivel, fuentes: [...new Set(fuentes)].slice(0, 5), fecha, lineas: [...new Set(lineas)], a_quien_afecta: clip(h.a_quien_afecta, 400), que_hacer: clip(h.que_hacer, 800), importancia });
  }
  return { ok, rejected };
}

/** Las que se proponen a la base: importancia alta o media, primero lo más fiable, como mucho 3. */
export function toPropose(findings: Finding[], max = MAX_PROPOSALS): Finding[] {
  const imp = { alta: 2, media: 1, baja: 0 };
  return findings
    .filter((f) => f.importancia !== 'baja')
    .sort((a, b) => imp[b.importancia] - imp[a.importancia] || RANK[b.nivel] - RANK[a.nivel])
    .slice(0, max);
}

export const LEVEL_TEXT: Record<NewsLevel, string> = { oficial: 'OFICIAL (lo dice Google o el buscador)', reputada: 'REPUTADA (blog o medio SEO de referencia: opinión informada, sin confirmar por Google)', rumor: 'RUMOR (sin confirmar)' };

/** Texto de la propuesta para la base de conocimiento (la redacta después la IA de la base y la aprueba Enric). */
export function proposalText(f: Finding, affected: string[]): string {
  return [
    `Novedad SEO: ${f.titulo}`,
    `Fecha: ${f.fecha ?? 'sin fecha'} · Nivel: ${LEVEL_TEXT[f.nivel]}`,
    `Qué cambia: ${f.que_cambia}`,
    f.lineas.length ? `Líneas de trabajo afectadas: ${f.lineas.map((k) => PLAYBOOKS[k].label).join(', ')}` : '',
    f.a_quien_afecta ? `A quién afecta: ${f.a_quien_afecta}` : '',
    affected.length ? `Clientes con esas líneas en su plan o estrategia: ${affected.join(', ')}` : '',
    f.que_hacer ? `Qué haría el equipo: ${f.que_hacer}` : '',
    `Fuentes: ${f.fuentes.join(' ')}`
  ]
    .filter(Boolean)
    .join('\n');
}
