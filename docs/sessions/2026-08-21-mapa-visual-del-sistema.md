# Mapa Visual del Sistema — nueva sección super_admin
**Fecha:** 2026-08-21
**Rama:** main
**Commit:** 5cd5b0af3073aae5c32d2ae44dab66602b5cb736

## Qué se construyó

- `lib/ai/clustering/pipeline.ts` — nuevos exports `ProcessStep` (interfaz)
  y `CLUSTERING_PROCESS_MAP`, co-ubicados con `clusterKeywords()`. Describen
  las 7 capas reales del pipeline en su orden real de ejecución (detección
  de marca antes que normalización de intención, corregido respecto al
  borrador original del pedido).
- `lib/seo/competitor-analysis-builder.ts` — nuevo export
  `COMPETITOR_ANALYSIS_PROCESS_MAP` (5 pasos: URLs → scraping → contexto →
  IA → guía accionable). No vive en `competitor-actions.ts` (que orquesta
  el flujo) porque ese archivo lleva `'use server'`, y Next.js exige que un
  archivo así solo exporte funciones async.
- `lib/architecture-map/registry.ts` (nuevo) — `SystemNode`, `CORE_NODES`
  (Proyectos y Núcleo, Motor de IA, Panel del Cerebro, Admin SEO, Análisis
  de Competidores), `getSystemMap()` (combina `CORE_NODES` con
  `modules/seo/manifest.json` vía `getSeoManifest()`), `getProcessMap()`.
- `app/(dashboard)/dashboard/architecture/page.tsx` — Server Component,
  guard `super_admin` (mismo patrón que `/dashboard/ai/brain`), calcula
  `getSystemMap()` y los `ProcessStep[]` de ambos procesos conocidos, los
  pasa como props al cliente.
- `app/(dashboard)/dashboard/architecture/architecture-map-client.tsx` —
  componente cliente con `@xyflow/react`: nivel 1 (mapa general, dos filas:
  infraestructura + flujo del wizard), nivel 2 (detalle de proceso al hacer
  clic en un nodo con `detailMapId`), animación "Ver flujo"
  (`setInterval`, sin librería adicional).
- `app/(dashboard)/dashboard/layout.tsx` — ítem "Mapa" en el sidebar, junto
  a "Cerebro", condicional a `super_admin`.
- `package.json` / `pnpm-lock.yaml` — nueva dependencia `@xyflow/react`.

## Migraciones aplicadas

Ninguna.

## Decisiones técnicas tomadas en auto mode

- **`COMPETITOR_ANALYSIS_PROCESS_MAP` movido de `competitor-actions.ts` a
  `competitor-analysis-builder.ts`**: el pedido original sugería
  `competitor-actions.ts` como ubicación probable, pero ese archivo lleva
  `'use server'` — Next.js solo permite exportar funciones async desde un
  archivo así, así que un `const` array ahí rompería el build.
- **Instalación de `@xyflow/react` sin bind mount**: `docker-compose.yml`
  no monta el repo dentro del contenedor `app` (todo se copia en build), así
  que `pnpm add` ejecutado con `docker exec` no tocaba el `package.json` del
  host. Se resolvió instalando dentro del contenedor y copiando
  `package.json`/`pnpm-lock.yaml` resultantes de vuelta al host con
  `docker cp` — nunca se ejecutó pnpm en Windows, cumpliendo la regla
  crítica de CLAUDE.md.
- **Cliente de React Flow sin importar `registry.ts`/`pipeline.ts` por
  valor**: ambos módulos arrastran dependencias de servidor (`fs` vía
  `getSeoManifest()`, Drizzle vía `pipeline.ts`) que no pueden ir al bundle
  del navegador. El componente cliente solo usa `import type` de esos
  archivos; los datos reales bajan ya calculados como props desde
  `page.tsx` (Server Component).
- **"Análisis de Competidores" como nodo propio de `CORE_NODES`, no
  sub-detalle de `keyword_research`**: `SystemNode.detailMapId` es un campo
  singular y `keyword_research` ya lo usa para el pipeline de clustering.
  Como el análisis de competidores no es una etapa del manifest (se abre
  desde dentro de un cluster ya creado), se le dio nodo propio conectado a
  `keyword_research` con una línea discontinua sin animar y la etiqueta
  "se usa desde".
- **Orden corregido en `CLUSTERING_PROCESS_MAP`**: el borrador del pedido
  listaba "normalización de intención" antes que "detección de marca"; en
  `pipeline.ts` el orden real es al revés (Capa 0b antes que Capa 0). Se
  usó el código real como fuente de verdad.
- **No se incluyeron "IA & Modelos" ni "Configuración SEO" en
  `CORE_NODES`**: son pantallas de configuración administrativa, no piezas
  de flujo o infraestructura relevantes para que alguien sin conocimiento
  técnico entienda cómo funciona el sistema — habrían añadido ruido visual
  sin aportar valor al objetivo del mapa.

## Qué verificar manualmente

Ya verificado en esta sesión, en navegador real (`http://127.0.0.1:3000/dashboard/architecture`):
- Guard `super_admin` funciona, ítem "Mapa" aparece en el sidebar.
- Nivel 1: 5 tarjetas de infraestructura + 8 etapas del wizard (4 verdes
  "Construido", 4 grises "Planeado"), conectadas con flechas animadas en
  orden secuencial; línea discontinua "se usa desde" entre Keyword Research
  y Análisis de Competidores.
- Nivel 2 de "Keyword Research": 7 pasos en el orden real del pipeline.
- Nivel 2 de "Análisis de Competidores": 5 pasos.
- Botón "Ver flujo" resalta nodos secuencialmente (~800ms cada uno) con
  anillo azul; botón cambia a "Detener".
- "← Volver al mapa general" funciona y detiene cualquier animación en
  curso.
- `tsc --noEmit` limpio; `docker compose up --build -d` completó sin
  errores.

Pendiente de verificar por Enric: comportamiento del mapa cuando se añadan
más procesos/nodos en el futuro (no probado con más de 2 `detailMapId`
distintos).

## Pendientes detectados

- La regla nueva de CLAUDE.md ("Mapa Visual del Sistema — mantenimiento
  obligatorio") depende de que cada sesión futura recuerde actualizar el
  `*_PROCESS_MAP` correspondiente al tocar un proceso multi-fase — no hay
  ningún mecanismo automático (test, lint) que falle si alguien lo olvida.
  Si en el futuro esto se vuelve un problema recurrente, valdría la pena un
  test que compare el número de pasos declarados en el `*_PROCESS_MAP`
  contra el número de capas reales invocadas en el pipeline correspondiente.
