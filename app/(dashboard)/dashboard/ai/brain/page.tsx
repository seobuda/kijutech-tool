import { redirect } from 'next/navigation';
import { getUser, getUserTenantRoleNames } from '@/lib/db/queries';
import {
  getIntentModifiersStats,
  getClusteringExamplesStats,
  getClusteringFeedbackStats,
} from '@/lib/ai/brain-queries';
import { BRAIN_THRESHOLDS } from '@/lib/ai/brain-constants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ActivationBanner } from './activation-banner';

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

  const [modifiers, examples, feedback] = await Promise.all([
    getIntentModifiersStats(),
    getClusteringExamplesStats(user.tenantId),
    getClusteringFeedbackStats(user.tenantId),
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
    </section>
  );
}
