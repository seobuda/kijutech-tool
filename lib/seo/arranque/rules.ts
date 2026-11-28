// SEO · Análisis inicial con etapas y puertas (docs/PLAN-SEO-JEFE.md, fase D0; aprobado por Enric el 27 nov 2026, con la
// auditoría Opus). PURO: sin base de datos ni red; se prueba en tests/seo-arranque.test.ts.
// - El estado de cada etapa se CALCULA siempre con los datos actuales (no se guarda un «hecho» que se quede viejo): la tabla
//   solo guarda la ejecución abierta, lo que un administrador decidió saltar y los errores.
// - Las etapas van por DEPENDENCIAS reales (auditoría, grave 1): el mapa necesita Search Console con historial; la
//   competencia, la demanda y las posiciones necesitan el negocio confirmado.
// - Estados «error» y «esperando a una persona» (auditoría, grave 2): nada se queda esperando para siempre sin decir por qué.
// - Bloquean solo la web, Search Console y las horas (decisión de Enric); lo demás avisa y un admin puede continuar.

export const STAGE_KEYS = ['conexiones', 'web', 'negocio', 'datos', 'mapa', 'mercado', 'diagnostico', 'plan'] as const;
export type StageKey = (typeof STAGE_KEYS)[number];
export const STAGE_LABEL: Record<StageKey, string> = {
  conexiones: 'Conexiones',
  web: 'Web: rastreo, salud y velocidad',
  negocio: 'Negocio: servicios, zona y público',
  datos: 'Datos propios: Search Console',
  mapa: 'Mapa de palabras',
  mercado: 'Mercado: competencia, demanda y posiciones',
  diagnostico: 'Diagnóstico y prioridades',
  plan: 'Plan de servicio (Jefe SEO)'
};
/** De qué etapas depende cada una. */
export const DEPENDS: Record<StageKey, StageKey[]> = {
  conexiones: [],
  web: ['conexiones'],
  negocio: ['web'],
  datos: ['conexiones'],
  mapa: ['datos'],
  mercado: ['negocio'],
  diagnostico: ['web', 'negocio', 'datos', 'mapa', 'mercado'],
  plan: ['diagnostico']
};

export type StageStatus = 'pendiente' | 'bloqueado' | 'en_curso' | 'esperando_persona' | 'error' | 'hecho' | 'sin_datos' | 'omitido';
export const SETTLED: StageStatus[] = ['hecho', 'sin_datos', 'omitido'];

export type GscClass = 'sin_asignar' | 'error' | 'sin_descargar' | 'propiedad_nueva' | 'poco_trafico' | 'con_datos';
export const GSC_CLASS_LABEL: Record<GscClass, string> = {
  sin_asignar: 'Sin asignar',
  error: 'Sin permiso o con error',
  sin_descargar: 'Asignado, descargando el histórico',
  propiedad_nueva: 'Conectado, con poco historial',
  poco_trafico: 'Conectado, con muy poco tráfico',
  con_datos: 'Conectado, con datos'
};
export const MIN_HISTORY_DAYS = 28;
export const MIN_IMPRESSIONS_90 = 300;

/**
 * Clase de Search Console (auditoría, importante 8): solo se clasifica cuando la descarga del histórico ha terminado, con
 * el primer día que tuvo impresiones (no el cursor de la descarga) y con una sola propiedad por web (la de dominio).
 */
export function gscClass(g: { assigned: boolean; status: string | null; lastDate: string | null; backfillDone: boolean; firstImpressionDate: string | null; impressions90: number }, today = new Date()): GscClass {
  if (!g.assigned) return 'sin_asignar';
  if (g.status === 'error') return 'error';
  if (!g.lastDate || !g.backfillDone) return 'sin_descargar';
  const days = g.firstImpressionDate ? Math.floor((today.getTime() - new Date(`${g.firstImpressionDate}T00:00:00Z`).getTime()) / 86_400_000) : 0;
  if (days < MIN_HISTORY_DAYS) return 'propiedad_nueva';
  if (g.impressions90 < MIN_IMPRESSIONS_90) return 'poco_trafico';
  return 'con_datos';
}

