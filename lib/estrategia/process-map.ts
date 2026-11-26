// Mapa Visual del módulo Estrategia (nivel 3): cómo se hace el seguimiento de cada cliente según su plan. Se registra
// en lib/architecture-map/registry.ts (detailMapId «estrategia»). Fase 1 construida el 15 nov 2026 y fase 2 (estratega con
// Opus y su calidad) el 16 nov; la fase 3 (impacto, aprendizajes, informes) va en gris.
import type { ProcessStep } from '@/lib/ai/clustering/pipeline';

export const ESTRATEGIA_PROCESS_MAP: ProcessStep[] = [
  {
    id: 'est-planes',
    lane: 'Configurar',
    name: 'Planes y frecuencias',
    description: 'Catálogo de procesos (vigilancia crítica, salud técnica, velocidad, palabras clave, ficha de Google, URLs trabajadas, detectores, objetivos, guardián, extracción de encargos…) con su frecuencia editable. Los planes (Mantenimiento web, SEO local, SEO estratégico y los que se creen) dicen qué procesos y cada cuánto. Cada cliente elige un plan en su ficha y puede ajustar cualquier proceso solo para él, o pausarse.',
    status: 'built',
    file: 'lib/estrategia/rules.ts',
    when: 'Al editar los planes (Trabajo → Estrategia → Planes) o el plan de un cliente (ficha → Estrategia → Plan y frecuencias).',
    ai: 'Nada.',
    code: 'Sin plan no se hace nada con el cliente. Configuración efectiva = la del plan + los ajustes propios del cliente. Los procesos declaran dependencias y el panel avisa si falta alguna. Solo los administradores cambian planes y frecuencias (cambian el coste).',
    tables: ['est_plans', 'est_client_settings', 'est_settings']
  },
  {
    id: 'est-agenda',
    lane: 'Configurar',
    name: 'Agenda de cada proceso',
    description: 'Una fila por cliente y proceso activo con su próxima ejecución. El planificador ejecuta lo que toca, repartido por cliente para no hacerlo todo a la vez; un fallo espera y reintenta (15 min, 30, 60… hasta 12 h). «Ejecutar ahora» lo adelanta.',
    status: 'built',
    file: 'lib/estrategia/scheduler.ts',
    when: 'Planificador del núcleo cada 30 s (tarea «estrategia de clientes», en segundo plano, tope de 25 s por vuelta).',
    ai: 'Nada.',
    code: 'La agenda se rehace al cambiar un plan, un ajuste o cada 10 minutos. Un cliente en pausa no se ejecuta hasta el día siguiente a la pausa.',
    tables: ['est_process_runs'],
    runs: ['runScheduled']
  },
  {
    id: 'est-web',
    lane: 'Vigilar',
    name: 'Salud de la web',
    description: 'Vigilancia crítica (portada caída, error 5xx, «noindex», robots.txt que bloquea todo, SSL caducado o a punto); salud técnica (páginas con más clics y una muestra del sitemap: errores, redirecciones, «noindex», títulos y descripciones, títulos duplicados, indexación en Search Console de las principales); velocidad con PageSpeed Insights (datos reales de usuarios de 28 días y laboratorio).',
    status: 'built',
    file: 'lib/estrategia/processes.ts',
    when: 'Según el plan: por defecto, vigilancia crítica cada día, salud técnica cada semana y velocidad cada mes.',
    ai: 'Nada.',
    code: 'Los problemas críticos solo avisan si siguen en una segunda comprobación 30 minutos después. Solo se piden URLs públicas (nunca la red interna). PageSpeed usa PAGESPEED_API_KEY si está en el .env. Desde el 26 nov 2026, en los clientes con un proyecto SEO con vigilancia programada se omiten crítico, salud y velocidad, y los detectores solo calculan el embudo de Analytics: lo hace el módulo SEO por proyecto (Salud → Vigilancia automática). Se guardan las 20 últimas comprobaciones de cada tipo.',
    tables: ['est_health_checks', 'est_signals']
  },
  {
    id: 'est-google',
    lane: 'Vigilar',
    name: 'Palabras clave, ficha de Google y URLs trabajadas',
    description: 'Posición, clics e impresiones de las palabras que sigue el cliente (Search Console; las críticas y las de páginas recién cambiadas, cada día). Ficha de Google: vistas, llamadas, clics a la web y cómo llegar frente al periodo anterior y al año pasado. URLs trabajadas: datos diarios de cada página con 90 días de «antes» y la fecha en que Google la vuelve a rastrear tras el cambio. Si Search Console no tiene datos de la URL tal como se escribió, se busca la variante que sí tiene (www, barra final, http/https) y se sigue esa. El antes (28 días previos al cambio) y el después (desde el rastreo) se dan en clics por día de calendario: los días sin impresiones cuentan como cero.',
    status: 'built',
    file: 'lib/estrategia/processes.ts',
    when: 'Según el plan (por defecto, palabras y ficha cada semana; URLs cada día).',
    ai: 'Nada.',
    code: 'Google llega por la fuente de métricas del núcleo (búsqueda libre e inspección de URL, que registra Agentes); las cifras de la ficha, por el proveedor de KPI de Rendimiento. Una caída de la ficha que también hubo el año pasado en esas fechas se marca como probable temporada.',
    tables: ['est_keywords', 'est_keyword_history', 'est_tracked_urls', 'est_url_daily', 'est_signals']
  },
  {
    id: 'est-detectores',
    lane: 'Entender',
    name: 'Detectores de oportunidades',
    description: 'Con 4 semanas de Search Console frente a las 4 anteriores (y el año pasado): consultas al alcance (posición 4-15, ajustable), CTR muy bajo para su posición (avisa de que puede ser un resumen de IA de Google), páginas en caída (marcando la temporada), consultas nuevas sin página, canibalización solo con pérdida real y embudos rotos (sube el tráfico y caen las conversiones).',
    status: 'built',
    file: 'lib/estrategia/rules.ts',
    when: 'Según el plan (por defecto, cada semana).',
    ai: 'Nada: son reglas. El estratega las recibe en su expediente.',
    code: 'Cada señal tiene una clave única: no se repite, se actualiza, se resuelve sola cuando deja de aparecer y no se reabre si se descartó. Solo avisan por Telegram las de gravedad «aviso» o «crítico»; las oportunidades salen en el panel y en el informe semanal.',
    tables: ['est_signals']
  },
  {
    id: 'est-objetivos',
    lane: 'Entender',
    name: 'Objetivos',
    description: 'Objetivos medibles (cifra de Rendimiento, partida, meta en rango prudente / esperada / ambiciosa, fechas) o de hito. «Calcular partida» usa la media mensual de los 3 últimos meses completos y propone metas sin IA.',
    status: 'built',
    file: 'lib/estrategia/processes.ts',
    when: 'Según el plan (por defecto, cada día) y al abrir la pestaña.',
    ai: 'Nada.',
    code: 'Estado con curva en S (el SEO tarda: lento los primeros meses) o lineal; con 13 meses de datos se corrige por temporada. Antes de los días de gracia (90) nunca sale «desviado», como mucho «vigilar». Avisa solo cuando empeora (y cuando se logra).',
    tables: ['est_objectives']
  },
  {
    id: 'est-trabajo',
    lane: 'Entender',
    name: 'Trabajo hecho (encargos terminados)',
    description: 'Al cerrarse un encargo de un cliente con la extracción activada: tipo de trabajo, URLs, palabras clave y cifras que debería mover, y horas. Las URLs del cliente empiezan a seguirse. Si falta la URL de un trabajo sobre una página, el bot pregunta a quien lo hizo («✍️ Escribir» / «No aplica»).',
    status: 'built',
    file: 'lib/estrategia/processes.ts',
    when: 'Cada 5 minutos, con los encargos terminados desde la última pasada (y «Procesar encargos anteriores» en la pestaña).',
    ai: 'Modelo pequeño (Haiku) con el prompt editable est_task_extract, ≈ 0,0001 $ por encargo. Al llegar al tope del módulo, sigue por reglas sin IA.',
    code: 'Los encargos llegan de Operaciones por el núcleo (registerWorkSource); la pregunta va por la cola de avisos de Operaciones y la respuesta vuelve a Estrategia (registerTaskAnswerHandler «url»). Solo cuentan URLs de los dominios del cliente, y se siguen con su versión canónica (redirección final o etiqueta canonical, si sigue en la propiedad), para que coincidan con la página que tiene Google.',
    tables: ['est_work_facts', 'est_tracked_urls'],
    prompts: ['est_task_extract']
  },
  {
    id: 'est-guardian',
    lane: 'Vigilar',
    name: 'Guardián',
    description: 'Que el cliente tenga objetivos (si su plan los incluye), encargos planificados para los próximos días, las horas del mes al ritmo del contrato y ningún objetivo con la fecha pasada sin cerrar.',
    status: 'built',
    file: 'lib/estrategia/processes.ts',
    when: 'Según el plan (por defecto, cada 3 días).',
    ai: 'Nada.',
    code: 'La carga del cliente (horas del mes, contratadas, encargos próximos y abiertos) llega de Operaciones por el núcleo.',
    tables: ['est_signals']
  },
  {
    id: 'est-calendario',
    lane: 'Ver',
    name: 'Calendario de la agencia',
    description: 'Actualizaciones de Google, festivos e incidencias de datos. Salen como hitos en las gráficas de Rendimiento y los avisos de caídas dicen si coinciden con una actualización.',
    status: 'built',
    file: 'lib/estrategia/store.ts',
    when: 'Se añaden a mano en Trabajo → Estrategia → Calendario (admin).',
    ai: 'Nada.',
    code: 'Rendimiento los lee por el núcleo (registerEventSource): ningún módulo importa a otro.',
    tables: ['est_events']
  },
  {
    id: 'est-ver',
    lane: 'Ver',
    name: 'Pestaña, panel, informe semanal y agente',
    description: 'Pestaña «Estrategia» de la ficha (solo las secciones de los procesos activos del cliente), panel propio (clientes, planes, calendario, calidad del estratega, ajustes), apartado del informe semanal y herramienta del agente estrategia_cliente.',
    status: 'built',
    file: 'lib/estrategia/report.ts',
    when: 'Al abrir la pestaña o el panel; el informe semanal los lunes; el agente cuando se le pregunta.',
    ai: 'Nada (la herramienta del agente solo lee).',
    code: 'Ver la estrategia y trabajar en ella: editor. Planes, frecuencias, ajustes, calendario y borrar objetivos: administrador.',
    tables: ['est_signals', 'est_objectives']
  },
  {
    id: 'est-estratega',
    lane: 'Decidir',
    name: 'Estratega (Opus)',
    description: 'Prepara el expediente del cliente (ficha, horas, objetivos con código O1…, cifras de 28 días frente a las anteriores y al año pasado, señales con código S1…, palabras clave, consultas y páginas de Search Console, salud de la web, trabajo hecho con el antes y después de cada URL, encargos abiertos, propuestas anteriores con sus motivos, lo que suele tardar el equipo y el calendario) y Opus devuelve un diagnóstico y propuestas en JSON. Llegan por Telegram con botones ✅ Crear · ✏️ Ajustar · ⏸️ Luego · ✖️ No (con motivo) y salen en la ficha → Estrategia → Propuestas. ✅ crea el encargo en ClickUp a través de Operaciones.',
    status: 'built',
    file: 'lib/estrategia/strategist.ts',
    when: 'Con la frecuencia de su plan (proceso «Análisis del estratega», por defecto semanal en SEO estratégico y quincenal en SEO local); al momento si un objetivo pasa a desviado o hay una caída crítica (proceso «Análisis por alerta», como mucho N al mes por cliente y nunca dos en 3 días); y con «Analizar ahora» en la ficha. Los análisis van en cola y un trabajador los hace de uno en uno, aparte del resto de procesos.',
    ai: 'Opus 5.5 con el prompt editable est_strategist (IA y modelos → Prompts): diagnóstico, aprendizajes y hasta el máximo de propuestas con evidencia, tipo de trabajo, impacto, confianza, horas y efecto esperado. Los datos del cliente van marcados como no fiables (no son instrucciones).',
    code: 'Valida cada propuesta: evidencia que esté de verdad en el expediente (si no, fuera), sin repetir encargos abiertos, trabajo hecho ni propuestas anteriores; horas = mediana del equipo para ese tipo de trabajo si hay al menos 3 casos; prioridad ICE (impacto × confianza / horas) y recorte a las horas que quedan del mes. Tope de gasto de IA del módulo. Decidir: edición; quien lleva las operaciones decide por Telegram. Una propuesta se reclama antes de crear el encargo (nunca dos). Caducan si no se deciden; «Más adelante» vuelve a poder proponerse pasado el plazo. Ajustes en Trabajo → Estrategia → Ajustes → Estratega (propuestas por análisis, alertas al mes, caducidad y «Más adelante»). Nunca cambia nada en la web del cliente.',
    tables: ['est_analyses', 'est_suggestions', 'est_settings'],
    prompts: ['est_strategist']
  },
  {
    id: 'est-calidad',
    lane: 'Aprender',
    name: 'Calidad del estratega',
    description: 'Pestaña «Calidad del estratega» del panel: aceptación (encargos creados / decididas), ejecución (encargos terminados de los creados hace más de 3 semanas), motivos de «No», análisis y coste, por cliente y en 30, 90 o 180 días.',
    status: 'built',
    file: 'lib/estrategia/strategist-rules.ts',
    when: 'Al abrir la pestaña. Un encargo de una propuesta se marca hecho cuando la extracción ve que se ha terminado.',
    ai: 'Nada. Los motivos de «No» y los resultados vuelven al estratega en el siguiente expediente para que aprenda.',
    code: 'Las aplazadas no cuentan en la aceptación; las aprobadas recientes no cuentan en la ejecución.',
    tables: ['est_suggestions', 'est_analyses']
  },
  {
    id: 'est-impacto',
    lane: 'Aprender',
    name: 'Impacto y aprendizajes (fase 3)',
    description: 'Impacto de cada tarea con páginas de control (28/56/84 días en cambios de página, 90/180 en contenido nuevo y ficha), etiquetado por actualizaciones de Google; aprendizajes de toda la agencia con tamaño del efecto e intervalo; informes mensuales y revisión trimestral.',
    status: 'planned',
    file: 'docs/DISENO-ESTRATEGIA-VIVA.md',
    when: 'Automático según la ventana de cada tarea.',
    ai: 'Opus para redactar; el cálculo es código.',
    code: 'Sin datos suficientes no se publica impacto por página: solo cuenta en el agregado.'
  }
];
