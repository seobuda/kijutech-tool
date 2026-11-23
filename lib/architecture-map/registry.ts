import { getSeoManifest } from '@/lib/seo/manifest';
import { CLUSTERING_PROCESS_MAP, type ProcessStep, type TechnicalDetail } from '@/lib/ai/clustering/pipeline';
import { COMPETITOR_ANALYSIS_PROCESS_MAP } from '@/lib/seo/competitor-analysis-builder';
import { OPS_MAPS } from '@/lib/operaciones/process-map';
import { SECURITY_PROCESS_MAP } from '@/lib/auth/security-process-map';
import { AGENTES_PROCESS_MAP } from '@/lib/agentes/process-map';
import { CLIENTES_PROCESS_MAP } from '@/lib/core/clients-process-map';
import { PLATAFORMA_PROCESS_MAP } from '@/lib/core/platform-process-map';
import { SEO_SALUD_PROCESS_MAP } from '@/lib/seo/salud/process-map';
import { RENDIMIENTO_PROCESS_MAP } from '@/lib/rendimiento/process-map';
import { ESTRATEGIA_PROCESS_MAP } from '@/lib/estrategia/process-map';
import { ERRORES_PROCESS_MAP } from '@/lib/core/errors-process-map';
import { CONOCIMIENTO_PROCESS_MAP } from '@/lib/core/knowledge-process-map';

export interface SystemNode {
  id: string;
  name: string;
  description: string;
  status: 'built' | 'in_progress' | 'planned';
  icon: string; // nombre de icono lucide-react, resuelto en el cliente
  detailMapId?: string; // si existe, este nodo abre un diagrama de nivel 2
  // Fila visual en el nivel 1. 'infrastructure' = pilares del sistema
  // (persisten siempre, no son parte de la secuencia de ningún proyecto);
  // 'support' = procesos reales pero auxiliares, invocados desde dentro
  // del flujo en vez de ser un paso propio de él; 'flow' = etapas
  // secuenciales del wizard SEO (derivadas de modules/seo/manifest.json).
  // 'future' = pendientes en gris (todavía sin construir).
  group: 'infrastructure' | 'support' | 'flow' | 'future';
  technicalDetail?: TechnicalDetail;
  // Conexiones visuales extra (línea discontinua) hacia otros nodos del mismo nivel.
  edgesTo?: { id: string; label: string }[];
}

