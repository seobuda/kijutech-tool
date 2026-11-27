// Proyecto → Resumen (UX del 27 nov 2026): una sola pantalla con lo que importa del proyecto SEO (qué es urgente, qué toca
// este mes, cómo va en Google y en el mapa, qué vigila el sistema y qué ha funcionado). Cada bloque enlaza a su pestaña;
// aquí no hay listas largas: resúmenes y como mucho 5 líneas.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq, inArray } from 'drizzle-orm';
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarCheck, Eye, LayoutDashboard, MapPin, Rocket, TrendingUp, Trophy } from 'lucide-react';
import { db } from '@/lib/db/drizzle';
import { clients, findings, interventions, projects } from '@/lib/db/schema';
import { requirePagePermission } from '@/lib/auth/permissions';
import { Badge, PageContainer, PageHeader } from '@/components/ui/page';
import { ProjectSeoNav } from '../seo-nav';
import { SeverityBadge } from '@/components/ui/severity';
import { projectReadiness } from '@/lib/seo/alta/alta';
import { listPlanItems, planSchedule } from '@/lib/seo/plan/plan';
import { getPositionsView } from '@/lib/seo/posiciones/view';
import { getLocalView } from '@/lib/seo/local/view';
import { getGeogridView } from '@/lib/seo/local/geogrid-view';
import { listMoneyPages } from '@/lib/seo/cambios/dinero';
import { listChanges } from '@/lib/seo/cambios/registro';
import { getVigilanciaView } from '@/lib/seo/vigilancia/view';
import { SEO_KINDS } from '@/lib/seo/salud/kinds';

const KIND_TITLE = new Map(SEO_KINDS.map((k) => [k.kind, k.title]));
const SEV_ORDER: Record<string, number> = { critico: 0, importante: 1, aviso: 2, info: 3 };

function Card({ title, icon: Icon, href, cta, children }: { title: string; icon: typeof Rocket; href: string; cta: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col rounded-xl border bg-card p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-muted-foreground" />
        {title}
      </h2>
      <div className="flex-1 text-sm">{children}</div>
      <Link href={href} className="mt-3 inline-flex items-center gap-1 self-start text-sm text-primary hover:underline">
        {cta}
        <ArrowRight className="size-3.5" />
      </Link>
    </section>
  );
}

