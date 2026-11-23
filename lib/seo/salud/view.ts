import 'server-only';

// SEO · Salud técnica: datos de la pantalla del proyecto (Hito 1, 23 nov 2026). Solo lectura, sin llamadas externas:
// lo que pinta sale de la base (rastreo, hallazgos, propiedades de Search Console y ficha del cliente).
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientAssets, clientLocations, clients, jobs, projectAssets, projects } from '@/lib/db/schema';
import { listFindings, openFindingCounts, type Severity } from '@/lib/core/findings';
import { gscPropertiesForProject } from '@/lib/core/gsc';
import { latestProjectCrawl, projectWebUrl, SALUD_SOURCE } from '@/lib/seo/salud/audit';
import { buildJsonLd, type JsonLdOutput } from '@/lib/seo/salud/jsonld';
import { isBusinessType } from '@/lib/core/business-types';
import { LOCAL_SOURCE } from '@/lib/seo/local/rules';

const SOCIAL_KINDS = ['instagram', 'meta', 'linkedin', 'youtube', 'tiktok'];

export type SaludFinding = {
  id: string;
  kind: string;
  severity: Severity;
  status: string;
  url: string | null;
  metric: string | null;
  value: number | null;
  evidence: Record<string, unknown>;
  firstSeen: string;
  dismissReason: string | null;
};

export type SaludView = {
  project: { id: string; name: string; clientId: string | null; clientName: string | null };
  /** Tipo de negocio usado en el JSON-LD y el guardado en la ficha del cliente (null = sin elegir). */
  businessType: string;
  savedBusinessType: string | null;
  web: string | null;
  crawl: { id: string; status: string; pagesDone: number; maxPages: number; createdAt: string; finishedAt: string | null; error: string | null } | null;
  /** La auditoría (o el plan que va detrás) está en la cola o en marcha. */
  auditPending: boolean;
  /** Si el último trabajo de auditoría de este rastreo falló, su error (para decirlo en la pantalla). */
  auditError: string | null;
  counts: Record<Severity, number>;
  open: SaludFinding[];
  decided: SaludFinding[];
  gsc: { siteUrl: string; status: string; firstDate: string | null; lastDate: string | null; lastError: string | null }[];
  jsonld: JsonLdOutput;
};

const toFinding = (f: Awaited<ReturnType<typeof listFindings>>[number]): SaludFinding => ({
  id: f.id,
  kind: f.kind,
  severity: f.severity as Severity,
  status: f.status,
  url: f.url,
  metric: f.metric,
  value: f.value,
  evidence: (f.evidence ?? {}) as Record<string, unknown>,
  firstSeen: f.firstSeen.toISOString(),
  dismissReason: f.dismissReason
});

/** «override» = tipo elegido solo para ver (lector o vista previa); si no, el de la ficha del cliente. */
export async function getSaludView(tenantId: string, projectId: string, override: string | null): Promise<SaludView | null> {
  const [p] = await db
    .select({ id: projects.id, name: projects.name, clientId: projects.clientId, clientName: clients.name })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1);
  if (!p) return null;

  const [web, crawl, counts, findingsAll, gscProps] = await Promise.all([
    projectWebUrl(tenantId, projectId),
    latestProjectCrawl(projectId),
    openFindingCounts(tenantId, projectId),
    listFindings(tenantId, projectId, { status: ['abierto', 'descartado', 'aceptado'], limit: 3000 }),
    gscPropertiesForProject(tenantId, projectId)
  ]);
  const mine = findingsAll.filter((f) => f.source === SALUD_SOURCE || f.source === LOCAL_SOURCE || f.source === 'seo.mapa:gsc');
  // Estado real de la auditoría en la cola (antes se suponían 4 minutos tras el rastreo).
  const queue = await db
    .select({ kind: jobs.kind, status: jobs.status, error: jobs.lastError, payload: jobs.payload })
    .from(jobs)
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.scopeId, projectId), inArray(jobs.kind, ['seo.salud.audit', 'seo.plan.regenerate'])))
    .orderBy(desc(jobs.createdAt))
    .limit(10);
  const auditPending = queue.some((j) => j.status === 'pendiente' || j.status === 'en_curso');
  const lastAudit = queue.find((j) => j.kind === 'seo.salud.audit' && (j.payload as { runId?: string } | null)?.runId === crawl?.id);
  const auditError = !auditPending && lastAudit?.status === 'fallido' ? (lastAudit.error ?? 'La auditoría falló') : null;

  // Datos de la ficha para el JSON-LD: el cliente, sus locales y los perfiles sociales del alcance (o de la ficha).
  let jsonld: JsonLdOutput = { blocks: [], missing: ['El proyecto no tiene cliente: edítalo y elige el cliente.'] };
  let savedBusinessType: string | null = null;
  let businessType = isBusinessType(override) ? override : 'LocalBusiness';
  if (p.clientId) {
    const [client] = await db.select().from(clients).where(and(eq(clients.id, p.clientId), eq(clients.tenantId, tenantId))).limit(1);
    savedBusinessType = client?.businessType ?? null;
    if (!isBusinessType(override) && isBusinessType(savedBusinessType)) businessType = savedBusinessType;
    const [locs, socials] = await Promise.all([
      db.select().from(clientLocations).where(and(eq(clientLocations.clientId, p.clientId), eq(clientLocations.tenantId, tenantId))).orderBy(asc(clientLocations.createdAt)),
      db
        .select({ value: clientAssets.value, inScope: projectAssets.projectId })
        .from(clientAssets)
        .leftJoin(projectAssets, and(eq(projectAssets.clientAssetId, clientAssets.id), eq(projectAssets.projectId, projectId)))
        .where(and(eq(clientAssets.clientId, p.clientId), eq(clientAssets.tenantId, tenantId), inArray(clientAssets.kind, SOCIAL_KINDS)))
    ]);
    if (client) {
      jsonld = buildJsonLd({
        client: { name: client.name, legalName: client.legalName, summary: client.summary, logoUrl: client.logoUrl },
        webUrl: web,
        businessType,
        locations: locs.map((l) => ({ name: l.name, address: l.address, city: l.city, postalCode: l.postalCode, region: l.region, country: l.country, phone: l.phone, isPrimary: l.isPrimary })),
        socials: socials.map((s) => s.value?.trim() ?? '').filter((v) => /^https?:\/\//i.test(v))
      });
    }
  }

  return {
    project: { id: p.id, name: p.name, clientId: p.clientId, clientName: p.clientName },
    businessType,
    savedBusinessType,
    web,
    crawl: crawl
      ? { id: crawl.id, status: crawl.status, pagesDone: crawl.pagesDone, maxPages: crawl.maxPages, createdAt: crawl.createdAt.toISOString(), finishedAt: crawl.finishedAt?.toISOString() ?? null, error: crawl.error }
      : null,
    auditPending,
    auditError,
    counts,
    open: mine.filter((f) => f.status === 'abierto').map(toFinding),
    decided: mine.filter((f) => f.status !== 'abierto').map(toFinding),
    gsc: gscProps.map((g) => ({ siteUrl: g.siteUrl, status: g.status, firstDate: g.firstDate, lastDate: g.lastDate, lastError: g.lastError })),
    jsonld
  };
}
