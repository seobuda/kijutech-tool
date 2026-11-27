# Plan: «Jefe SEO» con IA desde el día 1 (fase D replanteada)

**Fecha:** 2026-11-27 · **Análisis y plan:** Fable 5.2, en solo lectura sobre `main` (0d601d98). **Ejecuta:** Claude Opus 5.5.
**Estado:** APROBADO por Enric el 27 nov con las recomendaciones del §8: bloquea solo lo imprescindible (web, Search Console asignado, horas); una semana en modo sombra; el plan maestro lo aprueba siempre un admin y los ciclos se gradúan (>70 % de 10 sin editar → responsable SEO humano); tope propio de 30-40 $/mes. Por defecto: la lista de fuentes no oficiales del investigador la aprueba Enric; el bot de Telegram del departamento, después de D3.
**Origen:** Enric rechaza que el agente espere a 2-3 estrategias hechas a mano («nos convierte en el cuello de botella»). Quiere apoyarse al 100 % en la IA (Opus 5.5 en esfuerzo alto) desde el alta. El flujo que pide:
1. «Empezar análisis» recorre de forma secuencial todas las etapas y no arranca sin las conexiones.
2. Se genera un plan de servicio a 1-2 años con estrategias (ciclos) dentro.
3. Un Jefe SEO propone y debate con los humanos y delega en personas y subagentes. Uno de ellos es un investigador de novedades.
4. Enric aprueba.

[NV] = no verificado. [OP] = opinión.

## 1. Veredicto crítico

**Lo acertado:**
- El cuello de botella es real.
- El flujo con puertas ya está medio hecho: `startProjectSetupAction` → `startProjectAudit` encola en paralelo, sin etapas ni estados (`lib/seo/salud/audit.ts:210-217`).
- Falta el plan de servicio que contenga los ciclos.
- El Jefe con subagentes encaja en el organigrama: `agt_departments`, agentes `jefe` y `agt_jobs`. El motor de agentes ya tiene búsqueda y lectura web de Anthropic (`lib/agentes/engine.ts:146-147`).

**Riesgos:**
1. **«La IA lo sabe todo» es falso en SEO.** Tiene fecha de corte, mezcla folclore con hechos y alucina. Solo es fiable si se ancla a datos del cliente con identificador y a fuentes con fecha.
2. **Pronosticar con un solo caso.** La medición exige bases mínimas, y en una pyme muchos veredictos saldrán «no concluyente». Los números del pronóstico los calcula el código, con rangos y supuestos; la IA solo los explica.
3. **Aún no hay aprendizaje entre clientes** (`planFactors` = 1). El Jefe debe decirlo, no fingirlo.
4. **Bloquear el arranque hasta tener TODO conectado** pasa el cuello de botella al cliente. Solo debe bloquear lo imprescindible; lo demás avisa y un admin puede continuar.
5. **La aprobación también es un cuello de botella.** Hay que diseñarla para 5 minutos y medirla.
6. **Tres cerebros:** el estratega `est`, el plan por reglas y el Jefe SEO, además del jefe de operaciones. **La estrategia SEO la firma solo el Jefe SEO.** `seoCoverage` se amplía a «tiene plan maestro», y el jefe de operaciones resuelve el «cómo».
7. **Las líneas rojas siguen igual:** nada sale hacia el cliente ni toca su web sin aprobación.
8. **Huecos técnicos:**
   - `callAI` no admite herramientas, búsqueda web ni esfuerzo.
   - `runAgent` no pasa esfuerzo, y su búsqueda web no tiene lista de dominios.
   - `createJob` solo acepta subagentes.
   - `agt_conversations` no tiene proyecto ni hilo.
   - No hay departamento SEO.
   - `readiness()` no mira GA4, WordPress ni GoHighLevel, y trata Search Console como «asignado y con lastDate».

**Cómo propone la IA desde el día 1 sin perder calidad:**
- **Catálogo y validación por código** (ya existen): la IA elige y parametriza.
- **El puntuador por reglas pasa a ser control:** cualquier divergencia de la IA se enseña con su justificación.
- **Evidencia con identificador:** lo que cita algo inexistente se descarta.
- **Examen del prompt** antes de activarlo.
- **Modo sombra:** planes de la cartera actual que Enric puntúa con una rúbrica.
- **Aprobación de Enric** del plan maestro y de los primeros ciclos.
- **Aprender de sus correcciones:** la diferencia y el motivo van al expediente como «criterio de Enric» y se convierten en casos de examen.
- **Autonomía graduada por métrica.**
- **El plan del día 1 es «preliminar»:** lleva la confianza por frente y se rehace solo cuando maduran los datos.