// Infraestructura núcleo real (no son etapas del wizard SEO, así que no
// viven en modules/seo/manifest.json).
const CORE_NODES: SystemNode[] = [
  {
    id: 'core-security',
    name: 'Seguridad',
    description:
      'Quién entra y qué puede hacer: inicio de sesión sin registro público, permisos por rol comprobados en el servidor, secretos fuera del código y pruebas automáticas.',
    status: 'built',
    icon: 'Shield',
    detailMapId: 'security',
    group: 'infrastructure',
    technicalDetail: {
      summary:
        'Defensa en capas: sesión firmada, límite de intentos, permisos por rol en cada acción y ruta de API, aislamiento entre cuentas, tokens enmascarados, secretos en .env, cabeceras de seguridad y una batería de pruebas (pnpm test) que falla si alguna capa se rompe.',
      stack: ['JWT (jose) + bcryptjs', 'Roles: lector, editor, admin, super_admin', 'Vitest'],
    },
  },
  {
    id: 'core-projects',
    name: 'Proyectos y Núcleo',
    description: 'La base del sistema: tenants, usuarios, roles y proyectos. Todo lo demás se construye sobre esto.',
    status: 'built',
    icon: 'FolderKanban',
    group: 'infrastructure',
  },
  {
    id: 'core-clientes',
    name: 'Clientes',
    description:
      'La ficha completa de cada cliente (núcleo): empresa y negocio, contactos y locales, webs y cuentas con su acceso, competencia, memoria y estado. La usan Operaciones, los agentes y SEO.',
    status: 'built',
    icon: 'Building2',
    detailMapId: 'clientes',
    group: 'infrastructure',
    technicalDetail: {
      summary:
        'Tablas del núcleo clients, client_contacts, client_locations, client_assets, client_competitors y client_memory (14 nov 2026, migración 0048). Operaciones guarda sus ajustes en ops_clients con el mismo id. Sección propia /dashboard/clientes con pestañas.',
      stack: ['lib/core/clients.ts (datos)', 'lib/core/client-rules.ts (reglas puras y completitud)', 'lib/core/client-actions.ts (acciones con permisos)'],
      keyDecisions: ['Cliente ≠ activo ≠ integración (patrón Semrush/AgencyAnalytics)', 'Mismo id que ops_clients: ninguna referencia se reescribió', 'Nunca contraseñas; contrato solo para administradores']
    },
  },
  {
    id: 'core-plataforma',
    name: 'Plataforma',
    description:
      'Los cimientos que usan los departamentos (SEO ahora, Ads después): proyecto con cliente y alcance, cola de trabajos con trabajador aparte, correos a clientes con aprobación, Search Console en detalle, rastreador de webs y hallazgos.',
    status: 'built',
    icon: 'Hammer',
    detailMapId: 'plataforma',
    group: 'infrastructure',
    technicalDetail: {
      summary:
        'Cimientos del 23 nov 2026 (migración 0060, aprobados por Enric; docs/DISENO-TECNICO-CIMIENTOS.md). Todo en el núcleo porque lo usarán varios módulos. El trabajador corre en su propio contenedor (APP_ROLE=worker).',
      stack: ['lib/core/jobs.ts', 'lib/core/comms.ts', 'lib/core/gsc.ts', 'lib/core/crawler.ts (parse5)', 'lib/core/findings.ts', 'lib/projects/scope.ts'],
      keyDecisions: ['Lo pesado fuera de la web y del bot', 'Search Console guardado en detalle (tabla particionada) en vez de consultas en directo', 'Hallazgos consultables con ciclo de vida, no JSON opaco', 'Ningún correo a un cliente sale sin aprobación por defecto']
    },
  },
  {
    id: 'core-conocimiento',
    name: 'Base de conocimiento',
    description:
      'Lo que la agencia sabe hacer y resolver (procedimientos, soluciones, tutoriales con vídeo). El equipo propone, la IA redacta y solo Enric publica. La usan el equipo y los agentes; en la fase 2, el jefe de Operaciones para contestar dudas.',
    status: 'built',
    icon: 'BookOpen',
    detailMapId: 'conocimiento',
    group: 'infrastructure',
    edgesTo: [{ id: 'agentes', label: 'buscar_conocimiento y guardar_conocimiento' }],
    technicalDetail: {
      summary:
        'Núcleo (20 nov 2026, migración 0056): tablas kb_articles y kb_categories. Búsqueda híbrida con pgvector y texto completo en español. Revisión por Telegram con botones (x:kb:…). Importación del espacio de ClickUp desde Operaciones. Sección Trabajo → Conocimiento.',
      stack: ['lib/core/knowledge.ts (datos, búsqueda, IA, botones, herramientas)', 'lib/core/knowledge-rules.ts (reglas puras)', 'lib/core/knowledge-actions.ts (acciones con permisos)', 'lib/operaciones/kb-import.ts (importación de ClickUp)'],
      keyDecisions: [
        'En el núcleo y no en Operaciones: la usarán todos los agentes',
        'Tablas propias en vez de leer ClickUp: búsqueda por significado, sin límite de peticiones y para poder dejar ClickUp',
        'Nada se publica sin el OK de Enric; se guardan la primera versión de la IA y sus correcciones para aprender'
      ]
    },
  },
  {
    id: 'core-errores',
    name: 'Errores y mantenimiento',
    description:
      'Todo lo que falla en la herramienta queda registrado y agrupado (servidor, IA, agentes, pantallas), avisa por Telegram y el Técnico de mantenimiento (subagente) lo diagnostica leyendo el código y propone el arreglo para aprobarlo.',
    status: 'built',
    icon: 'Stethoscope',
    detailMapId: 'errores',
    group: 'infrastructure',
    edgesTo: [{ id: 'agentes', label: 'diagnósticos del Técnico de mantenimiento' }],
    technicalDetail: {
      summary:
        'Núcleo (17 nov 2026, migración 0052): tablas sys_error_groups, sys_error_events y sys_error_settings. captureConsole() engancha console.error/warn, onRequestError las peticiones de Next y reportError() da contexto (quién, entrada, lo que vio la persona). Pantalla Administración → Errores.',
      stack: ['lib/core/errors.ts (captura, lotes, avisos, herramientas)', 'lib/core/error-rules.ts (huella, limpieza de secretos)', 'Subagente «Técnico de mantenimiento» (Sonnet 5.5)'],
      keyDecisions: [
        'Tabla propia en vez de Sentry: los datos se quedan en casa y el agente los lee sin otra API',
        'Agrupar por huella y guardar pocas muestras: una tormenta de errores no llena la base',
        'El Técnico solo lee y propone; el arreglo se aplica con aprobación'
      ]
    }
  },
  {
    id: 'ai-gateway',
    name: 'Motor de IA',
    description:
      'El punto único por el que pasan todas las llamadas a modelos de IA, con control de coste y del proveedor activo.',
    status: 'built',
    icon: 'Sparkles',
    group: 'infrastructure',
    technicalDetail: {
      summary:
        'Punto único de entrada para toda llamada a un modelo de IA — resuelve qué proveedor y clave usar, cifra/descifra las claves, aplica timeout y calcula el coste.',
      stack: [
        '4 adaptadores: Anthropic, OpenAI, Gemini, DeepSeek',
        'AES-256-GCM para las claves (crypto nativo de Node)',
        'Tabla ai_jobs — tracking de cada llamada',
        'Exámenes de prompts (22 nov 2026): lib/ai/prompt-evals.ts, historial en ai_prompt_evals; el módulo dueño del prompt pone los casos (registerPromptEvalSuite) y se pasan desde IA → Prompts',
      ],
      keyDecisions: [
        'Timeout de 60s por llamada',
        'max_tokens configurable por llamada — antes cada adapter traía un límite fijo (4096 en Anthropic)',
        'Nunca loguea la clave descifrada',
      ],
    },
  },
  {
    id: 'brain-panel',
    name: 'Panel del Cerebro',
    description: 'Muestra cuánto ha aprendido el sistema con el uso y cuánto se gasta en IA cada mes.',
    status: 'built',
    icon: 'Brain',
    group: 'infrastructure',
    technicalDetail: {
      summary:
        'Panel de solo lectura sobre lo que el sistema ha aprendido con el uso (modificadores de intención, ejemplos de clustering validados, feedback) y cuánto se gasta en IA, desglosado por función.',
      stack: ['Queries de solo lectura sobre ai_intent_modifiers, ai_clustering_examples, ai_clustering_feedback, ai_jobs'],
      keyDecisions: [
        'Umbrales mostrados: 200 modificadores de intención, 50 ejemplos de clustering — el RAG real ya se activa automáticamente a partir de 5 ejemplos, un umbral técnico distinto y más bajo que el mostrado en el panel',
        'El botón "Activar" del pre-filtrado automático es un placeholder, todavía sin lógica real',
      ],
    },
  },
  {
    id: 'admin-seo',
    name: 'Admin SEO',
    description: 'Gestión de las tarjetas y la configuración propias del módulo SEO.',
    status: 'built',
    icon: 'BookOpen',
    group: 'infrastructure',
  },
  {
    id: 'operaciones',
    name: 'Operaciones',
    description:
      'Del texto suelto a la tarea completada: Bloc con IA, envío fiable a ClickUp, avisos y botones por Telegram, vigilancia de ClickUp, resúmenes, alertas de clientes y panel de Automatizaciones.',
    status: 'built',
    icon: 'FolderKanban',
    detailMapId: 'ops',
    group: 'infrastructure',
    edgesTo: [
      { id: 'future-subagentes', label: 'revisor intercambiable (reviewers.ts)' },
      { id: 'agentes', label: 'herramientas y canales por el registro del núcleo' }
    ],
    technicalDetail: {
      summary:
        'Módulo aparte del SEO. Un bloc de notas (texto o audio) que la IA convierte en encargos con cliente, responsable, fecha y lista; el envío a ClickUp es fiable (sin duplicados); el equipo trabaja desde botones de Telegram; el sistema vigila ClickUp, manda recordatorios y resúmenes y avisa de clientes sin actividad. Todo se ajusta desde el panel de Automatizaciones.',
      stack: ['API v2 de ClickUp (fetch nativo)', 'Bot de Telegram (long polling dentro del contenedor)', 'callAI() — pasarela de IA con prompts editables', 'Tablas ops_* (mapa detallado en el nivel siguiente)'],
      keyDecisions: [
        'Las decisiones las toma el código siempre que se pueda; la IA solo propone, transcribe o hace el triaje de bloqueos',
        'Una conexión por tenant; el token nunca sale del servidor',
        'Todas las llamadas a ClickUp pasan por un cliente con contador por minuto y caché',
        'Un solo proceso escucha el bot (candado de PostgreSQL)',
      ],
    },
  },
  {
    id: 'agentes',
    name: 'Agentes',
    description:
      'Agentes con rol con los que se habla por Telegram (texto y audio) o correo: consultan, proponen acciones con botones y encargan trabajos a subagentes (Revisor web). Integraciones: DataForSEO, Clarity y Google.',
    status: 'built',
    icon: 'Bot',
    detailMapId: 'agentes',
    group: 'infrastructure',
    technicalDetail: {
      summary:
        'Módulo propio (tablas agt_*). No importa otros módulos: usa el registro de capacidades del núcleo (lib/core/capabilities.ts), donde cada módulo publica sus herramientas y sus canales; lib/app-wiring.ts los conecta al arrancar.',
      stack: ['SDK oficial de Anthropic (@anthropic-ai/sdk) con uso de herramientas', 'Lectura web y búsqueda de Anthropic (herramientas de servidor)', 'OpenAI para la voz (transcripción y voz)', 'Integraciones por API (DataForSEO, Clarity, Google OAuth)'],
      keyDecisions: [
        'Las acciones que cambian algo se proponen con botones (motor de acciones) y la autonomía sube por herramienta con datos',
        'Contexto corto: resumen + últimos mensajes, para que cada mensaje cueste poco',
        'El webhook de Telegram responde al momento y el agente trabaja en segundo plano (sin respuestas duplicadas)',
        'Credenciales cifradas; lo que llega de webs y correos es dato, nunca instrucción'
      ]
    }
  },
  {
    id: 'rendimiento',
    name: 'Rendimiento de clientes',
    description:
      'Guarda cada día los números de Google de cada cliente (Search Console, Analytics 4 y Business Profile) para no perder el histórico y medir la estrategia: pestaña en la ficha, panel central, hitos con su antes y después, avisos de caídas e informes.',
    status: 'built',
    icon: 'BarChart3',
    detailMapId: 'rendimiento',
    group: 'infrastructure',
    technicalDetail: {
      summary:
        'Módulo propio (tablas perf_*, migración 0049, 15 nov 2026). No habla con Google: usa las fuentes de métricas del núcleo (Agentes registra la de Google). Formato largo: una métrica nueva no necesita migración.',
      stack: ['PostgreSQL (perf_daily en formato largo)', 'Planificador del núcleo', 'Gráficas SVG propias'],
      keyDecisions: [
        'Guardar cada día porque Google borra pasados 16 meses (Search Console)',
        'Consultas y páginas por mes (top 1.000), no por día: 15 veces menos filas',
        'Sin IA: cifras, comparaciones y avisos son cálculos',
        'Los hitos permiten medir la estrategia (antes y después), no solo mirar números'
      ]
    }
  },
  {
    id: 'estrategia',
    name: 'Estrategia de clientes',
    description:
      'Seguimiento de cada cliente según su plan (frecuencias editables por plan y por cliente): salud de la web, palabras clave, ficha de Google, objetivos con curva SEO, detectores de oportunidades, trabajo hecho y URLs trabajadas. Fases 1 y 2 construidas (el estratega con Opus propone tareas con evidencia y ✅ crea el encargo); el impacto con aprendizajes (fase 3), pendiente.',
    status: 'in_progress',
    icon: 'Compass',
    detailMapId: 'estrategia',
    group: 'infrastructure',
    technicalDetail: {
      summary:
        'Módulo propio (tablas est_*, migración 0050, 15 nov 2026). Sin importar otros módulos: Google por la fuente de métricas del núcleo (búsqueda e inspección de URL), cifras por el proveedor de KPI de Rendimiento, encargos y horas por la fuente de trabajo de Operaciones, y la pregunta «¿en qué URL?» por su cola de avisos.',
      stack: ['Planificador del núcleo (agenda por cliente y proceso)', 'Search Console (búsqueda e inspección de URL)', 'PageSpeed Insights', 'Haiku para clasificar encargos'],
      keyDecisions: [
        'Nada se activa solo: cada cliente elige un plan (investigación del 15 nov: lo que vende cada servicio)',
        'Guardar a diario, decidir con la frecuencia del plan, avisar a diario solo de lo crítico',
        'Objetivos con curva SEO y días de gracia: sin falsas alarmas los primeros meses',
        'Detectores con código; la IA solo redacta y prioriza (fase 2)'
      ]
    }
  },
  {
    id: 'integraciones',
    name: 'Integraciones',
    description: 'Las conexiones con el exterior: ClickUp (caché y contador de peticiones), Telegram y la IA, con el prompt que usa cada función.',
    status: 'built',
    icon: 'Sparkles',
    detailMapId: 'ops_integrations',
    group: 'infrastructure',
  },
  {
    id: 'core-inicio',
    name: 'Inicio y navegación',
    description:
      'La portada y el menú (fase 1 de la reorganización UX, 20 nov 2026): cinco espacios (Inicio, Para ti, Clientes, Equipo y Conocimiento) con Ajustes aparte, y un Inicio según el rol. Administración ve lo que espera de ti y una tarjeta por área (clientes, equipo, agentes y sistema; el gasto de IA solo super_admin); el equipo ve un panel propio (lo urgente, sus cifras de la semana sin ranking, su día, su jornada, sus dudas y lo nuevo de la base) y tiene «Mis tareas» con toda su lista. Las tareas se leen con un tipo propio (WorkTask) para que, cuando la herramienta sustituya a ClickUp en 2027, solo cambie la fuente.',
    status: 'built',
    icon: 'Compass',
    group: 'infrastructure',
    technicalDetail: {
      summary:
        'Sin tablas propias: lib/inicio/panel.ts solo lee lo que ya calculan Operaciones (bandeja, correos, semáforo, jornada), Agentes (dudas y acciones), Conocimiento, Estrategia y Errores. Cada tarjeta carga por separado con Suspense; las tareas de ClickUp llegan después de pintar y usan la caché de getTeamToday. Las rutas no cambian: solo el menú (components/app-shell/nav.ts).',
      stack: ['app/(dashboard)/dashboard/page.tsx + _inicio/', 'app/(dashboard)/dashboard/mis-tareas/', 'lib/inicio/panel.ts', 'lib/operaciones/my-tasks.ts (fuente de tareas, hoy ClickUp + encargos)', 'components/app-shell/nav.ts (espacios, subentradas y «＋ Nuevo»)'],
      keyDecisions: [
        'Lo accionable primero (lo que espera de ti), nunca un muro de gráficas',
        'Un bloque que falla se registra y muestra «no disponible» sin tumbar el resto',
        'Las direcciones antiguas se mantienen para no romper los enlaces de Telegram'
      ]
    },
  },
];


