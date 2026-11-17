# Estrategia: medias del antes y el después por días de calendario (C4)
**Fecha:** 2026-11-17  
**Rama:** fix/estrategia-medias-calendario  
**Commit:** f119ae57

## Qué se construyó
- `lib/estrategia/rules.ts`: nueva función pura `beforeAfter` (y tipo `WindowSum`). Calcula el antes (28 días previos al cambio) y el después (desde el rastreo de Google, o desde el cambio) de una URL trabajada, con `days` = días de calendario hasta el último día sincronizado y `dataDays` = días con alguna fila de Search Console.
- `lib/estrategia/report.ts`: la vista del cliente (pestaña Estrategia → URLs trabajadas) usa `beforeAfter` en lugar de contar solo los días con datos.
- `lib/estrategia/strategist.ts`: el expediente que recibe el estratega dice «N días, M con impresiones» para que Opus sepa cuántos datos reales hay.
- `tests/estrategia.test.ts`: dos pruebas nuevas (división por días de calendario; 0 días sin sincronizar o antes de que lleguen datos; el antes solo cuenta hasta el último día sincronizado).
- `lib/estrategia/process-map.ts`, `docs/ESTADO.md`, `docs/REVISION-2026-11-17.md`: C4 marcado como resuelto y descrito.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **El día final de las ventanas es `lastSyncedOn`** (último día pedido a Search Console, hoy − 3), no hoy: así no se cuentan como cero días de los que Google aún no tiene datos.
- **Se añade `dataDays`** junto a `days`: la pantalla divide entre `days`, pero el estratega recibe ambos para no confundir «sin tráfico» con «sin datos».
- **`enoughData` no cambia** (después ≥ 28 días, antes ≥ 14, ≥ 100 impresiones): con días de calendario el antes queda en 28 en cuanto hay sincronización, y el umbral de impresiones sigue evitando conclusiones con datos escasos.

## Qué verificar manualmente
- En un cliente con URLs trabajadas y poco tráfico, pestaña Estrategia → URLs trabajadas: los clics/día del antes y el después deben ser iguales o más bajos que antes del arreglo (los días sin impresiones cuentan como cero).

Comprobaciones hechas:
- `pnpm test`: 374/374.
- `node scripts/check-architecture-map.js`: OK (Mapa Visual actualizado: descripción de URLs trabajadas).

## Pendientes detectados
- Los relacionados de Estrategia que siguen ⏳ en la revisión: **C6** (el informe del mes compara un mes incompleto con meses enteros), **C7** (propuestas insertadas sin transacción) y **C9** (una propiedad parada carga meses de datos en el panel).
