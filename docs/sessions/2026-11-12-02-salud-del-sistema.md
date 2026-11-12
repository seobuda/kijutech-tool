# Salud del sistema (paso 4)
**Fecha:** 2026-11-12  
**Rama:** feature/salud → main  
**Commit:** 93d4d0bd

## Qué se construyó
- `lib/db/migrations/0043_ops_health.sql` y `lib/db/schema.ts`: tabla `ops_health_incidents` y tipo de aviso `health`.
- `lib/operaciones/health.ts`: comprobaciones (función pura `evaluate`), incidencias con aviso al abrir y al resolver, paradas al arrancar (`recordDowntime`, llamada desde `startup.ts`), datos del panel y `retryStuck`.
- `lib/operaciones/telegram-worker.ts`: tarea `runHealthChecks` (cada 5 min).
- `app/api/health/route.ts`: comprobación pública de vida (200/503, sin datos).
- `lib/operaciones/health-actions.ts` y `operaciones/salud/*`: pestaña «Salud» (admin) con estado, recomendaciones, disponibilidad, 3 gráficas SVG (tooltip y vista de tabla) e incidencias.
- `scripts/watchdog.sh` y `scripts/watchdog-env.mjs`: vigilante externo (cron en el servidor) que avisa por Telegram si la web no responde o no hay latido.
- `tests/salud.test.ts` y `tests/seguridad.test.ts`; Mapa Visual: nodo «Salud del sistema».

## Migraciones aplicadas
`0043_ops_health.sql`:

```sql
CREATE TABLE IF NOT EXISTS "ops_health_incidents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "check_key" varchar(40) NOT NULL,
  "severity" varchar(10) NOT NULL,
  "title" varchar(255) NOT NULL,
  "detail" text DEFAULT '' NOT NULL,
  "opened_at" timestamp DEFAULT now() NOT NULL,
  "resolved_at" timestamp,
  "notified_at" timestamp,
  "resolved_notified_at" timestamp,
  CONSTRAINT "ops_health_incidents_severity_check" CHECK ("severity" IN ('aviso', 'critico'))
);
CREATE INDEX IF NOT EXISTS "ops_health_incidents_tenant_idx" ON "ops_health_incidents" USING btree ("tenant_id", "opened_at");
CREATE UNIQUE INDEX IF NOT EXISTS "ops_health_incidents_open_unique" ON "ops_health_incidents" ("tenant_id", "check_key") WHERE "resolved_at" IS NULL;
ALTER TABLE "ops_notifications" DROP CONSTRAINT IF EXISTS "ops_notifications_kind_check";
ALTER TABLE "ops_notifications" ADD CONSTRAINT "ops_notifications_kind_check" CHECK ("kind" IN (…, 'email_proposal', 'health'));
```

## Decisiones técnicas tomadas en auto mode
- **Recomendaciones por reglas, no IA:** son diagnósticos fijos; con IA serían más caros y menos fiables.
- **Dos niveles de vigilancia:** dentro de la app (colas y errores, cada 5 min) y fuera (cron en el servidor + `/api/health`), porque la app no puede avisar de su propia caída.
- **El token del bot para el vigilante externo** se descifra dentro del contenedor y se escribe en `/opt/kijutech/watchdog.env` (permisos 600) en el servidor: nunca se muestra ni sale de allí.
- **Disponibilidad** calculada con las paradas registradas al arrancar (sin tabla de latidos).
- **Gráficas:** una escala por gráfica; enviados y fallidos en azul y rojo (no verde y rojo, por daltonismo); tooltip y tabla accesible.
- Encontrado en la prueba: una consulta SQL recibía una fecha de JavaScript; ahora la calcula PostgreSQL.

## Qué verificar manualmente
- Operaciones → **Salud**: todo en verde, gráficas con datos reales y sin incidencias (o la parada del despliegue como resuelta).
- Prueba del vigilante: `docker compose -f docker-compose.prod.yml stop app` en el servidor → en ≤ 5 min llega «🔴 La herramienta está caída»; al arrancar de nuevo, «🟢 vuelve a funcionar».

## Pendientes detectados
- La pestaña Salud es solo para administración.
- `pnpm test` 158 OK; Mapa Visual OK (38 tablas, 81 pasos).
