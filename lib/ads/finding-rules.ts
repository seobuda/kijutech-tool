// Módulo Google Ads · reglas puras de los hallazgos del paso 2 (sin base de datos ni red; pruebas en tests/ads-hallazgos.test.ts).
// Diseño: docs/ads/DISENO-TECNICO-ADS.md v2 §6 (lista cerrada, precedencia, ciclo de vida, avisos) y §7 (Cartera,
// objetivo provisional). Investigación: 5.1 (medición rota con binomial negativa), 7.1-7.4 (hallazgos, tope de atención,
// silencios y respuestas).
//
// Cada regla recibe la foto de UNA cuenta (lo que findings.ts lee de las tablas ads_*) y devuelve «ok», «hallazgo» o
// «no_comprobado». Antes de evaluarla, `gateRule` mira que sus fuentes estén sanas (MED-00) y su ventana de días cubierta
// (cero frente a «sin dato», §3.1): si no, la regla NO afirma nada. Todo va en la moneda de la cuenta.
import { addDays, CORE_SOURCES, daysBetween, SOURCE_LABEL, type AdsSource, type SourceHealth } from '@/lib/ads/rules';

// --- Tipos ------------------------------------------------------------------------------------------------------------

export type FindingKind =
  | 'fuente_sin_datos'
  | 'cuenta_no_sirve'
  | 'campana_parada_desbocada'
  | 'landing_caida'
  | 'rechazo_con_gasto'
  | 'medicion_rota'
  | 'ritmo_gasto'
  | 'pausado_aportaba'
  | 'cambio_ajeno';

/** Número de la lista cerrada (investigación 7.1) y texto corto para la pantalla. */
export const KIND_INFO: Record<FindingKind, { n: number; label: string }> = {
  cuenta_no_sirve: { n: 1, label: 'La cuenta no puede servir' },
  rechazo_con_gasto: { n: 2, label: 'Anuncio rechazado con gasto' },
  landing_caida: { n: 3, label: 'Página de destino caída con gasto' },
  campana_parada_desbocada: { n: 4, label: 'Campaña parada o gasto desbocado' },
  pausado_aportaba: { n: 6, label: 'Algo pausado que aportaba leads' },
  ritmo_gasto: { n: 8, label: 'Ritmo de gasto fuera de banda' },
  cambio_ajeno: { n: 11, label: 'Cambio ajeno en algo con gasto' },
  medicion_rota: { n: 12, label: 'Medición rota' },
  fuente_sin_datos: { n: 15, label: 'Nuestra fuente está sin datos' }
};

/** Precedencia de causas (§6.2): 15 > 1 > 4 > 3 > 2 > 12 > 8 / 6 / 11. Menor número = manda más. */
export const PRECEDENCE: Record<FindingKind, number> = {
  fuente_sin_datos: 0,
  cuenta_no_sirve: 1,
  campana_parada_desbocada: 2,
  landing_caida: 3,
  rechazo_con_gasto: 4,
  medicion_rota: 5,
  ritmo_gasto: 6,
  pausado_aportaba: 6,
  cambio_ajeno: 6
};

export type Outcome = 'ok' | 'hallazgo' | 'no_comprobado';
export type Channel = 'interrupcion' | 'parte';
export type Severity = 'alta' | 'media' | 'baja';

export type FindingDraft = {
  kind: FindingKind;
  scope: 'cuenta' | 'campana' | 'agencia';
  campaignNativeId: string | null;
  causeKey: string;
  channel: Channel;
  recipient: 'gestor' | 'tecnico';
  severity: Severity;
  /** «Para que lo sepas» (no pide decisión): cuenta en el corte de 3, no en el de 5. */
  fyi: boolean;
  title: string;
  /** Líneas legibles de evidencia (la pantalla las enseña tal cual) y datos en bruto. */
  lines: string[];
  data: Record<string, unknown>;
  exposure: number | null;
  confidence: 'alta' | 'media' | 'baja';
};

/**
 * `uncheckedCauses`: causas que esta vez no se pudieron comprobar dentro de una regla que sí se evaluó (p. ej. una acción
 * con clics fuera de banda): su hallazgo vivo no se resuelve, queda «sin comprobar desde…» (revisor, 28 nov).
 */
export type RuleResult = { outcome: Outcome; reason: string | null; findings: FindingDraft[]; dataThrough: string | null; uncheckedCauses?: string[] };

export type ScheduleSlot = { day: string; startHour: number; startMinute: number; endHour: number; endMinute: number };
export type CampaignIn = {
  nativeId: string;
  name: string | null;
  status: string | null;
  servingStatus: string | null;
  channelType: string | null;
  budgetNativeId: string | null;
  startDate: string | null;
  endDate: string | null;
  adSchedule: ScheduleSlot[] | null;
};
export type BudgetIn = { nativeId: string; amount: number | null; period: string | null; status: string | null };
export type DailyIn = { campaignNativeId: string; day: string; cost: number; impressions: number; clicks: number; conversions: number };
export type HourlyIn = { campaignNativeId: string; day: string; hour: number; impressions: number; clicks: number; cost: number; conversions: number };
export type PolicyIn = { campaignNativeId: string | null; adGroupNativeId: string; name: string | null; status: string | null; entityKind: string; adsTotal: number; adsApproved: number; adsDisapproved: number; keywordsDisapproved: number };
export type LandingIn = { url: string; urlNormalized: string; cost7d: number; clicks7d: number; lastCheckAt: Date | null; lastCheckStatus: string | null; lastCheckOk: boolean | null; consecutiveFailures: number; campaignNativeIds: string[] };
export type ChangeIn = { changeAt: Date; userEmail: string | null; actorClass: string; clientType: string | null; resourceType: string | null; campaignNativeId: string | null; operation: string | null; changedFields: string[]; newValue: Record<string, unknown> | null };
export type ConversionIn = { conversionAction: string; day: string; conversionsByConvDate: number };
export type ActionIn = { resourceName: string; name: string | null; primaryForGoal: boolean | null; includeInConversions: boolean | null; status: string | null };
export type GoalIn = { kind: 'provisional' | 'acordado'; cplMax: number | null; budgetUsual: number | null } | null;

export { DEFAULT_THRESHOLDS, mergeThresholds, THRESHOLD_LIMITS, type Thresholds } from '@/lib/ads/thresholds';
import type { Thresholds } from '@/lib/ads/thresholds';

/** Foto de una cuenta para evaluar sus reglas. */
export type AccountInput = {
  accountId: string;
  name: string;
  status: string | null;
  currency: string | null;
  /** Fecha, hora (0-23) y día de la semana (0 = domingo) de ahora en la zona de la cuenta. */
  today: string;
  hour: number;
  now: Date;
  campaigns: CampaignIn[];
  budgets: BudgetIn[];
  /** Filas diarias de campaña (sin fila = 0 SOLO si el día está en `covered`). */
  daily: DailyIn[];
  covered: Set<string>;
  /** Filas horarias de hoy y de las 4 semanas anteriores; `hourlyDays`: días con latido guardado. */
  hourly: HourlyIn[];
  hourlyDays: Set<string>;
  /** Última hora completa de hoy cuyo dato horario se da por bueno (latido con su retraso); null = no hay. */
  hourlyThrough: number | null;
  policies: PolicyIn[];
  landing: LandingIn[];
  changes: ChangeIn[];
  conversions: ConversionIn[];
  actions: ActionIn[];
  goal: GoalIn;
  health: Partial<Record<AdsSource, SourceHealth>>;
  /** Lo que hay que saber de las fuentes para la regla 15 (con su última vez bien y su error). */
  sourceDetail?: Partial<Record<AdsSource, { lastOkAt: string | null; lastError: string | null; critical: boolean }>>;
  /** Desde cuándo se ve la cuenta (una recién dada de alta aún no tiene datos: no es «fuente caída»). */
  firstSeenAt?: Date | null;
  /** Paso 3 (EST-06): controles de la auditoría de higiene que reaparecieron hace poco, con el autor del cambio que lo explica. */
  auditRegressions?: { control: string; title: string; actor: string | null; at: Date }[];
  t: Thresholds;
};

// --- Definición de cada regla: fuentes, ventana y cadencia -------------------------------------------------------------

export type Cadence = 'horaria' | 'diaria';
export type RuleDef = { kind: FindingKind; sources: AdsSource[]; windowDays: number; cadence: Cadence; run: (a: AccountInput) => RuleResult };

/**
 * Comprobación previa (MED-00): fuentes sanas y ventana de días cubierta, que termina ayer. Si algo falla, la regla dice
 * «no comprobado» con el motivo y no afirma nada (ni hallazgo ni «todo bien»).
 */
