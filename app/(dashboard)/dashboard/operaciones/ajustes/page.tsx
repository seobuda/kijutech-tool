import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsNotifications } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { getClickUpConnection, getClickUpRequestStats } from '@/lib/operaciones/queries';
import { getTranscriptionModel } from '@/lib/operaciones/settings';
import { getStructure } from '@/lib/operaciones/structure';
import { ensureTelegramMembers, getOwnerMember, getTelegramConfig, linkUrl } from '@/lib/operaciones/telegram-config';
import { getWorkerState } from '@/lib/operaciones/telegram-worker';
import { AjustesClickUp } from './ajustes-clickup';
import { TelegramAjustes, type TelegramView } from './telegram-ajustes';

export const dynamic = 'force-dynamic';

export default async function AjustesClickUpPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const [conn, transcriptionModel, structure, stats, tgCfg] = await Promise.all([
    getClickUpConnection(user.tenantId),
    getTranscriptionModel(user.tenantId),
    getStructure(user.tenantId),
    getClickUpRequestStats(user.tenantId),
    getTelegramConfig(user.tenantId)
  ]);

  // Telegram: una fila por miembro de ClickUp (se crean las que falten) y el registro de avisos.
  const tgMembers = tgCfg ? await ensureTelegramMembers(user.tenantId) : [];
  const owner = tgCfg ? await getOwnerMember(user.tenantId) : null;
  const notifications = tgCfg
    ? await db
        .select()
        .from(opsNotifications)
        .where(eq(opsNotifications.tenantId, user.tenantId))
        .orderBy(desc(opsNotifications.createdAt))
        .limit(15)
    : [];
  const worker = getWorkerState();

  const telegram: TelegramView = {
    hasBot: Boolean(tgCfg),
    botName: tgCfg?.botName ?? null,
    botUsername: tgCfg?.botUsername ?? null,
    testMode: tgCfg?.testMode ?? true,
    receiveMode: tgCfg?.receiveMode ?? 'polling',
    webhookUrl: tgCfg?.webhookUrl ?? null,
    pollAgeSeconds: tgCfg?.lastPollAt ? Math.round((Date.now() - tgCfg.lastPollAt.getTime()) / 1000) : null,
    lastError: tgCfg?.lastError ?? null,
    workerRole: worker?.role ?? 'unknown',
    members: tgMembers.map((m) => ({
      clickupUserId: m.clickupUserId,
      username: m.username,
      isOwner: owner?.id === m.id,
      linked: m.telegramChatId !== null,
      telegramUsername: m.telegramUsername,
      linkUrl: linkUrl(tgCfg?.botUsername ?? null, m.linkCode),
      timezone: m.timezone,
      workStart: m.workStart,
      dailyEnabled: m.dailyEnabled
    })),
    notifications: notifications.map((n) => ({
      id: n.id,
      createdAt: n.createdAt.toISOString(),
      kind: n.kind,
      forName: n.forName,
      status: n.status,
      attempts: n.attempts,
      lastError: n.lastError,
      skipped: (n.payload as { skipped?: string } | null)?.skipped ?? null
    }))
  };

  return (
    <div className="space-y-6">
      <AjustesClickUp
        hasToken={Boolean(conn)}
        updatedAt={conn?.updatedAt.toISOString() ?? null}
        transcriptionModel={transcriptionModel}
        structure={{
          syncedAt: structure.syncedAt?.toISOString() ?? null,
          workspaceName: structure.workspaceName,
          membersCount: structure.members.length,
          spaces: structure.spaces.map((s) => ({
            id: s.id,
            name: s.name,
            selected: s.selected,
            listCount: s.lists.length
          }))
        }}
        stats={stats}
      />
      <div className="max-w-3xl">
        <TelegramAjustes view={telegram} />
      </div>
    </div>
  );
}
