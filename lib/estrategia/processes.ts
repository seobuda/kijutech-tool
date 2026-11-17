import 'server-only';

// Módulo Estrategia: los procesos que se ejecutan por cliente según su plan (los elige scheduler.ts). Cada uno guarda su
// resultado (salud, señales, objetivos, palabras, URLs) y devuelve un resumen para la agenda. Sin IA salvo la
// extracción de datos de los encargos (modelo pequeño). Google llega por el núcleo (fuente de métricas con «search» e
// «inspectUrl», registrada por Agentes); las cifras, por el proveedor de KPI (Rendimiento); el trabajo, por Operaciones.
import { and, eq, gte, like, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiJobs, type EstSettings, type EstIssue } from '@/lib/db/schema';
import { kpiProvider, metricSources, telegramOutbound, workSource, type MetricSource, type SearchRow, type WorkItem } from '@/lib/core/capabilities';
import { listPrimaryAssets } from '@/lib/core/clients';
import { callAI, getPrompt } from '@/lib/ai/gateway';
import { extractJsonFromLLMResponse } from '@/lib/ai/parsers/json-extractor';
import {
  HEALTH_LABEL,
  HEALTH_RANK,
  addDays,
  addMonths,
  brokenFunnel,
  cannibalization,
  cleanExtraction,
  daysBetween,
  fmtDayYear,
  homeOf,
  hostOf,
  locsFromSitemap,
  lowCtr,
  madridNow,
  monthEnd,
  monthStart,
  newQueries,
  objectiveHealth,
  pageDrops,
  pageIssues,
  perMonth,
  re2Escape,
  robotsBlocksAll,
  ruleExtraction,
  seasonalIndex,
  sitemapsFromRobots,
  strikingDistance,
  urlInProperty,
  URL_RE,
  WORK_CATEGORY_LABEL,
  type EffectiveProcess,
  type Health,
  type ProcessKey,
  type QP,
  type Signal
} from '@/lib/estrategia/rules';
import {
  getSettings,
  getWorkFact,
  insertWorkFact,
  keywordHistory,
  listKeywords,
  listObjectives,
  listTrackedUrls,
  markSignalsNotified,
  saveHealthCheck,
  saveKeywordHistory,
  patchSettingsState,
  saveUrlDaily,
  trackUrl,
  updateKeywordSummary,
  updateObjectiveHealth,
  updateTrackedUrl,
  updateWorkFact,
  upsertSignals,
  clientEffective
} from '@/lib/estrategia/store';
import { fetchPage, fetchText, pageSpeed, pool, sslDaysLeft } from '@/lib/estrategia/web';
import { estSignals } from '@/lib/db/schema';

export type ProcessOutcome = { status: 'ok' | 'aviso' | 'error' | 'omitido'; summary: string; retryInMin?: number };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const BASE_URL = () => (process.env.BASE_URL || '').replace(/\/$/, '');
const tabLink = (clientId: string) => (BASE_URL() ? `\n<a href="${BASE_URL()}/dashboard/clientes/${clientId}?tab=estrategia">Abrir su estrategia</a>` : '');

export type Ctx = {
  tenantId: string;
  clientId: string;
  clientName: string;
  today: string;
  settings: EstSettings;
  gsc: { source: MetricSource; property: string } | null;
  homes: string[];
  domains: string[];
  processes: EffectiveProcess[];
};

/** Lo que necesita cualquier proceso de un cliente: su propiedad de Search Console, su web y su configuración. */
export async function loadCtx(tenantId: string, clientId: string, now = new Date()): Promise<Ctx | null> {
  const eff = await clientEffective(tenantId, clientId);
  if (!eff) return null;
  const assets = (await listPrimaryAssets(tenantId, ['search_console', 'web', 'dominio'])).filter((a) => a.clientId === clientId);
  const clientName = assets[0]?.clientName ?? '';
  const src = metricSources().find((s) => s.search && s.kinds.some((k) => k.source === 'gsc'));
  const gscAsset = assets.find((a) => a.kind === 'search_console' && a.access !== 'no_aplica');
  let gsc: Ctx['gsc'] = null;
  if (src && gscAsset && (await src.isConnected(tenantId).catch(() => false))) {
    const property = src.normalize('gsc', gscAsset.value);
    if (property) gsc = { source: src, property };
  }
  const homes = [...new Set([...assets.filter((a) => a.kind === 'web' || a.kind === 'dominio').map((a) => homeOf(a.value)), gsc ? homeOf(gsc.property) : null].filter((h): h is string => Boolean(h)))].slice(0, 2);
  const domains = [...new Set(homes.map((h) => hostOf(h)).filter((d): d is string => Boolean(d)))];
  const name = clientName || (await import('@/lib/core/clients').then((m) => m.getClient(tenantId, clientId)).then((c) => c?.name ?? ''));
  return { tenantId, clientId, clientName: name, today: madridNow(now).date, settings: await getSettings(tenantId), gsc, homes, domains, processes: eff.processes };
}

const isOn = (ctx: Ctx, k: ProcessKey) => ctx.processes.some((p) => p.key === k && p.on);

async function notify(ctx: Ctx, key: string, html: string): Promise<void> {
  await telegramOutbound()?.notifyOwner(ctx.tenantId, key, `${html}${tabLink(ctx.clientId)}`);
}

export async function search(ctx: Ctx, q: Parameters<NonNullable<MetricSource['search']>>[3]): Promise<SearchRow[]> {
  if (!ctx.gsc?.source.search) return [];
  return ctx.gsc.source.search(ctx.tenantId, 'gsc', ctx.gsc.property, q);
}

/** Avisa de las señales nuevas con gravedad suficiente (una línea por señal, un mensaje por cliente y tipo de proceso). */
async function notifySignals(ctx: Ctx, process: string, fresh: Signal[], minSeverity: 'aviso' | 'critico' = 'aviso'): Promise<void> {
  if (!ctx.settings.alertsEnabled) return;
  const rank = { info: 0, aviso: 1, critico: 2 };
  const list = fresh.filter((s) => rank[s.severity] >= rank[minSeverity]);
  if (!list.length) return;
  await notify(ctx, `est:${process}:${ctx.clientId}:${ctx.today}:${keyHash(list.map((s) => s.key))}`, `${list.some((s) => s.severity === 'critico') ? '🚨' : '⚠️'} <b>${esc(ctx.clientName)}</b>\n${list.map((s) => `• ${esc(s.title)}`).join('\n')}`);
  const rows = await db.select({ id: estSignals.id, key: estSignals.dedupeKey }).from(estSignals).where(eq(estSignals.clientId, ctx.clientId));
  const keys = new Set(list.map((s) => s.key));
  await markSignalsNotified(rows.filter((r) => keys.has(r.key)).map((r) => r.id));
  // Una caída fuerte (crítica) en Google o en la ficha despierta al estratega. La web caída no: es una urgencia técnica.
  const grave = list.find((s) => s.severity === 'critico');
  if (grave && ['detectores', 'gbp', 'keywords'].includes(process)) await import('@/lib/estrategia/strategist').then((m) => m.maybeAlertAnalysis(ctx, grave.title.slice(0, 300))).catch((e) => console.error('[estrategia] análisis por alerta:', e instanceof Error ? e.message : e));
}

