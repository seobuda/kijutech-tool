// Proyecto → En vivo (SEO parte 12, 27 nov 2026; docs/DISENO-SEO-CIERRE.md §D): leads de la web (GoHighLevel), visitas de
// Google, búsquedas y páginas que traen contactos, trabajo hecho y presencia en IA. Solo lee tablas propias (sin
// llamadas externas al pintar). Desde aquí se prepara el borrador del informe mensual (con aprobación).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Activity, ArrowLeft } from 'lucide-react';
import { checkPermission, requirePagePermission } from '@/lib/auth/permissions';
import { Badge, EmptyState, PageContainer, PageHeader, Section } from '@/components/ui/page';
import { getLiveView, clicksFor } from '@/lib/seo/vivo/vivo';
import { CHANNEL_LABEL } from '@/lib/core/leads-rules';
import { ProjectSeoNav } from '../seo-nav';
import { ReportButton } from './report-button';

const VERDICT: Record<string, { label: string; tone: 'success' | 'danger' | 'neutral' | 'info' }> = {
  funciono: { label: 'Funcionó', tone: 'success' },
  no_funciono: { label: 'No mejoró', tone: 'danger' },
  no_concluyente: { label: 'No concluyente', tone: 'neutral' },
  pendiente: { label: 'Midiendo', tone: 'info' }
};

function Bars({ rows }: { rows: { label: string; a: number; b?: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.a));
  return (
    <ul className="flex h-28 items-end gap-1" aria-label="Evolución mensual">
      {rows.map((r) => (
        <li key={r.label} className="flex flex-1 flex-col items-center gap-1" title={`${r.label}: ${r.a}${r.b !== undefined ? ` (${r.b} desde Google)` : ''}`}>
          <div className="relative w-full rounded-t bg-brand-soft" style={{ height: `${Math.max(2, (r.a / max) * 90)}px` }}>
            {r.b !== undefined && r.b > 0 && <div className="absolute bottom-0 w-full rounded-t bg-brand" style={{ height: `${(r.b / max) * 90}px` }} />}
          </div>
          <span className="text-[10px] text-muted-foreground">{r.label.slice(5)}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function VivoPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requirePagePermission('view');
  const { projectId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound();
  const [v, canEdit] = await Promise.all([getLiveView(user.tenantId, projectId), checkPermission('edit').then((r) => r.ok)]);
  if (!v) notFound();
  const leads = v.leads;
  const lastG = v.gscMonthly[v.gscMonthly.length - 2];
  const curG = v.gscMonthly[v.gscMonthly.length - 1];
  return (
    <PageContainer>
      <Link href="/dashboard/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Proyectos
      </Link>
      <PageHeader
        icon={Activity}
        title={`En vivo · ${v.clientName}`}
        description="Lo que el cliente nota: contactos por la web, visitas desde Google, qué páginas los traen y qué hemos hecho. Desde aquí se prepara el informe del mes (se revisa y aprueba antes de enviarlo)."
        actions={canEdit ? <ReportButton projectId={projectId} /> : undefined}
      />
      <ProjectSeoNav projectId={projectId} active="vivo" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Contactos por la web" description="Envíos de formularios de su web y de anuncios de Facebook (GoHighLevel). No cuenta llamadas ni WhatsApp. Oscuro: llegados desde Google.">
          {!leads?.connected ? (
            <EmptyState icon={Activity} title="GoHighLevel sin conectar" description="Conecta la subcuenta del cliente en su ficha → Webs y cuentas → Conexiones para ver aquí sus contactos." />
          ) : (
            <div className="flex flex-col gap-3 text-sm">
              <p>
                Este mes: <strong>{leads.thisMonth}</strong> · mes pasado: {leads.prevMonth}
                {leads.lastSyncAt && <span className="text-xs text-muted-foreground"> · datos de {new Date(leads.lastSyncAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</span>}
              </p>
              {leads.byMonth.length > 0 && <Bars rows={leads.byMonth.map((m) => ({ label: m.month, a: m.total, b: m.organico }))} />}
              {leads.byChannel.length > 0 && (
                <p className="flex flex-wrap gap-1">
                  {leads.byChannel.map((c) => (
                    <Badge key={c.channel} tone={c.channel === 'organico' ? 'success' : 'neutral'}>
                      {CHANNEL_LABEL[c.channel] ?? c.channel}: {c.n}
                    </Badge>
                  ))}
                  <span className="text-xs text-muted-foreground">(90 días)</span>
                </p>
              )}
            </div>
          )}
        </Section>

        <Section title="Visitas desde Google" description="Clics de Search Console por mes (los últimos días tardan en llegar).">
          {!v.gscMonthly.length ? (
            <p className="text-sm text-muted-foreground">Sin Search Console asignado o sin datos descargados.</p>
          ) : (
            <div className="flex flex-col gap-3 text-sm">
              <p>
                Mes en curso: <strong>{curG?.clicks ?? 0}</strong> · mes pasado: {lastG?.clicks ?? '—'}
              </p>
              <Bars rows={v.gscMonthly.map((m) => ({ label: m.month, a: m.clicks }))} />
            </div>
          )}
        </Section>
      </div>

      {leads?.connected && leads.byPage.length > 0 && (
        <Section title="Páginas que traen contactos" description="Últimos 90 días: contactos por página (y cuántos desde Google) frente a sus visitas desde Google. Una página con muchas visitas y pocos contactos pide revisar el formulario o la llamada a la acción.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Página</th>
                  <th className="py-2 pr-3 font-medium">Contactos</th>
                  <th className="py-2 pr-3 font-medium">Desde Google</th>
                  <th className="py-2 pr-3 font-medium">Visitas de Google</th>
                </tr>
              </thead>
              <tbody>
                {leads.byPage.map((p) => (
                  <tr key={p.url} className="border-b">
                    <td className="max-w-xs truncate py-2 pr-3" title={p.url}>
                      {p.url.replace(/^https?:\/\/[^/]+/, '') || '/'}
                    </td>
                    <td className="py-2 pr-3">{p.n}</td>
                    <td className="py-2 pr-3">{p.organico}</td>
                    <td className="py-2 pr-3">{clicksFor(v, p.url) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Trabajo hecho" description="Últimos 4 meses, con lo que se ha medido de cada uno (honesto: «no concluyente» si los datos no bastan).">
          {!v.work.length ? (
            <p className="text-sm text-muted-foreground">Aún no hay trabajos terminados.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {v.work.map((w, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">{w.doneAt ? new Date(w.doneAt).toLocaleDateString('es-ES') : ''}</span>
                  <span className="first-letter:uppercase">{w.title}</span>
                  {w.verdict && VERDICT[w.verdict] && <Badge tone={VERDICT[w.verdict].tone}>{VERDICT[w.verdict].label}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Google y asistentes de IA" description="Las búsquedas que se siguen (pestaña Posiciones) y la presencia en las respuestas de IA (pestaña IA).">
          <ul className="flex flex-col gap-1 text-sm">
            <li>{v.positions?.tracked ? `${v.positions.top10} de ${v.positions.tracked} búsquedas en la primera página; ${v.positions.top3} en el top 3.` : 'Sin consulta de posiciones todavía.'}</li>
            <li>{v.ai?.share != null ? `Le nombran o citan en el ${Math.round(v.ai.share * 100)} % de ${v.ai.answers} respuestas de IA de este mes.` : 'Sin panel de IA todavía.'}</li>
          </ul>
        </Section>
      </div>
    </PageContainer>
  );
}
