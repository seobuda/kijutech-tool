# Diseño · SEO parte 4: posiciones y visibilidad

**Fecha:** 2026-11-26 · **Rama:** `feature/seo-posiciones` · **Lista:** `docs/LISTA-CERRADA-SEO.md` (parte 4). Supervisión previa en `docs/INVESTIGACION-SEO-MERCADO.md` §7: G3 (filas compactas), G4 (semilla explícita), M1 (coste como fórmula y cola asíncrona).

## Objetivo
Guardar cada semana, por proyecto, **la posición real en Google** de las búsquedas que importan:
- el resultado orgánico y la URL que sale;
- el **paquete local** (mapa) y en qué puesto aparece el cliente;
- si hay **AI Overview** y si nos cita;
- las demás características de la SERP;
- **quién sale en el top 10**, para la cuota de visibilidad frente a la competencia.

Search Console ya da la posición media de 16 meses. Lo que se pierde si no lo guardamos ahora es el paquete local, AI Overview, la competencia y la URL concreta. Es la serie que usarán el local (geo-grid), la medición y el panel de leads.

## Piezas
1. **Semilla de búsquedas por proyecto** (`seo_rank_keywords`, tabla nueva). Hasta 50, editables a mano. Se generan solas desde:
   - las 25 búsquedas sin marca con más impresiones en GSC (90 días);
   - servicio × zona: servicios confirmados × las poblaciones de la zona confirmada, como mucho 15 (p. ej. «reformas de oficinas barcelona»);
   - la marca (1);
   - las que añada una persona.

   Cada búsqueda guarda: origen (`gsc`, `servicio_zona`, `marca`, `manual`), idioma (es/ca, de `idiomas`), ubicación (población de la zona; si no hay, España), dispositivo (móvil por defecto) y si está activa.
2. **Consulta semanal** (proceso `seo.posiciones`, cada 7 días por defecto y editable, en «Vigilancia automática»):
   - **cola asíncrona de DataForSEO:** `task_post` por lotes, y un trabajo `seo.posiciones.recoger` que cada 10 min mira `tasks_ready` y recoge con `task_get/advanced`;
   - el tope de gasto se comprueba antes de enviar el lote (`canSpend`) y el coste se apunta al recoger.
3. **Filas compactas** (`seo_rank_checks`, tabla nueva), una por búsqueda y fecha:
   - posición orgánica (`rank_group`) y URL del cliente (si sale en el top 100);
   - puesto en el paquete local (si sale) y si hay paquete;
   - AI Overview presente y si cita el dominio del cliente;
   - características de la SERP (lista corta);
   - top 10 de dominios orgánicos (array);
   - coste.

   **No se guarda la respuesta en bruto** (G3): unos 2 KB por fila, 50 × 52 × proyecto ≈ 5 MB al año.
4. **Pantalla:** pestaña nueva del proyecto, **Posiciones**:
   - tabla de búsquedas con su posición actual, el cambio frente a la semana anterior, el mapa (local pack), AIO y la URL;
   - un mini histórico;
   - cuota de visibilidad: suma ponderada por CTR de posición del top 10, cliente frente a competidores confirmados;
   - añadir, quitar o pausar búsquedas y «Consultar ahora».
5. **Hallazgos:**
   - `seo.rank_drop`: una búsqueda importante cae 5 puestos o más, o sale del top 10. Es un estado: sigue mientras no se recupere.
   - `seo.lost_local_pack`: el cliente estaba en el mapa y ya no.

   Entran en el plan (técnicas existentes o `recuperar_pagina`).

## Coste (fórmula; DataForSEO, precios del 26 nov [NV verificar en el panel])
- **Coste mensual** = búsquedas × (52/12 semanas) × precio por tarea × dispositivos × idiomas.
- **Cola estándar de orgánico avanzado:** unos 0,0006 $ por página de 10 resultados.
- **Profundidad:** 20 resultados, es decir, 2 páginas, unos 0,0012 $.
- **AI Overview asíncrono:** unos 0,0006 $ más [NV].
- **Ejemplo:** 50 búsquedas × 4,33 × 0,0018 $ = **0,39 $ al mes** (1 dispositivo y 1 idioma). Con 2 idiomas, 0,78 $. Cabe en el tope de 5 $.

## Puntos de vista
1. **SEO local:** sin «servicio + población» no hay seguimiento útil para una pyme. El paquete local es tan importante como el orgánico, y la ubicación importa: buscar «fontanero» desde Sabadell no es lo mismo que desde España.
2. **Ingeniero de datos y costes:**
   - la cola asíncrona cuesta un tercio de la directa;
   - las filas compactas, sin bruto;
   - recoger es idempotente: una tarea recogida no se vuelve a pedir;
   - las tareas que nunca llegan caducan a las 48 h.
3. **Producto:** el equipo quiere ver «sube, baja, sale en el mapa, sale en la IA» de un vistazo, y poder ajustar la lista sin pelearse con ella.

