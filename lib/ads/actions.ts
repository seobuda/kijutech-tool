'use server';

// Acciones web del módulo Google Ads (paso 1). Todas comprueban el permiso en el servidor antes de hacer nada:
// credenciales, conexión, descarga, vínculo de cuentas y nivel del cliente son «admin». Las credenciales nunca vuelven al
// navegador (solo un booleano y una pista enmascarada). Ninguna acción escribe en Google Ads: todo es lectura.
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { AdsApiError } from '@/lib/ads/client';
import { testConnection } from '@/lib/ads/access';
import { AdsSettingsError, connectionFor, removeCredentials, saveAlertSettings, saveCredentials, saveDeveloperToken, saveGeneral, type AlertInput, type GeneralInput } from '@/lib/ads/settings';
import { AdsDecisionError, respondToFinding, reviewAccount, setProvisionalGoal } from '@/lib/ads/decisions';
import { evaluateAll } from '@/lib/ads/findings';
import { AdsAuditError, confirmFichaFact, markAuditRead, respondToAuditItem, runAudit } from '@/lib/ads/audit';
import { closeAccountFindings, latestGoal } from '@/lib/ads/findings-store';
import { clientBelongs, getAccount, setClientLevel, updateAccount } from '@/lib/ads/store';
import { ADS_JOB, enqueueAccountSyncs, syncSchedules } from '@/lib/ads/sync';
import { enqueueJob } from '@/lib/core/jobs';

type Ok<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown, fallback: string): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof AdsSettingsError ? e.userMessage : e instanceof AdsApiError ? e.message : publicError(e, fallback)
});
const who = (u: { name: string | null; email: string }) => (u.name || u.email).slice(0, 120);
const PATHS = ['/dashboard/ads', '/dashboard/ads/ajustes'];
const refresh = () => PATHS.forEach((p) => revalidatePath(p));

export async function saveAdsCredentialsAction(text: string): Promise<Ok<{ mode: string; hint: string }>> {
  try {
    const user = await requirePermission('admin');
    const r = await saveCredentials(user.tenantId, String(text ?? ''), who(user));
    await syncSchedules(user.tenantId);
    refresh();
    return { ok: true, ...r };
  } catch (e) {
    return fail(e, 'No se pudo guardar la credencial');
  }
}

export async function removeAdsCredentialsAction(): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    await removeCredentials(user.tenantId, who(user));
    await syncSchedules(user.tenantId);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo quitar la credencial');
  }
}

export async function saveAdsDeveloperTokenAction(token: string | null): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    await saveDeveloperToken(user.tenantId, token, who(user));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo guardar el token');
  }
}

export async function saveAdsSettingsAction(input: GeneralInput): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    const clean: GeneralInput = {};
    if (input && typeof input === 'object') {
      if ('mccCustomerId' in input) clean.mccCustomerId = input.mccCustomerId === null ? null : String(input.mccCustomerId ?? '');
      if ('apiVersion' in input) clean.apiVersion = String(input.apiVersion ?? '');
      if ('apiVersionSunset' in input) clean.apiVersionSunset = input.apiVersionSunset ? String(input.apiVersionSunset) : null;
      if ('syncEnabled' in input) clean.syncEnabled = Boolean(input.syncEnabled);
      if ('dailyOpsBudget' in input) clean.dailyOpsBudget = Number(input.dailyOpsBudget);
      if ('historyMonths' in input) clean.historyMonths = Number(input.historyMonths);
      if (Array.isArray(input.agencyEmailDomains)) clean.agencyEmailDomains = input.agencyEmailDomains.map(String);
      if (Array.isArray(input.agencyUserEmails)) clean.agencyUserEmails = input.agencyUserEmails.map(String);
    }
    await saveGeneral(user.tenantId, clean, who(user));
    await syncSchedules(user.tenantId);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudieron guardar los ajustes');
  }
}

/** «Probar conexión»: 1 operación; lista las cuentas que ve la MCC y el error literal de Google si falla. */
export async function testAdsConnectionAction(): Promise<Ok<{ message: string; accounts: { customerId: string; name: string | null; status: string | null }[] }>> {
  try {
    const user = await requirePermission('admin');
    const r = await testConnection(user.tenantId);
    refresh();
    return r.ok ? { ok: true, message: r.message, accounts: r.accounts } : { ok: false, error: r.message };
  } catch (e) {
    return fail(e, 'No se pudo probar la conexión');
  }
}

