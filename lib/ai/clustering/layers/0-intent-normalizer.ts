import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiIntentModifiers } from '@/lib/db/schema';
import { getAdapter, withTimeout, CALL_TIMEOUT_MS } from '@/lib/ai/gateway';
import type { AIMessage } from '@/lib/ai/types';
import type { KeywordInput, ModifierDecision, NormalizedGroup } from '../types';

// Umbral de solape de palabras para considerar dos keywords "candidatas al
// mismo grupo" (raíz + variante) antes de mirar si el modificador que las
// distingue cambia la intención de búsqueda.
const OVERLAP_THRESHOLD = 0.6;

const STOPWORDS_ES = new Set([
  'de', 'en', 'el', 'la', 'los', 'las', 'un', 'una', 'para', 'con', 'por',
  'del', 'al', 'se', 'su', 'sus', 'mi', 'tu',
]);

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalizeText(s: string): string {
  return stripAccents(s.toLowerCase()).trim();
}

// Exportada — lib/seo/kw-feedback-actions.ts la reutiliza para reconstruir
// qué modificador distingue dos keywords de un cluster ya guardado, al
// procesar feedback de tipo 'intent_changed'.
export function wordsOf(keyword: string): string[] {
  return normalizeText(keyword).split(/\s+/).filter(Boolean);
}

type Candidate = {
  root: KeywordInput;
  rootWords: Set<string>;
  variants: KeywordInput[];
};

// Ordena por volumen descendente y agrupa cada keyword con las que
// comparten >60% de las palabras de la raíz (candidata a variante suya,
// pendiente de resolver con el modificador en el siguiente paso).
function buildCandidates(keywords: KeywordInput[]): Candidate[] {
  const sorted = [...keywords].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
  const unassigned = new Set(sorted.map((k) => k.keyword));
  const candidates: Candidate[] = [];

  for (const kw of sorted) {
    if (!unassigned.has(kw.keyword)) continue;
    unassigned.delete(kw.keyword);

    const rootWords = new Set(wordsOf(kw.keyword));
    const candidate: Candidate = { root: kw, rootWords, variants: [] };

    if (rootWords.size > 0) {
      for (const other of sorted) {
        if (!unassigned.has(other.keyword)) continue;
        const otherWords = wordsOf(other.keyword);
        const shared = otherWords.filter((w) => rootWords.has(w)).length;
        const ratio = shared / rootWords.size;
        if (ratio > OVERLAP_THRESHOLD) {
          candidate.variants.push(other);
          unassigned.delete(other.keyword);
        }
      }
    }

    candidates.push(candidate);
  }

  return candidates;
}

// Palabras extra que tiene `candidateWords` respecto a `rootWords`,
// preservando el orden original — así "cerca de mi" o "para ninos" se
// pueden buscar en ai_intent_modifiers como frase completa, no palabra a
// palabra (el catálogo humano guarda frases, no tokens sueltos). Si tras
// quitar las stopwords ES no queda ninguna palabra real, no hay
// modificador — es la misma keyword con relleno gramatical de más.
export function extractModifier(rootWords: Set<string>, candidateKeyword: string): string | null {
  const candidateWords = wordsOf(candidateKeyword);
  const extra = candidateWords.filter((w) => !rootWords.has(w));
  if (extra.length === 0) return null;

  const meaningful = extra.filter((w) => !STOPWORDS_ES.has(w));
  if (meaningful.length === 0) return null;

  return extra.join(' ');
}

async function lookupModifier(
  modifier: string,
  language: string
): Promise<'same_intent' | 'different_intent' | null> {
  const [row] = await db
    .select({ id: aiIntentModifiers.id, effect: aiIntentModifiers.effect })
    .from(aiIntentModifiers)
    .where(and(eq(aiIntentModifiers.modifier, modifier), eq(aiIntentModifiers.language, language)))
    .limit(1);

  if (!row) return null;

  await db
    .update(aiIntentModifiers)
    .set({ timesSeen: sql`${aiIntentModifiers.timesSeen} + 1`, updatedAt: new Date() })
    .where(eq(aiIntentModifiers.id, row.id));

  return row.effect === 'different_intent' ? 'different_intent' : 'same_intent';
}

// Extracción de JSON tolerante, mismo patrón que el resto de capas del
// pipeline (lib/ai/clustering/layers/4-strategic-classifier.ts) — se
// duplica en vez de compartirse porque cada capa valida una forma de
// respuesta distinta.
function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // sigue
  }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      // sigue
    }
  }
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {
      // sigue
    }
  }
  throw new Error('La clasificación de modificadores no devolvió JSON válido');
}

