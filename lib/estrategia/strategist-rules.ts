// Módulo Estrategia, fase 2: reglas puras del estratega (sin base de datos, red ni IA). Se prueban en
// tests/estratega.test.ts.
//   - limpiar la respuesta de la IA (JSON) y validar la evidencia contra el expediente (sin evidencia real, fuera)
//   - quitar duplicados frente a encargos abiertos, trabajo hecho y propuestas anteriores
//   - horas a partir de lo que tarda el equipo, prioridad ICE y recorte a las horas que quedan del contrato
//   - mensaje de Telegram con los botones de cada propuesta y estadísticas de calidad (aceptación, ejecución)

export const WORK_CATEGORIES = ['contenido', 'onpage', 'tecnico', 'enlaces', 'gbp', 'web', 'campana', 'informe', 'otro'] as const;
export type WorkCategory = (typeof WORK_CATEGORIES)[number];

export const REJECT_REASONS = { ya_hecho: 'Ya está hecho o en marcha', no_encaja: 'No encaja con el cliente', poco_impacto: 'Poco impacto', sin_horas: 'No hay horas', otro: 'Otro motivo' } as const;
export type RejectReason = keyof typeof REJECT_REASONS;
/** Códigos cortos de los motivos en los botones de Telegram (el dato del botón tiene un máximo de 64 bytes). */
export const REASON_CODE: Record<string, RejectReason> = { yh: 'ya_hecho', ne: 'no_encaja', pi: 'poco_impacto', sh: 'sin_horas', ot: 'otro' };

export const SUGGESTION_STATUS_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  aprobada: 'Encargo creado',
  ajustada: 'Encargo creado (ajustado)',
  aplazada: 'Más adelante',
  rechazada: 'Rechazada',
  caducada: 'Caducada'
};

export type StrategistSettings = { maxSuggestions: number; alertsPerMonth: number; expireDays: number; snoozeDays: number };
export const DEFAULT_STRATEGIST: StrategistSettings = { maxSuggestions: 5, alertsPerMonth: 2, expireDays: 21, snoozeDays: 30 };

const clampInt = (v: unknown, min: number, max: number, def: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
};

export function cleanStrategistSettings(input: unknown): StrategistSettings {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return {
    maxSuggestions: clampInt(o.maxSuggestions, 1, 10, DEFAULT_STRATEGIST.maxSuggestions),
    alertsPerMonth: clampInt(o.alertsPerMonth, 0, 8, DEFAULT_STRATEGIST.alertsPerMonth),
    expireDays: clampInt(o.expireDays, 7, 90, DEFAULT_STRATEGIST.expireDays),
    snoozeDays: clampInt(o.snoozeDays, 7, 120, DEFAULT_STRATEGIST.snoozeDays)
  };
}

// --- Respuesta de la IA ---------------------------------------------------------------------------------------------

export type RawEvidence = { tipo: string; ref: string; periodo: string; dato: string };
export type RawProposal = {
  title: string;
  description: string;
  workType: string;
  category: WorkCategory;
  objectiveRef: string;
  evidence: RawEvidence[];
  expected: { metrica?: string; donde?: string; cambio_pct?: number; dias?: number };
  impact: number;
  confidence: number;
  hours: number;
};
export type StrategistOutput = { summary: string; diagnosis: string[]; learnings: string[]; proposals: RawProposal[] };

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().replace(/\s+\n/g, '\n').slice(0, max) : typeof v === 'number' ? String(v).slice(0, max) : '');
const strList = (v: unknown, n: number, max: number): string[] => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);

