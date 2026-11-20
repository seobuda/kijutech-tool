import 'server-only';

// Base de conocimiento (NÚCLEO, 20 nov 2026). Diseño: docs/DISENO-JEFE-OPERACIONES.md (fase 1).
//  - Solo Enric publica. El equipo envía solicitudes; la IA las redacta (prompt kb_redactar_entrada) y a Enric le llega
//    la propuesta por Telegram con botones: Publicar · Cambiar (le dice qué y la IA la rehace) · Más tarde · Descartar.
//  - «Más tarde» es la cola de sus horas de conocimiento (pestaña «Para más tarde»); lo importado de ClickUp entra ahí.
//  - Búsqueda híbrida sin IA: embeddings (pgvector) + texto completo en español, unidos con fuseRankings.
//  - Nunca contraseñas. El núcleo no sabe de ClickUp ni de Telegram: usa el registro (lib/core/capabilities.ts).
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { kbArticles, kbCategories, type KbArticle, type KbCategory } from '@/lib/db/schema';
import { callAI, getEmbeddingConfig, getPrompt, resolveActiveProvider } from '@/lib/ai/gateway';
import { embedTexts } from '@/lib/ai/clustering/layers/1-embeddings';
import { extractJsonFromLLMResponse } from '@/lib/ai/parsers/json-extractor';
import { registerModuleButtons, registerScheduled, registerTools, telegramOutbound, type AgentTool, type OutboundButton } from '@/lib/core/capabilities';
import {
  cleanDraft,
  cleanLinks,
  cleanTags,
  embeddingText,
  fuseRankings,
  isKbStatus,
  KB_LIMITS,
  linksInText,
  looksLikeSecret,
  type KbDraft,
  type KbLink,
  type KbSource,
  type KbStatus
} from '@/lib/core/knowledge-rules';

export const KB_PROMPT = 'kb_redactar_entrada';
const KB_MAX_TOKENS = 4000;

export class KnowledgeError extends Error {
  readonly userMessage: string;
  constructor(message: string) {
    super(message);
    this.userMessage = message;
  }
}

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

// --- Categorías --------------------------------------------------------------------------------------------------------

const DEFAULT_CATEGORIES: [string, string][] = [
  ['seo', 'SEO'],
  ['google_ads', 'Google Ads'],
  ['web', 'Webs WordPress'],
  ['contenidos', 'Contenidos'],
  ['operativa', 'Operativa interna'],
  ['herramientas', 'Herramientas']
];

/** Las cuentas nuevas (creadas después de la migración 0056) reciben las categorías por defecto la primera vez. */
export async function listCategories(tenantId: string, includeArchived = false): Promise<KbCategory[]> {
  let rows = await db.select().from(kbCategories).where(eq(kbCategories.tenantId, tenantId)).orderBy(asc(kbCategories.sortOrder), asc(kbCategories.name));
  if (rows.length === 0) {
    await db
      .insert(kbCategories)
      .values(DEFAULT_CATEGORIES.map(([key, name], i) => ({ tenantId, key, name, sortOrder: i + 1 })))
      .onConflictDoNothing();
    rows = await db.select().from(kbCategories).where(eq(kbCategories.tenantId, tenantId)).orderBy(asc(kbCategories.sortOrder), asc(kbCategories.name));
  }
  return includeArchived ? rows : rows.filter((c) => !c.archivedAt);
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

export async function saveCategory(tenantId: string, id: string | null, name: string): Promise<string> {
  const n = name.trim().slice(0, 100);
  if (!n) throw new KnowledgeError('Escribe el nombre de la categoría.');
  if (id) {
    const [row] = await db.update(kbCategories).set({ name: n }).where(and(eq(kbCategories.tenantId, tenantId), eq(kbCategories.id, id))).returning({ id: kbCategories.id });
    if (!row) throw new KnowledgeError('Esa categoría ya no existe.');
    return row.id;
  }
  const all = await listCategories(tenantId, true);
  const key = slug(n) || `cat_${all.length + 1}`;
  if (all.some((c) => c.key === key)) throw new KnowledgeError('Ya hay una categoría con ese nombre.');
  const [row] = await db
    .insert(kbCategories)
    .values({ tenantId, key, name: n, sortOrder: Math.max(0, ...all.map((c) => c.sortOrder)) + 1 })
    .returning({ id: kbCategories.id });
  return row.id;
}

export async function archiveCategory(tenantId: string, id: string, archived: boolean): Promise<void> {
  await db.update(kbCategories).set({ archivedAt: archived ? new Date() : null }).where(and(eq(kbCategories.tenantId, tenantId), eq(kbCategories.id, id)));
}

async function categoryIdByKey(tenantId: string, key: string | null): Promise<string | null> {
  if (!key) return null;
  const cats = await listCategories(tenantId);
  return cats.find((c) => c.key === key)?.id ?? null;
}

// --- Entradas ----------------------------------------------------------------------------------------------------------

export type ArticleInput = { title: string; problem: string; solution: string; categoryId: string | null; tags: string[] | string; links: KbLink[] };

function validate(input: ArticleInput): { title: string; problem: string; solution: string; categoryId: string | null; tags: string[]; links: KbLink[] } {
  const title = String(input.title ?? '').trim().slice(0, KB_LIMITS.title);
  if (!title) throw new KnowledgeError('Falta el título.');
  const problem = String(input.problem ?? '').trim().slice(0, KB_LIMITS.problem);
  const solution = String(input.solution ?? '').trim().slice(0, KB_LIMITS.solution);
  if (looksLikeSecret(`${title}\n${problem}\n${solution}`)) throw new KnowledgeError('En la base no se guardan contraseñas ni claves: escribe solo dónde están los accesos.');
  return { title, problem, solution, categoryId: input.categoryId || null, tags: cleanTags(input.tags), links: cleanLinks(input.links) };
}

export async function getArticle(tenantId: string, id: string): Promise<KbArticle | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [a] = await db.select().from(kbArticles).where(and(eq(kbArticles.tenantId, tenantId), eq(kbArticles.id, id))).limit(1);
  return a ?? null;
}