export function gateRule(def: Pick<RuleDef, 'sources' | 'windowDays'>, health: Partial<Record<AdsSource, SourceHealth>>, covered: Set<string>, today: string): { ok: true } | { ok: false; reason: string } {
  for (const s of def.sources) {
    const h = health[s] ?? 'sin_datos';
    if (h !== 'sana') return { ok: false, reason: `${SOURCE_LABEL[s]}: ${h === 'sin_datos' ? 'sin datos' : h === 'caida' ? 'caída' : 'atrasada'}` };
  }
  if (def.windowDays > 0) {
    const missing: string[] = [];
    for (let i = def.windowDays; i >= 1; i--) {
      const d = addDays(today, -i);
      if (!covered.has(d)) missing.push(d);
    }
    if (missing.length) return { ok: false, reason: `faltan días completos (${missing.length}): ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}` };
  }
  return { ok: true };
}

// --- Utilidades -------------------------------------------------------------------------------------------------------

const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
export function weekdayOf(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

/** ¿Sirve la campaña en esa hora de ese día de la semana según su programación? Sin programación: siempre. */
export function servesAt(slots: ScheduleSlot[] | null | undefined, weekday: number, hour: number): boolean {
  if (!slots || !slots.length) return true;
  const name = DAY_NAMES[weekday];
  // Una hora cuenta si el tramo la cubre entera o en parte (de 9:30 a 10:00 sirve «a las 9»).
  return slots.some((s) => s.day === name && hour * 60 + 59 >= s.startHour * 60 + s.startMinute && hour * 60 < s.endHour * 60 + s.endMinute);
}

/** ¿Sirve en algún momento ese día de la semana? */
export function servesOnDay(slots: ScheduleSlot[] | null | undefined, weekday: number): boolean {
  for (let h = 0; h < 24; h++) if (servesAt(slots, weekday, h)) return true;
  return false;
}

/** Las últimas `n` horas programadas de hoy hasta `through` (incluida). Menos de `n` si no hay tantas. */
export function lastServiceHours(slots: ScheduleSlot[] | null | undefined, weekday: number, through: number, n: number): number[] {
  const out: number[] = [];
  for (let h = through; h >= 0 && out.length < n; h--) if (servesAt(slots, weekday, h)) out.push(h);
  return out.reverse();
}

/** Campaña activa ese día: habilitada (hoy), empezada y sin terminar. */
export function campaignActiveOn(c: CampaignIn, day: string): boolean {
  if (c.status !== 'ENABLED') return false;
  if (c.startDate && c.startDate > day) return false;
  if (c.endDate && c.endDate < day) return false;
  return true;
}

/** Valor de un día: la fila si existe; 0 si el día está cubierto (la API no da fila sin impresiones); null si no se sabe. */
export function dayValue(rows: Map<string, DailyIn>, covered: Set<string>, campaignNativeId: string, day: string, field: 'cost' | 'impressions' | 'clicks' | 'conversions'): number | null {
  const r = rows.get(`${campaignNativeId}|${day}`);
  if (r) return r[field];
  return covered.has(day) ? 0 : null;
}

const dailyIndex = (daily: DailyIn[]) => new Map(daily.map((d) => [`${d.campaignNativeId}|${d.day}`, d]));
const round2 = (v: number) => Math.round(v * 100) / 100;
export function money(v: number, currency: string | null): string {
  try {
    return v.toLocaleString('es-ES', { style: 'currency', currency: currency || 'EUR', maximumFractionDigits: v >= 100 ? 0 : 2 });
  } catch {
    return `${v.toFixed(2)} ${currency ?? ''}`.trim();
  }
}
const cname = (c: CampaignIn | undefined, id: string | null) => (c?.name ? `«${c.name}»` : id ? `la campaña ${id}` : 'la cuenta');

function sumCost(daily: DailyIn[], from: string, to: string, filter?: (d: DailyIn) => boolean): number {
  let s = 0;
  for (const d of daily) if (d.day >= from && d.day <= to && (!filter || filter(d))) s += d.cost;
  return round2(s);
}

/** Gasto de cada campaña en los `days` días que terminan ayer. */
function costByCampaign(daily: DailyIn[], today: string, days: number): Map<string, number> {
  const from = addDays(today, -days);
  const to = addDays(today, -1);
  const m = new Map<string, number>();
  for (const d of daily) if (d.day >= from && d.day <= to) m.set(d.campaignNativeId, (m.get(d.campaignNativeId) ?? 0) + d.cost);
  return m;
}

/** Suma horaria de una campaña (o de todas si `campaign` es null) en un día y unas horas. */
function hourSum(hourly: HourlyIn[], day: string, hours: number[], campaign: string | null, field: 'impressions' | 'cost' | 'conversions' | 'clicks'): number {
  const set = new Set(hours);
  let s = 0;
  for (const h of hourly) if (h.day === day && set.has(h.hour) && (campaign === null || h.campaignNativeId === campaign)) s += h[field];
  return s;
}

/** Mismo día de la semana de las 4 semanas anteriores con latido guardado. */
function refWeeks(a: AccountInput): string[] {
  return [7, 14, 21, 28].map((n) => addDays(a.today, -n)).filter((d) => a.hourlyDays.has(d));
}

const draft = (d: Omit<FindingDraft, 'fyi' | 'recipient' | 'confidence'> & Partial<Pick<FindingDraft, 'fyi' | 'recipient' | 'confidence'>>): FindingDraft => ({ fyi: false, recipient: 'gestor', confidence: 'alta', ...d });

// --- Binomial negativa (regla 12, 5.1) ---------------------------------------------------------------------------------

/** P(0) de una binomial negativa de media μ y dispersión k: (k / (k + μ))^k. Con k → ∞ tiende a la de Poisson e^−μ. */
export function nbZeroProbability(mu: number, k: number): number {
  if (mu <= 0) return 1;
  if (!Number.isFinite(k) || k <= 0) return Math.exp(-mu);
  return Math.pow(k / (k + mu), k);
}

export const K_MAX = 50;

/**
 * Dispersión k por momentos con la esperanza de cada día (clics × tasa): 1/k = Σ((x − e)² − x) / Σ e². Si no hay más
 * variación que la de Poisson, k = K_MAX. Con menos de 28 días con esperanza, k por defecto (5.1: «k = 2 si no hay datos»).
 */
export function estimateK(days: { x: number; e: number }[], fallback: number): number {
  const useful = days.filter((d) => d.e > 0);
  if (useful.length < 28) return fallback;
  let num = 0;
  let den = 0;
  for (const d of useful) {
    num += (d.x - d.e) ** 2 - d.x;
    den += d.e ** 2;
  }
  if (den <= 0) return fallback;
  const inv = num / den;
  if (inv <= 1 / K_MAX) return K_MAX;
  return Math.max(0.5, Math.min(K_MAX, 1 / inv));
}

// --- Regla 15: nuestra fuente sin datos (MED-00) ------------------------------------------------------------------------

export function ruleSourceHealth(a: AccountInput): RuleResult {
  // «Sin datos» en una cuenta vista hace menos de 24 h es que está arrancando (sus primeros trabajos aún no terminaron).
  const starting = Boolean(a.firstSeenAt && a.now.getTime() - a.firstSeenAt.getTime() < 24 * 3_600_000);
  const bad = CORE_SOURCES.filter((s) => {
    const h = a.health[s] ?? 'sin_datos';
    return h !== 'sana' && !(h === 'sin_datos' && starting);
  });
  const critical = CORE_SOURCES.filter((s) => a.sourceDetail?.[s]?.critical);
  if (!bad.length && !critical.length) return { outcome: 'ok', reason: null, findings: [], dataThrough: a.today };
  const lines = [...new Set([...bad, ...critical])].map((s) => {
    const d = a.sourceDetail?.[s];
    const h = a.health[s] ?? 'sin_datos';
    return `${SOURCE_LABEL[s]}: ${h === 'sin_datos' ? 'sin datos' : h === 'caida' ? 'caída' : h === 'atrasada' ? 'atrasada' : 'al día'}${d?.lastOkAt ? ` (último dato bueno ${d.lastOkAt.slice(0, 16).replace('T', ' ')} UTC)` : ''}${d?.critical ? ' — más de 7 días: pasados 30 se pierde el historial' : ''}${d?.lastError ? ` · ${d.lastError.slice(0, 160)}` : ''}`;
  });
  return {
    outcome: 'hallazgo',
    reason: null,
    dataThrough: a.today,
    findings: [
      draft({
        kind: 'fuente_sin_datos',
        scope: 'cuenta',
        campaignNativeId: null,
        causeKey: `fuente:${a.accountId}`,
        channel: 'interrupcion',
        recipient: 'tecnico',
        severity: 'alta',
        title: `Sin datos al día de ${a.name}: no se puede vigilar`,
        lines: [...lines, 'Mientras tanto, las reglas de esta cuenta dicen «no comprobado» en vez de «todo bien».'],
        data: { sources: bad },
        exposure: null
      })
    ]
  };
}

// --- Regla 1: la cuenta no puede servir --------------------------------------------------------------------------------

const BAD_ACCOUNT = new Set(['SUSPENDED', 'CANCELED', 'CLOSED']);

export function ruleAccountCannotServe(a: AccountInput): RuleResult {
  if (a.status && BAD_ACCOUNT.has(a.status)) {
    return {
      outcome: 'hallazgo',
      reason: null,
      dataThrough: a.today,
      findings: [
        draft({ kind: 'cuenta_no_sirve', scope: 'cuenta', campaignNativeId: null, causeKey: `cuenta:${a.accountId}:estado`, channel: 'interrupcion', severity: 'alta', title: `${a.name}: la cuenta está ${a.status === 'SUSPENDED' ? 'suspendida' : a.status === 'CANCELED' ? 'cancelada' : 'cerrada'} y no puede publicar anuncios`, lines: [`Estado de la cuenta en Google Ads: ${a.status}.`, 'Revisa en Google Ads el motivo (pago, verificación o política).'], data: { status: a.status }, exposure: null })
      ]
    };
  }
  const active = a.campaigns.filter((c) => campaignActiveOn(c, a.today));
  if (!active.length) return { outcome: 'ok', reason: 'sin campañas activas', findings: [], dataThrough: a.today };
  if (active.every((c) => c.servingStatus === 'SUSPENDED')) {
    return {
      outcome: 'hallazgo',
      reason: null,
      dataThrough: a.today,
      findings: [draft({ kind: 'cuenta_no_sirve', scope: 'cuenta', campaignNativeId: null, causeKey: `cuenta:${a.accountId}:suspendidas`, channel: 'interrupcion', severity: 'alta', title: `${a.name}: todas las campañas activas están suspendidas`, lines: [`${active.length} campaña(s) activas con estado de publicación «suspendida».`], data: { campaigns: active.map((c) => c.nativeId) }, exposure: null })]
    };
  }
  // (b) Cero impresiones en las últimas 3 horas de servicio de toda la cuenta, cuando el mismo tramo solía tener ≥ N.
  if (a.hourlyThrough === null) return { outcome: 'ok', reason: 'sin latido de hoy todavía: solo se comprobó el estado', findings: [], dataThrough: a.today };
  const wd = weekdayOf(a.today);
  const hours: number[] = [];
  for (let h = a.hourlyThrough; h >= 0 && hours.length < 3; h--) if (active.some((c) => servesAt(c.adSchedule, wd, h))) hours.push(h);
  hours.reverse();
  const refs = refWeeks(a);
  if (hours.length < 3 || refs.length < 2) return { outcome: 'ok', reason: hours.length < 3 ? 'aún no hay 3 horas de servicio hoy' : 'sin 2 semanas de horas de referencia: solo se comprobó el estado', findings: [], dataThrough: a.today };
  const todayImpr = hourSum(a.hourly, a.today, hours, null, 'impressions');
  const base = (refs.reduce((s, d) => s + hourSum(a.hourly, d, hours, null, 'impressions'), 0) * 4) / refs.length;
  if (todayImpr === 0 && base >= a.t.paradaMinImpresiones) {
    return {
      outcome: 'hallazgo',
      reason: null,
      dataThrough: a.today,
      findings: [
        draft({
          kind: 'cuenta_no_sirve',
          scope: 'cuenta',
          campaignNativeId: null,
          causeKey: `cuenta:${a.accountId}:sin_impresiones`,
          channel: 'interrupcion',
          severity: 'alta',
          title: `${a.name}: ninguna campaña tiene impresiones desde las ${String(hours[0]).padStart(2, '0')}:00`,
          lines: [`0 impresiones de ${hours[0]}:00 a ${hours[hours.length - 1] + 1}:00 en las ${active.length} campañas activas.`, `El mismo tramo de las 4 semanas anteriores (mismo día de la semana) sumó ${Math.round(base)} impresiones.`, 'Mira en Google Ads el estado de pago y los avisos de la cuenta.'],
          data: { hours, base: Math.round(base), refs },
          exposure: null,
          confidence: refs.length >= 3 ? 'alta' : 'media'
        })
      ]
    };
  }
  return { outcome: 'ok', reason: null, findings: [], dataThrough: a.today };
}

// --- Regla 4: campaña parada o gasto desbocado -------------------------------------------------------------------------

export function ruleCampaignStoppedOrRunaway(a: AccountInput): RuleResult {
  const idx = dailyIndex(a.daily);
  const yesterday = addDays(a.today, -1);
  const weekAgo = addDays(yesterday, -7);
  const wd = weekdayOf(a.today);
  const refs = refWeeks(a);
  const findings: FindingDraft[] = [];
  const notes: string[] = [];
  const budgets = new Map(a.budgets.map((b) => [b.nativeId, b]));
  const byId = new Map(a.campaigns.map((c) => [c.nativeId, c]));

  for (const c of a.campaigns.filter((x) => campaignActiveOn(x, a.today))) {
    const budget = c.budgetNativeId ? budgets.get(c.budgetNativeId) : undefined;
    const dailyBudget = budget && budget.period !== 'CUSTOM_PERIOD' && budget.amount ? budget.amount : null;
    // Parada A (latido): 0 impresiones en las últimas 3 horas de servicio frente al mismo tramo de 4 semanas.
    let stopped: FindingDraft | null = null;
    if (a.hourlyThrough !== null) {
      const hours = lastServiceHours(c.adSchedule, wd, a.hourlyThrough, 3);
      if (hours.length === 3 && refs.length >= 2) {
        const now = hourSum(a.hourly, a.today, hours, c.nativeId, 'impressions');
        const base = (refs.reduce((s, d) => s + hourSum(a.hourly, d, hours, c.nativeId, 'impressions'), 0) * 4) / refs.length;
        if (now === 0 && base >= a.t.paradaMinImpresiones) {
          stopped = draft({
            kind: 'campana_parada_desbocada',
            scope: 'campana',
            campaignNativeId: c.nativeId,
            causeKey: `parada:${a.accountId}:${c.nativeId}`,
            channel: 'interrupcion',
            severity: 'alta',
            title: `${cname(c, c.nativeId)} está parada: 0 impresiones desde las ${String(hours[0]).padStart(2, '0')}:00`,
            lines: [`0 impresiones de ${hours[0]}:00 a ${hours[2] + 1}:00, dentro de su horario programado.`, `El mismo tramo de las 4 semanas anteriores sumó ${Math.round(base)} impresiones.`],
            data: { branch: 'horas', hours, base: Math.round(base) },
            exposure: null,
            confidence: refs.length >= 3 ? 'alta' : 'media'
          });
        }
      } else if (hours.length === 3) notes.push('sin 2 semanas de horas de referencia');
    }
    // Parada B (diario): ayer −70 % de impresiones frente al mismo día de la semana anterior, con suelo.
    if (!stopped && campaignActiveOn(c, yesterday) && servesOnDay(c.adSchedule, weekdayOf(yesterday)) && (!c.startDate || c.startDate <= weekAgo)) {
      const y = dayValue(idx, a.covered, c.nativeId, yesterday, 'impressions');
      const w = dayValue(idx, a.covered, c.nativeId, weekAgo, 'impressions');
      if (y !== null && w !== null && w >= a.t.caidaSueloImpresiones && y <= w * (1 - a.t.caidaPct)) {
        stopped = draft({
          kind: 'campana_parada_desbocada',
          scope: 'campana',
          campaignNativeId: c.nativeId,
          causeKey: `parada:${a.accountId}:${c.nativeId}`,
          channel: 'interrupcion',
          severity: 'alta',
          title: y === 0 ? `${cname(c, c.nativeId)} no tuvo ni una impresión ayer` : `${cname(c, c.nativeId)} cayó un ${Math.round((1 - y / w) * 100)} % de impresiones ayer`,
          lines: [`Ayer (${yesterday}): ${y} impresiones${y === 0 && !idx.has(`${c.nativeId}|${yesterday}`) ? ' (día completo y sin fila: es un cero de verdad)' : ''}.`, `El mismo día de la semana anterior (${weekAgo}): ${w}.`, 'Sigue activa y dentro de su horario: mira estado, presupuesto, pujas y rechazos.'],
          data: { branch: 'dia', yesterday: y, weekAgo: w },
          exposure: null
        });
      }
    }
    if (stopped) findings.push(stopped);

    // Desbocada A (latido): hoy hasta esta hora > 1,5 × lo típico, ≥ 1,5 × presupuesto diario y sin conversiones esperadas.
    if (!stopped && dailyBudget && a.hourlyThrough !== null && refs.length >= 2) {
      const hours = Array.from({ length: a.hourlyThrough + 1 }, (_, h) => h);
      const cost = hourSum(a.hourly, a.today, hours, c.nativeId, 'cost');
      const conv = hourSum(a.hourly, a.today, hours, c.nativeId, 'conversions');
      const typical = refs.reduce((s, d) => s + hourSum(a.hourly, d, hours, c.nativeId, 'cost'), 0) / refs.length;
      const typicalConv = refs.reduce((s, d) => s + hourSum(a.hourly, d, hours, c.nativeId, 'conversions'), 0) / refs.length;
      if (cost >= a.t.sueloMoneda && cost > typical * a.t.desbocadaFactorTipico && cost >= dailyBudget * a.t.desbocadaFactorPresupuesto && conv === 0 && typicalConv >= 1) {
        findings.push(
          draft({
            kind: 'campana_parada_desbocada',
            scope: 'campana',
            campaignNativeId: c.nativeId,
            causeKey: `desbocada:${a.accountId}:${c.nativeId}`,
            channel: 'interrupcion',
            severity: 'alta',
            title: `${cname(c, c.nativeId)} gasta de más: ${money(cost, a.currency)} hoy y ninguna conversión`,
            lines: [`Hoy hasta las ${a.hourlyThrough + 1}:00: ${money(cost, a.currency)} (presupuesto diario ${money(dailyBudget, a.currency)}).`, `Lo típico a esta hora el mismo día de la semana: ${money(typical, a.currency)} y ${typicalConv.toFixed(1)} conversiones; hoy, 0.`],
            data: { branch: 'horas', cost: round2(cost), typical: round2(typical), budget: dailyBudget },
            exposure: round2(cost - typical)
          })
        );
      }
    }
  }

  // Desbocada B (diario, por presupuesto: los compartidos cuentan una vez): 3 días > 1,3 × 3 × presupuesto diario.
  const d3from = addDays(a.today, -3);
  const daysOk = [0, 1, 2].every((i) => a.covered.has(addDays(yesterday, -i)));
  if (daysOk) {
    for (const b of a.budgets) {
      if (!b.amount || b.period === 'CUSTOM_PERIOD') continue;
      const camps = a.campaigns.filter((c) => c.budgetNativeId === b.nativeId && campaignActiveOn(c, yesterday));
      if (!camps.length) continue;
      const ids = new Set(camps.map((c) => c.nativeId));
      const cost = sumCost(a.daily, d3from, yesterday, (d) => ids.has(d.campaignNativeId));
      if (cost >= a.t.sueloMoneda * 3 && cost > a.t.desbocadaFactor3Dias * 3 * b.amount) {
        const top = [...camps].sort((x, y) => sumCost(a.daily, d3from, yesterday, (d) => d.campaignNativeId === y.nativeId) - sumCost(a.daily, d3from, yesterday, (d) => d.campaignNativeId === x.nativeId))[0];
        if (findings.some((f) => f.campaignNativeId === top.nativeId && f.causeKey.startsWith('parada:'))) continue;
        findings.push(
          draft({
            kind: 'campana_parada_desbocada',
            scope: 'campana',
            campaignNativeId: top.nativeId,
            causeKey: `desbocada3d:${a.accountId}:${b.nativeId}`,
            channel: 'interrupcion',
            severity: 'alta',
            title: `${camps.length > 1 ? 'Presupuesto compartido' : cname(byId.get(top.nativeId), top.nativeId)}: ${money(cost, a.currency)} en 3 días con ${money(b.amount, a.currency)}/día`,
            lines: [`Gasto de ${d3from} a ${yesterday}: ${money(cost, a.currency)} (${(cost / (3 * b.amount)).toFixed(2)} × tres días de presupuesto).`, camps.length > 1 ? `Campañas que lo usan: ${camps.map((c) => c.name ?? c.nativeId).join(', ')}.` : 'Google puede gastar hasta 2 × un día, pero no tres días seguidos por encima.'],
            data: { branch: '3dias', cost, budget: b.amount, budgetId: b.nativeId },
            exposure: round2(cost - 3 * b.amount)
          })
        );
      }
    }
  }
  return { outcome: findings.length ? 'hallazgo' : 'ok', reason: notes.length ? [...new Set(notes)].join('; ') : null, findings, dataThrough: yesterday };
}

// --- Regla 3: página de destino caída con gasto ------------------------------------------------------------------------

export type LandingVerdict = 'ok' | 'caida' | 'no_comprobable';

/**
 * Qué es «caída» (R5 M12): DNS, TLS, conexión rechazada o agotada, 5xx, 404 y 410. 403/429 → «no comprobable»
 * (cortafuegos ante un bot); una dirección no pública tampoco se comprueba. Redirecciones y 2xx: bien.
 */
export function classifyLanding(r: { status: number; error?: string | null }): LandingVerdict {
  if (r.status === 0) return r.error && /no permitida/i.test(r.error) ? 'no_comprobable' : 'caida';
  if (r.status === 403 || r.status === 429 || r.status === 401) return 'no_comprobable';
  if (r.status === 404 || r.status === 410 || r.status >= 500) return 'caida';
  return 'ok';
}

export function ruleLandingDown(a: AccountInput): RuleResult {
  const findings: FindingDraft[] = [];
  const spending = a.landing.filter((l) => l.cost7d > 0);
  let unchecked = 0;
  for (const l of spending) {
    if (l.lastCheckAt === null) unchecked++;
    if (l.lastCheckOk === false && l.consecutiveFailures >= 2) {
      const perHour = l.cost7d / 7 / 24;
      findings.push(
        draft({
          kind: 'landing_caida',
          scope: l.campaignNativeIds.length === 1 ? 'campana' : 'cuenta',
          campaignNativeId: l.campaignNativeIds.length === 1 ? l.campaignNativeIds[0] : null,
          causeKey: `landing:${a.accountId}:${l.urlNormalized}`.slice(0, 300),
          channel: 'interrupcion',
          severity: 'alta',
          title: `Página de destino caída con gasto: ${l.urlNormalized.replace(/^https?:\/\//, '').slice(0, 80)}`,
          lines: [`Falla en ${l.consecutiveFailures} comprobaciones seguidas (al menos 10 minutos entre ellas): ${l.lastCheckStatus ?? 'error'}.`, `Gasto de 7 días hacia esa página: ${money(l.cost7d, a.currency)} (unos ${money(perHour, a.currency)} por hora).`],
          data: { url: l.url, status: l.lastCheckStatus, failures: l.consecutiveFailures },
          exposure: round2(l.cost7d / 7)
        })
      );
    }
  }
  if (!findings.length && spending.length && unchecked === spending.length) return { outcome: 'no_comprobado', reason: 'las páginas con gasto aún no se han comprobado', findings: [], dataThrough: null };
  return { outcome: findings.length ? 'hallazgo' : 'ok', reason: unchecked ? `${unchecked} página(s) sin comprobar todavía` : null, findings, dataThrough: a.today };
}

// --- Regla 2: anuncio rechazado con gasto ------------------------------------------------------------------------------

export function ruleDisapprovedWithSpend(a: AccountInput): RuleResult {
  if (!a.policies.length) return { outcome: 'ok', reason: 'sin políticas descargadas', findings: [], dataThrough: a.today };
  const cost14 = costByCampaign(a.daily, a.today, 14);
  const total14 = [...cost14.values()].reduce((s, v) => s + v, 0);
  const topId = [...cost14.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
  const byId = new Map(a.campaigns.map((c) => [c.nativeId, c]));
  const groups = new Map<string, string[]>();
  for (const p of a.policies) {
    if (!p.campaignNativeId) continue;
    const c = byId.get(p.campaignNativeId);
    if (!c || !campaignActiveOn(c, a.today)) continue;
    if (p.status && p.status !== 'ENABLED') continue;
    const problems: string[] = [];
    if (p.entityKind === 'asset_group' && p.adsDisapproved > 0) problems.push('grupo de recursos rechazado');
    else if (p.adsTotal > 0 && p.adsApproved === 0 && p.adsDisapproved > 0) problems.push(`ningún anuncio aprobado (${p.adsDisapproved} rechazado${p.adsDisapproved > 1 ? 's' : ''})`);
    if (p.keywordsDisapproved > 0) problems.push(`${p.keywordsDisapproved} palabra${p.keywordsDisapproved > 1 ? 's' : ''} clave rechazada${p.keywordsDisapproved > 1 ? 's' : ''}`);
    if (problems.length) groups.set(p.campaignNativeId, [...(groups.get(p.campaignNativeId) ?? []), `${p.name ?? p.adGroupNativeId}: ${problems.join(' y ')}`]);
  }
  const findings: FindingDraft[] = [];
  for (const [cid, lines] of groups) {
    const spent = round2(cost14.get(cid) ?? 0);
    if (spent <= 0) continue;
    const share = total14 > 0 ? spent / total14 : 0;
    const urgent = cid === topId || share > a.t.rechazoPctInterrupcion;
    const c = byId.get(cid);
    findings.push(
      draft({
        kind: 'rechazo_con_gasto',
        scope: 'campana',
        campaignNativeId: cid,
        causeKey: `rechazo:${a.accountId}:${cid}`,
        channel: urgent ? 'interrupcion' : 'parte',
        severity: urgent ? 'alta' : 'media',
        title: `Rechazos en ${cname(c, cid)}, que gasta ${money(spent, a.currency)} en 14 días`,
        lines: [...lines.slice(0, 6), `Es el ${Math.round(share * 100)} % del gasto de la cuenta${cid === topId ? ' (la campaña que más gasta)' : ''}.`, 'El gasto es de la campaña: Google Ads no da el gasto por grupo en esta descarga.'],
        data: { groups: lines.length, share: round2(share) },
        exposure: round2(spent / 14)
      })
    );
  }
  return { outcome: findings.length ? 'hallazgo' : 'ok', reason: null, findings, dataThrough: addDays(a.today, -1) };
}

// --- Regla 12: medición rota (5.1; binomial negativa, R5 G2) -----------------------------------------------------------

export function ruleMeasurementBroken(a: AccountInput): RuleResult {
  const yesterday = addDays(a.today, -1);
  if (!a.covered.has(yesterday)) return { outcome: 'no_comprobado', reason: `ayer (${yesterday}) aún no está completo`, findings: [], dataThrough: null };
  const clicksByDay = new Map<string, number>();
  for (const d of a.daily) clicksByDay.set(d.day, (clicksByDay.get(d.day) ?? 0) + d.clicks);
  const clicksOn = (day: string) => clicksByDay.get(day) ?? 0;
  const primary = a.actions.filter((x) => x.primaryForGoal && x.includeInConversions !== false && x.status !== 'REMOVED');
  if (!primary.length) return { outcome: 'ok', reason: 'sin datos para afirmar: la cuenta no tiene acciones primarias', findings: [], dataThrough: yesterday };
  const convIdx = new Map<string, number>();
  for (const c of a.conversions) convIdx.set(`${c.conversionAction}|${c.day}`, (convIdx.get(`${c.conversionAction}|${c.day}`) ?? 0) + c.conversionsByConvDate);
  const findings: FindingDraft[] = [];
  const thin: string[] = [];
  const offBand: string[] = [];
  const unchecked: string[] = [];
  for (const act of primary) {
    const conv = (day: string) => convIdx.get(`${act.resourceName}|${day}`) ?? 0;
    // Días seguidos a cero hasta ayer (solo días cubiertos: un día sin cubrir corta la racha).
    let start = yesterday;
    let run = 0;
    while (run < 90 && a.covered.has(start) && conv(start) === 0) {
      run++;
      start = addDays(start, -1);
    }
    const runFrom = addDays(yesterday, -(run - 1));
    // 8 semanas previas a la racha (por fecha de conversión).
    const baseTo = addDays(runFrom, -1);
    const baseFrom = addDays(baseTo, -55);
    const baseDays: string[] = [];
    for (let d = baseFrom; d <= baseTo; d = addDays(d, 1)) if (a.covered.has(d)) baseDays.push(d);
    const convBase = baseDays.reduce((s, d) => s + conv(d), 0);
    const clicksBase = baseDays.reduce((s, d) => s + clicksOn(d), 0);
    const label = act.name ?? act.resourceName;
    if (baseDays.length < 50 || convBase < a.t.medicionMinConversiones || clicksBase <= 0) {
      thin.push(`${label} (${Math.round(convBase)} en 8 semanas)`);
      unchecked.push(`medicion:${a.accountId}:${act.resourceName}`.slice(0, 300));
      continue;
    }
    if (run === 0) continue;
    const rate = convBase / clicksBase;
    let clicksRun = 0;
    for (let d = runFrom; d <= yesterday; d = addDays(d, 1)) clicksRun += clicksOn(d);
    const meanRun = clicksRun / run;
    const meanBase = clicksBase / baseDays.length;
    // Solo si los clics están en su banda habitual: si no, la causa es de entrega (reglas 1 y 4), no de medición.
    if (meanRun < meanBase * 0.5 || meanRun > meanBase * 2) {
      offBand.push(label);
      unchecked.push(`medicion:${a.accountId}:${act.resourceName}`.slice(0, 300));
      continue;
    }
    const mu = clicksRun * rate;
    const k = estimateK(baseDays.map((d) => ({ x: conv(d), e: clicksOn(d) * rate })), a.t.medicionKDefecto);
    const p0 = nbZeroProbability(mu, k);
    if (p0 < a.t.medicionAlfa) {
      findings.push(
        draft({
          kind: 'medicion_rota',
          scope: 'cuenta',
          campaignNativeId: null,
          causeKey: `medicion:${a.accountId}:${act.resourceName}`.slice(0, 300),
          channel: 'parte',
          severity: 'media',
          title: `Medición rota: «${label}» lleva ${run} días a cero con los clics de siempre`,
          lines: [
            `Última conversión antes del ${runFrom} (contadas por fecha de conversión).`,
            `Con ${Math.round(clicksRun)} clics y su tasa de las 8 semanas previas (${(rate * 100).toFixed(2)} %), lo esperado eran ${mu.toFixed(1)} conversiones.`,
            `Probabilidad de un cero así en una cuenta sana: ${p0 < 0.0001 ? '< 0,01 %' : `${(p0 * 100).toFixed(2)} %`} (binomial negativa, k = ${k.toFixed(1)}).`,
            'Mira la etiqueta o la importación de esa acción antes de tocar pujas o presupuestos.'
          ],
          data: { action: act.resourceName, run, mu: round2(mu), p0, k: round2(k), clicks: clicksRun, rate },
          exposure: null,
          confidence: run >= 3 ? 'alta' : 'media'
        })
      );
    }
  }
  const notes = [thin.length ? `sin datos para afirmar: ${thin.join(', ')}` : '', offBand.length ? `clics fuera de su banda (causa de entrega): ${offBand.join(', ')}` : ''].filter(Boolean);
  if (!findings.length && thin.length === primary.length) return { outcome: 'ok', reason: `sin datos para afirmar: menos de ${a.t.medicionMinConversiones} conversiones en 8 semanas`, findings: [], dataThrough: yesterday, uncheckedCauses: unchecked };
  return { outcome: findings.length ? 'hallazgo' : 'ok', reason: notes.join('; ') || null, findings, dataThrough: yesterday, uncheckedCauses: unchecked };
}

// --- Regla 8: ritmo de gasto -------------------------------------------------------------------------------------------

export function daysInMonth(day: string): number {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Referencia del mes: el presupuesto mensual de medios del acuerdo (`ads_goals.budget_usual`) o, sin acuerdo, la suma de
 * PRESUPUESTOS diarios (un compartido cuenta una vez) por los días del mes en que alguna de sus campañas está activa.
 */
export function monthReference(a: Pick<AccountInput, 'goal' | 'budgets' | 'campaigns' | 'today'>): { amount: number; mode: 'acuerdo' | 'presupuestos' } | null {
  // Solo el acordado con el cliente: el provisional es un supuesto calculado por la herramienta (revisor, 28 nov).
  if (a.goal?.kind === 'acordado' && a.goal.budgetUsual && a.goal.budgetUsual > 0) return { amount: a.goal.budgetUsual, mode: 'acuerdo' };
  const first = `${a.today.slice(0, 8)}01`;
  const n = daysInMonth(a.today);
  let total = 0;
  for (const b of a.budgets) {
    if (!b.amount || b.period === 'CUSTOM_PERIOD' || (b.status && b.status !== 'ENABLED')) continue;
    const camps = a.campaigns.filter((c) => c.budgetNativeId === b.nativeId && c.status === 'ENABLED');
    if (!camps.length) continue;
    let days = 0;
    for (let i = 0; i < n; i++) {
      const d = addDays(first, i);
      if (camps.some((c) => campaignActiveOn(c, d))) days++;
    }
    total += b.amount * days;
  }
  return total > 0 ? { amount: round2(total), mode: 'presupuestos' } : null;
}

/** Ritmo del mes: gasto hasta ayer, proyección a fin de mes y su relación con la referencia. */
export function monthPace(a: Pick<AccountInput, 'goal' | 'budgets' | 'campaigns' | 'today' | 'daily' | 'covered'>): { spent: number; projection: number; reference: { amount: number; mode: 'acuerdo' | 'presupuestos' } | null; ratio: number | null; elapsed: number; complete: boolean } {
  const first = `${a.today.slice(0, 8)}01`;
  const yesterday = addDays(a.today, -1);
  const elapsed = daysBetween(first, a.today);
  const spent = elapsed > 0 ? sumCost(a.daily, first, yesterday) : 0;
  let complete = true;
  for (let d = first; d <= yesterday; d = addDays(d, 1)) if (!a.covered.has(d)) complete = false;
  const projection = elapsed > 0 ? round2((spent / elapsed) * daysInMonth(a.today)) : 0;
  const reference = monthReference(a);
  return { spent, projection, reference, ratio: reference && elapsed > 0 ? projection / reference.amount : null, elapsed, complete };
}

export function rulePacing(a: AccountInput): RuleResult {
  const findings: FindingDraft[] = [];
  const pace = monthPace(a);
  const dayOfMonth = Number(a.today.slice(8, 10));
  let reason: string | null = null;
  if (!pace.complete) return { outcome: 'no_comprobado', reason: 'faltan días completos del mes en curso', findings: [], dataThrough: null };
  if (pace.reference && pace.ratio !== null && dayOfMonth >= a.t.ritmoDesdeDia) {
    const over = pace.ratio > 1 + a.t.ritmoBanda;
    const under = pace.ratio < 1 - a.t.ritmoBanda;
    // Sin acuerdo, la suma de presupuestos es un techo, no un objetivo: solo se avisa de pasarse (desviación justificada en
    // el documento de sesión; con acuerdo de negocio, en los dos sentidos como dice PRO-07).
    if (over || (under && pace.reference.mode === 'acuerdo')) {
      findings.push(
        draft({
          kind: 'ritmo_gasto',
          scope: 'cuenta',
          campaignNativeId: null,
          causeKey: `ritmo:${a.accountId}:${a.today.slice(0, 7)}`,
          channel: 'parte',
          severity: 'media',
          title: `${a.name}: el mes acabará en ${money(pace.projection, a.currency)} (${over ? '+' : ''}${Math.round((pace.ratio - 1) * 100)} % frente a ${pace.reference.mode === 'acuerdo' ? 'lo acordado' : 'la suma de presupuestos'})`,
          lines: [`Gastado hasta ayer: ${money(pace.spent, a.currency)} en ${pace.elapsed} días.`, `${pace.reference.mode === 'acuerdo' ? 'Presupuesto mensual del acuerdo' : 'Suma de presupuestos diarios por los días activos del mes'}: ${money(pace.reference.amount, a.currency)}.`, `Banda: ±${Math.round(a.t.ritmoBanda * 100)} %.`],
          data: { projection: pace.projection, reference: pace.reference, ratio: round2(pace.ratio) },
          exposure: round2(Math.abs(pace.projection - pace.reference.amount))
        })
      );
    }
  } else if (dayOfMonth < a.t.ritmoDesdeDia) reason = `antes del día ${a.t.ritmoDesdeDia} solo se mira el presupuesto agotado`;
  else if (!pace.reference) reason = 'sin presupuesto de referencia';
  // Presupuesto agotado antes de las 14:00 (por presupuesto; los compartidos, con todas sus campañas).
  if (a.hourlyThrough !== null) {
    const through = Math.min(a.hourlyThrough, a.t.agotadoHora - 1);
    const hours = Array.from({ length: through + 1 }, (_, h) => h);
    for (const b of a.budgets) {
      if (!b.amount || b.period === 'CUSTOM_PERIOD') continue;
      const camps = a.campaigns.filter((c) => c.budgetNativeId === b.nativeId && campaignActiveOn(c, a.today));
      if (!camps.length) continue;
      const cost = camps.reduce((s, c) => s + hourSum(a.hourly, a.today, hours, c.nativeId, 'cost'), 0);
      if (cost >= b.amount * 0.98 && cost >= a.t.sueloMoneda) {
        findings.push(
          draft({
            kind: 'ritmo_gasto',
            scope: camps.length === 1 ? 'campana' : 'cuenta',
            campaignNativeId: camps.length === 1 ? camps[0].nativeId : null,
            causeKey: `agotado:${a.accountId}:${b.nativeId}`,
            channel: 'parte',
            severity: 'media',
            title: `Presupuesto agotado antes de las ${a.t.agotadoHora}:00: ${camps.length === 1 ? cname(camps[0], camps[0].nativeId) : `${camps.length} campañas con presupuesto compartido`}`,
            lines: [`Hoy hasta las ${through + 1}:00: ${money(cost, a.currency)} de ${money(b.amount, a.currency)} al día.`, 'El resto del día la campaña sale poco o nada: valora subir el presupuesto o repartirlo.'],
            data: { budgetId: b.nativeId, cost: round2(cost), amount: b.amount },
            exposure: null
          })
        );
      }
    }
  }
  return { outcome: findings.length ? 'hallazgo' : 'ok', reason, findings, dataThrough: addDays(a.today, -1) };
}

// --- Regla 6: algo pausado que aportaba leads (PRO-13) -----------------------------------------------------------------

function pausedEvent(changes: ChangeIn[], campaignNativeId: string): ChangeIn | null {
  return (
    changes
      .filter((ch) => ch.campaignNativeId === campaignNativeId && ch.resourceType === 'CAMPAIGN' && ch.changedFields.some((f) => /(^|\.)status$/.test(f)))
      .filter((ch) => {
        const nv = ch.newValue as { campaign?: { status?: string } } | null;
        return !nv?.campaign?.status || nv.campaign.status === 'PAUSED';
      })
      .sort((x, y) => y.changeAt.getTime() - x.changeAt.getTime())[0] ?? null
  );
}

export function rulePausedContributor(a: AccountInput, changeDayOf: (d: Date) => string): RuleResult {
  const findings: FindingDraft[] = [];
  const notes: string[] = [];
  const unchecked: string[] = [];
  for (const c of a.campaigns) {
    const ended = c.status === 'ENABLED' && c.endDate && c.endDate < a.today;
    if (c.status !== 'PAUSED' && !ended) continue;
    let pauseDay: string | null = null;
    let who = 'desconocido';
    let actor = 'desconocido';
    const ev = c.status === 'PAUSED' ? pausedEvent(a.changes, c.nativeId) : null;
    if (ended) {
      pauseDay = addDays(c.endDate!, 1);
      who = 'su fecha de fin';
      actor = 'fecha_fin';
    } else if (ev) {
      pauseDay = changeDayOf(ev.changeAt);
      who = ev.userEmail || (ev.actorClass === 'google' ? 'Google' : ev.actorClass);
      actor = ev.actorClass;
    } else {
      const last = a.daily.filter((d) => d.campaignNativeId === c.nativeId && d.impressions > 0).map((d) => d.day).sort().pop();
      if (last) pauseDay = addDays(last, 1);
    }
    if (!pauseDay) continue;
    const paused = daysBetween(pauseDay, a.today);
    if (paused < a.t.pausadoDias || paused > 30) continue;
    const from = addDays(pauseDay, -60);
    const to = addDays(pauseDay, -1);
    let coveredDays = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) if (a.covered.has(d)) coveredDays++;
    if (coveredDays < 55) {
      notes.push(`${c.name ?? c.nativeId}: faltan días de los 60 previos a la pausa`);
      unchecked.push(`pausado:${a.accountId}:${c.nativeId}`);
      continue;
    }
    let mine = 0;
    let all = 0;
    for (const d of a.daily) {
      if (d.day < from || d.day > to) continue;
      all += d.conversions;
      if (d.campaignNativeId === c.nativeId) mine += d.conversions;
    }
    if (all < 5 || mine / all <= a.t.pausadoPct) continue;
    const ours = actor === 'agencia';
    findings.push(
      draft({
        kind: 'pausado_aportaba',
        scope: 'campana',
        campaignNativeId: c.nativeId,
        causeKey: `pausado:${a.accountId}:${c.nativeId}`,
        channel: 'parte',
        severity: ours ? 'baja' : 'media',
        fyi: ours,
        title: `${cname(c, c.nativeId)} lleva ${paused} días ${ended ? 'terminada' : 'pausada'} y aportaba el ${Math.round((mine / all) * 100)} % de los leads`,
        lines: [`${ended ? 'Terminó' : 'Pausada'} el ${pauseDay}${ended ? ' (fecha de fin)' : ` por ${who}`}.`, `En los 60 días anteriores: ${mine.toFixed(0)} de ${all.toFixed(0)} conversiones de la cuenta.`, ours ? 'La pausó la agencia: es solo para que lo sepas.' : 'Si no fue a propósito, valora reactivarla.'],
        data: { pauseDay, who, actor, share: round2(mine / all) },
        exposure: null
      })
    );
  }
  return { outcome: findings.length ? 'hallazgo' : 'ok', reason: notes.length ? notes.join('; ') : null, findings, dataThrough: addDays(a.today, -1), uncheckedCauses: unchecked };
}

// --- Regla 11: cambio ajeno en algo con gasto (PRO-08) -----------------------------------------------------------------

export function ruleForeignChange(a: AccountInput, changeDayOf: (d: Date) => string): RuleResult {
  const since = new Date(a.now.getTime() - a.t.cambioDias * 86_400_000);
  const cost14 = costByCampaign(a.daily, a.today, 14);
  const accountCost = [...cost14.values()].reduce((s, v) => s + v, 0);
  const byId = new Map(a.campaigns.map((c) => [c.nativeId, c]));
  const groups = new Map<string, ChangeIn[]>();
  for (const ch of a.changes) {
    if (ch.changeAt < since) continue;
    if (ch.actorClass !== 'cliente' && ch.actorClass !== 'google') continue;
    const spent = ch.campaignNativeId ? (cost14.get(ch.campaignNativeId) ?? 0) : accountCost;
    if (spent <= 0) continue;
    const key = ch.actorClass === 'google' ? 'google' : (ch.userEmail ?? 'cliente').toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), ch]);
  }
  const findings: FindingDraft[] = [];
  for (const [key, list] of groups) {
    list.sort((x, y) => y.changeAt.getTime() - x.changeAt.getTime());
    const perDay = new Map<string, number>();
    for (const ch of list) perDay.set(changeDayOf(ch.changeAt), (perDay.get(changeDayOf(ch.changeAt)) ?? 0) + 1);
    const burst = Math.max(...perDay.values()) >= 10;
    const older = a.changes.some((ch) => ch.changeAt < since && (key === 'google' ? ch.actorClass === 'google' : (ch.userEmail ?? '').toLowerCase() === key));
    const google = key === 'google';
    const camps = [...new Set(list.map((ch) => ch.campaignNativeId).filter((x): x is string => Boolean(x)))];
    findings.push(
      draft({
        kind: 'cambio_ajeno',
        scope: 'cuenta',
        campaignNativeId: camps.length === 1 ? camps[0] : null,
        causeKey: `cambio:${a.accountId}:${key}`.slice(0, 300),
        channel: 'parte',
        severity: 'media',
        title: google ? `Google cambió ${list.length} cosa${list.length > 1 ? 's' : ''} en ${a.name} (recomendaciones aplicadas solas)` : `${key} (cliente) cambió ${list.length} cosa${list.length > 1 ? 's' : ''} en ${a.name}`,
        lines: [
          ...list.slice(0, 6).map((ch) => `${changeDayOf(ch.changeAt)} · ${ch.resourceType ?? 'cambio'}${ch.operation ? ` (${ch.operation.toLowerCase()})` : ''}${ch.campaignNativeId ? ` en ${cname(byId.get(ch.campaignNativeId), ch.campaignNativeId)}` : ''}${ch.changedFields.length ? `: ${ch.changedFields.slice(0, 3).join(', ')}` : ''}`),
          ...(list.length > 6 ? [`…y ${list.length - 6} más.`] : []),
          ...(burst ? ['Ráfaga: 10 o más cambios en un mismo día.'] : []),
          ...(!google && !older ? ['Usuario nuevo: no aparece en el historial anterior.'] : []),
          // Paso 3 (EST-06): lo que este autor deshizo de la auditoría de higiene va aquí como evidencia, no como aviso aparte.
          ...(a.auditRegressions ?? []).filter((r) => r.actor === key && r.at >= since).map((r) => `Deshace una corrección de la auditoría de higiene: «${r.title}» volvió a fallar.`),
          google ? 'Revisa si encajan con la estrategia; si no, desactiva la aplicación automática de recomendaciones.' : 'Pregunta al cliente qué buscaba antes de deshacer nada.'
        ],
        data: { actor: key, changes: list.length, burst, newUser: !google && !older, auditRegressions: (a.auditRegressions ?? []).filter((r) => r.actor === key && r.at >= since).map((r) => r.control) },
        exposure: null
      })
    );
  }
  return { outcome: findings.length ? 'hallazgo' : 'ok', reason: null, findings, dataThrough: a.today };
}

