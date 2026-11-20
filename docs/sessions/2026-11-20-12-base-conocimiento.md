# Base de conocimiento (núcleo) y Mapa de contenido del cliente
**Fecha:** 2026-11-20  
**Rama:** feature/jefe-operaciones  
**Commit:** 58b05f57

## Qué se construyó
Enric probó el bot de Sistema (funciona) y se pasó al departamento de Operaciones.

**Decisiones de Enric:**
- El equipo pregunta por el **mismo chat privado de los encargos** (opción A, frente a un bot aparte, un grupo o no hacer nada).
- Orden de respuesta: ficha del cliente → casos ya resueltos → base de conocimiento → IA general → Enric.
- Las respuestas de Enric alimentan una **base de conocimiento propia** que sustituirá al espacio de ClickUp. Los vídeos, por enlace.
- Diseño en `docs/DISENO-JEFE-OPERACIONES.md`. Enric lo aprobó entero:
  - la base va en el núcleo;
  - las escaladas llegan por el chat principal;
  - las respuestas de IA general van con su aprobación, y se aprende de sus ediciones;
  - categorías por defecto;
  - solo publica él, y el equipo envía solicitudes que la IA redacta;
  - el Mapa de contenido va en la ficha del cliente, en la misma migración.

Se construyó la **fase 1**.

**Núcleo (base de conocimiento):**
- `lib/db/schema.ts` + `lib/db/migrations/0056_base_conocimiento.sql`:
  - tablas `kb_categories` y `kb_articles`, con embedding, índice GIN de texto en español e índice único por origen;
  - 6 categorías sembradas;
  - prompt `kb_redactar_entrada`;
  - tipo `mapa_contenido` en `client_assets`.
- `lib/core/knowledge-rules.ts` (puro): estados, orígenes, limpieza de etiquetas y enlaces, detección de contraseñas, categoría por el nombre de ClickUp, fusión de rankings (RRF), revisión anual y validación de la IA.
- `lib/core/knowledge.ts`:
  - categorías, entradas, búsqueda híbrida y embeddings con aviso limitado;
  - solicitudes redactadas por la IA y cambios pedidos por Enric (guarda `ai_draft` y `edit_notes`);
  - aviso a Enric con botones `x:kb:` (Publicar · Cambiar · Más tarde · Descartar);
  - importación (`insertImportedArticles`);
  - herramientas `buscar_conocimiento` y `guardar_conocimiento`;
  - tarea del planificador «base de conocimiento».
- `lib/core/knowledge-actions.ts`: acciones con guard. Proponer pide `view`; todo lo demás, `admin`.
- `lib/app-wiring.ts`: registra la base de conocimiento.

**Operaciones:**
- `lib/operaciones/clickup.ts`: `fetchSpaceTasksForKb`, una consulta de workspace paginada con la descripción en Markdown.
- `lib/operaciones/kb-import.ts` / `kb-import-actions.ts`: importación ÚNICA del espacio de ClickUp a «Para más tarde» (decisión de Enric: después, todo se gestiona en la herramienta). Solo admin. Solo entran tareas con contenido (descripción o adjuntos, con `getTaskAttachments` para las que no tienen descripción); lo alojado en ClickUp queda marcado «vídeo en clickup» y sin el token firmado de la URL. Prueba en local: 167 tareas → 127 importadas, 40 vacías fuera, 77 con archivos en ClickUp, 44 peticiones; repetirla no duplica.
- `lib/operaciones/agent-capabilities.ts`: `mapa_contenido` en el tipo de cuenta del agente.

**Agentes:** `lib/agentes/store.ts`. El Operations manager recibe `buscar_conocimiento` y `guardar_conocimiento` (mejora `2026-11-20-conocimiento`).

**Pantallas:**
- `app/(dashboard)/dashboard/conocimiento/`:
  - lista con pestañas por estado, buscador, categoría, «Proponer una entrada», categorías e importación;
  - `[id]/` y `nueva/`;
  - `article-editor.tsx`: lectura con Markdown sencillo; para admin, editor, «Rehacer con mis cambios», «Volver a redactar», estados y eliminar; avisa de los cambios sin guardar.
- `components/app-shell/nav.ts`: Trabajo → Conocimiento.
- `app/(dashboard)/dashboard/clientes/[id]/ficha-view.tsx`: acceso al Mapa de contenido en la cabecera de los clientes con SEO, o invitación a añadirlo.
- `tab-webs.tsx` y `lib/core/client-rules.ts`: tipo «Mapa de contenido (SEO)».

**Mapa Visual:**
- Nuevo `lib/core/knowledge-process-map.ts` (9 pasos, uno de ellos gris para la fase 2), registrado como nodo «Base de conocimiento» con `detailMapId: 'conocimiento'`.
- `scripts/check-architecture-map.js` comprueba además archivos, tablas `kb_*`, prompts y la tarea del planificador.
- `lib/core/clients-process-map.ts`: menciona el Mapa de contenido.
- La comprobación pasa.

