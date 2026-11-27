// SEO → Rendimiento del Jefe SEO (D6, solo administradores). Cómo decide la agencia sobre lo que propone el Jefe, cuánto
// cuesta, qué se observa al medir el trabajo hecho por línea y por sector, y la autonomía graduada de las estrategias.
// Todo por código. Describe lo observado; nunca afirma causas, y con pocos casos lo dice.
import Link from 'next/link';
import { ArrowLeft, Gauge } from 'lucide-react';
import { requirePagePermission } from '@/lib/auth/permissions';
import { Badge, PageContainer, PageHeader, Section } from '@/components/ui/page';
import { accountCycleAutonomy, jefeMetrics, trendsByLine, trendsBySector } from '@/lib/seo/jefe/metricas';
import { AUTONOMY_MIN_DECIDED, AUTONOMY_MIN_RATE, honestRate } from '@/lib/seo/jefe/revision-rules';
import type { Trend } from '@/lib/core/technique-trends-rules';

export const dynamic = 'force-dynamic';

const FN_LABEL: Record<string, string> = { seo_jefe_plan: 'Planes de servicio (Opus)', agt_jefe_seo: 'Conversación con el Jefe', agt_jefe_seo_resumen: 'Resúmenes de la conversación', seo_jefe_investigador: 'Investigador de novedades (Sonnet)' };
const METRIC: Record<string, string> = { clicks: 'clics', impressions: 'impresiones', position: 'posición', ctr: 'CTR' };
const LABEL_TONE = { 'pocos casos': 'neutral', tendencia: 'info', aprendizaje: 'success' } as const;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TrendLine({ t }: { t: Trend }) {
  const range = t.lowPct != null && t.highPct != null ? ` (entre ${t.lowPct} % y ${t.highPct} %)` : '';
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <Badge tone={LABEL_TONE[t.label]}>{t.label}</Badge>
      <span>
        {METRIC[t.metric] ?? t.metric}: {t.effectPct != null ? `${t.effectPct > 0 ? '+' : ''}${t.effectPct} % de media frente al resto de la web${range}` : 'sin efecto medible'} · {t.n} trabajos medidos en {t.clients} cliente(s) · mejoraron claramente {t.funciono}
      </span>
    </li>
  );
}

