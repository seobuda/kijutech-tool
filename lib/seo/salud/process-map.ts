// Mapa Visual de SEO · Salud técnica (Hito 1, 23 nov 2026; nivel 3). Se registra en lib/architecture-map/registry.ts
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
    ai: 'Nada aquí. El juicio (prioridades y plan de mejora convertido en encargos) es el siguiente paso del Hito 1.',
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
    ai: 'Nada. El tipo de negocio lo elige una persona de una lista; más adelante la IA lo propondrá desde el expediente.',
    code: 'Plantillas fijas. Nunca FAQ ni reseñas o valoraciones propias. Lo que falta en la ficha no se inventa: se lista para completarlo. Teléfono en formato internacional y país en código ISO.',
    tables: ['clients', 'client_locations', 'client_assets']
  }
];
