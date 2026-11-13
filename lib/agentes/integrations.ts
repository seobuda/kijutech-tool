import 'server-only';

// Integraciones externas para los agentes (13 nov 2026). Cada integración guarda sus credenciales CIFRADAS en
// agt_integrations y publica sus herramientas en el registro del núcleo; una herramienta solo se ofrece a un agente si su
// integración está conectada. Proveedores:
//   - DataForSEO (usuario + contraseña de la API): SERP de Google y volúmenes de búsqueda. El saldo se ve al conectar.
//   - Microsoft Clarity (token de la Data Export API del proyecto): resumen de comportamiento de 1 a 3 días. Clarity limita
//     a 10 llamadas al día por proyecto: se guarda en caché el resultado del día.
//   - Google (OAuth con el cliente que Enric crea en Google Cloud): Search Console, Analytics 4 y Business Profile.
//     Business Profile exige que Google apruebe el acceso a su API (formulario aparte).
// Los endpoints y límites salen de la documentación de cada proveedor y hay que confirmarlos con una cuenta real.
import { createHmac, timingSafeEqual } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { agtIntegrations, type AgtIntegration } from '@/lib/db/schema';
import { decrypt, encrypt } from '@/lib/ai/encryption';

export type ProviderKey = 'dataforseo' | 'clarity' | 'google';

export const PROVIDERS: Record<ProviderKey, { title: string; what: string; fields: { key: string; label: string; secret: boolean; placeholder?: string }[]; howTo: string }> = {
  dataforseo: {
    title: 'DataForSEO',
    what: 'Posiciones en Google (SERP) y volúmenes de búsqueda para los agentes.',
    fields: [
      { key: 'login', label: 'Usuario de la API (correo)', secret: false },
      { key: 'password', label: 'Contraseña de la API', secret: true }
    ],
    howTo: 'En app.dataforseo.com → API Access copia el login y la contraseña de la API (no la de la web).'
  },
  clarity: {
    title: 'Microsoft Clarity',
    what: 'Comportamiento de los usuarios en la web (sesiones, scroll, clics muertos, rage clicks) de los últimos 1-3 días.',
    fields: [
      { key: 'token', label: 'Token de la Data Export API', secret: true },
      { key: 'project', label: 'Nombre del proyecto (para reconocerlo)', secret: false, placeholder: 'kijutech.com' }
    ],
    howTo: 'En clarity.microsoft.com → tu proyecto → Settings → Data Export → Generate new API token.'
  },
  google: {
    title: 'Google (Search Console, Analytics, Business Profile)',
    what: 'Rendimiento en Search Console, informes de Analytics 4 y fichas de Google Business Profile.',
    fields: [
      { key: 'clientId', label: 'Client ID de OAuth', secret: false },
      { key: 'clientSecret', label: 'Client secret de OAuth', secret: true }
    ],
    howTo:
      'En console.cloud.google.com: crea un proyecto, activa «Google Search Console API», «Google Analytics Data API», «Google Analytics Admin API» y (si Google te da acceso) «My Business Business Information API»; en Credenciales crea un «ID de cliente de OAuth» de tipo Aplicación web con la URI de redirección indicada abajo. Pega aquí el Client ID y el secret y pulsa «Conectar con Google».'
  }
};

export function isProvider(p: string): p is ProviderKey {
  return p in PROVIDERS;
}

export async function getIntegration(tenantId: string, provider: ProviderKey): Promise<AgtIntegration | null> {
  const [r] = await db.select().from(agtIntegrations).where(and(eq(agtIntegrations.tenantId, tenantId), eq(agtIntegrations.provider, provider))).limit(1);
  return r ?? null;
}

