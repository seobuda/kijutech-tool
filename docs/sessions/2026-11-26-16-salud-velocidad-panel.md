# Salud: velocidad visible como PageSpeed
**Fecha:** 2026-11-26  
**Rama:** fix/salud-velocidad-panel  
**Commit:** c63e35e9

## Qué se construyó
Enric pulsó «Comprobar ahora» en la velocidad y no vio nada: el proceso solo creaba hallazgos si algo iba mal y no guardaba las cifras.
- `lib/db/migrations/0066_seo_speed_checks.sql` y `schema.ts` (`seoSpeedChecks`): una fila por página y medición, de tipo campo (Chrome UX Report) o laboratorio (Lighthouse).
- `lib/core/capabilities.ts` (`SpeedLab.metrics`) y `lib/agentes/integrations.ts` (`summarizeLighthouse`): métricas de laboratorio (FCP, LCP, TBT, CLS y Speed Index).
- `lib/seo/vigilancia/vigilancia.ts` (`saveSpeedChecks`): guarda cada medición. Si falla, no tumba el proceso.
- `lib/seo/vigilancia/view.ts`:
  - la última medición de velocidad y la evolución de la nota (12 mediciones);
  - el último resultado de cada proceso, sea programado o manual.
- `salud/velocidad-panel.tsx` (nuevo): el panel al estilo PageSpeed, con los datos reales por página, la nota en círculo, las métricas en verde, ámbar o rojo con los umbrales de Google, los problemas y la evolución.
- `salud/vigilancia-panel.tsx`: el resumen del último trabajo, «En marcha…» y un refresco cada 15 s mientras hay algo en marcha.
- Mapa Visual (`lib/seo/salud/process-map.ts`) y `docs/ESTADO.md` §6.46.

## Migraciones aplicadas
**0066_seo_speed_checks.sql** (aditiva):
```sql
CREATE TABLE IF NOT EXISTS "seo_speed_checks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "run_id" uuid NOT NULL,
  "url" text NOT NULL,
  "kind" varchar(12) NOT NULL,
  "scope" varchar(10), "category" varchar(10), "score" integer,
  "lcp_ms" integer, "inp_ms" integer, "cls" real, "fcp_ms" integer, "tbt_ms" integer, "si_ms" integer,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "measured_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "seo_speed_checks_kind_check" CHECK ("kind" IN ('campo', 'laboratorio'))
);
CREATE INDEX IF NOT EXISTS "seo_speed_checks_project_idx" ON "seo_speed_checks" ("project_id", "measured_at");
```
Backup local previo: `backups/backup_pre_seo_velocidad_20261126.sql`.

## Decisiones técnicas tomadas en auto mode
- **Tabla propia en vez de guardar en `jobs.result`.** Los trabajos se purgan y su resultado tiene que ser pequeño. La tabla da además la evolución que usará la parte 7 («¿funcionó?»).
- **Correcciones del revisor de código** (aprobó con cambios):
  - «En marcha» solo cuenta los trabajos en curso o que ya tocan; antes contaba también la confirmación programada a 30 min, con refrescos inútiles;
  - el error de un trabajo fallido no se envía al navegador;
  - el último resultado se busca uno por proceso (`DISTINCT ON`);
  - se filtra por cuenta;
  - las fechas del SQL crudo se leen en UTC.
- **Chromium** (render de JavaScript): Claude recomendó dejarlo para el futuro departamento de mantenimiento y rendimiento web. Lighthouse ya corre en un Chrome de Google. Falta confirmarlo con Enric.
- La pantalla de errores está en Para ti → Errores, no en Sistema: se le indicó mal a Enric. No hace falta SSH.

## Qué verificar manualmente
- CM Ibérica → Salud → «Velocidad real de los usuarios» → **Comprobar ahora**. En 2-5 minutos:
  - la línea del proceso enseña el resumen;
  - el bloque «Velocidad» enseña los datos reales y la nota de laboratorio de hasta 5 páginas.
- Si el resumen dice que Lighthouse no trajo las auditorías de imágenes, avisar a Claude.

## Pendientes detectados
- Retención de `seo_speed_checks`: sin límite por ahora (unas 9 filas por proyecto y mes). Añadirla a la limpieza si crece.
- La lista de pendientes de la parte 1, tanda 2, sigue igual.