## Alternativas
| | Qué | Coste | Riesgo | Se pierde |
|---|---|---|---|---|
| **A. DataForSEO, cola asíncrona, semanal, filas compactas (elegida)** | Lo descrito | Unos 0,4-0,8 $/mes por proyecto | Más piezas (enviar y recoger) | — |
| B. DataForSEO en directo | Una llamada por búsqueda | Unas 3 veces más | Tiempo del trabajo (50 × 6 s) | Coste |
| C. Solo GSC (posición media) | Ya lo tenemos | 0 | No hay local pack, AIO ni competencia, y la posición media mezcla ubicaciones y dispositivos | Lo diferencial |
| D. Herramienta externa (SE Ranking, etc.) | | Unos 800 €/año | Enric no quiere renovarla | Integración |

## Decisión (hipótesis) y sus tres preguntas
**Decisión:** A, con la capacidad del núcleo `SerpSource` ampliada (lo registra Agentes):
- `postTasks(tenantId, tasks[]) → ids`;
- `readyTaskIds(tenantId) → ids`;
- `getTask(tenantId, id) → resultado estructurado` (orgánico, local pack, AIO con sus fuentes, características, coste, y la etiqueta con la que se envió).

SEO no sabe de DataForSEO.

**Pregunta 1. ¿Cumple el objetivo final?** Sí: es la serie que alimenta la medición («¿funcionó?»), el local y el panel de leads (búsqueda → posición → lead).

**Pregunta 2. ¿Qué coste o riesgo oculto tiene?**
- **`tasks_ready` es de toda la cuenta de DataForSEO:** la etiqueta (`tag`) identifica el proyecto y la búsqueda.
- **Ubicación:** DataForSEO exige un `location_name` exacto; se resuelve con su lista de ubicaciones, cacheada [NV: es un endpoint gratuito].
- **Volumen:** filas compactas, así que es pequeño.

**Pregunta 3. ¿Hay algo que ya tengamos y no usemos?** Sí, y se reutiliza:
- la integración DataForSEO y `serpSource`;
- el tope de gasto;
- `job_schedules` y la vigilancia;
- los competidores confirmados;
- la zona, los servicios y los idiomas del alta.

## Auditoría independiente
La hizo un subagente Opus 5.5 con esfuerzo alto, que verificó la documentación oficial de DataForSEO. **Veredicto:** la dirección (A) es correcta y el coste está bien calculado; hay que corregir la recogida y el modelo antes de escribir código. No hace falta volver al paso 1.

**Datos verificados:**
- `task_post` admite 100 tareas por llamada. Las etiquetas (`tag`) llegan a 255 caracteres.
- Precios:
  - cola estándar: 0,0006 $ por página de 10 resultados;
  - con prioridad: 0,0012 $;
  - en directo: 0,002 $;
  - AI Overview asíncrono: una base más.
- **Se cobra al enviar.**
- `task_get` es gratis y se puede repetir 30 días.
- `tasks_ready` cubre 3 días, devuelve 1000 por llamada y **consume lo recogido**.
- Existe `pingback_url`.
- `ca` está en la lista de idiomas; está por verificar [NV] que la ubicación España lo admita.

**Graves (todos corregidos en la decisión final):**
1. **El gasto se apunta al enviar.** Es el coste que devuelve `task_post`; recoger es gratis.
2. **Se recoge con `task_get` por el id guardado**, no con `tasks_ready`. El `pingback_url` se deja para más adelante. Un trabajo de recogida solo corre mientras haya tareas pendientes, y una tarea sin respuesta en 48 h pasa a «caducada».
3. **Un reintento no paga dos veces.** Se inserta antes la fila (búsqueda, ejecución) como «pendiente», con clave única, y solo se envían las que no tienen `task_id`.
4. **Estado de cada tarea en la tabla:** `task_id`, estado, `run_id`, ubicación, idioma y dispositivo por fila, con índices. Se comprueba el `status_code` de **cada tarea**.
5. **Cliente en el mapa:** se busca por dominio **o** por nombre (marca), y se descartan las fichas de pago.

**Medios (corregidos):**
- Profundidad de 20: «sin posición» quiere decir «más allá del 20».
- El idioma va **por búsqueda**, no multiplicando la lista.
- La cuota de visibilidad usa volumen: las impresiones de GSC, o el volumen de DataForSEO (una vez al mes, unos 0,06 $).
- Semilla:
  - el servicio en término corto;
  - normalizada para quitar duplicados;
  - lo quitado no vuelve;
  - GSC añade y no sustituye;
  - sin zona ni servicios confirmados no se inventa «España»: estado vacío con la acción a seguir.
- Hallazgos con margen:
  - caída si en las dos últimas consultas sale del top 10 cuando antes estaba dentro (mediana de 3), y se resuelve al volver al 8 o mejor;
  - «importante» = de servicio × zona, marca o manual, o de GSC con 100 impresiones o más;
  - una consulta fallida no cuenta;
  - `lost_local_pack`: si hay paquete y el cliente falta dos veces seguidas.
- Se guardan todas las URLs del cliente que salen (canibalización).
- Bruto: el `task_id` permite volver a leer la respuesta gratis durante 30 días (G3, retención corta sin coste de disco).

**Leves:**
- «Consultar ahora» no se deja si hay tareas pendientes o una consulta de hace menos de 12 h.
- La etiqueta lleva la cuenta y el proyecto.
- Los envíos se reparten por proyecto.

**Ubicación:** `location_name` de la población principal si está en la lista de ubicaciones de DataForSEO (gratuita, cacheada). Si no, la de la provincia o comunidad, avisándolo en la pantalla. `location_coordinate` queda para el geo-grid (parte 5).
