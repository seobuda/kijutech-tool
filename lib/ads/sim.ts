// Módulo Google Ads · modo simulado (credencial «SIM»). NUNCA sale a internet.
//
// Genera, de forma determinista (misma cuenta y mismo día → mismos números), una MCC con 6 cuentas de negocios locales
// inventados, sus campañas de búsqueda y Performance Max, el histórico diario con estacionalidad semanal, conversiones por
// acción (también una acción de la MCC), las horas de hoy, estados, políticas, URL de destino e historial de cambios.
// Responde a las consultas de queries.ts por su clave, con filas con la forma de la API (JSON de REST), para que la
// traducción y la descarga se ejerciten igual que con Google. Sirve para desarrollo, pruebas y pantallas mientras no hay
// acceso real. Las cuentas simuladas se marcan `simulated` y nunca se vinculan a clientes ni generan avisos (diseño §3.4).
// Escenarios deterministas del paso 2 (para que Hoy no salga vacía y las pruebas lo comprueben): «PMax · Reformas» parada
// desde ayer, un grupo de «Urgencias» sin anuncios aprobados (rechazo con gasto), el formulario de Fontanería sin contar
// desde hace 8 días (medición rota), un cambio del dueño de Abogados ayer y una recomendación aplicada por Google en la
// clínica hace 2 días (cambios ajenos). Los demás cambios del historial son de la agencia.
import { createHash } from 'node:crypto';
import { addDays, zonedParts } from '@/lib/ads/rules';
import type { AdsQuery, ApiRow } from '@/lib/ads/queries';

export const SIM_MCC = '9990000000';
const TZ = 'Europe/Madrid';

type SimCampaign = {
  id: string;
  name: string;
  type: 'SEARCH' | 'PERFORMANCE_MAX';
  daily: number; // gasto diario medio
  cpc: number;
  cr: number; // tasa de conversión
  weekdaysOnly?: boolean; // programación de anuncios de lunes a viernes, 9 a 19
  removedDaysAgo?: number; // campaña eliminada hace N días (sigue en el histórico)
  sharedBudget?: string;
  limited?: boolean;
  /** Paso 2 (escenario «campaña parada»): sin impresiones desde hace N días (ayer y hoy si N = 1), aunque sigue activa. */
  stoppedDaysAgo?: number;
};
type SimAccount = {
  id: string;
  name: string;
  status: string;
  startDaysAgo: number;
  autoTagging: boolean;
  mccAction?: boolean;
  /** Paso 2 (escenario «medición rota»): la acción «Formulario» deja de contar desde hace N días con los clics de siempre. */
  brokenFormDaysAgo?: number;
  campaigns: SimCampaign[];
};

const ACCOUNTS: SimAccount[] = [
  {
    id: '9990000001',
    name: 'SIM · Clínica dental Norte',
    status: 'ENABLED',
    startDaysAgo: 900,
    autoTagging: true,
    campaigns: [
      { id: '1100001', name: 'Búsqueda · Implantes', type: 'SEARCH', daily: 45, cpc: 1.9, cr: 0.06, weekdaysOnly: true },
      { id: '1100002', name: 'PMax · Clínica', type: 'PERFORMANCE_MAX', daily: 30, cpc: 0.9, cr: 0.03 },
      { id: '1100003', name: 'Búsqueda · Ortodoncia (antigua)', type: 'SEARCH', daily: 20, cpc: 1.5, cr: 0.04, removedDaysAgo: 200 }
    ]
  },
  {
    id: '9990000002',
    name: 'SIM · Fontanería Rápida',
    status: 'ENABLED',
    startDaysAgo: 500,
    autoTagging: true,
    brokenFormDaysAgo: 8,
    campaigns: [
      { id: '2200001', name: 'Búsqueda · Urgencias', type: 'SEARCH', daily: 60, cpc: 2.6, cr: 0.11 },
      { id: '2200002', name: 'Búsqueda · Reformas de baño', type: 'SEARCH', daily: 25, cpc: 1.7, cr: 0.05 }
    ]
  },
  {
    id: '9990000003',
    name: 'SIM · Abogados Laboral',
    status: 'ENABLED',
    startDaysAgo: 700,
    autoTagging: true,
    campaigns: [
      { id: '3300001', name: 'Búsqueda · Despidos', type: 'SEARCH', daily: 35, cpc: 3.1, cr: 0.07, sharedBudget: '3309999' },
      { id: '3300002', name: 'Búsqueda · Accidentes', type: 'SEARCH', daily: 20, cpc: 2.8, cr: 0.05, sharedBudget: '3309999', limited: true }
    ]
  },
  {
    id: '9990000004',
    name: 'SIM · Reformas Integrales',
    status: 'ENABLED',
    startDaysAgo: 300,
    autoTagging: false,
    campaigns: [
      { id: '4400001', name: 'Búsqueda · Reformas', type: 'SEARCH', daily: 40, cpc: 1.4, cr: 0.03 },
      { id: '4400002', name: 'PMax · Reformas', type: 'PERFORMANCE_MAX', daily: 25, cpc: 0.7, cr: 0.02, stoppedDaysAgo: 1 }
    ]
  },
  {
    id: '9990000005',
    name: 'SIM · Academia de Inglés',
    status: 'ENABLED',
    startDaysAgo: 420,
    autoTagging: true,
    mccAction: true,
    campaigns: [{ id: '5500001', name: 'Búsqueda · Cursos', type: 'SEARCH', daily: 15, cpc: 0.8, cr: 0.04 }]
  },
  {
    id: '9990000006',
    name: 'SIM · Cerrajería (cancelada)',
    status: 'CANCELED',
    startDaysAgo: 400,
    autoTagging: true,
    campaigns: [{ id: '6600001', name: 'Búsqueda · Cerrajero 24h', type: 'SEARCH', daily: 20, cpc: 2.2, cr: 0.08, removedDaysAgo: 90 }]
  }
];

