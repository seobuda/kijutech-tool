// SEO · Plan de mejora: reglas PURAS (Hito 1, 23 nov 2026; docs/DISENO-TECNICO-HITO1.md §3 y §9).
// Convierte los hallazgos abiertos en propuestas de trabajo SIN IA: cada tipo de hallazgo tiene su técnica y su plantilla;
// se agrupan por técnica, se ordenan por gravedad, número de páginas e impresiones en Google de esas páginas, se estiman
// las horas (minutos por página + base) y se marcan las que no caben en las horas del proyecto. Cada propuesta lleva como
// mucho BATCH páginas (las que más se ven primero): un encargo manejable; el resto sale en la siguiente.
// Desde el 26 nov 2026 (Plan A+B): la prioridad también pesa el esfuerzo (a igual impacto, antes lo que cuesta menos), cada
// propuesta lleva los clics al mes que puede traer y el porqué de su puesto, y las propuestas se reparten por meses con
// las horas del proyecto (scheduleMonths).

export type PlanSeverity = 'critico' | 'importante' | 'aviso' | 'info';
export type PlanFinding = {
  id: string;
  kind: string;
  severity: PlanSeverity;
  url: string | null;
  query?: string | null;
  /** Impresiones de lo que afecta (búsqueda o tema), cuando no es una página entera (90 días). */
  impressions?: number | null;
  /** Valor de negocio del tema (0,5-3) según lo que sabemos del cliente; null = no se sabe. */
  valor?: number | null;
  /** Clics al mes que se podrían ganar (oportunidades del mapa). */
  gain?: number | null;
};
export type PlanHypothesis = { metric?: string; direction?: 'sube' | 'baja'; magnitudePct?: number; windowDays?: number };
export type PlanDraft = {
  technique: string;
  title: string;
  description: string;
  findingIds: string[];
  urls: string[];
  priority: 1 | 2 | 3;
  score: number;
  estHours: number;
  hypothesis: PlanHypothesis;
  evidence: {
    kinds: Record<string, number>;
    pages: number;
    pagesTotal: number;
    impressions: number;
    severity: PlanSeverity;
    overHours?: boolean;
    /** Clics al mes que se podrían ganar (suma de las oportunidades del mapa; 0 si es un arreglo sin estimación). */
    gainPerMonth?: number;
    /** Valor de negocio medio de lo que toca (si se sabe). */
    valor?: number | null;
  };
};

export const BATCH = 40;

type Recipe = { technique: string; title: (n: number) => string; how: string; minutesPerUrl: number; baseHours: number; metric: string; windowDays: number; /** Para hallazgos sin URL que cuentan uno a uno (p. ej. un servicio sin página). */ minutesPerFinding?: number };

