// SEO · Jefe SEO, D2: casos del examen del prompt del plan de servicio (seo_jefe_plan_maestro). PURO.
// Expedientes sintéticos (negocios inventados, sin datos de clientes) con respuesta conocida, corregidos SIN IA por las
// mismas reglas que el plan real: ninguna evidencia inventada, líneas elegibles, el primer trimestre cabe, dice lo que no
// sabe y, según el caso, respeta el orden de la agencia.
import { availableHours, PLAYBOOKS, type PlaybookKey } from '@/lib/seo/estrategia/playbooks';
import { evidenceId, evidenceLine, type Evidence } from '@/lib/seo/jefe/evidence';
import { scorePlan, validatePlan, type FrenteKind } from '@/lib/seo/jefe/plan-rules';
import { PROFILE_LABEL, type LocalProfile } from '@/lib/seo/jefe/local-profile';

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
  /** Cómo atiende el negocio (cambia el orden de la agencia). */
  profile: LocalProfile;
  /** Tipo de frente que NO debe ir en el trimestre 1. */
  mustNotQ1?: FrenteKind;
  /** Línea que no debe aparecer (p. ej. reseñas continuas cuando ya va por delante). */
  noPlaybook?: PlaybookKey;
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
  const profile = extra.profile ?? 'desconocido';
  const line = (e: Evidence) => evidenceLine(e, e.type !== 'H' && e.type !== 'S');
  const lines = ev.filter((e) => e.type !== 'L').map(line);
  const localLines = ev.filter((e) => e.type === 'L').map(line);
  const text = `## Proyecto\n${header}\nHoras al mes: ${monthlyHours ?? '(sin poner)'} · horas para estrategia en un trimestre (30 % de reserva): ${availableHours(monthlyHours, 3) ?? '—'}\nLíneas del catálogo que se pueden hacer: ${eligible.map((k) => `${k} (${PLAYBOOKS[k].label})`).join(', ') || 'ninguna'}\nNo se pueden hacer: ${blocked.map((b) => `${b.key}: ${b.why}`).join('; ') || '—'}\n\n## Datos\n${lines.join('\n')}\n\n## Ficha de Google y mapa (cómo atiende: ${PROFILE_LABEL[profile]})\n${localLines.join('\n') || 'Sin datos de ficha ni de mapa.'}`;
  return { key, title, evidence, text, eligible, blocked, monthlyHours, horizonMonths: 12, ...extra, profile };
}

