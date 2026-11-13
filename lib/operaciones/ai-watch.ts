import 'server-only';

// Vigía del gasto de IA (13 nov 2026). La IA es el motor de la herramienta, así que su gasto se vigila como la salud:
//   - Presupuesto mensual (panel «Vigía de gasto de IA») y PREVISIÓN de fin de mes al ritmo de los últimos 7 días.
//   - Picos: una función que hoy gasta mucho más que su mediana de los 14 días anteriores, con el PORQUÉ (más llamadas,
//     más tokens de entrada o de salida, fallos, la reserva actuando).
//   - Recomendaciones con ahorro aproximado (caché de prompt, modelo más pequeño, fallos, reserva).
//   - Opcional: el coste REAL de la organización en Anthropic (informe de costes de la Admin API, clave sk-ant-admin
//     guardada cifrada). Incluye todo lo que gasta la cuenta (Claude Code u otras claves), no solo la herramienta.
//     No existe endpoint de saldo de créditos: se trabaja con el presupuesto.
// Sin IA: son reglas y cuentas sobre ai_jobs (directiva de optimización de IA).
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsNotifications, opsSettings } from '@/lib/db/schema';
import { decrypt, encrypt } from '@/lib/ai/encryption';
import { getAuto, num } from '@/lib/operaciones/automations';
import { enqueueNotification, localParts } from '@/lib/operaciones/notifications';
import { getOwnerMember } from '@/lib/operaciones/telegram-config';
import { escapeHtml } from '@/lib/operaciones/telegram';

const TZ = 'Europe/Madrid';
export const ADMIN_KEY_SETTING = 'anthropic_admin_key';
const ORG_CACHE_SETTING = 'anthropic_cost_cache';
const ORG_CACHE_MS = 60 * 60_000;
export const MIN_SPIKE_USD = 0.3;

const usd = (n: number) => `${n.toFixed(2)} $`;

export async function aiWatchSettings(tenantId: string) {
  const a = await getAuto(tenantId, 'ai_budget');
  return {
    enabled: a.enabled,
    daily: num(a, 'dailyUsd'),
    monthly: num(a, 'monthlyUsd'),
    spikeFactor: num(a, 'spikeFactor'),
    alerts: Boolean(a.cfg.alerts)
  };
}

// --- Cálculo puro ------------------------------------------------------------------------------

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Previsión de fin de mes: lo gastado + el ritmo diario de los últimos 7 días por los días que quedan. */
export function forecastMonth(mtd: number, last7: number, dayOfMonth: number, daysInMonth: number): number {
  return mtd + (last7 / 7) * Math.max(0, daysInMonth - dayOfMonth);
}

export type DayStat = { calls: number; usd: number; inTok: number; outTok: number; failed: number; fallback: number };
export type Spike = { fn: string; today: DayStat; baselineUsd: number; reasons: string[] };

/** Por qué una función gasta más hoy que de costumbre. Función pura. */
export function explainSpike(today: DayStat, base: DayStat[]): string[] {
  const avg = (f: (d: DayStat) => number) => (base.length ? base.reduce((s, d) => s + f(d), 0) / base.length : 0);
  const perCall = (tok: number, calls: number) => (calls ? tok / calls : 0);
  const reasons: string[] = [];
  const callsBase = avg((d) => d.calls);
  if (callsBase > 0 && today.calls >= callsBase * 2) reasons.push(`${today.calls} llamadas (lo normal, unas ${Math.round(callsBase)})`);
  if (callsBase === 0 && today.calls > 0) reasons.push(`${today.calls} llamadas en una función que no se usaba`);
  const inBase = median(base.filter((d) => d.calls).map((d) => perCall(d.inTok, d.calls)));
  const inToday = perCall(today.inTok, today.calls);
  if (inBase > 0 && inToday >= inBase * 2) reasons.push(`entrada media de ${Math.round(inToday)} tokens por llamada (lo normal, ${Math.round(inBase)}): prompts o contexto más largos`);
  const outBase = median(base.filter((d) => d.calls).map((d) => perCall(d.outTok, d.calls)));
  const outToday = perCall(today.outTok, today.calls);
  if (outBase > 0 && outToday >= outBase * 2) reasons.push(`respuestas más largas: ${Math.round(outToday)} tokens de salida por llamada (lo normal, ${Math.round(outBase)})`);
  if (today.failed > 0 && today.failed >= Math.max(3, today.calls * 0.1)) reasons.push(`${today.failed} llamadas fallidas (posibles reintentos)`);
  if (today.fallback > 0) reasons.push(`${today.fallback} llamadas pasaron a la IA de reserva`);
  if (!reasons.length) reasons.push('sin una causa clara: el volumen y el tamaño son parecidos, revisa qué la disparó en el registro');
  return reasons;
}