export default async function ResumenPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requirePagePermission('view');
  const { projectId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound();
  const [p] = await db.select({ id: projects.id, name: projects.name, clientName: clients.name }).from(projects).leftJoin(clients, eq(clients.id, projects.clientId)).where(and(eq(projects.id, projectId), eq(projects.tenantId, user.tenantId))).limit(1);
  if (!p) notFound();
  // Un bloque que falla no tumba el resumen: se registra y la tarjeta dice «no disponible» (no un estado vacío falso).
  const failed = new Set<string>();
  const safe = <T,>(x: Promise<T>, fallback: T, name = '') =>
    x.catch((e) => {
      console.error(`[seo] resumen ${name}:`, e instanceof Error ? e.message : e);
      if (name) failed.add(name);
      return fallback;
    });
  const [ready, sched, pos, local, grid, money, changes, vig, ints, open, planItems] = await Promise.all([
    safe(projectReadiness(user.tenantId, projectId), null),
    safe(planSchedule(user.tenantId, projectId), null, 'plan'),
    safe(getPositionsView(user.tenantId, projectId), null, 'posiciones'),
    safe(getLocalView(user.tenantId, projectId), null),
    safe(getGeogridView(user.tenantId, projectId), null),
    safe(listMoneyPages(user.tenantId, projectId), []),
    safe(listChanges(user.tenantId, projectId), []),
    safe(getVigilanciaView(user.tenantId, projectId), null),
    safe(db.select({ domain: interventions.domain, status: interventions.status, outcome: interventions.outcome }).from(interventions).where(and(eq(interventions.projectId, projectId), eq(interventions.tenantId, user.tenantId), eq(interventions.domain, 'seo'), eq(interventions.status, 'hecha'))), [], 'resultados'),
    safe(db.select({ kind: findings.kind, severity: findings.severity }).from(findings).where(and(eq(findings.projectId, projectId), eq(findings.tenantId, user.tenantId), eq(findings.status, 'abierto'), inArray(findings.severity, ['critico', 'importante']))), [], 'hallazgos'),
    safe(listPlanItems(user.tenantId, projectId), [])
  ]);
  const base = `/dashboard/projects/${projectId}`;
  // Urgente: tipos de hallazgo grave, agrupados.
  const byKind = new Map<string, { n: number; sev: string }>();
  for (const f of open) byKind.set(f.kind, { n: (byKind.get(f.kind)?.n ?? 0) + 1, sev: f.severity });
  const urgent = [...byKind].sort((a, b) => SEV_ORDER[a[1].sev] - SEV_ORDER[b[1].sev] || b[1].n - a[1].n);
  const crit = open.filter((f) => f.severity === 'critico').length;
  // Este mes.
  const monthIds = new Set((sched?.items ?? []).filter((i) => i.month === 0).map((i) => i.id));
  const thisMonth = planItems.filter((i) => i.status === 'pendiente' && monthIds.has(i.id));
  // Resultados.
  const done = ints;
  const verdict = (i: (typeof ints)[number]) => ((i.outcome ?? {}) as { verdict?: string }).verdict;
  const worked = done.filter((i) => verdict(i) === 'funciono').length;
  const measured = done.filter((i) => verdict(i) && verdict(i) !== 'no_medible').length;
  // Vigilancia.
  const recentChanges = changes.filter((c) => Date.now() - new Date(c.detectedAt).getTime() < 7 * 86_400_000).length;
  const moneyIssues = money.filter((m) => m.pending || (m.status != null && (m.status < 200 || m.status >= 300 || m.indexable === false))).length;
  const lastGrid = grid?.runs[0];
  const snap = local?.client?.snap;

  return (
    <PageContainer>
      <Link href="/dashboard/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Proyectos
      </Link>
      <PageHeader icon={LayoutDashboard} title={`Resumen · ${p.name}`} description={`${p.clientName ? `Cliente: ${p.clientName}. ` : ''}Lo importante del proyecto en una pantalla. Cada bloque lleva a su pestaña con el detalle.`} />
      <ProjectSeoNav projectId={projectId} active="resumen" />

      {ready && ready.done < ready.total && (
        <Link href={`${base}/expediente`} className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm hover:underline">
          <Rocket className="size-4" />
          <span>
            <strong>Puesta en marcha: {ready.done} de {ready.total}.</strong> Falta: {ready.items.filter((x) => !x.ok).slice(0, 3).map((x) => x.label.toLowerCase()).join(', ')}
            {ready.items.filter((x) => !x.ok).length > 3 ? '…' : ''}
          </span>
        </Link>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card title="Lo urgente" icon={AlertTriangle} href={`${base}/salud`} cta="Ver los problemas">
          {failed.has('hallazgos') ? (
            <p className="text-muted-foreground">No disponible ahora mismo.</p>
          ) : urgent.length ? (
            <>
              <p className="mb-2">
                {crit ? <SeverityBadge severity="critico" count={crit} /> : null} <SeverityBadge severity="importante" count={open.length - crit} />
              </p>
              <ul className="space-y-1 text-muted-foreground">
                {urgent.slice(0, 5).map(([k, v]) => (
                  <li key={k}>
                    {KIND_TITLE.get(k) ?? k} {v.n > 1 ? <span className="text-xs">({v.n})</span> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-muted-foreground">Nada crítico ni importante abierto. 🎉</p>
          )}
        </Card>

        <Card title="Este mes" icon={CalendarCheck} href={`${base}/plan`} cta="Abrir el plan">
          {failed.has('plan') ? (
            <p className="text-muted-foreground">No disponible ahora mismo.</p>
          ) : thisMonth.length ? (
            <>
              <p className="mb-2 text-muted-foreground">
                {thisMonth.length} propuesta{thisMonth.length === 1 ? '' : 's'} · {Math.round(thisMonth.reduce((s, i) => s + Number(i.estHours), 0) * 10) / 10} h
              </p>
              <ul className="space-y-1">
                {thisMonth.slice(0, 4).map((i) => (
                  <li key={i.id} className="truncate">
                    {i.title}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-muted-foreground">No hay propuestas pendientes para este mes.</p>
          )}
        </Card>

        <Card title="En Google" icon={TrendingUp} href={`${base}/posiciones`} cta="Ver posiciones">
          {failed.has('posiciones') ? (
            <p className="text-muted-foreground">No disponible ahora mismo.</p>
          ) : pos && pos.summary.tracked ? (
            <ul className="space-y-1">
              <li>
                <strong>{pos.summary.top3}</strong> en el top 3 y <strong>{pos.summary.top10}</strong> en el top 10, de {pos.summary.tracked} búsquedas seguidas
              </li>
              {pos.summary.packs > 0 && (
                <li>
                  En el mapa en <strong>{pos.summary.inPack}</strong> de {pos.summary.packs}
                </li>
              )}
              {pos.summary.aio > 0 && (
                <li className="text-muted-foreground">
                  Respuesta de IA en {pos.summary.aio} búsquedas; le cita en {pos.summary.aioCites}
                </li>
              )}
            </ul>
          ) : (
            <p className="text-muted-foreground">Aún no hay posiciones medidas.</p>
          )}
        </Card>

        <Card title="Local" icon={MapPin} href={`${base}/local`} cta="Ver la ficha y el mapa">
          {snap ? (
            <ul className="space-y-1">
              <li>
                {snap.rating != null ? (
                  <>
                    <strong>{snap.rating}★</strong> con {snap.votes ?? 0} reseñas
                  </>
                ) : (
                  'Sin valoración'
                )}
              </li>
              {lastGrid && (
                <li>
                  Mapa por zonas: puesto medio <strong>{lastGrid.avg ?? '—'}</strong>, top 3 en el {lastGrid.top3Pct} % de la zona
                </li>
              )}
              {grid?.nextAt && !lastGrid && <li className="text-muted-foreground">Mapa por zonas programado.</li>}
            </ul>
          ) : (
            <p className="text-muted-foreground">Ficha de Google sin confirmar.</p>
          )}
        </Card>

        <Card title="Lo que vigila el sistema" icon={Eye} href={`${base}/salud?vista=vigilancia`} cta="Ver la vigilancia">
          <ul className="space-y-1">
            <li>
              {money.length} página{money.length === 1 ? '' : 's'} importante{money.length === 1 ? '' : 's'} vigilada{money.length === 1 ? '' : 's'}
              {moneyIssues ? (
                <>
                  {' '}
                  · <span className="text-destructive">{moneyIssues} con problema</span>
                </>
              ) : (
                ' · todas bien'
              )}
            </li>
            <li className="text-muted-foreground">{recentChanges} cambio{recentChanges === 1 ? '' : 's'} en la web esta semana</li>
            {vig && (
              <li className="text-muted-foreground">
                Gasto en datos: {vig.spend.spent.toFixed(2)} $ de {vig.spend.budget} $ este mes
              </li>
            )}
          </ul>
        </Card>

        <Card title="Qué ha funcionado" icon={Trophy} href={`${base}/plan?vista=resultados`} cta="Ver resultados">
          {failed.has('resultados') ? (
            <p className="text-muted-foreground">No disponible ahora mismo.</p>
          ) : done.length ? (
            <p>
              {done.length} encargo{done.length === 1 ? '' : 's'} hecho{done.length === 1 ? '' : 's'} · {measured} medido{measured === 1 ? '' : 's'} · <strong>{worked}</strong> funcionaron
            </p>
          ) : (
            <p className="text-muted-foreground">Aún no hay encargos hechos. Se miden a las 4 semanas.</p>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
