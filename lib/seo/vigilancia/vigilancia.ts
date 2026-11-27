import 'server-only';

// SEO · Vigilancia continua por proyecto (parte 0, 26 nov 2026; docs/DISENO-SEO-PARTE0.md). Lo que antes hacía
// Estrategia por cliente (vigilancia crítica, salud semanal, velocidad y detectores), ahora por proyecto, en el
// trabajador (cola del núcleo) y como hallazgos del núcleo:
//   - seo.vigilancia (cada hora): portada caída o con error, noindex, robots.txt que bloquea todo y SSL. Si sale algo
//     crítico se vuelve a mirar a los 30 min (trabajo de confirmación con su propia clave) y solo entonces avisa.
//   - seo.auditoria (cada 30 días): rastreo completo + reglas (salud/audit.ts).
//   - seo.velocidad (cada 30 días): Core Web Vitals reales (Chrome UX Report, por el núcleo: speedSource).
//   - seo.detectores (cada 7 días): rehace el mapa de palabras (al alcance, CTR bajo, canibalización, temas sin página),
//     páginas que pierden clics (detalle de Search Console del núcleo, sin la API) e indexación de las más importantes.
// Las frecuencias se editan y se pausan por proyecto (pestaña Salud). Un proyecto SEO activo con web se da de alta solo.
import tls from 'node:tls';
import { randomUUID } from 'node:crypto';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { projects, seoSpeedChecks } from '@/lib/db/schema';
import { disableSchedule, enqueueJob, ensureScheduleIfMissing, listSchedulesForScope, pauseSchedule, registerJobKind, registerProcess, stableOffsetMinutes } from '@/lib/core/jobs';
import { emitProjectAlert, metricSources, registerScheduled, speedSource, telegramOutbound, type SpeedLab } from '@/lib/core/capabilities';
import { findingKind, listFindings, syncFindings } from '@/lib/core/findings';
import { fetchPublic, resolvesPublic } from '@/lib/core/net';
import { extractPage } from '@/lib/core/crawl-extract';
import { gscPropertiesForProject } from '@/lib/core/gsc';
import { projectWebUrl, SaludError, startProjectAudit } from '@/lib/seo/salud/audit';
import { enqueueKeywordMap } from '@/lib/seo/mapa/mapa';
import { runPositions } from '@/lib/seo/posiciones/posiciones';
import { runLocal } from '@/lib/seo/local/ficha';
import { runGeogrid } from '@/lib/seo/local/geogrid';
import { runNap } from '@/lib/seo/local/nap';
import {
  DETECTORES_SOURCE,
  SEO_PROCESSES,
  SEO_PROCESS_KEYS,
  VELOCIDAD_SOURCE,
  VIGILANCIA_SOURCE,
  LAB_KINDS,
  addDays,
  labFindings,
  labSyncSet,
  representativeUrls,
  pageDropFindings,
  shouldAlert,
  velocidadFindings,
  vigilanciaFindings,
  yoyAvailable,
  type CwvRow,
  type HomeCheck,
  type LabRow,
  type SeoProcessKey
} from '@/lib/seo/vigilancia/rules';

const VIGILANCIA_KINDS = ['seo.site_down', 'seo.home_error', 'seo.home_noindex', 'seo.robots_block_all', 'seo.ssl_expiring'];
const CONFIRM_KIND = 'seo.vigilancia.confirm';
const CONFIRM_MINUTES = 30;
const UA = 'Mozilla/5.0 (compatible; KijutechMonitor/1.0)';
const MAX_BYTES = 400_000;

type Outcome = { status: 'ok' | 'aviso' | 'omitido'; summary: string };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const BASE_URL = () => (process.env.BASE_URL || '').replace(/\/$/, '');

async function projectInfo(tenantId: string, projectId: string) {
  const [p] = await db
    .select({ id: projects.id, name: projects.name, clientId: projects.clientId, status: projects.status, service: projects.service })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1);
  return p ?? null;
}

