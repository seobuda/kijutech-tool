import { redirect } from 'next/navigation';

// El panel de «Team» del starter (suscripción e invitaciones) ya no existe: se entra por Operaciones.
export default function DashboardPage() {
  redirect('/dashboard/operaciones');
}
