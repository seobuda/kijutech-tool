// SEO · Jefe SEO, D2: casos del examen del prompt del plan de servicio (seo_jefe_plan_maestro). PURO.
// Expedientes sintéticos (negocios inventados, sin datos de clientes) con respuesta conocida, corregidos SIN IA por las
// mismas reglas que el plan real: ninguna evidencia inventada, líneas elegibles, el primer trimestre cabe, dice lo que no
// sabe y, según el caso, respeta el orden de la agencia.
import { availableHours, PLAYBOOKS, type PlaybookKey } from '@/lib/seo/estrategia/playbooks';
import { evidenceId, evidenceLine, type Evidence } from '@/lib/seo/jefe/evidence';
import { scorePlan, validatePlan, type FrenteKind } from '@/lib/seo/jefe/plan-rules';

export type PlanEvalCase = {
  key: string;
  title: string;
  evidence: Map<string, Evidence>;
  text: string;
  eligible: PlaybookKey[];
  blocked: { key: PlaybookKey; why: string }[];
  monthlyHours: number | null;
  horizonMonths: number;
  /** Tipo de frente que debe aparecer en el trimestre 1. */
  mustQ1?: FrenteKind;
  /** Confianza que no debe dar (p. ej. «alta» sin Search Console). */
  notConfidence?: string;
};
export type EvalCheck = { name: string; pass: boolean; detail: string };

function build(
  key: string,
  title: string,
  header: string,
  ev: Evidence[],
  eligible: PlaybookKey[],
  blocked: { key: PlaybookKey; why: string }[],
  monthlyHours: number | null,
  extra: Partial<PlanEvalCase> = {}
): PlanEvalCase {
  const evidence = new Map(ev.map((e) => [e.id, e]));
  const lines = ev.map((e) => evidenceLine(e, e.type !== 'H' && e.type !== 'S'));
  const text = `## Proyecto\n${header}\nHoras al mes: ${monthlyHours ?? '(sin poner)'} · horas para estrategia en un trimestre (30 % de reserva): ${availableHours(monthlyHours, 3) ?? '—'}\nLíneas del catálogo que se pueden hacer: ${eligible.map((k) => `${k} (${PLAYBOOKS[k].label})`).join(', ') || 'ninguna'}\nNo se pueden hacer: ${blocked.map((b) => `${b.key}: ${b.why}`).join('; ') || '—'}\n\n## Datos\n${lines.join('\n')}`;
  return { key, title, evidence, text, eligible, blocked, monthlyHours, horizonMonths: 12, ...extra };
}

const H = (k: string, label: string, sev: string, n: number): Evidence => ({ id: evidenceId('H', k), type: 'H', label, data: { gravedad: sev, casos: n } });
const Qs = (q: string, pos: number, imp: number, pron: string): Evidence => ({ id: evidenceId('Q', q), type: 'Q', label: q, data: { posicion: pos, impresiones90: imp, pronostico: pron } });
const Qd = (q: string, vol: number): Evidence => ({ id: evidenceId('Q', q), type: 'Q', label: q, data: { volumen: vol, pronosticoContenidoNuevo: `rango ${Math.round(vol * 0.02)}-${Math.round(vol * 0.12)} clics/mes (sin verificar)` } });
const T = (k: string, label: string, url: string): Evidence => ({ id: evidenceId('T', k), type: 'T', label, data: { url } });

