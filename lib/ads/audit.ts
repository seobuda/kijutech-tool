import 'server-only';

// Módulo Google Ads · auditoría de higiene de entrada y su vigilancia (paso 3; diseño §13). SOLO LECTURA de Google Ads.
//
//  1. Datos: cada grupo (§13.3) se pide aparte, con su error aislado, cuando le toca por edad (1 o 7 días). El cupo
//     agotado para la descarga sin contarlo como fallo.
//  2. Controles: reglas puras de audit-rules.ts sobre lo del paso 1, los grupos y la ficha del cliente (o la simulada).
//  3. Primera vez (con estructura y métricas descargadas): auditoría de entrada con su fecha y sus controles. Después:
//     vigilancia diaria de esos controles (corregido / reapareció, con el cambio ajeno que lo explica). «Repetir» crea
//     otra auditoría y deja la anterior como sustituida.
// Nada de esto crea hallazgos visibles: la auditoría vive en el guion de revisión de la cuenta (paso 4 del guion).
import { AdsApiError, runQuery, type AdsConnection } from '@/lib/ads/client';
import { connectionFor } from '@/lib/ads/settings';
import { thresholdsOf } from '@/lib/ads/findings';
import { addDays, zonedParts } from '@/lib/ads/rules';
import { SIM_FICHAS } from '@/lib/ads/sim';
import * as store from '@/lib/ads/store';
import * as aud from '@/lib/ads/audit-store';
import { AQ, parseAdTypes, parseAuditCampaigns, parseAutomation, parseCallAssets, parseExclusions, parseGeoNames, parseGeoTargets, parseMigrations, parseNetworks, parseOptimizationScore, parseRecommendations, parseRecSubscriptions, parseSearchTerms, parseUserLocation } from '@/lib/ads/audit-queries';
import { AUDIT_DATA_KINDS, auditSummary, dataDue, regressionCause, runAuditControls, vigilanceStep, type AuditData, type AuditDataKind, type AuditInput, type AuditResult, type DataSlot, type Ficha } from '@/lib/ads/audit-rules';
import { CONTROL_INFO, FICHA_FACT_LABEL, FICHA_FACTS, type AuditControl, type AuditResponse, type FichaFact } from '@/lib/ads/audit-labels';
import { AUDIT_RESPONSES, AUDIT_RESPONSE_NEEDS_REASON } from '@/lib/ads/audit-labels';
import { reportError } from '@/lib/core/errors';
import type { AdsAccount, AdsAuditItemRow } from '@/lib/db/schema';

const DEFAULT_TZ = 'Europe/Madrid';

export class AdsAuditError extends Error {
  constructor(public readonly userMessage: string) {
    super(userMessage);
    this.name = 'AdsAuditError';
  }
}

// --- 1. Datos -----------------------------------------------------------------------------------------------------------

type Run = (q: Parameters<typeof runQuery>[2]) => Promise<Record<string, unknown>[]>;
/** Qué consultas lleva cada grupo y cómo se traduce. `period`: los 30 días cerrados. */
const FETCHERS: Record<AuditDataKind, (run: Run, period: { from: string; to: string }) => Promise<AuditData[AuditDataKind]>> = {
  campanas: async (run) => parseAuditCampaigns(await run(AQ.campaigns())),
  automatizacion: async (run) => parseAutomation(await run(AQ.automation())),
  migraciones: async (run) => parseMigrations(await run(AQ.migrations())),
  tipos_anuncio: async (run) => parseAdTypes(await run(AQ.adTypes())),
  suscripciones: async (run) => parseRecSubscriptions(await run(AQ.recSubscriptions())),
  exclusiones: async (run) => parseExclusions(await run(AQ.exclusions())),
  llamadas: async (run) => parseCallAssets(await run(AQ.callAssetsCampaign()), await run(AQ.callAssetsCustomer())),
  redes: async (run, p) => parseNetworks(await run(AQ.networks(p.from, p.to))),
  ubicacion_usuario: async (run, p) => parseUserLocation(await run(AQ.userLocation(p.from, p.to))),
  objetivos_geo: async (run) => {
    const targets = parseGeoTargets(await run(AQ.geoTargets()));
    const ids = [...new Set(targets.map((t) => t.geoId).filter((x): x is string => Boolean(x)))];
    const names = ids.length ? parseGeoNames(await run(AQ.geoNames(ids))) : [];
    return { targets, names };
  },
  terminos: async (run, p) => parseSearchTerms(await run(AQ.searchTerms(p.from, p.to))),
  recomendaciones: async (run) => ({ list: parseRecommendations(await run(AQ.recommendations())), score: parseOptimizationScore(await run(AQ.optimizationScore())) })
};

