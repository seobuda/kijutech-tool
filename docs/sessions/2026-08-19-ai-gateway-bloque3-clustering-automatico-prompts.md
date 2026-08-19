# AI Gateway — Bloque 3: clustering automático + gestión de prompts desde panel
**Fecha:** 2026-08-19
**Rama:** feature/ai-gateway
**Commit:** d849c54a

## Qué se construyó

Migración 0013 (SQL confirmado por Enric antes de aplicar):
`ai_prompts(key UNIQUE, name, description, system_prompt, user_prompt_template,
is_active, version, updated_at, updated_by → users.id)`. Sembrado el prompt
inicial `cluster_keywords` tras aplicar.

Gateway (`lib/ai/gateway.ts`):
- `getPrompt(key)`: consulta `ai_prompts` por `key` + `is_active = true`,
  devuelve `{system_prompt, user_prompt_template}` o `null`
- `callAI()` acepta `promptKey?: string` — si se pasa, se consulta el
  prompt solo para dejar constancia en `ai_jobs.input` de qué prompt
  estaba activo en el momento de la llamada (el contenido de los
  mensajes ya lo construye quien llama, no lo reconstruye el gateway)

`lib/ai/prompts/cluster-keywords.ts`: `buildClusteringPrompt()` ahora
devuelve `{system, user}` en vez de un string único, y acepta un
`template?` opcional (el `user_prompt_template` de BD) que sustituye
`{count}` y `{keywords_list}`. Sin template, usa el texto hardcodeado
de siempre como fallback.

**Backend de clustering — `lib/seo/kw-ai-actions.ts` (nuevo archivo,
no `lib/ai/actions.ts`, ver decisión técnica abajo):**
- `analyzeKeywordsWithAI(projectId)`: valida ≥3 keywords, carga el
  prompt de BD (fallback al hardcodeado si no existe/inactivo),
  llama a `callAI()`, parsea la respuesta con el parser del Bloque 1
- `confirmAIClusters(projectId, clusters[], mode)`: transacción que
  inserta en `seo_kw_clusters`/`seo_kw_cluster_keywords`, marca
  `seo_kw_raw.assigned = true`, completa el paso 3 y redirige al
  paso 4 (`redirect()` de Next.js)
- `testAiPrompt(projectId, promptData)`: llamada real de prueba sin
  guardar nada en clusters, usada desde el editor de prompts

**Backend de prompts — `lib/ai/actions.ts` (ampliado):**
- `saveAiPrompt(key, data)`: upsert sobre `ai_prompts`, incrementa
  `version` con `sql\`version + 1\`` en cada edición
- `toggleAiPrompt(key, isActive)`

**Queries (`lib/ai/queries.ts`, ampliado):** `getAiPrompt(key)`,
`getAiPrompts()`, `getAiPromptsWithUpdater()` (con nombre de quién
editó), `getAiJobsMonthlyTotals(tenantId)`, `getActiveProviderForTenant(tenantId)`
(réplica de solo lectura de la resolución de proveedor del gateway,
para mostrar en UI sin intentar una llamada real).

**UI — Paso 3 de Keyword Research
(`.../keyword-research/clustering/`):**
- `clustering-step-client.tsx`: si hay proveedor activo, muestra el
  bloque "✨ Clustering automático disponible" con proveedor/modelo/
  nº de keywords y botón "Analizar con IA"; el flujo manual (panel ya
  existente, sin tocar) queda colapsado debajo bajo "▼ O hazlo
  manualmente con el Tutor". Sin proveedor activo, solo el aviso
  sutil con link a IA & Modelos + el flujo manual sin colapsar
- `cluster-review.tsx`: pantalla de revisión de los clusters
  propuestos — título/URL/dificultad editables inline, checkbox por
  keyword para excluirla, total de búsquedas recalculado al vuelo,
  keywords sin clasificar con selector para asignarlas a un cluster,
  "Eliminar cluster" con confirmación, y el flujo de 3 vías cuando ya
  hay clusters en el proyecto (Añadir / Reemplazar con doble
  confirmación / Cancelar)

**UI — `/dashboard/ai/settings` ahora con pestañas** (`settings-tabs.tsx`,
componente genérico): Keys de plataforma / Precios por modelo / Control
por tenant (las 3 del Bloque 2, sin cambios de lógica) + **Prompts**
nueva (`prompts-section.tsx`: lista con toggle activo/inactivo y quién
hizo la última edición) + pantalla de edición
(`settings/prompts/[key]/page.tsx` + `prompt-edit-form.tsx`: nombre,
descripción, textareas monospace para system/user prompt con las
variables documentadas, toggle activo, sección "Probar prompt" contra
un proyecto real, versión + última edición). **Monitor de uso**
(`usage-monitor.tsx`) fuera de las pestañas, siempre visible: últimas
20 llamadas de `ai_jobs` + totales del mes actual.

