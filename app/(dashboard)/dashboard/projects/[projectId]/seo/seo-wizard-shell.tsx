'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { SeoAssistantContext } from './seo-assistant-context';
import { SeoAssistantPanel } from './seo-assistant-panel';
import { SeoWizardNav, type KwSubStepsData } from './seo-wizard-nav';
import type { SeoManifestStage } from '@/lib/seo/manifest';
import type { SeoKnowledgeCard } from '@/lib/db/schema';

const COLLAPSE_STORAGE_KEY = 'seo-wizard-nav-collapsed';

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
  kwSubStepsData: KwSubStepsData;
  children: React.ReactNode;
};

export function SeoWizardShell({
  projectId,
  stages,
  initialProgress,
  cardsByStage,
  tutorUrl,
  kwSubStepsData,
  children
}: Props) {
  const pathname = usePathname();
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (saved === '1') {
      setCollapsed(true);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  const currentStage = stages.find((stage) => {
    const href = `/dashboard/projects/${projectId}/seo/${stage.path ?? stage.key}`;
    return pathname === href || pathname.startsWith(`${href}/`);
  });
  const cards = currentStage ? (cardsByStage[currentStage.key] ?? []) : [];

  return (
    <SeoAssistantContext.Provider value={{ setFocusedKey }}>
      <div className="flex flex-col lg:flex-row gap-6">
        <div
          className={`w-full ${collapsed ? 'lg:w-12' : 'lg:w-[220px]'} shrink-0 lg:sticky lg:top-6 lg:self-start transition-all duration-200`}
        >
          <SeoWizardNav
            projectId={projectId}
            stages={stages}
            initialProgress={initialProgress}
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((c) => !c)}
            kwSubStepsData={kwSubStepsData}
          />
        </div>
        <div className="flex-1 min-w-0">{children}</div>
        <div className="hidden md:block w-[280px] shrink-0 border-l border-gray-200 pl-6 lg:sticky lg:top-6 lg:h-fit lg:max-h-[calc(100vh-48px)] lg:overflow-y-auto">
          <SeoAssistantPanel cards={cards} focusedKey={focusedKey} tutorUrl={tutorUrl} />
        </div>
      </div>
    </SeoAssistantContext.Provider>
  );
}