async function checkCategory(tenantId: string, categoryId: string | null): Promise<string | null> {
  if (!categoryId) return null;
  const cats = await listCategories(tenantId, true);
  if (!cats.some((c) => c.id === categoryId)) throw new KnowledgeError('Esa categoría no existe.');
  return categoryId;
}

/** Crear (id null) o guardar una entrada desde la pantalla. No cambia el estado: eso va aparte (setArticleStatus). */
export async function saveArticle(tenantId: string, id: string | null, input: ArticleInput, userId: number | null, status: KbStatus = 'borrador'): Promise<string> {
  const v = validate(input);
  v.categoryId = await checkCategory(tenantId, v.categoryId);
  const now = new Date();
  let articleId: string;
  if (id) {
    const [row] = await db
      .update(kbArticles)
      .set({ ...v, updatedBy: userId, updatedAt: now, embedding: null, embeddedAt: null, awaitingChatId: null })
      .where(and(eq(kbArticles.tenantId, tenantId), eq(kbArticles.id, id)))
      .returning({ id: kbArticles.id });
    if (!row) throw new KnowledgeError('Esa entrada ya no existe.');
    articleId = row.id;
  } else {
    const [row] = await db
      .insert(kbArticles)
      .values({ tenantId, ...v, status, sourceType: 'manual', createdBy: userId, updatedBy: userId, ...(status === 'publicada' ? { publishedAt: now, reviewedAt: now, reviewedBy: userId } : {}) })
      .returning({ id: kbArticles.id });
    articleId = row.id;
  }
  void embedArticle(tenantId, articleId).catch((e) => console.error('[conocimiento] embedding:', e instanceof Error ? e.message : e));
  return articleId;
}

export async function setArticleStatus(tenantId: string, id: string, status: KbStatus, userId: number | null): Promise<KbArticle> {
  if (!isKbStatus(status)) throw new KnowledgeError('Estado no válido.');
  const a = await getArticle(tenantId, id);
  if (!a) throw new KnowledgeError('Esa entrada ya no existe.');
  if (status === 'publicada' && (!a.title.trim() || !a.solution.trim())) throw new KnowledgeError('Para publicarla necesita título y solución.');
  const now = new Date();
  const [row] = await db
    .update(kbArticles)
    .set({
      status,
      updatedAt: now,
      updatedBy: userId,
      awaitingChatId: null,
      ...(status === 'publicada' ? { publishedAt: a.publishedAt ?? now, reviewedAt: now, reviewedBy: userId } : {})
    })
    .where(and(eq(kbArticles.tenantId, tenantId), eq(kbArticles.id, id)))
    .returning();
  return row;
}

/** Marcar como revisada (sigue vigente) sin tocar el texto: reinicia el aviso de revisión anual. */
export async function markReviewed(tenantId: string, id: string, userId: number | null): Promise<void> {
  await db.update(kbArticles).set({ reviewedAt: new Date(), reviewedBy: userId }).where(and(eq(kbArticles.tenantId, tenantId), eq(kbArticles.id, id)));
}

export async function deleteArticle(tenantId: string, id: string): Promise<void> {
  await db.delete(kbArticles).where(and(eq(kbArticles.tenantId, tenantId), eq(kbArticles.id, id)));
}

