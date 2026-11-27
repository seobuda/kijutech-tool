// SEO · Análisis inicial con etapas y puertas (docs/PLAN-SEO-JEFE.md, fase D0; aprobado por Enric el 27 nov 2026). PURO:
// sin base de datos ni red; se prueba en tests/seo-arranque.test.ts. El orquestador (arranque.ts) junta los hechos y aquí
// se decide, etapa a etapa, si está pendiente, bloqueada, en curso, hecha, sin datos u omitida.
// Decisión de Enric: BLOQUEAN solo lo imprescindible (la web, Search Console asignado y las horas contratadas); lo demás
// (Analytics, ficha de Google, WordPress, GoHighLevel, acceso a la web) avisa y un administrador puede continuar sin ello.

export const STAGE_KEYS = ['conexiones', 'web', 'negocio', 'datos', 'mercado', 'mapa', 'diagnostico', 'plan'] as const;
export type StageKey = (typeof STAGE_KEYS)[number];
export const STAGE_LABEL: Record<StageKey, string> = {
  conexiones: 'Conexiones',
  web: 'Web: rastreo, salud y velocidad',
  negocio: 'Negocio: servicios, zona y público',
  datos: 'Datos propios: Search Console, Analytics y leads',
  mercado: 'Mercado: competencia, demanda, posiciones y local',
  mapa: 'Mapa de palabras',
  diagnostico: 'Diagnóstico y prioridades',
  plan: 'Plan de servicio (Jefe SEO)'
};

export type StageStatus = 'pendiente' | 'bloqueado' | 'en_curso' | 'hecho' | 'sin_datos' | 'omitido';

/** Clase de Search Console (con sus datos descargados): distingue «conectado pero sin historial». */
export type GscClass = 'sin_asignar' | 'sin_descargar' | 'propiedad_nueva' | 'poco_trafico' | 'con_datos';
export const GSC_CLASS_LABEL: Record<GscClass, string> = {
  sin_asignar: 'Sin asignar',
  sin_descargar: 'Asignado, aún sin descargar',
  propiedad_nueva: 'Conectado, con poco historial',
  poco_trafico: 'Conectado, con muy poco tráfico',
  con_datos: 'Conectado, con datos'
};
export const MIN_HISTORY_DAYS = 28;
export const MIN_IMPRESSIONS_90 = 300;

export function gscClass(g: { assigned: boolean; firstDate: string | null; lastDate: string | null; impressions90: number }, today = new Date()): GscClass {
  if (!g.assigned) return 'sin_asignar';
  if (!g.lastDate) return 'sin_descargar';
  const days = g.firstDate ? Math.floor((today.getTime() - new Date(`${g.firstDate}T00:00:00Z`).getTime()) / 86_400_000) : 0;
  if (days < MIN_HISTORY_DAYS) return 'propiedad_nueva';
  if (g.impressions90 < MIN_IMPRESSIONS_90) return 'poco_trafico';
  return 'con_datos';
}

export type ConnKey = 'web' | 'search_console' | 'horas' | 'analytics' | 'ficha' | 'acceso_web' | 'wordpress' | 'gohighlevel';
export type ConnStatus = 'conectado' | 'conectado_sin_datos' | 'falta' | 'error' | 'no_aplica';
export const CONN_LABEL: Record<ConnKey, string> = {
  web: 'Web del proyecto',
  search_console: 'Search Console',
  horas: 'Horas contratadas al mes',
  analytics: 'Google Analytics 4',
  ficha: 'Ficha de Google',
  acceso_web: 'Acceso a la web',
  wordpress: 'WordPress (borradores)',
  gohighlevel: 'GoHighLevel (leads)'
};
/** Lo que bloquea el arranque (decisión de Enric). */
export const BLOCKING: ConnKey[] = ['web', 'search_console', 'horas'];

