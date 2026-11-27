// SEO · Jefe SEO D5: el investigador de novedades. Reglas puras (filtro por código, validación de lo que dice la IA) y el
// flujo con la base de datos real (cuenta de prueba propia) y la IA simulada: sin novedades no se llama a la IA.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

const h = vi.hoisted(() => ({ calls: 0, reply: '', submitted: [] as string[] }));
vi.mock('@/lib/ai/gateway', async (orig) => {
  const m = await orig<typeof import('@/lib/ai/gateway')>();
  return {
    ...m,
    getPrompt: async () => ({ system_prompt: 'sistema', user_prompt_template: 'Hoy {hoy}\n{lineas}\n{novedades}' }),
    callAI: async () => {
      h.calls++;
      return { content: h.reply, jobId: '00000000-0000-4000-8000-000000000009', provider: 'anthropic', model: 'claude-sonnet-5-5' };
    }
  };
});
vi.mock('@/lib/core/knowledge', async (orig) => {
  const m = await orig<typeof import('@/lib/core/knowledge')>();
  return { ...m, submitRequest: async (_t: string, input: { text: string }) => (h.submitted.push(input.text), { id: `art-${h.submitted.length}`, drafted: true }) };
});

import { db } from '@/lib/db/drizzle';
import { kbFeedItems, tenants } from '@/lib/db/schema';
import { prefilter, relevance, toPropose, validateFindings, type NewsItem } from '@/lib/seo/id/investigador-rules';
import { investigate } from '@/lib/seo/id/investigador';
import { _resetSeeded } from '@/lib/seo/id/fuentes';

const item = (o: Partial<NewsItem> & { id: string }): NewsItem => ({ title: 'x', summary: null, url: `https://x.com/${o.id}`, publishedAt: '2026-11-25T00:00:00Z', sourceLabel: 'X', level: 'reputada', ...o });

describe('Jefe SEO D5: filtro y validación (puros)', () => {
  it('pertinencia: lo de Google, local, IA o técnico puntúa; las listas de herramientas no', () => {
    expect(relevance({ title: 'December 2026 core update rolling out', summary: null })).toBeGreaterThanOrEqual(5);
    expect(relevance({ title: 'Google Business Profile adds new review features', summary: null })).toBeGreaterThanOrEqual(4);
    expect(relevance({ title: '16 best competitor analysis tools for 2027', summary: null })).toBe(0);
  });
  it('a la IA: lo oficial siempre y primero; lo demás solo si es pertinente', () => {
    const out = prefilter([
      item({ id: 'a', title: '16 best tools', level: 'reputada' }),
      item({ id: 'b', title: 'AI Overviews cut CTR', level: 'reputada' }),
      item({ id: 'c', title: 'New Search Central podcast', level: 'oficial' })
    ]);
    expect(out.map((i) => i.id)).toEqual(['c', 'b']);
  });
  it('valida: enlaces solo de lo leído, el nivel nunca sube por encima de la fuente, líneas del catálogo', () => {
    const items = [item({ id: 'ofi', level: 'oficial' }), item({ id: 'blog', level: 'reputada' })];
    const raw = {
      hallazgos: [
        { titulo: 'Core update de diciembre', que_cambia: 'x', nivel: 'oficial', fuentes: ['https://x.com/ofi', 'https://inventada.com'], lineas: ['refuerzo_al_alcance', 'no_existe'], importancia: 'alta' },
        { titulo: 'Los AI Overviews bajan el CTR', que_cambia: 'x', nivel: 'oficial', fuentes: ['https://x.com/blog'], importancia: 'media' },
        { titulo: 'Sin fuentes válidas', fuentes: ['https://otra.com'], importancia: 'alta' }
      ]
    };
    const v = validateFindings(raw, items);
    expect(v.ok.map((f) => [f.titulo, f.nivel])).toEqual([
      ['Core update de diciembre', 'oficial'],
      ['Los AI Overviews bajan el CTR', 'reputada']
    ]);
    expect(v.ok[0].fuentes).toEqual(['https://x.com/ofi']);
    expect(v.ok[0].lineas).toEqual(['refuerzo_al_alcance']);
    expect(v.ok[0].fecha).toBe('2026-11-25');
    expect(v.rejected).toEqual(['Sin fuentes válidas']);
    expect(toPropose([...v.ok, { ...v.ok[0], titulo: 'baja', importancia: 'baja' }]).map((f) => f.titulo)).toEqual(['Core update de diciembre', 'Los AI Overviews bajan el CTR']);
  });
});

const SLUG = 'prueba-seo-jefe-d5';
let T = '';
async function cleanup() {
  const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, SLUG));
  if (t) await db.delete(tenants).where(eq(tenants.id, t.id));
}

describe('Jefe SEO D5: pasada del investigador', () => {
  beforeAll(async () => {
    await cleanup();
    _resetSeeded();
    const [t] = await db.insert(tenants).values({ name: 'Prueba Jefe SEO D5', slug: SLUG }).returning();
    T = t.id;
  });
  afterAll(cleanup);

  it('sin novedades no llama a la IA', async () => {
    const r = await investigate(T);
    expect(r).toMatchObject({ leidas: 0, propuestas: 0 });
    expect(h.calls).toBe(0);
  });

  it('con novedades: una llamada, lo importante a la base con nivel, fecha y enlaces', async () => {
    await db.insert(kbFeedItems).values([
      { tenantId: T, domain: 'seo', sourceKey: 'search_status', hash: 'h1', url: 'https://status.search.google.com/x', title: 'December 2026 core update', kind: 'core_update', publishedAt: new Date('2026-11-24T00:00:00Z') },
      { tenantId: T, domain: 'seo_ext', sourceKey: 'ahrefs_blog', hash: 'h2', url: 'https://ahrefs.com/blog/ai-overviews', title: 'AI Overviews cut CTR by 24%', kind: 'novedad', publishedAt: new Date('2026-11-26T00:00:00Z') },
      { tenantId: T, domain: 'seo_ext', sourceKey: 'semrush_blog', hash: 'h3', url: 'https://semrush.com/blog/tools', title: '16 best competitor analysis tools', kind: 'novedad', publishedAt: new Date('2026-11-27T00:00:00Z') }
    ]);
    h.reply = JSON.stringify({
      hallazgos: [
        { titulo: 'Google lanza la core update de diciembre', que_cambia: 'Movimientos de posiciones durante 2 semanas.', nivel: 'oficial', fuentes: ['https://status.search.google.com/x'], fecha: '2026-11-24', lineas: ['refuerzo_al_alcance'], a_quien_afecta: 'todas las webs', que_hacer: 'No tocar nada hasta que termine; anotar el evento.', importancia: 'alta' },
        { titulo: 'Los AI Overviews bajan el CTR', que_cambia: 'Menos clics en informativas.', nivel: 'oficial', fuentes: ['https://ahrefs.com/blog/ai-overviews'], lineas: ['contenido_cadencia'], importancia: 'media' }
      ]
    });
    const r = await investigate(T);
    expect(h.calls).toBe(1);
    expect(r).toMatchObject({ leidas: 3, pertinentes: 2, hallazgos: 2, propuestas: 2 });
    expect(h.submitted[0]).toMatch(/Nivel: OFICIAL/);
    expect(h.submitted[0]).toMatch(/Fecha: 2026-11-24/);
    // Lo dijo un blog: aunque la IA diga «oficial», queda como reputada.
    expect(h.submitted[1]).toMatch(/Nivel: REPUTADA/);
    expect(h.submitted[1]).toMatch(/https:\/\/ahrefs\.com\/blog\/ai-overviews/);
  });
});
