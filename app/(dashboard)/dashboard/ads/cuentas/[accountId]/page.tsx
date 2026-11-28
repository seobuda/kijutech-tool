import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Briefcase, ClipboardCheck, History, Inbox, ListChecks, Megaphone, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, PageContainer, PageHeader, Section, StatCard } from '@/components/ui/page';
import { checkPermission, requirePagePermission } from '@/lib/auth/permissions';
import { accountDetail } from '@/lib/ads/views';
import { auditView } from '@/lib/ads/audit-views';
import { REVIEW_DAYS, REVIEW_DAYS_NO_LEVEL } from '@/lib/ads/finding-rules';
import { FindingCard } from '../../finding-card';
import { ProvisionalGoalButton, ReviewForm } from './account-actions';
import { AuditSection } from './audit-section';

export const dynamic = 'force-dynamic';

const ACTOR: Record<string, string> = { agencia: 'agencia', cliente: 'cliente', google: 'Google', herramienta: 'herramienta', desconocido: '—' };
const OUTCOME = { ok: { label: 'sin problemas', tone: 'success' }, hallazgo: { label: 'con hallazgo', tone: 'danger' }, no_comprobado: { label: 'no comprobada', tone: 'warning' } } as const;
const when = (iso: string) => new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const money = (v: number | null, cur: string | null) => {
  if (v === null) return '—';
  try {
    return v.toLocaleString('es-ES', { style: 'currency', currency: cur || 'EUR', maximumFractionDigits: v >= 100 ? 0 : 2 });
  } catch {
    return v.toFixed(2);
  }
};