/** Normaliza lo que devuelve la IA: tipos, longitudes y rangos. Lo que no tiene título o descripción se quita. */
export function cleanStrategistOutput(raw: unknown, maxProposals: number): StrategistOutput {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(o.propuestas) ? o.propuestas : [];
  const proposals: RawProposal[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const p = item as Record<string, unknown>;
    const title = str(p.titulo, 200);
    const description = str(p.descripcion, 4000);
    if (title.length < 5 || description.length < 20) continue;
    const cat = str(p.categoria, 20).toLowerCase();
    const ev = Array.isArray(p.evidencia) ? p.evidencia : [];
    const exp = (p.efecto_esperado && typeof p.efecto_esperado === 'object' ? p.efecto_esperado : {}) as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
    proposals.push({
      title,
      description,
      workType: str(p.tipo_trabajo, 40),
      category: (WORK_CATEGORIES as readonly string[]).includes(cat) ? (cat as WorkCategory) : 'otro',
      objectiveRef: str(p.objetivo_id, 60),
      evidence: ev
        .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === 'object')
        .map((e) => ({ tipo: str(e.tipo, 20).toLowerCase(), ref: str(e.ref, 500), periodo: str(e.periodo, 80), dato: str(e.dato, 300) }))
        .filter((e) => e.ref)
        .slice(0, 6),
      expected: { metrica: str(exp.metrica, 40) || undefined, donde: str(exp.donde, 300) || undefined, cambio_pct: num(exp.cambio_pct), dias: num(exp.dias) },
      impact: clampInt(p.impacto, 1, 10, 5),
      confidence: clampInt(p.confianza, 1, 10, 5),
      hours: Math.min(80, Math.max(0.5, Math.round((num(p.horas) ?? 2) * 2) / 2))
    });
    if (proposals.length >= Math.max(1, maxProposals) * 2) break;
  }
  return { summary: str(o.resumen, 1500), diagnosis: strList(o.diagnostico, 10, 400), learnings: strList(o.aprendizajes, 8, 400), proposals };
}

// --- Evidencia ------------------------------------------------------------------------------------------------------

/** Lo que el expediente permite citar como evidencia. Señales y objetivos van con su código corto (S1, O2…). */
export type EvidenceRefs = { urls: Set<string>; queries: Set<string>; signals: Set<string>; objectives: Set<string>; keywords: Set<string>; kpis: Set<string> };

export function normUrl(u: string): string {
  try {
    const x = new URL(u.trim());
    return `${x.protocol}//${x.host.toLowerCase().replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '') || ''}${x.search}`;
  } catch {
    return u.trim().toLowerCase();
  }
}
export const normQuery = (q: string): string => q.trim().toLowerCase().replace(/\s+/g, ' ');
const normCode = (c: string): string => c.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

/** ¿La evidencia cita algo que de verdad está en el expediente? */
export function evidenceIsValid(e: RawEvidence, refs: EvidenceRefs): boolean {
  const ref = e.ref;
  switch (e.tipo) {
    case 'url':
      return refs.urls.has(normUrl(ref));
    case 'consulta':
      return refs.queries.has(normQuery(ref)) || refs.keywords.has(normQuery(ref));
    case 'palabra':
      return refs.keywords.has(normQuery(ref)) || refs.queries.has(normQuery(ref));
    case 'senal':
    case 'señal':
      return refs.signals.has(normCode(ref));
    case 'objetivo':
      return refs.objectives.has(normCode(ref));
    case 'kpi':
      return refs.kpis.has(normQuery(ref));
    default:
      // Tipo desconocido: vale si la referencia coincide con algo citable.
      return refs.urls.has(normUrl(ref)) || refs.queries.has(normQuery(ref)) || refs.signals.has(normCode(ref)) || refs.objectives.has(normCode(ref));
  }
}

export function validEvidence(p: RawProposal, refs: EvidenceRefs): RawEvidence[] {
  return p.evidence.filter((e) => evidenceIsValid(e, refs));
}

// --- Duplicados -----------------------------------------------------------------------------------------------------

const STOP = new Set('de la el en y a para con los las del por un una que se al o su sus mas más como sobre desde entre sin hacer crear revisar mejorar optimizar pagina página web'.split(' '));

export function titleTokens(t: string): Set<string> {
  return new Set(
    t
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w))
  );
}

