# SEO: punto de retorno

**Fecha:** 2026-11-28. **Estado:** módulo SEO y plan del Jefe SEO (D0-D6) terminados y en producción.
**Versión congelada:** etiqueta de git `seo-v1` = commit `ff712133` (producción el 28 nov, 84 migraciones, `0000`…`0083`).

> **Para qué sirve.** Es la puerta de entrada cuando se vuelva a trabajar en el SEO. A partir del 28 nov se construye el
> módulo de Google Ads. Al volver al SEO, se lee **este documento primero**. Lo que diga sobre Ads otro documento no aplica
> al SEO, salvo lo que esté en «Lo que comparten SEO y Ads» de este documento.

---

## 1. Cómo retomar el SEO sin mezclarlo con Ads

1. **Leer, en este orden:**
   1. este documento;
   2. `docs/ESTADO.md` §6.36-§6.71 (solo las entradas que empiezan por «SEO»);
   3. `docs/PLAN-SEO-JEFE.md` y `docs/LISTA-CERRADA-SEO.md`.
2. **Ver qué ha cambiado desde `seo-v1`:** `git diff seo-v1 -- lib/seo app/(dashboard)/dashboard/seo "app/(dashboard)/dashboard/projects/[projectId]" tests/seo-*`.
   - Si el diff toca `lib/core/**`, puede haber sido Ads usando una capacidad compartida.
   - Revisar esos cambios antes de tocar nada.
3. **Rama propia:** `feature/seo-…` o `fix/seo-…`. **Nunca** se mezcla en la misma rama un cambio de SEO y uno de Ads.
4. **Documentos de sesión:** se nombran con `seo-` en la descripción (por ejemplo `2026-12-10-11-seo-calibracion.md`). Los de Ads, con `ads-`.
5. **Lo que no se toca desde el SEO:** `lib/ads/**`, las tablas `ads_*` y las pantallas de Ads.
   - Si una mejora del SEO necesita algo de Ads (o al revés), va por el núcleo con el protocolo de decisión.
   - Nunca se resuelve con un import directo. Lo comprueba `tests/arquitectura-guardrails.test.ts`: `ads` ya figura como módulo y `ads_` como prefijo de tabla.

---

## 2. Dónde vive el SEO

| Qué | Dónde |
|---|---|
| Código del módulo | `lib/seo/**` (subcarpetas: `alta`, `arranque`, `autoridad`, `cambios`, `competencia`, `contenido`, `demanda`, `estrategia`, `expediente`, `id` (I+D y fuentes), `jefe` (Jefe SEO D1-D6), `local`, `mapa`, `medir`, `panel-ia`, `plan`, `posiciones`, `preguntas`, `salud`, `vigilancia`, `vivo`) |
| Registro en la app | `lib/seo/register.ts` (trabajos, herramientas, exámenes de prompts), conectado en `lib/app-wiring.ts` |
| Pantallas del proyecto | `app/(dashboard)/dashboard/projects/[projectId]/` (`resumen`, `salud`, `palabras`, `posiciones`, `local`, `autoridad`, `ia`, `plan`, `estrategia`, `servicio`, `expediente`, `briefs`, `vivo`, `seo`) |
| Ajustes del SEO | `app/(dashboard)/dashboard/seo/` (`admin`, `fuentes`, `jefe`) |
| Manifiesto | `modules/seo/manifest.json` (heredado de agosto) y `lib/seo/manifest.ts` |
| Tablas | 44 con prefijo `seo_` (desde `seo_kw_*` de agosto hasta `seo_sources` en la 0082) |
| Piezas del núcleo que usa | `jobs`, `gsc_*`, `crawl_*`, `findings`, `interventions`, `kb_feed_items`, `project_assets`, `client_*` y las capacidades de `lib/core/capabilities.ts` (`agentChat`, `registerTools`, `registerJobKind`/`enqueueJob`, `registerPromptEvalSuite`) |
| Pruebas | 41 archivos `tests/seo-*.test.ts` (966 pruebas en verde en `seo-v1`, contando todas las del proyecto) |
| Mapa Visual | los `*_PROCESS_MAP` de `lib/seo/**`, registrados en `lib/architecture-map/registry.ts` |

**Trabajos en segundo plano (`seo.*`):**
- `alta.proponer`, `expediente.collect`, `competencia.find`, `mapa.build`
- `salud.audit`, `salud.externos`, `salud.puertas`, `vigilancia.confirm`
- `posiciones.recoger`, `geogrid.recoger`, `local.confirmar`, `dinero.confirmar`
- `brief.build`, `brief.articulo`, `panel_ia.pregunta`
- `preguntas.preparar`, `preguntas.leer`
- `plan.regenerate`, `jefe.plan`
- `id.watch`, `id.digest`, `id.investigate`

**Prompts:**
- `seo_proponer_ficha`
- `seo_leer_respuestas`
- `seo_redactar_articulo`
- `seo_jefe_plan_maestro` (Opus 5.5, con examen de 7 casos)
- `seo_investigador` (Sonnet 5.5, con examen de 4 casos)

---

## 3. Qué hace (de principio a fin)

