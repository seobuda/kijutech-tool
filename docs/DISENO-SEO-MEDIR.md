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