/** Huella corta de un conjunto de claves: dos lotes distintos el mismo día no chocan en la cola de avisos. */
function keyHash(keys: string[]): string {
  let h = 0;
  for (const c of [...keys].sort().join('|')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

const toQP = (rows: SearchRow[]): QP[] => rows.map((r) => ({ query: r.keys[0] ?? '', page: r.keys[1] ?? '', clicks: r.clicks, impressions: r.impressions, position: r.position }));

/** Consultas con más impresiones de las últimas 4 semanas (para sugerir palabras clave que seguir). */
export async function searchTopQueries(ctx: Ctx, n: number): Promise<{ keyword: string; impressions: number; clicks: number; position: number }[]> {
  if (!ctx.gsc) return [];
  const to = addDays(ctx.today, -3);
  const rows = await search(ctx, { from: addDays(to, -27), to, dimensions: ['query'], limit: 500 });
  return rows
    .map((r) => ({ keyword: String(r.keys[0] ?? '').toLowerCase(), impressions: Math.round(r.impressions), clicks: Math.round(r.clicks), position: Math.round(r.position * 10) / 10 }))
    .filter((r) => r.keyword.length >= 2)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, n);
}

/** Páginas con más clics de las últimas 4 semanas (para revisar primero lo que importa). */
async function topPages(ctx: Ctx, n: number): Promise<string[]> {
  if (!ctx.gsc) return [];
  const to = addDays(ctx.today, -3);
  const rows = await search(ctx, { from: addDays(to, -27), to, dimensions: ['page'], limit: n });
  return rows.sort((a, b) => b.clicks - a.clicks).map((r) => r.keys[0]).filter(Boolean).slice(0, n);
}

// --- Vigilancia crítica (diaria) -----------------------------------------------------------------------------------

export async function runCritico(ctx: Ctx): Promise<ProcessOutcome> {
  if (!ctx.homes.length) return { status: 'omitido', summary: 'El cliente no tiene web en su ficha (Webs y cuentas).' };
  const issues: EstIssue[] = [];
  const metrics: Record<string, unknown> = {};
  for (const home of ctx.homes) {
    const host = hostOf(home)!;
    const page = await fetchPage(home);
    if ('error' in page) issues.push({ code: 'caida', severity: 'critico', url: home, detail: `La web no responde: ${page.error}.` });
    else {
      metrics[host] = { status: page.status, finalUrl: page.finalUrl };
      if (page.status >= 500) issues.push({ code: 'caida', severity: 'critico', url: home, detail: `La portada da error del servidor (${page.status}).` });
      else if (page.status >= 400) issues.push({ code: 'portada_error', severity: 'critico', url: home, detail: `La portada responde con error ${page.status}.` });
      else if (page.noindex || /noindex/i.test(page.xRobots ?? '')) issues.push({ code: 'noindex', severity: 'critico', url: page.finalUrl, detail: 'La portada tiene «noindex»: Google dejará de mostrarla.' });
    }
    const robots = await fetchText(new URL('/robots.txt', home).toString());
    if (robots && robotsBlocksAll(robots)) issues.push({ code: 'robots', severity: 'critico', url: new URL('/robots.txt', home).toString(), detail: 'robots.txt bloquea toda la web a Google («Disallow: /»).' });
    const days = home.startsWith('https:') ? await sslDaysLeft(host) : null;
    if (days !== null) {
      metrics[`${host}:ssl`] = days;
      if (days < 0) issues.push({ code: 'ssl', severity: 'critico', url: home, detail: `El certificado SSL caducó hace ${-days} día(s).` });
      else if (days < 14) issues.push({ code: 'ssl', severity: 'aviso', url: home, detail: `El certificado SSL caduca en ${days} día(s).` });
    }
  }
  const status = issues.some((i) => i.severity === 'critico') ? 'critico' : issues.length ? 'aviso' : 'ok';
  await saveHealthCheck(ctx.tenantId, ctx.clientId, 'critico', status, metrics, issues);
  const signals: Signal[] = issues.map((i) => ({ kind: 'critico', key: `critico:${i.code}:${hostOf(i.url ?? '') ?? ''}`, severity: i.severity === 'info' ? 'aviso' : i.severity, title: i.detail, detail: i.url ?? '', evidence: { url: i.url, code: i.code } }));
  await upsertSignals(ctx.tenantId, ctx.clientId, ['critico'], signals);
  // Confirmación: solo se avisa si el problema sigue en una segunda comprobación (30 min después).
  const open = await db.select().from(estSignals).where(and(eq(estSignals.clientId, ctx.clientId), eq(estSignals.kind, 'critico'), eq(estSignals.status, 'abierta')));
  const confirmed = open.filter((s) => !s.notifiedAt && Date.now() - s.firstSeenAt.getTime() >= 20 * 60_000);
  if (confirmed.length && ctx.settings.alertsEnabled) {
    await notify(ctx, `est:critico:${ctx.clientId}:${ctx.today}:${confirmed.map((s) => s.dedupeKey).sort().join('|').slice(0, 120)}`, `🚨 <b>${esc(ctx.clientName)}</b>: problema en la web (confirmado)\n${confirmed.map((s) => `• ${esc(s.title)}`).join('\n')}`);
    await markSignalsNotified(confirmed.map((s) => s.id));
  }
  if (!issues.length) return { status: 'ok', summary: `Web correcta (${ctx.homes.map((h) => hostOf(h)).join(', ')}).` };
  const pendingConfirm = open.some((s) => !s.notifiedAt && s.severity === 'critico');
  return { status: 'aviso', summary: issues.map((i) => i.detail).join(' · ').slice(0, 500), retryInMin: pendingConfirm ? 30 : undefined };
}

// --- Salud técnica (semanal) ----------------------------------------------------------------------------------------

export async function runSalud(ctx: Ctx): Promise<ProcessOutcome> {
  if (!ctx.homes.length) return { status: 'omitido', summary: 'El cliente no tiene web en su ficha.' };
  const home = ctx.homes[0];
  const robots = await fetchText(new URL('/robots.txt', home).toString());
  let sitemaps = robots ? sitemapsFromRobots(robots) : [];
  if (!sitemaps.length) sitemaps = [new URL('/sitemap.xml', home).toString(), new URL('/sitemap_index.xml', home).toString()];
  const sitemapUrls: string[] = [];
  let sitemapFound = false;
  for (const sm of sitemaps.slice(0, 3)) {
    const xml = await fetchText(sm);
    if (!xml || !/<(urlset|sitemapindex)/i.test(xml)) continue;
    sitemapFound = true;
    const parsed = locsFromSitemap(xml);
    sitemapUrls.push(...parsed.urls);
    for (const child of parsed.sitemaps.slice(0, 3)) {
      const cx = await fetchText(child);
      if (cx) sitemapUrls.push(...locsFromSitemap(cx).urls);
    }
    if (sitemapUrls.length) break;
  }
  const top = await topPages(ctx, 20).catch(() => [] as string[]);
  const sample = sitemapUrls.filter((u) => !top.includes(u)).filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 20)) === 0).slice(0, 20);
  const urls = [...new Set([home, ...top, ...sample])].slice(0, 40);
  const facts = await pool(urls, 4, (u) => fetchPage(u));
  const issues: EstIssue[] = [];
  const titles = new Map<string, string[]>();
  urls.forEach((u, i) => {
    issues.push(...pageIssues(u, facts[i]));
    const f = facts[i];
    if (!('error' in f) && f.status < 300 && f.title) titles.set(f.title, [...(titles.get(f.title) ?? []), u]);
  });
  for (const [t, us] of titles) if (us.length > 1) issues.push({ code: 'titulo_duplicado', severity: 'info', url: us[0], detail: `${us.length} páginas con el mismo título «${t.slice(0, 80)}».` });
  if (!sitemapFound) issues.push({ code: 'sin_sitemap', severity: 'info', url: home, detail: 'No se encuentra el sitemap (ni en robots.txt ni en /sitemap.xml).' });
  // Indexación en Search Console de las páginas con más clics (cuota de Google: se miran pocas).
  let inspected = 0;
  if (ctx.gsc?.source.inspectUrl) {
    for (const u of [home, ...top].slice(0, 8)) {
      if (!urlInProperty(u, ctx.gsc.property)) continue;
      const r = await ctx.gsc.source.inspectUrl(ctx.tenantId, 'gsc', ctx.gsc.property, u).catch(() => null);
      if (!r) continue;
      inspected++;
      if (r.verdict && r.verdict !== 'PASS') issues.push({ code: 'no_indexada', severity: 'aviso', url: u, detail: `Search Console: ${r.coverage ?? r.verdict}.` });
    }
  }
  const status = issues.some((i) => i.severity === 'critico') ? 'critico' : issues.some((i) => i.severity === 'aviso') ? 'aviso' : 'ok';
  await saveHealthCheck(ctx.tenantId, ctx.clientId, 'salud', status, { pages: urls.length, sitemapUrls: sitemapUrls.length, inspected }, issues);
  // Una señal por tipo de problema (con sus URLs), no una por URL.
  const byCode = new Map<string, EstIssue[]>();
  for (const i of issues) if (i.severity !== 'info') byCode.set(i.code, [...(byCode.get(i.code) ?? []), i]);
  const signals: Signal[] = [...byCode].map(([code, list]) => ({
    kind: 'tecnico',
    key: `tecnico:${code}`,
    severity: list.some((i) => i.severity === 'critico') ? 'critico' : 'aviso',
    title: `${list.length} página(s): ${list[0].detail}${list.length > 1 ? ' (y otras)' : ''}`.slice(0, 300),
    detail: list.map((i) => `${i.url}: ${i.detail}`).join('\n').slice(0, 4000),
    evidence: { code, urls: list.map((i) => i.url).slice(0, 50) }
  }));
  const fresh = await upsertSignals(ctx.tenantId, ctx.clientId, ['tecnico'], signals);
  await notifySignals(ctx, 'salud', fresh, 'critico');
  const n = issues.filter((i) => i.severity !== 'info').length;
  return { status: n ? 'aviso' : 'ok', summary: `${urls.length} páginas revisadas${inspected ? `, ${inspected} en Search Console` : ''}: ${n ? `${n} problema(s)` : 'sin problemas importantes'}${issues.length - n ? ` y ${issues.length - n} detalle(s) menores` : ''}.` };
}

