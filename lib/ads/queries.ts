// Módulo Google Ads · consultas GAQL y su traducción a filas nuestras (puro: sin red ni base de datos).
//
// Cada consulta lleva una clave (`key`) y sus parámetros: el cliente (client.ts) la manda a Google con su texto GAQL y el
// modo simulado (sim.ts) la responde por su clave, con filas con la MISMA forma que la API (JSON de REST: nombres en
// lowerCamelCase y los int64 como texto). Así la traducción de aquí se ejercita igual con datos simulados.
//
// Escritas contra la documentación de la API v26 [verificar con la primera respuesta real: los nombres de campo pueden
// cambiar entre versiones]. Las pruebas de contrato (tests/fixtures/ads/) NO están grabadas de una cuenta real.
import { fromMicros, idFromResource, num, type AdsSource } from '@/lib/ads/rules';

export type QueryKey =
  | 'customer_clients'
  | 'customer'
  | 'campaigns'
  | 'budgets'
  | 'bidding_strategies'
  | 'ad_schedules'
  | 'conversion_actions'
  | 'ad_policies'
  | 'keyword_policies'
  | 'landing_pages'
  | 'expanded_landing_pages'
  | 'campaign_daily'
  | 'conversion_daily'
  | 'customer_daily'
  | 'campaign_status'
  | 'campaign_hourly'
  | 'change_events';

export type AdsQuery = { key: QueryKey; gaql: string; params: Record<string, string | number> };
/** Una fila de la API tal cual (objeto JSON anidado). */
export type ApiRow = Record<string, unknown>;

const q = (key: QueryKey, gaql: string, params: Record<string, string | number> = {}): AdsQuery => ({ key, gaql: gaql.replace(/\s+/g, ' ').trim(), params });
const assertYmd = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`Fecha no válida para GAQL: ${v}`);
  return v;
};
const assertDateTime = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)) throw new Error(`Fecha y hora no válida para GAQL: ${v}`);
  return v;
};

// --- Consultas --------------------------------------------------------------------------------------------------------