**Pruebas:**
- `tests/conocimiento.test.ts` (14, nuevo).
- `tests/seguridad.test.ts`: las 9 acciones de admin, y proponer sin sesión ni rol.
- `tests/agentes.test.ts`: herramientas nuevas del principal.
- `tests/tiempos.test.ts`: ordena los eventos (fallaba según el orden en que Postgres los devolvía; no tenía que ver con este cambio).
- Pasan 441 de 441.

**Documentación:**
- `docs/ESTADO.md`: §6.29, cabecera, prompts, tablas (112), pendientes, hoja de ruta, cronología y mapa de archivos.
- `docs/PENDIENTES-ENRIC.md` y `docs/DISENO-JEFE-OPERACIONES.md` (estado).

## Migraciones aplicadas
`0056_base_conocimiento.sql`: aplicada en local tras `backups/backup_pre_conocimiento_20261120.sql`. En producción se aplica con `deploy.sh --migrate`, con el OK de Enric.

```sql
CREATE TABLE IF NOT EXISTS "kb_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" varchar(40) NOT NULL,
	"name" varchar(100) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kb_categories_tenant_key_unique" UNIQUE("tenant_id","key")
);
ALTER TABLE "kb_categories" ADD CONSTRAINT "kb_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
CREATE TABLE IF NOT EXISTS "kb_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category_id" uuid,
	"title" varchar(255) NOT NULL,
	"problem" text DEFAULT '' NOT NULL,
	"solution" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(12) DEFAULT 'borrador' NOT NULL,
	"source_type" varchar(12) DEFAULT 'manual' NOT NULL,
	"source_id" varchar(100),
	"source_url" varchar(500),
	"requested_by_name" varchar(255),
	"requested_by_user_id" integer,
	"request_text" text,
	"ai_draft" jsonb,
	"edit_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"awaiting_chat_id" varchar(40),
	"embedding" vector(1536),
	"embedding_model" varchar(80),
	"embedded_at" timestamp,
	"times_used" integer DEFAULT 0 NOT NULL,
	"helpful_count" integer DEFAULT 0 NOT NULL,
	"not_helpful_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp,
	"reviewed_at" timestamp,
	"reviewed_by" integer,
	"created_by" integer,
	"updated_by" integer,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kb_articles_status_check" CHECK ("kb_articles"."status" IN ('borrador', 'propuesta', 'mas_tarde', 'publicada', 'archivada')),
	CONSTRAINT "kb_articles_source_check" CHECK ("kb_articles"."source_type" IN ('manual', 'equipo', 'respuesta', 'clickup', 'dictado', 'agente'))
);
-- Claves foráneas: tenant (cascade), categoría (set null) y requested_by_user_id, reviewed_by, created_by, updated_by → users (set null).
CREATE INDEX IF NOT EXISTS "kb_articles_status_idx" ON "kb_articles" USING btree ("tenant_id","status","updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "kb_articles_source_unique" ON "kb_articles" USING btree ("tenant_id","source_type","source_id") WHERE "kb_articles"."source_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "kb_articles_fts_idx" ON "kb_articles" USING gin (to_tsvector('spanish', coalesce("title", '') || ' ' || coalesce("problem", '') || ' ' || coalesce("solution", '')));
INSERT INTO "kb_categories" ("tenant_id", "key", "name", "sort_order")
SELECT t."id", c."key", c."name", c."sort_order" FROM "tenants" t
CROSS JOIN (VALUES ('seo','SEO',1), ('google_ads','Google Ads',2), ('web','Webs WordPress',3), ('contenidos','Contenidos',4), ('operativa','Operativa interna',5), ('herramientas','Herramientas',6)) AS c("key","name","sort_order")
ON CONFLICT ("tenant_id", "key") DO NOTHING;
ALTER TABLE "client_assets" DROP CONSTRAINT IF EXISTS "client_assets_kind_check";
ALTER TABLE "client_assets" ADD CONSTRAINT "client_assets_kind_check" CHECK ("client_assets"."kind" IN ('web', 'dominio', 'search_console', 'analytics', 'business_profile', 'google_ads', 'meta', 'instagram', 'tiktok', 'linkedin', 'youtube', 'tienda', 'crm', 'mapa_contenido', 'otro'));
INSERT INTO "ai_prompts" (...) VALUES ('kb_redactar_entrada', ...) ON CONFLICT ("key") DO NOTHING;  -- texto completo en el archivo .sql
```

