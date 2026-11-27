// SEO · Panel de IA mensual (parte 11, 27 nov 2026; docs/DISENO-SEO-CIERRE.md §A). Reglas puras, sin base de datos ni red:
// se prueban en tests/seo-panel-ia.test.ts.
// - Las preguntas salen de una plantilla (servicio × población y los temas de más valor), sin IA (directiva de IA).
// - «Citado» = su dominio está entre las fuentes; «nombrado» = su nombre completo aparece en el texto. Sin IA: dominio
//   exacto y frase completa normalizada (sin acentos ni mayúsculas). Una sola palabra genérica del nombre no cuenta, para
//   no dar por nombrado a «Centros DYM» cada vez que la respuesta dice «centros».
import { host, normText } from '@/lib/seo/expediente/rules';
import { zoneTowns } from '@/lib/seo/posiciones/rules';

export const AI_ASSISTANTS = ['chatgpt', 'gemini', 'google_ai', 'perplexity'] as const;
export type AiAssistant = (typeof AI_ASSISTANTS)[number];
export const ASSISTANT_LABEL: Record<AiAssistant, string> = { chatgpt: 'ChatGPT', gemini: 'Gemini', google_ai: 'Google (modo IA)', perplexity: 'Perplexity' };
export const MAX_AI_QUESTIONS = 15;
export const DEFAULT_AI_PANEL_BUDGET_USD = 2;
/** Coste estimado por pregunta y asistente en directo [precios de la doc de DataForSEO del 27 nov, NV]. */
export const AI_COST: Record<AiAssistant, number> = { chatgpt: 0.004, gemini: 0.004, google_ai: 0.004, perplexity: 0.008 };

export const questionKey = (q: string) => normText(q).slice(0, 150);

/** Preguntas propuestas: «mejor {servicio} en {población}» y «¿dónde {tema} en {población}?». Sin repetir, como mucho `max`. */
export function proposeQuestions(input: { services: string[]; zona: string | null; topics: string[]; existing: string[] }, max = MAX_AI_QUESTIONS): string[] {
  const towns = zoneTowns(input.zona).slice(0, 3);
  const seen = new Set(input.existing.map(questionKey));
  const out: string[] = [];
  const push = (q: string) => {
    const clean = q.replace(/\s+/g, ' ').trim();
    const k = questionKey(clean);
    if (k.length < 8 || seen.has(k) || out.length >= max) return;
    seen.add(k);
    out.push(clean);
  };
  const services = input.services.map((s) => s.trim().toLowerCase()).filter((s) => s.length >= 3).slice(0, 5);
  for (const s of services) {
    if (towns[0]) push(`¿Cuál es la mejor empresa de ${s} en ${towns[0]}?`);
    for (const t of towns.slice(1)) push(`Recomiéndame ${s} en ${t}`);
    if (!towns.length) push(`¿Qué empresa de ${s} me recomiendas?`);
  }
  for (const t of input.topics.map((x) => x.trim().toLowerCase()).filter((x) => x.length >= 4).slice(0, 8)) {
    push(towns[0] ? `¿Dónde puedo encontrar ${t} en ${towns[0]}?` : `¿Quién es el mejor en ${t}?`);
  }
  return out;
}

/** Frases que cuentan como «nombrado»: el nombre completo y los alias (normalizados, 5 letras o más sin espacios). */
export function brandPhrases(names: string[]): string[] {
  const out = new Set<string>();
  for (const n of names) {
    const t = normText(n);
    if (t.replace(/ /g, '').length >= 5) out.add(t);
  }
  return [...out];
}

export function textNames(text: string, phrases: string[]): boolean {
  if (!phrases.length) return false;
  const t = ` ${normText(text)} `;
  const squashed = t.replace(/ /g, '');
  return phrases.some((p) => t.includes(` ${p} `) || (p.includes(' ') && squashed.includes(p.replace(/ /g, ''))));
}

/** ¿Algún dominio de las fuentes es el suyo (o un subdominio)? */
export function domainCited(sources: string[], domain: string | null): boolean {
  const d = host(domain);
  if (!d) return false;
  return sources.some((s) => {
    const h = host(s);
    return Boolean(h && (h === d || h.endsWith(`.${d}`)));
  });
}

export type AiAnswerRead = { clientCited: boolean; clientNamed: boolean; competitors: { domain: string; name: string; cited: boolean; named: boolean }[]; sources: string[] };

