import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { agtAgentAvatars, opsTeamAvatars } from '@/lib/db/schema';
import { getUserIfAllowed } from '@/lib/auth/permissions';

// Foto de una persona o de un agente del equipo (21 nov 2026). Para cualquiera con sesión y rol, siempre de su cuenta.
// La dirección lleva la versión (?v=fecha), así que se puede guardar en caché mucho tiempo.
export async function GET(request: Request) {
  const user = await getUserIfAllowed('view');
  if (!user) return new Response(null, { status: 403 });
  const url = new URL(request.url);
  const kind = url.searchParams.get('tipo');
  const id = url.searchParams.get('id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id) || (kind !== 'persona' && kind !== 'agente')) return new Response(null, { status: 400 });

  const [row] =
    kind === 'persona'
      ? await db
          .select({ mime: opsTeamAvatars.mime, data: opsTeamAvatars.data })
          .from(opsTeamAvatars)
          .where(and(eq(opsTeamAvatars.tenantId, user.tenantId), eq(opsTeamAvatars.profileId, id)))
          .limit(1)
      : await db
          .select({ mime: agtAgentAvatars.mime, data: agtAgentAvatars.data })
          .from(agtAgentAvatars)
          .where(and(eq(agtAgentAvatars.tenantId, user.tenantId), eq(agtAgentAvatars.agentId, id)))
          .limit(1);
  if (!row) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(row.data), {
    headers: {
      'Content-Type': row.mime,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
