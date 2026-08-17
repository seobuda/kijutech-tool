'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { CheckCircle2, Circle, CircleDot, Lock } from 'lucide-react';
import { seoKwProgressSwrKey } from '@/lib/seo/client-keys';
import { KW_STEPS } from '@/lib/seo/kw-steps';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type KwProgressRow = { step: string; status: string };

type Props = {
  projectId: string;
  initialProgress: KwProgressRow[];
  competitorsCount: number;
  rawCount: number;
};

export function KwStepsNav({
  projectId,
  initialProgress,
  competitorsCount,
  rawCount
}: Props) {
  const pathname = usePathname();
  const key = seoKwProgressSwrKey(projectId);
  const { data } = useSWR<{ progress: KwProgressRow[] }>(key, fetcher, {
    fallbackData: { progress: initialProgress }
  });

  useEffect(() => {
    mutate(key);
  }, [pathname, key]);

  const progressByStep = new Map(
    (data?.progress ?? []).map((p) => [p.step, p.status])
  );

  function isLocked(stepKey: string) {
    if (stepKey === 'keywords') return competitorsCount < 3;
    if (stepKey === 'clustering') return rawCount < 10;
    if (stepKey === 'clusters') return progressByStep.get('clustering') !== 'completed';
    return false;
  }

  function lockMessage(stepKey: string) {
    if (stepKey === 'keywords')
      return `Necesitas 3 competidores (tienes ${competitorsCount})`;
    if (stepKey === 'clustering')
      return `Necesitas 10 keywords (tienes ${rawCount})`;
    if (stepKey === 'clusters') return 'Completa el paso 3 primero';
    return '';
  }

  return (
    <nav className="w-full space-y-1">
      <p className="px-3 text-xs font-medium uppercase text-muted-foreground tracking-wide mb-1">
        Keyword Research
      </p>
      {KW_STEPS.map((step, index) => {
        const status = progressByStep.get(step.key) ?? 'pending';
        const locked = isLocked(step.key);
        const href = `/dashboard/projects/${projectId}/seo/keyword-research/${step.path}`;
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

        if (locked) {
          return (
            <div
              key={step.key}
              className="px-3 py-2 rounded-md text-sm text-muted-foreground opacity-60 cursor-not-allowed"
            >
              <div className="flex items-center space-x-2">
                <Lock className="h-4 w-4 text-gray-300 shrink-0" />
                <span>
                  {index + 1}. {step.name}
                </span>
              </div>
              <p className="text-xs mt-0.5 ml-6">{lockMessage(step.key)}</p>
            </div>
          );
        }

        return (
          <Link key={step.key} href={href} prefetch={false}>
            <div
              className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm ${
                isActive ? 'bg-gray-100 font-medium' : 'hover:bg-gray-50'
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
              <span>
                {index + 1}. {step.name}
              </span>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
