export type StrategyOption = {
  value: string;
  // Texto corto sin emoji — el badge cerrado (regla del proyecto: los
  // badges son texto con color de fondo, sin emojis).
  short: string;
  // Texto largo con emoji — solo se ve dentro del <select> nativo abierto.
  full: string;
  className: string;
};

export const DESTINATION_OPTIONS: StrategyOption[] = [
  { value: 'own_site', short: 'Web propia', full: '🏠 Web propia', className: 'bg-gray-800 text-white' },
  { value: 'external_site', short: 'Web externa', full: '🌐 Web externa', className: 'bg-slate-600 text-white' },
];

export const CONTENT_TYPE_OPTIONS: StrategyOption[] = [
  { value: 'landing_transaccional', short: 'Landing', full: '🎯 Landing transaccional', className: 'bg-blue-700 text-white' },
  { value: 'articulo_pilar', short: 'Art. Pilar', full: '📚 Artículo pilar', className: 'bg-violet-700 text-white' },
  { value: 'articulo_satelite', short: 'Art. Satélite', full: '🛰️ Artículo satélite', className: 'bg-violet-400 text-white' },
  { value: 'landing_local', short: 'Local', full: '📍 Landing local', className: 'bg-teal-600 text-white' },
  { value: 'comparativa', short: 'Comparativa', full: '⚖️ Comparativa', className: 'bg-orange-600 text-white' },
];

export const SEARCH_INTENT_OPTIONS: StrategyOption[] = [
  { value: 'transaccional', short: 'Transaccional', full: '💰 Transaccional', className: 'bg-green-700 text-white' },
  { value: 'informacional', short: 'Informacional', full: '📖 Informacional', className: 'bg-sky-600 text-white' },
  { value: 'navegacional', short: 'Navegacional', full: '🧭 Navegacional', className: 'bg-gray-500 text-white' },
  { value: 'local', short: 'Local', full: '📌 Local', className: 'bg-teal-500 text-white' },
];

export function findStrategyOption(
  options: StrategyOption[],
  value: string | null
): StrategyOption | null {
  if (!value) return null;
  return options.find((o) => o.value === value) ?? null;
}

// Explicación fija por combinación destination+content_type, mostrada en
// el modal ⓘ bajo "¿Qué significa esto?". Combinaciones no listadas aquí
// no muestran esa sección (solo el strategy_note, si lo hay).
export const FIXED_STRATEGY_EXPLANATIONS: Record<string, string> = {
  'own_site+landing_transaccional':
    'Crea una página de servicio en el sitio del cliente. Formato: landing con hero, beneficios, testimonios y formulario de contacto visible. Evita el formato blog. Objetivo: que el visitante contacte o compre.',
  'own_site+articulo_pilar':
    'Crea un artículo largo y exhaustivo (+2000 palabras) en el blog del cliente. Cubre el tema en profundidad. Otros artículos satélite enlazarán a este. Objetivo: posicionarte como referente del tema.',
  'own_site+articulo_satelite':
    'Crea un artículo más corto que trate un aspecto específico del tema principal. Debe enlazar internamente al artículo pilar correspondiente. Objetivo: reforzar la autoridad del pilar.',
  'own_site+landing_local':
    'Crea una landing específica para esta ubicación. Incluye el nombre del lugar en el título, H1 y contenido. Añade el mapa de Google y datos de contacto locales. Objetivo: aparecer en búsquedas locales de esa zona.',
  'external_site+comparativa':
    'Este contenido va en un sitio externo (blog de colaborador, guest post, directorio sectorial). Menciona al cliente como alternativa superior a los competidores nombrados en las keywords. Objetivo: conseguir un backlink hacia la landing principal del cliente.',
  'own_site+comparativa':
    'Crea una página comparativa en el sitio del cliente. Presenta al cliente como la mejor opción frente a los competidores nombrados. Usa datos objetivos: precios, servicios, valoraciones. Objetivo: captar usuarios que evalúan opciones.',
};

export function getFixedStrategyExplanation(
  destination: string | null,
  contentType: string | null
): string | null {
  if (!destination || !contentType) return null;
  return FIXED_STRATEGY_EXPLANATIONS[`${destination}+${contentType}`] ?? null;
}
