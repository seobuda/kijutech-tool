# Fase C — Keyword Research: proceso guiado + mapa de clusters + vista pública
**Fecha:** 2026-08-18
**Rama:** feature/fase-c-keyword-research
**Commit:** 0d021f25

## Qué se construyó

Primera sesión de la Fase C. Un único commit sustantivo (0d021f25) sobre una rama nueva creada al inicio de la sesión (con backup previo en `backups/backup_pre_fase_c.sql`), tal como pedía el prompt.

**Esquema (6 tablas, migración 0009):**
- Las 5 tablas especificadas por Enric: `seo_kw_competitors`, `seo_kw_raw`, `seo_kw_clusters`, `seo_kw_cluster_keywords`, `seo_share_tokens`
- `seo_kw_progress` (propuesta evaluada y confirmada antes de tocar el schema): trackea cada uno de los 4 sub-pasos por proyecto (`step` + `status` + campos específicos de cada paso — `target_keyword`, `notes`, `instructions_text`, `tutor_text`), sin tocar `seo_stage_progress` ni su unique constraint

**Backend (`lib/seo/`):**
- `kw-queries.ts` / `kw-actions.ts`: todas las queries y actions pedidas (competidores, keywords en bruto, clusters, keywords de cluster, tokens de compartición), con el mismo patrón de verificación de tenant que el resto del módulo (`assertUserInProjectTenant`, ahora exportado desde `actions.ts` para reutilizarlo)
- `kw-instructions.ts`: genera el bloque de instrucciones de SE Ranking (paso 1) y el prompt del Tutor (paso 2); calcula el tráfico estimado (`total_volume * 0.28`)
- `syncKeywordResearchStageStatus`: tras cada cambio de sub-paso, recalcula y sincroniza el estado general de la etapa `keyword_research` en `seo_stage_progress` (pending si nada empezado, in_progress si algo empezado, completed si los 4 pasos completados) — así el nav principal de 8 etapas sigue coloreando el icono correctamente sin lógica duplicada

**Wizard anidado:**
- `keyword-research/layout.tsx` + `kw-wizard-shell.tsx` + `kw-steps-nav.tsx`: réplica del patrón nav+asistente del wizard principal, pero para los 4 sub-pasos, con bloqueo de navegación (3 competidores → desbloquea paso 2, 10 keywords → desbloquea paso 3, paso 3 completado → desbloquea paso 4) y mensaje explicativo en cada paso bloqueado
- Los 4 pasos (`competitors/`, `keywords/`, `clustering/`, `clusters/`), cada uno con Guardar progreso / Marcar paso como completado / Reiniciar paso (con confirmación)
- Paso 4 (`clusters/`): grid de clusters con filtros por estado, menú ⋮ (cambiar estado / editar / eliminar), gestión de keywords inline con keyword principal exclusiva, tráfico estimado automático, botones "Ver como cliente" y "Copiar enlace del cliente"

**Vista pública** (`/share/[token]/keyword-research`, sin autenticación): timeline por fases de 3 clusters + grid de solo lectura, filtrado a clusters `active`/`completed`, sin notas internas ni acciones — página standalone fuera del grupo `(dashboard)`, sin chrome del panel

**Conectado al resto del wizard:** `seo-wizard-nav.tsx` ahora incluye `keyword_research` en `FUNCTIONAL_STAGES` (ya no "Próximamente"); `modules/seo/manifest.json` añade `"path": "keyword-research"` a ese stage (key en snake_case por convención de BD, URL en kebab-case) y `lib/seo/manifest.ts` soporta ese campo opcional.

**Knowledge cards:** `seed-knowledge-cards-keyword-research.sql` con las 6 cards pedidas, ejecutado dentro del contenedor (verificado: 6 filas en `stage_key = 'keyword_research'`).

## Migraciones aplicadas

**0009_burly_princess_powerful.sql** (SQL completo mostrado a Enric antes de aplicar, backup previo confirmado):