// --- Comprobaciones de red (solo webs públicas) ----------------------------------------------------------------------

async function readLimited(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.length;
  }
  void reader.cancel().catch(() => undefined);
  return new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks));
}

async function checkHome(url: string): Promise<HomeCheck> {
  try {
    const r = await fetchPublic(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) });
    if ('error' in r) return { error: /no permitida/i.test(r.error) ? 'el dominio no resuelve (DNS) o no apunta a una dirección pública' : r.error };
    const xRobots = r.res.headers.get('x-robots-tag') ?? '';
    const type = r.res.headers.get('content-type') ?? '';
    let noindex = /noindex/i.test(xRobots);
    if (r.res.status < 300 && /html/i.test(type)) {
      const meta = extractPage(await readLimited(r.res), r.url).robotsMeta ?? '';
      noindex ||= /noindex/i.test(meta);
    } else void r.res.body?.cancel().catch(() => undefined);
    return { status: r.res.status, finalUrl: r.url, noindex };
  } catch (e) {
    return { error: e instanceof Error && e.name === 'TimeoutError' ? 'tardó más de 20 s en responder' : 'no responde' };
  }
}

async function fetchRobots(home: string): Promise<string | null> {
  try {
    const r = await fetchPublic(new URL('/robots.txt', home).toString(), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) });
    if ('error' in r || r.res.status !== 200) return null;
    return await readLimited(r.res);
  } catch {
    return null;
  }
}

/** Días que le quedan al certificado (negativo = caducado); null si no se puede saber. */
async function sslDaysLeft(home: string): Promise<number | null> {
  let host: string;
  try {
    const u = new URL(home);
    if (u.protocol !== 'https:') return null;
    host = u.hostname;
  } catch {
    return null;
  }
  if (!(await resolvesPublic(`https://${host}/`))) return null;
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: 10_000, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      const to = cert?.valid_to ? Date.parse(cert.valid_to) : NaN;
      resolve(Number.isFinite(to) ? Math.floor((to - Date.now()) / 86_400_000) : null);
    });
    socket.on('error', () => resolve(null));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });
  });
}

// --- Procesos --------------------------------------------------------------------------------------------------------

export async function runVigilancia(tenantId: string, projectId: string, confirmPass: boolean): Promise<Outcome> {
  const p = await projectInfo(tenantId, projectId);
  const home = p ? await projectWebUrl(tenantId, projectId) : null;
  if (!p || !home) return { status: 'omitido', summary: 'El proyecto no tiene web en su alcance.' };
  const [check, robots, ssl] = await Promise.all([checkHome(home), fetchRobots(home), sslDaysLeft(home)]);
  const found = vigilanciaFindings(home, check, robots, ssl);
  await syncFindings(tenantId, projectId, VIGILANCIA_SOURCE, found, VIGILANCIA_KINDS);
  const sev = (f: (typeof found)[number]) => f.severity ?? findingKind(f.kind)?.severityDefault ?? 'aviso';
  const critical = found.filter((f) => sev(f) === 'critico');
  if (critical.length && !confirmPass) {
    // Clave propia: la del proceso programado («sched:…») sigue abierta mientras corre este trabajo.
    await enqueueJob({ tenantId, kind: CONFIRM_KIND, payload: { projectId }, scopeType: 'proyecto', scopeId: projectId, priority: 2, runAt: new Date(Date.now() + CONFIRM_MINUTES * 60_000), dedupeKey: `${CONFIRM_KIND}:${projectId}` });
    return { status: 'aviso', summary: `Posible problema (${critical.map((f) => findingKind(f.kind)?.title ?? f.kind).join(', ')}): se vuelve a comprobar en ${CONFIRM_MINUTES} min antes de avisar.` };
  }
  if (shouldAlert(confirmPass, found, sev)) {
    const lines = critical.map((f) => `• ${esc(findingKind(f.kind)?.title ?? f.kind)}${'error' in check ? ` (${esc(check.error)})` : ''}`);
    const link = BASE_URL() ? `\n<a href="${BASE_URL()}/dashboard/projects/${projectId}/salud">Abrir la Salud del proyecto</a>` : '';
    // Día de Madrid: una caída que cruza la medianoche UTC no repite el aviso a la 1:00.
    const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
    await telegramOutbound()?.notifyOwner(tenantId, `seo.vigilancia:${projectId}:${day}:${critical.map((f) => f.kind).sort().join('|')}`, `🚨 <b>${esc(p.name)}</b>: problema en la web (confirmado)\n${lines.join('\n')}${link}`);
    if (p.clientId) await emitProjectAlert({ tenantId, clientId: p.clientId, projectId, title: `Web con problema crítico: ${critical.map((f) => findingKind(f.kind)?.title ?? f.kind).join(', ')}`.slice(0, 300), source: 'seo.vigilancia' });
  }
  return found.length ? { status: 'aviso', summary: found.map((f) => findingKind(f.kind)?.title ?? f.kind).join(' · ') } : { status: 'ok', summary: `Web correcta (${home}).` };
}

