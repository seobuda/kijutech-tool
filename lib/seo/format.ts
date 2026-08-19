const MONTHS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic'
];

export function formatCompletedAt(date: Date | string) {
  const d = new Date(date);
  const day = d.getDate();
  const month = MONTHS[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} a las ${hours}:${minutes}`;
}

// Dificultad numérica (0-10) importada de SE Ranking. Mismo criterio en
// todas las pantallas que la muestran (paso 2, paso 4 y vista del cliente).
export function keywordDifficultyLabel(difficulty: number): {
  label: string;
  className: string;
} {
  if (difficulty <= 3) return { label: 'Fácil', className: 'bg-green-100 text-green-700' };
  if (difficulty <= 6) return { label: 'Media', className: 'bg-yellow-100 text-yellow-700' };
  return { label: 'Difícil', className: 'bg-red-100 text-red-700' };
}

// Tipo de página destino de un cluster, propuesto por el clustering con IA.
// Mismos colores en la pantalla de revisión, el paso 4 y el mapa público.
export const URL_TYPE_META: Record<string, { label: string; className: string }> = {
  landing_servicio: { label: 'Landing Servicio', className: 'bg-gray-100 text-gray-700' },
  landing_local: { label: 'Landing Local', className: 'bg-blue-100 text-blue-700' },
  articulo_satelite: { label: 'Artículo Satélite', className: 'bg-green-100 text-green-700' },
  comparativa_competidores: { label: 'Comparativa', className: 'bg-orange-100 text-orange-700' },
  blog_informacional: { label: 'Blog', className: 'bg-purple-100 text-purple-700' },
};

export function urlTypeLabel(urlType: string | null): { label: string; className: string } | null {
  if (!urlType) return null;
  return URL_TYPE_META[urlType] ?? null;
}
