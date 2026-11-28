import 'server-only';

// Módulo Google Ads · evaluación de los hallazgos del paso 2 (diseño §6.2-6.5). Sin llamadas a Google: todo sale de lo
// guardado por la descarga. Por cada cuenta:
//   1. Foto de la cuenta (lo descargado) y salud de sus fuentes (MED-00).
//   2. Cada regla con su comprobación previa (fuentes sanas y ventana cubierta). Las «horarias» (interrupciones y rechazo)
//      van en cada evaluación; las «diarias» (medición, ritmo, pausado, cambio ajeno) solo cuando sus fuentes traen datos
//      nuevos (métricas o cambios, cada 6 h y a las 06:30), al cambiar de día o si la última vez no se pudieron comprobar.
//   3. Resultado de cada regla en ads_rule_runs (la cabecera de Hoy cuenta los «no comprobado»).
//   4. Ciclo de vida (§6.3): un hallazgo solo se resuelve si su regla se evaluó con fuentes sanas y ya no lo ve; con «no
//      comprobado» se queda como estaba («sin comprobar desde…»). Una causa = un hallazgo vivo (índice único); cada
//      aparición nueva es un episodio. Precedencia (§6.2): lo de rango inferior sobre la misma cuenta o campaña no se
//      emite mientras haya uno superior. Un descarte vigente («el cliente lo quiere así», «no es un problema») no vuelve a
//      abrir esa causa. Un silencio vencido vuelve a «abierto» (vencido) si la regla lo sigue viendo.
import { addDays, CORE_SOURCES, SOURCES, sourceHealth, zonedParts, type AdsSource, type SourceHealth } from '@/lib/ads/rules';
import { applyPrecedence, mergeThresholds, ruleDefs, runRule, ruleAccountCannotServe, ruleSourceHealth, type AccountInput, type FindingDraft, type FindingKind, type RuleResult } from '@/lib/ads/finding-rules';
import * as fs from '@/lib/ads/findings-store';
import { getSettingsRow, listAccounts, listSyncStates } from '@/lib/ads/store';
import type { AdsAccount, AdsSettingsRow, AdsSyncStateRow } from '@/lib/db/schema';

const DEFAULT_TZ = 'Europe/Madrid';
/** Horas de margen del dato horario: la última hora «buena» es la del último latido menos esto [verificar el retraso real]. */
export const HOURLY_LAG_HOURS = 2;

export type EvalMode = 'auto' | 'todas';
export type EvalSummary = { accountId: string; evaluated: string[]; outcomes: Record<string, string>; opened: number; updated: number; resolved: number; suppressed: number };

type State = AdsSettingsRow['state'] & { thresholds?: Record<string, number> };
export const thresholdsOf = (row: AdsSettingsRow | null) => mergeThresholds((row?.state as State | undefined)?.thresholds);

/** Salud de cada fuente de una cuenta en este momento (con la hora local, por el latido y las páginas). */
function healthOf(states: AdsSyncStateRow[], accountId: string, now: Date, localHour: number): { health: Partial<Record<AdsSource, SourceHealth>>; detail: AccountInput['sourceDetail'] } {
  const by = new Map(states.filter((s) => s.scopeKey === accountId).map((s) => [s.source, s]));
  const health: Partial<Record<AdsSource, SourceHealth>> = {};
  const detail: NonNullable<AccountInput['sourceDetail']> = {};
  for (const src of SOURCES) {
    const st = by.get(src);
    const h = sourceHealth(st ? { source: src, lastOkAt: st.lastOkAt, consecutiveFailures: st.consecutiveFailures, expectedEveryMinutes: st.expectedEveryMinutes } : null, now, { localHour });
    health[src] = h.health;
    detail[src] = { lastOkAt: st?.lastOkAt?.toISOString() ?? null, lastError: st?.lastError ?? null, critical: h.critical };
  }
  return { health, detail };
}

