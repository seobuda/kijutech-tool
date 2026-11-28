// Módulo Google Ads · consultas GAQL de la auditoría de higiene (paso 3; diseño §13.3) y su traducción (puro).
//
// Van APARTE de las consultas diarias de los pasos 1-2 a propósito: varios campos (AI Max, fechas de migración,
// automatización de recursos, suscripciones de recomendaciones, exclusiones de cuenta) están escritos desde la
// investigación y SIN PROBAR contra la v26. Si un nombre está mal, Google rechaza la consulta entera: así solo se quedan
// sin comprobar los controles de ese grupo, nunca la estructura diaria ni las interrupciones. Solo lectura.
import { fromMicros, idFromResource, num } from '@/lib/ads/rules';
import { audq, type AdsQuery, type ApiRow } from '@/lib/ads/queries';

const assertYmd = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`Fecha no válida para GAQL: ${v}`);
  return v;
};
const between = (from: string, to: string) => `segments.date BETWEEN '${assertYmd(from)}' AND '${assertYmd(to)}'`;

export const AQ = {
  campaigns: (): AdsQuery =>
    audq(
      'audit_campaigns',
      `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.advertising_channel_sub_type,
       campaign.network_settings.target_google_search, campaign.network_settings.target_search_network,
       campaign.network_settings.target_content_network, campaign.geo_target_type_setting.positive_geo_target_type,
       campaign.geo_target_type_setting.negative_geo_target_type, campaign.dynamic_search_ads_setting.domain_name
       FROM campaign WHERE campaign.status = 'ENABLED'`
    ),
  /** [no verificado en v26] AI Max y automatización de recursos por campaña. */
  automation: (): AdsQuery =>
    audq('audit_automation', `SELECT campaign.id, campaign.ai_max_setting.enable_ai_max, campaign.asset_automation_settings FROM campaign WHERE campaign.status = 'ENABLED'`),
  /** [no verificado en v26] Fechas en que Google migró la campaña (recursos automáticos y concordancia amplia). */
  migrations: (): AdsQuery =>
    audq('audit_migrations', `SELECT campaign.id, campaign.aca_migration_date_time, campaign.broad_match_migration_date_time FROM campaign WHERE campaign.status = 'ENABLED'`),
  adTypes: (): AdsQuery =>
    audq(
      'audit_ad_types',
      `SELECT campaign.id, ad_group.id, ad_group.name, ad_group.type, ad_group_ad.ad.type FROM ad_group_ad
       WHERE ad_group_ad.status = 'ENABLED' AND ad_group.status = 'ENABLED' AND campaign.status = 'ENABLED'`
    ),
  /** [no verificado en v26] Recomendaciones que Google aplica solo. */
  recSubscriptions: (): AdsQuery => audq('audit_rec_subscriptions', `SELECT recommendation_subscription.type, recommendation_subscription.status FROM recommendation_subscription`),
  /** [no verificado en v26] Exclusiones a nivel de cuenta (contenido, aplicaciones, ubicaciones). */
  exclusions: (): AdsQuery =>
    audq(
      'audit_exclusions',
      `SELECT customer_negative_criterion.id, customer_negative_criterion.type, customer_negative_criterion.content_label.type,
       customer_negative_criterion.mobile_app_category.mobile_app_category_constant, customer_negative_criterion.placement.url
       FROM customer_negative_criterion`
    ),
  callAssetsCampaign: (): AdsQuery =>
    audq(
      'audit_call_assets_campaign',
      `SELECT campaign.id, asset.id, asset.call_asset.phone_number, asset.call_asset.country_code,
       asset.call_asset.call_conversion_reporting_state, asset.call_asset.ad_schedule_targets, campaign_asset.status
       FROM campaign_asset WHERE campaign_asset.field_type = 'CALL' AND campaign_asset.status = 'ENABLED'`
    ),
  callAssetsCustomer: (): AdsQuery =>
    audq(
      'audit_call_assets_customer',
      `SELECT asset.id, asset.call_asset.phone_number, asset.call_asset.country_code, asset.call_asset.call_conversion_reporting_state,
       asset.call_asset.ad_schedule_targets, customer_asset.status
       FROM customer_asset WHERE customer_asset.field_type = 'CALL' AND customer_asset.status = 'ENABLED'`
    ),
  networks: (from: string, to: string): AdsQuery =>
    audq(
      'audit_networks',
      `SELECT campaign.id, campaign.advertising_channel_type, segments.ad_network_type, metrics.cost_micros, metrics.clicks,
       metrics.conversions FROM campaign WHERE ${between(from, to)} AND metrics.impressions > 0`,
      { from, to }
    ),
  userLocation: (from: string, to: string): AdsQuery =>
    audq(
      'audit_user_location',
      `SELECT campaign.id, user_location_view.country_criterion_id, user_location_view.targeting_location, metrics.cost_micros,
       metrics.clicks, metrics.conversions FROM user_location_view WHERE ${between(from, to)}`,
      { from, to }
    ),
  geoTargets: (): AdsQuery =>
    audq(
      'audit_geo_targets',
      `SELECT campaign.id, campaign_criterion.criterion_id, campaign_criterion.type, campaign_criterion.negative,
       campaign_criterion.location.geo_target_constant, campaign_criterion.proximity.radius,
       campaign_criterion.proximity.radius_units, campaign_criterion.proximity.address.city_name
       FROM campaign_criterion WHERE campaign_criterion.type IN ('LOCATION', 'PROXIMITY') AND campaign.status = 'ENABLED'`
    ),
  geoNames: (ids: string[]): AdsQuery => {
    const clean = [...new Set(ids.filter((x) => /^\d{1,12}$/.test(x)))].slice(0, 200);
    return audq(
      'audit_geo_names',
      `SELECT geo_target_constant.id, geo_target_constant.name, geo_target_constant.canonical_name, geo_target_constant.target_type
       FROM geo_target_constant WHERE geo_target_constant.id IN (${clean.length ? clean.join(', ') : '0'})`,
      { ids: clean.join(',') }
    );
  },
  searchTerms: (from: string, to: string, limit = 1000): AdsQuery =>
    audq(
      'audit_search_terms',
      `SELECT search_term_view.search_term, campaign.id, metrics.cost_micros, metrics.clicks, metrics.conversions
       FROM search_term_view WHERE ${between(from, to)} AND metrics.cost_micros > 0
       ORDER BY metrics.cost_micros DESC LIMIT ${Math.max(1, Math.min(5000, Math.floor(limit)))}`,
      { from, to, limit }
    ),
  recommendations: (): AdsQuery => audq('audit_recommendations', `SELECT recommendation.resource_name, recommendation.type, recommendation.campaign FROM recommendation`),
  optimizationScore: (): AdsQuery => audq('audit_optimization_score', `SELECT customer.id, customer.optimization_score FROM customer`)
};

