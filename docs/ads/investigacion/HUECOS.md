# Huecos de la primera tanda de investigación (para la segunda tanda)

Motivo común: el cupo de búsquedas web de la sesión (200, compartido) se agotó a mitad de la tanda; Reddit, Search Engine
Land, G2 y Capterra devuelven 403 a la lectura automática (se pueden leer con el navegador Chrome del usuario).

## Por verificar en documentación oficial (crítico para el diseño)
- Developer token retirado el 9-10 sep 2026 → acceso por proyecto de Google Cloud (niveles Test/Explorer/Basic/Standard; ¿hace falta MCC?). Fuente: ppc.land (03); el 04 lo describe con páginas oficiales (Explorer 2.880 op/día, Basic 15.000, cuenta de servicio en la MCC): revisar sus marcas [NO VERIFICADO].
- Auction Insights: campos en v26 pero «not publicly available» (04) → alternativa: informe programado por correo + DataForSEO.
- Importación de conversiones offline y conversiones mejoradas para leads solo por Data Manager API desde el 15 jun 2026 (03, 06, 07, 09).
- GoHighLevel: ¿el disparador «Opportunity Stage Changed» puede enviar «lead cualificado»/«venta» a Google Ads? (06).
- Mínimo de conversiones de tCPA hoy; días de relleno tras una exclusión de datos (5 frente a 14) (08, 09).

## Verificado en la primera tanda
- Offline/conversiones mejoradas para leads: VERIFICADO (09b) → Data Manager API (no permite retirar conversiones; lote entero falla si un registro falla; su interfaz puede leer de PostgreSQL).
- Nuevo (visto en Google, 5 nov 2026, Search Engine Land): Google Ads puede atribuir conversiones offline a la cuenta equivocada → investigar.

## Navegador (prueba del 28 nov)
- Búsqueda de Google desde Chrome: FUNCIONA (sustituye al cupo agotado).
- Reddit: bloqueado por la extensión. G2: no devuelve texto (comprobación anti-bots; no se intenta saltar).

## Fuentes que no se pudieron leer
- Reddit r/PPC y r/googleads (hilos citados en 07) → leer con el navegador.
- Search Engine Land (403) → navegador.
- G2 / Capterra (reseñas de herramientas) → navegador.

## Temas sin cubrir o flojos
- 03: Adobe Advertising, feeds (DataFeedWatch, Channable), Hyros, Factors, LeadsRx, Adsgency, Bïrch, Adzooma/Acquisio, herramientas españolas.
- 05: árboles de diagnóstico de Brad Geddes, regresión a la media en PPC, rutinas de agencias (Brainlabs, KlientBoost, Seer), fuentes FR/PT/NL.
- 06: casos CXL y Conversion Rate Experts, estacionalidad española con datos, WhatsApp en Google Ads en España.
- 07: Portugal/Brasil, comunidad oficial en español, Forobeta, Telegram/YouTube en español, Bloofusion, PPC-Blog, OMR.
- 02: reseñas reales (G2, Capterra, TrustRadius, Reddit) de Optmyzr, Adalysis, Opteo y TrueClicks → navegador. Ver por dentro: TrueClicks es gratis hasta 50.000 $/mes (candidata para que Enric cree cuenta).
- 09: cubierto en parte por 09b (idiomas, políticas España, benchmarks europeos).