/** Funciones que hoy gastan anormalmente. series: 15 días por función, el último es hoy. Función pura. */
export function detectSpikes(series: Map<string, DayStat[]>, factor: number, minUsd = MIN_SPIKE_USD): Spike[] {
  const out: Spike[] = [];
  for (const [fn, days] of series) {
    const today = days[days.length - 1];
    const base = days.slice(0, -1);
    const baselineUsd = median(base.map((d) => d.usd));
    if (today.usd >= minUsd && today.usd >= Math.max(factor * baselineUsd, minUsd)) {
      out.push({ fn, today, baselineUsd, reasons: explainSpike(today, base) });
    }
  }
  return out.sort((a, b) => b.today.usd - a.today.usd);
}

export type FnStat = {
  fn: string;
  model: string | null;
  calls30: number;
  usd30: number;
  usd7: number;
  usdPrev7: number;
  calls7: number;
  avgIn: number;
  avgOut: number;
  inUsdShare: number; // parte del coste que es entrada (estimada con los tokens)
  failed30: number;
  fallback30: number;
  uncosted30: number; // llamadas completadas sin precio (el coste real es mayor que el mostrado)
};
export type Recommendation = { fn: string | null; title: string; detail: string; savingUsdMonth: number | null };

const isBigModel = (m: string | null) => Boolean(m && /sonnet|opus|gpt-4|gpt-5|pro/i.test(m) && !/haiku|mini|flash/i.test(m));

/** Recomendaciones por reglas, con ahorro mensual APROXIMADO. Función pura. */
export function recommend(fns: FnStat[], ctx: { forecast: number; budget: number; orgOtherUsd: number | null; toolMtd: number }): Recommendation[] {
  const out: Recommendation[] = [];
  const monthly = (usd7: number) => (usd7 / 7) * 30;
  for (const f of fns) {
    if (f.calls7 >= 15 && f.avgIn >= 6000) {
      out.push({
        fn: f.fn,
        title: `Caché de prompt en «${f.fn}»`,
        detail: `Envía unos ${Math.round(f.avgIn)} tokens de entrada por llamada (${f.calls7} llamadas en 7 días). Si el principio del prompt se repite (instrucciones, ficha del cliente), cachearlo hace que esa parte cueste ~10 % en las lecturas.`,
        savingUsdMonth: Math.round(monthly(f.usd7) * f.inUsdShare * 0.6 * 100) / 100
      });
    }
    if (f.calls7 >= 15 && f.avgOut <= 400 && isBigModel(f.model)) {
      out.push({
        fn: f.fn,
        title: `Modelo más pequeño para «${f.fn}»`,
        detail: `Respuestas cortas (unos ${Math.round(f.avgOut)} tokens) con ${f.model}: parece clasificar o extraer. Un modelo pequeño (Haiku) suele bastar; probarlo antes con ejemplos reales.`,
        savingUsdMonth: Math.round(monthly(f.usd7) * 0.6 * 100) / 100
      });
    }
    if (f.calls30 >= 10 && f.failed30 / f.calls30 >= 0.1) {
      out.push({
        fn: f.fn,
        title: `Fallos en «${f.fn}»`,
        detail: `${f.failed30} de ${f.calls30} llamadas fallaron en 30 días: se pierden reintentos y el trabajo se retrasa. Mira el error en IA → Cerebro.`,
        savingUsdMonth: null
      });
    }
    if (f.uncosted30 > 0) {
      out.push({
        fn: f.fn,
        title: `Llamadas sin precio en «${f.fn}»`,
        detail: `${f.uncosted30} llamada(s) en 30 días se registraron sin coste porque su modelo (${f.model ?? 'desconocido'}) no tiene precio: el gasto real es mayor que el mostrado. Añade el precio en IA y modelos.`,
        savingUsdMonth: null
      });
    }
    if (f.fallback30 > 0) {
      out.push({
        fn: f.fn,
        title: `La IA de reserva actuó en «${f.fn}»`,
        detail: `${f.fallback30} llamada(s) en 30 días fueron a la reserva: revisa el saldo, la clave o el modelo del proveedor principal.`,
        savingUsdMonth: null
      });
    }
  }
  if (ctx.forecast > ctx.budget) {
    const top = [...fns].sort((a, b) => b.usd7 - a.usd7)[0];
    out.unshift({
      fn: top?.fn ?? null,
      title: 'La previsión pasa del presupuesto',
      detail: `Al ritmo de los últimos 7 días el mes acabaría en ${usd(ctx.forecast)} (presupuesto ${usd(ctx.budget)}).${top ? ` Lo que más pesa: «${top.fn}» (${usd(top.usd7)} en 7 días).` : ''}`,
      savingUsdMonth: null
    });
  }
  if (ctx.orgOtherUsd !== null && ctx.orgOtherUsd > ctx.toolMtd && ctx.orgOtherUsd > 5) {
    out.push({
      fn: null,
      title: 'La mayor parte del gasto no es de la herramienta',
      detail: `Este mes la cuenta de Anthropic lleva ${usd(ctx.orgOtherUsd)} fuera de la herramienta (Claude Code u otras claves) frente a ${usd(ctx.toolMtd)} de la herramienta. El presupuesto lo comparten.`,
      savingUsdMonth: null
    });
  }
  return out;
}