## Decisiones técnicas tomadas en auto mode
- **Estados de las entradas.** Se añadieron `propuesta` y `mas_tarde` para el flujo que pidió Enric: «Más tarde» es la cola de sus horas de conocimiento. Lo importado de ClickUp entra ahí y no en «Pendientes», para no inundar la revisión rápida.
- **Columna `awaiting_chat_id`.** Al pulsar «Cambiar» en Telegram, el siguiente mensaje de Enric tiene que llegar a la entrada correcta. Se guarda el chat en la propia entrada en vez de en un ajuste aparte.
- **Redacción con el modelo configurado (Sonnet), no con Haiku.** El volumen es pequeño y es conocimiento que queda. Haiku la haría más barata si algún día crece (directiva de IA: lo señalo).
- **Búsqueda sin IA de texto.** Embeddings + texto completo con RRF. Si el proveedor de embeddings falla, se desactiva 5 minutos y avisa como mucho una vez por hora: en local, la clave de Gemini da 402 y cada búsqueda habría escrito un error en el registro.
- **Importación sin adjuntos.** Pedirlos sería una petición por tarea. Se guarda el enlace a la tarea original, donde siguen los clips. La categoría sale del nombre de la carpeta o la lista, sin IA.
- **Markdown sin dependencias.** La IA escribe Markdown, así que se hizo un renderizado sencillo (títulos, listas, negrita, cursiva, código, enlaces) con elementos de React, sin `pnpm add` ni HTML.
- **El recuadro «Pedir cambios a la IA»** solo se ve en entradas no publicadas.
- **La revisión por Telegram registra el nombre**, no el usuario (`reviewed_by` queda vacío): el núcleo no sabe qué usuario web corresponde al chat.
- **Arreglo de la prueba de tiempos.** Leía eventos sin ordenar y fallaba según el orden de Postgres. Ahora ordena por hora.
- **Verificación en el navegador como admin.** Se dio rol admin temporal al usuario de pruebas **en la base local** y se le devolvió el rol de editor al terminar. Las 168 entradas de prueba locales (1 propuesta y 167 importadas) se borraron.

## Qué verificar manualmente
- Tras desplegar, en **Trabajo → Conocimiento**:
  - salen las pestañas, con las 6 categorías en el filtro;
  - un editor solo ve «Publicadas» y «Proponer una entrada».
- **Proponer una entrada** con un texto propio: a Enric le llega por Telegram con Publicar · Cambiar · Más tarde · Descartar.
  - «Cambiar» → escribir la indicación → llega una versión nueva.
  - «Publicar» → aparece en «Publicadas».
- **Importar de ClickUp** (espacio «📚 Base de Conocimiento»): unas 167 entradas a «Para más tarde», con 2 o 3 peticiones a ClickUp. Repetirlo no duplica.
- **Buscar** «formulario no envía correos» y una palabra exacta.
- **Por Telegram al Operations manager:** «apunta en la base: …» y «¿qué tenemos en la base sobre …?».
- **Ficha de un cliente con SEO:** en la cabecera sale «Sin mapa de contenido · Añadir el enlace». Tras añadirlo en Webs y cuentas, sale el enlace al Sheet.
- **`docker logs kijutech_app`:** como mucho un aviso «[conocimiento] embeddings no disponibles» por hora, si el proveedor falla.

## Pendientes detectados
- **Fase 2:** jefe de Operaciones que contesta al equipo por su chat, con la tabla de preguntas del equipo (necesita OK de esquema).
- **Fase 3:** triaje de «Bloqueado» con la misma búsqueda y pestaña Huecos de conocimiento.
- **Embeddings sin saldo (402).** La clave de Gemini local no tiene saldo. Si en producción pasa lo mismo, la búsqueda funciona solo por palabras hasta recargarla o configurar otro proveedor de embeddings (Voyage u OpenAI).
- **La importación no trae los Docs de ClickUp** (solo tareas). 25 de las 167 entradas quedan sin categoría.
- **El equipo sin usuario web no puede proponer entradas todavía.** Por Telegram llegará con la fase 2.
- **Mapa de contenido:** más adelante, que el jefe de Operaciones y el estratega lean el Google Sheet (Google Sheets API).
- **Votos «me sirve» / «no me sirve»:** hay columnas y peso en la búsqueda, pero se rellenarán en la fase 2.
- Sigue pendiente lo de la sesión anterior: el texto del paso «Despliegue protegido» del mapa de Seguridad (necesita OK, `lib/auth/`) y el `TimeoutNegativeWarning` de producción.

## Segunda parte (misma sesión): importación única y solo con contenido
- Enric confirmó que la importación de ClickUp es **una sola vez**: después no se escribirá conocimiento en ClickUp. La pantalla muestra «ya importado».
- **Solo entran tareas con contenido.** Las que no tienen descripción se revisan por sus adjuntos y, si no tienen, no entran.
- **Falsos positivos de «contraseña»:** los enlaces de los adjuntos llevan `?token=` / `authz_token=`. La detección ya no mira dentro de los enlaces, y a los enlaces de ClickUp se les quita el token firmado (daba acceso y caduca).
- **Pendiente:** los vídeos siguen alojados en ClickUp. Si se cancela ClickUp, podrían dejar de verse (sin verificar): pasarlos a Google Drive al revisar cada entrada.