/** Foto completa de una cuenta para las reglas. */
export async function buildAccountInput(tenantId: string, acc: AdsAccount, now: Date, settings: AdsSettingsRow | null, states?: AdsSyncStateRow[]): Promise<AccountInput> {
  const tz = acc.timeZone || DEFAULT_TZ;
  const local = zonedParts(now, tz);
  const today = local.date;
  const raw = await fs.loadAccountRaw(acc.id, addDays(today, -130), addDays(today, -29), new Date(now.getTime() - 30 * 86_400_000));
  const st = states ?? (await listSyncStates(tenantId));
  const { health, detail } = healthOf(st, acc.id, now, local.hour);
  // Última hora del día cuyo dato horario se da por bueno: la del último latido de hoy menos el margen.
  const lat = st.find((s) => s.scopeKey === acc.id && s.source === 'latido');
  let hourlyThrough: number | null = null;
  if (lat?.lastOkAt) {
    const p = zonedParts(lat.lastOkAt, tz);
    if (p.date === today && p.hour - HOURLY_LAG_HOURS >= 0) hourlyThrough = p.hour - HOURLY_LAG_HOURS;
  }
  const goal = acc.clientId ? await fs.latestGoal(tenantId, acc.clientId) : null;
  return {
    accountId: acc.id,
    name: acc.name ?? acc.customerId,
    status: acc.status,
    currency: acc.currency,
    today,
    hour: local.hour,
    now,
    ...raw,
    hourlyDays: new Set(raw.hourly.map((h) => h.day)),
    hourlyThrough,
    goal: goal ? { kind: goal.kind as 'provisional' | 'acordado', cplMax: goal.cplMax ? Number(goal.cplMax) : null, budgetUsual: goal.budgetUsual ? Number(goal.budgetUsual) : null } : null,
    health,
    sourceDetail: detail,
    firstSeenAt: acc.firstSeenAt,
    t: thresholdsOf(settings)
  };
}

/**
 * ¿Toca la evaluación de esta regla diaria? Nunca evaluada, «no comprobado» la última vez, día nuevo (tras las 06:00), o
 * alguna de sus fuentes trajo datos después de la última evaluación (si no, una evaluación encolada por otra fuente,
 * p. ej. las páginas, la dejaría calculada con los datos de ayer todo el día).
 */
function dailyDue(last: fs.RuleRunRow | undefined, now: Date, tz: string, sourcesOkAt: Date | null): boolean {
  if (!last) return true;
  if (last.outcome === 'no_comprobado') return true;
  if (sourcesOkAt && sourcesOkAt > last.evaluatedAt) return true;
  const l = zonedParts(last.evaluatedAt, tz);
  const n = zonedParts(now, tz);
  if (l.date !== n.date) return true;
  return l.hour < 6 && n.hour >= 6;
}

