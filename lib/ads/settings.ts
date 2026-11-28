import 'server-only';

// Módulo Google Ads · ajustes (ads_settings): valores por defecto, vista segura para la pantalla (sin secretos), guardado
// con límites y credenciales. La clave de la cuenta de servicio y el token de desarrollador se guardan cifrados con
// lib/ai/encryption.ts y nunca salen del servidor: la pantalla solo recibe un booleano y una pista enmascarada.
import { decrypt, encrypt } from '@/lib/ai/encryption';
import { maskSecret } from '@/lib/auth/mask';
import { forgetAdsToken, type AdsConnection } from '@/lib/ads/client';
import { SIM_MCC } from '@/lib/ads/sim';
import { keyHint, normalizeCustomerId, parseServiceAccountKey, type ServiceAccountKey } from '@/lib/ads/rules';
import { countRealAccounts, getSettingsRow, hideSimulatedAccounts, upsertSettings } from '@/lib/ads/store';
import type { AdsSettingsRow } from '@/lib/db/schema';

export class AdsSettingsError extends Error {
  constructor(public readonly userMessage: string) {
    super(userMessage);
    this.name = 'AdsSettingsError';
  }
}

export const LIMITS = { dailyOpsBudget: { min: 100, max: 15_000 }, historyMonths: { min: 1, max: 37 } };
const API_VERSIONS = /^v\d{2}$/;

export type PublicAdsSettings = {
  mccCustomerId: string | null;
  authMode: 'none' | 'service_account' | 'sim';
  hasCredentials: boolean;
  credentialsHint: string | null;
  credentialsAddedAt: string | null;
  hasDeveloperToken: boolean;
  apiVersion: string;
  apiVersionSunset: string | null;
  syncEnabled: boolean;
  dailyOpsBudget: number;
  historyMonths: number;
  alertsEnabled: boolean;
  agencyEmailDomains: string[];
  agencyUserEmails: string[];
  lastTest: { at: string; ok: boolean; message: string; accounts?: number } | null;
};

/** Lo que puede ver la pantalla: nunca el contenido cifrado. */
export function publicSettings(row: AdsSettingsRow | null): PublicAdsSettings {
  return {
    mccCustomerId: row?.mccCustomerId ?? null,
    authMode: (row?.authMode as PublicAdsSettings['authMode']) ?? 'none',
    hasCredentials: Boolean(row?.credentialsEncrypted) || row?.authMode === 'sim',
    credentialsHint: row?.authMode === 'sim' ? 'Modo simulado (SIM)' : (row?.credentialsHint ?? null),
    credentialsAddedAt: row?.credentialsAddedAt ? row.credentialsAddedAt.toISOString() : null,
    hasDeveloperToken: Boolean(row?.developerTokenEncrypted),
    apiVersion: row?.apiVersion ?? 'v26',
    apiVersionSunset: row?.apiVersionSunset ?? null,
    syncEnabled: row?.syncEnabled ?? false,
    dailyOpsBudget: row?.dailyOpsBudget ?? 2500,
    historyMonths: row?.historyMonths ?? 37,
    alertsEnabled: row?.alertsEnabled ?? false,
    agencyEmailDomains: row?.agencyEmailDomains ?? [],
    agencyUserEmails: row?.agencyUserEmails ?? [],
    lastTest: row?.state?.lastTest ?? null
  };
}

export async function loadPublicSettings(tenantId: string): Promise<PublicAdsSettings> {
  return publicSettings(await getSettingsRow(tenantId));
}

/**
 * Guarda la credencial: «SIM» activa el modo simulado (solo si no hay cuentas reales descargadas); un JSON de cuenta de
 * servicio se valida, se cifra y oculta las cuentas simuladas que hubiera.
 */
