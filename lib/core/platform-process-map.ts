// Mapa Visual de los cimientos de la plataforma (NÚCLEO, 23 nov 2026; nivel 3). Se registra en
// lib/architecture-map/registry.ts (detailMapId «plataforma»). Diseño: docs/DISENO-TECNICO-CIMIENTOS.md.
import type { ProcessStep } from '@/lib/ai/clustering/pipeline';

export const PLATAFORMA_PROCESS_MAP: ProcessStep[] = [
  {
    id: 'plt-proyecto',
    lane: 'Proyecto',
    name: 'Proyecto con cliente y alcance',
    description: 'Un proyecto pertenece siempre a un cliente (un cliente puede tener varios: otra web, otra línea de negocio, otra ciudad) y elige de entre las cuentas del cliente sus webs, propiedades de Google, fichas y redes. Tiene servicio (SEO, Ads, web) y horas al mes.',
    status: 'built',
    file: 'lib/projects/scope.ts',
    when: 'Al crear o editar un proyecto (Proyectos → Nuevo / Editar).',
    ai: 'Nada.',
    code: 'Cliente obligatorio (CHECK en la base; los proyectos antiguos sin cliente quedan como legacy). El alcance solo admite cuentas del mismo cliente. Las propiedades de Search Console del alcance se dan de alta y se programa su descarga. No se borra la ficha de un cliente con proyectos. Los encargos que nacen de un proyecto lo guardan (ops_requests.project_id).',
    tables: ['projects', 'project_assets', 'client_assets', 'ops_requests']
  },
  {
    id: 'plt-cola',
    lane: 'Cola de trabajos',
    name: 'Cola de trabajos y procesos periódicos',
    description: 'Lo pesado (rastreos, descargas de Search Console, envíos a clientes) va a una cola que corre un trabajador aparte, no la web ni el bot. Los procesos periódicos generan su trabajo cuando vencen.',
    status: 'built',
    file: 'lib/core/jobs.ts',
    when: 'El trabajador da una vuelta cada 2 s (al instante si hay trabajo): recupera los caídos, convierte los procesos vencidos y ejecuta hasta 3 a la vez (WORKER_SLOTS).',
    ai: 'Nada.',
    code: 'Reclamación atómica (FOR UPDATE SKIP LOCKED): varios trabajadores no se pisan. Latido cada 15 s; un trabajo sin latido 90 s vuelve a la cola. Reintentos con espera 1, 4, 9… min. Concurrencia máxima por tipo. Una clave evita dos trabajos abiertos iguales. Un proceso que falla se espacia (×2, tope 24 h). Salud avisa si hay trabajos esperando más de 30 min (trabajador parado). La limpieza semanal borra los terminados.',
    tables: ['jobs', 'job_schedules']
  },
  {
    id: 'plt-comms',
    lane: 'Comunicaciones',
    name: 'Correos a clientes',
    description: 'Todo lo que sale hacia un cliente (de una persona, un agente o el sistema): los destinatarios salen de lo que recibe cada contacto; por defecto pasa por la aprobación de Enric (Para ti o Telegram) y se envía por la cola; las respuestas se unen a su hilo.',
    status: 'built',
    file: 'lib/core/comms.ts',
    when: 'Cuando alguien escribe a un cliente (herramienta escribir_al_cliente de los agentes; más adelante, los procesos del SEO). Aprobar: Para ti o Telegram. Respuesta: al entrar por el buzón.',
    ai: 'Nada aquí (el texto lo redacta quien escribe).',
    code: 'Sin contacto que reciba ese tipo, no se crea y se dice qué falta (el paso queda bloqueado). Política: la del cliente o, si hereda, la de la cuenta (por defecto, siempre por aprobación); un agente que ha leído webs en el turno nunca envía solo. Envío idempotente con Message-ID propio («cm-<id>@dominio») para unir las respuestas. Decidido en la web, el aviso de Telegram pierde sus botones.',
    tables: ['client_messages', 'client_contact_subscriptions', 'client_contacts', 'clients', 'tenants', 'jobs']
  },
  {
    id: 'plt-gsc',
    lane: 'Datos',
    name: 'Search Console en detalle',
    description: 'Cada día, el detalle consulta × página × dispositivo de cada propiedad (paginado hasta el final), los totales (para saber qué parte de los clics es de consultas anónimas), el reparto por país y un resumen mensual que se guarda para siempre. Además, los 16 meses de histórico por tramos.',
    status: 'built',
    file: 'lib/core/gsc.ts',
    when: 'Proceso «gsc.sync» cada 6 horas por propiedad (los 4 últimos días, que Google corrige, y un tramo de 14 días del histórico hasta completar 16 meses). Retención semanal.',
    ai: 'Nada.',
    code: 'Diccionarios de consultas y URLs (huella SHA-1) para no repetir textos. Detalle diario en una tabla particionada por mes; se guarda 24 meses (se borra la partición entera). Tope de 100.000 filas por día (si se llega, se marca «truncado»: convendría la exportación a BigQuery). Reintento ante límites de Google. El núcleo no habla con Google: usa la fuente de métricas de Agentes.',
    tables: ['gsc_properties', 'gsc_queries', 'gsc_pages', 'gsc_daily', 'gsc_daily_totals', 'gsc_daily_country', 'gsc_monthly']
  },
  {
    id: 'plt-rastreo',
    lane: 'Datos',
    name: 'Rastreador de webs',
    description: 'Recorre la web del proyecto o la de un competidor y guarda de cada página lo que importa para el SEO: estado, redirección, título, descripción, canonical, robots, encabezados, texto, huellas de duplicado, enlaces y JSON-LD.',
    status: 'built',
    file: 'lib/core/crawler.ts',
    when: 'Al lanzar un rastreo (startCrawl). Corre en la cola por tramos de 8 min.',
    ai: 'Nada.',
    code: 'Respeta robots.txt (RFC 9309), lee los sitemaps, 1 petición por segundo por dominio (o su Crawl-delay hasta 5 s), solo direcciones públicas, máx. 2 MB por página, sin ejecutar JavaScript (avisa si la página parece pintada con JS). HTML analizado con parse5. Se guardan las 3 últimas ejecuciones por proyecto.',
    tables: ['crawl_runs', 'crawl_pages', 'crawl_links']
  },
  {
    id: 'plt-hallazgos',
    lane: 'Datos',
    name: 'Hallazgos tipados',
    description: 'Lo que cada departamento detecta en un proyecto («a esta URL le falta el título»), con tipo registrado, gravedad, URL o consulta, cifra y evidencia; consultable y con ciclo de vida.',
    status: 'built',
    file: 'lib/core/findings.ts',
    when: 'Cada vez que una comprobación termina (las reglas del SEO llegarán en el Hito 1).',
    ai: 'Nada aquí.',
    code: 'Lo nuevo se crea; lo que sigue se actualiza; lo resuelto que vuelve se reabre; lo que deja de aparecer se resuelve solo; lo descartado o aceptado no se reabre. Cada tipo enlaza su explicación de formación en la base de conocimiento.',
    tables: ['findings']
  }
];