// Pendientes (en gris): todavía sin construir. Cada uno con una frase de qué será.
const FUTURE_NODES: SystemNode[] = [
  { id: 'future-servidor', name: 'Servidor', status: 'in_progress', icon: 'Circle', group: 'future', description: 'En marcha desde el 5 nov en brain.kijutech.com (DigitalOcean, HTTPS automático, base de datos limpia, secretos nuevos, copia diaria y snapshots). Telegram ya recibe por webhook (verificado el 6 nov). Falta: sacar las copias fuera de DigitalOcean (NAS y Google Drive), CSP con nonce y, más adelante, el proxy de Cloudflare.' },
  { id: 'future-jornada', name: 'Jornada real', status: 'built', icon: 'Circle', group: 'future', description: 'Construido (paso 5A): entrada al empezar una tarea desde Telegram, descansos con cupo, comida, salidas con motivo, cierre automático, avisos retenidos y pestaña Equipo → Jornada. Detalle en el mapa de Operaciones → Jornada real.' },
  { id: 'future-tiempos', name: 'Tiempos por tarea', status: 'built', icon: 'Circle', group: 'future', description: 'Construido (paso 5B): una tarea activa a la vez (las pausas no cuentan), estimación propia de un toque con feedback de precisión, margen editable por tipo con propuesta a partir de lo real, motivo y URL si se pasa, pestaña Equipo → Tiempos y Mi panel. Detalle en el mapa de Operaciones → Tiempos de tarea.' },
  { id: 'future-juego', name: 'Temporadas, niveles y misiones', status: 'planned', icon: 'Circle', group: 'future', description: 'Paso 5C: puntos por resultado (a tiempo, calidad, precisión, jornada), niveles por especialidad, rachas con comodines, misión semanal, objetivo de equipo, sin ranking, y bonus progresivo por temporadas trimestrales. Diseño en docs/DISENO-RENDIMIENTO-EQUIPO.md.' },
  { id: 'future-niveles', name: 'Niveles y recompensas', status: 'planned', icon: 'Circle', group: 'future', description: 'Progreso visible, carreras con formaciones desbloqueables y bonos mensuales que se pueden perder, con un salario base que solo sube.' },
  { id: 'future-subagentes', name: 'Subagentes por área', status: 'built', icon: 'Circle', group: 'future', description: 'Agentes de IA por área o por cliente que revisan el trabajo antes que tú, con su ficha y su criterio (por ejemplo, redacción con el tono de cada cliente o diseño web con tu criterio). Se enchufan como revisor intercambiable.' },
  { id: 'future-diccionario', name: 'Diccionario de la agencia', status: 'planned', icon: 'Circle', group: 'future', description: 'Herramientas, clientes y personas, más los errores de tu dictado por voz. En parte ya lo cubren los nombres alternativos de las fichas de clientes.' },
  { id: 'future-audio-telegram', name: 'Audios al bot de Telegram', status: 'built', icon: 'Circle', group: 'future', description: 'Construido (13 nov): se habla con el agente principal por audio y contesta también con voz. Ver el módulo Agentes.' },
  { id: 'future-email', name: 'Entrada de trabajo por email', status: 'planned', icon: 'Circle', group: 'future', description: 'Reenviar un email a una dirección propia para que se convierta en una nota y, de ahí, en encargos.' },
  { id: 'future-reglas', name: 'Reglas que aprenden de mis respuestas', status: 'planned', icon: 'Circle', group: 'future', description: 'Reglas de decisión que se aprenden de cómo respondes a bloqueos y revisiones, para que el agente resuelva más solo.' },
  { id: 'future-seo-auto', name: 'SEO automatizado', status: 'planned', icon: 'Circle', group: 'future', description: 'Auditoría por API, competidores desde la SERP y volúmenes de búsqueda con DataForSEO, sin cargas manuales.' },
  { id: 'future-deuda', name: 'Deuda técnica', status: 'planned', icon: 'Circle', group: 'future', detailMapId: 'tech_debt', description: 'Columnas obsoletas por borrar, datos y tareas de prueba, festivos en los días laborables y textos de «Respuesta» y «Devuelto» fijos en el código.' },
  { id: 'future-ux-para-ti', name: 'Para ti (bandeja única)', status: 'built', icon: 'Circle', group: 'future', description: 'Construido (fase 2, 21 nov): una sola bandeja con todo lo que espera una decisión (antes en 7 sitios), lo urgente primero, filtros por departamento y tipo, revisiones y bloqueos decididos ahí mismo por el dueño y su número en la barra. Desde el 23 nov también se deciden ahí los correos (respuesta del agente: enviar, corregir, crear el encargo o descartar), las propuestas de los agentes (Hacerlo / Descartar, como en Telegram; queda anotado «panel») y las dudas del equipo. Sin tablas propias (lib/inicio/para-ti.ts).' },
  { id: 'future-ux-equipo', name: 'Equipo humano + IA', status: 'built', icon: 'Circle', group: 'future', description: 'Construido (fase 3, 21 nov, migración 0058): organigrama como portada de Equipo con personas y agentes juntos, ficha común con foto o avatar (ops_team_avatars, agt_agent_avatars), departamento de cada persona, estado ahora, cifras y la actividad del día en un solo registro (lib/equipo/team.ts); desde el 23 nov incluye la jornada (ops_work_events: entradas, pausas y salidas, también las automáticas y las anotadas en la web) y lo hecho desde la web (bloqueos respondidos, fichas, calendario y decisiones sobre propuestas del agente).' },
  { id: 'future-ux-cliente', name: 'Cliente en un solo sitio', status: 'built', icon: 'Circle', group: 'future', description: 'Construido (fase 4, 21 nov): la ficha del cliente reúne Encargos, Rendimiento, Estrategia y SEO como pestañas (lo de la ficha en «Ficha y ajustes»), y las vistas de todos los clientes son pestañas del espacio Clientes.' },
  { id: 'future-ux-ayuda', name: 'Ayuda y pulido', status: 'built', icon: 'Circle', group: 'future', description: 'Construido (fase 5, 21 nov): visita guiada con ventanitas ancladas (Atrás, Siguiente, Saltar; una para administración y otra para el equipo) que sale sola la primera vez, botón «Ayuda» siempre visible para repetirla, ayuda de cada pantalla en Conocimiento y glosario (/dashboard/ayuda).' },
];