## 2. Arquitectura del Jefe SEO

| Tarea | Mecanismo | Modelo |
|---|---|---|
| Plan maestro, propuesta de ciclo, revisión trimestral | Una llamada `callAI` sobre un expediente armado por código, con JSON validado y sin herramientas | Opus 5.5, esfuerzo alto |
| Debate con personas | Agente `jefe_seo` del módulo Agentes (`runAgent`) con herramientas de lectura SEO y web | Opus 5.5 |
| Investigador de novedades | Subagente con búsqueda y lectura web | Sonnet 5.5 |
| Ficha y clasificaciones | Lo que ya existe | Haiku |
| Puertas, elegibilidad, horas, calendario, pronóstico, marcadores | Código | — |

**Dónde vive:**
- Departamento nuevo `seo` con el agente `jefe_seo`.
- Las herramientas las publica SEO con `registerTools`.
- La lógica va en `lib/seo/jefe/`.

**Herramientas:**
- De lectura: `seo_expediente_estrategico`, `seo_plan_maestro`, `seo_evidencia` y `seo_pronostico`.
- De cambio: `seo_proponer_cambio_plan`, que solo crea una propuesta pendiente.

**Memoria:** el resumen de cada conversación, `client_memory` del cliente, y en la base de conocimiento la categoría «Criterio SEO de la agencia».

**Debate:**
- Pestaña «Jefe SEO» en el proyecto: chat web con un hilo por decisión (`peer = seo:<proyecto>:<propuesta>`, sin migración).
- Cada propuesta ofrece Aprobar · Ajustar · Debatir · No (motivo). Un cambio acordado crea una versión nueva del plan.
- Telegram, después, con bot propio del departamento.

**Hace solo:** leer, analizar, redactar propuestas, encargar investigación y recalcular el borrador del plan.

**Con aprobación:** activar el plan o un ciclo, el lote del mes, correos al cliente, borradores en WordPress y datos de pago.

## 3. Pipeline «Análisis inicial»

**Funcionamiento:**
- El botón «Empezar análisis» sustituye a «Ponerlo en marcha».
- Un orquestador idempotente (`seo.arranque.avanzar`) se ejecuta al terminar cada trabajo y cada 10 minutos.
- Estados de cada etapa: `pendiente`, `bloqueado`, `en_curso`, `hecho`, `sin_datos` y `omitido` (con quién y por qué).

| # | Etapa | Reutiliza | Puerta | Tiempo y coste [NV] |
|---|---|---|---|---|
| 0 | Conexiones | `gsc_properties`, `client_assets`, `client_connections`, `seo_local_places`, `perf_sync` | Web que responde, Search Console asignado, horas contratadas | Segundos, 0 $ |
| 1 | Web: rastreo, salud, velocidad, estructura, contenido | `salud/audit.ts`, externos, puertas | Rastreo terminado | 10-60 min, ~0 $ |
| 2 | Negocio: expediente y propuesta de ficha | `expediente`, `alta/proposeFicha` | Servicios y zona propuestos (confirmados para aprobar el plan) | Minutos, céntimos |
| 3 | Datos propios: Search Console, GA4, leads | `gsc.sync`, `perf_*`, `clientes.leads` | Clase de Search Console | Horas |
| 4 | Mercado: competencia, demanda, posiciones, local, panel IA | Módulos existentes | ≥ 3 competidores y volúmenes | 1-10 días |
| 5 | Mapa semántico | `seo.mapa.build` | Temas > 0 | Minutos |
| 6 | Diagnóstico y prioridad | `eligibilityContext`, plan por reglas | Expediente completo | Segundos |
| 7 | Plan maestro y ciclo 1 | `lib/seo/jefe/` (Opus) | Validación y examen vigentes | 2-5 min, ~0,5-1,5 $ |

**Orden de prioridad que fija el código:**
1. Rendimiento y errores.
2. Lo que ya posiciona.
3. Huecos de servicio y zona.
4. Contenido nuevo.
5. Autoridad y visibilidad en IA.

La IA puede discrepar, pero tiene que justificarlo.

**Estados de cada conexión:** `conectado`, `conectado_sin_datos`, `falta`, `error` y `no_aplica`.

**Clases de Search Console** (con `gsc_daily_totals`):
- `sin_descargar`;
- `propiedad_nueva` (menos de 28 días);
- `poco_trafico` (menos de 300 impresiones en 90 días);
- `con_datos`.

