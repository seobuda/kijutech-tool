# Para ti: confirmación al decidir y avisos de Telegram ya decididos
**Fecha:** 2026-11-23  
**Rama:** fix/para-ti-confirmacion-y-telegram  
**Commit:** f523448a

## Qué se construyó
Enric pidió arreglar los dos detalles menores de Para ti y **no desplegar todavía** (se desplegará con lo siguiente).

- `components/ui/flash.tsx` (nuevo): `FlashScope` y `useFlash`. Es un aviso de «hecho» que dura unos segundos abajo y sobrevive al refresco de la página. Fuera de un `FlashScope` no hace nada.
- `app/(dashboard)/dashboard/para-ti/page.tsx`: envuelve la página en `FlashScope`.
- `app/(dashboard)/dashboard/clientes/ui.tsx`: `useRun` también avisa con `useFlash` al acabar bien. Solo se ve en Para ti.
- `app/(dashboard)/dashboard/operaciones/bandeja/bandeja-list.tsx`: cada botón lleva su texto («Aceptado: …», «Devuelto a …», «Respuesta enviada a …», «Propuesta descartada»).
- `para-ti/decision-cards.tsx` y `agentes/equipo/equipo-view.tsx`: textos concretos (a quién se envió, qué se descartó).
- `lib/operaciones/notifications.ts`: `closeDecidedNotice(tenantId, dedupeKey, línea)`.
  - Si el aviso ya salió, edita el mensaje sin botones, con lo que se envió más la línea de qué se hizo.
  - Si aún no había salido, sale ya así.
  - Nunca lanza.
- Llamadas a `closeDecidedNotice` desde la web:
  - `lib/operaciones/email-agent-actions.ts`: correos aprobados, corregidos o descartados (`email_proposal:`).
  - `lib/operaciones/agent-capabilities-actions.ts`: propuestas de los agentes enviadas como aviso aparte (`at:prop:`).
  - `lib/operaciones/flow-actions.ts`: el aviso urgente de un bloqueo (`block:`) cuando se responde o se envía la propuesta desde la web.
- `tests/avisos-decididos.test.ts` (nuevo): aviso enviado (se edita sin botones), aviso pendiente (sale sin botones) y sin aviso (no hace nada).
- En total, 543 pruebas correctas (1 saltada, el examen real). El Mapa Visual pasa (no hacía falta cambiarlo).
- `docs/ESTADO.md`: cabecera, pruebas, §6.32 y §18.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **El aviso de «hecho» va por contexto** (`FlashScope`) y no es global: así no sale en pantallas que ya tienen su propio mensaje junto al botón.
- **Descartar la propuesta de un bloqueo no quita los botones** del aviso urgente, porque el bloqueo sigue esperando respuesta («Escribir otra» sigue valiendo).
- **La propuesta dentro de una conversación con el agente queda fuera:** su mensaje no se guarda en `ops_notifications`. Guardarlo sería un cambio de esquema (aprobación de Enric) y no compensa: ahí lo normal es decidir en Telegram.
- **Un aviso pendiente no se borra:** se cambia su texto y se le quitan los botones, porque borrar datos necesita aprobación y así queda constancia.

## Qué verificar manualmente
Tras el próximo despliegue:
- Decidir un correo o una propuesta de un agente en Para ti: abajo sale «Respuesta enviada a …» o similar.
- El mensaje de Telegram de esa propuesta queda sin botones y con «✅ Aprobada en la web» o «✖️ Descartada en la web».

## Pendientes detectados
- **Sin desplegar:** `main` va por delante de producción (`5b09c346`). Desplegar con lo siguiente.
- Las revisiones aceptadas o devueltas en la web no cambian el aviso de Telegram «¿lo revisas?» de quien lleva las operaciones. No se ha comprobado si ese aviso tiene botones que queden colgados.
