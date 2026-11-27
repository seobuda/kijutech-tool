// SEO · Jefe SEO, D2: reglas del plan de servicio (docs/PLAN-SEO-JEFE.md §4, con la auditoría Opus). PURO: sin base de datos
// ni red; se prueba en tests/seo-jefe-d2.test.ts.
// Opus propone el plan a 12-24 meses en JSON; aquí el CÓDIGO decide qué se queda: evidencias que existen en el expediente (lo
// inventado se descarta y se apunta), líneas del catálogo elegibles, trimestres dentro del horizonte, horas del primer
// trimestre y como mucho 10 frentes. Después un puntuador por reglas (sin IA) compara el orden con el criterio de la agencia
// y muestra las divergencias: no veta, avisa a quien aprueba.
import { availableHours, lineHours, PLAYBOOKS, MAX_LINES, cleanParams, type PlaybookKey } from '@/lib/seo/estrategia/playbooks';
import { validateEvidence, type Evidence } from '@/lib/seo/jefe/evidence';

export const FRENTE_KINDS = ['rendimiento', 'existente', 'servicio_zona', 'contenido', 'local', 'autoridad', 'visibilidad_ia'] as const;
export type FrenteKind = (typeof FRENTE_KINDS)[number];
export const KIND_LABEL: Record<FrenteKind, string> = {
  rendimiento: 'Arreglos técnicos y rendimiento',
  existente: 'Mejorar lo que ya existe',
  servicio_zona: 'Páginas de servicio y zona',
  contenido: 'Contenido nuevo',
  local: 'SEO local (ficha y reseñas)',
  autoridad: 'Autoridad y enlaces',
  visibilidad_ia: 'Visibilidad en respuestas de IA'
};
/** Líneas del catálogo que puede usar cada tipo de frente (null = frente sin línea: se trabaja con los arreglos o el seguimiento). */
export const KIND_PLAYBOOKS: Record<FrenteKind, (PlaybookKey | null)[]> = {
  rendimiento: [null, 'datos_estructurados'],
  existente: ['refuerzo_al_alcance', 'recuperacion_contenido'],
  servicio_zona: ['paginas_servicio_zona'],
  contenido: ['contenido_cadencia'],
  local: ['local_ficha_resenas'],
  autoridad: ['autoridad_enlaces'],
  visibilidad_ia: [null]
};
export const MAX_FRENTES = 10;
export const CONFIDENCE = ['alta', 'media', 'baja'] as const;

export type PlanFrente = {
  frenteKey: string;
  kind: FrenteKind;
  playbook: PlaybookKey | null;
  params: Record<string, unknown>;
  title: string;
  rationale: string;
  evidence: { id: string; label: string; data: Record<string, unknown> }[];
  fromQuarter: number;
  toQuarter: number;
  priority: 1 | 2 | 3;
  /** Línea que no es elegible hoy: queda condicionada a lo que la bloquea (solo fuera del primer trimestre). */
  conditional: string | null;
};
export type ParsedPlan = {
  thesis: string;
  diagnosis: { text: string; evidence: string[] }[];
  frentes: PlanFrente[];
  risks: string[];
  unknowns: string[];
  discarded: { option: string; reason: string }[];
  confidence: (typeof CONFIDENCE)[number] | null;
};
export type PlanValidation =
  | { ok: true; plan: ParsedPlan; warnings: string[]; rejectedEvidence: string[]; q1Hours: number; q1Available: number | null }
  | { ok: false; errors: string[]; rejectedEvidence: string[] };

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const strList = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);
const int = (v: unknown, d: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : d;
};

/** Saca el primer objeto JSON del texto de la IA (admite que venga entre ```json … ```). */
export function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(t.slice(a, b + 1));
  } catch {
    return null;
  }
}

const keyOf = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9:_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);

