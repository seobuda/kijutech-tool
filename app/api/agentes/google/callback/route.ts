import { getUserIfAllowed } from '@/lib/auth/permissions';
import { exchangeGoogleCode, getIntegration, readCredentials, saveIntegration, verifyState } from '@/lib/agentes/integrations';

// Vuelta del consentimiento de Google: comprueba la sesión (admin) y el estado firmado, cambia el código por el token de
// refresco y lo guarda cifrado. Nunca enseña el token.
export async function GET(req: Request) {
  const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
  const back = (s: string) => Response.redirect(new URL(`/dashboard/agentes/integraciones?google=${s}`, base), 303);
  const user = await getUserIfAllowed('admin');
  if (!user) return new Response('No autorizado', { status: 401 });
  const url = new URL(req.url);
  const state = verifyState(url.searchParams.get('state') ?? '');
  if (!state || state.tenantId !== user.tenantId || state.userId !== user.id) return back('estado-no-valido');
  if (url.searchParams.get('error')) return back('cancelado');
  const code = url.searchParams.get('code');
  if (!code) return back('sin-codigo');
  const creds = readCredentials(await getIntegration(user.tenantId, 'google'));
  if (!creds.clientId || !creds.clientSecret) return back('falta-cliente');
  const r = await exchangeGoogleCode(creds, code);
  if (!r.refreshToken) return back('sin-token');
  await saveIntegration(user.tenantId, 'google', { ...creds, refreshToken: r.refreshToken }, { status: 'conectada' });
  return back('ok');
}
