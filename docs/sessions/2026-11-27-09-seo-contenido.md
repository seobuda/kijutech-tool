# SEO parte 9a: contenido (briefs, nota, enlazado, contenido que pierde tráfico)
**Fecha:** 2026-11-27  
**Rama:** feature/seo-contenido  
**Commit:** b4db00c1

## Qué se construyó
- `docs/DISENO-SEO-CONTENIDO.md`: diseño, auditoría Opus y decisión rehecha. La 9b (WordPress) no se construye y queda pendiente de Enric.
- **Núcleo:**
  - `extractMain` en `crawl-extract.ts`: contenido principal sin menú, pie, barra lateral ni cookies, con un tope de profundidad;
  - `markInterventionDone` en `interventions.ts`.
- `lib/db/migrations/0074_seo_briefs.sql`, `schema.ts` y el journal: tabla `seo_briefs`.
- `lib/seo/contenido/rules.ts` (puro): `subtopics`, `questions`, `recommendedWords`, `scorePage`, `linkSuggestions` y `contentDecay`.
- `lib/seo/contenido/briefs.ts`:
  - trabajo `seo.brief.build`;
  - `requestBrief`, `retryBrief`, `setBriefStatus`, `markBriefUsed` (registra la intervención) y `listBriefs`.
- `lib/seo/contenido/decay.ts`: `seo.content_decay` en los detectores.
- `lib/seo/contenido-actions.ts`: pedir, estado, reintentar y publicado (permiso `edit`).
- `app/(dashboard)/dashboard/projects/[projectId]/palabras/briefs-panel.tsx` y `page.tsx`: «Briefs de contenido».
- `lib/seo/plan/rules.ts`: receta `contenido_actualizado`. Tipos, técnica y Mapa Visual (paso `briefs`).
- **Pruebas:** `tests/seo-contenido.test.ts`, `tests/seo-plan-recetas.test.ts` y `tests/seguridad.test.ts`. Pasan las 826.
- `docs/PENDIENTES-ENRIC.md`: la decisión de WordPress, con sus condiciones.

## Migraciones aplicadas
`0074_seo_briefs.sql`: `CREATE TABLE seo_briefs` (id, tenant, proyecto, búsqueda, tema, URL de destino, estado con su CHECK, `data jsonb`, URL publicada, error, autor y fechas) y su índice por proyecto. Antes se hizo la copia local `backups/backup_pre_seo9_20261127.sql`.

## Decisiones técnicas tomadas en auto mode
- **WordPress no se construye.** Choca con la regla «nunca contraseñas» del núcleo, roza la línea roja 2 y debería ir en el núcleo. Lo decide Enric.
- **Subtemas:** se comparan sin las palabras de la búsqueda.
- **Nota:**
  - las palabras solo restan si quedan por debajo del 50 %;
  - se muestra lo que falta.
- **Enlazado:**
  - comparación por raíz de la palabra, con un 60 % de las palabras del tema y sin la zona;
  - los enlaces de menú no cuentan como «ya enlaza».
- **Contenido que pierde tráfico:**
  - se calcula siempre, aunque haya un aviso de página en caída;
  - sin datos del año anterior queda como info;
  - incluye la causa probable.

## Revisor de código
Aprobar con cambios, sin graves. Se arregló:
- los briefs que se quedan «preparando» pasan a fallido a los 15 minutos, y se pueden reintentar o archivar;
- una web rara de la competencia ya no tumba todo el brief;
- las descargas tienen tope en streaming;
- solo se aceptan http(s) en los puertos normales;
- si el proyecto no tiene cliente, se avisa de que no se podrá medir.

## Qué verificar manualmente
- Palabras de cm-iberica → «Briefs de contenido» → elige un tema → «Preparar brief». En 1 o 2 minutos aparecen los subtemas, las preguntas y el enlazado, y «Copiar como texto» funciona.
- «Ya está publicada» con una URL de la web: aparece en Plan → Resultados como intervención.

## Pendientes detectados
- Las PAA («la gente también pregunta») no se guardan. Habría que ampliar la SERP del núcleo.
- Esquema del brief con IA (opcional, con su prompt y su examen).
- WordPress, cuando Enric lo decida.