export const Q = {
  /** Cuentas bajo la MCC (se pide a la MCC). Se filtran después: sin sub-MCC ni cuentas de prueba (R5 menor 10). */
  customerClients: () =>
    q(
      'customer_clients',
      `SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.time_zone,
       customer_client.status, customer_client.manager, customer_client.test_account, customer_client.level
       FROM customer_client WHERE customer_client.level <= 2`
    ),
  customer: () =>
    q(
      'customer',
      `SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.status,
       customer.auto_tagging_enabled, customer.manager, customer.test_account FROM customer`
    ),
  campaigns: () =>
    q(
      'campaigns',
      `SELECT campaign.id, campaign.name, campaign.status, campaign.serving_status, campaign.primary_status,
       campaign.primary_status_reasons, campaign.advertising_channel_type, campaign.advertising_channel_sub_type,
       campaign.bidding_strategy_type, campaign.bidding_strategy, campaign.campaign_budget,
       campaign.target_cpa.target_cpa_micros, campaign.maximize_conversions.target_cpa_micros, campaign.target_roas.target_roas,
       campaign.maximize_conversion_value.target_roas, campaign.start_date, campaign.end_date
       FROM campaign WHERE campaign.status != 'REMOVED'`
    ),
  budgets: () =>
    q(
      'budgets',
      `SELECT campaign_budget.id, campaign_budget.name, campaign_budget.amount_micros, campaign_budget.total_amount_micros,
       campaign_budget.period, campaign_budget.explicitly_shared, campaign_budget.delivery_method, campaign_budget.status,
       campaign_budget.reference_count FROM campaign_budget WHERE campaign_budget.status = 'ENABLED'`
    ),
  biddingStrategies: () =>
    q(
      'bidding_strategies',
      `SELECT bidding_strategy.id, bidding_strategy.name, bidding_strategy.type, bidding_strategy.status,
       bidding_strategy.target_cpa.target_cpa_micros, bidding_strategy.maximize_conversions.target_cpa_micros,
       bidding_strategy.target_roas.target_roas, bidding_strategy.maximize_conversion_value.target_roas
       FROM bidding_strategy WHERE bidding_strategy.status = 'ENABLED'`
    ),
  adSchedules: () =>
    q(
      'ad_schedules',
      `SELECT campaign.id, campaign_criterion.criterion_id, campaign_criterion.ad_schedule.day_of_week,
       campaign_criterion.ad_schedule.start_hour, campaign_criterion.ad_schedule.start_minute,
       campaign_criterion.ad_schedule.end_hour, campaign_criterion.ad_schedule.end_minute
       FROM campaign_criterion WHERE campaign_criterion.type = 'AD_SCHEDULE' AND campaign.status != 'REMOVED'`
    ),
  conversionActions: () =>
    q(
      'conversion_actions',
      `SELECT conversion_action.resource_name, conversion_action.id, conversion_action.name, conversion_action.category,
       conversion_action.type, conversion_action.status, conversion_action.primary_for_goal,
       conversion_action.include_in_conversions_metric, conversion_action.counting_type, conversion_action.owner_customer
       FROM conversion_action WHERE conversion_action.status != 'REMOVED'`
    ),
  adPolicies: () =>
    q(
      'ad_policies',
      `SELECT campaign.id, ad_group.id, ad_group.name, ad_group.status, ad_group_ad.status,
       ad_group_ad.policy_summary.approval_status FROM ad_group_ad
       WHERE ad_group_ad.status != 'REMOVED' AND ad_group.status != 'REMOVED' AND campaign.status != 'REMOVED'`
    ),
  keywordPolicies: () =>
    q(
      'keyword_policies',
      `SELECT campaign.id, ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.approval_status
       FROM ad_group_criterion WHERE ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.approval_status = 'DISAPPROVED'
       AND ad_group_criterion.status != 'REMOVED'`
    ),
  landingPages: (from: string, to: string) =>
    q(
      'landing_pages',
      `SELECT landing_page_view.unexpanded_final_url, campaign.id, metrics.cost_micros, metrics.clicks
       FROM landing_page_view WHERE segments.date BETWEEN '${assertYmd(from)}' AND '${assertYmd(to)}' AND metrics.impressions > 0`,
      { from, to }
    ),
  expandedLandingPages: (from: string, to: string) =>
    q(
      'expanded_landing_pages',
      `SELECT expanded_landing_page_view.expanded_final_url, campaign.id, metrics.cost_micros, metrics.clicks
       FROM expanded_landing_page_view WHERE segments.date BETWEEN '${assertYmd(from)}' AND '${assertYmd(to)}' AND metrics.impressions > 0`,
      { from, to }
    ),
  /** Métricas por campaña y día, con los campos de la campaña: da de alta las eliminadas (R5 I10). Sin filtrar REMOVED. */
  campaignDaily: (from: string, to: string) =>
    q(
      'campaign_daily',
      `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, segments.date,
       metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value,
       metrics.all_conversions, metrics.conversions_by_conversion_date, metrics.search_impression_share,
       metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share
       FROM campaign WHERE segments.date BETWEEN '${assertYmd(from)}' AND '${assertYmd(to)}'`,
      { from, to }
    ),
  /** Conversiones por acción (fecha de clic y fecha de conversión). Incluye las acciones de la MCC (R5 I5). */
  conversionDaily: (from: string, to: string) =>
    q(
      'conversion_daily',
      `SELECT campaign.id, segments.date, segments.conversion_action, metrics.conversions, metrics.all_conversions,
       metrics.conversions_value, metrics.conversions_by_conversion_date, metrics.all_conversions_by_conversion_date
       FROM campaign WHERE segments.date BETWEEN '${assertYmd(from)}' AND '${assertYmd(to)}'`,
      { from, to }
    ),
  /** Consulta de control: el total de la cuenta por día, sin segmentar por campaña (R5 G1). */
  customerDaily: (from: string, to: string) =>
    q(
      'customer_daily',
      `SELECT segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks FROM customer
       WHERE segments.date BETWEEN '${assertYmd(from)}' AND '${assertYmd(to)}'`,
      { from, to }
    ),
  /** Foto de estado (4 veces al día; se guarda la peor del día). */
  campaignStatus: () =>
    q(
      'campaign_status',
      `SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status, campaign.primary_status_reasons,
       campaign.serving_status, campaign.bidding_strategy_system_status, campaign.advertising_channel_type,
       campaign_budget.amount_micros FROM campaign WHERE campaign.status != 'REMOVED'`
    ),
  /** Latido: hoy por horas (R5 G3). `day` es «hoy» en la zona de la cuenta. */
  campaignHourly: (day: string) =>
    q(
      'campaign_hourly',
      `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, segments.hour,
       metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
       FROM campaign WHERE segments.date = '${assertYmd(day)}'`,
      { day }
    ),
  /** Historial de cambios desde el cursor (hora local de la cuenta), ordenado y con LIMIT 10.000 (R5 I6). */
  changeEvents: (fromLocal: string, toLocal: string, limit = 10_000) =>
    q(
      'change_events',
      `SELECT change_event.resource_name, change_event.change_date_time, change_event.user_email, change_event.client_type,
       change_event.change_resource_type, change_event.change_resource_name, change_event.campaign,
       change_event.resource_change_operation, change_event.changed_fields, change_event.old_resource, change_event.new_resource
       FROM change_event WHERE change_event.change_date_time >= '${assertDateTime(fromLocal)}'
       AND change_event.change_date_time <= '${assertDateTime(toLocal)}'
       ORDER BY change_event.change_date_time LIMIT ${Math.max(1, Math.min(10_000, Math.floor(limit)))}`,
      { from: fromLocal, to: toLocal, limit }
    )
};

