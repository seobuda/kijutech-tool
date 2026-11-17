# Informe del mes incompleto (C6) y coste de las llamadas de IA fallidas (I3)
**Fecha:** 2026-11-17  
**Rama:** fix/estrategia-informe-mes (sale de `fix/estrategia-medias-calendario`, C4)  
**Commit:** 04679b03

## Qué se construyó
- `lib/rendimiento/rules.ts` (`periodRanges`): con una comparación fija (informe del mes) y el mes actual recortado porque aún no hay datos de los últimos días, la comparación se recorta a los mismos días (1-N frente a 1-N). Con el mes entero no cambia nada (febrero sigue comparándose con enero entero).
- `lib/rendimiento/report.ts` (`monthlyClientText`): con el mes incompleto dice «frente a los mismos días de oct 2026» en vez de «frente al mes anterior».
- `lib/ai/types.ts`: nuevo `AIBilledError` (error con los tokens cobrados).
- `lib/ai/adapters/anthropic.ts`: una respuesta sin texto (pensó hasta el límite, o rechazo) lanza `AIBilledError` con `usage`.
- `lib/ai/gateway.ts` (`callAI`, nuevo `costOf`): guarda tokens y coste en el job `failed`; si responde la IA de reserva, el job suma los dos intentos.
- `tests/rendimiento.test.ts`, `tests/ia-adaptador.test.ts`: pruebas de C6 e I3 (con `fetch` simulado y una cuenta de prueba que se borra al terminar).
- `lib/rendimiento/process-map.ts`, `lib/operaciones/process-map.ts`, `docs/ESTADO.md`, `docs/REVISION-2026-11-17.md`: actualizados.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **C6, recorte solo si el mes está incompleto:** recortar siempre a la longitud del mes actual habría comparado febrero con 28 días de enero; solo se recorta cuando el periodo pedido acaba antes de lo pedido por falta de datos.
- **I3, solo Anthropic por ahora:** es el único adaptador que detecta respuestas vacías. Los de reserva (OpenAI, Gemini, DeepSeek) aún dan por buena una respuesta vacía; se arreglan con I6, y entonces lanzarán también `AIBilledError`.
- **Un job, no dos:** si falla el principal y responde la reserva, el coste de ambos va en el mismo job (no se crea un job extra), para que las cuentas por función sigan siendo una llamada = un job.
- **Tiempo agotado:** una llamada cancelada por tiempo no devuelve tokens, así que su coste sigue sin poder registrarse (la API no lo dice).

## Qué verificar manualmente
- Pestaña Rendimiento de un cliente → «Informe del mes» del mes en curso (o el día 1-3 del mes siguiente): debe decir «(hasta el N)» y «frente a los mismos días de…».
- Sistema → Gasto de IA: los fallos por «respuesta vacía» del registro de errores deben verse ahora con coste en ai_jobs.

Comprobaciones hechas:
- `pnpm test`: 376/376.
- `node scripts/check-architecture-map.js`: OK (Mapa Visual actualizado).

## Pendientes detectados
- **I6:** adaptadores de reserva que dan por buena una respuesta vacía (y que deberían lanzar `AIBilledError`).
- **I5:** una respuesta cortada por `max_tokens` llega como «JSON no válido» a quien llama; convendría un error que diga «respuesta cortada».