```sql
CREATE TABLE "seo_kw_cluster_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cluster_id" uuid NOT NULL,
	"keyword" varchar(255) NOT NULL,
	"monthly_volume" integer,
	"difficulty" integer,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "seo_kw_clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"target_url" varchar(500),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"difficulty" varchar(20),
	"client_note" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "seo_kw_competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"url" varchar(500) NOT NULL,
	"target_keyword" varchar(255) NOT NULL,
	"position" integer,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "seo_kw_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"step" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"target_keyword" varchar(255),
	"notes" text,
	"instructions_text" text,
	"tutor_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "seo_kw_progress_project_id_step_unique" UNIQUE("project_id","step")
);
CREATE TABLE "seo_kw_raw" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"keyword" varchar(255) NOT NULL,
	"monthly_volume" integer,
	"assigned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "seo_share_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"token" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seo_share_tokens_project_id_unique" UNIQUE("project_id"),
	CONSTRAINT "seo_share_tokens_token_unique" UNIQUE("token")
);
-- + 6 ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY (todas ON DELETE CASCADE)
```

Backup previo: `backups/backup_pre_fase_c.sql`.

## Decisiones técnicas tomadas en auto mode

- **`seo_kw_progress` como 6ª tabla en vez de tocar `seo_stage_progress`**: evaluado explícitamente y confirmado por Enric antes de tocar el schema (ver pregunta al usuario al inicio de la sesión). Motivo: añadir un `sub_step` a `seo_stage_progress` habría cambiado su unique constraint, arriesgando las 3 etapas que ya funcionan en producción (onboarding/kickoff/audit).
- **`target_keyword` es NOT NULL por competidor pero solo hay un input en la UI**: el schema pedido tiene `target_keyword` en cada fila de `seo_kw_competitors`, pero la UI solo pide la keyword objetivo una vez, al inicio del paso. Se resolvió con `saveTargetKeyword` guardando el valor a nivel de paso (en `seo_kw_progress`), y `addKwCompetitor` heredando ese valor automáticamente en cada competidor nuevo — lanza error si se intenta añadir un competidor sin haber guardado antes la keyword objetivo.
- **`[ubicación del proyecto]` en las instrucciones de SE Ranking se deja como placeholder literal**: la tabla `projects` (núcleo) no tiene ningún campo de ubicación/ciudad. En vez de inventar un dato o reutilizar un campo no relacionado (`domain`, `clientName`), el texto generado conserva el placeholder entre corchetes tal cual, para que Enric lo rellene a mano al copiar las instrucciones. Ver "Pendientes detectados".
- **"Fecha de última actualización" en la vista pública**: ningún cluster tiene columna `updated_at` (solo `created_at`, tal como se especificó en el schema). Se aproxima con el `created_at` más reciente entre todos los clusters del proyecto — no refleja ediciones posteriores (cambios de estado, notas), solo altas.
- **Reset del paso 4 borra todos los clusters**: a diferencia de "Reiniciar etapa" en Onboarding (que solo desmarca, no borra), el reset del paso 4 sigue el precedente de Kickoff/Radiografía en Fase B (que sí borran los datos) por consistencia con "empezar de cero". Dado que es el paso más destructivo de toda la sesión (borra el propio mapa de clusters, que además es lo que ve el cliente), el `confirm()` incluye explícitamente "Esta acción no se puede deshacer" en el texto, a diferencia de los confirms más genéricos de los otros 3 pasos.
- **El asistente del nav principal (8 etapas) se oculta al entrar en Keyword Research**: como Keyword Research tiene su propio nav+asistente anidado (para responder al foco de sus propios 4 pasos), mostrar también el asistente del nivel superior habría duplicado el panel "Asistente Kijutech" en pantalla. Se resolvió con una comprobación en `seo-wizard-shell.tsx`: si la etapa activa es `keyword_research`, no se renderiza el `SeoAssistantPanel` de ese nivel.
- **Sincronización de listas locales tras server actions**: varias actions que antes no devolvían nada (`addKwCompetitor`, `completeStep1`, `completeStep2`, `createKwCluster`, `addClusterKeyword`, etc.) se cambiaron para hacer `.returning()` y devolver la fila creada/actualizada, evitando depender de `router.refresh()` para reflejar cambios en componentes cliente con estado local (el `useState` de un componiente ya montado no se resetea solo porque sus props cambien tras un refresh).

