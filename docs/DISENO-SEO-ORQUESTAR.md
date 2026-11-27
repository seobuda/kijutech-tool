# Diseño · SEO parte 11: orquestar, tendencias entre clientes y panel de IA

**Fecha:** 2026-11-27 · **Rama:** `feature/seo-orquestar` · **Lista:** parte 11 de `docs/LISTA-CERRADA-SEO.md` («Orquestar, panel de IA mensual y tendencias entre clientes — cuando haya unas 50 intervenciones por técnica»).

## Situación
- **Datos disponibles:** desde la parte 8, cada intervención medida guarda `outcome` con el efecto en logaritmo, su error, el veredicto y los motivos. Todavía hay pocas: la medición empieza 4 semanas después de hecha.
- **Qué pide la lista para la parte 11:**
  1. tendencias por técnica entre clientes;
  2. «orquestar»: que el plan priorice con lo aprendido;
  3. el panel de IA mensual: visibilidad en asistentes de IA, con preguntas fijas repetidas (método Elmo/Limelit de la investigación).

## Piezas
1. **Tendencias por técnica** (núcleo, sin migración): `lib/core/technique-trends.ts`.
   - Agrega las intervenciones medidas de la cuenta, por técnica y, opcionalmente, por tipo de negocio. Para cada técnica:
     - n medidas, n que funcionaron, no funcionaron y no concluyentes;
     - efecto combinado por varianza inversa (`Σ e/se²` / `Σ 1/se²`) y su error;
     - sin «no medible» y sin las que tienen `confounders`.
   - **Etiqueta honesta:**
     - con menos de 5 casos, «pocos casos»;
     - de 5 a 49, «tendencia»;
     - con 50 o más, «aprendizaje».
   - **Pantalla:** «Tendencias por técnica» en el I+D del departamento SEO, o en el panel del proyecto si no hay página propia.
2. **Orquestar** (SEO, plan): la prioridad de una propuesta se multiplica por el efecto aprendido de su técnica, **solo con 50 casos o más** y acotado a [0,8, 1,25], para que un dato ruidoso no hunda una técnica. Con menos casos, factor 1 y se dice «sin datos suficientes». La hipótesis de cada intervención nueva pasa a llevar `priorEffect` si existe.
3. **Panel de IA mensual** (visibilidad en asistentes de IA): **no se construye ahora.**
   - Pide un proveedor nuevo (DataForSEO AI Optimization o las API de ChatGPT, Perplexity y Gemini) con coste por pregunta, y decidir las preguntas por cliente.
   - Contratar o activar un servicio de pago nuevo es la línea roja 2.
   - Se deja diseñado:
     - de 10 a 20 preguntas fijas por proyecto, sacadas de los temas con más valor;
     - una vez al mes;
     - respuestas guardadas en bruto;
     - para cada respuesta, si se cita a la marca o la web, y a qué competidores.
   - Pasa a `docs/PENDIENTES-ENRIC.md` con el coste estimado sin verificar.

## Puntos de vista
1. **Analista:** con menos de 50 casos, cualquier «la técnica X funciona» es ruido. Hay que enseñar n y el intervalo.
2. **Arquitecto:**
   - la agregación es del núcleo (las intervenciones lo son);
   - el multiplicador del plan, de SEO;
   - no hace falta tabla: se calcula en cada consulta (pocas filas).
3. **Producto:**
   - el equipo ve qué técnicas están dando resultado en sus clientes;
   - el plan se ajusta solo cuando hay datos de verdad.

## Alternativas
| | Qué | Riesgo |
|---|---|---|
| **A. Agregación por varianza inversa + multiplicador acotado solo con 50+ (elegida)** | Lo descrito | Heterogeneidad entre clientes |
| B. Modelo jerárquico bayesiano | Más rigor | Dependencias; pocos datos |
| C. Que la IA resuma qué funciona | Texto | Inventa |
| D. No orquestar hasta tener datos | 0 | No queda preparado |

