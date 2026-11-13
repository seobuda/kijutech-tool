import 'server-only';

// Servidor y costes de DigitalOcean (13 nov 2026). En DigitalOcean los servidores tienen precio fijo (por hora con tope
// mensual): más procesos no suben la factura, pero sí pueden agotar la memoria, la CPU o el disco y obligar a ampliar
// (salto de precio). Por eso se vigilan las dos cosas:
//   - Coste: lo que va del mes (API de facturación), previsión, facturas anteriores y desglose por recurso
//     (servidores, copias automáticas = 20 % del servidor, snapshots por GB).
//   - Capacidad del servidor de la herramienta: memoria, disco y carga (API de monitorización), con la propuesta de
//     ampliación y su precio real (API de tamaños) cuando hace falta.
// Token de DigitalOcean de SOLO LECTURA, cifrado en ops_settings (o DO_API_TOKEN del entorno en desarrollo).
// Los datos se piden como mucho una vez por hora y se guardan en ops_settings (clave do_cache). Sin IA.
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsNotifications, opsSettings } from '@/lib/db/schema';
import { decrypt, encrypt } from '@/lib/ai/encryption';
import { getAuto, num } from '@/lib/operaciones/automations';
import { enqueueNotification, localParts } from '@/lib/operaciones/notifications';
import { getOwnerMember } from '@/lib/operaciones/telegram-config';
import { escapeHtml } from '@/lib/operaciones/telegram';

const API = 'https://api.digitalocean.com/v2';
const TZ = 'Europe/Madrid';
export const DO_TOKEN_SETTING = 'do_api_token';
const DO_CACHE_SETTING = 'do_cache';
const CACHE_MS = 60 * 60_000;
export const APP_DROPLET = process.env.OPS_APP_DROPLET || 'kijutech-brain';
export const SNAPSHOT_USD_GB_MONTH = 0.06; // precio de lista de los snapshots de DigitalOcean (por GB y mes)
export const BACKUP_SHARE = 0.2; // las copias automáticas semanales cuestan el 20 % del servidor

const usd = (n: number) => `${n.toFixed(2)} $`;

export async function infraSettings(tenantId: string) {
  const a = await getAuto(tenantId, 'infra');
  return { enabled: a.enabled, monthly: num(a, 'monthlyUsd'), memPct: num(a, 'memPct'), alerts: Boolean(a.cfg.alerts) };
}

// --- Datos ---------------------------------------------------------------------------------------

export type Droplet = { id: number; name: string; size: string; memoryMb: number; vcpus: number; diskGb: number; priceMonthly: number; backups: boolean; createdAt: string };
export type Snapshot = { name: string; createdAt: string; sizeGb: number };
export type Size = { slug: string; memoryMb: number; vcpus: number; diskGb: number; priceMonthly: number };
export type Capacity = {
  dropletName: string;
  memTotalMb: number;
  memUsedPctNow: number | null;
  memUsedPctMax24h: number | null;
  memUsedPctP95_24h: number | null;
  diskUsedPct: number | null;
  loadP95PerCpu: number | null; // carga de 1 min por CPU (p95 de 24 h); 1 = CPU al completo
};
export type InfraData = {
  fetchedAt: string;
  error: string | null;
  mtdUsd: number;
  invoices: { period: string; amount: number }[];
  droplets: Droplet[];
  snapshots: Snapshot[];
  sizes: Size[];
  capacity: Capacity | null;
};

async function doGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`DigitalOcean (${res.status})`);
  return res.json() as Promise<T>;
}

type Series = { data: { result: { values: [number, string][] }[] } };
const values = (s: Series) => (s.data?.result?.[0]?.values ?? []).map(([, v]) => Number(v)).filter((v) => Number.isFinite(v));

export function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