/** Qué fuente de MED-00 alimenta cada consulta (para el Mapa Visual y la documentación). */
export const QUERY_SOURCE: Record<QueryKey, AdsSource> = {
  customer_clients: 'descubrir',
  customer: 'estructura',
  campaigns: 'estructura',
  budgets: 'estructura',
  bidding_strategies: 'estructura',
  ad_schedules: 'estructura',
  conversion_actions: 'estructura',
  ad_policies: 'estructura',
  keyword_policies: 'estructura',
  landing_pages: 'estructura',
  expanded_landing_pages: 'estructura',
  campaign_daily: 'metricas',
  conversion_daily: 'metricas',
  customer_daily: 'metricas',
  campaign_status: 'metricas',
  campaign_hourly: 'latido',
  change_events: 'cambios'
};

// --- Traducción -------------------------------------------------------------------------------------------------------

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));
const bool = (v: unknown): boolean | null => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : null);
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? v.split(',').map((x) => x.trim()) : []);

export type ClientAccount = { customerId: string; name: string | null; currency: string | null; timeZone: string | null; status: string | null; manager: boolean; test: boolean; level: number };
export function parseCustomerClients(rows: ApiRow[]): ClientAccount[] {
  return rows
    .map((r) => {
      const c = obj(r.customerClient);
      return {
        customerId: String(c.id ?? ''),
        name: str(c.descriptiveName),
        currency: str(c.currencyCode),
        timeZone: str(c.timeZone),
        status: str(c.status),
        manager: bool(c.manager) === true,
        test: bool(c.testAccount) === true,
        level: Number(c.level ?? 0)
      };
    })
    .filter((c) => /^\d{10}$/.test(c.customerId));
}

/** Lo que se sigue: cuentas finales (ni MCC ni sub-MCC) y no de prueba. Las no activas se guardan pero no se siguen. */
export function followableAccounts(list: ClientAccount[]): ClientAccount[] {
  return list.filter((c) => !c.manager && !c.test);
}

