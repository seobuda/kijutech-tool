# Cierre del módulo SEO: panel de IA, Autoridad, WordPress, GoHighLevel, En vivo e informe
**Fecha:** 2026-11-27
**Rama:** feature/seo-cierre
**Commit:** 67b25716

## Qué se construyó
Enric respondió en el chat a las 4 decisiones pendientes: WordPress en el núcleo, panel de IA con un tope de 2 $, Autoridad tras verificar y GoHighLevel con un token de prueba en `.env`. Diseño, investigación y auditoría Opus en `docs/DISENO-SEO-CIERRE.md`.

- **Atascos de la simulación** (commit 9f2de68d):
  - `lib/seo/plan/plan.ts`: las horas consumidas son el máximo entre lo estimado y lo fichado, y lo cancelado no consume.
  - `lib/operaciones/work-source.ts` y `clickup.ts` (`taskExists`): un encargo borrado en Operaciones o en ClickUp pasa a «cancelado» en las intervenciones.
    - Solo lo comprueba el proceso horario (`checkDeleted`): como mucho 8 tareas por pasada, con caché de 3 días.
    - Nunca al pintar una pantalla.
  - `lib/agentes/register.ts` e `integrations.ts`: lo que gastan `seo_serp_google` y `seo_volumen_keywords` en DataForSEO cuenta en el presupuesto del agente (`ai_jobs`).
- **Panel de IA** (`lib/seo/panel-ia/`): `rules.ts` (plantilla de preguntas y detección sin IA), `panel.ts` (proceso «seo.panel_ia» y un trabajo por pregunta) y la pestaña `projects/[projectId]/ia`.
- **Autoridad** (`lib/seo/autoridad/`): `rules.ts` (huecos y cobertura), `autoridad.ts` (consulta mensual, encendido por proyecto y prueba de cobertura) y la pestaña `projects/[projectId]/autoridad`.
- **Núcleo:**
  - `lib/core/connections-rules.ts`: lista blanca de WordPress, URL y borrador escapado.
  - `lib/core/connections.ts`: WordPress, GoHighLevel, leads y resumen.
  - `lib/core/leads-rules.ts`: lectura mínima de un envío.
  - `lib/core/connection-actions.ts`.
  - El bloque «Conexiones» en la ficha del cliente.
- **DataForSEO** (`lib/agentes/integrations.ts`): `dataForSeoAiAnswer` (LLM Scraper, AI Mode y Perplexity, lectura defensiva) y Backlinks (summary, domain_intersection, timeseries_new_lost_summary y referring_domains). Llegan a SEO por `serpSource().aiAnswer` y `.links`.
- **Borrador de WordPress:** `briefToWordPress` y `checkWordPressDrafts` en `lib/seo/contenido/briefs.ts`, y el botón en el panel de briefs.
- **En vivo e informe** (`lib/seo/vivo/`): `report-rules.ts` (texto determinista), `vivo.ts` (vista y borrador con `forceApproval`) y la pestaña `projects/[projectId]/vivo`.
- **Gasto** (`lib/seo/gasto.ts`):
  - `canSpendOn`: un tope propio por operación.
  - `numberSetting`.
  - `refundDataSpend`: devuelve el estimado si DataForSEO respondió 4xx y no cobró.
- **Pruebas:** `tests/seo-panel-ia.test.ts`, `seo-autoridad.test.ts`, `seo-vivo.test.ts` y `core-conexiones.test.ts`. También `arquitectura-guardrails.test.ts`, con las dos tablas nuevas del núcleo.
- **Mapa Visual:** pasos `panel-ia`, `autoridad` y `en-vivo-informe` en SEO; `cli-conexiones` y `cli-leads` en Clientes; y el texto de los briefs con WordPress. La comprobación pasa (22 automatizaciones, 115 pasos).
- **Documentos:** `docs/ESTADO.md` §6.65 y cabecera, `docs/LISTA-CERRADA-SEO.md` (partes 9 a 12 hechas) y `docs/PENDIENTES-ENRIC.md`.