// Google Ads · Cuenta (paso 2; diseño §2 y §7): expediente mínimo de una cuenta. Objetivo (provisional congelado o
// acordado), resumen de la cartera, hallazgos (vivos y cerrados en 30 días), estado de cada regla, línea de tiempo de
// cambios con su autor y revisiones con «Marcar revisada». Paso 3: auditoría de higiene como paso 4 del guion («¿dónde se
// va el dinero sin resultado?»). Sin llamadas a Google.
export default async function AdsAccountPage({ params }: { params: Promise<{ accountId: string }> }) {
  const user = await requirePagePermission('view');
  const { accountId } = await params;
  const [d, audit, canEdit] = await Promise.all([accountDetail(user.tenantId, accountId), auditView(user.tenantId, accountId), checkPermission('edit').then((r) => r.ok)]);
  if (!d || !audit) notFound();
  const a = d.account;
  const r = d.row;
  const live = d.findings.filter((f) => f.status === 'abierto' || f.status === 'silenciado');
  const closed = d.findings.filter((f) => f.status !== 'abierto' && f.status !== 'silenciado');
  const levelLabel = a.level ? `nivel ${a.level}: cada ${REVIEW_DAYS[a.level]} días` : `sin nivel: cada ${REVIEW_DAYS_NO_LEVEL} días`;

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        icon={Megaphone}
        title={a.name ?? a.customerIdLabel}
        description={`Cuenta ${a.customerIdLabel} · ${a.clientName ? `cliente ${a.clientName}` : a.simulated ? 'simulada (sin cliente)' : 'sin cliente vinculado'}${a.level ? ` · nivel ${a.level}` : ''}. Expediente: objetivo, hallazgos, reglas, cambios y revisiones.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/ads">
                <ArrowLeft aria-hidden /> Hoy
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/ads/cartera">
                <Briefcase aria-hidden /> Cartera
              </Link>
            </Button>
          </div>
        }
      />
      {a.simulated && (
        <div role="status" className="rounded-xl border bg-warning-soft px-4 py-3 text-sm text-warning-strong">
          <strong>SIMULADO.</strong> Cuenta inventada para desarrollo y pruebas.
        </div>
      )}
      {d.coverage && !d.coverage.checked && (
        <div role="status" className="rounded-xl border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          <strong className="text-foreground">Sin comprobar ahora mismo:</strong> {d.coverage.problems.map((p) => `${p.label} (${p.health})`).join(', ')}. Lo que se ve abajo puede estar atrasado.
        </div>
      )}

      {r && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Gasto del mes" value={money(r.spentMonth, r.currency)} hint={r.paceRatio !== null && r.reference ? `Proyección ${money(r.projection, r.currency)} (${r.paceRatio >= 1 ? '+' : ''}${Math.round((r.paceRatio - 1) * 100)} % frente a ${r.reference.mode === 'acuerdo' ? 'lo acordado' : 'la suma de presupuestos'})` : 'Sin presupuesto de referencia'} />
          <StatCard label="CPL 30 días" value={money(r.cpl30, r.currency)} hint={r.target ? (r.target.kind === 'linea_base' ? `Frente a su línea base ${money(r.target.value, r.currency)}, sin objetivo de negocio` : `Objetivo ${r.target.kind === 'provisional' ? 'provisional ' : ''}${money(r.target.value, r.currency)}`) : 'Sin referencia'} />
          <StatCard label="Conversiones 7 días" value={r.conv7.toLocaleString('es-ES', { maximumFractionDigits: 1 })} hint={`${r.conv30.toLocaleString('es-ES', { maximumFractionDigits: 1 })} en 30 días`} />
          <StatCard label="Medición" value={r.measurement === 'rota' ? 'Rota' : r.measurement === 'sana' ? 'Sana' : r.measurement === 'sin_datos' ? 'Sin datos' : r.measurement === 'no_comprobado' ? 'No comprobada' : 'Sin evaluar'} tone={r.measurement === 'rota' ? 'danger' : r.measurement === 'sana' ? 'success' : 'neutral'} hint={r.measurementNote ?? undefined} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Objetivo" description="Del cliente (no de la cuenta). Uno provisional es un supuesto congelado, no un objetivo de negocio.">
          {d.goal ? (
            <div className="space-y-1 text-sm">
              <p>
                <Badge tone={d.goal.kind === 'acordado' ? 'success' : 'warning'}>{d.goal.kind === 'acordado' ? 'Acordado' : 'Provisional (supuesto)'}</Badge> <span className="text-muted-foreground">versión {d.goal.version}, desde el {d.goal.validFrom}</span>
              </p>
              <p>
                CPL máximo: <strong>{money(d.goal.cplMax, a.currency)}</strong> · Presupuesto mensual: <strong>{money(d.goal.budgetUsual, a.currency)}</strong>
              </p>
              {d.goal.baselineFrom && <p className="text-xs text-muted-foreground">Línea base congelada: {d.goal.baselineFrom} a {d.goal.baselineTo}.</p>}
              {d.goal.notes && <p className="text-xs text-muted-foreground">{d.goal.notes}</p>}
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">Sin objetivo. El CPL se compara con su línea base (los 90 días anteriores a los últimos 30), sin objetivo de negocio.</p>
              {canEdit ? <ProvisionalGoalButton accountId={a.id} allowed={d.provisional.allowed} reason={d.provisional.reason} /> : <p className="text-xs text-muted-foreground">Hace falta permiso de edición para fijarlo.</p>}
            </div>
          )}
        </Section>

        <Section title="Revisión de cuenta" description={`Guion: medición, ritmo y CPL, qué cambió, dónde se va el dinero y qué se espera de terceros. Cadencia según el nivel del cliente (${levelLabel}).`}>
          <div className="space-y-3">
            {r && (
              <p className="text-sm">
                {r.lastReview ? `Última: ${when(r.lastReview.at)}${r.lastReview.by ? ` por ${r.lastReview.by}` : ''}.` : 'Nunca revisada.'} {r.nextReview ? `Próxima: ${r.nextReview}.` : ''}{' '}
                {r.reviewOverdue && <Badge tone="warning">toca revisar</Badge>}
              </p>
            )}
            {canEdit ? <ReviewForm accountId={a.id} suggestedNext={d.suggestedNextReview} levelLabel={levelLabel} /> : <p className="text-xs text-muted-foreground">Hace falta permiso de edición para marcarla revisada.</p>}
            {d.reviews.length > 0 && (
              <ul className="divide-y border-t pt-2 text-sm">
                {d.reviews.map((rv, i) => (
                  <li key={i} className="py-1.5">
                    <span className="text-xs text-muted-foreground">{when(rv.at)}{rv.by ? ` · ${rv.by}` : ''}{rv.next ? ` · próxima ${rv.next}` : ''}</span>
                    <div>{rv.note}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>
      </div>

      <Section
        title="4 · ¿Dónde se va el dinero sin resultado?"
        description="Auditoría de higiene de la cuenta (paso 4 del guion de revisión): los 3 primeros, y debajo la auditoría completa por tandas. Nada cambia solo en Google Ads: cada corrección se aplica a mano."
      >
        <AuditSection accountId={a.id} view={audit} canEdit={canEdit} />
      </Section>

      <Section title={`Hallazgos abiertos (${live.length})`} description="Los vivos de esta cuenta, con su evidencia y las respuestas del gestor.">
        {live.length ? (
          <div className="space-y-3">
            {live.map((f) => (
              <FindingCard key={f.id} f={f} canEdit={canEdit} showAccount={false} />
            ))}
          </div>
        ) : (
          <EmptyState icon={Inbox} title="Ningún hallazgo abierto" description="Las reglas no ven nada en esta cuenta. Mira abajo si alguna regla quedó sin comprobar: eso no es «todo bien»." className="py-8" />
        )}
        {closed.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-muted-foreground">Cerrados en los últimos 30 días ({closed.length})</summary>
            <div className="mt-3 space-y-3">
              {closed.map((f) => (
                <FindingCard key={f.id} f={f} canEdit={false} showAccount={false} />
              ))}
            </div>
          </details>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Reglas" description="Resultado de la última evaluación de cada regla. «No comprobada» = faltan datos sanos o días completos: la regla no afirma nada.">
          {d.rules.length ? (
            <ul className="-m-5 divide-y text-sm">
              {d.rules.map((x) => (
                <li key={x.rule} className="flex flex-wrap items-start justify-between gap-2 px-5 py-2">
                  <span>
                    <ListChecks className="mr-1 inline size-3.5 text-muted-foreground" aria-hidden />
                    {x.label}
                    {x.reason && <span className="block text-xs text-muted-foreground">{x.reason}</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    <Badge tone={OUTCOME[x.outcome as keyof typeof OUTCOME]?.tone ?? 'neutral'}>{OUTCOME[x.outcome as keyof typeof OUTCOME]?.label ?? x.outcome}</Badge> {when(x.at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Target} title="Aún sin evaluar" description="Las reglas se evalúan solas al terminar cada descarga." className="py-8" />
          )}
        </Section>

        <Section title="Línea de tiempo de cambios" description="Del historial de cambios de Google Ads (30 días), con quién los hizo.">
          {d.changes.length ? (
            <ul className="-m-5 divide-y text-sm">
              {d.changes.map((c, i) => (
                <li key={i} className="px-5 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <History className="mr-1 inline size-3.5 text-muted-foreground" aria-hidden />
                      {c.resourceType ?? 'cambio'}
                      {c.operation ? ` (${c.operation.toLowerCase()})` : ''}
                      {c.campaign ? ` · ${c.campaign}` : ''}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {when(c.at)} · {c.email || '—'} <Badge tone={c.actor === 'agencia' ? 'outline' : 'warning'}>{ACTOR[c.actor] ?? c.actor}</Badge>
                    </span>
                  </div>
                  {c.fields.length > 0 && <div className="text-xs text-muted-foreground">{c.fields.join(', ')}</div>}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={ClipboardCheck} title="Sin cambios guardados" description="Aún no se ha descargado el historial de cambios de esta cuenta (o no hubo cambios en 30 días)." className="py-8" />
          )}
        </Section>
      </div>
    </PageContainer>
  );
}
