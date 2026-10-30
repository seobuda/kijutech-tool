import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsNotifications } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { ensureTelegramMembers, getOwnerMember, getTelegramConfig, linkUrl } from '@/lib/operaciones/telegram-config';
import { getOwnerTimezone, getScheduleMap, scheduleOrDefault } from '@/lib/operaciones/team-profiles';
import { getWorkerState } from '@/lib/operaciones/telegram-worker';
import { TelegramAjustes, type TelegramView } from '../ajustes/telegram-ajustes';

export const dynamic = 'force-dynamic';

export default async function TelegramPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const tgCfg = await getTelegramConfig(user.tenantId);

  // Una fila por miembro de ClickUp (se crean las que falten) y el registro de avisos.
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
  const schedules = await getScheduleMap(user.tenantId);

  const telegram: TelegramView = {
    hasBot: Boolean(tgCfg),
    botName: tgCfg?.botName ?? null,
    botUsername: tgCfg?.botUsername ?? null,
    testMode: tgCfg?.testMode ?? true,
    receiveMode: tgCfg?.receiveMode ?? 'polling',
    webhookUrl: tgCfg?.webhookUrl ?? null,
    pollAgeSeconds: tgCfg?.lastPollAt ? Math.round((Date.now() - tgCfg.lastPollAt.getTime()) / 1000) : null,
    lastError: tgCfg?.lastError ?? null,
    digestTimes: tgCfg?.digestTimes ?? '13:00,18:00',
    digestTimezone: await getOwnerTimezone(user.tenantId),
    workerRole: worker?.role ?? 'unknown',
    members: tgMembers.map((m) => ({
      clickupUserId: m.clickupUserId,
      username: m.username,
      isOwner: owner?.id === m.id,
      linked: m.telegramChatId !== null,
      telegramUsername: m.telegramUsername,
      linkUrl: linkUrl(tgCfg?.botUsername ?? null, m.linkCode),
      timezone: scheduleOrDefault(schedules, m.clickupUserId).timezone,
      workStart: scheduleOrDefault(schedules, m.clickupUserId).workStart,
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
    <div className="max-w-3xl">
      <TelegramAjustes view={telegram} />
    </div>
  );
}
