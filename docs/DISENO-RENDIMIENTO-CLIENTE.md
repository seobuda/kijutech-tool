# Diseño — Rendimiento del cliente (paso B de las métricas de cliente)

**Estado:** propuesta, pendiente de aprobación de Enric (lleva tablas nuevas).
**Fecha:** 15 nov 2026. **Parte de:** paso A (propiedades de Google asignadas a cada ficha, rama `feature/cliente-propiedades-google`).

## 1. Objetivo
Guardar cada día los números de Search Console, Analytics 4 y Business Profile de cada cliente para:
1. **No perder el histórico.** Search Console solo guarda 16 meses, también por la API. La API de Business Profile no documenta cuánto da; se suele hablar de unos 18 meses, sin verificar. Lo que guardemos desde hoy se acumula sin límite.
2. **Medir la estrategia.** Ver qué pasó antes y después de cada acción (inicio del servicio, web nueva, campaña, artículos), comparar con el periodo anterior y con el mismo periodo del año pasado, y medir desde el inicio del contrato.
3. **Dar datos a todos.** A la pestaña del cliente, a un panel central de todos los clientes, a los agentes (sin gastar llamadas a Google) y, más adelante, a los informes y avisos de caídas.

Visión: Operaciones sustituye a un humano. Un account manager mira cada semana cómo va cada cliente y avisa si algo cae. Esto es la base para que el sistema lo haga solo.

## 2. Qué se guarda

| Fuente | Cada día (totales) | Desglose diario | Detalle mensual |
|---|---|---|---|
| Search Console | clics, impresiones, CTR, posición media | por dispositivo | **top 1.000 consultas y top 1.000 páginas** del mes (clics, impresiones, CTR, posición) |
| Analytics 4 | sesiones, usuarios, usuarios nuevos, eventos clave, tasa de interacción, páginas vistas | sesiones y eventos clave **por canal** (orgánico, directo, de pago, social…) | — |
| Business Profile | vistas en Búsqueda y en Maps (móvil y ordenador), llamadas, clics a la web, cómo llegar, mensajes, reservas | — | — |

¿Por qué las consultas por mes y no por día? Por día serían unas 365.000 filas por cliente y año; por mes, unas 24.000. Para la estrategia lo que importa es la tendencia de cada palabra mes a mes. El detalle diario de los últimos 16 meses se puede seguir pidiendo en directo a Google con `gsc_rendimiento`.

## 3. Modelo de datos (módulo nuevo «Rendimiento», prefijo `perf_`)

**`perf_daily`**: una fila por cliente, fuente, propiedad, día, métrica y desglose. Formato largo: una métrica nueva no necesita migración.
- `tenant_id`, `client_id` (→ `clients`, borrado en cascada), `source` (`gsc` | `ga4` | `gbp`), `property` (el identificador: `sc-domain:…`, `properties/…`, `locations/…`)
- `date`, `metric` (p. ej. `clicks`, `sessions`, `call_clicks`), `dim_type` (`''` | `device` | `channel`), `dim_value` (`''` | `mobile` | `Organic Search`…), `value` numeric
- Único: (`client_id`, `source`, `property`, `date`, `metric`, `dim_type`, `dim_value`). Índice por (`client_id`, `date`).
- Volumen: unas 60 filas por cliente y día, unas 22.000 al año por cliente. Con 30 clientes, unas 650.000 al año, unos 100 MB con índices. Es poco para PostgreSQL.

**`perf_gsc_monthly`**: consultas y páginas por mes.
- `tenant_id`, `client_id`, `property`, `month` (día 1), `kind` (`query` | `page`), `key` (la consulta o la URL), `clicks`, `impressions`, `ctr`, `position`
- Único: (`client_id`, `property`, `month`, `kind`, `key`).

**`perf_sync`**: estado de la sincronización de cada propiedad.
- `client_id`, `source`, `property`, `history_from` (desde cuándo hay datos), `synced_until`, `last_run_at`, `last_error`, `status` (`pendiente` | `descargando` | `al_dia` | `error`).

