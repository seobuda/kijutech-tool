import 'server-only';

// Módulo Google Ads · MED-00: salud de nuestras propias fuentes (diseño §5). Saber cuándo el vigilante está ciego.
//  - `coverageSummary`: la cabecera de cobertura real («comprobadas X de Y cuentas; N sin datos desde…»).
//  - `sourceHealthFor`: lo que leerán las reglas del paso 2 antes de afirmar nada (si no está sana → «no comprobado»).
//  - `adsHealth`: comprobación para Salud del sistema (registerHealthCheck), con el cupo, la edad de la clave y la fecha
//    de retirada de la versión de la API (GOO-07).
import type { ModuleCheck } from '@/lib/core/capabilities';
import { CORE_SOURCES, daysBetween, pacificDay, SOURCE_LABEL, sourceHealth, windowCoverage, zonedParts, type AdsSource, type SourceHealth } from '@/lib/ads/rules';
import { clientNames, coverageRows, getSettingsRow, getUsage, listAccounts, listSyncStates } from '@/lib/ads/store';
import type { AdsSyncStateRow } from '@/lib/db/schema';

export type SourceStatus = { source: AdsSource; label: string; health: SourceHealth; critical: boolean; ageMinutes: number | null; lastOkAt: string | null; lastError: string | null };
export type AccountCoverage = {
  accountId: string;
  customerId: string;
  name: string | null;
  simulated: boolean;
  clientName: string | null;
  checked: boolean;
  sources: SourceStatus[];
  problems: SourceStatus[];
};
export type CoverageSummary = {
  configured: boolean;
  mode: 'none' | 'service_account' | 'sim';
  syncEnabled: boolean;
  total: number;
  checked: number;
  accounts: AccountCoverage[];
  mcc: SourceStatus | null;
  usage: { operations: number; budget: number; errors: number; lastError: string | null };
  headline: string;
};

function statusOf(state: AdsSyncStateRow | undefined, source: AdsSource, now: Date, localHour: number): SourceStatus {
  const h = sourceHealth(state ? { source, lastOkAt: state.lastOkAt, consecutiveFailures: state.consecutiveFailures, expectedEveryMinutes: state.expectedEveryMinutes } : null, now, { localHour });
  return { source, label: SOURCE_LABEL[source], health: h.health, critical: h.critical, ageMinutes: h.ageMinutes, lastOkAt: state?.lastOkAt?.toISOString() ?? null, lastError: state?.lastError ?? null };
}

