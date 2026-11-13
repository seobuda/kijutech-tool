# Despliegue de la ficha en el núcleo, arreglo del script de despliegue y propuesta en un solo mensaje
**Fecha:** 2026-11-14  
**Rama:** fix/deploy-borrados (fusionada) y fix/propuesta-un-mensaje  
**Commit:** b7d84051

## Qué se construyó
- `scripts/deploy.sh` (rama `fix/deploy-borrados`, ya en producción):
  - borra en el servidor los archivos de código que ya no están en `main`, solo en las carpetas `app`, `lib`, `components`, `tests`, `scripts` y `modules`, y enseña la lista;
  - si la compilación falla, se para sin migrar y dice dónde está el log;
  - avisa si las migraciones aplicadas no coinciden con las de `main`.
- `lib/core/capabilities.ts`: `ToolResult.card` (tarjeta de una propuesta con sus botones).
- `lib/operaciones/agent-capabilities.ts`: en una conversación por Telegram con el dueño, `proposeOrRun` devuelve la tarjeta en vez de encolar un aviso aparte.
- `lib/agentes/engine.ts`: recoge las tarjetas en `run.cards`.
- `lib/agentes/inbound.ts`: envía la respuesta y la propuesta en un mismo mensaje con los botones. Si son varias propuestas o el mensaje no cabe en el límite de Telegram, la respuesta va primero y cada propuesta en su propio mensaje.
- `tests/agentes.test.ts`: prueba de que llega un solo mensaje, con los botones y sin aviso aparte.
- `lib/agentes/process-map.ts` y `docs/ESTADO.md`: actualizados.

## Migraciones aplicadas
En producción se aplicó `0048_clientes_nucleo.sql`. El SQL completo está en `docs/sessions/2026-11-14-02-ficha-cliente-nucleo.md`. Copia previa: `backups/backup_pre_deploy_20261114_0009.sql.gz` (80 tablas); resultado: 49 migraciones. En este paso no hay migraciones nuevas.

## Decisiones técnicas tomadas en auto mode
- **Por qué falló el primer despliegue:** el script descomprimía el código encima del anterior y no borraba los archivos quitados de git. `lib/operaciones/client-memory-actions.ts` seguía en el servidor y rompió la compilación. Docker no sustituyó el contenedor, así que producción siguió con la versión anterior y coherente; la migración no llegó a aplicarse porque se ejecutó dentro del contenedor antiguo. El script no detectaba el fallo porque filtraba la salida con `grep`. Corregido con la lista de archivos de `main` y comprobando el código de salida de la compilación.
- **Por qué llegaban dos mensajes:** la tarjeta salía por la cola de avisos y la respuesta del agente por la conversación. Ahora, en Telegram con el dueño, la tarjeta va dentro de la respuesta, y al agente se le pide que no repita su contenido y diga en una o dos frases qué propone.
- **Qué se pierde:** la propuesta ya no pasa por la cola de avisos y sus reintentos en este caso concreto. Se mantiene registrada en el motor de acciones (pestaña Agente), y el envío directo tiene su propio respaldo en texto plano si Telegram rechaza el formato.

## Qué verificar manualmente
- Por Telegram, contarle un cliente nuevo: debe llegar UN mensaje con la frase del agente, la ficha propuesta y ✅ / ✖️.
- Al pulsar ✅ desaparecen los botones y llega la línea «✅ Ficha de … creada».

## Pendientes detectados
- Cuando Enric aprueba, el agente no se entera en la conversación: el onboarding encadenado lo resolverá.
- El script de despliegue tarda más de 2 minutos y Claude Code lo pasa a segundo plano. Funciona, pero conviene saberlo.
- Mapa: la comprobación pasa. Pruebas: 265 correctas; las 9 de `http` y `auditoria` fallan por diseño en el contenedor temporal.