**`perf_annotations`**: hitos de la estrategia, que se ven en las gráficas y sirven para comparar antes y después.
- `client_id`, `date`, `kind` (`servicio` | `web` | `contenido` | `campana` | `google` | `otro`), `title`, `notes`, `source` (`manual` | `agente` | `sistema`), `created_by`.
- El sistema crea solo el hito «Inicio del contrato» a partir de la ficha. El agente puede proponer hitos («hoy se ha publicado la web nueva»).

**Por qué los datos se guardan con su propiedad:** si un cliente cambia de propiedad (por ejemplo, de prefijo de URL a dominio), el histórico anterior sigue ahí. Si se quita la cuenta de la ficha, los datos no se borran. Solo se borran si se borra el cliente.

## 4. Sincronización
- **Descarga inicial** al asignar una propiedad, como una tarea en segundo plano y por tramos:
  - Search Console: los 16 meses, y las consultas y páginas de cada mes.
  - Analytics: desde que existe la propiedad, en tramos de un año.
  - Business Profile: tanto como dé la API; se prueba desde 18 meses y, si Google lo rechaza, se reduce.
- **Cada día, hacia las 7:00 (hora de Madrid):** se vuelven a pedir los últimos 10 días de cada propiedad, porque Search Console llega con 2 o 3 días de retraso y Business Profile corrige días recientes. Se guarda encima de lo que haya.
- **El día 4 de cada mes:** consultas y páginas del mes anterior.
- **Coste:** cero en IA. Unas 4 peticiones a Google por cliente y día, muy por debajo de los límites de las APIs, que aún hay que verificar en la consola.
- **Errores:** se guardan en `perf_sync` y salen en la pestaña y en Salud del sistema. Si una propiedad deja de tener acceso, el estado pasa a «error» y la ficha marca «Sin acceso».
- **Si Google cae varios días:** como se repiten los últimos 10 días, los huecos se rellenan solos. Si son más, se repite la descarga de ese tramo.
- **Arquitectura:** el módulo Rendimiento no habla con Google directamente. El acceso a Google es del módulo Agentes, y un módulo no importa otro. Igual que el directorio del paso A, Agentes registra en el núcleo una **fuente de métricas** (`registerMetricSource`) que da filas ya normalizadas, y Rendimiento la usa. Mañana otra fuente (Google Ads, Meta, Clarity) se registra igual.

## 5. Pantallas
**Pestaña «Rendimiento» en la ficha del cliente**
- Selector de periodo (28 días, 3 meses, 12 meses, todo o a medida) y de comparación (periodo anterior, mismo periodo del año pasado, desde el inicio del contrato).
- Tarjetas con la cifra y su variación: clics orgánicos, impresiones, posición media, sesiones orgánicas, eventos clave, vistas de la ficha de Google, llamadas, clics a la web y cómo llegar.
- Gráficas por semana, en SVG propio como las de Salud y sin librería nueva, con los hitos marcados.
- Consultas y páginas del mes, con el movimiento respecto al mes anterior: las que suben, las que bajan y las nuevas.
- Hitos de la estrategia: añadir, editar y borrar, con el antes y después de cada uno (las mismas semanas antes y después).
- Estado: «Datos desde abr 2025 · actualizado hoy 7:02», con «Sincronizar ahora» y los errores visibles.

**Panel central «Rendimiento»** (paso B2): todos los clientes activos en una tabla con sus cifras clave de los últimos 28 días y su variación, para ordenar por las que más caen o más suben.

**Agente:** herramienta `rendimiento_cliente` que lee lo guardado (cifras, comparaciones, hitos, consultas que suben y bajan), sin gastar llamadas a Google y con todo el histórico. Y `anotar_hito`, que se propone con ✅ / ✖️ como el resto de cambios.

## 6. Alternativas consideradas

