import 'server-only';

// SEO · Salud técnica: la auditoría de un proyecto (Hito 1, 23 nov 2026). Encadena las piezas de la plataforma:
//   1. startProjectAudit: rastrea la web del alcance del proyecto (núcleo: crawler) y encola «seo.salud.audit»;
//   2. el trabajo espera a que el rastreo termine (se vuelve a encolar cada 2 min, sin tocar el núcleo);
//   3. aplica las reglas puras (audit-rules.ts) con el cruce de Search Console y guarda los hallazgos (núcleo: findings),
//      que se resuelven solos cuando dejan de aparecer.
// No usa IA: la IA llega después, para el juicio (prioridades y plan de mejora).
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientAssets, crawlPages, crawlRuns, projectAssets, projects, type CrawlRun } from '@/lib/db/schema';
import { enqueueJob, ensureSchedule, registerJobKind } from '@/lib/core/jobs';
import { inlinkCounts, startCrawl } from '@/lib/core/crawler';
import { registerFindingKind, syncFindings } from '@/lib/core/findings';
import { gscPropertiesForProject } from '@/lib/core/gsc';
import { auditCrawl, type AuditPage } from '@/lib/seo/salud/audit-rules';
import { SALUD_KINDS, SEO_KINDS } from '@/lib/seo/salud/kinds';

export const SALUD_SOURCE = 'seo.salud:rastreo';
const WAIT_MINUTES = 2;
const MAX_WAIT_HOURS = 8;

export class SaludError extends Error {
  constructor(public userMessage: string) {
    super(userMessage);
  }
}

