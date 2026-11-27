import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getUser, getUserTenantRoleNames } from '@/lib/db/queries';
import { getAllSeoSettings } from '@/lib/seo/queries';
import { SettingRow } from './setting-row';
import { usageByView } from '@/lib/core/usage';

export default async function SeoAdminSettingsPage() {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  const roleNames = await getUserTenantRoleNames(user.id);
  if (!roleNames.includes('super_admin')) {
    redirect('/dashboard');
  }

  const [settings, usage] = await Promise.all([getAllSeoSettings(), user.tenantId ? usageByView(user.tenantId, 'seo', 30).catch(() => []) : Promise.resolve([])]);

  return (
    <section className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-8 lg:py-8">
      <div className="mb-6">
        <h1 className="text-lg lg:text-2xl font-medium">
          Configuración SEO
        </h1>
        <p className="text-sm text-muted-foreground">
          Ajustes globales del módulo SEO, visibles solo para super_admin.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Uso de las pantallas SEO (últimos 30 días)</CardTitle>
          <p className="text-sm text-muted-foreground">Línea base del rediseño (plan de UX v2, fase 0): qué secciones se abren y cuántas personas las usan. La que nadie abre es candidata a quitarse.</p>
        </CardHeader>
        <CardContent>
          {!usage.length ? (
            <p className="text-sm text-muted-foreground">Aún no hay visitas registradas.</p>
          ) : (
            <table className="w-full max-w-lg text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-3 font-medium">Sección</th>
                  <th className="py-1 pr-3 font-medium">Visitas</th>
                  <th className="py-1 font-medium">Personas</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((u) => (
                  <tr key={u.view} className="border-b">
                    <td className="py-1 pr-3">{u.view}</td>
                    <td className="py-1 pr-3 tabular-nums">{u.views}</td>
                    <td className="py-1 tabular-nums">{u.users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

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
