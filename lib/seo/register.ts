import 'server-only';

// Módulo SEO: alta en el núcleo al arrancar (Hito 1, 23 nov 2026). Lo llama wireApp() en la web y en el trabajador.
// Registra los tipos de hallazgo de Salud técnica y los trabajos de la cola: auditoría, expediente y plan de mejora.
import { registerSaludAudit } from '@/lib/seo/salud/audit';
import { registerDossierJobs } from '@/lib/seo/expediente/collect';
import { registerPlanJobs } from '@/lib/seo/plan/plan';
import { registerSeoWatch } from '@/lib/seo/id/watch';
import { registerVigilancia } from '@/lib/seo/vigilancia/vigilancia';
import { registerMapaJobs } from '@/lib/seo/mapa/mapa';
import { registerCompetenciaJobs } from '@/lib/seo/competencia/competencia';
import { registerPreguntasJobs } from '@/lib/seo/preguntas/preguntas';
import { registerProjectDossierProvider } from '@/lib/core/capabilities';
import { seoProjectDossier } from '@/lib/seo/dossier-provider';

export function registerSeoCapabilities(): void {
  registerSaludAudit();
  registerDossierJobs(); // expediente provisional (ficha, web, Wayback, Search Console)
  registerPlanJobs(); // plan de mejora por reglas, al terminar cada auditoría
  registerMapaJobs(); // Hito 2: mapa de palabras sobre Search Console
  registerCompetenciaJobs(); // Hito 2: competencia en Google (DataForSEO por el núcleo)
  registerPreguntasJobs(); // Hito 2: correo de 3 preguntas y lectura de la respuesta del cliente
  registerSeoWatch();
  registerVigilancia(); // parte 0: vigilancia, auditoría, velocidad y detectores programados por proyecto
  // Hito 2: lo que SEO sabe de cada proyecto, para el expediente del estratega (por el núcleo).
  registerProjectDossierProvider('seo', seoProjectDossier); // I+D fase A: fuentes oficiales de Google (cada 3 h) y resumen semanal
}
