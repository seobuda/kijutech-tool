import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { getUser, getUserTenantRoleNames } from '@/lib/db/queries';
import {
  getAiProviderSettings,
  getAiModelPricing,
  getTenantsWithAiMode,
  getAiPromptsWithUpdater,
  getAiJobs,
  getAiJobsMonthlyTotals,
} from '@/lib/ai/queries';
import { AI_PROVIDERS } from '@/lib/ai/provider-meta';
import { ProviderSettingsSection, type ProviderRowData } from '../provider-settings-section';
import { PricingSection } from './pricing-section';
import { TenantControlSection } from './tenant-control-section';
import { PromptsSection } from './prompts-section';
import { UsageMonitor } from './usage-monitor';
import { SettingsTabs } from './settings-tabs';

export default async function AiSettingsPage() {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  const roleNames = await getUserTenantRoleNames(user.id);
  if (!roleNames.includes('super_admin')) {
    redirect('/dashboard');
  }

  const [platformSettings, pricing, tenantsList, prompts, recentJobs, monthlyTotals] =
    await Promise.all([
      getAiProviderSettings(user.tenantId, 'platform'),
      getAiModelPricing(),
      getTenantsWithAiMode(),
      getAiPromptsWithUpdater(),
      getAiJobs(user.tenantId, 20),
      getAiJobsMonthlyTotals(user.tenantId),
    ]);

  const providerRows: ProviderRowData[] = AI_PROVIDERS.map((provider) => {
    const existing = platformSettings.find((s) => s.provider === provider);
    return {
      provider,
      model: existing?.model ?? '',
      isActive: existing?.isActive ?? false,
      isDefault: existing?.isDefault ?? false,
      hasKey: Boolean(existing?.apiKeyEncrypted),
      embeddingProvider: existing?.embeddingProvider ?? null,
      embeddingModel: existing?.embeddingModel ?? '',
      hasEmbeddingKey: Boolean(existing?.embeddingApiKeyEncrypted),
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

      <SettingsTabs
        tabs={[
          {
            key: 'platform',
            label: 'Keys de plataforma',
            content: (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Claves propias de Kijutech, usadas por los tenants en modo &quot;Solo
                  plataforma&quot;.
                </p>
                <ProviderSettingsSection
                  tenantId={user.tenantId}
                  keyMode="platform"
                  initialRows={providerRows}
                />
              </div>
            ),
          },
          {
            key: 'pricing',
            label: 'Precios por modelo',
            content:
              pricing.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-muted-foreground">
                      Sin precios registrados todavía. Añade una entrada con el botón de
                      abajo.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <PricingSection initialRows={pricing} />
              ),
          },
          {
            key: 'tenants',
            label: 'Control por tenant',
            content:
              tenantsList.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-muted-foreground">No hay tenants creados todavía.</p>
                  </CardContent>
                </Card>
              ) : (
                <TenantControlSection initialTenants={tenantsList} />
              ),
          },
          {
            key: 'prompts',
            label: 'Prompts',
            content: <PromptsSection prompts={prompts} />,
          },
        ]}
      />

      <UsageMonitor jobs={recentJobs} monthlyTotals={monthlyTotals} />
    </section>
  );
}