export async function runAuditoriaProgramada(tenantId: string, projectId: string): Promise<Outcome> {
  try {
    const r = await startProjectAudit(tenantId, projectId);
    return { status: 'ok', summary: r.already ? 'Ya había una auditoría en marcha.' : 'Auditoría lanzada (rastreo y reglas).' };
  } catch (e) {
    if (e instanceof SaludError) return { status: 'omitido', summary: e.userMessage };
    throw e;
  }
}

/** Páginas con más clics de las últimas 4 semanas (detalle del núcleo; una sola propiedad para no contar dos veces). */
async function mainProperty(tenantId: string, projectId: string) {
  const props = (await gscPropertiesForProject(tenantId, projectId)).filter((p) => p.status === 'activa' && p.lastDate);
  return props.sort((a, b) => Number(b.kind === 'dominio') - Number(a.kind === 'dominio'))[0] ?? null;
}

async function pageClicks(propertyId: number, from: string, to: string): Promise<Map<string, number>> {
  const rows = (await db.execute(sql`
    SELECT p.url AS url, sum(d.clicks)::int AS clicks
    FROM gsc_daily d JOIN gsc_pages p ON p.id = d.page_id
    WHERE d.property_id = ${propertyId} AND d.search_type = 1 AND d.date BETWEEN ${from}::date AND ${to}::date
    GROUP BY p.url`)) as unknown as { url: string; clicks: number }[];
  return new Map([...rows].map((r) => [r.url, Number(r.clicks)]));
}

async function topPages(tenantId: string, projectId: string, n: number): Promise<string[]> {
  const prop = await mainProperty(tenantId, projectId);
  if (!prop?.lastDate) return [];
  const m = await pageClicks(prop.id, addDays(prop.lastDate, -27), prop.lastDate);
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([u]) => u);
}

/** Guarda cada medición por página (la pantalla de Salud enseña la última y su evolución). */
async function saveSpeedChecks(tenantId: string, projectId: string, field: CwvRow[], lab: (LabRow & { metrics?: SpeedLab['metrics'] })[]): Promise<void> {
  if (!field.length && !lab.length) return;
  const runId = randomUUID();
  const values = [
    ...field.map((r) => ({ tenantId, projectId, runId, url: r.url, kind: 'campo', scope: r.scope, category: r.category, lcpMs: r.lcpMs, inpMs: r.inpMs, cls: r.cls })),
    ...lab.map((r) => ({
      tenantId,
      projectId,
      runId,
      url: r.url,
      kind: 'laboratorio',
      score: r.score,
      lcpMs: r.metrics?.lcpMs ?? null,
      cls: r.metrics?.cls ?? null,
      fcpMs: r.metrics?.fcpMs ?? null,
      tbtMs: r.metrics?.tbtMs ?? null,
      siMs: r.metrics?.siMs ?? null,
      data: { viewportOk: r.viewportOk, httpsOk: r.httpsOk, insecureRequests: r.insecureRequests.length, unsizedImages: r.unsizedImages, imageSavingsKb: r.imageSavingsKb, totalKb: r.totalKb, imagesKnown: r.imagesKnown }
    }))
  ];
  await db.insert(seoSpeedChecks).values(values);
}

