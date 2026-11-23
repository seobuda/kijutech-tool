# Cambios de ClickUp al encargo y librería postgres 3.4.9
**Fecha:** 2026-11-23  
**Rama:** fix/clickup-cambios (sobre chore/postgres-3.4.9)  
**Commit:** 1fcb86c5

## Qué se construyó
Enric pidió el 23 nov que cualquier cambio hecho en ClickUp se refleje en la herramienta («si cambias la fecha, responsable, editar el contenido…») y aprobó actualizar la librería `postgres`.

- `package.json` / `pnpm-lock.yaml`: `postgres` 3.4.5 → 3.4.9 (commit e05e2c5e en `chore/postgres-3.4.9`). La 3.4.5 calculaba una espera negativa en `reconnect()` y Node avisaba «TimeoutNegativeWarning» (inofensivo; ensuciaba el registro de errores). Instalado en un contenedor temporal, nunca en Windows.
- `lib/operaciones/watch.ts`: `syncExisting` ahora llama a `syncFields` (fecha, prioridad, título, descripción, lista y cliente → encargo, con evento `clickup_updated`) y a `syncAssignees` (personas añadidas o quitadas, no solo la reasignación completa). Exporta `cleanTaskDescription`.
- `lib/operaciones/notifications.ts`: `newRequestText` (texto del aviso, compartido) y `syncNewRequestNotices`, que pone al día los avisos de un encargo. Los programados rehacen el texto y el día; si ahora es para hoy o urgente, salen ya. Los enviados se reescriben en Telegram sin sonar, conservando la cabecera de modo pruebas. El aviso guarda su etiqueta (`payload.label`) para poder rehacerlo.
- `lib/operaciones/clickup.ts`: la consulta de la vigilancia pide también `markdown_description` (misma petición) y `WatchTask` trae `markdown`.
- `lib/operaciones/events.ts`: tipo de evento `clickup_updated`.
- `lib/operaciones/automations.ts`: texto de «Vigilancia de ClickUp» en el panel.
- `lib/operaciones/process-map.ts`: paso nuevo «Datos cambiados en ClickUp → encargo» y paso «Responsables cambiados» (antes «Reasignación») actualizado. `node scripts/check-architecture-map.js` pasa.
- `tests/clickup-cambios.test.ts` (nuevo, 9 pruebas, con `runWatch` real y ClickUp y Telegram simulados):
  - sin falsos cambios cuando ClickUp devuelve lo mismo con otro formato y la marca;
  - fecha movida: el aviso programado cambia de día, y si pasa a hoy sale ya;
  - pasada a urgente: sale ya;
  - título, descripción y cliente: se copian y el aviso enviado se reescribe;
  - lista sin campo Cliente: se respeta el cliente;
  - alguien añadido o quitado;
  - quitada quien lo hacía;
  - pasada a alguien sin Telegram;
  - el aviso programado de quien ya no lo lleva no sale.
- `docs/ESTADO.md`: cabecera, §2/§3 (534 pruebas), §6.6, §16 y §18.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Sin webhooks de ClickUp:** se amplía la vigilancia que ya existe (una consulta agrupada cada ~150 s). Sale gratis, porque es la misma petición. Un webhook daría tiempo real, pero necesita registrar el webhook, verificar la firma y tener una ruta pública. Queda como mejora si los 2,5 min se quedan cortos.
- **Descripción comparada solo por letras y números:** ClickUp devuelve el Markdown con otro formato (viñetas, saltos, escapes). Se quitan antes la transcripción del audio y la marca `[kiju:]` que añade la herramienta. Así no aparecen cambios falsos, y no hizo falta guardar otra columna (sin migración).
- **Cliente solo si la lista tiene el campo «Cliente»:** si no lo tiene, el cliente elegido en la herramienta no está en ClickUp y borrarlo sería un error.
- **«Añadido» se mide contra la lectura anterior de la tarea:** así no se avisa a quien ya estaba en la tarea pero no era candidato (p. ej. el creador que no se avisa a sí mismo).
- **Añadido con la tarea ya empezada:** solo se anota (colabora); no se le manda el aviso con botones porque ya la lleva otra persona.
- **Pasada a alguien sin Telegram:** figura como responsable sin aviso (antes no cambiaba nada y el encargo seguía a nombre del anterior).
- **Cambio de fecha en un aviso ya enviado:** se reescribe el mensaje sin sonar. Un aviso nuevo («te han cambiado la fecha») necesitaría un tipo nuevo en `ops_notifications` (migración): queda como propuesta.
- **Estados intermedios y reapertura fuera:** mapear «en curso / en revisión» de ClickUp hacia la herramienta puede crear un bucle con la bandeja de salida, que hace el camino contrario. Merece su propio diseño.
- **Las dos cosas en un solo despliegue:** la librería y la vigilancia, para no reiniciar dos veces. `rollback.sh` deshace ambas.

## Qué verificar manualmente
- En ClickUp, cambiar la fecha de una tarea que sea un encargo (en «Pruebas Kiju»). En ~3 min, Encargos debe mostrar la fecha nueva. Si su aviso estaba programado, «Próximos envíos» debe mostrar el día nuevo; si ya se había enviado, el mensaje de Telegram debe mostrar la fecha nueva.
- Cambiar el título o la descripción: el encargo y el mensaje de Telegram se actualizan.
- Añadir a una segunda persona con Telegram a una tarea sin empezar: le llega el aviso «añadido en ClickUp».
- En el registro de errores ya no debe aparecer «TimeoutNegativeWarning».
- Comprobado en local: 534 pruebas correctas (1 saltada, el examen real), `tsc` y Mapa Visual OK.

## Pendientes detectados
- La reapertura de una tarea cerrada en ClickUp no reabre el encargo.
- Los estados intermedios de ClickUp no se reflejan (solo el cierre).
- No hay aviso que suene cuando cambian la fecha de un encargo ya avisado (necesita migración por el tipo de aviso).
- «Próximos envíos» solo mira 24 horas.
