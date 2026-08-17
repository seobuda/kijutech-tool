import { ONBOARDING_CHECKLIST_ITEMS } from './onboarding-checklist-items';
import { KICKOFF_QUESTIONS } from './kickoff-questions';
import {
  AUDIT_CHECKPOINTS,
  AUDIT_AREA_LABELS,
  formatCheckPointLabel
} from './audit-checkpoints';

export type ContextKeyOption = { key: string; label: string };

export const CONTEXT_KEYS_BY_STAGE: Record<string, ContextKeyOption[]> = {
  onboarding: ONBOARDING_CHECKLIST_ITEMS.map((item) => ({
    key: item.itemKey,
    label: item.label
  })),
  kickoff: KICKOFF_QUESTIONS.map((q) => ({
    key: q.questionKey,
    label: q.question
  })),
  audit: Object.entries(AUDIT_CHECKPOINTS).flatMap(([area, checkpoints]) =>
    checkpoints.map((cp) => ({
      key: cp,
      label: `${AUDIT_AREA_LABELS[area]} — ${formatCheckPointLabel(cp)}`
    }))
  ),
  keyword_research: [
    { key: 'target_keyword', label: 'Paso 1 — Keyword objetivo' },
    { key: 'kw_import', label: 'Paso 2 — Importar keywords' }
  ]
};

export function getContextKeyOptions(stageKey: string): ContextKeyOption[] {
  return CONTEXT_KEYS_BY_STAGE[stageKey] ?? [];
}