/** Parecido entre dos títulos (0-1): palabras en común sobre las del más corto. */
export function titleSimilarity(a: string, b: string): number {
  const x = titleTokens(a);
  const y = titleTokens(b);
  if (!x.size || !y.size) return 0;
  let common = 0;
  for (const w of x) if (y.has(w)) common++;
  return common / Math.min(x.size, y.size);
}

export const isDuplicate = (title: string, existing: string[], threshold = 0.7): string | null => existing.find((e) => titleSimilarity(title, e) >= threshold) ?? null;

// --- Horas, prioridad y recorte -------------------------------------------------------------------------------------

export type Effort = Record<string, { medianMinutes: number; n: number }>;

/** Horas de la propuesta: las del equipo para ese tipo de trabajo si hay al menos «minCases» encargos; si no, las de la IA. */
export function estimateHours(p: Pick<RawProposal, 'hours' | 'workType'>, effort: Effort, minCases = 3): { hours: number; source: 'equipo' | 'ia' } {
  const e = p.workType ? effort[p.workType] : undefined;
  if (e && e.n >= minCases && e.medianMinutes > 0) return { hours: Math.max(0.5, Math.round((e.medianMinutes / 60) * 2) / 2), source: 'equipo' };
  return { hours: p.hours, source: 'ia' };
}

/** Prioridad ICE: impacto × confianza / horas (las horas, como mínimo media). */
export const iceScore = (impact: number, confidence: number, hours: number): number => Math.round(((impact * confidence) / Math.max(0.5, hours)) * 1000) / 1000;

export type Scored<T> = T & { hours: number; ice: number };

/**
 * Ordena por ICE y recorta: como mucho «max» y, si se sabe, que quepan en las horas que quedan del mes. Si no cabe
 * ninguna, se queda la mejor marcada (overHours) para que nunca se pierda lo más importante.
 */
export function fitToHours<T extends { hours: number; ice: number }>(list: T[], remainingHours: number | null, max: number): { keep: (T & { overHours: boolean })[]; cut: T[] } {
  const sorted = [...list].sort((a, b) => b.ice - a.ice);
  const keep: (T & { overHours: boolean })[] = [];
  const cut: T[] = [];
  let left = remainingHours;
  for (const s of sorted) {
    if (keep.length >= max) {
      cut.push(s);
      continue;
    }
    if (left === null || s.hours <= left + 1e-9) {
      keep.push({ ...s, overHours: false });
      if (left !== null) left -= s.hours;
    } else cut.push(s);
  }
  if (!keep.length && sorted.length) {
    const best = sorted[0];
    cut.splice(cut.indexOf(best), 1);
    keep.push({ ...best, overHours: true });
  }
  return { keep, cut };
}

// --- Telegram -------------------------------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export type Button = { text: string; data: string };

/** Botones de las propuestas pendientes de un análisis: una fila por propuesta. Datos «x:est:<acción>:<id>». */
export function analysisKeyboard(pending: { id: string; rank: number }[]): Button[][] {
  return [...pending]
    .sort((a, b) => a.rank - b.rank)
    .map((p) => [
      { text: `✅ ${p.rank} Crear`, data: `x:est:ok:${p.id}` },
      { text: '✏️ Ajustar', data: `x:est:aj:${p.id}` },
      { text: '⏸️ Luego', data: `x:est:pa:${p.id}` },
      { text: '✖️ No', data: `x:est:no:${p.id}` }
    ]);
}

/** Botones del motivo de un «No». */
export function reasonKeyboard(id: string, rank: number): Button[][] {
  return [
    [
      { text: `${rank}: Ya hecho`, data: `x:est:r:yh:${id}` },
      { text: 'No encaja', data: `x:est:r:ne:${id}` }
    ],
    [
      { text: 'Poco impacto', data: `x:est:r:pi:${id}` },
      { text: 'Sin horas', data: `x:est:r:sh:${id}` }
    ],
    [
      { text: '✍️ Otro motivo', data: `x:est:r:ot:${id}` },
      { text: '↩️ Volver', data: `x:est:bk:${id}` }
    ]
  ];
}