/** Aplica el resultado de las reglas evaluadas a los hallazgos de la cuenta (ciclo de vida, §6.3). */
async function applyResults(tenantId: string, acc: AdsAccount | null, results: Map<FindingKind, RuleResult>, now: Date): Promise<Pick<EvalSummary, 'opened' | 'updated' | 'resolved' | 'suppressed'>> {
  const accountId = acc?.id ?? null;
  const live = await fs.liveFindings(tenantId, accountId);
  const campaignIds = accountId ? await fs.campaignInternalIds(accountId) : new Map<string, string>();
  const drafts = [...results.values()].flatMap((r) => r.findings);
  // Los superiores ya abiertos (de reglas que esta vez no se evaluaron) también mandan.
  // (Los de reglas evaluadas ahora no cuentan: su estado de hoy son los borradores.)
  const openHigher = live.filter((f) => f.status === 'abierto' && !results.has(f.kind as FindingKind)).map((f) => ({ kind: f.kind as FindingKind, scope: f.scope, campaignNativeId: ((f.evidence as { campaignNativeId?: string }).campaignNativeId ?? null) as string | null, causeKey: f.causeKey }));
  const { emit, suppressed } = applyPrecedence(drafts, openHigher);
  const byCause = new Map(live.map((f) => [f.causeKey, f]));
  const stats = { opened: 0, updated: 0, resolved: 0, suppressed: 0 };

  const touch = async (f: fs.FindingRow, d: FindingDraft, extra: Record<string, unknown> = {}) => {
    const expired = f.status === 'silenciado' && f.silencedUntil && f.silencedUntil < now;
    await fs.updateFinding(tenantId, f.id, {
      title: d.title.slice(0, 300),
      evidence: { ...evidenceOf(d), ...extra, ...(expired ? { vencido: true } : {}) },
      exposure: d.exposure === null ? null : d.exposure.toFixed(2),
      severity: d.severity,
      channel: d.channel,
      confidence: d.confidence,
      lastSeenAt: now,
      lastCheckedAt: now,
      uncheckedSince: null,
      ...(expired ? { status: 'abierto' } : {})
    });
    stats.updated++;
  };

  for (const d of emit) {
    const f = byCause.get(d.causeKey);
    const related = suppressed.filter((s) => s.by === d.causeKey).map((s) => s.draft.title);
    if (f) {
      await touch(f, d, related.length ? { related } : {});
      continue;
    }
    if (await fs.activeDiscard(tenantId, d.causeKey, now)) continue;
    const id = await fs.insertFinding({
      tenantId,
      accountId,
      campaignId: d.campaignNativeId ? (campaignIds.get(d.campaignNativeId) ?? null) : null,
      scope: d.scope,
      kind: d.kind,
      causeKey: d.causeKey.slice(0, 300),
      episodeStartedAt: now,
      channel: d.channel,
      recipient: d.recipient,
      severity: d.severity,
      title: d.title.slice(0, 300),
      evidence: { ...evidenceOf(d), ...(related.length ? { related } : {}) },
      exposure: d.exposure === null ? null : d.exposure.toFixed(2),
      currency: acc?.currency ?? null,
      confidence: d.confidence,
      status: 'abierto',
      firstSeenAt: now,
      lastSeenAt: now,
      lastCheckedAt: now
    });
    if (id) stats.opened++;
  }
  // Los suprimidos por precedencia que ya tenían hallazgo vivo: siguen vivos (no se resuelven por estar tapados).
  for (const s of suppressed) {
    stats.suppressed++;
    const f = byCause.get(s.draft.causeKey);
    if (f) await fs.updateFinding(tenantId, f.id, { lastSeenAt: now, lastCheckedAt: now, uncheckedSince: null });
  }
  // Resolver: solo lo de reglas evaluadas con resultado firme («ok» o «hallazgo») que ya no aparece.
  const seen = new Set(drafts.map((d) => d.causeKey));
  for (const f of live) {
    const r = results.get(f.kind as FindingKind);
    if (!r) continue;
    if (r.outcome === 'no_comprobado' || r.uncheckedCauses?.includes(f.causeKey)) {
      if (!f.uncheckedSince) await fs.updateFinding(tenantId, f.id, { uncheckedSince: now });
      continue;
    }
    if (!seen.has(f.causeKey)) {
      await fs.updateFinding(tenantId, f.id, { status: 'resuelto', resolvedAt: now, lastCheckedAt: now });
      stats.resolved++;
    }
  }
  return stats;
}

function evidenceOf(d: FindingDraft): Record<string, unknown> {
  return { lines: d.lines, data: d.data, fyi: d.fyi, campaignNativeId: d.campaignNativeId };
}

/**
 * Evalúa una cuenta. `auto`: las reglas horarias siempre y las diarias si tocan; `todas`: todas. Las cuentas que ya no se
 * siguen porque Google las suspendió o canceló solo pasan por la regla 1 (estado de la cuenta).
 */
export async function evaluateAccount(tenantId: string, accountId: string, opts: { mode?: EvalMode; now?: Date } = {}): Promise<EvalSummary | { skipped: string }> {
  const now = opts.now ?? new Date();
  const settings = await getSettingsRow(tenantId);
  if (!settings || settings.authMode === 'none') return { skipped: 'Google Ads no está configurado' };
  const acc = (await listAccounts(tenantId)).find((a) => a.id === accountId);
  if (!acc) return { skipped: 'esa cuenta ya no existe' };
  if (acc.simulated !== (settings.authMode === 'sim')) return { skipped: 'cuenta de otro modo (simulado o real)' };
  const states = await listSyncStates(tenantId);
  const input = await buildAccountInput(tenantId, acc, now, settings, states);
  const tz = acc.timeZone || DEFAULT_TZ;
  const runs = new Map((await fs.listRuleRuns(tenantId, acc.id)).map((r) => [r.rule, r]));
  const results = new Map<FindingKind, RuleResult>();

  if (!acc.tracked) {
    // Solo el estado de la cuenta (una cuenta que Google suspende deja de seguirse en «descubrir»). Lo demás de una cuenta
    // que ya no se sigue se cierra: nadie lo va a comprobar (revisor, 28 nov).
    results.set('cuenta_no_sirve', ruleAccountCannotServe(input));
    await fs.closeAccountFindings(tenantId, acc.id, now, 'cuenta_no_sirve');
  } else {
    results.set('fuente_sin_datos', ruleSourceHealth(input));
    const changeDayOf = (d: Date) => zonedParts(d, tz).date;
    for (const def of ruleDefs(changeDayOf)) {
      if (opts.mode !== 'todas' && def.cadence === 'diaria') {
        const okAt = states.filter((s) => s.scopeKey === acc.id && def.sources.includes(s.source as AdsSource) && s.lastOkAt).map((s) => s.lastOkAt!.getTime());
        if (!dailyDue(runs.get(def.kind), now, tz, okAt.length ? new Date(Math.max(...okAt)) : null)) continue;
      }
      results.set(def.kind, runRule(def, input));
    }
  }
  for (const [kind, r] of results) await fs.upsertRuleRun(tenantId, acc.id, kind, r.outcome, r.reason, r.dataThrough, now);
  const stats = await applyResults(tenantId, acc, results, now);
  return { accountId: acc.id, evaluated: [...results.keys()], outcomes: Object.fromEntries([...results].map(([k, v]) => [k, v.outcome])), ...stats };
}