/** Plantilla por técnica (lo que verá el equipo en el encargo). */
const RECIPES: Record<string, Recipe> = {
  error_servidor_corregido: { technique: 'error_servidor_corregido', title: (n) => `Arreglar ${n} página(s) que dan error`, how: 'Revisa cada URL: si la página debe existir, arréglala; si no, redirígela (301) a la más parecida y quita los enlaces que apuntan a ella.', minutesPerUrl: 10, baseHours: 0.5, metric: 'clics', windowDays: 28 },
  redireccion_corregida: { technique: 'redireccion_corregida', title: (n) => `Corregir redirecciones en ${n} página(s)`, how: 'Cambia los enlaces internos para que apunten directamente a la URL final y deja las cadenas de redirecciones en un solo salto.', minutesPerUrl: 5, baseHours: 0.5, metric: 'clics', windowDays: 42 },
  renderizado: { technique: 'renderizado', title: () => 'Hacer visible el contenido sin JavaScript', how: 'El contenido principal se pinta con JavaScript y Google puede no verlo. Revisa el tema o el constructor para servirlo en el HTML.', minutesPerUrl: 0, baseHours: 3, metric: 'impresiones', windowDays: 56 },
  velocidad: { technique: 'velocidad', title: () => 'Mejorar la velocidad del servidor', how: 'La web tarda en responder. Revisa la caché de página, el hosting y los plugins que más cargan; mide antes y después.', minutesPerUrl: 0, baseHours: 4, metric: 'clics', windowDays: 56 },
  https: { technique: 'https', title: () => 'Pasar la web a HTTPS', how: 'Instala el certificado, redirige todo HTTP a HTTPS (301) y actualiza los enlaces internos y el sitemap.', minutesPerUrl: 0, baseHours: 2, metric: 'clics', windowDays: 56 },
  sitemap_corregido: { technique: 'sitemap_corregido', title: (n) => (n ? `Limpiar el sitemap (${n} URL)` : 'Crear el sitemap'), how: 'El sitemap solo debe llevar páginas que respondan 200 y se puedan indexar. Quita las demás o corrige su estado, y envíalo en Search Console.', minutesPerUrl: 2, baseHours: 0.5, metric: 'impresiones', windowDays: 42 },
  canonical_corregido: { technique: 'canonical_corregido', title: (n) => `Corregir el canonical de ${n} página(s)`, how: 'Cada página debe apuntar a sí misma salvo que sea una copia de otra. Corrige los canonical que señalan a otra URL o a una página rota.', minutesPerUrl: 5, baseHours: 0.5, metric: 'impresiones', windowDays: 42 },
  titulo_reescrito: { technique: 'titulo_reescrito', title: (n) => `Reescribir el título de ${n} página(s)`, how: 'Un título único por página, de unos 55-60 caracteres, con el servicio y la zona al principio. Revisa también el nombre del sitio que se añade al final.', minutesPerUrl: 6, baseHours: 0.5, metric: 'ctr', windowDays: 28 },
  meta_descripcion: { technique: 'meta_descripcion', title: (n) => `Escribir la meta descripción de ${n} página(s)`, how: 'Una descripción única por página, de unos 140-155 caracteres, que diga qué se ofrece y por qué hacer clic.', minutesPerUrl: 5, baseHours: 0.5, metric: 'ctr', windowDays: 28 },
  encabezados: { technique: 'encabezados', title: (n) => `Ordenar el H1 de ${n} página(s)`, how: 'Un único H1 por página que diga de qué trata; el resto de títulos, H2 y H3.', minutesPerUrl: 4, baseHours: 0.5, metric: 'posicion', windowDays: 42 },
  idiomas_corregidos: { technique: 'idiomas_corregidos', title: (n) => `Corregir idiomas y hreflang en ${n} página(s)`, how: 'Cada versión de idioma debe enlazar a todas las demás y a sí misma con su código correcto (es, ca, es-ES, x-default), solo hacia páginas que respondan 200 y sean indexables. Pon también lang="…" en la etiqueta <html>. En WordPress suele arreglarse en el plugin de idiomas (WPML o Polylang).', minutesPerUrl: 10, baseHours: 0.5, metric: 'impresiones', windowDays: 56 },
  adaptar_movil: { technique: 'adaptar_movil', title: (n) => `Adaptar al móvil ${n} página(s)`, how: 'Añade en el <head> la etiqueta <meta name="viewport" content="width=device-width, initial-scale=1"> (en WordPress la pone el tema: revisa que el tema sea responsive) y comprueba la página en un móvil.', minutesPerUrl: 10, baseHours: 0.5, metric: 'impresiones', windowDays: 56 },
  imagenes_optimizadas: { technique: 'imagenes_optimizadas', title: (n) => `Optimizar las imágenes de ${n} página(s)`, how: 'Comprime las imágenes y súbelas a WebP o AVIF, del tamaño en que se muestran (no de 4000 px para una miniatura), con ancho y alto declarados y carga diferida (loading="lazy") salvo la primera. En WordPress, un plugin de optimización (ShortPixel, Imagify o similar) lo hace en lote.', minutesPerUrl: 20, baseHours: 0.5, metric: 'clics', windowDays: 56 },
  enlaces_externos_corregidos: { technique: 'enlaces_externos_corregidos', title: (n) => `Arreglar enlaces rotos hacia otras webs en ${n} página(s)`, how: 'En cada página, quita el enlace roto o cámbialo por la página nueva de esa web (búscala o usa archive.org si era una fuente). En WordPress, un plugin como Broken Link Checker ayuda a encontrarlos todos.', minutesPerUrl: 5, baseHours: 0.25, metric: 'impresiones', windowDays: 42 },
  recuperar_pagina: { technique: 'recuperar_pagina', title: (n) => (n === 1 ? 'Recuperar una página que pierde clics' : `Recuperar ${n} páginas que pierden clics`), how: 'Han perdido muchos clics de Google en 4 semanas y no es temporada. Para cada una: mira en Search Console qué búsquedas bajaron y en qué posición estaban; comprueba si la página cambió (título, contenido, noindex, redirección), quién la ha adelantado en Google y si coincide con una actualización de Google. Luego actualiza el contenido (fecha, datos, lo que ahora tienen los primeros) y refuerza sus enlaces internos.', minutesPerUrl: 60, baseHours: 0, metric: 'clics', windowDays: 56 },
  contenido_ampliado: { technique: 'contenido_ampliado', title: (n) => `Ampliar el contenido de ${n} página(s)`, how: 'Páginas con muy poco texto. Amplíalas con lo que el cliente necesita saber (servicio, proceso, precios orientativos, preguntas frecuentes) o únelas a otra.', minutesPerUrl: 45, baseHours: 0, metric: 'impresiones', windowDays: 56 },
  contenido_duplicado: { technique: 'contenido_duplicado', title: (n) => `Quitar contenido duplicado en ${n} página(s)`, how: 'Páginas con el mismo texto (o casi). Busca qué bloque las repite (p. ej. un listado de entradas que incrusta otras completas), une las que sobran con una 301 o diferencia su contenido.', minutesPerUrl: 15, baseHours: 1, metric: 'clics', windowDays: 56 },
  imagenes_alt: { technique: 'imagenes_alt', title: (n) => `Texto alternativo en las imágenes de ${n} página(s)`, how: 'Describe cada imagen en su atributo alt (qué se ve, sin rellenar con palabras clave).', minutesPerUrl: 5, baseHours: 0.5, metric: 'impresiones', windowDays: 56 },
  enlazado_interno: { technique: 'enlazado_interno', title: (n) => `Enlazar ${n} página(s) que están aisladas o muy profundas`, how: 'Enlaza estas páginas desde el menú, el pie o páginas relacionadas, para que estén a 3 clics o menos de la portada.', minutesPerUrl: 5, baseHours: 1, metric: 'posicion', windowDays: 42 },
  schema_negocio: { technique: 'schema_negocio', title: () => 'Poner los datos estructurados del negocio', how: 'Pega el código JSON-LD de la pantalla Salud técnica (generado con la ficha del cliente) en todas las páginas y compruébalo con la prueba de resultados enriquecidos.', minutesPerUrl: 0, baseHours: 1, metric: 'impresiones', windowDays: 56 },
  schema_limpieza: { technique: 'schema_limpieza', title: (n) => `Quitar datos estructurados que no aportan en ${n} página(s)`, how: 'Quita el marcado de preguntas frecuentes (Google ya no lo muestra para casi ninguna web) y las valoraciones del propio negocio (no las admite).', minutesPerUrl: 3, baseHours: 0.5, metric: 'impresiones', windowDays: 56 },
  canibalizacion_resuelta: { technique: 'canibalizacion_resuelta', title: (n) => `Resolver la canibalización de ${n} página(s)`, how: 'Para cada búsqueda afectada (en «Qué ha encontrado»), Google alterna entre varias páginas. Elige la buena: une el contenido de las demás en ella y redirígelas (301), o diferencia cada página para una intención distinta y enlaza a la buena con el texto de la búsqueda.', minutesPerUrl: 30, baseHours: 0.5, metric: 'posicion', windowDays: 42 },
  nap_coherente: { technique: 'nap_coherente', title: () => 'Unificar nombre, dirección y teléfono', how: 'El nombre, la dirección y el teléfono deben ser idénticos en la web (pie, contacto y datos estructurados), la ficha de Google y los directorios. Confirma con el cliente cuáles son los buenos, corrige la web y actualiza la ficha del cliente.', minutesPerUrl: 0, baseHours: 1, metric: 'impresiones', windowDays: 56 },
  nueva_landing_servicio: { technique: 'nueva_landing_servicio', title: (n) => `Crear la página de ${n} servicio(s)`, how: 'Cada servicio necesita su propia página: qué incluye, para quién, cómo se trabaja, zona, preguntas frecuentes y llamada a la acción. Enlázala desde el menú y desde la portada.', minutesPerUrl: 0, baseHours: 0, minutesPerFinding: 240, metric: 'impresiones', windowDays: 90 },
  nueva_pagina_tema: { technique: 'nueva_pagina_tema', title: (n) => (n === 1 ? 'Crear una página para búsquedas que no tienen ninguna' : `Crear ${n} páginas para búsquedas que no tienen ninguna`), how: 'Google ya muestra la web para estas búsquedas, pero ninguna página trata el tema. Crea una página por tema, pensada para la búsqueda principal (en el título, el H1 y la URL): qué ofreces, para quién, zona, precio orientativo o proceso, preguntas frecuentes y llamada a la acción. Enlázala desde el menú o desde las páginas relacionadas.', minutesPerUrl: 0, baseHours: 0, minutesPerFinding: 240, metric: 'clics', windowDays: 90 },
  reforzar_pagina_tema: { technique: 'reforzar_pagina_tema', title: (n) => (n === 1 ? 'Elegir y reforzar la página de un tema que Google reparte' : `Elegir y reforzar la página de ${n} temas que Google reparte`), how: 'Para cada tema, Google reparte las impresiones entre varias páginas. Usa la página indicada (ya sale en el top 20): pon la búsqueda principal en su título y H1, amplía la parte que responde a esas búsquedas y enlázala desde las otras páginas con ese texto. Si las otras dicen lo mismo, únelas a esta con una 301.', minutesPerUrl: 90, baseHours: 0, metric: 'clics', windowDays: 56 },
  optimizar_al_alcance: { technique: 'optimizar_al_alcance', title: (n) => (n === 1 ? 'Subir al top 3 una página que ya está cerca' : `Subir al top 3: ${n} páginas que ya están cerca`), how: 'Estas páginas salen entre la posición 4 y la 15 para las búsquedas indicadas. Para cada una: lleva la búsqueda al título y al H1 si no está, añade o amplía la sección que la responde, revisa que el contenido sea mejor que el de los tres primeros y enlázala desde otras páginas con el texto de la búsqueda.', minutesPerUrl: 30, baseHours: 0.5, metric: 'clics', windowDays: 42 },
  indexacion_corregida: { technique: 'indexacion_corregida', title: (n) => `Revisar ${n} página(s) que salen en Google y no encontramos en la web`, how: 'Salen en Search Console pero el rastreo no llega a ellas: enlázalas si deben existir o redirígelas si sobran.', minutesPerUrl: 5, baseHours: 0.5, metric: 'impresiones', windowDays: 42 }
};