export type Facts = {
  web: { url: string | null; responds: boolean | null };
  gsc: GscClass;
  monthlyHours: number | null;
  analytics: 'conectado' | 'falta' | 'error';
  ficha: boolean;
  /** El negocio es local (tiene zona/dirección): sin ficha, avisa; si no es local, no aplica. */
  isLocal: boolean;
  accesoWeb: boolean;
  wordpress: 'ok' | 'error' | 'falta';
  gohighlevel: 'ok' | 'error' | 'falta';
  /** Lo que un administrador decidió continuar sin tener (queda apuntado). */
  skipped: ConnKey[];
  crawl: 'nunca' | 'en_curso' | 'hecho' | 'error';
  negocio: { propuesto: boolean; confirmado: boolean };
  competidores: number;
  volumenes: number;
  posiciones: boolean;
  temas: number;
  diagnostico: boolean;
  planMaestro: 'ninguno' | 'en_curso' | 'hecho';
};

export type ConnRow = { key: ConnKey; status: ConnStatus; blocking: boolean; skipped: boolean; note: string };

export function connections(f: Facts): ConnRow[] {
  const row = (key: ConnKey, status: ConnStatus, note: string): ConnRow => ({ key, status, blocking: BLOCKING.includes(key), skipped: f.skipped.includes(key), note });
  return [
    row('web', !f.web.url ? 'falta' : f.web.responds === false ? 'error' : 'conectado', !f.web.url ? 'Añade la web al alcance del proyecto (Editar proyecto).' : f.web.responds === false ? 'La web no responde: revísala antes de seguir.' : f.web.url),
    row(
      'search_console',
      f.gsc === 'sin_asignar' ? 'falta' : f.gsc === 'con_datos' ? 'conectado' : 'conectado_sin_datos',
      f.gsc === 'sin_asignar' ? 'Asigna la propiedad en la ficha del cliente → Webs y cuentas. Si el cliente no tiene, créala y añádela.' : GSC_CLASS_LABEL[f.gsc] + (f.gsc === 'propiedad_nueva' || f.gsc === 'sin_descargar' ? ': el plan será preliminar y se rehará solo cuando haya historial.' : '')
    ),
    row('horas', f.monthlyHours && f.monthlyHours > 0 ? 'conectado' : 'falta', f.monthlyHours ? `${f.monthlyHours} h al mes` : 'Pon las horas al mes del contrato (Editar proyecto): sin ellas no se puede repartir el trabajo.'),
    row('analytics', f.analytics === 'conectado' ? 'conectado' : f.analytics === 'error' ? 'error' : 'falta', f.analytics === 'conectado' ? 'Conectado' : 'Sin Analytics no hay visitas por canal ni conversiones.'),
    row('ficha', !f.isLocal ? 'no_aplica' : f.ficha ? 'conectado' : 'falta', !f.isLocal ? 'No es un negocio local' : f.ficha ? 'Confirmada' : 'Identifica y confirma la ficha de Google en la pestaña Local.'),
    row('acceso_web', f.accesoWeb ? 'conectado' : 'falta', f.accesoWeb ? 'Tenemos acceso' : 'Sin acceso a la web, los arreglos técnicos los tendrá que hacer el cliente.'),
    row('wordpress', f.wordpress === 'ok' ? 'conectado' : f.wordpress === 'error' ? 'error' : 'falta', f.wordpress === 'ok' ? 'Borradores activos' : 'Opcional: para crear borradores de artículos.'),
    row('gohighlevel', f.gohighlevel === 'ok' ? 'conectado' : f.gohighlevel === 'error' ? 'error' : 'falta', f.gohighlevel === 'ok' ? 'Leads activos' : 'Opcional: para contar los contactos de la web.')
  ];
}

/** ¿Las conexiones dejan arrancar? Bloquean las imprescindibles que faltan o fallan y no se han saltado. */
export function blockers(rows: ConnRow[]): ConnRow[] {
  return rows.filter((r) => r.blocking && !r.skipped && (r.status === 'falta' || r.status === 'error'));
}

