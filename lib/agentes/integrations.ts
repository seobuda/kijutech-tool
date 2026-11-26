import 'server-only';

// Integraciones externas para los agentes (13 nov 2026). Cada integración guarda sus credenciales CIFRADAS en
// agt_integrations y publica sus herramientas en el registro del núcleo; una herramienta solo se ofrece a un agente si su
// integración está conectada. Proveedores:
//   - DataForSEO (usuario + contraseña de la API): SERP de Google y volúmenes de búsqueda. El saldo se ve al conectar.
//   - Microsoft Clarity (token de la Data Export API del proyecto): resumen de comportamiento de 1 a 3 días. Clarity limita
//     a 10 llamadas al día por proyecto: se guarda en caché el resultado del día.
//   - Google (OAuth con el cliente que Enric crea en Google Cloud): Search Console, Analytics 4 y Business Profile.
//     Business Profile exige que Google apruebe el acceso a su API (formulario aparte).
//   - Google Places (clave de API de Places API (New), 25 nov 2026): nota, número de reseñas y últimas reseñas de las fichas
//     de Google de la competencia. Se paga por uso en la facturación de Google Cloud.
// Los endpoints y límites salen de la documentación de cada proveedor y hay que confirmarlos con una cuenta real.
import { createHmac, timingSafeEqual } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { agtIntegrations, type AgtIntegration } from '@/lib/db/schema';
import { decrypt, encrypt } from '@/lib/ai/encryption';
import type { SerpResult } from '@/lib/core/capabilities';