export type ConnKey = 'web' | 'search_console' | 'horas' | 'analytics' | 'ficha' | 'acceso_web' | 'dataforseo' | 'wordpress' | 'gohighlevel';
export type ConnStatus = 'conectado' | 'conectado_sin_datos' | 'falta' | 'error' | 'no_aplica';
export const CONN_LABEL: Record<ConnKey, string> = {
  web: 'Web del proyecto',
  search_console: 'Search Console',
  horas: 'Horas contratadas al mes',
  analytics: 'Google Analytics 4',
  ficha: 'Ficha de Google',
  acceso_web: 'Acceso a la web',
  dataforseo: 'DataForSEO (competencia, demanda y posiciones)',
  wordpress: 'WordPress (borradores)',
  gohighlevel: 'GoHighLevel (leads)'
};
export const BLOCKING: ConnKey[] = ['web', 'search_console', 'horas'];
export const SKIPPABLE = new Set<string>([...BLOCKING.map((k) => `conn:${k}`), 'stage:web', 'stage:negocio', 'stage:datos', 'stage:mapa', 'stage:mercado']);

/**
 * Pendiente de D0 (revisor): la descarga del histórico de Search Console que no termina. Atascada si lleva 5 días o más
 * desde que se asignó y no ha avanzado en 2 días (una descarga normal tarda horas; la fecha es la del alta de la propiedad).
 */
export function gscStuck(i: { downloading: boolean; assignedAt: Date | null; lastSyncAt: Date | null }, now = new Date()): boolean {
  if (!i.downloading || !i.assignedAt) return false;
  const days = (now.getTime() - i.assignedAt.getTime()) / 86_400_000;
  const idle = i.lastSyncAt ? (now.getTime() - i.lastSyncAt.getTime()) / 86_400_000 : days;
  return days >= 5 && idle >= 2;
}

export type Facts = {
  web: { url: string | null };
  gsc: GscClass;
  /** La descarga del histórico de Search Console no termina (gscStuck). */
  gscStuck?: boolean;
  monthlyHours: number | null;
  analytics: boolean;
  isLocal: boolean;
  ficha: boolean;
  accesoWeb: boolean;
  dataforseo: boolean;
  budgetOk: boolean;
  wordpress: 'ok' | 'error' | 'falta';
  gohighlevel: 'ok' | 'error' | 'falta';
  /** Rastreo: «reciente» = terminado en los últimos 30 días (no se vuelve a rastrear: auditoría, menor 14). */
  crawl: 'nunca' | 'en_curso' | 'reciente' | 'antiguo' | 'error';
  crawlError: string | null;
  negocio: { propuesto: boolean; confirmado: boolean };
  competidores: { confirmados: number; propuestos: number };
  volumenes: number;
  temas: number;
  planMaestro: 'ninguno' | 'en_curso' | 'hecho';
  /** Lo que un administrador decidió saltar (conexiones o etapas), con quién y por qué. */
  skipped: string[];
  /** Acciones que ya se intentaron 3 veces sin resultado (revisor: los reintentos de pago tienen tope). */
  exhausted?: string[];
};
export const MAX_ATTEMPTS = 3;
const STAGE_ACTIONS: Partial<Record<StageKey, string[]>> = { web: ['rastreo'], negocio: ['propuesta_negocio'], mapa: ['mapa'], mercado: ['competencia', 'demanda', 'posiciones'] };

export type ConnRow = { key: ConnKey; status: ConnStatus; blocking: boolean; skipped: boolean; note: string };