// --- Registro de reglas -----------------------------------------------------------------------------------------------

export function ruleDefs(changeDayOf: (d: Date) => string): RuleDef[] {
  return [
    { kind: 'cuenta_no_sirve', sources: ['estructura', 'latido'], windowDays: 0, cadence: 'horaria', run: ruleAccountCannotServe },
    { kind: 'campana_parada_desbocada', sources: ['estructura', 'latido', 'metricas'], windowDays: 8, cadence: 'horaria', run: ruleCampaignStoppedOrRunaway },
    { kind: 'landing_caida', sources: ['landing', 'estructura'], windowDays: 0, cadence: 'horaria', run: ruleLandingDown },
    { kind: 'rechazo_con_gasto', sources: ['estructura', 'metricas'], windowDays: 14, cadence: 'horaria', run: ruleDisapprovedWithSpend },
    { kind: 'medicion_rota', sources: ['metricas', 'estructura'], windowDays: 0, cadence: 'diaria', run: ruleMeasurementBroken },
    { kind: 'ritmo_gasto', sources: ['metricas', 'estructura'], windowDays: 0, cadence: 'diaria', run: rulePacing },
    { kind: 'pausado_aportaba', sources: ['cambios', 'metricas', 'estructura'], windowDays: 0, cadence: 'diaria', run: (x) => rulePausedContributor(x, changeDayOf) },
    { kind: 'cambio_ajeno', sources: ['cambios', 'metricas'], windowDays: 14, cadence: 'diaria', run: (x) => ruleForeignChange(x, changeDayOf) }
  ];
}