// --- Traducción -------------------------------------------------------------------------------------------------------

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));
const bool = (v: unknown): boolean | null => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : null);
const metrics = (r: ApiRow) => {
  const m = obj(r.metrics);
  return { cost: fromMicros(m.costMicros) ?? 0, clicks: num(m.clicks) ?? 0, conversions: num(m.conversions) ?? 0 };
};

export type AuditCampaign = {
  nativeId: string;
  name: string | null;
  status: string | null;
  channelType: string | null;
  channelSubtype: string | null;
  targetGoogleSearch: boolean | null;
  targetSearchNetwork: boolean | null;
  targetContentNetwork: boolean | null;
  positiveGeoType: string | null;
  dsaDomain: string | null;
};
export function parseAuditCampaigns(rows: ApiRow[]): AuditCampaign[] {
  return rows
    .map((r) => {
      const c = obj(r.campaign);
      const ns = obj(c.networkSettings);
      const geo = obj(c.geoTargetTypeSetting);
      return {
        nativeId: String(c.id ?? ''),
        name: str(c.name),
        status: str(c.status),
        channelType: str(c.advertisingChannelType),
        channelSubtype: str(c.advertisingChannelSubType),
        targetGoogleSearch: bool(ns.targetGoogleSearch),
        targetSearchNetwork: bool(ns.targetSearchNetwork),
        targetContentNetwork: bool(ns.targetContentNetwork),
        positiveGeoType: str(geo.positiveGeoTargetType),
        dsaDomain: str(obj(c.dynamicSearchAdsSetting).domainName)
      };
    })
    .filter((c) => c.nativeId);
}