// --- Velocidad (mensual) --------------------------------------------------------------------------------------------

export async function runVelocidad(ctx: Ctx): Promise<ProcessOutcome> {
  if (!ctx.homes.length) return { status: 'omitido', summary: 'El cliente no tiene web en su ficha.' };
  const top = await topPages(ctx, 3).catch(() => [] as string[]);
  const urls = [...new Set([ctx.homes[0], ...top])].slice(0, 3);
  const results: Record<string, unknown>[] = [];
  const issues: EstIssue[] = [];
  let failed = 0;
  for (const u of urls) {
    const r = await pageSpeed(u);
    if ('error' in r) {
      failed++;
      results.push({ url: u, error: r.error });
      continue;
    }
    results.push(r);
    const cat = r.field?.category;
    if (cat === 'SLOW') issues.push({ code: 'lenta', severity: 'aviso', url: u, detail: `Lenta para los usuarios reales (Core Web Vitals: suspenso). LCP ${r.field?.lcpMs ?? '—'} ms, INP ${r.field?.inpMs ?? '—'} ms, CLS ${r.field?.cls ?? '—'}.` });
    else if (cat === 'AVERAGE') issues.push({ code: 'mejorable', severity: 'info', url: u, detail: `Velocidad mejorable (Core Web Vitals: «necesita mejorar»).` });
    if (r.score !== null && r.score < 50) issues.push({ code: 'puntuacion_baja', severity: 'info', url: u, detail: `Puntuación de laboratorio ${r.score}/100 en móvil.` });
  }
  if (failed === urls.length) return { status: 'error', summary: String((results[0] as { error?: string })?.error ?? 'No se pudo consultar PageSpeed') };
  const status = issues.some((i) => i.severity === 'aviso') ? 'aviso' : 'ok';
  await saveHealthCheck(ctx.tenantId, ctx.clientId, 'velocidad', status, { results }, issues);
  const signals: Signal[] = issues.filter((i) => i.severity === 'aviso').map((i) => ({ kind: 'velocidad', key: `velocidad:${i.url}`, severity: 'aviso', title: `${i.url}: lenta para los usuarios reales`, detail: i.detail, evidence: { url: i.url } }));
  await upsertSignals(ctx.tenantId, ctx.clientId, ['velocidad'], signals);
  return { status: status === 'aviso' ? 'aviso' : 'ok', summary: `${urls.length - failed} página(s) medida(s): ${issues.length ? issues.map((i) => i.code).join(', ') : 'velocidad correcta'}.` };
}