/** Evalúa una regla con su comprobación previa. La 15 no tiene comprobación previa: es la que mira las fuentes. */
export function runRule(def: RuleDef, a: AccountInput): RuleResult {
  const g = gateRule(def, a.health, a.covered, a.today);
  if (!g.ok) return { outcome: 'no_comprobado', reason: g.reason, findings: [], dataThrough: null };
  return def.run(a);
}

/**
 * Precedencia (§6.2): un hallazgo de rango inferior no se emite sobre la misma cuenta (si el superior es de cuenta o de
 * agencia) o la misma campaña mientras haya uno superior. Devuelve los que se emiten y, aparte, los que quedan como
 * evidencia del superior.
 */
export function applyPrecedence(drafts: FindingDraft[], openHigher: { kind: FindingKind; scope: string; campaignNativeId: string | null; causeKey: string }[] = []): { emit: FindingDraft[]; suppressed: { draft: FindingDraft; by: string }[] } {
  const all = [...drafts.map((d) => ({ kind: d.kind, scope: d.scope, campaignNativeId: d.campaignNativeId, causeKey: d.causeKey })), ...openHigher];
  const emit: FindingDraft[] = [];
  const suppressed: { draft: FindingDraft; by: string }[] = [];
  for (const d of drafts) {
    const by = all.find((h) => PRECEDENCE[h.kind] < PRECEDENCE[d.kind] && (h.scope !== 'campana' || (d.campaignNativeId !== null && h.campaignNativeId === d.campaignNativeId)));
    if (by) suppressed.push({ draft: d, by: by.causeKey });
    else emit.push(d);
  }
  return { emit, suppressed };
}

