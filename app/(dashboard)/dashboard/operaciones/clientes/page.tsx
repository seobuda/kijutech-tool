import { redirect } from 'next/navigation';

// Desde el 14 nov 2026 los clientes tienen su propia sección (núcleo): /dashboard/clientes. Esta dirección se mantiene
// para que sigan funcionando los enlaces antiguos (avisos, informes, Telegram).
export default function ClientesAntiguo() {
  redirect('/dashboard/clientes');
}
