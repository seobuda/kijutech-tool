# SEO local sin Places y estado real de la auditoría
**Fecha:** 2026-11-24  
**Rama:** feature/hito1-seo-local-medicion  
**Commit:** 6bf2cd30

## Qué se construyó
Enric pidió avanzar mientras él hace sus pendientes. Esto es lo que se podía hacer sin su aprobación ni sus accesos.

- `lib/seo/local/rules.ts` (nuevo, puro): parte local sin Places.
  - `parseServices` saca los servicios del texto libre de la ficha.
  - `servicePage` mira si una página indexable trata un servicio: sus palabras, en singular o plural, deben estar en la URL, el título o el H1.
  - `auditLocal` compara el nombre, el teléfono y la dirección de la ficha con los de la web. Lo que confirma una persona manda sobre la ficha, y lo descartado no cuenta.
- `lib/seo/salud/kinds.ts`: 5 tipos nuevos en el grupo «Local» (`LOCAL_KINDS` y `SEO_KINDS`).
  - `seo.nap_name_mismatch`, `seo.nap_phone_mismatch`, `seo.nap_phone_missing`, `seo.nap_address_mismatch` y `seo.service_page_missing`.
- `lib/seo/expediente/collect.ts`: al final de cada recogida, la comprobación local con el último rastreo terminado.
  - Usa la fuente propia `seo.local:nap`.
  - Si cambia algo, encola rehacer el plan.
- `lib/seo/plan/rules.ts` y `plan.ts`: técnicas `nap_coherente` y `nueva_landing_servicio`.
  - En la segunda, las horas se cuentan por hallazgo: 4 h por servicio.
  - La propuesta lista los servicios.
  - El plan lee los hallazgos de las dos fuentes.
- `lib/seo/salud/view.ts`, `salud-panel.tsx` y `salud-actions.ts`:
  - Salud muestra y deja decidir también los hallazgos locales.
  - «aplicando la auditoría…» sigue el trabajo real de la cola en vez de 4 minutos fijos.
  - Si la auditoría falla, la pantalla lo dice.
- Mapa Visual: el paso «Local» pasa a construido y «Reseñas» queda en gris. La comprobación pasa.
- `tests/seo-hito1.test.ts`: 6 pruebas nuevas de la parte local. En total hay 613 pruebas, todas en verde.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **No se construye la medición de intervenciones (fase B/C).** El diseño la sitúa en el Hito 4 y exige unas 30 intervenciones medibles: construirla ahora sería hacerlo sin datos.
- **Core Web Vitals por CrUX/PageSpeed sin clave:** la cuota gratuita compartida está agotada (error 429). Hace falta una clave de API del proyecto de Google Cloud. Se pedirá junto con Places.
- **La comprobación local va con el expediente y no con la auditoría:** compara datos del expediente. Por eso tiene su propia fuente; si compartiera la de la auditoría, el rastreo la daría por resuelta.
- **Una dirección solo se marca distinta si el código postal o la población no coinciden.** Una dirección sin código postal no es una contradicción.

## Qué verificar manualmente
- En producción, tras la auditoría de CM Ibérica: Salud técnica → grupo «Local», y Plan de mejora → «Unificar nombre, dirección y teléfono».
- Completa «Qué vende u ofrece» en la ficha de CM Ibérica, separando los servicios por comas. Después pulsa Expediente → «Volver a recoger»: aparecerán los servicios sin página.

## Pendientes detectados
- La clave de API de Google Cloud con Places y CrUX (reseñas, ficha de Google y Core Web Vitals).
- La comparación de servicios es por palabras. Una página que diga «mantenimiento integral» no cuenta como «mantenimiento de oficinas». Si da falsos avisos, se puede descartar el hallazgo o ajustar el texto de la ficha.
