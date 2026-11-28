# SEO congelado antes de empezar Google Ads (punto de retorno)
**Fecha:** 2026-11-28  
**Rama:** docs/seo-punto-de-retorno  
**Commit:** 71220af8

## Qué se construyó
- `docs/SEO-PUNTO-DE-RETORNO.md` (nuevo): la puerta de entrada al volver al SEO. Incluye:
  - cómo retomarlo sin mezclarlo con Ads;
  - dónde vive (código, pantallas, tablas, trabajos, prompts y pruebas);
  - qué hace de principio a fin;
  - qué falta (piloto real primero, lo de Enric y las mejoras de Claude);
  - qué piezas del núcleo comparten SEO y Ads;
  - una tabla de cambios hechos fuera del SEO que le afecten.
- Etiqueta de git `seo-v1` sobre `ff712133`: la versión del SEO en producción el 28 nov. Sirve para ver qué ha cambiado con `git diff seo-v1`.
- `tests/arquitectura-guardrails.test.ts`: `ads` se registra como módulo y `ads_` como prefijo de tabla antes de que exista el módulo. Así SEO y Ads no pueden importarse entre sí (las pruebas fallarían y `deploy.sh` no desplegaría).
- `docs/ESTADO.md`: cabecera, §9 (puntero al punto de retorno) y cronología.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Un solo documento de entrada en vez de mover archivos:** los diseños del SEO se quedan donde están, para no romper los enlaces de `ESTADO.md` ni de los documentos de sesión. El punto de retorno los ordena y dice cuáles son históricos.
- **El candado va en las pruebas, no en una norma escrita:** registrar `ads` ya hace que un import de `lib/seo` a `lib/ads` (o al revés) rompa el despliegue.
- **Sin desplegar:** el cambio solo toca documentación y una prueba. Producción sigue en `ff712133`.

## Qué verificar manualmente
- Nada en la aplicación.
- Al volver al SEO: abrir `docs/SEO-PUNTO-DE-RETORNO.md` y ejecutar `git diff seo-v1 --stat`.

## Pendientes detectados
- Ninguno nuevo. Los del SEO están en `docs/SEO-PUNTO-DE-RETORNO.md` §4.

Mapa Visual: sin cambios (no hay procesos nuevos). Comprobación pasada.