/** Qué técnica resuelve cada tipo de hallazgo de Salud técnica. */
export const KIND_TECHNIQUE: Record<string, string> = {
  'seo.http_5xx': 'error_servidor_corregido',
  'seo.http_4xx': 'error_servidor_corregido',
  'seo.fetch_error': 'error_servidor_corregido',
  'seo.redirect_chain': 'redireccion_corregida',
  'seo.link_to_redirect': 'redireccion_corregida',
  'seo.js_rendered': 'renderizado',
  'seo.slow_server': 'velocidad',
  'seo.not_https': 'https',
  'seo.sitemap_missing': 'sitemap_corregido',
  'seo.noindex_in_sitemap': 'sitemap_corregido',
  'seo.non200_in_sitemap': 'sitemap_corregido',
  'seo.canonical_other': 'canonical_corregido',
  'seo.canonical_broken': 'canonical_corregido',
  'seo.title_missing': 'titulo_reescrito',
  'seo.title_duplicate': 'titulo_reescrito',
  'seo.title_long': 'titulo_reescrito',
  'seo.meta_description_missing': 'meta_descripcion',
  'seo.meta_description_duplicate': 'meta_descripcion',
  'seo.h1_missing': 'encabezados',
  'seo.h1_multiple': 'encabezados',
  'seo.thin_content': 'contenido_ampliado',
  'seo.duplicate_content': 'contenido_duplicado',
  'seo.near_duplicate': 'contenido_duplicado',
  'seo.images_without_alt': 'imagenes_alt',
  'seo.orphan_in_sitemap': 'enlazado_interno',
  'seo.deep_page': 'enlazado_interno',
  'seo.schema_org_missing': 'schema_negocio',
  'seo.schema_fields_missing': 'schema_negocio',
  'seo.schema_faq': 'schema_limpieza',
  'seo.schema_self_reviews': 'schema_limpieza',
  'seo.gsc_page_not_crawled': 'indexacion_corregida',
  'seo.nap_name_mismatch': 'nap_coherente',
  'seo.nap_phone_mismatch': 'nap_coherente',
  'seo.nap_phone_missing': 'nap_coherente',
  'seo.nap_address_mismatch': 'nap_coherente',
  'seo.service_page_missing': 'nueva_landing_servicio',
  'seo.cannibalization': 'canibalizacion_resuelta',
  'seo.topic_new_page': 'nueva_pagina_tema',
  'seo.topic_unclear_page': 'reforzar_pagina_tema',
  'seo.striking_distance': 'optimizar_al_alcance',
  'seo.low_ctr': 'titulo_reescrito',
  // Vigilancia continua (parte 0, 26 nov 2026).
  'seo.page_drop': 'recuperar_pagina',
  'seo.redirect_loop': 'redireccion_corregida',
  'seo.robots_blocks_resources': 'indexacion_corregida',
  'seo.sitemap_blocked': 'sitemap_corregido',
  'seo.ai_crawlers_blocked': 'indexacion_corregida',
  'seo.external_broken': 'enlaces_externos_corregidos',
  'seo.page_regressed': 'error_servidor_corregido',
  'seo.viewport_missing': 'adaptar_movil',
  'seo.mixed_content': 'https',
  'seo.images_unsized': 'imagenes_optimizadas',
  'seo.images_heavy': 'imagenes_optimizadas',
  'seo.anchor_generic': 'enlazado_interno',
  'seo.hreflang_invalid': 'idiomas_corregidos',
  'seo.hreflang_not_reciprocal': 'idiomas_corregidos',
  'seo.hreflang_broken': 'idiomas_corregidos',
  'seo.lang_missing': 'idiomas_corregidos',
  'seo.site_down': 'error_servidor_corregido',
  'seo.home_error': 'error_servidor_corregido',
  'seo.home_noindex': 'indexacion_corregida',
  'seo.robots_block_all': 'indexacion_corregida',
  'seo.not_indexed': 'indexacion_corregida',
  'seo.ssl_expiring': 'https',
  'seo.cwv_slow': 'velocidad',
  'seo.cwv_average': 'velocidad'
};