export async function runVelocidad(tenantId: string, projectId: string, heartbeat: () => Promise<void> = async () => undefined): Promise<Outcome> {
  const src = speedSource();
  if (!src || !(await src.hasKey(tenantId))) return { status: 'omitido', summary: 'Falta la clave de PageSpeed / CrUX (Agentes → Integraciones).' };
  const home = await projectWebUrl(tenantId, projectId);
  if (!home) return { status: 'omitido', summary: 'El proyecto no tiene web en su alcance.' };
  const top = await topPages(tenantId, projectId, 30).catch(() => [] as string[]);
  const urls = [...new Set([home, ...top.slice(0, 3)])].slice(0, 4);
  const rows: CwvRow[] = [];
  for (const url of urls) {
    const f = await src.field(tenantId, url);
    if (f) rows.push({ url, ...f });
  }
  const found = velocidadFindings(rows);
  // Parte 1: prueba de laboratorio (Lighthouse en Google) de hasta 5 páginas representativas: viewport, contenido
  // mixto e imágenes. Si una página no se deja medir, se omite; si no se pudo medir ninguna, sus hallazgos no se tocan.
  const labRows: (LabRow & { metrics?: SpeedLab['metrics'] })[] = [];
  let labTried = 0;
  let labOpen: Parameters<typeof labSyncSet>[2] = [];
  if (src.lab) {
    const openLab = await listFindings(tenantId, projectId, { status: ['abierto'] }).then((fs) => fs.filter((f) => f.source === VELOCIDAD_SOURCE && LAB_KINDS.includes(f.kind)));
    labOpen = openLab.map((f) => ({ kind: f.kind, dedupeKey: f.dedupeKey, url: f.url, value: f.value, evidence: (f.evidence ?? {}) as Record<string, unknown> }));
    for (const url of representativeUrls(home, top, 5, [...new Set(openLab.map((f) => f.url).filter((u): u is string => Boolean(u)))])) {
      labTried++;
      await heartbeat();
      const r = await src.lab(tenantId, url).catch((e) => {
        console.error('[seo] laboratorio de velocidad:', e instanceof Error ? e.message : e);
        return null;
      });
      if (r) labRows.push({ url, ...r });
    }
  }
  const lab = labFindings(labRows);
  await saveSpeedChecks(tenantId, projectId, rows, labRows).catch((e) => console.error('[seo] guardar mediciones de velocidad:', e instanceof Error ? e.message : e));
  // Solo se resuelve lo de las páginas medidas; lo de las que fallaron (o no se midieron) se conserva tal cual.
  // Si Lighthouse no trajo auditorías de imágenes, los hallazgos de imágenes tampoco se tocan.
  const imagesKnown = labRows.some((r) => r.imagesKnown);
  const measured = new Set(labRows.map((r) => r.url));
  const labKinds = labRows.length ? LAB_KINDS.filter((k) => imagesKnown || !k.startsWith('seo.images_')) : [];
  const labSet = labSyncSet(lab, measured, labOpen.filter((f) => labKinds.includes(f.kind)));
  await syncFindings(tenantId, projectId, VELOCIDAD_SOURCE, [...found, ...labSet], ['seo.cwv_slow', 'seo.cwv_average', ...labKinds]);
  const labText = labTried ? ` Laboratorio: ${labRows.length} de ${labTried} página(s) medida(s)${lab.length ? `, ${lab.length} problema(s)` : ''}${labRows.length && !imagesKnown ? '; Lighthouse no trajo las auditorías de imágenes (no se juzgan)' : ''}.` : '';
  if (!rows.length) return { status: lab.length ? 'aviso' : 'ok', summary: `Google aún no tiene datos reales de velocidad de esta web (poco tráfico de Chrome).${labText}` };
  return { status: found.some((f) => f.kind === 'seo.cwv_slow') || lab.length ? 'aviso' : 'ok', summary: `${rows.length} página(s) medida(s) con datos reales: ${found.length ? `${found.length} con velocidad mejorable o lenta` : 'velocidad correcta'}.${labText}` };
}

