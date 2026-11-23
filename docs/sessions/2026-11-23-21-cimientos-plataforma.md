# Departamento SEO: investigación, diseño v2 y cimientos de la plataforma
**Fecha:** 2026-11-23  
**Rama:** `diseno/modulo-seo` (diseños) → `feature/cimientos-plataforma` (código)  
**Commit:** 5a3986b5

## Qué se construyó

**Investigación y diseño.**
- Ocho investigaciones:
  - SEO actual, arranque mínimo, I+D y fuentes de datos;
  - inventario del código y plataformas de presencia;
  - organización y cerebro;
  - revisión crítica del código.
- `docs/DISENO-MODULO-SEO.md` (v2):
  - departamento SEO por proyecto;
  - plataforma común;
  - contactos y comunicaciones;
  - conectores de presencia (Search Console social, ChatGPT, Bing, Apple);
  - cerebro de I+D con aprendizaje propio;
  - análisis desde cuatro perspectivas de qué reutilizar.
- `docs/DISENO-TECNICO-CIMIENTOS.md`: diseño técnico del paso 0. Aprobado por Enric («OK a todo»).

**Cimientos (núcleo).**
- `lib/db/schema.ts` y `lib/db/migrations/0060_cimientos_plataforma.sql`:
  - 16 tablas nuevas;
  - columnas nuevas en `projects` (`service`, `monthly_hours`, `brief`, `updated_at`, `legacy`), `clients` (`comms_approval`), `tenants` (`comms_approval_default`) y `ops_requests` (`project_id`).
- `lib/projects/scope.ts`, `lib/projects/actions.ts` y `app/(dashboard)/dashboard/projects/*`:
  - proyecto con cliente obligatorio, servicio, horas y alcance;
  - formulario nuevo con selector de cliente y cuentas.
- `lib/core/comms.ts`, `comms-rules.ts`, `comms-actions.ts`:
  - qué recibe cada contacto;
  - política de aprobación;
  - mensajes a clientes con envío por la cola;
  - respuestas unidas a su hilo;
  - acciones de Para ti.
- `lib/operaciones/comms-bridge.ts`, `resend.ts` (`sendClientEmail`), `inbound-email.ts`:
  - envío por el buzón;
  - aviso al dueño con ✅ / ✖️;
  - entrega de las respuestas al núcleo.
- `lib/core/jobs.ts`: cola de trabajos y procesos periódicos.
- `instrumentation.ts`: `APP_ROLE` (web, worker o ambos).
- `docker-compose.yml` y `docker-compose.prod.yml`: servicio `worker`. En local va en el perfil «worker».
- `scripts/rollback.sh`: recrea también el trabajador.
- `lib/core/gsc.ts`, `gsc-rules.ts`: Search Console en detalle, particionado y paginado.
- `lib/agentes/metrics.ts`: `search` acepta `startRow`, `searchType` y `dataState`.
- `lib/core/crawler.ts`, `crawl-extract.ts` (parse5), `robots.ts`: rastreador.
- `lib/core/findings.ts`, `findings-rules.ts`: hallazgos tipados.
- `lib/core/platform.ts`:
  - alta de lo anterior al arrancar;
  - herramienta `escribir_al_cliente`;
  - limpieza de trabajos;
  - comprobación de Salud.
- `lib/core/capabilities.ts`:
  - `registerMailSender`, `registerCommsApprovalNotifier`, `registerClientReplyListener`;
  - búsqueda de Search Console ampliada;
  - `NewTaskInput.projectId`.
- `lib/operaciones/work-source.ts`: los encargos del estratega guardan su proyecto.
- `lib/core/clients.ts`: no se borra un cliente con proyectos.
- Ficha del cliente (`page.tsx`, `ficha-view.tsx`, `tab-contactos.tsx`) y `lib/core/client-actions.ts`:
  - «Qué recibe» por contacto;
  - aprobación de los correos de ese cliente;
  - aviso de los tipos sin nadie.
- Para ti (`lib/inicio/para-ti.ts`, `page.tsx`, `decision-cards.tsx`): tipo «Correos a clientes por aprobar», con enviar, corregir o descartar.
- `scripts/server-status.sh`: línea de la cola de trabajos.

**Mapa Visual.**
- Nodo «Plataforma» con su mapa (`lib/core/platform-process-map.ts`).
- Paso «Qué recibe cada contacto» en el mapa de Clientes.
- `scripts/check-architecture-map.js` comprueba ahora también las tablas y los trabajos de la plataforma. Pasa.

**Pruebas.**
- `tests/cimientos.test.ts` (28 pruebas).
- `tests/seguridad.test.ts`: 4 acciones nuevas.
- `tests/fixtures.ts`: el proyecto de pruebas tiene cliente.
- En total, 571 correctas (1 saltada, el examen real).

