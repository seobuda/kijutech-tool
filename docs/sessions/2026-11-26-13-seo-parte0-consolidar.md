# SEO definitivo · lista cerrada y parte 0 (consolidar)
**Fecha:** 2026-11-26  
**Rama:** feature/seo-definitivo  
**Commit:** 4b64d364

## Qué se construyó
- `docs/LISTA-CERRADA-SEO.md`: la lista cerrada del módulo SEO definitivo, con las decisiones de Enric. Orden del inventario, tope de 5 $ por proyecto y mes en datos de pago, WordPress como parte 3b y el asistente de agosto retirado.
- `docs/DISENO-SEO-PARTE0.md`: diseño de la parte 0 con el protocolo de decisión: 3 puntos de vista, 4 alternativas y la auditoría de Opus 5.5 con sus correcciones aplicadas.
- `lib/core/jobs.ts`:
  - `ensureScheduleIfMissing`: arregla G1, porque `ensureSchedule` pisaba la frecuencia y la pausa;
  - `setScheduleEvery`, `pauseSchedule`, `listSchedulesForScope`, `hasActiveSchedule` y `stableOffsetMinutes`.
- `lib/core/capabilities.ts`: `registerSpeedSource` / `speedSource` y `registerProjectAlertListener` / `emitProjectAlert`.
- `lib/seo/vigilancia/rules.ts`: reglas puras de la vigilancia, las Core Web Vitals, las páginas en caída y las frecuencias.
- `lib/seo/vigilancia/vigilancia.ts`: los procesos `seo.vigilancia` (con su confirmación a los 30 min), `seo.auditoria`, `seo.velocidad` y `seo.detectores`, y el alta por proyecto.
- `lib/seo/vigilancia/view.ts`, `lib/seo/vigilancia-actions.ts` y `salud/vigilancia-panel.tsx`: el bloque «Vigilancia automática» de Salud, con frecuencia, pausa, «Comprobar ahora» y el gasto del mes.
- `lib/seo/gasto.ts` y la migración 0065: gasto en datos de pago por proyecto y su tope. La búsqueda de competencia ya lo aplica.
- `lib/seo/salud/kinds.ts`: 9 tipos de hallazgo nuevos y el grupo «Vigilancia continua».
- `lib/seo/plan/rules.ts` y `lib/core/techniques.ts`: técnicas para los hallazgos nuevos, más la técnica nueva «Recuperar una página que pierde clics».
- `lib/seo/dossier-provider.ts`, `plan/plan.ts`, `salud/view.ts` y `salud-actions.ts`: las fuentes nuevas llegan al dossier del estratega, al plan, a Salud y a las decisiones sobre hallazgos.
- `lib/agentes/integrations.ts`, `actions.ts` y `register.ts`: integración **PageSpeed / CrUX** (prueba con el Chrome UX Report) y la fuente de velocidad del núcleo.
- `lib/estrategia/processes.ts`, `strategist.ts` y `register.ts`: en los clientes cubiertos por SEO se omite lo que ya vigila SEO; el estratega se despierta con las alertas de proyecto.
- Asistente de agosto retirado de la interfaz:
  - `components/app-shell/nav.ts`: fuera «Fichas SEO»;
  - `projects/page.tsx`: «Abrir SEO» lleva al Expediente;
  - `projects/[projectId]/seo/layout.tsx`: redirige al Expediente.
- `tests/seo-vigilancia.test.ts`: reglas y, contra la base de datos, que el alta no pisa la frecuencia ni la pausa, y el tope de gasto.
- Mapa Visual: 5 pasos nuevos en `lib/seo/salud/process-map.ts` y textos al día en `lib/estrategia/process-map.ts`.
- `docs/ESTADO.md`: §6.44, §9, §10, §11, §16, §17, §18 y §19.

## Migraciones aplicadas
**0065_seo_data_spend.sql** (aditiva):
```sql
CREATE TABLE IF NOT EXISTS "seo_data_spend" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "provider" varchar(30) NOT NULL,
  "operation" varchar(60) NOT NULL,
  "cost_usd" numeric(10, 4) NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "seo_data_spend_project_idx" ON "seo_data_spend" ("project_id", "created_at");
INSERT INTO "seo_settings" ("key", "value", "label", "description")
VALUES ('data_budget_usd', '5', 'Tope de gasto en datos de pago por proyecto y mes (USD)', '…')
ON CONFLICT ("key") DO NOTHING;
```
Backup local previo: `backups/backup_pre_seo_parte0_20261126.sql`.

