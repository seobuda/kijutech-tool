// SEO · El brief como texto (parte 9a; atasco 5 de la simulación): el mismo texto para «Copiar como texto» (navegador) y
// para el encargo al redactor (servidor). PURO: sin base de datos.

export const INTENT_LABEL: Record<string, string> = { local: 'local (mapa)', transaccional: 'contratar / comprar', informacional: 'informarse', mixta: 'mixta' };
type Sub = { label: string; sites: number };
export type BriefData = {
  query?: string;
  related?: string[];
  intent?: string | null;
  pageType?: string | null;
  volume?: number | null;
  words?: number | null;
  subtopics?: Sub[];
  questions?: string[];
  client?: Record<string, unknown>;
  target?: string | null;
  links?: { from: string; anchor: string }[];
  score?: { missing: string[]; queryInTitle: boolean; queryInH1: boolean; wordsLow: boolean } | null;
};
const val = (v: unknown) => (Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : '');

export function briefToText(keyword: string, d: BriefData): string {
  const lines = [
    `BRIEF: ${keyword}`,
    d.intent ? `Intención: ${INTENT_LABEL[d.intent] ?? d.intent}${d.pageType ? ` · tipo de página que gana: ${d.pageType}` : ''}` : '',
    d.volume ? `Búsquedas al mes: ${d.volume}` : '',
    d.words ? `Extensión orientativa: unas ${d.words} palabras (lo que trae la competencia; no rellenar)` : '',
    d.target ? `Página: ${d.target}` : 'Página nueva',
    '',
    ...(d.score
      ? [
          'Lo que le falta a la página:',
          ...(!d.score.queryInTitle ? ['- La búsqueda en el título'] : []),
          ...(!d.score.queryInH1 ? ['- La búsqueda en el H1'] : []),
          ...(d.score.wordsLow ? ['- Más texto útil'] : []),
          ...d.score.missing.slice(0, 10).map((m) => `- Subtema: ${m}`),
          ''
        ]
      : []),
    'Búsquedas relacionadas:',
    ...(d.related ?? []).map((q) => `- ${q}`),
    '',
    'Subtemas que trata la competencia:',
    ...(d.subtopics ?? []).map((s) => `- ${s.label} (${s.sites} webs)`),
    '',
    'Preguntas:',
    ...(d.questions ?? []).map((q) => `- ${q}`),
    '',
    'Datos propios del cliente (lo que la competencia no tiene):',
    ...Object.entries(d.client ?? {})
      .filter(([, v]) => val(v))
      .map(([k, v]) => `- ${k}: ${val(v)}`),
    '',
    'Enlazar desde:',
    ...(d.links ?? []).map((l) => `- ${l.from} con el texto «${l.anchor}»`)
  ];
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim();
}
