// Base de conocimiento (núcleo, 20 nov 2026). La IA y los embeddings se simulan (sin llamadas reales); la base de datos
// es real (una cuenta de prueba propia que se borra al terminar).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

const h = vi.hoisted(() => ({ aiReplies: [] as string[], aiCalls: [] as string[], embedCalls: 0 }));

vi.mock('@/lib/ai/gateway', async (orig) => {
  const m = await orig<typeof import('@/lib/ai/gateway')>();
  return {
    ...m,
    resolveActiveProvider: async () => ({ provider: 'gemini', model: 'x', apiKey: 'test', keyMode: 'platform' }),
    getEmbeddingConfig: async () => ({ provider: 'gemini', model: 'emb-test', apiKey: 'test' }),
    callAI: async (p: { messages: { content: string }[] }) => {
      h.aiCalls.push(p.messages.map((x) => x.content).join('\n'));
      return { content: h.aiReplies.shift() ?? '{}', jobId: 'job', provider: 'anthropic', model: 'x', input_tokens: 1, output_tokens: 1 };
    }
  };
});
// Embedding de juguete: bolsa de palabras en 1536 posiciones (frases con palabras comunes quedan cerca).
vi.mock('@/lib/ai/clustering/layers/1-embeddings', () => ({
  embedTexts: async (texts: string[]) => {
    h.embedCalls++;
    return texts.map((t) => {
      const v = new Array(1536).fill(0);
      for (const w of t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((x) => x.length > 3)) {
        let n = 0;
        for (const ch of w) n = (n * 31 + ch.charCodeAt(0)) % 1536;
        v[n] += 1;
      }
      if (v.every((x) => x === 0)) v[0] = 1;
      return v;
    });
  }
}));

import { db } from '@/lib/db/drizzle';
import { kbArticles, tenants } from '@/lib/db/schema';
import { setTelegramOutbound } from '@/lib/core/capabilities';
import {
  countByStatus,
  getArticle,
  handleKnowledgeButton,
  handleKnowledgeText,
  insertImportedArticles,
  listArticles,
  listCategories,
  refreshEmbeddings,
  saveArticle,
  searchKnowledge,
  setArticleStatus,
  submitRequest,
  KNOWLEDGE_TOOLS
} from '@/lib/core/knowledge';
import { stripClickUpToken } from '@/lib/operaciones/kb-import';
import { categoryFromClickUpName, cleanDraft, cleanLinks, cleanTags, fuseRankings, linksInText, looksLikeSecret, needsReview } from '@/lib/core/knowledge-rules';

const SLUG = 'test-conocimiento';
let tenant = '';
const sent: { key: string; html: string; buttons: unknown }[] = [];

const draft = (o: Record<string, unknown>) => JSON.stringify({ titulo: 'Redirigir una URL en WordPress', problema: 'Una página cambió de dirección.', solucion: '1. Abre Rank Math.\n2. Crea la redirección 301.', categoria: 'web', etiquetas: ['WordPress', 'rank math'], enlaces: [], nota_para_enric: '', ...o });

