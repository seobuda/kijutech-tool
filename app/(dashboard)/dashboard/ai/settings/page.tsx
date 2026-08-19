import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getUser, getUserTenantRoleNames } from '@/lib/db/queries';
import { getAiProviderSettings, getAiModelPricing, getTenantsWithAiMode } from '@/lib/ai/queries';
import { AI_PROVIDERS } from '@/lib/ai/provider-meta';
import { ProviderSettingsSection, type ProviderRowData } from '../provider-settings-section';
import { PricingSection } from './pricing-section';
import { TenantControlSection } from './tenant-control-section';

export default async function AiSettingsPage() {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  const roleNames = await getUserTenantRoleNames(user.id);
  if (!roleNames.includes('super_admin')) {
    redirect('/dashboard');
  }

  const [platformSettings, pricing, tenantsList] = await Promise.all([
    getAiProviderSettings(user.tenantId, 'platform'),
    getAiModelPricing(),
    getTenantsWithAiMode(),
  ]);

  const providerRows: ProviderRowData[] = AI_PROVIDERS.map((provider) => {
    const existing = platformSettings.find((s) => s.provider === provider);
    return {
      provider,
      model: existing?.model ?? '',
      isActive: existing?.isActive ?? false,
      isDefault: existing?.isDefault ?? false,
      hasKey: Boolean(existing?.apiKeyEncrypted),
    };
  });

  return (
    <section className="flex-1 p-4 lg:p-8 space-y-10">
      <div>
        <h1 className="text-lg lg:text-2xl font-medium">IA &amp; Modelos</h1>
        <p className="text-sm text-muted-foreground">
          Configuración global del gateway de IA, visible solo para super_admin.
        </p>
      </div>

      <div className="space-y-4">
        <h2 className="text-base font-medium">Keys de plataforma</h2>
        <p className="text-sm text-muted-foreground">
          Claves propias de Kijutech, usadas por los tenants en modo &quot;Solo plataforma&quot;.
        </p>
        <ProviderSettingsSection
          tenantId={user.tenantId}
          keyMode="platform"
          initialRows={providerRows}
        />
      </div>

      <div className="space-y-4">
        <h2 className="text-base font-medium">Precios por modelo</h2>
        {pricing.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground">
                Sin precios registrados todavía. Añade una entrada con el botón de abajo.
              </p>
            </CardContent>
          </Card>
        ) : (
          <PricingSection initialRows={pricing} />
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-base font-medium">Control por tenant</h2>
        {tenantsList.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground">No hay tenants creados todavía.</p>
            </CardContent>
          </Card>
        ) : (
          <TenantControlSection initialTenants={tenantsList} />
        )}
      </div>
    </section>
  );
}