export type CustomerInfo = { customerId: string; name: string | null; currency: string | null; timeZone: string | null; status: string | null; autoTagging: boolean | null };
export function parseCustomer(rows: ApiRow[]): CustomerInfo | null {
  const c = obj(rows[0]?.customer);
  if (!c.id) return null;
  return { customerId: String(c.id), name: str(c.descriptiveName), currency: str(c.currencyCode), timeZone: str(c.timeZone), status: str(c.status), autoTagging: bool(c.autoTaggingEnabled) };
}

export type CampaignInfo = {
  nativeId: string;
  name: string | null;
  status: string | null;
  servingStatus: string | null;
  primaryStatus: string | null;
  primaryStatusReasons: string[];
  channelType: string | null;
  channelSubtype: string | null;
  biddingStrategyType: string | null;
  biddingStrategyNativeId: string | null;
  budgetNativeId: string | null;
  targetCpa: number | null;
  targetRoas: number | null;
  startDate: string | null;
  endDate: string | null;
};
const dateOnly = (v: unknown) => {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};
export function parseCampaigns(rows: ApiRow[]): CampaignInfo[] {
  return rows
    .map((r) => {
      const c = obj(r.campaign);
      // El objetivo de puja vive en tres sitios según la estrategia (R5 I5); el de cartera se lee de bidding_strategy.
      const cpa = fromMicros(obj(c.targetCpa).targetCpaMicros) ?? fromMicros(obj(c.maximizeConversions).targetCpaMicros);
      const roas = num(obj(c.targetRoas).targetRoas) ?? num(obj(c.maximizeConversionValue).targetRoas);
      return {
        nativeId: String(c.id ?? ''),
        name: str(c.name),
        status: str(c.status),
        servingStatus: str(c.servingStatus),
        primaryStatus: str(c.primaryStatus),
        primaryStatusReasons: arr(c.primaryStatusReasons),
        channelType: str(c.advertisingChannelType),
        channelSubtype: str(c.advertisingChannelSubType),
        biddingStrategyType: str(c.biddingStrategyType),
        biddingStrategyNativeId: idFromResource(str(c.biddingStrategy)),
        budgetNativeId: idFromResource(str(c.campaignBudget)),
        targetCpa: cpa && cpa > 0 ? cpa : null,
        targetRoas: roas && roas > 0 ? roas : null,
        // [verificar en v26] algunas versiones usan start_date_time / end_date_time.
        startDate: dateOnly(c.startDate ?? c.startDateTime),
        endDate: dateOnly(c.endDate ?? c.endDateTime)
      };
    })
    .filter((c) => c.nativeId);
}

export type BudgetInfo = { nativeId: string; name: string | null; amount: number | null; period: string | null; explicitlyShared: boolean; deliveryMethod: string | null; status: string | null; referenceCount: number | null };
export function parseBudgets(rows: ApiRow[]): BudgetInfo[] {
  return rows
    .map((r) => {
      const b = obj(r.campaignBudget);
      return {
        nativeId: String(b.id ?? ''),
        name: str(b.name),
        // Presupuesto de periodo total (no diario): el importe va en total_amount_micros.
        amount: fromMicros(b.amountMicros) ?? fromMicros(b.totalAmountMicros),
        period: str(b.period) ?? (b.totalAmountMicros ? 'CUSTOM_PERIOD' : null),
        explicitlyShared: bool(b.explicitlyShared) === true,
        deliveryMethod: str(b.deliveryMethod),
        status: str(b.status),
        referenceCount: num(b.referenceCount)
      };
    })
    .filter((b) => b.nativeId);
}

