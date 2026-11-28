import 'server-only';

// Módulo Google Ads · cliente de la API. ÚNICO archivo que habla con googleads.googleapis.com (barrera en
// tests/arquitectura-guardrails.test.ts). SOLO LECTURA: solo hay `searchStream` (consultas GAQL); no existe ninguna
// función que cambie una cuenta (línea roja, diseño §0).
//
//  - Autenticación con cuenta de servicio: JWT RS256 firmado con node:crypto (sin dependencias), cambiado por un token de
//    acceso que se guarda en memoria hasta 60 s antes de caducar. Cabeceras: Authorization, login-customer-id (la MCC) y
//    developer-token si está guardado (diseño §1).
//  - Cupo: cada consulta suma una operación al día del Pacífico en ads_api_usage; al llegar al tope propio
//    (daily_ops_budget) no se pide nada más hasta el día siguiente.
//  - Errores: `AdsApiError` con un mensaje en español y el código literal de Google (sin secretos). RESOURCE_EXHAUSTED
//    (cupo del día) no se reintenta; RESOURCE_TEMPORARILY_EXHAUSTED, 429 y 5xx sí, con la espera que trae el error.
//  - Modo simulado (credencial «SIM»): responde sim.ts y nunca sale a internet.
import { createSign } from 'node:crypto';
import { pacificDay, retryDelayMs, type ServiceAccountKey } from '@/lib/ads/rules';
import { simQuery, SIM_MCC } from '@/lib/ads/sim';
import type { AdsQuery, ApiRow } from '@/lib/ads/queries';
import { bumpUsage, recordUsageError } from '@/lib/ads/store';

const API_HOST = 'https://googleads.googleapis.com';
const SCOPE = 'https://www.googleapis.com/auth/adwords';

export type AdsConnection = {
  tenantId: string;
  mode: 'service_account' | 'sim';
  mccId: string;
  apiVersion: string;
  key: ServiceAccountKey | null;
  developerToken: string | null;
  dailyOpsBudget: number;
};

export type AdsErrorCode = 'auth' | 'permiso' | 'token_desarrollador' | 'proyecto' | 'cupo_dia' | 'cupo_propio' | 'ritmo' | 'consulta' | 'red' | 'desconocido';

export class AdsApiError extends Error {
  constructor(
    public readonly code: AdsErrorCode,
    public readonly userMessage: string,
    public readonly googleCode: string | null = null,
    public readonly retryAfterMs: number | null = null
  ) {
    super(googleCode ? `${userMessage} [${googleCode}]` : userMessage);
    this.name = 'AdsApiError';
  }
  get retryable(): boolean {
    return this.code === 'ritmo' || this.code === 'red';
  }
}

// --- Token de la cuenta de servicio ---------------------------------------------------------------------------------