/** Lee una respuesta: el cliente y cada competidor, citado (fuente) o nombrado (texto). */
export function readAnswer(
  answer: { text: string; sources: string[]; brands?: string[] },
  client: { domain: string | null; names: string[] },
  competitors: { domain: string | null; name: string }[],
  question = ''
): AiAnswerRead {
  const text = [answer.text, ...(answer.brands ?? [])].join('\n');
  const named = (names: string[]) => textNames(text, brandPhrases(question ? distinctiveNames(names, question) : names));
  const sources = [...new Set(answer.sources.map((s) => host(s)).filter((h): h is string => Boolean(h)))].slice(0, 10);
  return {
    clientCited: domainCited(answer.sources, client.domain),
    clientNamed: named(client.names),
    competitors: competitors
      .map((c) => ({ domain: host(c.domain) ?? '', name: c.name, cited: domainCited(answer.sources, c.domain), named: named([c.name]) }))
      .filter((c) => c.cited || c.named),
    sources
  };
}

/** Recorte de la respuesta para la pantalla: alrededor de la primera mención del cliente o, si no, el principio. */
export function excerpt(text: string, names: string[], max = 600): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const low = clean.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const at = names.map((n) => low.indexOf(n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))).filter((i) => i >= 0).sort((a, b) => a - b)[0];
  const start = at === undefined ? 0 : Math.max(0, at - Math.floor(max / 3));
  return `${start > 0 ? '…' : ''}${clean.slice(start, start + max)}${start + max < clean.length ? '…' : ''}`;
}

/**
 * «La competencia aparece y tú no» con margen: solo si en los dos últimos meses con datos de esa pregunta el cliente no sale
 * en ningún asistente y algún competidor sí, en los dos.
 */
export function lostToCompetitionState(months: { month: string; clientAny: boolean; competitorAny: boolean }[]): boolean {
  const last = [...months].sort((a, b) => b.month.localeCompare(a.month)).slice(0, 2);
  return last.length === 2 && last.every((m) => !m.clientAny && m.competitorAny);
}

/**
 * Auditoría del 27 nov: un nombre genérico («Fontanería Sabadell») sale en cualquier respuesta a «fontanería en Sabadell».
 * Se quitan del nombre las palabras que ya están en la pregunta; si no queda nada distintivo (4 letras o más), ese nombre
 * no cuenta y solo vale el dominio.
 */
export function distinctiveNames(names: string[], question: string): string[] {
  const q = new Set(normText(question).split(' ').filter(Boolean));
  return names.filter((n) => normText(n).split(' ').some((w) => w.length >= 4 && !q.has(w)));
}

/** Directorios, buscadores y redes: no son «la competencia que aparece en su lugar». */
const NOT_COMPETITORS = /(^|\.)(google|youtube|facebook|instagram|linkedin|twitter|tiktok|wikipedia|reddit|tripadvisor|doctoralia|paginasamarillas|yelp|cylex|habitissimo|cronoshare|milanuncios|infoisinfo|guiaempresa|einforma|axesor|empresite|booking|trustpilot|apple|bing|yahoo|amazon|elmundo|elpais|lavanguardia|20minutos|abc|cadenaser|rtve)\.[a-z.]+$/i;
export function otherSources(sources: string[], clientDomain: string | null): string[] {
  const own = host(clientDomain);
  return sources.filter((s) => s && s !== own && !(own && s.endsWith(`.${own}`)) && !NOT_COMPETITORS.test(s));
}

/** Cuota de presencia: de las respuestas hechas, en cuántas sale el cliente (citado o nombrado). null sin respuestas. */
export function presenceShare(rows: { status: string; clientCited: boolean | null; clientNamed: boolean | null }[]): { share: number | null; n: number } {
  const done = rows.filter((r) => r.status === 'hecha');
  if (!done.length) return { share: null, n: 0 };
  return { share: done.filter((r) => r.clientCited || r.clientNamed).length / done.length, n: done.length };
}

/** Muestra del mes (1, 2 o 3) según el día: 1-10, 11-20, 21-fin (auditoría: tres muestras al mes, no una). */
export function sampleOfDay(day: number): 1 | 2 | 3 {
  return day <= 10 ? 1 : day <= 20 ? 2 : 3;
}

/**
 * Aviso «la competencia sale y tú no» (con margen, auditoría del 27 nov): dos meses seguidos con cuota 0 % del cliente en
 * esa pregunta (con 3 respuestas o más cada mes) y algún competidor confirmado presente en más de la mitad.
 */
export function lostToCompetitionMonths(months: { month: string; n: number; clientShare: number; competitorShare: number }[]): boolean {
  const last = [...months].sort((a, b) => b.month.localeCompare(a.month)).slice(0, 2);
  return last.length === 2 && last.every((m) => m.n >= 3 && m.clientShare === 0 && m.competitorShare > 0.5);
}
