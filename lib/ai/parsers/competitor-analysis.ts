import { extractJsonFromLLMResponse } from './json-extractor';

export type AnalysisRecommendation = {
  priority: 'critico' | 'recomendado' | 'diferenciador';
  action: string;
  what: string;
  why: string;
  how: string;
  competitor_count: number;
};

export type AnalysisStructureSection = {
  order: number;
  section: string;
  one_line: string;
};

export type ParsedCompetitorAnalysis = {
  recommendations: AnalysisRecommendation[];
  recommended_structure: AnalysisStructureSection[];
  summary: string;
};

// Lleva la respuesta cruda adjunta, para poder guardarla en
// seo_competitor_analysis.analysis_json cuando el parseo falla.
export class CompetitorAnalysisParseError extends Error {
  rawResponse: string;

  constructor(message: string, rawResponse: string) {
    super(message);
    this.name = 'CompetitorAnalysisParseError';
    this.rawResponse = rawResponse;
  }
}

function throwParseError(message: string, rawText: string): never {
  console.error('=== AI RAW RESPONSE (competitor analysis parsing failed) ===');
  console.error(rawText);
  console.error('=== END RAW RESPONSE ===');
  throw new CompetitorAnalysisParseError(message, rawText);
}

function extractJson(raw: string): unknown {
  try {
    return extractJsonFromLLMResponse(raw);
  } catch {
    return throwParseError('La respuesta de la IA no es JSON válido', raw);
  }
}

const VALID_PRIORITIES = new Set(['critico', 'recomendado', 'diferenciador']);
const PRIORITY_ORDER: Record<string, number> = { critico: 0, recomendado: 1, diferenciador: 2 };

function parseRecommendations(raw: unknown): AnalysisRecommendation[] {
  if (!Array.isArray(raw)) return [];

  const items: AnalysisRecommendation[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const priority = typeof e.priority === 'string' && VALID_PRIORITIES.has(e.priority) ? e.priority : null;
    if (
      !priority ||
      typeof e.action !== 'string' ||
      typeof e.what !== 'string' ||
      typeof e.why !== 'string' ||
      typeof e.how !== 'string'
    ) {
      continue;
    }
    items.push({
      priority: priority as AnalysisRecommendation['priority'],
      action: e.action,
      what: e.what,
      why: e.why,
      how: e.how,
      competitor_count: typeof e.competitor_count === 'number' ? e.competitor_count : 0,
    });
  }

  // Se reordena defensivamente aunque el prompt ya se lo pida al modelo,
  // sin confiar en que el modelo respete el orden pedido.
  return items.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]).slice(0, 8);
}

function parseStructure(raw: unknown): AnalysisStructureSection[] {
  if (!Array.isArray(raw)) return [];

  const items: AnalysisStructureSection[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.section !== 'string' || typeof e.one_line !== 'string') continue;
    items.push({
      order: typeof e.order === 'number' ? e.order : items.length + 1,
      section: e.section,
      one_line: e.one_line,
    });
  }

  return items.slice(0, 5);
}

export function parseCompetitorAnalysisResponse(raw: string): ParsedCompetitorAnalysis {
  const data = extractJson(raw);

  if (typeof data !== 'object' || data === null) {
    throwParseError('La respuesta de la IA no tiene la estructura esperada', raw);
  }

  const d = data as Record<string, unknown>;

  return {
    recommendations: parseRecommendations(d.recommendations),
    recommended_structure: parseStructure(d.recommended_structure),
    summary: typeof d.summary === 'string' ? d.summary : '',
  };
}