describe('reglas puras', () => {
  it('fusiona las dos búsquedas: lo que sale en las dos sube; lo útil sube un poco', () => {
    expect(fuseRankings(['a', 'b', 'c'], ['c', 'd'])[0]).toBe('c');
    const u = new Map([['b', { helpful: 10, notHelpful: 0 }]]);
    expect(fuseRankings(['a', 'b'], [], u)[0]).toBe('b');
    expect(fuseRankings([], [])).toEqual([]);
  });
  it('limpia etiquetas y enlaces', () => {
    expect(cleanTags(['WordPress', 'wordpress', ' #SEO ', ''])).toEqual(['wordpress', 'seo']);
    expect(cleanTags('a, b ,a')).toEqual(['a', 'b']);
    expect(cleanLinks([{ url: 'https://www.loom.com/share/x' }, { url: 'javascript:alert(1)' }, { url: 'https://www.loom.com/share/x' }])).toEqual([{ title: 'loom.com', url: 'https://www.loom.com/share/x' }]);
    expect(linksInText('Mira https://drive.google.com/file/d/1/view. Y ya.')).toEqual([{ title: 'drive.google.com', url: 'https://drive.google.com/file/d/1/view' }]);
  });
  it('detecta contraseñas y claves', () => {
    expect(looksLikeSecret('contraseña: Hola1234')).toBe(true);
    expect(looksLikeSecret('API key = sk-abcdef')).toBe(true);
    expect(looksLikeSecret('Los accesos están en el gestor de contraseñas')).toBe(false);
    // Un enlace con «?token=» (adjuntos de ClickUp) no es una contraseña.
    expect(looksLikeSecret('Vídeo: https://t901.p.clickup-attachments.com/a/b.mp4?token=abcdef123')).toBe(false);
  });
  it('categoría por el nombre de la carpeta o lista de ClickUp', () => {
    expect(categoryFromClickUpName('Tutoriales - SEO Local', 'List')).toBe('seo');
    expect(categoryFromClickUpName('Tutoriales - PPC Ads')).toBe('google_ads');
    expect(categoryFromClickUpName('Tutoriales - Herramientas', 'Elementor PRO')).toBe('web');
    expect(categoryFromClickUpName('Tutoriales - Herramientas', 'Microsoft Clarity')).toBe('herramientas');
    expect(categoryFromClickUpName('Tutoriales - Operation Manager')).toBe('operativa');
    expect(categoryFromClickUpName('')).toBeNull();
  });
  it('quita el token firmado de los enlaces de ClickUp (y no toca los demás)', () => {
    expect(stripClickUpToken('https://t9.p.clickup-attachments.com/t9/a/v%C3%ADdeo.mp4?authz_token=eyJabc.def&view=1')).toBe('https://t9.p.clickup-attachments.com/t9/a/v%C3%ADdeo.mp4?view=1');
    expect(stripClickUpToken('https://www.loom.com/share/x?token=1')).toBe('https://www.loom.com/share/x?token=1');
  });
  it('valida lo que devuelve la IA', () => {
    expect(cleanDraft({ titulo: '', solucion: 'x' }, ['web'])).toBeNull();
    expect(cleanDraft({ titulo: 'T', solucion: 'S', categoria: 'inventada' }, ['web'])?.category).toBeNull();
    expect(cleanDraft({ titulo: 'T', solucion: 'S', categoria: 'web', etiquetas: ['A'] }, ['web'])).toMatchObject({ category: 'web', tags: ['a'] });
  });
  it('marca para revisar lo publicado hace más de un año', () => {
    const old = new Date(Date.now() - 400 * 86_400_000);
    expect(needsReview({ status: 'publicada', reviewedAt: null, publishedAt: old })).toBe(true);
    expect(needsReview({ status: 'publicada', reviewedAt: new Date(), publishedAt: old })).toBe(false);
    expect(needsReview({ status: 'borrador', reviewedAt: null, publishedAt: old })).toBe(false);
  });
});

