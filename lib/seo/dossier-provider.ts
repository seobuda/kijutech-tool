import 'server-only';

// SEO · Lo que el departamento SEO sabe de cada proyecto de un cliente, para el expediente del estratega (Hito 2, 24 nov
// 2026; docs/DISENO-TECNICO-HITO2.md §3). Se registra en el núcleo (registerProjectDossierProvider): Estrategia lo pide
// sin leer tablas de SEO. Resumen pequeño: hallazgos agrupados, propuestas pendientes del plan (para no proponer lo mismo
// ni pasarse de horas), temas del mapa de palabras y competencia confirmada.
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientCompetitors, findings, projects, seoPlanItems, seoTopics } from '@/lib/db/schema';
import type { ProjectDossierSection } from '@/lib/core/capabilities';
import { SALUD_KIND_BY_KEY } from '@/lib/seo/salud/kinds';

// Parte 0 (26 nov 2026): también la vigilancia continua, la velocidad real y los detectores (antes, Estrategia).
const SOURCES = ['seo.salud:rastreo', 'seo.local:nap', 'seo.mapa:gsc', 'seo.vigilancia:web', 'seo.velocidad:crux', 'seo.detectores:gsc', 'seo.salud:externos', 'seo.posiciones:serp', 'seo.local:ficha', 'seo.local:geogrid', 'seo.local:nap_antiguo', 'seo.salud:puertas'];

export async function seoProjectDossier(tenantId: string, clientId: string): Promise<ProjectDossierSection[]> {
  const ps = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.tenantId, tenantId), eq(projects.clientId, clientId), eq(projects.service, 'seo')));
  const out: ProjectDossierSection[] = [];
  for (const p of ps.slice(0, 5)) {
    const [byKind, plan, topics, comps] = await Promise.all([
      db
        .select({ kind: findings.kind, n: sql<number>`count(*)::int`, url: sql<string | null>`min(${findings.url})` })
        .from(findings)
        .where(and(eq(findings.projectId, p.id), eq(findings.status, 'abierto'), inArray(findings.source, SOURCES)))
        .groupBy(findings.kind)
        .orderBy(desc(sql`count(*)`))
        .limit(12),
      db
        .select({ title: seoPlanItems.title, hours: seoPlanItems.estHours, priority: seoPlanItems.priority, status: seoPlanItems.status })
        .from(seoPlanItems)
        .where(and(eq(seoPlanItems.projectId, p.id), inArray(seoPlanItems.status, ['pendiente', 'aprobada'])))
        .orderBy(seoPlanItems.priority)
        .limit(12),
      db
        .select({ name: seoTopics.name, url: seoTopics.url, metrics: seoTopics.metrics })
        .from(seoTopics)
        .where(and(eq(seoTopics.projectId, p.id), eq(seoTopics.status, 'activo')))
        .orderBy(desc(sql`(${seoTopics.metrics}->>'impresiones')::float`))
        .limit(15),
      db
        .select({ name: clientCompetitors.name, domain: clientCompetitors.domain })
        .from(clientCompetitors)
        .where(and(eq(clientCompetitors.clientId, clientId), eq(clientCompetitors.status, 'confirmado')))
        .limit(10)
    ]);
    if (!byKind.length && !plan.length && !topics.length) continue;
    const urls = [...byKind.map((k) => k.url), ...topics.map((t) => t.url)].filter((u): u is string => Boolean(u));
    const lines = [
      ...(byKind.length ? ['Hallazgos abiertos (Salud técnica, local y mapa de palabras):', ...byKind.map((k) => `- ${SALUD_KIND_BY_KEY.get(k.kind)?.title ?? k.kind}: ${k.n}${k.url ? ` (p. ej. ${k.url})` : ''}`)] : []),
      ...(plan.length
        ? ['Plan de mejora de SEO (ya propuesto o en curso: NO lo repitas; cuenta sus horas):', ...plan.map((i) => `- [${i.status}] ${i.title} · ${Number(i.hours)} h · prioridad ${i.priority}`)]
        : []),
      ...(topics.length
        ? [
            'Temas del mapa de palabras (90 días; «página nueva» = no hay página que lo cubra):',
            ...topics.map((t) => {
              const m = t.metrics as Record<string, number | null>;
              return `- ${t.name} · ${t.url ?? 'página nueva'} · ${m.clics ?? 0} clics, ${m.impresiones ?? 0} impresiones, posición ${m.posicion ?? '—'}${m.tendenciaPct != null ? `, ${m.tendenciaPct > 0 ? '+' : ''}${m.tendenciaPct} % clics en 28 días` : ''}`;
            })
          ]
        : []),
      ...(comps.length ? [`Competencia confirmada: ${comps.map((c) => c.domain ?? c.name).join(', ')}`] : [])
    ];
    out.push({ projectId: p.id, projectName: p.name, title: `SEO · proyecto «${p.name}»`, lines, urls, queries: topics.map((t) => t.name) });
  }
  return out;
}
