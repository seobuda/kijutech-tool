// SEO · Artículo completo redactado con IA desde el brief (27 nov 2026, petición de Enric). PURO: sin base de datos ni red;
// se prueba en tests/seo-articulo.test.ts.
// - La IA devuelve cabeceras (TÍTULO, META, SLUG) y el cuerpo en HTML tras una línea «---».
// - El HTML se limpia con LISTA BLANCA antes de guardarlo o enviarlo a WordPress: solo etiquetas de texto, sin ningún
//   atributo (ni enlaces: los pone la persona al revisar), sin scripts ni estilos.

export type Article = { title: string; meta: string; slug: string; html: string; words: number };

const ALLOWED = new Set(['h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'br']);
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|noscript|template|svg|math|head|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

const decode = (s: string) => s.replace(/&nbsp;/g, ' ');

/** Deja solo las etiquetas permitidas y SIN atributos. El texto de las etiquetas quitadas se conserva. */
export function sanitizeArticleHtml(html: string): string {
  let s = html.replace(/<!--[\s\S]*?-->/g, '').replace(DROP_WITH_CONTENT, '');
  // Cualquier etiqueta: se queda solo si está en la lista, y siempre sin atributos.
  s = s.replace(/<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (_m, slash: string, tag: string) => {
    const t = tag.toLowerCase();
    if (t === 'h1') return slash ? '</h2>' : '<h2>'; // el título lo pone WordPress: no un segundo H1
    if (!ALLOWED.has(t)) return '';
    if (t === 'br') return slash ? '' : '<br>';
    return `<${slash}${t}>`;
  });
  // Restos de «<» sueltos que no forman una etiqueta permitida.
  s = s.replace(/<(?!\/?(h2|h3|h4|p|ul|ol|li|strong|em|b|i|blockquote|table|thead|tbody|tr|th|td|br)>)/gi, '&lt;');
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/, '');
}

export function countWords(html: string): number {
  return decode(html.replace(/<[^>]+>/g, ' ')).split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/**
 * Lee la respuesta de la IA. Devuelve null si falta el cuerpo o es demasiado corto (< 300 palabras): mejor fallar que
 * mandar a WordPress medio artículo.
 */
export function parseArticle(raw: string, fallbackTitle: string): Article | null {
  const text = raw.replace(/^```(?:html)?\s*|\s*```$/g, '').trim();
  const sep = text.search(/^\s*-{3,}\s*$/m);
  if (sep < 0) return null;
  const head = text.slice(0, sep);
  const body = text.slice(sep).replace(/^\s*-{3,}\s*$/m, '');
  const field = (name: RegExp) => head.match(name)?.[1]?.trim().replace(/^["«]|["»]$/g, '') ?? '';
  const title = (field(/^\s*T[IÍ]TULO\s*:\s*(.+)$/im) || fallbackTitle).slice(0, 120);
  const meta = field(/^\s*META(?:\s*DESCRIPCI[OÓ]N)?\s*:\s*(.+)$/im).slice(0, 170);
  const slug = slugify(field(/^\s*SLUG\s*:\s*(.+)$/im) || title);
  const html = sanitizeArticleHtml(body);
  const words = countWords(html);
  if (words < 300) return null;
  return { title, meta, slug, html, words };
}
