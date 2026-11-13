import { desc, eq } from 'drizzle-orm';
import { ListChecks } from 'lucide-react';
import { requirePagePermission } from '@/lib/auth/permissions';
import { db } from '@/lib/db/drizzle';
import { agtAgents, agtJobs } from '@/lib/db/schema';
import { Badge, EmptyState } from '@/components/ui/page';
import { RetryJobButton } from './retry-button';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; tone: 'neutral' | 'info' | 'success' | 'danger' }> = {
  en_cola: { label: 'En cola', tone: 'neutral' },
  trabajando: { label: 'Trabajando', tone: 'info' },
  hecho: { label: 'Hecho', tone: 'success' },
  fallido: { label: 'Fallido', tone: 'danger' },
  cancelado: { label: 'Cancelado', tone: 'neutral' }
};
const fmt = (d: Date) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);

// Agentes → Trabajos: lo encargado a los subagentes, con su informe.
export default async function TrabajosPage() {
  const user = await requirePagePermission('admin');
  const rows = await db
    .select({ j: agtJobs, agent: agtAgents.name })
    .from(agtJobs)
    .innerJoin(agtAgents, eq(agtAgents.id, agtJobs.agentId))
    .where(eq(agtJobs.tenantId, user.tenantId))
    .orderBy(desc(agtJobs.createdAt))
    .limit(50);
  if (!rows.length) return <EmptyState icon={ListChecks} title="Sin trabajos todavía" description="Pídele al agente principal un análisis (por ejemplo «revisa el último artículo de la web de un cliente») y el trabajo aparecerá aquí con su informe." />;
  return (
    <ul className="space-y-3">
      {rows.map(({ j, agent }) => (
        <li key={j.id} className="rounded-xl border bg-card p-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">
              {j.title} <span className="text-sm font-normal text-muted-foreground">· {agent} · pedido por {j.requestedBy} · {fmt(j.createdAt)}</span>
            </p>
            <div className="flex items-center gap-2">
              <Badge tone={STATUS[j.status]?.tone ?? 'neutral'}>{STATUS[j.status]?.label ?? j.status}</Badge>
              {j.costUsd && <span className="text-xs text-muted-foreground">{Number(j.costUsd).toFixed(4)} $</span>}
              {(j.status === 'fallido' || j.status === 'cancelado') && <RetryJobButton id={j.id} />}
            </div>
          </div>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-muted-foreground">Encargo{j.result ? ' e informe' : ''}</summary>
            <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{j.instruction}</p>
            {j.result && <div className="mt-3 whitespace-pre-wrap rounded-lg bg-muted p-3">{j.result}</div>}
            {j.error && <p className="mt-2 text-destructive">{j.error}</p>}
          </details>
        </li>
      ))}
    </ul>
  );
}
