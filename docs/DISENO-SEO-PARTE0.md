# Diseño técnico · SEO parte 0: consolidar

**Fecha:** 2026-11-26. **Rama:** `feature/seo-definitivo`. **Lista:** `docs/LISTA-CERRADA-SEO.md`.

## Problema

Las comprobaciones SEO están repartidas en dos sitios que se solapan:
- **Estrategia**, por cliente: vigilancia crítica diaria, salud semanal de unas 40 URL, velocidad mensual con PageSpeed y detectores semanales sobre Search Console en directo. Guarda el resultado en `est_signals` y `est_health_checks`.
- **El módulo SEO**, por proyecto: auditoría de 500 páginas en hallazgos del núcleo (`findings`), mapa de palabras y plan de mejora.

Cada parte nueva tendría que construirse dos veces.

**Dato que lo simplifica:** en producción, Estrategia tiene **0 clientes con plan** (comprobado el 17 nov; se vuelve a comprobar antes de desplegar). No hay datos vivos que trasladar.

## Puntos de vista

1. **Arquitecto de software.** El hallazgo del núcleo ya generaliza las señales, y `job_schedules` ya generaliza `est_process_runs`, con proyecto como ámbito, frecuencia editable y espera tras fallos. El planificador de Estrategia corre en el proceso web y en memoria, que es justo lo que el diseño v2 quería dejar atrás.

   **Propone:** reescribir cada comprobación como un proceso `seo.*` por proyecto, que corra en el trabajador y escriba hallazgos.

   **Riesgos:**
   - la vigilancia crítica necesita la confirmación a los 20-30 minutos;
   - Estrategia no puede importar SEO, así que lee el núcleo (`findings` por los proyectos del cliente).
2. **Especialista SEO (operaciones de agencia).** Lo que importa es un único sitio con la verdad del proyecto:
   - la caída de la web avisa al momento;
   - las oportunidades «al alcance» y el CTR bajo ya salen en el mapa (Palabras A+B), así que no deben repetirse como detectores;
   - las páginas en caída y las consultas nuevas sí aportan.

   **Riesgos:**
   - perder la inspección de URL en Search Console;
   - perder la comparación con el año anterior, que evita falsas alarmas de temporada.
3. **Seguridad y costes.** PageSpeed sin clave da 429. La clave debe ir cifrada en Integraciones, como Places, y no en el `.env` del servidor. Hay que apuntar lo que se gasta en datos de pago antes de que lleguen las partes 2, 4 y 5, porque el tope es de 5 $ por proyecto y mes. El contador es de solo escritura y lectura de cifras, sin datos del cliente.

   **Riesgo:** que el contador quede en un módulo y luego Google Ads (otro módulo) tenga que duplicarlo. Por eso va en el núcleo.

## Alternativas

| | Qué es | Coste y esfuerzo | Riesgo | Qué se pierde |
|---|---|---|---|---|
| **A. Trasladar a SEO por proyecto (elegida)** | Procesos `seo.vigilancia`, `seo.salud.programada`, `seo.velocidad` y `seo.detectores` en `job_schedules` por proyecto, que escriben hallazgos. Estrategia apaga esos 4 procesos (fase futura) y su estratega lee los hallazgos del núcleo | Medio: unas 600 líneas, en buena parte trasladadas de Estrategia | Bajo: no hay clientes con plan. La vigilancia crítica necesita su confirmación | Nada; `est_signals` queda para lo que no es SEO (ficha, objetivos y guardián) |
| B. Que SEO lea `est_signals` | SEO muestra las señales de Estrategia | Bajo | Alto: un módulo leería las tablas de otro, cosa que las barreras prohíben. Además sigue siendo por cliente, no por proyecto | La escala por proyecto |
| C. Duplicar | SEO hace sus comprobaciones y Estrategia mantiene las suyas | Medio | Avisos dobles, dos verdades y doble consumo de cuota de Google | Claridad |
| D. No hacer nada | | 0 | Cada parte nueva se construye dos veces | La base del resto de la lista |

## Decisión (hipótesis) y sus tres preguntas

**Decisión:** la A, con estas piezas.