async function fetchInfra(token: string): Promise<Omit<InfraData, 'fetchedAt' | 'error'>> {
  const [bal, inv, drops, snaps, sizes] = await Promise.all([
    doGet<{ month_to_date_usage: string }>(token, '/customers/my/balance'),
    doGet<{ invoices: { invoice_period: string; amount: string }[] }>(token, '/customers/my/invoices?per_page=6'),
    doGet<{ droplets: { id: number; name: string; memory: number; vcpus: number; disk: number; features: string[]; created_at: string; size: { slug: string; price_monthly: number } }[] }>(token, '/droplets?per_page=100'),
    doGet<{ snapshots: { name: string; created_at: string; size_gigabytes: number }[] }>(token, '/snapshots?per_page=100'),
    doGet<{ sizes: { slug: string; memory: number; vcpus: number; disk: number; price_monthly: number; available: boolean; regions: string[] }[] }>(token, '/sizes?per_page=200')
  ]);
  const droplets: Droplet[] = drops.droplets.map((d) => ({
    id: d.id,
    name: d.name,
    size: d.size.slug,
    memoryMb: d.memory,
    vcpus: d.vcpus,
    diskGb: d.disk,
    priceMonthly: d.size.price_monthly,
    backups: d.features.includes('backups'),
    createdAt: d.created_at
  }));
  const app = droplets.find((d) => d.name === APP_DROPLET) ?? null;
  let capacity: Capacity | null = null;
  if (app) {
    const end = Math.floor(Date.now() / 1000);
    const q = (m: string, from: number) => doGet<Series>(token, `/monitoring/metrics/droplet/${m}?host_id=${app.id}&start=${from}&end=${end}`);
    const day = end - 86_400;
    const [memTotal, memAvail, fsSize, fsFree, load] = await Promise.all([q('memory_total', day), q('memory_available', day), q('filesystem_size', end - 900), q('filesystem_free', end - 900), q('load_1', day)]);
    const total = values(memTotal).at(-1) ?? app.memoryMb * 1024 * 1024;
    const used = values(memAvail).map((a) => Math.round((1 - a / total) * 100));
    const size = values(fsSize).at(-1);
    const free = values(fsFree).at(-1);
    capacity = {
      dropletName: app.name,
      memTotalMb: Math.round(total / 1024 / 1024),
      memUsedPctNow: used.at(-1) ?? null,
      memUsedPctMax24h: used.length ? Math.max(...used) : null,
      memUsedPctP95_24h: percentile(used, 95),
      diskUsedPct: size && free !== undefined ? Math.round((1 - free / size) * 100) : null,
      loadP95PerCpu: (() => {
        const p = percentile(values(load), 95);
        return p === null ? null : Math.round((p / Math.max(1, app.vcpus)) * 100) / 100;
      })()
    };
  }
  const region = 'fra1';
  return {
    mtdUsd: Number(bal.month_to_date_usage) || 0,
    invoices: inv.invoices.map((i) => ({ period: i.invoice_period, amount: Number(i.amount) || 0 })),
    droplets,
    snapshots: snaps.snapshots.map((s) => ({ name: s.name, createdAt: s.created_at, sizeGb: s.size_gigabytes })),
    sizes: sizes.sizes
      .filter((s) => s.available && s.regions.includes(region) && /^s-\d+vcpu-\d+gb$/.test(s.slug))
      .map((s) => ({ slug: s.slug, memoryMb: s.memory, vcpus: s.vcpus, diskGb: s.disk, priceMonthly: s.price_monthly })),
    capacity
  };
}

// --- Token y caché -----------------------------------------------------------------------------------

async function readSetting(tenantId: string, key: string): Promise<string | null> {
  const [r] = await db.select({ value: opsSettings.value }).from(opsSettings).where(and(eq(opsSettings.tenantId, tenantId), eq(opsSettings.key, key))).limit(1);
  return r?.value ?? null;
}
async function writeSetting(tenantId: string, key: string, value: string) {
  await db
    .insert(opsSettings)
    .values({ tenantId, key, value })
    .onConflictDoUpdate({ target: [opsSettings.tenantId, opsSettings.key], set: { value, updatedAt: new Date() } });
}

export async function getDoToken(tenantId: string): Promise<{ token: string; source: 'panel' | 'entorno' } | null> {
  const v = await readSetting(tenantId, DO_TOKEN_SETTING);
  if (v) {
    try {
      const { encrypted, iv } = JSON.parse(v) as { encrypted: string; iv: string };
      return { token: decrypt(encrypted, iv), source: 'panel' };
    } catch {
      /* se prueba el del entorno */
    }
  }
  return process.env.DO_API_TOKEN ? { token: process.env.DO_API_TOKEN, source: 'entorno' } : null;
}

export async function saveDoToken(tenantId: string, token: string | null): Promise<void> {
  if (!token) {
    await db.delete(opsSettings).where(and(eq(opsSettings.tenantId, tenantId), inArray(opsSettings.key, [DO_TOKEN_SETTING, DO_CACHE_SETTING])));
    return;
  }
  await writeSetting(tenantId, DO_TOKEN_SETTING, JSON.stringify(encrypt(token)));
  await db.delete(opsSettings).where(and(eq(opsSettings.tenantId, tenantId), eq(opsSettings.key, DO_CACHE_SETTING)));
}

/** Prueba un token: lee el saldo del mes (solo lectura). */
export async function testDoToken(token: string): Promise<boolean> {
  try {
    await doGet(token, '/customers/my/balance');
    return true;
  } catch {
    return false;
  }
}