/** «Descargar ahora»: encola la lista de cuentas y la descarga de cada cuenta seguida (la hace la cola, no la pantalla). */
export async function startAdsSyncNowAction(): Promise<Ok<{ queued: number }>> {
  try {
    const user = await requirePermission('admin');
    const { conn, reason, row } = await connectionFor(user.tenantId);
    if (!conn) return { ok: false, error: reason ?? 'Google Ads no está configurado.' };
    if (!row?.syncEnabled) return { ok: false, error: 'Activa antes la descarga.' };
    await enqueueJob({ tenantId: user.tenantId, kind: ADS_JOB.descubrir, scopeType: 'cuenta', scopeId: null, priority: 4, dedupeKey: `${ADS_JOB.descubrir}:ahora` });
    const n = await enqueueAccountSyncs(user.tenantId);
    refresh();
    return { ok: true, queued: n + 1 };
  } catch (e) {
    return fail(e, 'No se pudo encolar la descarga');
  }
}

/** Vincular a mano una cuenta con su cliente (o desvincularla con null). Las simuladas nunca se vinculan. */
export async function linkAdsAccountAction(accountId: string, clientId: string | null): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    const acc = await getAccount(user.tenantId, String(accountId ?? ''));
    if (!acc) return { ok: false, error: 'Esa cuenta no existe.' };
    if (acc.simulated) return { ok: false, error: 'Las cuentas simuladas no se vinculan a clientes reales.' };
    if (clientId) {
      if (!(await clientBelongs(user.tenantId, String(clientId)))) return { ok: false, error: 'Ese cliente no existe.' };
      await updateAccount(user.tenantId, acc.id, { clientId: String(clientId), linkedBy: 'manual', linkNote: null });
    } else {
      // Sin cliente: vuelve a mandar la ficha en la próxima vuelta de «descubrir».
      await updateAccount(user.tenantId, acc.id, { clientId: null, linkedBy: null, linkNote: null });
    }
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo vincular la cuenta');
  }
}

/** Seguir o dejar de seguir una cuenta (no se borra nada: deja de descargarse). */
export async function setAdsAccountTrackedAction(accountId: string, tracked: boolean): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    const acc = await getAccount(user.tenantId, String(accountId ?? ''));
    if (!acc) return { ok: false, error: 'Esa cuenta no existe.' };
    if (tracked && acc.status !== 'ENABLED') return { ok: false, error: 'Esa cuenta no está activa en Google Ads (cancelada o suspendida): no se puede seguir.' };
    await updateAccount(user.tenantId, acc.id, { tracked: Boolean(tracked) });
    // Paso 2: lo vivo de una cuenta que se deja de seguir se cierra (nadie lo va a comprobar).
    if (!tracked) await closeAccountFindings(user.tenantId, acc.id, new Date());
    await syncSchedules(user.tenantId);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo cambiar la cuenta');
  }
}

/** Nivel A/B/C del cliente (es del cliente, no de la cuenta: R5 I12). null = sin nivel. */
export async function setAdsClientLevelAction(clientId: string, level: string | null): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    const l = level === 'A' || level === 'B' || level === 'C' ? level : null;
    if (level && !l) return { ok: false, error: 'El nivel es A, B o C.' };
    if (!(await clientBelongs(user.tenantId, String(clientId ?? '')))) return { ok: false, error: 'Ese cliente no existe.' };
    // Paso 2: un cliente con objetivo provisional no puede ser nivel A (necesita un objetivo acordado).
    if (l === 'A' && (await latestGoal(user.tenantId, String(clientId)))?.kind === 'provisional') return { ok: false, error: 'Este cliente tiene un objetivo provisional: para nivel A hace falta un objetivo acordado.' };
    await setClientLevel(user.tenantId, String(clientId), l, who(user));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo guardar el nivel');
  }
}