## Decisiones técnicas tomadas en auto mode
- **Contador de gasto en el módulo SEO (`seo_data_spend`) y no en el núcleo.** La auditoría avisó de que una tabla nueva del núcleo necesita el OK de Enric (`CORE_TABLES`) y de que el gasto debe apuntarlo quien conoce el proyecto. Si Google Ads necesita su propio tope, tendrá su tabla.
- **Estrategia no se apaga: omite lo cubierto por SEO.** Mantiene la vigilancia de los clientes sin proyecto SEO (plan de mantenimiento) y el embudo de Analytics, que se habrían perdido (G4).
- **«Al alcance» y «CTR bajo» no se duplican:** los detectores semanales rehacen el mapa de palabras, que ya los calcula, y solo añaden las páginas en caída y la indexación (M2).
- **Velocidad con el Chrome UX Report y no con PageSpeed Lighthouse:** da los datos reales de usuarios, tarda unos segundos en vez de unos 30 y no consume CPU de laboratorio (directiva de eficiencia).
- **Vigilancia cada hora** en vez de cada día (M6): es una petición ligera y una caída se detecta en menos de 1,5 horas.
- **Técnica nueva `recuperar_pagina`** en vez de dejar `seo.page_drop` sin técnica: una prueba existente exige que todo hallazgo tenga una.
- **Los detectores solo encolan el mapa si hay Search Console con datos.** Si no, el trabajo del mapa fallaba (lo detecté en la prueba local).

## Qué verificar manualmente
- Agentes → Integraciones → **PageSpeed / CrUX**: pegar la clave y ver «Conectada».
- Proyectos → CM Ibérica → **Salud** → «Vigilancia automática»:
  - salen los 4 procesos con su próxima ejecución;
  - cambiar una frecuencia, pausar y reanudar;
  - «Comprobar ahora» en la vigilancia de la web.
- Tras un día en producción, que «Velocidad» y «Detectores» hayan corrido: hallazgos de Core Web Vitals, de páginas en caída e indexación en Salud.
- Proyectos → «Abrir SEO» lleva al Expediente; un enlace antiguo a `/seo/keyword-research` también.
- `job_schedules` con procesos `seo.*` para cada proyecto SEO activo con web.

## Pendientes detectados
- El alta horaria vive en el planificador de Operaciones, que solo corre en cuentas con Telegram configurado.
- Las páginas en caída por temporada entran en el plan como informativas: valorar excluirlas.
- Estrategia sigue leyendo `PAGESPEED_API_KEY` del `.env` en los clientes no cubiertos por SEO.
- La CPU que pediría renderizar JavaScript (parte 1) está sin medir.
- Hay páginas y rutas de API bajo `/seo` del asistente retirado que siguen existiendo como código muerto: comprobar sus guardas o quitarlas en una limpieza.
- `setScheduleEvery` alarga la frecuencia a partir de la siguiente ejecución, no de la actual (documentado).

## Revisión de código (revisor-codigo)
Veredicto: **aprobar con cambios**, sin hallazgos críticos. Arreglados antes de fusionar:
- **Alto:** una pausa en SEO hacía que Estrategia diera al cliente por cubierto y nadie lo vigilara. Ahora la cobertura es por proceso (`activeScheduleKeys`, sin contar pausas). La velocidad solo cuenta como cubierta si hay clave.
- **Medio:** un 401, 403 o 429 en la portada (cortafuegos) era crítico y avisaba cada día. Ahora es aviso. La clave del aviso usa el día de Madrid.
- **Bajos:**
  - el alta horaria solo reactiva lo que apagó el propio sistema (`last_status = 'apagado'`);
  - mensaje claro cuando falla el DNS;
  - comentario de `setScheduleEvery` corregido.
- Sin cambiar: `emitProjectAlert` se emite en cada confirmación mientras dure la caída. Lo limita el tope de 3 días de `maybeAlertAnalysis` (`strategist.ts:126`, comprobado).

Mapa Visual actualizado y `node scripts/check-architecture-map.js` OK. `pnpm test`: 702 pruebas OK.