export type ArticleListItem = Pick<KbArticle, 'id' | 'title' | 'problem' | 'status' | 'sourceType' | 'categoryId' | 'tags' | 'requestedByName' | 'timesUsed' | 'helpfulCount' | 'notHelpfulCount' | 'updatedAt' | 'reviewedAt' | 'publishedAt'> & {
  linkCount: number;
};

const LIST_COLUMNS = {
  id: kbArticles.id,
  title: kbArticles.title,
  problem: kbArticles.problem,
  status: kbArticles.status,
  sourceType: kbArticles.sourceType,
  categoryId: kbArticles.categoryId,
  tags: kbArticles.tags,
  requestedByName: kbArticles.requestedByName,
  timesUsed: kbArticles.timesUsed,
  helpfulCount: kbArticles.helpfulCount,
  notHelpfulCount: kbArticles.notHelpfulCount,
  updatedAt: kbArticles.updatedAt,
  reviewedAt: kbArticles.reviewedAt,
  publishedAt: kbArticles.publishedAt,
  linkCount: sql<number>`jsonb_array_length(${kbArticles.links})`
};

/** Lista de la pantalla. Con texto, usa la búsqueda híbrida (dentro de los estados pedidos). */
export async function listArticles(tenantId: string, opts: { statuses: KbStatus[]; q?: string; categoryId?: string | null; limit?: number }): Promise<ArticleListItem[]> {
  const limit = Math.min(opts.limit ?? 300, 500);
  const q = (opts.q ?? '').trim();
  if (q) {
    const ids = await searchIds(tenantId, q, { statuses: opts.statuses, categoryId: opts.categoryId ?? null, limit: 50 });
    if (ids.length === 0) return [];
    const rows = await db.select(LIST_COLUMNS).from(kbArticles).where(and(eq(kbArticles.tenantId, tenantId), inArray(kbArticles.id, ids)));
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter((r): r is ArticleListItem => Boolean(r)).map((r) => ({ ...r, linkCount: Number(r.linkCount) }));
  }
  const conds = [eq(kbArticles.tenantId, tenantId), inArray(kbArticles.status, opts.statuses)];
  if (opts.categoryId) conds.push(eq(kbArticles.categoryId, opts.categoryId));
  const rows = await db.select(LIST_COLUMNS).from(kbArticles).where(and(...conds)).orderBy(desc(kbArticles.updatedAt)).limit(limit);
  return rows.map((r) => ({ ...r, linkCount: Number(r.linkCount) }));
}

export async function countByStatus(tenantId: string): Promise<Record<KbStatus, number>> {
  const rows = await db.select({ status: kbArticles.status, n: sql<number>`count(*)` }).from(kbArticles).where(eq(kbArticles.tenantId, tenantId)).groupBy(kbArticles.status);
  const out: Record<KbStatus, number> = { borrador: 0, propuesta: 0, mas_tarde: 0, publicada: 0, archivada: 0 };
  for (const r of rows) if (isKbStatus(r.status)) out[r.status] = Number(r.n);
  return out;
}

export type ImportItem = { sourceId: string; sourceUrl: string; title: string; solution: string; categoryKey: string | null; tags: string[]; links: KbLink[] };

/**
 * Entradas importadas de otra herramienta (ClickUp). Entran en «Para más tarde» para que Enric las revise por tandas;
 * lo ya importado (mismo origen e id) se salta, y lo que parece llevar una contraseña no entra.
 */
export async function insertImportedArticles(tenantId: string, source: Extract<KbSource, 'clickup'>, items: ImportItem[], userId: number | null): Promise<{ imported: number; existing: number; withSecrets: number }> {
  const existingRows = items.length
    ? await db
        .select({ sourceId: kbArticles.sourceId })
        .from(kbArticles)
        .where(and(eq(kbArticles.tenantId, tenantId), eq(kbArticles.sourceType, source), inArray(kbArticles.sourceId, items.map((i) => i.sourceId))))
    : [];
  const existing = new Set(existingRows.map((r) => r.sourceId));
  const cats = await listCategories(tenantId);
  let imported = 0;
  let withSecrets = 0;
  for (const it of items) {
    if (existing.has(it.sourceId)) continue;
    if (looksLikeSecret(`${it.title}\n${it.solution}`)) {
      withSecrets++;
      continue;
    }
    await db
      .insert(kbArticles)
      .values({
        tenantId,
        title: it.title.trim().slice(0, KB_LIMITS.title) || '(sin título)',
        solution: it.solution.slice(0, KB_LIMITS.solution),
        categoryId: cats.find((c) => c.key === it.categoryKey)?.id ?? null,
        tags: cleanTags(it.tags),
        links: cleanLinks(it.links),
        status: 'mas_tarde',
        sourceType: source,
        sourceId: it.sourceId.slice(0, 100),
        sourceUrl: it.sourceUrl.slice(0, 500),
        createdBy: userId,
        updatedBy: userId
      })
      .onConflictDoNothing();
    imported++;
  }
  return { imported, existing: existing.size, withSecrets };
}