export function connections(f: Facts): ConnRow[] {
  const row = (key: ConnKey, status: ConnStatus, note: string): ConnRow => ({ key, status, blocking: BLOCKING.includes(key), skipped: f.skipped.includes(`conn:${key}`), note });
  return [
    row('web', f.web.url ? 'conectado' : 'falta', f.web.url ?? 'Añade la web al alcance del proyecto (Editar proyecto).'),
    row(
      'search_console',
      f.gsc === 'sin_asignar' ? 'falta' : f.gsc === 'error' ? 'error' : f.gsc === 'con_datos' ? 'conectado' : 'conectado_sin_datos',
      f.gsc === 'sin_asignar' ? 'Asígnalo en la ficha del cliente → Webs y cuentas. Si el cliente no tiene, créalo y añádelo.' : f.gsc === 'error' ? 'La cuenta de servicio no tiene permiso: añádela como usuario en Search Console.' : GSC_CLASS_LABEL[f.gsc]
    ),
    row('horas', f.monthlyHours && f.monthlyHours > 0 ? 'conectado' : 'falta', f.monthlyHours ? `${f.monthlyHours} h al mes` : 'Pon las horas al mes del contrato (Editar proyecto).'),
    row('analytics', f.analytics ? 'conectado' : 'falta', f.analytics ? 'Conectado' : 'Sin Analytics no hay visitas por canal ni conversiones.'),
    row('ficha', !f.isLocal ? 'no_aplica' : f.ficha ? 'conectado' : 'falta', !f.isLocal ? 'No es un negocio local' : f.ficha ? 'Confirmada' : 'Identifica y confirma la ficha de Google (pestaña Local).'),
    row('acceso_web', f.accesoWeb ? 'conectado' : 'falta', f.accesoWeb ? 'Tenemos acceso' : 'Sin acceso a la web, los arreglos técnicos los tendrá que hacer el cliente.'),
    row('dataforseo', f.dataforseo ? (f.budgetOk ? 'conectado' : 'error') : 'falta', !f.dataforseo ? 'Conéctalo en Agentes → Integraciones.' : f.budgetOk ? 'Conectado' : 'El proyecto ha gastado su tope de datos de este mes.'),
    row('wordpress', f.wordpress === 'ok' ? 'conectado' : f.wordpress === 'error' ? 'error' : 'falta', f.wordpress === 'ok' ? 'Borradores activos' : 'Opcional: para crear borradores de artículos.'),
    row('gohighlevel', f.gohighlevel === 'ok' ? 'conectado' : f.gohighlevel === 'error' ? 'error' : 'falta', f.gohighlevel === 'ok' ? 'Leads activos' : 'Opcional: para contar los contactos de la web.')
  ];
}

export function blockers(rows: ConnRow[]): ConnRow[] {
  return rows.filter((r) => r.blocking && !r.skipped && (r.status === 'falta' || r.status === 'error'));
}

export type StageRow = { key: StageKey; status: StageStatus; note: string; who?: 'admin' | 'equipo' | null };

