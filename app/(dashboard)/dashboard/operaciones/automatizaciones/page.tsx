import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { AUTOMATIONS, DEF, getAutoAll, listChanges, sampleValues, renderTemplate } from '@/lib/operaciones/automations';
import { getUpcoming } from '@/lib/operaciones/upcoming';
import { getTelegramConfig } from '@/lib/operaciones/telegram-config';
import { getCleanupPeople } from '@/lib/operaciones/cleanup';
import { AutomatizacionesView, type CardView } from './automatizaciones-view';

export const dynamic = 'force-dynamic';

export default async function AutomatizacionesPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const [autos, upcoming, changes, tg, cleanupPeople] = await Promise.all([
    getAutoAll(user.tenantId),
    getUpcoming(user.tenantId),
    listChanges(user.tenantId),
    getTelegramConfig(user.tenantId),
    getCleanupPeople(user.tenantId)
  ]);

  const cards: CardView[] = AUTOMATIONS.map((d) => {
    const a = autos[d.key];
    return {
      key: d.key,
      title: d.title,
      what: d.what,
      canDisable: d.canDisable,
      enabled: a.enabled,
      link: d.link ?? null,
      fields: d.fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        unit: f.unit ?? null,
        min: f.min ?? null,
        max: f.max ?? null,
        help: f.help ?? null,
        default: f.default,
        value: a.cfg[f.key]
      })),
      template: d.template
        ? {
            value: a.template,
            isDefault: !a.customTemplate,
            defaultText: d.template.default,
            placeholders: d.template.placeholders.map((p) => ({ name: p.name, label: p.label })),
            preview: renderTemplate(d, a.template, sampleValues(d))
          }
        : null,
      customized: a.customTemplate || a.changedFields.length > 0 || (d.key !== 'watch' && !a.enabled)
    };
  });

  const titles = Object.fromEntries(AUTOMATIONS.map((d) => [d.key, DEF.get(d.key)!.title]));

  return (
    <div className="max-w-4xl">
      <AutomatizacionesView
        cards={cards}
        upcoming={upcoming}
        changes={changes}
        titles={titles}
        testMode={tg?.testMode ?? true}
        hasBot={Boolean(tg)}
        cleanupPeople={cleanupPeople}
      />
    </div>
  );
}
