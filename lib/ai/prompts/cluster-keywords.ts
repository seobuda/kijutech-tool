type ClusteringKeywordInput = {
  keyword: string;
  volume: number | null;
  position: number | null;
  difficulty: number | null;
};

const FALLBACK_SYSTEM_PROMPT =
  'Eres un experto en SEO especializado en keyword research. Tu tarea es agrupar ' +
  'keywords por intención de búsqueda, clasificar el tipo de página destino de cada ' +
  'cluster y sugerir clusters adicionales de contenido que complementen la estrategia. ' +
  'Responde ÚNICAMENTE con JSON válido. Sin texto adicional, sin markdown, sin ' +
  'explicaciones previas ni posteriores.';

function formatKeywordsList(keywords: ClusteringKeywordInput[]): string {
  return keywords
    .map(
      (k) =>
        `- ${k.keyword}` +
        (k.volume ? ` (${k.volume}/mes)` : '') +
        (k.position ? ` [pos. competidor: ${k.position}]` : '') +
        (k.difficulty ? ` [dif: ${k.difficulty}/10]` : '')
    )
    .join('\n');
}

function buildFallbackUserPrompt(keywords: ClusteringKeywordInput[]): string {
  return `Analiza estas ${keywords.length} keywords y agrúpalas en clusters
semánticos por intención de búsqueda.

REGLAS ESTRICTAS:
- Cada cluster debe tener UNA intención de búsqueda clara
- Una keyword solo puede pertenecer a UN cluster
- Clasifica cada cluster con un url_type: "landing_servicio" |
  "landing_local" | "articulo_satelite" | "comparativa_competidores" |
  "blog_informacional"
- Marca low_volume: true si el volumen total del cluster es bajo
  para el sector
- Añade un reasoning breve (1 frase) explicando por qué ese cluster
  y ese url_type
- Si una keyword no encaja en ningún cluster pero tiene valor SEO,
  inclúyela en "unassigned" con su reason
- Si una keyword no tiene ningún valor SEO para este sector (fuera de
  tema, marca de un competidor, etc.), inclúyela en "irrelevant" con
  su reason
- Además de agrupar las keywords dadas, sugiere en "suggested_clusters"
  nuevos clusters de contenido con buen potencial SEO que no estén
  cubiertos por las keywords proporcionadas — no inventes volumen para
  estos, no lo incluyas
- Responde ÚNICAMENTE con JSON válido, sin texto adicional,
  sin markdown, sin explicaciones

FORMATO DE RESPUESTA (JSON estricto):
{
  "clusters": [
    {
      "title": "Título descriptivo del cluster",
      "target_url": "/slug-en-espanol-sin-acentos",
      "difficulty": "easy|medium|hard",
      "url_type": "landing_servicio",
      "low_volume": false,
      "reasoning": "Explicación breve de la elección",
      "primary_keyword": "la keyword principal exacta",
      "keywords": [
        {
          "keyword": "keyword exacta",
          "monthly_volume": 590,
          "is_primary": true
        }
      ]
    }
  ],
  "suggested_clusters": [
    {
      "title": "Título del cluster sugerido",
      "target_url": "/slug-en-espanol-sin-acentos",
      "difficulty": "easy|medium|hard",
      "url_type": "blog_informacional",
      "reasoning": "Por qué se sugiere este cluster",
      "primary_keyword": "keyword propuesta principal",
      "keywords": [
        { "keyword": "keyword propuesta", "is_primary": true }
      ]
    }
  ],
  "unassigned": [{ "keyword": "keyword sin cluster", "reason": "..." }],
  "irrelevant": [{ "keyword": "keyword descartada", "reason": "..." }]
}

Keywords a analizar:
${formatKeywordsList(keywords)}

Responde SOLO con el JSON. Nada más.`;
}

// Si `template` viene de ai_prompts.user_prompt_template, se sustituyen sus
// variables ({count}, {keywords_list}). El `system` devuelto aquí solo se usa
// cuando no hay fila en BD (is_active) — con template de BD, el llamador usa
// directamente ai_prompts.system_prompt en su lugar.
export function buildClusteringPrompt(
  keywords: ClusteringKeywordInput[],
  template?: string
): { system: string; user: string } {
  if (!template) {
    return { system: FALLBACK_SYSTEM_PROMPT, user: buildFallbackUserPrompt(keywords) };
  }

  const user = template
    .split('{count}')
    .join(String(keywords.length))
    .split('{keywords_list}')
    .join(formatKeywordsList(keywords));

  return { system: FALLBACK_SYSTEM_PROMPT, user };
}