## Migraciones aplicadas
`lib/db/migrations/0075_seo_cierre.sql` (aditiva; backup previo en `backups/backup_pre_seo-cierre_20261127.sql`):
```sql
CREATE TABLE IF NOT EXISTS "client_connections" ( id, tenant_id → tenants, client_id → clients (cascade), kind varchar(20) CHECK IN ('wordpress','gohighlevel'),
  base_url text, external_id varchar(120), username varchar(120), secret_encrypted text NOT NULL, secret_iv varchar(64) NOT NULL,
  status varchar(10) DEFAULT 'ok' CHECK IN ('ok','error'), detail jsonb DEFAULT '{}', last_ok_at, last_error, last_sync_at, created_by, created_at, updated_at,
  UNIQUE (tenant_id, client_id, kind) );
CREATE TABLE IF NOT EXISTS "client_leads" ( id, tenant_id, client_id (cascade), provider varchar(20), external_id varchar(100), form_id, form_name,
  page_url varchar(500), referrer varchar(500), channel varchar(10) DEFAULT 'otros', utm jsonb DEFAULT '{}', has_gclid boolean DEFAULT false,
  submitted_at timestamp NOT NULL, created_at, UNIQUE (tenant_id, provider, external_id) );
CREATE INDEX IF NOT EXISTS "client_leads_client_idx" ON "client_leads" ("client_id", "submitted_at");
CREATE TABLE IF NOT EXISTS "seo_ai_questions" ( id, tenant_id, project_id (cascade), question varchar(300), question_key varchar(150), origin varchar(10),
  status varchar(10) DEFAULT 'propuesta' CHECK IN ('propuesta','activa','quitada'), created_by, created_at, updated_at, UNIQUE (project_id, question_key) );
CREATE TABLE IF NOT EXISTS "seo_ai_checks" ( id, tenant_id, project_id (cascade), question_id → seo_ai_questions (cascade), run_month date, sample smallint DEFAULT 1,
  assistant varchar(12) CHECK IN ('chatgpt','gemini','google_ai','perplexity'), status varchar(10) DEFAULT 'pendiente' CHECK IN ('pendiente','enviando','hecha','fallida'),
  client_cited boolean, client_named boolean, competitors jsonb DEFAULT '[]', sources jsonb DEFAULT '[]', excerpt varchar(700), cost_usd numeric(8,4), error text,
  created_at, updated_at, UNIQUE (question_id, run_month, sample, assistant) );
CREATE INDEX IF NOT EXISTS "seo_ai_checks_project_idx" ON "seo_ai_checks" ("project_id", "run_month");
CREATE TABLE IF NOT EXISTS "seo_link_snapshots" ( id, tenant_id, project_id (cascade), domain varchar(255), is_client boolean DEFAULT false, month date,
  summary jsonb DEFAULT '{}', gap jsonb DEFAULT '[]', new_lost jsonb DEFAULT '[]', cost_usd numeric(8,4), created_at, UNIQUE (project_id, domain, month) );
ALTER TABLE "seo_briefs" ADD COLUMN IF NOT EXISTS "wp_post_id" integer;
ALTER TABLE "seo_briefs" ADD COLUMN IF NOT EXISTS "wp_edit_url" text;
```
(El SQL completo, con tipos y valores por defecto exactos, está en el archivo de la migración.)

## Decisiones técnicas tomadas en auto mode
- **Protocolo de decisión completo:**
  - Investigación en paralelo de Backlinks, de las API de IA de DataForSEO y de GoHighLevel.
  - Diseño con 3 puntos de vista y alternativas.
  - Auditoría Opus 5.5 en esfuerzo alto. Encontró 3 fallos graves y 6 importantes, todos aceptados y corregidos (tabla al final del diseño).
- **Autoridad no exige contratar:** DataForSEO Backlinks pasó a pago por uso el 1 jul 2026. Aun así queda apagada por proyecto, con prueba de cobertura antes.
- **Panel de IA:**
  - LLM Scraper (lo que ve el usuario) en vez de la API de cada modelo. Claude queda fuera (0,55 $ por pregunta en el ejemplo de la documentación).
  - Tres muestras al mes, porque una sola no permite concluir nada.
  - Las preguntas salen de una plantilla sin IA (directiva de optimización), avisado a Enric.
- **Leads:** con la llamada real se vio que el envío ya trae página, fuente y UTM, así que no hace falta pedir el contacto (una petición por cada 100 leads). Hace falta un User-Agent propio para que Cloudflare no bloquee. Por privacidad (auditoría) no se guarda el id del contacto.
- **WordPress:** el borrador lleva solo el esqueleto (subtemas, preguntas y desde dónde enlazarla), sin texto generado ni enlaces. El ciclo se cierra solo cuando la entrada se publica.
- **Informe v1 determinista**, sin IA. El agente redactor (E) queda como decisión de Enric.
- **Comprobación de borrados en ClickUp:** solo en el proceso horario, para cumplir la regla de ClickUp (ninguna llamada al pintar).
- **Revisor de código:** aprobado con cambios. Arreglado:
  - el tipo que rompía `next build`;
  - el reembolso, solo en 4xx;
  - «Preguntar ahora» bloqueado por filas huérfanas;
  - el reclamo del borrador de WordPress, que ahora caduca y no duplica.

## Qué verificar manualmente
- **Producción, pestaña IA de un proyecto:**
  - pulsar «Proponer preguntas», activar 2 y pulsar «Preguntar ahora»;
  - a los minutos deben verse las 4 columnas con «Sale / No sale» y la última respuesta con sus fuentes;
  - si sale «fallida», mirar el error de la fila: la forma de DataForSEO no está verificada.
- **Autoridad:** «Probar cobertura» con los dominios de Search Console → Enlaces de 3 clientes.
- **Ficha de un cliente → Webs y cuentas → Conexiones:**
  - GoHighLevel con su subcuenta, y después «Descargar ahora»;
  - la pestaña En vivo del proyecto debe enseñar sus contactos por mes y por página.
- **WordPress con una web de Kijutech:**
  - conectar un usuario Colaborador; un usuario Autor o Administrador debe ser rechazado;
  - en un brief, «Crear borrador en WordPress» y abrirlo;
  - al publicarlo, al día siguiente el brief pasa a «usado».
- **En vivo:** «Preparar el informe del mes» debe llegar a Para ti para aprobarlo y no salir solo.

## Pendientes detectados
- La forma real de las respuestas de IA y de Backlinks de DataForSEO está sin verificar (en local no hay integración). Se verá con la primera pasada en producción.
- El precio de Backlinks tras la subida del 20 % está sin verificar.
- `canSpendOn` no es atómico: con 2 trabajos a la vez el panel puede pasarse del tope por céntimos.
- La caché de «prueba de cobertura de hoy» vive en memoria: un reinicio permite repetirla (0,06 $).
- Los formularios de anuncios de Facebook llegan sin página: cuentan en el total, pero no en «Páginas que traen contactos».
- El vigía de IA suma también el gasto de DataForSEO del agente (sale en `ai_jobs` con `provider` «dataforseo»).
- Quedan del encargo anterior: el geo-grid por población (atasco 4), el índice de `findings` y los agentes de IA SEO A-F (decisión de Enric).
