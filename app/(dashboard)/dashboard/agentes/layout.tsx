import { requirePagePermission } from '@/lib/auth/permissions';
import { AgentesTabs } from './agentes-tabs';

// Módulo Agentes: agentes con rol con los que se habla por Telegram, correo o desde aquí; sus trabajos y sus integraciones.
export default async function AgentesLayout({ children }: { children: React.ReactNode }) {
  await requirePagePermission('admin');
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Agentes</h1>
        <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground text-pretty">
          Tu equipo de agentes con IA. Hablas con el principal por Telegram (texto o audio) o por correo; él consulta, propone acciones con botones y
          encarga trabajos a los subagentes. Cada agente tiene su rol, sus instrucciones, sus herramientas y su presupuesto.
        </p>
      </div>
      <AgentesTabs />
      {children}
    </div>
  );
}