export type AutomationRow = { nativeId: string; aiMax: boolean | null; textAutomation: string | null; imageAutomation: string | null };
export function parseAutomation(rows: ApiRow[]): AutomationRow[] {
  return rows
    .map((r) => {
      const c = obj(r.campaign);
      const settings = Array.isArray(c.assetAutomationSettings) ? (c.assetAutomationSettings as unknown[]).map(obj) : [];
      const status = (type: string) => str(settings.find((s) => String(s.assetAutomationType ?? '') === type)?.assetAutomationStatus);
      return { nativeId: String(c.id ?? ''), aiMax: bool(obj(c.aiMaxSetting).enableAiMax), textAutomation: status('TEXT_ASSET_AUTOMATION'), imageAutomation: status('GENERATE_IMAGE_EXTRACTION') ?? status('GENERATE_ENHANCED_YOUTUBE_VIDEOS') };
    })
    .filter((r) => r.nativeId);
}

export type MigrationRow = { nativeId: string; acaMigrationAt: string | null; broadMatchMigrationAt: string | null };
export function parseMigrations(rows: ApiRow[]): MigrationRow[] {
  const day = (v: unknown) => {
    const s = str(v);
    return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
  };
  return rows
    .map((r) => {
      const c = obj(r.campaign);
      return { nativeId: String(c.id ?? ''), acaMigrationAt: day(c.acaMigrationDateTime), broadMatchMigrationAt: day(c.broadMatchMigrationDateTime) };
    })
    .filter((r) => r.nativeId);
}

export type AdTypeRow = { campaignNativeId: string; adGroupNativeId: string; adGroupName: string | null; adGroupType: string | null; adType: string | null };
export function parseAdTypes(rows: ApiRow[]): AdTypeRow[] {
  return rows
    .map((r) => {
      const g = obj(r.adGroup);
      return { campaignNativeId: String(obj(r.campaign).id ?? ''), adGroupNativeId: String(g.id ?? ''), adGroupName: str(g.name), adGroupType: str(g.type), adType: str(obj(obj(r.adGroupAd).ad).type) };
    })
    .filter((r) => r.campaignNativeId && r.adGroupNativeId);
}

export type RecSubscriptionRow = { type: string; status: string | null };
export function parseRecSubscriptions(rows: ApiRow[]): RecSubscriptionRow[] {
  return rows.map((r) => obj(r.recommendationSubscription)).map((s) => ({ type: String(s.type ?? ''), status: str(s.status) })).filter((s) => s.type);
}

export type ExclusionRow = { type: string; value: string | null };
export function parseExclusions(rows: ApiRow[]): ExclusionRow[] {
  return rows
    .map((r) => obj(r.customerNegativeCriterion))
    .map((c) => ({ type: String(c.type ?? ''), value: str(obj(c.contentLabel).type) ?? str(obj(c.mobileAppCategory).mobileAppCategoryConstant) ?? str(obj(c.placement).url) }))
    .filter((c) => c.type);
}

export type CallAssetRow = { level: 'cuenta' | 'campana'; campaignNativeId: string | null; assetId: string; phone: string | null; country: string | null; reporting: string | null; hasSchedule: boolean };
export function parseCallAssets(campaignRows: ApiRow[], customerRows: ApiRow[]): CallAssetRow[] {
  const one = (r: ApiRow, level: 'cuenta' | 'campana'): CallAssetRow => {
    const a = obj(r.asset);
    const call = obj(a.callAsset);
    return {
      level,
      campaignNativeId: level === 'campana' ? String(obj(r.campaign).id ?? '') || null : null,
      assetId: String(a.id ?? ''),
      phone: str(call.phoneNumber),
      country: str(call.countryCode),
      reporting: str(call.callConversionReportingState),
      hasSchedule: Array.isArray(call.adScheduleTargets) && (call.adScheduleTargets as unknown[]).length > 0
    };
  };
  return [...campaignRows.map((r) => one(r, 'campana')), ...customerRows.map((r) => one(r, 'cuenta'))].filter((a) => a.assetId);
}

