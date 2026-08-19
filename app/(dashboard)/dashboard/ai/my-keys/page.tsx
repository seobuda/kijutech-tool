import { redirect } from 'next/navigation';
import { getUser, getUserTenantRoleNames } from '@/lib/db/queries';
import { getAiProviderSettings, getTenantAiMode } from '@/lib/ai/queries';
import { AI_PROVIDERS } from '@/lib/ai/provider-meta';
import { ProviderSettingsSection, type ProviderRowData } from '../provider-settings-section';

const ADMIN_ROLES = ['admin', 'super_admin'];

export default async function AiMyKeysPage() {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  const roleNames = await getUserTenantRoleNames(user.id);
  const aiKeyModeAllowed = await getTenantAiMode(user.tenantId);

  if (!roleNames.some((r) => ADMIN_ROLES.includes(r)) || aiKeyModeAllowed === 'platform_only') {
    redirect('/dashboard');
  }

  const settings = await getAiProviderSettings(user.tenantId, 'byok');

  const providerRows: ProviderRowData[] = AI_PROVIDERS.map((provider) => {
    const existing = settings.find((s) => s.provider === provider);
    return {
      provider,
      model: existing?.model ?? '',
      isActive: existing?.isActive ?? false,
      isDefault: existing?.isDefault ?? false,
      hasKey: Boolean(existing?.apiKeyEncrypted),
    };
  });

  return (
    <section className="flex-1 p-4 lg:p-8 space-y-4">
      <div>
        <h1 className="text-lg lg:text-2xl font-medium">Mis claves de IA</h1>
        <p className="text-sm text-muted-foreground">
          Configura tus propias API keys (BYOK) para las funciones de IA de tu proyecto.
          {aiKeyModeAllowed === 'byok_required' &&
            ' Tu tenant requiere BYOK: no hay clave de plataforma disponible como respaldo.'}
        </p>
      </div>

      <ProviderSettingsSection
        tenantId={user.tenantId}
        keyMode="byok"
        initialRows={providerRows}
      />
    </section>
  );
}