/** Datos de la caché (si hay). Sin llamadas a DigitalOcean: para Salud y para pintar la pantalla al instante. */
export async function cachedInfra(tenantId: string): Promise<InfraData | null> {
  const v = await readSetting(tenantId, DO_CACHE_SETTING);
  if (!v) return null;
  try {
    return JSON.parse(v) as InfraData;
  } catch {
    return null;
  }
}

export async function getInfra(tenantId: string, opts: { force?: boolean } = {}): Promise<InfraData | null> {
  const tok = await getDoToken(tenantId);
  if (!tok) return null;
  const cached = await cachedInfra(tenantId);
  if (cached && !opts.force && Date.now() - Date.parse(cached.fetchedAt) < CACHE_MS) return cached;
  let data: InfraData;
  try {
    data = { ...(await fetchInfra(tok.token)), fetchedAt: new Date().toISOString(), error: null };
  } catch (e) {
    console.error('[servidor] DigitalOcean:', e instanceof Error ? e.message : e);
    data = cached
      ? { ...cached, error: 'No se pudo actualizar desde DigitalOcean; se enseña la última lectura.' }
      : { fetchedAt: new Date().toISOString(), error: 'No se pudo leer DigitalOcean (revisa el token).', mtdUsd: 0, invoices: [], droplets: [], snapshots: [], sizes: [], capacity: null };
    if (cached) return data; // no se pisa la buena con el error
  }
  await writeSetting(tenantId, DO_CACHE_SETTING, JSON.stringify(data));
  return data;
}

// --- Cálculo puro ------------------------------------------------------------------------------------

export function monthlyEstimate(droplets: Droplet[], snapshots: Snapshot[]): { total: number; droplets: number; backups: number; snapshots: number } {
  const d = droplets.reduce((s, x) => s + x.priceMonthly, 0);
  const b = droplets.filter((x) => x.backups).reduce((s, x) => s + x.priceMonthly * BACKUP_SHARE, 0);
  const sn = snapshots.reduce((s, x) => s + x.sizeGb, 0) * SNAPSHOT_USD_GB_MONTH;
  const r = (n: number) => Math.round(n * 100) / 100;
  return { total: r(d + b + sn), droplets: r(d), backups: r(b), snapshots: r(sn) };
}

/**
 * Previsión de fin de mes. Con el coste fijo de los recursos actuales: lo que va + la parte que queda del mes de ese coste
 * (acierta aunque un servidor se creara a mitad de mes). Sin él, el ritmo lineal de lo que va de mes.
 */
export function forecastInfra(mtd: number, dayOfMonth: number, daysInMonth: number, fixedMonthly?: number): number {
  if (fixedMonthly !== undefined) return Math.round((mtd + (fixedMonthly * Math.max(0, daysInMonth - dayOfMonth)) / daysInMonth) * 100) / 100;
  return dayOfMonth > 0 ? Math.round((mtd / dayOfMonth) * daysInMonth * 100) / 100 : mtd;
}

/** El tamaño más barato con al menos el doble de memoria que el actual (para proponer la ampliación). */
export function nextSize(current: Droplet, sizes: Size[]): Size | null {
  return sizes.filter((s) => s.memoryMb >= current.memoryMb * 2).sort((a, b) => a.priceMonthly - b.priceMonthly)[0] ?? null;
}

export type InfraRec = { title: string; detail: string; deltaUsdMonth: number | null };

export function infraRecommendations(d: InfraData, ctx: { memPct: number; forecast: number; budget: number; now?: number }): InfraRec[] {
  const out: InfraRec[] = [];
  const app = d.droplets.find((x) => x.name === d.capacity?.dropletName);
  const c = d.capacity;
  if (c && app) {
    const up = nextSize(app, d.sizes);
    const upText = up ? ` Ampliar a ${up.slug} (${up.memoryMb / 1024} GB, ${up.vcpus} CPU) cuesta ${usd(up.priceMonthly)}/mes, ${usd(up.priceMonthly - app.priceMonthly)} más.` : '';
    if (c.memUsedPctP95_24h !== null && c.memUsedPctP95_24h >= ctx.memPct) {
      out.push({ title: 'Memoria del servidor casi llena', detail: `La memoria pasa del ${c.memUsedPctP95_24h} % la mayor parte del día (máx. ${c.memUsedPctMax24h} %). Si se llena, la app se ralentiza o se reinicia.${upText}`, deltaUsdMonth: up ? up.priceMonthly - app.priceMonthly : null });
    }
    if (c.loadP95PerCpu !== null && c.loadP95PerCpu >= 0.9) {
      out.push({ title: 'CPU del servidor al límite', detail: `La carga llega a ${c.loadP95PerCpu} por CPU en los momentos altos (1 = al completo): las tareas esperan turno.${upText}`, deltaUsdMonth: up ? up.priceMonthly - app.priceMonthly : null });
    }
    if (c.diskUsedPct !== null && c.diskUsedPct >= 80) {
      out.push({ title: 'Disco del servidor casi lleno', detail: `Disco al ${c.diskUsedPct} %. Borra copias antiguas o imágenes de Docker sin usar, o amplía el disco.`, deltaUsdMonth: null });
    }
  }
  const now = ctx.now ?? Date.now();
  const old = d.snapshots.filter((s) => now - Date.parse(s.createdAt) > 180 * 86_400_000);
  const oldGb = old.reduce((s, x) => s + x.sizeGb, 0);
  if (oldGb >= 5) {
    out.push({ title: 'Snapshots antiguos', detail: `${old.length} snapshot(s) de hace más de 6 meses ocupan ${oldGb.toFixed(1)} GB (≈ ${usd(oldGb * SNAPSHOT_USD_GB_MONTH)}/mes). Revisa en DigitalOcean si siguen haciendo falta.`, deltaUsdMonth: -Math.round(oldGb * SNAPSHOT_USD_GB_MONTH * 100) / 100 });
  }
  if (ctx.forecast > ctx.budget) {
    out.unshift({ title: 'El mes de DigitalOcean pasa del presupuesto', detail: `Previsión ${usd(ctx.forecast)} frente a ${usd(ctx.budget)}. Mira el desglose por servidor.`, deltaUsdMonth: null });
  }
  return out;
}

