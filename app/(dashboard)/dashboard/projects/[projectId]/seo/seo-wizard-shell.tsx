'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { SeoAssistantContext } from './seo-assistant-context';
import { SeoAssistantPanel } from './seo-assistant-panel';
import { SeoWizardNav } from './seo-wizard-nav';
import type { SeoManifestStage } from '@/lib/seo/manifest';
import type { SeoKnowledgeCard } from '@/lib/db/schema';

type StageProgressRow = {
  stageKey: string;
  status: string;
  createdAt: string | Date;
  completedAt: string | Date | null;
};

type Props = {
  projectId: string;
  stages: SeoManifestStage[];
  initialProgress: StageProgressRow[];
  cardsByStage: Record<string, SeoKnowledgeCard[]>;
  tutorUrl: string;
  children: React.ReactNode;
};

export function SeoWizardShell({
  projectId,
  stages,
  initialProgress,
  cardsByStage,
  tutorUrl,
  children
}: Props) {
  const pathname = usePathname();
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  const currentStageKey = stages.find(
    (stage) => pathname === `/dashboard/projects/${projectId}/seo/${stage.key}`
  )?.key;
  const cards = currentStageKey ? (cardsByStage[currentStageKey] ?? []) : [];

  return (
    <SeoAssistantContext.Provider value={{ setFocusedKey }}>
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-72 shrink-0 space-y-6 lg:sticky lg:top-6 lg:self-start">
          <SeoWizardNav
            projectId={projectId}
            stages={stages}
            initialProgress={initialProgress}
          />
          <SeoAssistantPanel cards={cards} focusedKey={focusedKey} tutorUrl={tutorUrl} />
        </div>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </SeoAssistantContext.Provider>
  );
}
