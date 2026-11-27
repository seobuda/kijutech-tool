# Jefe SEO: orden del plan según cómo atiende el negocio (ficha de Google)
**Fecha:** 2026-11-27  
**Rama:** feature/seo-jefe-local  
**Commit:** 0905e06e

## Qué se construyó
- `lib/seo/jefe/local-profile.ts` (nuevo, puro): perfil del negocio (local físico, a domicilio o por zona, solo online, sin público, sin confirmar), evidencias `L:` (ficha, reseñas frente a la competencia, mapa por zonas, NAP; «sin medir» si no hay dato) y señal local.
- `lib/seo/jefe/expediente.ts`: sección «Ficha de Google y mapa» con el perfil y las evidencias `L:` (lee `getLocalView` y `getGeogridView`: datos ya descargados, 0 $ extra); `summary.profile`.
- `lib/seo/jefe/plan-rules.ts`: señales locales por el grupo «local» de los tipos de hallazgo (antes un patrón que casi nunca casaba) y `seo.zone_page_missing`/`seo.service_page_missing` para servicio y zona; niveles de orden por perfil (`TIERS`); `scorePlan` con perfil y las reglas de Enric; frente local sin línea para lo básico de la ficha.
- `lib/seo/jefe/plan.ts`: el puntuador recibe el perfil y lo guarda en `scorer.profile`.
- `lib/seo/jefe/plan-eval-cases.ts`, `plan-evals.ts`: examen con 7 casos (nuevos: clínica con ficha floja, tienda online, ficha fuerte, reformas a domicilio sin ficha), comprobaciones `mustNotQ1` y `noPlaybook`.
- `lib/seo/estrategia/playbooks.ts`: descripción de «Ficha de Google y reseñas» (las pide el cliente; publicaciones al final).
- `lib/seo/salud/process-map.ts`, `docs/ESTADO.md` §6.70: mapa y estado.
- `tests/seo-jefe-local.test.ts` (nuevo), `tests/seo-jefe-d2.test.ts`.

## Migraciones aplicadas
`lib/db/migrations/0081_seo_jefe_local.sql` (solo datos): `UPDATE ai_prompts` del prompt `seo_jefe_plan_maestro` a la versión 2 con dos `replace()` (punto 2 del orden de la agencia por perfil, con las reglas de reseñas y publicaciones; y `local → null o local_ficha_resenas`), solo si sigue en la v1 original. El SQL completo está en el archivo.

## Decisiones técnicas tomadas en auto mode
- Análisis de Fable 5.2 (3 puntos de vista, 4 alternativas: dejarlo, subir local para todos, perfil por cómo atiende, quitar el orden). Elegida la C; Enric aprobó sus 4 decisiones: ficha siempre en el T1 de un negocio local, reseñas continuas solo si va por detrás o parada, las pide el cliente, publicaciones bajan.
- Revisor: la ficha obligatoria en el T1 se aplica al local físico; a domicilio solo si le falta lo básico (el prompt y los niveles la ponen al mismo nivel que exprimir y servicio y zona). Sin doble penalización ni señales contadas dos veces (NAP y reseñas paradas ya suman por sus hallazgos). Tipo «Organization» con ficha = sin confirmar. La categoría de la ficha va en la etiqueta delimitada como dato no fiable.
- «Sin categorías adicionales» ya no cuenta como falta de lo básico (muchos negocios válidos no las tienen).

## Qué verificar manualmente
- Expediente → confirmar «Cómo atiende» de un cliente local; generar el plan de servicio y ver que la ficha va en el trimestre 1 y que el puntuador no avisa.
- Con un cliente solo online, que la ficha no aparezca en el T1.
- IA → Prompts → `seo_jefe_plan_maestro`: está en la versión 2; pasar el examen (7 casos, unos 2-3 $).

## Pendientes detectados
- En local no hay fichas cargadas: la sección `L:` solo se ha comprobado con pruebas y en producción con datos reales.
- Las señales de contenido y de lo que ya posiciona se saturan por conteo (una por búsqueda): convendría normalizarlas.
- Varias fichas por cliente: hoy se usa la confirmada del cliente; con varias sedes habría que elegir por proyecto.
- Mapa Visual actualizado y comprobación pasada; 925 pruebas en verde.
