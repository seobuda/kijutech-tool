import { redirect } from 'next/navigation';
import { getUser, getUserTenantRoleNames } from '@/lib/db/queries';
import { getSeoManifest } from '@/lib/seo/manifest';
import { KnowledgeCardForm } from '../knowledge-card-form';

const ADMIN_ROLES = ['admin', 'super_admin'];

export default async function NewKnowledgeCardPage() {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  const roleNames = await getUserTenantRoleNames(user.id);
  if (!roleNames.some((r) => ADMIN_ROLES.includes(r))) {
    redirect('/dashboard');
  }

  const manifest = getSeoManifest();

  return (
    <section className="flex-1 p-4 lg:p-8">
      <h1 className="text-lg lg:text-2xl font-medium mb-6">Nueva tarjeta</h1>
      <KnowledgeCardForm stages={manifest.stages} />
    </section>
  );
}