export type StrategyInfo = { nativeId: string; name: string | null; type: string | null; targetCpa: number | null; targetRoas: number | null };
export function parseBiddingStrategies(rows: ApiRow[]): StrategyInfo[] {
  return rows
    .map((r) => {
      const b = obj(r.biddingStrategy);
      return {
        nativeId: String(b.id ?? ''),
        name: str(b.name),
        type: str(b.type),
        targetCpa: fromMicros(obj(b.targetCpa).targetCpaMicros) ?? fromMicros(obj(b.maximizeConversions).targetCpaMicros),
        targetRoas: num(obj(b.targetRoas).targetRoas) ?? num(obj(b.maximizeConversionValue).targetRoas)
      };
    })
    .filter((b) => b.nativeId);
}

const MINUTE: Record<string, number> = { ZERO: 0, FIFTEEN: 15, THIRTY: 30, FORTY_FIVE: 45 };
export type ScheduleSlot = { day: string; startHour: number; startMinute: number; endHour: number; endMinute: number };
/** Programación de anuncios por campaña (R5 I4: «parada» nunca fuera del horario programado). */
export function parseAdSchedules(rows: ApiRow[]): Map<string, ScheduleSlot[]> {
  const out = new Map<string, ScheduleSlot[]>();
  for (const r of rows) {
    const id = String(obj(r.campaign).id ?? '');
    const s = obj(obj(r.campaignCriterion).adSchedule);
    if (!id || !s.dayOfWeek) continue;
    const slot = { day: String(s.dayOfWeek), startHour: Number(s.startHour ?? 0), startMinute: MINUTE[String(s.startMinute ?? 'ZERO')] ?? 0, endHour: Number(s.endHour ?? 24), endMinute: MINUTE[String(s.endMinute ?? 'ZERO')] ?? 0 };
    out.set(id, [...(out.get(id) ?? []), slot]);
  }
  return out;
}

export type ConversionActionInfo = { resourceName: string; nativeId: string | null; ownerCustomerId: string | null; name: string | null; category: string | null; type: string | null; status: string | null; primaryForGoal: boolean | null; includeInConversions: boolean | null; countingType: string | null };
export function parseConversionActions(rows: ApiRow[]): ConversionActionInfo[] {
  return rows
    .map((r) => {
      const a = obj(r.conversionAction);
      return {
        resourceName: String(a.resourceName ?? ''),
        nativeId: str(a.id),
        ownerCustomerId: idFromResource(str(a.ownerCustomer)),
        name: str(a.name),
        category: str(a.category),
        type: str(a.type),
        status: str(a.status),
        primaryForGoal: bool(a.primaryForGoal),
        includeInConversions: bool(a.includeInConversionsMetric),
        countingType: str(a.countingType)
      };
    })
    .filter((a) => a.resourceName);
}

export type AdGroupPolicy = { campaignNativeId: string; adGroupNativeId: string; name: string | null; status: string | null; adsTotal: number; adsApproved: number; adsLimited: number; adsDisapproved: number; keywordsDisapproved: number };
/** Anuncios por grupo y su aprobación (R5 I4, regla 2: lo que pierde dinero es un grupo sin ningún anuncio aprobado). */
export function parseAdPolicies(adRows: ApiRow[], keywordRows: ApiRow[]): AdGroupPolicy[] {
  const by = new Map<string, AdGroupPolicy>();
  const get = (campaign: string, ag: Record<string, unknown>) => {
    const id = String(ag.id ?? '');
    if (!by.has(id)) by.set(id, { campaignNativeId: campaign, adGroupNativeId: id, name: str(ag.name), status: str(ag.status), adsTotal: 0, adsApproved: 0, adsLimited: 0, adsDisapproved: 0, keywordsDisapproved: 0 });
    return by.get(id)!;
  };
  for (const r of adRows) {
    const ag = obj(r.adGroup);
    if (!ag.id) continue;
    const p = get(String(obj(r.campaign).id ?? ''), ag);
    const ad = obj(r.adGroupAd);
    if (String(ad.status ?? '') !== 'ENABLED') continue;
    const approval = String(obj(ad.policySummary).approvalStatus ?? '');
    p.adsTotal++;
    if (approval === 'APPROVED' || approval === 'APPROVED_LIMITED') p.adsApproved++;
    if (approval === 'APPROVED_LIMITED' || approval === 'AREA_OF_INTEREST_ONLY') p.adsLimited++;
    if (approval === 'DISAPPROVED') p.adsDisapproved++;
  }
  for (const r of keywordRows) {
    const ag = obj(r.adGroup);
    if (!ag.id) continue;
    get(String(obj(r.campaign).id ?? ''), ag).keywordsDisapproved++;
  }
  return [...by.values()].filter((p) => p.adGroupNativeId);
}