// --- Paso 2: hallazgos, revisiones, objetivo provisional y avisos ---------------------------------------------------
// Responder, revisar y fijar objetivo: «edit». Ajustes de avisos y «Evaluar ahora»: «admin». Nada escribe en Google Ads.

const fail2 = (e: unknown, fallback: string): { ok: false; error: string } => (e instanceof AdsDecisionError ? { ok: false, error: e.userMessage } : fail(e, fallback));
const refresh2 = (accountId?: string | null) => {
  for (const p of ['/dashboard/ads', '/dashboard/ads/cartera', '/dashboard/ads/ajustes']) revalidatePath(p);
  if (accountId) revalidatePath(`/dashboard/ads/cuentas/${accountId}`);
};

/** Respuesta del gestor a un hallazgo (las ocho de 7.4; motivo o fecha cuando toca; posponer como mucho 2 veces). */
export async function respondAdsFindingAction(findingId: string, response: string, input: { reason?: string | null; until?: string | null; days?: number | null } = {}): Promise<Ok<{ message: string; taskUrl: string | null }>> {
  try {
    const user = await requirePermission('edit');
    const clean = { reason: input?.reason === undefined || input?.reason === null ? null : String(input.reason).slice(0, 500), until: input?.until ? String(input.until).slice(0, 10) : null, days: input?.days === undefined || input?.days === null ? null : Number(input.days) };
    const r = await respondToFinding(user.tenantId, user, String(findingId ?? ''), String(response ?? ''), clean);
    refresh2();
    return { ok: true, message: r.message, taskUrl: r.taskUrl ?? null };
  } catch (e) {
    return fail2(e, 'No se pudo guardar la respuesta');
  }
}

/** «Marcar revisada»: nota de una línea; la próxima según el nivel (A 7, B 14, C 30 días). */
export async function reviewAdsAccountAction(accountId: string, note: string): Promise<Ok<{ next: string }>> {
  try {
    const user = await requirePermission('edit');
    const r = await reviewAccount(user.tenantId, user, String(accountId ?? ''), String(note ?? ''));
    refresh2(String(accountId));
    return { ok: true, next: r.next };
  } catch (e) {
    return fail2(e, 'No se pudo marcar la revisión');
  }
}

/** «Fijar objetivo provisional» del cliente de esta cuenta (congelado; nunca en nivel A). */
export async function setAdsProvisionalGoalAction(accountId: string): Promise<Ok<{ cpl: number; monthly: number; conversions: number; currency: string | null }>> {
  try {
    const user = await requirePermission('edit');
    const r = await setProvisionalGoal(user.tenantId, user, String(accountId ?? ''));
    refresh2(String(accountId));
    return { ok: true, ...r };
  } catch (e) {
    return fail2(e, 'No se pudo fijar el objetivo');
  }
}

/** Ajustes del paso 2: encender los avisos (salir del modo sombra), horario, días, tope y umbrales. */
export async function saveAdsAlertSettingsAction(input: AlertInput): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    const clean: AlertInput = {};
    if (input && typeof input === 'object') {
      if ('alertsEnabled' in input) clean.alertsEnabled = Boolean(input.alertsEnabled);
      if ('alertHours' in input) clean.alertHours = String(input.alertHours ?? '');
      if ('alertDays' in input) clean.alertDays = Array.isArray(input.alertDays) ? input.alertDays.map(Number) : String(input.alertDays ?? '');
      if ('maxInterruptionsPerDay' in input) clean.maxInterruptionsPerDay = Number(input.maxInterruptionsPerDay);
      if (input.thresholds && typeof input.thresholds === 'object') clean.thresholds = Object.fromEntries(Object.entries(input.thresholds).map(([k, v]) => [k, Number(v)]));
    }
    await saveAlertSettings(user.tenantId, clean, who(user));
    refresh2();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudieron guardar los avisos');
  }
}

/** «Evaluar ahora»: pasa todas las reglas de todas las cuentas con lo ya descargado (sin llamar a Google). */
export async function evaluateAdsNowAction(): Promise<Ok<{ accounts: number; opened: number; resolved: number }>> {
  try {
    const user = await requirePermission('admin');
    const r = await evaluateAll(user.tenantId, { mode: 'todas' });
    refresh2();
    return { ok: true, accounts: r.length, opened: r.reduce((s, x) => s + x.opened, 0), resolved: r.reduce((s, x) => s + x.resolved, 0) };
  } catch (e) {
    return fail(e, 'No se pudo evaluar');
  }
}

