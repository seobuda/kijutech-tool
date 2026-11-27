import 'server-only';

// SEO · Local, tanda 5c: lo que enseña la pestaña Local de las citas (teléfonos antiguos publicados y directorios del
// sector para revisar a mano). Solo lectura.
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { findings, jobs } from '@/lib/db/schema';
import { NAP_SOURCE } from '@/lib/seo/local/citas-zonas-rules';

export type CitasView = {
  oldNap: { phone: string; urls: string[] }[];
  lastRunAt: string | null;
};

export async function getCitasView(tenantId: string, projectId: string): Promise<CitasView> {
  const open = await db
    .select({ evidence: findings.evidence })
    .from(findings)
    .where(and(eq(findings.tenantId, tenantId), eq(findings.projectId, projectId), eq(findings.source, NAP_SOURCE), eq(findings.status, 'abierto')));
  const [last] = await db
    .select({ at: jobs.finishedAt })
    .from(jobs)
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.kind, 'seo.nap'), eq(jobs.scopeId, projectId), eq(jobs.status, 'hecho')))
    .orderBy(desc(jobs.finishedAt))
    .limit(1);
  return {
    oldNap: open.map((f) => {
      const e = (f.evidence ?? {}) as { phone?: string; urls?: string[] };
      return { phone: e.phone ?? '', urls: (e.urls ?? []).filter((u) => /^https?:\/\//i.test(u)) };
    }),
    lastRunAt: last?.at ? last.at.toISOString() : null
  };
}
