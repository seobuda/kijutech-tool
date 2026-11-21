import { PageContainer } from '@/components/ui/page';

// Márgenes de la sección Clientes (21 nov 2026): desde que salió de Operaciones (14 nov) sus páginas no tenían
// contenedor y el contenido quedaba pegado a la barra lateral. Los permisos los comprueba cada página.
export default function ClientesLayout({ children }: { children: React.ReactNode }) {
  return <PageContainer>{children}</PageContainer>;
}
