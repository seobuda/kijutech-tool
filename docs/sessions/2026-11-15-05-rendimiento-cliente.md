# Rendimiento del cliente: histórico diario de Google, panel, hitos, avisos e informes (pasos B1, B2 y B3)
**Fecha:** 2026-11-15  
**Rama:** feature/rendimiento-cliente (sale de `feature/cliente-propiedades-google`, así que incluye el paso A)  
**Commit:** eb176215 (código en `dbeb637a` y arreglos de la revisión en `eb176215`)

## Qué se construyó
Enric aprobó el diseño (`docs/DISENO-RENDIMIENTO-CLIENTE.md`) y pidió terminar B1, B2 y B3, hacer una revisión completa con mejoras y mandarle un informe por correo. Trabajo hecho de noche, desde el móvil con Remote Control.

**Base de datos (migración 0049)**
- `lib/db/migrations/0049_perf_rendimiento.sql` y `lib/db/schema.ts`: `perf_daily`, `perf_gsc_monthly`, `perf_sync`, `perf_annotations` y `perf_settings`.

**Núcleo (`lib/core/`)**
- `capabilities.ts`: registros nuevos:
  - `registerMetricSource` / `metricSources`: fuentes de métricas;
  - `registerReportSection` / `weeklyReportSections`: apartados del informe semanal;
  - `registerHealthCheck` / `moduleHealthChecks`: comprobaciones de Salud;
  - `registerChangeExecutor` / `setChangeProposer` / `proposeChange`: herramientas de cambio de otros módulos por el motor de propuestas de Operaciones.
- `clients.ts`: `listPrimaryAssets`, la cuenta principal de cada tipo de todos los clientes que no están de baja, en una sola consulta.

**Agentes**
- `lib/agentes/metrics.ts` (nuevo): fuente de métricas de Google.
  - Search Console: por día y por dispositivo; top 1.000 consultas y páginas por mes.
  - GA4: métricas diarias y por canal, con `keyEvents`.
  - Business Profile: 9 métricas diarias; un valor ausente cuenta como 0.
  - Conversores puros y `normalizeGoogleProperty`.
- `integrations.ts`: `gapiFetch`.
- `register.ts`: registra la fuente.
- `store.ts`: actualización única `2026-11-15-rendimiento`, que añade `rendimiento_cliente` y `anotar_hito` al Operations manager.

**Módulo Rendimiento (`lib/rendimiento/`, nuevo)**
- `rules.ts`, reglas puras:
  - fechas;
  - las 15 cifras (posición ponderada por impresiones, CTR y tasa de interacción calculados);
  - periodos y comparaciones (anterior, año pasado con los mismos días de la semana, antes del servicio);
  - tramos de las gráficas;
  - consultas que suben, bajan y nuevas;
  - antes y después de un hito;
  - detección de caídas y subidas.
- `store.ts`: escritura encima (upsert) por tandas, consultas del mes, carga de datos, desgloses, estado de la descarga, hitos y ajustes.
- `sync.ts`: descubrir propiedades; primer tramo, actualización diaria de los últimos 10 días desde las 7:00, histórico por tramos y meses de consultas, con tope de tiempo y espera creciente ante errores.
- `report.ts`:
  - `clientPerformance` (pestaña) y `performanceText` (agente);
  - `tenantOverview` (panel);
  - `weeklyLines` (informe semanal);
  - `monthlyClientText` (informe del mes);
  - `runPerformanceAlerts` y `runMonthlySummary` (avisos y resumen mensual por Telegram).
- `register.ts`: tarea del planificador, herramientas `rendimiento_cliente` y `anotar_hito`, apartado semanal y comprobación de Salud.
- `actions.ts`: acciones con guards; ver con `edit`, ajustes con `admin`.
- `process-map.ts`: mapa «Rendimiento», 7 pasos.

**Pantallas**
- `app/(dashboard)/dashboard/rendimiento/`: `page.tsx` + `panel-view.tsx` (panel central y ajustes), `cliente-rendimiento.tsx` (pestaña de la ficha) y `perf-chart.tsx` (gráfica SVG propia con comparación, hitos, detalle y tabla).
- `clientes/[id]/ficha-view.tsx`: pestaña «Rendimiento».
- `components/app-shell/nav.ts`: «Rendimiento» en el menú, dentro de Trabajo.

