// Núcleo: ¿funcionó? (SEO parte 8, 27 nov 2026; docs/DISENO-SEO-MEDIR.md con la auditoría Opus). Reglas PURAS de medición
// de una intervención: diferencias en diferencias semanales en logaritmo (tratadas frente al resto de la web), prueba t,
// tendencias paralelas antes del cambio y veredicto con mínimos por métrica. Convención: efecto > 0 = MEJORA (para la
// posición, donde mejorar es bajar, se invierte el signo). Sin base de datos.

export const MEASURE_METHOD = 'did-semanal-v1';
export const CHECKPOINTS = [28, 56, 90];
export const GAP_DAYS = 7;

/** Técnicas que no se miden con Search Console por página: de toda la web (sin control limpio) o de la ficha y el mapa. */
export const NOT_MEASURABLE = new Set([
  'velocidad', 'https', 'renderizado', 'adaptar_movil', 'imagenes_optimizadas', 'un_plugin_seo', 'quitar_staging', 'limpiar_hackeo', 'corregir_soft_404',
  'schema_negocio', 'schema_limpieza', 'sitemap_corregido', 'arquitectura', 'web_cambio', 'idiomas_corregidos',
  'recuperar_mapa', 'ficha_google_corregida', 'campana_resenas', 'optimizar_ficha_zona', 'denunciar_spam', 'ficha_google', 'respuesta_resenas', 'nap_coherente', 'nap_antiguo_corregido', 'citaciones_locales',
  'enlaces_externos', 'digital_pr', 'otra', 'investigar_caida'
]);

export type WeekPoint = { week: string; treated: number; control: number };
export type Verdict = 'funciono' | 'no_funciono' | 'no_concluyente' | 'no_medible' | 'sin_datos';

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};
/** log((t+1)/(c+1)) de una semana: el +1 evita dividir por 0 (páginas sin datos). */
const lr = (p: WeekPoint) => Math.log((p.treated + 1) / (p.control + 1));

/**
 * Efecto DiD en logaritmo: media de log(tratadas/control) después menos antes. Error de Welch. Para «posición» se pasa la
 * posición media semanal (menor = mejor): se invierte el signo para que efecto > 0 sea mejora.
 */
export function didEffect(pre: WeekPoint[], post: WeekPoint[], invert = false): { effectLog: number; se: number; t: number } {
  const a = pre.map(lr);
  const b = post.map(lr);
  const sign = invert ? -1 : 1;
  const effectLog = sign * (mean(b) - mean(a));
  // Suelo de 0,05: con series planas o pocas semanas el error saldría 0 (pesos infinitos al agregar).
  const se = Math.max(0.05, Math.sqrt(sd(a) ** 2 / (a.length || 1) + sd(b) ** 2 / (b.length || 1)));
  return { effectLog, se, t: effectLog / se };
}

/** Tendencias paralelas: el «efecto» entre la primera y la segunda mitad del periodo previo debe ser casi cero. */
export function preTrendOk(pre: WeekPoint[], invert = false, maxAbsLog = Math.log(1.15)): boolean {
  if (pre.length < 4) return false;
  const h = Math.floor(pre.length / 2);
  const e = didEffect(pre.slice(0, h), pre.slice(h), invert);
  return Math.abs(e.effectLog) < maxAbsLog || Math.abs(e.t) < 2;
}

export const MIN_BASE: Record<string, number> = { clics: 30, impresiones: 300, posicion: 100, ctr: 100 };

/** Veredicto con umbral simétrico (±15 %) y t ≥ 2; pocos datos o tendencias no paralelas = no concluyente. */
export function verdictOf(opts: { pre: WeekPoint[]; post: WeekPoint[]; metric: string; baseTotal: number; invert?: boolean }): { verdict: Verdict; effectLog: number; se: number; t: number; effectPct: number; preTrend: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const invert = Boolean(opts.invert);
  const e = didEffect(opts.pre, opts.post, invert);
  const preTrend = preTrendOk(opts.pre, invert);
  const effectPct = Math.round((Math.exp(e.effectLog) - 1) * 1000) / 10;
  if (opts.pre.length < 4 || opts.post.length < 4) reasons.push('menos de 4 semanas antes o después');
  if (opts.baseTotal < (MIN_BASE[opts.metric] ?? 30)) reasons.push(`pocos datos antes (${opts.baseTotal} < ${MIN_BASE[opts.metric] ?? 30})`);
  if (!preTrend) reasons.push('antes del cambio ya iban distinto que el resto de la web (sin tendencias paralelas)');
  let verdict: Verdict = 'no_concluyente';
  if (!reasons.length) {
    const big = Math.abs(e.effectLog) >= Math.log(1.15);
    if (big && e.t >= 2) verdict = 'funciono';
    else if (big && e.t <= -2) verdict = 'no_funciono';
    else reasons.push('efecto pequeño o con mucho ruido');
  }
  return { verdict, effectLog: e.effectLog, se: e.se, t: Number.isFinite(e.t) ? e.t : Math.sign(e.t) * 99, effectPct, preTrend, reasons };
}

/** Ventanas de medición alrededor del cambio: pre = [from − semanas, from), post = [to + hueco, to + hueco + días). */
export function windows(effective: { from: Date; to: Date }, postDays: number, preWeeks = 8): { pre: [Date, Date]; post: [Date, Date] } {
  const day = 86_400_000;
  const preEnd = effective.from;
  const preStart = new Date(preEnd.getTime() - preWeeks * 7 * day);
  const postStart = new Date(effective.to.getTime() + GAP_DAYS * day);
  const postEnd = new Date(postStart.getTime() + postDays * day);
  return { pre: [preStart, preEnd], post: [postStart, postEnd] };
}

/** Clics incrementales estimados en el periodo (para la parte 12): base × (e^efecto − 1). */
export function incrementalClicks(basePostClicks: number, effectLog: number): number {
  return Math.round(basePostClicks - basePostClicks / Math.exp(effectLog));
}