// --- Tope de atención y horario (7.3) ----------------------------------------------------------------------------------

export type Rankable = { id: string; severity: string; fyi: boolean; exposure: number | null; firstSeenAt: Date };
const SEV: Record<string, number> = { alta: 0, media: 1, baja: 2 };

/** Orden del parte: gravedad, dinero expuesto y antigüedad. */
export function rankFindings<T extends Rankable>(list: T[]): T[] {
  return [...list].sort((x, y) => (SEV[x.severity] ?? 1) - (SEV[y.severity] ?? 1) || (y.exposure ?? 0) - (x.exposure ?? 0) || x.firstSeenAt.getTime() - y.firstSeenAt.getTime());
}

/** Parte de la mañana: 5 con decisión + 3 «para que lo sepas»; el resto, «N más por debajo del corte». */
export function morningCut<T extends Rankable>(list: T[], decisions = 5, fyi = 3): { decisions: T[]; fyi: T[]; below: T[] } {
  const ranked = rankFindings(list);
  const dec = ranked.filter((f) => !f.fyi);
  const info = ranked.filter((f) => f.fyi);
  return { decisions: dec.slice(0, decisions), fyi: info.slice(0, fyi), below: [...dec.slice(decisions), ...info.slice(fyi)] };
}

/** «09:00-19:00» → minutos [desde, hasta). Mal formado → el de partida. */
export function parseAlertHours(v: string | null | undefined): { from: number; to: number } {
  const m = String(v ?? '').match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
  if (!m) return { from: 9 * 60, to: 19 * 60 };
  const from = Number(m[1]) * 60 + Number(m[2]);
  const to = Number(m[3]) * 60 + Number(m[4]);
  return from < to && to <= 24 * 60 ? { from, to } : { from: 9 * 60, to: 19 * 60 };
}