/** Estado de cada etapa con los datos de ahora. Una etapa espera a que sus dependencias estén resueltas. */
export function evaluate(f: Facts): StageRow[] {
  const conn = connections(f);
  const block = blockers(conn);
  const warn = conn.filter((r) => !r.blocking && !r.skipped && (r.status === 'falta' || r.status === 'error'));
  const res = new Map<StageKey, StageRow>();
  const set = (r: StageRow) => res.set(r.key, f.skipped.includes(`stage:${r.key}`) && !SETTLED.includes(r.status) ? { key: r.key, status: 'omitido', note: 'Un administrador decidió continuar sin esta etapa.' } : r);
  const ready = (k: StageKey) => DEPENDS[k].every((d) => SETTLED.includes(res.get(d)?.status ?? 'pendiente'));
  const wait = (k: StageKey): StageRow => ({ key: k, status: 'pendiente', note: `Espera a: ${DEPENDS[k].filter((d) => !SETTLED.includes(res.get(d)?.status ?? 'pendiente')).map((d) => STAGE_LABEL[d]).join(', ')}.` });

  set(
    block.length
      ? { key: 'conexiones', status: 'bloqueado', note: `Falta: ${block.map((b) => CONN_LABEL[b.key]).join(', ')}.`, who: 'admin' }
      : { key: 'conexiones', status: 'hecho', note: warn.length ? `Listo. Avisos: ${warn.map((w) => CONN_LABEL[w.key]).join(', ')}.` : 'Todo conectado.' }
  );
  // Web
  if (!ready('web')) set(wait('web'));
  else if (f.crawl === 'reciente') set({ key: 'web', status: 'hecho', note: 'Rastreo y auditoría al día.' });
  else if (f.crawl === 'en_curso') set({ key: 'web', status: 'en_curso', note: 'Rastreando la web (10-60 min).' });
  else if (f.crawl === 'error') set({ key: 'web', status: 'error', note: `El rastreo falló${f.crawlError ? `: ${f.crawlError}` : ''}. Si la web bloquea robots (403), pide al cliente que nos deje pasar.`, who: 'equipo' });
  else set({ key: 'web', status: 'en_curso', note: f.crawl === 'antiguo' ? 'El último rastreo es antiguo: se rastrea de nuevo.' : 'Se rastrea la web.' });
  // Negocio
  if (!ready('negocio')) set(wait('negocio'));
  else if (f.negocio.confirmado) set({ key: 'negocio', status: 'hecho', note: 'Servicios y zona confirmados.' });
  else if (f.negocio.propuesto) set({ key: 'negocio', status: 'esperando_persona', note: 'La IA ha propuesto servicios y zona: confírmalos en el Expediente (1 clic).', who: 'equipo' });
  else set({ key: 'negocio', status: 'en_curso', note: 'Preparando la propuesta de servicios y zona desde la web.' });
  // Datos propios
  if (!ready('datos')) set(wait('datos'));
  else if (f.gsc === 'con_datos') set({ key: 'datos', status: 'hecho', note: 'Search Console con datos.' });
  else if (f.gsc === 'sin_descargar' && f.gscStuck) set({ key: 'datos', status: 'error', note: 'La descarga del histórico de Search Console no termina (lleva días sin avanzar). Revisa la conexión en la ficha del cliente o en Rendimiento; si sigue igual, avisa a Sistema.', who: 'admin' });
  else if (f.gsc === 'sin_descargar') set({ key: 'datos', status: 'en_curso', note: 'Descargando el histórico de Search Console.' });
  else if (f.gsc === 'error') set({ key: 'datos', status: 'error', note: 'Search Console sin permiso: añade la cuenta de servicio como usuario.', who: 'admin' });
  else set({ key: 'datos', status: 'sin_datos', note: `${GSC_CLASS_LABEL[f.gsc]}: se sigue sin historial y el plan saldrá preliminar.` });
  // Mapa (necesita Search Console con historial)
  if (!ready('mapa')) set(wait('mapa'));
  else if (res.get('datos')?.status !== 'hecho') set({ key: 'mapa', status: 'sin_datos', note: 'Sin historial de Search Console no hay mapa de palabras: lo cubren la demanda y los servicios.' });
  else if (f.temas > 0) set({ key: 'mapa', status: 'hecho', note: `${f.temas} temas.` });
  else set({ key: 'mapa', status: 'en_curso', note: 'Agrupando las búsquedas en temas.' });
  // Mercado (necesita el negocio confirmado y DataForSEO)
  if (!ready('mercado')) set(wait('mercado'));
  else if (!f.dataforseo) set({ key: 'mercado', status: 'esperando_persona', note: 'Conecta DataForSEO (Agentes → Integraciones) para competencia, demanda y posiciones.', who: 'admin' });
  else if (!f.budgetOk) set({ key: 'mercado', status: 'error', note: 'El proyecto ha gastado su tope de datos de este mes: sigue el mes que viene o súbelo.', who: 'admin' });
  else if (f.competidores.confirmados >= 3 && f.volumenes > 0) set({ key: 'mercado', status: 'hecho', note: `${f.competidores.confirmados} competidores confirmados y demanda con volumen.` });
  else if (f.competidores.propuestos > f.competidores.confirmados && f.competidores.confirmados < 3)
    set({ key: 'mercado', status: 'esperando_persona', note: `Hay ${f.competidores.propuestos - f.competidores.confirmados} competidor(es) propuesto(s): confírmalos o descártalos en el Expediente. Si en su zona hay menos de 3, un administrador puede continuar.`, who: 'equipo' });
  else set({ key: 'mercado', status: 'en_curso', note: `Buscando competencia y demanda (${f.competidores.confirmados} competidores confirmados, ${f.volumenes} búsquedas con volumen).` });
  // Diagnóstico: código puro en cuanto todo lo anterior está resuelto.
  if (!ready('diagnostico')) set(wait('diagnostico'));
  else set({ key: 'diagnostico', status: 'hecho', note: 'Prioridades calculadas con lo que hay.' });
  // Plan (fase D2)
  if (!ready('plan')) set(wait('plan'));
  else set(f.planMaestro === 'hecho' ? { key: 'plan', status: 'hecho', note: 'Plan de servicio propuesto.' } : { key: 'plan', status: f.planMaestro === 'en_curso' ? 'en_curso' : 'pendiente', note: 'El plan de servicio del Jefe SEO llega en la fase D2 (en preparación).' });
  // Lo que sigue «en curso» pero ya agotó sus intentos pasa a esperar a una persona (que puede continuar sin la etapa).
  for (const [k, acts] of Object.entries(STAGE_ACTIONS) as [StageKey, string[]][]) {
    const r = res.get(k);
    if (r?.status === 'en_curso' && acts.some((a) => f.exhausted?.includes(a)))
      res.set(k, { key: k, status: 'esperando_persona', note: `${r.note} Se ha intentado ${MAX_ATTEMPTS} veces sin resultado: revísalo o, si no aplica a este cliente, un administrador puede continuar sin esta etapa.`, who: 'admin' });
  }
  return STAGE_KEYS.map((k) => res.get(k)!);
}