// --- Datos de la herramienta (ai_jobs) ---------------------------------------------------------

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);

function madridDates(now: Date, back: number): string[] {
  const today = localParts(TZ, now).date;
  const out: string[] = [];
  for (let i = back - 1; i >= 0; i--) {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function loadToolData(tenantId: string, now: Date) {
  const days35 = madridDates(now, 35);
  const from = days35[0];
  const rows = (await db.execute(sql`
    SELECT (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Madrid')::date::text AS day, function AS fn, max(model) AS model,
           count(*)::int AS calls, coalesce(sum(estimated_cost), 0)::float AS usd,
           coalesce(sum(input_tokens), 0)::float AS in_tok, coalesce(sum(output_tokens), 0)::float AS out_tok,
           count(*) FILTER (WHERE status = 'failed')::int AS failed,
           count(*) FILTER (WHERE output ? 'fallback')::int AS fallback,
           count(*) FILTER (WHERE status = 'completed' AND estimated_cost IS NULL)::int AS uncosted
    FROM ai_jobs
    WHERE tenant_id = ${tenantId} AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Madrid')::date >= ${from}::date
    GROUP BY 1, 2`)) as unknown as Row[];
  return { days35, rows };
}

export type OrgCost = { mtdUsd: number; byDay: { date: string; usd: number }[]; fetchedAt: string; error: string | null };

export type AiOverview = {
  settings: Awaited<ReturnType<typeof aiWatchSettings>>;
  month: string;
  mtd: number;
  todayUsd: number;
  last7: number;
  forecast: number;
  dailyBudget: number;
  byDay: { date: string; usd: number }[];
  fns: FnStat[];
  spikes: Spike[];
  recommendations: Recommendation[];
  org: (OrgCost & { connected: true }) | { connected: false };
};

export async function getAiOverview(tenantId: string, now = new Date(), opts: { withOrg?: boolean } = {}): Promise<AiOverview> {
  const settings = await aiWatchSettings(tenantId);
  const { days35, rows } = await loadToolData(tenantId, now);
  const today = days35[days35.length - 1];
  const monthPrefix = today.slice(0, 7);
  const last7Days = new Set(days35.slice(-7));
  const prev7Days = new Set(days35.slice(-14, -7));
  const last30 = new Set(days35.slice(-30));
  const last15 = days35.slice(-15);

  const byDayMap = new Map<string, number>();
  const fnMap = new Map<string, FnStat & { inTok7: number; outTok7: number }>();
  const series = new Map<string, DayStat[]>();
  for (const r of rows) {
    const day = String(r.day);
    const fn = String(r.fn);
    byDayMap.set(day, (byDayMap.get(day) ?? 0) + n(r.usd));
    const f =
      fnMap.get(fn) ??
      { fn, model: null, calls30: 0, usd30: 0, usd7: 0, usdPrev7: 0, calls7: 0, avgIn: 0, avgOut: 0, inUsdShare: 0, failed30: 0, fallback30: 0, uncosted30: 0, inTok7: 0, outTok7: 0 };
    if (r.model) f.model = String(r.model);
    if (last30.has(day)) {
      f.calls30 += n(r.calls);
      f.usd30 += n(r.usd);
      f.failed30 += n(r.failed);
      f.fallback30 += n(r.fallback);
      f.uncosted30 += n(r.uncosted);
    }
    if (last7Days.has(day)) {
      f.usd7 += n(r.usd);
      f.calls7 += n(r.calls);
      f.inTok7 += n(r.in_tok);
      f.outTok7 += n(r.out_tok);
    }
    if (prev7Days.has(day)) f.usdPrev7 += n(r.usd);
    fnMap.set(fn, f);
  }
  for (const [fn] of fnMap) {
    series.set(
      fn,
      last15.map((day) => {
        const r = rows.find((x) => String(x.day) === day && String(x.fn) === fn);
        return { calls: n(r?.calls), usd: n(r?.usd), inTok: n(r?.in_tok), outTok: n(r?.out_tok), failed: n(r?.failed), fallback: n(r?.fallback) };
      })
    );
  }
  const fns: FnStat[] = [...fnMap.values()]
    .map((f) => {
      const calls = Math.max(1, f.calls7);
      // Parte de entrada del coste, con el precio de salida ~5× el de entrada (proporción habitual de los modelos).
      const inShare = f.inTok7 + f.outTok7 ? f.inTok7 / (f.inTok7 + 5 * f.outTok7) : 0;
      return {
        fn: f.fn,
        model: f.model,
        calls30: f.calls30,
        usd30: Math.round(f.usd30 * 10000) / 10000,
        usd7: Math.round(f.usd7 * 10000) / 10000,
        usdPrev7: Math.round(f.usdPrev7 * 10000) / 10000,
        calls7: f.calls7,
        avgIn: f.inTok7 / calls,
        avgOut: f.outTok7 / calls,
        inUsdShare: inShare,
        failed30: f.failed30,
        fallback30: f.fallback30,
        uncosted30: f.uncosted30
      };
    })
    .sort((a, b) => b.usd30 - a.usd30);

  const byDay = days35.slice(-30).map((date) => ({ date, usd: Math.round((byDayMap.get(date) ?? 0) * 10000) / 10000 }));
  const mtd = [...byDayMap.entries()].filter(([d]) => d.startsWith(monthPrefix)).reduce((s, [, v]) => s + v, 0);
  const last7 = days35.slice(-7).reduce((s, d) => s + (byDayMap.get(d) ?? 0), 0);
  const dayOfMonth = Number(today.slice(8, 10));
  const daysInMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();

  let org: AiOverview['org'] = { connected: false };
  if (opts.withOrg !== false && (await getAdminKey(tenantId))) {
    const o = await getOrgCost(tenantId, now);
    if (o) org = { ...o, connected: true };
  }
  // Con la cuenta conectada, la previsión y el presupuesto usan el gasto REAL de la cuenta (lo comparten Claude Code y otras claves).
  const orgMtd = org.connected && !org.error ? org.mtdUsd : null;
  const orgLast7 = org.connected && !org.error ? org.byDay.filter((d) => days35.slice(-7).includes(d.date)).reduce((s, d) => s + d.usd, 0) : null;
  const baseMtd = orgMtd ?? mtd;
  const forecast = forecastMonth(baseMtd, orgLast7 ?? last7, dayOfMonth, daysInMonth);
  return {
    settings,
    month: monthPrefix,
    mtd: Math.round(mtd * 100) / 100,
    todayUsd: Math.round((byDayMap.get(today) ?? 0) * 100) / 100,
    last7: Math.round(last7 * 100) / 100,
    forecast: Math.round(forecast * 100) / 100,
    dailyBudget: Math.round((settings.monthly / daysInMonth) * 100) / 100,
    byDay,
    fns,
    spikes: detectSpikes(series, settings.spikeFactor),
    recommendations: recommend(fns, { forecast, budget: settings.monthly, orgOtherUsd: orgMtd !== null ? Math.max(0, orgMtd - mtd) : null, toolMtd: mtd }),
    org
  };
}

// --- Coste real de la cuenta de Anthropic (Admin API, opcional) ----------------------------------

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

export async function getAdminKey(tenantId: string): Promise<string | null> {
  const v = await readSetting(tenantId, ADMIN_KEY_SETTING);
  if (!v) return null;
  try {
    const { encrypted, iv } = JSON.parse(v) as { encrypted: string; iv: string };
    return decrypt(encrypted, iv);
  } catch {
    return null;
  }
}

export async function saveAdminKey(tenantId: string, key: string | null): Promise<void> {
  if (!key) {
    await db.delete(opsSettings).where(and(eq(opsSettings.tenantId, tenantId), inArray(opsSettings.key, [ADMIN_KEY_SETTING, ORG_CACHE_SETTING])));
    return;
  }
  await writeSetting(tenantId, ADMIN_KEY_SETTING, JSON.stringify(encrypt(key)));
  await db.delete(opsSettings).where(and(eq(opsSettings.tenantId, tenantId), eq(opsSettings.key, ORG_CACHE_SETTING)));
}

/** Informe de costes diario de la organización (USD; la API da centavos en texto). Raw HTTP: no está en los SDK. */
export async function fetchOrgCostReport(adminKey: string, fromIso: string, toIso: string): Promise<{ date: string; usd: number }[]> {
  const out: { date: string; usd: number }[] = [];
  let page: string | null = null;
  for (let i = 0; i < 5; i++) {
    const q = new URLSearchParams({ starting_at: fromIso, ending_at: toIso, bucket_width: '1d', limit: '31' });
    if (page) q.set('page', page);
    const res = await fetch(`https://api.anthropic.com/v1/organizations/cost_report?${q}`, {
      headers: { 'x-api-key': adminKey, 'anthropic-version': '2026-10-21' },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000)
    });
    if (!res.ok) throw new Error(`Anthropic Admin API (${res.status})`);
    const body = (await res.json()) as { data: { starting_at: string; results: { amount: string }[] }[]; has_more: boolean; next_page: string | null };
    for (const b of body.data) out.push({ date: b.starting_at.slice(0, 10), usd: b.results.reduce((s, r) => s + Number(r.amount || 0), 0) / 100 });
    if (!body.has_more || !body.next_page) break;
    page = body.next_page;
  }
  return out;
}

export async function getOrgCost(tenantId: string, now = new Date(), force = false): Promise<OrgCost | null> {
  const key = await getAdminKey(tenantId);
  if (!key) return null;
  const cached = await readSetting(tenantId, ORG_CACHE_SETTING);
  if (cached && !force) {
    try {
      const c = JSON.parse(cached) as OrgCost;
      if (now.getTime() - Date.parse(c.fetchedAt) < ORG_CACHE_MS) return c;
    } catch {
      /* se vuelve a pedir */
    }
  }
  // El informe va por días UTC: desde 35 días atrás, para cubrir el mes y la última semana.
  const from = new Date(now.getTime() - 35 * 86_400_000);
  from.setUTCHours(0, 0, 0, 0);
  let result: OrgCost;
  try {
    const byDay = await fetchOrgCostReport(key, from.toISOString(), new Date(now.getTime() + 86_400_000).toISOString());
    const month = localParts(TZ, now).date.slice(0, 7);
    result = { mtdUsd: Math.round(byDay.filter((d) => d.date.startsWith(month)).reduce((s, d) => s + d.usd, 0) * 100) / 100, byDay, fetchedAt: now.toISOString(), error: null };
  } catch (e) {
    console.error('[vigía IA] informe de costes:', e instanceof Error ? e.message : e);
    result = { mtdUsd: 0, byDay: [], fetchedAt: now.toISOString(), error: 'No se pudo leer el informe de costes de Anthropic (revisa la clave de administración).' };
  }
  await writeSetting(tenantId, ORG_CACHE_SETTING, JSON.stringify(result));
  return result;
}

// --- Planificador: avisos ------------------------------------------------------------------------

const lastRun = new Map<string, number>();

async function sent(tenantId: string, key: string) {
  const [r] = await db
    .select({ id: opsNotifications.id })
    .from(opsNotifications)
    .where(and(eq(opsNotifications.tenantId, tenantId), eq(opsNotifications.dedupeKey, key)))
    .limit(1);
  return Boolean(r);
}

async function toOwner(tenantId: string, key: string, text: string) {
  const owner = await getOwnerMember(tenantId);
  if (!owner) return;
  await enqueueNotification({ tenantId, kind: 'health', dedupeKey: key, forClickupUserId: owner.clickupUserId, forName: owner.username, payload: { text, toOwner: true } });
}

/** Cada 15 min: picos (uno por función y día), previsión sobre el presupuesto (una vez al día) y umbrales del mes. */
export async function runAiWatch(tenantId: string, now = new Date()): Promise<void> {
  if (now.getTime() - (lastRun.get(tenantId) ?? 0) < 15 * 60_000) return;
  lastRun.set(tenantId, now.getTime());
  const s = await aiWatchSettings(tenantId);
  if (!s.enabled || !s.alerts) return;
  const lp = localParts(TZ, now);
  if (lp.minutes < 8 * 60 || lp.minutes >= 21 * 60) return; // de noche no se avisa (se verá por la mañana)
  const o = await getAiOverview(tenantId, now);
  const link = '\n\nDetalle en Sistema → Gasto de IA.';

  for (const sp of o.spikes) {
    const key = `ai:spike:${sp.fn}:${lp.date}`.slice(0, 200);
    if (await sent(tenantId, key)) continue;
    await toOwner(
      tenantId,
      key,
      `📈 <b>Gasto de IA anormal hoy en «${escapeHtml(sp.fn)}»</b>: ${usd(sp.today.usd)} (lo normal, unos ${usd(sp.baselineUsd)} al día).\n<b>Por qué:</b>\n${sp.reasons.map((r) => `• ${escapeHtml(r)}`).join('\n')}${link}`
    );
  }

  const pct = s.monthly ? Math.round(((o.org.connected && !o.org.error ? o.org.mtdUsd : o.mtd) / s.monthly) * 100) : 0;
  for (const t of [50, 80, 100]) {
    if (pct < t) continue;
    const key = `ai:pct:${o.month}:${t}`;
    if (await sent(tenantId, key)) continue;
    await toOwner(tenantId, key, `${t >= 100 ? '🔴' : t >= 80 ? '🟠' : '🟡'} <b>IA: ${t} % del presupuesto del mes</b> (${pct} %, presupuesto ${usd(s.monthly)}). Previsión a fin de mes: ${usd(o.forecast)}.${link}`);
    break; // un umbral por vuelta: si saltan dos a la vez, sale el más alto en la siguiente
  }

  if (o.forecast > s.monthly && lp.weekday !== 'Sat' && lp.weekday !== 'Sun') {
    // Una vez por semana del mes como mucho (no insiste a diario con lo mismo).
    const key = `ai:forecast:${o.month}:w${Math.ceil(Number(lp.date.slice(8, 10)) / 7)}`;
    if (!(await sent(tenantId, key))) {
      const recs = o.recommendations.filter((r) => r.savingUsdMonth).slice(0, 2);
      await toOwner(
        tenantId,
        key,
        `🔮 <b>Al ritmo actual, la IA acabará el mes en ${usd(o.forecast)}</b> (presupuesto ${usd(s.monthly)}).${recs.length ? `\n<b>Para bajarlo:</b>\n${recs.map((r) => `• ${escapeHtml(r.title)} (≈ ${usd(r.savingUsdMonth!)}/mes)`).join('\n')}` : ''}${link}`
      );
    }
  }
}