export type ProviderKey = 'dataforseo' | 'clarity' | 'google' | 'places' | 'pagespeed';

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
  },
  places: {
    title: 'Google Places',
    what: 'Consultas puntuales a Google Maps, sin guardar los datos. Ojo: sus condiciones solo permiten guardar el identificador de la ficha y, facturando en el EEE, no permiten vigilar a la competencia; por eso la vigilancia de fichas y reseñas de SEO usa DataForSEO.',
    fields: [{ key: 'apiKey', label: 'Clave de API', secret: true }],
    howTo:
      'En console.cloud.google.com, en el mismo proyecto que la conexión de Google: activa «Places API (New)» (no la antigua «Places API»), con la facturación activada. En Credenciales → Crear credenciales → Clave de API; edítala y en «Restricciones de API» deja solo «Places API (New)». Pégala aquí: al guardar se prueba con una consulta que no lleva datos de pago.'
  },
  pagespeed: {
    title: 'PageSpeed / CrUX',
    what: 'Velocidad real de los usuarios (Core Web Vitals del Chrome UX Report) y la prueba de laboratorio de PageSpeed Insights, para la Salud técnica de los proyectos SEO. Sin clave, Google limita mucho las peticiones.',
    fields: [{ key: 'apiKey', label: 'Clave de API', secret: true }],
    howTo:
      'En console.cloud.google.com, en el proyecto de la conexión de Google: activa «PageSpeed Insights API» y «Chrome UX Report API». En Credenciales → Crear credenciales → Clave de API; edítala y en «Restricciones de API» deja solo esas dos. Pégala aquí: al guardar se prueba con una consulta al Chrome UX Report.'
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

/** SERP estructurada (orgánico y paquete local) para la fuente de búsquedas del núcleo (registerSerpSource, Hito 2 SEO). */
export async function dataForSeoSerpResult(tenantId: string, q: { keyword: string; location: string; language: string; depth?: number }): Promise<SerpResult> {
  const creds = readCredentials(await getIntegration(tenantId, 'dataforseo'));
  type Item = { type: string; rank_absolute: number; rank_group?: number; title?: string; url?: string; domain?: string; rating?: { value?: number; votes_count?: number } | null; items?: Item[] };
  const r = await dfs<{ cost?: number; tasks?: { result?: { items?: Item[] }[] }[] }>(creds, '/serp/google/organic/live/advanced', [
    { keyword: q.keyword.slice(0, 200), location_name: q.location, language_code: q.language, depth: Math.min(q.depth ?? 20, 50) }
  ]);
  const items = r.tasks?.[0]?.result?.[0]?.items ?? [];
  await markIntegration(tenantId, 'dataforseo', true);
  const host = (u: string | undefined) => {
    try {
      return u ? new URL(u).hostname.replace(/^www\./, '') : null;
    } catch {
      return null;
    }
  };
  return {
    organic: items.filter((i) => i.type === 'organic' && i.url).map((i) => ({ rank: i.rank_group ?? i.rank_absolute, domain: (i.domain ?? host(i.url) ?? '').replace(/^www\./, ''), url: i.url!, title: i.title ?? '' })),
    localPack: items
      .filter((i) => i.type === 'local_pack')
      .map((i, n) => ({ rank: n + 1, title: i.title ?? '', domain: host(i.url) ?? (i.domain ? i.domain.replace(/^www\./, '') : null), rating: i.rating?.value ?? null, reviews: i.rating?.votes_count ?? null })),
    costUsd: typeof r.cost === 'number' ? r.cost : null
  };
}

// --- DataForSEO: cola asíncrona para las posiciones de SEO (parte 4, 26 nov 2026) --------------------------------------
// Se cobra al enviar (task_post devuelve el coste de cada tarea); recoger por id (task_get) es gratis durante 30 días.
// Cada tarea lleva su propio status_code: una ubicación no válida dentro de un lote falla sola, no el lote.

type DfsTask<R> = { id?: string; status_code?: number; status_message?: string; cost?: number; data?: { tag?: string }; result?: R[] | null };

export async function dataForSeoPostTasks(tenantId: string, tasks: import('@/lib/core/capabilities').SerpTaskInput[]): Promise<import('@/lib/core/capabilities').SerpTaskPosted[]> {
  const creds = readCredentials(await getIntegration(tenantId, 'dataforseo'));
  const out: import('@/lib/core/capabilities').SerpTaskPosted[] = [];
  for (let i = 0; i < tasks.length; i += 100) {
    const batch = tasks.slice(i, i + 100);
    const r = await dfs<{ tasks?: DfsTask<unknown>[] }>(
      creds,
      '/serp/google/organic/task_post',
      batch.map((t) => ({ keyword: t.keyword.slice(0, 200), location_name: t.location, language_code: t.language, device: t.device, depth: Math.min(t.depth, 100), tag: t.tag.slice(0, 255), priority: 1, load_async_ai_overview: true }))
    );
    const got = r.tasks ?? [];
    batch.forEach((t) => {
      // Solo por la etiqueta: emparejar por orden podría guardar la posición de otra búsqueda.
      const task = got.find((x) => x.data?.tag === t.tag);
      const ok = task && task.status_code === 20100 && task.id;
      out.push({ tag: t.tag, id: ok ? task!.id! : null, costUsd: typeof task?.cost === 'number' ? task.cost : 0, error: ok ? null : `${task?.status_code ?? '?'}: ${task?.status_message ?? 'sin respuesta'}`.slice(0, 300) });
    });
  }
  await markIntegration(tenantId, 'dataforseo', true);
  return out;
}

type SerpItem = { type: string; rank_group?: number; rank_absolute?: number; domain?: string; url?: string; title?: string; is_paid?: boolean; items?: SerpItem[]; references?: { domain?: string; url?: string }[] };

/** Resume una SERP avanzada de DataForSEO (puro: se prueba con una respuesta guardada). */
export function summarizeSerpItems(items: SerpItem[]): Extract<import('@/lib/core/capabilities').SerpTaskResult, { status: 'hecha' }> {
  const host = (u: string | undefined) => {
    try {
      return u ? new URL(u).hostname.replace(/^www\./, '').toLowerCase() : null;
    } catch {
      return null;
    }
  };
  const organic = items.filter((i) => i.type === 'organic' && i.url).map((i) => ({ rank: i.rank_group ?? i.rank_absolute ?? 0, domain: (i.domain ?? host(i.url) ?? '').replace(/^www\./, '').toLowerCase(), url: i.url! }));
  const lp = items.find((i) => i.type === 'local_pack') ? items.filter((i) => i.type === 'local_pack') : [];
  // Algunas respuestas traen el paquete local como un bloque con sus fichas dentro.
  const lpItems = lp.flatMap((b) => (b.items?.length ? b.items : [b]));
  const localPack = lpItems.map((i, n) => ({ rank: n + 1, title: i.title ?? '', domain: host(i.url) ?? (i.domain ? i.domain.replace(/^www\./, '').toLowerCase() : null), paid: Boolean(i.is_paid) }));
  const aioItem = items.find((i) => i.type === 'ai_overview');
  const refs = [...(aioItem?.references ?? []), ...(aioItem?.items ?? []).flatMap((x) => x.references ?? [])];
  const aio = { present: Boolean(aioItem), domains: [...new Set(refs.map((r) => (r.domain ?? host(r.url) ?? '').replace(/^www\./, '').toLowerCase()).filter(Boolean))].slice(0, 20) };
  const features = [...new Set(items.map((i) => i.type).filter((t) => t !== 'organic'))].slice(0, 20);
  return { status: 'hecha', organic, localPack, aio, features };
}

export async function dataForSeoGetTask(tenantId: string, id: string): Promise<import('@/lib/core/capabilities').SerpTaskResult> {
  const creds = readCredentials(await getIntegration(tenantId, 'dataforseo'));
  const r = await dfs<{ tasks?: DfsTask<{ items?: SerpItem[] }>[] }>(creds, `/serp/google/organic/task_get/advanced/${encodeURIComponent(id)}`);
  const t = r.tasks?.[0];
  if (!t) return { status: 'error', error: 'sin respuesta' };
  // 40601 (en manos del sistema) y 40602 (en cola): aún no está.
  if (t.status_code === 40601 || t.status_code === 40602) return { status: 'pendiente' };
  if (t.status_code !== 20000) return { status: 'error', error: `${t.status_code}: ${t.status_message ?? ''}`.slice(0, 300) };
  return summarizeSerpItems(t.result?.[0]?.items ?? []);
}

// --- Google Maps en cola (SEO parte 5b, geo-grid) -----------------------------------------------------------------------
type MapsRaw = { type: string; rank_group?: number; cid?: string | null; place_id?: string | null; title?: string; domain?: string | null; url?: string | null; rating?: { value?: number | null; votes_count?: number | null } | null; category?: string | null };

/** Resultados de Maps: solo los de búsqueda (los anuncios, «maps_paid_item», no cuentan ni llevan cid). Puro. */
export function summarizeMapsItems(items: MapsRaw[]): import('@/lib/core/capabilities').MapsItem[] {
  return items
    .filter((i) => i.type === 'maps_search' && i.title)
    .map((i) => ({
      rank: i.rank_group ?? 0,
      cid: i.cid ?? null,
      placeId: i.place_id ?? null,
      title: i.title!,
      domain: (i.domain ?? null)?.replace(/^www\./, '').toLowerCase() ?? null,
      rating: typeof i.rating?.value === 'number' ? i.rating.value : null,
      votes: typeof i.rating?.votes_count === 'number' ? i.rating.votes_count : null,
      category: i.category ?? null
    }))
    .sort((a, b) => a.rank - b.rank);
}

export async function dataForSeoPostMapsTasks(tenantId: string, tasks: { keyword: string; coordinate: string; language: string; tag: string }[]): Promise<import('@/lib/core/capabilities').SerpTaskPosted[]> {
  const creds = readCredentials(await getIntegration(tenantId, 'dataforseo'));
  const out: import('@/lib/core/capabilities').SerpTaskPosted[] = [];
  for (let i = 0; i < tasks.length; i += 100) {
    const batch = tasks.slice(i, i + 100);
    // search_this_area: false y zoom fijo en la coordenada: si no, Maps limita al área visible (auditoría 5b).
    const r = await dfs<{ tasks?: DfsTask<unknown>[] }>(creds, '/serp/google/maps/task_post', batch.map((t) => ({ keyword: t.keyword.slice(0, 200), location_coordinate: t.coordinate, language_code: t.language, depth: 100, search_this_area: false, tag: t.tag.slice(0, 255), priority: 1 })));
    const got = r.tasks ?? [];
    for (const t of batch) {
      const task = got.find((x) => x.data?.tag === t.tag);
      const ok = task && task.status_code === 20100 && task.id;
      out.push({ tag: t.tag, id: ok ? task!.id! : null, costUsd: typeof task?.cost === 'number' ? task.cost : 0, error: ok ? null : `${task?.status_code ?? '?'}: ${task?.status_message ?? 'sin respuesta'}`.slice(0, 300) });
    }
  }
  await markIntegration(tenantId, 'dataforseo', true);
  return out;
}

export async function dataForSeoGetMapsTask(tenantId: string, id: string): Promise<import('@/lib/core/capabilities').MapsTaskResult> {
  const creds = readCredentials(await getIntegration(tenantId, 'dataforseo'));
  const r = await dfs<{ tasks?: DfsTask<{ items?: MapsRaw[] }>[] }>(creds, `/serp/google/maps/task_get/advanced/${encodeURIComponent(id)}`);
  const t = r.tasks?.[0];
  if (!t) return { status: 'error', error: 'sin respuesta' };
  if (t.status_code === 40601 || t.status_code === 40602) return { status: 'pendiente' };
  if (t.status_code !== 20000) return { status: 'error', error: `${t.status_code}: ${t.status_message ?? ''}`.slice(0, 300) };
  return { status: 'hecha', items: summarizeMapsItems(t.result?.[0]?.items ?? []) };
}

const G_LOC = globalThis as unknown as { __kijuDfsLocations?: Map<string, { at: number; list: { name: string; type: string }[] }> };
/** Ubicaciones de un país (gratis en DataForSEO), cacheadas un día en memoria. */
export async function dataForSeoLocations(tenantId: string, country: string): Promise<{ name: string; type: string }[]> {
  const key = country.toLowerCase();
  const cache = (G_LOC.__kijuDfsLocations ??= new Map());
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 86_400_000) return hit.list;
  const creds = readCredentials(await getIntegration(tenantId, 'dataforseo'));
  const r = await dfs<{ tasks?: DfsTask<{ location_name: string; location_type: string }>[] }>(creds, `/serp/google/locations/${encodeURIComponent(key)}`);
  const list = (r.tasks?.[0]?.result ?? []).map((x) => ({ name: x.location_name, type: x.location_type }));
  cache.set(key, { at: Date.now(), list });
  return list;
}

