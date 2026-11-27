// SEO · Jefe SEO, D6: cuándo proponer revisar el plan (versión n+1) y cuándo un responsable SEO humano puede aprobar los
// ciclos (autonomía graduada, decisión 3 de Enric en docs/PLAN-SEO-JEFE.md §8). PURO: tests/seo-jefe-d6.test.ts.
// Proponer la revisión no cuesta nada: la versión nueva (Opus) solo se genera si un administrador lo pide.

export type RevisionTrigger = { key: string; reason: string };

/** Días tras aprobar el plan en los que los datos «maduran» y conviene mirarlo de nuevo (plan §4, versionado). */
export const MATURITY_DAYS = [28, 90] as const;
/** Autonomía de los ciclos: al menos 10 propuestas decididas y más del 70 % aprobadas sin editar. */
export const AUTONOMY_MIN_DECIDED = 10;
export const AUTONOMY_MIN_RATE = 0.7;

const DAY = 86_400_000;

/**
 * Motivos para revisar el plan aprobado, del más urgente al menos: una actualización del núcleo de Google terminada después
 * de aprobarlo, una estrategia (ciclo) cerrada desde entonces y la madurez de los datos (28 y 90 días). Los ya tratados
 * (propuestos antes para este plan, decididos o no) no se repiten. Devuelve el primero pendiente o null.
 */
export function nextRevisionTrigger(i: {
  approvedAt: Date;
  now: Date;
  coreUpdatesEnded: { id: string; title: string; endsAt: Date }[];
  cyclesClosed: { id: string; name: string; closedAt: Date }[];
  handled: Set<string>;
}): RevisionTrigger | null {
  const out: RevisionTrigger[] = [];
  for (const u of [...i.coreUpdatesEnded].sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime()))
    if (u.endsAt > i.approvedAt && u.endsAt <= i.now) out.push({ key: `core:${u.id}`, reason: `Terminó una actualización de Google (${u.title.slice(0, 120)}) después de aprobar el plan: conviene ver si cambia algo.` });
  for (const c of [...i.cyclesClosed].sort((a, b) => b.closedAt.getTime() - a.closedAt.getTime()))
    if (c.closedAt > i.approvedAt && c.closedAt <= i.now) out.push({ key: `ciclo:${c.id}`, reason: `Se cerró la estrategia «${c.name.slice(0, 80)}»: es el momento de revisar el plan con lo aprendido.` });
  const days = (i.now.getTime() - i.approvedAt.getTime()) / DAY;
  for (const d of [...MATURITY_DAYS].reverse())
    if (days >= d) {
      out.push({ key: `dias:${d}`, reason: `Han pasado ${d} días desde que se aprobó el plan: hay datos nuevos de Search Console para comprobar si va por buen camino.` });
      break; // solo el hito más reciente (a los 90 días no tiene sentido proponer también el de 28)
    }
  return out.find((t) => !i.handled.has(t.key)) ?? null;
}

/** ¿Pueden aprobar los ciclos los editores (responsable SEO) además de los administradores? */
export function cycleAutonomy(decided: { status: string }[]): { decided: number; approved: number; rate: number | null; enabled: boolean; missing: number } {
  const last = decided.slice(0, 20); // las más recientes
  const n = last.length;
  const approved = last.filter((d) => d.status === 'aprobada').length;
  const rate = n ? approved / n : null;
  const enabled = n >= AUTONOMY_MIN_DECIDED && (rate ?? 0) > AUTONOMY_MIN_RATE;
  return { decided: n, approved, rate, enabled, missing: Math.max(0, AUTONOMY_MIN_DECIDED - n) };
}

/** Etiqueta honesta de una proporción: con pocos casos no se concluye nada. */
export function honestRate(k: number, n: number, min = 10): string {
  if (!n) return 'sin casos';
  const pct = Math.round((k / n) * 100);
  return n < min ? `${pct} % (${k} de ${n}: pocos casos, no concluyente)` : `${pct} % (${k} de ${n})`;
}