export type StageRow = { key: StageKey; status: StageStatus; note: string };

/** Estado de cada etapa, en orden. Una etapa no empieza hasta que la anterior está hecha (o sin datos u omitida). */
export function evaluate(f: Facts): StageRow[] {
  const conn = connections(f);
  const block = blockers(conn);
  const warn = conn.filter((r) => !r.blocking && !r.skipped && (r.status === 'falta' || r.status === 'error'));
  const out: StageRow[] = [];
  out.push(
    block.length
      ? { key: 'conexiones', status: 'bloqueado', note: `Falta: ${block.map((b) => CONN_LABEL[b.key]).join(', ')}.` }
      : { key: 'conexiones', status: 'hecho', note: warn.length ? `Listo. Avisos: ${warn.map((w) => CONN_LABEL[w.key]).join(', ')}.` : 'Todo conectado.' }
  );
  const prevOk = () => ['hecho', 'sin_datos', 'omitido'].includes(out[out.length - 1].status);
  const next = (key: StageKey, done: boolean, running: boolean, noteDone: string, notePending: string, noData = false) => {
    if (!prevOk()) return out.push({ key, status: 'pendiente', note: 'Espera a la etapa anterior.' });
    if (noData) return out.push({ key, status: 'sin_datos', note: noteDone });
    out.push(done ? { key, status: 'hecho', note: noteDone } : { key, status: running ? 'en_curso' : 'pendiente', note: notePending });
  };
  next('web', f.crawl === 'hecho', f.crawl === 'en_curso', 'Rastreo y auditoría hechos.', f.crawl === 'error' ? 'El rastreo falló: se reintentará.' : 'Rastreando la web (10-60 min).');
  next('negocio', f.negocio.confirmado, f.negocio.propuesto, 'Servicios y zona confirmados.', f.negocio.propuesto ? 'La IA ha propuesto servicios y zona: confírmalos en el Expediente.' : 'Preparando la propuesta de la ficha.');
  next(
    'datos',
    f.gsc === 'con_datos',
    f.gsc === 'sin_descargar',
    'Search Console con datos.',
    'Descargando Search Console.',
    f.gsc === 'propiedad_nueva' || f.gsc === 'poco_trafico'
  );
  if (out[out.length - 1].key === 'datos' && out[out.length - 1].status === 'sin_datos') out[out.length - 1].note = `${GSC_CLASS_LABEL[f.gsc]}: se sigue en «modo sin historial» y el plan será preliminar.`;
  next('mercado', f.competidores >= 3 && f.volumenes > 0, true, `${f.competidores} competidores y demanda con volumen${f.posiciones ? '; posiciones consultadas' : ''}.`, `Buscando competencia y demanda (${f.competidores} competidores, ${f.volumenes} búsquedas con volumen). Confirma la competencia en el Expediente.`);
  next('mapa', f.temas > 0, true, `${f.temas} temas.`, 'Agrupando las búsquedas en temas.', f.gsc !== 'con_datos' && f.temas === 0);
  if (out[out.length - 1].key === 'mapa' && out[out.length - 1].status === 'sin_datos') out[out.length - 1].note = 'Sin historial de Search Console aún: el mapa se hará cuando haya datos (la demanda ya cubre lo básico).';
  next('diagnostico', f.diagnostico, true, 'Prioridades calculadas.', 'Calculando prioridades.');
  next('plan', f.planMaestro === 'hecho', f.planMaestro === 'en_curso', 'Plan de servicio propuesto.', 'El plan de servicio del Jefe SEO llega en la fase D2 (en preparación).');
  return out;
}

export function progress(rows: StageRow[]): { done: number; total: number; current: StageRow | null } {
  const done = rows.filter((r) => ['hecho', 'sin_datos', 'omitido'].includes(r.status)).length;
  return { done, total: rows.length, current: rows.find((r) => !['hecho', 'sin_datos', 'omitido'].includes(r.status)) ?? null };
}
