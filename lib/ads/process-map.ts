// Mapa Visual del módulo Google Ads (nivel 3): cómo se conecta con la MCC, qué se descarga, cada cuánto, dónde se guarda y
// cómo sabe la herramienta si está ciega (MED-00). Se registra en lib/architecture-map/registry.ts (detailMapId «ads»).
// Diseño: docs/ads/DISENO-TECNICO-ADS.md v2. Todo es lectura de Google Ads.
import type { ProcessStep } from '@/lib/ai/clustering/pipeline';

export const ADS_PROCESS_MAP: ProcessStep[] = [
  {
    id: 'ads-conexion',
    lane: 'Conectar',
    name: 'Conexión con la MCC (solo lectura)',
    description:
      'Cuenta de servicio de Google Cloud añadida a la MCC con acceso de lectura (lo hace Enric). Su clave JSON se pega en Google Ads → Ajustes y se guarda cifrada; la pantalla solo ve «guardada» y el correo enmascarado. «Probar conexión» lista las cuentas que ve la MCC y enseña el error literal de Google si falla. Con «SIM», modo simulado: 6 cuentas inventadas, sin salir a internet.',
    status: 'built',
    file: 'lib/ads/client.ts',
    when: 'Al guardar la credencial y en cada consulta de la descarga.',
    ai: 'Nada.',
    code: 'JWT RS256 firmado con node:crypto (sin dependencias) → token de 1 h en memoria. Cabeceras login-customer-id (la MCC) y developer-token si está guardado. Único archivo con la dirección de la API (barrera en las pruebas). Cada consulta suma una operación al día del Pacífico; al llegar al tope propio no se pide más hasta el día siguiente. «RESOURCE_EXHAUSTED» (cupo del día) no se reintenta; «RESOURCE_TEMPORARILY_EXHAUSTED», 429 y 5xx sí. No existe ninguna función que cambie una cuenta.',
    tables: ['ads_settings', 'ads_api_usage']
  },
  {
    id: 'ads-descubrir',
    lane: 'Descargar',
    name: 'Cuentas de la MCC y vínculo con la ficha',
    description:
      'Trabajo «ads.descubrir»: lista las cuentas finales bajo la MCC (sin sub-MCC ni cuentas de prueba; las canceladas se guardan sin seguir) y vincula cada una con el cliente cuya ficha tiene esa cuenta en «Webs y cuentas → Google Ads». Si dos fichas reclaman la misma cuenta, no se vincula y se avisa en Ajustes. Da de alta o apaga los procesos de cada cuenta y encola el histórico de las nuevas.',
    status: 'built',
    file: 'lib/ads/sync.ts',
    when: 'Cada 24 h por la cola de trabajos, y al pulsar «Descargar ahora».',
    ai: 'Nada.',
    code: 'El id se normaliza a 10 dígitos al comparar. El vínculo «desde la ficha» se recalcula cada vez; el manual se respeta. Las cuentas simuladas nunca se vinculan a clientes. El nivel A/B/C es del cliente (ads_clients), no de la cuenta.',
    tables: ['ads_accounts', 'ads_clients', 'ads_sync_state', 'client_assets']
  },
  {
    id: 'ads-estructura',
    lane: 'Descargar',
    name: 'Estructura, configuración, políticas y URL',
    description:
      'Trabajo «ads.estructura»: cuenta (estado, moneda, zona, autoetiquetado), campañas con su estrategia y objetivo (también el de las estrategias de cartera), presupuestos (los compartidos una sola vez), programación de anuncios, acciones de conversión, anuncios aprobados y rechazados por grupo, palabras rechazadas y URL de destino con gasto de 7 días (por anuncio y las que elige Google). Cada cambio de configuración queda como versión con fecha.',
    status: 'built',
    file: 'lib/ads/sync.ts',
    when: 'Cada 24 h por cuenta, y en cuanto el historial de cambios ve un cambio de estructura.',
    ai: 'Nada.',
    code: 'Unas 10 operaciones por cuenta. Versiones por huella (si no cambia, no se guarda otra). Las políticas guardan la peor foto del día (un rechazo de 10:00 a 15:00 no se pierde).',
    tables: ['ads_campaigns', 'ads_budgets', 'ads_conversion_actions', 'ads_config_versions', 'ads_ad_group_policy_daily', 'ads_landing_urls']
  },
  {
    id: 'ads-metricas',
    lane: 'Descargar',
    name: 'Métricas, conversiones y cobertura (cero frente a «sin dato»)',
    description:
      'Trabajo «ads.sincronizar»: los últimos 10 días por campaña (Google corrige días recientes) y por acción de conversión (por fecha de clic y por fecha de conversión), una consulta de control con el total de la cuenta y la foto de estado del día. Un día queda «completo» solo si ya cerró en la zona de la cuenta (más 3 h) y el total de la cuenta cuadra con la suma de campañas: solo entonces una campaña sin fila cuenta como 0.',
    status: 'built',
    file: 'lib/ads/sync.ts',
    when: 'Cada 6 h por cuenta y a las 06:30 de Madrid (tarea del planificador «google ads»).',
    ai: 'Nada.',
    code: '4 operaciones por cuenta. Las campañas eliminadas que salen en las métricas se dan de alta (el histórico no pierde nada). Las acciones de la MCC se guardan por su nombre de recurso. La foto de estado guarda la peor del día.',
    tables: ['ads_daily_campaign', 'ads_daily_conversion', 'ads_daily_coverage', 'ads_campaign_status_daily']
  },
  {
    id: 'ads-historico',
    lane: 'Descargar',
    name: 'Histórico (hasta 37 meses)',
    description: 'Trabajo «ads.historico»: las mismas tres consultas hacia atrás por tramos de 90 días hasta el límite de meses de Ajustes. La línea base existe desde el primer día.',
    status: 'built',
    file: 'lib/ads/sync.ts',
    when: 'Una vez por cuenta nueva; cada trabajo baja tramos durante 4 minutos y deja encolada la continuación.',
    ai: 'Nada.',
    code: 'No se para en un tramo vacío (un cliente de temporada puede tener meses parados). El cursor va en ads_sync_state.',
    tables: ['ads_daily_campaign', 'ads_daily_conversion', 'ads_daily_coverage', 'ads_sync_state']
  },
  {
    id: 'ads-cambios',
    lane: 'Descargar',
    name: 'Historial de cambios con su autor',
    description:
      'Trabajo «ads.cambios»: el historial de cambios de Google Ads (guarda solo 30 días, por eso se copia) con quién lo hizo, clasificado en agencia, cliente, Google o herramienta según los dominios y correos de la agencia de Ajustes.',
    status: 'built',
    file: 'lib/ads/sync.ts',
    when: 'Cada 6 h por cuenta.',
    ai: 'Nada.',
    code: 'Desde el cursor menos 1 día de solape, ordenado y con LIMIT 10.000 (si llega al límite, sigue desde la última hora). La hora llega en la zona de la cuenta sin desfase: se convierte y se guarda también el texto original. Clave única por evento. Si la fuente se atrasa más de 7 días, Salud lo marca crítico.',
    tables: ['ads_change_events']
  },
  {
    id: 'ads-latido',
    lane: 'Descargar',
    name: 'Latido horario',
    description: 'Trabajo «ads.latido»: impresiones, clics y gasto de hoy por hora y campaña. Es lo que permitirá avisar de una campaña parada o desbocada en horas y no al día siguiente (paso 2).',
    status: 'built',
    file: 'lib/ads/sync.ts',
    when: 'Cada hora por cuenta, de 07:00 a 23:00 de la zona de la cuenta.',
    ai: 'Nada.',
    code: '1 operación por cuenta y hora. Se guardan 60 días.',
    tables: ['ads_hourly_campaign']
  },
  {
    id: 'ads-salud',
    lane: 'Vigilar',
    name: 'Salud de nuestras fuentes (MED-00)',
    description:
      'Saber cuándo el vigilante está ciego. Cada fuente de cada cuenta tiene su frescura esperada; la cabecera de Google Ads dice «comprobadas X de Y cuentas» y en Salud del sistema sale lo caído, el cupo, la edad de la clave y la retirada de la versión de la API.',
    status: 'built',
    file: 'lib/ads/health.ts',
    when: 'Al abrir Google Ads y en cada revisión de Salud del sistema.',
    ai: 'Nada.',
    code: 'Sana si el último dato bueno tiene menos del doble de su frescura (latido 1 h en horario de servicio, métricas y cambios 6 h, estructura 24 h); caída con 3 fallos seguidos. Las reglas del paso 2 preguntan aquí antes de afirmar y, si no está sana o falta un día de su ventana, dicen «no comprobado». Tres fallos seguidos van al registro central de errores.',
    tables: ['ads_sync_state', 'ads_daily_coverage', 'ads_api_usage']
  },
  {
    id: 'ads-pantallas',
    lane: 'Ver',
    name: 'Pantallas: Google Ads y Ajustes',
    description: 'Google Ads (Clientes → Google Ads): la cobertura real, el estado de cada fuente por cuenta y los últimos cambios con su autor. Ajustes (solo admin): conexión, descarga y cuentas con su cliente y su nivel.',
    status: 'built',
    file: 'app/(dashboard)/dashboard/ads/page.tsx',
    when: 'Al abrirlas.',
    ai: 'Nada.',
    code: 'Sin llamadas a Google para pintarse (todo sale de lo guardado), salvo «Probar conexión» (1 operación). Permisos: ver con «view»; todo lo de Ajustes con «admin».',
    tables: ['ads_accounts', 'ads_settings', 'ads_change_events']
  },
  {
    id: 'ads-paso2',
    lane: 'Paso 2 (diseñado)',
    name: 'Hallazgos, Cartera y avisos',
    description:
      'Tablas ya creadas y vacías: objetivos por cliente (provisional congelado o acordado), hallazgos de la lista cerrada de 15 con su episodio y su canal, respuestas del gestor, resultado de cada regla (para la cabecera «no comprobado») y revisiones de cuenta. Las reglas (cuenta que no sirve, rechazo con gasto, landing caída, campaña parada o desbocada, ritmo, medición rota con binomial negativa, cambio ajeno, pausado que aportaba) llegan con la pantalla Cartera, en modo sombra.',
    status: 'planned',
    file: 'docs/ads/DISENO-TECNICO-ADS.md',
    when: 'Paso 2.',
    ai: 'Nada en las reglas (son cálculos).',
    code: 'Ver diseño §6: precedencia de causas, ciclo de vida que no resuelve con «no comprobado», avisos solo a Enric (notifyOwner) hasta que exista notifyMember en el núcleo.',
    tables: ['ads_goals', 'ads_findings', 'ads_finding_responses', 'ads_rule_runs', 'ads_account_reviews']
  }
];