// --- Palabras clave -------------------------------------------------------------------------------------------------

/** Posición, clics e impresiones de las palabras del cliente (todas, o solo las críticas y las de páginas recién cambiadas). */
export async function runKeywords(ctx: Ctx, opts: { onlyUrgent?: boolean } = {}): Promise<ProcessOutcome> {
  if (!ctx.gsc) return { status: 'omitido', summary: 'Falta la propiedad de Search Console (o Google no está conectado).' };
  let words = (await listKeywords(ctx.tenantId, ctx.clientId)).filter((k) => k.active);
  if (opts.onlyUrgent) {
    const tracked = await listTrackedUrls(ctx.tenantId, ctx.clientId);
    const recent = new Set(tracked.filter((t) => daysBetween(t.changedOn, ctx.today) <= 28).map((t) => t.url));
    words = words.filter((k) => k.critical || (k.targetUrl && recent.has(k.targetUrl)));
  }
  if (!words.length) return { status: 'omitido', summary: opts.onlyUrgent ? 'Sin palabras urgentes.' : 'Aún no hay palabras clave que seguir (añádelas en la pestaña Estrategia).' };
  const to = addDays(ctx.today, -3);
  const history: { keywordId: string; date: string; position: number; clicks: number; impressions: number }[] = [];
  const byWord = new Map(words.map((w) => [w.keyword, w]));
  for (let i = 0; i < words.length; i += 25) {
    const chunk = words.slice(i, i + 25);
    const firstTime = chunk.some((w) => !w.lastCheckedOn);
    const from = addDays(to, firstTime ? -90 : -16);
    const rows = await search(ctx, { from, to, dimensions: ['date', 'query'], filters: [{ dimension: 'query', operator: 'includingRegex', expression: `(?i)^(${chunk.map((w) => re2Escape(w.keyword)).join('|')})$` }], limit: 25000 });
    for (const r of rows) {
      const w = byWord.get(String(r.keys[1] ?? '').toLowerCase());
      if (w) history.push({ keywordId: w.id, date: r.keys[0], position: r.position, clicks: Math.round(r.clicks), impressions: Math.round(r.impressions) });
    }
  }
  await saveKeywordHistory(history);
  const hist = await keywordHistory(words.map((w) => w.id), addDays(to, -13));
  const fresh: Signal[] = [];
  for (const w of words) {
    const h = hist.filter((x) => x.keywordId === w.id);
    const agg = (from: string, until: string) => {
      const xs = h.filter((x) => x.date >= from && x.date <= until);
      const imp = xs.reduce((a, b) => a + b.impressions, 0);
      return { pos: imp > 0 ? xs.reduce((a, b) => a + b.position * b.impressions, 0) / imp : null, clicks: xs.reduce((a, b) => a + b.clicks, 0), imp };
    };
    const last = agg(addDays(to, -6), to);
    const prev = agg(addDays(to, -13), addDays(to, -7));
    await updateKeywordSummary(w.id, { lastPosition: last.pos, prevPosition: prev.pos, lastClicks: last.clicks, lastImpressions: last.imp, lastCheckedOn: ctx.today });
    if (w.critical && last.pos !== null && prev.pos !== null && (last.pos - prev.pos >= 3 || (prev.pos <= 10 && last.pos > 10))) {
      fresh.push({ kind: 'palabra_cae', key: `palabra_cae:${w.keyword}`, severity: 'aviso', title: `«${w.keyword}» baja de la posición ${prev.pos.toFixed(1)} a la ${last.pos.toFixed(1)}`, detail: 'Palabra marcada como crítica. Posición media de Search Console (últimos 7 días frente a los 7 anteriores).', evidence: { keyword: w.keyword, position: last.pos, prevPosition: prev.pos } });
    }
  }
  // En la pasada urgente (solo algunas palabras) no se dan por resueltas las que no se miraron.
  const news = await upsertSignals(ctx.tenantId, ctx.clientId, ['palabra_cae'], fresh, { resolveMissing: !opts.onlyUrgent });
  await notifySignals(ctx, 'keywords', news);
  const ranked = words.filter((w) => hist.some((x) => x.keywordId === w.id)).length;
  return { status: fresh.length ? 'aviso' : 'ok', summary: `${words.length} palabra(s) revisada(s); ${ranked} con datos en Search Console${fresh.length ? `; ${fresh.length} crítica(s) bajando` : ''}.` };
}

// --- Ficha de Google Business (semanal) -----------------------------------------------------------------------------

const GBP_WATCH: { key: string; min: number; label: string }[] = [
  { key: 'gbp_views', min: 100, label: 'Vistas de la ficha' },
  { key: 'gbp_calls', min: 10, label: 'Llamadas desde la ficha' },
  { key: 'gbp_website', min: 10, label: 'Clics a la web desde la ficha' },
  { key: 'gbp_directions', min: 10, label: 'Cómo llegar' }
];

async function windows(ctx: Ctx, kpi: string) {
  const prov = kpiProvider();
  if (!prov) return null;
  const last = await prov.lastDay(ctx.tenantId, ctx.clientId, kpi);
  if (!last) return null;
  const cur = { from: addDays(last, -27), to: last };
  const prev = { from: addDays(last, -55), to: addDays(last, -28) };
  const yCur = { from: addDays(cur.from, -364), to: addDays(cur.to, -364) };
  const yPrev = { from: addDays(prev.from, -364), to: addDays(prev.to, -364) };
  const [a, b, c, d] = await prov.values(ctx.tenantId, ctx.clientId, kpi, [cur, prev, yCur, yPrev]);
  return { last, cur: a, prev: b, yCur: c, yPrev: d };
}

