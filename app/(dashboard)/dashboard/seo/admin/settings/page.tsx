import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getUser, getUserTenantRoleNames } from '@/lib/db/queries';
import { getAllSeoSettings } from '@/lib/seo/queries';
import { SettingRow } from './setting-row';

export default async function SeoAdminSettingsPage() {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  const roleNames = await getUserTenantRoleNames(user.id);
  if (!roleNames.includes('super_admin')) {
    redirect('/dashboard');
  }

  const settings = await getAllSeoSettings();

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="mb-6">
        <h1 className="text-lg lg:text-2xl font-medium">
          Configuración SEO
        </h1>
        <p className="text-sm text-muted-foreground">
          Ajustes globales del módulo SEO, visibles solo para super_admin.
        </p>
      </div>

      {settings.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              Sin settings todavía. Ejecuta el seed del módulo SEO
              (`pnpm db:seed-seo`) para crear los valores por defecto.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {settings.map((setting) => (
            <Card key={setting.id}>
              <CardHeader>
                <CardTitle className="text-base">{setting.label}</CardTitle>
                {setting.description && (
                  <p className="text-sm text-muted-foreground">
                    {setting.description}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <SettingRow settingKey={setting.key} initialValue={setting.value ?? ''} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
