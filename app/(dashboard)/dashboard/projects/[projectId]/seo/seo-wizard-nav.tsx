'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { CheckCircle2, Circle, CircleDot, Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { seoProgressSwrKey } from '@/lib/seo/client-keys';
import { formatCompletedAt } from '@/lib/seo/format';
import type { SeoManifestStage } from '@/lib/seo/manifest';

const FUNCTIONAL_STAGES = ['onboarding', 'kickoff', 'audit'];

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type StageProgressRow = {
  stageKey: string;
  status: string;
  completedAt: string | Date | null;
};

type Props = {
  projectId: string;
  stages: SeoManifestStage[];
  initialProgress: StageProgressRow[];
};

export function SeoWizardNav({ projectId, stages, initialProgress }: Props) {
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

  return (
    <nav className="w-full lg:w-64 shrink-0 space-y-1">
      {stages.map((stage) => {
        const isFunctional = FUNCTIONAL_STAGES.includes(stage.key);
        const stageProgress = progressByStage.get(stage.key);
        const status = stageProgress?.status ?? 'pending';
        const href = `/dashboard/projects/${projectId}/seo/${stage.key}`;
        const isActive = pathname === href;

        const Icon =
          status === 'completed'
            ? CheckCircle2
            : status === 'in_progress'
              ? CircleDot
              : Circle;
        const iconColor =
          status === 'completed'
            ? 'text-green-600'
            : status === 'in_progress'
              ? 'text-blue-600'
              : 'text-gray-400';

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
          <div
            key={stage.key}
            className={`flex items-center rounded-md text-sm ${
              isActive ? 'bg-gray-100 font-medium' : 'hover:bg-gray-50'
            }`}
          >
            <Link href={href} prefetch={false} className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 px-3 py-2">
                <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
                <span>{stage.name}</span>
              </div>
            </Link>
            {status === 'completed' && stageProgress?.completedAt && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="mr-3 shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <Info className="h-3.5 w-3.5" />
                    <span className="sr-only">Fecha de completado</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  Completada el {formatCompletedAt(stageProgress.completedAt)}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        );
      })}
    </nav>
  );
}