En pantalla se ve, por ejemplo: «conectado, sin historial (creado hace N días): plan preliminar, se rehará solo el día 28». Sin Search Console se sigue en «modo sin historial», y el mapa se siembra desde la demanda [NV].

**En pantalla:**
- Mapa horizontal de etapas con estado, qué hizo, coste y qué falta, más «Falta: integra X».
- «Continuar sin esto», solo para un admin.
- En el Resumen: «Análisis 5/8 · esperando posiciones».

## 4. Plan maestro y ciclos (migración 0079, aditiva)

**Tablas:**
- **`seo_setup_stages`:** `project_id`, `run`, `stage_key`, `status`, `detail`, `cost_usd` y fechas.
- **`seo_master_plans`:** `project_id`, `version` y `status` (`borrador | sombra | propuesto | aprobado | sustituido | rechazado`). Además `horizon_months`, `starts_on`, `thesis`, `diagnosis`, `confidence`, `data_gaps`, `prompt_version`, `model`, `ai_job_id`, `cost_usd` y aprobación. Un solo plan aprobado por proyecto.
- **`seo_master_plan_items`** (frentes): `plan_id` y `kind` (`rendimiento | existente | servicio_zona | contenido | local | autoridad | visibilidad_ia`). Además `playbook`, `title`, `rationale`, `evidence` (`[{tipo, id}]`), `topic_ids`, trimestres, `priority`, `forecast` y `status`.
- **`seo_jefe_proposals`:** `kind` (`plan | ciclo | revision | cambio`), `payload`, `scorer`, `status`, `decided_by`, `decision_reason`, `edits` y `thread_peer`.

**Columnas anulables:** `seo_cycles.master_plan_id` y `seo_cycle_lines.master_item_id`.

**Prompts:** `seo_jefe_plan_maestro` y `seo_jefe_ciclo`.

**Granularidad:** solo el trimestre siguiente va al detalle (es el ciclo); el resto son frentes por trimestre.

**Generación:**
1. El código arma el expediente con identificadores: H hallazgo, T tema, U URL, Q búsqueda, C competidor, P posición, L local, N novedad con fecha, K conocimiento, X tendencia con n y M criterio de Enric. Lo ajeno va delimitado.
2. Opus devuelve en JSON la tesis, los frentes (línea del catálogo y sus evidencias), los riesgos, lo que no sabe y 2 alternativas descartadas.
3. El código valida: evidencia, elegibilidad, horas y trimestres.

**Pronóstico** (`lib/seo/jefe/forecast.ts`, puro):
- Temas al alcance: impresiones × diferencia de CTR entre bandas, con la curva del proyecto si hay base.
- Contenido nuevo: escenarios sobre la demanda.
- Sin base: «sin base».
- Guarda los supuestos y se calibra a los +90 días. Nunca va al cliente como promesa.

**Versionado:** la versión n+1 se propone al cerrar o leer un ciclo, tras una actualización del núcleo de Google o cuando maduran los datos (días 28 y 90). La versión anterior queda como «sustituido».

## 5. Conocimiento y actualización

**Lo que ya hay:** `seo.id.watch` lee cada 3 h, sin IA, el panel de incidencias y el blog de Search Central, avisa y hace un resumen semanal para la base de conocimiento. Solo usa fuentes oficiales, sin interpretarlas y sin que ningún agente las use como criterio.

**Lo que falta:**
1. Más fuentes RSS en `SEO_SOURCES`: blogs de referencia y fuentes sobre búsqueda con IA. La lista la aprueba Enric.
2. El subagente `seo_investigador` (Sonnet): cada 2-3 días, solo si hay novedades, analiza qué cambia en nuestras líneas y a qué clientes afecta. Lo deja como propuesta para la base de conocimiento, con fecha, nivel (oficial / reputada / rumor) y enlaces.
3. Búsqueda web en el motor de agentes, a 0,01 $ por búsqueda, con lista de dominios permitidos [NV]. El plan no busca en la web: recibe las novedades ya filtradas como N y K.
4. Aprender de los resultados (tendencias con n y «pocos casos») y, más adelante, por línea y sector.
5. Aprender de Enric: las ediciones y los motivos van a «Criterio SEO de la agencia», que él puede editar, y se convierten en casos de examen.

## 6. Control de calidad

**Exámenes:** de 6 a 8 expedientes sintéticos, con estos casos: Search Console vacío, 10 h, local sin ficha, tienda, caída por actualización del núcleo de Google, inyección y dato contradictorio.

Los correctores puros comprueban que no haya evidencias inventadas, que las líneas sean elegibles, que no pase de las horas, el orden de prioridad (o su justificación), que el pronóstico salga solo del código y que reconozca lo que falta.

