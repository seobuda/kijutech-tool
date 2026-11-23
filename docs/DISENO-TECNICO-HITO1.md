# Diseño técnico del Hito 1 SEO: lo que necesita esquema (para aprobar)

**Fecha:** 2026-11-23 · **Rama:** `feature/hito1-seo` · **Depende de:** `docs/DISENO-MODULO-SEO.md` v2 (§5, §7.3, §7.4, §10) y los cimientos (migración 0060, en producción).
**Estado:** aprobado por Enric el 23 nov y construido (migración 0061), con los cambios de la revisión del §9.

## 0. Lo que ya está hecho en esta rama (sin esquema)

- **Reglas de auditoría** (31 tipos de hallazgo, sin IA, versionadas): `lib/seo/salud/audit-rules.ts`.
- **Auditoría en la cola** (`seo.salud.audit`): espera al rastreo, cruza con Search Console y guarda los hallazgos (`findings`).
- **Datos estructurados**: generador de JSON-LD desde la ficha del cliente (`lib/seo/salud/jsonld.ts`).
- **Pantalla Proyectos → Salud**: lanzar, ver por área y gravedad, descartar o aceptar, copiar el código.

Lo que sigue del Hito 1 necesita **5 tablas nuevas** (4 del módulo SEO y 1 del núcleo). Las pido aquí.

---

## 1. Expediente provisional del proyecto — `seo_dossier_facts` (módulo SEO)

**Para qué.** Arranque con lo mínimo (§5 fase 0): el sistema recoge datos solos (ficha, web, Places, Wayback, Search Console, búsqueda de marca), cada uno con **origen, confianza y estado**. Tú confirmas, no escribes. Aquí se guarda también el **tipo de negocio** que hoy se elige cada vez en el JSON-LD.

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid → tenants | |
| `project_id` | uuid → projects (cascade) | |
| `field` | varchar(40) | `nombre`, `web`, `telefono`, `direccion`, `categoria`, `tipo_negocio`, `horario`, `valoracion`, `num_resenas`, `place_id`, `perfiles`, `primera_fecha_web`, `marca_en_google`… (lista cerrada en código) |
| `value` | jsonb | El dato (texto, número u objeto) |
| `source` | varchar(20) | `ficha` · `web` · `places` · `wayback` · `gsc` · `busqueda` · `persona` · `ia` |
| `source_ref` | text | URL o id de donde sale |
| `confidence` | smallint 0-100 | Regla en código (p. ej. coincide en 2 fuentes → 90) |
| `status` | varchar(12) | `provisional` · `confirmado` · `descartado` |
| `decided_by`, `decided_at` | | Quién confirmó |
| `created_at`, `updated_at` | | |

Única: `(project_id, field, source)`. Un dato confirmado que también está en la ficha del cliente se **propone** a la ficha (núcleo, con su acción y permisos); nunca se sobrescribe solo.

**Identidad confirmada** (§5): el expediente pasa de «provisional» a «identificado» cuando dos señales independientes coinciden (dominio, teléfono, dirección o ficha de Google). Regla pura con pruebas.

## 2. Local — `seo_reviews` (módulo SEO)

