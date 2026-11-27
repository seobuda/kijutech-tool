# Arreglo: excepción sin capturar «unexpected end of file» y volumen de búsquedas largas
**Fecha:** 2026-11-27  
**Rama:** fix/net-descompresion-demanda  
**Commit:** ver la fusión en main

## Qué se construyó
- **`lib/core/net.ts` (`publicFetch`):** no crea descompresor si la respuesta no tiene cuerpo (HEAD, 204, 304) y escucha los errores del descompresor y de la respuesta.
  - Antes, un Brotli o gzip vacío o truncado daba «unexpected end of file» sin que nadie lo capturase: 30 veces en producción (00:45, 04:14 y 05:55), con gravedad crítica.
  - Quien lee el cuerpo sigue recibiendo el error por su stream. El diagnóstico lo hizo el Técnico de mantenimiento y lo confirmó el revisor.
- **`lib/seo/demanda/demanda.ts`:**
  - no pide volumen de búsquedas de más de 10 palabras (DataForSEO da el error 40501 y la pasada fallaba entera);
  - si el proveedor falla, la pasada sigue sin volumen. El gasto y la base de datos quedan fuera del `try`.
- **`lib/seo/posiciones/posiciones.ts`:** lo mismo para las búsquedas seguidas. Las que no admite Google Ads quedan con volumen nulo (no 0) y fecha, para no reintentarlas cada vez.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
Se aplicó el arreglo propuesto por el Técnico de mantenimiento (registro de errores, id `a2c0fca9…`).

## Qué verificar manualmente
- **Para ti → Errores:** el crítico «unexpected end of file» no debería volver. Si no reaparece en 2 días, márcalo como resuelto, junto con sus dos gemelos de la misma traza.
- **Demanda de cm-iberica:** la próxima pasada ya no falla por búsquedas largas.

## Pendientes detectados
- **Falta una prueba con un servidor local** (HEAD con `content-encoding: br`): `publicFetch` bloquea las direcciones locales y haría falta una puerta de prueba.
- **Otros errores abiertos del registro, ajenos a esta noche** (lo decide Enric):
  - cuota y API de Business Profile;
  - listas de ClickUp ambiguas en `crear_encargo`;
  - acciones de servidor de una versión anterior.
