# Vigía del gasto de IA, IA de reserva y reasignar desde el parte
**Fecha:** 2026-11-13  
**Rama:** feature/reasignar-y-vigia-ia  
**Commit:** da732551

## Qué se construyó
- `docs/DISENO-VIGIA-IA.md`: qué permite Anthropic (verificado en la documentación oficial), la recomendación, las alternativas descartadas y el cuestionamiento.
- `lib/operaciones/ai-watch.ts` (nuevo, sin IA):
  - presupuesto mensual y previsión;
  - gasto por día y por función sobre `ai_jobs`;
  - picos con su porqué (`detectSpikes`, `explainSpike`);
  - recomendaciones con ahorro aproximado (`recommend`);
  - informe de costes de la organización con la Admin API (`fetchOrgCostReport`, caché de 1 h);
  - avisos (`runAiWatch`).
- `lib/operaciones/ai-watch-actions.ts` (nuevo, admin): conectar (probándola antes), quitar y refrescar la clave de administración de Anthropic, que se guarda cifrada.
- `app/(dashboard)/dashboard/operaciones/gasto-ia/` (nuevo, admin, Sistema → Gasto de IA):
  - cifras;
  - gráfica de barras del gasto diario con la línea del presupuesto diario y tooltip;
  - tabla accesible;
  - picos, recomendaciones y tabla por función;
  - conexión de la cuenta de Anthropic.
- `lib/ai/gateway.ts`: **IA de reserva**. `shouldFallback` decide si el fallo es del proveedor y `resolveFallbackProvider` busca otra clave activa de otro proveedor. Reintenta una vez y lo anota en `output.fallback`.
- `lib/db/migrations/0046_ops_outbox_assignee.sql` + journal + `schema.ts`: acción `set_assignee` en la bandeja de salida.
  - `clickup.ts`: `updateTaskAssignees`.
  - `outbox.ts`: la ejecuta.
  - `autopilot.ts`: botón `ap:as:<tarea>:<a>:<de>`.
  - `reports.ts`: «👤 A <persona>» en el parte.
- `automations.ts`: `ai_budget` pasa a «Vigía de gasto de IA».
  - Presupuesto 80 $ por defecto.
  - Campos nuevos: `spikeFactor` y `alerts`.
- `reports.ts`: línea de IA en el informe semanal.
- `telegram-worker.ts`: paso «vigía de IA».
- `nav.ts`: pestaña Gasto de IA, solo para admin.
- Mapa Visual: paso «Gasto de IA: previsión, picos y recomendaciones». **La comprobación pasó** (19 automatizaciones, 15 tareas del planificador, 7 prompts, 40 tablas, 103 pasos, 16 mapas).
- Documentación: `docs/ESTADO.md` (§6.20, §7, migraciones y mapa de archivos) y `docs/PENDIENTES-ENRIC.md`.
- Pruebas:
  - `tests/vigia-ia.test.ts` (nuevo);
  - `tests/autonomia.test.ts`: botón de reasignar;
  - `tests/seguridad.test.ts`: 3 acciones de administración nuevas.
  - Resultado: tipos limpios; 235 pruebas OK y las 9 de entorno de siempre.

## Migraciones aplicadas
Solo en local, con backup previo `backups/backup_pre_outbox_assignee_20261113.sql`. SQL aprobado por Enric. `0046_ops_outbox_assignee.sql`:

```sql
ALTER TABLE "ops_clickup_outbox" DROP CONSTRAINT IF EXISTS "ops_outbox_action_check";
ALTER TABLE "ops_clickup_outbox" ADD CONSTRAINT "ops_outbox_action_check" CHECK ("action" IN ('set_status','comment','set_due','set_assignee'));
```

## Decisiones técnicas tomadas en auto mode
- **No hay endpoint de saldo en Anthropic** (verificado), así que el vigía trabaja con un presupuesto (80 $). El coste real llega por el informe de costes de la Admin API, si Enric conecta una clave de administración.
- **Sin IA en el vigía:** previsión, picos y recomendaciones son cuentas y reglas. Un analista con IA gastaría lo que vigila.
- **Con la cuenta conectada, la previsión y los umbrales usan el gasto real de la cuenta**, que incluye Claude Code. Sin ella, el coste estimado de la herramienta.
- **Reserva solo ante fallos del proveedor y una sola vez.** Una petición mal formada no cambia de proveedor.
- **El informe de costes se pide con `fetch`:** según la documentación de Anthropic, no está en los SDK.
- **Avisos sin insistir:**
  - picos: uno por función y día;
  - previsión por encima del presupuesto: uno por semana del mes;
  - umbrales: 50/80/100 % una vez al mes;
  - de 8:00 a 21:00.
- **El botón de reasignar quita a la persona que falta y pone a la sugerida.** La vigilancia de ClickUp ve el cambio y avisa a la nueva, así que no se manda un aviso aparte.

## Qué verificar manualmente
- Desplegar con `bash scripts/deploy.sh --migrate` (migración 0046, con backup).
- Con tu cuenta de admin:
  - Sistema → Gasto de IA (cifras, gráfica, recomendaciones);
  - Automatizaciones → Vigía de gasto de IA (presupuesto 80 $).
- Crear la clave de administración en la consola de Anthropic y conectarla: debe aparecer el coste real de la cuenta.
- Cuando alguien falte con tareas que vencen hoy, pulsar «👤 A …» en el parte: la tarea debe cambiar de responsable en ClickUp y la nueva persona recibir el aviso.

## Pendientes detectados
- La reserva necesita una segunda clave con saldo de otro proveedor; hoy Gemini no tiene créditos.
- El coste propio es una estimación con la tabla de precios `ai_model_pricing`, que no cuenta tokens de caché. Con la clave de administración se puede comparar con lo real.
- El clustering de SEO no usa la reserva: resuelve el proveedor por su cuenta.
- La Usage and Cost API es «legacy»; Anthropic recomienda la nueva Analytics API. Cambiar si la deja de mantener.
