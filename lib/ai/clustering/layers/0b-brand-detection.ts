import type { ClusterProposal, KeywordInput } from '../types';

export type BrandGroup = {
  competitorName: string;
  keywords: KeywordInput[];
  primaryKeyword: string;
};

// Nombres de competidor más cortos que esto no se usan para matching —
// evita que un nombre de 2-3 letras (o un competidor mal introducido en
// el paso 2) capture keywords que no tienen relación real con esa marca.
const MIN_COMPETITOR_NAME_LENGTH = 4;

const COMBINING_DIACRITICS_RE = new RegExp('[\\u0300-\\u036f]', 'g');

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS_RE, '')
    .toLowerCase()
    .replace(/[\s-]+/g, '');
}

function totalVolume(keywords: KeywordInput[]): number {
  return keywords.reduce((sum, k) => sum + (k.volume ?? 0), 0);
}

function pickPrimaryKeyword(keywords: KeywordInput[]): string {
  return keywords.reduce((best, k) => ((k.volume ?? 0) > (best.volume ?? 0) ? k : best)).keyword;
}

// Capa 0b — antes que nada más en el pipeline (ni Capa 0 de intención ni
// embeddings). Saca del flujo normal las keywords que son búsquedas de
// marca de un competidor conocido del proyecto (seo_kw_competitors): esas
// keywords nunca deberían agruparse por similitud semántica con el resto
// ni pasar por la Capa 4 (LLM) — su clasificación es siempre la misma
// ("es una búsqueda de esta marca") y no depende de contexto.
export function detectBrandKeywords(
  rawKeywords: KeywordInput[],
  competitors: Array<{ name: string }>
): { brandGroups: BrandGroup[]; remainingKeywords: KeywordInput[] } {
  const normalizedCompetitors = competitors
    .map((c) => ({ name: c.name, normalized: normalize(c.name) }))
    .filter((c) => c.normalized.length >= MIN_COMPETITOR_NAME_LENGTH);

  const groupsByCompetitor = new Map<string, KeywordInput[]>();
  const remainingKeywords: KeywordInput[] = [];

  for (const kw of rawKeywords) {
    const normalizedKeyword = normalize(kw.keyword);

    // Si varios competidores matchean la misma keyword, se queda con el
    // nombre normalizado más largo (match más específico) — evita que un
    // nombre corto y genérico "robe" el match de uno más preciso también
    // contenido en la keyword.
    let bestMatch: { name: string; normalized: string } | null = null;
    for (const competitor of normalizedCompetitors) {
      if (!normalizedKeyword.includes(competitor.normalized)) continue;
      if (!bestMatch || competitor.normalized.length > bestMatch.normalized.length) {
        bestMatch = competitor;
      }
    }

    if (!bestMatch) {
      remainingKeywords.push(kw);
      continue;
    }

    if (!groupsByCompetitor.has(bestMatch.name)) {
      groupsByCompetitor.set(bestMatch.name, []);
    }
    groupsByCompetitor.get(bestMatch.name)!.push(kw);
  }

  const brandGroups: BrandGroup[] = Array.from(groupsByCompetitor.entries()).map(
    ([competitorName, keywords]) => ({
      competitorName,
      keywords,
      primaryKeyword: pickPrimaryKeyword(keywords),
    })
  );

  return { brandGroups, remainingKeywords };
}

// Los brandGroups no pasan por Capa 4 (LLM) — se convierten directamente
// en ClusterProposal con esta forma fija, sin coste de tokens.
export function brandGroupToProposal(group: BrandGroup): ClusterProposal {
  return {
    title: `Marca competidora: ${group.competitorName}`,
    target_url: null,
    url_type: null,
    destination: null,
    content_type: 'competencia_detectada',
    search_intent: 'navegacional',
    difficulty: null,
    low_volume: totalVolume(group.keywords) < 20,
    reasoning: `Búsqueda de marca del competidor ${group.competitorName}, detectada automáticamente.`,
    strategy_note: null,
    is_ai_suggested: false,
    is_competitor_brand: true,
    primary_keyword: group.primaryKeyword,
    keywords: group.keywords.map((k) => ({
      keyword: k.keyword,
      monthly_volume: k.volume,
      is_primary: k.keyword === group.primaryKeyword,
      pending_verification: false,
    })),
  };
}
