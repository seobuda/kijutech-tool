# Diseño técnico · SEO parte 1: técnico completo

**Fecha:** 2026-11-26 · **Rama:** `feature/seo-parte1` · **Lista:** `docs/LISTA-CERRADA-SEO.md`.

## Qué falta (inventario §1.2) y con qué datos sale

| Comprobación | ¿Hay datos hoy? | Cómo |
|---|---|---|
| Comparar dos rastreos (páginas que desaparecen, noindex nuevo, título o canonical cambiados, estado que empeora) | Sí: se guardan los 3 últimos rastreos | Regla pura sobre `crawl_pages` del rastreo actual y el anterior |
| Cadenas de redirección completas y bucles | Sí: cada salto es una fila con `redirect_to` | Seguir el grafo dentro del rastreo (hoy solo se mira un salto) |
| Anchors del enlazado interno (genéricos, vacíos) | Sí: `crawl_links.anchor` | Regla pura |
| hreflang (recíproco, códigos válidos, autorreferencia) y `lang` | Sí: `crawl_pages.hreflang` y `lang` | Regla pura |
| Viewport móvil | **No** | Extraer `<meta name="viewport">` |
| Contenido mixto (recursos `http://` en una página `https`) | **No** | Extraer los `src`/`href` de img, script, link[stylesheet] e iframe |
| robots.txt que bloquea CSS o JS | **No** (recursos) | Extraer las URLs de CSS y JS y cruzarlas con robots (`parseRobots` del núcleo) |
| Imágenes sin `width`/`height` (CLS) y pesadas | **No** | Extraer el recuento y una muestra de URLs; HEAD a una muestra (≤ 60 por auditoría) para ver el peso |
| Enlaces rotos hacia fuera | **No** (los externos solo se cuentan) | Guardar una muestra de enlaces externos por página; trabajo aparte que comprueba las URLs únicas (≤ 300 por auditoría, HEAD y GET si falla, solo webs públicas) |
| CrUX por plantilla | Sí (clave desde hoy) | Agrupar las URLs por plantilla (primer tramo de la ruta) y pedir CrUX de la más visitada de cada una (≤ 6), dentro de `seo.velocidad` |
| Inspección de URL en muestra | Hecho en la parte 0 (8 por semana) | Nada |
| Render de JavaScript | **No** | Necesita un navegador sin pantalla (Chromium): dependencia nueva y Dockerfile → **línea roja 5, se pregunta a Enric**. Mientras, se mantiene la sospecha `seo.js_rendered` |

## Puntos de vista
1. **Arquitecto.** El rastreador es del núcleo y debe sacar hechos genéricos de la web: viewport, recursos y enlaces externos no son «de SEO», también los usaría una auditoría web o de Ads. Mejor una columna `facts jsonb` aditiva en `crawl_pages`, con un tamaño acotado, que diez columnas o una tabla por módulo.

   **Riesgo:** que la fila crezca. Se limita a unos 8 KB por página con muestras acotadas.
2. **Especialista SEO.** Lo que más casos reales detecta en pymes:
   - páginas que desaparecen o pasan a noindex tras un cambio de la web (la comparación entre rastreos);
   - enlaces rotos hacia fuera;
   - imágenes pesadas;
   - contenido mixto tras pasar a https;
   - hreflang mal hecho en webs catalanas en dos idiomas.

   Los anchors genéricos son menores (info).
3. **Seguridad y costes.** Comprobar enlaces externos es pedir URLs de terceros desde nuestro servidor. Se hace solo con `fetchPublic` (comprueba cada salto: nada de la red interna), HEAD primero, 5 s de tiempo máximo, 4 a la vez, ≤ 300 por auditoría y un User-Agent propio. No cuesta dinero. CrUX es gratis.

## Alternativas para guardar los hechos nuevos
| | Qué | Coste | Riesgo | Se pierde |
|---|---|---|---|---|
| **A. Columna `facts jsonb` en `crawl_pages` (núcleo, aditiva). Elegida** | El extractor añade viewport, recursos, imágenes y externos acotados | Bajo | Tabla del núcleo: aditiva y anulable, el código anterior no la usa | Nada |
| B. Columnas sueltas | 6 o 7 columnas nuevas | Bajo | Más migración cada vez que se añade un hecho | Flexibilidad |
| C. Tabla del módulo SEO + gancho del rastreador | El núcleo llama a un inspector registrado por SEO | Medio | Más piezas; las competidoras también lo necesitarían | Simplicidad |
| D. No guardar: volver a pedir las páginas en la auditoría | | Alto (el doble de peticiones a la web del cliente) | Carga en la web del cliente | — |

**Enlaces externos:** sin tabla. El resultado va a hallazgos `seo.external_broken`, uno por URL rota con las páginas que la enlazan. Una caché en memoria por trabajo evita repetir dominios caídos.

## Decisión (hipótesis) y sus tres preguntas
La alternativa **A**, más reglas puras en `lib/seo/salud/audit-rules-tecnico.ts`, el trabajo `seo.salud.external` para los enlaces externos y el peso de las imágenes, y CrUX por plantilla en `seo.velocidad`. Tipos nuevos:
- `seo.crawl_page_gone`
- `seo.crawl_became_noindex`
- `seo.crawl_title_changed` (info)
- `seo.crawl_canonical_changed`
- `seo.redirect_loop`
- `seo.redirect_chain` (ahora con la cadena completa)
- `seo.anchor_generic` (info)
- `seo.hreflang_not_reciprocal`
- `seo.hreflang_invalid`
- `seo.lang_missing` (info)
- `seo.viewport_missing`
- `seo.mixed_content`
- `seo.robots_blocks_resources`
- `seo.images_no_dimensions`
- `seo.image_heavy`
- `seo.external_broken`
- `seo.cwv_template_slow` (reutiliza `seo.cwv_*` con la plantilla en la evidencia)

**Pregunta 1. ¿Cumple el objetivo final?** Sí:
- cubre el técnico que un SEO revisaría a mano, sin IA;
- la comparación entre rastreos es la base del asistente de migraciones (parte transversal).

**Pregunta 2. ¿Qué coste o riesgo oculto tiene a semanas vista?**
- **Tamaño de `crawl_pages`:** 500 páginas × 8 KB = 4 MB por rastreo y 3 rastreos por proyecto. Aceptable.
- **Peticiones a terceros:** acotadas.
- **Falsos positivos de enlaces rotos:** hay webs que devuelven 403 a los robots. Solo cuentan 404, 410 y los errores de DNS; un 403 o un 429 no.

**Pregunta 3. ¿Hay algo que ya tengamos y no usemos?** Sí, y se aprovecha:
- los 3 rastreos guardados;
- `crawl_links.anchor`;
- `hreflang` y `lang`;
- `parseRobots` y `fetchPublic` del núcleo;
- la fuente de velocidad.

## Pendiente de Enric (línea roja)
- **Render de JavaScript:** añadir Chromium (`playwright-core` + paquete del sistema en el `Dockerfile`), unos 300 MB de imagen y la CPU por medir. Solo se renderizarían las páginas sospechosas (≤ 20 por auditoría). Se pregunta; mientras, no se construye.

## Auditoría independiente
*(se rellena con el resultado)*