## Decisión (hipótesis)
**A** sin migración. El panel de IA queda diseñado y pendiente de Enric (proveedor y coste).

**Pregunta 1. ¿Cumple el objetivo final?** Sí. El sistema aprende de sus propios resultados con prudencia y la persona ve los números.

**Pregunta 2. ¿Qué riesgo oculto tiene?** Sesgo de selección: solo se miden las técnicas que se hacen, y en las webs donde se hacen. Se dice en la pantalla.

**Pregunta 3. ¿Hay algo que ya tengamos y no usemos?** Sí: el `outcome` de la parte 8 ya guarda `effectLog` y `se`.

## Auditoría independiente
_(pendiente)_

**Hecha** por un subagente Opus 5.5 con esfuerzo alto. **Veredicto:** el enfoque se mantiene, pero no se podía implementar tal como estaba.

**Graves:**
1. Sin criterio de validez entraban efectos sesgados (tendencias no paralelas, páginas nuevas). Solución: `valid` en cada punto de control.
2. **Doble conteo:** se contaban varios puntos de control por intervención y los confounders crecían. Solución: un solo punto por intervención, el primero ≥ ventana de la hipótesis, con los confounders dentro.
3. Se mezclaban métricas. Solución: agrupar por técnica + métrica + versión, y usar clics como moneda común para orquestar (`clicksEffectLog`).
4. El multiplicador cambiaría la prioridad. Solución: que solo ordene dentro de cada prioridad.

**Importantes:**
- `se ≈ 0`: poner un suelo de 0,05 y sumar τ².
- **Dependencia y heterogeneidad:** media por cliente y luego DerSimonian-Laird entre clientes. Exigir n ≥ 50 y 10 clientes.
- El tipo de negocio, solo informativo.
- **Factor centrado y contraído hacia la media**, y fuera las técnicas que nacen de una caída (regresión a la media).
- **`priorEffect`:** añadirlo al tipo y copiarlo.

**Menores:**
- versión de taxonomía;
- excluir `source='estrategia'`.

**Panel de IA:**
- condiciones: varias muestras, búsqueda web y ubicación, detección de la marca con código, y el tope de gasto;
- coste orientativo (sin verificar): de 0,15 a 2 $ al mes por proyecto;
- el bloqueo es el presupuesto y elegir las preguntas.

## Decisión final, rehecha (sin migración)
- **Núcleo (`measure.ts`):** cada punto de control guarda `valid` (sin motivos de calidad), `clicksEffectLog`, `clicksSe` y `confounders`. El `se` tiene un suelo de 0,05.
- **Núcleo (`technique-trends.ts`, puro + consulta):**
  - qué entra: un punto por intervención (el primero ≥ `windowDays`), solo `valid`, sin confounders, sin `source='estrategia'`;
  - cómo se agrega: por técnica + métrica + versión de taxonomía, con la media por cliente y luego DerSimonian-Laird entre clientes;
  - etiqueta: «pocos casos» (< 5), «tendencia» (5 a 49 o menos de 10 clientes) y «aprendizaje» (≥ 50 y ≥ 10 clientes).
- **Factor del plan** (`planFactors`):
  - solo con «aprendizaje», en clics;
  - centrado en la media de las técnicas con aprendizaje y acotado a [0,8, 1,25];
  - sin las técnicas que nacen de una caída: `titulo_reescrito`, `recuperar_pagina`, `contenido_actualizado`, `optimizar_al_alcance`, `meta_descripcion`.
- **Plan:** `buildPlan` recibe el factor y lo usa solo para ordenar dentro de cada prioridad. Hoy es 1 en todas, porque no hay datos.
- **Pantalla:** Plan → «Resultados» añade «Tendencias por técnica en todos los clientes», con n, clientes, efecto e intervalo, la etiqueta y el aviso de sesgo.
- **Panel de IA:** a `docs/PENDIENTES-ENRIC.md` (presupuesto y preguntas).
