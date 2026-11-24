// Mapa Visual del módulo Rendimiento (nivel 3): cómo se guarda cada día el rendimiento de Google de cada cliente y
// dónde se usa. Se registra en lib/architecture-map/registry.ts (detailMapId «rendimiento»).
import type { ProcessStep } from '@/lib/ai/clustering/pipeline';

export const RENDIMIENTO_PROCESS_MAP: ProcessStep[] = [
  {
    id: 'perf-fuentes',
    lane: 'Guardar',
    name: 'Qué propiedades se descargan',
    description: 'La cuenta principal de Search Console, Analytics 4 y Business Profile de cada cliente que no está de baja, tal como está en su ficha (Webs y cuentas). Una propiedad nueva entra como «pendiente»; la que deja de ser la principal pasa a «inactiva» y su histórico se queda.',
    status: 'built',
    file: 'lib/rendimiento/sync.ts',
    when: 'Cada 10 minutos (y al pulsar «Sincronizar ahora» en la pestaña).',
    ai: 'Nada.',
    code: 'El módulo no habla con Google: usa las fuentes de métricas registradas en el núcleo (registerMetricSource). Agentes registra la de Google (lib/agentes/metrics.ts) con su token. Las cuentas «No hace falta» no se descargan. Si Google se desconecta, no se toca nada.',
    tables: ['perf_sync', 'client_assets']
  },
  {
    id: 'perf-descarga',
    lane: 'Guardar',
    name: 'Histórico y actualización diaria',
    description: 'Primero lo más reciente; después, el histórico hacia atrás por tramos (Search Console: 16 meses; Analytics: desde que existe la propiedad; Business Profile: hasta donde Google deje). Cada día desde las 7:00 vuelve a pedir los últimos 10 días, porque Google corrige días recientes. Analytics: además, sesiones y eventos clave por canal y, desde el 24 nov 2026, las que llegan desde asistentes de IA (ChatGPT, Perplexity, Gemini, Copilot, Claude…; lista en lib/core/ai-assistants.ts, filtrada en Analytics). Search Console: además, las 1.000 consultas y las 1.000 páginas con más clics de cada mes cerrado.',
    status: 'built',
    file: 'lib/rendimiento/sync.ts',
    when: 'Planificador cada 30 s (tarea «rendimiento de clientes» registrada en el núcleo), con un tope de 8 s por vuelta: el trabajo se reparte.',
    ai: 'Nada. Coste de IA: cero.',
    code: 'Se guarda encima de lo que haya (clave única por cliente, fuente, propiedad, día, métrica y desglose). Si hay un hueco (Google caído), se rellena solo. Un error espera y reintenta (10 min, 20, 40… hasta 12 h). Un tramo antiguo que Google rechaza marca el límite real de su histórico. Business Profile: un día sin valor cuenta como 0 (lo dice Google) y se pide con 3 días de retraso para no guardar ceros falsos.',
    tables: ['perf_daily', 'perf_gsc_monthly', 'perf_sync'],
    runs: ['runScheduled']
  },
  {
    id: 'perf-ficha',
    lane: 'Ver y medir',
    name: 'Pestaña «Rendimiento» de la ficha',
    description: 'Cifras con su variación (frente al periodo anterior, al año pasado o a antes del inicio del servicio), gráficas por semana con los hitos marcados, sesiones por canal, visitas desde asistentes de IA (también como cifra «Sesiones desde asistentes de IA», que ve el estratega y admite objetivos), clics por dispositivo, consultas y páginas que suben y bajan, hitos de la estrategia con su antes y después, informe del mes para copiar (si al mes aún le faltan días de datos, se compara con los mismos días del mes anterior y del año pasado) y estado de la descarga.',
    status: 'built',
    file: 'lib/rendimiento/report.ts',
    when: 'Al abrir la pestaña (Clientes → ficha → Rendimiento).',
    ai: 'Nada: todo sale de lo guardado.',
    code: 'Cada fuente acaba en su último día con datos. La posición media se pondera por impresiones. «Usuarios» es la suma de cada día (se avisa). Antes y después de un hito: media diaria de las 4 semanas de antes y de después. El hito «Inicio del servicio» sale solo de la fecha de inicio de la ficha.',
    tables: ['perf_daily', 'perf_gsc_monthly', 'perf_annotations']
  },
  {
    id: 'perf-panel',
    lane: 'Ver y medir',
    name: 'Panel central de todos los clientes',
    description: 'Clics desde Google, sesiones, conversiones, vistas y llamadas de la ficha de Google de cada cliente: últimos 28 días frente a los 28 anteriores, ordenable para ver quién cae y quién sube. Con los ajustes de avisos e informes (solo admin).',
    status: 'built',
    file: 'app/(dashboard)/dashboard/rendimiento/page.tsx',
    when: 'Al abrir Rendimiento en el menú.',
    ai: 'Nada.',
    code: 'Una sola consulta de los datos de todos los clientes (totales y canal orgánico).',
    tables: ['perf_daily', 'perf_sync', 'perf_settings']
  },
  {
    id: 'perf-avisos',
    lane: 'Avisar',
    name: 'Avisos, informe semanal y resumen mensual',
    description: 'Cada día desde las 9:00 (cuando ha terminado la descarga), avisa por Telegram de caídas y subidas fuertes por cliente. Añade un apartado al informe semanal de Operaciones. El día 5 de cada mes manda el resumen del mes anterior de todos los clientes.',
    status: 'built',
    file: 'lib/rendimiento/report.ts',
    when: 'Planificador (mira cada 10 minutos si toca); el apartado semanal, cuando Operaciones prepara su informe.',
    ai: 'Nada.',
    code: 'Últimos 7 días frente a la media de las 4 semanas anteriores; umbral y volumen mínimo en el panel (por defecto 30 % y 20 por semana); como mucho un aviso por cifra y cliente a la semana; una fuente sin datos al día no cuenta como caída (eso sale en Salud). El aviso va por la cola de avisos (notifyOwner del núcleo) con clave única. El apartado semanal llega a Operaciones por el registro del núcleo (registerReportSection).',
    tables: ['perf_settings', 'perf_daily']
  },
  {
    id: 'perf-agente',
    lane: 'Agentes',
    name: 'Herramientas del agente',
    description: 'rendimiento_cliente: cómo va un cliente con todo el histórico guardado (cifras, canales, hitos con su efecto, consultas que suben y bajan) o el informe del mes pasado. anotar_hito: el agente propone un hito («hoy se ha publicado la web nueva») con ✅ / ✖️.',
    status: 'built',
    file: 'lib/rendimiento/register.ts',
    when: 'Cuando el agente lo necesita (Telegram o correo).',
    ai: 'El agente interpreta los datos; la herramienta no usa IA.',
    code: 'anotar_hito pasa por el motor de propuestas de Operaciones a través del núcleo (proposeChange / registerChangeExecutor), con la autonomía por herramienta de siempre.',
    tables: ['perf_annotations']
  },
  {
    id: 'perf-salud',
    lane: 'Avisar',
    name: 'Comprobación en Salud',
    description: 'Salud del sistema muestra «Rendimiento de clientes» en aviso si alguna propiedad falla 3 veces seguidas o lleva más de 10 días sin datos nuevos.',
    status: 'built',
    file: 'lib/rendimiento/register.ts',
    when: 'Cada 5 minutos con el resto de comprobaciones de Salud.',
    ai: 'Nada.',
    code: 'Llega a Salud por el registro del núcleo (registerHealthCheck); Salud abre la incidencia y avisa como con cualquier otra.',
    tables: ['perf_sync']
  }
];
