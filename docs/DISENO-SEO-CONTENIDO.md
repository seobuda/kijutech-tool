# Diseño · SEO parte 9: contenido → WordPress

**Fecha:** 2026-11-27 · **Rama:** `feature/seo-contenido` · **Lista:** parte 9 de `docs/LISTA-CERRADA-SEO.md`: brief, nota, enlazado interno, contenido que pierde tráfico, y publicar con aprobación (WordPress; decisión de Enric: publicar **siempre** pasa por aprobación).

## Lo que ya existe
- **Demanda** (parte 7), en `seo_demand`: intención, tipo de página y URLs del top 10 de las búsquedas principales y de las ideas seguidas.
- **Temas** con su página, sus búsquedas y su valor (mapa).
- **Rastreo:** títulos, H1, H2/H3, palabras, enlaces internos (`crawl_links`).
- **Plan de mejora**, con técnicas de contenido y sus recetas: `nueva_pagina_tema`, `pagina_demanda`, `contenido_ampliado`, `reforzar_pagina_tema`, `enlazado_interno`, `pagina_zona`.
- **Para reutilizar:** `fetchPublic` (núcleo) y el cifrado `lib/ai/encryption.ts`.
- **El «plan de contenido» de agosto** (`content-plan-*`, con IA): retirado de la interfaz; no se reutiliza.

## Piezas
1. **Brief por la SERP real** (sin IA), para una búsqueda (de un tema, una idea o una propuesta del plan).
   - **Lectura:** se descargan las 5 primeras URLs del top 10 que no sean directorios, redes ni la web del cliente (`fetchPublic`, 600 KB cada una) y se extraen sus H2/H3 y sus palabras.
   - **El brief incluye:**
     - búsqueda principal y relacionadas (del tema);
     - intención y tipo de página;
     - palabras recomendadas: la mediana de los 5, acotada entre 300 y 2500;
     - subtemas: encabezados agrupados por palabras (Jaccard ≥ 0,5) que aparecen en 2 o más competidores, ordenados por frecuencia;
     - preguntas: los encabezados que terminan en «?»;
     - URLs de referencia;
     - enlaces internos sugeridos (pieza 3);
     - datos propios del cliente que se deben incluir: servicios, zona y diferencias, sacados de la ficha.
   - **Se guarda** en la tabla nueva `seo_briefs` (migración 0074): proyecto, búsqueda, tema, URL de destino (si mejora una página existente), estado (`borrador`, `listo`, `usado`) y datos jsonb.
   - Se pide a mano desde Palabras (tema o idea) o desde el plan. Coste: 0 $ (lee la SERP guardada; si no la hay, una SERP en directo por 0,002 $ con el tope).
2. **Nota de contenido** (0-100), al abrir un brief con URL de destino. Se descarga la página del cliente y se mide:
   - la cobertura de subtemas (60 %);
   - las palabras frente a la recomendación (20 %);
   - la búsqueda principal en el título y en el H1 (20 %).
   - Muestra lo que falta. Sin IA.
3. **Enlazado interno sugerido**, para una URL de destino y su búsqueda principal:
   - del último rastreo, las páginas indexables cuyo título, H1 o encabezados contienen las palabras de la búsqueda y que **no** enlazan ya al destino (`crawl_links`);
   - como mucho 10, primero las de más clics de GSC;
   - con un texto de enlace sugerido (la búsqueda). Va en el brief.
4. **Contenido que pierde tráfico** (`seo.content_decay`, aviso; técnica `contenido_actualizado`), en los detectores semanales:
   - páginas con 30 clics o más en los 90 días anteriores, que caen un 30 % o más en los últimos 90 días, y también frente al año anterior si hay datos;
   - que no tengan un `page_drop` abierto (ese es el corto plazo).
5. **WordPress con aprobación** (sub-tanda 9b):
   - **Conexión por proyecto** (tabla `seo_wp_sites`): URL, usuario y *application password* cifrada. Se prueba al guardar con `GET /wp-json/wp/v2/users/me`. Permiso `admin`.
   - **«Enviar a WordPress como borrador»:**
     - qué envía: desde un brief `listo` con un texto pegado por una persona, crea una **entrada o página en estado `draft`** (nunca `publish`);
     - permiso y confirmación: permiso `admin` y ventana de confirmación;
     - registro: queda apuntado en el brief, con el id y el enlace de edición de WordPress.
     - Publicar lo hace una persona en WordPress. El sistema nunca publica.
   - **Línea roja 2:** escribir en la web de un cliente es un efecto hacia fuera. Por eso:
     - solo un borrador y siempre por una persona con permiso de administración;
     - Claude no lo prueba contra webs de clientes, solo con pruebas simuladas.

## Puntos de vista
1. **Redactor SEO:**
   - lo que más tiempo ahorra es un brief con los subtemas que Google premia y los datos propios del cliente;
   - la redacción con IA genérica es lo que Google penaliza («contenido útil»).
2. **Arquitecto y costes:**
   - casi todo es gratis (SERP guardada, rastreo, GSC);
   - una tabla para briefs y otra para conexiones;
   - las credenciales, cifradas.
3. **Producto y riesgo:**
   - el borrador en WordPress quita copiar y pegar, pero publicar es del humano;
   - la nota da un objetivo medible al redactor.

## Alternativas
| | Qué | Coste | Riesgo | Se pierde |
|---|---|---|---|---|
| **A. Brief y nota por reglas + borrador en WP con aprobación (elegida)** | Lo descrito | 0-0,002 $ por brief | Subtemas ruidosos en webs con menús raros | Redacción automática |
| B. Brief y redacción con IA (Sonnet) | Texto completo | 0,05-0,20 $ por pieza | Contenido genérico; revisión humana pesada | — |
| C. Herramienta externa (Surfer, Frase, NeuronWriter) | Nota y brief maduros | 30-100 $/mes (sin verificar) | Contratar (línea roja); datos fuera | Integración con el plan |
| D. Solo enlazado y decay, sin brief | Mínimo | 0 | Falta lo más útil | Brief |

