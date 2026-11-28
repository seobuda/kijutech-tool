import Link from 'next/link';
import { Activity, CircleCheck, CircleDashed, Gauge, Megaphone, Settings, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, PageContainer, PageHeader, Section, StatCard } from '@/components/ui/page';
import { checkPermission, requirePagePermission } from '@/lib/auth/permissions';
import { homeView } from '@/lib/ads/access';

export const dynamic = 'force-dynamic';

const HEALTH_TONE = { sana: 'success', atrasada: 'warning', caida: 'danger', sin_datos: 'neutral' } as const;
const HEALTH_LABEL = { sana: 'al día', atrasada: 'atrasada', caida: 'caída', sin_datos: 'sin datos' } as const;
const ACTOR_LABEL: Record<string, string> = { agencia: 'agencia', cliente: 'cliente', google: 'Google', herramienta: 'herramienta', desconocido: '—' };
const fmtMoney = (v: number, cur: string | null) => (cur ? v.toLocaleString('es-ES', { style: 'currency', currency: cur, maximumFractionDigits: 0 }) : v.toFixed(0));
const fmtDay = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// Google Ads · Hoy (paso 1): la cabecera de cobertura REAL de MED-00 («comprobadas X de Y cuentas…»), el estado de la
// descarga de cada cuenta y los últimos cambios. Los hallazgos (interrupciones, parte) llegan en el paso 2. Sin llamadas a
// Google: todo sale de lo guardado.
export default async function AdsHomePage() {
  const user = await requirePagePermission('view');
  const [view, isAdmin] = await Promise.all([homeView(user.tenantId), checkPermission('admin').then((r) => r.ok)]);
  const { coverage, accounts, changes } = view;
  const settingsLink = isAdmin ? (
    <Button asChild variant="outline" size="sm">
      <Link href="/dashboard/ads/ajustes">
        <Settings aria-hidden /> Ajustes
      </Link>
    </Button>
  ) : null;

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        icon={Megaphone}
        title="Google Ads"
        description="Vigilancia de las cuentas de Google Ads de los clientes. Arriba, lo que de verdad se ha podido comprobar: una cuenta sin datos al día no cuenta como «bien». Todo es de solo lectura: la herramienta no cambia nada en Google Ads."
        actions={settingsLink}
      />

      {coverage.mode === 'sim' && (
        <div role="status" className="rounded-xl border bg-warning-soft px-4 py-3 text-sm text-warning-strong">
          <strong>SIMULADO.</strong> Estas cuentas y cifras son inventadas (modo simulado para desarrollo y pruebas). Nunca se vinculan a clientes ni generan avisos.
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
          <Section title="Cobertura de hoy" description={coverage.headline}>
            <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Cuentas comprobadas" value={`${coverage.checked} / ${coverage.total}`} icon={coverage.checked === coverage.total && coverage.total > 0 ? CircleCheck : TriangleAlert} tone={coverage.checked === coverage.total && coverage.total > 0 ? 'success' : 'warning'} hint="Con estructura, métricas, cambios y latido al día" />
              <StatCard label="Descarga" value={coverage.syncEnabled ? 'Activada' : 'Apagada'} icon={Activity} tone={coverage.syncEnabled ? 'brand' : 'neutral'} hint={coverage.mode === 'sim' ? 'Modo simulado' : 'Cuenta de servicio'} />
              <StatCard label="Cuentas de la MCC" value={coverage.mcc ? HEALTH_LABEL[coverage.mcc.health] : 'sin datos'} icon={CircleDashed} tone={coverage.mcc ? HEALTH_TONE[coverage.mcc.health] : 'neutral'} hint={coverage.mcc?.lastError ?? 'Lista de cuentas y vínculo con la ficha'} />
              <StatCard label="Cupo de la API hoy" value={`${coverage.usage.operations} / ${coverage.usage.budget}`} icon={Gauge} tone={coverage.usage.operations >= coverage.usage.budget * 0.8 ? 'warning' : 'neutral'} hint="Operaciones del día (hora del Pacífico)" />
            </div>
          </Section>

          {!coverage.syncEnabled && (
            <EmptyState
              icon={Activity}
              title="La descarga está apagada"
              description="Mientras esté apagada no se comprueba ninguna cuenta."
              action={isAdmin ? <Button asChild><Link href="/dashboard/ads/ajustes">Activar la descarga</Link></Button> : undefined}
            />
          )}

          {coverage.syncEnabled && !accounts.length && (
            <EmptyState icon={CircleDashed} title="Aún no hay cuentas" description="La primera descarga de la lista de cuentas de la MCC tarda unos minutos. Si no aparece ninguna, prueba la conexión en Ajustes." action={settingsLink ?? undefined} />
          )}

          {accounts.length > 0 && (
            <Section title="Cuentas seguidas" description="Estado de cada fuente de datos. En gris lo que todavía no se ha podido comprobar.">
              <div className="overflow-x-auto">
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
                            <div className="font-medium text-foreground">{a.name ?? a.customerIdLabel}</div>
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
              <ul className="divide-y text-sm">
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
        </>
      )}
    </PageContainer>
  );
}
