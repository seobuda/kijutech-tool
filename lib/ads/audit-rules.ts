// Módulo Google Ads · reglas puras de la auditoría de higiene (paso 3; diseño §13). Sin base de datos ni red: pruebas en
// tests/ads-auditoria.test.ts.
//
// Cada control recibe la foto de UNA cuenta (lo del paso 1 más los datos de la auditoría y la ficha del cliente) y
// devuelve «bien», «mal» o «no comprobado» con su evidencia, qué hacer (a mano en Google Ads: la herramienta no escribe
// nada), el gasto expuesto en la moneda de la cuenta y, si la acción es R2 o R3, su predicción previa (APR-01). Un control
// que depende de un dato de la ficha sin confirmar o viejo (NEG-07) no afirma «mal» a secas: queda «mal · confirmar con
// el responsable». Un grupo de datos que no se pudo leer deja sus controles en «no comprobado» con el error.
import { addDays } from '@/lib/ads/rules';
import { CITIES, NATIONAL_WORDS, PROVINCES } from '@/lib/ads/places-es';
import { AUDIT_CONTROLS, CONTROL_INFO, FICHA_FACT_LABEL, type AuditControl, type AuditResponse, type AuditStatus, type FichaFact, type Risk } from '@/lib/ads/audit-labels';
import type { AdTypeRow, AuditCampaign, AutomationRow, CallAssetRow, ExclusionRow, GeoNameRow, GeoTargetRow, MigrationRow, NetworkRow, RecommendationRow, RecSubscriptionRow, SearchTermRow, UserLocationRow } from '@/lib/ads/audit-queries';
import type { Thresholds } from '@/lib/ads/thresholds';

export { AUDIT_CONTROLS, CONTROL_INFO, type AuditControl, type AuditStatus, type FichaFact };

// --- Datos de la auditoría --------------------------------------------------------------------------------------------

/** Grupos de datos que se piden aparte (diseño §13.3), su refresco en días y si dependen de un periodo. */
export const AUDIT_DATA_KINDS = {
  campanas: { refreshDays: 1 },
  automatizacion: { refreshDays: 1 },
  migraciones: { refreshDays: 1 },
  tipos_anuncio: { refreshDays: 1 },
  suscripciones: { refreshDays: 1 },
  exclusiones: { refreshDays: 1 },
  llamadas: { refreshDays: 1 },
  redes: { refreshDays: 7 },
  ubicacion_usuario: { refreshDays: 7 },
  objetivos_geo: { refreshDays: 7 },
  terminos: { refreshDays: 7 },
  recomendaciones: { refreshDays: 7 }
} as const;
export type AuditDataKind = keyof typeof AUDIT_DATA_KINDS;

export type AuditData = {
  campanas: AuditCampaign[];
  automatizacion: AutomationRow[];
  migraciones: MigrationRow[];
  tipos_anuncio: AdTypeRow[];
  suscripciones: RecSubscriptionRow[];
  exclusiones: ExclusionRow[];
  llamadas: CallAssetRow[];
  redes: NetworkRow[];
  ubicacion_usuario: UserLocationRow[];
  objetivos_geo: { targets: GeoTargetRow[]; names: GeoNameRow[] };
  terminos: SearchTermRow[];
  recomendaciones: { list: RecommendationRow[]; score: number | null };
};
export type DataSlot<K extends AuditDataKind> = { ok: boolean; error: string | null; syncedAt: Date | null; from: string | null; to: string | null; rows: AuditData[K] | null };

/** ¿Toca volver a pedir este grupo? */
export function dataDue(kind: AuditDataKind, last: { ok: boolean; syncedAt: Date | null } | null, now: Date): boolean {
  if (!last?.syncedAt || !last.ok) return true;
  return now.getTime() - last.syncedAt.getTime() >= AUDIT_DATA_KINDS[kind].refreshDays * 86_400_000 - 30 * 60_000;
}

// --- Ficha del cliente ------------------------------------------------------------------------------------------------

export type Ficha = {
  source: 'ficha' | 'simulada';
  clientName: string;
  brands: string[];
  competitors: string[];
  zoneText: string;
  phones: string[];
  hours: string | null;
  sector: string | null;
  local: boolean;
  services: string | null;
  confirmed: Partial<Record<FichaFact, Date | null>>;
};

const REGULATED = /(sanid|salud|cl[ií]nic|dental|dentist|m[eé]dic|est[eé]tic|fisio|psic|farmac|abogad|legal|jur[ií]dic|despacho|financ|cr[eé]dit|pr[eé]stam|seguro|inversi|cerrajer)/i;
/** Sector regulado (12.3, ANU-06): sanidad, abogados, financiero, cerrajería. */
export function regulatedSector(sector: string | null | undefined): boolean {
  return Boolean(sector && REGULATED.test(sector));
}

/** ¿Está confirmado este dato de la ficha hace menos de `months` meses? (NEG-07) */
export function factFresh(ficha: Ficha, fact: FichaFact, now: Date, months: number): boolean {
  const at = ficha.confirmed[fact];
  return Boolean(at && now.getTime() - at.getTime() <= months * 30.44 * 86_400_000);
}

// --- Texto: normalizar y buscar frases --------------------------------------------------------------------------------

export function norm(s: string | null | undefined): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}
export function hasPhrase(text: string, phrase: string): boolean {
  const p = norm(phrase);
  return p.length > 0 && ` ${norm(text)} `.includes(` ${p} `);
}
const digits = (s: string | null | undefined) => String(s ?? '').replace(/\D/g, '');
/** Mismo teléfono: compara los 9 últimos dígitos (sin prefijo de país). */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = digits(a).slice(-9);
  const y = digits(b).slice(-9);
  return x.length >= 9 && x === y;
}

// --- Lugares (TER-04) ---------------------------------------------------------------------------------------------------

type PlaceEntry = { name: string; province: string; key: string };
const PLACE_INDEX: PlaceEntry[] = (() => {
  const out: PlaceEntry[] = [];
  for (const names of PROVINCES) for (const n of names) out.push({ name: n, province: names[0], key: norm(n) });
  for (const c of CITIES) out.push({ name: c.name, province: c.province, key: norm(c.name) });
  // Los más largos primero: «San Sebastián de los Reyes» antes que «San Sebastián».
  return out.filter((p) => p.key.length >= 4).sort((a, b) => b.key.length - a.key.length);
})();
const provinceNames = (province: string) => PROVINCES.find((p) => p[0] === province) ?? [province];

/** Lugares que nombra un texto (sin repetir; quitado lo ya encontrado para no contar «san sebastián» dos veces). */
export function placesIn(text: string): PlaceEntry[] {
  let t = ` ${norm(text)} `;
  const found: PlaceEntry[] = [];
  for (const p of PLACE_INDEX) {
    if (t.includes(` ${p.key} `)) {
      found.push(p);
      t = t.split(` ${p.key} `).join('  ');
    }
  }
  return found;
}

/** ¿La zona de la ficha atiende ese lugar? (el lugar o su provincia aparecen en la zona). */
export function zoneServes(zoneText: string, place: { name: string; province: string }): boolean {
  if (hasPhrase(zoneText, place.name)) return true;
  return provinceNames(place.province).some((n) => hasPhrase(zoneText, n));
}
export function nationalZone(zoneText: string): boolean {
  return NATIONAL_WORDS.some((w) => hasPhrase(zoneText, w));
}

// --- Foto de la cuenta para la auditoría ----------------------------------------------------------------------------

export type AuditInput = {
  accountId: string;
  name: string;
  currency: string | null;
  today: string;
  now: Date;
  autoTagging: boolean | null;
  campaigns: { nativeId: string; name: string | null; status: string | null; channelType: string | null }[];
  /** Filas diarias por campaña (sin fila = 0 solo en días de `covered`). */
  daily: { campaignNativeId: string; day: string; cost: number; clicks: number; conversions: number }[];
  covered: Set<string>;
  actions: { resourceName: string; name: string | null; category: string | null; primaryForGoal: boolean | null; includeInConversions: boolean | null; status: string | null }[];
  conversions: { conversionAction: string; day: string; conversionsByConvDate: number }[];
  landing: { url: string; urlNormalized: string; origins: string[]; cost7d: number; campaignNativeIds: string[] }[];
  changes: { changeAt: Date; userEmail: string | null; actorClass: string; clientType: string | null; resourceType: string | null; campaignNativeId: string | null; changedFields: string[] }[];
  data: { [K in AuditDataKind]?: DataSlot<K> };
  ficha: Ficha | null;
  t: Thresholds;
};

export type Prediction = { hipotesis: string; metrica: string; esperado: string; ventanaDias: number; vueltaAtras: string };
export type AuditResult = {
  control: AuditControl;
  status: AuditStatus;
  needsConfirmation: boolean;
  title: string;
  lines: string[];
  todo: string[];
  exposure: number | null;
  prediction: Prediction | null;
  campaignNativeIds: string[];
  reason: string | null;
  data: Record<string, unknown>;
};

const round2 = (v: number) => Math.round(v * 100) / 100;
export function money(v: number, currency: string | null): string {
  return `${round2(v).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency ?? 'EUR'}`;
}
const pct = (v: number) => `${Math.round(v * 100)} %`;

