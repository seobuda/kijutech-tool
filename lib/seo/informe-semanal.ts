import 'server-only';

// SEO · Apartado del informe semanal (simulación del 27 nov, atasco 1): lo que nadie vería sin abrir cada proyecto. Por
// proyecto SEO con novedades: hallazgos críticos o importantes nuevos de la semana, caída de visitas abierta, propuestas
// del plan por aprobar y gasto en datos del mes. Sin novedades, una línea resumen. HTML de Telegram (escapado).
import { and, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { findings, projects, seoPlanItems } from '@/lib/db/schema';
import { dataBudgetUsd, dataSpentThisMonth } from '@/lib/seo/gasto';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function seoWeeklyLines(tenantId: string, from: string, to: string): Promise<string[] | null> {
  const list = await db.select({ id: projects.id, name: projects.name }).from(projects).where(and(eq(projects.tenantId, tenantId), eq(projects.service, 'seo'), isNotNull(projects.clientId), sql`${projects.status} <> 'archived'`));
  if (!list.length) return null;
  const ids = list.map((p) => p.id);
  const since = new Date(`${from}T00:00:00Z`);
  const until = new Date(`${to}T23:59:59Z`);
  const [fresh, drops, pending] = await Promise.all([
    db
      .select({ projectId: findings.projectId, severity: findings.severity, n: sql<number>`count(*)::int` })
      .from(findings)
      .where(and(eq(findings.tenantId, tenantId), inArray(findings.projectId, ids), eq(findings.status, 'abierto'), inArray(findings.severity, ['critico', 'importante']), gte(findings.firstSeen, since), lte(findings.firstSeen, until)))
      .groupBy(findings.projectId, findings.severity),
    db.select({ projectId: findings.projectId }).from(findings).where(and(eq(findings.tenantId, tenantId), inArray(findings.projectId, ids), eq(findings.status, 'abierto'), eq(findings.kind, 'seo.traffic_drop_diagnosed'))),
    db.select({ projectId: seoPlanItems.projectId, n: sql<number>`count(*)::int` }).from(seoPlanItems).where(and(eq(seoPlanItems.tenantId, tenantId), inArray(seoPlanItems.projectId, ids), eq(seoPlanItems.status, 'pendiente'))).groupBy(seoPlanItems.projectId)
  ]);
  const lines: string[] = [];
  let spentTotal = 0;
  for (const p of list) {
    const crit = fresh.filter((f) => f.projectId === p.id && f.severity === 'critico').reduce((s, f) => s + Number(f.n), 0);
    const imp = fresh.filter((f) => f.projectId === p.id && f.severity === 'importante').reduce((s, f) => s + Number(f.n), 0);
    const drop = drops.some((d) => d.projectId === p.id);
    const pend = Number(pending.find((x) => x.projectId === p.id)?.n ?? 0);
    spentTotal += await dataSpentThisMonth(p.id).catch(() => 0);
    const bits: string[] = [];
    if (crit) bits.push(`🚨 ${crit} crítico(s) nuevo(s)`);
    if (imp) bits.push(`${imp} importante(s) nuevo(s)`);
    if (drop) bits.push('📉 caída de visitas');
    if (pend) bits.push(`${pend} propuesta(s) por aprobar`);
    if (crit || imp || drop) lines.push(`• <b>${esc(p.name)}</b>: ${bits.join(' · ')}`);
  }
  const quiet = list.length - lines.length;
  if (quiet) lines.push(`${quiet} proyecto(s) sin novedades graves.`);
  lines.push(`Gasto en datos este mes: ${spentTotal.toFixed(2)} $ (tope ${await dataBudgetUsd().catch(() => 5)} $ por proyecto).`);
  return lines;
}
