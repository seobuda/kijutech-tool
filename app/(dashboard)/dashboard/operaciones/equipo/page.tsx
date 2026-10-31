import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsWorkTypes } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { getStructure } from '@/lib/operaciones/structure';
import { canManageProfiles, listProfiles } from '@/lib/operaciones/team-profiles';
import { getCleanupPeople } from '@/lib/operaciones/cleanup';
import { getTelegramConfig } from '@/lib/operaciones/telegram-config';
import { EquipoView, type ProfileView } from './equipo-view';

export const dynamic = 'force-dynamic';

export default async function EquipoPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');
  // Hoy solo la ve quien lleva las operaciones; la ficha ya lleva user_id para abrirla a cada miembro.
  if (!canManageProfiles(user)) redirect('/dashboard/operaciones');

  const [profiles, structure, workTypes, cleanupPeople, tg] = await Promise.all([
    listProfiles(user.tenantId),
    getStructure(user.tenantId),
    db.select().from(opsWorkTypes).where(eq(opsWorkTypes.tenantId, user.tenantId)),
    getCleanupPeople(user.tenantId),
    getTelegramConfig(user.tenantId)
  ]);

  const views: ProfileView[] = profiles.map((p) => ({
    id: p.id,
    name: p.name,
    clickupUserId: p.clickupUserId ?? '',
    jobTitle: p.jobTitle ?? '',
    description: p.description ?? '',
    notes: p.notes ?? '',
    workDays: p.workDays
      .split(',')
      .map(Number)
      .filter((d) => d >= 1 && d <= 7),
    workStart: p.workStart,
    hoursPerDay: Number(p.hoursPerDay),
    timezone: p.timezone,
    lunchStart: p.lunchStart ?? '',
    lunchEnd: p.lunchEnd ?? '',
    quietStart: p.quietStart ?? '',
    quietEnd: p.quietEnd ?? '',
    urgentBypassQuiet: p.urgentBypassQuiet,
    active: p.active,
    workTypes: p.workTypes
  }));

  const linked = new Set(profiles.map((p) => p.clickupUserId).filter(Boolean));
  return (
    <EquipoView
      profiles={views}
      cleanupPeople={cleanupPeople}
      testMode={tg?.testMode ?? true}
      members={structure.members.map((m) => ({ id: m.id, username: m.username }))}
      withoutProfile={structure.members.filter((m) => !linked.has(m.id)).map((m) => ({ id: m.id, username: m.username }))}
      workTypes={workTypes
        .filter((t) => t.active)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((t) => ({ key: t.key, label: t.label }))}
    />
  );
}