export function readCredentials(i: AgtIntegration | null): Record<string, string> {
  if (!i?.credentials) return {};
  try {
    const { encrypted, iv } = JSON.parse(i.credentials) as { encrypted: string; iv: string };
    return JSON.parse(decrypt(encrypted, iv)) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function saveIntegration(tenantId: string, provider: ProviderKey, creds: Record<string, string>, opts: { status: 'conectada' | 'error' | 'pendiente'; config?: Record<string, unknown>; error?: string | null }): Promise<void> {
  const credentials = JSON.stringify(encrypt(JSON.stringify(creds)));
  const values = { credentials, status: opts.status, lastError: opts.error ?? null, lastOkAt: opts.status === 'conectada' ? new Date() : null, updatedAt: new Date(), ...(opts.config ? { config: opts.config } : {}) };
  await db
    .insert(agtIntegrations)
    .values({ tenantId, provider, ...values })
    .onConflictDoUpdate({ target: [agtIntegrations.tenantId, agtIntegrations.provider], set: values });
}

export async function setIntegrationConfig(tenantId: string, provider: ProviderKey, config: Record<string, unknown>): Promise<void> {
  await db.update(agtIntegrations).set({ config, updatedAt: new Date() }).where(and(eq(agtIntegrations.tenantId, tenantId), eq(agtIntegrations.provider, provider)));
}

export async function markIntegration(tenantId: string, provider: ProviderKey, ok: boolean, error?: string): Promise<void> {
  await db
    .update(agtIntegrations)
    .set(ok ? { status: 'conectada', lastOkAt: new Date(), lastError: null, updatedAt: new Date() } : { status: 'error', lastError: (error ?? 'error').slice(0, 500), updatedAt: new Date() })
    .where(and(eq(agtIntegrations.tenantId, tenantId), eq(agtIntegrations.provider, provider)));
}

export async function deleteIntegration(tenantId: string, provider: ProviderKey): Promise<void> {
  await db.delete(agtIntegrations).where(and(eq(agtIntegrations.tenantId, tenantId), eq(agtIntegrations.provider, provider)));
}

export async function isConnected(tenantId: string, provider: ProviderKey): Promise<boolean> {
  const i = await getIntegration(tenantId, provider);
  if (!i || i.status === 'pendiente') return false;
  return provider !== 'google' || Boolean(readCredentials(i).refreshToken);
}

// --- DataForSEO -------------------------------------------------------------------------------------------

async function dfs<T>(creds: Record<string, string>, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.dataforseo.com/v3${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Basic ${Buffer.from(`${creds.login}:${creds.password}`).toString('base64')}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000)
  });
  if (!res.ok) throw new Error(`DataForSEO (${res.status})`);
  const json = (await res.json()) as { status_code?: number; status_message?: string };
  if (json.status_code && json.status_code >= 40000) throw new Error(`DataForSEO: ${json.status_message ?? json.status_code}`);
  return json as T;
}

