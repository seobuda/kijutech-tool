import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AI_PROVIDER_META } from '@/lib/ai/provider-meta';
import type { AiJob } from '@/lib/db/schema';

const STATUS_LABEL: Record<string, string> = {
  processing: 'Procesando',
  completed: 'Completado',
  failed: 'Fallido',
};

const STATUS_BADGE: Record<string, string> = {
  processing: 'bg-gray-100 text-gray-600',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

type Props = {
  jobs: AiJob[];
  monthlyTotals: { count: number; totalTokens: number; totalCost: number };
};

export function UsageMonitor({ jobs, monthlyTotals }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Uso reciente</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {jobs.length === 0 ? (
          <p className="text-muted-foreground">Todavía no hay ninguna llamada registrada.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-left font-medium">Fecha</th>
                  <th className="p-2 text-left font-medium">Función</th>
                  <th className="p-2 text-left font-medium">Proveedor</th>
                  <th className="p-2 text-left font-medium">Modelo</th>
                  <th className="p-2 text-left font-medium">Tokens</th>
                  <th className="p-2 text-left font-medium">Coste est.</th>
                  <th className="p-2 text-left font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const totalTokens = (job.inputTokens ?? 0) + (job.outputTokens ?? 0);
                  const meta = job.provider
                    ? AI_PROVIDER_META[job.provider as keyof typeof AI_PROVIDER_META]
                    : null;

                  return (
                    <tr key={job.id} className="border-t">
                      <td className="p-2 whitespace-nowrap">
                        {new Date(job.createdAt).toLocaleString('es-ES')}
                      </td>
                      <td className="p-2">{job.function}</td>
                      <td className="p-2">
                        {meta ? `${meta.emoji} ${meta.label}` : (job.provider ?? '—')}
                      </td>
                      <td className="p-2">{job.model ?? '—'}</td>
                      <td className="p-2">{totalTokens || '—'}</td>
                      <td className="p-2">
                        {job.estimatedCost != null ? `~${Number(job.estimatedCost).toFixed(4)}€` : '—'}
                      </td>
                      <td className="p-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            STATUS_BADGE[job.status] ?? STATUS_BADGE.processing
                          }`}
                        >
                          {STATUS_LABEL[job.status] ?? job.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-sm text-muted-foreground border-t pt-3">
          Este mes: <span className="font-medium text-foreground">{monthlyTotals.count}</span>{' '}
          llamadas ·{' '}
          <span className="font-medium text-foreground">{monthlyTotals.totalTokens}</span>{' '}
          tokens totales · ~
          <span className="font-medium text-foreground">
            {monthlyTotals.totalCost.toFixed(4)}
          </span>
          € estimado
        </p>
      </CardContent>
    </Card>
  );
}