**Métricas:**
- % de propuestas aprobadas sin editar.
- Minutos de Enric por aprobación.
- % de evidencias descartadas.
- Divergencia con el puntuador.
- Calibración.
- Coste por proyecto.
- Días desde el alta hasta el plan aprobado.

**Topes:**
- Presupuesto mensual del agente.
- 2 generaciones por versión y N turnos por hilo.
- Estimación [NV]: plan ~0,5-1,5 $, turno de debate ~0,10-0,30 $ e investigador ~1-3 $/mes. El vigía tiene hoy 80 $/mes para toda la IA, y subir topes es una línea roja.

**Trazabilidad:** evidencias enlazadas, versión del prompt, modelo, `ai_job_id`, lo descartado y el orden del puntuador.

**Seguridad:**
- La generación va sin herramientas.
- En el debate, `untrustedInput` fuerza la aprobación tras leer la web.
- La única herramienta de cambio solo propone.
- Cada acción lleva su guard y su prueba en `tests/seguridad.test.ts`.

## 7. Fases para Opus 5.5
Protocolo de decisión en D2 (toca `lib/ai`) y en D3 (toca `createJob` y el departamento). Cada fase lleva pruebas, Mapa Visual, ESTADO, documento de sesión y revisor.

| Fase | Qué | Hecho cuando |
|---|---|---|
| **D0** Conexiones y etapas (absorbe la B) | `lib/seo/arranque/` (rules + orquestador), `seo_setup_stages`, mapa de etapas, clases de Search Console, «Continuar sin esto» | Pruebas puras de puertas y de clases; un proyecto nuevo avanza solo y se para donde falta algo |
| **D1** Expediente estratégico y pronóstico | `lib/seo/jefe/expediente.ts`, `forecast.ts`, validación de evidencias, herramientas de lectura | Identificadores estables; pronóstico con rango o «sin base»; 0 $ de IA |
| **D2** Plan maestro en sombra | Tablas, `effort` opcional en `callAI`, prompt y examen, trabajo `seo.jefe.plan`, pantalla «Plan de servicio» (Aprobar · Ajustar · No) | Examen aprobado; planes en sombra de la cartera; Enric puntúa 5 |
| **D3** Jefe SEO y debate | Departamento, agente, herramientas, chat por hilos, `seo_proponer_cambio_plan`, dominios, `maxTokens` | Un debate acaba en versión n+1 propuesta; nada se aplica sin aprobar |
| **D4** Ciclos desde el plan | `seo_jefe_ciclo` propone el ciclo 1 y los siguientes (21 días antes del final); el puntuador hace de control | Propuesto → aprobado → `createCycle`, sin tocar `materialize` |
| **D5** Investigador | Fuentes, subagente, triaje a la base de conocimiento, N en el expediente | Sin novedades no gasta; cada entrada con fecha y nivel |
| **D6** Revisión y aprendizaje (antes E y F) | n+1 automática, calibración, tendencias por línea y sector, autonomía graduada | El informe no afirma causas; «pocos casos» visible |

## 8. Decisiones de Enric (con recomendación)
1. **Qué bloquea el arranque:** la web, Search Console asignado y las horas. GA4, la ficha, WordPress, GoHighLevel y los accesos solo avisan, y un admin puede continuar.
2. **Modo sombra una semana** sobre la cartera antes de enseñarlo al equipo, con 5 planes puntuados por Enric: sí.
3. **Quién aprueba:**
   - El plan maestro, siempre un admin.
   - Los ciclos pasan a un responsable SEO humano cuando más del 70 % de 10 propuestas se aprueben sin editar.
4. **Presupuesto:** un tope propio de 30-40 $/mes para el Jefe SEO, y revisar si alcanzan los 80 $ del vigía.
5. **Fuentes no oficiales del investigador**, y si lo «oficial» se publica solo.
6. **Bot de Telegram del departamento SEO** después de D3.

## 9. Riesgos
- **Planes genéricos pero convincentes:** evidencia obligatoria, «lo que no sé» y la rúbrica.
- **Pronóstico leído como promesa.**
- **Más frentes que horas.**
- **Enric imprescindible por las aprobaciones:** se mide y la autonomía se gradúa.
- **Deriva de coste en los debates.**
- **Pocos datos el día 1.**
- **El debate depende de Anthropic.**
- **[NV]:** costes reales, `allowed_domains`, esfuerzo en el adaptador, mapa sin Search Console y el coste histórico del estratega.
