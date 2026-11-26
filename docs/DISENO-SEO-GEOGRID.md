# Diseño · SEO parte 5b: geo-grid y spam en Maps

**Fecha:** 2026-11-27 · **Rama:** `feature/seo-local-5b` · **Lista:** parte 5 (local), tanda 5b.

## Objetivo
1. **Geo-grid:** en qué puesto del **mapa de Google** sale el cliente cuando se busca su servicio desde distintos puntos de su zona («salgo 2.º en el centro de Sabadell y 15.º en Terrassa»). Es lo que más entiende una pyme local y lo que venden Local Falcon y BrightLocal (unos 12 $ por cuadrícula frente a unos 0,10-0,20 $ con datos propios [NV]).
2. **Spam en Maps:** competidores que salen en esas búsquedas con el nombre relleno de palabras clave («Fontanero Sabadell 24h Urgente Barato»), que Google prohíbe. Hay que dar el texto para denunciarlo («Sugerir una edición»).

## Fuentes
- **DataForSEO Google Maps SERP**, en cola asíncrona como las posiciones:
  - `task_post` con `location_coordinate` («lat,lng,zoom») y `depth` 20;
  - recogida con `task_get` por id.

  Cada resultado trae `cid`, `title`, `rank_group`, `rating`, `domain` y `category` [NV verificar los campos y el precio: unos 0,0006 $ por tarea en la cola estándar según la investigación].
- **Centro de la cuadrícula:** las coordenadas de la **última foto de la ficha del cliente** (`seo_local_snapshots.lat/lng`, DataForSEO, sin las restricciones de Places).
- **Búsquedas:** hasta 3 por proyecto: las de «servicio + zona» activas en Posiciones (primero las manuales) **sin la población**. En el mapa, la ubicación la da el punto («reformas de oficinas»).

## Piezas
1. **Cuadrícula 5×5** (25 puntos) alrededor del centro. El paso depende de cómo atiende el negocio (`atencion` del expediente):
   - local: 0,5 km;
   - a domicilio o ambos: 1,5 km;
   - online: no se hace.

   Se puede ajustar por proyecto (pequeña, mediana o grande).
2. **Proceso `seo.geogrid`**, mensual (editable: 14, 30 o 60 días), en «Vigilancia automática»:
   - 3 búsquedas × 25 puntos = 75 tareas, unos 0,05 $ con la cola estándar;
   - mismo patrón que las posiciones: filas `pendiente`, tope antes de enviar, gasto apuntado al enviar, recogida por id, caducidad a las 48 h y cierre de las filas huérfanas.
3. **Tablas del módulo:**
   - `seo_geogrid_runs`: una por búsqueda y ejecución, con el centro, el paso y el resumen (media de puesto, % de puntos en el top 3, top 3 de competidores);
   - `seo_geogrid_points`: una fila por punto, con coordenadas, `task_id`, estado, puesto del cliente (por `cid`; si no, por nombre) y los 3 primeros (`cid` y título).
4. **Pestaña Local → «Mapa por zonas»:**
   - cuadrícula de 5×5 coloreada por puesto: 1-3 verde, 4-10 ámbar, 11-20 rojo, fuera gris;
   - sin teselas de mapa, para no añadir dependencias ni enviar datos a terceros; solo una cuadrícula con la orientación;
   - media y % en el top 3, comparados con la ejecución anterior;
   - «quién te gana» en cada zona.
5. **Spam:** regla pura sobre los títulos de los competidores que aparecen en la cuadrícula:
   - el nombre incluye palabras del servicio o una población de la zona, o lleva rellenos («24h», «urgente», «barato», «económico», «mejor»);
   - y es más largo de lo normal.

   Se marca como «posible spam», con la explicación y el procedimiento para denunciarlo (texto preparado). No se denuncia solo: es un efecto hacia fuera.
6. **Hallazgos** (fuente `seo.local:geogrid`, lista aparte):
   - `seo.geogrid_weak`: menos del 30 % de los puntos en el top 3 para una búsqueda principal;
   - `seo.geogrid_drop`: la media de puesto empeora 3 o más frente a la ejecución anterior, con las dos ejecuciones completas en al menos el 80 % de los puntos;
   - `seo.maps_spam`: competidor con posible spam en el top 3 de 5 puntos o más.

   Técnicas: `recuperar_mapa` (ya existe), `optimizar_ficha_zona` y `denunciar_spam`.

## Puntos de vista
1. **SEO local:** la cuadrícula es el estándar del sector. Con una sola búsqueda desde una sola ciudad (posiciones) no se ve que en el barrio de al lado no salga. La denuncia del spam es una palanca real en sectores con mucho spam (cerrajeros, fontaneros).
2. **Costes:** 75 tareas al mes ≈ 0,05 $. Con tope y cola asíncrona. Las coordenadas son de DataForSEO, no de Places.
3. **Producto:** una cuadrícula de colores se entiende sin explicaciones; la comparación mes a mes enseña el progreso.

