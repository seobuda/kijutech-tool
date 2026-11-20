// Reglas puras de la base de conocimiento (NÚCLEO, 20 nov 2026). Sin base de datos: las usan el servidor, las pantallas
// y las pruebas. Diseño: docs/DISENO-JEFE-OPERACIONES.md.

export const KB_STATUSES = ['borrador', 'propuesta', 'mas_tarde', 'publicada', 'archivada'] as const;
export type KbStatus = (typeof KB_STATUSES)[number];
export const KB_STATUS_LABEL: Record<KbStatus, string> = {
  borrador: 'Borrador',
  propuesta: 'Pendiente de revisar',
  mas_tarde: 'Para más tarde',
  publicada: 'Publicada',
  archivada: 'Archivada'
};
export const isKbStatus = (v: string): v is KbStatus => (KB_STATUSES as readonly string[]).includes(v);

export const KB_SOURCES = ['manual', 'equipo', 'respuesta', 'clickup', 'dictado', 'agente'] as const;
export type KbSource = (typeof KB_SOURCES)[number];
export const KB_SOURCE_LABEL: Record<KbSource, string> = {
  manual: 'Escrita a mano',
  equipo: 'Solicitud del equipo',
  respuesta: 'Respuesta de Enric',
  clickup: 'Importada de ClickUp',
  dictado: 'Dictada por Telegram',
  agente: 'Propuesta por un agente'
};

export type KbLink = { title: string; url: string };

export const KB_LIMITS = { title: 255, problem: 4000, solution: 20000, tag: 40, tags: 12, links: 20, linkTitle: 200, url: 500, request: 8000 } as const;

/** Categoría por defecto de una lista o carpeta de ClickUp (por su nombre). Sin IA: palabras clave. null = sin categoría. */
export function categoryFromClickUpName(...names: (string | null | undefined)[]): string | null {
  const n = names
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (!n.trim()) return null;
  if (/\b(ppc|ads|google ads|meta ads|campan)/.test(n)) return 'google_ads';
  if (/\b(seo|keyword|search console|seranking|serp|posicionamiento)/.test(n)) return 'seo';
  if (/\b(wordpress|elementor|divi|gravity|mantenimiento web|desarrollo web|diseno y desarrollo|landing|web)/.test(n)) return 'web';
  if (/\b(articulo|contenido|redaccion|edicion|video|social media|copy)/.test(n)) return 'contenidos';
  if (/\b(operation|gestion de proyectos|clickup|cliente|onboarding|factura|declaracion|proceso)/.test(n)) return 'operativa';
  if (/\b(herramienta|clarity|tag manager|gtm|analitica|crm|gohighlevel|ghl|make|n8n|automatizacion|gpt|prompt|ia)\b/.test(n)) return 'herramientas';
  return null;
}

/** Etiquetas limpias: minúsculas, sin repetir, cortas y como mucho 12. */
export function cleanTags(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  const out: string[] = [];
  for (const t of list) {
    const v = String(t ?? '')
      .trim()
      .toLowerCase()
      .replace(/^#/, '')
      .replace(/\s+/g, ' ')
      .slice(0, KB_LIMITS.tag);
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= KB_LIMITS.tags) break;
  }
  return out;
}

/** Solo enlaces http(s) válidos, sin repetir; el título por defecto es el dominio. */
export function cleanLinks(raw: unknown): KbLink[] {
  if (!Array.isArray(raw)) return [];
  const out: KbLink[] = [];
  for (const l of raw) {
    const o = (l ?? {}) as Record<string, unknown>;
    const url = String(o.url ?? '').trim().slice(0, KB_LIMITS.url);
    if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(url) || out.some((x) => x.url === url)) continue;
    let host = url;
    try {
      host = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      continue;
    }
    const title = String(o.title ?? o.titulo ?? '').trim().slice(0, KB_LIMITS.linkTitle) || host;
    out.push({ title, url });
    if (out.length >= KB_LIMITS.links) break;
  }
  return out;
}

/** Enlaces que aparecen escritos en un texto (para no perder vídeos al importar o redactar). */
export function linksInText(text: string): KbLink[] {
  const urls = String(text ?? '').match(/https?:\/\/[^\s<>()"'\]]+/gi) ?? [];
  return cleanLinks(urls.map((u) => ({ url: u.replace(/[.,;:!?]+$/, ''), title: '' })));
}

/** Un texto que parece llevar una contraseña o clave no entra en la base (los accesos solo se dicen dónde están). */
export function looksLikeSecret(text: string): boolean {
  return /(contrase[ñn]a|password|passwd|clave de acceso|api[ _-]?key|token)\s*[:=]\s*\S{4,}/i.test(String(text ?? ''));
}

/** Texto con el que se calcula el embedding de una entrada (título, problema, solución y etiquetas). */
export function embeddingText(a: { title: string; problem: string; solution: string; tags: string[] }): string {
  return `${a.title}\n${a.problem}\n${a.tags.join(', ')}\n${a.solution}`.slice(0, 8000);
}

/**
 * Búsqueda híbrida: une los resultados por significado (embeddings) y por palabras (texto completo) con Reciprocal Rank
 * Fusion (k = 60), sin IA. Una entrada que sale en las dos listas sube; la útil según el equipo, un poco más.
 */
export function fuseRankings(
  semantic: string[],
  lexical: string[],
  usefulness: Map<string, { helpful: number; notHelpful: number }> = new Map(),
  k = 60
): string[] {
  const score = new Map<string, number>();
  semantic.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + 1 / (k + i + 1)));
  lexical.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + 1 / (k + i + 1)));
  for (const [id, s] of score) {
    const u = usefulness.get(id);
    if (!u) continue;
    // Entre −10 % y +10 % según lo que dijo el equipo (con 5 votos o más pesa del todo).
    const votes = u.helpful + u.notHelpful;
    if (votes === 0) continue;
    const ratio = (u.helpful - u.notHelpful) / votes;
    score.set(id, s * (1 + 0.1 * ratio * Math.min(1, votes / 5)));
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/** Entradas publicadas sin revisar en más de 12 meses: se marcan para revisar. */
export function needsReview(a: { status: string; reviewedAt: Date | null; publishedAt: Date | null }, now = new Date()): boolean {
  if (a.status !== 'publicada') return false;
  const ref = a.reviewedAt ?? a.publishedAt;
  return !ref || now.getTime() - ref.getTime() > 365 * 86_400_000;
}

/** Lo que propone la IA, ya validado. Las claves vienen del prompt kb_redactar_entrada. */
export type KbDraft = { title: string; problem: string; solution: string; category: string | null; tags: string[]; links: KbLink[]; note: string };

export function cleanDraft(raw: unknown, categoryKeys: string[]): KbDraft | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const title = String(o.titulo ?? '').trim().slice(0, KB_LIMITS.title);
  const solution = String(o.solucion ?? '').trim().slice(0, KB_LIMITS.solution);
  if (!title || !solution) return null;
  const cat = String(o.categoria ?? '').trim();
  return {
    title,
    problem: String(o.problema ?? '').trim().slice(0, KB_LIMITS.problem),
    solution,
    category: categoryKeys.includes(cat) ? cat : null,
    tags: cleanTags(o.etiquetas),
    links: cleanLinks(o.enlaces),
    note: String(o.nota_para_enric ?? '').trim().slice(0, 1000)
  };
}
