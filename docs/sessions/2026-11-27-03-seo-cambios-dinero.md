# SEO parte 6, tanda 6b: registro de cambios y páginas de dinero
**Fecha:** 2026-11-27  
**Rama:** feature/seo-tecnico-2c  
**Commit:** 0305ef94

## Qué se construyó
- `lib/db/migrations/0072_seo_cambios_dinero.sql`, `lib/db/schema.ts` y el journal: tablas `seo_change_log` y `seo_money_pages`.
- `lib/seo/cambios/rules.ts` (puro): `diffCrawls`, `schemaKey`, `snapOf`, `moneyCondition` (incluida la redirección como importante), `canAdvanceBaseline` y `snapDiffs`.
- `lib/seo/cambios/registro.ts`:
  - `logCrawlChanges` (se llama en `auditFinishedCrawl`);
  - `listChanges`;
  - `purgeChangeLog` (tarea diaria);
  - `importantUrls`.
- `lib/seo/cambios/dinero.ts`:
  - lista de páginas (`refreshMoneyList`) y pasada (`runDinero`) con confirmación a los 30 min;
  - aviso por Telegram;
  - `acceptMoneyBaseline`, `pin`/`unpin` y `listMoneyPages`.
- `lib/seo/vigilancia/rules.ts` y `vigilancia.ts`: proceso `seo.dinero` (cada 6 h), confirmación y purga.
- `lib/seo/salud-actions.ts`: «Dejar así» o «No es un problema» sobre `seo.money_page_changed` acepta la referencia.
- `lib/seo/cambios-actions.ts` (nuevo): `pinMoneyPageAction` y `unpinMoneyPageAction` (permiso `edit`, solo la web del proyecto).
- `app/(dashboard)/dashboard/projects/[projectId]/salud/cambios-panel.tsx` y `page.tsx`: «Páginas de dinero» y «Cambios en la web» (agrupado por día y plegable).
- `lib/seo/salud/kinds.ts`, `plan/rules.ts` y las fuentes: `seo.money_page_changed` y `seo.money_pages_unreadable`.
- `lib/seo/salud/process-map.ts`: pasos `dinero` y `registro-cambios`. La comprobación del mapa pasa.
- `tests/seo-cambios-dinero.test.ts` y `tests/seguridad.test.ts`: pruebas de reglas y de permisos (también de `checkOldPhonesNowAction`). Pasan las 799 pruebas.
- `docs/ESTADO.md` §6.54, `docs/LISTA-CERRADA-SEO.md` (parte 6 ✅) y `docs/DISENO-SEO-TECNICO-2BC.md` (diseño concreto y segunda auditoría).

## Migraciones aplicadas
`0072_seo_cambios_dinero.sql`:
```sql
CREATE TABLE IF NOT EXISTS "seo_change_log" (id bigserial PK, tenant_id uuid FK tenants, project_id uuid FK projects, url text,
  url_hash varchar(40), field varchar(30), before text, after text, extra jsonb, source varchar(10) CHECK IN ('rastreo','dinero'),
  batch varchar(64), prev_observed_at timestamp, detected_at timestamp DEFAULT now());
CREATE UNIQUE INDEX seo_change_log_unique ON seo_change_log (project_id, batch, url_hash, field);
CREATE INDEX seo_change_log_project_idx ON seo_change_log (project_id, detected_at DESC);
CREATE INDEX seo_change_log_url_idx ON seo_change_log (project_id, url_hash, detected_at);
CREATE TABLE IF NOT EXISTS "seo_money_pages" (id uuid PK, tenant_id, project_id, url, url_hash, reasons text[] DEFAULT '{}',
  expires_at, out_since, active bool DEFAULT true, baseline jsonb, baseline_version int DEFAULT 1, last jsonb, stable jsonb,
  last_checked_at, pending_kind varchar(40), pending_since, fail_streak int DEFAULT 0, created_at, updated_at);
CREATE UNIQUE INDEX seo_money_pages_unique ON seo_money_pages (project_id, url_hash);
CREATE INDEX seo_money_pages_active_idx ON seo_money_pages (project_id, active);
```
(El SQL completo está en el archivo.) Antes de aplicarla en local se hizo la copia `backups/backup_pre_seo6b_20261127.sql`.

## Decisiones técnicas tomadas en auto mode
Todas salen de dos auditorías Opus; el detalle está en el documento de diseño.
- Las URLs de los encargos se vigilan desde que se aprueban: así queda la fecha real del cambio.
- Las condiciones se miden frente a una referencia («antes bien, ahora no»). «Dejar así» acepta la referencia nueva, y la versión de la referencia entra en la clave del aviso.
- 401, 403, 429 y 5xx no deciden nada. Una redirección es importante, no crítica.
- Un cambio de plantilla en toda la web se apunta en una sola fila con las URLs. Las páginas vigiladas o con encargo conservan su fila propia.

**Revisor de código** (aprobar con cambios, sin graves). Arreglado:
- la referencia solo se acepta con `money_page_changed` (no con el aviso de «no se pueden leer»);
- la referencia no avanza cuando un aviso se suprime porque ya hay `page_regressed`;
- se encola otra confirmación si ya había una en marcha;
- la redirección pasa a importante;
- el índice se declara `desc()` en `schema.ts`.

**Aceptado sin cambiar:** el diff carga el JSON-LD de los dos rastreos en memoria (como mucho 500 páginas cada uno).

## Qué verificar manualmente
- Salud de un proyecto: aparecen «Páginas de dinero» (la portada y las de más clics, tras la primera pasada) y «Cambios en la web».
- Fijar una página de otra web da un error; una de la web del proyecto se añade como «Fijada».
- Tras la segunda auditoría, «Cambios en la web» muestra los cambios agrupados por día.

## Pendientes detectados
- La prueba `cimientos` «un proceso vencido crea su trabajo» falla de vez en cuando con la app en marcha (compite con el planificador). Pasa al repetirla.
- Comparar el schema en SQL si alguna web llega a tener rastreos muy grandes.
