// SEO · Catálogo de líneas de trabajo de una estrategia (ciclo) — docs/PLAN-SEO-CICLOS.md §5, aprobado por Enric el 27 nov
// 2026. PURO (sin base de datos ni red): se prueba en tests/seo-ciclos.test.ts.
// Una estrategia es una combinación de 1-3 líneas de este catálogo con sus parámetros: así se puede comparar entre
// clientes y sectores («a quién le funcionó qué»). El agente elige y parametriza; nunca inventa una línea.

export type PlaybookKey =
  | 'cimientos'
  | 'contenido_cadencia'
  | 'refuerzo_al_alcance'
  | 'paginas_servicio_zona'
  | 'local_ficha_resenas'
  | 'autoridad_enlaces'
  | 'datos_estructurados'
  | 'recuperacion_contenido';

export type Role = 'tecnico' | 'redactor' | 'agente';

/** Lo que el código sabe del proyecto para decidir qué líneas se pueden hacer (sin IA). */
export type EligibilityContext = {
  hasWeb: boolean;
  hasSearchConsole: boolean;
  servicesConfirmed: number;
  zoneConfirmed: boolean;
  hasGoogleProfile: boolean;
  competitorsConfirmed: number;
  topicsWithDemand: number;
  strikingDistance: number;
  decliningPages: number;
  linkGapDomains: number;
  schemaMissing: boolean;
  zonesWithoutPage: number;
};

type ParamDef =
  | { key: string; label: string; kind: 'int'; min: number; max: number; default: number }
  | { key: string; label: string; kind: 'enum'; options: readonly string[]; default: string }
  | { key: string; label: string; kind: 'multi'; options: readonly string[]; default: string[]; min: number };

export type Playbook = {
  key: PlaybookKey;
  version: number;
  label: string;
  description: string;
  role: Role;
  technique: string;
  /** Unidad de trabajo y horas de cada una (la mediana real del equipo, si hay 3 casos o más, la sustituye). */
  unitLabel: string;
  hoursPerUnit: number;
  params: ParamDef[];
  /** Por qué no se puede hacer (null = se puede). */
  ineligible: (c: EligibilityContext) => string | null;
  /** Unidades que salen de los parámetros en `weeks` semanas. */
  units: (p: Record<string, unknown>, weeks: number) => number;
  /** Cada cuántas semanas cae una unidad (para el calendario). */
  everyWeeks: (p: Record<string, unknown>) => number;
  /** Qué se mira al leer los resultados y a cuántos días. */
  readMetric: string;
  readDays: number;
  /** Duración mínima razonable del ciclo en meses (lo técnico cabe en un mes; el contenido necesita un trimestre). */
  minMonths: number;
};

const int = (p: Record<string, unknown>, k: string, d: number) => {
  const n = Number(p[k]);
  return Number.isFinite(n) ? Math.round(n) : d;
};

