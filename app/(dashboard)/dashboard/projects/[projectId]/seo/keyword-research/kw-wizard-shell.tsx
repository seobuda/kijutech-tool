'use client';

import { useState } from 'react';
import { SeoAssistantContext } from '../seo-assistant-context';
import { SeoAssistantPanel } from '../seo-assistant-panel';
import { KwStepsNav } from './kw-steps-nav';
import type { SeoKnowledgeCard } from '@/lib/db/schema';

type KwProgressRow = { step: string; status: string };

type Props = {
  projectId: string;
  cards: SeoKnowledgeCard[];
  tutorUrl: string;
  progress: KwProgressRow[];
  competitorsCount: number;
  rawCount: number;
  children: React.ReactNode;
};

export function KwWizardShell({
  projectId,
  cards,
  tutorUrl,
  progress,
  competitorsCount,
  rawCount,
  children
}: Props) {
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  return (
    <SeoAssistantContext.Provider value={{ setFocusedKey }}>
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-72 shrink-0 space-y-6 lg:sticky lg:top-6 lg:self-start">
          <KwStepsNav
            projectId={projectId}
            initialProgress={progress}
            competitorsCount={competitorsCount}
            rawCount={rawCount}
          />
          <SeoAssistantPanel cards={cards} focusedKey={focusedKey} tutorUrl={tutorUrl} />
        </div>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </SeoAssistantContext.Provider>
  );
}