/** Valida el plan que propone la IA contra el expediente y el catálogo. */
export function validatePlan(
  raw: unknown,
  ctx: { evidence: Map<string, Evidence>; eligible: string[]; blocked?: { key: string; why: string }[]; horizonMonths: number; monthlyHours: number | null; services?: string[] }
): PlanValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rejected = new Set<string>();
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const thesis = str(o.tesis, 1500);
  if (thesis.length < 20) errors.push('El plan no tiene tesis (la idea central de la estrategia).');
  const quarters = Math.max(1, Math.min(8, Math.round(ctx.horizonMonths / 3)));

  const diagnosis = (Array.isArray(o.diagnostico) ? o.diagnostico : []).slice(0, 8).flatMap((d) => {
    const r = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
    const text = str(r.texto, 600);
    if (!text) return [];
    const v = validateEvidence(r.evidencias, ctx.evidence);
    v.rejected.forEach((x) => rejected.add(x));
    return [{ text, evidence: v.ok.map((e) => e.id) }];
  });

  const frentesRaw = Array.isArray(o.frentes) ? o.frentes : [];
  if (frentesRaw.length > MAX_FRENTES) warnings.push(`La IA propuso ${frentesRaw.length} frentes; se quedan los ${MAX_FRENTES} primeros.`);
  const frentes: PlanFrente[] = [];
  const keys = new Set<string>();
  for (const f of frentesRaw.slice(0, MAX_FRENTES)) {
    const r = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
    const title = str(r.titulo, 200);
    const kind = str(r.tipo, 20) as FrenteKind;
    if (!title) continue;
    if (!FRENTE_KINDS.includes(kind)) {
      warnings.push(`«${title}»: tipo «${kind || '—'}» desconocido; frente descartado.`);
      continue;
    }
    const pbRaw = r.linea == null || r.linea === '' ? null : str(r.linea, 40);
    if (!KIND_PLAYBOOKS[kind].includes(pbRaw as PlaybookKey | null)) {
      warnings.push(`«${title}»: la línea «${pbRaw ?? 'ninguna'}» no corresponde a ${KIND_LABEL[kind]}; frente descartado.`);
      continue;
    }
    const playbook = pbRaw as PlaybookKey | null;
    let fromQ = Math.min(quarters, Math.max(1, int(r.desde_trimestre, 1)));
    let toQ = Math.min(quarters, Math.max(1, int(r.hasta_trimestre, fromQ)));
    if (toQ < fromQ) [fromQ, toQ] = [toQ, fromQ];
    let conditional: string | null = null;
    if (playbook && !ctx.eligible.includes(playbook)) {
      const why = ctx.blocked?.find((b) => b.key === playbook)?.why ?? 'no se puede hacer ahora';
      if (fromQ === 1) {
        warnings.push(`«${title}»: «${PLAYBOOKS[playbook].label}» no se puede hacer ahora (${why}); se mueve al trimestre 2 condicionado.`);
        if (quarters < 2) continue;
        fromQ = 2;
        toQ = Math.max(toQ, 2);
      }
      conditional = why;
    }
    const v = validateEvidence(r.evidencias, ctx.evidence);
    v.rejected.forEach((x) => rejected.add(x));
    if (!v.ok.length) {
      warnings.push(`«${title}»: ninguna evidencia del expediente lo respalda; frente descartado.`);
      continue;
    }
    let frenteKey = keyOf(str(r.clave, 80) || `${kind}:${title}`);
    if (!frenteKey.startsWith(`${kind}`)) frenteKey = keyOf(`${kind}:${frenteKey}`);
    if (keys.has(frenteKey)) {
      warnings.push(`«${title}»: clave repetida (${frenteKey}); frente descartado.`);
      continue;
    }
    keys.add(frenteKey);
    const pr = int(r.prioridad, 2);
    frentes.push({
      frenteKey,
      kind,
      playbook,
      params: playbook ? cleanParams(playbook, (r.parametros as Record<string, unknown>) ?? null, ctx.services ?? []) : {},
      title,
      rationale: str(r.por_que, 1200) || '(sin motivo)',
      evidence: v.ok.map((e) => ({ id: e.id, label: e.label.slice(0, 200), data: e.data })),
      fromQuarter: fromQ,
      toQuarter: toQ,
      priority: (pr <= 1 ? 1 : pr >= 3 ? 3 : 2) as 1 | 2 | 3,
      conditional
    });
  }
  if (!frentes.length) errors.push('Ningún frente del plan se sostiene con los datos del expediente.');

  // Horas del primer trimestre: las líneas que empiezan en el T1 deben caber en lo que deja libre la reserva de arreglos.
  const q1 = frentes.filter((f) => f.fromQuarter === 1 && f.playbook);
  const q1Hours = Math.round(q1.reduce((a, f) => a + lineHours(f.playbook!, f.params, 3), 0) * 10) / 10;
  const q1Available = availableHours(ctx.monthlyHours, 3);
  if (q1Available != null && q1Hours > q1Available) warnings.push(`El primer trimestre necesita ${q1Hours} h y solo hay ${q1Available} h para estrategia: al convertirlo en ciclo habrá que recortar.`);
  if (q1Available == null) warnings.push('El proyecto no tiene horas al mes: no se puede comprobar si el primer trimestre cabe.');
  if (q1.length > MAX_LINES) warnings.push(`El primer trimestre tiene ${q1.length} líneas y un ciclo admite ${MAX_LINES}: el ciclo tomará las de más prioridad.`);
  if (rejected.size) warnings.push(`Se descartaron ${rejected.size} evidencias que no están en el expediente.`);

  const conf = str(o.confianza, 10).toLowerCase();
  const plan: ParsedPlan = {
    thesis,
    diagnosis,
    frentes: frentes.sort((a, b) => a.fromQuarter - b.fromQuarter || a.priority - b.priority),
    risks: strList(o.riesgos, 8, 400),
    unknowns: strList(o.lo_que_no_se, 8, 400),
    discarded: (Array.isArray(o.alternativas_descartadas) ? o.alternativas_descartadas : []).slice(0, 6).flatMap((d) => {
      const r = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
      const option = str(r.opcion, 200);
      return option ? [{ option, reason: str(r.motivo, 400) || '(sin motivo)' }] : [];
    }),
    confidence: (CONFIDENCE as readonly string[]).includes(conf) ? (conf as ParsedPlan['confidence']) : null
  };
  if (!plan.unknowns.length) warnings.push('El plan no dice qué no sabe: desconfía de un plan sin dudas.');
  return errors.length ? { ok: false, errors, rejectedEvidence: [...rejected] } : { ok: true, plan, warnings, rejectedEvidence: [...rejected], q1Hours, q1Available };
}