export const PLAYBOOKS: Record<PlaybookKey, Playbook> = {
  cimientos: {
    key: 'cimientos',
    version: 1,
    label: 'Cimientos',
    description: 'Arreglar lo técnico grave, completar la ficha de Google y dejar la línea base. Es la cola del plan de mejora por reglas: el primer ciclo de todo cliente.',
    role: 'tecnico',
    technique: 'otra',
    unitLabel: 'arreglo',
    hoursPerUnit: 1,
    params: [],
    ineligible: (c) => (c.hasWeb ? null : 'El proyecto no tiene web en su alcance.'),
    units: () => 0,
    everyWeeks: () => 0,
    readMetric: 'Problemas críticos e importantes abiertos',
    readDays: 30,
    minMonths: 1
  },
  contenido_cadencia: {
    key: 'contenido_cadencia',
    version: 1,
    label: 'Contenido con cadencia',
    description: 'Publicar artículos nuevos con un ritmo fijo, con la mezcla de tipos elegida y, si se quiere, centrados en un servicio. Brief con la SERP real y artículo redactado con IA; revisión humana.',
    role: 'redactor',
    technique: 'contenido_nuevo',
    unitLabel: 'artículo',
    hoursPerUnit: 2,
    params: [
      { key: 'porSemana', label: 'Artículos por semana', kind: 'int', min: 1, max: 3, default: 1 },
      { key: 'tipos', label: 'Tipos de artículo', kind: 'multi', options: ['servicio', 'comparativo', 'autoridad', 'local', 'preguntas'], default: ['servicio'], min: 1 },
      { key: 'servicioFoco', label: 'Servicio foco (opcional)', kind: 'enum', options: ['todos'], default: 'todos' }
    ],
    ineligible: (c) => (!c.hasWeb ? 'El proyecto no tiene web.' : c.servicesConfirmed < 1 ? 'Falta confirmar los servicios en el Expediente.' : c.topicsWithDemand < 3 ? 'Hay muy pocos temas con demanda (mapa de palabras o Demanda).' : null),
    units: (p, w) => int(p, 'porSemana', 1) * w,
    everyWeeks: () => 1,
    readMetric: 'Artículos publicados e indexados, impresiones, clics y top 10 de la cohorte, leads en esas URL',
    readDays: 90,
    minMonths: 3
  },
  refuerzo_al_alcance: {
    key: 'refuerzo_al_alcance',
    version: 1,
    label: 'Refuerzo de lo que está cerca',
    description: 'Mejorar páginas que ya están entre las posiciones 4 y 15 (título, contenido, enlazado) para subirlas al top 3.',
    role: 'tecnico',
    technique: 'optimizar_al_alcance',
    unitLabel: 'página',
    hoursPerUnit: 1.5,
    params: [{ key: 'porMes', label: 'Páginas al mes', kind: 'int', min: 1, max: 8, default: 3 }],
    ineligible: (c) => (!c.hasSearchConsole ? 'Necesita Search Console.' : c.strikingDistance < 2 ? 'No hay páginas cerca del top 3.' : null),
    units: (p, w) => Math.round((int(p, 'porMes', 3) * w) / 4.33),
    everyWeeks: (p) => Math.max(1, Math.round(4.33 / int(p, 'porMes', 3))),
    readMetric: 'Posición y clics de cada página frente al resto de la web (medición por intervención)',
    readDays: 56,
    minMonths: 1
  },
  paginas_servicio_zona: {
    key: 'paginas_servicio_zona',
    version: 1,
    label: 'Páginas de servicio y zona',
    description: 'Crear páginas propias por servicio y población donde hay demanda y no hay página (regla anti-páginas puerta: contenido propio de cada sitio).',
    role: 'redactor',
    technique: 'pagina_zona',
    unitLabel: 'página',
    hoursPerUnit: 2.5,
    params: [{ key: 'porMes', label: 'Páginas al mes', kind: 'int', min: 1, max: 4, default: 2 }],
    ineligible: (c) => (!c.zoneConfirmed ? 'Falta confirmar la zona en el Expediente.' : c.zonesWithoutPage < 1 ? 'No hay búsquedas «servicio + población» con demanda y sin página.' : null),
    units: (p, w) => Math.round((int(p, 'porMes', 2) * w) / 4.33),
    everyWeeks: (p) => Math.max(1, Math.round(4.33 / int(p, 'porMes', 2))),
    readMetric: 'Impresiones, clics y posiciones de la búsqueda de cada página nueva; mapa por zonas',
    readDays: 90,
    minMonths: 3
  },
  local_ficha_resenas: {
    key: 'local_ficha_resenas',
    version: 1,
    label: 'Ficha de Google y reseñas',
    // Decisión de Enric (27 nov 2026): las reseñas las pide el cliente con el enlace y la plantilla de la agencia; las
    // publicaciones de la ficha bajan de prioridad (solo si sobran horas).
    description: 'Conseguir reseñas de forma constante (las pide el cliente con el enlace y la plantilla que prepara la agencia) y cuidar la ficha (categorías, servicios, fotos); publicaciones solo si sobran horas.',
    role: 'tecnico',
    technique: 'campana_resenas',
    unitLabel: 'acción',
    hoursPerUnit: 0.75,
    params: [{ key: 'porMes', label: 'Acciones al mes', kind: 'int', min: 1, max: 8, default: 4 }],
    ineligible: (c) => (c.hasGoogleProfile ? null : 'El cliente no tiene ficha de Google identificada (pestaña Local).'),
    units: (p, w) => Math.round((int(p, 'porMes', 4) * w) / 4.33),
    everyWeeks: (p) => Math.max(1, Math.round(4.33 / int(p, 'porMes', 4))),
    readMetric: 'Reseñas nuevas al mes, nota media, mapa por zonas y paquete local',
    readDays: 90,
    minMonths: 3
  },
  autoridad_enlaces: {
    key: 'autoridad_enlaces',
    version: 1,
    label: 'Enlaces desde webs relevantes',
    description: 'Conseguir enlaces de las webs que ya enlazan a la competencia (asociaciones, prensa local, proveedores, directorios del sector de calidad). Nunca comprar enlaces.',
    role: 'tecnico',
    technique: 'enlaces_externos',
    unitLabel: 'contacto',
    hoursPerUnit: 1,
    params: [{ key: 'porMes', label: 'Webs contactadas al mes', kind: 'int', min: 2, max: 12, default: 4 }],
    ineligible: (c) => (c.competitorsConfirmed < 2 ? 'Hacen falta 2 o más competidores confirmados.' : c.linkGapDomains < 5 ? 'No hay huecos de enlaces suficientes (pestaña Autoridad; enciéndela si está apagada).' : null),
    units: (p, w) => Math.round((int(p, 'porMes', 4) * w) / 4.33),
    everyWeeks: (p) => Math.max(1, Math.round(4.33 / int(p, 'porMes', 4))),
    readMetric: 'Dominios que enlazan ganados (Autoridad) y posiciones de las búsquedas principales',
    readDays: 90,
    minMonths: 3
  },
  datos_estructurados: {
    key: 'datos_estructurados',
    version: 1,
    label: 'Datos estructurados',
    description: 'Poner y corregir los datos estructurados del negocio, los servicios y las preguntas frecuentes.',
    role: 'tecnico',
    technique: 'schema_negocio',
    unitLabel: 'plantilla',
    hoursPerUnit: 1,
    params: [{ key: 'total', label: 'Plantillas de página a cubrir', kind: 'int', min: 1, max: 6, default: 2 }],
    ineligible: (c) => (c.schemaMissing ? null : 'Los datos estructurados ya están bien (Salud técnica).'),
    units: (p) => int(p, 'total', 2),
    everyWeeks: () => 2,
    readMetric: 'Errores de datos estructurados resueltos y resultados enriquecidos en Search Console',
    readDays: 42,
    minMonths: 1
  },
  recuperacion_contenido: {
    key: 'recuperacion_contenido',
    version: 1,
    label: 'Recuperar contenido que pierde tráfico',
    description: 'Actualizar las páginas que más clics han perdido en 90 días (contenido, intención, enlazado).',
    role: 'redactor',
    technique: 'recuperar_pagina',
    unitLabel: 'página',
    hoursPerUnit: 1.5,
    params: [{ key: 'porMes', label: 'Páginas al mes', kind: 'int', min: 1, max: 6, default: 2 }],
    ineligible: (c) => (!c.hasSearchConsole ? 'Necesita Search Console.' : c.decliningPages < 1 ? 'No hay páginas que pierdan tráfico.' : null),
    units: (p, w) => Math.round((int(p, 'porMes', 2) * w) / 4.33),
    everyWeeks: (p) => Math.max(1, Math.round(4.33 / int(p, 'porMes', 2))),
    readMetric: 'Clics de cada página frente al resto de la web (medición por intervención)',
    readDays: 56,
    minMonths: 1
  }
};

