// Scraper de páginas competidoras (Fase D — Análisis de competidores SERP).
// Sin librería de parsing HTML instalada en el proyecto (no hay cheerio ni
// jsdom) — se extrae todo con regex sobre el HTML crudo, en la misma línea
// que lib/seo/csv-parse.ts (parser propio, sin dependencias). Es más frágil
// que un DOM real, pero cubre señales de estructura/texto sin necesitar
// aprobación para instalar nada.

export type ScrapedFaq = { question: string; answer: string };

export type ScrapedData = {
  h1: string | null;
  h2s: string[];
  h3s: string[];
  wordCountApprox: number;
  faqs: ScrapedFaq[];
  hasList: boolean;
  ctaTexts: string[];
  mentionsPrice: boolean;
  hasReviews: boolean;
  reviewCount: number | null;
  hasGallery: boolean;
  hasVideo: boolean;
  hasNamedAuthor: boolean;
  hasAboutPage: boolean;
  hasCertifications: boolean;
  hasPublicationDate: boolean;
  publicationDate: string | null;
  titleTag: string | null;
  metaDescription: string | null;
  schemaTypes: string[];
};

export type ScrapeResult =
  | { ok: true; data: ScrapedData }
  | { ok: false; error: string };

const FETCH_TIMEOUT_MS = 10_000;
// Páginas absurdamente grandes se truncan antes de pasar por regex — evita
// backtracking patológico en HTML mal formado de decenas de MB.
const MAX_HTML_LENGTH = 2_000_000;

const CTA_KEYWORDS =
  /comprar|contratar|contactar|reservar|llamar|empezar|solicitar|presupuesto|agenda|inscr[ií]bete|pide cita|más informaci[oó]n|book now|get started|contact us|sign up|request a quote/i;

// Capa 2 de extractFaqs() — términos ya sin tildes porque el texto/atributo
// encontrado en el HTML se normaliza con stripAccents() antes de comparar.
const FAQ_CONTAINER_TERMS = [
  'faq',
  'preguntas frecuentes',
  'preguntas habituales',
  'dudas frecuentes',
  'preguntas comunes',
  'frequently asked',
  'questions',
  'ayuda',
];

// Capa 3 de extractFaqs().
const ACCORDION_CLASS_TERMS = ['accordion', 'collapse', 'faq-item', 'faq-list', 'expandable'];

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

const COMBINING_DIACRITICS_RE = new RegExp('[\\u0300-\\u036f]', 'g');

function stripAccents(text: string): string {
  return text.normalize('NFD').replace(COMBINING_DIACRITICS_RE, '');
}

function extractTagTexts(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const text = stripTags(match[1]);
    if (text) out.push(text);
  }
  return out;
}

