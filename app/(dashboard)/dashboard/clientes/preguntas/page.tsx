import { ClientesTabs } from '@/components/clientes-tabs';
import { checkPermission, requirePagePermission } from '@/lib/auth/permissions';
import { allServices, getCommsTemplates, listTemplates } from '@/lib/core/questions';
import { BancoView, type BankTemplate } from './banco-view';

export const dynamic = 'force-dynamic';

// Clientes → Banco de preguntas (25 nov 2026): las preguntas de cada servicio (y las generales) que se hacen a todos los
// clientes que lo tienen marcado, y los textos de los correos. Lo ve un editor; lo cambia un administrador.
export default async function BancoPreguntasPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const user = await requirePagePermission('edit');
  const { s } = await searchParams;
  const [templates, services, comms, isAdmin] = await Promise.all([
    listTemplates(user.tenantId),
    allServices(user.tenantId),
    getCommsTemplates(user.tenantId),
    checkPermission('admin').then((r) => r.ok)
  ]);
  const rows: BankTemplate[] = templates.map((t) => ({
    id: t.id,
    serviceKey: t.serviceKey,
    text: t.text,
    help: t.help ?? '',
    answerType: t.answerType,
    target: t.target,
    askWhen: t.askWhen,
    repeatDays: t.repeatDays,
    active: t.active,
    origin: t.origin,
    updatedBy: t.updatedBy,
    updatedAt: t.updatedAt.toISOString()
  }));
  return (
    <div className="space-y-4">
      <ClientesTabs active="preguntas" />
      <BancoView templates={rows} services={services} comms={comms} isAdmin={isAdmin} initial={s ?? null} />
    </div>
  );
}