## Migraciones aplicadas

`lib/db/migrations/0013_warm_logan.sql`:

```sql
CREATE TABLE "ai_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"system_prompt" text NOT NULL,
	"user_prompt_template" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" integer,
	CONSTRAINT "ai_prompts_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "ai_prompts" ADD CONSTRAINT "ai_prompts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
```

Corregido antes de aplicar (confirmado con Enric): el pedido original
especificaba `updated_by uuid REFERENCES users(id)`, pero `users.id`
es `serial`/`integer` en este esquema (igual que `projects.created_by`).
Una FK `uuid → integer` habría fallado al aplicar la migración —
cambiado a `integer`.

Seed aplicado tras migrar (vía `docker exec -i kijutech_db psql`, con
heredoc — la primera vez sin `-i` el INSERT no llegó al proceso porque
`docker exec` no adjunta stdin por defecto):

```sql
INSERT INTO ai_prompts (key, name, description, system_prompt, user_prompt_template)
VALUES ('cluster_keywords', 'Clustering de Keywords', ...)
ON CONFLICT (key) DO NOTHING;
```

## Decisiones técnicas tomadas en auto mode

- **`analyzeKeywordsWithAI`, `confirmAIClusters` y `testAiPrompt` viven
  en `lib/seo/kw-ai-actions.ts`, no en `lib/ai/actions.ts` como decía
  el pedido.** Las tres leen y escriben tablas del módulo SEO
  (`seo_kw_raw`, `seo_kw_clusters`, `seo_kw_cluster_keywords`) — según
  la regla de arquitectura de CLAUDE.md, "un módulo nunca es importado
  directamente por otro módulo", y poner lógica que manipula tablas
  `seo_*` dentro de `lib/ai/` habría sido exactamente ese cruce.
  La dirección correcta es la inversa: el módulo SEO depende de la
  infraestructura de IA (`callAI`/`getPrompt` de `lib/ai/gateway.ts`,
  que solo conoce tablas núcleo + `ai_*`) como serviría cualquier
  módulo de un servicio compartido, nunca al revés. `lib/ai/actions.ts`
  se quedó solo con `saveAiPrompt`/`toggleAiPrompt`, que sí son CRUD
  puro sobre `ai_prompts` (tabla propia del módulo IA). Esto es una
  desviación real del archivo pedido explícitamente — lo marco aquí
  con relieve por si Enric prefiere otra organización.
- **Bug de Bloque 2 (sanitización de errores de Server Actions en
  producción) replicado en el nuevo código**: `kw-ai-actions.ts` sigue
  el mismo patrón que `lib/ai/actions.ts` — nunca lanza, siempre
  devuelve `{ error }` en el camino de fallo. Verificado en el
  navegador real: con "Ejecutar prueba" del editor de prompts sin
  ningún proveedor activo, el mensaje exacto de `gateway.ts`
  ("No hay ninguna clave de IA activa disponible para este tenant")
  llegó tal cual a la pantalla, y quedó registrado en `ai_jobs` con
  `status = 'failed'` y ese mismo texto en `error`.
- **`confirmAIClusters` es la única acción de esta sesión que sí
  lanza** (indirectamente, vía `redirect()` de Next.js) — es el
  mecanismo estándar de Next.js para navegar desde una Server Action
  y no puede envolverse en el patrón `{error}` sin romper la
  navegación. Estructurado para que `redirect()` quede fuera del
  `try/catch` que atrapa errores reales, de forma que su señal interna
  (`NEXT_REDIRECT`) se propague sin que el `catch` la intercepte por
  error.
- **`callAI({ promptKey })` no reconstruye los mensajes con el prompt
  cargado** — el pedido decía "si se proporciona, carga el prompt
  desde la tabla antes de hacer la llamada" pero `callAI()` ya recibe
  `messages` obligatorio y completo. Interpretación: quien llama
  (`analyzeKeywordsWithAI`) ya construye `messages` con el prompt de
  BD o el fallback *antes* de invocar `callAI()`; pasar `promptKey`
  además solo sirve para que el gateway deje constancia en el job de
  qué prompt estaba activo en ese momento (auditoría), sin
  recalcularlo ni sustituirlo. Lo dejo anotado porque es la parte más
  ambigua del pedido de este bloque.
- **El "system" que devuelve `buildClusteringPrompt()` con un
  `template` de BD se ignora** — cuando hay prompt en BD,
  `analyzeKeywordsWithAI`/`testAiPrompt` usan directamente
  `dbPrompt.system_prompt` (o el que edite el admin sin guardar, en el
  caso de "Probar prompt") y solo llaman a `buildClusteringPrompt()`
  para la sustitución de variables del `user_prompt_template`. Así el
  system prompt editable desde el panel realmente tiene efecto — si
  `buildClusteringPrompt()` devolviera siempre el `system` hardcodeado
  también en el camino con template, editar el System Prompt desde
  `/dashboard/ai/settings/prompts/cluster_keywords` no habría servido
  de nada.
