import Link from 'next/link';
import { MessagesSquare } from 'lucide-react';
import { requirePagePermission } from '@/lib/auth/permissions';
import { Badge, EmptyState, Section } from '@/components/ui/page';
import { conversationMessages, listConversations } from '@/lib/agentes/store';

export const dynamic = 'force-dynamic';

const CHANNEL: Record<string, string> = { telegram: 'Telegram', email: 'Correo', web: 'Web' };
const fmt = (d: Date) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);

// Agentes → Conversaciones: lo que se ha hablado con cada agente, con las herramientas que usó y su coste.
export default async function ConversacionesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await requirePagePermission('admin');
  const { c } = await searchParams;
  const convs = await listConversations(user.tenantId);
  const selected = convs.find((x) => x.c.id === c) ?? convs[0];
  const messages = selected ? await conversationMessages(user.tenantId, selected.c.id) : [];
  if (!convs.length) return <EmptyState icon={MessagesSquare} title="Sin conversaciones todavía" description="Escribe o manda un audio al bot de Telegram (desde tu chat) y la conversación aparecerá aquí." />;
  return (
    <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
      <nav aria-label="Conversaciones" className="space-y-1">
        {convs.map((x) => (
          <Link key={x.c.id} href={`?c=${x.c.id}`} aria-current={x.c.id === selected?.c.id ? 'page' : undefined} className={`block rounded-lg border px-3 py-2 text-sm ${x.c.id === selected?.c.id ? 'border-primary bg-primary/5' : 'bg-card hover:bg-muted'}`}>
            <span className="font-medium">{x.agentName}</span> · {CHANNEL[x.c.channel] ?? x.c.channel}
            <span className="block text-xs text-muted-foreground">
              {x.c.peerName ?? x.c.peer} · {fmt(x.c.lastMessageAt)}
            </span>
          </Link>
        ))}
      </nav>
      {selected && (
        <Section title={`${selected.agentName} · ${CHANNEL[selected.c.channel] ?? selected.c.channel}`} description={selected.c.summary ? `Resumen: ${selected.c.summary.slice(0, 400)}` : undefined}>
          <ol className="space-y-3 px-5 py-4 text-sm">
            {messages.map((m) => {
              const tools = (m.toolCalls as { name: string; proposed?: boolean; ok: boolean }[] | null) ?? [];
              const audio = m.audio as { seconds?: number | null } | null;
              return (
                <li key={m.id} className={m.role === 'user' ? 'text-right' : ''}>
                  <div className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-left ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{m.content.replace(/<[^>]+>/g, '')}</div>
                  <p className="mt-0.5 space-x-1 text-xs text-muted-foreground">
                    <span>{fmt(m.createdAt)}</span>
                    {audio && <Badge tone="info">🎙 audio{audio.seconds ? ` ${audio.seconds} s` : ''}</Badge>}
                    {tools.map((t, i) => (
                      <Badge key={i} tone={t.proposed ? 'warning' : t.ok ? 'neutral' : 'danger'}>
                        {t.name}
                        {t.proposed ? ' · propuesta' : ''}
                      </Badge>
                    ))}
                    {m.costUsd && <span>{Number(m.costUsd).toFixed(4)} $</span>}
                  </p>
                </li>
              );
            })}
          </ol>
        </Section>
      )}
    </div>
  );
}