## Decisión (hipótesis)
**A**:
- **9a:** brief, nota, enlazado y decay, con la migración 0074 (`seo_briefs`).
- **9b:** conexión con WordPress y borrador, con la tabla `seo_wp_sites` en la misma migración.
- **IA:** un «esquema con IA» opcional a partir del brief queda para después, con su prompt y su examen (directiva de optimización: las reglas primero).

**Pregunta 1. ¿Cumple el objetivo final?** Sí: el sistema prepara el trabajo y la persona escribe (o revisa) y publica.

**Pregunta 2. ¿Qué riesgo oculto tiene?**
- **Webs que bloquean la descarga:** los subtemas salen de menos de 5 competidores; con menos de 2 legibles, no hay subtemas.
- **Las credenciales de WordPress dan acceso a la web del cliente:** solo `admin`, cifradas, y nunca se devuelven al navegador.

**Pregunta 3. ¿Hay algo que ya tengamos y no usemos?** Sí, y se reutiliza: `seo_demand.top10_urls`, `crawl_links`, `fetchPublic`, `textBlocks`, el cifrado de IA y las recetas del plan.

## Auditoría independiente
_(pendiente)_

**Hecha** por un subagente Opus 5.5 con esfuerzo alto. **Veredicto:** la 9a vale con cambios. La 9b (WordPress) tiene dos fallos graves y una decisión de arquitectura pendiente.

**Graves (9b):**
1. **Redirecciones:** `fetchPublic` reenvía `Authorization` en cada redirección, así que la contraseña podría llegar a otro dominio.
2. **Páginas publicadas:** en WordPress, un `POST` sobre una página publicada la cambia en vivo; no existe un «borrador de revisión» de serie.
3. **Regla del núcleo:** `client_assets` dice «NUNCA contraseñas». Además, escribir en la web del cliente roza la línea roja 2. **Lo decide Enric.**

**Importantes:**
- WordPress debería ir en el núcleo (Webs y Ads también publicarán), con un usuario Colaborador y nunca administrador.
- Los H2/H3 de las webs de la competencia llevan menú, pie y barra lateral: hay que quedarse solo con el contenido principal, y lo mismo para contar palabras.
- **Subtemas:** el Jaccard tiene que hacerse sin las palabras de la búsqueda.
- **Nota:**
  - las palabras solo restan por debajo del 50 % de la mediana;
  - un subtema cuenta si aparece en el texto;
  - se muestra lo que falta.
- **Enlazado:**
  - los enlaces de plantilla no cuentan como «ya enlaza»;
  - quitar la zona, las páginas legales, de etiqueta y de paginación;
  - variar el texto del enlace.
- **Contenido que pierde tráfico:**
  - calcularlo siempre (que no se cierre al haber `page_drop`);
  - sin el año anterior, como info;
  - separar las causas: posición, CTR, demanda o redirección.
- **Para el equipo:**
  - copiar el brief con formato;
  - al marcarlo «usado» con la URL publicada, registrar la intervención para que la parte 8 la mida.
- **Menores:**
  - las descargas, como trabajo en cola y respetando robots;
  - las PAA no están guardadas;
  - con pocas webs legibles, decirlo.

## Decisión final, rehecha
- **9b (WordPress): NO se construye.** Queda en `docs/PENDIENTES-ENRIC.md` con las condiciones de la auditoría:
  - en el núcleo;
  - usuario Colaborador;
  - sin redirecciones con credenciales;
  - solo entradas nuevas en borrador;
  - la regla de `client_assets` decidida por Enric.
- **9a** (migración 0074, solo `seo_briefs`):
  - **Núcleo:** `extractMain(html, url)` en `crawl-extract.ts`, aditivo. Devuelve los H2/H3, las palabras y el texto del contenido principal, sin `header`, `nav`, `footer`, `aside`, `form` ni bloques de menú, barra lateral, cookies o widgets.
  - **Brief como trabajo en cola** (`seo.brief.build`):
    - lee el top 10 guardado (o una SERP en directo con el tope) y como mucho 5 webs legibles, respetando robots;
    - subtemas en 2 o más webs (Jaccard ≥ 0,5 sin las palabras de la búsqueda);
    - preguntas, mediana de palabras del contenido principal y datos del cliente;
    - enlazado sugerido.
  - **Nota** (si tiene URL de destino): la lista de subtemas que faltan (cubierto = aparece en el texto), las palabras (solo restan por debajo del 50 %) y la búsqueda en el título y el H1.
  - **Enlazado:** sin enlaces de plantilla (más del 50 % de las páginas), sin páginas legales, de etiqueta, de paginación, sin 200, noindex o con canonical a otra. Tokens del tema sin la zona y texto del enlace variado.
  - **`seo.content_decay`** en los detectores, en su lista de tipos:
    - 30 clics o más en los 90 días previos, −30 % en los últimos 90 frente a los anteriores y frente al año anterior si hay datos; sin año anterior, info;
    - en la evidencia, la causa probable (posición, CTR, demanda o redirección);
    - se calcula aunque haya `page_drop`.
  - **Brief:**
    - estados `borrador`, `listo` y `usado`;
    - «Copiar como texto»;
    - «Usado» pide la URL publicada y registra la intervención (núcleo `recordIntervention` + `markInterventionDone`, aditivo), así la parte 8 la mide.
  - **Pantalla:** Palabras → «Briefs», con botón «Brief» en cada tema e idea.