export type LandingRow = { url: string; origin: 'anuncio' | 'expandida'; campaignNativeId: string; cost: number; clicks: number };
export function parseLandingPages(rows: ApiRow[], expanded: ApiRow[]): LandingRow[] {
  const out: LandingRow[] = [];
  for (const r of rows) {
    const url = str(obj(r.landingPageView).unexpandedFinalUrl);
    if (url) out.push({ url, origin: 'anuncio', campaignNativeId: String(obj(r.campaign).id ?? ''), cost: fromMicros(obj(r.metrics).costMicros) ?? 0, clicks: num(obj(r.metrics).clicks) ?? 0 });
  }
  for (const r of expanded) {
    const url = str(obj(r.expandedLandingPageView).expandedFinalUrl);
    if (url) out.push({ url, origin: 'expandida', campaignNativeId: String(obj(r.campaign).id ?? ''), cost: fromMicros(obj(r.metrics).costMicros) ?? 0, clicks: num(obj(r.metrics).clicks) ?? 0 });
  }
  return out;
}

export type CampaignStub = { nativeId: string; name: string | null; status: string | null; channelType: string | null };
export type DailyCampaignRow = CampaignStub & {
  day: string;
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number | null;
  conversionsValue: number | null;
  allConversions: number | null;
  conversionsByConvDate: number | null;
  ext: Record<string, number>;
};
export function parseCampaignDaily(rows: ApiRow[]): DailyCampaignRow[] {
  return rows
    .map((r) => {
      const c = obj(r.campaign);
      const m = obj(r.metrics);
      const ext: Record<string, number> = {};
      for (const k of ['searchImpressionShare', 'searchBudgetLostImpressionShare', 'searchRankLostImpressionShare']) {
        const v = num(m[k]);
        if (v !== null) ext[k] = v;
      }
      return {
        nativeId: String(c.id ?? ''),
        name: str(c.name),
        status: str(c.status),
        channelType: str(c.advertisingChannelType),
        day: String(obj(r.segments).date ?? ''),
        cost: fromMicros(m.costMicros) ?? 0,
        impressions: num(m.impressions) ?? 0,
        clicks: num(m.clicks) ?? 0,
        conversions: num(m.conversions),
        conversionsValue: num(m.conversionsValue),
        allConversions: num(m.allConversions),
        conversionsByConvDate: num(m.conversionsByConversionDate),
        ext
      };
    })
    .filter((r) => r.nativeId && /^\d{4}-\d{2}-\d{2}$/.test(r.day));
}

export type DailyConversionRow = { campaignNativeId: string; day: string; conversionAction: string; conversions: number | null; allConversions: number | null; conversionsValue: number | null; conversionsByConvDate: number | null; allConversionsByConvDate: number | null };
export function parseConversionDaily(rows: ApiRow[]): DailyConversionRow[] {
  return rows
    .map((r) => {
      const m = obj(r.metrics);
      const s = obj(r.segments);
      return {
        campaignNativeId: String(obj(r.campaign).id ?? ''),
        day: String(s.date ?? ''),
        conversionAction: String(s.conversionAction ?? ''),
        conversions: num(m.conversions),
        allConversions: num(m.allConversions),
        conversionsValue: num(m.conversionsValue),
        conversionsByConvDate: num(m.conversionsByConversionDate),
        allConversionsByConvDate: num(m.allConversionsByConversionDate)
      };
    })
    .filter((r) => r.campaignNativeId && r.conversionAction && /^\d{4}-\d{2}-\d{2}$/.test(r.day));
}