| Alternativa | Coste | Riesgo | Qué se pierde | Veredicto |
|---|---|---|---|---|
| **A. No guardar; consultar en directo** (lo de hoy) | Ninguno | Bajo | Todo lo anterior a 16 meses en Search Console y a unos 18 en Business Profile. Cada consulta gasta peticiones y tiempo. No hay panel central rápido. | ✗ No cumple el objetivo. |
| **B. Tablas anchas por fuente** (una columna por métrica) | Igual | Cada métrica nueva es una migración | Flexibilidad | ✗ El formato largo es igual de rápido a este volumen. |
| **C. Guardar la respuesta JSON de Google tal cual** | Bajo | Consultas lentas y difíciles; depende del formato de Google | Comparar y sumar fácilmente | ✗ Solo valdría como copia en bruto. |
| **D. BigQuery** (exportación oficial de Search Console y Analytics) | De pago, otra plataforma y otra cuenta | Más piezas | Simplicidad. La exportación masiva de Search Console no trae el histórico anterior. Business Profile no tiene exportación. | ✗ Desproporcionado para la agencia hoy. |
| **E. Herramienta externa** (Looker Studio con conectores de pago, etc.) | Cuotas mensuales | Los datos quedan fuera | Que los agentes y los avisos usen los datos | ✗ Va contra la visión. |
| **F. Formato largo diario + consultas mensuales + hitos** (este diseño) | Una migración y unos 100 MB al año | Bajo | El detalle diario de consultas de más de 16 meses (queda el mensual) | ✓ **Recomendada.** |

## 7. Tres preguntas a la propia propuesta
1. **¿Cumple el objetivo final o solo el de hoy?** Sí. Lo mismo alimenta la pestaña, el panel, el agente, el informe semanal y, en el futuro, los avisos de caída («las llamadas de X han caído un 40 % este mes»). Los hitos permiten medir la estrategia, no solo mirar números.
2. **¿Qué coste o riesgo oculto tiene a semanas vista?** Disco: unos 100 MB al año con 30 clientes; el servidor se vigila. Si Google cambia una API, solo se toca la fuente. Si Google aún no ha aprobado la API de Business Profile, esa parte queda en «error» sin afectar a las demás. Las cuotas de las APIs están por verificar, pero el uso previsto es muy bajo.
3. **¿Hay algo que ya tengamos y no estemos usando?** El planificador (`registerScheduled`), los trabajos en segundo plano, las gráficas SVG de Salud, el motor de propuestas del agente y el directorio del paso A. Todo se reutiliza. No hace falta ninguna dependencia nueva.

## 8. Fases
- **B1 (migración 0049):** las cuatro tablas, la fuente de métricas de Google, la descarga inicial y la diaria, la pestaña «Rendimiento» con cifras, gráficas, consultas y hitos, y las herramientas `rendimiento_cliente` y `anotar_hito`. Mapa, pruebas y documentación.
- **B2:** panel central de todos los clientes y cifras de rendimiento en el informe semanal.
- **B3:** avisos de caídas y subidas fuertes por cliente, con umbral en Automatizaciones, y el informe mensual por cliente.

## 9. Lo que necesita la aprobación de Enric
- Migración 0049 con las tablas `perf_daily`, `perf_gsc_monthly`, `perf_sync` y `perf_annotations` (módulo nuevo «Rendimiento»).
- Detalle de consultas y páginas **mensual (top 1.000)**, recomendado, o diario.
- En Analytics, contar como conversión los **eventos clave** que tenga configurados cada propiedad, el estándar de GA4.

## 10. Sin verificar
- Cuánto histórico da la API de Business Profile (se comprobará en la primera descarga).
- Las cuotas exactas de las tres APIs para nuestro proyecto de Google Cloud.
- Si Google ha aprobado ya el acceso a la API de Business Profile.
- Que la retención de Analytics no afecte a la Data API. Google lo dice de los informes estándar, y para la API lo dicen fuentes de terceros.