/** Volumen mensual medio (Google Ads) de hasta 1000 búsquedas, con su coste. */
export async function dataForSeoVolumes(tenantId: string, keywords: string[], location: string, language: string): Promise<{ volumes: Map<string, number | null>; costUsd: number }> {
  const creds = readCredentials(await getIntegration(tenantId, 'dataforseo'));
  type Res = { keyword: string; search_volume: number | null };
  const r = await dfs<{ cost?: number; tasks?: DfsTask<Res>[] }>(creds, '/keywords_data/google_ads/search_volume/live', [{ keywords: keywords.slice(0, 1000), location_name: location, language_code: language }]);
  const t = r.tasks?.[0];
  if (t && t.status_code !== 20000) throw new Error(`DataForSEO volumen: ${t.status_code} ${t.status_message ?? ''}`);
  return { volumes: new Map((t?.result ?? []).map((x) => [x.keyword.toLowerCase(), x.search_volume])), costUsd: typeof r.cost === 'number' ? r.cost : 0 };
}

// --- DataForSEO: ficha de Google de un negocio (SEO parte 5, local, 26 nov 2026) -------------------------------------
// my_business_info en directo (unos 0,0054 $ por consulta [NV]). A diferencia de Google Places, sus condiciones no impiden
// guardar los datos (Places solo permite guardar el place_id y, en el EEE, no permite vigilar a la competencia).