export const PLAYBOOK_KEYS = Object.keys(PLAYBOOKS) as PlaybookKey[];
export const MAX_LINES = 3;
export const DEFAULT_RESERVE_PCT = 30;

/** Líneas que se pueden hacer en este proyecto y las que no (con el motivo). «Cimientos» no se elige: la crea el sistema. */
export function eligibility(c: EligibilityContext): { eligible: PlaybookKey[]; blocked: { key: PlaybookKey; why: string }[] } {
  const eligible: PlaybookKey[] = [];
  const blocked: { key: PlaybookKey; why: string }[] = [];
  for (const k of PLAYBOOK_KEYS) {
    if (k === 'cimientos') continue;
    const why = PLAYBOOKS[k].ineligible(c);
    if (why) blocked.push({ key: k, why });
    else eligible.push(k);
  }
  return { eligible, blocked };
}

/** Parámetros saneados al rango del catálogo (lo que no está, por defecto). */
export function cleanParams(key: PlaybookKey, raw: Record<string, unknown> | null | undefined, serviceOptions: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const d of PLAYBOOKS[key].params) {
    const v = raw?.[d.key];
    if (d.kind === 'int') {
      const n = Math.round(Number(v));
      out[d.key] = Number.isFinite(n) ? Math.min(d.max, Math.max(d.min, n)) : d.default;
    } else if (d.kind === 'enum') {
      const opts = d.key === 'servicioFoco' ? ['todos', ...serviceOptions] : d.options;
      out[d.key] = typeof v === 'string' && opts.includes(v) ? v : d.default;
    } else {
      const list = Array.isArray(v) ? [...new Set(v.map(String).filter((x) => d.options.includes(x)))] : [];
      out[d.key] = list.length >= d.min ? list : d.default;
    }
  }
  return out;
}

