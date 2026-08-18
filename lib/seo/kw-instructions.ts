export const SERANKING_EXACT_URL_NOTE =
  'Importante en SE Ranking: al analizar cada URL, selecciona el tipo "URL exacta" (no "Dominio") para obtener solo las keywords de esa página concreta, no de todo el sitio web.';

export function buildSeRankingInstructions(
  urls: string[],
  location: string | null
): string {
  const urlLines = urls.map((url, i) => `${i + 1}. ${url}`).join('\n');
  const locationLabel = location?.trim() ? location.trim() : '[ubicación del proyecto]';

  return `URLs a analizar en SE Ranking:
${urlLines}

⚠️ ${SERANKING_EXACT_URL_NOTE}

Pasos a seguir:
1. Entra en SE Ranking → Investigación de competidores
2. Pega cada URL y exporta las top 50 keywords en CSV
3. Anota el volumen mensual de cada keyword para ${locationLabel}
4. Vuelve aquí con los datos para continuar al paso 2`;
}

export function buildTutorPrompt(
  keywords: { keyword: string; monthlyVolume: number | null }[]
): string {
  const list = keywords
    .map(
      (k) =>
        `- ${k.keyword}${k.monthlyVolume != null ? ` (${k.monthlyVolume}/mes)` : ''}`
    )
    .join('\n');

  return `Estoy haciendo un Keyword Research para un cliente.
Te paso ${keywords.length} keywords extraídas de SE Ranking y Google Ads.

Necesito que las agrupes por intención de búsqueda en clusters.
Para cada cluster:
- Ponle un título descriptivo
- Sugiere la URL destino (slug en español, sin acentos)
- Indica cuál es la keyword principal
- Indica si la dificultad es fácil, media o difícil

Keywords:
${list}`;
}

const TRAFFIC_SHARE_POSITION_ONE = 0.28;

export function estimateTrafficAtPositionOne(totalVolume: number): number {
  return Math.round(totalVolume * TRAFFIC_SHARE_POSITION_ONE);
}