export const SIM_ACCOUNT_IDS = ACCOUNTS.map((a) => a.id);

// --- Azar determinista ------------------------------------------------------------------------------------------------

function seeded(...parts: string[]): () => number {
  let s = createHash('sha256').update(parts.join('|')).digest().readUInt32LE(0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function poisson(lambda: number, rnd: () => number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rnd();
  } while (p > L && k < 200);
  return k - 1;
}
const micros = (v: number) => String(Math.round(v * 1_000_000));

// --- Métricas de un día -----------------------------------------------------------------------------------------------

type DayMetrics = { cost: number; impressions: number; clicks: number; form: number; call: number; whatsapp: number; mcc: number; conv: number };

/** Peso de cada hora del día (más de 9 a 20). */
const HOUR_WEIGHT = Array.from({ length: 24 }, (_, h) => (h < 7 ? 0.15 : h < 9 ? 0.6 : h < 21 ? 1.4 : 0.5));

function weekday(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

function hoursFor(c: SimCampaign): number[] {
  return c.weekdaysOnly ? Array.from({ length: 10 }, (_, i) => 9 + i) : Array.from({ length: 24 }, (_, i) => i);
}

/** Día entero simulado de una campaña. null = sin impresiones (la API no devuelve fila). */
function fullDay(acc: SimAccount, c: SimCampaign, day: string, today: string): DayMetrics | null {
  if (day > today) return null;
  if (day < addDays(today, -acc.startDaysAgo)) return null;
  if (c.removedDaysAgo !== undefined && day > addDays(today, -c.removedDaysAgo)) return null;
  if (c.stoppedDaysAgo !== undefined && day >= addDays(today, -c.stoppedDaysAgo)) return null;
  const wd = weekday(day);
  if (c.weekdaysOnly && (wd === 0 || wd === 6)) return null;
  const rnd = seeded('sim', acc.id, c.id, day);
  const weekFactor = wd === 0 ? 0.55 : wd === 6 ? 0.7 : wd === 1 ? 1.15 : 1;
  const cost = Math.round(c.daily * weekFactor * (0.75 + 0.5 * rnd()) * 100) / 100;
  const clicks = Math.max(1, Math.round(cost / c.cpc));
  const impressions = clicks * (12 + Math.floor(rnd() * 25));
  const conv = poisson(clicks * c.cr, rnd);
  const call = Math.floor(conv * 0.4);
  const mcc = acc.mccAction && conv > 0 ? 1 : 0;
  // Medición rota: el formulario deja de contar (las llamadas siguen); los clics no cambian.
  const broken = acc.brokenFormDaysAgo !== undefined && day >= addDays(today, -acc.brokenFormDaysAgo);
  const form = broken ? 0 : conv - call - mcc;
  const whatsapp = poisson(clicks * 0.02, rnd);
  return { cost, impressions, clicks, form, call, whatsapp, mcc, conv: form + call + mcc };
}

/** Lo que se ve de un día: hoy, solo las horas ya pasadas. */
function observedDay(acc: SimAccount, c: SimCampaign, day: string, now: Date): DayMetrics | null {
  const local = zonedParts(now, TZ);
  const full = fullDay(acc, c, day, local.date);
  if (!full || day !== local.date) return full;
  const hrs = hoursFor(c);
  const total = hrs.reduce((s, h) => s + HOUR_WEIGHT[h], 0);
  const seen = hrs.filter((h) => h <= local.hour).reduce((s, h) => s + HOUR_WEIGHT[h], 0);
  if (seen <= 0) return null;
  const f = seen / total;
  const scale = (v: number) => Math.floor(v * f);
  const out = { cost: Math.round(full.cost * f * 100) / 100, impressions: scale(full.impressions), clicks: scale(full.clicks), form: scale(full.form), call: scale(full.call), whatsapp: scale(full.whatsapp), mcc: scale(full.mcc), conv: 0 };
  out.conv = out.form + out.call + out.mcc;
  return out.impressions > 0 ? out : null;
}

/** Hoy por horas (latido). */
function hourly(acc: SimAccount, c: SimCampaign, now: Date): { hour: number; m: DayMetrics }[] {
  const local = zonedParts(now, TZ);
  const full = fullDay(acc, c, local.date, local.date);
  if (!full) return [];
  const hrs = hoursFor(c);
  const total = hrs.reduce((s, h) => s + HOUR_WEIGHT[h], 0);
  return hrs
    .filter((h) => h <= local.hour)
    .map((h) => {
      const f = HOUR_WEIGHT[h] / total;
      const m = { cost: Math.round(full.cost * f * 100) / 100, impressions: Math.round(full.impressions * f), clicks: Math.round(full.clicks * f), form: 0, call: 0, whatsapp: 0, mcc: 0, conv: Math.round(full.conv * f * 100) / 100 };
      return { hour: h, m };
    })
    .filter((x) => x.m.impressions > 0);
}

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// --- Respuestas por consulta ------------------------------------------------------------------------------------------

const actionRes = (acc: string, n: number) => `customers/${acc}/conversionActions/${n}`;
const MCC_ACTION = `customers/${SIM_MCC}/conversionActions/777`;
const campaignStatus = (c: SimCampaign) => (c.removedDaysAgo !== undefined ? 'REMOVED' : 'ENABLED');
const channel = (c: SimCampaign) => c.type;

function campaignRow(acc: SimAccount, c: SimCampaign, today: string): ApiRow {
  return {
    campaign: {
      resourceName: `customers/${acc.id}/campaigns/${c.id}`,
      id: c.id,
      name: c.name,
      status: campaignStatus(c),
      servingStatus: 'SERVING',
      primaryStatus: c.limited ? 'LIMITED' : 'ELIGIBLE',
      primaryStatusReasons: c.limited ? ['BUDGET_CONSTRAINED'] : [],
      advertisingChannelType: channel(c),
      biddingStrategyType: acc.id === '9990000004' && c.type === 'SEARCH' ? 'TARGET_CPA' : 'MAXIMIZE_CONVERSIONS',
      ...(acc.id === '9990000004' && c.type === 'SEARCH' ? { biddingStrategy: `customers/${acc.id}/biddingStrategies/4440001` } : {}),
      campaignBudget: `customers/${acc.id}/campaignBudgets/${c.sharedBudget ?? `${c.id}9`}`,
      ...(c.type === 'PERFORMANCE_MAX' ? { maximizeConversions: { targetCpaMicros: micros(40) } } : {}),
      startDate: addDays(today, -acc.startDaysAgo)
    }
  };
}

function rowsFor(acc: SimAccount, query: AdsQuery, now: Date): ApiRow[] {
  const today = zonedParts(now, TZ).date;
  const live = acc.campaigns.filter((c) => c.removedDaysAgo === undefined);
  const p = query.params;
  switch (query.key) {
    case 'customer':
      return [{ customer: { id: acc.id, descriptiveName: acc.name, currencyCode: 'EUR', timeZone: TZ, status: acc.status, autoTaggingEnabled: acc.autoTagging, manager: false, testAccount: false } }];
    case 'campaigns':
      return live.map((c) => campaignRow(acc, c, today));
    case 'budgets': {
      const seen = new Map<string, ApiRow>();
      for (const c of live) {
        const id = c.sharedBudget ?? `${c.id}9`;
        const prev = seen.get(id);
        const amount = (prev ? Number((prev.campaignBudget as { amountMicros: string }).amountMicros) / 1e6 : 0) + c.daily * 1.2;
        seen.set(id, { campaignBudget: { id, name: c.sharedBudget ? 'Presupuesto compartido' : `Presupuesto ${c.name}`, amountMicros: micros(amount), period: 'DAILY', explicitlyShared: Boolean(c.sharedBudget), deliveryMethod: 'STANDARD', status: 'ENABLED', referenceCount: String(live.filter((x) => (x.sharedBudget ?? `${x.id}9`) === id).length) } });
      }
      return [...seen.values()];
    }
    case 'bidding_strategies':
      return acc.id === '9990000004' ? [{ biddingStrategy: { id: '4440001', name: 'CPA objetivo reformas', type: 'TARGET_CPA', status: 'ENABLED', targetCpa: { targetCpaMicros: micros(35) } } }] : [];
    case 'ad_schedules':
      return live
        .filter((c) => c.weekdaysOnly)
        .flatMap((c) =>
          ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'].map((day, i) => ({
            campaign: { id: c.id },
            campaignCriterion: { criterionId: String(100 + i), adSchedule: { dayOfWeek: day, startHour: 9, startMinute: 'ZERO', endHour: 19, endMinute: 'ZERO' } }
          }))
        );
    case 'conversion_actions': {
      const base = [
        { n: 1, name: 'Formulario de contacto', category: 'SUBMIT_LEAD_FORM', type: 'WEBPAGE', primary: true, include: true, counting: 'ONE_PER_CLICK' },
        { n: 2, name: 'Llamada desde el anuncio', category: 'PHONE_CALL_LEAD', type: 'AD_CALL', primary: true, include: true, counting: 'ONE_PER_CLICK' },
        { n: 3, name: 'Clic en WhatsApp', category: 'CONTACT', type: 'WEBPAGE', primary: false, include: false, counting: 'MANY_PER_CLICK' }
      ];
      return base.map((a) => ({
        conversionAction: { resourceName: actionRes(acc.id, a.n), id: String(a.n), name: a.name, category: a.category, type: a.type, status: 'ENABLED', primaryForGoal: a.primary, includeInConversionsMetric: a.include, countingType: a.counting, ownerCustomer: `customers/${acc.id}` }
      }));
    }
    case 'ad_policies':
      return live
        .filter((c) => c.type === 'SEARCH')
        .flatMap((c) =>
          [1, 2].flatMap((g) =>
            [1, 2, 3].map((n) => {
              const broken = acc.id === '9990000002' && c.id === '2200001' && g === 2;
              const approval = broken ? 'DISAPPROVED' : n === 3 ? 'APPROVED_LIMITED' : 'APPROVED';
              return { campaign: { id: c.id }, adGroup: { id: `${c.id}${g}`, name: `Grupo ${g} · ${c.name}`, status: 'ENABLED' }, adGroupAd: { status: 'ENABLED', policySummary: { approvalStatus: approval } } };
            })
          )
        );
    case 'keyword_policies':
      return acc.id === '9990000002' ? [{ campaign: { id: '2200001' }, adGroup: { id: '22000012', name: 'Grupo 2 · Búsqueda · Urgencias', status: 'ENABLED' }, adGroupCriterion: { criterionId: '901', approvalStatus: 'DISAPPROVED' } }] : [];
    case 'landing_pages':
    case 'expanded_landing_pages': {
      const n = acc.id.slice(-1);
      return live
        .filter((c) => (query.key === 'landing_pages' ? true : c.type === 'PERFORMANCE_MAX'))
        .map((c) => {
          let cost = 0;
          let clicks = 0;
          for (const d of eachDay(String(p.from), String(p.to))) {
            const m = observedDay(acc, c, d, now);
            if (m) {
              cost += m.cost;
              clicks += m.clicks;
            }
          }
          const url = query.key === 'landing_pages' ? `https://sim${n}.example/${c.id}?utm_source=google&utm_medium=cpc` : `https://sim${n}.example/contacto`;
          const view = query.key === 'landing_pages' ? { landingPageView: { unexpandedFinalUrl: url } } : { expandedLandingPageView: { expandedFinalUrl: url } };
          return { ...view, campaign: { id: c.id }, metrics: { costMicros: micros(cost), clicks: String(clicks) } };
        })
        .filter((r) => Number((r.metrics as { clicks: string }).clicks) > 0);
    }
    case 'campaign_daily':
      return acc.campaigns.flatMap((c) =>
        eachDay(String(p.from), String(p.to)).flatMap((d) => {
          const m = observedDay(acc, c, d, now);
          if (!m) return [];
          const conv = m.form + m.call + m.mcc;
          return [
            {
              campaign: { id: c.id, name: c.name, status: campaignStatus(c), advertisingChannelType: channel(c) },
              segments: { date: d },
              metrics: {
                costMicros: micros(m.cost),
                impressions: String(m.impressions),
                clicks: String(m.clicks),
                conversions: conv,
                conversionsValue: 0,
                allConversions: conv + m.whatsapp,
                conversionsByConversionDate: conv,
                ...(c.type === 'SEARCH' ? { searchImpressionShare: 0.42, searchBudgetLostImpressionShare: c.limited ? 0.31 : 0.05, searchRankLostImpressionShare: 0.2 } : {})
              }
            }
          ];
        })
      );
    case 'conversion_daily':
      return acc.campaigns.flatMap((c) =>
        eachDay(String(p.from), String(p.to)).flatMap((d) => {
          const m = observedDay(acc, c, d, now);
          if (!m) return [];
          const parts: [string, number, boolean][] = [
            [actionRes(acc.id, 1), m.form, true],
            [actionRes(acc.id, 2), m.call, true],
            [actionRes(acc.id, 3), m.whatsapp, false],
            [MCC_ACTION, m.mcc, true]
          ];
          return parts
            .filter(([, v]) => v > 0)
            .map(([action, v, primary]) => ({
              campaign: { id: c.id },
              segments: { date: d, conversionAction: action },
              metrics: { conversions: primary ? v : 0, allConversions: v, conversionsValue: 0, conversionsByConversionDate: primary ? v : 0, allConversionsByConversionDate: v }
            }));
        })
      );
    case 'customer_daily':
      return eachDay(String(p.from), String(p.to)).flatMap((d) => {
        let cost = 0;
        let impressions = 0;
        let clicks = 0;
        for (const c of acc.campaigns) {
          const m = observedDay(acc, c, d, now);
          if (m) {
            cost += m.cost;
            impressions += m.impressions;
            clicks += m.clicks;
          }
        }
        return impressions > 0 ? [{ segments: { date: d }, metrics: { costMicros: micros(cost), impressions: String(impressions), clicks: String(clicks) } }] : [];
      });
    case 'campaign_status':
      return live.map((c) => ({
        campaign: { id: c.id, name: c.name, status: 'ENABLED', primaryStatus: c.limited ? 'LIMITED' : 'ELIGIBLE', primaryStatusReasons: c.limited ? ['BUDGET_CONSTRAINED'] : [], servingStatus: 'SERVING', biddingStrategySystemStatus: 'ENABLED', advertisingChannelType: channel(c) },
        campaignBudget: { amountMicros: micros(c.daily * 1.2) }
      }));
    case 'campaign_hourly':
      if (String(p.day) !== today) return [];
      return live.flatMap((c) =>
        hourly(acc, c, now).map(({ hour, m }) => ({
          campaign: { id: c.id, name: c.name, status: 'ENABLED', advertisingChannelType: channel(c) },
          segments: { hour },
          metrics: { impressions: String(m.impressions), clicks: String(m.clicks), costMicros: micros(m.cost), conversions: m.conv }
        }))
      );
    case 'change_events': {
      const out: ApiRow[] = [];
      for (let i = 0; i <= 25; i++) {
        const d = addDays(today, -i);
        const rnd = seeded('cambios', acc.id, d);
        if (rnd() > 0.45) continue;
        const c = live[Math.floor(rnd() * live.length)] ?? acc.campaigns[0];
        // Los cambios de cada día los hace la agencia; los ajenos son los escenarios fijos de abajo (paso 2).
        rnd();
        const local = `${d} ${String(9 + Math.floor(rnd() * 9)).padStart(2, '0')}:${String(Math.floor(rnd() * 60)).padStart(2, '0')}:00.000000`;
        if (local.slice(0, 19) < String(p.from) || local.slice(0, 19) > String(p.to)) continue;
        const stamp = Date.parse(`${d}T00:00:00Z`) * 1000 + i;
        out.push({
          changeEvent: {
            resourceName: `customers/${acc.id}/changeEvents/${stamp}~0~0`,
            changeDateTime: local,
            userEmail: 'gestor@kijutech.com',
            clientType: 'GOOGLE_ADS_WEB_CLIENT',
            changeResourceType: 'CAMPAIGN_BUDGET',
            changeResourceName: `customers/${acc.id}/campaignBudgets/${c.sharedBudget ?? `${c.id}9`}`,
            campaign: `customers/${acc.id}/campaigns/${c.id}`,
            resourceChangeOperation: 'UPDATE',
            changedFields: 'amountMicros',
            oldResource: { campaignBudget: { amountMicros: micros(c.daily) } },
            newResource: { campaignBudget: { amountMicros: micros(c.daily * 1.2) } }
          }
        });
      }
      // Escenarios del paso 2 («cambio ajeno»): el dueño de Abogados cambia un presupuesto ayer y Google aplica una
      // recomendación en la clínica hace 2 días. Deterministas y sobre campañas con gasto en 14 días.
      const foreign: { acc: string; days: number; email: string; clientType: string; campaign: string; budget: string }[] = [
        { acc: '9990000003', days: 1, email: 'dueno.cliente@gmail.com', clientType: 'GOOGLE_ADS_WEB_CLIENT', campaign: '3300001', budget: '3309999' },
        { acc: '9990000001', days: 2, email: '', clientType: 'GOOGLE_ADS_RECOMMENDATIONS_SUBSCRIPTION', campaign: '1100002', budget: '11000029' }
      ];
      for (const f of foreign.filter((x) => x.acc === acc.id)) {
        const d = addDays(today, -f.days);
        const local = `${d} 11:00:00.000000`;
        if (local.slice(0, 19) < String(p.from) || local.slice(0, 19) > String(p.to)) continue;
        out.push({
          changeEvent: {
            resourceName: `customers/${acc.id}/changeEvents/${Date.parse(`${d}T00:00:00Z`) * 1000 + 999}~0~0`,
            changeDateTime: local,
            userEmail: f.email,
            clientType: f.clientType,
            changeResourceType: 'CAMPAIGN_BUDGET',
            changeResourceName: `customers/${acc.id}/campaignBudgets/${f.budget}`,
            campaign: `customers/${acc.id}/campaigns/${f.campaign}`,
            resourceChangeOperation: 'UPDATE',
            changedFields: 'amountMicros',
            oldResource: { campaignBudget: { amountMicros: micros(40) } },
            newResource: { campaignBudget: { amountMicros: micros(70) } }
          }
        });
      }
      out.sort((a, b) => String((a.changeEvent as { changeDateTime: string }).changeDateTime).localeCompare(String((b.changeEvent as { changeDateTime: string }).changeDateTime)));
      return out.slice(0, Number(p.limit ?? 10_000));
    }
    default:
      return [];
  }
}