/** Señales del expediente que piden cada tipo de frente (sin IA). */
export function signals(evidence: Map<string, Evidence>): Record<FrenteKind, number> {
  const s: Record<FrenteKind, number> = { rendimiento: 0, existente: 0, servicio_zona: 0, contenido: 0, local: 0, autoridad: 0, visibilidad_ia: 0 };
  for (const e of evidence.values()) {
    if (e.type === 'H') {
      const sev = String(e.data.gravedad ?? '');
      if (sev === 'critico') s.rendimiento += 3;
      else if (sev === 'importante') s.rendimiento += 1;
      if (/local|ficha|gbp|resen/i.test(e.id)) s.local += 1;
      if (/zona|servicio/i.test(e.id)) s.servicio_zona += 1;
    } else if (e.type === 'Q' && e.data.impresiones90 != null) s.existente += 1;
    else if (e.type === 'U') s.existente += 1;
    else if (e.type === 'Q' && e.data.volumen != null) s.contenido += 1;
    else if (e.type === 'T' && e.data.url === 'sin página') s.contenido += 1;
    else if (e.type === 'C') s.autoridad += 0.5;
  }
  return s;
}

/** Puntuador por reglas: el orden de la agencia (arreglar lo roto → exprimir lo que ya posiciona → páginas de servicio y
 * zona → contenido nuevo → local → autoridad → IA). Divergencias = un tipo que el expediente pide con fuerza y que el plan
 * deja fuera del primer trimestre mientras pone por delante uno posterior. No veta: lo enseña a quien aprueba. */
export function scorePlan(plan: ParsedPlan, evidence: Map<string, Evidence>): { score: number; divergences: string[]; signals: Record<FrenteKind, number> } {
  const sig = signals(evidence);
  const divergences: string[] = [];
  const order = FRENTE_KINDS;
  const q1Kinds = new Set(plan.frentes.filter((f) => f.fromQuarter === 1).map((f) => f.kind));
  const strong = (k: FrenteKind) => sig[k] >= 3;
  let penalty = 0;
  for (let i = 0; i < order.length; i++) {
    const k = order[i];
    if (!strong(k) || q1Kinds.has(k)) continue;
    const later = order.slice(i + 1).filter((x) => q1Kinds.has(x));
    if (later.length) {
      divergences.push(`El expediente pide «${KIND_LABEL[k]}» (señal ${sig[k]}) y el plan empieza por ${later.map((x) => `«${KIND_LABEL[x]}»`).join(', ')}.`);
      penalty += k === 'rendimiento' ? 25 : 15;
    }
  }
  const all = new Set(plan.frentes.map((f) => f.kind));
  for (const k of order) if (sig[k] >= 5 && !all.has(k)) {
    divergences.push(`«${KIND_LABEL[k]}» tiene mucha señal (${sig[k]}) y no aparece en ningún trimestre.`);
    penalty += 10;
  }
  if (!plan.unknowns.length) penalty += 5;
  if (plan.frentes.some((f) => f.evidence.length < 2 && f.priority === 1)) {
    divergences.push('Hay frentes de prioridad 1 con una sola evidencia.');
    penalty += 5;
  }
  return { score: Math.max(0, 100 - penalty), divergences, signals: sig };
}