**Documentación.** `docs/ESTADO.md` (§6.36, §10, §16, §18, §19) y `docs/PENDIENTES-ENRIC.md`.

## Migraciones aplicadas

`0060_cimientos_plataforma.sql`, aplicada en local; **pendiente en producción**. Lo que hace:
- **Proyecto:**
  - `projects` gana `service` (CHECK), `monthly_hours`, `brief`, `updated_at` y `legacy`;
  - los proyectos sin cliente pasan a `legacy = true`;
  - CHECK `projects_client_required`: `client_id IS NOT NULL OR legacy`;
  - índice `projects_client_idx`.
- **Tablas:**
  - `project_assets`;
  - `client_contact_subscriptions` (índice único con `coalesce(project_id, cero)`);
  - `client_messages`;
  - `jobs` (índices parciales y único de clave abierta);
  - `job_schedules`;
  - `gsc_properties`, `gsc_queries`, `gsc_pages`;
  - `gsc_daily`, `PARTITION BY RANGE (date)`, con índices por consulta, página y BRIN por fecha;
  - `gsc_daily_totals`, `gsc_daily_country`, `gsc_monthly`;
  - `crawl_runs`, `crawl_pages`, `crawl_links`;
  - `findings`.
- **Columnas nuevas en otras tablas:**
  - `ops_requests.project_id`, con su índice parcial;
  - `tenants.comms_approval_default` (por defecto `siempre`);
  - `clients.comms_approval` (por defecto `heredar`).

El SQL completo está en el archivo.

## Decisiones técnicas tomadas en auto mode

- **El núcleo no habla con Google.** La descarga de Search Console usa la fuente de métricas que registra Agentes (con `search` ampliada), en lugar de mover el OAuth de Google al núcleo. Mover el OAuth arrastraba sus tablas y no era necesario para este paso.
- **Cliente obligatorio sin romper lo antiguo.**
  - Un CHECK `NOT VALID` se sigue comprobando en cada UPDATE: con él, archivar el proyecto antiguo sin cliente habría fallado.
  - Por eso los proyectos que existen al migrar quedan marcados `legacy` y la regla es `client_id IS NOT NULL OR legacy`.
  - Para no dejar un proyecto huérfano, borrar la ficha de un cliente con proyectos da un error claro.
- **El trabajador usa la misma imagen** (`kijutech-app:latest`, sin compilar dos veces). En local, sin `APP_ROLE`, la app hace las dos cosas para no gastar memoria en el PC.
- **El planificador antiguo se queda** para Operaciones, Estrategia y Rendimiento; se trasladarán a la cola uno a uno.
- **Search Console sin país en el detalle diario:** casi todo es España. El país va aparte, en totales por día.
- **Hilos de correo por un Message-ID propio** («cm-<id>@dominio»). Queda sin verificar que Resend lo respete.
- **Aprobar correos a clientes en la web es de administración.** Por Telegram, solo el dueño, como en Mi bandeja.
- **Un agente que leyó webs en su turno nunca envía solo**, aunque la política diga «nunca».
- **El rastreador no sigue redirecciones:** las registra y encola el destino si es del mismo sitio. Tampoco ejecuta JavaScript: avisa.
- **Retención:**
  - detalle de Search Console, 24 meses (borrando la partición entera);
  - rastreos, las 3 últimas ejecuciones por proyecto;
  - trabajos terminados, con la limpieza semanal.

## Qué verificar manualmente

Tras ampliar el servidor y desplegar:
- `server-status.sh` muestra `kijutech_worker` en marcha y «cola de trabajos: 0 pendientes».
- **Proyectos → Nuevo:** obliga a elegir el cliente y enseña sus webs y cuentas para el alcance.
- **Ficha de un cliente → Contactos:**
  - aparece el bloque «Correos a este cliente» y el aviso de los tipos sin nadie;
  - «Qué recibe» guarda.
- **Escribir a un cliente** (por Telegram al agente: «escribe a X preguntando…»):
  - llega a Para ti y a Telegram con ✅ / ✖️;
  - al aprobar, sale una sola vez;
  - al responder el cliente, la respuesta aparece en Correos.
- **Un proyecto con Search Console en su alcance:** en unos minutos hay filas en `gsc_properties`, y en horas, en `gsc_daily`.

## Pendientes detectados

- **Por comprobar con un envío real:** si Resend respeta el Message-ID propio.
- **El volumen real de `gsc_daily`.** Si una propiedad llega al tope diario, la exportación a BigQuery.
- **Trasladar a la cola:** Estrategia y Rendimiento.
- **Hito 1 del SEO:**
  - expediente provisional;
  - reglas de auditoría;
  - JSON-LD con su código;
  - local;
  - plan de mejora;
  - I+D en fase A;
  - técnica e hipótesis en los encargos.
- **Ficha del cliente:** solo se marcan las suscripciones «para todos los proyectos»; la pantalla por proyecto vendrá con el Hito 1.