/** Pide los grupos que tocan. Un error de consulta solo marca su grupo; el cupo agotado para todo lo que queda. */
export async function refreshAuditData(tenantId: string, acc: AdsAccount, conn: AdsConnection, ctx: { now?: Date; signal?: AbortSignal; all?: boolean } = {}): Promise<{ fetched: string[]; failed: string[]; skipped: string | null }> {
  const now = ctx.now ?? new Date();
  const today = zonedParts(now, acc.timeZone || DEFAULT_TZ).date;
  const period = { from: addDays(today, -30), to: addDays(today, -1) };
  const last = new Map((await aud.auditDataRows(acc.id)).map((r) => [r.kind, r]));
  const run: Run = (q) => runQuery(conn, acc.customerId, q, { now, signal: ctx.signal });
  const fetched: string[] = [];
  const failed: string[] = [];
  for (const kind of Object.keys(AUDIT_DATA_KINDS) as AuditDataKind[]) {
    const l = last.get(kind);
    if (!ctx.all && !dataDue(kind, l ? { ok: l.ok, syncedAt: l.syncedAt } : null, now)) continue;
    try {
      const data = await FETCHERS[kind](run, period);
      await aud.saveAuditData(tenantId, acc.id, kind, { ok: true, from: period.from, to: period.to, data }, now);
      fetched.push(kind);
    } catch (e) {
      if (e instanceof AdsApiError && (e.code === 'cupo_dia' || e.code === 'cupo_propio')) return { fetched, failed, skipped: e.message };
      if (!(e instanceof AdsApiError)) reportError({ source: 'ads', area: 'auditoria', tenantId, message: `Google Ads: error interno al pedir «${kind}» de la auditoría`, error: e, severity: 'error' });
      // El error de Google se guarda literal (sin secretos) para que el control diga por qué no se comprobó.
      await aud.saveAuditData(tenantId, acc.id, kind, { ok: false, error: e instanceof AdsApiError ? e.message : 'Error interno (detalle en el registro de errores).' }, now);
      failed.push(kind);
    }
  }
  return { fetched, failed, skipped: null };
}

// --- 2. Foto de la cuenta y ficha ----------------------------------------------------------------------------------------

/** Ficha del cliente (o la simulada). Sin cliente vinculado: null (los controles que la necesitan dicen «no comprobado»). */
export async function fichaFor(tenantId: string, acc: AdsAccount, now: Date): Promise<Ficha | null> {
  if (acc.simulated) {
    const s = SIM_FICHAS[acc.customerId];
    if (!s) return null;
    const confirmed: Ficha['confirmed'] = {};
    for (const f of FICHA_FACTS) {
      const d = s.confirmedDaysAgo[f];
      confirmed[f] = d === undefined ? null : new Date(now.getTime() - d * 86_400_000);
    }
    return { source: 'simulada', clientName: acc.name ?? acc.customerId, brands: s.brands, competitors: s.competitors, zoneText: s.zoneText, phones: s.phones, hours: s.hours, sector: s.sector, local: true, services: s.services, confirmed };
  }
  if (!acc.clientId) return null;
  const c = await aud.loadClientFicha(tenantId, acc.clientId);
  if (!c) return null;
  const zoneParts = [c.area, ...c.locations.flatMap((l) => [l.city, l.region])].filter((x): x is string => Boolean(x && x.trim()));
  const confirmed: Ficha['confirmed'] = {};
  for (const f of FICHA_FACTS) confirmed[f] = c.facts.get(f)?.confirmedAt ?? null;
  return {
    source: 'ficha',
    clientName: c.name,
    brands: [c.name, ...c.aliases].filter(Boolean),
    competitors: c.competitors.flatMap((x) => [x.name, ...(x.domain ? [x.domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[./]/)[0]] : [])]).filter(Boolean),
    zoneText: [...new Set(zoneParts)].join(', '),
    phones: [...new Set(c.locations.map((l) => l.phone).filter((x): x is string => Boolean(x)))],
    hours: c.locations.map((l) => l.hours).find((h) => h && h.trim()) ?? null,
    sector: c.sector ?? c.businessType,
    local: c.locations.length > 0 || Boolean(c.area),
    services: c.offerings,
    confirmed
  };
}

