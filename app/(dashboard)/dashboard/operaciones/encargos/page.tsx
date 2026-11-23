import { AutoRefresh } from '@/components/ui/auto-refresh';
import Link from 'next/link';
import { and, count, desc, eq, inArray, isNotNull, isNull, notInArray, or, type SQL } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { opsClients, opsRequestEvents, opsRequests } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { ClipboardList, ExternalLink, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { RetryButton } from './retry-button';

export const dynamic = 'force-dynamic';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const STATUS: Record<string, { label: string; tone: Tone }> = {
  creado: { label: 'Creado', tone: 'success' },
  pendiente_clickup: { label: 'Pendiente de ClickUp', tone: 'warning' },
  error_sync: { label: 'Error de sincronización', tone: 'danger' }
};

const WORK: Record<string, { label: string; tone: Tone }> = {
  asignado: { label: 'Asignado', tone: 'neutral' },
  en_curso: { label: 'En curso', tone: 'info' },
  bloqueado: { label: 'Bloqueado', tone: 'danger' },
  en_revision: { label: 'En revisión', tone: 'warning' },
  devuelto: { label: 'Devuelto', tone: 'warning' },
  completado: { label: 'Completado', tone: 'success' }
};

// Última acción de la persona en Telegram (cualquier botón cuenta como visto).
const ACTION_LABEL: Record<string, string> = {
  start: 'Empezar',
  later: 'Más tarde',
  blocked: 'Bloqueado',
  done: 'Hecho',
  done_review: 'Hecho, ¿lo revisas?',
  seen: 'Visto'
};
const BUTTON_LABEL: Record<string, string> = {
  bl: 'Bloqueado',
  dn: 'Hecho',
  dr: 'Hecho, ¿lo revisas?'
};

const PRIORITY: Record<number, string> = { 1: 'Urgente', 2: 'Alta', 3: 'Normal', 4: 'Baja' };

const fmt = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit'
});

