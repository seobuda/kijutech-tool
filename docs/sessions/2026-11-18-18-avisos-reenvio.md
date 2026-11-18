# Aviso duplicado en Telegram durante un despliegue
**Fecha:** 2026-11-18  
**Rama:** fix/aviso-reenvio  
**Commit:** 8ff49496

## Qué se construyó
**Síntoma:** Mayi (República Dominicana) recibió el mismo encargo dos veces, a las 12:27 y a las 12:29 de allí. El encargo se había creado desde el Bloc mientras se desplegaba.

**Causa, comprobada en producción:** era un solo aviso, `new_request`, con `attempts = 3`. Se creó a las 16:25 UTC y quedó enviado a las 16:29.
- Durante la reconstrucción de la imagen (unos 6 min) el servidor, que tiene una sola CPU, va muy lento.
- Telegram entregó el mensaje, pero la respuesta no llegó antes de 20 s y se dio por fallido («tiempo de espera agotado»).
- El reintento se lo volvió a enviar.

**Cambios:**
- `lib/operaciones/notifications.ts`:
  - Si un aviso se reintenta después de un «tiempo de espera agotado», sale con «🔁 Por si no te llegó el anterior:» delante.
  - Telegram tiene ahora 45 s para responder (antes 20). La reserva de la fila es de 300 s, así que sobra margen.
- `lib/operaciones/process-map.ts`: el paso «Cola de avisos y reintentos» lo explica.
- `tests/tiempos.test.ts`: prueba del reenvío con el aviso delante.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Se reenvía igual, diciendo que es un reenvío:** Telegram no permite comprobar si un mensaje llegó, y dejar de reintentar podría perder un aviso urgente. Un duplicado explicado es el mal menor.
- **Solo tras «tiempo de espera agotado»:** con otros errores (Telegram rechaza el mensaje, chat no vinculado…) el mensaje no llegó, así que no se añade nada.

## Qué verificar manualmente
- Nada inmediato. En el próximo despliegue, si alguien recibe un aviso repetido, el segundo debe empezar por «🔁 Por si no te llegó el anterior».

Comprobaciones hechas:
- `pnpm test`: 386/386.
- `node scripts/check-architecture-map.js`: OK (mapa actualizado).

## Pendientes detectados
- **Que el despliegue no ralentice la app:**
  - Opción A: construir la imagen con menos prioridad. Hay que verificar en el servidor que afecta a la construcción y no a la app.
  - Opción B: construir la imagen fuera del servidor (en GitHub Actions o en el PC) y subirla ya hecha. Es más trabajo.
  - Opción C: subir el servidor a 2 CPU. Cuesta unos 12 $/mes más.
  - Sin decidir.
