-- D4 (revisión del 17 nov, aprobada por Enric el 19 nov 2026): índice de ai_jobs por cuenta y fecha.
-- El vigía de IA, Salud y los paneles de gasto la recorren cada pocos minutos filtrando por cuenta y fecha;
-- sin índice la leían entera. Solo añade el índice: no cambia datos.
-- (La purga de textos antiguos de ai_jobs y de los registros va en código: lib/operaciones/retention.ts.)
CREATE INDEX IF NOT EXISTS "ai_jobs_tenant_created_idx" ON "ai_jobs" USING btree ("tenant_id","created_at");
