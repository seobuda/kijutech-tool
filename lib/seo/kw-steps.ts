export const KW_STEPS = [
  { key: 'competitors', name: 'Análisis de competidores', path: 'competitors' },
  { key: 'keywords', name: 'Extracción de keywords', path: 'keywords' },
  { key: 'clustering', name: 'Clustering con IA', path: 'clustering' },
  { key: 'clusters', name: 'Mapa de clusters', path: 'clusters' }
] as const;

export type KwStepKey = (typeof KW_STEPS)[number]['key'];
