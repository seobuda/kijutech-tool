import Link from 'next/link';
import { Activity, BellOff, Briefcase, CircleCheck, CircleDashed, Gauge, Hourglass, Inbox, Megaphone, Settings, TriangleAlert, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, PageContainer, PageHeader, Section, StatCard } from '@/components/ui/page';
import { checkPermission, requirePagePermission } from '@/lib/auth/permissions';
import { todayView } from '@/lib/ads/views';
import { FindingCard } from './finding-card';

export const dynamic = 'force-dynamic';

const HEALTH_TONE = { sana: 'success', atrasada: 'warning', caida: 'danger', sin_datos: 'neutral' } as const;
const HEALTH_LABEL = { sana: 'al día', atrasada: 'atrasada', caida: 'caída', sin_datos: 'sin datos' } as const;
const ACTOR_LABEL: Record<string, string> = { agencia: 'agencia', cliente: 'cliente', google: 'Google', herramienta: 'herramienta', desconocido: '—' };
const fmtMoney = (v: number, cur: string | null) => (cur ? v.toLocaleString('es-ES', { style: 'currency', currency: cur, maximumFractionDigits: 0 }) : v.toFixed(0));
const fmtDay = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtWhen = (iso: string) => new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Google Ads · Hoy (paso 2; diseño §6-7 e investigación 7.2-7.3): la cabecera de cobertura REAL de MED-00, la bandeja
// (urgente, por decidir con el corte 5 + 3, esperando a terceros y vencido) con las respuestas del gestor, el estado de la
// descarga de cada cuenta y los últimos cambios. Sin llamadas a Google: todo sale de lo guardado.
export default async function AdsHomePage() {
  const user = await requirePagePermission('view');
  const [view, isAdmin, canEdit] = await Promise.all([todayView(user.tenantId), checkPermission('admin').then((r) => r.ok), checkPermission('edit').then((r) => r.ok)]);
  const { coverage, accounts, changes } = view;
  const totalFindings = view.urgent.length + view.decide.decisions.length + view.decide.fyi.length + view.decide.below.length + view.waiting.length + view.overdue.length + view.following.length + view.technical.length;
  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline" size="sm">
        <Link href="/dashboard/ads/cartera">
          <Briefcase aria-hidden /> Cartera
        </Link>
      </Button>
      {isAdmin && (
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/ads/ajustes">
            <Settings aria-hidden /> Ajustes
          </Link>
        </Button>
      )}
    </div>
  );

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        icon={Megaphone}
        title="Google Ads · Hoy"
        description="Lo que pide atención hoy en las cuentas de Google Ads de los clientes. Arriba, lo que de verdad se ha podido comprobar: una cuenta sin datos al día no cuenta como «bien». Todo es de solo lectura: la herramienta no cambia nada en Google Ads."
        actions={actions}
      />

      {coverage.mode === 'sim' && (
        <div role="status" className="rounded-xl border bg-warning-soft px-4 py-3 text-sm text-warning-strong">
          <strong>SIMULADO.</strong> Estas cuentas y cifras son inventadas (modo simulado para desarrollo y pruebas). Nunca se vinculan a clientes ni generan avisos.
        </div>
      )}
      {coverage.configured && view.shadow && (
        <div role="status" className="flex items-start gap-2 rounded-xl border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          <BellOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <strong className="text-foreground">Modo sombra.</strong> Los hallazgos se guardan y se ven aquí, pero no se envía nada por Telegram hasta que un administrador encienda los avisos{isAdmin ? (
              <>
                {' '}
                en <Link className="underline" href="/dashboard/ads/ajustes#avisos">Ajustes</Link>
              </>
            ) : null}
            .
          </span>
        </div>
      )}

      {!coverage.configured ? (
        <EmptyState
          icon={Megaphone}
          title="Google Ads aún no está conectado"
          description={isAdmin ? 'Pega la clave de la cuenta de servicio (o «SIM» para probar con datos simulados), el id de la MCC, prueba la conexión y activa la descarga.' : 'Un administrador tiene que conectar la cuenta de la agencia (Google Ads → Ajustes).'}
          action={isAdmin ? <Button asChild><Link href="/dashboard/ads/ajustes">Conectar Google Ads</Link></Button> : undefined}
        />
      ) : (
        <>
          <Section title="Cobertura de hoy" description={`${coverage.headline}${view.unchecked.accounts ? ` En ${view.unchecked.accounts} cuenta${view.unchecked.accounts > 1 ? 's' : ''} alguna regla no se pudo comprobar.` : ''}`}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Cuentas comprobadas" value={`${coverage.checked} / ${coverage.total}`} icon={coverage.checked === coverage.total && coverage.total > 0 ? CircleCheck : TriangleAlert} tone={coverage.checked === coverage.total && coverage.total > 0 ? 'success' : 'warning'} hint="Con estructura, métricas, cambios y latido al día" />
              <StatCard label="Descarga" value={coverage.syncEnabled ? 'Activada' : 'Apagada'} icon={Activity} tone={coverage.syncEnabled ? 'brand' : 'neutral'} hint={coverage.mode === 'sim' ? 'Modo simulado' : 'Cuenta de servicio'} />
              <StatCard label="Cuentas de la MCC" value={coverage.mcc ? HEALTH_LABEL[coverage.mcc.health] : 'sin datos'} icon={CircleDashed} tone={coverage.mcc ? HEALTH_TONE[coverage.mcc.health] : 'neutral'} hint={coverage.mcc?.lastError ?? 'Lista de cuentas y vínculo con la ficha'} />
              <StatCard label="Cupo de la API hoy" value={`${coverage.usage.operations} / ${coverage.usage.budget}`} icon={Gauge} tone={coverage.usage.operations >= coverage.usage.budget * 0.8 ? 'warning' : 'neutral'} hint="Operaciones del día (hora del Pacífico)" />
            </div>
            {view.unchecked.lines.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-muted-foreground">Qué reglas no se pudieron comprobar y por qué</summary>
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted-foreground">
                  {view.unchecked.lines.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </details>
            )}
            <p className="mt-3 text-xs text-muted-foreground">{view.evaluatedAt ? `Última evaluación de las reglas: ${fmtWhen(view.evaluatedAt)}.` : 'Las reglas aún no se han evaluado: se evalúan solas al terminar cada descarga.'}</p>
          </Section>

          {!coverage.syncEnabled && (
            <EmptyState icon={Activity} title="La descarga está apagada" description="Mientras esté apagada no se comprueba ninguna cuenta." action={isAdmin ? <Button asChild><Link href="/dashboard/ads/ajustes">Activar la descarga</Link></Button> : undefined} />
          )}

          {coverage.syncEnabled && totalFindings === 0 && (
            <EmptyState
              icon={Inbox}
              title="Nada que decidir hoy"
              description={view.evaluatedAt ? 'Las reglas no han visto nada en las cuentas comprobadas. Si alguna cuenta sale arriba como no comprobada, eso no es «todo bien».' : 'Aún no hay evaluación. Se hace sola tras cada descarga; un administrador puede forzarla en Ajustes.'}
              action={
                <Button asChild variant="outline">
                  <Link href="/dashboard/ads/cartera">Ver la cartera de cuentas</Link>
                </Button>
              }
            />
          )}

          {view.technical.length > 0 && (
            <Section title={`Responsable técnico (${view.technical.length})`} description="Nuestras propias fuentes sin datos: mientras tanto, esas cuentas no se vigilan y sus reglas dicen «no comprobado».">
              <div className="space-y-3">
                {view.technical.map((f) => (
                  <FindingCard key={f.id} f={f} canEdit={canEdit} />
                ))}
              </div>
            </Section>
          )}

          {view.urgent.length > 0 && (
            <Section title={`Urgente (${view.urgent.length})`} description="Lo que pierde dinero cada hora y tiene arreglo ahora: cuenta que no sirve, campaña parada o desbocada, página caída, rechazo en lo que más gasta.">
              <div className="space-y-3">
                {view.urgent.map((f) => (
                  <FindingCard key={f.id} f={f} canEdit={canEdit} />
                ))}
              </div>
            </Section>
          )}

          {view.overdue.length > 0 && (
            <Section title={`Vencido (${view.overdue.length})`} description="Se esperaba, pospuso o dio por hecho, y la fecha ya pasó sin que desaparezca: decide de nuevo.">
              <div className="space-y-3">
                {view.overdue.map((f) => (
                  <FindingCard key={f.id} f={f} canEdit={canEdit} />
                ))}
              </div>
            </Section>
          )}

          {view.decide.decisions.length + view.decide.fyi.length + view.decide.below.length > 0 && (
            <Section title="Por decidir" description="Parte de la mañana: como mucho 5 con decisión y 3 «para que lo sepas», ordenados por gravedad y dinero expuesto.">
              <div className="space-y-3">
                {view.decide.decisions.map((f) => (
                  <FindingCard key={f.id} f={f} canEdit={canEdit} />
                ))}
                {view.decide.fyi.length > 0 && <h3 className="pt-2 text-sm font-semibold">Para que lo sepas</h3>}
                {view.decide.fyi.map((f) => (
                  <FindingCard key={f.id} f={f} canEdit={canEdit} />
                ))}
                {view.decide.below.length > 0 && (
                  <details className="rounded-lg border border-dashed p-3">
                    <summary className="cursor-pointer text-sm text-muted-foreground">
                      {view.decide.below.length} más por debajo del corte
                    </summary>
                    <div className="mt-3 space-y-3">
                      {view.decide.below.map((f) => (
                        <FindingCard key={f.id} f={f} canEdit={canEdit} />
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </Section>
          )}

          {view.waiting.length > 0 && (
            <Section title={`Esperando a terceros (${view.waiting.length})`} description="Esperando al cliente o con un encargo abierto. Vuelven como vencidos si llega la fecha y siguen ahí.">
              <div className="space-y-3">
                {view.waiting.map((f) => (
                  <FindingCard key={f.id} f={f} canEdit={canEdit} />
                ))}
              </div>
            </Section>
          )}

          {view.following.length > 0 && (
            <details className="rounded-xl border bg-card p-4 shadow-xs">
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                <Hourglass className="size-4" aria-hidden /> En seguimiento ({view.following.length}): hechos por comprobar, pospuestos y «ya lo sabía»
              </summary>
              <div className="mt-3 space-y-3">
                {view.following.map((f) => (
                  <FindingCard key={f.id} f={f} canEdit={canEdit} />
                ))}
              </div>
            </details>
          )}

          {coverage.syncEnabled && !accounts.length && (
            <EmptyState icon={CircleDashed} title="Aún no hay cuentas" description="La primera descarga de la lista de cuentas de la MCC tarda unos minutos. Si no aparece ninguna, prueba la conexión en Ajustes." action={isAdmin ? <Button asChild variant="outline"><Link href="/dashboard/ads/ajustes">Ir a Ajustes</Link></Button> : undefined} />
          )}

          {accounts.length > 0 && (
            <Section title="Descarga por cuenta" description="Estado de cada fuente de datos. En gris lo que todavía no se ha podido comprobar. Pulsa una cuenta para ver su expediente.">
              <div className="-m-5 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-5 py-2 font-medium">Cuenta</th>
                      <th className="px-3 py-2 font-medium">Cliente</th>
                      <th className="px-3 py-2 font-medium">Fuentes</th>
                      <th className="px-3 py-2 font-medium">Histórico</th>
                      <th className="px-3 py-2 font-medium">Último día completo</th>
                      <th className="px-5 py-2 text-right font-medium">Gasto 30 días</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((a) => {
                      const cov = coverage.accounts.find((c) => c.accountId === a.id);
                      return (
                        <tr key={a.id} className={cov && !cov.checked ? 'border-b bg-muted/40 text-muted-foreground' : 'border-b'}>
                          <td className="px-5 py-2.5">
                            <Link href={`/dashboard/ads/cuentas/${a.id}`} className="font-medium text-foreground underline-offset-2 hover:underline">
                              {a.name ?? a.customerIdLabel}
                            </Link>
                            <div className="text-xs text-muted-foreground tabular-nums">{a.customerIdLabel}</div>
                          </td>
                          <td className="px-3 py-2.5">
                            {a.clientName ? (
                              <span>
                                {a.clientName}
                                {a.level && <Badge className="ml-1.5" tone="outline">Nivel {a.level}</Badge>}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">{a.simulated ? 'simulada' : 'sin vincular'}</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {(cov?.sources ?? []).map((s) => (
                                <Badge key={s.source} tone={HEALTH_TONE[s.health]} title={s.lastError ?? undefined}>
                                  {s.label}: {HEALTH_LABEL[s.health]}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 tabular-nums">{a.days ? `${a.days} días desde ${fmtDay(a.firstDay)}` : '—'}</td>
                          <td className="px-3 py-2.5">{fmtDay(a.lastCoverage)}</td>
                          <td className="px-5 py-2.5 text-right tabular-nums">{fmtMoney(a.cost30, a.currency)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {changes.length > 0 && (
            <Section title="Últimos cambios en las cuentas" description="Del historial de cambios de Google Ads, con quién los hizo.">
              <ul className="-m-5 divide-y text-sm">
                {changes.map((c, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2">
                    <span>
                      <span className="font-medium">{c.accountName}</span> · {c.resourceType ?? 'cambio'} {c.operation ? `(${c.operation.toLowerCase()})` : ''}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(c.changeAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {c.userEmail || '—'} <Badge tone="outline">{ACTOR_LABEL[c.actorClass] ?? c.actorClass}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {!canEdit && totalFindings > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wrench className="size-3.5" aria-hidden /> Tienes acceso de lectura: para responder a los hallazgos hace falta permiso de edición.
            </p>
          )}
        </>
      )}
    </PageContainer>
  );
}