1. **Procesos por proyecto**, con `registerProcess` y `scopeType: 'proyecto'`, dados de alta con `ensureSchedule` al crear o abrir un proyecto SEO con web:
   - `seo.vigilancia` (1 día, editable a 1, 3 o 7): caída, 5xx, 4xx en la portada, noindex en la portada, robots que bloquea todo y SSL. Hallazgos `seo.site_down`, `seo.home_error`, `seo.home_noindex`, `seo.robots_block_all` y `seo.ssl_expiring`. **Confirmación:** si aparece uno crítico, se vuelve a encolar a los 30 minutos con `confirm`; solo entonces se avisa por Telegram (`ops_notifications`, con clave única).
   - `seo.auditoria` (30 días por defecto, editable): lanza `startProjectAudit`, es decir, el rastreo completo y las reglas.
   - `seo.velocidad` (30 días): CrUX/PageSpeed de la portada y de las 3 páginas con más clics; hallazgo `seo.cwv_slow`.
   - `seo.detectores` (7 días): páginas en caída (con el año anterior como control de temporada) y consultas nuevas sin página, sobre `gsc_daily` del núcleo, no en directo. Hallazgos `seo.page_drop` y `seo.new_query`. «Al alcance» y «CTR bajo» no se repiten: ya los da el mapa.
2. **Inspección de URL** de las 8 páginas con más clics, dentro de `seo.auditoria`: hallazgo `seo.not_indexed`.
3. **Estrategia:** los procesos `critico`, `salud`, `velocidad` y `detectores` pasan a una fase no ejecutable, así que no se ven ni corren. `strategist.ts` añade al dossier los hallazgos abiertos de los proyectos del cliente, leídos del núcleo. **Sin migración destructiva:** las filas de `est_*` se quedan.
4. **Frecuencias editables:**
   - **Por defecto:** ajustes de la cuenta en `seo_settings` (clave-valor existente, sin esquema).
   - **Por proyecto:** el propio `job_schedules.every_minutes`, editable desde la pestaña Salud del proyecto, que también deja pausar.
5. **PageSpeed/CrUX:** proveedor `pagespeed` en Agentes → Integraciones (clave cifrada, probada al guardar). Lo expone una capacidad nueva del núcleo, `registerSpeedSource`, que registra Agentes, igual que `registerSerpSource`. SEO y Estrategia la consumen y el `.env` queda de reserva.
6. **Contador de gasto de datos** en el núcleo:
   - tabla aditiva `data_spend` (tenant, proyecto anulable, proveedor, operación, coste estimado en dólares, fecha);
   - `recordDataSpend()` y `dataSpendThisMonth(projectId)`;
   - `canSpend(projectId, usd)` con el tope del ajuste `seo.data_budget_usd`, que por defecto es 5.

   Lo usan DataForSEO y Places desde Agentes cuando la llamada lleva proyecto. Pantalla: Salud → «Gasto en datos este mes».
7. **Asistente de agosto:** se quita del menú y de la cabecera del proyecto. Sus rutas responden con un aviso que lleva al módulo nuevo. Antes se hace un backup y no se borra ninguna tabla.

**Pregunta 1. ¿Cumple el objetivo final?** Sí:
- un solo sitio por proyecto;
- el trabajador ejecuta sin humano y avisa por excepción;
- las partes 1 a 8 añaden reglas y procesos al mismo armazón.

**Pregunta 2. ¿Qué coste o riesgo oculto tiene a semanas vista?**
- **Cuota de Search Console:** los detectores leen `gsc_daily` y no la API, así que el coste es cero. Queda por comprobar que `gsc_daily` tenga la dimensión consulta×página para 56 días más el año anterior. Si solo hay 16 meses, la comparación anual se omite.
- **Avisos:** la vigilancia de cientos de proyectos genera trabajos diarios ligeros (unos segundos cada uno).
- **CPU de la auditoría mensual:** se reparte con el desfase por proyecto (`nextRunAfter` con semilla).

**Pregunta 3. ¿Hay algo que ya tengamos y no usemos?** Sí, y se reutiliza:
- `job_schedules`, `findings`, `ops_notifications` y `gsc_daily`;
- las reglas puras de Estrategia (`pageDrops`, `newQueries`, `robotsBlocksAll` y `sslDaysLeft`), que se trasladan a `lib/seo/vigilancia/` o se reimplementan sin importar Estrategia.

## Auditoría independiente

La hizo un subagente Opus 5.5 con esfuerzo alto el 26 nov. **Veredicto:** se mantiene la alternativa A, con cambios.