## Qué verificar manualmente

- **Navegación y bloqueos**: entra en un proyecto → "Keyword Research" debe ser clickable en el nav (ya no "Próximamente"). Al entrar, redirige al paso 1. Los pasos 2, 3 y 4 deben aparecer bloqueados (con candado y mensaje) hasta cumplir sus condiciones.
- **Paso 1**: guarda una keyword objetivo, añade 3+ competidores (nombre + URL + posición), edítalos, elimina uno con confirmación. Marca el paso como completado → debe generar y mostrar el bloque de instrucciones para SE Ranking con botón "Copiar instrucciones", y el paso 2 debe desbloquearse en el nav.
- **Paso 2**: debe mostrarse el bloque de instrucciones del paso 1 como referencia. Importa keywords pegando varias líneas (con y sin volumen separado por coma), comprueba que ignora duplicados. Añade una manualmente. Marca como completado con 10+ keywords → debe generar el prompt para el Tutor con botón "Copiar", y desbloquear el paso 3.
- **Paso 3**: debe mostrarse el prompt generado en el paso 2. Escribe notas, guarda progreso, marca como completado sin restricciones → desbloquea el paso 4.
- **Paso 4**: crea varios clusters, añade keywords a cada uno (marca una como principal y confirma que la anterior deja de serlo), cambia el estado desde el menú ⋮, edita un cluster, elimina uno con confirmación. Comprueba el cálculo de tráfico estimado (volumen total × 0.28).
- **Vista pública**: pulsa "Ver como cliente" (genera el token la primera vez) y confirma que abre `/share/<token>/keyword-research` en una pestaña nueva, sin sesión, sin sidebar del dashboard, solo con clusters en estado activo/completado, sin notas internas ni botones de edición. Prueba también "Copiar enlace del cliente".
- **Reset de cada paso**: confirma que el reset del paso 1 borra competidores y la keyword objetivo; el del paso 2 borra las keywords importadas; el del paso 3 borra las notas; el del paso 4 borra TODOS los clusters (con el aviso reforzado en el confirm). Tras cada reset, comprueba que el nav vuelve a bloquear los pasos siguientes.
- **Asistente contextual**: en el paso 1, haz foco en el campo "Keyword objetivo" → debe mostrar la card "Por qué buscamos en incógnito". En el paso 2, haz foco en el textarea de importación → deben alternar las dos cards de `kw_import` según el carrusel/coincidencia. Confirma que el asistente del nav principal (8 etapas) NO se muestra duplicado mientras estás dentro de Keyword Research.

## Pendientes detectados

- El texto de instrucciones de SE Ranking generado en el paso 1 contiene el placeholder literal `[ubicación del proyecto]` sin rellenar, porque `projects` no tiene ningún campo de ubicación/ciudad. Si se quiere resolver de verdad, hace falta decidir si se añade ese campo al núcleo (`projects`) o se pide como input adicional dentro del propio paso 1 del módulo SEO.
- La "fecha de última actualización" de la vista pública es una aproximación (`MAX(created_at)` de los clusters), no una fecha de modificación real — ninguna tabla de Keyword Research tiene columna `updated_at`.
- Sin tests automatizados (consistente con el resto del módulo SEO hasta ahora).
- `seed-knowledge-cards.sql` (de una sesión anterior, distinto del de esta sesión) sigue sin trackear en git en la raíz del repo — pendiente de decidir si se versiona o se descarta.
- No se ha hecho `push` ni `merge` a `main` — la rama `feature/fase-c-keyword-research` queda a la espera de confirmación explícita, tal como se pidió.