export default async function JefeRendimientoPage() {
  const user = await requirePagePermission('admin');
  const [m, lines, sectors, autonomy] = await Promise.all([jefeMetrics(user.tenantId), trendsByLine(user.tenantId), trendsBySector(user.tenantId), accountCycleAutonomy(user.tenantId)]);
  const measured = lines.filter((l) => l.trends.length);
  return (
    <PageContainer>
      <Link href="/dashboard/seo/fuentes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Fuentes de novedades
      </Link>
      <PageHeader
        icon={Gauge}
        title="Rendimiento del Jefe SEO"
        description="Cómo decide la agencia sobre lo que propone el Jefe, cuánto cuesta y qué se observa al medir el trabajo hecho. Todo lo calcula el código. Lo observado no prueba la causa (pueden influir la temporada, Google o la competencia), y con pocos casos no se concluye nada."
      />
      <Section title="Lo que propone el Jefe y cómo se decide">
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Planes generados" value={String(m.plans.generated)} hint={`${m.plans.approved} aprobados · ${m.plans.rejected} rechazados${m.plans.failed ? ` · ${m.plans.failed} fallidos` : ''}`} />
          <Stat label="Planes aprobados" value={honestRate(m.plans.approved, m.plans.approved + m.plans.rejected)} hint="de los decididos" />
          <Stat label="Tu nota en sombra (1-5)" value={m.plans.shadowAvg != null ? String(m.plans.shadowAvg) : '—'} hint={`${m.plans.shadowScored} plan(es) puntuados${m.plans.shadowScored < 5 ? ' · pocos para fiarse' : ''}`} />
          <Stat label="Orden según el puntuador" value={m.plans.scoreAvg != null ? `${m.plans.scoreAvg}/100` : '—'} hint="media; avisa, no veta" />
          <Stat label="Evidencias inventadas por plan" value={m.plans.rejectedEvidenceAvg != null ? String(m.plans.rejectedEvidenceAvg) : '—'} hint="descartadas por el código (media)" />
          <Stat label="Cambios del chat aceptados" value={honestRate(m.changes.accepted, m.changes.decided)} />
          <Stat label="Estrategias del trimestre aprobadas" value={honestRate(m.cycles.approved, m.cycles.decided)} />
          <Stat label="Revisiones propuestas" value={String(m.revisions.proposed)} hint={`${m.revisions.generated} generadas`} />
          <Stat label="Días hasta el primer plan aprobado" value={m.daysToApprovedPlan.median != null ? String(m.daysToApprovedPlan.median) : '—'} hint={`mediana de ${m.daysToApprovedPlan.n} proyecto(s)`} />
        </div>
      </Section>

      <Section title="Autonomía de las estrategias" description={`Decisión de Enric: cuando más del ${Math.round(AUTONOMY_MIN_RATE * 100)} % de ${AUTONOMY_MIN_DECIDED} estrategias propuestas por el Jefe se aprueban sin editar, también las puede aprobar el responsable SEO (permiso de edición), no solo un administrador. Cuentan las 20 más recientes.`}>
        <div className="flex flex-col gap-1 p-5 text-sm">
          <p>
            <Badge tone={autonomy.enabled ? 'success' : 'neutral'}>{autonomy.enabled ? 'Activada' : 'Aún no'}</Badge> {autonomy.decided} decididas, {honestRate(autonomy.approved, autonomy.decided)} aprobadas.
          </p>
          {!autonomy.enabled && <p className="text-muted-foreground">{autonomy.missing ? `Faltan ${autonomy.missing} decisiones para poder valorarlo.` : `Hace falta superar el ${Math.round(AUTONOMY_MIN_RATE * 100)} % de aprobadas.`}</p>}
        </div>
      </Section>

      <Section title="Coste del Jefe SEO" description="Planes, conversación e investigador. El tope mensual es el ajuste «jefe_budget_usd».">
        <div className="flex flex-col gap-2 p-5 text-sm">
          <p>
            Este mes: <b>{m.cost.month.toFixed(2)} $</b> · últimos 90 días: {m.cost.total90.toFixed(2)} $
          </p>
          <ul className="flex flex-col gap-0.5 text-muted-foreground">
            {m.cost.byFunction.map((f) => (
              <li key={f.fn}>
                {FN_LABEL[f.fn] ?? f.fn}: {f.usd.toFixed(2)} $ en {f.calls} llamada(s)
              </li>
            ))}
            {!m.cost.byFunction.length && <li>Sin gasto en los últimos 90 días.</li>}
          </ul>
        </div>
      </Section>

      <Section title="Lo observado por línea de trabajo" description="Al medir cada trabajo hecho frente al resto de la web del cliente (antes y después). «Pocos casos» = menos de 5: anécdota. «Tendencia» = indicio. «Aprendizaje» = 50 casos en 10 clientes o más.">
        <ul className="divide-y">
          {measured.map((l) => (
            <li key={l.line} className="flex flex-col gap-1 px-5 py-3">
              <span className="font-medium">{l.label}</span>
              <ul className="flex flex-col gap-1">
                {l.trends.map((t, i) => (
                  <TrendLine key={i} t={t} />
                ))}
              </ul>
            </li>
          ))}
          {!measured.length && <li className="px-5 py-3 text-sm text-muted-foreground">Aún no hay trabajos de estas líneas medidos (se miden a los 28, 56 y 90 días de hacerlos).</li>}
        </ul>
      </Section>

      <Section title="Lo observado por sector" description="Lo mismo, separado por tipo de negocio. Con pocos clientes por sector es aún más anecdótico.">
        <ul className="divide-y">
          {sectors.map((s) => (
            <li key={s.sector} className="flex flex-col gap-1 px-5 py-3">
              <span className="font-medium">{s.sector}</span>
              <ul className="flex flex-col gap-1">
                {s.trends.slice(0, 6).map((t, i) => (
                  <li key={i} className="text-sm">
                    <span className="text-muted-foreground">{t.technique}</span>
                    <ul>
                      <TrendLine t={t} />
                    </ul>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {!sectors.length && <li className="px-5 py-3 text-sm text-muted-foreground">Aún no hay trabajos medidos.</li>}
        </ul>
      </Section>
    </PageContainer>
  );
}
