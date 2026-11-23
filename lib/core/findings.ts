import 'server-only';

// Núcleo: hallazgos tipados (cimientos, 23 nov 2026; docs/DISENO-TECNICO-CIMIENTOS.md §6).
// Un hallazgo es algo concreto que se ha detectado en un proyecto («a esta URL le falta el título»), con su tipo
// registrado, su gravedad, su URL o consulta, su cifra y su evidencia. Se puede consultar con SQL (a diferencia de un
// bloque JSON) y tiene ciclo de vida: cada ejecución actualiza lo que sigue apareciendo, lo que deja de aparecer se
// resuelve solo, y lo que alguien descartó no se reabre. Generaliza las «señales» de Estrategia.
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { findings, type Finding } from '@/lib/db/schema';
import { planFindingSync, type FindingInput } from '@/lib/core/findings-rules';

export type { FindingInput } from '@/lib/core/findings-rules';

export type Severity = 'info' | 'aviso' | 'importante' | 'critico';

export type FindingKind = {
  kind: string;
  title: string;
  /** Una frase: qué significa y por qué importa (la ve el equipo). */
  explain: string;
  severityDefault: Severity;
  /** Tema de la base de conocimiento con la explicación de formación («por qué importa esto»). */
  kbTopic?: string;
  ruleVersion?: number;
};

const G = globalThis as unknown as { __kijuFindingKinds?: Map<string, FindingKind> };

export function registerFindingKind(k: FindingKind): void {
  (G.__kijuFindingKinds ??= new Map()).set(k.kind, k);
}
export function findingKind(kind: string): FindingKind | null {
  return G.__kijuFindingKinds?.get(kind) ?? null;
}
export function findingKinds(): FindingKind[] {
  return [...(G.__kijuFindingKinds?.values() ?? [])];
}

/**
 * Pone al día los hallazgos de una fuente (p. ej. «crawl:propio») en un proyecto: crea los nuevos, actualiza los que
 * siguen y resuelve los de esa fuente que ya no aparecen. `kinds` limita qué tipos cubre esta ejecución (para no
 * resolver hallazgos de otra comprobación que no se ha ejecutado). Devuelve los recuentos.
 */
export async function syncFindings(
  tenantId: string,
  projectId: string,
  source: string,
  incoming: FindingInput[],
  kinds?: string[]
): Promise<{ created: number; updated: number; resolved: number }> {
  const unknown = incoming.filter((f) => !findingKind(f.kind)).map((f) => f.kind);
  if (unknown.length) throw new Error(`Tipos de hallazgo no registrados: ${[...new Set(unknown)].join(', ')}`);
  const coveredKinds = kinds ?? [...new Set(incoming.map((f) => f.kind))];
  const existing = coveredKinds.length
    ? await db
        .select({ id: findings.id, dedupeKey: findings.dedupeKey, status: findings.status, kind: findings.kind })
        .from(findings)
        .where(and(eq(findings.projectId, projectId), eq(findings.source, source), inArray(findings.kind, coveredKinds)))
    : [];
  const plan = planFindingSync(existing, incoming);
  const now = new Date();
  await db.transaction(async (tx) => {
    // Lo nuevo, por lotes (una auditoría puede traer miles).
    for (let i = 0; i < plan.insert.length; i += 500) {
      const batch = plan.insert.slice(i, i + 500).map((f) => {
        const k = findingKind(f.kind)!;
        return {
          tenantId,
          projectId,
          kind: f.kind,
          ruleVersion: k.ruleVersion ?? 1,
          severity: f.severity ?? k.severityDefault,
          dedupeKey: f.dedupeKey,
          url: f.url ?? null,
          query: f.query ?? null,
          metric: f.metric ?? null,
          value: f.value ?? null,
          evidence: f.evidence ?? {},
          source
        };
      });
      await tx.insert(findings).values(batch).onConflictDoNothing({ target: [findings.projectId, findings.dedupeKey] });
    }
    for (const u of plan.update) {
      const k = findingKind(u.input.kind)!;
      await tx
        .update(findings)
        .set({
          lastSeen: now,
          severity: u.input.severity ?? k.severityDefault,
          ruleVersion: k.ruleVersion ?? 1,
          url: u.input.url ?? null,
          query: u.input.query ?? null,
          metric: u.input.metric ?? null,
          value: u.input.value ?? null,
          evidence: u.input.evidence ?? {},
          // Un resuelto que vuelve a aparecer se reabre; un descartado o aceptado se queda como estaba.
          ...(u.reopen ? { status: 'abierto', resolvedAt: null } : {})
        })
        .where(eq(findings.id, u.id));
    }
    if (plan.resolve.length) {
      await tx.update(findings).set({ status: 'resuelto', resolvedAt: now }).where(inArray(findings.id, plan.resolve));
    }
  });
  return { created: plan.insert.length, updated: plan.update.length, resolved: plan.resolve.length };
}

export async function listFindings(
  tenantId: string,
  projectId: string,
  opts: { status?: Finding['status'][]; kind?: string; limit?: number } = {}
): Promise<Finding[]> {
  const conds = [eq(findings.tenantId, tenantId), eq(findings.projectId, projectId)];
  if (opts.status?.length) conds.push(inArray(findings.status, opts.status));
  if (opts.kind) conds.push(eq(findings.kind, opts.kind));
  return db
    .select()
    .from(findings)
    .where(and(...conds))
    .orderBy(sql`CASE ${findings.severity} WHEN 'critico' THEN 0 WHEN 'importante' THEN 1 WHEN 'aviso' THEN 2 ELSE 3 END`, desc(findings.lastSeen))
    .limit(Math.min(opts.limit ?? 500, 5000));
}

/** Recuento de abiertos por gravedad (semáforo del proyecto). */
export async function openFindingCounts(tenantId: string, projectId: string): Promise<Record<Severity, number>> {
  const rows = await db
    .select({ severity: findings.severity, n: sql<number>`count(*)::int` })
    .from(findings)
    .where(and(eq(findings.tenantId, tenantId), eq(findings.projectId, projectId), eq(findings.status, 'abierto')))
    .groupBy(findings.severity);
  const out: Record<Severity, number> = { info: 0, aviso: 0, importante: 0, critico: 0 };
  for (const r of rows) out[r.severity as Severity] = Number(r.n);
  return out;
}

/** Descartar (no es un problema) o aceptar (lo sabemos y lo dejamos así): no se reabre al volver a detectarse. */
export async function decideFinding(tenantId: string, id: string, status: 'descartado' | 'aceptado' | 'abierto', by: string, reason?: string): Promise<boolean> {
  const rows = await db
    .update(findings)
    .set({ status, dismissedBy: status === 'abierto' ? null : by.slice(0, 255), dismissReason: status === 'abierto' ? null : reason?.trim().slice(0, 1000) || null })
    .where(and(eq(findings.id, id), eq(findings.tenantId, tenantId)))
    .returning({ id: findings.id });
  return rows.length > 0;
}

/** Enlaza un hallazgo con el encargo que lo resuelve. */
export async function linkFindingToRequest(tenantId: string, id: string, requestId: string): Promise<void> {
  await db.update(findings).set({ requestId }).where(and(eq(findings.id, id), eq(findings.tenantId, tenantId)));
}
