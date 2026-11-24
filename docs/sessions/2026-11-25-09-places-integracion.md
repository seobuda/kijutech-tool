# Integración Google Places (hueco para la clave)
**Fecha:** 2026-11-25  
**Rama:** feature/places-integracion  
**Commit:** 01e0ab27

## Qué se construyó
- **`lib/agentes/integrations.ts`**:
  - nuevo proveedor `places` («Google Places»), con un campo secreto «Clave de API», guardado cifrado en `agt_integrations` como los demás;
  - `testPlaces`: prueba la clave pidiendo solo el id de la ficha de ejemplo de la documentación de Google.
- **`lib/agentes/actions.ts`**: `saveIntegrationAction` prueba la clave de Places antes de guardarla y devuelve el motivo si Google la rechaza.
- **Pantalla Agentes → Integraciones**: la tarjeta aparece sola, porque la vista es genérica.
- **Mapa Visual**: `lib/agentes/process-map.ts`, descripción de Integraciones. La comprobación pasa.
- **`docs/ESTADO.md`**: integraciones.
- **Pruebas**: 645 pasan. `saveIntegrationAction` ya estaba cubierta en `tests/seguridad.test.ts`.

## Migraciones aplicadas
Ninguna. La columna `provider` de `agt_integrations` no tiene restricción de valores.

## Decisiones técnicas tomadas en auto mode
- **La clave se guarda en el panel, no en `.env`.** Se cifra como la de DataForSEO y Enric la puede pegar desde el móvil sin tocar el servidor.
- **Cómo se prueba la clave.** Se pide la ficha de ejemplo de Google con la máscara de campos `id`, que debería ser la consulta sin coste **[NV]**. Con una clave falsa, Google responde 400 «API key not valid», comprobado.

## Qué verificar manualmente
- Agentes → Integraciones → Google Places: pegar la clave y pulsar Guardar. Debe decir «Conectada: Google acepta la clave».
- Si sale un error 403, falta activar «Places API (New)» en ese proyecto o la clave no la permite.

## Pendientes detectados
- La descarga de reseñas de la competencia con esta clave, y las del cliente por Business Profile, todavía no están hechas.