// --- Embeddings y búsqueda ---------------------------------------------------------------------------------------------

type EmbedCfg = { provider: string; model: string; apiKey: string };

// Caché de 5 minutos por cuenta (cada búsqueda no vuelve a leer y descifrar la clave). El aviso de «sin embeddings» se
// escribe una vez por proceso: va al registro de errores y no debe repetirse en cada pasada del planificador.
const cfgCache = new Map<string, { at: number; cfg: EmbedCfg | null }>();
const warned = new Set<string>();
async function embeddingConfig(tenantId: string): Promise<EmbedCfg | null> {
  const hit = cfgCache.get(tenantId);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.cfg;
  let cfg: EmbedCfg | null = null;
  try {
    const { keyMode } = await resolveActiveProvider(tenantId);
    cfg = await getEmbeddingConfig(tenantId, keyMode === 'byok' ? 'byok' : 'platform');
  } catch (e) {
    if (!warned.has(tenantId)) {
      warned.add(tenantId);
      console.warn('[conocimiento] sin embeddings (la búsqueda usa solo palabras):', e instanceof Error ? e.message : e);
    }
  }
  cfgCache.set(tenantId, { at: Date.now(), cfg });
  return cfg;
}

const modelTag = (c: EmbedCfg) => `${c.provider}/${c.model}`.slice(0, 80);

// Si el proveedor de embeddings falla (sin saldo, clave caducada…), se deja de usar 5 minutos (la búsqueda sigue por
// palabras) y se avisa como mucho una vez por hora: cada búsqueda no debe escribir un error en el registro.
const lastEmbedError = new Map<string, number>();
function embeddingFailed(tenantId: string, e: unknown): void {
  cfgCache.set(tenantId, { at: Date.now(), cfg: null });
  const last = lastEmbedError.get(tenantId) ?? 0;
  if (Date.now() - last > 3_600_000) {
    lastEmbedError.set(tenantId, Date.now());
    console.error('[conocimiento] embeddings no disponibles (la búsqueda sigue por palabras):', e instanceof Error ? e.message.slice(0, 300) : e);
  }
}

async function safeEmbed(tenantId: string, c: EmbedCfg, texts: string[]): Promise<number[][] | null> {
  try {
    return await embedTexts(texts, c.provider, c.apiKey, c.model);
  } catch (e) {
    embeddingFailed(tenantId, e);
    return null;
  }
}

export async function embedArticle(tenantId: string, id: string, cfg?: EmbedCfg | null): Promise<boolean> {
  const a = await getArticle(tenantId, id);
  if (!a) return false;
  const c = cfg === undefined ? await embeddingConfig(tenantId) : cfg;
  if (!c) return false;
  const vec = (await safeEmbed(tenantId, c, [embeddingText(a)]))?.[0];
  if (!vec) return false;
  await db.update(kbArticles).set({ embedding: vec, embeddingModel: modelTag(c), embeddedAt: new Date() }).where(eq(kbArticles.id, id));
  return true;
}

/** Calcula los embeddings que faltan (o de otro modelo) en tandas. Lo llama el planificador y la importación. */
export async function refreshEmbeddings(tenantId: string, max = 40): Promise<number> {
  // Sin entradas, ni se mira la configuración de IA (el planificador pasa cada minuto).
  const [any] = await db.select({ id: kbArticles.id }).from(kbArticles).where(eq(kbArticles.tenantId, tenantId)).limit(1);
  if (!any) return 0;
  const c = await embeddingConfig(tenantId);
  if (!c) return 0;
  const tag = modelTag(c);
  const rows = await db
    .select()
    .from(kbArticles)
    .where(and(eq(kbArticles.tenantId, tenantId), ne(kbArticles.status, 'archivada'), or(isNull(kbArticles.embedding), isNull(kbArticles.embeddingModel), ne(kbArticles.embeddingModel, tag))))
    .limit(max);
  if (rows.length === 0) return 0;
  const vecs = await safeEmbed(tenantId, c, rows.map(embeddingText));
  if (!vecs) return 0;
  const now = new Date();
  for (let i = 0; i < rows.length; i++) {
    if (vecs[i]) await db.update(kbArticles).set({ embedding: vecs[i], embeddingModel: tag, embeddedAt: now }).where(eq(kbArticles.id, rows[i].id));
  }
  return rows.length;
}