/** La web del alcance del proyecto (la marcada como principal o la primera). */
export async function projectWebUrl(tenantId: string, projectId: string): Promise<string | null> {
  const rows = await db
    .select({ kind: clientAssets.kind, value: clientAssets.value, isPrimary: clientAssets.isPrimary })
    .from(projectAssets)
    .innerJoin(clientAssets, eq(clientAssets.id, projectAssets.clientAssetId))
    .where(and(eq(projectAssets.projectId, projectId), eq(clientAssets.tenantId, tenantId), inArray(clientAssets.kind, ['web', 'tienda', 'dominio'])));
  const sorted = rows.filter((r) => r.value?.trim()).sort((a, b) => Number(b.kind === 'web') - Number(a.kind === 'web') || Number(b.isPrimary) - Number(a.isPrimary));
  const v = sorted[0]?.value?.trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/** Último rastreo propio del proyecto, en cualquier estado (para la pantalla). */
export async function latestProjectCrawl(projectId: string): Promise<CrawlRun | null> {
  const [r] = await db.select().from(crawlRuns).where(and(eq(crawlRuns.projectId, projectId), eq(crawlRuns.target, 'propio'))).orderBy(desc(crawlRuns.createdAt)).limit(1);
  return r ?? null;
}

/** Lanza rastreo + auditoría. Si ya hay uno en marcha, no lanza otro. */
export async function startProjectAudit(tenantId: string, projectId: string, maxPages = 500): Promise<{ runId: string; already: boolean }> {
  const [project] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  if (!project) throw new SaludError('Proyecto no encontrado');
  const current = await latestProjectCrawl(projectId);
  if (current && (current.status === 'pendiente' || current.status === 'en_curso') && Date.now() - current.createdAt.getTime() < MAX_WAIT_HOURS * 3_600_000) {
    return { runId: current.id, already: true };
  }
  const web = await projectWebUrl(tenantId, projectId);
  if (!web) throw new SaludError('El proyecto no tiene web en su alcance: edita el proyecto y marca la web del cliente.');
  const runId = await startCrawl({ tenantId, projectId, rootUrl: web, target: 'propio', maxPages });
  // La vigilancia de novedades de Google (I+D) se da de alta con el primer uso de SEO en la cuenta.
  await ensureSchedule(tenantId, 'seo.id.watch', '', 180);
  await ensureSchedule(tenantId, 'seo.id.digest', '', 7 * 24 * 60, new Date(Date.now() + 3_600_000));
  await enqueueAuditWait(tenantId, projectId, runId, 0, 1);
  return { runId, already: false };
}

async function enqueueAuditWait(tenantId: string, projectId: string, runId: string, attempt: number, minutes = WAIT_MINUTES) {
  await enqueueJob({
    tenantId,
    kind: 'seo.salud.audit',
    payload: { projectId, runId, attempt },
    scopeType: 'proyecto',
    scopeId: projectId,
    priority: 6,
    runAt: new Date(Date.now() + minutes * 60_000),
    dedupeKey: `seo.salud.audit:${runId}:${attempt}`
  });
}

/** Páginas de Search Console con impresiones en los últimos 90 días (todas las propiedades del alcance). */
async function gscPagesForProject(tenantId: string, projectId: string): Promise<{ url: string; impressions: number; clicks: number }[]> {
  const props = await gscPropertiesForProject(tenantId, projectId);
  if (!props.length) return [];
  const ids = props.map((p) => p.id);
  const rows = (await db.execute(sql`
    SELECT p.url, sum(d.impressions)::int AS impressions, sum(d.clicks)::int AS clicks
    FROM gsc_daily d JOIN gsc_pages p ON p.id = d.page_id
    WHERE d.property_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) AND d.search_type = 1 AND d.date >= current_date - 90
    GROUP BY p.url ORDER BY 2 DESC LIMIT 5000`)) as unknown as { url: string; impressions: number; clicks: number }[];
  return rows.map((r) => ({ url: r.url, impressions: Number(r.impressions), clicks: Number(r.clicks) }));
}

/** Aplica las reglas a un rastreo terminado y pone al día los hallazgos del proyecto. */
export async function auditFinishedCrawl(tenantId: string, projectId: string, run: CrawlRun) {
  const pages = (await db.select().from(crawlPages).where(eq(crawlPages.runId, run.id))) as unknown as AuditPage[];
  const [inlinks, gscPages] = await Promise.all([inlinkCounts(run.id), gscPagesForProject(tenantId, projectId)]);
  const found = auditCrawl({ rootUrl: run.rootUrl, pages, inlinks, truncated: run.pagesDone >= run.maxPages, gscPages });
  // Todos los tipos de Salud: lo que ya no aparece se resuelve solo.
  const r = await syncFindings(tenantId, projectId, SALUD_SOURCE, found, SALUD_KINDS.map((k) => k.kind));
  return { pages: pages.length, gscPages: gscPages.length, ...r };
}

let registered = false;
/** Registra los tipos de hallazgo y el trabajo de la cola (lo llama lib/seo/register.ts desde wireApp). */
export function registerSaludAudit(): void {
  if (registered) return;
  registered = true;
  for (const k of SEO_KINDS) registerFindingKind({ kind: k.kind, title: k.title, explain: k.explain, severityDefault: k.severityDefault, ruleVersion: k.ruleVersion });
  registerJobKind({
    kind: 'seo.salud.audit',
    timeoutS: 300,
    maxConcurrent: 2,
    maxAttempts: 3,
    run: async (ctx, payload) => {
      const projectId = String(payload.projectId ?? '');
      const runId = String(payload.runId ?? '');
      const attempt = Number(payload.attempt ?? 0);
      const [run] = await db.select().from(crawlRuns).where(eq(crawlRuns.id, runId)).limit(1);
      if (!run) return { skipped: 'rastreo borrado' };
      if (run.status === 'error') throw new Error(`El rastreo falló: ${run.error ?? 'sin detalle'}`);
      if (run.status !== 'hecho') {
        if (attempt * WAIT_MINUTES >= MAX_WAIT_HOURS * 60) throw new Error('El rastreo no terminó a tiempo');
        await enqueueAuditWait(ctx.tenantId, projectId, runId, attempt + 1);
        return { waiting: true, pages: run.pagesDone };
      }
      const r = await auditFinishedCrawl(ctx.tenantId, projectId, run);
      // Tras la auditoría: rehacer el plan de mejora y poner al día el expediente (trabajos aparte de la cola).
      const base = { tenantId: ctx.tenantId, payload: { projectId }, scopeType: 'proyecto' as const, scopeId: projectId };
      await enqueueJob({ ...base, kind: 'seo.plan.regenerate', priority: 5, dedupeKey: `seo.plan:${projectId}` });
      await enqueueJob({ ...base, kind: 'seo.expediente.collect', priority: 6, dedupeKey: `seo.expediente:${projectId}` });
      return r;
    }
  });
}
