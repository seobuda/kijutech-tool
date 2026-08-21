import type { AnalysisContext, AnalysisContextCompetitor } from './competitor-analysis-builder';

export const COMPETITOR_ANALYSIS_SYSTEM_PROMPT = `Eres un consultor SEO experto analizando páginas competidoras para
crear una guía de acción para un gestor de proyectos sin formación
técnica en SEO.

Tu objetivo es producir recomendaciones que cualquier persona pueda
entender y ejecutar. Usa siempre lenguaje de negocio, nunca jerga SEO.

Cuando digas "posicionamiento" di "aparecer en Google".
Cuando digas "CTR" di "porcentaje de personas que hacen clic".
Cuando digas "intención de búsqueda" di "lo que busca el usuario".
Cuando digas "E-E-A-T" di "señales de confianza".

Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni
después, sin bloques de código markdown. La estructura exacta está
en el user prompt.`;

const KICKOFF_LABELS: Record<string, string> = {
  business_type: 'Tipo de negocio',
  main_services: 'Servicios principales',
  target_audience: 'Público objetivo',
  usp: 'Propuesta de valor',
  differentiators: 'Diferenciadores',
};

function formatKickoffAnswers(answers: Record<string, string>): string {
  const lines = Object.entries(answers).map(([key, value]) => `${KICKOFF_LABELS[key] ?? key}: ${value}`);
  return lines.length > 0 ? lines.join('\n') : '(sin información de kickoff disponible)';
}

function yesNo(value: boolean): string {
  return value ? 'sí' : 'no';
}

function formatKeywords(keywords: AnalysisContext['keywords']): string {
  return keywords
    .map(
      (k) =>
        `- ${k.keyword} — ${k.monthlyVolume ?? '?'} búsquedas/mes${k.isPrimary ? ' (principal)' : ''}`
    )
    .join('\n');
}

function formatCompetitor(index: number, competitor: AnalysisContextCompetitor): string {
  const { url, data } = competitor;
  const faqLines = data.faqs.map((f) => f.question).join('\n');

  return [
    `=== COMPETIDOR ${index + 1}: ${url} ===`,
    `Title: ${data.titleTag ?? '(sin title)'}`,
    `Meta: ${data.metaDescription ?? '(sin meta description)'}`,
    `H1: ${data.h1 ?? '(sin H1)'}`,
    `Secciones principales: ${data.h2s.join(' | ') || '(ninguna)'}`,
    `FAQs detectadas: ${data.faqs.length} preguntas`,
    faqLines,
    `CTAs: ${data.ctaTexts.join(' / ') || '(ninguno detectado)'}`,
    `Menciona precio: ${yesNo(data.mentionsPrice)}`,
    `Tiene reseñas: ${data.hasReviews ? `sí${data.reviewCount ? `, ${data.reviewCount}` : ''}` : 'no'}`,
    `Tiene galería: ${yesNo(data.hasGallery)}`,
    `Tiene vídeo: ${yesNo(data.hasVideo)}`,
    `Autor identificado: ${yesNo(data.hasNamedAuthor)}`,
    `Señales de confianza (certificados, premios): ${yesNo(data.hasCertifications)}`,
    `Schema markup: ${data.schemaTypes.join(', ') || 'ninguno detectado'}`,
  ].join('\n');
}

const OUTPUT_INSTRUCTION = `Analiza estos competidores y genera el JSON con esta estructura exacta:

{
  "recommendations": [
    {
      "priority": "critico|recomendado|diferenciador",
      "action": "título corto de la recomendación (máx 8 palabras)",
      "what": "qué es exactamente, en 2-3 frases simples",
      "why": "por qué importa para este negocio concreto,
              mencionando datos de los competidores cuando sea relevante
              (ej: 'los 4 competidores que aparecen antes que tú lo tienen')",
      "how": "pasos concretos para ejecutarlo, sin tecnicismos",
      "competitor_count": número de competidores que lo tienen (0-5)
    }
  ],
  "recommended_structure": [
    {
      "order": 1,
      "section": "nombre de la sección",
      "one_line": "para qué sirve esta sección en una frase"
    }
  ],
  "summary": "2-3 frases resumen del análisis para que Jesús
              entienda el estado general de la situación antes
              de ver las recomendaciones"
}

Criterios de priority:
- critico: lo tienen 3 o más competidores Y el cliente no lo tiene
- recomendado: lo tienen 1-2 competidores O es una buena práctica
  general para este tipo de negocio
- diferenciador: ningún competidor lo hace bien —
  oportunidad de destacar

Ordena las recommendations por priority:
crítico primero, luego recomendado, luego diferenciador.
Máximo 8 recomendaciones en total.
Máximo 5 secciones en recommended_structure.`;

export function buildCompetitorAnalysisPrompt(context: AnalysisContext): { system: string; user: string } {
  const businessContext = [
    `Negocio: ${context.project.name}`,
    `Dominio: ${context.project.domain ?? '(sin dominio)'}`,
    `Ubicación: ${context.project.location ?? '(sin ubicación)'}`,
    `Sector y servicios: ${formatKickoffAnswers(context.kickoffAnswers)}`,
    `URL destino: ${context.cluster.targetUrl ?? 'Página nueva'}`,
  ].join('\n');

  const clusterInfo = [
    `Nombre: ${context.cluster.title}`,
    `Tipo estratégico: ${context.cluster.contentType ?? '(sin definir)'}`,
    'Keywords principales:',
    formatKeywords(context.keywords),
  ].join('\n');

  const competitorsBlock = context.competitors.map((c, i) => formatCompetitor(i, c)).join('\n\n');

  const user = [
    'CONTEXTO DEL NEGOCIO:',
    businessContext,
    '',
    'CLUSTER A ANALIZAR:',
    clusterInfo,
    '',
    'DATOS DE COMPETIDORES:',
    competitorsBlock,
    '',
    OUTPUT_INSTRUCTION,
  ].join('\n');

  return { system: COMPETITOR_ANALYSIS_SYSTEM_PROMPT, user };
}