export async function runGbp(ctx: Ctx): Promise<ProcessOutcome> {
  const signals: Signal[] = [];
  const parts: string[] = [];
  const got: Record<string, Awaited<ReturnType<typeof windows>>> = {};
  for (const w of GBP_WATCH) {
    const v = await windows(ctx, w.key);
    got[w.key] = v;
    if (!v || v.cur === null || v.prev === null) continue;
    const change = v.prev > 0 ? Math.round(((v.cur - v.prev) / v.prev) * 100) : null;
    parts.push(`${w.label.toLowerCase()} ${Math.round(v.cur)}${change !== null ? ` (${change > 0 ? '+' : ''}${change} %)` : ''}`);
    if (change === null || v.prev < w.min || change > -25) continue;
    const ly = v.yCur !== null && v.yPrev !== null && v.yPrev > 0 ? Math.round(((v.yCur - v.yPrev) / v.yPrev) * 100) : null;
    const seasonal = ly !== null && ly <= change / 2;
    signals.push({ kind: 'ficha_cae', key: `ficha_cae:${w.key}`, severity: seasonal ? 'info' : 'aviso', title: `${w.label}: ${change} % en las últimas 4 semanas`, detail: `${Math.round(v.cur)} frente a ${Math.round(v.prev)} en las 4 anteriores.${seasonal ? ` El año pasado en estas fechas también bajó (${ly} %): probablemente es temporada.` : ''}`, evidence: { kpi: w.key, cur: v.cur, prev: v.prev, change, yoyChange: ly } });
  }
  if (!parts.length) return { status: 'omitido', summary: 'No hay datos de la ficha de Google (¿falta asignarla en Webs y cuentas?).' };
  const views = got.gbp_views;
  const calls = got.gbp_calls;
  if (views && calls) {
    const f = brokenFunnel('Ficha de Google (vistas → llamadas)', { cur: views.cur, prev: views.prev }, { cur: calls.cur, prev: calls.prev });
    if (f) signals.push(f);
  }
  const fresh = await upsertSignals(ctx.tenantId, ctx.clientId, ['ficha_cae', 'embudo_ficha'], signals.map((s) => (s.kind === 'embudo' ? { ...s, kind: 'embudo_ficha' } : s)));
  await notifySignals(ctx, 'gbp', fresh);
  return { status: signals.some((s) => s.severity === 'aviso') ? 'aviso' : 'ok', summary: `Últimas 4 semanas: ${parts.join(' · ')}.` };
}

// --- URLs trabajadas (diario) ---------------------------------------------------------------------------------------

export async function runUrls(ctx: Ctx): Promise<ProcessOutcome> {
  if (!ctx.gsc) return { status: 'omitido', summary: 'Falta la propiedad de Search Console (o Google no está conectado).' };
  const tracked = (await listTrackedUrls(ctx.tenantId, ctx.clientId, { activeOn: ctx.today })).slice(0, 40);
  if (!tracked.length) return { status: 'omitido', summary: 'Aún no hay URLs trabajadas que seguir.' };
  const to = addDays(ctx.today, -3);
  let synced = 0;
  let inspections = 0;
  let crawled = 0;
  for (const t of tracked) {
    if (t.property !== ctx.gsc.property && !urlInProperty(t.url, ctx.gsc.property)) continue;
    const from = t.backfilled && t.lastSyncedOn ? addDays(t.lastSyncedOn, -7) : addDays(t.changedOn, -90);
    if (from <= to) {
      const rows = await search(ctx, { from, to, dimensions: ['date'], filters: [{ dimension: 'page', operator: 'equals', expression: t.url }], limit: 1000 });
      await saveUrlDaily(t.id, rows.map((r) => ({ date: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })));
      await updateTrackedUrl(t.id, { backfilled: true, lastSyncedOn: to });
      synced++;
    }
    // ¿Google ya la volvió a rastrear tras el cambio? Desde ese día empieza a contar su impacto.
    const stale = !t.lastInspectedAt || Date.now() - t.lastInspectedAt.getTime() > 20 * 3_600_000;
    if (!t.crawledOn && stale && inspections < 10 && ctx.gsc.source.inspectUrl) {
      inspections++;
      const r = await ctx.gsc.source.inspectUrl(ctx.tenantId, 'gsc', ctx.gsc.property, t.url).catch(() => null);
      const patch: Parameters<typeof updateTrackedUrl>[1] = { lastInspectedAt: new Date() };
      if (r) {
        patch.indexState = (r.coverage ?? r.verdict ?? '').slice(0, 60) || null;
        if (r.lastCrawl && r.lastCrawl >= t.changedOn) {
          patch.crawledOn = r.lastCrawl;
          crawled++;
        }
      }
      await updateTrackedUrl(t.id, patch);
    }
  }
  return { status: 'ok', summary: `${synced} URL(s) actualizada(s)${inspections ? `; ${inspections} inspeccionada(s) en Search Console${crawled ? `, ${crawled} ya rastreada(s) tras el cambio` : ''}` : ''}.` };
}

// --- Detectores de oportunidades (semanal) --------------------------------------------------------------------------

const DETECTOR_KINDS = ['al_alcance', 'ctr_bajo', 'pagina_cae', 'consulta_nueva', 'canibalizacion', 'embudo'];

export async function runDetectores(ctx: Ctx): Promise<ProcessOutcome> {
  const signals: Signal[] = [];
  let gscRows = 0;
  if (ctx.gsc) {
    const to = addDays(ctx.today, -3);
    const cur = { from: addDays(to, -27), to };
    const prev = { from: addDays(to, -55), to: addDays(to, -28) };
    const [c, p, yc, yp] = await Promise.all([
      search(ctx, { ...cur, dimensions: ['query', 'page'], limit: 25000 }),
      search(ctx, { ...prev, dimensions: ['query', 'page'], limit: 25000 }),
      search(ctx, { from: addDays(cur.from, -364), to: addDays(cur.to, -364), dimensions: ['page'], limit: 5000 }).catch(() => [] as SearchRow[]),
      search(ctx, { from: addDays(prev.from, -364), to: addDays(prev.to, -364), dimensions: ['page'], limit: 5000 }).catch(() => [] as SearchRow[])
    ]);
    gscRows = c.length;
    const cfg = { strikingFrom: ctx.settings.strikingFrom, strikingTo: ctx.settings.strikingTo, minImpressions: ctx.settings.minImpressions };
    const curQP = toQP(c);
    const prevQP = toQP(p);
    const yMap = (rows: SearchRow[]) => (rows.length ? new Map(rows.map((r) => [r.keys[0], r.clicks])) : null);
    signals.push(...strikingDistance(curQP, cfg), ...lowCtr(curQP, cfg), ...pageDrops(curQP, prevQP, yMap(yc), yMap(yp)), ...newQueries(curQP, prevQP, cfg), ...cannibalization(curQP, prevQP, cfg));
  }
  // Embudo de la web: sesiones frente a conversiones (Analytics).
  const s = await windows(ctx, 'ga4_sessions').catch(() => null);
  const k = await windows(ctx, 'ga4_keyEvents').catch(() => null);
  if (s && k) {
    const f = brokenFunnel('Web (sesiones → conversiones)', { cur: s.cur, prev: s.prev }, { cur: k.cur, prev: k.prev });
    if (f) signals.push(f);
  }
  if (!ctx.gsc && !s) return { status: 'omitido', summary: 'Sin Search Console ni Analytics asignados: no hay datos que analizar.' };
  // Sin Search Console (o Google desconectado un momento) no se tocan sus señales: solo el embudo de Analytics.
  const fresh = await upsertSignals(ctx.tenantId, ctx.clientId, ctx.gsc ? DETECTOR_KINDS : ['embudo'], signals);
  await notifySignals(ctx, 'detectores', fresh);
  const count = (kind: string) => signals.filter((x) => x.kind === kind).length;
  return {
    status: signals.some((x) => x.severity === 'aviso') ? 'aviso' : 'ok',
    summary: `${gscRows ? `${gscRows} combinaciones consulta-página analizadas. ` : ''}Al alcance: ${count('al_alcance')} · CTR bajo: ${count('ctr_bajo')} · páginas en caída: ${count('pagina_cae')} · consultas nuevas: ${count('consulta_nueva')} · canibalización: ${count('canibalizacion')}${count('embudo') ? ' · embudo roto' : ''}. Nuevas: ${fresh.length}.`
  };
}