1. **Alta y análisis inicial (D0):** la IA propone la ficha y una persona la confirma. «Empezar análisis» encadena rastreo, auditoría, expediente, mapa de palabras y competencia, por etapas con puertas.
2. **Diagnóstico continuo:** salud técnica y velocidad, vigilancia de caídas y de páginas de dinero, posiciones semanales, ficha de Google y reseñas, mapa por zonas, autoridad (apagada por proyecto) y panel de IA mensual.
3. **Estrategia (Jefe SEO D1-D4):** expediente estratégico y plan de servicio a 12-24 meses (Opus, en modo sombra, lo aprueba un admin). Chat con el Jefe y cambios propuestos. Estrategia trimestral desde el plan, por código.
4. **Ejecución:** plan de mejora → encargos en ClickUp con receta. Briefs → artículo con IA → borrador en WordPress.
5. **Medición:** «¿funcionó?» por diferencias en diferencias, diagnóstico de caídas, tendencias entre clientes, informe mensual con aprobación y leads de GoHighLevel.
6. **Al día y aprendiendo (D5-D6):** fuentes de novedades editables, investigador cada 3 días, revisión del plan propuesta sin coste, Rendimiento del Jefe SEO y autonomía graduada de las estrategias.

**Detalle por parte:** `docs/ESTADO.md`. **Diseños:**
- `docs/DISENO-MODULO-SEO.md` (v2)
- `docs/DISENO-SEO-*.md`
- `docs/PLAN-SEO-JEFE.md`
- `docs/PLAN-SEO-CICLOS.md`
- `docs/PLAN-UX-SEO.md`

**Simulación con un cliente:** `docs/SIMULACION-SEO-CLIENTE.md`. **Investigación de mercado:** `docs/INVESTIGACION-SEO-MERCADO.md`.

**Documentos históricos** (sirven de contexto, pero ya no describen el estado): `docs/INVENTARIO-SEO.md` (25 nov) y `docs/DISENO-SEO-PARTE0.md`/`PARTE1.md`.

---

## 4. Lo que falta (punto de partida al volver)

### 4.1 Antes de decir «lleva un proyecto al 100 %»: piloto real

Nunca se ha hecho el recorrido completo con un cliente real. **Lo primero al volver** es un piloto supervisado con un cliente que tenga Search Console:
1. «Empezar análisis» y confirmar la ficha, incluido «Cómo atiende».
2. Generar el plan del Jefe, revisarlo en sombra y aprobarlo o rechazarlo con motivo.
3. Aprobar la estrategia del trimestre y el lote del primer mes, y comprobar los encargos en ClickUp.
4. Preparar el primer informe mensual.

Lo que falle en el piloto es la lista de arreglos.

### 4.2 Lo que solo puede hacer Enric

También está en `docs/PENDIENTES-ENRIC.md`:
- **Pasar los exámenes:**
  - `seo_jefe_plan_maestro`: unos 2-3 $;
  - `seo_investigador`: céntimos;
  - se lanzan desde IA → Prompts.
- Confirmar «Cómo atiende» en los expedientes.
- Usuario de WordPress para pruebas.
- Contrato RGPD (art. 28) antes de conectar GoHighLevel en producción.
- Presupuesto y preguntas del panel de IA.
- Cobertura de Autoridad.
- Aprobar el primer informe mensual.

### 4.3 Mejoras de Claude (sin urgencia)

- **Calibración del pronóstico a +90 días:** guardar el pronóstico de cada frente con cifras al crear el plan. Hoy se guarda como texto.
- **Medir el coste y la duración reales de:**
  - un plan;
  - un mensaje del chat;
  - una pasada del investigador.
- **Llevar los frentes puntuales del plan al Plan de mejora.**
- **Identificar el «1 error nuevo»** que sale siempre en el registro tras desplegar. `server-status.sh` no da el detalle.
- **Ficha y fuentes:**
  - varias fichas de Google por cliente;
  - poder cambiar de nivel una fuente de novedades;
  - saturación de las señales de contenido.
- **Plan de mejora:**
  - mover una propuesta de mes a mano;
  - aprobación automática de lo que cabe;
  - excluir las páginas de temporada en caída.
- **Autonomía graduada:** decidir si cuentan también las decisiones de los editores o solo las de un admin (`docs/sessions/2026-11-28-02-…`).
- **Opcionales:**
  - bot de Telegram propio del SEO;
  - hilos de chat por frente;
  - que la versión n+1 del plan se genere sola (hoy la pide un admin, unos 0,6 $).

---

## 5. Lo que comparten SEO y Ads (cuidado al tocarlo)

Estas piezas del núcleo las usan los dos módulos:
- `jobs`;
- `interventions`;
- `project_assets`;
- `client_*` (ficha, competencia, leads);
- `kb_*` (base de conocimiento);
- capacidades de `lib/core/capabilities.ts`;
- `agt_*` (organigrama y jefes de departamento);
- registro de errores `sys_error_*`;
- gasto de IA.

Si un cambio para Ads toca una de ellas:
- Pasar las pruebas `tests/seo-*` además de las de Ads (`deploy.sh` ya pasa todas).
- Apuntarlo en el documento de sesión con la línea «Afecta al SEO: …».
- Si cambia el comportamiento que ve el SEO, añadir una línea en la sección 6 de este documento.

**Datos de Google Ads en el SEO hoy:**
- el volumen de búsquedas de la parte 7 (demanda) viene de DataForSEO, con datos del Planificador de palabras de Google Ads;
- no hay conexión con cuentas de Ads.

---

## 6. Cambios hechos fuera del SEO que le afectan (desde `seo-v1`)

| Fecha | Rama | Qué cambió | Efecto en el SEO |
|---|---|---|---|
| — | — | (vacío el 28 nov) | — |
