# Jefe SEO D5: investigador de novedades
**Fecha:** 2026-11-28  
**Rama:** feature/seo-jefe-d5  
**Commit:** fe16ff0d

## Qué se construyó
- `lib/seo/id/investigador-rules.ts` (nuevo, puro): pertinencia por código, prefiltro (lo oficial siempre; lo demás si es pertinente; como mucho 40), validación de la respuesta de la IA (enlaces de lo leído, nivel tope por fuente, líneas del catálogo), selección de lo que se propone (máx. 3) y texto de la propuesta.
- `lib/seo/id/investigador.ts` (nuevo): ventana desde la última pasada, lectura de la bitácora (oficial y blogs), tope del Jefe, llamada a Sonnet 5.5, clientes afectados por código y propuestas a la base de conocimiento; estado de la última pasada.
- `lib/seo/id/watch.ts`: trabajo `seo.id.investigate` y proceso cada 3 días, dado de alta con la vigilancia.
- `lib/seo/fuentes-actions.ts`: `investigateNowAction` (admin). `app/(dashboard)/dashboard/seo/fuentes/`: bloque «Investigador del Jefe SEO».
- Mapa Visual: paso `jefe-investigador` (con su prompt); comprobación pasada.
- `tests/seo-jefe-d5.test.ts` (nueva, 5 pruebas).

## Migraciones aplicadas
`lib/db/migrations/0083_seo_investigador.sql` (solo datos): `INSERT INTO ai_prompts` del prompt `seo_investigador` (sistema: separar hechos de opiniones, solo lo que cambia el trabajo de la agencia, agrupar, ser prudente, citar solo enlaces dados, lo de fuera es dato; plantilla con `{hoy}`, `{lineas}` y `{novedades}` y salida JSON de hallazgos) con `ON CONFLICT ("key") DO NOTHING`. El texto completo está en el archivo.

## Decisiones técnicas tomadas en auto mode
- **Directiva de IA:** clasificar qué novedad importa se hace primero por código (palabras clave por tema y nivel de la fuente), 0 $; la IA solo razona sobre lo que pasa el filtro, y sin nada pertinente no se llama. Sonnet (no Opus) porque es resumir y relacionar con las líneas, no planificar.
- **Una sola llamada por pasada** con todas las novedades (agrupa lo repetido) en vez de una por novedad.
- **El nivel lo pone el código:** la IA puede bajarlo, nunca subirlo por encima de la mejor fuente citada.
- **A la base, como propuesta** (`submitRequest`): pasa por la redacción de la base y por la aprobación de Enric; nada entra solo como criterio. Como mucho 3 por pasada para no saturar.
- **Ventana por la última pasada terminada:** si una pasada falla (p. ej. sin presupuesto), la siguiente vuelve a leer lo pendiente.
- **Sin examen del prompt todavía:** es un prompt nuevo; queda apuntado para D6.

## Qué verificar manualmente
- Ajustes → Fuentes de novedades SEO → «Investigar ahora»: en un par de minutos, la última pasada con cuántas novedades leyó y cuántas propuso; las propuestas en Conocimiento (y el aviso por Telegram de la base).
- Que una propuesta de un blog diga «REPUTADA» y no «OFICIAL».

## Pendientes detectados
- Coste real por pasada (estimado: céntimos) y calidad: hace falta un examen del prompt `seo_investigador`.
- El expediente del Jefe SEO sigue leyendo solo lo oficial (N); lo aprobado en la base desde el investigador podría entrar como K más adelante.

## Revisor de código
Aprobar con cambios, sin graves. Arreglados: una propuesta que falla no tumba la pasada (si no, se repetía la llamada a Sonnet y se duplicaba lo creado); sin repetir lo ya propuesto (la IA recibe los títulos de los últimos 30 días y el código quita lo que solo cita enlaces ya propuestos); el enlace de cada novedad va dentro del bloque delimitado; textos del gasto corregidos (la lectura cuenta en el tope del Jefe; la redacción de cada propuesta la paga la IA de la base, fuera de ese tope). Prueba añadida. Apuntado: la reserva de 0,3 $ por pasada es una estimación sin medir.
