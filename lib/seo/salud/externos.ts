import 'server-only';

// SEO · Salud técnica: enlaces rotos hacia otras webs (parte 1, técnico 2a, 26 nov 2026; docs/DISENO-SEO-PARTE1.md).
// Trabajo aparte de la auditoría («seo.salud.externos»), con su propia fuente y lista de tipos (EXTERNOS_KINDS), como pidió
// la auditoría Opus: así la auditoría no los resuelve y este trabajo no los reabre en bucle.
// - Solo webs públicas, conectando a la IP validada (publicFetch: sin DNS rebinding); HEAD y, si no lo admite, GET.
// - Como mucho 300 URLs por pasada, 4 a la vez y una por web de destino; primero las que ya tenían hallazgo abierto.
// - Roto = 404/410, o el dominio no existe (NXDOMAIN) en dos pasadas seguidas. 403/429/5xx/tiempo agotado = no se sabe:
//   lo que había se conserva. Lo que no se ha podido mirar en esta pasada, también.
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { crawlPages, findings } from '@/lib/db/schema';
import { registerJobKind, type JobContext } from '@/lib/core/jobs';
import { syncFindings } from '@/lib/core/findings';
import { fetchPublic } from '@/lib/core/net';
import { lookup as dnsLookup } from 'node:dns/promises';
import { checkOrder, classifyExternal, externalFindings, type ExternalCheck } from '@/lib/seo/salud/externos-rules';

export const EXTERNOS_SOURCE = 'seo.salud:externos';
const MAX_URLS = 300;
const CONCURRENCY = 4;
const BUDGET_MS = 200_000;
const UA = 'Mozilla/5.0 (compatible; KijutechBot/1.0; +https://kijutech.com)';

/** ¿El dominio no existe (NXDOMAIN)? Distinto de un fallo pasajero del DNS, que no dice nada. */
async function domainMissing(url: string): Promise<boolean> {
  try {
    await dnsLookup(new URL(url).hostname);
    return false;
  } catch (e) {
    return (e as NodeJS.ErrnoException)?.code === 'ENOTFOUND';
  }
}

async function checkUrl(url: string): Promise<ExternalCheck> {
  if (await domainMissing(url)) return classifyExternal(0, 'ENOTFOUND');
  const attempt = async (method: 'HEAD' | 'GET') => {
    const r = await fetchPublic(url, { method, headers: { 'User-Agent': UA, Accept: 'text/html,*/*;q=0.5' }, signal: AbortSignal.timeout(8_000) }, 5);
    if ('error' in r) return { status: 0, error: r.error };
    void r.res.body?.cancel().catch(() => undefined);
    return { status: r.res.status, error: null as string | null };
  };
  try {
    let r = await attempt('HEAD');
    // Algunos servidores responden mal a HEAD (403/405/501, e incluso 404): se confirma siempre con GET.
    if ([403, 404, 405, 410, 501].includes(r.status)) r = await attempt('GET');
    return classifyExternal(r.status, r.error);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
    return classifyExternal(0, code === 'ENOTFOUND' ? 'ENOTFOUND' : e instanceof Error ? e.message : 'error');
  }
}

export async function checkExternalLinks(ctx: Pick<JobContext, 'heartbeat' | 'signal'>, tenantId: string, projectId: string, runId: string) {
  const started = Date.now();
  if (!runId) return { skipped: 'sin rastreo' };
  const pages = await db.select({ url: crawlPages.url, facts: crawlPages.facts }).from(crawlPages).where(eq(crawlPages.runId, runId));
  // Rastreo borrado o vacío: no se toca nada (si no, se resolverían todos los hallazgos sin motivo).
  if (!pages.length) return { skipped: 'rastreo sin páginas' };
  // Cada URL externa con las páginas que la enlazan.
  const linkedFrom = new Map<string, string[]>();
  for (const p of pages) for (const e of p.facts?.ext ?? []) linkedFrom.set(e, [...(linkedFrom.get(e) ?? []), p.url]);
  const open = await db
    .select({ kind: findings.kind, dedupeKey: findings.dedupeKey, url: findings.url, value: findings.value, severity: findings.severity, evidence: findings.evidence })
    .from(findings)
    .where(and(eq(findings.projectId, projectId), eq(findings.source, EXTERNOS_SOURCE), eq(findings.status, 'abierto')));
  const openTargets = new Set(open.map((f) => String((f.evidence as { target?: string })?.target ?? '')));
  const order = checkOrder([...linkedFrom.keys()], openTargets, runId).slice(0, MAX_URLS);
  const results = new Map<string, ExternalCheck>();
  const busyHosts = new Set<string>();
  let i = 0;
  const worker = async () => {
    while (i < order.length && Date.now() - started < BUDGET_MS && !ctx.signal.aborted) {
      const url = order[i++];
      let host = '';
      try {
        host = new URL(url).hostname;
      } catch {
        continue;
      }
      // Una a la vez por web de destino: si está ocupada, se deja para el final de la cola.
      if (busyHosts.has(host)) {
        order.push(url);
        if (order.length > MAX_URLS * 3) break;
        await new Promise((r) => setTimeout(r, 200));
        await ctx.heartbeat();
        continue;
      }
      busyHosts.add(host);
      try {
        results.set(url, await checkUrl(url));
      } finally {
        busyHosts.delete(host);
      }
      if (results.size % 25 === 0) await ctx.heartbeat();
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const prevDns = new Set(open.filter((f) => (f.evidence as { dns?: boolean })?.dns).map((f) => String((f.evidence as { target?: string }).target)));
  const sync = externalFindings(results, linkedFrom, prevDns, open.map((f) => ({ kind: f.kind, dedupeKey: f.dedupeKey, url: f.url, value: f.value, severity: f.severity, evidence: (f.evidence ?? {}) as Record<string, unknown> })));
  const r = await syncFindings(tenantId, projectId, EXTERNOS_SOURCE, sync, ['seo.external_broken']);
  const broken = sync.filter((f) => results.has(String(f.evidence?.target))).length;
  return { externas: linkedFrom.size, comprobadas: results.size, rotas: broken, ...r };
}

let registered = false;
export function registerExternosJob(): void {
  if (registered) return;
  registered = true;
  registerJobKind({
    kind: 'seo.salud.externos',
    timeoutS: 300,
    maxConcurrent: 1,
    maxAttempts: 1,
    run: async (ctx, payload) => checkExternalLinks(ctx, ctx.tenantId, String(payload.projectId ?? ''), String(payload.runId ?? ''))
  });
}
