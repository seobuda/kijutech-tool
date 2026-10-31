import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsSuggestions } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { canManageProfiles } from '@/lib/operaciones/team-profiles';
import { decodeBotToken, getTelegramConfig } from '@/lib/operaciones/telegram-config';
import { tgDownloadFile } from '@/lib/operaciones/telegram';

// Captura adjunta a una sugerencia (/sugerencia): se pide al bot de Telegram en el momento; no se guarda en disco.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || !canManageProfiles(user)) return new Response('No autenticado', { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('No encontrada', { status: 404 });

  const [row] = await db
    .select({ photo: opsSuggestions.photoFileId })
    .from(opsSuggestions)
    .where(and(eq(opsSuggestions.id, id), eq(opsSuggestions.tenantId, user.tenantId)))
    .limit(1);
  const cfg = await getTelegramConfig(user.tenantId);
  if (!row?.photo || !cfg) return new Response('No encontrada', { status: 404 });

  try {
    const file = await tgDownloadFile(decodeBotToken(cfg), row.photo);
    return new Response(file.data, { headers: { 'Content-Type': file.contentType, 'Cache-Control': 'private, max-age=3600' } });
  } catch {
    return new Response('No se pudo obtener la captura', { status: 502 });
  }
}
