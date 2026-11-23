import 'server-only';

// Módulo SEO: alta en el núcleo al arrancar (Hito 1, 23 nov 2026). Lo llama wireApp() en la web y en el trabajador.
// Registra los tipos de hallazgo de Salud técnica y los trabajos de la cola: auditoría, expediente y plan de mejora.
import { registerSaludAudit } from '@/lib/seo/salud/audit';
import { registerDossierJobs } from '@/lib/seo/expediente/collect';
import { registerPlanJobs } from '@/lib/seo/plan/plan';
import { registerSeoWatch } from '@/lib/seo/id/watch';

export function registerSeoCapabilities(): void {
  registerSaludAudit();
  registerDossierJobs(); // expediente provisional (ficha, web, Wayback, Search Console)
  registerPlanJobs(); // plan de mejora por reglas, al terminar cada auditoría
  registerSeoWatch(); // I+D fase A: fuentes oficiales de Google (cada 3 h) y resumen semanal
}
