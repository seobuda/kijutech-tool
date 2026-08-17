export const AUDIT_CHECKPOINTS: Record<string, readonly string[]> = {
  tecnico: [
    'titles',
    'meta_descriptions',
    'h1',
    'errores_404',
    'canonical',
    'indexacion',
    'sitemap',
    'estructura_urls'
  ],
  rendimiento: [
    'core_web_vitals',
    'velocidad_movil',
    'velocidad_escritorio',
    'imagenes_optimizadas',
    'cache'
  ],
  contenido: [
    'thin_content',
    'contenido_duplicado',
    'keyword_stuffing',
    'paginas_sin_texto',
    'blog_activo'
  ],
  autoridad: ['perfil_backlinks', 'backlinks_toxicos', 'anchor_text', 'domain_rating'],
  local: ['google_business_profile', 'nap_consistente', 'resenas', 'citas_locales']
};

export const AUDIT_AREA_LABELS: Record<string, string> = {
  tecnico: 'Técnico',
  rendimiento: 'Rendimiento',
  contenido: 'Contenido',
  autoridad: 'Autoridad',
  local: 'Local'
};

export function formatCheckPointLabel(checkPoint: string) {
  const words = checkPoint.split('_');
  return words
    .map((word, index) =>
      index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word
    )
    .join(' ');
}