**Para qué.** Reseñas de la ficha de Google con **borrador de respuesta** que se aprueba antes de publicarse. La coherencia del NAP (nombre, dirección, teléfono entre ficha, web y JSON-LD) y «una página por servicio» **no necesitan tabla**: son hallazgos nuevos (`seo.nap_*`, `seo.service_page_missing`).

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id`, `project_id` | | |
| `client_asset_id` | uuid → client_assets | La ficha (Business Profile) del alcance |
| `external_id` | varchar(200) | Id de la reseña en Google (única por ficha) |
| `author`, `rating`, `text`, `published_at` | | |
| `reply_text`, `reply_at` | | Respuesta publicada (si la hay) |
| `draft` | text | Borrador de la IA |
| `draft_status` | varchar(12) | `sin_borrador` · `pendiente` · `aprobado` · `publicado` · `descartado` |
| `created_at`, `updated_at` | | |

Publicar una respuesta es un cambio hacia fuera: **siempre con aprobación** (Para ti), igual que los correos.

**[NV]** La API de reseñas de Business Profile (`accounts.locations.reviews`) exige que Google haya aprobado el acceso del proyecto de Cloud. Si no lo tenemos, la primera versión lee por **Places API** (solo 5 reseñas) y las respuestas se copian a mano.

## 3. Plan de mejora → encargos — `seo_plan_items` (módulo SEO)

**Para qué.** La IA hace solo el **juicio**: agrupa los hallazgos abiertos en propuestas con prioridad, horas y técnica, respetando las horas del proyecto. Cada propuesta aprobada se convierte en encargo con el contrato del núcleo que ya usa Estrategia (`workSource().createTask`, con `projectId`).

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id`, `project_id` | | |
| `title`, `description` | | Lo que verá el equipo |
| `technique` | varchar(40) | De la taxonomía (§5 abajo) |
| `finding_ids` | uuid[] | Hallazgos que resuelve |
| `urls` | text[] | URLs afectadas |
| `priority` | smallint | 1 (alta) a 3 |
| `est_hours` | numeric(5,1) | |
| `hypothesis` | jsonb | `{ metric, direction, magnitude, windowDays }` |
| `status` | varchar(12) | `pendiente` · `aprobada` · `descartada` · `hecha` |
| `request_ref` | varchar(60) | El encargo creado |
| `decided_by`, `decided_at`, `reject_note` | | |
| `origin` | varchar(10) | `ia` · `persona` |
| `created_at`, `updated_at` | | |

Al crear el encargo, los hallazgos se enlazan (`findings.request_id`, ya existe). Las decisiones llegan a **Para ti** y a Telegram, como las de Estrategia.

**Modelo.** Es razonamiento (priorizar con horas y contexto): **Sonnet 5.5**, una llamada por proyecto con los hallazgos **agregados por tipo** (no uno a uno), salida estructurada por la pasarela. Coste estimado **[NV]**: < 0,05 $ por plan.

## 4. Técnica e hipótesis de cada encargo — `request_interventions` (NÚCLEO)

**Para qué.** §7.3: cada encargo hecho sobre una URL es un experimento natural. Hay que guardar **ya**, al crear el encargo, la técnica y la hipótesis (qué métrica, en qué dirección, en cuánto tiempo), porque **es el dato que no se puede recuperar después**.

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | | |
| `request_ref` | varchar(60) | El encargo (id de Operaciones o de ClickUp) |
| `project_id` | uuid → projects | |
| `domain` | varchar(20) | `seo` (después `ads`) |
| `technique` | varchar(40) | |
| `business_type` | varchar(60) | El del expediente |
| `urls` | text[] | |
| `hypothesis` | jsonb | `{ metric, direction, magnitude, windowDays }` |
| `done_at` | timestamp | Lo rellena Operaciones al cerrar el encargo |
| `created_at` | | |

**Por qué en el núcleo y no en SEO.** Ads usará el mismo cerebro con otro dominio (§7.4); en el módulo SEO, Ads no podría leerlo. Que Operaciones rellene `done_at` necesita un enganche del núcleo (un `registerRequestDoneListener`, como `registerClientReplyListener`). **Esto toca el núcleo: por eso te lo pregunto expresamente** (CLAUDE.md).

**Alternativas:**
- **(a) Tabla en el núcleo (recomendada):** sirve para SEO y Ads; un enganche pequeño en el núcleo.
- **(b) `seo_interventions` en el módulo:** sin tocar el núcleo, pero Ads tendría que duplicarla y el cerebro no podría cruzarlas. Además, la fecha de «hecho» habría que leerla de Operaciones por otra vía.
- **(c) Columnas en `ops_requests`:** lo más corto, pero mezcla la medición con la tabla de trabajo de Operaciones, y un encargo de ClickUp que no pasa por `ops_requests` se quedaría sin hipótesis.

**Taxonomía de técnicas:** unas 30, en código (`lib/core/techniques.ts`), versionada: `titulo_reescrito`, `contenido_ampliado`, `nueva_landing_zona`, `schema_negocio`, `enlazado_interno`, `canonical_corregido`, `redireccion_corregida`, `velocidad`, `ficha_google`, `respuesta_resenas`… La propone la IA con el plan y la confirma quien aprueba.

