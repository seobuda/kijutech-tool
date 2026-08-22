export const CONTENT_PLAN_SYSTEM_PROMPT = `Eres un consultor SEO experto ayudando a un gestor de proyectos sin
formación técnica en SEO a decidir qué artículos informacionales
escribir para apoyar una página principal (pilar).

Usa siempre lenguaje de negocio, nunca jerga SEO.
Responde ÚNICAMENTE con JSON válido, sin texto antes ni después.`;

export type ContentPlanKeyword = { keyword: string; monthlyVolume: number | null };

export type ContentPlanContext = {
  cluster: {
    title: string;
    targetUrl: string | null;
    keywords: ContentPlanKeyword[]; // hasta 5, ya recortado por el llamador
  };
  informationalKeywords: ContentPlanKeyword[]; // Fuente A
  manualQuestions: string[]; // Fuente B
  competitorGap: { h2s: string[]; faqQuestions: string[] }; // Fuente C
};

function formatKeywordList(keywords: ContentPlanKeyword[]): string {
  return keywords.map((k) => `- ${k.keyword} — ${k.monthlyVolume ?? '?'} búsquedas/mes`).join('\n');
}

const OUTPUT_INSTRUCTION = `INSTRUCCIÓN DE OUTPUT:
Genera hasta 8 ideas de artículos satélite, priorizadas. Para cada
una, decide tú con criterio si las keywords de la Fuente A encajan
temáticamente con este cluster pilar — no todas tienen por qué encajar.

{
  "summary": "2-3 frases sobre la oportunidad de contenido general
    para este cluster",
  "article_ideas": [
    {
      "priority": "alta|media|baja",
      "title": "título sugerido del artículo (máx 10 palabras)",
      "target_question": "la pregunta o keyword real que responde",
      "source": "keyword_existente|pregunta_google|gap_competidor",
      "what": "qué cubre el artículo, 2-3 frases simples",
      "why": "por qué importa para este negocio, mencionando el dato
        concreto que lo respalda (volumen real, o 'es una pregunta
        real que la gente busca en Google', o 'ningún competidor
        lo cubre bien')",
      "how": "enfoque breve para escribirlo, sin tecnicismos"
    }
  ]
}

Criterios de priority:
- alta: keyword con volumen real significativo, O aparece tanto en
  preguntas de Google como en gap de competidores (señal doble)
- media: una sola fuente la respalda, pero es relevante
- baja: keyword de volumen muy bajo o tema muy periférico

Ordena por priority: alta primero, luego media, luego baja.`;

export function buildContentPlanPrompt(context: ContentPlanContext): { system: string; user: string } {
  const clusterInfo = [
    `Título: ${context.cluster.title}`,
    `Keywords principales: ${formatKeywordList(context.cluster.keywords) || '(sin keywords)'}`,
    `URL destino: ${context.cluster.targetUrl ?? 'Página nueva'}`,
  ].join('\n');

  const sourceA =
    context.informationalKeywords.length > 0
      ? formatKeywordList(context.informationalKeywords)
      : 'Ninguna keyword informacional sin usar en este proyecto';

  const sourceB =
    context.manualQuestions.length > 0
      ? context.manualQuestions.map((q) => `- ${q}`).join('\n')
      : 'El usuario no ha aportado preguntas de Google todavía';

  const hasCompetitorGap = context.competitorGap.h2s.length > 0 || context.competitorGap.faqQuestions.length > 0;
  const sourceC = hasCompetitorGap
    ? [
        context.competitorGap.h2s.length > 0
          ? `Secciones (H2) que cubren los competidores:\n${context.competitorGap.h2s.map((h) => `- ${h}`).join('\n')}`
          : null,
        context.competitorGap.faqQuestions.length > 0
          ? `Preguntas de FAQ que responden los competidores:\n${context.competitorGap.faqQuestions.map((q) => `- ${q}`).join('\n')}`
          : null,
      ]
        .filter(Boolean)
        .join('\n\n')
    : 'No hay análisis de competidores todavía para este cluster';

  const user = [
    'CONTEXTO DEL CLUSTER PILAR:',
    clusterInfo,
    '',
    'FUENTE A — Keywords informacionales disponibles en el proyecto:',
    sourceA,
    '',
    'FUENTE B — Preguntas reales de Google aportadas por el usuario:',
    sourceB,
    '',
    'FUENTE C — Temas que cubren los competidores y el cliente no:',
    sourceC,
    '',
    OUTPUT_INSTRUCTION,
  ].join('\n');

  return { system: CONTENT_PLAN_SYSTEM_PROMPT, user };
}