const SEV_WEIGHT: Record<PlanSeverity, number> = { critico: 8, importante: 4, aviso: 2, info: 1 };
const SEV_ORDER: PlanSeverity[] = ['critico', 'importante', 'aviso', 'info'];

const round1 = (n: number) => Math.round(n * 10) / 10;
/** «1 página(s)» → «1 página»; «3 página(s)» → «3 páginas» (también servicio, tema). */
export const plural = (t: string) => t.replace(/\b1 (página|servicio|tema)\(s\)/g, '1 $1').replace(/(\d+) (página|servicio|tema)\(s\)/g, '$1 $2s');

/**
 * Propuestas a partir de los hallazgos abiertos. «impressions» = impresiones (90 días) por URL en Search Console;
 * «monthlyHours» = horas del proyecto al mes (null = sin límite). Las propuestas salen ordenadas por prioridad.
 */
export function buildPlan(findings: PlanFinding[], impressions: Map<string, number>, monthlyHours: number | null, labels: Record<string, string> = {}): PlanDraft[] {
  const byTech = new Map<string, PlanFinding[]>();
  for (const f of findings) {
    const t = KIND_TECHNIQUE[f.kind];
    if (!t) continue;
    byTech.set(t, [...(byTech.get(t) ?? []), f]);
  }
  const drafts: PlanDraft[] = [];
  for (const [technique, list] of byTech) {
    const r = RECIPES[technique];
    // URLs únicas, las que más se ven primero; los hallazgos sin URL (de todo el sitio) siempre entran.
    const urlImpr = new Map<string, number>();
    for (const f of list) if (f.url) urlImpr.set(f.url, impressions.get(f.url) ?? 0);
    const ranked = [...urlImpr.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const batch = ranked.slice(0, BATCH).map(([u]) => u);
    const inBatch = new Set(batch);
    const chosen = list.filter((f) => !f.url || inBatch.has(f.url));
    const severity = SEV_ORDER.find((s) => chosen.some((f) => f.severity === s)) ?? 'info';
    // Impacto: lo que se ven esas páginas o, si es mayor, lo que se ven las búsquedas o temas afectados (una canibalización
    // o un tema sin página pesan por sus búsquedas, no por una página concreta).
    const pageImpr = batch.reduce((s, u) => s + (urlImpr.get(u) ?? 0), 0);
    const findingImpr = chosen.reduce((s, f) => s + (f.impressions ?? 0), 0);
    const impr = Math.max(pageImpr, findingImpr);
    const pages = batch.length;
    // Valor de negocio (si se sabe): un servicio prioritario del cliente pesa más; lo que no le interesa, menos.
    const vals = chosen.map((f) => f.valor).filter((v): v is number => typeof v === 'number');
    const valor = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
    const valueFactor = valor !== null ? 0.6 + 0.2 * valor : 1;
    const perFindingH = r.minutesPerFinding ? (r.minutesPerFinding * chosen.filter((f) => !f.url).length) / 60 : 0;
    const hours = Math.min(40, Math.max(0.5, round1(r.baseHours + (r.minutesPerUrl * pages) / 60 + perFindingH)));
    // Esfuerzo: a igual impacto, antes lo que cuesta menos (0,5 h → ×0,98; 4 h → ×0,83; 20 h → ×0,5).
    const effortFactor = 1 / (1 + hours / 20);
    const gainPerMonth = Math.round(chosen.reduce((a, f) => a + (f.gain ?? 0), 0));
    const score = round1(SEV_WEIGHT[severity] * (1 + Math.log10(1 + Math.max(pages, 1))) * (1 + Math.log10(1 + impr) / 2) * valueFactor * effortFactor * 1.2);
    // Lo importante nunca baja de media: un 404 en dos páginas no es «baja» aunque se vea poco.
    const priority: 1 | 2 | 3 = severity === 'critico' || score >= 14 ? 1 : severity === 'importante' || score >= 5 ? 2 : 3;
    const estHours = hours;
    const queries = chosen
      .filter((f) => f.query)
      .sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0))
      .map((f) => `${f.query}${f.impressions ? ` (${f.impressions} impresiones en 90 días)` : ''}`);
    const kinds: Record<string, number> = {};
    for (const f of chosen) kinds[f.kind] = (kinds[f.kind] ?? 0) + 1;
    const rest = ranked.length - batch.length;
    const lines = [
      r.how,
      '',
      '**Qué ha encontrado la auditoría:**',
      ...Object.entries(kinds).map(([k, n]) => `- ${labels[k] ?? k}: ${n}`),
      ...(queries.length ? ['', '**Cuáles:**', ...queries.map((q) => `- ${q}`)] : []),
      ...(batch.length ? ['', `**Páginas (${batch.length}${rest > 0 ? ` de ${ranked.length}; el resto irá en la siguiente tanda` : ''}):**`, ...batch.map((u) => `- ${u}${urlImpr.get(u) ? ` (${urlImpr.get(u)} impresiones en 90 días)` : ''}`)] : []),
      '',
      'Cuando esté hecho, vuelve a pasar la auditoría (Proyectos → Salud): lo arreglado se cierra solo.'
    ];
    drafts.push({
      technique,
      title: plural(r.title(r.minutesPerFinding ? chosen.length : pages)),
      description: lines.join('\n'),
      findingIds: chosen.map((f) => f.id),
      urls: batch,
      priority,
      score,
      estHours,
      hypothesis: { metric: r.metric, direction: 'sube', windowDays: r.windowDays },
      evidence: { kinds, pages, pagesTotal: ranked.length, impressions: impr, severity, gainPerMonth, valor }
    });
  }
  drafts.sort((a, b) => a.priority - b.priority || b.score - a.score);
  if (monthlyHours !== null && monthlyHours > 0) {
    let used = 0;
    for (const d of drafts) {
      used += d.estHours;
      if (used > monthlyHours) d.evidence.overHours = true;
    }
  }
  return drafts;
}

