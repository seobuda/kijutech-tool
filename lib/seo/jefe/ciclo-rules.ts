// SEO · Jefe SEO, D4: la estrategia del trimestre sale del plan de servicio aprobado, POR CÓDIGO (0 $). PURO.
// Directiva de IA (CLAUDE.md): la IA ya decidió qué se trabaja cada trimestre al hacer el plan (frentes con línea, parámetros
// y prioridad); traducir eso a un ciclo es ordenar, filtrar y comprobar horas, sin razonamiento nuevo. Una llamada a Opus
// por trimestre costaría dinero sin añadir criterio. Lo que no cabe o no se puede hacer queda apuntado con su motivo.
import { MAX_LINES, PLAYBOOKS, validateStrategy, type PlaybookKey } from '@/lib/seo/estrategia/playbooks';

export type PlanItemLite = { id: string; frenteKey: string; kind: string; playbook: string | null; params: Record<string, unknown>; title: string; fromQuarter: number; toQuarter: number; priority: number; sort: number };
export type DerivedLine = { playbook: PlaybookKey; params: Record<string, unknown>; masterItemId: string; frente: string; title: string };
export type DerivedCycle = { quarter: number; lines: DerivedLine[]; skipped: { title: string; frente: string; reason: string }[]; hours: number; available: number | null };

/** Días antes del final del ciclo activo en los que se propone el siguiente (docs/PLAN-SEO-JEFE.md, D4). */
export const PROPOSE_DAYS_BEFORE_END = 21;
export const CYCLE_MONTHS = 3;

const DAY = 86_400_000;
const utcDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);

/** Trimestre del plan (1, 2, …) en el que cae una fecha. Antes del inicio del plan, el 1. */
export function quarterAt(planStartsOn: string, date: Date): number {
  const s = utcDay(planStartsOn);
  const months = (date.getUTCFullYear() - s.getUTCFullYear()) * 12 + (date.getUTCMonth() - s.getUTCMonth()) - (date.getUTCDate() < s.getUTCDate() ? 1 : 0);
  return Math.max(1, Math.floor(Math.max(0, months) / 3) + 1);
}

/** Lunes en que empezaría el ciclo siguiente: el de después del final del activo o, sin ciclo activo, el de esta semana (o el próximo si hoy ya no es lunes). */
export function nextCycleStart(now: Date, activeEndsOn: string | null): Date {
  const base = activeEndsOn ? new Date(utcDay(activeEndsOn).getTime() + DAY) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (base.getUTCDay() + 6) % 7; // 0 = lunes
  return dow === 0 ? base : new Date(base.getTime() + (7 - dow) * DAY);
}

/** ¿Toca proponer ya el siguiente ciclo? Sin ciclo activo, sí; con uno activo, a 21 días o menos de su final. */
export function shouldProposeNext(now: Date, activeEndsOn: string | null): boolean {
  if (!activeEndsOn) return true;
  return utcDay(activeEndsOn).getTime() - now.getTime() <= PROPOSE_DAYS_BEFORE_END * DAY;
}

/**
 * Ciclo de un trimestre a partir de los frentes del plan: los que están vivos en ese trimestre y tienen línea, por prioridad,
 * sin repetir línea, como mucho 3 y solo si caben en las horas (el validador de siempre decide). Los frentes sin línea son
 * trabajo puntual (p. ej. lo básico de la ficha): no son ciclo, se apuntan para que se encarguen por el Plan de mejora.
 */
export function deriveCycle(
  items: PlanItemLite[],
  quarter: number,
  ctx: { eligible: PlaybookKey[]; monthlyHours: number | null; reservePct: number; services: string[]; months?: number }
): DerivedCycle {
  const months = ctx.months ?? CYCLE_MONTHS;
  const live = items.filter((i) => i.fromQuarter <= quarter && i.toQuarter >= quarter).sort((a, b) => a.priority - b.priority || a.sort - b.sort);
  const lines: DerivedLine[] = [];
  const skipped: DerivedCycle['skipped'] = [];
  let hours = 0;
  let available: number | null = null;
  for (const it of live) {
    const skip = (reason: string) => skipped.push({ title: it.title, frente: it.frenteKey, reason });
    if (!it.playbook) {
      skip('Trabajo puntual sin línea continua: se encarga desde el Plan de mejora o a mano.');
      continue;
    }
    const key = it.playbook as PlaybookKey;
    if (!(key in PLAYBOOKS) || key === 'cimientos') {
      skip('La línea no está en el catálogo.');
      continue;
    }
    const twin = lines.find((l) => l.playbook === key);
    if (twin) {
      skip(`Misma línea que «${twin.title}» (una línea por ciclo).`);
      continue;
    }
    if (!ctx.eligible.includes(key)) {
      skip('Esa línea no se puede hacer ahora en este proyecto (faltan datos o conexiones).');
      continue;
    }
    if (lines.length >= MAX_LINES) {
      skip(`Ya hay ${MAX_LINES} líneas en el ciclo (máximo).`);
      continue;
    }
    // El plan guarda parámetros propios (p. ej. «condicionado»): el validador los sanea al rango del catálogo.
    const { condicionado: _c, ...params } = it.params ?? {};
    const candidate = [...lines.map((l) => ({ playbook: l.playbook, params: l.params })), { playbook: key, params }];
    const v = validateStrategy(candidate, { eligible: ctx.eligible, months, monthlyHours: ctx.monthlyHours, reservePct: ctx.reservePct, services: ctx.services });
    if (!v.ok) {
      skip(v.errors.find((e) => /horas|h para estrategia/.test(e)) ? 'No cabe en las horas del trimestre (va en el siguiente o con menos ritmo).' : v.errors[0] ?? 'No pasa la validación.');
      continue;
    }
    const clean = v.lines[v.lines.length - 1];
    lines.push({ playbook: key, params: clean.params, masterItemId: it.id, frente: it.frenteKey, title: it.title });
    hours = v.hours;
    available = v.available;
  }
  return { quarter, lines, skipped, hours, available };
}