// Procesos de apoyo: funcionalidad real con su propio detailMapId, pero
// no es una etapa del manifest — se invoca desde dentro de un paso del
// flujo (aquí, desde un cluster ya creado en "Keyword Research", paso 4),
// no como paso propio y secuencial del wizard. Se muestra en su propia
// fila para no confundirla con los pilares de infraestructura.
const SUPPORT_NODES: SystemNode[] = [
  {
    id: 'seo-salud',
    name: 'Salud técnica (SEO v2)',
    description:
      'Hito 1 del nuevo departamento SEO: rastrea la web del proyecto, aplica 30 comprobaciones técnicas sin IA (respuestas, indexación, canonical, títulos, contenido, duplicados, enlazado, datos estructurados) y el cruce con Search Console, y deja hallazgos que se cierran solos al arreglarse. Genera el JSON-LD del negocio listo para pegar desde la ficha del cliente.',
    status: 'in_progress',
    icon: 'Stethoscope',
    detailMapId: 'seo_salud',
    group: 'support',
    technicalDetail: {
      summary:
        'Hito 1 (23 nov 2026, docs/DISENO-MODULO-SEO.md §5 y §10) sobre la plataforma: rastreador, cola de trabajos y hallazgos del núcleo. Hecho: reglas, cruce con Search Console, pantalla Proyectos → Salud y JSON-LD. Falta (necesita esquema, docs/DISENO-TECNICO-HITO1.md): expediente provisional, local, plan de mejora → encargos, I+D fase A y técnica e hipótesis de cada encargo.',
      stack: ['lib/seo/salud/audit-rules.ts (reglas puras)', 'lib/seo/salud/audit.ts (cola)', 'lib/seo/salud/jsonld.ts (plantillas)', 'app/(dashboard)/dashboard/projects/[projectId]/salud'],
      keyDecisions: ['Sin IA para lo que es una regla: gratis, repetible y con versión', 'Espera al rastreo desde el módulo (re-encolado) en vez de un aviso del núcleo', 'El JSON-LD nunca inventa datos que no estén en la ficha']
    },
  },
  {
    id: 'competitor-analysis',
    name: 'Análisis de Competidores',
    description:
      'Compara automáticamente un cluster de keywords con las páginas de la competencia que ya posicionan y genera una guía de acción.',
    status: 'built',
    icon: 'Target',
    detailMapId: 'competitor_analysis',
    group: 'support',
    technicalDetail: {
      summary:
        'Compara automáticamente hasta 5 páginas de competidores ya posicionadas, extrayendo su estructura con regex (sin librerías de parseo HTML) y pasando ese contexto a un LLM para generar recomendaciones. Ver el detalle paso a paso para cada capa.',
      stack: ['fetch() nativo + parsing por regex (sin cheerio/jsdom)'],
      keyDecisions: [
        'Mínimo 3 competidores con scraping completado (scrape_status = "done") para poder generar el análisis',
        'Contexto truncado (máx. 10 keywords, 5 FAQs, 8 H2s, 3 CTAs por competidor) para controlar el tamaño del prompt',
      ],
    },
  },
];