function extractAttr(tagHtml: string, attr: string): string | null {
  const re = new RegExp(`${attr}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
  const match = re.exec(tagHtml);
  if (!match) return null;
  return decodeEntities(match[2] ?? match[3] ?? '');
}

function extractJsonLdBlocks(html: string): unknown[] {
  const re = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const blocks: unknown[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    try {
      const parsed = JSON.parse(match[1].trim());
      blocks.push(parsed);
    } catch {
      // JSON-LD mal formado — se ignora ese bloque, no rompe el resto del scrape.
    }
  }
  return blocks;
}

function flattenJsonLd(blocks: unknown[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node && typeof node === 'object') {
      out.push(node as Record<string, unknown>);
      const graph = (node as Record<string, unknown>)['@graph'];
      if (graph) visit(graph);
    }
  };
  blocks.forEach(visit);
  return out;
}

function schemaTypesOf(nodes: Record<string, unknown>[]): string[] {
  const types = new Set<string>();
  for (const node of nodes) {
    const t = node['@type'];
    if (typeof t === 'string') types.add(t);
    if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && types.add(x));
  }
  return Array.from(types);
}

function extractFaqsFromJsonLd(nodes: Record<string, unknown>[]): ScrapedFaq[] {
  const faqs: ScrapedFaq[] = [];
  for (const node of nodes) {
    const type = node['@type'];
    const isFaqPage = type === 'FAQPage' || (Array.isArray(type) && type.includes('FAQPage'));
    if (!isFaqPage) continue;
    const mainEntity = node['mainEntity'];
    const questions = Array.isArray(mainEntity) ? mainEntity : mainEntity ? [mainEntity] : [];
    for (const q of questions) {
      if (!q || typeof q !== 'object') continue;
      const question = (q as Record<string, unknown>)['name'];
      const answerNode = (q as Record<string, unknown>)['acceptedAnswer'];
      const answerText =
        answerNode && typeof answerNode === 'object'
          ? (answerNode as Record<string, unknown>)['text']
          : null;
      if (typeof question === 'string' && typeof answerText === 'string') {
        faqs.push({ question: question.trim(), answer: stripTags(answerText).slice(0, 1000) });
      }
    }
  }
  return faqs;
}

function matchesFaqTerm(text: string): boolean {
  const normalized = stripAccents(text).toLowerCase();
  return FAQ_CONTAINER_TERMS.some((term) => normalized.includes(term));
}

// Capa 2a — contenedor detectado por heading (h2/h3) cuyo texto coincide
// con un término de FAQ_CONTAINER_TERMS. El alcance del contenedor va
// desde justo después del heading hasta el siguiente heading de nivel
// igual o superior (o el final del HTML si no hay ninguno).
function findFaqScopeByHeading(html: string): string | null {
  const re = /<h([2-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const level = match[1];
    if (!matchesFaqTerm(stripTags(match[2]))) continue;
    const rest = html.slice(match.index + match[0].length);
    const nextHeadingMatch = new RegExp(`<h[1-${level}][^>]*>`, 'i').exec(rest);
    return nextHeadingMatch ? rest.slice(0, nextHeadingMatch.index) : rest;
  }
  return null;
}

// Capa 2b — contenedor detectado por class/id que coincide con un término
// de FAQ_CONTAINER_TERMS. Sin DOM real no se puede balancear la etiqueta
// de apertura con su cierre exacto, así que se toma una ventana de
// caracteres tras la apertura como aproximación del contenedor — ver el
// comentario de extractFaqs() más abajo.
function findFaqScopeByAttr(html: string): string | null {
  const re = /<[a-z][a-z0-9]*\b[^>]*\b(?:class|id)\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const attrValue = match[2] ?? match[3] ?? '';
    if (!matchesFaqTerm(attrValue)) continue;
    const startIdx = match.index + match[0].length;
    return html.slice(startIdx, startIdx + 8000);
  }
  return null;
}

// Pares pregunta/respuesta dentro de un contenedor ya confirmado como FAQ
// (Capa 2): cualquier heading + el texto que le sigue hasta el próximo
// heading. A diferencia de la Capa 4, aquí no se exige "?" ni 3+
// consecutivos porque el contenedor ya es la señal de contexto.
function extractQaPairsByHeading(scopeHtml: string): ScrapedFaq[] {
  const faqs: ScrapedFaq[] = [];
  const re = /<h([2-6])[^>]*>([\s\S]*?)<\/h\1>([\s\S]*?)(?=<h[2-6][^>]*>|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(scopeHtml))) {
    const question = stripTags(match[2]);
    const answer = stripTags(match[3]).slice(0, 1000);
    if (question && answer) faqs.push({ question, answer });
  }
  return faqs;
}

// Capa 3 — details/summary nativos, o elementos con class que contenga un
// término de ACCORDION_CLASS_TERMS. El summary (o, para las clases, el
// primer heading dentro del item) es la pregunta; el resto del contenido
// es la respuesta.
function extractFaqsFromAccordion(html: string): ScrapedFaq[] {
  const faqs: ScrapedFaq[] = [];

  const detailsRe = /<details\b[^>]*>([\s\S]*?)<\/details>/gi;
  let detailsMatch: RegExpExecArray | null;
  while ((detailsMatch = detailsRe.exec(html))) {
    const block = detailsMatch[1];
    const summaryMatch = /<summary\b[^>]*>([\s\S]*?)<\/summary>/i.exec(block);
    if (!summaryMatch) continue;
    const question = stripTags(summaryMatch[1]);
    const answer = stripTags(block.slice(summaryMatch.index + summaryMatch[0].length)).slice(0, 1000);
    if (question && answer) faqs.push({ question, answer });
  }

  const classTermsPattern = new RegExp(ACCORDION_CLASS_TERMS.join('|'), 'i');
  const classItemRe = /<[a-z][a-z0-9]*\b[^>]*\bclass\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/gi;
  let classMatch: RegExpExecArray | null;
  while ((classMatch = classItemRe.exec(html))) {
    const cls = classMatch[2] ?? classMatch[3] ?? '';
    if (!classTermsPattern.test(cls)) continue;
    const startIdx = classMatch.index + classMatch[0].length;
    // Misma limitación de "ventana en vez de cierre exacto" que
    // findFaqScopeByAttr() — ver el comentario de extractFaqs().
    const windowHtml = html.slice(startIdx, startIdx + 2000);
    const headingMatch = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(windowHtml);
    if (!headingMatch) continue;
    const question = stripTags(headingMatch[1]);
    const answer = stripTags(windowHtml.slice(headingMatch.index + headingMatch[0].length)).slice(0, 1000);
    if (question && answer) faqs.push({ question, answer });
  }

  return faqs;
}

type HeadingEntry = { level: string; question: string; answer: string; isQuestion: boolean };

function collectHeadingEntries(html: string): HeadingEntry[] {
  const entries: HeadingEntry[] = [];
  const re = /<h([2-4])[^>]*>([\s\S]*?)<\/h\1>([\s\S]*?)(?=<h[2-4][^>]*>|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const question = stripTags(match[2]);
    entries.push({
      level: match[1],
      question,
      answer: stripTags(match[3]).slice(0, 1000),
      isQuestion: question.endsWith('?'),
    });
  }
  return entries;
}

// Capa 4 — último recurso, sin ningún contenedor ni acordeón detectado.
// Solo se activa si hay 3+ headings CONSECUTIVOS del MISMO nivel que
// terminan en "?", sin otro heading intermedio: un heading aislado con
// "?" fuera de una sección de FAQ es habitual (ej. un titular de
// marketing) y generaba falsos positivos en la versión anterior de esta
// heurística.
function extractFaqsFromConsecutiveQuestionHeadings(html: string): ScrapedFaq[] {
  const entries = collectHeadingEntries(html);
  const faqs: ScrapedFaq[] = [];
  let run: HeadingEntry[] = [];

  function flushRun() {
    if (run.length >= 3) {
      for (const entry of run) {
        if (entry.answer) faqs.push({ question: entry.question, answer: entry.answer });
      }
    }
    run = [];
  }

  for (const entry of entries) {
    if (entry.isQuestion && (run.length === 0 || run[0].level === entry.level)) {
      run.push(entry);
    } else {
      flushRun();
      if (entry.isQuestion) run.push(entry);
    }
  }
  flushRun();

  return faqs;
}

// Orquesta las 4 capas en orden de prioridad y usa la primera que
// encuentre resultados (JSON-LD > contenedor semántico > acordeón >
// headings-pregunta consecutivos).
//
// Limitación real que queda tras esta mejora: sin un DOM real no podemos
// balancear una etiqueta de apertura con su cierre exacto, así que el
// alcance de un contenedor por class/id (Capa 2b) y el de un item de
// acordeón por clase (Capa 3) se aproximan con una ventana fija de
// caracteres tras la apertura en vez de encontrar dónde termina de verdad
// el elemento — puede colar contenido posterior ajeno al contenedor, o
// cortar contenido que sí era parte de él. La Capa 2a (por heading) y la
// Capa 3 nativa (details/summary) no tienen este problema porque su
// límite de cierre es exacto.
function extractFaqs(bodyHtml: string, jsonLdNodes: Record<string, unknown>[]): ScrapedFaq[] {
  const fromJsonLd = dedupeFaqs(extractFaqsFromJsonLd(jsonLdNodes));
  if (fromJsonLd.length > 0) return fromJsonLd;

  const containerScope = findFaqScopeByHeading(bodyHtml) ?? findFaqScopeByAttr(bodyHtml);
  if (containerScope) {
    const fromContainer = dedupeFaqs([
      ...extractFaqsFromAccordion(containerScope),
      ...extractQaPairsByHeading(containerScope),
    ]);
    if (fromContainer.length > 0) return fromContainer;
  }

  const fromAccordion = dedupeFaqs(extractFaqsFromAccordion(bodyHtml));
  if (fromAccordion.length > 0) return fromAccordion;

  return dedupeFaqs(extractFaqsFromConsecutiveQuestionHeadings(bodyHtml));
}

function dedupeFaqs(faqs: ScrapedFaq[]): ScrapedFaq[] {
  const seen = new Set<string>();
  const out: ScrapedFaq[] = [];
  for (const faq of faqs) {
    const key = faq.question.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(faq);
  }
  return out;
}

function extractCtaTexts(html: string): string[] {
  const texts = new Set<string>();
  const re = /<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const attrs = match[2];
    const text = stripTags(match[3]);
    if (!text || text.length > 60) continue;
    const cls = extractAttr(attrs, 'class') ?? '';
    const isCtaClass = /\b(cta|btn|button)\b/i.test(cls);
    const isCtaText = CTA_KEYWORDS.test(text);
    if (isCtaClass || isCtaText) texts.add(text);
    if (texts.size >= 10) break;
  }
  return Array.from(texts);
}

function extractReviewCount(html: string, jsonLdNodes: Record<string, unknown>[]): number | null {
  for (const node of jsonLdNodes) {
    const rating = node['aggregateRating'];
    if (rating && typeof rating === 'object') {
      const count =
        (rating as Record<string, unknown>)['reviewCount'] ??
        (rating as Record<string, unknown>)['ratingCount'];
      const parsed = Number(count);
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    }
  }
  const textMatch = /(\d[\d.,]*)\s*(rese[nñ]as|opiniones|valoraciones|reviews)/i.exec(html);
  if (textMatch) {
    const parsed = Number(textMatch[1].replace(/[.,]/g, ''));
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function extractPublicationDate(html: string, jsonLdNodes: Record<string, unknown>[]): string | null {
  for (const node of jsonLdNodes) {
    const date = node['datePublished'];
    if (typeof date === 'string') return date;
  }
  const metaMatch =
    /<meta[^>]+property\s*=\s*["']article:published_time["'][^>]*>/i.exec(html) ??
    /<meta[^>]+name\s*=\s*["']date["'][^>]*>/i.exec(html);
  if (metaMatch) {
    const content = extractAttr(metaMatch[0], 'content');
    if (content) return content;
  }
  const timeMatch = /<time[^>]+datetime\s*=\s*["']([^"']+)["']/i.exec(html);
  if (timeMatch) return timeMatch[1];
  return null;
}

function findMetaContent(html: string, name: string): string | null {
  const re = new RegExp(
    `<meta\\b(?=[^>]*(?:name|property)\\s*=\\s*["']${name}["'])[^>]*>`,
    'i'
  );
  const tag = re.exec(html)?.[0];
  return tag ? extractAttr(tag, 'content') : null;
}

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let html: string;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // Algunos sitios devuelven una página distinta (o bloquean) a un
        // fetch sin user-agent de navegador.
        'User-Agent':
          'Mozilla/5.0 (compatible; KijutechBot/1.0; +https://kijutech.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} ${res.statusText}` };
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return { ok: false, error: `Content-Type no es HTML: ${contentType || 'desconocido'}` };
    }

    html = await res.text();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, error: `Timeout tras ${FETCH_TIMEOUT_MS / 1000}s` };
    }
    return { ok: false, error: error instanceof Error ? error.message : 'Error de red desconocido' };
  } finally {
    clearTimeout(timeout);
  }

  if (html.length > MAX_HTML_LENGTH) {
    html = html.slice(0, MAX_HTML_LENGTH);
  }

  try {
    const jsonLdBlocks = extractJsonLdBlocks(html);
    const jsonLdNodes = flattenJsonLd(jsonLdBlocks);
    const bodyMatch = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
    const bodyHtml = bodyMatch ? bodyMatch[1] : html;
    const bodyText = stripTags(bodyHtml);

    const faqs = extractFaqs(bodyHtml, jsonLdNodes);

    const data: ScrapedData = {
      h1: extractTagTexts(bodyHtml, 'h1')[0] ?? null,
      h2s: extractTagTexts(bodyHtml, 'h2'),
      h3s: extractTagTexts(bodyHtml, 'h3'),
      wordCountApprox: bodyText ? bodyText.split(/\s+/).length : 0,
      faqs,
      hasList: /<(ul|ol)[^>]*>/i.test(bodyHtml),
      ctaTexts: extractCtaTexts(bodyHtml),
      mentionsPrice: /[€$]\s?\d|\d\s?(€|\$|eur|usd)|precio|tarifa|desde \d/i.test(bodyText),
      hasReviews: /rese[nñ]as|opiniones|valoraciones|reviews|aggregateRating/i.test(html),
      reviewCount: extractReviewCount(html, jsonLdNodes),
      hasGallery: /class\s*=\s*["'][^"']*(galer[ií]a|gallery)[^"']*["']/i.test(bodyHtml),
      hasVideo: /<video\b|youtube\.com\/embed|player\.vimeo\.com/i.test(bodyHtml),
      hasNamedAuthor:
        jsonLdNodes.some((n) => Boolean(n['author'])) ||
        /rel\s*=\s*["']author["']|class\s*=\s*["'][^"']*\b(author|autor)\b[^"']*["']/i.test(bodyHtml),
      hasAboutPage: /href\s*=\s*["'][^"']*(sobre-nosotros|quienes-somos|\/about)[^"']*["']/i.test(bodyHtml),
      hasCertifications: /certificad\w*|premio\w*|award\w*|acreditad\w*/i.test(bodyText),
      hasPublicationDate: extractPublicationDate(html, jsonLdNodes) !== null,
      publicationDate: extractPublicationDate(html, jsonLdNodes),
      titleTag: extractTagTexts(html, 'title')[0] ?? null,
      metaDescription: findMetaContent(html, 'description'),
      schemaTypes: schemaTypesOf(jsonLdNodes),
    };

    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: `Fallo al parsear el HTML: ${error instanceof Error ? error.message : 'desconocido'}`,
    };
  }
}
