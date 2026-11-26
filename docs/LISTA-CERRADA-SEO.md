# Lista cerrada del módulo SEO definitivo

**Fecha:** 2026-11-26 · **Rama base:** `feature/seo-definitivo` · **Acordada con Enric:** 26 nov 2026.
**Fuente:** `docs/INVENTARIO-SEO.md` (inventario comprobado en el código, 25 nov).

Esta es la lista de trabajo cerrada. Dentro de ella, Claude avanza solo según las «Reglas de autonomía» de `CLAUDE.md`:
- despliega por tandas al cerrar cada parte;
- informa a Enric de cada despliegue;
- solo para en las líneas rojas.

Lo que no está aquí no se construye sin hablarlo antes.

## Decisiones de Enric (26 nov)

| Pregunta | Decisión |
|---|---|
| Orden | El del inventario: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8, y migraciones de web al final |
| Presupuesto de datos de pago | **Hasta 5 $ por proyecto y mes** (DataForSEO, Places, enlaces). Lo que no quepa va **bajo demanda**, con un botón y el coste estimado visible |
| WordPress | **Sí, como parte aparte** (3b, después de Contenido). Publicar **siempre pasa por aprobación**: es un efecto hacia fuera (línea roja 2) |
| Asistente de agosto | **Se retira de la interfaz** cuando el mapa y la parte 2 lo cubran. Antes se hace un backup y no se borra ninguna tabla |

**Pendiente de Enric (no bloquea nada):**
- ¿Hay o habrá clientes con tienda online o en varios idiomas? Hasta que conteste, hreflang entra en la parte 1 como regla barata y la tienda online no entra.
- Proveedor de enlaces (parte 6).
- Clave de Bing.
- Facturación de Gemini (embeddings).
- Clave de PageSpeed/CrUX.

## Cómo se aplica el tope de 5 $ por proyecto y mes

Ningún precio está verificado en esta lista [NV]: se comprueba en la documentación del proveedor antes de construir cada parte y se anota.

- **Contador de gasto de datos por proyecto** (parte 0): cada llamada de pago se apunta con su coste estimado. Al llegar al tope del mes, lo automático se para; lo bajo demanda pide confirmación.
- **De serie** (si cabe en el tope): posiciones semanales de las palabras del plan (como mucho unas 50), ideas de palabras al crear el mapa y una pasada mensual de reseñas y categorías con Places.
- **Bajo demanda:** geo-grid de posiciones en el mapa, todas las palabras de un competidor y perfil de enlaces.
- **Autoridad (parte 6):** si el proveedor exige una suscripción mínima que no cabe en el tope, se deja diseñada y se pregunta a Enric. Contratar un servicio de pago es línea roja.

## Partes

Cada parte se cierra con:
- pruebas (`pnpm test`) y `check-architecture-map`;
- revisor de código;
- Mapa Visual, `ESTADO.md` y documento de sesión;
- fusión en `main` y despliegue por tanda.

Las decisiones no triviales pasan por el protocolo de decisión (3 puntos de vista, 3 alternativas, auditoría con Opus 5.5).

### Parte 0 · Consolidar
- Las comprobaciones de Estrategia que son SEO pasan al módulo SEO, por proyecto y como hallazgos del núcleo:
  - vigilancia crítica (caída, noindex, robots, SSL);
  - salud semanal;
  - velocidad (CrUX);
  - detectores (al alcance, CTR bajo, páginas en caída, consultas nuevas, canibalización).

  Estrategia deja de calcularlas y las **lee** del núcleo.
- Auditoría programada por proyecto, con cadencia editable (panel propio y por proyecto).
- Tarjeta **PageSpeed / CrUX** en Agentes → Integraciones (clave cifrada y probada al guardar). El código lee primero la integración y usa el `.env` como reserva.
- Contador de gasto de datos de pago por proyecto (tope de 5 $ y ajuste editable).
- Retirar de la interfaz el asistente de agosto (con backup previo y sin borrar tablas).

### Parte 1 · Técnico completo
- Comparación entre rastreos.
- Cadenas de redirección y bucles.
- Enlaces rotos hacia fuera.
- Anchors del enlazado interno.
- hreflang y lang.
- Móvil y viewport.
- Contenido mixto.
- robots.txt que bloquea recursos.
- Imágenes.
- CrUX por plantilla.
- Inspección de URL en una muestra.
- Render de JavaScript solo en las páginas sospechosas, si la CPU del servidor lo permite (se mide antes).

### Parte 2 · Demanda y palabras
- Volumen y estacionalidad en el mapa.
- Palabras nuevas a partir de los servicios y de la competencia.
- Intención según la SERP real.
- Dificultad.
- Valor de negocio por tema.

### Parte 3 · Contenido
- Inventario y calidad del contenido.
- Contenido que pierde tráfico → propuesta de actualizarlo.
- Brief según lo que posiciona.
- Optimizar una página frente a las que ganan.
- Enlazado interno sugerido.
- Comprobar lo publicado.

### Parte 3b · Publicar en WordPress
- Contraseña de aplicación por web, guardada cifrada.
- Borrador en WordPress y publicación solo tras la aprobación de Enric.
- Primera web: cm-iberica.

### Parte 4 · Local completo
- Con Places: nota, reseñas y categorías del cliente y de la competencia.
- Geo-grid bajo demanda.
- Citas en directorios.
- Páginas de zona.
- Business Profile cuando Google lo apruebe.

### Parte 5 · Posiciones y visibilidad
- Seguimiento real de las palabras del plan: SERP, paquete local y AI Overviews.
- Cuota de visibilidad.
- Panel de preguntas fijas a asistentes de IA.
- Bing, cuando haya clave.

### Parte 6 · Autoridad
- Perfil de enlaces, huecos frente a la competencia, prospección y enlaces rotos hacia el cliente.
- Bajo demanda, y supeditado al proveedor que elija Enric.

### Parte 7 · Medir y explicar
- ¿Funcionó?: hipótesis frente a resultado.
- Diagnóstico de caídas.
- Atribución.
- Previsión.
- Informe mensual al cliente. Se envía solo con aprobación (línea roja 2).

### Parte 8 · Orquestar y aprender
- Jefe de SEO (agente).
- Cadencias por proyecto.
- Cerebro de I+D, fases B y C.
- Un plan que propone también contenido, local y enlaces.

### Transversal · Migraciones de web
- Rastreo antes y después.
- Mapa de redirecciones.
- Vigilancia de las semanas siguientes.

## Registro de avance

| Parte | Estado | Despliegue | Documento de sesión |
|---|---|---|---|
| 0 | en curso | — | — |