/** Respuesta simulada a una consulta, con la forma de la API. Determinista; nunca sale a internet. */
export function simQuery(customerId: string, query: AdsQuery, now: Date = new Date()): ApiRow[] {
  if (customerId === SIM_MCC) {
    if (query.key !== 'customer_clients') return [];
    return [
      { customerClient: { id: SIM_MCC, descriptiveName: 'SIM · MCC de la agencia', currencyCode: 'EUR', timeZone: TZ, status: 'ENABLED', manager: true, testAccount: false, level: '0' } },
      ...ACCOUNTS.map((a) => ({ customerClient: { id: a.id, descriptiveName: a.name, currencyCode: 'EUR', timeZone: TZ, status: a.status, manager: false, testAccount: false, level: '1' } })),
      { customerClient: { id: '9990000099', descriptiveName: 'SIM · Sub-MCC', currencyCode: 'EUR', timeZone: TZ, status: 'ENABLED', manager: true, testAccount: false, level: '1' } },
      { customerClient: { id: '9990000098', descriptiveName: 'SIM · Cuenta de prueba', currencyCode: 'EUR', timeZone: TZ, status: 'ENABLED', manager: false, testAccount: true, level: '1' } }
    ];
  }
  const acc = ACCOUNTS.find((a) => a.id === customerId);
  return acc ? rowsFor(acc, query, now) : [];
}