// --- Objetivos (diario) ---------------------------------------------------------------------------------------------

export async function evaluateObjective(ctx: Ctx, o: Awaited<ReturnType<typeof listObjectives>>[number]) {
  const prov = kpiProvider();
  const info = prov?.list().find((k) => k.key === o.kpiKey) ?? null;
  if (o.kind === 'hito' || !prov || !info) return { info, actual: null as number | null, ...objectiveHealth({ kind: o.kind as 'kpi' | 'hito', baseline: o.baselineValue, target: o.targetValue, start: o.startDate, due: o.dueDate, curve: o.curve as 's', lowerBetter: false }, null, ctx.today, ctx.settings) };
  const last = await prov.lastDay(ctx.tenantId, ctx.clientId, info.key);
  let actual: number | null = null;
  let season: Record<number, number> | null = null;
  if (last) {
    const months = Array.from({ length: 13 }, (_, i) => addMonths(monthStart(last), -13 + i));
    const ranges = [{ from: addDays(last, -27), to: last }, ...months.map((m) => ({ from: m, to: monthEnd(m) }))];
    const vals = await prov.values(ctx.tenantId, ctx.clientId, info.key, ranges);
    actual = perMonth(vals[0], 28, info.summable);
    if (info.summable) season = seasonalIndex(months.slice(1).map((m, i) => ({ month: m, value: vals[i + 2] === null ? null : (vals[i + 2]! * 30) / (daysBetween(m, monthEnd(m)) + 1) })));
  }
  const res = objectiveHealth({ kind: 'kpi', baseline: o.baselineValue, target: o.targetValue, start: o.startDate, due: o.dueDate, curve: o.curve === 'lineal' ? 'lineal' : 's', lowerBetter: info.lowerBetter }, actual, ctx.today, { onTrackPct: ctx.settings.onTrackPct, atRiskPct: ctx.settings.atRiskPct, graceDays: ctx.settings.graceDays }, season);
  return { info, actual, ...res };
}

export async function runObjetivos(ctx: Ctx): Promise<ProcessOutcome> {
  const list = (await listObjectives(ctx.tenantId, ctx.clientId)).filter((o) => o.status === 'activo');
  if (!list.length) return { status: 'omitido', summary: 'El cliente no tiene objetivos activos.' };
  const counts: Partial<Record<Health, number>> = {};
  const worse: string[] = [];
  const good: string[] = [];
  const alertReasons: string[] = [];
  for (const o of list) {
    const r = await evaluateObjective(ctx, o);
    counts[r.health] = (counts[r.health] ?? 0) + 1;
    const before = (o.lastHealth ?? 'en_camino') as Health;
    if (HEALTH_RANK[r.health] > HEALTH_RANK[before] && ['en_riesgo', 'desviado', 'vencido'].includes(r.health)) worse.push(`• ${esc(o.title)}: ${HEALTH_LABEL[before].toLowerCase()} → <b>${HEALTH_LABEL[r.health].toLowerCase()}</b>${r.note ? ` (${esc(r.note)})` : ''}`);
    if (r.health === 'desviado' && before !== 'desviado') alertReasons.push(`objetivo desviado: ${o.title}`);
    if (r.health === 'logrado' && o.lastHealth !== 'logrado') good.push(`• ${esc(o.title)}`);
    await updateObjectiveHealth(o.id, r.health, r.actual);
  }
  if (ctx.settings.alertsEnabled && worse.length) await notify(ctx, `est:objetivos:${ctx.clientId}:${ctx.today}`, `📉 <b>${esc(ctx.clientName)}</b>: objetivos que empeoran\n${worse.join('\n')}`);
  if (ctx.settings.alertsEnabled && good.length) await notify(ctx, `est:logrado:${ctx.clientId}:${ctx.today}`, `🎉 <b>${esc(ctx.clientName)}</b>: objetivo alcanzado\n${good.join('\n')}\nCiérralo en su pestaña Estrategia cuando quieras.`);
  // Un objetivo que pasa a desviado despierta al estratega (si el plan lo incluye y no se ha pasado del tope del mes).
  if (alertReasons.length) await import('@/lib/estrategia/strategist').then((m) => m.maybeAlertAnalysis(ctx, alertReasons.join('; ').slice(0, 300))).catch((e) => console.error('[estrategia] análisis por alerta:', e instanceof Error ? e.message : e));
  return { status: worse.length ? 'aviso' : 'ok', summary: Object.entries(counts).map(([h, n]) => `${HEALTH_LABEL[h as Health].toLowerCase()}: ${n}`).join(' · ') };
}

// --- Guardián (cada 3 días) -----------------------------------------------------------------------------------------