/**
 * Lo de toda la agencia (hallazgo 15 de ámbito «agencia»): si la lista de cuentas de la MCC no se descarga (credencial
 * caída, acceso retirado), es una sola causa para todas las cuentas.
 */
export async function evaluateAgency(tenantId: string, now: Date = new Date()): Promise<void> {
  const settings = await getSettingsRow(tenantId);
  if (!settings || settings.authMode === 'none' || !settings.syncEnabled) return;
  const st = (await listSyncStates(tenantId)).find((s) => s.scopeKey === '' && s.source === 'descubrir');
  const h = sourceHealth(st ? { source: 'descubrir', lastOkAt: st.lastOkAt, consecutiveFailures: st.consecutiveFailures, expectedEveryMinutes: st.expectedEveryMinutes } : null, now);
  const result: RuleResult =
    h.health === 'sana' || h.health === 'sin_datos'
      ? { outcome: 'ok', reason: h.health === 'sin_datos' ? 'la MCC aún no se ha descargado' : null, findings: [], dataThrough: null }
      : {
          outcome: 'hallazgo',
          reason: null,
          dataThrough: null,
          findings: [
            {
              kind: 'fuente_sin_datos',
              scope: 'agencia',
              campaignNativeId: null,
              causeKey: 'fuente:mcc',
              channel: 'interrupcion',
              recipient: 'tecnico',
              severity: 'alta',
              fyi: false,
              title: 'La lista de cuentas de la MCC no se descarga: la vigilancia de todas las cuentas está ciega',
              lines: [`Estado: ${h.health === 'caida' ? 'caída' : 'atrasada'}.`, st?.lastError ? `Último error de Google: ${st.lastError.slice(0, 200)}` : 'Sin error guardado.', 'Abre Google Ads → Ajustes → «Probar conexión»: el mensaje dice si es la clave, el acceso a la MCC o el cupo.'],
              data: { health: h.health },
              exposure: null,
              confidence: 'alta'
            }
          ]
        };
  await fs.upsertRuleRun(tenantId, null, 'fuente_sin_datos', result.outcome, result.reason, null, now);
  await applyResults(tenantId, null, new Map([['fuente_sin_datos', result]]), now);
}

/** Todas las cuentas que tocan (las seguidas del modo actual y las que Google suspendió con gasto reciente). */
export async function evaluateAll(tenantId: string, opts: { mode?: EvalMode; now?: Date } = {}): Promise<EvalSummary[]> {
  const settings = await getSettingsRow(tenantId);
  if (!settings || settings.authMode === 'none') return [];
  const sim = settings.authMode === 'sim';
  const out: EvalSummary[] = [];
  await evaluateAgency(tenantId, opts.now);
  for (const a of await listAccounts(tenantId, { simulated: sim })) {
    if (!a.tracked && !['SUSPENDED', 'CANCELED', 'CLOSED'].includes(a.status ?? '')) continue;
    if (!a.tracked && !(await recentlySpent(tenantId, a.id, opts.now ?? new Date()))) continue;
    const r = await evaluateAccount(tenantId, a.id, opts);
    if ('accountId' in r) out.push(r);
  }
  return out;
}

async function recentlySpent(tenantId: string, accountId: string, now: Date): Promise<boolean> {
  const from = addDays(now.toISOString().slice(0, 10), -14);
  const rows = await fs.dailyTotalsByAccount([accountId], from, now.toISOString().slice(0, 10));
  void tenantId;
  return rows.some((r) => r.cost > 0);
}

/** Fuentes que mira la cabecera (para la pantalla). */
export const HEADER_SOURCES: AdsSource[] = CORE_SOURCES;
