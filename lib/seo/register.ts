import 'server-only';

// Módulo SEO: alta en el núcleo al arrancar (Hito 1, 23 nov 2026). Lo llama wireApp() en la web y en el trabajador.
// Registra los tipos de hallazgo de Salud técnica y los trabajos de la cola: auditoría, expediente y plan de mejora.
import { registerSaludAudit } from '@/lib/seo/salud/audit';
import { registerDossierJobs } from '@/lib/seo/expediente/collect';
import { registerPlanJobs } from '@/lib/seo/plan/plan';
import { registerSeoWatch } from '@/lib/seo/id/watch';
import { registerVigilancia } from '@/lib/seo/vigilancia/vigilancia';
import { registerExternosJob } from '@/lib/seo/salud/externos';
import { registerAltaJobs } from '@/lib/seo/alta/alta';
import { registerPosicionesJobs } from '@/lib/seo/posiciones/posiciones';
import { registerLocalJobs } from '@/lib/seo/local/ficha';
import { registerGeogridJobs } from '@/lib/seo/local/geogrid';
import { registerPuertasJob } from '@/lib/seo/local/puertas';
import { registerMapaJobs } from '@/lib/seo/mapa/mapa';
import { registerCompetenciaJobs } from '@/lib/seo/competencia/competencia';
import { registerPreguntasJobs } from '@/lib/seo/preguntas/preguntas';
import { registerProjectDossierProvider } from '@/lib/core/capabilities';
import { seoProjectDossier } from '@/lib/seo/dossier-provider';
import { registerSeoEvidence } from '@/lib/seo/medir/evidence';
import { registerBriefJobs } from '@/lib/seo/contenido/briefs';
import { registerAiPanelJobs } from '@/lib/seo/panel-ia/panel';
import { materializeAll } from '@/lib/seo/estrategia/ciclos';
import { advanceAll } from '@/lib/seo/arranque/arranque';
import { registerJefeTools } from '@/lib/seo/jefe/tools';
import { registerJefePlanJobs } from '@/lib/seo/jefe/plan';
import { jefeCyclePass } from '@/lib/seo/jefe/ciclos';
import { registerScheduled } from '@/lib/core/capabilities';
import { seoWeeklyLines } from '@/lib/seo/informe-semanal';
import { registerSeoAgentTools } from '@/lib/seo/agente-tool';
import { registerReportSection } from '@/lib/core/capabilities';

export function registerSeoCapabilities(): void {
  registerSaludAudit();
  registerDossierJobs(); // expediente provisional (ficha, web, Wayback, Search Console)
  registerPlanJobs(); // plan de mejora por reglas, al terminar cada auditoría
  registerMapaJobs(); // Hito 2: mapa de palabras sobre Search Console
  registerCompetenciaJobs(); // Hito 2: competencia en Google (DataForSEO por el núcleo)
  registerPreguntasJobs(); // Hito 2: correo de 3 preguntas y lectura de la respuesta del cliente
  registerSeoWatch();
  registerPuertasJob(); // parte 5c: páginas puerta (texto propio comparado), tras cada auditoría
  // Simulación del 27 nov: apartado SEO del informe semanal (lo grave de cada proyecto, sin abrirlos uno a uno).
  registerReportSection('seo', { title: '🔎 SEO de los proyectos', order: 22, weekly: (t, from, to) => seoWeeklyLines(t, from, to) });
  registerSeoAgentTools(); // simulación del 27 nov: «seo_proyecto» para el jefe de Operaciones y el principal
  registerBriefJobs(); // parte 9a: briefs de contenido (SERP real y competencia)
  registerAiPanelJobs(); // parte 11: panel de IA (un trabajo por pregunta)
  registerJefeTools(); // Jefe SEO D1: expediente estratégico y pronóstico para los agentes (solo lectura)
  registerJefePlanJobs(); // Jefe SEO D2: plan de servicio a 12-24 meses (Opus, en sombra hasta que un admin lo aprueba)
  // Estrategias por ciclos (docs/PLAN-SEO-CICLOS.md): una pasada al día por cuenta encarga lo aprobado a 2 semanas vista,
  // salta lo no aprobado a tiempo y marca hecho lo terminado.
  const G = globalThis as unknown as { __kijuCyclesDay?: Map<string, string> };
  registerScheduled('seo: encargar las tareas de las estrategias', async (tenantId) => {
    const day = new Date().toISOString().slice(0, 10);
    const seen = (G.__kijuCyclesDay ??= new Map());
    if (seen.get(tenantId) === day) return;
    seen.set(tenantId, day);
    // Jefe SEO D4: antes, crea la estrategia aprobada que esperaba y propone la siguiente desde el plan (0 $, sin aprobar nada).
    await jefeCyclePass(tenantId).catch((e) => console.error('[seo] jefe: ciclos desde el plan:', e instanceof Error ? e.message : e));
    await materializeAll(tenantId);
  });
  // Análisis inicial (docs/PLAN-SEO-JEFE.md, D0): un solo proceso por cuenta, cada 10 min, avanza las ejecuciones abiertas.
  const G2 = globalThis as unknown as { __kijuSetupTick?: Map<string, number> };
  registerScheduled('seo: avanzar el análisis inicial de los proyectos', async (tenantId) => {
    const tick = Math.floor(Date.now() / 600_000);
    const seen = (G2.__kijuSetupTick ??= new Map());
    if (seen.get(tenantId) === tick) return;
    seen.set(tenantId, tick);
    await advanceAll(tenantId);
  });
  registerSeoEvidence(); // parte 8: fecha real de las intervenciones (registro de cambios) para medir si funcionaron
  registerGeogridJobs(); // parte 5b: recogida del mapa por zonas
  registerLocalJobs(); // parte 5a: confirmación de «ficha cerrada» antes de avisar
  registerPosicionesJobs(); // parte 4: recogida de las posiciones enviadas a la cola de DataForSEO
  registerAltaJobs(); // parte 2: la IA propone la ficha (servicios, zona…) tras cada expediente
  registerExternosJob(); // parte 1: enlaces rotos hacia otras webs, tras cada auditoría
  registerVigilancia(); // parte 0: vigilancia, auditoría, velocidad y detectores programados por proyecto
  // Hito 2: lo que SEO sabe de cada proyecto, para el expediente del estratega (por el núcleo).
  registerProjectDossierProvider('seo', seoProjectDossier); // I+D fase A: fuentes oficiales de Google (cada 3 h) y resumen semanal
}
