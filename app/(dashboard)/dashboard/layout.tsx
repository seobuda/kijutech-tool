import { AppShell } from '@/components/app-shell/app-shell';

// Armazón de toda la herramienta: barra lateral agrupada, migas, paleta de comandos (Ctrl+K)
// y modo claro/oscuro. Los permisos se comprueban en cada página y acción del servidor.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