// Clasifica en una sola llamada todos los modificadores desconocidos del
// lote (no están en ai_intent_modifiers todavía) y los guarda con
// confidence 70 / source 'ai_classified' para que la próxima vez sean un
// lookup de tabla en vez de otra llamada a la IA.
async function classifyUnknownModifiers(
  modifiers: string[],
  provider: string,
  model: string,
  apiKey: string,
  language: string
): Promise<Map<string, 'same_intent' | 'different_intent'>> {
  const result = new Map<string, 'same_intent' | 'different_intent'>();
  if (modifiers.length === 0) return result;

  const adapter = getAdapter(provider);
  if (!adapter) {
    throw new Error(`Proveedor de IA desconocido: ${provider}`);
  }

  const messages: AIMessage[] = [
    {
      role: 'system',
      content: 'Eres un experto en SEO español. Clasifica modificadores de keywords.',
    },
    {
      role: 'user',
      content:
        'Para cada modificador, indica si añadido a una keyword base cambia la intención de ' +
        'búsqueda del usuario.\n' +
        'Responde SOLO con JSON válido:\n' +
        '{ "modificador": "same_intent" | "different_intent" }\n' +
        `Modificadores: ${JSON.stringify(modifiers)}`,
    },
  ];

  const response = await withTimeout(adapter.sendMessage(messages, model, apiKey), CALL_TIMEOUT_MS);
  const data = extractJson(response.content);

  if (typeof data !== 'object' || data === null) {
    throw new Error('La clasificación de modificadores no devolvió un objeto JSON');
  }

  const rows: Array<{ modifier: string; effect: 'same_intent' | 'different_intent' }> = [];
  for (const [modifier, effect] of Object.entries(data as Record<string, unknown>)) {
    if (effect !== 'same_intent' && effect !== 'different_intent') continue;
    result.set(modifier, effect);
    rows.push({ modifier, effect });
  }

  // Los modificadores que la IA no devolvió (respuesta incompleta) se
  // tratan como 'same_intent' — es la opción menos disruptiva: en el peor
  // caso junta dos keywords que deberían ir separadas, en vez de partir un
  // grupo que debería estar junto.
  for (const modifier of modifiers) {
    if (!result.has(modifier)) {
      result.set(modifier, 'same_intent');
      rows.push({ modifier, effect: 'same_intent' });
    }
  }

  for (const row of rows) {
    await db
      .insert(aiIntentModifiers)
      .values({
        modifier: row.modifier,
        effect: row.effect,
        confidence: 70,
        source: 'ai_classified',
        language,
      })
      .onConflictDoUpdate({
        target: [aiIntentModifiers.modifier, aiIntentModifiers.language],
        set: {
          timesSeen: sql`${aiIntentModifiers.timesSeen} + 1`,
          updatedAt: new Date(),
        },
      });
  }

  return result;
}

function trivialDecision(keyword: string): ModifierDecision {
  return { keyword, modifier_found: null, effect: 'same_intent', source: 'table' };
}

// Capa 0 del pipeline de clustering — se ejecuta ANTES de los embeddings.
// Agrupa keywords que son la misma raíz + un modificador que no cambia la
// intención de búsqueda (p.ej. "fontanero" + "barato"), y separa las que sí
// la cambian (p.ej. "fontanero" + "urgente"), usando el catálogo humano/IA
// de lib/db/schema.ts#aiIntentModifiers.
//
// Recibe provider/model/apiKey de CHAT (no de embeddings) porque el único
// uso de IA aquí es una clasificación de texto puntual (Capa 4 usa el mismo
// patrón) — el pedido original no incluía estos parámetros en la firma,
// pero sin ellos esta función no puede hacer la llamada IA que ella misma
// especifica en su paso 4.
export async function normalizeByIntent(
  keywords: KeywordInput[],
  provider: string,
  model: string,
  apiKey: string,
  language: string = 'es'
): Promise<NormalizedGroup[]> {
  const candidates = buildCandidates(keywords);

  // { candidateIndex, variant, modifier } — modifier null = variante trivial
  // (mismo grupo directo, sin necesidad de mirar la tabla).
  const pending: Array<{ candidate: Candidate; variant: KeywordInput; modifier: string }> = [];
  const decisionsByRoot = new Map<string, ModifierDecision[]>();
  const splitOff = new Map<string, NormalizedGroup>();

  for (const candidate of candidates) {
    decisionsByRoot.set(candidate.root.keyword, [trivialDecision(candidate.root.keyword)]);

    for (const variant of candidate.variants) {
      const modifier = extractModifier(candidate.rootWords, variant.keyword);
      if (!modifier) {
        decisionsByRoot.get(candidate.root.keyword)!.push(trivialDecision(variant.keyword));
        continue;
      }
      pending.push({ candidate, variant, modifier });
    }
  }

  // Resuelve contra la tabla primero — solo lo que no está ahí pasa a la IA.
  const unknownModifiers = new Set<string>();
  const tableEffects = new Map<string, 'same_intent' | 'different_intent'>();
  for (const modifier of new Set(pending.map((p) => p.modifier))) {
    const effect = await lookupModifier(modifier, language);
    if (effect) {
      tableEffects.set(modifier, effect);
    } else {
      unknownModifiers.add(modifier);
    }
  }

  const aiEffects = await classifyUnknownModifiers(
    [...unknownModifiers],
    provider,
    model,
    apiKey,
    language
  );

  for (const { candidate, variant, modifier } of pending) {
    const effect = tableEffects.get(modifier) ?? aiEffects.get(modifier) ?? 'same_intent';
    const source: ModifierDecision['source'] = tableEffects.has(modifier) ? 'table' : 'ai_classified';
    const decision: ModifierDecision = { keyword: variant.keyword, modifier_found: modifier, effect, source };

    if (effect === 'same_intent') {
      decisionsByRoot.get(candidate.root.keyword)!.push(decision);
    } else {
      splitOff.set(variant.keyword, {
        root_keyword: variant,
        keywords: [variant],
        modifier_decisions: [decision],
      });
    }
  }

  const groups: NormalizedGroup[] = candidates.map((candidate) => {
    const decisions = decisionsByRoot.get(candidate.root.keyword)!;
    const memberKeywords = new Set(decisions.map((d) => d.keyword));
    return {
      root_keyword: candidate.root,
      keywords: [
        candidate.root,
        ...candidate.variants.filter((v) => memberKeywords.has(v.keyword)),
      ],
      modifier_decisions: decisions,
    };
  });

  return [...groups, ...splitOff.values()];
}
