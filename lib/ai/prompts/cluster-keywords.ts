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
7. CLASIFICACIÓN ESTRATÉGICA — para cada cluster define:

DESTINO:
- "own_site": el contenido se publica en el sitio web del cliente
- "external_site": el contenido se publica en otro dominio para
  conseguir backlinks hacia la landing objetivo del cliente. Usar
  cuando las keywords son de marca competidora o cuando el contenido
  comparativo no encaja en el sitio del cliente.

TIPO DE CONTENIDO:
- "landing_transaccional": página de servicio orientada a
  conversión. Sin formato blog. Con formulario, testimonios y CTA
  directo.
- "articulo_pilar": artículo largo y exhaustivo que cubre un tema en
  profundidad. Objetivo: autoridad temática. Recibe enlaces internos
  de artículos satélite.
- "articulo_satelite": artículo más corto que apoya al pilar con
  enlaces internos. Cubre un aspecto específico del tema.
- "landing_local": landing orientada a una ubicación geográfica muy
  concreta (barrio, pueblo, zona).
- "comparativa": página que menciona y compara con competidores.
  Puede ir en el propio sitio o en externo.

INTENCIÓN DE BÚSQUEDA:
- "transaccional": el usuario quiere comprar, contratar o realizar
  una acción. Keywords con: precios, contratar, servicio,
  presupuesto, cerca de mí.
- "informacional": el usuario quiere aprender o resolver una duda.
  Keywords con: cómo, qué es, para qué sirve, beneficios,
  diferencias.
- "navegacional": el usuario busca una marca o sitio específico.
  Keywords con nombres de empresa o marca.
- "local": el usuario busca un servicio en una ubicación concreta.
  Keywords con nombre de ciudad, barrio o zona.

STRATEGY_NOTE: escribe 2-3 frases explicando:
1. Por qué clasificaste este cluster con estas etiquetas
2. Qué tipo de contenido recomiendas crear exactamente
3. Un consejo práctico específico para ejecutarlo bien
Escríbelo en español, en tono didáctico — lo leerá alguien
aprendiendo SEO.
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
      "destination": "own_site|external_site",
      "content_type": "landing_transaccional|articulo_pilar|articulo_satelite|landing_local|comparativa",
      "search_intent": "transaccional|informacional|navegacional|local",
      "strategy_note": "Explicación didáctica de 2-3 frases...",
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
      "destination": "own_site|external_site",
      "content_type": "landing_transaccional|articulo_pilar|articulo_satelite|landing_local|comparativa",
      "search_intent": "transaccional|informacional|navegacional|local",
      "strategy_note": "Explicación didáctica de 2-3 frases...",
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
