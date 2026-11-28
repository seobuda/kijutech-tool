// Mapa Visual del módulo Google Ads (nivel 3): cómo se conecta con la MCC, qué se descarga, cada cuánto, dónde se guarda y
// cómo sabe la herramienta si está ciega (MED-00). Se registra en lib/architecture-map/registry.ts (detailMapId «ads»).
// Diseño: docs/ads/DISENO-TECNICO-ADS.md v3 (paso 3 en §13). Todo es lectura de Google Ads.
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
    code: 'Sana si el último dato bueno tiene menos del doble de su frescura (latido y páginas 1 h en horario de servicio, métricas y cambios 6 h, estructura 24 h); caída con 3 fallos seguidos. Las reglas del paso 2 preguntan aquí antes de afirmar y, si no está sana o falta un día de su ventana, dicen «no comprobado». Los fallos de Google ya no van al registro de errores: los avisa el hallazgo 15 (los errores internos, sí).',
    tables: ['ads_sync_state', 'ads_daily_coverage', 'ads_api_usage']
  },
  {
    id: 'ads-landing',
    lane: 'Vigilar',
    name: 'Páginas de destino con gasto',
    description:
      'Trabajo «ads.landing»: pide cada URL de destino con gasto en 7 días (las 20 que más gastan) con el rastreador seguro del núcleo, como un visitante. Caída = DNS, TLS, conexión, 404, 410 o 5xx; 403/429 = «no comprobable» (cortafuegos ante un bot). Las cuentas simuladas nunca salen a internet.',
    status: 'built',
    file: 'lib/ads/landing.ts',
    when: 'Cada hora por cuenta, de 07:00 a 23:00 de la zona de la cuenta; al terminar encola la evaluación.',
    ai: 'Nada.',
    code: 'Un fallo suelto no avisa: hacen falta dos seguidos con al menos 10 minutos entre ellos (un fallo a menos de 10 min del anterior no suma). Solo lectura (GET, sin seguir redirecciones, solo direcciones públicas).',
    tables: ['ads_landing_urls', 'ads_sync_state']
  },
  {
    id: 'ads-reglas',
    lane: 'Vigilar',
    name: 'Reglas de los hallazgos (lista cerrada)',
    description:
      'Cálculos puros, uno por hallazgo de la lista cerrada: «cuenta_no_sirve» (1: estado o 0 impresiones en 3 horas de servicio), «rechazo_con_gasto» (2: grupo sin anuncio aprobado o palabras rechazadas en campaña con gasto de 14 días), «landing_caida» (3), «campana_parada_desbocada» (4: parada por horas o ayer −70 %, desbocada frente a lo típico y a su presupuesto), «pausado_aportaba» (6: pausada que daba > 10 % de los leads, con quién la pausó), «ritmo_gasto» (8: proyección del mes ±10 % y presupuesto agotado antes de las 14:00), «cambio_ajeno» (11: del cliente o de Google en algo con gasto), «medicion_rota» (12: binomial negativa por acción primaria) y «fuente_sin_datos» (15: MED-00).',
    status: 'built',
    file: 'lib/ads/finding-rules.ts',
    when: 'Dentro de cada evaluación.',
    ai: 'Nada (son cálculos).',
    code: 'Cada regla declara fuentes y ventana de días: si una fuente no está sana o falta un día completo, dice «no comprobado» y no afirma nada. Un día cubierto sin fila es 0; uno sin cubrir, «sin dato». Nunca acusa fuera de la programación de anuncios. Medición: μ = clics × tasa de las 8 semanas previas por fecha de conversión, P(0) = (k/(k+μ))^k con k estimada de la cuenta, α = 0,1 %, solo con ≥ 30 conversiones y clics en su banda; si no, «sin datos para afirmar». Ritmo sin acuerdo: solo avisa de pasarse (la suma de presupuestos es un techo). Umbrales editables en Ajustes.',
    tables: ['ads_settings']
  },
  {
    id: 'ads-evaluar',
    lane: 'Vigilar',
    name: 'Evaluación y ciclo de vida de los hallazgos',
    description:
      'Trabajo «ads.evaluar» por cuenta: foto de lo descargado, salud de sus fuentes y reglas. Las horarias (1, 2, 3, 4 y 15) en cada evaluación; las diarias (6, 8, 11 y 12) solo cuando sus fuentes traen datos nuevos (métricas o cambios: cada 6 h y a las 06:30), al cambiar de día o si la última vez no se pudieron comprobar. Guarda el resultado de cada regla (la cabecera de Hoy cuenta los «no comprobado») y los hallazgos.',
    status: 'built',
    file: 'lib/ads/findings.ts',
    when: 'Al terminar cada descarga de métricas, latido o páginas (encolada, una abierta por cuenta); «Evaluar ahora» en Ajustes. La MCC entera (hallazgo 15 de agencia), cada hora desde el planificador «google ads».',
    ai: 'Nada.',
    code: 'Una causa = un hallazgo vivo (índice único); cada aparición nueva es un episodio. Precedencia 15 > 1 > 4 > 3 > 2 > 12 > 8/6/11: lo inferior sobre la misma cuenta o campaña queda como evidencia del superior. Solo se resuelve si la regla se evaluó con fuentes sanas y ya no lo ve; con «no comprobado» queda «sin comprobar desde…». Un descarte vigente no reabre la causa; un silencio vencido vuelve como «vencido». Las cuentas simuladas se evalúan (para Hoy) pero nunca avisan.',
    tables: ['ads_findings', 'ads_rule_runs', 'ads_goals']
  },
  {
    id: 'ads-avisos',
    lane: 'Avisar',
    name: 'Avisos (modo sombra por defecto)',
    description:
      'Tarea del planificador «ads avisos»: con los avisos apagados (modo sombra, por defecto) no envía nada. Encendidos en Ajustes, manda las interrupciones abiertas no avisadas por la cola de avisos del núcleo (al dueño), solo en horario laboral, con un tope de interrupciones al día (las demás, juntas en un mensaje), y un parte de la mañana con 5 decisiones + 3 «para que lo sepas» y «N más por debajo del corte».',
    status: 'built',
    file: 'lib/ads/alerts.ts',
    when: 'Cada 30 s (solo el proceso líder); solo actúa en el horario y los días de Ajustes (hora de Madrid).',
    ai: 'Nada.',
    code: 'Solo telegramOutbound().notifyOwner (nunca Telegram directo); clave con el episodio (ads:<tipo>:<causa>:<inicio>), estado «encolado». «Nuestra fuente sin datos» con el bot de Sistema y fuera del tope del gestor. Nunca en modo simulado. Un hallazgo abierto no se reenvía. Pendiente: avisar a Eury necesita notifyMember en el núcleo (decisión de Enric) y descontar los festivos de la agencia.',
    tables: ['ads_findings', 'ads_settings']
  },
  {
    id: 'ads-decisiones',
    lane: 'Decidir',
    name: 'Respuestas, revisiones y objetivo provisional',
    description:
      'Las ocho respuestas del gestor a un hallazgo (hecho, lo hago yo, esperando al cliente con fecha, el cliente lo quiere así con motivo, ya lo sabía, no es un problema con motivo, posponer 1/7/28 días como mucho 2 veces, encargar), «Marcar revisada» con nota de una línea (próxima según el nivel: A 7, B 14, C 30 días) y «Fijar objetivo provisional» (coste / conversiones primarias de los 90 días previos sin los 7 últimos; mínimo 15; congelado; nunca en nivel A).',
    status: 'built',
    file: 'lib/ads/decisions.ts',
    when: 'Al pulsar los botones de Hoy y del expediente de la cuenta.',
    ai: 'Nada.',
    code: 'Las respuestas ajustan presentación y silencios, nunca la detección ni los umbrales (investigación 7.4). «Encargar» crea el encargo por la fuente de trabajo del núcleo si la cuenta tiene cliente. Permisos: responder, revisar y fijar objetivo con «edit»; avisos, umbrales y «Evaluar ahora» con «admin». Nada escribe en Google Ads.',
    tables: ['ads_finding_responses', 'ads_account_reviews', 'ads_goals', 'ads_clients']
  },
  {
    id: 'ads-auditoria-datos',
    lane: 'Descargar',
    name: 'Datos de la auditoría de higiene (consultas aisladas)',
    description:
      'Trabajo «ads.auditar» (paso 3), primera parte: pide aparte lo que necesitan los controles de higiene, en grupos con su propio error: configuración de red, zona y DSA de cada campaña, AI Max y automatización de recursos, fechas de migración de Google, tipos de grupo y de anuncio, suscripciones de recomendaciones, exclusiones de la cuenta, recursos de llamada (diarios); reparto por redes, ubicación del usuario, zonas segmentadas con sus nombres, términos de búsqueda (los 1.000 de más gasto) y recomendaciones con el nivel de optimización (semanales). Si un campo no existe en la v26, solo sus controles quedan «sin comprobar» con el error literal de Google; la estructura diaria y las interrupciones no se tocan.',
    status: 'built',
    file: 'lib/ads/audit-queries.ts',
    when: 'Cada 24 h por cuenta (cada grupo cuando le toca por edad: 1 o 7 días), al terminar el histórico de una cuenta nueva y con «Pasar la auditoría ahora».',
    ai: 'Nada.',
    code: 'Unas 14 operaciones la primera vez y ~7 al día después (≈ 200 al día con 25 cuentas). El cupo agotado para sin contarlo como fallo. Solo lectura (consultas GAQL). Campos marcados «no verificados» en el diseño §13.9. En simulado, un caso de cada control y una ficha simulada por cuenta.',
    tables: ['ads_audit_data']
  },
  {
    id: 'ads-auditoria',
    lane: 'Vigilar',
    name: 'Auditoría de higiene de entrada y vigilancia (EST-07, EST-06)',
    description:
      'Trabajo «ads.auditar», segunda parte: 18 controles puros por tandas (0 propiedad, accesos y línea base congelada de 90 días; 1 conversiones, lo que caduca en febrero de 2027, AI Max y textos automáticos; 2 socios de búsqueda, Display en Búsqueda, «presencia o interés», exclusiones de contenido, zona real, lugares fuera de zona en los términos, marca y competencia, redes de PMax y páginas elegidas por Google; 3 recomendaciones que se aplican solas, recomendaciones cribadas y recurso de llamada), cada uno bien / mal / no comprobado con su evidencia, qué hacer a mano y el gasto expuesto. La primera vez crea la auditoría de entrada con su fecha; después, vigilancia diaria: mal → bien = corregido, bien → mal = reapareció, con el cambio del cliente o de Google que lo explica (va como evidencia del hallazgo 11 «cambio_ajeno»). No crea hallazgos visibles: la lista cerrada de 15 no crece.',
    status: 'built',
    file: 'lib/ads/audit.ts',
    when: 'Con los datos de la auditoría (arriba). «Repetir la auditoría» crea otra y deja la anterior como sustituida.',
    ai: 'Nada (son reglas y una prueba de Poisson para el CPL antes y después de AI Max).',
    code: 'Reglas en lib/ads/audit-rules.ts con umbrales editables en Ajustes (socios avalados con 3 conversiones y CPL ≤ 1,2 ×; fuera de zona 10 %; marca 10 %; PMax un tercio; páginas 20 %; AI Max 1,3 ×; frescura de la ficha 6 meses). Un «mal» que depende de un dato de la ficha sin confirmar o viejo (NEG-07) queda «confirmar con el responsable» y no entra en los 3 del guion. Las R2/R3 en «mal» llevan predicción previa (hipótesis, métrica, efecto esperado con intervalo, 28 días y vuelta atrás; APR-01), que se aprueba al responder «hecho». «No comprobado» no corrige ni acusa. Lista de lugares provisional (lib/ads/places-es.ts).',
    tables: ['ads_audits', 'ads_audit_items', 'ads_audit_data', 'ads_client_facts', 'clients', 'client_locations', 'client_competitors']
  },
  {
    id: 'ads-auditoria-revision',
    lane: 'Decidir',
    name: 'Paso 4 del guion: «¿dónde se va el dinero sin resultado?»',
    description:
      'En la cuenta, los 3 primeros controles en «mal» (primero lo que reapareció, luego por tanda y gasto) con su evidencia, qué hacer y la predicción; la auditoría completa por tandas (también lo que está bien y lo no comprobado); los datos de la ficha que usa con su fecha y «Confirmar»; «Marcar auditoría leída», «Repetir» y «Copiar informe» (INF-05, por tandas con el gasto expuesto; no se envía a nadie). Respuestas: hecho, el cliente lo quiere así y no aplica (con motivo: no-acción registrada) y más tarde. En Cartera, columna «Auditoría»: pendiente (sin auditar o por leer) / hecha, y «reapareció».',
    status: 'built',
    file: 'lib/ads/audit-views.ts',
    when: 'Al abrir la cuenta y al pulsar los botones.',
    ai: 'Nada.',
    code: 'Permiso «edit» para responder, confirmar, marcar leída y pasar la auditoría; «view» para verla. Nada escribe en Google Ads: «qué hacer» es texto para aplicarlo a mano. Las cuentas simuladas tienen ficha simulada (no se confirma).',
    tables: ['ads_audits', 'ads_audit_items', 'ads_client_facts']
  },
  {
    id: 'ads-pantallas',
    lane: 'Ver',
    name: 'Pantallas: Hoy, Cartera, Cuenta y Ajustes',
    description:
      'Hoy (Clientes → Google Ads): cobertura real, modo sombra, bandejas urgente / vencido / por decidir (5 + 3 y «N más por debajo del corte») / esperando a terceros / en seguimiento, con evidencia, días abierto y respuestas; descarga por cuenta y últimos cambios. Cartera: una fila por cuenta (cliente y nivel, gasto y ritmo, CPL 30 días frente a objetivo o línea base, conversiones 7 días, medición, hallazgos, último cambio, revisiones), gris lo no comprobado, ordenable. Cuenta: expediente mínimo. Ajustes (admin): conexión, descarga, cuentas, avisos y umbrales. Los hallazgos urgentes y vencidos de cuentas reales salen también en «Para ti».',
    status: 'built',
    file: 'lib/ads/views.ts',
    when: 'Al abrirlas.',
    ai: 'Nada.',
    code: 'Sin llamadas a Google para pintarse (todo sale de lo guardado), salvo «Probar conexión» (1 operación). Las cifras en la moneda de cada cuenta, sin sumar monedas. Permisos: ver con «view».',
    tables: ['ads_accounts', 'ads_settings', 'ads_change_events', 'ads_findings', 'ads_rule_runs', 'ads_account_reviews']
  }
];