export type NetworkRow = { campaignNativeId: string; channelType: string | null; network: string; cost: number; clicks: number; conversions: number };
/** Una fila por campaña y red (suma los días). */
export function parseNetworks(rows: ApiRow[]): NetworkRow[] {
  const by = new Map<string, NetworkRow>();
  for (const r of rows) {
    const c = obj(r.campaign);
    const id = String(c.id ?? '');
    const network = String(obj(r.segments).adNetworkType ?? '');
    if (!id || !network) continue;
    const k = `${id}|${network}`;
    const cur = by.get(k) ?? by.set(k, { campaignNativeId: id, channelType: str(c.advertisingChannelType), network, cost: 0, clicks: 0, conversions: 0 }).get(k)!;
    const m = metrics(r);
    cur.cost += m.cost;
    cur.clicks += m.clicks;
    cur.conversions += m.conversions;
  }
  return [...by.values()];
}

export type UserLocationRow = { campaignNativeId: string | null; countryId: string | null; targeting: boolean | null; cost: number; clicks: number; conversions: number };
export function parseUserLocation(rows: ApiRow[]): UserLocationRow[] {
  return rows.map((r) => {
    const u = obj(r.userLocationView);
    return { campaignNativeId: str(obj(r.campaign).id), countryId: str(u.countryCriterionId), targeting: bool(u.targetingLocation), ...metrics(r) };
  });
}

export type GeoTargetRow = { campaignNativeId: string; type: string; negative: boolean; geoId: string | null; radius: number | null; units: string | null; city: string | null };
export function parseGeoTargets(rows: ApiRow[]): GeoTargetRow[] {
  return rows
    .map((r) => {
      const cc = obj(r.campaignCriterion);
      const prox = obj(cc.proximity);
      return {
        campaignNativeId: String(obj(r.campaign).id ?? ''),
        type: String(cc.type ?? ''),
        negative: bool(cc.negative) === true,
        geoId: idFromResource(str(obj(cc.location).geoTargetConstant)),
        radius: num(prox.radius),
        units: str(prox.radiusUnits),
        city: str(obj(prox.address).cityName)
      };
    })
    .filter((g) => g.campaignNativeId && g.type);
}

export type GeoNameRow = { id: string; name: string | null; canonicalName: string | null; targetType: string | null };
export function parseGeoNames(rows: ApiRow[]): GeoNameRow[] {
  return rows
    .map((r) => obj(r.geoTargetConstant))
    .map((g) => ({ id: String(g.id ?? ''), name: str(g.name), canonicalName: str(g.canonicalName), targetType: str(g.targetType) }))
    .filter((g) => g.id);
}

export type SearchTermRow = { term: string; campaignNativeId: string; cost: number; clicks: number; conversions: number };
export function parseSearchTerms(rows: ApiRow[]): SearchTermRow[] {
  return rows
    .map((r) => ({ term: String(obj(r.searchTermView).searchTerm ?? '').slice(0, 200), campaignNativeId: String(obj(r.campaign).id ?? ''), ...metrics(r) }))
    .filter((t) => t.term && t.campaignNativeId);
}

export type RecommendationRow = { type: string; campaignNativeId: string | null };
export function parseRecommendations(rows: ApiRow[]): RecommendationRow[] {
  return rows
    .map((r) => obj(r.recommendation))
    .map((x) => ({ type: String(x.type ?? ''), campaignNativeId: idFromResource(str(x.campaign)) }))
    .filter((x) => x.type);
}

export function parseOptimizationScore(rows: ApiRow[]): number | null {
  return num(obj(rows[0]?.customer).optimizationScore);
}
