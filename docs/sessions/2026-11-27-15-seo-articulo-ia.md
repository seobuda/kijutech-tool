# SEO: artículo completo con IA desde el brief
**Fecha:** 2026-11-27
**Rama:** feature/seo-articulo-ia
**Commit:** 74668844

## Qué se construyó
- `lib/seo/contenido/article-rules.ts`: lectura de la respuesta (TÍTULO, META, SLUG, `---` y HTML), limpieza del HTML con lista blanca (sin atributos ni enlaces; un H1 pasa a H2), recuento de palabras y slug.
- `lib/seo/contenido/briefs.ts`:
  - `requestArticle` y `writeArticle`, con el trabajo `seo.brief.articulo` (Sonnet 5.5, 16.000 tokens como máximo y 300 s);
  - `briefToWordPress` usa el artículo si existe.
- `lib/core/connections.ts`: el borrador de WordPress acepta slug y extracto.
- `lib/seo/contenido-actions.ts`: `requestArticleAction` (edit).
- `palabras/briefs-panel.tsx`: el botón «Redactar artículo con IA», el estado «Redactando…» con refresco automático y la vista previa en texto plano («Leer el texto» y «Copiar el texto»).
- Mapa Visual: el paso «briefs» declara la IA y el prompt `seo_redactar_articulo`. La comprobación pasa.
- `tests/seo-articulo.test.ts`.
- `docs/ESTADO.md` §6.66.

## Migraciones aplicadas
`lib/db/migrations/0076_seo_redactar_articulo.sql`, solo datos: `INSERT INTO ai_prompts (key 'seo_redactar_articulo', nombre, descripción, system_prompt y plantilla con {cliente} {web} {negocio} {servicios} {zona} {publico} {busqueda} {relacionadas} {intencion} {tipo} {volumen} {palabras} {destino} {subtemas} {preguntas} {falta}, is_active true) ON CONFLICT (key) DO NOTHING`. El texto completo del prompt está en el archivo.

## Decisiones técnicas tomadas en auto mode
- Modelo: **Sonnet 5.5**, elegido por Enric entre Sonnet, Haiku y Opus.
- **Formato de la respuesta:** cabeceras más HTML, en lugar de JSON, para no tener que escapar un HTML largo dentro de un JSON. Si sale algo de menos de 300 palabras se rechaza: mejor fallar que mandar medio artículo.
- **Seguridad del HTML:**
  - Lista blanca y sin enlaces: los enlaces los pone quien revisa.
  - La vista previa del navegador nunca pinta HTML.
- **Sin inventar datos:** los que faltan se marcan `[verificar: …]` y la vista previa lo recuerda.
- **Borrador anterior en WordPress:** el que solo tenía el esqueleto se suelta para crear el nuevo. No se borra nada en la web del cliente.

## Qué verificar manualmente
- En el brief de «clases de kickboxing» de centrosdym:
  - «Redactar artículo con IA» → a los 1-2 min aparece el artículo;
  - «Crear borrador en WordPress» → abrirlo y ver el artículo completo, con su título y su slug;
  - borrar en WordPress el borrador antiguo, el del esqueleto.

## Pendientes detectados
- Un examen del prompt (`registerPromptEvalSuite`) antes de cambiarlo.
- Más variedad de estructuras y mejoras de estilo (Enric: más adelante).
- La estética de la vista previa de las respuestas del panel de IA (Enric).
