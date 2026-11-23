// Mapa Visual de SEO · proyecto: Salud técnica, expediente, plan de mejora e I+D (Hito 1, 23 nov 2026; nivel 3). Se registra en lib/architecture-map/registry.ts
// (detailMapId «seo_salud»). Diseño: docs/DISENO-MODULO-SEO.md §5 (fase 1, diagnóstico) y docs/DISENO-TECNICO-HITO1.md.
import type { ProcessStep } from '@/lib/ai/clustering/pipeline';

export const SEO_SALUD_PROCESS_MAP: ProcessStep[] = [
  {
    id: 'salud-lanzar',
    lane: 'Rastreo',
    name: 'Rastrear y auditar',
    description: 'Desde Proyectos → Salud del proyecto se lanza el rastreo de la web del alcance (la marcada como web del cliente). Si ya hay uno en marcha, no se lanza otro.',
    status: 'built',
    file: 'lib/seo/salud/audit.ts',
    when: 'Al pulsar «Rastrear y auditar» (permiso de editor). Todavía no hay frecuencia automática: llegará con las cadencias por proyecto (Hito 3).',
    ai: 'Nada.',
    code: 'Usa el rastreador de la plataforma (hasta 500 páginas, robots.txt, 1 página por segundo) y encola el trabajo «seo.salud.audit», que mira cada 2 min si el rastreo ha terminado (hasta 8 h) sin tocar el núcleo.',
    tables: ['crawl_runs', 'jobs', 'project_assets', 'client_assets']
  },
  {
    id: 'salud-reglas',
    lane: 'Auditoría',
    name: 'Comprobaciones técnicas (31 reglas, sin IA)',
    description: 'Sobre las páginas rastreadas: respuestas 4xx/5xx, cadenas de redirección y enlaces a redirecciones, sitemap, noindex en el sitemap, canonical a otra URL o roto, títulos (falta, largo, repetido), meta descripción, H1, contenido escaso, duplicado y casi duplicado (simhash), imágenes sin alt, huérfanas, profundidad, HTTPS, servidor lento (mediana ≥ 2,5 s), web pintada con JavaScript y datos estructurados (negocio sin marcar o incompleto, FAQ, reseñas propias).',
    status: 'built',
    file: 'lib/seo/salud/audit-rules.ts',
    when: 'Cuando termina el rastreo (trabajo «seo.salud.audit» en la cola).',
    ai: 'Nada: son reglas fijas y versionadas (cada hallazgo guarda la versión de la regla que lo detectó).',
    code: 'Solo las páginas indexables (200, sin noindex y con canonical propio) cuentan para títulos y contenido. Las huérfanas solo si el rastreo fue completo. Repetidos: un hallazgo por grupo. Casi duplicados: simhash a ≤ 3 bits, hasta 1.500 páginas.',
    tables: ['crawl_pages', 'crawl_links']
  },
  {
    id: 'salud-gsc',
    lane: 'Auditoría',
    name: 'Cruce con Search Console',
    description: 'Páginas con impresiones en los últimos 90 días (≥ 10) que el rastreo no encontró: huérfanas, fuera del sitemap o antiguas que Google sigue mostrando.',
    status: 'built',
    file: 'lib/seo/salud/audit.ts',
    when: 'En la misma auditoría, si el alcance del proyecto tiene la propiedad de Search Console con datos descargados.',
    ai: 'Nada.',
    code: 'Suma del detalle diario (gsc_daily + gsc_pages) de todas las propiedades del alcance. Si el rastreo se cortó por el tope de páginas, el hallazgo baja a informativo.',
    tables: ['gsc_daily', 'gsc_pages', 'gsc_properties']
  },
  {
    id: 'salud-hallazgos',
    lane: 'Resultado',
    name: 'Hallazgos del proyecto',
    description: 'Lo detectado queda como hallazgo tipado del proyecto, agrupado por área y ordenado por gravedad. El equipo puede descartar (no es un problema) o aceptar (se deja así a propósito); no vuelve a salir.',
    status: 'built',
    file: 'app/(dashboard)/dashboard/projects/[projectId]/salud/page.tsx',
    when: 'Al terminar la auditoría; se ve en Proyectos → Salud.',
    ai: 'Nada aquí. Al terminar la auditoría se rehace el plan de mejora (paso siguiente) y se pone al día el expediente.',
    code: 'Ciclo de vida del núcleo: lo que deja de aparecer se resuelve solo en la siguiente auditoría; lo descartado o aceptado no se reabre. Fuente «seo.salud:rastreo».',
    tables: ['findings']
  },
  {
    id: 'salud-jsonld',
    lane: 'Resultado',
    name: 'Datos estructurados listos para pegar',
    description: 'Código JSON-LD del negocio y la web (en todas las páginas) y uno por cada local adicional, generado con los datos de la ficha del cliente: nombre, razón social, logo, descripción, dirección, teléfono y perfiles sociales.',
    status: 'built',
    file: 'lib/seo/salud/jsonld.ts',
    when: 'Al abrir Proyectos → Salud (se calcula al pintar; no se guarda).',
    ai: 'Nada. El tipo de negocio es de la ficha del cliente (clients.business_type): se elige en la ficha, en esta pantalla o se pasa desde el expediente cuando la web ya lo declara.',
    code: 'Plantillas fijas. Nunca FAQ ni reseñas o valoraciones propias. Lo que falta en la ficha no se inventa: se lista para completarlo. Teléfono en formato internacional y país en código ISO.',
    tables: ['clients', 'client_locations', 'client_assets']
  },
  {
    id: 'seo-expediente',
    lane: 'Expediente',
    name: 'Expediente provisional del proyecto',
    description:
      'Lo que se sabe del negocio, recogido solo y con su origen y confianza: ficha del cliente, portada de la web (JSON-LD, enlaces tel:, redes, título), archivo de Internet (primera vez archivada) y Search Console (desde cuándo, búsquedas de la marca, páginas que salen en Google). Identidad confirmada cuando dos señales (dominio, teléfono, nombre, dirección) coinciden. Pantalla: Proyectos → Expediente.',
    status: 'built',
    file: 'lib/seo/expediente/collect.ts',
    when: 'Al terminar cada auditoría y al pulsar «Recoger datos» (trabajo «seo.expediente.collect»).',
    ai: 'Nada: extracción y comparación por reglas (lib/seo/expediente/rules.ts).',
    code: 'Confianza: la de su origen (persona 100, Search Console 85, ficha 70, web 60), +20 si otra fuente dice lo mismo, −15 si dice otra cosa. Si un dato cambia en su origen vuelve a «provisional». Lo que es de la ficha (tipo de negocio, logo) solo pasa a la ficha si una persona lo pide; teléfono y dirección se cambian en la ficha.',
    tables: ['seo_dossier_facts', 'clients', 'client_locations', 'gsc_daily', 'gsc_queries']
  },
  {
    id: 'seo-plan',
    lane: 'Plan de mejora',
    name: 'Plan de mejora → encargos',
    description:
      'Los hallazgos abiertos se convierten en propuestas de trabajo: una por técnica, con las páginas que más se ven en Google primero (40 por tanda), horas estimadas, prioridad y lo que esperamos que mejore. Al aprobar, se crea el encargo (con el proyecto), los hallazgos quedan enlazados y se registra la intervención. Pantalla: Proyectos → Plan de mejora; las pendientes salen en Para ti.',
    status: 'built',
    file: 'lib/seo/plan/plan.ts',
    when: 'Se rehace al terminar cada auditoría (trabajo «seo.plan.regenerate») o a mano. Se aprueba o descarta en la pantalla.',
    ai: 'Nada: técnica, plantilla y horas por tipo de hallazgo (lib/seo/plan/rules.ts); prioridad por gravedad × páginas × impresiones. El juicio con IA (Sonnet) queda para cuando las reglas no basten.',
    code: 'Lo aprobado o descartado no se vuelve a proponer salvo con hallazgos nuevos; una pendiente sin hallazgos detrás caduca. Respeta las horas al mes del proyecto (marca lo que no cabe). Aprobar reclama la propuesta (nunca dos encargos). Cuando el encargo se termina, la propuesta pasa a «hecha».',
    tables: ['seo_plan_items', 'findings', 'interventions', 'ops_requests']
  },
  {
    id: 'seo-id',
    lane: 'I+D',
    name: 'Vigilar las fuentes oficiales de Google',
    description: 'Fuentes de SEO de la bitácora del núcleo: panel de incidencias de Google Search (JSON) y blog de Search Central (RSS). Detalle en el mapa de Conocimiento.',
    status: 'built',
    file: 'lib/seo/id/watch.ts',
    when: 'Cada 3 horas («seo.id.watch») y resumen los lunes («seo.id.digest»).',
    ai: 'Solo el resumen semanal (prompt de la base de conocimiento).',
    code: 'Si una fuente cambia de formato y no devuelve nada, se anota; si fallan todas, el trabajo falla y se ve en la salud de la cola.',
    tables: ['kb_feed_items']
  },
  {
    id: 'seo-local',
    lane: 'Próximamente',
    name: 'Local: reseñas y coherencia de nombre, dirección y teléfono',
    description:
      'Reseñas de la ficha de Google con borrador de respuesta que se aprueba antes de publicarse (tabla ya creada), y hallazgos de coherencia del NAP entre ficha, web y JSON-LD y de «una página por servicio».',
    status: 'planned',
    file: 'docs/DISENO-TECNICO-HITO1.md',
    when: 'Pendiente: necesita Places API activada en Google Cloud (o el acceso a la API de reseñas de Business Profile).',
    ai: 'Borrador de respuesta a reseñas con Haiku; el resto, reglas.',
    code: 'Publicar una respuesta siempre con aprobación, como los correos a clientes.',
    tables: ['seo_reviews']
  }
];
