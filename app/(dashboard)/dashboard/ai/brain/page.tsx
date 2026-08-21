import { redirect } from 'next/navigation';
import { getUser, getUserTenantRoleNames } from '@/lib/db/queries';
import {
  getIntentModifiersStats,
  getClusteringExamplesStats,
  getClusteringFeedbackStats,
  getTokenUsageByFunction,
  getTokenUsageThisMonth,
  getRecentAIJobs,
} from '@/lib/ai/brain-queries';
import { BRAIN_THRESHOLDS } from '@/lib/ai/brain-constants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ActivationBanner } from './activation-banner';

// Solo estas dos keys de ai_jobs.function tienen nombre legible pedido —
// cualquier otra (ej. "test_prompt", "cluster_keywords", vistas en la
// BD real) se muestra tal cual, sin inventar una traducción.
const FUNCTION_LABELS: Record<string, string> = {
  cluster_strategic: 'Clustering estratégico',
  competitor_analysis: 'Análisis de competidores',
};

function functionLabel(fn: string): string {
  return FUNCTION_LABELS[fn] ?? fn;
}

function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

const STATUS_BADGE: Record<string, string> = {
  processing: 'bg-gray-100 text-gray-600',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

const STATUS_LABEL: Record<string, string> = {
  processing: 'Procesando',
  completed: 'Completado',
  failed: 'Fallido',
};

function ProgressBar({
  value,
  threshold,
  ready,
}: {
  value: number;
  threshold: number;
  ready: boolean;
}) {
  const pct = Math.min(100, Math.round((value / threshold) * 100));
  return (
    <div className="space-y-1">
      <div className="h-2 w-full rounded-full bg-gray-200">
        <div
          className={`h-2 rounded-full ${ready ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {ready ? 'Listo para activar' : `${value} de ${threshold}`}
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <p className="text-sm text-muted-foreground">
      Aún no hay datos. Los datos aparecen al usar el Keyword Research.
    </p>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
      {children}
    </span>
  );
}

export default async function BrainPage() {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  const roleNames = await getUserTenantRoleNames(user.id);
  if (!roleNames.includes('super_admin')) {
    redirect('/dashboard');
  }

  const [modifiers, examples, feedback, usageByFunction, usageThisMonth, recentJobs] =
    await Promise.all([
      getIntentModifiersStats(),
      getClusteringExamplesStats(user.tenantId),
      getClusteringFeedbackStats(user.tenantId),
      getTokenUsageByFunction(user.tenantId),
      getTokenUsageThisMonth(user.tenantId),
      getRecentAIJobs(user.tenantId, 10),
    ]);

  const modifiersReady = modifiers.total >= BRAIN_THRESHOLDS.intentModifiers;
  const examplesReady = examples.total >= BRAIN_THRESHOLDS.clusteringExamples;

  return (
    <section className="flex-1 p-4 lg:p-8 space-y-6">
      <div>
        <h1 className="text-lg lg:text-2xl font-medium">Cerebro de IA</h1>
        <p className="text-sm text-muted-foreground">
          Estado de aprendizaje del sistema. Activa funciones automáticas cuando el sistema
          tenga suficientes datos.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Modificadores de intención</CardTitle>
          <CardDescription>
            El sistema aprende qué sufijos cambian la intención de búsqueda y cuáles no. Con
            suficientes modificadores confirmados, el pre-filtrado automático antes del
            clustering mejora significativamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {modifiers.total === 0 ? (
            <EmptyState />
          ) : (
            <>
              <p className="text-3xl font-semibold">{modifiers.total}</p>
              <ProgressBar
                value={modifiers.total}
                threshold={BRAIN_THRESHOLDS.intentModifiers}
                ready={modifiersReady}
              />
              <div className="flex flex-wrap gap-2">
                <Pill>{modifiers.humanConfirmed} confirmados por humano</Pill>
                <Pill>{modifiers.aiClassified} clasificados por IA</Pill>
                <Pill>{modifiers.humanCorrected} corregidos</Pill>
              </div>
              {modifiersReady && <ActivationBanner label="pre-filtrado automático" />}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ejemplos de clustering validados</CardTitle>
          <CardDescription>
            Cada vez que confirmas un cluster, el sistema guarda un ejemplo vectorizado. Con
            suficientes ejemplos, el clustering usa RAG para mejorar sus propuestas basándose en
            decisiones pasadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {examples.total === 0 ? (
            <EmptyState />
          ) : (
            <>
              <p className="text-3xl font-semibold">{examples.total}</p>
              <ProgressBar
                value={examples.total}
                threshold={BRAIN_THRESHOLDS.clusteringExamples}
                ready={examplesReady}
              />
              <p className="text-xs text-muted-foreground">
                Los ejemplos se generan automáticamente al confirmar clusters en el paso 3 del
                Keyword Research.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Feedback acumulado</CardTitle>
          <CardDescription>
            Cada acción sobre clusters y keywords es una señal de aprendizaje. Este feedback
            alimentará futuras mejoras automáticas del sistema.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {feedback.total === 0 ? (
            <EmptyState />
          ) : (
            <>
              <p className="text-3xl font-semibold">{feedback.total}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Confirmados sin cambios</p>
                  <p className="font-medium">{feedback.confirmed}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Editados antes de confirmar</p>
                  <p className="font-medium">{feedback.edited}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Eliminados</p>
                  <p className="font-medium">{feedback.deleted}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Keywords movidas</p>
                  <p className="font-medium">{feedback.keywordMoved}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Intenciones corregidas</p>
                  <p className="font-medium">{feedback.intentChanged}</p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-lg font-medium">Uso de IA</h2>

        {recentJobs.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                Aún no hay llamadas de IA registradas.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Tokens este mes</p>
                    <p className="text-2xl font-semibold">
                      {usageThisMonth.totalTokens.toLocaleString('es-ES')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Coste estimado este mes</p>
                    <p className="text-2xl font-semibold">
                      {usageThisMonth.totalCost.toFixed(2)}€
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Llamadas este mes</p>
                    <p className="text-2xl font-semibold">{usageThisMonth.totalCalls}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Desglose por función</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-2 text-left font-medium">Función</th>
                        <th className="p-2 text-left font-medium">Tokens totales</th>
                        <th className="p-2 text-left font-medium">Coste</th>
                        <th className="p-2 text-left font-medium">Llamadas</th>
                        <th className="p-2 text-left font-medium">Errores</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usageByFunction.map((row) => (
                        <tr key={row.function} className="border-t">
                          <td className="p-2">{functionLabel(row.function)}</td>
                          <td className="p-2">{row.totalTokens.toLocaleString('es-ES')}</td>
                          <td className="p-2">{row.totalCost.toFixed(4)}€</td>
                          <td className="p-2">{row.totalCalls}</td>
                          <td className="p-2">{row.failedCalls}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Últimas 10 llamadas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-2 text-left font-medium">Fecha</th>
                        <th className="p-2 text-left font-medium">Función</th>
                        <th className="p-2 text-left font-medium">Entrada</th>
                        <th className="p-2 text-left font-medium">Salida</th>
                        <th className="p-2 text-left font-medium">Coste</th>
                        <th className="p-2 text-left font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentJobs.map((job) => (
                        <tr key={job.id} className="border-t">
                          <td className="p-2 whitespace-nowrap">{formatDateTime(job.createdAt)}</td>
                          <td className="p-2">{functionLabel(job.function)}</td>
                          <td className="p-2">{job.inputTokens ?? '—'}</td>
                          <td className="p-2">{job.outputTokens ?? '—'}</td>
                          <td className="p-2">
                            {job.estimatedCost !== null ? `${job.estimatedCost.toFixed(4)}€` : '—'}
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
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </section>
  );
}