## Alternativas
| | Qué | Coste | Riesgo | Se pierde |
|---|---|---|---|---|
| **A. Cuadrícula 5×5 mensual con DataForSEO Maps en cola (elegida)** | Lo descrito | Unos 0,05 $/mes | Precio y campos [NV] | — |
| B. 7×7 | Más precisión | Unas 2 veces más | Más ruido de datos | Sencillez |
| C. Local Falcon | | Unos 12 $ por cuadrícula | Otra herramienta | Integración y coste |
| D. Usar solo el paquete local de Posiciones | Ya existe | 0 | Un solo punto | La foto por zonas |

## Decisión (hipótesis) y sus tres preguntas
**Decisión:** A.

**Pregunta 1. ¿Cumple el objetivo final?** Sí: medición local que el cliente entiende, y acción (optimizar la ficha o denunciar el spam).

**Pregunta 2. ¿Qué riesgo oculto tiene?**
- `location_coordinate` en Maps con el zoom correcto [NV].
- Identificar al cliente por `cid` (sin la ficha confirmada no se hace).
- Las zonas despobladas devuelven pocos resultados.

**Pregunta 3. ¿Hay algo que ya tengamos y no usemos?** Sí, y se reutiliza:
- la cola de DataForSEO (`postTasks`/`getTask`, ampliada con «maps»);
- la ficha confirmada y sus coordenadas;
- las búsquedas de servicio × zona;
- el tope de gasto.

## Auditoría independiente
La hizo un subagente Opus 5.5 con esfuerzo alto, verificando la documentación de DataForSEO.

**Confirmado:**
- endpoints `/serp/google/maps/task_post` y `task_get/advanced`;
- `location_coordinate` «lat,lng,zoom» (de 3z a 21z, 17z por defecto, 7 decimales);
- 0,0006 $ por SERP de hasta 100 resultados;
- resultados `maps_search`, con `cid`, `place_id`, `rank_group`, `title`, `domain`, `rating`, `category`…;
- los anuncios son `maps_paid_item` y no llevan `cid`.

**Veredicto:** A correcta, pero no se construye tal cual.

**Graves (corregidos):**
1. **Zoom y `search_this_area`:** por defecto el área visible es de unos cientos de metros. El zoom se fija y se guarda en cada ejecución (14z para un local, 13z para un negocio a domicilio) y se envía `search_this_area: false` [NV, se prueba con la cuenta real].
2. **Negocios a domicilio sin coordenadas:** si la ficha no las trae, la ejecución queda «omitida», con un mensaje claro.
3. **Regla de spam:** exige **2 señales independientes**:
   - servicio y población a la vez;
   - rellenos como «24h», «urgente» o «barato»;
   - separadores `|` o `-` con varios tramos;
   - más de 40 caracteres.

   Se descarta si el título coincide con la raíz de su dominio. Se llama «nombre sospechoso» y lo descartado no vuelve (por `cid`).
4. **Hora:** se envía solo en días laborables de 10 a 12 (hora de Madrid). Si el proceso vence fuera de esa franja, se aplaza a la siguiente.

**Medios (corregidos):**
- **Identificar al cliente:** solo por `cid` o `place_id`. Si no sale, se cuenta como puesto 21 en la media, y solo cuentan los `maps_search`.
- **Paso de la cuadrícula:** según cómo atiende (0,5 km si es local, 1,5 km si va a domicilio), con el radio cubierto explicado en pantalla.
- **Coordenadas:** Δlat = d/111,32 y Δlng = d/(111,32·cos lat), redondeadas a 7 decimales (función pura con su prueba).
- **Búsquedas:** los servicios confirmados sin poblaciones (como mucho 3). Si no hay, la categoría principal de la ficha.
- **Comparación:** solo con los mismos centro, paso, zoom y búsqueda. La caída exige 3 o más de media y al menos 8 puntos que bajan 3 o más. «Débil» es un estado de la búsqueda principal, que es la primera.
- **Profundidad:** `depth` 100, que cuesta lo mismo.

**Leves (corregidos):**
- se guarda el top 20 de cada punto en jsonb;
- índice único por ejecución, fila y columna;
- zoom e idioma en la ejecución;
- 75 tareas en un solo envío;
- la ampliación de `SerpSource` (capacidad genérica del núcleo) queda anotada aquí.

**Pendiente con la cuenta real:**
- que el zoom y `search_this_area` den resultados razonables;
- que el `cid` de `my_business_info` coincida con el de Maps.
