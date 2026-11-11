import Link from 'next/link';
import { desc, eq, inArray, and } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { opsRequestEvents, opsRequests } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { ClipboardList, ExternalLink, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState } from '@/components/ui/page';
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

export default async function EncargosPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const rows = await db
    .select()
    .from(opsRequests)
    .where(eq(opsRequests.tenantId, user.tenantId))
    .orderBy(desc(opsRequests.createdAt))
    .limit(200);

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
          <h2 className="text-[15px] font-semibold">Encargos</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {rows.length === 200 ? 'Los 200 más recientes' : `${rows.length} encargo${rows.length === 1 ? '' : 's'}`}, del más
            nuevo al más antiguo.
          </p>
        </div>
        {newButton}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Creado</th>
                <th scope="col">Encargo</th>
                <th scope="col">Lista</th>
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