/** Ids ordenados por relevancia: embeddings + palabras (RRF). Sin embeddings configurados, solo palabras. */
async function searchIds(tenantId: string, query: string, opts: { statuses: KbStatus[]; categoryId: string | null; limit: number }): Promise<string[]> {
  const q = query.trim().slice(0, 500);
  if (!q) return [];
  const conds = [eq(kbArticles.tenantId, tenantId), inArray(kbArticles.status, opts.statuses)];
  if (opts.categoryId) conds.push(eq(kbArticles.categoryId, opts.categoryId));
  const doc = sql`to_tsvector('spanish', coalesce(${kbArticles.title}, '') || ' ' || coalesce(${kbArticles.problem}, '') || ' ' || coalesce(${kbArticles.solution}, ''))`;
  const tsq = sql`websearch_to_tsquery('spanish', ${q})`;
  const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const lexical = await db
    .select({ id: kbArticles.id })
    .from(kbArticles)
    .where(and(...conds, sql`(${doc} @@ ${tsq} OR ${kbArticles.title} ILIKE ${like} OR array_to_string(${kbArticles.tags}, ' ') ILIKE ${like})`))
    .orderBy(sql`ts_rank(${doc}, ${tsq}) DESC`)
    .limit(opts.limit);

  let semantic: { id: string }[] = [];
  const c = await embeddingConfig(tenantId);
  if (c) {
    try {
      const vec = (await safeEmbed(tenantId, c, [q]))?.[0];
      if (vec) {
        const v = `[${vec.join(',')}]`;
        semantic = await db
          .select({ id: kbArticles.id })
          .from(kbArticles)
          .where(and(...conds, eq(kbArticles.embeddingModel, modelTag(c)), sql`${kbArticles.embedding} IS NOT NULL`, sql`(${kbArticles.embedding} <=> ${v}::vector) < 0.6`))
          .orderBy(sql`${kbArticles.embedding} <=> ${v}::vector`)
          .limit(opts.limit);
      }
    } catch (e) {
      console.warn('[conocimiento] búsqueda por significado no disponible:', e instanceof Error ? e.message : e);
    }
  }
  const ids = [...new Set([...semantic, ...lexical].map((r) => r.id))];
  if (ids.length === 0) return [];
  const votes = await db.select({ id: kbArticles.id, h: kbArticles.helpfulCount, n: kbArticles.notHelpfulCount }).from(kbArticles).where(inArray(kbArticles.id, ids));
  const usefulness = new Map(votes.map((r) => [r.id, { helpful: r.h, notHelpful: r.n }]));
  return fuseRankings(semantic.map((r) => r.id), lexical.map((r) => r.id), usefulness).slice(0, opts.limit);
}

export type KnowledgeHit = { id: string; title: string; problem: string; solution: string; links: KbLink[]; category: string | null; reviewedAt: Date | null };

/** Lo que usan los agentes: solo entradas publicadas, las más parecidas a la pregunta. */
export async function searchKnowledge(tenantId: string, query: string, limit = 5): Promise<KnowledgeHit[]> {
  const ids = await searchIds(tenantId, query, { statuses: ['publicada'], categoryId: null, limit });
  if (ids.length === 0) return [];
  const [rows, cats] = await Promise.all([db.select().from(kbArticles).where(and(eq(kbArticles.tenantId, tenantId), inArray(kbArticles.id, ids))), listCategories(tenantId, true)]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is KbArticle => Boolean(r))
    .map((r) => ({ id: r.id, title: r.title, problem: r.problem, solution: r.solution, links: (r.links as KbLink[]) ?? [], category: cats.find((c) => c.id === r.categoryId)?.name ?? null, reviewedAt: r.reviewedAt }));
}

/** Contar un uso de una entrada (lo llaman los agentes al apoyarse en ella). */
export async function recordUse(tenantId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(kbArticles)
    .set({ timesUsed: sql`${kbArticles.timesUsed} + 1`, lastUsedAt: new Date() })
    .where(and(eq(kbArticles.tenantId, tenantId), inArray(kbArticles.id, ids)));
}

// --- Redacción con IA y propuestas a Enric -----------------------------------------------------------------------------

type EditNote = { at: string; by: string; instruction: string; before: { title: string; problem: string; solution: string } };

/**
 * La IA convierte un texto libre en una entrada (o rehace la propuesta con la indicación de Enric). Devuelve el borrador
 * validado o null si la IA no está disponible o no devolvió algo útil (la entrada queda con el texto original).
 */
