'use server';

// Acciones web del módulo Google Ads (paso 1). Todas comprueban el permiso en el servidor antes de hacer nada:
// credenciales, conexión, descarga, vínculo de cuentas y nivel del cliente son «admin». Las credenciales nunca vuelven al
// navegador (solo un booleano y una pista enmascarada). Ninguna acción escribe en Google Ads: todo es lectura.
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { AdsApiError } from '@/lib/ads/client';
import { testConnection } from '@/lib/ads/access';
import { AdsSettingsError, removeCredentials, saveCredentials, saveDeveloperToken, saveGeneral, type GeneralInput } from '@/lib/ads/settings';
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
    await updateAccount(user.tenantId, acc.id, { tracked: Boolean(tracked) });
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
    await setClientLevel(user.tenantId, String(clientId), l, who(user));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo guardar el nivel');
  }
}
