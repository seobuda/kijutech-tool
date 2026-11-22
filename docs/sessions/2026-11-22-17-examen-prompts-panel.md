# Examen de prompts desde el panel, con historial
**Fecha:** 2026-11-22  
**Rama:** feature/examen-prompts-panel  
**Commit:** e100a1d2

## Qué se construyó
Enric pidió que el examen de prompts no se quedara solo en el código («si se queda en código es como que realmente no existe para mí») y eligió la opción A: dentro del editor de prompts, con historial guardado (migración aprobada).

- `lib/ai/prompt-evals.ts` (núcleo, nuevo): registro de exámenes (`registerPromptEvalSuite`), lanzamiento en segundo plano (`startPromptEval`, uno a la vez por prompt con candado de transacción), ejecución y guardado (`executeEval`: nota, casos, coste exacto), historial (`listPromptEvals`), estado puro (`evalState`: sin examen, cambiado sin examinar, aprobado, suspendido, en curso, error) y resumen (`promptEvalOverview`). Un examen «en curso» de más de 30 min queda como interrumpido.
- `lib/ai/eval-tag.ts` (nuevo): marca de las llamadas a la IA hechas dentro de un examen (AsyncLocalStorage). `lib/ai/gateway.ts` la copia en `ai_jobs.input.evalRunId` para sumar el coste exacto de cada examen.
- `lib/operaciones/prompt-evals.ts` (nuevo): los casos de `ops_note_to_requests` (antes solo en la prueba), con un título en claro por caso, y su registro (`registerOperacionesPromptEvals`, llamado en `wireApp()`).
- `lib/operaciones/prompt-evals-rules.ts` (nuevo, puro): el corrector.
- `app/(dashboard)/dashboard/ai/settings/prompts/[key]/prompt-eval-panel.tsx` (nuevo): tarjeta «Examen del prompt» con estado, último examen (nota, versión, fecha, coste, casos fallados y la nota usada), botones «Pasar examen a la versión N» y «Examinar el borrador sin guardarlo» (solo con cambios sin guardar), historial plegable; se refresca sola mientras hay uno en marcha.
- `.../prompts/[key]/eval-actions.ts` (nuevo): `startPromptEvalAction`, solo super_admin (`requirePermission('users')`).
- `.../prompts/[key]/page.tsx` y `prompt-edit-form.tsx`: cargan y muestran el examen; en un prompt con examen se ocultan la prueba con keywords y las variables de SEO, que no le corresponden.
- `.../ai/settings/page.tsx` y `prompts-section.tsx`: etiqueta con el estado del examen en la lista de prompts.
- `lib/operaciones/system-report.ts`: el parte de Sistema (y la herramienta `estado_sistema`) avisa de los prompts no aprobados en su versión actual; solo en la cuenta dueña (los prompts son de la plataforma).
- `lib/db/schema.ts` + `lib/db/migrations/0059_examen_prompts.sql`: tabla `ai_prompt_evals`.
- `tests/examen-prompts.test.ts` (nuevo, 6 pruebas con un examen falso, sin IA), `tests/ia-prompts-evals.test.ts` (usa el mismo código que el panel; prueba de `evalState`), `tests/seguridad.test.ts` (editor y admin no pueden lanzar exámenes).
- Mapa Visual: paso «Convertir la nota en encargos» y nodo «Motor de IA». `docs/ESTADO.md` (§2, §3, §8, §10, §16, §18, §19, §22) y `CLAUDE.md` (regla de cambiar un prompt).

## Migraciones aplicadas
`0059_examen_prompts.sql`, aplicada en LOCAL (backup previo en `backups/backup_pre_examen_prompts_20261122.sql`). Pendiente en producción con `deploy.sh --migrate` (OK de Enric).

```sql
CREATE TABLE IF NOT EXISTS "ai_prompt_evals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_key" varchar(100) NOT NULL,
	"prompt_version" integer,
	"draft" boolean DEFAULT false NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'en_curso' NOT NULL,
	"passed_checks" integer DEFAULT 0 NOT NULL,
	"total_checks" integer DEFAULT 0 NOT NULL,
	"min_score_pct" integer DEFAULT 100 NOT NULL,
	"passed" boolean,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"cost_usd" numeric(10, 6),
	"started_by" integer,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	CONSTRAINT "ai_prompt_evals_status_check" CHECK ("ai_prompt_evals"."status" IN ('en_curso', 'ok', 'error'))
);
ALTER TABLE "ai_prompt_evals" ADD CONSTRAINT "ai_prompt_evals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "ai_prompt_evals" ADD CONSTRAINT "ai_prompt_evals_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX IF NOT EXISTS "ai_prompt_evals_key_started_idx" ON "ai_prompt_evals" USING btree ("prompt_key","started_at");
```

Solo añade una tabla; no toca datos existentes.

## Decisiones técnicas tomadas en auto mode
- **Núcleo con registro, casos en el módulo:** la pantalla de prompts y `ai_prompts` son del núcleo y el prompt es de Operaciones; el núcleo no puede importar módulos (barrera de arquitectura), así que Operaciones registra su examen y la capa de aplicación lo conecta en `wireApp()`, como las capacidades.
- **En segundo plano y no en la acción:** el examen tarda ≈1 min; la acción lo deja en marcha y vuelve, y la pantalla consulta cada 5 s mientras hay uno en curso.
- **Examinar el borrador:** la regla de CLAUDE.md es examinar ANTES de dejar activo; sin esta opción habría que guardar (activar) para examinar. El examen del borrador no cuenta como examen de la versión guardada.
- **Coste exacto con una marca** en `ai_jobs.input` en vez de sumar por franja horaria (que mezclaría el uso real que coincida).
- **«Nunca examinado» también pide atención** en el parte de Sistema: recuerda pasar el primero.
- **Coste real medido:** 0,20 $ por pasada, no «céntimos» como decía la documentación (el prompt lleva todas las listas, clientes y fichas). Corregido en el panel, CLAUDE.md y ESTADO.
- **Mapa de Operaciones:** `ai_prompt_evals` no va en `tables:` (la comprobación solo admite `ops_*` y las del cliente); se cita en el texto del paso y en el nodo «Motor de IA».

## Qué verificar manualmente
- IA → Ajustes → Prompts: «Convertir nota en encargos» lleva la etiqueta del examen.
- Entrar en el prompt: tarjeta «Examen del prompt» arriba. Pulsar «Pasar examen a la versión N»: en ≈1 min aparece la nota con los 5 casos.
- Cambiar una palabra del prompt sin guardar: aparece «Examinar el borrador sin guardarlo»; al pasarlo, el prompt guardado no cambia.
- Comprobado en local: examen real 12 de 12 (aprobado) en 51 s, 0,20 $; las pantallas del prompt, la lista y un prompt de SEO cargan sin error con super_admin; 516 pruebas correctas (1 saltada, la del examen real), `tsc` y Mapa Visual OK.

## Pendientes detectados
- Aplicar la 0059 en producción (`deploy.sh --migrate`, OK de Enric). Hasta entonces, el bloque 2 (pantallas) tampoco está desplegado: va en el mismo despliegue.
- Añadir casos desde el panel; exámenes para `ops_email_reply` y `ops_prepare_request`; repetir cada caso 2-3 veces para separar ruido de empeoramiento (multiplica el coste).
- El parte de Sistema avisará «nunca examinado» hasta que se pase el primer examen en producción.