async function draftWithAI(tenantId: string, text: string, origin: string, previous: KbArticle | null, instruction: string | null): Promise<KbDraft | null> {
  const prompt = await getPrompt(KB_PROMPT);
  if (!prompt) return null;
  const cats = await listCategories(tenantId);
  const vals: Record<string, string> = {
    categorias: cats.map((c) => `${c.key} (${c.name})`).join(', '),
    origen: origin,
    texto: `<<<DATO NO FIABLE\n${text.slice(0, KB_LIMITS.request)}\nFIN>>>`,
    version_anterior:
      previous && instruction
        ? `Versión anterior:\n<<<DATO NO FIABLE\nTítulo: ${previous.title}\nProblema: ${previous.problem}\nSolución:\n${previous.solution.slice(0, 8000)}\nFIN>>>\n\nIndicación de Enric (aplícala): ${instruction.slice(0, 2000)}`
        : ''
  };
  // Una sola pasada: un texto del usuario no puede colarse en otro hueco de la plantilla.
  const fill = (t: string) => t.replace(/\{(categorias|origen|texto|version_anterior)\}/g, (_m, k: string) => vals[k] ?? '');
  try {
    const res = await callAI({
      tenantId,
      function: KB_PROMPT,
      promptKey: KB_PROMPT,
      maxTokens: KB_MAX_TOKENS,
      messages: [
        { role: 'system', content: prompt.system_prompt },
        { role: 'user', content: fill(prompt.user_prompt_template) }
      ]
    });
    return cleanDraft(extractJsonFromLLMResponse(res.content), cats.map((c) => c.key));
  } catch (e) {
    console.error('[conocimiento] redacción con IA:', e instanceof Error ? e.message : e);
    return null;
  }
}

async function applyDraft(tenantId: string, a: KbArticle, d: KbDraft, extra: Partial<typeof kbArticles.$inferInsert> = {}): Promise<KbArticle> {
  const links = cleanLinks([...d.links, ...((a.links as KbLink[]) ?? []), ...linksInText(a.requestText ?? '')]);
  const [row] = await db
    .update(kbArticles)
    .set({
      title: d.title,
      problem: d.problem,
      solution: d.solution,
      categoryId: (await categoryIdByKey(tenantId, d.category)) ?? a.categoryId,
      tags: d.tags,
      links,
      embedding: null,
      embeddedAt: null,
      updatedAt: new Date(),
      ...extra
    })
    .where(eq(kbArticles.id, a.id))
    .returning();
  void embedArticle(tenantId, a.id).catch((e) => console.error('[conocimiento] embedding:', e instanceof Error ? e.message : e));
  return row;
}

/** Solicitud de entrada: del equipo (pantalla) o dictada por Enric (agente). La IA la redacta y se le propone a Enric. */
export async function submitRequest(
  tenantId: string,
  input: { text: string; source: Extract<KbSource, 'equipo' | 'dictado' | 'agente' | 'respuesta'>; byName: string; byUserId: number | null; links?: KbLink[] }
): Promise<{ id: string; drafted: boolean }> {
  const text = String(input.text ?? '').trim().slice(0, KB_LIMITS.request);
  if (text.length < 10) throw new KnowledgeError('Cuéntalo con un poco más de detalle (qué problema es y cómo se resuelve).');
  if (looksLikeSecret(text)) throw new KnowledgeError('En la base no se guardan contraseñas ni claves: escribe solo dónde están los accesos.');
  const firstLine = text.split('\n')[0].slice(0, 120);
  const [row] = await db
    .insert(kbArticles)
    .values({
      tenantId,
      title: firstLine,
      solution: '',
      requestText: text,
      links: cleanLinks([...(input.links ?? []), ...linksInText(text)]),
      status: 'propuesta',
      sourceType: input.source,
      requestedByName: input.byName.slice(0, 255),
      requestedByUserId: input.byUserId,
      createdBy: input.byUserId
    })
    .returning();
  const origin = { equipo: `solicitud de ${input.byName}`, dictado: 'dictado de Enric', agente: 'propuesta de un agente', respuesta: 'respuesta de Enric a una duda del equipo' }[input.source];
  const d = await draftWithAI(tenantId, text, origin, null, null);
  const final = d ? await applyDraft(tenantId, row, d, { aiDraft: d }) : row;
  await proposeToOwner(tenantId, final, d?.note ?? (d ? '' : 'La IA no ha podido redactarla: revisa el texto original.'));
  return { id: row.id, drafted: Boolean(d) };
}