/** Lo que dice la ficha de cada dato, en texto (para la pantalla y para guardar lo confirmado). */
export function fichaValue(f: Ficha, fact: FichaFact): string {
  switch (fact) {
    case 'marca':
      return f.brands.join(', ');
    case 'zona':
      return f.zoneText;
    case 'telefono':
      return f.phones.join(', ');
    case 'horario':
      return f.hours ?? '';
    case 'competidores':
      return f.competitors.join(', ');
    case 'sector':
      return f.sector ?? '';
    case 'servicios':
      return f.services ?? '';
  }
}

export async function buildAuditInput(tenantId: string, acc: AdsAccount, now: Date): Promise<AuditInput> {
  const tz = acc.timeZone || DEFAULT_TZ;
  const today = zonedParts(now, tz).date;
  const base = await aud.loadAuditBase(acc.id, addDays(today, -125), new Date(now.getTime() - 35 * 86_400_000));
  const data: AuditInput['data'] = {};
  for (const r of await aud.auditDataRows(acc.id)) {
    if (!(r.kind in AUDIT_DATA_KINDS)) continue;
    (data as Record<string, DataSlot<AuditDataKind>>)[r.kind] = { ok: r.ok, error: r.error, syncedAt: r.syncedAt, from: r.dataFrom, to: r.dataTo, rows: (r.data ?? null) as AuditData[AuditDataKind] | null };
  }
  const settings = await store.getSettingsRow(tenantId);
  return { accountId: acc.id, name: acc.name ?? acc.customerId, currency: acc.currency, today, now, autoTagging: acc.autoTagging, ...base, data, ficha: await fichaFor(tenantId, acc, now), t: thresholdsOf(settings) };
}

// --- 3. Auditoría de entrada y vigilancia --------------------------------------------------------------------------------

const evidenceOf = (r: AuditResult, extra: Record<string, unknown> = {}) => ({ lines: r.lines, todo: r.todo, reason: r.reason, data: r.data, campaignNativeIds: r.campaignNativeIds, ...extra });

export type AuditRunSummary = { accountId: string; mode: 'entrada' | 'vigilancia'; auditId: string; fetched: string[]; failed: string[]; summary: ReturnType<typeof auditSummary>; fixed: string[]; regressed: string[] };

/**
 * Audita una cuenta: refresca los datos que tocan y crea la auditoría de entrada (si no hay, o si `fresh`) o actualiza la
 * vigilancia de la vigente. Sin estructura ni métricas descargadas no se audita todavía (no se afirmaría nada).
 */