// ?cliente=sin: los encargos que no son de ningún cliente con ficha (sin cliente en ClickUp, o con una opción de
// «Cliente» que no está vinculada a ninguna ficha). Así no se pierden en la ficha de nadie.
export default async function EncargosPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const user = await getUser();
  if (!user) redirect('/sign-in');
  const onlyNoClient = (await searchParams).cliente === 'sin';

  const linked = (
    await db
      .select({ id: opsClients.clickupOptionId })
      .from(opsClients)
      .where(and(eq(opsClients.tenantId, user.tenantId), isNotNull(opsClients.clickupOptionId)))
  ).map((c) => c.id as string);
  const linkedSet = new Set(linked);
  const noClient: SQL = (linked.length ? or(isNull(opsRequests.clientOptionId), notInArray(opsRequests.clientOptionId, linked)) : isNull(opsRequests.clientOptionId)) as SQL;
  const base = eq(opsRequests.tenantId, user.tenantId);

  const [rows, [{ n: noClientCount }]] = await Promise.all([
    db
      .select()
      .from(opsRequests)
      .where(onlyNoClient ? and(base, noClient) : base)
      .orderBy(desc(opsRequests.createdAt))
      .limit(200),
    db.select({ n: count() }).from(opsRequests).where(and(base, noClient))
  ]);

  // Última acción por encargo: el evento más reciente de un botón pulsado.
  const lastAction = new Map<string, { label: string; at: Date; by: string | null }>();
  if (rows.length > 0) {
    const events = await db
      .select()
      .from(opsRequestEvents)
      .where(
        and(
          eq(opsRequestEvents.tenantId, user.tenantId),
          inArray(opsRequestEvents.requestId, rows.map((r) => r.id)),
          inArray(opsRequestEvents.eventType, ['start', 'later', 'blocked', 'done', 'done_review', 'seen'])
        )
      )
      .orderBy(desc(opsRequestEvents.createdAt));
    for (const e of events) {
      if (!e.requestId || lastAction.has(e.requestId)) continue;
      const button = (e.payload as { button?: string } | null)?.button;
      const label = e.eventType === 'seen' && button && BUTTON_LABEL[button] ? BUTTON_LABEL[button] : ACTION_LABEL[e.eventType];
      lastAction.set(e.requestId, { label, at: e.createdAt, by: e.personName });
    }
  }

  const newButton = (
    <Button asChild size="sm" className="bg-brand text-white hover:bg-brand/90">
      <Link href="/dashboard/operaciones/nuevo">
        <Plus aria-hidden />
        Nuevo encargo
      </Link>
    </Button>
  );

  if (rows.length === 0 && onlyNoClient) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Todos los encargos tienen cliente"
        description="Ningún encargo está sin cliente ni con un cliente de ClickUp sin ficha."
        action={
          <Link href="/dashboard/operaciones/encargos" className="text-sm text-brand underline-offset-2 hover:underline">
            Ver todos los encargos
          </Link>
        }
      />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Todavía no hay encargos"
        description="Crea el primero y aparecerá aquí con su estado y el enlace a ClickUp."
        action={newButton}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] font-semibold">
            Encargos
            <AutoRefresh className="font-normal" />
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {rows.length === 200 ? 'Los 200 más recientes' : `${rows.length} encargo${rows.length === 1 ? '' : 's'}`}
            {onlyNoClient ? ' sin cliente' : ''}, del más nuevo al más antiguo.
          </p>
        </div>
        {newButton}
      </div>

      <nav aria-label="Filtrar encargos" className="flex flex-wrap gap-1.5">
        {[
          { href: '/dashboard/operaciones/encargos', label: 'Todos', active: !onlyNoClient, n: null },
          { href: '/dashboard/operaciones/encargos?cliente=sin', label: 'Sin cliente', active: onlyNoClient, n: Number(noClientCount) }
        ].map((f) => (
          <Link
            key={f.label}
            href={f.href}
            aria-current={f.active ? 'true' : undefined}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring',
              f.active ? 'border-brand/50 bg-brand-soft text-foreground' : 'bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            {f.label}
            {f.n !== null && <span className="tabular-nums text-muted-foreground">{f.n}</span>}
          </Link>
        ))}
      </nav>

      {onlyNoClient && (
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground text-pretty">
          Para que un encargo pase a su cliente, pon el cliente en el campo «Cliente» de la tarea en ClickUp: aquí se actualiza en
          2 o 3 minutos. Si el cliente sale pero «sin ficha», vincula esa opción de ClickUp a su ficha (ficha del cliente → Más →
          Operaciones).
        </p>
      )}

      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Creado</th>
                <th scope="col">Encargo</th>
                <th scope="col">Lista</th>
                <th scope="col">Cliente</th>
                <th scope="col">Responsable</th>
                <th scope="col">Entrega</th>
                <th scope="col">Estado</th>
                <th scope="col">Flujo</th>
                <th scope="col">ClickUp</th>
                <th scope="col">Última acción</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = STATUS[r.status] ?? { label: r.status, tone: 'neutral' as const };
                const work = WORK[r.workStatus] ?? { label: r.workStatus, tone: 'neutral' as const };
                const act = lastAction.get(r.id);
                return (
                  <tr key={r.id} className="align-top">
                    <td className="whitespace-nowrap text-muted-foreground">{fmt.format(r.createdAt)}</td>
                    <td className="min-w-[16rem]">
                      <p className="font-medium text-pretty">{r.title}</p>
                      {r.priority && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {r.priority === 1 ? (
                            <Badge tone="danger" dot>
                              Prioridad {PRIORITY[r.priority]}
                            </Badge>
                          ) : (
                            <>Prioridad {PRIORITY[r.priority]}</>
                          )}
                        </p>
                      )}
                      {r.errorMessage && r.status !== 'creado' && (
                        <p className="mt-1 text-xs text-destructive">{r.errorMessage}</p>
                      )}
                    </td>
                    <td className="text-muted-foreground">{r.clickupListName ?? r.clickupListId}</td>
                    <td className="whitespace-nowrap">
                      {!r.clientOptionId ? (
                        <span className="text-muted-foreground/70">Sin cliente</span>
                      ) : (
                        <>
                          {r.clientName ?? '—'}
                          {!linkedSet.has(r.clientOptionId) && <span className="block text-xs text-warning-strong">sin ficha</span>}
                        </>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      {r.assigneeName ?? <span className="text-muted-foreground/70">Sin asignar</span>}
                    </td>
                    <td className="whitespace-nowrap">
                      {r.dueDate ? new Date(r.dueDate + 'T00:00:00').toLocaleDateString('es-ES') : '—'}
                    </td>
                    <td>
                      <Badge tone={st.tone} dot>
                        {st.label}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap text-xs">
                      {r.status === 'creado' ? <Badge tone={work.tone}>{work.label}</Badge> : <span className="text-muted-foreground/70">—</span>}
                      {r.reviewerKey && <span className="mt-1 block text-muted-foreground">Con revisión</span>}
                    </td>
                    <td className="whitespace-nowrap">
                      {r.clickupTaskUrl ? (
                        <a
                          href={r.clickupTaskUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-sm text-brand hover:underline"
                        >
                          Abrir tarea
                          <ExternalLink className="size-3" aria-hidden />
                        </a>
                      ) : (
                        <RetryButton requestId={r.id} />
                      )}
                    </td>
                    <td className="text-xs">
                      {act ? (
                        <span title={act.by ?? ''} className="flex flex-col items-start gap-1">
                          <Badge tone="success">{act.label}</Badge>
                          <span className="whitespace-nowrap text-muted-foreground">{fmt.format(act.at)}</span>
                        </span>
                      ) : r.seenAt ? (
                        // Encargos anteriores a los eventos: solo consta que se vio.
                        <span title={r.seenBy ?? ''} className="flex flex-col items-start gap-1">
                          <Badge tone="success">Visto</Badge>
                          <span className="whitespace-nowrap text-muted-foreground">{fmt.format(r.seenAt)}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground/70">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

