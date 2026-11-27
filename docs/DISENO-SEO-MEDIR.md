# Diseño · SEO parte 8: medir y explicar

**Fecha:** 2026-11-27 · **Rama:** `feature/seo-medir` · **Lista:** parte 8 de `docs/LISTA-CERRADA-SEO.md`:
- «¿Funcionó?», con la comprobación tras el encargo y la fecha real;
- diagnóstico de caídas en capas;
- atribución y previsión.

## Lo que ya existe
- **Intervenciones** (núcleo `interventions`):
  - técnica, URLs, búsquedas e hipótesis (métrica, dirección, ventana, `verify`);
  - `status` (prevista → hecha, con `done_at` desde la fuente de trabajo);
  - `outcome` y `measured_at`, que están vacíos: se dejaron preparados para esto.
- **Registro de cambios** (`seo_change_log`, parte 6): la fecha real del cambio en la web.
- **Search Console** con detalle diario por página y búsqueda (`gsc_daily`).
- **Hallazgos** que se resuelven solos al reauditar.
- **Detectores semanales:** páginas en caída, no indexadas y hackeo.
- **Vigilancia:** web caída, dinero, velocidad. **Posiciones:** caída del top 10 y salida del mapa.

## Piezas
1. **Fecha real de cada intervención** (`effective_at`, en `outcome`; sin columna nueva en el núcleo):
   - es el primer cambio del registro en sus URLs después de crearse la intervención;
   - si no hay ninguno, `done_at`;
   - se guarda de dónde sale: `registro` o `encargo`.
2. **«¿Está hecho?»:**
   - según `verify.check`, a los N días de la fecha real: con `reauditoria`, sus hallazgos están resueltos; con `velocidad`, mejora la medición; con `gsc`, consta el cambio publicado en el registro;
   - resultado: `hecho`, `no_hecho` o `sin_datos`.
3. **«¿Funcionó?»** (diferencias en diferencias, sin IA):
   - **Medición:** en la ventana de la hipótesis tras la fecha real, la métrica de sus URLs en Search Console (clics, impresiones o posición) frente al mismo número de días antes, comparada con un **grupo de control**. El control son páginas del mismo proyecto sin intervención en ese periodo y con tráfico parecido (como mucho 20).
   - **Efecto** = cambio de las tratadas − cambio del control.
   - **Veredicto:**
     - `funcionó` si el efecto va en la dirección prevista y supera un umbral (±15 %) con un mínimo de datos (≥ 100 impresiones antes);
     - `no_funcionó` si va al revés;
     - `no_concluyente` si hay pocos datos o el efecto es pequeño.
   - Proceso del núcleo `core.interventions.measure` (diario): mide las que vencieron. Lo hace el núcleo, no el módulo, porque las intervenciones son del núcleo y la métrica es de GSC (núcleo). Guarda `outcome` y `measured_at`.
   - **En la pantalla:** pestaña Plan → «Resultados», con cada encargo hecho, su veredicto y los números. Además, el total por técnica: n, funcionó, no funcionó, no concluyente. Es «tendencia», no «aprendizaje», hasta tener unas 50.
4. **Diagnóstico de caídas en capas:**
   - **Cuándo:** si los clics de 28 días del proyecto caen un 20 % o más frente a los 28 anteriores (y frente al año anterior si hay datos), se genera un diagnóstico.
   - **Capas, en orden:**
     1. **técnica:** web caída, páginas de dinero con aviso, regresiones, hackeo;
     2. **indexación:** páginas no indexadas, noindex nuevos en el registro;
     3. **cambios en la web:** el registro en la ventana (título, canonical, contenido, plantilla);
     4. **posiciones:** caídas del top 10, salida del mapa, AI Overview nuevo en búsquedas propias;
     5. **demanda:** impresiones frente al año anterior o volumen (si cae la demanda, no es culpa nuestra);
     6. **CTR:** impresiones estables pero menos clics, por AI Overview o cambio de título.
   - **Resultado:** las capas con evidencia, en orden, y un texto corto hecho con plantillas, no con IA. Hallazgo `seo.traffic_drop_diagnosed` (importante) con la evidencia; fuente `seo.vigilancia:diagnostico`, en los detectores semanales.
5. **Atribución y previsión:** van a la parte 12 (panel en vivo, con los contactos de GoHighLevel y GA4 de Rendimiento por el núcleo). SEO no puede leer las tablas de Rendimiento, que son otro módulo. Aquí solo se deja, en cada intervención medida, el **clic incremental estimado** (efecto × clics base), que la parte 12 convertirá en contactos.

## Puntos de vista
1. **Analista de datos SEO:**
   - sin control, todo «funciona» o «no funciona» por temporada;
   - con diferencias en diferencias y un mínimo de datos se evita el autoengaño;
   - «no concluyente» es una respuesta válida y frecuente.
2. **Arquitecto:**
   - medir es del núcleo (intervenciones y GSC), para Ads y web en el futuro;
   - el diagnóstico es de SEO (usa hallazgos, el registro y las posiciones);
   - no hace falta tabla nueva: `outcome` jsonb y `findings`.
3. **Producto (Enric y el equipo):**
   - lo que importa es poder decir al cliente «hicimos X y pasó Y»;
   - y saber por qué cae una web sin pasar una tarde mirando gráficos.