type DfsBiz = {
  title?: string;
  category?: string | null;
  additional_categories?: string[] | null;
  cid?: string | null;
  place_id?: string | null;
  phone?: string | null;
  url?: string | null;
  domain?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  rating?: { value?: number | null; votes_count?: number | null } | null;
  rating_distribution?: Record<string, number> | null;
  is_claimed?: boolean | null;
  work_time?: { work_hours?: { timetable?: Record<string, { open?: { hour: number; minute: number }; close?: { hour: number; minute: number } }[] | null> | null; current_status?: string | null } | null } | null;
};

const hhmm = (t?: { hour: number; minute: number }) => (t ? `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}` : '');

/** Normaliza la respuesta de my_business_info (puro: se prueba con una respuesta guardada). */
export function normalizeBusinessInfo(x: DfsBiz | null | undefined): import('@/lib/core/capabilities').BusinessInfo | null {
  if (!x || !x.title) return null;
  const tt = x.work_time?.work_hours?.timetable ?? null;
  const hours = tt
    ? Object.fromEntries(
        Object.entries(tt)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([day, slots]) => [day, (slots ?? []).map((sl) => `${hhmm(sl.open)}-${hhmm(sl.close)}`).sort().join(',')])
      )
    : null;
  const cs = (x.work_time?.work_hours?.current_status ?? '').toLowerCase();
  const status = cs.includes('closed_forever') || cs.includes('permanently') ? 'cerrada_definitiva' : cs.includes('temporarily') ? 'cerrada_temporal' : cs ? 'abierta' : null;
  const domain = (x.domain ?? (x.url ? (() => { try { return new URL(x.url!).hostname; } catch { return null; } })() : null))?.replace(/^www\./, '').toLowerCase() ?? null;
  return {
    cid: x.cid ?? null,
    placeId: x.place_id ?? null,
    title: x.title,
    category: x.category ?? null,
    additionalCategories: (x.additional_categories ?? []).slice(0, 10),
    phone: x.phone ?? null,
    domain,
    address: x.address ?? null,
    lat: typeof x.latitude === 'number' ? x.latitude : null,
    lng: typeof x.longitude === 'number' ? x.longitude : null,
    rating: typeof x.rating?.value === 'number' ? x.rating.value : null,
    votes: typeof x.rating?.votes_count === 'number' ? x.rating.votes_count : null,
    distribution: x.rating_distribution ?? null,
    status,
    isClaimed: typeof x.is_claimed === 'boolean' ? x.is_claimed : null,
    hours
  };
}