export async function saveCredentials(tenantId: string, text: string, by: string): Promise<{ mode: 'sim' | 'service_account'; hint: string }> {
  const raw = String(text ?? '').trim();
  if (raw.toUpperCase() === 'SIM') {
    if ((await countRealAccounts(tenantId)) > 0) throw new AdsSettingsError('Ya hay cuentas reales descargadas: el modo simulado no se puede activar aquí (mezclaría cuentas inventadas con las de verdad).');
    await upsertSettings(tenantId, { authMode: 'sim', credentialsEncrypted: null, credentialsIv: null, credentialsHint: null, credentialsAddedAt: new Date(), mccCustomerId: SIM_MCC, updatedBy: by });
    return { mode: 'sim', hint: 'Modo simulado (SIM)' };
  }
  const parsed = parseServiceAccountKey(raw);
  if (!parsed.ok) throw new AdsSettingsError(parsed.error);
  const { encrypted, iv } = encrypt(JSON.stringify(parsed.key));
  const hint = keyHint(parsed.key, maskSecret);
  const prev = await getSettingsRow(tenantId);
  await upsertSettings(tenantId, {
    authMode: 'service_account',
    credentialsEncrypted: encrypted,
    credentialsIv: iv,
    credentialsHint: hint,
    credentialsAddedAt: new Date(),
    // Si venía de simulado, la MCC simulada no vale.
    ...(prev?.mccCustomerId === SIM_MCC ? { mccCustomerId: null, syncEnabled: false } : {}),
    updatedBy: by
  });
  await hideSimulatedAccounts(tenantId);
  forgetAdsToken();
  return { mode: 'service_account', hint };
}

export async function removeCredentials(tenantId: string, by: string): Promise<void> {
  await upsertSettings(tenantId, { authMode: 'none', credentialsEncrypted: null, credentialsIv: null, credentialsHint: null, credentialsAddedAt: null, syncEnabled: false, updatedBy: by });
  forgetAdsToken();
}

export async function saveDeveloperToken(tenantId: string, token: string | null, by: string): Promise<void> {
  const t = String(token ?? '').trim();
  if (!t) {
    await upsertSettings(tenantId, { developerTokenEncrypted: null, developerTokenIv: null, updatedBy: by });
    return;
  }
  if (!/^[\w-]{10,64}$/.test(t)) throw new AdsSettingsError('El token de desarrollador no tiene el formato esperado (letras, números, - y _).');
  const { encrypted, iv } = encrypt(t);
  await upsertSettings(tenantId, { developerTokenEncrypted: encrypted, developerTokenIv: iv, updatedBy: by });
}

export type GeneralInput = { mccCustomerId?: string | null; apiVersion?: string; apiVersionSunset?: string | null; syncEnabled?: boolean; dailyOpsBudget?: number; historyMonths?: number; agencyEmailDomains?: string[]; agencyUserEmails?: string[] };