export async function runAudit(tenantId: string, accountId: string, opts: { now?: Date; fresh?: boolean; userId?: number | null; signal?: AbortSignal } = {}): Promise<AuditRunSummary | { skipped: string }> {
  const now = opts.now ?? new Date();
  const { conn, reason, row } = await connectionFor(tenantId);
  if (!conn) return { skipped: reason ?? 'Google Ads no está configurado' };
  const acc = await store.getAccount(tenantId, accountId);
  if (!acc) return { skipped: 'esa cuenta ya no existe' };
  if (acc.simulated !== (row?.authMode === 'sim')) return { skipped: 'cuenta de otro modo (simulado o real)' };
  if (!acc.tracked) return { skipped: 'la cuenta no se sigue' };
  const structure = await store.getSyncState(tenantId, acc.id, 'estructura');
  const metrics = await store.getSyncState(tenantId, acc.id, 'metricas');
  if (!structure?.lastOkAt || !metrics?.lastOkAt) return { skipped: 'esperando la primera descarga de estructura y métricas' };

  const pulled = await refreshAuditData(tenantId, acc, conn, { now, signal: opts.signal, all: opts.fresh });
  if (pulled.skipped && !pulled.fetched.length) {
    // Cupo agotado antes de pedir nada: si ya hay datos guardados, se sigue con ellos (dirán su edad); si no, se espera.
    const have = await aud.auditDataRows(acc.id);
    if (!have.length) return { skipped: pulled.skipped };
  }
  const input = await buildAuditInput(tenantId, acc, now);
  const results = runAuditControls(input);
  const current = opts.fresh ? null : await aud.currentAudit(tenantId, acc.id);

  if (!current) {
    const baseline = results.find((r) => r.control === 'linea_base');
    const id = await aud.createAudit(
      { tenantId, accountId: acc.id, kind: 'entrada', createdAt: now, createdBy: opts.userId ?? null, dataThrough: addDays(input.today, -1), baseline: baseline?.status === 'bien' ? baseline.data : {}, summary: auditSummary(results) },
      results.map((r) => ({
        tenantId,
        accountId: acc.id,
        control: r.control,
        tanda: CONTROL_INFO[r.control].tanda,
        risk: CONTROL_INFO[r.control].risk,
        initialStatus: r.status,
        status: r.status,
        needsConfirmation: r.needsConfirmation,
        title: r.title.slice(0, 300),
        evidence: evidenceOf(r),
        exposure: r.exposure === null ? null : r.exposure.toFixed(2),
        currency: acc.currency,
        prediction: r.prediction,
        checkedAt: now
      })),
      now
    );
    return { accountId: acc.id, mode: 'entrada', auditId: id, fetched: pulled.fetched, failed: pulled.failed, summary: auditSummary(results), fixed: [], regressed: [] };
  }

  // Vigilancia (EST-06): solo la parte viva; el resultado de entrada (`initial_status`) no se toca nunca.
  const items = new Map((await aud.listItems(tenantId, current.id)).map((i) => [i.control, i]));
  const fixed: string[] = [];
  const regressed: string[] = [];
  for (const r of results) {
    const it = items.get(r.control);
    if (!it) continue;
    const step = vigilanceStep({ status: it.status as AuditResult['status'], fixedAt: it.fixedAt, regressedAt: it.regressedAt, regressionCount: it.regressionCount }, r.status, now);
    if (r.status === 'no_comprobado') {
      // Sin dato: no se acusa ni se absuelve; solo se apunta por qué y desde cuándo (como «sin comprobar desde…»).
      const ev = (it.evidence ?? {}) as Record<string, unknown>;
      await aud.updateItem(tenantId, it.id, { evidence: { ...ev, uncheckedReason: r.reason, uncheckedSince: (ev.uncheckedSince as string | undefined) ?? now.toISOString() } });
      continue;
    }
    let cause: { actor: string; text: string } | null = null;
    if (step.regressed) {
      // Desde la última vez que se vio bien (o 30 días como mucho: es lo que guarda el historial de Google).
      const since = new Date(Math.max(it.checkedAt.getTime() - 86_400_000, now.getTime() - 30 * 86_400_000));
      cause = regressionCause(r.campaignNativeIds, input.changes, since);
      regressed.push(r.control);
    }
    if (step.fixed) fixed.push(r.control);
    await aud.updateItem(tenantId, it.id, {
      status: step.status,
      needsConfirmation: r.needsConfirmation,
      title: r.title.slice(0, 300),
      evidence: evidenceOf(r, step.regressed ? { regressionActor: cause?.actor ?? null } : { regressionActor: ((it.evidence ?? {}) as { regressionActor?: string | null }).regressionActor ?? null }),
      exposure: r.exposure === null ? null : r.exposure.toFixed(2),
      prediction: r.prediction ?? it.prediction,
      checkedAt: now,
      fixedAt: step.fixedAt,
      regressedAt: step.regressedAt,
      regressionCount: step.regressionCount,
      ...(step.regressed ? { regressionCause: cause ? cause.text : 'Sin cambio ajeno que lo explique: revisarlo en la revisión de cuenta.' } : {}),
      // Al corregirse, una respuesta «más tarde» deja de tener sentido; «hecho» queda como registro.
      ...(step.fixed && it.response === 'mas_tarde' ? { response: null } : {})
    });
  }
  const all = await aud.listItems(tenantId, current.id);
  const summary = auditSummary(all.map((i) => ({ control: i.control, status: i.status as AuditResult['status'], needsConfirmation: i.needsConfirmation })));
  await aud.updateAudit(tenantId, current.id, { summary: { ...summary, lastVigilanceAt: now.toISOString() } });
  return { accountId: acc.id, mode: 'vigilancia', auditId: current.id, fetched: pulled.fetched, failed: pulled.failed, summary, fixed, regressed };
}

