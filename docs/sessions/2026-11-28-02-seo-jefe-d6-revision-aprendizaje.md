# Jefe SEO D6: revisión del plan, rendimiento del Jefe y autonomía graduada
**Fecha:** 2026-11-28  
**Rama:** feature/seo-jefe-d6  
**Commit:** e492734c

## Qué se construyó
- `lib/seo/jefe/revision-rules.ts` (nuevo, puro): motivos para revisar el plan (core update terminada, estrategia cerrada, 28 y 90 días), autonomía de las estrategias (>70 % de 10) y proporciones con etiqueta honesta.
- `lib/seo/jefe/revision.ts` (nuevo): pasada diaria que propone la revisión (`seo_jefe_proposals` tipo «revision», 0 $), revisión pendiente y decisión (generar con `requestMasterPlan` o descartar con motivo).
- `lib/seo/jefe/metricas.ts` (nuevo): métricas del Jefe, tendencias por línea y por sector (reutiliza las tendencias del núcleo) y autonomía de la cuenta.
- `app/(dashboard)/dashboard/seo/jefe/page.tsx` (nuevo): Ajustes → Rendimiento del Jefe SEO.
- `app/(dashboard)/dashboard/projects/[projectId]/servicio/revision-propuesta.tsx` (nuevo), `page.tsx`, `servicio-panel.tsx`, `ciclo-propuesta.tsx`: aviso de revisión y estrategias visibles para el responsable SEO con autonomía.
- `lib/seo/jefe-actions.ts`: `decideRevisionAction` (admin); `decideCycleAction` admite editores con autonomía.
- `lib/seo/jefe/cambios.ts`: caducan también las revisiones pendientes al aprobar otra versión. `lib/seo/register.ts`: la pasada de revisión, en el proceso diario.
- `components/app-shell/nav.ts`: entrada y miga. Mapa Visual: paso `jefe-revision`; comprobación pasada.
- `tests/seo-jefe-d6.test.ts` (nueva, 6 pruebas) y `tests/seo-jefe-d6-permisos.test.ts` (nueva, 4: lector, editor sin y con autonomía, admin).
- **Examen del investigador** (pendiente de D5): `lib/seo/id/investigador-eval-cases.ts` (4 lotes inventados: actualización oficial, blog que dice «Google confirma», solo ruido e inyección; corrector por código) y su registro en `lib/seo/jefe/plan-evals.ts`. Se lanza desde IA → Prompts → `seo_investigador` (unos céntimos).

## Migraciones aplicadas
Ninguna (el tipo «revision» de `seo_jefe_proposals` ya existía desde la 0080).

## Decisiones técnicas tomadas en auto mode
- **«n+1 automática» = propuesta automática, generación a petición:** proponer no cuesta nada; generar la versión nueva cuesta unos 0,6 $ de Opus, así que la pide un administrador (como pide el plan). Si más adelante Enric quiere que se genere sola, es un cambio pequeño en la pasada.
- **Calibración:** las métricas de calibración del plan §6 (aprobadas, nota en sombra, evidencias descartadas, divergencia con el puntuador, coste, días hasta el plan) se calculan ya. La calibración del pronóstico a +90 días queda pendiente: hoy el pronóstico de cada frente se guarda como texto, sin cifras estructuradas que comparar.
- **Tendencias por línea y sector:** se reutilizan las del núcleo (`techniqueTrends`, efectos aleatorios y etiqueta honesta) agrupadas por la técnica de cada línea y por el tipo de negocio de la intervención. Sin IA. El texto describe lo observado («de media frente al resto de la web»), nunca la causa.
- **Autonomía graduada:** decisión 3 de Enric tal cual (más del 70 % de 10 aprobadas sin editar). Como las estrategias del Jefe no se editan antes de aprobarlas, «aprobada» = «aprobada sin editar». Cuentan las 20 más recientes, así que si empieza a fallar se pierde sola.
- Protocolo completo no aplicado: todo dentro del módulo SEO, sin núcleo, sin migración y sin coste nuevo.

## Qué verificar manualmente
- Ajustes → Rendimiento del Jefe SEO: con pocos datos dirá «pocos casos» y «sin casos»; el coste del mes debe coincidir con el gasto del Jefe que se ve al generar un plan.
- Un plan aprobado hace más de 28 días: al día siguiente, Plan de servicio enseña «El Jefe SEO propone revisar el plan».

## Pendientes detectados
- Calibración del pronóstico a +90 días (guardar el pronóstico con cifras al crear el plan).
- Pasar con IA real los exámenes de `seo_jefe_plan_maestro` (7 casos, unos 2-3 $) y `seo_investigador` (4 casos, céntimos): ninguno se ha lanzado aún.
- Medir coste y duración reales de un plan, un mensaje del chat y una pasada del investigador.

## Revisor de código
Aprobar con cambios, sin graves. Arreglados: «Generar la revisión» reclama antes la propuesta (dos admins a la vez no generan dos versiones ni pagan dos veces; si los topes no dejan generarla, vuelve a pendiente); prueba de permisos de las estrategias (lector, editor sin y con autonomía, admin); «evidencias descartadas» en vez de «inventadas»; días hasta el plan calculados en SQL (sin desfase de zona horaria). Apuntado como decisión de producto: con la autonomía activa, las decisiones de los editores también cuentan en la tasa que la mantiene (si empiezan a rechazarse, se pierde sola; si se quiere, se puede contar solo lo que decide un admin).
