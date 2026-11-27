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
