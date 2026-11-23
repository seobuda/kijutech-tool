# SEO Hito 1 completo: expediente, plan de mejora, intervenciones e I+D
**Fecha:** 2026-11-23  
**Rama:** feature/hito1-seo-esquema  
**Commit:** cc6862cf

## Qué se construyó
Enric aprobó `docs/DISENO-TECNICO-HITO1.md` y pidió revisar cada decisión pensando en la escalabilidad. La revisión, con las alternativas descartadas, está en el §9 de ese documento.

**Núcleo**
- `lib/core/interventions.ts`: registro de intervenciones (técnica + hipótesis de cada encargo).
  - Un registro por propuesta.
  - La fecha de «hecho» la pone el trabajo horario `core.interventions.sync`, que pregunta a `workSource().requestStatus`.
- `lib/core/techniques.ts`: taxonomía de 30 técnicas, versionada. Incluye la correspondencia con las categorías de Estrategia.
- `lib/core/business-types.ts`: tipos de negocio de schema.org (antes estaban en el módulo SEO).
  - Se guardan en `clients.business_type`.
  - Se pueden editar en la ficha (Empresa y negocio) y en Salud.
- `lib/core/knowledge-feed.ts`: bitácora de I+D (`kb_feed_items`).
  - Guarda sin repetir y avisa al dueño de las actualizaciones e incidencias.
  - Publica eventos externos y hace el resumen semanal reutilizando el prompt `kb_redactar_entrada`.
- `lib/core/capabilities.ts`: nuevo método opcional `WorkSource.requestStatus`. `lib/operaciones/work-source.ts` lo implementa con una consulta.
- `lib/estrategia/strategist.ts`: las propuestas aprobadas del estratega registran su intervención.
- `lib/inicio/para-ti.ts`: nuevo tipo «Plan de mejora SEO por aprobar», con una entrada por proyecto.

**Módulo SEO**
- `lib/seo/expediente/` (`rules.ts` puro, `collect.ts` cola, `view.ts`) y `lib/seo/expediente-actions.ts`: expediente provisional.
  - Fuentes: ficha, portada de la web, Wayback y Search Console.
  - Cada dato con confianza e identidad.
- `lib/seo/plan/` (`rules.ts` puro, `plan.ts`) y `lib/seo/plan-actions.ts`: plan de mejora por reglas, sin IA.
  - Una propuesta por técnica, con un máximo de 40 páginas por tanda.
  - Prioridad, horas, hipótesis y límite de horas del proyecto.
  - Aprobar crea el encargo, enlaza los hallazgos y registra la intervención.
- `lib/seo/id/` (`sources.ts` puro, `watch.ts`): fuentes oficiales de Google.
  - Panel de incidencias (JSON) y blog de Search Central (RSS).
  - Trabajos `seo.id.watch` (cada 3 h) y `seo.id.digest` (lunes).
- `lib/seo/salud/audit.ts`: al terminar la auditoría se encolan el plan y el expediente, y se da de alta la vigilancia de I+D.
- `lib/seo/salud-actions.ts`: `saveSeoBusinessTypeAction` (tipo de negocio a la ficha).

**Pantallas**
- Pestañas del proyecto (`seo-nav.tsx`): Salud técnica · Expediente (`expediente/`) · Plan de mejora (`plan/`).
- Conocimiento → Novedades de Google (`conocimiento/novedades/`).

**Esquema, mapa y pruebas**
- `lib/db/schema.ts` y `lib/db/migrations/0061_hito1_seo.sql`: 5 tablas y 1 columna.
- Mapa Visual:
  - pasos nuevos en Plataforma (`plt-intervenciones`), Conocimiento (`kb-novedades`) y SEO (`seo-expediente`, `seo-plan`, `seo-id`, y `seo-local` en gris);
  - nodo renombrado a «SEO v2: Salud, expediente y plan»;
  - `scripts/check-architecture-map.js` ampliado a las tablas y trabajos nuevos.
- `tests/seo-hito1.test.ts` (18 pruebas). `tests/seguridad.test.ts` incluye 9 acciones nuevas. `tests/arquitectura-guardrails.test.ts` añade `interventions` a las tablas del núcleo.

## Migraciones aplicadas
`lib/db/migrations/0061_hito1_seo.sql`. Aplicada en local tras `backups/backup_pre_seo_hito1_20261123.sql`:

```sql
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "business_type" varchar(60);
CREATE TABLE IF NOT EXISTS "interventions" (id uuid PK, tenant_id → tenants, client_id → clients, project_id → projects (set null),
  domain varchar(20) CHECK seo|ads|web|otro, technique varchar(40), taxonomy_version smallint, business_type varchar(60),
  urls text[], queries text[], hypothesis jsonb, source varchar(40), source_ref varchar(60), request_ref varchar(60),
  status varchar(12) CHECK prevista|hecha|cancelada, done_at, outcome jsonb, measured_at, created_by, created_at, updated_at,
  UNIQUE (tenant_id, source, source_ref));  + índices request, technique, client
CREATE TABLE IF NOT EXISTS "kb_feed_items" (id, tenant_id, domain, source_key, hash, url, title, summary, published_at,
  kind CHECK core_update|incidencia|documentacion|novedad, starts_at, ends_at, notified_at, digest_week date,
  article_id → kb_articles (set null), created_at, UNIQUE (tenant_id, source_key, hash));  + índice reciente
CREATE TABLE IF NOT EXISTS "seo_dossier_facts" (id, tenant_id, project_id → projects (cascade), field, value jsonb,
  source CHECK ficha|web|places|wayback|gsc|busqueda|persona|ia, source_ref, confidence 0-100,
  status CHECK provisional|confirmado|descartado, decided_by, decided_at, created_at, updated_at, UNIQUE (project_id, field, source));
CREATE TABLE IF NOT EXISTS "seo_plan_items" (id, tenant_id, project_id, plan_key, title, description, technique, finding_ids uuid[],
  urls text[], priority 1-3, score, est_hours numeric(5,1), hypothesis jsonb, evidence jsonb,
  status CHECK pendiente|aprobada|descartada|hecha|caducada, request_ref, request_url, request_error, decided_by, decided_at,
  reject_note, origin CHECK reglas|ia|persona, created_at, updated_at, UNIQUE (project_id, plan_key));  + índice
CREATE TABLE IF NOT EXISTS "seo_reviews" (id, tenant_id, client_id, client_asset_id → client_assets, external_id, author,
  rating 1-5, text, published_at, reply_text, reply_at, draft, draft_status CHECK sin_borrador|pendiente|aprobado|publicado|descartado,
  created_at, updated_at, UNIQUE (client_asset_id, external_id));  + índice
```
(El SQL literal completo está en el archivo de la migración.)

## Decisiones técnicas tomadas en auto mode
Todas están razonadas, con sus alternativas, en `docs/DISENO-TECNICO-HITO1.md` §9:
- `request_interventions` pasa a llamarse `interventions`.
  - `request_ref` puede quedar vacío, y lleva `client_id` y `source`/`source_ref`.
  - La fecha de «hecho» se pregunta cada hora a la fuente de trabajo en vez de esperar un aviso de Operaciones. Un aviso habría que ponerlo en cada camino de cierre, se perdería si falla uno y no serviría al sustituir ClickUp.
- Estrategia también registra intervenciones, porque ya tenía hipótesis y nadie las medía.
- `rd_feed_items` pasa a llamarse `kb_feed_items`, dentro de la familia de la base de conocimiento.
  - El resumen semanal reutiliza un prompt que ya tiene examen.
  - Las actualizaciones de Google se publican como eventos externos.
- El plan de mejora se hace por reglas, sin Sonnet (directiva de optimización de IA): es gratis, repetible y explicable.
- El tipo de negocio va a la ficha del cliente, que es un dato del cliente.
- `seo_reviews` cuelga del cliente y de su ficha de Google, no del proyecto.
- Ajuste tras probar con datos reales: un hallazgo «importante» nunca baja de prioridad media (antes un 404 salía con prioridad «baja»).
- La vigilancia de I+D se da de alta al lanzar la primera auditoría de la cuenta. Así no hace falta ninguna acción de alta.

## Qué verificar manualmente
- Tras desplegar con `--migrate`:
  - Proyectos → CM Ibérica → pestañas Salud / Expediente / Plan de mejora.
  - Expediente → «Recoger datos»: identidad, nombre «New CM-Iberica», teléfono y archivo desde 2002.
  - Plan de mejora: aprobar una propuesta crea el encargo en ClickUp y la propuesta pasa a «En curso».
- Conocimiento → Novedades de Google: se llena en las 3 horas siguientes a la primera auditoría.
- La ficha del cliente → Empresa y negocio → «Tipo de negocio (para Google)».
- Para ti (administrador): «Plan de mejora SEO por aprobar».

## Pendientes detectados
- Parte local (reseñas con borrador y coherencia del NAP): necesita que Enric active Places API.
- Medir las intervenciones (I+D fase B): las columnas `outcome` y `measured_at` ya existen.
- `est_work_facts` (Estrategia) y `interventions` se solapan para el trabajo hecho. Convergerán cuando se construya la medición.
- La propuesta «Datos estructurados del negocio» sale aunque la ficha esté incompleta: conviene completar antes la ficha de CM Ibérica.
- En local, «Para ti» no se pudo ver en el navegador (el usuario de pruebas es editor). Lo cubre la prueba contra la base.
- Sigue pendiente lo de la sesión anterior: la etiqueta «aplicando la auditoría…» (4 min fijos), la opción `--cliente` de `server-status.sh` y los datos de prueba locales de CM Ibérica.