## 5. I+D fase A, la bitácora — `rd_feed_items` (NÚCLEO)

**Para qué.** §7.4 A: vigilar a diario las **fuentes oficiales sin IA**, avisar al momento de las **core updates** y, una vez por semana, resumir y proponer entradas a la base de conocimiento (que ya existe; solo Enric publica).

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | | |
| `domain` | varchar(20) | `seo` (después `ads`) |
| `source_key` | varchar(40) | `search_central_blog`, `search_status_incidents`, `search_changelog`… (lista en código) |
| `url`, `title`, `published_at` | | |
| `kind` | varchar(20) | `core_update` · `incidencia` · `documentacion` · `novedad` |
| `hash` | varchar(40) | Única por cuenta: no se repite |
| `notified_at` | timestamp | Aviso inmediato (core updates) por `ops_notifications` |
| `digest_week` | date | Semana en la que se resumió |
| `created_at` | | |

**Coste.** Lectura diaria por RSS/JSON: gratis. Resumen semanal con **Haiku 5.5** (es clasificar y resumir, no razonar): **[NV]** < 0,10 $/semana. Por debajo de los 3 $/mes del diseño.

**Por qué en el núcleo:** el cerebro es compartido (§3); Ads tendrá sus fuentes en la misma tabla.

## 6. Migración, pruebas y orden

- **Migración 0061** escrita a mano con su entrada en `_journal.json`.
- Antes de migrar en local: `pg_dump` a `backups/backup_pre_seo_20261123.sql`. En producción lo hace `deploy.sh --migrate`.
- Las tablas `seo_*` llevan el prefijo del módulo. `request_interventions` y `rd_feed_items` se añaden a `CORE_TABLES` de las barreras.
- Pruebas: reglas puras (identidad confirmada, confianza, coherencia del NAP, plan dentro de las horas) y, contra la base, una cuenta de pruebas propia con Google y la IA simulados.
- **Mapa Visual:** cada pieza con su paso en «Salud técnica» (o un mapa «SEO: proyecto» si crece), y la comprobación ampliada a `seo_*`, `request_interventions` y `rd_feed_items`.

**Orden de construcción tras tu OK:**
1. Expediente con arranque mínimo (`seo_dossier_facts`) y tipo de negocio guardado.
2. Técnica e hipótesis (`request_interventions`), antes del plan, para que el primer encargo ya las lleve.
3. Plan de mejora → encargos (`seo_plan_items`).
4. Local: NAP y páginas por servicio (hallazgos) y reseñas (`seo_reviews`).
5. I+D fase A (`rd_feed_items`).

## 7. Lo que pido

1. **Las 5 tablas** de arriba (migración 0061).
2. **Tocar el núcleo** para `request_interventions` (opción **a**) y su enganche `registerRequestDoneListener` en Operaciones.
3. **Places API** para el expediente y las reseñas. Hay que activarla en el proyecto de Google Cloud que ya usamos. **[NV]** En 2026 tiene una cuota gratuita mensual por tipo de consulta; lo compruebo antes de gastar.

## 9. Revisión tras la aprobación (23 nov 2026, noche): lo que cambió y por qué

Enric aprobó el diseño y pidió revisar cada decisión pensando en la escalabilidad. Al leer el código existente salieron
cuatro cambios. Las tablas siguen siendo 5 más una columna (migración **0061**).

**1. `request_interventions` → `interventions` (núcleo), y sin enganche nuevo en Operaciones.**
- *Hipótesis inicial:* tabla del núcleo con `registerRequestDoneListener`, al que Operaciones avisa al cerrar un encargo.
- *Cuestionamientos:*
  - (a) ¿Por dónde se cierra un encargo? Por varios caminos: botón de Telegram, revisión, vigilancia de ClickUp y la herramienta que sustituirá a ClickUp en 2027. Un aviso habría que ponerlo en todos y se perdería si falla uno.
  - (b) ¿Ya tenemos algo? Sí: `WorkSource` (contrato del núcleo) ya da «encargos terminados desde una fecha».
  - (c) ¿Es solo de SEO? No: Estrategia ya guarda la hipótesis de sus propuestas (`est_suggestions.expected`) y nadie la mide.