/** Enric pide cambios: la IA rehace la propuesta con su indicación y se la vuelve a pasar. Queda anotado para aprender. */
export async function reviseWithInstruction(tenantId: string, id: string, instruction: string, by: string): Promise<{ ok: boolean; message: string }> {
  const a = await getArticle(tenantId, id);
  if (!a) return { ok: false, message: 'Esa entrada ya no existe.' };
  const ins = instruction.trim().slice(0, 2000);
  if (!ins) return { ok: false, message: 'No he recibido ninguna indicación.' };
  const d = await draftWithAI(tenantId, a.requestText || `${a.title}\n${a.problem}\n${a.solution}`, 'cambios pedidos por Enric', a, ins);
  if (!d) return { ok: false, message: 'La IA no ha podido rehacerla ahora. Puedes editarla en la herramienta.' };
  const note: EditNote = { at: new Date().toISOString(), by, instruction: ins, before: { title: a.title, problem: a.problem, solution: a.solution } };
  const row = await applyDraft(tenantId, a, d, { editNotes: [...((a.editNotes as EditNote[]) ?? []), note], status: 'propuesta', awaitingChatId: null, ...(a.aiDraft ? {} : { aiDraft: d }) });
  await proposeToOwner(tenantId, row, d.note);
  return { ok: true, message: 'Hecho: te paso la nueva versión.' };
}

/** Con el texto de la pantalla (sin IA): la IA redacta la solicitud original otra vez. */
export async function redraftArticle(tenantId: string, id: string): Promise<boolean> {
  const a = await getArticle(tenantId, id);
  if (!a?.requestText) return false;
  const d = await draftWithAI(tenantId, a.requestText, 'nueva redacción pedida por Enric', null, null);
  if (!d) return false;
  await applyDraft(tenantId, a, d, a.aiDraft ? {} : { aiDraft: d });
  return true;
}

function reviewButtons(id: string): OutboundButton[][] {
  return [
    [
      { text: '✅ Publicar', data: `x:kb:ok:${id}` },
      { text: '✏️ Cambiar', data: `x:kb:ch:${id}` }
    ],
    [
      { text: '🕓 Más tarde', data: `x:kb:lt:${id}` },
      { text: '🗑 Descartar', data: `x:kb:no:${id}` }
    ]
  ];
}

const BASE_URL = () => (process.env.BASE_URL || '').replace(/\/+$/, '');

async function proposeToOwner(tenantId: string, a: KbArticle, note: string): Promise<void> {
  const out = telegramOutbound();
  if (!out) return;
  const who = a.sourceType === 'equipo' && a.requestedByName ? `💡 <b>${esc(a.requestedByName)}</b> propone una entrada para la base de conocimiento` : '📚 Nueva entrada para la base de conocimiento';
  const url = BASE_URL() ? `${BASE_URL()}/dashboard/conocimiento/${a.id}` : '';
  const html = [
    who,
    '',
    `<b>${esc(a.title)}</b>`,
    a.problem ? `<i>${esc(clip(a.problem, 400))}</i>` : '',
    '',
    esc(clip(a.solution || a.requestText || '', 1800)),
    note ? `\n⚠️ ${esc(clip(note, 400))}` : '',
    url ? `\n<a href="${esc(url)}">Abrir en la herramienta</a>` : ''
  ]
    .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
    .join('\n');
  // Clave por versión: cada versión nueva es un aviso nuevo (no se pierde si llega otra antes).
  await out.notifyOwner(tenantId, `kb:${a.id}:${a.updatedAt.getTime()}`, html, reviewButtons(a.id));
}

/** Botones «x:kb:…» de una propuesta. Solo quien lleva las operaciones decide. */
export async function handleKnowledgeButton(i: { tenantId: string; data: string; chatId: string; by: string; isOwner: boolean }) {
  if (!i.isOwner) return { answer: 'Solo Enric decide qué entra en la base.', alert: true };
  const m = i.data.match(/^(ok|ch|lt|no):([0-9a-f-]{36})$/);
  if (!m) return { answer: 'Botón no válido.', alert: true };
  const a = await getArticle(i.tenantId, m[2]);
  if (!a) return { answer: 'Esa entrada ya no existe.', alert: true, keyboard: null };
  if (a.status === 'publicada' || a.status === 'archivada') return { answer: `Ya está ${a.status}.`, keyboard: null };
  if (m[1] === 'ch') {
    await db.update(kbArticles).set({ awaitingChatId: i.chatId }).where(eq(kbArticles.id, a.id));
    return { awaitText: `✏️ <b>${esc(a.title)}</b>\n¿Qué cambio? Escríbelo y te paso la nueva versión.` };
  }
  try {
    const status: KbStatus = m[1] === 'ok' ? 'publicada' : m[1] === 'lt' ? 'mas_tarde' : 'archivada';
    await setArticleStatus(i.tenantId, a.id, status, null);
    const msg = status === 'publicada' ? 'Publicada en la base de conocimiento.' : status === 'mas_tarde' ? 'Guardada en «Para más tarde».' : 'Descartada (queda en Archivadas).';
    return { answer: msg, keyboard: null, reply: `${status === 'publicada' ? '✅' : status === 'mas_tarde' ? '🕓' : '🗑'} ${esc(msg)}\n<i>${esc(a.title)}</i>` };
  } catch (e) {
    return { answer: e instanceof KnowledgeError ? e.userMessage : 'No se pudo guardar.', alert: true };
  }
}