export async function testDataForSeo(creds: Record<string, string>): Promise<{ ok: true; detail: string } | { ok: false; error: string }> {
  try {
    const r = await dfs<{ tasks?: { result?: { money?: { balance?: number } }[] }[] }>(creds, '/appendix/user_data');
    const balance = r.tasks?.[0]?.result?.[0]?.money?.balance;
    return { ok: true, detail: balance !== undefined ? `Saldo: ${balance} $` : 'Conectada' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error' };
  }
}

export async function dataForSeoSerp(tenantId: string, keyword: string, location: string, language: string, depth: number): Promise<string> {
  const creds = readCredentials(await getIntegration(tenantId, 'dataforseo'));
  type Item = { type: string; rank_absolute: number; title?: string; url?: string; domain?: string };
  const r = await dfs<{ cost?: number; tasks?: { result?: { items?: Item[]; se_results_count?: number }[] }[] }>(creds, '/serp/google/organic/live/advanced', [
    { keyword, location_name: location, language_code: language, depth }
  ]);
  const items = (r.tasks?.[0]?.result?.[0]?.items ?? []).filter((i) => i.type === 'organic').slice(0, depth);
  await markIntegration(tenantId, 'dataforseo', true);
  return [`SERP de «${keyword}» (${location}, ${language}) · coste ${r.cost ?? '?'} $`, ...items.map((i) => `${i.rank_absolute}. ${i.domain ?? ''} — ${i.title ?? ''} ${i.url ?? ''}`)].join('\n');
}

export async function dataForSeoVolume(tenantId: string, keywords: string[], location: string, language: string): Promise<string> {
  const creds = readCredentials(await getIntegration(tenantId, 'dataforseo'));
  type Res = { keyword: string; search_volume: number | null; competition: string | null; cpc: number | null };
  const r = await dfs<{ cost?: number; tasks?: { result?: Res[] }[] }>(creds, '/keywords_data/google_ads/search_volume/live', [{ keywords: keywords.slice(0, 100), location_name: location, language_code: language }]);
  const rows = r.tasks?.[0]?.result ?? [];
  await markIntegration(tenantId, 'dataforseo', true);
  return [`Volúmenes (${location}, ${language}) · coste ${r.cost ?? '?'} $`, ...rows.map((x) => `- ${x.keyword}: ${x.search_volume ?? '—'} búsquedas/mes · competencia ${x.competition ?? '—'} · CPC ${x.cpc ?? '—'}`)].join('\n');
}

// --- Microsoft Clarity ------------------------------------------------------------------------------------

export async function clarityInsights(tenantId: string, days: number, dimension: string | null): Promise<string> {
  const integ = await getIntegration(tenantId, 'clarity');
  const creds = readCredentials(integ);
  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = `${today}:${days}:${dimension ?? ''}`;
  const config = (integ?.config ?? {}) as { cache?: Record<string, string> };
  if (config.cache?.[cacheKey]) return config.cache[cacheKey];
  const q = new URLSearchParams({ numOfDays: String(Math.min(3, Math.max(1, days))) });
  if (dimension) q.set('dimension1', dimension);
  const res = await fetch(`https://www.clarity.ms/export-data/api/v1/project-live-insights?${q}`, { headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    await markIntegration(tenantId, 'clarity', false, `Clarity (${res.status})`);
    throw new Error(res.status === 429 ? 'Clarity: límite de 10 consultas al día alcanzado' : `Clarity (${res.status})`);
  }
  const data = (await res.json()) as { metricName: string; information: Record<string, unknown>[] }[];
  const text = data
    .map((m) => `${m.metricName}: ${m.information.slice(0, 10).map((i) => Object.entries(i).map(([k, v]) => `${k}=${String(v)}`).join(', ')).join(' | ')}`)
    .join('\n')
    .slice(0, 12_000);
  // Solo se guardan las consultas de hoy (las de otros días se descartan).
  const cache = Object.fromEntries(Object.entries(config.cache ?? {}).filter(([k]) => k.startsWith(today)));
  await setIntegrationConfig(tenantId, 'clarity', { ...config, cache: { ...cache, [cacheKey]: text } });
  await markIntegration(tenantId, 'clarity', true);
  return text || 'Clarity no devolvió datos para ese periodo.';
}

// --- Google (OAuth) ---------------------------------------------------------------------------------------

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/business.manage'
];

export function googleRedirectUri(): string {
  return `${(process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')}/api/agentes/google/callback`;
}

/** Estado firmado (tenant + usuario + hora) para que nadie más pueda completar la conexión. */
export function signState(tenantId: string, userId: number, now = Date.now()): string {
  const payload = `${tenantId}.${userId}.${now}`;
  const sig = createHmac('sha256', process.env.AUTH_SECRET || 'dev').update(`google-oauth:${payload}`).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

export function verifyState(state: string, maxAgeMs = 15 * 60_000): { tenantId: string; userId: number } | null {
  const [b64, sig] = state.split('.');
  if (!b64 || !sig) return null;
  const payload = Buffer.from(b64, 'base64url').toString();
  const expected = createHmac('sha256', process.env.AUTH_SECRET || 'dev').update(`google-oauth:${payload}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [tenantId, userId, ts] = payload.split('.');
  if (!tenantId || !userId || Date.now() - Number(ts) > maxAgeMs) return null;
  return { tenantId, userId: Number(userId) };
}

export function googleAuthUrl(clientId: string, state: string): string {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: googleRedirectUri(), response_type: 'code', scope: GOOGLE_SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export async function exchangeGoogleCode(creds: Record<string, string>, code: string): Promise<{ refreshToken: string | null; error?: string }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: creds.clientId, client_secret: creds.clientSecret, redirect_uri: googleRedirectUri(), grant_type: 'authorization_code' }),
    signal: AbortSignal.timeout(20_000)
  });
  const json = (await res.json().catch(() => ({}))) as { refresh_token?: string; error?: string };
  return { refreshToken: json.refresh_token ?? null, error: json.error };
}

const accessCache = new Map<string, { token: string; until: number }>();

async function googleAccessToken(tenantId: string): Promise<string> {
  const hit = accessCache.get(tenantId);
  if (hit && hit.until > Date.now() + 60_000) return hit.token;
  const creds = readCredentials(await getIntegration(tenantId, 'google'));
  if (!creds.refreshToken) throw new Error('Google no está conectado');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: creds.clientId, client_secret: creds.clientSecret, refresh_token: creds.refreshToken, grant_type: 'refresh_token' }),
    signal: AbortSignal.timeout(20_000)
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!json.access_token) {
    await markIntegration(tenantId, 'google', false, `Google: ${json.error ?? res.status}`);
    throw new Error(`Google: ${json.error ?? 'no se pudo renovar el acceso'} (vuelve a conectar en Agentes → Integraciones)`);
  }
  accessCache.set(tenantId, { token: json.access_token, until: Date.now() + (json.expires_in ?? 3600) * 1000 });
  return json.access_token;
}

async function gapi<T>(tenantId: string, url: string, body?: unknown): Promise<T> {
  const token = await googleAccessToken(tenantId);
  const res = await fetch(url, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? '';
    throw new Error(`Google (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
  await markIntegration(tenantId, 'google', true);
  return res.json() as Promise<T>;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function gscSites(tenantId: string): Promise<string> {
  const r = await gapi<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(tenantId, 'https://www.googleapis.com/webmasters/v3/sites');
  return (r.siteEntry ?? []).map((s) => `- ${s.siteUrl} (${s.permissionLevel})`).join('\n') || 'Sin propiedades en Search Console.';
}

export async function gscPerformance(tenantId: string, site: string, days: number, dimension: string, pageFilter: string | null, limit: number): Promise<string> {
  // Search Console va con ~2 días de retraso: el periodo acaba hace 2 días.
  const end = new Date(Date.now() - 2 * 86_400_000);
  const start = new Date(end.getTime() - days * 86_400_000);
  const body: Record<string, unknown> = { startDate: ymd(start), endDate: ymd(end), dimensions: [dimension], rowLimit: limit };
  if (pageFilter) body.dimensionFilterGroups = [{ filters: [{ dimension: 'page', operator: 'contains', expression: pageFilter }] }];
  const r = await gapi<{ rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[] }>(tenantId, `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, body);
  const rows = r.rows ?? [];
  return [`Search Console ${site} · ${ymd(start)} a ${ymd(end)} · por ${dimension}`, ...rows.map((x) => `- ${x.keys[0]}: ${x.clicks} clics · ${x.impressions} impresiones · CTR ${(x.ctr * 100).toFixed(1)} % · posición ${x.position.toFixed(1)}`)].join('\n');
}

export async function ga4Properties(tenantId: string): Promise<string> {
  const r = await gapi<{ accountSummaries?: { displayName: string; propertySummaries?: { property: string; displayName: string }[] }[] }>(tenantId, 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries');
  return (r.accountSummaries ?? []).flatMap((a) => (a.propertySummaries ?? []).map((p) => `- ${p.displayName} (${a.displayName}): ${p.property.replace('properties/', '')}`)).join('\n') || 'Sin propiedades de Analytics.';
}

export async function ga4Report(tenantId: string, property: string, days: number, metrics: string[], dimension: string | null): Promise<string> {
  const id = property.replace(/\D/g, '');
  const body: Record<string, unknown> = { dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'yesterday' }], metrics: metrics.slice(0, 10).map((name) => ({ name })), limit: 25 };
  if (dimension) body.dimensions = [{ name: dimension }];
  const r = await gapi<{ rows?: { dimensionValues?: { value: string }[]; metricValues: { value: string }[] }[]; totals?: unknown }>(tenantId, `https://analyticsdata.googleapis.com/v1beta/properties/${id}:runReport`, body);
  return [`Analytics ${id} · últimos ${days} días · ${metrics.join(', ')}${dimension ? ` por ${dimension}` : ''}`, ...(r.rows ?? []).map((row) => `- ${row.dimensionValues?.[0]?.value ?? 'total'}: ${row.metricValues.map((v, i) => `${metrics[i]}=${v.value}`).join(' · ')}`)].join('\n');
}

export async function gbpLocations(tenantId: string): Promise<string> {
  const acc = await gapi<{ accounts?: { name: string; accountName: string }[] }>(tenantId, 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts');
  const out: string[] = [];
  for (const a of (acc.accounts ?? []).slice(0, 5)) {
    const loc = await gapi<{ locations?: { name: string; title: string; storefrontAddress?: { locality?: string } }[] }>(tenantId, `https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?readMask=name,title,storefrontAddress&pageSize=50`);
    for (const l of loc.locations ?? []) out.push(`- ${l.title}${l.storefrontAddress?.locality ? ` (${l.storefrontAddress.locality})` : ''}: ${a.name}/${l.name}`);
  }
  return out.join('\n') || 'Sin fichas de Business Profile (o la cuenta no tiene acceso a la API).';
}
