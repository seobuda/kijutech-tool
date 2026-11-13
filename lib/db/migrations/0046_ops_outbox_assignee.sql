-- Reasignar desde el parte de la mañana (13 nov 2026): la bandeja de salida hacia ClickUp acepta «set_assignee».
-- Solo amplía la regla de valores permitidos; no crea tablas ni toca datos.
ALTER TABLE "ops_clickup_outbox" DROP CONSTRAINT IF EXISTS "ops_outbox_action_check";
ALTER TABLE "ops_clickup_outbox" ADD CONSTRAINT "ops_outbox_action_check" CHECK ("action" IN ('set_status','comment','set_due','set_assignee'));
