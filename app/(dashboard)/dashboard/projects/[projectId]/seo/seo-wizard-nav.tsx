'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleDot,
  Info,
  Lock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { seoKwProgressSwrKey, seoProgressSwrKey } from '@/lib/seo/client-keys';
import { formatCompletedAt } from '@/lib/seo/format';
import { KW_STEPS } from '@/lib/seo/kw-steps';
import type { SeoManifestStage } from '@/lib/seo/manifest';

const FUNCTIONAL_STAGES = ['onboarding', 'kickoff', 'audit', 'keyword_research'];

// Etapas que muestran sus pasos como sub-items anidados en el nav.
// Hoy solo Keyword Research; futuras etapas con sub-pasos (Estrategia,
// Ejecución...) se añaden aquí cuando existan.
const STAGES_WITH_SUBSTEPS = ['keyword_research'];

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type StageProgressRow = {
  stageKey: string;
  status: string;
  createdAt: string | Date;
  completedAt: string | Date | null;
};

type KwProgressRow = { step: string; status: string };

export type KwSubStepsData = {
  initialProgress: KwProgressRow[];
  competitorsCount: number;
  rawCount: number;
};

type Props = {
  projectId: string;
  stages: SeoManifestStage[];
  initialProgress: StageProgressRow[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  kwSubStepsData: KwSubStepsData;
};

function statusIcon(status: string) {
  const Icon =
    status === 'completed' ? CheckCircle2 : status === 'in_progress' ? CircleDot : Circle;
  const color =
    status === 'completed'
      ? 'text-green-600'
      : status === 'in_progress'
        ? 'text-blue-600'
        : 'text-gray-400';
  return { Icon, color };
}

export function SeoWizardNav({
  projectId,
  stages,
  initialProgress,
  collapsed,
  onToggleCollapse,
  kwSubStepsData
}: Props) {
  const pathname = usePathname();
  const key = seoProgressSwrKey(projectId);
  const { data } = useSWR<{ progress: StageProgressRow[] }>(key, fetcher, {
    fallbackData: { progress: initialProgress }
  });

  useEffect(() => {
    mutate(key);
  }, [pathname, key]);

  const progressByStage = new Map(
    (data?.progress ?? []).map((p) => [p.stageKey, p])
  );

  if (collapsed) {
    return (
      <nav className="w-12 mx-auto flex flex-col items-center space-y-2">
        {stages.map((stage) => {
          const isFunctional = FUNCTIONAL_STAGES.includes(stage.key);
          const stageProgress = progressByStage.get(stage.key);
          const status = stageProgress?.status ?? 'pending';
          const href = `/dashboard/projects/${projectId}/seo/${stage.path ?? stage.key}`;
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          const { Icon, color } = statusIcon(status);

          const iconEl = (
            <Icon
              className={`h-4 w-4 ${isFunctional ? color : 'text-gray-300'}`}
            />
          );

          const wrapperClass = `flex items-center justify-center h-8 w-8 rounded-md ${
            isActive ? 'bg-gray-100' : isFunctional ? 'hover:bg-gray-50' : 'opacity-60'
          }`;

          return (
            <Tooltip key={stage.key}>
              <TooltipTrigger asChild>
                {isFunctional ? (
                  <Link href={href} prefetch={false} className={wrapperClass} title={stage.name}>
                    {iconEl}
                  </Link>
                ) : (
                  <div className={`${wrapperClass} cursor-not-allowed`} title={stage.name}>
                    {iconEl}
                  </div>
                )}
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{stage.name}</p>
                {!isFunctional && <p className="text-xs opacity-70">Próximamente</p>}
              </TooltipContent>
            </Tooltip>
          );
        })}

        <div className="pt-2">
          <Button variant="ghost" size="icon" onClick={onToggleCollapse} title="Expandir nav">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </nav>
    );
  }

  return (
    <nav className="w-full space-y-1">
      {stages.map((stage) => {
        const isFunctional = FUNCTIONAL_STAGES.includes(stage.key);
        const stageProgress = progressByStage.get(stage.key);
        const status = stageProgress?.status ?? 'pending';
        const href = `/dashboard/projects/${projectId}/seo/${stage.path ?? stage.key}`;
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        const { Icon, color } = statusIcon(status);
        const showSubSteps = STAGES_WITH_SUBSTEPS.includes(stage.key) && isActive;

        if (!isFunctional) {
          return (
            <div
              key={stage.key}
              className="flex items-center justify-between px-3 py-2 rounded-md text-sm text-muted-foreground opacity-60 cursor-not-allowed"
            >
              <span className="flex items-center space-x-2">
                <Circle className="h-4 w-4 text-gray-300" />
                <span>{stage.name}</span>
              </span>
              <span className="text-xs border border-gray-300 rounded px-1.5 py-0.5">
                Próximamente
              </span>
            </div>
          );
        }

        return (
          <div key={stage.key}>
            <div
              className={`flex items-center rounded-md text-sm ${
                isActive ? 'bg-gray-100 font-medium' : 'hover:bg-gray-50'
              }`}
            >
              <Link href={href} prefetch={false} className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 px-3 py-2">
                  <Icon className={`h-4 w-4 shrink-0 ${color}`} />
                  <span>{stage.name}</span>
                </div>
              </Link>
              {stageProgress && status !== 'pending' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="mr-3 shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <Info className="h-3.5 w-3.5" />
                      <span className="sr-only">Fechas de la etapa</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Iniciada el {formatCompletedAt(stageProgress.createdAt)}</p>
                    {status === 'completed' && stageProgress.completedAt && (
                      <p>
                        Completada el {formatCompletedAt(stageProgress.completedAt)}
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            {showSubSteps && stage.key === 'keyword_research' && (
              <KwSubSteps projectId={projectId} data={kwSubStepsData} />
            )}
          </div>
        );
      })}

      <div className="flex justify-center pt-2 border-t">
        <Button variant="ghost" size="icon" onClick={onToggleCollapse} title="Colapsar nav">
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}

function KwSubSteps({ projectId, data }: { projectId: string; data: KwSubStepsData }) {
  const pathname = usePathname();
  const key = seoKwProgressSwrKey(projectId);
  const { data: swrData } = useSWR<{ progress: KwProgressRow[] }>(key, fetcher, {
    fallbackData: { progress: data.initialProgress }
  });

  useEffect(() => {
    mutate(key);
  }, [pathname, key]);

  const progressByStep = new Map(
    (swrData?.progress ?? []).map((p) => [p.step, p.status])
  );

  function isLocked(stepKey: string) {
    if (stepKey === 'keywords') return data.competitorsCount < 3;
    if (stepKey === 'clustering') return data.rawCount < 10;
    if (stepKey === 'clusters') return progressByStep.get('clustering') !== 'completed';
    return false;
  }

  function lockMessage(stepKey: string) {
    if (stepKey === 'keywords')
      return `Necesitas 3 competidores (tienes ${data.competitorsCount})`;
    if (stepKey === 'clustering')
      return `Necesitas 10 keywords (tienes ${data.rawCount})`;
    if (stepKey === 'clusters') return 'Completa el paso 3 primero';
    return '';
  }

  return (
    <div className="ml-5 mt-1 space-y-0.5 border-l pl-3">
      {KW_STEPS.map((step, index) => {
        const status = progressByStep.get(step.key) ?? 'pending';
        const locked = isLocked(step.key);
        const href = `/dashboard/projects/${projectId}/seo/keyword-research/${step.path}`;
        const isActive = pathname === href;
        const { Icon, color } = statusIcon(status);

        if (locked) {
          return (
            <div
              key={step.key}
              className="px-2 py-1.5 rounded-md text-sm text-muted-foreground opacity-60 cursor-not-allowed"
              title={lockMessage(step.key)}
            >
              <div className="flex items-center space-x-2">
                <Lock className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                <span className="text-sm">
                  {index + 1}. {step.name}
                </span>
              </div>
            </div>
          );
        }

        return (
          <Link key={step.key} href={href} prefetch={false}>
            <div
              className={`flex items-center space-x-2 px-2 py-1.5 rounded-md text-sm ${
                isActive ? 'bg-gray-100 font-medium' : 'hover:bg-gray-50'
              }`}
            >
              <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} />
              <span className="text-sm">
                {index + 1}. {step.name}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
