import { getUserIfAllowed } from '@/lib/auth/permissions';
import { getIntegration, googleAuthUrl, readCredentials, signState } from '@/lib/agentes/integrations';

// Agentes → Integraciones → «Conectar con Google»: lleva al consentimiento de Google (solo administración).
export async function GET() {
  const user = await getUserIfAllowed('admin');
  if (!user) return new Response('No autorizado', { status: 401 });
  const creds = readCredentials(await getIntegration(user.tenantId, 'google'));
  if (!creds.clientId || !creds.clientSecret) return Response.redirect(new URL('/dashboard/agentes/integraciones?google=falta-cliente', process.env.BASE_URL || 'http://127.0.0.1:3000'), 303);
  return Response.redirect(googleAuthUrl(creds.clientId, signState(user.tenantId, user.id)), 303);
}
