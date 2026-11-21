import { redirect } from 'next/navigation';

// /dashboard/equipo/persona y /dashboard/equipo/agente no tienen pantalla propia (las migas de pan enlazan aquí): al Equipo.
export default function EquipoTipoPage() {
  redirect('/dashboard/equipo');
}