// Etapas del wizard SEO que ya tienen pantalla propia funcionando —
// cualquier otra etapa del manifest se muestra como 'planned'. Es una
// lista a mano porque "¿tiene página construida?" no es algo derivable
// del manifest.json en sí (el manifest no distingue construido de
// planeado, solo declara el orden del wizard).
const BUILT_STAGE_KEYS = new Set(['onboarding', 'kickoff', 'audit', 'keyword_research']);

const STAGE_ICONS: Record<string, string> = {
  onboarding: 'Rocket',
  kickoff: 'Flag',
  audit: 'Stethoscope',
  keyword_research: 'Search',
  strategy: 'Map',
  execution: 'Hammer',
  reporting: 'BarChart3',
  notebooklm: 'NotebookText',
};

const STAGE_DESCRIPTIONS: Record<string, string> = {
  onboarding: 'Primer contacto con el cliente: mide dónde está hoy antes de empezar a trabajar.',
  kickoff: 'Recoge la información de negocio necesaria para diseñar la estrategia.',
  audit: 'Radiografía inicial del sitio web: qué funciona y qué hay que arreglar primero.',
  keyword_research: 'Busca, agrupa y prioriza las palabras clave que van a guiar el contenido del proyecto.',
  strategy: 'Convierte los clusters de keywords en un plan de contenido priorizado.',
  execution: 'Seguimiento de la creación real del contenido planificado.',
  reporting: 'Informes periódicos de resultados para el cliente.',
  notebooklm: 'Exporta el conocimiento del proyecto para consulta rápida.',
};