/** «1,2,3,4,5» → días ISO (1 = lunes … 7 = domingo). */
export function parseAlertDays(v: string | null | undefined): number[] {
  const out = [...new Set(String(v ?? '').split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7))];
  return out.length ? out.sort() : [1, 2, 3, 4, 5];
}

/** ¿Estamos en horario laboral de avisos? (hora y día de la semana de Madrid, ya calculados). */
export function inAlertWindow(local: { hour: number; minute: number; weekday: number }, hours: string, days: string): boolean {
  const iso = local.weekday === 0 ? 7 : local.weekday;
  if (!parseAlertDays(days).includes(iso)) return false;
  const w = parseAlertHours(hours);
  const m = local.hour * 60 + local.minute;
  return m >= w.from && m < w.to;
}

/** Tope por persona: como mucho `max` interrupciones al día; la siguiente y las demás van juntas en un solo mensaje. */
export function alertPlan<T>(pending: T[], sentToday: number, max: number): { send: T[]; group: T[] } {
  const room = Math.max(0, max - sentToday);
  return { send: pending.slice(0, room), group: pending.slice(room) };
}

// --- Respuestas del gestor (7.4) ---------------------------------------------------------------------------------------

export const RESPONSES = ['hecho', 'lo_hago_yo', 'esperando_cliente', 'cliente_lo_quiere', 'ya_lo_sabia', 'no_es_problema', 'posponer', 'encargar'] as const;
export type ResponseKind = (typeof RESPONSES)[number];
export const RESPONSE_LABEL: Record<ResponseKind, string> = {
  hecho: 'Hecho',
  lo_hago_yo: 'Lo hago yo',
  esperando_cliente: 'Esperando al cliente',
  cliente_lo_quiere: 'El cliente lo quiere así',
  ya_lo_sabia: 'Ya lo sabía',
  no_es_problema: 'No es un problema',
  posponer: 'Posponer',
  encargar: 'Encargar'
};
export const MAX_POSTPONES = 2;

