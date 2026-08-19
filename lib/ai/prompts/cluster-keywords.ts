export function buildClusteringPrompt(keywords: Array<{
  keyword: string;
  volume: number | null;
  position: number | null;
  difficulty: number | null;
}>): string {
  return `Eres un experto en SEO especializado en keyword research.

Analiza estas ${keywords.length} keywords y agrúpalas en clusters
semánticos por intención de búsqueda.

REGLAS ESTRICTAS:
- Cada cluster debe tener UNA intención de búsqueda clara
- Una keyword solo puede pertenecer a UN cluster
- Responde ÚNICAMENTE con JSON válido, sin texto adicional,
  sin markdown, sin explicaciones

FORMATO DE RESPUESTA (JSON estricto):
{
  "clusters": [
    {
      "title": "Título descriptivo del cluster",
      "target_url": "/slug-en-espanol-sin-acentos",
      "difficulty": "easy|medium|hard",
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
  "unassigned": ["keywords que no encajan en ningún cluster"]
}

Keywords a analizar:
${keywords.map(k =>
  `- ${k.keyword}` +
  (k.volume ? ` (${k.volume}/mes)` : '') +
  (k.position ? ` [pos. competidor: ${k.position}]` : '') +
  (k.difficulty ? ` [dif: ${k.difficulty}/10]` : '')
).join('\n')}

Responde SOLO con el JSON. Nada más.`;
}
