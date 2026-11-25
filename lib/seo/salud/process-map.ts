// Mapa Visual de SEO · proyecto: Salud técnica, expediente, plan de mejora e I+D (Hito 1, 23 nov 2026) y mapa de palabras,
// competencia y expediente del estratega (Hito 2, 24 nov 2026; nivel 3). Se registra en lib/architecture-map/registry.ts
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
    lane: 'Local',
    name: 'Nombre, dirección y teléfono, y una página por servicio',
    description:
      'Con el expediente: avisa si el nombre, el teléfono o la dirección de la web (datos estructurados, enlaces tel:, nombre del sitio) no coinciden con la ficha del cliente, o si la web no muestra un teléfono enlazable; y, con el último rastreo, si un servicio de la ficha («Qué vende u ofrece») no tiene su propia página. Salen en Salud técnica (grupo Local) y en el plan de mejora (unificar NAP; crear la página de cada servicio, 4 h por servicio).',
    status: 'built',
    file: 'lib/seo/local/rules.ts',
    when: 'Al final de cada recogida del expediente («seo.expediente.collect»); si cambia algo, se rehace el plan.',
    ai: 'Nada: comparación normalizada (teléfono internacional, código postal y población, nombre sin forma jurídica) y palabras del servicio en la URL, el título o el H1.',
    code: 'Lo que una persona confirma en el expediente manda sobre la ficha; lo descartado no cuenta. Fuente propia «seo.local:nap» (la auditoría del rastreo no la resuelve).',
    tables: ['findings', 'seo_dossier_facts', 'crawl_pages', 'clients']
  },
  {
    id: 'seo-palabras',
    lane: 'Mapa de palabras',
    name: 'Mapa de palabras sobre Search Console',
    description:
      'Las búsquedas de 90 días agrupadas en temas: cada búsqueda va a la página que Google más le muestra (≥ 60 % de sus impresiones y posición ≤ 30); las que no tienen página clara se agrupan por significado (embeddings guardados y reutilizados entre proyectos, pedidos por tandas de 90; si el proveedor limita el uso, espera un minuto, agrupa con lo que tiene y repite en una hora hasta 6 veces) o, sin embeddings, por palabras, y piden «página nueva». Cifras, tendencia a 28 días, búsquedas de marca y parte de clics anónimos. Pantalla: Proyectos → Palabras.',
    status: 'built',
    file: 'lib/seo/mapa/mapa.ts',
    when: 'Al terminar cada auditoría y a mano (trabajo «seo.mapa.build»).',
    ai: 'Solo embeddings (si hay proveedor con saldo) para agrupar por significado; el nombre de cada tema es su búsqueda principal (sin IA de texto).',
    code: 'Reglas puras en lib/seo/mapa/rules.ts. Un tema que una persona descarta o renombra lo sigue estando al rehacer el mapa. Canibalización: búsquedas con ≥ 2 páginas que se turnan el primer puesto semana a semana (≥ 2 cambios, top 20) → hallazgo «seo.cannibalization» (fuente «seo.mapa:gsc») y propuesta del plan.',
    tables: ['seo_topics', 'seo_topic_queries', 'seo_text_embeddings', 'gsc_daily', 'gsc_queries', 'gsc_pages', 'gsc_daily_totals', 'findings']
  },
  {
    id: 'seo-competencia',
    lane: 'Competencia',
    name: 'Competencia en Google',
    description:
      'Busca en Google (DataForSEO, por la fuente de búsquedas del núcleo que registra Agentes) hasta 15 búsquedas semilla: los temas que más se ven (sin los de marca) y «servicio + población» de la ficha. Propone los dominios que salen en al menos 3 búsquedas (2 si hay pocas) o 2 veces en el mapa; los directorios conocidos salen marcados. Se guardan en la lista de competidores del cliente (núcleo) como «propuesto»: una persona confirma. De cada uno se guardan también los huecos: búsquedas donde sale él y la web del cliente no (top 20).',
    status: 'built',
    file: 'lib/seo/competencia/competencia.ts',
    when: 'A mano, desde Proyectos → Palabras (trabajo «seo.competencia.find», un intento: no repite gasto).',
    ai: 'Nada: recuento y posición media por dominio (lib/seo/competencia/rules.ts).',
    code: 'Lo confirmado o descartado nunca lo cambia la búsqueda; solo se ponen al día sus datos (búsquedas, posición, valoración en el mapa). Coste por búsqueda de DataForSEO, unos 0,002 $ [NV].',
    tables: ['client_competitors', 'seo_topics', 'client_locations']
  },
  {
    id: 'seo-competencia-webs',
    lane: 'Competencia',
    name: 'Sus webs frente a la del cliente',
    description:
      'Rastreo ligero (50 páginas, las de ruta más corta primero) de las webs de hasta 5 competidores confirmados y directos (no directorios), con el rastreador del núcleo (objetivo «competidor»). Se compara con el último rastreo de la web del cliente: qué servicios de la ficha tienen página propia, qué datos estructurados usan, la mediana de respuesta del servidor y de palabras por página. Pantalla: Proyectos → Palabras → Sus webs frente a la del cliente.',
    status: 'built',
    file: 'lib/seo/competencia/competencia.ts',
    when: 'Al confirmar un competidor y a mano («Rastrear sus webs»); como mucho uno por web cada 30 días.',
    ai: 'Nada: reglas puras en lib/seo/competencia/compare.ts.',
    code: 'Un servicio tiene página si todas sus palabras están en la dirección, el título o el H1 de una página indexable. Solo se comenta un dato estructurado si lo usa al menos la mitad de la competencia rastreada; el servidor, si el del cliente pasa de 800 ms y es 1,5 veces más lento; el texto, si el cliente tiene menos del 60 %.',
    tables: ['client_competitors', 'crawl_runs', 'crawl_pages']
  },
  {
    id: 'seo-preguntas',
    lane: 'Expediente',
    name: 'Lo que el expediente pregunta al cliente',
    description:
      'Desde el 25 nov 2026 SEO no envía su propio correo: lo que el expediente no ha podido averiguar solo (dato que falta, dos fuentes que no coinciden o confianza < 60) entra como «Datos que faltan (SEO)» en las Preguntas del cliente (núcleo, mapa Clientes), junto a las de sus servicios; si el cliente ya tiene la pregunta del banco que cubre lo mismo (servicios → ficha «qué ofrece», zona → ficha «zona»), no se repite. La respuesta (por correo, cuestionario o a mano) vuelve aquí y queda «Respuesta del cliente», provisional, en el expediente. Los correos de 3 preguntas enviados antes del 25 nov se siguen leyendo aquí. Pantalla: Proyectos → Expediente → Preguntas al cliente (resumen y enlace a la ficha → Preguntas).',
    status: 'built',
    file: 'lib/seo/preguntas/preguntas.ts',
    when: 'Cada vez que se ponen al día las preguntas del cliente (al abrir su ficha, la pasada diaria y antes de enviar). Al reunir el expediente se pide el envío automático al núcleo (trabajo «seo.preguntas.preparar», que pasa a «clientes.preguntas.auto»). Correos antiguos: «seo.preguntas.leer».',
    ai: 'Ninguna para elegir ni redactar las preguntas (reglas). Los correos antiguos los lee Haiku con el prompt seo_leer_respuestas; los nuevos, el núcleo (clientes_leer_respuestas).',
    code: 'Fuente y destino registrados en el núcleo (registerClientQuestionSource / registerClientAnswerHandler, destino «seo:<proyecto>:<campo>»). La respuesta se limpia con la forma de su campo (teléfono válido, dirección con población o código postal, servicios como lista corta) antes de guardarla; nada pasa a la ficha sin que una persona lo confirme.',
    tables: ['seo_dossier_facts', 'client_questions', 'client_messages'],
    prompts: ['seo_leer_respuestas']
  },
  {
    id: 'seo-estratega',
    lane: 'Estratega',
    name: 'Lo que sabe SEO, en el expediente del estratega',
    description:
      'El estratega (Estrategia) recibe por el núcleo (registerProjectDossierProvider) un resumen de cada proyecto SEO del cliente: hallazgos agrupados, propuestas del plan pendientes o en curso (para no repetirlas y contar sus horas), los temas principales del mapa de palabras y la competencia confirmada. Sus URLs y búsquedas se pueden citar como evidencia.',
    status: 'built',
    file: 'lib/seo/dossier-provider.ts',
    when: 'Cada vez que el estratega analiza un cliente con proyectos SEO.',
    ai: 'La del estratega (su prompt no cambia).',
    code: 'Sin leer tablas de otro módulo: SEO registra el proveedor y Estrategia lo pide al núcleo. Va marcado como dato no fiable (lleva búsquedas de fuera).',
    tables: ['findings', 'seo_plan_items', 'seo_topics', 'client_competitors']
  },
  {
    id: 'seo-resenas',
    lane: 'Próximamente',
    name: 'Reseñas de la ficha de Google',
    description: 'Reseñas con borrador de respuesta que se aprueba antes de publicarse (tabla ya creada), y categoría y valoración de la ficha en el expediente.',
    status: 'planned',
    file: 'docs/DISENO-TECNICO-HITO1.md',
    when: 'Pendiente: necesita Places API activada en Google Cloud (o el acceso a la API de reseñas de Business Profile).',
    ai: 'Borrador de respuesta a reseñas con Haiku.',
    code: 'Publicar una respuesta siempre con aprobación, como los correos a clientes.',
    tables: ['seo_reviews']
  }
];