export type MessageSuggestion = { rank: number; title: string; description: string; impact: number; confidence: number; hours: number; hoursSource: string; evidence: { dato: string; ref: string }[]; overHours?: boolean };

/** Mensaje de un análisis para Telegram (HTML escapado, recortado a lo que cabe). */
export function analysisMessage(input: { clientName: string; trigger: string; reason: string | null; summary: string; suggestions: MessageSuggestion[]; link: string | null }): string {
  const head = `🧭 <b>${esc(input.clientName)}</b>: ${input.trigger === 'alerta' ? `análisis por alerta${input.reason ? ` (${esc(input.reason.slice(0, 120))})` : ''}` : 'propuestas del estratega'}`;
  const parts = [head, esc(input.summary.slice(0, 700))];
  for (const s of input.suggestions) {
    const ev = s.evidence[0] ? `\n<i>Dato: ${esc((s.evidence[0].dato || s.evidence[0].ref).slice(0, 160))}</i>` : '';
    const over = s.overHours ? '\n⚠️ No cabe en las horas que quedan este mes.' : '';
    parts.push(`<b>${s.rank}. ${esc(s.title)}</b>\n${esc(s.description.slice(0, 280))}${s.description.length > 280 ? '…' : ''}\nImpacto ${s.impact}/10 · confianza ${s.confidence}/10 · ${fmtHours(s.hours)}${s.hoursSource === 'equipo' ? ' (lo que suele tardar el equipo)' : ''}${ev}${over}`);
  }
  if (!input.suggestions.length) parts.push('No propone tareas nuevas esta vez.');
  if (input.link) parts.push(`<a href="${input.link}">Ver el detalle y la evidencia</a>`);
  let text = parts.join('\n\n');
  if (text.length > 3900) text = `${text.slice(0, 3880)}…`;
  return text;
}

export const fmtHours = (h: number): string => `${String(Math.round(h * 10) / 10).replace('.', ',')} h`;

// --- Calidad --------------------------------------------------------------------------------------------------------

export type QualityRow = { status: string; rejectReason: string | null; executedAt: Date | string | null; decidedAt: Date | string | null; createdAt: Date | string };

/**
 * Aceptación = encargos creados / decididas (sin contar las aplazadas). Ejecución = hechas / encargos creados hace al
 * menos «minAgeDays» (las recientes aún no han tenido tiempo). Motivos de rechazo con su número.
 */
export function qualityStats(rows: QualityRow[], now = new Date(), minAgeDays = 21) {
  const accepted = rows.filter((r) => r.status === 'aprobada' || r.status === 'ajustada');
  const rejected = rows.filter((r) => r.status === 'rechazada');
  const decided = accepted.length + rejected.length;
  const old = accepted.filter((r) => r.decidedAt && now.getTime() - new Date(r.decidedAt).getTime() >= minAgeDays * 86_400_000);
  const reasons: Record<string, number> = {};
  for (const r of rejected) reasons[r.rejectReason ?? 'otro'] = (reasons[r.rejectReason ?? 'otro'] ?? 0) + 1;
  return {
    total: rows.length,
    pending: rows.filter((r) => r.status === 'pendiente').length,
    accepted: accepted.length,
    adjusted: rows.filter((r) => r.status === 'ajustada').length,
    rejected: rejected.length,
    snoozed: rows.filter((r) => r.status === 'aplazada').length,
    expired: rows.filter((r) => r.status === 'caducada').length,
    acceptanceRate: decided ? accepted.length / decided : null,
    executionRate: old.length ? old.filter((r) => r.executedAt).length / old.length : null,
    executedOld: old.filter((r) => r.executedAt).length,
    oldAccepted: old.length,
    reasons
  };
}