- **`getActiveProviderForTenant()` duplica la lógica de resolución de
  `gateway.ts`** (no la reutiliza) para poder devolver `null` en vez
  de lanzar cuando no hay proveedor — el gateway está diseñado para
  fallar fuerte en una llamada real, pero el paso 3 necesita saber
  "¿hay algo configurado?" sin intentar una llamada. Si en el futuro
  cambia la lógica de resolución del gateway, hay que recordar
  actualizar esta réplica también.
- **Pestañas de `/dashboard/ai/settings` con un componente genérico
  propio** (`settings-tabs.tsx`), no una librería de UI — no había
  ningún componente de tabs en el proyecto todavía y el patrón es
  simple (botones + `hidden` condicional), consistente con cómo ya se
  evitó traer una librería de diálogos en el Bloque 2.

## Qué verificar manualmente

**Ya verificado por mí en el navegador real** (proyecto Abando, con
33 keywords reales importadas de SE Ranking):
1. Pestañas de `/dashboard/ai/settings` — las 4 renderizan
   correctamente, incluida "Prompts"
2. Editor de prompt `cluster_keywords` — todos los campos precargados
   correctamente desde BD, selector de proyecto con "Abando" real
3. "Ejecutar prueba" sin proveedor activo → error real mostrado en
   pantalla ("No hay ninguna clave de IA activa disponible para este
   tenant"), y verificado en BD que quedó registrado en `ai_jobs` como
   `failed` con ese mismo mensaje
4. Monitor de uso — la llamada fallida de la prueba anterior aparece
   en la tabla con badge "Fallido", y el total del mes ("1 llamadas ·
   0 tokens · ~0.0000€") es correcto
5. Paso 3 de Keyword Research sin proveedor activo → aviso sutil
   correcto ("Configura un proveedor de IA en IA & Modelos..."), flujo
   manual existente intacto (regresión: el texto del Tutor y las notas
   ya guardadas de Abando se siguen viendo igual que antes de este
   bloque)

**Pendiente de tu verificación — bloqueado sin una API key real:**
No pude probar "Analizar con IA" de extremo a extremo porque
ninguna key está activada todavía y **no puedo introducir una API key
yo mismo** (política de seguridad: nunca escribo claves en formularios,
aunque me las pases en el chat). Cuando actives una key real en
`IA & Modelos` → "Keys de plataforma", conviene que confirmes:
1. En el paso 3 de Abando, aparece el bloque "✨ Clustering automático
   disponible" con el proveedor/modelo correctos y el recuento de
   keywords (33)
2. "Analizar con IA" → spinner → pantalla de revisión con los clusters
   propuestos, badge del modelo usado y coste estimado
3. Editar un título/URL/dificultad de un cluster propuesto, excluir
   una keyword con su checkbox, reasignar alguna keyword sin
   clasificar (si las hay)
4. "Confirmar y crear clusters" — como Abando ya tiene clusters
   manuales existentes del test anterior, debería aparecer el aviso de
   "Ya tienes X clusters. ¿Qué quieres hacer?" con las 3 opciones
5. Tras confirmar (recomendado probar "Añadir a los existentes" para
   no perder los clusters manuales de Abando), navega automáticamente
   al paso 4 y los nuevos clusters aparecen ahí
6. El monitor de uso en `/dashboard/ai/settings` refleja la llamada
   real (proveedor, modelo, tokens, coste)

## Pendientes detectados

- **Verificación end-to-end de "Analizar con IA" con una key real**
  (ver arriba) — es el pendiente principal de este bloque.
- **`lib/ai/actions.ts` ya no contiene 3 de las 5 acciones que pedía
  el prompt original** (ver decisión técnica arriba) — si esto rompe
  alguna expectativa de organización del proyecto, es fácil de mover
  ahora que está recién construido, antes de que se le añadan más
  funciones encima.
- **Sin rollback de versiones de prompts** (explícitamente fuera de
  alcance de este bloque, según el pedido) — `version` se incrementa
  en cada guardado pero no hay forma de volver a una versión anterior;
  el propio pedido lo marca como "se añade en el futuro si se
  necesita".
- **El histórico de precios (`effective_to`) no se cierra
  automáticamente** al añadir una fila nueva del mismo proveedor+modelo
  — no era parte de este bloque, pero es relevante ahora que el
  monitor de uso muestra coste estimado en base a esa tabla: si se
  cambia un precio sin cerrar el rango anterior, `getModelPricing()`
  del gateway coge la fila con `effective_from` más reciente que ya
  esté vigente, así que en la práctica funciona, pero conviene que lo
  sepas si algún día ves un coste que no cuadra.