export const weeksOf = (months: number) => Math.round(months * 4.33);

/** Horas de una línea con sus parámetros en un ciclo de `months` meses. */
export function lineHours(key: PlaybookKey, params: Record<string, unknown>, months: number, hoursPerUnit?: number | null): number {
  const pb = PLAYBOOKS[key];
  const h = hoursPerUnit && hoursPerUnit > 0 ? hoursPerUnit : pb.hoursPerUnit;
  return Math.round(pb.units(params, weeksOf(months)) * h * 10) / 10;
}

/** Horas disponibles para las líneas: meses × horas del contrato × (1 − reserva para arreglos). */
export function availableHours(monthlyHours: number | null, months: number, reservePct = DEFAULT_RESERVE_PCT): number | null {
  if (monthlyHours == null || !(monthlyHours > 0)) return null;
  return Math.round(monthlyHours * months * (1 - Math.min(90, Math.max(0, reservePct)) / 100) * 10) / 10;
}

export type LineInput = { playbook: string; params?: Record<string, unknown> | null };

/** Valida una estrategia (de una persona o del agente): líneas del catálogo, elegibles, sin repetir, como mucho 3, y que
 * quepan en las horas. Devuelve las líneas saneadas o los motivos del rechazo. */
export function validateStrategy(
  lines: LineInput[],
  ctx: { eligible: PlaybookKey[]; months: number; monthlyHours: number | null; reservePct?: number; hoursPerUnit?: Partial<Record<PlaybookKey, number>>; services?: string[] }
): { ok: true; lines: { playbook: PlaybookKey; params: Record<string, unknown>; hours: number }[]; hours: number; available: number | null } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const seen = new Set<string>();
  const out: { playbook: PlaybookKey; params: Record<string, unknown>; hours: number }[] = [];
  if (!lines.length) errors.push('La estrategia no tiene ninguna línea de trabajo.');
  if (lines.length > MAX_LINES) errors.push(`Como mucho ${MAX_LINES} líneas por estrategia.`);
  for (const l of lines.slice(0, MAX_LINES)) {
    const key = l.playbook as PlaybookKey;
    if (!(key in PLAYBOOKS) || key === 'cimientos') {
      errors.push(`«${l.playbook}» no está en el catálogo.`);
      continue;
    }
    if (seen.has(key)) {
      errors.push(`«${PLAYBOOKS[key].label}» está repetida.`);
      continue;
    }
    seen.add(key);
    if (!ctx.eligible.includes(key)) {
      errors.push(`«${PLAYBOOKS[key].label}» no se puede hacer ahora en este proyecto.`);
      continue;
    }
    if (ctx.months < PLAYBOOKS[key].minMonths) errors.push(`«${PLAYBOOKS[key].label}» necesita un ciclo de ${PLAYBOOKS[key].minMonths} meses o más.`);
    const params = cleanParams(key, l.params, ctx.services ?? []);
    out.push({ playbook: key, params, hours: lineHours(key, params, ctx.months, ctx.hoursPerUnit?.[key]) });
  }
  const hours = Math.round(out.reduce((a, l) => a + l.hours, 0) * 10) / 10;
  const available = availableHours(ctx.monthlyHours, ctx.months, ctx.reservePct);
  if (available != null && hours > available) errors.push(`Necesita ${hours} h y solo hay ${available} h para estrategia en el ciclo (el resto se reserva para arreglos).`);
  return errors.length ? { ok: false, errors } : { ok: true, lines: out, hours, available };
}

/** Lunes (UTC) de la semana de una fecha. */
export function mondayOf(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}

/** Calendario de una línea: una fecha (lunes) por unidad, repartidas cada `everyWeeks` semanas desde el inicio. */
export function expandSlots(key: PlaybookKey, params: Record<string, unknown>, startsOn: Date, months: number): { week: string; n: number }[] {
  const pb = PLAYBOOKS[key];
  const weeks = weeksOf(months);
  const total = pb.units(params, weeks);
  if (!total) return [];
  const step = pb.everyWeeks(params);
  const perWeek = key === 'contenido_cadencia' ? int(params, 'porSemana', 1) : 1;
  const start = mondayOf(startsOn);
  const out: { week: string; n: number }[] = [];
  for (let i = 0; out.length < total && i < weeks * 2; i += step || 1) {
    if (i >= weeks) break;
    const w = new Date(start.getTime() + i * 7 * 86_400_000).toISOString().slice(0, 10);
    for (let k = 0; k < perWeek && out.length < total; k++) out.push({ week: w, n: out.length + 1 });
  }
  return out;
}