const H = (k: string, label: string, sev: string, n: number): Evidence => ({ id: evidenceId('H', k), type: 'H', label, data: { gravedad: sev, casos: n } });
const Qs = (q: string, pos: number, imp: number, pron: string): Evidence => ({ id: evidenceId('Q', q), type: 'Q', label: q, data: { posicion: pos, impresiones90: imp, pronostico: pron } });
const Qd = (q: string, vol: number): Evidence => ({ id: evidenceId('Q', q), type: 'Q', label: q, data: { volumen: vol, pronosticoContenidoNuevo: `rango ${Math.round(vol * 0.02)}-${Math.round(vol * 0.12)} clics/mes (sin verificar)` } });
const T = (k: string, label: string, url: string): Evidence => ({ id: evidenceId('T', k), type: 'T', label, data: { url } });
const L = (k: string, label: string, data: Record<string, unknown>): Evidence => ({ id: evidenceId('L', k), type: 'L', label, data });
const FICHA_OK = { reclamada: 'sí', categoria: 'Fisioterapeuta', categoriasExtra: 2, horario: 'sí', estado: 'OPERATIONAL' };

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
    ),
    build(
      'clinica-ficha-floja',
      'Clínica de barrio con la ficha floja: la ficha va en el primer trimestre',
      'Cliente: Clínica ejemplo 2 (fisioterapia) · Zona: Sabadell · Search Console: conectada, 90 días',
      [
        { id: 'S:gsc', type: 'S', label: 'Search Console 90 días', data: { clics: 220, impresiones: 14000 } },
        Qd('fisioterapia sabadell', 1600),
        Qd('fisioterapia suelo pelvico sabadell', 260),
        T('suelo_pelvico', 'Suelo pélvico', 'sin página'),
        L('ficha:111', 'Ficha de Google: Clínica ejemplo 2', { ...FICHA_OK, nota: 4.6, resenas: 12 }),
        L('resenas:111', 'Reseñas frente a la competencia con ficha', { porDetras: 'sí', medianaCompetencia: 85, notaMediana: 4.7, paradas: 'sí', nuevas90dias: 0 }),
        L('mapa:fisioterapia sabadell', 'Mapa por zonas: fisioterapia sabadell', { puestoMedio: 11.4, top3Pct: 8, puntos: 25 }),
        L('nap', 'Nombre, dirección y teléfono entre web y ficha', { incoherencias: 0, estado: 'coherente' })
      ],
      ['contenido_cadencia', 'paginas_servicio_zona', 'local_ficha_resenas'],
      [{ key: 'refuerzo_al_alcance', why: 'nada cerca del top 3' }],
      12,
      { profile: 'local_fisico', mustQ1: 'local' }
    ),
    build(
      'tienda-online',
      'Tienda solo online: nada de ficha de Google al principio',
      'Cliente: Tienda ejemplo (venta online de recambios) · Zona: toda España · Search Console: conectada, 90 días',
      [
        { id: 'S:gsc', type: 'S', label: 'Search Console 90 días', data: { clics: 2100, impresiones: 140000 } },
        Qs('recambios moto online', 6.3, 12000, 'rango 100-350 clics/mes si llega al top 3 (sin verificar)'),
        Qs('pastillas freno moto', 8.9, 7400, 'rango 40-160 clics/mes si llega al top 3 (sin verificar)'),
        Qd('kit transmision moto precio', 2400),
        H('seo.title_missing', 'Páginas sin título', 'importante', 14)
      ],
      ['refuerzo_al_alcance', 'contenido_cadencia', 'datos_estructurados'],
      [{ key: 'local_ficha_resenas', why: 'no hay ficha de Google confirmada' }],
      16,
      { profile: 'online', mustQ1: 'existente', mustNotQ1: 'local' }
    ),
    build(
      'local-ficha-fuerte',
      'Comercio con la ficha ya fuerte: exprimir lo que posiciona, sin campaña de reseñas',
      'Cliente: Óptica ejemplo · Zona: Terrassa · Search Console: conectada, 90 días',
      [
        { id: 'S:gsc', type: 'S', label: 'Search Console 90 días', data: { clics: 900, impresiones: 41000 } },
        Qs('optica terrassa', 4.8, 8800, 'rango 80-260 clics/mes si llega al top 3 (sin verificar)'),
        Qs('lentillas terrassa', 7.2, 3100, 'rango 20-90 clics/mes si llega al top 3 (sin verificar)'),
        L('ficha:222', 'Ficha de Google: Óptica ejemplo', { ...FICHA_OK, categoria: 'Óptica', nota: 4.8, resenas: 240 }),
        L('resenas:222', 'Reseñas frente a la competencia con ficha', { porDetras: 'no', medianaCompetencia: 90, notaMediana: 4.5, paradas: 'no', nuevas90dias: 18 }),
        L('mapa:optica terrassa', 'Mapa por zonas: optica terrassa', { puestoMedio: 2.1, top3Pct: 80, puntos: 25 }),
        L('nap', 'Nombre, dirección y teléfono entre web y ficha', { incoherencias: 0, estado: 'coherente' })
      ],
      ['refuerzo_al_alcance', 'contenido_cadencia', 'local_ficha_resenas'],
      [],
      12,
      { profile: 'local_fisico', mustQ1: 'existente', noPlaybook: 'local_ficha_resenas' }
    ),
    build(
      'reformas-domicilio-sin-ficha',
      'Reformas a domicilio sin ficha confirmada: identificarla o reclamarla en el primer trimestre',
      'Cliente: Reformas ejemplo 2 (reformas a domicilio) · Zona: Vallès Occidental · Search Console: conectada, 90 días',
      [
        { id: 'S:gsc', type: 'S', label: 'Search Console 90 días', data: { clics: 150, impresiones: 9000 } },
        Qs('reformas sant cugat', 9.1, 2600, 'rango 15-70 clics/mes si llega al top 3 (sin verificar)'),
        H('seo.zone_page_missing', 'Población con búsquedas y sin página propia', 'info', 4),
        L('sin_ficha', 'No hay ficha de Google confirmada del negocio', { accion: 'identificarla o reclamarla (pestaña Local)' }),
        L('nap', 'Nombre, dirección y teléfono entre web y ficha', { incoherencias: 'sin medir', estado: 'sin medir' })
      ],
      ['refuerzo_al_alcance', 'paginas_servicio_zona', 'contenido_cadencia'],
      [{ key: 'local_ficha_resenas', why: 'el cliente no tiene ficha de Google identificada' }],
      12,
      { profile: 'area_servicio', mustQ1: 'local' }
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
  if (c.mustNotQ1) {
    const bad = v.plan.frentes.filter((f) => f.fromQuarter === 1 && f.kind === c.mustNotQ1);
    checks.push({ name: `no empieza por ${c.mustNotQ1}`, pass: !bad.length, detail: bad.map((f) => f.title).join(', ') || 'bien' });
  }
  if (c.noPlaybook) {
    const bad = v.plan.frentes.filter((f) => f.playbook === c.noPlaybook);
    checks.push({ name: `sin la línea ${c.noPlaybook}`, pass: !bad.length, detail: bad.map((f) => f.title).join(', ') || 'bien' });
  }
  if (c.notConfidence) checks.push({ name: `confianza no ${c.notConfidence}`, pass: v.plan.confidence !== c.notConfidence, detail: `confianza: ${v.plan.confidence ?? '—'}` });
  const s = scorePlan(v.plan, c.evidence, c.profile);
  checks.push({ name: 'orden de la agencia', pass: s.score >= 70, detail: `${s.score}/100${s.divergences.length ? ` · ${s.divergences[0]}` : ''}` });
  return checks;
}
