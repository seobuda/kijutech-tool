'use client';

import { createContext, useContext } from 'react';

type SeoAssistantContextValue = {
  setFocusedKey: (key: string | null) => void;
};

export const SeoAssistantContext = createContext<SeoAssistantContextValue>({
  setFocusedKey: () => {}
});

export function useSeoAssistantFocus() {
  return useContext(SeoAssistantContext).setFocusedKey;
}