/** Todas las cuentas seguidas del modo actual (pruebas y verificación; lo normal va por la cola). */
export async function runAuditAll(tenantId: string, opts: { now?: Date; fresh?: boolean } = {}): Promise<(AuditRunSummary | { skipped: string })[]> {
  const row = await store.getSettingsRow(tenantId);
  if (!row || row.authMode === 'none') return [];
  const out: (AuditRunSummary | { skipped: string })[] = [];
  for (const a of await store.listAccounts(tenantId, { trackedOnly: true, simulated: row.authMode === 'sim' })) out.push(await runAudit(tenantId, a.id, opts));
  return out;
}

// --- Lo que decide el gestor -------------------------------------------------------------------------------------------

type Who = { id: number; name: string | null; email: string };

/** Respuesta a un control. «Hecho» en un R2/R3 deja aprobada su predicción (APR-01); los descartes piden motivo. */
export async function respondToAuditItem(tenantId: string, user: Who, itemId: string, response: string, reason: string | null, now: Date = new Date()): Promise<{ message: string }> {
  if (!(AUDIT_RESPONSES as readonly string[]).includes(response)) throw new AdsAuditError('Esa respuesta no existe.');
  const it = await aud.getItem(tenantId, itemId);
  if (!it) throw new AdsAuditError('Ese control ya no existe.');
  const audit = await aud.getAudit(tenantId, it.auditId);
  if (!audit || audit.supersededAt) throw new AdsAuditError('Esa auditoría ya se repitió: responde en la vigente.');
  const clean = String(reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 300) || null;
  if (AUDIT_RESPONSE_NEEDS_REASON.includes(response as AuditResponse) && (!clean || clean.length < 3)) throw new AdsAuditError('Escribe el motivo en una línea: queda registrado como decisión de no actuar.');
  const who = user.name || user.email;
  const entry: Record<string, unknown> = { at: now.toISOString(), by: who, response, reason: clean };
  if (response === 'hecho' && it.prediction && (it.risk === 'R2' || it.risk === 'R3')) entry.approvedPrediction = it.prediction;
  await aud.updateItem(tenantId, it.id, { response, responseReason: clean, respondedBy: user.id, respondedAt: now, history: [...(it.history ?? []), entry].slice(-30) });
  const message =
    response === 'hecho'
      ? it.control === 'propiedad_accesos'
        ? 'Anotado: propiedad y accesos comprobados a mano.'
        : 'Anotado. La vigilancia de mañana comprobará que está corregido; si vuelve, saldrá como «reapareció».'
      : response === 'mas_tarde'
        ? 'Queda pendiente; sigue en la lista.'
        : 'Anotado con su motivo: no volverá a salir entre los 3 del guion.';
  return { message };
}

export async function markAuditRead(tenantId: string, user: Who, auditId: string, now: Date = new Date()): Promise<void> {
  const a = await aud.getAudit(tenantId, auditId);
  if (!a) throw new AdsAuditError('Esa auditoría ya no existe.');
  await aud.updateAudit(tenantId, auditId, { readAt: now, readBy: user.id });
}

/** «Confirmar» un dato de la ficha (NEG-07): se guarda la fecha, quién y lo que decía la ficha en ese momento. */
export async function confirmFichaFact(tenantId: string, user: Who, accountId: string, fact: string, now: Date = new Date()): Promise<{ message: string }> {
  if (!(FICHA_FACTS as string[]).includes(fact)) throw new AdsAuditError('Ese dato de la ficha no existe.');
  const acc = await store.getAccount(tenantId, accountId);
  if (!acc) throw new AdsAuditError('Esa cuenta no existe.');
  if (acc.simulated) throw new AdsAuditError('Las cuentas simuladas tienen una ficha simulada: no se confirma.');
  if (!acc.clientId) throw new AdsAuditError('Vincula antes la cuenta con su cliente (Ajustes de Google Ads).');
  const f = await fichaFor(tenantId, acc, now);
  if (!f) throw new AdsAuditError('No se encuentra la ficha del cliente.');
  const value = fichaValue(f, fact as FichaFact);
  await aud.confirmFact(tenantId, acc.clientId, fact as FichaFact, user.id, value, now);
  return { message: `«${FICHA_FACT_LABEL[fact as FichaFact]}» confirmado${value ? `: ${value.slice(0, 120)}` : ' (vacío en la ficha)'}. La auditoría lo tendrá en cuenta en la próxima pasada.` };
}

export type { AdsAuditItemRow, AuditControl };