**Operaciones (solo para enchufarse al núcleo)**
- `agent-capabilities.ts`: registra su motor de propuestas en el núcleo y ejecuta cambios de otros módulos.
- `health.ts`: añade las comprobaciones de los módulos.
- `reports.ts`: añade los apartados de los módulos al informe semanal.

**Mapa y pruebas**
- `lib/architecture-map/registry.ts`: nodo «Rendimiento de clientes» con su mapa.
- `scripts/check-architecture-map.js`: exige las tablas `perf_*` en el mapa y la tarea registrada. Pasa.
- `tests/rendimiento.test.ts` (nuevo, 17 pruebas): reglas puras y, con la base de datos, una fuente simulada que cubre:
  - histórico completo y su límite;
  - la corrección diaria;
  - la pestaña con sus cifras, hitos y consultas;
  - el panel, el informe semanal y el mensual;
  - los avisos sin repetir;
  - las herramientas del agente;
  - el cambio de propiedad con error y Salud;
  - un cliente de baja y el borrado en cascada.
- `tests/seguridad.test.ts`: las 6 acciones nuevas.
- `tests/agentes.test.ts`: la actualización única.

## Migraciones aplicadas
`0049_perf_rendimiento.sql`, aplicada en local tras `backups/backup_pre_rendimiento_20261115.sql`. SQL completo en el archivo. Crea:
- `perf_daily`: clave primaria (cliente, fuente, propiedad, día, métrica, desglose) e índice (tenant, fuente, métrica, día);
- `perf_gsc_monthly`: clave primaria (cliente, propiedad, mes, tipo, consulta o página);
- `perf_sync`: único por (cliente, fuente, propiedad);
- `perf_annotations`;
- `perf_settings`.

Todas tienen cascada desde `tenants` y `clients` y comprobaciones de valores.

## Decisiones técnicas tomadas en auto mode
- **Opciones del diseño:** se eligió lo recomendado: consultas y páginas por mes, top 1.000, y eventos clave de GA4 como conversiones.
- **Quinta tabla `perf_settings`:** los avisos necesitan umbral y memoria de lo ya avisado. El diseño ponía el umbral en Automatizaciones, pero eso es de Operaciones; los ajustes van en el panel Rendimiento.
- **«Inicio del servicio» calculado, no guardado:** sale de la fecha de inicio de la ficha (la del contrato solo para administradores). Así no se queda desfasado si cambia la ficha.
- **`anotar_hito` con ✅ / ✖️:** el motor de propuestas es de Operaciones y un módulo no puede importar otro, así que se expone por el núcleo (`proposeChange`), con el mismo patrón de registro que el resto.
- **Business Profile con 3 días de retraso:** Google da 0 en los días aún sin datos y se guardarían caídas falsas.
- **Fin del histórico:**
  - si Google rechaza un tramo antiguo (400/404) habiendo ya datos recientes, ese es su límite;
  - en Analytics, el histórico acaba al encontrar un año vacío.
- **Tope de 8 s por vuelta del planificador:** el histórico inicial (~40 peticiones por cliente) se reparte sin bloquear las demás tareas de fondo.
- **Avisos:** últimos 7 días frente a la media de 4 semanas, con volumen mínimo, para no alarmar por 3 llamadas que pasan a 1. Un aviso por cifra, cliente y semana. Una fuente sin datos al día no cuenta como caída; eso lo dice Salud.

## Qué verificar manualmente
- Desplegar con `--migrate` (comando en `docs/PENDIENTES-ENRIC.md`).
- Agentes → Integraciones: Google conectado.
- En un cliente con su Search Console, Analytics y ficha de Google asignadas (Webs y cuentas → «Buscar en Google»), abrir la pestaña «Rendimiento»:
  - en unos minutos aparecen las cifras;
  - «Datos guardados» dice desde cuándo hay datos;
  - probar periodos y comparaciones, añadir un hito, preparar el informe del mes.