function result(control: AuditControl, status: AuditStatus, title: string, extra: Partial<AuditResult> = {}): AuditResult {
  return { control, status, needsConfirmation: false, title, lines: [], todo: [], exposure: null, prediction: null, campaignNativeIds: [], reason: null, data: {}, ...extra };
}
const unchecked = (control: AuditControl, reason: string, lines: string[] = []): AuditResult => result(control, 'no_comprobado', `${CONTROL_INFO[control].label}: sin comprobar`, { reason, lines });

/** Datos necesarios: si falta alguno (o no se pudo leer), el control no afirma nada. */
function need<K extends AuditDataKind>(a: AuditInput, control: AuditControl, kind: K): { ok: true; rows: AuditData[K] } | { ok: false; res: AuditResult } {
  const slot = a.data[kind] as DataSlot<K> | undefined;
  if (!slot || slot.rows === null) return { ok: false, res: unchecked(control, `aún no se han descargado los datos de «${kind}»`) };
  if (!slot.ok) return { ok: false, res: unchecked(control, `Google no devolvió «${kind}»: ${(slot.error ?? 'sin detalle').slice(0, 200)}`) };
  return { ok: true, rows: slot.rows };
}

/** NEG-07: un «mal» que depende de datos de la ficha sin confirmar o viejos baja a «confirmar con el responsable». */
function withFicha(r: AuditResult, facts: FichaFact[], a: AuditInput): AuditResult {
  if (!a.ficha || r.status !== 'mal' || !facts.length) return r;
  const stale = facts.filter((f) => !factFresh(a.ficha!, f, a.now, a.t.fichaMesesFrescura));
  if (!stale.length) return r;
  const desc = stale.map((f) => {
    const at = a.ficha!.confirmed[f];
    return `«${FICHA_FACT_LABEL[f]}» ${at ? `confirmado el ${at.toISOString().slice(0, 10)}` : 'sin confirmar'}`;
  });
  return { ...r, needsConfirmation: true, lines: [...r.lines, `Depende de datos de la ficha que no están al día (${desc.join('; ')}): confirmar con el responsable antes de actuar.`] };
}