export async function dataForSeoBusinessInfo(tenantId: string, q: { keyword: string; location: string; language: string }): Promise<{ info: import('@/lib/core/capabilities').BusinessInfo | null; costUsd: number }> {
  const creds = readCredentials(await getIntegration(tenantId, 'dataforseo'));
  const r = await dfs<{ cost?: number; tasks?: DfsTask<{ items?: DfsBiz[] }>[] }>(creds, '/business_data/google/my_business_info/live', [{ keyword: q.keyword.slice(0, 200), location_name: q.location, language_code: q.language }]);
  const t = r.tasks?.[0];
  const cost = typeof t?.cost === 'number' ? t.cost : typeof r.cost === 'number' ? r.cost : 0.0054;
  // 40102: sin resultados (no es un error del servicio).
  if (t && t.status_code !== 20000 && t.status_code !== 40102) throw new Error(`DataForSEO ficha: ${t.status_code} ${t.status_message ?? ''}`.slice(0, 200));
  await markIntegration(tenantId, 'dataforseo', true);
  return { info: normalizeBusinessInfo(t?.result?.[0]?.items?.[0]), costUsd: cost };
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

// --- Google Places (New) ----------------------------------------------------------------------------------

/** Ficha de ejemplo de la documentación de Google: la prueba solo pide su id, que no lleva datos de pago [NV]. */
const PLACES_TEST_ID = 'ChIJN1t_tDeuEmsRUsoyG83frY4';

export async function testPlaces(creds: Record<string, string>): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${PLACES_TEST_ID}`, {
      headers: { 'X-Goog-Api-Key': creds.apiKey ?? '', 'X-Goog-FieldMask': 'id' },
      signal: AbortSignal.timeout(15_000)
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { error?: { message?: string; status?: string } } | null;
    const msg = body?.error?.message ?? `HTTP ${res.status}`;
    return { ok: false, error: `${res.status}: ${msg.slice(0, 300)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : 'sin respuesta' };
  }
}

// --- PageSpeed / CrUX (26 nov 2026) -------------------------------------------------------------------------

/** Prueba la clave con el Chrome UX Report (rápido, sin Lighthouse): un origen público con datos seguros. */
export async function testPageSpeed(creds: Record<string, string>): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${encodeURIComponent(creds.apiKey ?? '')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: 'https://www.google.com', formFactor: 'PHONE', metrics: ['largest_contentful_paint'] }),
      signal: AbortSignal.timeout(15_000)
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    return { ok: false, error: `${res.status}: ${(body?.error?.message ?? `HTTP ${res.status}`).slice(0, 300)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : 'sin respuesta' };
  }
}

/** La clave guardada (o null si no hay integración conectada). */
export async function pageSpeedKey(tenantId: string): Promise<string | null> {
  const i = await getIntegration(tenantId, 'pagespeed');
  if (!i || i.status === 'pendiente') return null;
  return readCredentials(i).apiKey || null;
}

/** La clave a usar: la de Integraciones y, de reserva, PAGESPEED_API_KEY del .env. */
export async function effectivePageSpeedKey(tenantId: string): Promise<string | null> {
  return (await pageSpeedKey(tenantId).catch(() => null)) || process.env.PAGESPEED_API_KEY || null;
}

type CruxMetric = { percentiles?: { p75?: number | string } };
const p75 = (m?: CruxMetric): number | null => {
  const v = m?.percentiles?.p75;
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** Categoría global de Core Web Vitals con los umbrales públicos de Google (p75): lenta si alguna es mala. */
export function cwvCategory(lcpMs: number | null, inpMs: number | null, cls: number | null): 'FAST' | 'AVERAGE' | 'SLOW' | null {
  const parts: ('good' | 'ni' | 'poor')[] = [];
  if (lcpMs !== null) parts.push(lcpMs <= 2500 ? 'good' : lcpMs <= 4000 ? 'ni' : 'poor');
  if (inpMs !== null) parts.push(inpMs <= 200 ? 'good' : inpMs <= 500 ? 'ni' : 'poor');
  if (cls !== null) parts.push(cls <= 0.1 ? 'good' : cls <= 0.25 ? 'ni' : 'poor');
  if (!parts.length) return null;
  if (parts.includes('poor')) return 'SLOW';
  return parts.every((p) => p === 'good') ? 'FAST' : 'AVERAGE';
}

/** Core Web Vitals reales en móvil (Chrome UX Report): de la URL y, si no tiene datos, de su origen. */
export async function cruxField(tenantId: string, url: string): Promise<import('@/lib/core/capabilities').SpeedField | null> {
  const key = await effectivePageSpeedKey(tenantId);
  if (!key) throw new Error('Falta la clave de PageSpeed / CrUX (Agentes → Integraciones)');
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return null;
  }
  for (const [scope, body] of [
    ['url', { url }],
    ['origin', { origin }]
  ] as const) {
    const res = await fetch(`https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, formFactor: 'PHONE', metrics: ['largest_contentful_paint', 'interaction_to_next_paint', 'cumulative_layout_shift'] }),
      signal: AbortSignal.timeout(20_000)
    });
    if (res.status === 404) continue; // Sin tráfico suficiente para esta URL: se prueba el origen.
    if (!res.ok) {
      await markIntegration(tenantId, 'pagespeed', false, `CrUX (${res.status})`).catch(() => undefined);
      throw new Error(res.status === 429 ? 'Chrome UX Report: límite de peticiones' : `Chrome UX Report (${res.status})`);
    }
    const j = (await res.json()) as { record?: { metrics?: Record<string, CruxMetric> } };
    const m = j.record?.metrics ?? {};
    const lcpMs = p75(m.largest_contentful_paint);
    const inpMs = p75(m.interaction_to_next_paint);
    const cls = p75(m.cumulative_layout_shift);
    return { lcpMs, inpMs, cls, category: cwvCategory(lcpMs, inpMs, cls), scope };
  }
  return null;
}

