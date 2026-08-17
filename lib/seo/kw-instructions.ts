export function buildSeRankingInstructions(urls: string[]): string {
  const urlLines = urls.map((url, i) => `${i + 1}. ${url}`).join('\n');

  return `URLs a analizar en SE Ranking:
${urlLines}

Pasos a seguir:
1. Entra en SE Ranking → Investigación de competidores
2. Pega cada URL y exporta las top 50 keywords en CSV
3. Anota el volumen mensual de cada keyword para [ubicación del proyecto]
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