// --- Paso 3: auditoría de higiene ------------------------------------------------------------------------------------
// Responder a un control, confirmar un dato de la ficha (NEG-07), marcar la auditoría leída y pasarla ahora: «edit».
// Nada escribe en Google Ads: «qué hacer» se aplica a mano.

const fail3 = (e: unknown, fallback: string): { ok: false; error: string } => (e instanceof AdsAuditError ? { ok: false, error: e.userMessage } : fail(e, fallback));

/** Respuesta a un control de la auditoría (hecho, el cliente lo quiere así y no aplica con motivo, más tarde). */
export async function respondAdsAuditItemAction(itemId: string, response: string, reason: string | null = null): Promise<Ok<{ message: string }>> {
  try {
    const user = await requirePermission('edit');
    const r = await respondToAuditItem(user.tenantId, user, String(itemId ?? ''), String(response ?? ''), reason === null || reason === undefined ? null : String(reason).slice(0, 500));
    refresh2();
    return { ok: true, message: r.message };
  } catch (e) {
    return fail3(e, 'No se pudo guardar la respuesta');
  }
}

/** «Confirmar» un dato de la ficha del cliente que usa la auditoría (fecha, quién y lo que decía). */
export async function confirmAdsFichaFactAction(accountId: string, fact: string): Promise<Ok<{ message: string }>> {
  try {
    const user = await requirePermission('edit');
    const r = await confirmFichaFact(user.tenantId, user, String(accountId ?? ''), String(fact ?? ''));
    refresh2(String(accountId));
    return { ok: true, message: r.message };
  } catch (e) {
    return fail3(e, 'No se pudo confirmar el dato');
  }
}

/** «Marcar auditoría leída» (la media hora por cuenta de la investigación 13.2). */
export async function markAdsAuditReadAction(auditId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    await markAuditRead(user.tenantId, user, String(auditId ?? ''));
    refresh2();
    return { ok: true };
  } catch (e) {
    return fail3(e, 'No se pudo marcar la auditoría');
  }
}

/**
 * «Pasar la auditoría ahora» o «Repetir» (`fresh`: crea una auditoría nueva y deja la anterior como sustituida). En modo
 * simulado se hace al momento; con la cuenta real se encola (unas 14 operaciones de lectura).
 */
export async function runAdsAuditNowAction(accountId: string, fresh = false): Promise<Ok<{ message: string }>> {
  try {
    const user = await requirePermission('edit');
    const acc = await getAccount(user.tenantId, String(accountId ?? ''));
    if (!acc) return { ok: false, error: 'Esa cuenta no existe.' };
    if (acc.simulated) {
      const r = await runAudit(user.tenantId, acc.id, { fresh: Boolean(fresh), userId: user.id });
      refresh2(acc.id);
      if ('skipped' in r) return { ok: false, error: `No se pudo auditar: ${r.skipped}.` };
      return { ok: true, message: r.mode === 'entrada' ? `Auditoría hecha: ${r.summary.mal} mal, ${r.summary.confirmar} por confirmar, ${r.summary.bien} bien, ${r.summary.no_comprobado} sin comprobar.` : `Vigilancia al día: ${r.fixed.length} corregidos, ${r.regressed.length} reaparecidos.` };
    }
    await enqueueJob({ tenantId: user.tenantId, kind: ADS_JOB.auditar, payload: { accountId: acc.id, fresh: Boolean(fresh), userId: user.id }, scopeType: 'cuenta', scopeId: acc.id, priority: 4, dedupeKey: `${ADS_JOB.auditar}:${acc.id}:ahora:${fresh ? 'nueva' : 'vigilar'}` });
    refresh2(acc.id);
    return { ok: true, message: 'Auditoría en marcha: recarga la página en un par de minutos.' };
  } catch (e) {
    return fail3(e, 'No se pudo pasar la auditoría');
  }
}