export function progress(rows: StageRow[]): { done: number; total: number; current: StageRow | null; needsPerson: StageRow[] } {
  return {
    done: rows.filter((r) => SETTLED.includes(r.status)).length,
    total: rows.length,
    current: rows.find((r) => !SETTLED.includes(r.status)) ?? null,
    needsPerson: rows.filter((r) => r.status === 'esperando_persona' || r.status === 'bloqueado' || r.status === 'error')
  };
}

/** Qué trabajos hay que empujar ahora (el orquestador los encola con la misma clave que el planificador: sin duplicados). */
export function actionsFor(rows: StageRow[], f: Facts): ('rastreo' | 'propuesta_negocio' | 'mapa' | 'competencia' | 'demanda' | 'posiciones')[] {
  const st = new Map(rows.map((r) => [r.key, r.status]));
  const out: ('rastreo' | 'propuesta_negocio' | 'mapa' | 'competencia' | 'demanda' | 'posiciones')[] = [];
  if (st.get('web') === 'en_curso' && (f.crawl === 'nunca' || f.crawl === 'antiguo')) out.push('rastreo');
  if (st.get('negocio') === 'en_curso' && !f.negocio.propuesto && (f.crawl === 'reciente' || st.get('web') === 'omitido')) out.push('propuesta_negocio');
  if (st.get('mapa') === 'en_curso') out.push('mapa');
  if (st.get('mercado') === 'en_curso') {
    if (f.competidores.propuestos + f.competidores.confirmados < 3) out.push('competencia');
    if (f.volumenes === 0) out.push('demanda');
    out.push('posiciones');
  }
  return out;
}
