// Mapa Visual del registro central de errores (NÚCLEO, 17 nov 2026; nivel 3). Se registra en
// lib/architecture-map/registry.ts (detailMapId «errores»).
import type { ProcessStep } from '@/lib/ai/clustering/pipeline';

export const ERRORES_PROCESS_MAP: ProcessStep[] = [
  {
    id: 'err-captura',
    lane: 'Recoger',
    name: 'Captura de errores',
    description:
      'Todo lo que falla en la herramienta llega al registro: lo que el servidor escribe con console.error y console.warn (cubre todo el código existente), las promesas rechazadas sin capturar, los errores de las peticiones de Next (páginas, acciones, rutas de API), los fallos de la IA, las herramientas de los agentes que fallan o dicen «no he podido», la transcripción de audios y los errores del navegador.',
    status: 'built',
    file: 'lib/core/errors.ts',
    when: 'En el momento en que pasa: captureConsole() se engancha al arrancar (instrumentation.ts), onRequestError en cada petición que falla, reportError() en la IA (gateway), en el motor de agentes y en la voz, y POST /api/errores desde el navegador (components/error-reporter.tsx y la página de error).',
    ai: 'Nada aquí.',
    code: 'Quita secretos (claves, tokens, contraseñas en URLs) antes de guardar. Agrupa por huella: módulo + zona + mensaje sin lo que cambia (ids, números, URLs, correos). Escribe en lotes cada 3 s (una tormenta de errores no satura la base) y guarda como mucho 10 muestras por error y hora; las repeticiones solo suman. Nunca lanza: registrar un error no rompe nada. El navegador manda como mucho 30 por persona cada 10 min. Cuenta (22 nov 2026): un fallo dentro de una petición web se anota en la cuenta de quien tiene la sesión (la cookie de la petición; para console.error, el almacén de peticiones de Next, leído sin esperar); la cuenta dueña de la plataforma sigue como «sistema», igual que antes. Así una pantalla rota en la cuenta de pruebas no avisa a Enric. La línea «⨯» que Next escribe en la consola por cada fallo de petición ya no se anota aparte (llega con su ruta por onRequestError): antes cada pantalla rota salía dos veces.',
    tables: ['sys_error_groups', 'sys_error_events']
  },
  {
    id: 'err-avisos',
    lane: 'Recoger',
    name: 'Avisos por Telegram',
    description: 'Un error nuevo, o uno resuelto que vuelve a pasar, avisa al dueño por Telegram con el mensaje, el módulo, lo que vio la persona y botones «🔎 Diagnosticar» e «🙈 Ignorar».',
    status: 'built',
    file: 'lib/core/errors.ts',
    when: 'Al guardar el lote en el que aparece por primera vez (o se reabre).',
    ai: 'Nada aquí.',
    code: 'Solo si los avisos están activos y la gravedad llega a la mínima de los ajustes (por defecto «error»). Como mucho 6 avisos por hora y cuenta; el resto se ve en Errores. Pasa por la cola de avisos de Operaciones (notifyOwner, clave única) y, desde el 20 nov 2026, por el chat de Sistema (bot «sistema»; si no está listo, el principal); solo suena lo crítico. Los errores del sistema sin cuenta avisan a la cuenta dueña de la plataforma; lo que se escribe en la consola durante una prueba simulada se anota en la cuenta de pruebas (registerConsoleTenantResolver), no en la real.',
    tables: ['sys_error_groups', 'sys_error_settings']
  },
  {
    id: 'err-pantalla',
    lane: 'Gestionar',
    name: 'Pantalla Errores',
    description: 'Lista agrupada con filtros (estado, módulo, gravedad, texto), cifras de las últimas 24 h y el detalle de cada error: veces, primera y última, muestras con traza y contexto, nota, diagnóstico y acciones (diagnosticar, investigando, resuelto, ignorar, reabrir, copiar para arreglarlo).',
    status: 'built',
    file: 'app/(dashboard)/dashboard/errores/page.tsx',
    when: 'Al abrir Administración → Errores (solo administración) o el enlace de un aviso.',
    ai: 'Nada aquí.',
    code: 'Permiso admin en la página y en cada acción. Una cuenta ve sus errores; la cuenta dueña de la plataforma ve además los del sistema. Resuelto = se reabre solo si vuelve a pasar (y avisa). «Copiar para arreglarlo» prepara un texto con el mensaje, la traza, el contexto y el diagnóstico para pegarlo a Claude Code.',
    tables: ['sys_error_groups', 'sys_error_events', 'sys_error_settings']
  },
  {
    id: 'err-tecnico',
    lane: 'Arreglar',
    name: 'Técnico de mantenimiento (diagnóstico)',
    description:
      'Subagente del módulo Agentes que diagnostica errores como un programador de guardia: lee el error, busca en el código del servidor dónde nace, sigue las llamadas hasta la causa y guarda la causa, la evidencia (archivo:línea), el arreglo propuesto, los archivos, el riesgo y su confianza. El informe llega por Telegram.',
    status: 'built',
    file: 'lib/core/errors.ts',
    when: 'Al pulsar «Diagnosticar» (pantalla o Telegram), al pedírselo al agente principal, o solo: el planificador encarga los errores nuevos de gravedad «error» o más (como mucho N al día, por defecto 2).',
    ai: 'Claude Sonnet 5.5 con herramientas de solo lectura: errores_lista, error_detalle, codigo_buscar, codigo_leer, ia_llamada y guardar_diagnostico. Presupuesto propio del mes (Agentes, 10 $).',
    code: 'El núcleo encarga el trabajo por una capacidad (setAgentJobCreator) sin importar el módulo Agentes; el trabajo va a la cola de subagentes (en segundo plano, sin bloquear el planificador). Las herramientas de código solo leen app, lib, components, scripts, tests, modules y docs; nunca .env, node_modules ni copias. No cambia nada: el arreglo lo aplica quien programa con la aprobación de Enric.',
    tables: ['sys_error_groups']
  },
  {
    id: 'err-limpieza',
    lane: 'Arreglar',
    name: 'Limpieza',
    description: 'Borra las muestras antiguas y los errores cerrados sin actividad, para que el registro no crezca sin límite.',
    status: 'built',
    file: 'lib/core/errors.ts',
    when: 'Tarea del planificador «registro de errores», como mucho una vez por hora y cuenta.',
    ai: 'Nada aquí.',
    code: 'Muestras con más de N días (ajuste, 60 por defecto) y más de 50 por error; errores resueltos o ignorados sin actividad en N días.',
    tables: ['sys_error_events', 'sys_error_groups', 'sys_error_settings']
  }
];