export type ControlRow = { day: string; cost: number; impressions: number; clicks: number };
export function parseCustomerDaily(rows: ApiRow[]): ControlRow[] {
  return rows
    .map((r) => {
      const m = obj(r.metrics);
      return { day: String(obj(r.segments).date ?? ''), cost: fromMicros(m.costMicros) ?? 0, impressions: num(m.impressions) ?? 0, clicks: num(m.clicks) ?? 0 };
    })
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.day));
}

export type StatusRow = CampaignStub & { primaryStatus: string | null; primaryStatusReasons: string[]; servingStatus: string | null; biddingStatus: string | null; budgetAmount: number | null };
export function parseCampaignStatus(rows: ApiRow[]): StatusRow[] {
  return rows
    .map((r) => {
      const c = obj(r.campaign);
      return {
        nativeId: String(c.id ?? ''),
        name: str(c.name),
        status: str(c.status),
        channelType: str(c.advertisingChannelType),
        primaryStatus: str(c.primaryStatus),
        primaryStatusReasons: arr(c.primaryStatusReasons),
        servingStatus: str(c.servingStatus),
        biddingStatus: str(c.biddingStrategySystemStatus),
        budgetAmount: fromMicros(obj(r.campaignBudget).amountMicros)
      };
    })
    .filter((r) => r.nativeId);
}

export type HourlyRow = CampaignStub & { hour: number; impressions: number; clicks: number; cost: number; conversions: number | null };
export function parseCampaignHourly(rows: ApiRow[]): HourlyRow[] {
  return rows
    .map((r) => {
      const c = obj(r.campaign);
      const m = obj(r.metrics);
      return {
        nativeId: String(c.id ?? ''),
        name: str(c.name),
        status: str(c.status),
        channelType: str(c.advertisingChannelType),
        hour: Number(obj(r.segments).hour ?? -1),
        impressions: num(m.impressions) ?? 0,
        clicks: num(m.clicks) ?? 0,
        cost: fromMicros(m.costMicros) ?? 0,
        conversions: num(m.conversions)
      };
    })
    .filter((r) => r.nativeId && Number.isInteger(r.hour) && r.hour >= 0 && r.hour <= 23);
}

export type ChangeEventRow = {
  eventResourceName: string;
  changeAtLocal: string;
  userEmail: string | null;
  clientType: string | null;
  resourceType: string | null;
  changedResource: string | null;
  campaignNativeId: string | null;
  operation: string | null;
  changedFields: string[];
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
};
export function parseChangeEvents(rows: ApiRow[]): ChangeEventRow[] {
  return rows
    .map((r) => {
      const e = obj(r.changeEvent);
      const oldV = obj(e.oldResource);
      const newV = obj(e.newResource);
      return {
        eventResourceName: String(e.resourceName ?? ''),
        changeAtLocal: String(e.changeDateTime ?? ''),
        userEmail: str(e.userEmail),
        clientType: str(e.clientType),
        resourceType: str(e.changeResourceType),
        changedResource: str(e.changeResourceName),
        campaignNativeId: idFromResource(str(e.campaign)),
        operation: str(e.resourceChangeOperation),
        changedFields: arr(e.changedFields),
        oldValue: Object.keys(oldV).length ? oldV : null,
        newValue: Object.keys(newV).length ? newV : null
      };
    })
    .filter((e) => e.eventResourceName && e.changeAtLocal);
}

/** Tipos de recurso cuyo cambio pide releer la estructura de esa cuenta (en vez de esperar a la del día siguiente). */
export const STRUCTURE_RESOURCE_TYPES = new Set(['CAMPAIGN', 'CAMPAIGN_BUDGET', 'CAMPAIGN_CRITERION', 'AD_GROUP', 'AD_GROUP_AD', 'CONVERSION_ACTION', 'BIDDING_STRATEGY']);