## Alternativas
| | Qué | Coste | Riesgo | Se pierde |
|---|---|---|---|---|
| **A. DiD con control del mismo proyecto + diagnóstico por capas con reglas (elegida)** | Lo descrito | 0 | Control imperfecto (otras páginas pueden estar afectadas) | — |
| B. CausalImpact / modelos bayesianos | Más rigor | Dependencia nueva (Python/R) | Línea roja de dependencias; poco dato | Simplicidad |
| C. Antes/después sin control | Simple | 0 | Temporada y algoritmo confundidos | Fiabilidad |
| D. IA que explica la caída | Texto bonito | Coste por proyecto | Inventa causas | Trazabilidad |

## Decisión (hipótesis)
**A**, sin migración:
- **núcleo:** `measureInterventions` + reglas puras;
- **SEO:** diagnóstico en los detectores.

**Pregunta 1. ¿Cumple el objetivo final?** Sí: el sistema mide lo que hace y explica las caídas; la persona revisa.

**Pregunta 2. ¿Qué riesgo oculto tiene?** El control puede contaminarse (una actualización de Google afecta a todas). Se mitiga con el umbral y con «no concluyente». Las URLs de la intervención pueden no tener datos en GSC (páginas nuevas): entonces se mide desde 0 y se marca «página nueva».

**Pregunta 3. ¿Hay algo que ya tengamos y no usemos?** Sí: `outcome` y `measured_at`, que estaban vacíos, el registro de cambios y los hallazgos de todas las fuentes.

## Auditoría independiente
_(pendiente)_

**Hecha** por un subagente Opus 5.5 con esfuerzo alto. **Veredicto: la dirección es buena, pero no estaba lista.**

**Graves:**
1. El núcleo leería tablas de SEO (`seo_change_log`, `seo_speed_checks`). Hace falta una capacidad por dominio que el módulo registre.
2. El signo de «posición» está invertido: con `direction` «sube», una mejora de posición es un número que baja.
3. Hay regresión a la media en las páginas que acaban de caer (`recuperar_pagina`, «al alcance»): saldrían como «funcionó» casi siempre. Hacen falta un control con tendencia previa parecida y una prueba de tendencias paralelas.
4. Faltaba el CTR. Además, la posición media mezcla búsquedas. Hace falta una cesta fija de búsquedas, ponderada por las impresiones del periodo anterior.

**Importantes:**
- La fecha real es un **intervalo** (entre rastreos): hay que excluirlo de las ventanas, más 7 días de reindexación, y filtrar por el campo que toca la técnica.
- Las técnicas de toda la web o de la ficha y el mapa no se miden con GSC por página: son «no medibles» por esta vía.
- El control es «el resto de la web», sin las páginas tratadas, con otras intervenciones o con cambios registrados.
- Una página nueva tiene un valor previo de 0: no se puede dividir.
- El umbral necesita una serie semanal (4 semanas o más antes y después), una prueba estadística y mínimos por métrica. «No funcionó» exige el mismo umbral, en contra.
- Las búsquedas anónimas no están en `gsc_daily`: los totales salen de `gsc_daily_totals`.
- Contaminación: guardar las intervenciones que se solapan (`confounders`).
- **Diagnóstico de caídas:**
  - umbrales: un mínimo de 200 clics, y la caída debe darse frente al mes anterior y también frente al año anterior;
  - tiempos: cerrar la ventana 2 días antes del último dato y no ejecutar con datos de más de 4 días;
  - qué cuenta como causa: solo la evidencia que empezó cerca de la caída, y la demanda primero;
  - orden: va al final de los detectores;
  - repetición: clave por episodio, con histéresis (abre con −20 % y cierra por encima de −10 %).
- `outcome` debe fusionar con lo que ya había (`checkpoints`) y guardar el efecto en logaritmo con su error, para la parte 11.

## Decisión final, rehecha (sin migración)
- **Núcleo:**
  - `registerInterventionEvidence(domain, { effective, isDone })` en `capabilities.ts`;
  - reglas puras `lib/core/measure-rules.ts`: serie semanal, DiD en logaritmo, prueba t, tendencias paralelas, normalización «sube = mejora» y técnicas no medibles;
  - `lib/core/measure.ts`: proceso diario `core.interventions.measure`.
- **Cómo se mide:**
  - métricas: clics e impresiones por página; posición y CTR por una cesta fija de búsquedas;
  - control: el resto de la web;
  - ventanas: 4 a 8 semanas antes y después, sin el intervalo dudoso más 7 días;
  - mínimos: 30 clics antes para clics, 300 impresiones para impresiones y 100 impresiones de la cesta para posición y CTR;
  - veredicto: |efecto| ≥ 15 % y t ≥ 2 en la dirección prevista da `funcionó`; lo mismo en contra da `no_funcionó`; si no, `no_concluyente`. Si las tendencias previas no son paralelas, `no_concluyente`.
  - `outcome.checkpoints` a los 28, 56 y 90 días tras la fecha real.
- **SEO:** proveedor de evidencia `lib/seo/medir/evidence.ts`:
  - `effective`: el registro de cambios filtrado por el campo de la técnica;
  - `isDone`: los hallazgos ligados resueltos o el cambio registrado.
- **Diagnóstico** (`lib/seo/medir/diagnostico.ts` + reglas): al final de los detectores, con las condiciones de arriba. Hallazgo `seo.traffic_drop_diagnosed` (importante), fuente `seo.vigilancia:diagnostico`, con una foto de las capas en la evidencia.
- **Pantalla:** Plan → «Resultados», con cada intervención medida y su veredicto, más el total por técnica, indicado como «tendencia».
- **Hecho sin encargo:** queda para después (`requestRef` nulo).
