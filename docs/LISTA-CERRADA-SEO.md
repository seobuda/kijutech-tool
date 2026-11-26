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

## Partes (replanteadas el 26 nov tras la investigación de mercado; aprobadas por Enric)

El detalle, el porqué de cada pieza y la supervisión de Opus están en `docs/INVESTIGACION-SEO-MERCADO.md` §7-§8. El orden anterior (0 a 8) queda sustituido por este.

**Decisiones de Enric (26 nov, tarde):**
- Plan nuevo aprobado.
- Alta de la cartera: **la IA propone y el equipo confirma**.
- Alcance inicial: **3 a 5 clientes de prueba** antes de ampliar.

**Principios:**
- Determinista por defecto; la IA, para juicio y síntesis, marcada «para verificar».
- El tope de gasto se comprueba antes de gastar; se usa la cola asíncrona de DataForSEO.
- Filas compactas: el bruto, comprimido, con retención corta.
- Cada encargo dice cómo y cuándo se verifica.
- Medición honesta: si los datos no bastan, «no concluyente».

| # | Parte | Qué incluye |
|---|---|---|
| ✅ | 0 · Consolidar | Hecho (§6.44) |
| ✅ | 1 · Técnico, tanda 1 | Hecho (§6.45) y velocidad visible (§6.46) |
| 1 | **Técnico 2a + verificación** | `fetchPublic` blindado, columna `facts`, robots contra Googlebot (recursos, sitemap, rastreadores de IA), enlaces externos rotos; «cómo y cuándo se verifica» en la hipótesis de cada encargo |
| 2 | **Alta de la cartera (3-5 proyectos de prueba)** | Lista de comprobación y semáforo «proyecto incompleto». La IA propone web, servicios, zona, coordenadas y competencia, y el equipo confirma |
| 3 | **Informe mensual v1** | GSC, GA4 (con contactos) y trabajo del mes, en borrador. Solo se envía con aprobación (línea roja 2) |
| 4 | **Posiciones (semilla mínima)** | Semilla: temas de GSC + servicio × zona + marca, 50 como máximo y editable. Orgánico, paquete local y AI Overview por coordenadas e idioma. Filas compactas y volumen de lo que se sigue |
| 5 | **Local** | Geo-grid mensual, reseñas propias y de la competencia, vigilancia de la ficha de Google, spam en Maps, conseguir reseñas, citas, páginas de zona con la regla anti-páginas puerta |
| 6 | **Técnico 2b + 2c** | Reglas WordPress (metas duplicadas, soft 404, staging, nofollow, sitemap frente a canonical, datos incoherentes, rastreadores de IA, tecnología, web hackeada) + registro de cambios (tabla propia y protocolo) + páginas de dinero (campos estructurados) |
| 7 | **Demanda** | Volumen, intención y grupos validados con la SERP; valor por tema |
| 8 | **Medir y explicar** | «¿Funcionó?» con la comprobación tras el encargo y la fecha real, diagnóstico de caídas en capas, atribución y previsión |
| 9 | **Contenido → WordPress** | Brief, nota, enlazado interno, contenido que pierde tráfico; publicar con aprobación |
| 10 | **Autoridad** | Tras verificar el precio y la cobertura en 3 webs reales y con el OK de Enric (contratar es línea roja) |
| 11 | **Orquestar, panel de IA mensual y tendencias entre clientes** | Cuando haya unas 50 intervenciones por técnica |
| — | **Migraciones de web** | En cualquier momento después de la parte 6 |

**No se hace:**
- llms.txt;
- reescritura «para GEO»;
- enjambres de agentes;
- redes neuronales de grafos;
- tests A/B en pymes;
- registros del servidor;
- notas GEO de 0 a 100;
- copias completas de la web.

Chromium queda para el futuro departamento de mantenimiento y rendimiento web.

## Registro de avance

| Parte | Estado | Despliegue | Documento de sesión |
|---|---|---|---|
| 0 | hecha | 26 nov (migración 0065) | `docs/sessions/2026-11-26-13-seo-parte0-consolidar.md` |
| 1 (tanda 1) | hecha | 26 nov (sin migración) | `docs/sessions/2026-11-26-15-seo-parte1-tanda1.md` |
| 1 (tanda 2) | siguiente: enlaces externos, recursos bloqueados, fetchPublic blindado | — | — |