export async function runDetectores(tenantId: string, projectId: string): Promise<Outcome> {
  const parts: string[] = [];
  const prop = await mainProperty(tenantId, projectId);
  const found: Parameters<typeof syncFindings>[3] = [];
  if (prop?.lastDate) {
    // El mapa de palabras trae al alcance, CTR bajo, canibalización y temas sin página: se rehace (trabajo propio).
    await enqueueKeywordMap(tenantId, projectId);
    parts.push('mapa de palabras encolado');
    const to = prop.lastDate;
    const cur = { from: addDays(to, -27), to };
    const prev = { from: addDays(to, -55), to: addDays(to, -28) };
    const [c, pv] = await Promise.all([pageClicks(prop.id, cur.from, cur.to), pageClicks(prop.id, prev.from, prev.to)]);
    // El año anterior solo si el histórico llega; si no, no se afirma nada de la temporada.
    const yoy = yoyAvailable(prop.firstDate, addDays(prev.from, -364))
      ? { cur: await pageClicks(prop.id, addDays(cur.from, -364), addDays(cur.to, -364)), prev: await pageClicks(prop.id, addDays(prev.from, -364), addDays(prev.to, -364)) }
      : null;
    const drops = pageDropFindings(c, pv, yoy);
    found.push(...drops);
    parts.push(`${drops.length} página(s) perdiendo clics${yoy ? '' : ' (sin año anterior para comparar temporada)'}`);
    // Indexación de la portada y las páginas con más clics (cuota de Google: pocas por pasada).
    const src = metricSources().find((s) => s.inspectUrl && s.kinds.some((k) => k.source === 'gsc'));
    if (src?.inspectUrl && (await src.isConnected(tenantId).catch(() => false))) {
      const home = await projectWebUrl(tenantId, projectId);
      const urls = [...new Set([...(home ? [home] : []), ...[...c].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([u]) => u)])].slice(0, 8);
      let inspected = 0;
      for (const u of urls) {
        const r = await src.inspectUrl(tenantId, 'gsc', prop.siteUrl, u).catch(() => null);
        if (!r) continue;
        inspected++;
        if (r.verdict && r.verdict !== 'PASS') found.push({ kind: 'seo.not_indexed', dedupeKey: `seo.not_indexed:${u}`, url: u, evidence: { verdict: r.verdict, coverage: r.coverage, robots: r.robots, canonical: r.canonical, lastCrawl: r.lastCrawl } });
      }
      parts.push(`${inspected} página(s) inspeccionada(s) en Search Console`);
    }
    await syncFindings(tenantId, projectId, DETECTORES_SOURCE, found, ['seo.page_drop', 'seo.not_indexed']);
  } else parts.push('sin Search Console asignado o sin datos descargados');
  return { status: found.length ? 'aviso' : 'ok', summary: parts.join(' · ') };
}

// --- Alta de los procesos de cada proyecto ----------------------------------------------------------------------------

/**
 * Da de alta los procesos de un proyecto SEO activo con web (sin tocar la frecuencia ni la pausa que alguien haya
 * cambiado) o los apaga si está archivado o sin web. La primera ejecución se reparte por proyecto.
 */
