import 'server-only';

// Módulo SEO: alta en el núcleo al arrancar (Hito 1, 23 nov 2026). Lo llama wireApp() en la web y en el trabajador.
// Registra los tipos de hallazgo de Salud técnica y el trabajo de auditoría en la cola.
import { registerSaludAudit } from '@/lib/seo/salud/audit';

export function registerSeoCapabilities(): void {
  registerSaludAudit();
}