- *Decisión:* `interventions` en el núcleo, con `request_ref` que puede quedar vacío (trabajo hecho sin encargo), `client_id` obligatorio y `project_id` opcional (Estrategia trabaja por cliente), `source` y `source_ref` (una por propuesta, sin duplicar), la versión de la taxonomía, una copia del tipo de negocio, y `outcome` y `measured_at` ya preparados para la fase B (así no hay que volver a migrar).
- *Fecha de hecho:* un trabajo del núcleo pregunta cada hora `workSource().requestStatus(refs)`, que Operaciones implementa con una consulta. No depende de que nadie avise y sirve igual cuando se sustituya ClickUp.
- *Estrategia también registra sus propuestas aprobadas*, desde el primer día.

| Alternativa | Coste | Riesgo | Qué se pierde |
|---|---|---|---|
| Aviso de Operaciones (diseño inicial) | Tocar cada camino de cierre | Eventos perdidos | — |
| **Pregunta horaria por contrato (elegida)** | Un método más en `WorkSource` | Hasta 1 h de retraso (da igual para medir a 28-90 días) | — |
| Leer `ops_requests` desde el núcleo | Mínimo | El núcleo dependería de un módulo (prohibido) | La regla del núcleo |
| No guardar la fecha y calcularla al medir | Nada | Si se borra el encargo, se pierde | La fecha de hecho |

**2. La bitácora de I+D es `kb_feed_items`, no `rd_feed_items`.**
- La base de conocimiento ya es del núcleo con el prefijo `kb_`, y el resumen semanal termina como entrada propuesta de la base. Así no hace falta otra tabla del núcleo sin prefijo.
- El resumen reutiliza el prompt `kb_redactar_entrada`, que ya tiene su examen, en vez de crear uno nuevo. Solo se llama si hubo novedades esa semana.
- Las core updates se publican como «eventos externos» (`registerEventSource`). Así el estratega y las gráficas las ven sin que Estrategia importe nada.
- Fuentes comprobadas el 23 nov: `status.search.google.com/incidents.json` (JSON) y `developers.google.com/search/blog/feed.xml` (RSS).

**3. El plan de mejora se hace por reglas, sin IA (Sonnet quedaba en el diseño inicial).**
- Directiva de optimización de IA: agrupar hallazgos por técnica, estimar horas (minutos por página) y ordenar por gravedad × páginas × impresiones son pasos de cálculo. Por reglas sale gratis, repetible y explicable. La IA queda para cuando una regla no baste.
- Cada propuesta lleva como mucho 40 páginas (las más vistas primero). Así un encargo es manejable y el resto sale en la siguiente tanda.
- Alternativa estudiada: que el estratega de Estrategia hiciera el plan leyendo los hallazgos (un solo plan, una sola bolsa de horas). Se descartó por ahora por tres motivos: el estratega solo trabaja con clientes que tienen plan de seguimiento, usa Opus en cada análisis y todavía no se ha probado en real. Las dos vías convergen en `interventions`. El riesgo de que dos planes compitan por las mismas horas queda acotado, porque ambos ven los encargos abiertos.

**4. El tipo de negocio va a la ficha del cliente (`clients.business_type`), no solo al expediente.**
- Es un dato del cliente que usarán el JSON-LD, la medición por tipo de negocio y, más adelante, Ads.
- La lista de tipos pasa al núcleo (`lib/core/business-types.ts`).
- El expediente puede proponerlo cuando la web ya lo declara, pero solo pasa a la ficha si una persona lo pide.

**Otros ajustes:**
- `seo_reviews` cuelga del cliente y de su ficha de Google, no del proyecto: varios proyectos comparten ficha.
- `seo_plan_items` lleva `plan_key` (técnica#n) para no duplicar al rehacer el plan.
- Places API no la puedo activar yo. La parte local se construirá cuando esté activada, y su tabla ya está creada.

## 8. Sin verificar

- Acceso a la API de reseñas de Business Profile para nuestro proyecto de Cloud.
- Cuota gratuita actual de Places API (New).
- Formato actual del panel de incidencias de Google Search (`status.search.google.com`) para leerlo sin IA.