type LhAudit = { score?: number | null; numericValue?: number; details?: { items?: { url?: string; wastedBytes?: number }[]; overallSavingsBytes?: number } };

/** Resume las auditorías de Lighthouse que usa SEO (puro: se prueba con una respuesta guardada). */
export function summarizeLighthouse(lh: { categories?: { performance?: { score?: number | null } }; audits?: Record<string, LhAudit> } | undefined): import('@/lib/core/capabilities').SpeedLab {
  const a = lh?.audits ?? {};
  const num = (x?: LhAudit) => (typeof x?.numericValue === 'number' ? Math.round(x.numericValue) : null);
  const pass = (id: string) => (a[id] && typeof a[id].score === 'number' ? a[id].score! >= 0.9 : null);
  // Lighthouse cambió las auditorías de imágenes por «insights» (image-delivery-insight); se leen las dos versiones.
  const legacyImg = ['uses-optimized-images', 'modern-image-formats', 'uses-responsive-images'].filter((id) => a[id]);
  const insight = a['image-delivery-insight'];
  const savings = legacyImg.length
    ? legacyImg.reduce((t, id) => t + (a[id]?.details?.overallSavingsBytes ?? 0), 0)
    : insight
      ? (insight.details?.overallSavingsBytes ?? (insight.details?.items ?? []).reduce((t, i) => t + (i.wastedBytes ?? 0), 0))
      : 0;
  const score = lh?.categories?.performance?.score;
  return {
    score: typeof score === 'number' ? Math.round(score * 100) : null,
    viewportOk: pass('viewport'),
    httpsOk: pass('is-on-https'),
    insecureRequests: (a['is-on-https']?.details?.items ?? []).map((i) => String(i.url ?? '')).filter(Boolean).slice(0, 20),
    unsizedImages: a['unsized-images']?.details?.items?.length ?? 0,
    imageSavingsKb: Math.round(savings / 1024),
    totalKb: typeof a['total-byte-weight']?.numericValue === 'number' ? Math.round(a['total-byte-weight'].numericValue / 1024) : null,
    imagesKnown: legacyImg.length > 0 || Boolean(insight),
    metrics: {
      fcpMs: num(a['first-contentful-paint']),
      lcpMs: num(a['largest-contentful-paint']),
      tbtMs: num(a['total-blocking-time']),
      cls: typeof a['cumulative-layout-shift']?.numericValue === 'number' ? Math.round(a['cumulative-layout-shift'].numericValue * 1000) / 1000 : null,
      siMs: num(a['speed-index'])
    }
  };
}

