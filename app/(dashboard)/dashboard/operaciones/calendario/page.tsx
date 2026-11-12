import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsTeamProfiles } from '@/lib/db/schema';
import { requirePagePermission } from '@/lib/auth/permissions';
import { getCalendar } from '@/lib/operaciones/calendar';
import { todayIn } from '@/lib/operaciones/jornada';
import { CalendarioView } from './calendario-view';

export const dynamic = 'force-dynamic';

// Equipo → Calendario (revisión de autonomía): festivos y ausencias planificadas (vacaciones, médico…).
// Lo respetan la jornada, los buenos días, los recordatorios, los minutos laborables y los plazos. Solo administración.
export default async function CalendarioPage() {
  const user = await requirePagePermission('admin');
  const [entries, people] = await Promise.all([
    getCalendar(user.tenantId),
    db
      .select({ id: opsTeamProfiles.clickupUserId, name: opsTeamProfiles.name })
      .from(opsTeamProfiles)
      .where(and(eq(opsTeamProfiles.tenantId, user.tenantId), eq(opsTeamProfiles.active, true), isNotNull(opsTeamProfiles.clickupUserId)))
      .orderBy(asc(opsTeamProfiles.name))
  ]);
  return (
    <CalendarioView
      entries={entries}
      people={people.filter((p): p is { id: string; name: string } => Boolean(p.id))}
      today={todayIn('Europe/Madrid')}
    />
  );
}
