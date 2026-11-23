# Avisos de encargos para otro día: salen el día que toca
**Fecha:** 2026-11-23  
**Rama:** fix/avisos-solo-hoy  
**Commit:** cdecf405

## Qué se construyó
Lo detectó Jesús el 20 nov: le llegó al momento el aviso de un encargo con fecha de otro día y se puso a hacerlo. Enric aprobó el arreglo el 23 nov («empieza por el 1»).

- `lib/operaciones/deferred-notice.ts` (nuevo, puro): `deferredNoticeAt(ficha, encargo, ahora)` decide cuándo sale el aviso. Al momento: sin fecha, fecha de hoy o pasada, urgente (prioridad 1) o ficha desactivada. Si no: el día de la fecha a la hora de entrada de la persona, en su zona, en el minuto permitido más cercano si cae en su comida o silencio; si ese día no trabaja (fin de semana, festivo o ausencia), el último día laborable antes; si ese día ya es hoy, al momento. También `zonedToMs` y `addDays`, que antes vivían privadas en `upcoming.ts`.
- `lib/operaciones/notifications.ts`: `enqueueNewRequestNotification` deja el aviso en la cola con `next_attempt_at` en ese momento y `payload.deferredTo` (y no lo envía ya). `sendOne`: al llegar su hora, si el encargo ya se empezó, terminó, canceló o pasó a otra persona, lo anota como omitido (`enviado` sin `sent_at`, `payload.skipped`), así no cuenta para recordatorios ni tiempos.
- `lib/operaciones/automations.ts`: ajuste `onlyToday` en «Aviso de encargo nuevo» («Encargos de otro día: avisar el día que toca», encendido por defecto; apagado = al momento, como antes).
- `lib/operaciones/upcoming.ts`: «Próximos envíos» muestra estos avisos como «encargo para ese día: se avisa a su hora de entrada» y usa las funciones compartidas.
- `lib/operaciones/process-map.ts`: paso «Aviso por Telegram» del Mapa Visual (descripción, cuándo y código).
- `tests/avisos-solo-hoy.test.ts` (nuevo, 9 pruebas): cálculo (hoy, sin fecha, vencido, urgente, otra zona, fin de semana, ausencia, silencio) y circuito con la cola real (Telegram interceptado): hoy y urgente salen al momento; otro día queda programado y sale a su hora con «Empezar ahora»; empezado o reasignado antes de su día no sale; con el ajuste apagado, al momento.
- `docs/ESTADO.md`: cabecera, §2/§3 (525 pruebas), §6, §7 (ajuste), §16 (quitada la mejora pendiente), §18, §19.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Programar y no omitir:** en vez de no avisar y confiar en los buenos días, el aviso queda en la cola para la mañana de ese día. Así no se pierde aunque la persona no tenga buenos días activos, conserva sus botones y los recordatorios de «sin empezar» cuentan desde ese día. Con la jornada real encendida, si la persona aún no ha empezado, el aviso espera como cualquier otro no urgente.
- **Urgentes al momento**, con la fecha visible (la plantilla ya la lleva en negrita).
- **Comprobación al enviar** en lugar de cancelar en cada sitio que cambia un encargo: un solo punto cubre empezar, terminar, reasignar o cancelar.
- **Modo pruebas al momento**, como la comida y el silencio, que tampoco se aplican, para poder probar el aviso.
- **Ajuste en el panel** (regla de paneles propios), encendido por defecto porque Enric aprobó el cambio.

## Qué verificar manualmente
- Automatizaciones → «Aviso de encargo nuevo»: aparece el interruptor «Encargos de otro día: avisar el día que toca», encendido.
- Crear un encargo para pasado mañana: no llega aviso; en Sistema/Automatizaciones → «Próximos envíos» (si cae en las próximas 24 h) aparece como programado. Ese día, a su hora de entrada, llega con «Empezar ahora».
- Un encargo para hoy o urgente sigue avisando al momento.
- Comprobado en local: 525 pruebas correctas (1 saltada, el examen real), `tsc` y Mapa Visual OK.

## Pendientes detectados
- Si la fecha de entrega se cambia en ClickUp después de crear el encargo, el encargo guardado no se actualiza (ya pasaba antes) y el aviso sale el día de la fecha original. Si se adelanta a hoy, la persona lo verá en los buenos días o en ClickUp, pero el aviso con botones llegará el día antiguo.
- «Próximos envíos» solo mira 24 horas: los avisos programados para más adelante no se ven hasta entonces.