export type ResponseEffect = { status: 'silenciado' | 'descartado'; silencedUntil: Date; until: string | null; reason: string | null; message: string };

/**
 * Qué hace cada respuesta (sin tocar umbrales: 7.4 «ajustan prioridad y presentación, nunca detección»):
 *  - hecho / lo hago yo: en seguimiento 2 días; se cierra solo cuando la regla deja de verlo (si no, vuelve como vencido).
 *  - esperando al cliente: silencio hasta la fecha (obligatoria, máx. 90 días).
 *  - el cliente lo quiere así: motivo obligatorio; descartado y sin volver a avisar de esa causa en 365 días.
 *  - ya lo sabía: silencio 7 días.
 *  - no es un problema: motivo obligatorio; descartado 90 días.
 *  - posponer: 1, 7 o 28 días, como mucho 2 veces (a la tercera, decidir o descartar con motivo).
 *  - encargar: silencio hasta la fecha de entrega del encargo (por defecto 7 días).
 */
export function responseEffect(kind: string, input: { reason?: string | null; until?: string | null; days?: number | null }, ctx: { now: Date; today: string; postpones: number }): { ok: true; effect: ResponseEffect } | { ok: false; error: string } {
  if (!(RESPONSES as readonly string[]).includes(kind)) return { ok: false, error: 'Esa respuesta no existe.' };
  const reason = String(input.reason ?? '').trim().slice(0, 500) || null;
  const plusDays = (n: number) => new Date(ctx.now.getTime() + n * 86_400_000);
  const endOf = (ymd: string) => new Date(`${addDays(ymd, 1)}T00:00:00Z`);
  switch (kind as ResponseKind) {
    case 'hecho':
    case 'lo_hago_yo':
      return { ok: true, effect: { status: 'silenciado', silencedUntil: plusDays(2), until: null, reason, message: 'Anotado. Se comprueba solo en las próximas evaluaciones: si desaparece, se cierra; si sigue, vuelve como vencido en 2 días.' } };
    case 'esperando_cliente': {
      const u = String(input.until ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(u) || u < ctx.today) return { ok: false, error: 'Pon la fecha hasta la que esperas al cliente (hoy o después).' };
      if (daysBetween(ctx.today, u) > 90) return { ok: false, error: 'Como mucho 90 días de espera.' };
      return { ok: true, effect: { status: 'silenciado', silencedUntil: endOf(u), until: u, reason, message: `En «esperando a terceros» hasta el ${u}. Si sigue abierto ese día, vuelve como vencido.` } };
    }
    case 'cliente_lo_quiere':
      if (!reason || reason.length < 3) return { ok: false, error: 'Escribe en una frase qué quiere el cliente: se guarda como su criterio.' };
      return { ok: true, effect: { status: 'descartado', silencedUntil: plusDays(365), until: null, reason, message: 'Guardado como criterio del cliente: no se vuelve a avisar de esta causa en un año.' } };
    case 'no_es_problema':
      if (!reason || reason.length < 3) return { ok: false, error: 'Explica en una frase por qué no es un problema.' };
      return { ok: true, effect: { status: 'descartado', silencedUntil: plusDays(90), until: null, reason, message: 'Descartado: no se vuelve a avisar de esta causa en 90 días.' } };
    case 'ya_lo_sabia':
      return { ok: true, effect: { status: 'silenciado', silencedUntil: plusDays(7), until: null, reason, message: 'Anotado (no cambia ningún umbral). Silenciado 7 días.' } };
    case 'posponer': {
      const d = Number(input.days);
      if (![1, 7, 28].includes(d)) return { ok: false, error: 'Se pospone 1, 7 o 28 días.' };
      if (ctx.postpones >= MAX_POSTPONES) return { ok: false, error: `Ya se pospuso ${MAX_POSTPONES} veces: decide o descártalo con un motivo.` };
      return { ok: true, effect: { status: 'silenciado', silencedUntil: plusDays(d), until: addDays(ctx.today, d), reason, message: `Pospuesto ${d} día${d > 1 ? 's' : ''} (${ctx.postpones + 1} de ${MAX_POSTPONES}).` } };
    }
    case 'encargar': {
      const u = input.until && /^\d{4}-\d{2}-\d{2}$/.test(input.until) && input.until >= ctx.today ? input.until : addDays(ctx.today, 7);
      return { ok: true, effect: { status: 'silenciado', silencedUntil: endOf(u), until: u, reason, message: `Silenciado mientras está el encargo (hasta el ${u}).` } };
    }
  }
}

