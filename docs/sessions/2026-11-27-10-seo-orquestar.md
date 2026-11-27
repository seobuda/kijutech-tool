# SEO parte 11: tendencias entre clientes y orquestar
**Fecha:** 2026-11-27  
**Rama:** feature/seo-orquestar  
**Commit:** d27e8051

## Qué se construyó
- `docs/DISENO-SEO-ORQUESTAR.md`: diseño, auditoría Opus y decisión rehecha.
- `lib/core/measure.ts` y `measure-rules.ts`: cada punto de control guarda `valid`, clics (`clicksEffectLog`, `clicksSe`, `clicksValid`) y `confounders`. El error tiene un suelo de 0,05.
- `lib/core/technique-trends-rules.ts` y `technique-trends.ts` (nuevos):
  - un punto de control por intervención;
  - media por cliente y DerSimonian-Laird;
  - intervalo con t de Student;
  - etiqueta honesta y `planFactors`;
  - caché de 15 min.
- `lib/seo/plan/rules.ts` y `plan.ts`: el factor solo ordena dentro de cada prioridad, también en la lista visible.
- `plan/page.tsx` y `resultados-panel.tsx`: «Tendencias por técnica en todos los clientes».
- Mapa Visual: `plt-tendencias`.
- **Pruebas:** `tests/seo-tendencias.test.ts`. Pasan las 833.
- `docs/PENDIENTES-ENRIC.md`: panel de IA, Autoridad y GoHighLevel.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Panel de IA:** no se construye (presupuesto y preguntas: lo decide Enric).
- **Factor del plan:**
  - solo con 50 casos y 10 clientes con clics válidos;
  - centrado en la media y acotado a [0,8, 1,25];
  - sin las técnicas que nacen de una caída (regresión a la media).
- **Lo medido antes de esta rama** no tiene `valid`: las tendencias se llenan desde ahora (es lo prudente).

## Revisor de código
Aprobar con cambios, sin graves. Todo lo medio está arreglado:
- el factor ordena también la lista visible;
- la varianza por cliente no premia a quien tiene más intervenciones;
- el intervalo es el del efecto medio;
- hay un factor por técnica, con mínimos sobre los clics;
- se añade una caché;
- la página no cae si fallan las tendencias.

## Qué verificar manualmente
- Plan → Resultados → «Tendencias por técnica»: hoy, «Aún no hay intervenciones medidas».

## Pendientes detectados
- **Remedir los puntos antiguos sin `valid`:** no se hace ahora; hace falta OK.
