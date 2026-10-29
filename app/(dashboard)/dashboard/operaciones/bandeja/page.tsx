import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getInbox, waitLabel } from '@/lib/operaciones/inbox';
import { BandejaList, type BandejaItem } from './bandeja-list';

export const dynamic = 'force-dynamic';

export default async function BandejaPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const now = new Date();
  const inbox = await getInbox(user.tenantId);
  const items: BandejaItem[] = inbox.map((i) =>
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
          taskUrl: i.req.clickupTaskUrl,
          urgent: i.req.priority === 1,
          wait: waitLabel(i.since, now)
        }
  );

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-lg font-medium">Mi bandeja</h2>
        <p className="text-sm text-muted-foreground">
          Lo que está pendiente de ti, del que más espera al que menos. Desde aquí puedes aceptar, devolver o responder.
        </p>
      </div>
      <BandejaList items={items} />
    </div>
  );
}
