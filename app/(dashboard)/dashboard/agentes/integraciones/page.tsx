import { requirePagePermission } from '@/lib/auth/permissions';
import { getIntegration, googleRedirectUri, PROVIDERS, readCredentials, type ProviderKey } from '@/lib/agentes/integrations';
import { IntegracionesView, type ProviderView } from './integraciones-view';

export const dynamic = 'force-dynamic';

const GOOGLE_MSG: Record<string, string> = {
  ok: 'Google conectado.',
  cancelado: 'Has cancelado la autorización de Google.',
  'estado-no-valido': 'La autorización caducó o no es tuya: vuelve a pulsar «Conectar con Google».',
  'falta-cliente': 'Primero guarda el Client ID y el secret de OAuth.',
  'sin-codigo': 'Google no devolvió la autorización.',
  'sin-token': 'Google no dio acceso permanente: quita el acceso de la app en tu cuenta de Google y vuelve a conectar.'
};

// Agentes → Integraciones: servicios externos que los agentes pueden usar (credenciales cifradas; nunca se enseñan).
export default async function IntegracionesPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const user = await requirePagePermission('admin');
  const { google } = await searchParams;
  const providers: ProviderView[] = [];
  for (const key of Object.keys(PROVIDERS) as ProviderKey[]) {
    const i = await getIntegration(user.tenantId, key);
    const creds = readCredentials(i);
    providers.push({
      key,
      ...PROVIDERS[key],
      status: i?.status ?? null,
      lastError: i?.lastError ?? null,
      lastOkAt: i?.lastOkAt?.toISOString() ?? null,
      // Solo los campos no secretos vuelven al navegador.
      values: Object.fromEntries(PROVIDERS[key].fields.filter((f) => !f.secret).map((f) => [f.key, creds[f.key] ?? ''])),
      hasSecrets: Object.fromEntries(PROVIDERS[key].fields.filter((f) => f.secret).map((f) => [f.key, Boolean(creds[f.key])])),
      authorized: key === 'google' ? Boolean(creds.refreshToken) : null
    });
  }
  return <IntegracionesView providers={providers} redirectUri={googleRedirectUri()} googleMessage={google ? (GOOGLE_MSG[google] ?? null) : null} />;
}