/** PageSpeed Insights (Lighthouse en Google, móvil) de una URL. Tarda 20-60 s. */
export async function pageSpeedLab(tenantId: string, url: string): Promise<import('@/lib/core/capabilities').SpeedLab | null> {
  const key = await effectivePageSpeedKey(tenantId);
  if (!key) throw new Error('Falta la clave de PageSpeed / CrUX (Agentes → Integraciones)');
  const q = new URLSearchParams({ url, strategy: 'mobile', key });
  for (const c of ['performance', 'best-practices', 'seo']) q.append('category', c);
  const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) {
    if (res.status === 429) await markIntegration(tenantId, 'pagespeed', false, 'PageSpeed (429)').catch(() => undefined);
    if (res.status === 400 || res.status === 500) return null; // la web no se dejó medir (Lighthouse no pudo cargarla)
    throw new Error(`PageSpeed (${res.status})`);
  }
  const j = (await res.json()) as { lighthouseResult?: Parameters<typeof summarizeLighthouse>[0] };
  return summarizeLighthouse(j.lighthouseResult);
}

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

/** Llamada autenticada a una API de Google (para la fuente de métricas de lib/agentes/metrics.ts). */
export const gapiFetch = gapi;

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

// --- Directorio para asignar propiedades a las fichas de cliente (15 nov 2026) ----------------------------------
// Devuelven datos estructurados (no texto) para lib/core/client-directory.ts, registrados en register.ts.

export type GoogleAsset = { kind: 'search_console' | 'analytics' | 'business_profile'; value: string; label: string; domain: string | null; detail?: string };

const hostOf = (url: string | null | undefined): string | null => {
  const m = String(url ?? '')
    .trim()
    .toLowerCase()
    .replace(/^sc-domain:/, '')
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#:\s]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(m) ? m : null;
};

/** Webs de Search Console con permiso real (las «sin verificar» no dan datos). */
export async function gscSiteList(tenantId: string): Promise<GoogleAsset[]> {
  const r = await gapi<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(tenantId, 'https://www.googleapis.com/webmasters/v3/sites');
  return (r.siteEntry ?? [])
    .filter((s) => s.permissionLevel !== 'siteUnverifiedUser')
    .map((s) => ({ kind: 'search_console' as const, value: s.siteUrl, label: s.siteUrl.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/$/, ''), domain: hostOf(s.siteUrl), detail: s.siteUrl.startsWith('sc-domain:') ? 'Propiedad de dominio' : 'Prefijo de URL' }));
}

/** Todas las páginas de un listado de Google (pageToken), con tope de seguridad. */
async function allPages<T>(tenantId: string, url: (token: string) => string, pick: (r: T & { nextPageToken?: string }) => unknown[], maxPages = 20): Promise<unknown[]> {
  const out: unknown[] = [];
  let token = '';
  for (let i = 0; i < maxPages; i++) {
    const r = await gapi<T & { nextPageToken?: string }>(tenantId, url(token));
    out.push(...pick(r));
    if (!r.nextPageToken) break;
    token = r.nextPageToken;
  }
  return out;
}

/**
 * Propiedades de Analytics 4 con la web de su flujo de datos (para emparejarlas por dominio). Se listan TODAS (así
 * «Comprobar accesos» no marca «Sin acceso» a una propiedad que quedó fuera); la web del flujo se pide para las 60
 * primeras (una petición por propiedad).
 */
export async function ga4PropertyList(tenantId: string): Promise<GoogleAsset[]> {
  type Summ = { accountSummaries?: { displayName: string; propertySummaries?: { property: string; displayName: string }[] }[] };
  const accounts = (await allPages<Summ>(tenantId, (t) => `https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200${t ? `&pageToken=${encodeURIComponent(t)}` : ''}`, (r) => r.accountSummaries ?? [])) as NonNullable<Summ['accountSummaries']>;
  const props = accounts.flatMap((a) => (a.propertySummaries ?? []).map((p) => ({ ...p, account: a.displayName })));
  const out: GoogleAsset[] = [];
  for (let i = 0; i < props.length; i += 5) {
    const batch = await Promise.all(
      props.slice(i, i + 5).map(async (p, j) => {
        const withStream = i + j < 60;
        const s = withStream ? await gapi<{ dataStreams?: { type?: string; webStreamData?: { defaultUri?: string } }[] }>(tenantId, `https://analyticsadmin.googleapis.com/v1beta/${p.property}/dataStreams`).catch(() => ({ dataStreams: [] })) : { dataStreams: [] };
        const uri = (s.dataStreams ?? []).find((d) => d.webStreamData?.defaultUri)?.webStreamData?.defaultUri ?? null;
        return { kind: 'analytics' as const, value: p.property, label: p.displayName, domain: hostOf(uri), detail: `${p.account} · ${p.property.replace('properties/', '')}${uri ? ` · ${hostOf(uri)}` : ''}` };
      })
    );
    out.push(...batch);
  }
  return out;
}