export function getSystemMap(): SystemNode[] {
  const manifest = getSeoManifest();

  const stageNodes: SystemNode[] = [...manifest.stages]
    .sort((a, b) => a.order - b.order)
    .map((stage) => ({
      id: stage.key,
      name: stage.name,
      description: STAGE_DESCRIPTIONS[stage.key] ?? stage.name,
      status: BUILT_STAGE_KEYS.has(stage.key) ? 'built' : 'planned',
      icon: STAGE_ICONS[stage.key] ?? 'Circle',
      group: 'flow' as const,
      ...(stage.key === 'keyword_research' ? { detailMapId: 'clustering' } : {}),
    }));

  return [...CORE_NODES, ...SUPPORT_NODES, ...stageNodes, ...FUTURE_NODES];
}

// Todos los mapas de detalle conocidos (el Server Component los resuelve y los pasa al cliente).
export const PROCESS_MAP_IDS = ['clustering', 'competitor_analysis', 'security', 'agentes', 'clientes', 'plataforma', 'rendimiento', 'estrategia', 'errores', 'conocimiento', 'seo_salud', ...Object.keys(OPS_MAPS)];

export function getProcessMap(detailMapId: string): ProcessStep[] {
  switch (detailMapId) {
    case 'clustering':
      return CLUSTERING_PROCESS_MAP;
    case 'competitor_analysis':
      return COMPETITOR_ANALYSIS_PROCESS_MAP;
    case 'security':
      return SECURITY_PROCESS_MAP;
    case 'agentes':
      return AGENTES_PROCESS_MAP;
    case 'clientes':
      return CLIENTES_PROCESS_MAP;
    case 'plataforma':
      return PLATAFORMA_PROCESS_MAP;
    case 'seo_salud':
      return SEO_SALUD_PROCESS_MAP;
    case 'rendimiento':
      return RENDIMIENTO_PROCESS_MAP;
    case 'estrategia':
      return ESTRATEGIA_PROCESS_MAP;
    case 'errores':
      return ERRORES_PROCESS_MAP;
    case 'conocimiento':
      return CONOCIMIENTO_PROCESS_MAP;
    default:
      return OPS_MAPS[detailMapId] ?? [];
  }
}
