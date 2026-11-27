# SEO: estrategias por ciclos (fases A+C)
**Fecha:** 2026-11-27
**Rama:** feature/seo-ciclos
**Commit:** 3133d416

## Qué se construyó
Enric describió cómo imagina el trabajo (iniciar estrategia → el sistema monta, reparte, vigila; estrategias trimestrales aisladas; un agente que propone; aprender entre clientes). Fable 5.2 lo analizó con espíritu crítico y escribió `docs/PLAN-SEO-CICLOS.md`. Enric aprobó las 6 recomendaciones. La auditoría Opus encontró 3 fallos graves y 7 importantes, todos aplicados (§11 del plan). Se construyen las fases A+C juntas (lo mínimo útil).
- `lib/seo/estrategia/playbooks.ts` (puro): catálogo de 8 líneas (cimientos, contenido con cadencia, refuerzo al alcance, páginas de servicio y zona, ficha y reseñas, enlaces, datos estructurados, recuperar contenido). Cada línea tiene elegibilidad con motivo, parámetros saneados, horas por unidad y calendario por lunes. `validateStrategy` exige de 1 a 3 líneas, elegibles, sin repetir y que quepan en meses × horas × (1 − reserva).
- `lib/seo/estrategia/ciclos.ts`:
  - `eligibilityContext` sin IA;
  - `createCycle` (activo; `lote_admin` en los dos primeros ciclos de estrategia);
  - `approveMonth` y `cancelCycle`;
  - `materialize` (salta lo no aprobado a las 3 semanas, aprueba solo en automático, encarga como mucho 10 a 14 días vista, el contenido por el brief y lo demás por una propuesta «ia», y marca hecho);
  - `getCycleView` con el marcador de la cohorte de contenido;
  - `materializeAll`, la pasada diaria.
- `lib/seo/estrategia-actions.ts`: crear, aprobar y cancelar (admin); «Encargar ahora» (edit).
- `lib/seo/plan/plan.ts`: `regeneratePlan` solo rehace la cola «reglas». `planSchedule` usa dos bolsas: lo del ciclo no cuenta y lo reactivo tiene las horas que el ciclo no usa, con la reserva como mínimo.
- `lib/estrategia/strategist.ts`: un solo cerebro. No propone contenido, on-page, técnico, enlaces ni ficha si el cliente tiene proyecto SEO.
- `lib/seo/register.ts`: tarea diaria «seo: encargar las tareas de las estrategias».
- Pantalla: Proyecto → Trabajo → **Estrategia**, la primera sección (`estrategia/page.tsx` y `estrategia-panel.tsx`).
- Mapa Visual: paso «Estrategia por ciclos». `tests/seo-ciclos.test.ts`: 10 pruebas.

## Migraciones aplicadas
`0078_seo_ciclos.sql`, aditiva. Crea:
- `seo_cycles`, con un solo activo por proyecto (índice único parcial) y `(project_id, seq)` único;
- `seo_cycle_lines`;
- `seo_cycle_slots`, con `(line_id, due_week, n)` único, aprobación por hueco y enlaces a la propuesta, al brief y a la intervención.

Y añade las columnas `seo_plan_items.cycle_id` y `cycle_line_id` (`SET NULL`) y `seo_briefs.cycle_line_id`. El SQL completo está en el archivo.

## Decisiones técnicas tomadas en auto mode
- Fases A+C juntas, como pedía la auditoría. La IA que propone queda para la fase D, después de 2-3 ciclos manuales.
- Para el contenido hay un único camino, el del brief (una sola intervención).
- Revisor de código: aprobó con cambios, y estos se aplicaron: el hueco se reserva antes de pedir el brief; un brief fallido o atascado más de 24 h deja el hueco saltado; si la tarea ya estaba encargada, el hueco no se queda en bucle; se comprueba la referencia del encargo; el ciclo se cierra solo al acabar; el estratega antiguo solo calla si hay estrategia activa, y el periodo se cuenta desde el lunes.
- Medición del contenido nuevo: se deja para la fase E, porque toca el núcleo.
- Los temas se eligen al encargar, excluyendo los que tienen una propuesta reactiva abierta.
- En local no se pulsó «Aprobar el lote», para no crear tareas reales en ClickUp fuera de «Pruebas Kiju».

## Qué verificar manualmente
- En un proyecto de producción con horas al mes:
  - Trabajo → Estrategia → elegir líneas → «Activar la estrategia»;
  - «Aprobar el lote» del mes → las tareas a 2 semanas vista se encargan, en ClickUp o como brief;
  - al día siguiente, la pasada diaria.
- El plan de mejora sigue apareciendo y reparte solo las horas que la estrategia no usa.

## Pendientes detectados
- Fases B (ciclo 0 «Cimientos» y etapas), PLAN-UX 2 (embudo y Caso), D (agente), E (cierre y lectura a +90 días; medición del contenido nuevo en el núcleo) y F (aprendizaje).
- Los encargos de briefs siguen sin contar en `usedThisMonth` (ya pasaba antes).
- El informe mensual debería filtrar lo «ia» no aprobado.
