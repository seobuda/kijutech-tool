import { redirect } from 'next/navigation';
import { requirePagePermission } from '@/lib/auth/permissions';

// «Cuentas» de Google Ads sin una cuenta concreta (lo enlazan las migas): la lista de cuentas es la Cartera.
export default async function AdsCuentasIndex() {
  await requirePagePermission('view');
  redirect('/dashboard/ads/cartera');
}
