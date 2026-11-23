// Núcleo: taxonomía de técnicas (Hito 1 SEO, 23 nov 2026; docs/DISENO-MODULO-SEO.md §7.3). PURO, sin imports.
// Cada intervención (encargo hecho) lleva una técnica de esta lista y la versión de la lista: así se puede medir qué
// funciona por técnica y por tipo de negocio. Si una técnica cambia de significado, se sube TAXONOMY_VERSION; nunca se
// reutiliza una clave para otra cosa. Las de Ads llegarán con su dominio.

export const TAXONOMY_VERSION = 1;

export type TechniqueDomain = 'seo' | 'ads' | 'web' | 'otro';
export type Technique = { key: string; domain: TechniqueDomain; label: string; /** Métrica que normalmente mueve (hipótesis por defecto). */ metric: string; windowDays: number };

export const TECHNIQUES: Technique[] = [
  // Técnico
  { key: 'error_servidor_corregido', domain: 'seo', label: 'Corregir errores de servidor o páginas rotas', metric: 'clics', windowDays: 28 },
  { key: 'redireccion_corregida', domain: 'seo', label: 'Corregir redirecciones y enlaces a redirecciones', metric: 'clics', windowDays: 42 },
  { key: 'canonical_corregido', domain: 'seo', label: 'Corregir etiquetas canonical', metric: 'impresiones', windowDays: 42 },
  { key: 'sitemap_corregido', domain: 'seo', label: 'Corregir o crear el sitemap', metric: 'impresiones', windowDays: 42 },
  { key: 'indexacion_corregida', domain: 'seo', label: 'Corregir indexación (noindex, páginas no rastreadas)', metric: 'impresiones', windowDays: 42 },
  { key: 'velocidad', domain: 'seo', label: 'Mejorar la velocidad del servidor o de la web', metric: 'clics', windowDays: 56 },
  { key: 'https', domain: 'seo', label: 'Pasar a HTTPS', metric: 'clics', windowDays: 56 },
  { key: 'renderizado', domain: 'seo', label: 'Contenido visible sin JavaScript', metric: 'impresiones', windowDays: 56 },
  // En la página
  { key: 'titulo_reescrito', domain: 'seo', label: 'Reescribir títulos', metric: 'ctr', windowDays: 28 },
  { key: 'meta_descripcion', domain: 'seo', label: 'Escribir meta descripciones', metric: 'ctr', windowDays: 28 },
  { key: 'encabezados', domain: 'seo', label: 'Ordenar encabezados (H1)', metric: 'posicion', windowDays: 42 },
  { key: 'contenido_ampliado', domain: 'seo', label: 'Ampliar contenido escaso', metric: 'impresiones', windowDays: 56 },
  { key: 'contenido_duplicado', domain: 'seo', label: 'Quitar o unificar contenido duplicado', metric: 'clics', windowDays: 56 },
  { key: 'imagenes_alt', domain: 'seo', label: 'Texto alternativo en imágenes', metric: 'impresiones', windowDays: 56 },
  { key: 'contenido_nuevo', domain: 'seo', label: 'Crear contenido nuevo', metric: 'impresiones', windowDays: 90 },
  { key: 'contenido_actualizado', domain: 'seo', label: 'Actualizar contenido existente', metric: 'clics', windowDays: 56 },
  { key: 'nueva_landing_servicio', domain: 'seo', label: 'Crear página por servicio', metric: 'impresiones', windowDays: 90 },
  { key: 'nueva_landing_zona', domain: 'seo', label: 'Crear página por zona', metric: 'impresiones', windowDays: 90 },
  // Estructura
  { key: 'enlazado_interno', domain: 'seo', label: 'Mejorar el enlazado interno', metric: 'posicion', windowDays: 42 },
  { key: 'arquitectura', domain: 'seo', label: 'Reorganizar la arquitectura de la web', metric: 'clics', windowDays: 90 },
  // Datos estructurados
  { key: 'schema_negocio', domain: 'seo', label: 'Datos estructurados del negocio', metric: 'impresiones', windowDays: 56 },
  { key: 'schema_limpieza', domain: 'seo', label: 'Quitar datos estructurados que no aportan', metric: 'impresiones', windowDays: 56 },
  // Local
  { key: 'ficha_google', domain: 'seo', label: 'Optimizar la ficha de Google', metric: 'impresiones', windowDays: 42 },
  { key: 'respuesta_resenas', domain: 'seo', label: 'Responder reseñas', metric: 'clics', windowDays: 56 },
  { key: 'nap_coherente', domain: 'seo', label: 'Unificar nombre, dirección y teléfono', metric: 'impresiones', windowDays: 56 },
  { key: 'citaciones_locales', domain: 'seo', label: 'Altas en directorios locales', metric: 'impresiones', windowDays: 90 },
  // Autoridad
  { key: 'enlaces_externos', domain: 'seo', label: 'Conseguir enlaces externos', metric: 'posicion', windowDays: 90 },
  { key: 'digital_pr', domain: 'seo', label: 'Apariciones en medios', metric: 'impresiones', windowDays: 90 },
  // Otros
  { key: 'web_cambio', domain: 'web', label: 'Cambio en la web (diseño o funcionalidad)', metric: 'clics', windowDays: 56 },
  { key: 'otra', domain: 'otro', label: 'Otra técnica', metric: 'clics', windowDays: 56 }
];

export const TECHNIQUE_BY_KEY = new Map(TECHNIQUES.map((t) => [t.key, t]));

export function techniqueLabel(key: string): string {
  return TECHNIQUE_BY_KEY.get(key)?.label ?? key;
}

/** Una técnica válida o «otra» (nunca se guarda una clave inventada). */
export function normalizeTechnique(key: string | null | undefined): string {
  return key && TECHNIQUE_BY_KEY.has(key) ? key : 'otra';
}

/**
 * Técnica aproximada a partir de la categoría de trabajo de Estrategia (contenido, onpage, tecnico, enlaces, gbp, web…).
 * La categoría es más gruesa que la técnica: sirve para no perder la intervención; la fina la pone quien la aprueba.
 */
export function techniqueFromCategory(category: string | null | undefined): string {
  switch (category) {
    case 'contenido':
      return 'contenido_nuevo';
    case 'onpage':
      return 'titulo_reescrito';
    case 'tecnico':
      return 'indexacion_corregida';
    case 'enlaces':
      return 'enlaces_externos';
    case 'gbp':
      return 'ficha_google';
    case 'web':
      return 'web_cambio';
    default:
      return 'otra';
  }
}