**Graves:**
- **G1.** `ensureSchedule` sobrescribe la frecuencia y quita la pausa en cada alta. Le pasa ya a `seo.id.watch`, porque se reactiva en cada auditoría. Además, no hay funciones para editar la frecuencia ni para pausar.
- **G2.** La confirmación a los 30 minutos se perdería: la clave `sched:` sigue abierta mientras el trabajo corre. Por otro lado, `firstSeen` no sirve para confirmar, porque un hallazgo que vuelve a aparecer conserva la fecha antigua.
- **G3.** El estratega ya recibe los hallazgos SEO por `registerProjectDossierProvider` (`SOURCES`). Basta con ampliar esa lista; lo que sí hay que quitar es su sección «Salud de la web» (`est_health_checks`) para los clientes cubiertos.
- **G4.** Con el diseño inicial se perdía:
  - la vigilancia de los clientes sin proyecto SEO (plan de mantenimiento);
  - el embudo de Analytics;
  - el análisis del estratega que se lanza por alerta;
  - los ajustes de avisos y pausa.

**Medios:**
- **M1.** `gsc_daily` sirve para los detectores (24 meses), con dos condiciones: omitir el año anterior mientras falte histórico, y la caída se mide por página, sabiendo que las consultas anónimas no salen.
- **M2.** `new_query` y la canibalización ya las da el mapa. Los detectores deben reconstruir el mapa cada semana y añadir solo `page_drop`.
- **M3.** El aviso va por `telegramOutbound().notifyOwner` del núcleo y no por `ops_notifications`.
- **M4.** `data_spend` en el núcleo pide la aprobación de Enric. El gasto debe apuntarlo quien conoce el proyecto (SEO).
- **M5.** Hay que repartir la primera ejecución de cada proyecto para que no arranquen todos de golpe.
- **M6.** Una vigilancia diaria tarda demasiado en enterarse de una caída. Conviene que sea cada hora.

**Decisión final, con los cambios aplicados:**
1. **Núcleo (`jobs.ts`):**
   - `ensureScheduleIfMissing`: solo crea la programación, nunca la sobrescribe. `seo.id.watch` pasa a usarla.
   - `setScheduleEvery`, `pauseSchedule` y `listSchedulesForScope`.
   - Desfase estable por ámbito (`stableOffsetMinutes`) para repartir las primeras ejecuciones.
2. **Núcleo (`capabilities.ts`):**
   - `registerSpeedSource` (lo registra Agentes, con su integración `pagespeed` y el `.env` de reserva);
   - `registerProjectAlertListener` / `emitProjectAlert`: SEO avisa de una alerta grave y Estrategia despierta al estratega sin importar a SEO.
3. **Confirmación de la vigilancia:**
   - clave propia `seo.vigilancia.confirm:<proyecto>`;
   - el aviso solo sale en la pasada que lleva `confirm: true` y si el problema sigue;
   - una web caída no es un error del trabajo, sino un hallazgo.
4. **Frecuencias:** vigilancia cada hora (editable: 1 h, 6 h o 24 h); auditoría cada 30 días; velocidad cada 30 días; detectores cada 7 días (reconstruyen el mapa y añaden `seo.page_drop`). Se editan y pausan por proyecto en Salud.
5. **Estrategia no se apaga:** en los clientes **cubiertos** por un proyecto SEO con vigilancia programada se omiten sus procesos crítico, salud y velocidad («cubierto por el proyecto SEO»), y sus detectores hacen solo el embudo de Analytics. Los clientes sin proyecto SEO siguen como hoy. El estratega no muestra «Salud de la web» en los cubiertos, porque la recibe por el dossier.
6. **Gasto de datos:** tabla del módulo **`seo_data_spend`**, no del núcleo, así que no hace falta tocar `CORE_TABLES`. La apunta SEO con el `costUsd` que devuelve la fuente. Tope del mes con el ajuste `seo.data_budget_usd` (5 $). Se acepta que comprobar el tope y hacer la llamada no sea atómico.
7. El semáforo no cuenta dos veces la portada: si la vigilancia da `seo.site_down`, la portada de la auditoría no añade otro hallazgo crítico. Es aceptable porque la auditoría usa otra fuente y otro tipo de hallazgo; se revisa en la parte 1.

## Sin verificar
- La retención real de `gsc_daily` y si guarda consulta×página.
- El número de clientes con plan de Estrategia en producción a día de hoy.
- El precio de PageSpeed: gratuito con clave, con una cuota diaria que no está confirmada [NV].