/** Fichas de Business Profile con su web (para emparejarlas por dominio), de todas las cuentas. El identificador es «locations/…». */
export async function gbpLocationList(tenantId: string): Promise<GoogleAsset[]> {
  type Acc = { accounts?: { name: string; accountName: string }[] };
  type Loc = { locations?: { name: string; title: string; websiteUri?: string; storefrontAddress?: { locality?: string } }[] };
  const accounts = (await allPages<Acc>(tenantId, (t) => `https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20${t ? `&pageToken=${encodeURIComponent(t)}` : ''}`, (r) => r.accounts ?? [])) as NonNullable<Acc['accounts']>;
  const out: GoogleAsset[] = [];
  for (const a of accounts) {
    const locs = (await allPages<Loc>(tenantId, (t) => `https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?readMask=name,title,storefrontAddress,websiteUri&pageSize=100${t ? `&pageToken=${encodeURIComponent(t)}` : ''}`, (r) => r.locations ?? [])) as NonNullable<Loc['locations']>;
    for (const l of locs) out.push({ kind: 'business_profile', value: l.name, label: l.title, domain: hostOf(l.websiteUri), detail: [l.storefrontAddress?.locality, a.accountName].filter(Boolean).join(' · ') });
  }
  return out;
}

const GBP_METRICS: Record<string, string> = {
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: 'vistas en Búsqueda (móvil)',
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: 'vistas en Búsqueda (ordenador)',
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: 'vistas en Maps (móvil)',
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: 'vistas en Maps (ordenador)',
  CALL_CLICKS: 'llamadas',
  WEBSITE_CLICKS: 'clics a la web',
  BUSINESS_DIRECTION_REQUESTS: 'cómo llegar',
  BUSINESS_CONVERSATIONS: 'mensajes',
  BUSINESS_BOOKINGS: 'reservas'
};

type GbpSeries = { multiDailyMetricTimeSeries?: { dailyMetricTimeSeries?: { dailyMetric: string; timeSeries?: { datedValues?: { date: { year: number; month: number; day: number }; value?: string }[] } }[] }[] };

/** Suma por métrica de una respuesta de fetchMultiDailyMetricsTimeSeries (un valor ausente es 0, según Google). */
export function sumGbpSeries(r: GbpSeries): Record<string, number> {
  const tot: Record<string, number> = {};
  for (const m of r.multiDailyMetricTimeSeries ?? [])
    for (const s of m.dailyMetricTimeSeries ?? []) tot[s.dailyMetric] = (tot[s.dailyMetric] ?? 0) + (s.timeSeries?.datedValues ?? []).reduce((n, v) => n + (Number(v.value) || 0), 0);
  return tot;
}

/** Rendimiento de una ficha de Google: vistas, llamadas, clics a la web, cómo llegar… de los últimos N días (con 3 de retraso). */
export async function gbpPerformance(tenantId: string, location: string, days: number): Promise<string> {
  const loc = (location.match(/locations\/\d+/) ?? [])[0];
  if (!loc) throw new Error('El identificador de la ficha debe ser «locations/…» (míralo con gbp_fichas o en la ficha del cliente).');
  const end = new Date(Date.now() - 3 * 86_400_000);
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  const q = new URLSearchParams();
  for (const m of Object.keys(GBP_METRICS)) q.append('dailyMetrics', m);
  const put = (k: string, d: Date) => {
    q.set(`dailyRange.${k}.year`, String(d.getUTCFullYear()));
    q.set(`dailyRange.${k}.month`, String(d.getUTCMonth() + 1));
    q.set(`dailyRange.${k}.day`, String(d.getUTCDate()));
  };
  put('start_date', start);
  put('end_date', end);
  const tot = sumGbpSeries(await gapi<GbpSeries>(tenantId, `https://businessprofileperformance.googleapis.com/v1/${loc}:fetchMultiDailyMetricsTimeSeries?${q}`));
  const views = ['BUSINESS_IMPRESSIONS_MOBILE_SEARCH', 'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', 'BUSINESS_IMPRESSIONS_MOBILE_MAPS', 'BUSINESS_IMPRESSIONS_DESKTOP_MAPS'].reduce((n, k) => n + (tot[k] ?? 0), 0);
  return [
    `Business Profile ${loc} · ${ymd(start)} a ${ymd(end)}`,
    `- vistas totales del perfil: ${views}`,
    ...Object.entries(GBP_METRICS).map(([k, label]) => `- ${label}: ${tot[k] ?? 0}`)
  ].join('\n');
}
