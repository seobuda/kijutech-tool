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

## Ampliación: compilar sin frenar la app (opción A, aprobada por Enric)
- `scripts/build-image.sh` (nuevo, ejecutable): durante `build` baja la prioridad de CPU (nice 15) y de disco de los hilos de dockerd/containerd, que son los que lanzan los pasos de la compilación. La app en marcha (bajo su containerd-shim) no cambia. Al terminar, aunque falle o se corte, devuelve la prioridad normal antes de `up -d`.
- `scripts/deploy.sh`: usa ese script, y la verificación muestra «prioridad de la app: 0» o avisa si no lo es.
- `docs/DESPLIEGUE.md`: paso 3 actualizado.
- **No verificado aún en el servidor:** se comprobará en el próximo despliegue con la línea de prioridad y viendo que la app responde mientras compila.

## Pendientes detectados
- Si la opción A no basta (la app sigue lenta al compilar): construir la imagen fuera del servidor (B) o 2 CPU (C).
