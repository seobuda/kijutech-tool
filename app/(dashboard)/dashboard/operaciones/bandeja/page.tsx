import { AutoRefresh } from '@/components/ui/auto-refresh';
import { redirect } from 'next/navigation';
import { Lock } from 'lucide-react';
import { EmptyState } from '@/components/ui/page';
import { getUser } from '@/lib/db/queries';
import { getInbox, waitLabel } from '@/lib/operaciones/inbox';
import { isInboxOwner } from '@/lib/operaciones/inbox-owner';
import { BandejaList, type BandejaItem } from './bandeja-list';

export const dynamic = 'force-dynamic';

export default async function BandejaPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  // «Mi bandeja» es solo del dueño: a los demás ni se les consulta ni se les muestra.
  if (!(await isInboxOwner(user))) {
    return (
      <EmptyState
        icon={Lock}
        title="Bandeja personal"
        description="Mi bandeja es personal: solo la ve quien lleva las operaciones."
        className="max-w-3xl"
      />
    );
  }

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
          proposal: i.proposal,
          taskUrl: i.req.clickupTaskUrl,
          urgent: i.req.priority === 1,
          wait: waitLabel(i.since, now)
        }
  );

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] font-semibold">
          Mi bandeja
          <AutoRefresh className="font-normal" />
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground text-pretty">
          Lo que está pendiente de ti, del que más espera al que menos. Desde aquí puedes aceptar, devolver o responder.
        </p>
      </div>
      <BandejaList items={items} />
    </div>
  );
}