export function planEvalCases(): PlanEvalCase[] {
  return [
    build(
      'web-rota',
      'Web con fallos críticos: empieza por arreglar lo roto',
      'Cliente: Reformas ejemplo (reformas integrales) · Zona: Terrassa · Search Console: conectada, 90 días',
      [
        { id: 'S:gsc', type: 'S', label: 'Search Console 90 días', data: { clics: 410, impresiones: 38000, clicsAnteriores: 620 } },
        H('seo.noindex_important', 'Páginas importantes con noindex', 'critico', 4),
        H('seo.broken_internal', 'Enlaces internos rotos', 'critico', 22),
        H('seo.title_missing', 'Páginas sin título', 'importante', 9),
        Qs('reformas integrales terrassa', 8.4, 5200, 'rango 40-150 clics/mes si llega al top 3 (sin verificar)'),
        Qs('reformar baño terrassa', 6.1, 2100, 'rango 15-60 clics/mes si llega al top 3 (sin verificar)'),
        Qd('precio reforma cocina', 1900),
        T('reforma_cocina', 'Reforma de cocinas', 'sin página')
      ],
      ['refuerzo_al_alcance', 'contenido_cadencia', 'datos_estructurados', 'paginas_servicio_zona'],
      [
        { key: 'local_ficha_resenas', why: 'no hay ficha de Google confirmada' },
        { key: 'autoridad_enlaces', why: 'sin competencia confirmada' }
      ],
      20,
      { mustQ1: 'rendimiento' }
    ),
    build(
      'cerca-del-top',
      'Web sana con búsquedas cerca del top 3: exprimir lo que ya posiciona',
      'Cliente: Taller ejemplo (taller de motos) · Zona: Sabadell · Search Console: conectada, 90 días',
      [
        { id: 'S:gsc', type: 'S', label: 'Search Console 90 días', data: { clics: 1300, impresiones: 61000 } },
        H('seo.meta_description_missing', 'Páginas sin meta descripción', 'aviso', 5),
        Qs('taller motos sabadell', 5.2, 9100, 'rango 90-300 clics/mes si llega al top 3 (sin verificar)'),
        Qs('cambio aceite moto sabadell', 7.8, 3300, 'rango 20-90 clics/mes si llega al top 3 (sin verificar)'),
        Qs('itv moto sabadell', 9.5, 4000, 'rango 25-110 clics/mes si llega al top 3 (sin verificar)'),
        { id: evidenceId('U', 'https://ejemplo-taller.test/neumaticos'), type: 'U', label: 'https://ejemplo-taller.test/neumaticos', data: { perdida: 38, causa: 'bajada de posiciones' } },
        Qd('neumaticos moto precio', 1400)
      ],
      ['refuerzo_al_alcance', 'recuperacion_contenido', 'contenido_cadencia', 'local_ficha_resenas'],
      [{ key: 'paginas_servicio_zona', why: 'zona sin confirmar' }],
      12,
      { mustQ1: 'existente' }
    ),
    build(
      'sin-datos',
      'Proyecto nuevo sin Search Console: plan prudente y dice lo que no sabe',
      'Cliente: Clínica ejemplo (fisioterapia) · Zona: Sant Cugat · Search Console: SIN CONECTAR (no hay datos de clics)',
      [H('seo.slow_lcp', 'Carga lenta en móvil (LCP)', 'importante', 3), Qd('fisioterapeuta sant cugat', 880), Qd('fisioterapia deportiva sant cugat', 320), T('fisio_deportiva', 'Fisioterapia deportiva', 'sin página')],
      ['contenido_cadencia', 'paginas_servicio_zona'],
      [
        { key: 'refuerzo_al_alcance', why: 'sin Search Console' },
        { key: 'recuperacion_contenido', why: 'sin Search Console' }
      ],
      10,
      { notConfidence: 'alta' }
    )
  ];
}

/** Corrige la respuesta de la IA para un caso (sin IA). */
export function gradePlan(raw: unknown, c: PlanEvalCase): EvalCheck[] {
  const v = validatePlan(raw, { evidence: c.evidence, eligible: c.eligible, blocked: c.blocked, horizonMonths: c.horizonMonths, monthlyHours: c.monthlyHours });
  const checks: EvalCheck[] = [{ name: 'plan válido', pass: v.ok, detail: v.ok ? `${v.plan.frentes.length} frentes` : v.errors.join(' ') }];
  checks.push({ name: 'ninguna evidencia inventada', pass: v.rejectedEvidence.length === 0, detail: v.rejectedEvidence.length ? `inventadas: ${v.rejectedEvidence.slice(0, 5).join(', ')}` : 'todas existen' });
  if (!v.ok) return checks;
  const bad = v.warnings.filter((w) => /descartado|no se puede hacer ahora/.test(w));
  checks.push({ name: 'líneas y tipos correctos', pass: bad.length === 0, detail: bad.join(' ') || 'todas elegibles y del tipo que toca' });
  checks.push({ name: 'el primer trimestre cabe', pass: v.q1Available == null || v.q1Hours <= v.q1Available, detail: `${v.q1Hours} h de ${v.q1Available ?? '—'} h` });
  checks.push({ name: 'dice lo que no sabe', pass: v.plan.unknowns.length > 0, detail: `${v.plan.unknowns.length} dudas` });
  if (c.mustQ1) {
    const q1 = v.plan.frentes.filter((f) => f.fromQuarter === 1).map((f) => f.kind);
    checks.push({ name: `empieza por ${c.mustQ1}`, pass: q1.includes(c.mustQ1), detail: `T1: ${q1.join(', ') || '—'}` });
  }
  if (c.notConfidence) checks.push({ name: `confianza no ${c.notConfidence}`, pass: v.plan.confidence !== c.notConfidence, detail: `confianza: ${v.plan.confidence ?? '—'}` });
  const s = scorePlan(v.plan, c.evidence);
  checks.push({ name: 'orden de la agencia', pass: s.score >= 70, detail: `${s.score}/100${s.divergences.length ? ` · ${s.divergences[0]}` : ''}` });
  return checks;
}