// --- Revisión de cuenta y objetivo provisional (§7) --------------------------------------------------------------------

export const REVIEW_DAYS: Record<string, number> = { A: 7, B: 14, C: 30 };
export const REVIEW_DAYS_NO_LEVEL = 14;
export function nextReviewDate(today: string, level: string | null | undefined): string {
  return addDays(today, level && REVIEW_DAYS[level] ? REVIEW_DAYS[level] : REVIEW_DAYS_NO_LEVEL);
}

export const PROVISIONAL_MIN_CONVERSIONS = 15;
/**
 * Objetivo provisional congelado (2.2, R5 I8): coste total de los 90 días previos / conversiones primarias totales de esos
 * 90 días (por fecha de clic), excluyendo los últimos 7 días (las conversiones aún maduran). Con menos de 15, no se fija.
 */
export function provisionalGoal(rows: { day: string; cost: number; conversions: number }[], today: string): { ok: true; from: string; to: string; cost: number; conversions: number; cpl: number; monthly: number } | { ok: false; error: string; conversions: number } {
  const to = addDays(today, -8);
  const from = addDays(to, -89);
  let cost = 0;
  let conversions = 0;
  for (const r of rows) {
    if (r.day < from || r.day > to) continue;
    cost += r.cost;
    conversions += r.conversions;
  }
  if (conversions < PROVISIONAL_MIN_CONVERSIONS) return { ok: false, error: `Sin datos suficientes: ${Math.round(conversions)} conversiones en esos 90 días (hacen falta ${PROVISIONAL_MIN_CONVERSIONS}).`, conversions };
  return { ok: true, from, to, cost: round2(cost), conversions: Math.round(conversions * 100) / 100, cpl: round2(cost / conversions), monthly: round2((cost / 90) * 30.4) };
}
