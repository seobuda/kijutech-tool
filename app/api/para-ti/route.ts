import { getUserIfAllowed } from '@/lib/auth/permissions';
import { getParaTi } from '@/lib/inicio/para-ti';
import { reportError } from '@/lib/core/errors';

// Número de «Para ti» para la barra lateral (fase 2 UX, 21 nov 2026). Solo administración (Para ti es solo de admin).
// Devuelve solo el recuento, nunca el contenido. Si falla, 0 y queda registrado: el menú no debe romperse por esto.
export async function GET() {
  const user = await getUserIfAllowed('admin');
  if (!user) return Response.json({ count: 0, urgent: 0 }, { status: 403 });
  try {
    const { entries } = await getParaTi(user.tenantId);
    return Response.json({ count: entries.length, urgent: entries.filter((e) => e.urgent).length }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    reportError({ error, source: 'inicio', area: 'contador de Para ti', tenantId: user.tenantId });
    return Response.json({ count: 0, urgent: 0 });
  }
}