export async function runGuardian(ctx: Ctx): Promise<ProcessOutcome> {
  const signals: Signal[] = [];
  if (isOn(ctx, 'objetivos')) {
    const objs = await listObjectives(ctx.tenantId, ctx.clientId);
    const active = objs.filter((o) => o.status === 'activo');
    if (!active.length) signals.push({ kind: 'guardian', key: 'guardian:sin_objetivos', severity: 'aviso', title: 'No tiene objetivos activos', detail: 'Su plan incluye objetivos: créalos en la pestaña Estrategia («Proponer objetivos» calcula metas a partir de sus datos).', evidence: {} });
    for (const o of active.filter((x) => x.dueDate < ctx.today)) signals.push({ kind: 'guardian', key: `guardian:vencido:${o.id}`, severity: 'aviso', title: `Objetivo con la fecha pasada: «${o.title}»`, detail: 'Ciérralo como logrado o no logrado, o amplía la fecha.', evidence: { objectiveId: o.id } });
  }
  const w = await workSource()?.workload(ctx.tenantId, ctx.clientId).catch(() => null);
  if (w) {
    if (w.upcoming === 0 && (w.horizonDays ?? 0) > 0) signals.push({ kind: 'guardian', key: 'guardian:sin_trabajo', severity: 'aviso', title: `Sin encargos planificados para los próximos ${w.horizonDays} días`, detail: `Encargos abiertos: ${w.openTasks}.`, evidence: { openTasks: w.openTasks, horizonDays: w.horizonDays } });
    if (w.monthlyHours && w.monthlyHours > 0 && w.hoursMonth !== null) {
      const day = Number(ctx.today.slice(8, 10));
      const dim = daysBetween(monthStart(ctx.today), monthEnd(ctx.today)) + 1;
      const expected = (w.monthlyHours * day) / dim;
      if (w.hoursMonth > w.monthlyHours * 1.1) signals.push({ kind: 'guardian', key: `guardian:horas_excedidas:${ctx.today.slice(0, 7)}`, severity: 'aviso', title: `Horas del mes excedidas: ${w.hoursMonth} de ${w.monthlyHours} h contratadas`, detail: 'Revisa el alcance o habla con el cliente.', evidence: { hoursMonth: w.hoursMonth, monthlyHours: w.monthlyHours } });
      else if (day >= 12 && w.hoursMonth < expected * 0.5) signals.push({ kind: 'guardian', key: `guardian:horas_bajas:${ctx.today.slice(0, 7)}`, severity: 'info', title: `Pocas horas este mes: ${w.hoursMonth} h de ${w.monthlyHours} (a estas alturas tocarían unas ${Math.round(expected)})`, detail: 'Puede que falte planificar trabajo.', evidence: { hoursMonth: w.hoursMonth, monthlyHours: w.monthlyHours, expected } });
    }
  }
  const fresh = await upsertSignals(ctx.tenantId, ctx.clientId, ['guardian'], signals);
  await notifySignals(ctx, 'guardian', fresh);
  return { status: signals.some((s) => s.severity === 'aviso') ? 'aviso' : 'ok', summary: signals.length ? signals.map((s) => s.title).join(' · ').slice(0, 500) : 'Todo en orden: objetivos, trabajo planificado y horas.' };
}

// --- Extracción de datos de los encargos terminados (por evento) ---------------------------------------------------

const EXTRACT_PROMPT = 'est_task_extract';
const EXTRACT_MODEL = 'claude-haiku-5-5';

/** Gasto de IA del módulo este mes (dólares estimados de las llamadas «est_*»). */
export async function aiSpentThisMonth(tenantId: string, now = new Date()): Promise<number> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [r] = await db
    .select({ usd: sql<string>`coalesce(sum(${aiJobs.estimatedCost}), 0)` })
    .from(aiJobs)
    .where(and(eq(aiJobs.tenantId, tenantId), like(aiJobs.function, 'est_%'), gte(aiJobs.createdAt, start)));
  return Number(r?.usd ?? 0);
}

async function extract(ctx: { tenantId: string; clientName: string; domains: string[] }, item: WorkItem, aiAllowed: boolean) {
  const text = `${item.title}\n${item.description}\n${item.doneNote}`;
  if (aiAllowed) {
    const prompt = await getPrompt(EXTRACT_PROMPT);
    if (prompt) {
      try {
        const vals: Record<string, string> = {
          cliente: ctx.clientName,
          dominios: ctx.domains.join(', ') || '(sin web en la ficha)',
          titulo: `<<<DATO NO FIABLE ${item.title.slice(0, 500)} FIN>>>`,
          descripcion: `<<<DATO NO FIABLE\n${item.description.slice(0, 4000)}\nFIN>>>`,
          nota: `<<<DATO NO FIABLE\n${item.doneNote.slice(0, 2000)}\nFIN>>>`
        };
        // Una sola pasada y sin patrones «$»: un texto del encargo no puede colarse en otro hueco de la plantilla.
        const fill = (t: string) => t.replace(/\{(cliente|dominios|titulo|descripcion|nota)\}/g, (_m, k: string) => vals[k] ?? '');
        const res = await callAI({ tenantId: ctx.tenantId, function: 'est_task_extract', promptKey: EXTRACT_PROMPT, model: EXTRACT_MODEL, maxTokens: 400, messages: [{ role: 'system', content: prompt.system_prompt }, { role: 'user', content: fill(prompt.user_prompt_template) }] });
        const parsed = cleanExtraction(extractJsonFromLLMResponse(res.content), ctx.domains);
        // Las URLs escritas en el encargo cuentan aunque la IA no las devuelva.
        const written = cleanExtraction({ urls: text.match(URL_RE) ?? [] }, ctx.domains).urls;
        const urls = [...new Set([...parsed.urls, ...written])].slice(0, 10);
        return { ...parsed, urls, needsUrl: parsed.needsUrl && !urls.length, extraction: 'ia' as const };
      } catch (e) {
        console.error('[estrategia] extracción con IA:', e instanceof Error ? e.message : e);
      }
    }
  }
  return { ...ruleExtraction(text, ctx.domains), extraction: 'reglas' as const };
}

/**
 * Encargos de clientes terminados desde la última pasada: se guardan sus datos (tipo, URLs, palabras, KPIs, horas), se
 * empieza a seguir cada URL trabajada y, si falta la URL de un trabajo sobre una página, se pregunta a quien lo hizo.
 * Solo para clientes cuyo plan tiene la extracción activada (y que no están en pausa).
 */