export async function saveGeneral(tenantId: string, input: GeneralInput, by: string): Promise<void> {
  const row = await getSettingsRow(tenantId);
  const patch: Parameters<typeof upsertSettings>[1] = { updatedBy: by };
  if (input.mccCustomerId !== undefined) {
    if (row?.authMode === 'sim') patch.mccCustomerId = SIM_MCC;
    else if (!input.mccCustomerId) patch.mccCustomerId = null;
    else {
      const id = normalizeCustomerId(input.mccCustomerId);
      if (!id) throw new AdsSettingsError('El id de la MCC son 10 dígitos (por ejemplo 123-456-7890).');
      patch.mccCustomerId = id;
    }
  }
  if (input.apiVersion !== undefined) {
    if (!API_VERSIONS.test(input.apiVersion)) throw new AdsSettingsError('La versión de la API va como «v26».');
    patch.apiVersion = input.apiVersion;
  }
  if (input.apiVersionSunset !== undefined) {
    if (input.apiVersionSunset && !/^\d{4}-\d{2}-\d{2}$/.test(input.apiVersionSunset)) throw new AdsSettingsError('La fecha de retirada va como AAAA-MM-DD.');
    patch.apiVersionSunset = input.apiVersionSunset || null;
  }
  if (input.dailyOpsBudget !== undefined) {
    const n = Math.round(Number(input.dailyOpsBudget));
    if (!Number.isFinite(n) || n < LIMITS.dailyOpsBudget.min || n > LIMITS.dailyOpsBudget.max) throw new AdsSettingsError(`El tope diario de operaciones va de ${LIMITS.dailyOpsBudget.min} a ${LIMITS.dailyOpsBudget.max}.`);
    patch.dailyOpsBudget = n;
  }
  if (input.historyMonths !== undefined) {
    const n = Math.round(Number(input.historyMonths));
    if (!Number.isFinite(n) || n < LIMITS.historyMonths.min || n > LIMITS.historyMonths.max) throw new AdsSettingsError(`El histórico va de ${LIMITS.historyMonths.min} a ${LIMITS.historyMonths.max} meses (Google guarda 37).`);
    patch.historyMonths = n;
  }
  const cleanList = (list: string[] | undefined, re: RegExp, what: string) => {
    if (!list) return undefined;
    const out = [...new Set(list.map((x) => String(x).trim().toLowerCase().replace(/^@/, '')).filter(Boolean))].slice(0, 50);
    const bad = out.find((x) => !re.test(x));
    if (bad) throw new AdsSettingsError(`«${bad}» no parece un ${what} válido.`);
    return out;
  };
  const domains = cleanList(input.agencyEmailDomains, /^[a-z0-9.-]+\.[a-z]{2,}$/, 'dominio');
  if (domains) patch.agencyEmailDomains = domains;
  const emails = cleanList(input.agencyUserEmails, /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/, 'correo');
  if (emails) patch.agencyUserEmails = emails;
  if (input.syncEnabled !== undefined) {
    const mode = row?.authMode ?? 'none';
    const mcc = patch.mccCustomerId !== undefined ? patch.mccCustomerId : row?.mccCustomerId;
    if (input.syncEnabled && (mode === 'none' || !mcc)) throw new AdsSettingsError('Antes de activar la descarga, guarda la credencial y el id de la MCC (y prueba la conexión).');
    patch.syncEnabled = input.syncEnabled;
  }
  await upsertSettings(tenantId, patch);
}

/** Conexión lista para usar (descifra la clave). null + motivo si falta algo. Solo servidor. */
export async function connectionFor(tenantId: string): Promise<{ conn: AdsConnection | null; reason: string | null; row: AdsSettingsRow | null }> {
  const row = await getSettingsRow(tenantId);
  if (!row || row.authMode === 'none') return { conn: null, reason: 'Falta la credencial (Ajustes de Google Ads).', row };
  if (!row.mccCustomerId) return { conn: null, reason: 'Falta el id de la MCC (Ajustes de Google Ads).', row };
  const base = { tenantId, mccId: row.mccCustomerId, apiVersion: row.apiVersion || 'v26', dailyOpsBudget: row.dailyOpsBudget };
  if (row.authMode === 'sim') return { conn: { ...base, mode: 'sim', key: null, developerToken: null }, reason: null, row };
  if (!row.credentialsEncrypted || !row.credentialsIv) return { conn: null, reason: 'Falta la clave de la cuenta de servicio.', row };
  let key: ServiceAccountKey;
  try {
    key = JSON.parse(decrypt(row.credentialsEncrypted, row.credentialsIv)) as ServiceAccountKey;
  } catch {
    return { conn: null, reason: 'No se pudo leer la clave guardada: vuelve a pegarla.', row };
  }
  let developerToken: string | null = null;
  if (row.developerTokenEncrypted && row.developerTokenIv) {
    try {
      developerToken = decrypt(row.developerTokenEncrypted, row.developerTokenIv);
    } catch {
      developerToken = null;
    }
  }
  return { conn: { ...base, mode: 'service_account', key, developerToken }, reason: null, row };
}
