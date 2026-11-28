import 'server-only';

// Módulo Google Ads · funciones internas para las pantallas y las acciones (no se exportan desde 'use server', que las
// convertiría en endpoints públicos). Quien las llama ya ha comprobado el permiso.
import { AdsApiError, runQuery } from '@/lib/ads/client';
import { coverageSummary, type CoverageSummary } from '@/lib/ads/health';
import { followableAccounts, parseCustomerClients, Q } from '@/lib/ads/queries';
import { formatCustomerId } from '@/lib/ads/rules';
import { connectionFor, loadPublicSettings, type PublicAdsSettings } from '@/lib/ads/settings';
import { accountTotals, clientLevels, clientNames, getSettingsRow, lastChangeEvents, listAccounts, listClientsForLink } from '@/lib/ads/store';
import { patchSettingsState } from '@/lib/ads/findings-store';

export type AdsAccountView = {
  id: string;
  customerId: string;
  customerIdLabel: string;
  name: string | null;
  status: string | null;
  currency: string | null;
  simulated: boolean;
  tracked: boolean;
  clientId: string | null;
  clientName: string | null;
  linkedBy: string | null;
  linkNote: string | null;
  level: string | null;
  campaigns: number;
  days: number;
  firstDay: string | null;
  lastDay: string | null;
  cost30: number;
  lastCoverage: string | null;
};

export async function accountViews(tenantId: string): Promise<AdsAccountView[]> {
  const settings = await getSettingsRow(tenantId);
  const simulatedMode = settings?.authMode === 'sim';
  const accounts = (await listAccounts(tenantId)).filter((a) => a.simulated === simulatedMode);
  const names = await clientNames(tenantId, accounts.map((a) => a.clientId).filter((x): x is string => Boolean(x)));
  const levels = await clientLevels(tenantId);
  const totals = await accountTotals(tenantId);
  return accounts.map((a) => {
    const t = totals.get(a.id);
    return {
      id: a.id,
      customerId: a.customerId,
      customerIdLabel: formatCustomerId(a.customerId),
      name: a.name,
      status: a.status,
      currency: a.currency,
      simulated: a.simulated,
      tracked: a.tracked,
      clientId: a.clientId,
      clientName: a.clientId ? (names.get(a.clientId) ?? null) : null,
      linkedBy: a.linkedBy,
      linkNote: a.linkNote,
      level: a.clientId ? (levels.get(a.clientId) ?? null) : null,
      campaigns: t?.campaigns ?? 0,
      days: t?.days ?? 0,
      firstDay: t?.firstDay ?? null,
      lastDay: t?.lastDay ?? null,
      cost30: t?.cost30 ?? 0,
      lastCoverage: t?.lastCoverage ?? null
    };
  });
}

export type AdsSettingsView = { settings: PublicAdsSettings; accounts: AdsAccountView[]; clients: { id: string; name: string }[] };

export async function settingsView(tenantId: string): Promise<AdsSettingsView> {
  return { settings: await loadPublicSettings(tenantId), accounts: await accountViews(tenantId), clients: await listClientsForLink(tenantId) };
}

export type AdsHomeView = { coverage: CoverageSummary; accounts: AdsAccountView[]; changes: Awaited<ReturnType<typeof lastChangeEvents>> };

export async function homeView(tenantId: string): Promise<AdsHomeView> {
  return { coverage: await coverageSummary(tenantId), accounts: (await accountViews(tenantId)).filter((a) => a.tracked), changes: await lastChangeEvents(tenantId, 10) };
}

/**
 * «Probar conexión»: pide a la MCC la lista de cuentas (1 operación). Devuelve el error literal de Google (sin secretos)
 * para distinguir token de desarrollador, permiso en la MCC y permiso del proyecto (diseño §1).
 */
export async function testConnection(tenantId: string): Promise<{ ok: boolean; message: string; accounts: { customerId: string; name: string | null; status: string | null }[] }> {
  const { conn, reason } = await connectionFor(tenantId);
  let result: { ok: boolean; message: string; accounts: { customerId: string; name: string | null; status: string | null }[] };
  if (!conn) result = { ok: false, message: reason ?? 'Google Ads no está configurado.', accounts: [] };
  else {
    try {
      const list = followableAccounts(parseCustomerClients(await runQuery(conn, conn.mccId, Q.customerClients()))).filter((c) => c.customerId !== conn.mccId);
      result = {
        ok: true,
        message: `${conn.mode === 'sim' ? 'Modo simulado: ' : ''}la MCC ${formatCustomerId(conn.mccId)} responde y ve ${list.length} cuenta(s).`,
        accounts: list.map((c) => ({ customerId: formatCustomerId(c.customerId), name: c.name, status: c.status }))
      };
    } catch (e) {
      const msg = e instanceof AdsApiError ? e.message : 'No se pudo hablar con Google Ads.';
      result = { ok: false, message: msg, accounts: [] };
    }
  }
  // Fusiona en el estado (jsonb ||) para no pisar otras claves (umbrales, avisos) escritas a la vez.
  if (await getSettingsRow(tenantId)) await patchSettingsState(tenantId, { lastTest: { at: new Date().toISOString(), ok: result.ok, message: result.message.slice(0, 500), accounts: result.accounts.length } });
  return result;
}
