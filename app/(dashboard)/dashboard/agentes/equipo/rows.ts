// Una duda del equipo tal como la pinta QuestionCard (Dudas del equipo y Para ti). Sin «use client»: lo usan las páginas.
import type { AgtTeamQuestion } from '@/lib/db/schema';

export type QuestionRow = {
  id: string;
  askedBy: string;
  question: string;
  followups: string[];
  status: string;
  tier: string | null;
  topic: string | null;
  aiAnswer: string | null;
  finalAnswer: string | null;
  answeredBy: string | null;
  feedback: string | null;
  feedbackNote: string | null;
  reason: string | null;
  revisions: string[];
  tools: string[];
  costUsd: number;
  createdAt: string;
};

export function toQuestionRow(q: AgtTeamQuestion): QuestionRow {
  return {
    id: q.id,
    askedBy: q.askedByName,
    question: q.question,
    followups: ((q.followups as { text: string }[]) ?? []).map((f) => f.text),
    status: q.status,
    tier: q.tier,
    topic: q.topicKey,
    aiAnswer: q.aiAnswer,
    finalAnswer: q.finalAnswer,
    answeredBy: q.answeredBy,
    feedback: q.feedback,
    feedbackNote: q.feedbackNote,
    reason: q.escalationReason,
    revisions: ((q.revisions as { instruction: string }[]) ?? []).map((r) => r.instruction),
    tools: ((q.toolCalls as { name: string }[]) ?? []).map((t) => t.name),
    costUsd: Number(q.costUsd ?? 0),
    createdAt: q.createdAt.toISOString()
  };
}