function costByCampaign(a: AuditInput, days: number): Map<string, { cost: number; clicks: number; conversions: number }> {
  const from = addDays(a.today, -days);
  const to = addDays(a.today, -1);
  const out = new Map<string, { cost: number; clicks: number; conversions: number }>();
  for (const d of a.daily) {
    if (d.day < from || d.day > to) continue;
    const c = out.get(d.campaignNativeId) ?? out.set(d.campaignNativeId, { cost: 0, clicks: 0, conversions: 0 }).get(d.campaignNativeId)!;
    c.cost += d.cost;
    c.clicks += d.clicks;
    c.conversions += d.conversions;
  }
  return out;
}
const cname = (a: AuditInput, id: string | null) => {
  const c = a.campaigns.find((x) => x.nativeId === id);
  return c?.name ? `«${c.name}»` : id ? `la campaña ${id}` : 'la cuenta';
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// --- Tanda 0 ----------------------------------------------------------------------------------------------------------

export function ctlOwnership(a: AuditInput): AuditResult {
  const since = new Date(a.now.getTime() - 30 * 86_400_000);
  const recent = a.changes.filter((c) => c.changeAt >= since);
  const foreign = [...new Set(recent.filter((c) => c.actorClass === 'cliente' && c.userEmail).map((c) => c.userEmail!.toLowerCase()))];
  const tools = recent.filter((c) => c.actorClass === 'herramienta').length;
  return result('propiedad_accesos', 'no_comprobado', 'Propiedad y accesos: comprobar a mano', {
    reason: 'La API de Google Ads no da la propiedad de la cuenta, del perfil de pagos, de GA4, de Tag Manager ni de la ficha (9.2).',
    lines: [
      ...(foreign.length ? [`Usuarios ajenos a la agencia que cambiaron algo en 30 días: ${foreign.slice(0, 6).join(', ')}.`] : ['Nadie ajeno a la agencia cambió nada en 30 días.']),
      ...(tools ? [`${plural(tools, 'cambio hecho', 'cambios hechos')} por scripts o herramientas: ¿son del gestor anterior?`] : [])
    ],
    todo: [
      '¿De quién es la cuenta y el perfil de pagos (tarjeta o factura)? Debe ser del cliente.',
      '¿Quién es dueño de GA4, Tag Manager y la ficha de Google Business Profile?',
      'Google Ads → Administrador → Acceso y seguridad: quitar usuarios y gestores anteriores que ya no deben estar.',
      'Herramientas → Acciones en bloque → Reglas y Scripts: apagar las reglas y scripts del gestor anterior.',
      'Herramientas → Cuentas vinculadas: revisar lo que sigue conectado.'
    ],
    data: { foreign, tools }
  });
}

export function ctlBaseline(a: AuditInput): AuditResult {
  const from = addDays(a.today, -90);
  const to = addDays(a.today, -1);
  let days = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (a.covered.has(d)) days++;
  if (days < a.t.auditLineaBaseMinDias) return unchecked('linea_base', `solo ${days} de 90 días completos (hacen falta ${a.t.auditLineaBaseMinDias}); se congela cuando el histórico esté descargado`);
  let cost = 0;
  let clicks = 0;
  let conversions = 0;
  for (const d of a.daily) {
    if (d.day < from || d.day > to || !a.covered.has(d.day)) continue;
    cost += d.cost;
    clicks += d.clicks;
    conversions += d.conversions;
  }
  const cpl = conversions > 0 ? round2(cost / conversions) : null;
  return result('linea_base', 'bien', 'Línea base de 90 días congelada', {
    lines: [`Del ${from} al ${to} (${days} días completos): gasto ${money(cost, a.currency)}, ${Math.round(clicks)} clics, ${round2(conversions)} conversiones${cpl !== null ? `, CPL ${money(cpl, a.currency)}` : ''}.`, 'Queda congelada con la auditoría: es la referencia para medir lo que se cambie a partir de hoy.'],
    data: { from, to, days, cost: round2(cost), clicks, conversions: round2(conversions), cpl }
  });
}

// --- Tanda 1 ----------------------------------------------------------------------------------------------------------

const WEAK_CATEGORIES = new Set(['PAGE_VIEW', 'ENGAGEMENT', 'DOWNLOAD', 'ADD_TO_CART', 'BEGIN_CHECKOUT', 'STORE_VISIT', 'OUTBOUND_CLICK', 'DEFAULT']);

export function ctlConversions(a: AuditInput): AuditResult {
  const primary = a.actions.filter((x) => x.status === 'ENABLED' && x.primaryForGoal && x.includeInConversions !== false);
  const weak = primary.filter((x) => x.category && WEAK_CATEGORIES.has(x.category));
  const problems: string[] = [];
  const todo: string[] = [];
  if (a.autoTagging === false) {
    problems.push('Autoetiquetado apagado: sin el identificador de clic no se pueden cruzar los leads con los clics ni subir conversiones.');
    todo.push('Google Ads → Administrador → Configuración de la cuenta → Etiquetado automático: activarlo.');
  }
  if (!primary.length) {
    problems.push('Ninguna acción de conversión principal: la puja no sabe qué es un lead.');
    todo.push('Objetivos → Conversiones: marcar como principal la acción del lead (formulario, llamada).');
  }
  if (weak.length) {
    problems.push(`Acciones principales que no son un lead: ${weak.map((w) => `«${w.name ?? w.resourceName}» (${w.category})`).join(', ')}.`);
    todo.push(`Objetivos → Conversiones: pasar a secundaria ${weak.map((w) => `«${w.name ?? w.resourceName}»`).join(', ')}.`);
  }
  if (!problems.length) return result('conversiones', 'bien', 'Conversiones de entrada en orden', { lines: [`Autoetiquetado ${a.autoTagging === null ? 'sin dato' : 'activo'}; ${plural(primary.length, 'acción principal', 'acciones principales')}: ${primary.map((p) => p.name ?? p.resourceName).slice(0, 4).join(', ')}.`] });
  const from = addDays(a.today, -30);
  const weakConv = round2(a.conversions.filter((c) => c.day >= from && weak.some((w) => w.resourceName === c.conversionAction)).reduce((s, c) => s + c.conversionsByConvDate, 0));
  return result('conversiones', 'mal', 'La medición de entrada tiene huecos', {
    lines: problems,
    todo,
    prediction: {
      hipotesis: weak.length ? 'Al dejar de contar como conversión lo que no es un lead, la puja deja de perseguir esas acciones y las conversiones de la plataforma se parecen a los leads reales.' : 'Con el autoetiquetado y una acción principal correcta, la puja y el informe miden leads de verdad.',
      metrica: 'Conversiones principales y leads del cliente',
      esperado: weak.length ? `Conversiones de la plataforma −${weakConv} en 30 días (las de esas acciones); leads reales sin cambio (±10 %)` : 'Leads reales sin cambio (±10 %); conversiones de la plataforma más cerca de los leads',
      ventanaDias: 28,
      vueltaAtras: 'Si los leads reales caen más de un 20 % en 28 días sin otra causa, volver a la configuración anterior y revisar con Enric (R3).'
    },
    data: { autoTagging: a.autoTagging, primary: primary.length, weak: weak.map((w) => w.resourceName), weakConv }
  });
}

export function ctlFeb2027(a: AuditInput): AuditResult {
  const types = need(a, 'caduca_feb_2027', 'tipos_anuncio');
  if (!types.ok) return types.res;
  const camps = need(a, 'caduca_feb_2027', 'campanas');
  if (!camps.ok) return camps.res;
  const dsa = [...new Map(types.rows.filter((r) => r.adGroupType === 'SEARCH_DYNAMIC_ADS').map((r) => [r.adGroupNativeId, r])).values()];
  const callOnly = types.rows.filter((r) => r.adType === 'CALL_AD');
  const displayInSearch = camps.rows.filter((c) => c.channelType === 'SEARCH' && c.targetContentNetwork === true);
  const lines: string[] = [];
  const todo: string[] = [];
  if (dsa.length) {
    lines.push(`${plural(dsa.length, 'grupo de anuncios dinámicos (DSA)', 'grupos de anuncios dinámicos (DSA)')} en ${[...new Set(dsa.map((d) => cname(a, d.campaignNativeId)))].join(', ')}: en febrero de 2027 Google los pasa solo a AI Max.`);
    todo.push('Decidir antes de febrero: migrarlos a mano a AI Max con sus exclusiones y guías de texto, o pausarlos.');
  }
  if (callOnly.length) {
    lines.push(`${plural(callOnly.length, 'anuncio solo de llamada', 'anuncios solo de llamada')} (${[...new Set(callOnly.map((c) => cname(a, c.campaignNativeId)))].join(', ')}): dejan de servir en febrero de 2027.`);
    todo.push('Sustituirlos por anuncios de búsqueda adaptables con recurso de llamada.');
  }
  if (displayInSearch.length) {
    lines.push(`Búsqueda con expansión a Display (${displayInSearch.map((c) => `«${c.name ?? c.nativeId}»`).join(', ')}): en febrero de 2027 desaparece el reparto fijo y Google decide cuánto va a Display.`);
    todo.push('Ver el control «Display dentro de Búsqueda»: lo normal es quitarla antes.');
  }
  if (!lines.length) return result('caduca_feb_2027', 'bien', 'Nada que caduque en febrero de 2027', { lines: ['Sin grupos DSA, sin anuncios solo de llamada y sin expansión a Display en Búsqueda.'] });
  const ids = [...new Set([...dsa.map((d) => d.campaignNativeId), ...callOnly.map((c) => c.campaignNativeId), ...displayInSearch.map((c) => c.nativeId)])];
  const cost = costByCampaign(a, 30);
  const exposure = round2(ids.reduce((s, id) => s + (cost.get(id)?.cost ?? 0), 0));
  return result('caduca_feb_2027', 'mal', 'Hay piezas que Google cambia o apaga en febrero de 2027', {
    lines,
    todo,
    exposure,
    campaignNativeIds: ids,
    prediction: {
      hipotesis: 'Cambiarlo a mano antes de febrero evita que Google mueva el volumen de golpe sin que nadie lo vigile.',
      metrica: 'Conversiones y CPL de las campañas afectadas',
      esperado: 'Sin cambio (±15 %) en 28 días tras el cambio manual',
      ventanaDias: 28,
      vueltaAtras: 'Si las conversiones de esas campañas caen más de un 25 % en 28 días, volver a la versión anterior mientras se pueda y repetir con otra estructura.'
    },
    data: { dsa: dsa.length, callOnly: callOnly.length, displayInSearch: displayInSearch.length, exposure }
  });
}

/** CPL de una ventana de días alrededor de una fecha (antes: los 28 previos; después: hasta ayer, como mucho 28). */
/** P(X <= k) con X ~ Poisson(mu). */
export function poissonCdf(k: number, mu: number): number {
  if (mu <= 0) return 1;
  let term = Math.exp(-mu);
  let sum = term;
  for (let i = 1; i <= Math.floor(k); i++) {
    term *= mu / i;
    sum += term;
  }
  return Math.min(1, sum);
}

/**
 * CPL de los 28 días antes de una fecha y de los días después (hasta ayer, como mucho 28), y si el después es peor de
 * verdad: CPL > factor × el de antes Y tan pocas conversiones para lo gastado que con el CPL de antes sería raro
 * (Poisson, p < 5 %). Con pocas conversiones el CPL baila mucho: sin la segunda condición, falsas alarmas.
 */
export function cplAround(a: Pick<AuditInput, 'daily' | 'today'>, campaignNativeId: string, day: string, factor: number): { before: number | null; after: number | null; afterDays: number; worse: boolean } {
  const sum = (from: string, to: string) => {
    let cost = 0;
    let conv = 0;
    for (const d of a.daily) if (d.campaignNativeId === campaignNativeId && d.day >= from && d.day <= to) {
      cost += d.cost;
      conv += d.conversions;
    }
    return { cost, conv, cpl: conv > 0 ? round2(cost / conv) : null };
  };
  const afterTo = addDays(day, 27) < addDays(a.today, -1) ? addDays(day, 27) : addDays(a.today, -1);
  const afterDays = Math.max(0, Math.round((Date.parse(`${afterTo}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000) + 1);
  const b = sum(addDays(day, -28), addDays(day, -1));
  const af = afterDays > 0 ? sum(day, afterTo) : { cost: 0, conv: 0, cpl: null };
  const expected = b.cpl ? af.cost / b.cpl : 0;
  const worse = afterDays >= 14 && b.cpl !== null && b.conv >= 5 && expected > 0 && (af.cpl === null || af.cpl > b.cpl * factor) && poissonCdf(af.conv, expected) < 0.05;
  return { before: b.cpl, after: af.cpl, afterDays, worse };
}

export function ctlAiMax(a: AuditInput): AuditResult {
  const auto = need(a, 'ai_max', 'automatizacion');
  if (!auto.ok) return auto.res;
  const mig = a.data.migraciones;
  const migRows = mig?.ok ? (mig.rows ?? []) : [];
  const byId = new Map(migRows.map((m) => [m.nativeId, m]));
  const affected = new Set([...auto.rows.filter((r) => r.aiMax === true).map((r) => r.nativeId), ...migRows.filter((m) => m.acaMigrationAt || m.broadMatchMigrationAt).map((m) => m.nativeId)]);
  const migNote = mig && !mig.ok ? [`Las fechas de migración no se pudieron leer (${(mig.error ?? 'sin detalle').slice(0, 120)}): se mira solo si AI Max está activo.`] : [];
  if (!affected.size) return result('ai_max', 'bien', 'Ninguna campaña con AI Max ni migrada por Google', { lines: migNote });
  const regulated = a.ficha ? regulatedSector(a.ficha.sector) : null;
  const lines: string[] = [];
  const worse: string[] = [];
  const young: string[] = [];
  for (const id of affected) {
    const m = byId.get(id);
    const day = m?.acaMigrationAt ?? m?.broadMatchMigrationAt ?? null;
    if (day) {
      const cpl = cplAround(a, id, day, a.t.auditAiMaxFactorCpl);
      const bad = cpl.worse;
      if (bad) worse.push(id);
      if (cpl.afterDays < 14) young.push(id);
      lines.push(`${cname(a, id)}: Google la migró el ${day}. CPL de los 28 días antes ${cpl.before === null ? 'sin conversiones' : money(cpl.before, a.currency)}; después (${cpl.afterDays} días) ${cpl.after === null ? 'sin conversiones' : money(cpl.after, a.currency)}${bad ? ' — peor' : ''}.`);
    } else lines.push(`${cname(a, id)}: AI Max activo (sin fecha de migración: lo encendió alguien o no se pudo leer).`);
  }
  if (regulated === null) lines.push('Sin ficha: no se sabe si el sector es regulado.');
  lines.push('Los términos que AI Max añade (marca a genérico, genérico a competidor) se revisan en el lote de términos (paso 4).', ...migNote);
  const isBad = worse.length > 0 || regulated === true;
  // Migración de menos de 14 días: aún no hay ventana para juzgarla (si no, al cumplirlos saldría un falso «reapareció»).
  if (!isBad && young.length) return unchecked('ai_max', `migrada hace menos de 14 días (${young.map((id) => cname(a, id)).join(', ')}): aún no hay ventana para comparar el CPL`, lines);
  if (!isBad) return result('ai_max', 'bien', `${plural(affected.size, 'campaña', 'campañas')} con AI Max sin señal de empeorar`, { lines, campaignNativeIds: [...affected] });
  if (regulated) lines.unshift('Sector regulado: AI Max genera textos y términos que nadie revisa antes de salir (12.3).');
  const cost = costByCampaign(a, 30);
  const ids = worse.length ? worse : [...affected];
  const exposure = round2(ids.reduce((s, id) => s + (cost.get(id)?.cost ?? 0), 0));
  return withFicha(
    result('ai_max', 'mal', worse.length ? 'Google migró campañas a AI Max y el CPL empeoró' : 'AI Max activo en un sector regulado', {
      lines,
      todo: ['Campaña → Configuración → AI Max: desactivar por grupo de anuncios o añadir exclusiones de marca, de URL y guías de texto.', ...(regulated ? ['En sector regulado, textos automáticos apagados por defecto (control «Textos automáticos»).'] : [])],
      exposure,
      campaignNativeIds: ids,
      prediction: {
        hipotesis: 'Limitar AI Max (exclusiones o desactivarlo por grupo) devuelve el CPL a su nivel anterior a la migración.',
        metrica: 'CPL de las campañas afectadas',
        esperado: `CPL −10 % a −30 % en 28 días; conversiones entre −15 % y 0`,
        ventanaDias: 28,
        vueltaAtras: 'Si las conversiones caen más de un 20 % sin bajar el CPL, volver a activarlo y probar solo con exclusiones.'
      },
      data: { affected: [...affected], worse, regulated, exposure }
    }),
    regulated ? ['sector'] : [], a
  );
}

export function ctlTextAutomation(a: AuditInput): AuditResult {
  const auto = need(a, 'textos_automaticos', 'automatizacion');
  if (!auto.ok) return auto.res;
  const on = auto.rows.filter((r) => r.textAutomation === 'OPTED_IN' || r.imageAutomation === 'OPTED_IN');
  if (!on.length) return result('textos_automaticos', 'bien', 'Textos e imágenes automáticos apagados', {});
  const names = on.map((r) => cname(a, r.nativeId)).join(', ');
  if (!a.ficha) return unchecked('textos_automaticos', 'la cuenta no tiene ficha: no se sabe si el sector es regulado', [`Activos en ${names}.`]);
  if (!regulatedSector(a.ficha.sector)) return result('textos_automaticos', 'bien', 'Textos automáticos activos en un sector no regulado', { lines: [`Activos en ${names}. Revisar las guías de texto y las exclusiones de términos de vez en cuando.`], campaignNativeIds: on.map((r) => r.nativeId) });
  return withFicha(
    result('textos_automaticos', 'mal', 'Textos automáticos activos en un sector regulado', {
      lines: [`Sector «${a.ficha.sector}»: Google puede escribir promesas que la ley o su política no permiten (ANU-06). Activos en ${names}.`],
      todo: ['Campaña → Configuración → Recursos automáticos (textos e imágenes): desactivar.'],
      campaignNativeIds: on.map((r) => r.nativeId),
      data: { campaigns: on.map((r) => r.nativeId) }
    }),
    ['sector'], a
  );
}

// --- Tanda 2 ----------------------------------------------------------------------------------------------------------

const DISPLAY_VIDEO = new Set(['CONTENT', 'YOUTUBE', 'YOUTUBE_SEARCH', 'YOUTUBE_WATCH', 'GOOGLE_TV']);

function networkOf(rows: NetworkRow[], id: string) {
  const pick = (f: (n: string) => boolean) => rows.filter((r) => r.campaignNativeId === id && f(r.network)).reduce((s, r) => ({ cost: s.cost + r.cost, clicks: s.clicks + r.clicks, conversions: s.conversions + r.conversions }), { cost: 0, clicks: 0, conversions: 0 });
  return { search: pick((n) => n === 'SEARCH'), partners: pick((n) => n === 'SEARCH_PARTNERS'), display: pick((n) => DISPLAY_VIDEO.has(n)), all: pick(() => true), mixed: pick((n) => n === 'MIXED') };
}
const cplOf = (x: { cost: number; conversions: number }) => (x.conversions > 0 ? x.cost / x.conversions : null);

export function ctlSearchPartners(a: AuditInput): AuditResult {
  const camps = need(a, 'socios_busqueda', 'campanas');
  if (!camps.ok) return camps.res;
  const on = camps.rows.filter((c) => c.channelType === 'SEARCH' && c.targetSearchNetwork === true);
  if (!on.length) return result('socios_busqueda', 'bien', 'Socios de búsqueda apagados', {});
  const net = need(a, 'socios_busqueda', 'redes');
  if (!net.ok) return { ...net.res, lines: [`Activos en ${on.map((c) => `«${c.name ?? c.nativeId}»`).join(', ')}; sin el reparto por redes no se sabe si se justifican.`] };
  const lines: string[] = [];
  const bad: { id: string; cost: number; conv: number }[] = [];
  for (const c of on) {
    const n = networkOf(net.rows, c.nativeId);
    const p = n.partners;
    const s = n.search;
    const ok = p.conversions >= a.t.auditSociosMinConv && cplOf(p) !== null && (cplOf(s) === null || cplOf(p)! <= cplOf(s)! * a.t.auditSociosFactorCpl);
    lines.push(`«${c.name ?? c.nativeId}»: socios ${money(p.cost, a.currency)} y ${round2(p.conversions)} conversiones (CPL ${cplOf(p) === null ? '—' : money(cplOf(p)!, a.currency)}); Google ${money(s.cost, a.currency)} y ${round2(s.conversions)} (CPL ${cplOf(s) === null ? '—' : money(cplOf(s)!, a.currency)}).${ok ? ' Se justifican.' : ''}`);
    if (!ok) bad.push({ id: c.nativeId, cost: p.cost, conv: p.conversions });
  }
  if (!bad.length) return result('socios_busqueda', 'bien', 'Socios de búsqueda activos y avalados por sus datos', { lines });
  const exposure = round2(bad.reduce((s, b) => s + b.cost, 0));
  const lost = round2(bad.reduce((s, b) => s + b.conv, 0));
  return result('socios_busqueda', 'mal', `Socios de búsqueda activos sin datos que los avalen (${money(exposure, a.currency)} en 30 días)`, {
    lines,
    todo: bad.map((b) => `${cname(a, b.id)} → Configuración → Redes: desmarcar «Socios de búsqueda de Google». De una campaña en una, respetando «manos quietas» (mueve volumen).`),
    exposure,
    campaignNativeIds: bad.map((b) => b.id),
    prediction: {
      hipotesis: 'Los socios gastan sin traer leads al precio de Google; sin ellos el presupuesto va a la búsqueda de Google.',
      metrica: 'CPL de la campaña',
      esperado: `Gasto en socios −${money(exposure, a.currency)} al mes (parte vuelve a Google); conversiones entre −${lost} y 0; CPL entre −5 % y −20 %`,
      ventanaDias: 28,
      vueltaAtras: `Si en 28 días la campaña pierde más de ${Math.max(1, Math.ceil(lost)) + 1} conversiones y el CPL no baja, volver a activar los socios.`
    },
    data: { campaigns: bad.map((b) => b.id), exposure, lost }
  });
}

export function ctlDisplayInSearch(a: AuditInput): AuditResult {
  const camps = need(a, 'display_en_busqueda', 'campanas');
  if (!camps.ok) return camps.res;
  const on = camps.rows.filter((c) => c.channelType === 'SEARCH' && c.targetContentNetwork === true);
  if (!on.length) return result('display_en_busqueda', 'bien', 'Ninguna campaña de búsqueda sale en Display', {});
  const net = a.data.redes?.ok ? (a.data.redes.rows ?? []) : null;
  const lines = on.map((c) => {
    if (!net) return `«${c.name ?? c.nativeId}»: Display activo (sin reparto por redes).`;
    const n = networkOf(net, c.nativeId);
    return `«${c.name ?? c.nativeId}»: Display ${money(n.display.cost, a.currency)} y ${round2(n.display.conversions)} conversiones en 30 días, de ${money(n.all.cost, a.currency)} y ${round2(n.all.conversions)} de la campaña.`;
  });
  const exposure = net ? round2(on.reduce((s, c) => s + networkOf(net, c.nativeId).display.cost, 0)) : null;
  const lost = net ? round2(on.reduce((s, c) => s + networkOf(net, c.nativeId).display.conversions, 0)) : null;
  return result('display_en_busqueda', 'mal', 'Campañas de búsqueda que también salen en Display', {
    lines: [...lines, 'Display dentro de Búsqueda mezcla intenciones y ensucia el aprendizaje; en febrero de 2027 Google decide además cuánto va a Display.'],
    todo: on.map((c) => `«${c.name ?? c.nativeId}» → Configuración → Redes: desmarcar «Red de Display de Google».`),
    exposure,
    campaignNativeIds: on.map((c) => c.nativeId),
    prediction: {
      hipotesis: 'El gasto en Display de una campaña de búsqueda trae clics de poca intención; sin él, el presupuesto va a búsquedas.',
      metrica: 'CPL de la campaña',
      esperado: `Gasto en Display −${exposure === null ? '?' : money(exposure, a.currency)} al mes; conversiones entre −${lost ?? '?'} y 0`,
      ventanaDias: 28,
      vueltaAtras: 'Si las conversiones de la campaña caen más que las que daba Display y el CPL no mejora, volver a activarlo.'
    },
    data: { campaigns: on.map((c) => c.nativeId), exposure }
  });
}

/** Coste de personas fuera de la zona segmentada (user_location_view). */
function outsideShare(rows: UserLocationRow[]): { total: number; outside: number; outsideConv: number; share: number } {
  const total = rows.reduce((s, r) => s + r.cost, 0);
  const out = rows.filter((r) => r.targeting === false);
  const outside = out.reduce((s, r) => s + r.cost, 0);
  return { total, outside, outsideConv: out.reduce((s, r) => s + r.conversions, 0), share: total > 0 ? outside / total : 0 };
}

export function ctlPresenceOrInterest(a: AuditInput): AuditResult {
  const camps = need(a, 'presencia_interes', 'campanas');
  if (!camps.ok) return camps.res;
  const bad = camps.rows.filter((c) => c.positiveGeoType === 'PRESENCE_OR_INTEREST');
  if (!bad.length) return result('presencia_interes', 'bien', 'Las campañas segmentan por presencia en la zona', {});
  if (!a.ficha) return unchecked('presencia_interes', 'la cuenta no tiene ficha: no se sabe si es un negocio local', [`«Presencia o interés» en ${bad.map((c) => `«${c.name ?? c.nativeId}»`).join(', ')}.`]);
  if (!a.ficha.local) return result('presencia_interes', 'bien', '«Presencia o interés» en un negocio que no es local', { lines: ['La ficha no tiene locales ni zona: puede tener sentido.'] });
  const loc = a.data.ubicacion_usuario?.ok ? outsideShare(a.data.ubicacion_usuario.rows ?? []) : null;
  return withFicha(
    result('presencia_interes', 'mal', 'Negocio local que paga clics de gente que solo «se interesa» por la zona', {
      lines: [`«Presencia o interés» en ${bad.map((c) => `«${c.name ?? c.nativeId}»`).join(', ')}.`, ...(loc ? [`Gasto de personas fuera de la zona: ${money(loc.outside, a.currency)} (${pct(loc.share)}) en 30 días.`] : [])],
      todo: bad.map((c) => `«${c.name ?? c.nativeId}» → Configuración → Ubicaciones → Opciones de ubicación: «Presencia: personas que están o suelen estar en las ubicaciones incluidas».`),
      exposure: loc ? round2(loc.outside) : null,
      campaignNativeIds: bad.map((c) => c.nativeId),
      prediction: {
        hipotesis: 'Un negocio local no atiende a quien está fuera; con «presencia» el gasto se queda en la zona.',
        metrica: 'Gasto fuera de la zona y CPL',
        esperado: loc ? `Gasto fuera de zona entre −${money(loc.outside * 0.5, a.currency)} y −${money(loc.outside, a.currency)} al mes; conversiones entre −${round2(loc.outsideConv)} y 0` : 'Gasto fuera de zona −50 % a −100 %; conversiones sin cambio (±10 %)',
        ventanaDias: 28,
        vueltaAtras: 'Si las conversiones caen más de un 15 % en 28 días, volver a «presencia o interés» y revisar la zona con el cliente.'
      },
      data: { campaigns: bad.map((c) => c.nativeId) }
    }),
    ['zona'], a
  );
}

export function ctlContentExclusions(a: AuditInput): AuditResult {
  const camps = need(a, 'exclusiones_contenido', 'campanas');
  if (!camps.ok) return camps.res;
  const visual = camps.rows.filter((c) => ['DISPLAY', 'VIDEO', 'PERFORMANCE_MAX', 'DEMAND_GEN'].includes(c.channelType ?? '') || (c.channelType === 'SEARCH' && c.targetContentNetwork === true));
  if (!visual.length) return result('exclusiones_contenido', 'bien', 'Sin Display, vídeo ni Performance Max: no hacen falta', {});
  const ex = need(a, 'exclusiones_contenido', 'exclusiones');
  if (!ex.ok) return ex.res;
  const apps = ex.rows.some((r) => r.type === 'MOBILE_APP_CATEGORY' || (r.type === 'PLACEMENT' && /mobileapp/i.test(r.value ?? '')));
  const content = ex.rows.some((r) => r.type === 'CONTENT_LABEL');
  const net = a.data.redes?.ok ? (a.data.redes.rows ?? []) : null;
  const exposure = net ? round2(visual.reduce((s, c) => s + networkOf(net, c.nativeId).display.cost, 0)) : null;
  if (apps && content) return result('exclusiones_contenido', 'bien', 'La cuenta excluye aplicaciones y contenido sensible', { lines: [`${plural(ex.rows.length, 'exclusión', 'exclusiones')} a nivel de cuenta.`] });
  return result('exclusiones_contenido', 'mal', 'Display, vídeo o PMax sin excluir aplicaciones ni contenido sensible', {
    lines: [`Campañas que salen en Display o vídeo: ${visual.map((c) => `«${c.name ?? c.nativeId}»`).join(', ')}.`, ...(apps ? [] : ['No se excluyen las aplicaciones móviles (clics accidentales en juegos).']), ...(content ? [] : ['No se excluye contenido infantil ni sensible.']), ...(exposure !== null ? [`Gasto en Display y vídeo en 30 días: ${money(exposure, a.currency)}.`] : [])],
    todo: ['Herramientas → Gestor de contenido → Contenido excluido: excluir categorías sensibles y contenido infantil («Hecho para niños»).', 'Exclusiones de ubicaciones a nivel de cuenta: excluir «Todas las aplicaciones» (mobileappcategory::69500).'],
    exposure,
    campaignNativeIds: visual.map((c) => c.nativeId),
    data: { apps, content }
  });
}

export function ctlRealZone(a: AuditInput): AuditResult {
  const loc = need(a, 'zona_real', 'ubicacion_usuario');
  if (!loc.ok) return loc.res;
  const s = outsideShare(loc.rows);
  if (s.total <= 0) return unchecked('zona_real', 'sin gasto por ubicación en 30 días');
  const lines = [`Gasto de personas fuera de la zona segmentada: ${money(s.outside, a.currency)} de ${money(s.total, a.currency)} (${pct(s.share)}) en 30 días; ${round2(s.outsideConv)} conversiones.`];
  // Nombres de la zona segmentada frente a la ficha: evidencia, nunca fallo (comparar nombres da falsos positivos).
  const geo = a.data.objetivos_geo?.ok ? a.data.objetivos_geo.rows : null;
  if (geo && a.ficha) {
    const names = new Map(geo.names.map((n) => [n.id, n.name ?? n.canonicalName ?? n.id]));
    const targeted = [...new Set(geo.targets.filter((g) => !g.negative).map((g) => (g.type === 'PROXIMITY' ? `${g.city ?? 'un punto'} (radio ${g.radius ?? '?'} ${g.units === 'MILES' ? 'mi' : 'km'})` : (names.get(g.geoId ?? '') ?? `ubicación ${g.geoId}`))))];
    const unknown = targeted.filter((t) => !placesIn(t).some((p) => zoneServes(a.ficha!.zoneText, p)) && !hasPhrase(a.ficha!.zoneText, t.replace(/\s*\(.*$/, '')));
    lines.push(`Zona segmentada: ${targeted.slice(0, 8).join(', ') || '—'}. Zona de la ficha: «${a.ficha.zoneText || 'sin dato'}».`);
    if (unknown.length) lines.push(`Segmentadas que la ficha no nombra (revisar): ${unknown.slice(0, 6).join(', ')}.`);
  }
  if (s.share <= a.t.auditZonaFueraPct) return result('zona_real', 'bien', `El gasto se queda en la zona (${pct(s.share)} fuera)`, { lines });
  return result('zona_real', 'mal', `${pct(s.share)} del gasto viene de fuera de la zona segmentada`, {
    lines,
    todo: ['Configuración de cada campaña → Ubicaciones: usar «Presencia» y añadir como excluidas las zonas que no se atienden.', 'Informe «Dónde estaban tus usuarios» para ver de dónde viene el gasto.'],
    exposure: round2(s.outside),
    prediction: {
      hipotesis: 'El gasto de fuera de la zona no se convierte en clientes que el negocio pueda atender.',
      metrica: 'Gasto fuera de la zona y CPL de la cuenta',
      esperado: `Gasto fuera de zona entre −${money(s.outside * 0.5, a.currency)} y −${money(s.outside, a.currency)} al mes; conversiones entre −${round2(s.outsideConv)} y 0`,
      ventanaDias: 28,
      vueltaAtras: 'Si las conversiones caen más de un 15 % en 28 días, revisar la zona con el cliente y deshacer las exclusiones nuevas.'
    },
    data: { share: round2(s.share), outside: round2(s.outside) }
  });
}

export function ctlOutOfZoneTerms(a: AuditInput): AuditResult {
  if (!a.ficha) return unchecked('lugares_fuera_zona', 'la cuenta no tiene ficha: no se sabe qué zona atiende');
  if (!a.ficha.zoneText.trim()) return unchecked('lugares_fuera_zona', 'la ficha no dice qué zona atiende el cliente');
  if (nationalZone(a.ficha.zoneText)) return result('lugares_fuera_zona', 'bien', 'Zona nacional: no aplica', { lines: [`Zona de la ficha: «${a.ficha.zoneText}».`] });
  const terms = need(a, 'lugares_fuera_zona', 'terminos');
  if (!terms.ok) return terms.res;
  const brandFree = (t: string) => a.ficha!.brands.reduce((s, b) => (hasPhrase(s, b) ? ` ${norm(s)} `.split(` ${norm(b)} `).join(' ') : s), t);
  const bad = new Map<string, { place: string; cost: number; terms: string[] }>();
  for (const t of terms.rows) {
    for (const p of placesIn(brandFree(t.term))) {
      if (zoneServes(a.ficha.zoneText, p)) continue;
      const cur = bad.get(p.name) ?? bad.set(p.name, { place: p.name, cost: 0, terms: [] }).get(p.name)!;
      cur.cost += t.cost;
      if (cur.terms.length < 3) cur.terms.push(t.term);
    }
  }
  if (!bad.size) return result('lugares_fuera_zona', 'bien', 'Ningún término con gasto nombra un lugar fuera de la zona', { lines: [`Zona de la ficha: «${a.ficha.zoneText}». Lista de lugares provisional (capitales, provincias y ciudades grandes).`] });
  const list = [...bad.values()].sort((x, y) => y.cost - x.cost);
  const exposure = round2(list.reduce((s, x) => s + x.cost, 0));
  return withFicha(
    result('lugares_fuera_zona', 'mal', `Términos con lugares que el cliente no atiende (${money(exposure, a.currency)} en 30 días)`, {
      lines: [...list.slice(0, 6).map((x) => `«${x.place}»: ${money(x.cost, a.currency)} — ${x.terms.map((t) => `«${t}»`).join(', ')}`), `Zona de la ficha: «${a.ficha.zoneText}».`],
      todo: [`Añadir como palabras clave negativas de frase (a nivel de cuenta o en una lista compartida): ${list.slice(0, 12).map((x) => `"${norm(x.place)}"`).join(', ')}.`],
      exposure,
      data: { places: list.map((x) => x.place), exposure }
    }),
    ['zona'], a
  );
}

export type TermClass = 'marca' | 'competidor' | 'generico';
export function classifyTerm(term: string, brands: string[], competitors: string[]): TermClass {
  if (brands.some((b) => norm(b).length >= 4 && hasPhrase(term, b))) return 'marca';
  if (competitors.some((c) => norm(c).length >= 4 && hasPhrase(term, c))) return 'competidor';
  return 'generico';
}

export function ctlBrandGeneric(a: AuditInput): AuditResult {
  if (!a.ficha) return unchecked('marca_generico', 'la cuenta no tiene ficha: no se sabe cuál es la marca');
  const brands = a.ficha.brands.filter((b) => norm(b).length >= 4);
  if (!brands.length) return unchecked('marca_generico', 'la ficha no tiene el nombre comercial ni alias');
  const terms = need(a, 'marca_generico', 'terminos');
  if (!terms.ok) return terms.res;
  const byCamp = new Map<string, { brand: number; comp: number; total: number }>();
  const compTerms = new Map<string, number>();
  for (const t of terms.rows) {
    const k = classifyTerm(t.term, brands, a.ficha.competitors);
    const c = byCamp.get(t.campaignNativeId) ?? byCamp.set(t.campaignNativeId, { brand: 0, comp: 0, total: 0 }).get(t.campaignNativeId)!;
    c.total += t.cost;
    if (k === 'marca') c.brand += t.cost;
    if (k === 'competidor') {
      c.comp += t.cost;
      compTerms.set(t.term, (compTerms.get(t.term) ?? 0) + t.cost);
    }
  }
  const isBrandCampaign = (id: string, x: { brand: number; total: number }) => /\b(marca|brand)\b/i.test(a.campaigns.find((c) => c.nativeId === id)?.name ?? '') || (x.total > 0 && x.brand / x.total >= 0.7);
  const brandCamps = [...byCamp].filter(([id, x]) => isBrandCampaign(id, x)).map(([id]) => id);
  const generic = [...byCamp].filter(([id]) => !brandCamps.includes(id));
  const genTotal = generic.reduce((s, [, x]) => s + x.total, 0);
  const brandInGeneric = generic.reduce((s, [, x]) => s + x.brand, 0);
  const share = genTotal > 0 ? brandInGeneric / genTotal : 0;
  const compCost = [...compTerms.values()].reduce((s, v) => s + v, 0);
  const totalBrand = [...byCamp.values()].reduce((s, x) => s + x.brand, 0);
  const lines = [
    `Marca dentro de campañas genéricas: ${money(brandInGeneric, a.currency)} de ${money(genTotal, a.currency)} (${pct(share)}) en 30 días.`,
    brandCamps.length ? `Campañas de marca: ${brandCamps.map((id) => cname(a, id)).join(', ')}.` : totalBrand > 0 ? 'La marca no tiene campaña propia.' : 'Sin búsquedas de marca con gasto.',
    ...(compCost > 0 ? [`Términos de competidor con gasto (${money(compCost, a.currency)}): ${[...compTerms.keys()].slice(0, 4).map((t) => `«${t}»`).join(', ')}. Decidir: campaña propia o negativa.`] : [])
  ];
  const bad = share > a.t.auditMarcaPct || compCost >= a.t.sueloMoneda;
  if (!bad) return result('marca_generico', 'bien', 'Marca y genérico separados', { lines });
  const facts: FichaFact[] = compCost >= a.t.sueloMoneda ? ['marca', 'competidores'] : ['marca'];
  return withFicha(
    result('marca_generico', 'mal', share > a.t.auditMarcaPct ? `La marca se mezcla con lo genérico (${pct(share)} del gasto genérico)` : 'Términos de competidor con gasto sin decidir', {
      lines,
      todo: [
        ...(share > a.t.auditMarcaPct ? [`Añadir la marca como negativa (${brands.slice(0, 3).map((b) => `"${norm(b)}"`).join(', ')}) en las campañas genéricas${brandCamps.length ? '' : ' y crear una campaña de marca aparte'}; en PMax y AI Max, exclusión de marca.`] : []),
        ...(compCost >= a.t.sueloMoneda ? ['Decidir con el responsable si se puja por la competencia (campaña propia) o se añaden como negativas.'] : [])
      ],
      exposure: round2(brandInGeneric + compCost),
      campaignNativeIds: generic.map(([id]) => id),
      prediction: {
        hipotesis: 'Separar la marca enseña el CPL real de lo genérico y paga la marca a su CPC (más barato).',
        metrica: 'CPL de las campañas genéricas y de la marca',
        esperado: `El CPL genérico sube a su valor real (la marca lo maquillaba); el gasto en marca baja entre −20 % y −50 % (${money(brandInGeneric * 0.2, a.currency)} a ${money(brandInGeneric * 0.5, a.currency)} al mes)`,
        ventanaDias: 28,
        vueltaAtras: 'Si las conversiones de marca caen más de un 20 % en 28 días, quitar la negativa y revisar la campaña de marca.'
      },
      data: { share: round2(share), brandInGeneric: round2(brandInGeneric), compCost: round2(compCost) }
    }),
    facts, a
  );
}

export function ctlPmaxNetworks(a: AuditInput): AuditResult {
  const camps = need(a, 'pmax_redes', 'campanas');
  if (!camps.ok) return camps.res;
  const pmax = camps.rows.filter((c) => c.channelType === 'PERFORMANCE_MAX');
  if (!pmax.length) return result('pmax_redes', 'bien', 'Sin Performance Max', {});
  const net = need(a, 'pmax_redes', 'redes');
  if (!net.ok) return net.res;
  const lines: string[] = [];
  const bad: { id: string; cost: number; share: number }[] = [];
  let mixedOnly = 0;
  for (const c of pmax) {
    const n = networkOf(net.rows, c.nativeId);
    if (n.all.cost <= 0) continue;
    if (n.mixed.cost >= n.all.cost * 0.9) {
      mixedOnly++;
      continue;
    }
    const share = n.display.cost / n.all.cost;
    const convShare = n.all.conversions > 0 ? n.display.conversions / n.all.conversions : 0;
    lines.push(`«${c.name ?? c.nativeId}»: Display y vídeo ${pct(share)} del gasto (${money(n.display.cost, a.currency)}) y ${pct(convShare)} de las conversiones.`);
    if (share >= a.t.auditPmaxRedesPct && convShare < share / 2) bad.push({ id: c.nativeId, cost: n.display.cost, share });
  }
  if (mixedOnly && !lines.length) return unchecked('pmax_redes', 'Google no separa las redes de Performance Max en esta cuenta (todo «mixto»)');
  lines.push('La marca dentro de PMax necesita las categorías de términos: sin comprobar en este paso.');
  if (!bad.length) return result('pmax_redes', 'bien', 'Performance Max reparte el gasto con sentido', { lines });
  const exposure = round2(bad.reduce((s, b) => s + b.cost, 0));
  return result('pmax_redes', 'mal', `Performance Max gasta en Display y vídeo sin conversiones (${money(exposure, a.currency)} en 30 días)`, {
    lines,
    todo: ['Exclusiones de ubicaciones y de contenido (control «Exclusiones de contenido»); revisar el informe de ubicaciones de PMax.', 'Si sigue igual, valorar con Enric una campaña de búsqueda con el presupuesto (R3).'],
    exposure,
    campaignNativeIds: bad.map((b) => b.id),
    prediction: {
      hipotesis: 'Con exclusiones, PMax deja de comprar inventario de Display y vídeo que no convierte.',
      metrica: 'CPL de la campaña PMax',
      esperado: `Gasto en Display y vídeo −30 % a −60 % (${money(exposure * 0.3, a.currency)} a ${money(exposure * 0.6, a.currency)} al mes); CPL −10 % a −25 %`,
      ventanaDias: 28,
      vueltaAtras: 'Si las conversiones de PMax caen más de un 20 % en 28 días, quitar las exclusiones nuevas.'
    },
    data: { campaigns: bad.map((b) => b.id), exposure }
  });
}

const BAD_PAGE = /\/(blog|noticias|news|aviso-legal|legal|privacidad|privacy|politica|cookies|empleo|trabaja|trabajo|careers|jobs)(\/|$|\?)/i;

export function ctlChosenPages(a: AuditInput): AuditResult {
  if (!a.landing.length) return unchecked('paginas_elegidas', 'aún no hay URL de destino con gasto descargadas');
  const configured = new Set(a.landing.filter((l) => l.origins.includes('anuncio')).map((l) => l.urlNormalized));
  const total = a.landing.filter((l) => l.origins.includes('anuncio')).reduce((s, l) => s + l.cost7d, 0);
  const chosen = a.landing.filter((l) => l.origins.includes('expandida') && !configured.has(l.urlNormalized));
  const chosenCost = chosen.reduce((s, l) => s + l.cost7d, 0);
  const share = total > 0 ? chosenCost / total : 0;
  const badPages = chosen.filter((l) => BAD_PAGE.test(l.urlNormalized));
  if (!chosen.length) return result('paginas_elegidas', 'bien', 'Google solo usa las páginas configuradas', {});
  const lines = [`Páginas que nadie configuró: ${money(chosenCost, a.currency)} de ${money(total, a.currency)} (${pct(share)}) en 7 días.`, ...chosen.sort((x, y) => y.cost7d - x.cost7d).slice(0, 5).map((l) => `${l.url} — ${money(l.cost7d, a.currency)}${BAD_PAGE.test(l.urlNormalized) ? ' (blog, legal o empleo)' : ''}`)];
  if (share <= a.t.auditPaginasPct && !badPages.length) return result('paginas_elegidas', 'bien', `Google elige pocas páginas por su cuenta (${pct(share)})`, { lines });
  const ids = [...new Set(chosen.flatMap((l) => l.campaignNativeIds))];
  const monthly = round2((chosenCost * 30) / 7);
  return result('paginas_elegidas', 'mal', badPages.length ? 'Google manda tráfico a blog, legales o empleo' : `${pct(share)} del gasto va a páginas que eligió Google`, {
    lines,
    todo: ids.map((id) => `${cname(a, id)} → Configuración → Expansión de la URL final: excluir estas URL (o desactivarla si solo hay una página buena).`),
    exposure: monthly,
    campaignNativeIds: ids,
    prediction: {
      hipotesis: 'Las páginas sin formulario ni oferta convierten peor que la landing elegida; excluirlas concentra el tráfico en la buena.',
      metrica: 'Tasa de conversión de la campaña',
      esperado: `Tasa de conversión +5 % a +20 %; gasto sin cambio (se reparte a las páginas configuradas)`,
      ventanaDias: 28,
      vueltaAtras: 'Si las conversiones caen más de un 15 % en 28 días, quitar las exclusiones de URL.'
    },
    data: { share: round2(share), monthly, badPages: badPages.length }
  });
}

// --- Tanda 3 ----------------------------------------------------------------------------------------------------------

export function ctlAutoApplied(a: AuditInput): AuditResult {
  const since = new Date(a.now.getTime() - 30 * 86_400_000);
  const applied = a.changes.filter((c) => c.changeAt >= since && c.clientType === 'GOOGLE_ADS_RECOMMENDATIONS_SUBSCRIPTION');
  const subs = a.data.suscripciones;
  const active = subs?.ok ? (subs.rows ?? []).filter((s) => s.status === 'ENABLED') : [];
  if (!subs?.ok && !applied.length) return unchecked('autoaplicadas', `no se pudieron leer las suscripciones de recomendaciones${subs?.error ? `: ${subs.error.slice(0, 160)}` : ''}`);
  if (!active.length && !applied.length) return result('autoaplicadas', 'bien', 'Ninguna recomendación se aplica sola', {});
  return result('autoaplicadas', 'mal', 'Google aplica recomendaciones sin que nadie las revise', {
    lines: [...(active.length ? [`Suscripciones activas: ${active.map((s) => s.type).join(', ')}.`] : []), ...(applied.length ? [`${plural(applied.length, 'cambio aplicado', 'cambios aplicados')} por Google en 30 días.`] : []), ...(!subs?.ok ? ['Las suscripciones no se pudieron leer: se ve por el historial de cambios.'] : [])],
    todo: ['Recomendaciones → Aplicar automáticamente: desactivar todas (salvo las que se decidan a propósito, con motivo).'],
    campaignNativeIds: [...new Set(applied.map((c) => c.campaignNativeId).filter((x): x is string => Boolean(x)))],
    data: { active: active.map((s) => s.type), applied: applied.length }
  });
}

/** Tipos de recomendación: higiene útil frente a lo que sirve al gasto (GOO-06). El resto se enseña sin juicio. */
export const REC_USEFUL = new Set(['SITELINK_ASSET', 'CALLOUT_ASSET', 'CALL_ASSET', 'STRUCTURED_SNIPPET_ASSET', 'LEAD_FORM_ASSET', 'IMAGE_ASSET', 'RESPONSIVE_SEARCH_AD_ASSET', 'RESPONSIVE_SEARCH_AD', 'RESPONSIVE_SEARCH_AD_IMPROVE_AD_STRENGTH', 'IMPROVE_PERFORMANCE_MAX_AD_STRENGTH', 'IMPROVE_DEMAND_GEN_AD_STRENGTH', 'UPGRADE_LOCAL_CAMPAIGN_TO_PERFORMANCE_MAX', 'CONVERSION_TRACKING', 'ENHANCED_CONVERSIONS', 'UPGRADE_SMART_SHOPPING_CAMPAIGN_TO_PERFORMANCE_MAX', 'KEYWORD_CONFLICT', 'DISPLAY_AND_VIDEO_360_CONFLICT', 'CALL_EXTENSION', 'SITELINK_EXTENSION', 'CALLOUT_EXTENSION', 'FIX_CONVERSION_TRACKING']);
export const REC_SPEND = new Set(['CAMPAIGN_BUDGET', 'FORECASTING_CAMPAIGN_BUDGET', 'MARGINAL_ROI_CAMPAIGN_BUDGET', 'MOVE_UNUSED_BUDGET', 'KEYWORD', 'USE_BROAD_MATCH_KEYWORD', 'SEARCH_PARTNERS_OPT_IN', 'DISPLAY_EXPANSION_OPT_IN', 'TARGET_CPA_OPT_IN', 'MAXIMIZE_CONVERSIONS_OPT_IN', 'MAXIMIZE_CLICKS_OPT_IN', 'RAISE_TARGET_CPA', 'RAISE_TARGET_CPA_BID_TOO_LOW', 'LOWER_TARGET_ROAS', 'TARGET_ROAS_OPT_IN', 'MAXIMIZE_CONVERSION_VALUE_OPT_IN', 'DYNAMIC_IMAGE_EXTENSION_OPT_IN', 'OPTIMIZE_AD_ROTATION', 'TEXT_AD']);

export function ctlRecommendations(a: AuditInput): AuditResult {
  const rec = need(a, 'recomendaciones', 'recomendaciones');
  if (!rec.ok) return rec.res;
  const count = (set: Set<string> | null) => {
    const m = new Map<string, number>();
    for (const r of rec.rows.list) if (set ? set.has(r.type) : !REC_USEFUL.has(r.type) && !REC_SPEND.has(r.type)) m.set(r.type, (m.get(r.type) ?? 0) + 1);
    return [...m].map(([t, n]) => `${t}${n > 1 ? ` (${n})` : ''}`);
  };
  const useful = count(REC_USEFUL);
  const spend = count(REC_SPEND);
  const other = count(null);
  const score = rec.rows.score;
  const lines = [
    ...(score !== null ? [`Nivel de optimización de Google: ${Math.round(score * 100)} % (mide cuánto se siguen sus recomendaciones, no si la cuenta va bien).`] : []),
    useful.length ? `Higiene útil pendiente: ${useful.join(', ')}.` : 'Sin recomendaciones de higiene pendientes.',
    ...(spend.length ? [`Sirven sobre todo al gasto (descartar con motivo): ${spend.join(', ')}.`] : []),
    ...(other.length ? [`Otras, para mirar: ${other.join(', ')}.`] : [])
  ];
  if (!useful.length) return result('recomendaciones', 'bien', 'Recomendaciones cribadas: nada útil pendiente', { lines });
  return result('recomendaciones', 'mal', `${plural(useful.length, 'recomendación útil pendiente', 'recomendaciones útiles pendientes')}`, {
    lines,
    todo: ['Recomendaciones: aplicar a mano las de higiene útil (recursos que faltan, conflictos, seguimiento).', 'Descartar las que sirven al gasto con el motivo («no hay base para subir presupuesto», «la amplia no encaja con la zona»).'],
    data: { useful, spend, score }
  });
}

export function ctlCallAsset(a: AuditInput): AuditResult {
  if (!a.ficha) return unchecked('recurso_llamada', 'la cuenta no tiene ficha: no se sabe el teléfono del negocio');
  if (!a.ficha.phones.length) return result('recurso_llamada', 'bien', 'La ficha no tiene teléfono: no aplica', {});
  const calls = need(a, 'recurso_llamada', 'llamadas');
  if (!calls.ok) return calls.res;
  const problems: string[] = [];
  const todo: string[] = [];
  if (!calls.rows.length) {
    problems.push(`Sin recurso de llamada activo, y la ficha tiene teléfono (${a.ficha.phones[0]}).`);
    todo.push(`Recursos → Llamadas: añadir el ${a.ficha.phones[0]} a nivel de cuenta, con informes de llamadas y el horario de atención.`);
  }
  const wrong = calls.rows.filter((c) => c.phone && !a.ficha!.phones.some((p) => samePhone(p, c.phone)));
  if (wrong.length) {
    problems.push(`Número distinto del de la ficha: ${[...new Set(wrong.map((w) => w.phone))].join(', ')} (ficha: ${a.ficha.phones.join(', ')}).`);
    todo.push('Recursos → Llamadas: cambiar el número por el de la ficha (o corregir la ficha si el bueno es el del anuncio).');
  }
  const noReport = calls.rows.filter((c) => c.reporting === 'DISABLED');
  if (noReport.length) {
    problems.push('Informes de llamadas apagados: las llamadas no cuentan como conversión.');
    todo.push('Configuración de la cuenta → Informes de llamadas: activar, y en el recurso usar la acción de llamada de la cuenta.');
  }
  const noSchedule = calls.rows.filter((c) => !c.hasSchedule);
  if (calls.rows.length && noSchedule.length && a.ficha.hours && !/24\s*h|24 horas/i.test(a.ficha.hours)) {
    problems.push(`Recurso de llamada sin horario: el teléfono sale también cuando nadie lo coge (horario de la ficha: ${a.ficha.hours}).`);
    todo.push('Recurso de llamada → Programación avanzada: el horario de atención real.');
  }
  if (!problems.length) return result('recurso_llamada', 'bien', 'Recurso de llamada con el número de la ficha', { lines: [`${plural(calls.rows.length, 'recurso', 'recursos')} de llamada; número ${calls.rows[0]?.phone ?? '—'}.`] });
  return withFicha(result('recurso_llamada', 'mal', 'El recurso de llamada no cuadra con el negocio', { lines: problems, todo, data: { assets: calls.rows.length, wrong: wrong.length } }), ['telefono', ...(noSchedule.length ? (['horario'] as FichaFact[]) : [])], a);
}

// --- Todos los controles ------------------------------------------------------------------------------------------------

const RUNNERS: Record<AuditControl, (a: AuditInput) => AuditResult> = {
  propiedad_accesos: ctlOwnership,
  linea_base: ctlBaseline,
  conversiones: ctlConversions,
  caduca_feb_2027: ctlFeb2027,
  ai_max: ctlAiMax,
  textos_automaticos: ctlTextAutomation,
  socios_busqueda: ctlSearchPartners,
  display_en_busqueda: ctlDisplayInSearch,
  presencia_interes: ctlPresenceOrInterest,
  exclusiones_contenido: ctlContentExclusions,
  zona_real: ctlRealZone,
  lugares_fuera_zona: ctlOutOfZoneTerms,
  marca_generico: ctlBrandGeneric,
  pmax_redes: ctlPmaxNetworks,
  paginas_elegidas: ctlChosenPages,
  autoaplicadas: ctlAutoApplied,
  recomendaciones: ctlRecommendations,
  recurso_llamada: ctlCallAsset
};

/** Pasa todos los controles. Un fallo de código en uno no tumba los demás: ese queda «no comprobado». */
export function runAuditControls(a: AuditInput): AuditResult[] {
  return AUDIT_CONTROLS.map((c) => {
    try {
      const r = RUNNERS[c](a);
      // La predicción previa solo en «mal» con riesgo R2 o R3 (APR-01); las R1 se evalúan en conjunto.
      const risk = CONTROL_INFO[c].risk;
      return { ...r, prediction: r.status === 'mal' && (risk === 'R2' || risk === 'R3') ? r.prediction : null };
    } catch (e) {
      return unchecked(c, `error interno del control: ${e instanceof Error ? e.message.slice(0, 160) : 'desconocido'}`);
    }
  });
}

export function auditSummary(items: { control: string; status: AuditStatus; needsConfirmation?: boolean }[]): { bien: number; mal: number; confirmar: number; no_comprobado: number; porTanda: Record<string, { bien: number; mal: number; no_comprobado: number }> } {
  const out = { bien: 0, mal: 0, confirmar: 0, no_comprobado: 0, porTanda: {} as Record<string, { bien: number; mal: number; no_comprobado: number }> };
  for (const i of items) {
    const t = String(CONTROL_INFO[i.control as AuditControl]?.tanda ?? 9);
    const pt = (out.porTanda[t] ??= { bien: 0, mal: 0, no_comprobado: 0 });
    pt[i.status]++;
    if (i.status === 'mal' && i.needsConfirmation) out.confirmar++;
    else out[i.status]++;
  }
  return out;
}

// --- Vigilancia (EST-06) ------------------------------------------------------------------------------------------------

export type VigilanceState = { status: AuditStatus; fixedAt: Date | null; regressedAt: Date | null; regressionCount: number };
/**
 * Lo que cambia la vigilancia diaria: «no comprobado» no cambia nada (no se acusa a ciegas); mal → bien = corregido;
 * bien → mal = reapareció (estuviera bien desde la entrada o corregido después).
 */
export function vigilanceStep(prev: VigilanceState, next: AuditStatus, now: Date): VigilanceState & { fixed: boolean; regressed: boolean } {
  if (next === 'no_comprobado' || prev.status === 'no_comprobado') {
    if (next === 'no_comprobado') return { ...prev, fixed: false, regressed: false };
    // Sin dato antes: se toma el valor nuevo sin contarlo como corrección ni como regreso.
    return { ...prev, status: next, fixed: false, regressed: false };
  }
  if (prev.status === 'mal' && next === 'bien') return { ...prev, status: 'bien', fixedAt: now, fixed: true, regressed: false };
  if (prev.status === 'bien' && next === 'mal') return { ...prev, status: 'mal', regressedAt: now, regressionCount: prev.regressionCount + 1, fixed: false, regressed: true };
  return { ...prev, status: next, fixed: false, regressed: false };
}

/** Si un cambio del cliente o de Google en las campañas afectadas (o en la cuenta) explica que algo reapareciera. */
export function regressionCause(campaignNativeIds: string[], changes: AuditInput['changes'], since: Date): { actor: string; text: string } | null {
  const hits = changes
    .filter((c) => c.changeAt >= since && (c.actorClass === 'cliente' || c.actorClass === 'google'))
    .filter((c) => !campaignNativeIds.length || !c.campaignNativeId || campaignNativeIds.includes(c.campaignNativeId))
    .sort((x, y) => y.changeAt.getTime() - x.changeAt.getTime());
  const h = hits[0];
  if (!h) return null;
  const actor = h.actorClass === 'google' ? 'google' : (h.userEmail ?? 'cliente').toLowerCase();
  return { actor, text: `${h.actorClass === 'google' ? 'Google' : (h.userEmail ?? 'el cliente')} cambió ${h.resourceType ?? 'algo'} el ${h.changeAt.toISOString().slice(0, 10)}` };
}

// --- Los 3 del guion y el informe ---------------------------------------------------------------------------------------

export type GuionItem = { control: string; status: AuditStatus; needsConfirmation: boolean; exposure: number | null; regressedAt: Date | null; response: AuditResponse | null };
/** Paso 4 del guion: 3 elementos, no 30. «Mal» confirmado, sin descarte; primero lo que reapareció, luego por tanda y gasto. */
export function guionTop<T extends GuionItem>(items: T[], n = 3): T[] {
  return items
    .filter((i) => i.status === 'mal' && !i.needsConfirmation && i.response !== 'cliente_lo_quiere' && i.response !== 'no_aplica')
    .sort((x, y) => Number(Boolean(y.regressedAt)) - Number(Boolean(x.regressedAt)) || (CONTROL_INFO[x.control as AuditControl]?.tanda ?? 9) - (CONTROL_INFO[y.control as AuditControl]?.tanda ?? 9) || (y.exposure ?? 0) - (x.exposure ?? 0))
    .slice(0, n);
}

/** Informe de auditoría en texto (INF-05): por tandas, con el gasto expuesto. Para copiar; no se envía a nadie. */
export function auditReportText(input: { accountName: string; date: string; currency: string | null; items: { control: string; status: AuditStatus; needsConfirmation: boolean; title: string; lines: string[]; todo: string[]; exposure: number | null; response: string | null }[] }): string {
  const out = [`Auditoría de higiene · ${input.accountName} · ${input.date}`, ''];
  const exp = input.items.filter((i) => i.status === 'mal').reduce((s, i) => s + (i.exposure ?? 0), 0);
  const s = auditSummary(input.items);
  out.push(`Resumen: ${s.mal} mal, ${s.confirmar} por confirmar con el responsable, ${s.bien} bien, ${s.no_comprobado} sin comprobar. Gasto expuesto (30 días, aproximado y sin sumar solapes): ${money(exp, input.currency)}.`, '');
  for (const t of [0, 1, 2, 3]) {
    const list = input.items.filter((i) => CONTROL_INFO[i.control as AuditControl]?.tanda === t);
    if (!list.length) continue;
    out.push(`## Tanda ${t}`);
    for (const i of list) {
      const mark = i.status === 'mal' ? (i.needsConfirmation ? 'CONFIRMAR' : 'MAL') : i.status === 'bien' ? 'BIEN' : 'SIN COMPROBAR';
      out.push(`- [${mark}] ${CONTROL_INFO[i.control as AuditControl]?.label ?? i.control}: ${i.title}${i.exposure ? ` (${money(i.exposure, input.currency)})` : ''}${i.response ? ` · respuesta: ${i.response}` : ''}`);
      if (i.status === 'mal') for (const td of i.todo.slice(0, 3)) out.push(`    Qué hacer: ${td}`);
    }
    out.push('');
  }
  out.push('Tanda 4 (pruebas): sin controles en este paso.', 'La herramienta no cambia nada en Google Ads: cada corrección se aplica a mano.');
  return out.join('\n');
}