// --- Reparto por meses (26 nov 2026) -------------------------------------------------------------------------------

export type ScheduleItem = { id: string; estHours: number; priority: number; severity?: string | null };
/**
 * Reparte las propuestas pendientes (ya ordenadas por prioridad) en meses con las horas del proyecto: el mes actual
 * tiene lo que queda tras lo aprobado este mes. Lo crítico va siempre este mes. Una propuesta más grande que un mes
 * entero ocupa su propio mes. Sin horas definidas, todo es «este mes». Devuelve el índice de mes de cada una (0 = este).
 */
export function scheduleMonths(items: ScheduleItem[], monthlyHours: number | null, usedThisMonth: number): Map<string, number> {
  const out = new Map<string, number>();
  if (!monthlyHours || monthlyHours <= 0) {
    for (const i of items) out.set(i.id, 0);
    return out;
  }
  const used: number[] = [Math.max(0, usedThisMonth)];
  for (const i of items) {
    if (i.severity === 'critico') {
      out.set(i.id, 0);
      used[0] += i.estHours;
      continue;
    }
    let m = 0;
    for (;;) {
      used[m] ??= 0;
      const room = monthlyHours - used[m];
      if (i.estHours <= room + 1e-9 || (used[m] === 0 && i.estHours > monthlyHours)) break;
      m++;
      if (m > 24) break;
    }
    used[m] = (used[m] ?? 0) + i.estHours;
    out.set(i.id, m);
  }
  return out;
}

/** Por qué una propuesta está donde está, en una línea (para la pantalla). */
export function whyLine(e: { impressions?: number; gainPerMonth?: number; valor?: number | null; severity?: string }, estHours: number): string {
  const parts: string[] = [];
  if (e.severity === 'critico') parts.push('es grave: va primero');
  else if (e.severity === 'importante') parts.push('es importante');
  if (e.impressions) parts.push(`${e.impressions.toLocaleString('es-ES')} impresiones en 90 días`);
  if (e.gainPerMonth) parts.push(`≈ +${e.gainPerMonth.toLocaleString('es-ES')} clics/mes posibles (${Math.round(e.gainPerMonth / Math.max(estHours, 0.5)).toLocaleString('es-ES')} por hora de trabajo)`);
  if (e.valor != null) parts.push(e.valor >= 3 ? 'toca un servicio prioritario del cliente' : e.valor >= 2 ? 'toca un servicio del cliente' : e.valor <= 0.5 ? 'puede no interesarle al cliente' : 'no es un servicio suyo');
  parts.push(`${estHours.toLocaleString('es-ES', { maximumFractionDigits: 1 })} h`);
  return parts.join(' · ');
}
