// SEO · Jefe SEO, D2: reglas del plan de servicio (docs/PLAN-SEO-JEFE.md §4, con la auditoría Opus). PURO: sin base de datos
// ni red; se prueba en tests/seo-jefe-d2.test.ts.
// Opus propone el plan a 12-24 meses en JSON; aquí el CÓDIGO decide qué se queda: evidencias que existen en el expediente (lo
// inventado se descarta y se apunta), líneas del catálogo elegibles, trimestres dentro del horizonte, horas del primer
// trimestre y como mucho 10 frentes. Después un puntuador por reglas (sin IA) compara el orden con el criterio de la agencia
// y muestra las divergencias: no veta, avisa a quien aprueba.
import { availableHours, lineHours, PLAYBOOKS, MAX_LINES, cleanParams, type PlaybookKey } from '@/lib/seo/estrategia/playbooks';
import { validateEvidence, type Evidence } from '@/lib/seo/jefe/evidence';
import { isLocal, localSignal, type LocalProfile } from '@/lib/seo/jefe/local-profile';
import { SALUD_KIND_BY_KEY } from '@/lib/seo/salud/kinds';

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
  // null = lo básico de la ficha (identificarla, reclamarla, categoría, horario): una vez y sin línea continua.
  local: [null, 'local_ficha_resenas'],
  autoridad: ['autoridad_enlaces'],
  visibilidad_ia: [null]
};
export const MAX_FRENTES = 10;
/** Tipos de evidencia que pueden sostener cada tipo de frente (al menos una de ellas; auditoría Opus). */
export const KIND_EVIDENCE: Record<FrenteKind, string[]> = {
  rendimiento: ['H', 'U'],
  existente: ['Q', 'U', 'T', 'P'],
  servicio_zona: ['T', 'Q', 'P', 'H', 'M'],
  contenido: ['Q', 'T', 'P'],
  local: ['L', 'H', 'M', 'C'],
  autoridad: ['C', 'H', 'X'],
  visibilidad_ia: ['N', 'M', 'T', 'Q', 'C']
};
/** Si más de esta parte de lo citado no existe, el plan no se acepta. */
export const MAX_INVENTED_SHARE = 0.3;
export type PreviousFrente = { frenteKey: string; kind: string; playbook: string | null };
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
  ctx: { evidence: Map<string, Evidence>; eligible: string[]; blocked?: { key: string; why: string }[]; horizonMonths: number; monthlyHours: number | null; services?: string[]; previous?: PreviousFrente[] }
): PlanValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rejected = new Set<string>();
  let cited = 0;
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
    cited += v.ok.length + v.rejected.length;
    return [{ text, evidence: v.ok.map((e) => e.id) }];
  });

  const frentesRaw = Array.isArray(o.frentes) ? o.frentes : [];

  const frentes: PlanFrente[] = [];
  const keys = new Set<string>();
  for (const f of frentesRaw.slice(0, 20)) {
    if (frentes.length >= MAX_FRENTES) {
      warnings.push(`La IA propuso más de ${MAX_FRENTES} frentes válidos; se quedan los ${MAX_FRENTES} primeros.`);
      break;
    }
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
    cited += v.ok.length + v.rejected.length;
    if (!v.ok.length) {
      warnings.push(`«${title}»: ninguna evidencia del expediente lo respalda; frente descartado.`);
      continue;
    }
    if (!v.ok.some((e) => KIND_EVIDENCE[kind].includes(e.type))) {
      warnings.push(`«${title}»: sus datos no son del tipo que sostiene ${KIND_LABEL[kind]}; frente descartado.`);
      continue;
    }
    let frenteKey = keyOf(str(r.clave, 80) || `${kind}:${title}`);
    if (!frenteKey.startsWith(`${kind}`)) frenteKey = keyOf(`${kind}:${frenteKey}`);
    // Claves estables entre versiones (auditoría): si la clave es nueva pero hay un frente anterior del mismo tipo y línea,
    // y solo uno, se reutiliza su clave.
    if (ctx.previous?.length && !ctx.previous.some((p) => p.frenteKey === frenteKey)) {
      const same = ctx.previous.filter((p) => p.kind === kind && p.playbook === playbook && !keys.has(p.frenteKey));
      if (same.length === 1) frenteKey = same[0].frenteKey;
    }
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
  if (cited > 0 && rejected.size / cited > MAX_INVENTED_SHARE) errors.push(`Cita ${rejected.size} de ${cited} datos que no están en el expediente: demasiado inventado.`);

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

/** Señales del expediente que piden cada tipo de frente (sin IA). Lo local sale del grupo «local» de los tipos de hallazgo
 * y de las evidencias L: de la ficha (antes un patrón sobre el id que casi nunca casaba; análisis de Fable 5.2). */
export function signals(evidence: Map<string, Evidence>): Record<FrenteKind, number> {
  const s: Record<FrenteKind, number> = { rendimiento: 0, existente: 0, servicio_zona: 0, contenido: 0, local: 0, autoridad: 0, visibilidad_ia: 0 };
  for (const e of evidence.values()) {
    if (e.type === 'H') {
      const kind = e.id.slice(2);
      const group = SALUD_KIND_BY_KEY.get(kind)?.group;
      const sev = String(e.data.gravedad ?? '');
      if (kind === 'seo.zone_page_missing' || kind === 'seo.service_page_missing') s.servicio_zona += 2;
      else if (group === 'local') s.local += sev === 'critico' ? 3 : sev === 'importante' ? 2 : 1;
      else if (sev === 'critico') s.rendimiento += 3;
      else if (sev === 'importante') s.rendimiento += 1;
    } else if (e.type === 'Q' && e.data.impresiones90 != null) s.existente += 1;
    else if (e.type === 'U') s.existente += 1;
    else if (e.type === 'Q' && e.data.volumen != null) s.contenido += 1;
    else if (e.type === 'T' && e.data.url === 'sin página') s.contenido += 1;
    else if (e.type === 'C') s.autoridad += 0.5;
  }
  s.local += localSignal(evidence.values()).signal;
  return s;
}

/** Nivel de cada tipo de frente según el perfil (menor = antes; mismo nivel = no se penalizan entre sí). Decisión de Enric
 * (27 nov 2026): en negocio local, lo básico de la ficha va con los arreglos, en el primer trimestre. */
export const TIERS: Record<LocalProfile, Record<FrenteKind, number>> = {
  local_fisico: { rendimiento: 0, local: 0, existente: 1, servicio_zona: 2, contenido: 3, autoridad: 4, visibilidad_ia: 5 },
  area_servicio: { rendimiento: 0, local: 1, existente: 1, servicio_zona: 1, contenido: 2, autoridad: 3, visibilidad_ia: 4 },
  online: { rendimiento: 0, existente: 1, servicio_zona: 2, contenido: 3, autoridad: 4, visibilidad_ia: 5, local: 6 },
  sin_publico: { rendimiento: 0, existente: 1, servicio_zona: 2, contenido: 3, autoridad: 4, visibilidad_ia: 5, local: 6 },
  desconocido: { rendimiento: 0, existente: 1, servicio_zona: 2, contenido: 3, local: 4, autoridad: 5, visibilidad_ia: 6 }
};

/** Puntuador por reglas con el orden de la agencia SEGÚN EL PERFIL (lib/seo/jefe/local-profile.ts). Divergencias = un tipo
 * que el expediente pide con fuerza y que el plan deja fuera del T1 mientras pone delante uno de nivel posterior; además,
 * las reglas locales de Enric. No veta: lo enseña a quien aprueba. */
export function scorePlan(plan: ParsedPlan, evidence: Map<string, Evidence>, profile: LocalProfile = 'desconocido'): { score: number; divergences: string[]; signals: Record<FrenteKind, number> } {
  const sig = signals(evidence);
  const tier = TIERS[profile];
  const divergences: string[] = [];
  const q1 = plan.frentes.filter((f) => f.fromQuarter === 1);
  const q1Kinds = new Set(q1.map((f) => f.kind));
  let penalty = 0;
  for (const k of FRENTE_KINDS) {
    if (sig[k] < 3 || q1Kinds.has(k)) continue;
    if (k === 'local' && !isLocal(profile)) continue;
    const later = FRENTE_KINDS.filter((x) => q1Kinds.has(x) && tier[x] > tier[k]);
    if (later.length) {
      divergences.push(`El expediente pide «${KIND_LABEL[k]}» (señal ${sig[k]}) y el plan empieza por ${later.map((x) => `«${KIND_LABEL[x]}»`).join(', ')}.`);
      penalty += k === 'rendimiento' ? 25 : 15;
    }
  }
  const all = new Set(plan.frentes.map((f) => f.kind));
  for (const k of FRENTE_KINDS)
    if (sig[k] >= 5 && !all.has(k) && (k !== 'local' || isLocal(profile))) {
      divergences.push(`«${KIND_LABEL[k]}» tiene mucha señal (${sig[k]}) y no aparece en ningún trimestre.`);
      penalty += 10;
    }
  const local = localSignal(evidence.values());
  if (isLocal(profile) && !q1Kinds.has('local')) {
    divergences.push('Negocio local sin la ficha de Google en el primer trimestre (criterio de la agencia: lo básico de la ficha va siempre al principio).');
    penalty += 20;
  }
  if (!isLocal(profile) && q1.some((f) => f.kind === 'local' && f.priority === 1)) {
    divergences.push(`El negocio ${profile === 'desconocido' ? 'no tiene confirmado cómo atiende' : 'no atiende en local'} y el plan pone la ficha de Google como prioridad 1.`);
    penalty += profile === 'desconocido' ? 5 : 15;
  }
  if (plan.frentes.some((f) => f.playbook === 'local_ficha_resenas') && !local.reviewsNeedWork) {
    divergences.push('Incluye la línea continua de reseñas sin datos de que vaya por detrás de la competencia o parada (criterio: solo si los datos lo piden).');
    penalty += 10;
  }
  if (profile === 'desconocido') divergences.push('Falta confirmar cómo atiende el negocio (local, a domicilio u online): cambia el orden del plan.');
  if (!plan.unknowns.length) penalty += 5;
  if (plan.frentes.some((f) => f.evidence.length < 2 && f.priority === 1)) {
    divergences.push('Hay frentes de prioridad 1 con una sola evidencia.');
    penalty += 5;
  }
  return { score: Math.max(0, 100 - penalty), divergences, signals: sig };
}