const fmtAge = (m: number | null) => (m === null ? 'nunca' : m < 120 ? `hace ${m} min` : m < 48 * 60 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`);

export async function coverageSummary(tenantId: string, now: Date = new Date()): Promise<CoverageSummary> {
  const settings = await getSettingsRow(tenantId);
  const mode = (settings?.authMode as CoverageSummary['mode']) ?? 'none';
  const simulatedMode = mode === 'sim';
  const states = await listSyncStates(tenantId);
  const by = new Map(states.map((s) => [`${s.scopeKey}|${s.source}`, s]));
  const accounts = (await listAccounts(tenantId, { trackedOnly: true })).filter((a) => a.simulated === simulatedMode);
  const names = await clientNames(tenantId, accounts.map((a) => a.clientId).filter((x): x is string => Boolean(x)));
  const rows: AccountCoverage[] = accounts.map((a) => {
    const localHour = zonedParts(now, a.timeZone || 'Europe/Madrid').hour;
    const sources = CORE_SOURCES.map((s) => statusOf(by.get(`${a.id}|${s}`), s, now, localHour));
    const problems = sources.filter((s) => s.health !== 'sana');
    return { accountId: a.id, customerId: a.customerId, name: a.name, simulated: a.simulated, clientName: a.clientId ? (names.get(a.clientId) ?? null) : null, checked: problems.length === 0, sources, problems };
  });
  const mcc = by.has('|descubrir') ? statusOf(by.get('|descubrir'), 'descubrir', now, 12) : null;
  const usage = await getUsage(tenantId, pacificDay(now));
  const checked = rows.filter((r) => r.checked).length;
  let headline: string;
  if (mode === 'none') headline = 'Google Ads aún no está conectado.';
  else if (!settings?.syncEnabled) headline = 'La descarga está apagada: no se comprueba ninguna cuenta.';
  else if (!rows.length) headline = 'Aún no hay cuentas descargadas de la MCC.';
  else {
    const missing = rows.filter((r) => !r.checked);
    const oldest = missing.flatMap((r) => r.problems).map((p) => p.lastOkAt).filter(Boolean).sort()[0];
    headline = `Comprobadas ${checked} de ${rows.length} cuentas${missing.length ? `; ${missing.length} sin datos al día${oldest ? ` (la más atrasada, desde ${new Date(oldest).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })})` : ''}` : ''}.`;
  }
  return { configured: mode !== 'none', mode, syncEnabled: Boolean(settings?.syncEnabled), total: rows.length, checked, accounts: rows, mcc, usage: { ...usage, budget: settings?.dailyOpsBudget ?? 2500 }, headline };
}

/**
 * Lo que leen las reglas (paso 2): ¿está sana esta fuente de esta cuenta y cubierta la ventana de días que necesitan?
 * Si no, la regla devuelve «no comprobado» y no afirma nada.
 */
export async function sourceHealthFor(tenantId: string, accountId: string, sources: AdsSource[], window?: { from: string; to: string }, now: Date = new Date()): Promise<{ ok: boolean; reason: string | null }> {
  const states = (await listSyncStates(tenantId)).filter((s) => s.scopeKey === accountId);
  const by = new Map(states.map((s) => [s.source, s]));
  for (const src of sources) {
    const st = statusOf(by.get(src), src, now, 12);
    if (st.health !== 'sana') return { ok: false, reason: `${st.label}: ${st.health} (último dato ${fmtAge(st.ageMinutes)})` };
  }
  if (window) {
    const cov = windowCoverage(await coverageRows(accountId, window.from, window.to), window.from, window.to);
    if (!cov.complete) return { ok: false, reason: `faltan días completos: ${cov.missing.slice(0, 5).join(', ')}${cov.missing.length > 5 ? '…' : ''}` };
  }
  return { ok: true, reason: null };
}

/** Comprobación para Salud del sistema (registerHealthCheck('ads', …)). Sin configurar o apagada: nada que comprobar. */
export async function adsHealth(tenantId: string): Promise<ModuleCheck[]> {
  const settings = await getSettingsRow(tenantId);
  if (!settings || settings.authMode === 'none' || !settings.syncEnabled) return [];
  const now = new Date();
  const s = await coverageSummary(tenantId, now);
  const checks: ModuleCheck[] = [];
  const mccDown = s.mcc && s.mcc.health !== 'sana';
  const critical = s.accounts.flatMap((a) => a.problems.filter((p) => p.critical).map(() => a.name ?? a.customerId));
  const errorsText = [...new Set(s.accounts.flatMap((a) => a.problems.map((p) => p.lastError).filter((x): x is string => Boolean(x))))].slice(0, 2).join(' | ');
  checks.push({
    key: 'ads',
    label: `Google Ads: descarga${s.mode === 'sim' ? ' (modo simulado)' : ''}`,
    status: mccDown || critical.length ? 'critico' : s.checked < s.total ? 'aviso' : 'ok',
    detail: [mccDown ? `La lista de cuentas de la MCC no se descarga (${s.mcc?.lastError ?? s.mcc?.health}).` : '', s.headline, critical.length ? `Historial de cambios atrasado más de 7 días en: ${critical.join(', ')} (pasados 30 días se pierde).` : '', errorsText ? `Último error: ${errorsText}` : ''].filter(Boolean).join(' '),
    recommendation: mccDown || s.checked < s.total ? 'Abre Google Ads → Ajustes y pulsa «Probar conexión»: el mensaje de Google dice si es la clave, el acceso a la MCC o el cupo.' : ''
  });
  const used = s.usage.operations / Math.max(1, s.usage.budget);
  if (used >= 0.8) checks.push({ key: 'ads-cupo', label: 'Google Ads: cupo de la API', status: used >= 1 ? 'critico' : 'aviso', detail: `${s.usage.operations} de ${s.usage.budget} operaciones hoy (día del Pacífico).`, recommendation: 'Si se repite, sube el tope en Ajustes de Google Ads o pide el acceso Basic (los pasos 3-4 lo necesitan).' });
  if (settings.authMode === 'service_account' && settings.credentialsAddedAt) {
    const age = Math.floor((now.getTime() - settings.credentialsAddedAt.getTime()) / 86_400_000);
    if (age >= 300) checks.push({ key: 'ads-clave', label: 'Google Ads: clave de la cuenta de servicio', status: 'aviso', detail: `La clave tiene ${age} días.`, recommendation: 'Crea una clave nueva en Google Cloud, pégala en Ajustes de Google Ads y borra la antigua en la consola.' });
  }
  if (settings.apiVersionSunset) {
    const left = daysBetween(now.toISOString().slice(0, 10), settings.apiVersionSunset);
    if (left <= 60) checks.push({ key: 'ads-version', label: 'Google Ads: versión de la API', status: left <= 14 ? 'critico' : 'aviso', detail: `La versión ${settings.apiVersion} se retira el ${settings.apiVersionSunset} (${left} días).`, recommendation: 'Hay que probar la versión nueva y cambiarla en Ajustes antes de esa fecha (GOO-07).' });
  }
  return checks;
}
