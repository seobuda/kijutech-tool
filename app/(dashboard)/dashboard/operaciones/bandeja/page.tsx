import { AutoRefresh } from '@/components/ui/auto-refresh';
import { redirect } from 'next/navigation';
import { Lock } from 'lucide-react';
import { EmptyState } from '@/components/ui/page';
import { getUser } from '@/lib/db/queries';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { getInbox, waitLabel } from '@/lib/operaciones/inbox';
import { getPendingEmailProposals } from '@/lib/operaciones/owner-queue';
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
  const [inbox, emails] = await Promise.all([getInbox(user.tenantId), getPendingEmailProposals(user.tenantId)]);
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
      {emails.length > 0 && (
        <section className="rounded-xl border bg-card shadow-xs" aria-label="Correos de clientes por responder">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Mail className="size-4" aria-hidden /> Correos de clientes por responder ({emails.length})
            </h3>
            <Link href="/dashboard/operaciones/correos" className="text-sm font-medium text-primary underline-offset-2 hover:underline">
              Abrir Correos
            </Link>
          </div>
          <ul className="divide-y">
            {emails.map((e) => (
              <li key={e.actionId} className="px-5 py-3 text-sm">
                <p className="font-medium">
                  {e.top && <span title="Cliente Top">⭐ </span>}
                  {e.clientName ?? e.from} · <span className="font-normal">{e.subject}</span>
                </p>
                <p className="text-muted-foreground">Espera {waitLabel(e.since, now)} · la respuesta propuesta está en Correos y en su aviso de Telegram</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <BandejaList items={items} />
    </div>
  );
}