/** Texto que Enric escribe tras «Cambiar»: la indicación para la IA. */
export async function handleKnowledgeText(i: { tenantId: string; chatId: string; text: string; by: string; isOwner: boolean }): Promise<string> {
  if (!i.isOwner) return 'Solo Enric decide qué entra en la base.';
  const [a] = await db
    .select({ id: kbArticles.id })
    .from(kbArticles)
    .where(and(eq(kbArticles.tenantId, i.tenantId), eq(kbArticles.awaitingChatId, i.chatId)))
    .orderBy(desc(kbArticles.updatedAt))
    .limit(1);
  if (!a) return 'Eso ya no está activo.';
  const r = await reviseWithInstruction(i.tenantId, a.id, i.text, i.by);
  return esc(r.message);
}

// --- Herramientas de los agentes ---------------------------------------------------------------------------------------

const s = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);

const buscarConocimiento: AgentTool = {
  name: 'buscar_conocimiento',
  module: 'nucleo',
  title: 'Buscar en la base de conocimiento',
  description:
    'Busca en la base de conocimiento de la agencia (lo que sabemos hacer y resolver: procedimientos, soluciones, tutoriales con vídeo). Úsala antes de responder una duda de cómo se hace algo. Devuelve las entradas publicadas más parecidas con su solución y enlaces. Cita la entrada en la que te apoyes.',
  risk: 'lectura',
  inputSchema: { type: 'object', properties: { pregunta: { type: 'string' } }, required: ['pregunta'], additionalProperties: false },
  async run(ctx, input) {
    const q = s(input.pregunta, 500);
    if (!q) return { ok: false, content: 'Falta la pregunta.' };
    const hits = await searchKnowledge(ctx.tenantId, q, 5);
    if (hits.length === 0) return { ok: true, content: 'No hay nada en la base de conocimiento sobre esto.' };
    await recordUse(ctx.tenantId, hits.slice(0, 1).map((h) => h.id));
    return {
      ok: true,
      content: hits
        .map(
          (h, n) =>
            `${n + 1}. ${h.title}${h.category ? ` [${h.category}]` : ''}${h.reviewedAt ? ` (revisada ${h.reviewedAt.toISOString().slice(0, 10)})` : ''}\nProblema: ${clip(h.problem, 400)}\nSolución:\n${clip(h.solution, 2500)}${h.links.length ? `\nEnlaces: ${h.links.map((l) => `${l.title} ${l.url}`).join(' | ')}` : ''}`
        )
        .join('\n\n')
    };
  }
};

const guardarConocimiento: AgentTool = {
  name: 'guardar_conocimiento',
  module: 'nucleo',
  title: 'Proponer una entrada para la base de conocimiento',
  description:
    'Cuando Enric te dicte o te pida apuntar algo en la base de conocimiento («apunta en la base: …»), pásale el texto completo tal cual lo dijo. Se redacta como entrada y se le propone a Enric con botones para publicarla, cambiarla o dejarla para más tarde. Nunca contraseñas.',
  risk: 'lectura',
  inputSchema: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'], additionalProperties: false },
  async run(ctx, input) {
    try {
      const r = await submitRequest(ctx.tenantId, { text: s(input.texto, KB_LIMITS.request), source: 'dictado', byName: 'Enric', byUserId: null });
      return { ok: true, content: r.drafted ? 'Redactada: te llega ahora la propuesta con botones para publicarla, cambiarla o dejarla para más tarde.' : 'Guardada como propuesta, pero la IA no ha podido redactarla: revísala en Conocimiento.' };
    } catch (e) {
      return { ok: false, content: e instanceof KnowledgeError ? e.userMessage : 'No se pudo guardar.' };
    }
  }
};

export const KNOWLEDGE_TOOLS: AgentTool[] = [buscarConocimiento, guardarConocimiento];

let registered = false;
/** Lo llama lib/app-wiring.ts: herramientas de los agentes, botones de Telegram y embeddings pendientes. */
export function registerKnowledgeCapabilities(): void {
  if (registered) return;
  registered = true;
  registerTools(KNOWLEDGE_TOOLS);
  registerModuleButtons('kb', { callback: handleKnowledgeButton, text: handleKnowledgeText });
  registerScheduled('base de conocimiento', async (tenantId) => {
    try {
      await refreshEmbeddings(tenantId, 40);
    } catch (e) {
      embeddingFailed(tenantId, e); // pasa cada minuto: el aviso, como mucho una vez por hora
    }
  });
}