export async function ensureProjectSchedules(tenantId: string, project: { id: string; status: string }): Promise<boolean> {
  const web = project.status !== 'archived' ? await projectWebUrl(tenantId, project.id) : null;
  const existing = new Map((await listSchedulesForScope(tenantId, project.id)).map((r) => [r.processKey, r]));
  for (const key of SEO_PROCESS_KEYS) {
    const row = existing.get(key);
    if (!web) {
      if (row?.enabled) await disableSchedule(tenantId, key, project.id, true);
      continue;
    }
    const every = SEO_PROCESSES[key].every;
    // Primera ejecución repartida dentro de su frecuencia (como mucho un día de espera).
    const offset = stableOffsetMinutes(`${key}:${project.id}`, Math.min(every, 1440));
    if (!row) await ensureScheduleIfMissing(tenantId, key, project.id, every, new Date(Date.now() + offset * 60_000));
    // Solo se vuelve a encender lo que apagó el propio sistema (proyecto archivado o sin web). Lo que apagó o pausó
    // una persona no se toca.
    else if (!row.enabled && row.lastStatus === 'apagado') await pauseSchedule(tenantId, key, project.id, { enabled: true });
  }
  return Boolean(web);
}

/** Todos los proyectos SEO de la cuenta (lo llama el planificador una vez por hora). */
export async function syncProjectSchedules(tenantId: string): Promise<{ active: number; disabled: number }> {
  const list = await db
    .select({ id: projects.id, status: projects.status })
    .from(projects)
    .where(and(eq(projects.tenantId, tenantId), eq(projects.service, 'seo'), isNotNull(projects.clientId)));
  let active = 0;
  for (const p of list) if (await ensureProjectSchedules(tenantId, p)) active++;
  return { active, disabled: list.length - active };
}

let registered = false;
const G = globalThis as unknown as { __kijuSeoSchedSync?: Map<string, number> };

export function registerVigilancia(): void {
  if (registered) return;
  registered = true;
  const run = (key: SeoProcessKey, fn: (tenantId: string, projectId: string, heartbeat: () => Promise<void>) => Promise<Outcome>, timeoutS: number) => {
    registerJobKind({ kind: key, timeoutS, maxConcurrent: key === 'seo.vigilancia' ? 4 : 2, maxAttempts: 2, run: async (ctx, payload) => fn(ctx.tenantId, String(payload.projectId ?? ''), ctx.heartbeat) });
    registerProcess({ key, scopeType: 'proyecto', label: `SEO: ${SEO_PROCESSES[key].label}`, defaultEveryMinutes: SEO_PROCESSES[key].every, enqueue: (_t, scopeId) => ({ kind: key, payload: { projectId: scopeId }, priority: key === 'seo.vigilancia' ? 3 : 7 }) });
  };
  run('seo.vigilancia', (t, p) => runVigilancia(t, p, false), 120);
  run('seo.auditoria', runAuditoriaProgramada, 60);
  run('seo.velocidad', runVelocidad, 600);
  run('seo.detectores', runDetectores, 240);
  run('seo.posiciones', runPositions, 300);
  run('seo.local', (t, p) => runLocal(t, p, false), 300);
  run('seo.geogrid', (t, p) => runGeogrid(t, p), 300);
  run('seo.nap', runNap, 180);
  registerJobKind({ kind: CONFIRM_KIND, timeoutS: 120, maxConcurrent: 4, maxAttempts: 2, run: async (ctx, payload) => runVigilancia(ctx.tenantId, String(payload.projectId ?? ''), true) });
  // Alta de los procesos de los proyectos: como mucho una vez cada hora por cuenta.
  registerScheduled('seo: programar la vigilancia de los proyectos', async (tenantId) => {
    const hour = Math.floor(Date.now() / 3_600_000);
    const seen = (G.__kijuSeoSchedSync ??= new Map());
    if (seen.get(tenantId) === hour) return;
    seen.set(tenantId, hour);
    await syncProjectSchedules(tenantId);
  });
}