- Menú → Rendimiento: la tabla de clientes, ordenar por variación, guardar los ajustes.
- Revisar en móvil y en modo oscuro: Claude no ha podido abrir las pantallas en el navegador porque el permiso para levantar un servidor de vista previa se denegó.
- Business Profile en «Error» con 403: falta la aprobación de su API en Google Cloud.
- Telegram:
  - «¿cómo va [cliente]?»;
  - «prepárame el informe del mes de [cliente]»;
  - «apunta que hoy publicamos la web nueva de [cliente]», que llega con ✅ / ✖️.
- Salud: con todo bien, «Rendimiento de clientes» sale en verde.

## Pendientes detectados
- **Sin ver en el navegador** (ver arriba).
- **Sin verificar con Google real:**
  - cuánto histórico da la API de Business Profile;
  - las cuotas;
  - si la API de Business Profile está aprobada para el proyecto.
- **El núcleo importa módulos en la ficha del cliente:**
  - `[id]/page.tsx` importa `isConnected` de Agentes;
  - `ficha-view.tsx` importa la pestaña de Rendimiento, como ya hacía con la de Operaciones.
  - Convendría un registro de pestañas de módulo en el núcleo.
- **`gapi` marca la integración en la base de datos en cada llamada correcta:** con el histórico inicial son unas cuantas escrituras de más, sin importancia, pero mejorable.
- **«Usuarios» se suma por días:** se avisa en la tarjeta. Los usuarios únicos de un periodo necesitarían pedirlos a Google en directo.

## Revisión completa (después de construir)
Un revisor independiente leyó todo lo de la rama, pasos A y B, solo lectura. Corregido en `eb176215`:
1. **Grave:** Business Profile pedía `MESSAGING_CLICKS`, que no existe en la API (es `BUSINESS_CONVERSATIONS`). Una métrica inválida hace fallar la petición entera, así que toda la parte de Business Profile habría quedado en error, también `gbp_rendimiento` del paso A.
2. **Grave:** un prefijo de URL de Search Console escrito sin «/» final (`https://cliente.com`) habría dado error para siempre. Ahora se guarda con «/», que es como lo exige Google.
3. **Listados de Google cortados:** Analytics se limitaba a 60 propiedades y Business Profile a 5 cuentas y 100 fichas. «Comprobar accesos» marcaba «Sin acceso» las que quedaban fuera. Ahora se pagina todo.
4. **Planificador:** la descarga bloqueaba el planificador compartido (avisos, bandeja de salida, jornada) hasta 30-40 s por vuelta. Ahora va en segundo plano, una por cuenta.
5. **Sincronizaciones a la vez:** el planificador y «Sincronizar ahora» podían trabajar la misma propiedad y pisarse el cursor. Ahora hay un candado por propiedad y se relee la fila antes de trabajar.
6. **Panel e informes:** el rango salía también de propiedades inactivas (podía arrastrar años de datos) y las consultas no aprovechaban el índice. Ahora se acotan.
7. **Antes y después:** dividía siempre por 28 días. Si Analytics se instaló a mitad, el «antes» salía casi 0 y la subida, falsa. Ahora es la media por día con datos, con un mínimo de 7.
8. **Analytics con 1 día de retraso:** dejaba el último día incompleto. Ahora son 2.
9. **Informe del mes:** comparaba con «los N días anteriores». Ahora compara con el mes natural anterior y con el mismo mes del año pasado.
10. **Hitos:** ahora se comprueba que el cliente sea de la cuenta.
11. **Pestaña:**
    - «Todo» pasa a comparar con el año pasado;
    - se descartan las respuestas que llegan tarde;
    - avisa si el rango a medida está al revés;
    - el informe del mes se limpia al cambiar de mes, para no copiar el de otro;
    - las fechas son de Madrid;
    - la gráfica se recorre con el teclado (flechas) y responde al toque.
12. **`ga4_informe`:** usaba `conversions` (obsoleta) por defecto; ahora usa `keyEvents`.

Sin problemas serios en:
- permisos: todas las acciones tienen guard;
- datos al navegador;
- arquitectura: ningún módulo importa a otro en `lib/`;
- upsert y esquema;
- la máquina de estados de la descarga;
- el resto del uso de las API de Google.

Tras los arreglos:
- 287 pruebas correctas (siguen fallando las 9 de `http` y `auditoria`, por diseño en el contenedor temporal);
- tipos correctos;
- compilación de producción correcta;
- Mapa Visual OK.