describe('base de conocimiento', () => {
  beforeAll(async () => {
    await db.delete(tenants).where(eq(tenants.slug, SLUG));
    const [t] = await db.insert(tenants).values({ name: 'Prueba conocimiento', slug: SLUG }).returning();
    tenant = t.id;
    setTelegramOutbound({
      sendText: async () => {},
      sendVoice: async () => false,
      sendTyping: async () => {},
      notifyOwner: async (_t, key, html, buttons) => {
        sent.push({ key, html, buttons });
      }
    });
  });
  afterAll(async () => {
    await db.delete(tenants).where(eq(tenants.slug, SLUG));
  });
  beforeEach(() => {
    sent.length = 0;
    h.aiReplies.length = 0;
    h.aiCalls.length = 0;
  });

  it('una cuenta nueva recibe las 6 categorías por defecto', async () => {
    const cats = await listCategories(tenant);
    expect(cats.map((c) => c.key)).toEqual(['seo', 'google_ads', 'web', 'contenidos', 'operativa', 'herramientas']);
  });

  it('no guarda contraseñas y exige título', async () => {
    await expect(saveArticle(tenant, null, { title: '', problem: '', solution: 'x', categoryId: null, tags: [], links: [] }, null)).rejects.toThrow('Falta el título');
    await expect(saveArticle(tenant, null, { title: 'Acceso', problem: '', solution: 'password: secreto123', categoryId: null, tags: [], links: [] }, null)).rejects.toThrow(/contraseñas/);
  });

  it('solicitud del equipo: la IA la redacta, se guarda el original y a Enric le llega con botones', async () => {
    h.aiReplies.push(draft({ nota_para_enric: 'He quitado el nombre del cliente.' }));
    const r = await submitRequest(tenant, { text: 'Cuando el cliente Pepe cambia una URL, hay que hacer la 301 en Rank Math https://www.loom.com/share/abc', source: 'equipo', byName: 'Mayi', byUserId: null });
    expect(r.drafted).toBe(true);
    const a = (await getArticle(tenant, r.id))!;
    expect(a).toMatchObject({ status: 'propuesta', sourceType: 'equipo', requestedByName: 'Mayi', title: 'Redirigir una URL en WordPress' });
    expect(a.requestText).toContain('cliente Pepe');
    expect(a.aiDraft).toBeTruthy();
    expect((a.links as { url: string }[]).map((l) => l.url)).toContain('https://www.loom.com/share/abc');
    expect(a.tags).toEqual(['wordpress', 'rank math']);
    // El texto del usuario va marcado como dato no fiable en el prompt.
    expect(h.aiCalls[0]).toContain('<<<DATO NO FIABLE');
    expect(sent).toHaveLength(1);
    expect(sent[0].html).toContain('Mayi');
    expect(sent[0].html).toContain('He quitado el nombre del cliente');
    expect(JSON.stringify(sent[0].buttons)).toContain(`x:kb:ok:${r.id}`);
  });

  it('si la IA falla, la solicitud queda con el texto original para revisarla', async () => {
    h.aiReplies.push('esto no es json');
    const r = await submitRequest(tenant, { text: 'Texto suficientemente largo para la prueba', source: 'equipo', byName: 'Jesus', byUserId: null });
    expect(r.drafted).toBe(false);
    expect((await getArticle(tenant, r.id))!.status).toBe('propuesta');
    expect(sent[0].html).toContain('no ha podido redactarla');
  });

  it('«Cambiar» por Telegram: pide la indicación, la IA rehace la versión y queda anotado para aprender', async () => {
    h.aiReplies.push(draft({}));
    const { id } = await submitRequest(tenant, { text: 'Redirecciones en WordPress con Rank Math', source: 'dictado', byName: 'Enric', byUserId: null });
    sent.length = 0;
    const r1 = await handleKnowledgeButton({ tenantId: tenant, data: `ch:${id}`, chatId: '999', by: 'Enric', isOwner: true });
    expect(r1.awaitText).toContain('¿Qué cambio?');
    h.aiReplies.push(draft({ solucion: '0. Haz copia de seguridad.\n1. Abre Rank Math.' }));
    const reply = await handleKnowledgeText({ tenantId: tenant, chatId: '999', text: 'Añade que primero hay que hacer copia', by: 'Enric', isOwner: true });
    expect(reply).toContain('nueva versión');
    const a = (await getArticle(tenant, id))!;
    expect(a.solution).toContain('copia de seguridad');
    expect(a.awaitingChatId).toBeNull();
    const notes = a.editNotes as { instruction: string; before: { solution: string } }[];
    expect(notes).toHaveLength(1);
    expect(notes[0].instruction).toContain('copia');
    expect(notes[0].before.solution).toContain('Crea la redirección 301');
    expect((a.aiDraft as { solution: string }).solution).toContain('Crea la redirección 301');
    expect(h.aiCalls[1]).toContain('Indicación de Enric');
    expect(sent).toHaveLength(1);
  });

  it('solo el dueño decide; publicar, más tarde y descartar', async () => {
    h.aiReplies.push(draft({}), draft({}), draft({}));
    const a = await submitRequest(tenant, { text: 'Primera solicitud de prueba larga', source: 'equipo', byName: 'X', byUserId: null });
    const b = await submitRequest(tenant, { text: 'Segunda solicitud de prueba larga', source: 'equipo', byName: 'X', byUserId: null });
    const c = await submitRequest(tenant, { text: 'Tercera solicitud de prueba larga', source: 'equipo', byName: 'X', byUserId: null });
    expect((await handleKnowledgeButton({ tenantId: tenant, data: `ok:${a.id}`, chatId: '1', by: 'Jesus', isOwner: false })).alert).toBe(true);
    expect((await getArticle(tenant, a.id))!.status).toBe('propuesta');
    await handleKnowledgeButton({ tenantId: tenant, data: `ok:${a.id}`, chatId: '1', by: 'Enric', isOwner: true });
    await handleKnowledgeButton({ tenantId: tenant, data: `lt:${b.id}`, chatId: '1', by: 'Enric', isOwner: true });
    await handleKnowledgeButton({ tenantId: tenant, data: `no:${c.id}`, chatId: '1', by: 'Enric', isOwner: true });
    expect((await getArticle(tenant, a.id))!).toMatchObject({ status: 'publicada' });
    expect((await getArticle(tenant, a.id))!.publishedAt).toBeTruthy();
    expect((await getArticle(tenant, b.id))!.status).toBe('mas_tarde');
    expect((await getArticle(tenant, c.id))!.status).toBe('archivada');
    // Ya decidida: el botón no hace nada.
    expect((await handleKnowledgeButton({ tenantId: tenant, data: `no:${a.id}`, chatId: '1', by: 'Enric', isOwner: true })).keyboard).toBeNull();
  });

  it('búsqueda: por significado y por palabras; los agentes solo ven lo publicado', async () => {
    const cats = await listCategories(tenant);
    const web = cats.find((c) => c.key === 'web')!.id;
    const pub = await saveArticle(tenant, null, { title: 'Formulario de Elementor que no envía correos', problem: 'Los formularios no llegan al cliente', solution: 'Configura el SMTP con WP Mail SMTP y prueba el envío.', categoryId: web, tags: ['elementor', 'smtp'], links: [] }, null, 'publicada');
    const draftOnly = await saveArticle(tenant, null, { title: 'Formularios: borrador sin publicar', problem: '', solution: 'Formularios correos SMTP', categoryId: null, tags: [], links: [] }, null);
    await refreshEmbeddings(tenant, 100);
    const hits = await searchKnowledge(tenant, 'los formularios no envían correos', 5);
    expect(hits[0]?.id).toBe(pub);
    expect(hits.some((x) => x.id === draftOnly)).toBe(false);
    // Por palabra exacta (etiqueta).
    expect((await searchKnowledge(tenant, 'smtp', 5)).map((x) => x.id)).toContain(pub);
    // En la pantalla, dentro de los estados pedidos.
    expect((await listArticles(tenant, { statuses: ['borrador'], q: 'formularios' })).map((x) => x.id)).toContain(draftOnly);
    const tool = KNOWLEDGE_TOOLS.find((t) => t.name === 'buscar_conocimiento')!;
    const out = await tool.run({ tenantId: tenant, agentKey: 'principal', channel: 'telegram', conversationId: null, actor: { name: 'Enric', isOwner: true, clickupUserId: '1' } } as never, { pregunta: 'formulario elementor correos' });
    expect(out.content).toContain('WP Mail SMTP');
    expect((await getArticle(tenant, pub))!.timesUsed).toBe(1);
  });

  it('publicar exige solución; importar no duplica ni guarda contraseñas', async () => {
    const id = await saveArticle(tenant, null, { title: 'Sin solución', problem: '', solution: '', categoryId: null, tags: [], links: [] }, null);
    await expect(setArticleStatus(tenant, id, 'publicada', null)).rejects.toThrow(/título y solución/);
    const items = [
      { sourceId: 'cu1', sourceUrl: 'https://app.clickup.com/t/cu1', title: 'Tutorial SEO', solution: 'Pasos', categoryKey: 'seo', tags: ['Tutoriales - SEO'], links: [{ title: 'Tarea original en ClickUp', url: 'https://app.clickup.com/t/cu1' }] },
      { sourceId: 'cu2', sourceUrl: 'https://app.clickup.com/t/cu2', title: 'Accesos', solution: 'contraseña: abc12345', categoryKey: null, tags: [], links: [] }
    ];
    expect(await insertImportedArticles(tenant, 'clickup', items, null)).toEqual({ imported: 1, existing: 0, withSecrets: 1 });
    expect(await insertImportedArticles(tenant, 'clickup', items, null)).toEqual({ imported: 0, existing: 1, withSecrets: 1 });
    const [row] = await db.select().from(kbArticles).where(eq(kbArticles.sourceId, 'cu1'));
    expect(row).toMatchObject({ status: 'mas_tarde', sourceType: 'clickup' });
    const counts = await countByStatus(tenant);
    expect(counts.mas_tarde).toBeGreaterThanOrEqual(2);
  });
});
