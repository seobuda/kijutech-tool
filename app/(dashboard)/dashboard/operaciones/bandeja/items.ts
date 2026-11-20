// Revisiones y bloqueos tal como los pinta BandejaList (con sus botones de decidir). Lo usan Mi bandeja y Para ti.
import { waitLabel, type InboxItem } from '@/lib/operaciones/inbox';
import type { BandejaItem } from './bandeja-list';

export function toBandejaItems(inbox: InboxItem[], now = new Date()): BandejaItem[] {
  return inbox.map((i) =>
    i.kind === 'review'
      ? {
          kind: 'review',
          id: i.req.id,
          title: i.req.title,
          person: i.req.assigneeName ?? '—',
          note: i.req.doneNote,
          taskUrl: i.req.clickupTaskUrl,
          urgent: i.req.priority === 1,
          wait: waitLabel(i.since, now)
        }
      : {
          kind: 'blocker',
          id: i.blocker.id,
          title: i.req.title,
          person: i.blocker.askedByName ?? '—',
          question: i.blocker.question,
          summary: i.blocker.aiSummary,
          options: Array.isArray(i.blocker.aiOptions) ? (i.blocker.aiOptions as string[]) : [],
          recommendation: i.blocker.aiRecommendation,
          proposal: i.proposal,
          taskUrl: i.req.clickupTaskUrl,
          urgent: i.req.priority === 1,
          wait: waitLabel(i.since, now)
        }
  );
}
