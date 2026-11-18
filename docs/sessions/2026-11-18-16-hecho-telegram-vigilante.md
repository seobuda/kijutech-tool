# «Hecho» en Telegram completa en el momento; scripts de cron ejecutables
**Fecha:** 2026-11-18  
**Rama:** fix/vigilante-permisos  
**Commit:** 26e59d8b

## Qué se construyó
**«Hecho» en Telegram** (aviso de Enric: Jesús pulsaba «Hecho» y en ClickUp la tarea no pasaba a «Listo»)
- **Causa:** el botón no completaba nada. Solo preguntaba «¿Quieres añadir un enlace o un comentario?», y `finishWork` no se ejecutaba hasta que la persona escribía algo o pulsaba «Sin comentario». Si no contestaba, la pregunta caducaba y ClickUp seguía en curso.
- `lib/operaciones/telegram-handler.ts`:
  - «Hecho» y «Hecho, ¿lo revisas?» llaman a `finishWork` en el momento.
  - Después preguntan si quiere añadir un comentario, que es opcional.
  - «Sin comentario» sobre una tarea ya completada solo cierra la pregunta.
  - Las preguntas pendientes de antes del cambio, con la tarea aún abierta, se siguen completando como antes.
- `lib/operaciones/workflow.ts`: nueva `addDoneNote`. El comentario posterior se suma a la nota de entrega, se registra y va como comentario a la tarea de ClickUp por la bandeja de salida.
- `lib/operaciones/process-map.ts`: paso «Hecho» actualizado.
- `tests/tiempos.test.ts`: «Hecho» deja el encargo completado sin pulsar «Sin comentario».

**Vigilante y scripts de cron**
- `scripts/*.sh` pasan a `100755` en git. Antes cada despliegue los dejaba sin permiso de ejecución en el servidor. Si el cron los llama directamente, fallan sin dejar rastro.
- `scripts/deploy.sh`: `chmod +x scripts/*.sh` tras descomprimir.
- `lib/operaciones/health.ts`: en producción (`BASE_URL` con https), si el vigilante nunca ha dejado constancia, aparece «Vigilante externo» en aviso. Antes no aparecía nada.
- `tests/salud.test.ts`: prueba nueva del aviso.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **El comentario de «Hecho» pasa a ser posterior:** así la tarea se cierra con un solo toque, que es lo que la persona espera al ver ✅. Si se escribe un comentario después, llega a ClickUp como comentario, no como parte del cambio de estado.
- Con revisión, el revisor recibe la entrega sin la nota. Si luego se escribe una, queda en la nota de entrega y en ClickUp.

## Qué verificar manualmente
- **Tras desplegar:** en una tarea de prueba («Pruebas Kiju»), pulsar «Empezar» y luego «Hecho». ClickUp debe pasar a «Listo» sin contestar nada. Después escribir un enlace y comprobar que aparece como comentario en la tarea.
- **Tareas de Jesús que se quedaron «en curso»:** cerrarlas en ClickUp a mano. La vigilancia de ClickUp las verá cerradas y cerrará su tiempo.
- **Vigilante:** falta la salida del comando SSH de diagnóstico para confirmar si el cron fallaba por permisos o porque falta `watchdog.env`. Tras desplegar, Salud debe enseñar «Vigilante externo» en verde o en aviso con el motivo.

Comprobaciones hechas:
- `pnpm test`: 385/385.
- `node scripts/check-architecture-map.js`: OK (mapa actualizado).

## Pendientes detectados
- Confirmar en el servidor si la copia diaria (`backup.sh`) también estaba fallando por permisos. Salud lo vigila con `backup_last_at`.
- Añadir «listo» y «lista» a los nombres de estado de cierre (`lib/operaciones/status-map.ts`), si en Ajustes resulta que alguna lista no los tiene bien asignados.