export async function runExtraction(tenantId: string, now = new Date()): Promise<number> {
  const ws = workSource();
  if (!ws) return 0;
  const settings = await getSettings(tenantId);
  const since = settings.state.lastExtractAt ? new Date(settings.state.lastExtractAt) : new Date(now.getTime() - 14 * 86_400_000);
  const { items, cursor } = await ws.completedSince(tenantId, since, 40);
  if (!cursor) return 0;
  const aiAllowed = (await aiSpentThisMonth(tenantId, now)) < Number(settings.aiMonthlyCapUsd);
  const ctxCache = new Map<string, Ctx | null>();
  let done = 0;
  const strategist = await import('@/lib/estrategia/strategist');
  for (const item of items) {
    // Un encargo nacido de una propuesta del estratega cuenta para su tasa de ejecución.
    await strategist.markSuggestionExecuted(tenantId, item.ref).catch(() => undefined);
    if (!ctxCache.has(item.clientId)) ctxCache.set(item.clientId, await loadCtx(tenantId, item.clientId, now));
    const ctx = ctxCache.get(item.clientId);
    const today = madridNow(now).date;
    const paused = ctx && (await clientEffective(tenantId, item.clientId))?.settings.pausedUntil;
    if (!ctx || !isOn(ctx, 'extraccion') || (paused && paused >= today)) continue;
    if (await getWorkFact(tenantId, item.taskId)) continue;
    const ex = await extract(ctx, item, aiAllowed);
    const doneOn = madridNow(new Date(item.doneAt)).date;
    // Solo se pregunta por encargos recientes (de las últimas 48 h): de lo antiguo nadie se acuerda y sería ruido.
    const askable = ex.needsUrl && settings.askUrl && isOn(ctx, 'urls') && now.getTime() - Date.parse(item.doneAt) < 48 * 3_600_000;
    const id = await insertWorkFact({
      tenantId,
      clientId: item.clientId,
      taskId: item.taskId,
      title: item.title.slice(0, 500),
      category: ex.category,
      urls: ex.urls,
      keywords: ex.keywords,
      kpis: ex.kpis,
      hours: item.minutes !== null ? (item.minutes / 60).toFixed(2) : null,
      doneOn,
      needsUrl: ex.needsUrl,
      urlStatus: ex.needsUrl ? (askable ? 'preguntada' : 'falta') : 'no_aplica',
      urlAskedAt: askable ? now : null,
      extraction: ex.extraction
    });
    if (!id) continue;
    done++;
    if (isOn(ctx, 'urls') && ctx.gsc) {
      for (const u of ex.urls) if (urlInProperty(u, ctx.gsc.property)) await trackUrl(tenantId, item.clientId, { url: u, property: ctx.gsc.property, reason: `${WORK_CATEGORY_LABEL[ex.category]}: ${item.title}`, workFactId: id, changedOn: doneOn, trackDays: settings.trackDays });
    }
    if (askable) {
      const ok = await ws.askAboutTask(tenantId, item.ref, 'url', `🔗 <b>${esc(ctx.clientName)}</b>: ¿en qué URL se ha hecho este trabajo?\nAsí mediremos su efecto en Google. Pulsa «Escribir» y pega la dirección (o «No aplica»).`).catch(() => false);
      if (!ok) await updateWorkFact(id, { urlStatus: 'falta', urlAskedAt: null });
    }
  }
  // El cursor avanza con la última fila leída aunque fuese de un cliente sin ficha: así nunca se atasca.
  await patchSettingsState(tenantId, { lastExtractAt: new Date(Date.parse(cursor) + 1).toISOString() });
  return done;
}

/**
 * «Procesar encargos anteriores» (pestaña): los encargos terminados del cliente en los últimos N días que aún no se
 * procesaron (p. ej. de antes de activar el plan). No pregunta a nadie: la URL que falte se puede poner a mano.
 */
export async function backfillClientWork(tenantId: string, clientId: string, days = 90): Promise<number> {
  const ws = workSource();
  const ctx = await loadCtx(tenantId, clientId);
  if (!ws || !ctx) return 0;
  const settings = await getSettings(tenantId);
  const aiAllowed = (await aiSpentThisMonth(tenantId)) < Number(settings.aiMonthlyCapUsd);
  let done = 0;
  for (const item of await ws.clientCompleted(tenantId, clientId, days)) {
    if (await getWorkFact(tenantId, item.taskId)) continue;
    const ex = await extract(ctx, item, aiAllowed);
    const doneOn = madridNow(new Date(item.doneAt)).date;
    const id = await insertWorkFact({ tenantId, clientId, taskId: item.taskId, title: item.title.slice(0, 500), category: ex.category, urls: ex.urls, keywords: ex.keywords, kpis: ex.kpis, hours: item.minutes !== null ? (item.minutes / 60).toFixed(2) : null, doneOn, needsUrl: ex.needsUrl, urlStatus: ex.needsUrl ? 'falta' : 'no_aplica', extraction: ex.extraction });
    if (!id) continue;
    done++;
    if (isOn(ctx, 'urls') && ctx.gsc) for (const u of ex.urls) if (urlInProperty(u, ctx.gsc.property)) await trackUrl(tenantId, clientId, { url: u, property: ctx.gsc.property, reason: `${WORK_CATEGORY_LABEL[ex.category]}: ${item.title}`, workFactId: id, changedOn: doneOn, trackDays: settings.trackDays });
  }
  return done;
}

/** Respuesta a «¿en qué URL…?» (llega por Operaciones). Acepta una o varias URLs, o una ruta del dominio del cliente. */
/** Respuesta a «¿en qué URL…?» con resultado: ok = se guardó una URL válida del cliente (o «no aplica»). */
export async function answerUrl(tenantId: string, taskId: string, answer: string | null): Promise<{ ok: boolean; message: string }> {
  const fact = await getWorkFact(tenantId, taskId);
  if (!fact) return { ok: false, message: 'Esa pregunta ya no está activa.' };
  if (answer === null) {
    await updateWorkFact(fact.id, { urlStatus: 'no_aplica' });
    return { ok: true, message: 'Anotado: no aplica a una página concreta.' };
  }
  const ctx = await loadCtx(tenantId, fact.clientId);
  const home = ctx?.homes[0] ?? null;
  // Sin web en la ficha no se puede saber qué URLs son del cliente: no se acepta ninguna.
  if (!home || !ctx?.domains.length) return { ok: false, message: 'Este cliente no tiene su web en la ficha (Webs y cuentas): añádela y vuelve a intentarlo.' };
  // Rutas del dominio del cliente («/blog/x»), nunca «//otro-dominio».
  const paths = answer.split(/\s+/).filter((w) => /^\/(?!\/)\S*$/.test(w)).map((p) => new URL(p, home).toString());
  const urls = cleanExtraction({ urls: [...(answer.match(URL_RE) ?? []), ...paths] }, ctx.domains).urls;
  if (!urls.length) return { ok: false, message: `No veo una dirección de ${hostOf(home)}. Pega la URL completa (o la ruta, como /blog/articulo).` };
  await updateWorkFact(fact.id, { urls: [...new Set([...fact.urls, ...urls])], urlStatus: 'respondida', needsUrl: false });
  const settings = await getSettings(tenantId);
  let tracked = 0;
  if (ctx.gsc) {
    for (const u of urls) {
      if (!urlInProperty(u, ctx.gsc.property)) continue;
      await trackUrl(tenantId, fact.clientId, { url: u, property: ctx.gsc.property, reason: `${WORK_CATEGORY_LABEL[fact.category as keyof typeof WORK_CATEGORY_LABEL] ?? 'Trabajo'}: ${fact.title}`, workFactId: fact.id, changedOn: fact.doneOn, trackDays: settings.trackDays });
      tracked++;
    }
  }
  return { ok: true, message: tracked ? `Gracias. Desde hoy sigo ${tracked === 1 ? 'esa página' : `esas ${tracked} páginas`} en Google para medir el efecto del trabajo (desde el ${fmtDayYear(fact.doneOn)}).` : 'Gracias, anotado.' };
}

/** Lo mismo para el bot de Telegram (solo la frase). Si no vale, pide volver a pulsar «Escribir». */
export async function answerUrlQuestion(tenantId: string, taskId: string, answer: string | null): Promise<string> {
  const r = await answerUrl(tenantId, taskId, answer);
  return r.ok ? r.message : `${r.message} Pulsa otra vez «Escribir» en la pregunta.`;
}