export type InfraOverview = {
  connected: boolean;
  tokenSource: 'panel' | 'entorno' | null;
  settings: Awaited<ReturnType<typeof infraSettings>>;
  data: InfraData | null;
  estimate: ReturnType<typeof monthlyEstimate> | null;
  forecast: number | null;
  recommendations: InfraRec[];
};

export async function getInfraOverview(tenantId: string, opts: { force?: boolean; cachedOnly?: boolean } = {}): Promise<InfraOverview> {
  const settings = await infraSettings(tenantId);
  const tok = await getDoToken(tenantId);
  if (!tok) return { connected: false, tokenSource: null, settings, data: null, estimate: null, forecast: null, recommendations: [] };
  const data = opts.cachedOnly ? await cachedInfra(tenantId) : await getInfra(tenantId, opts);
  if (!data) return { connected: true, tokenSource: tok.source, settings, data: null, estimate: null, forecast: null, recommendations: [] };
  const today = localParts(TZ, new Date()).date;
  const daysInMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();
  const estimate = monthlyEstimate(data.droplets, data.snapshots);
  const forecast = forecastInfra(data.mtdUsd, Number(today.slice(8, 10)), daysInMonth, data.droplets.length ? estimate.total : undefined);
  return {
    connected: true,
    tokenSource: tok.source,
    settings,
    data,
    estimate,
    forecast,
    recommendations: infraRecommendations(data, { memPct: settings.memPct, forecast, budget: settings.monthly })
  };
}

// --- Planificador ------------------------------------------------------------------------------------

const lastRun = new Map<string, number>();

/** Cada hora: refresca los datos (para Salud y los informes) y avisa si el mes pasa del presupuesto (una vez por semana). */
export async function runInfraWatch(tenantId: string, now = new Date()): Promise<void> {
  if (now.getTime() - (lastRun.get(tenantId) ?? 0) < CACHE_MS) return;
  lastRun.set(tenantId, now.getTime());
  const s = await infraSettings(tenantId);
  if (!s.enabled) return;
  const o = await getInfraOverview(tenantId);
  if (!s.alerts || !o.data || o.forecast === null || o.forecast <= s.monthly) return;
  const lp = localParts(TZ, now);
  if (lp.minutes < 9 * 60 || lp.minutes >= 20 * 60) return;
  const key = `infra:forecast:${lp.date.slice(0, 7)}:w${Math.ceil(Number(lp.date.slice(8, 10)) / 7)}`;
  const [exists] = await db.select({ id: opsNotifications.id }).from(opsNotifications).where(and(eq(opsNotifications.tenantId, tenantId), eq(opsNotifications.dedupeKey, key))).limit(1);
  if (exists) return;
  const owner = await getOwnerMember(tenantId);
  if (!owner) return;
  await enqueueNotification({
    tenantId,
    kind: 'health',
    dedupeKey: key,
    forClickupUserId: owner.clickupUserId,
    forName: owner.username,
    payload: {
      text: `🖥 <b>DigitalOcean: este mes acabará en ${usd(o.forecast)}</b> (presupuesto ${usd(s.monthly)}). Va ${usd(o.data.mtdUsd)}.${o.recommendations[0] ? `\n💡 ${escapeHtml(o.recommendations[0].title)}` : ''}\n\nDetalle en Sistema → Servidor y costes.`,
      toOwner: true
    }
  });
}
