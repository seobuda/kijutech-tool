'use client';

import { useState } from 'react';
import { SeoAssistantContext } from './seo-assistant-context';
import { SeoAssistantPanel } from './seo-assistant-panel';
import type { SeoKnowledgeCard } from '@/lib/db/schema';

type Props = {
  cards: SeoKnowledgeCard[];
  children: React.ReactNode;
};

export function SeoStageLayout({ cards, children }: Props) {
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  return (
    <SeoAssistantContext.Provider value={{ setFocusedKey }}>
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="w-full lg:basis-3/5 min-w-0 space-y-6">{children}</div>
        <div className="w-full lg:basis-2/5 min-w-0">
          <SeoAssistantPanel cards={cards} focusedKey={focusedKey} />
        </div>
      </div>
    </SeoAssistantContext.Provider>
  );
}