const b64url = (v: Buffer | string) => Buffer.from(v).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** JWT firmado para pedir el token (sin `sub`: no hay delegación de dominio). Exportado para las pruebas. */
export function signServiceAccountJwt(key: ServiceAccountKey, nowSec = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: key.privateKeyId }));
  const claims = b64url(JSON.stringify({ iss: key.clientEmail, scope: SCOPE, aud: key.tokenUri, iat: nowSec, exp: nowSec + 3600 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${b64url(signer.sign(key.privateKey))}`;
}

const G = globalThis as unknown as { __kijuAdsTokens?: Map<string, { token: string; expiresAt: number }> };
const tokens = () => (G.__kijuAdsTokens ??= new Map());

/** Olvida el token guardado (al cambiar la clave). */
export function forgetAdsToken(key?: ServiceAccountKey | null): void {
  if (key) tokens().delete(`${key.clientEmail}:${key.privateKeyId}`);
  else tokens().clear();
}

async function accessToken(key: ServiceAccountKey, signal?: AbortSignal): Promise<string> {
  const cacheKey = `${key.clientEmail}:${key.privateKeyId}`;
  const hit = tokens().get(cacheKey);
  if (hit && hit.expiresAt - 60_000 > Date.now()) return hit.token;
  let res: Response;
  try {
    res = await fetch(key.tokenUri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signServiceAccountJwt(key) }).toString(),
      signal: signal ?? AbortSignal.timeout(20_000)
    });
  } catch {
    throw new AdsApiError('red', 'No se pudo contactar con Google para pedir el token de acceso.');
  }
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    // Nunca se incluye la petición (lleva la firma): solo el código de error de Google.
    const code = body.error ? `oauth.${body.error}` : `http.${res.status}`;
    throw new AdsApiError('auth', 'Google no acepta la clave de la cuenta de servicio: puede estar revocada o borrada, o el reloj del servidor estar desajustado.', code);
  }
  tokens().set(cacheKey, { token: body.access_token, expiresAt: Date.now() + Math.max(60, Number(body.expires_in ?? 3600)) * 1000 });
  return body.access_token;
}

// --- Errores de la API ------------------------------------------------------------------------------------------------

type GoogleErrorBody = { error?: { code?: number; message?: string; status?: string; details?: { errors?: { errorCode?: Record<string, string>; message?: string; details?: { quotaErrorDetails?: { retryDelay?: unknown } } }[] }[] } };

/** Traduce la respuesta de error de Google a un `AdsApiError` en español con el código literal. Exportado para pruebas. */
export function translateApiError(status: number, raw: unknown): AdsApiError {
  const body = (Array.isArray(raw) ? raw[0] : raw) as GoogleErrorBody | undefined;
  const err = body?.error;
  const first = err?.details?.flatMap((d) => d.errors ?? [])[0];
  const codeEntry = first?.errorCode ? Object.entries(first.errorCode)[0] : null;
  const googleCode = codeEntry ? `${codeEntry[0]}.${codeEntry[1]}` : err?.status ? `status.${err.status}` : `http.${status}`;
  const value = codeEntry?.[1] ?? err?.status ?? '';
  const literal = (first?.message ?? err?.message ?? '').replace(/\s+/g, ' ').slice(0, 300);
  const withLiteral = (msg: string) => (literal ? `${msg} Google dice: «${literal}».` : msg);
  const retry = retryDelayMs(first?.details?.quotaErrorDetails?.retryDelay);
  if (/^DEVELOPER_TOKEN/.test(value)) return new AdsApiError('token_desarrollador', withLiteral('Google pide un token de desarrollador válido (Ajustes de Google Ads → token de desarrollador).'), googleCode);
  if (value === 'USER_PERMISSION_DENIED') return new AdsApiError('permiso', withLiteral('La cuenta de servicio no tiene acceso a esa cuenta: comprueba que está añadida a la MCC y que el id de la MCC es el correcto.'), googleCode);
  if (value === 'RESOURCE_EXHAUSTED' && codeEntry?.[0] === 'quotaError') return new AdsApiError('cupo_dia', 'Se ha agotado el cupo diario de la API de Google Ads; la descarga sigue cuando se reinicie (medianoche del Pacífico).', googleCode);
  if (value === 'RESOURCE_TEMPORARILY_EXHAUSTED' || status === 429) return new AdsApiError('ritmo', 'Google pide ir más despacio; se reintenta solo.', googleCode, retry);
  if (codeEntry?.[0] === 'authenticationError' || status === 401) return new AdsApiError('auth', withLiteral('Google no acepta la credencial de la cuenta de servicio.'), googleCode);
  if (codeEntry?.[0] === 'authorizationError' || status === 403) return new AdsApiError('proyecto', withLiteral('El proyecto de Google Cloud no tiene permiso para la API de Google Ads (actívala en el proyecto o espera a que Google apruebe el acceso).'), googleCode);
  if (codeEntry?.[0] === 'queryError' || codeEntry?.[0] === 'requestError' || status === 400) return new AdsApiError('consulta', withLiteral('Google no entiende una consulta (puede que un campo haya cambiado de nombre en esta versión de la API).'), googleCode);
  if (status >= 500) return new AdsApiError('red', 'Google Ads no responde ahora mismo; se reintenta solo.', googleCode);
  return new AdsApiError('desconocido', withLiteral('Google Ads devolvió un error.'), googleCode);
}

// --- Consulta ---------------------------------------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Una consulta GAQL a una cuenta (todas las filas). Cuenta una operación del cupo por intento. */
export async function runQuery(conn: AdsConnection, customerId: string, query: AdsQuery, opts: { signal?: AbortSignal; now?: Date } = {}): Promise<ApiRow[]> {
  if (!/^\d{10}$/.test(customerId)) throw new AdsApiError('consulta', 'El id de la cuenta de Google Ads no es válido (10 dígitos).');
  const day = pacificDay(opts.now ?? new Date());
  for (let attempt = 1; ; attempt++) {
    const used = await bumpUsage(conn.tenantId, day);
    if (used > conn.dailyOpsBudget) throw new AdsApiError('cupo_propio', `Se ha llegado al tope propio de ${conn.dailyOpsBudget} operaciones al día; la descarga sigue mañana (se puede subir en Ajustes).`);
    try {
      if (conn.mode === 'sim') return simQuery(customerId, query, opts.now ?? new Date());
      return await callApi(conn, customerId, query, opts.signal);
    } catch (e) {
      const err = e instanceof AdsApiError ? e : new AdsApiError('red', 'Fallo de red al hablar con Google Ads.');
      await recordUsageError(conn.tenantId, day, err.message).catch(() => undefined);
      if (!err.retryable || attempt >= 3 || opts.signal?.aborted) throw err;
      await sleep(err.retryAfterMs ?? Math.min(30_000, 2000 * 2 ** (attempt - 1)));
    }
  }
}

async function callApi(conn: AdsConnection, customerId: string, query: AdsQuery, signal?: AbortSignal): Promise<ApiRow[]> {
  if (!conn.key) throw new AdsApiError('auth', 'Falta la clave de la cuenta de servicio.');
  const token = await accessToken(conn.key, signal);
  const headers: Record<string, string> = { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'login-customer-id': conn.mccId };
  if (conn.developerToken) headers['developer-token'] = conn.developerToken;
  let res: Response;
  try {
    res = await fetch(`${API_HOST}/${conn.apiVersion}/customers/${customerId}/googleAds:searchStream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: query.gaql }),
      signal: signal ?? AbortSignal.timeout(120_000)
    });
  } catch {
    throw new AdsApiError('red', 'No se pudo contactar con la API de Google Ads.');
  }
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    if (res.status === 401) forgetAdsToken(conn.key);
    throw translateApiError(res.status, body);
  }
  // searchStream devuelve una lista de lotes, cada uno con sus `results`.
  const batches = Array.isArray(body) ? body : body ? [body] : [];
  const rows: ApiRow[] = [];
  for (const b of batches as { results?: ApiRow[]; error?: unknown }[]) {
    if (b?.error) throw translateApiError(res.status, b);
    for (const r of b?.results ?? []) rows.push(r);
  }
  return rows;
}

/** La MCC simulada (para la pantalla de ajustes cuando la credencial es «SIM»). */
export const SIMULATED_MCC = SIM_MCC;
