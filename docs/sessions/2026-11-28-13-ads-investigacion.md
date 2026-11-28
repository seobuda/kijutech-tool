# Google Ads: investigación en profundidad antes de planificar
**Fecha:** 2026-11-28  
**Rama:** feature/ads-investigacion  
**Commit:** b6ea5c8f

## Qué se construyó
Solo documentos (sin código, sin migraciones):
- `docs/ads/investigacion/BRIEF.md`: brief común para los investigadores (contexto de la agencia, reglas, formato).
- `docs/ads/investigacion/bruto/01..10` (+ `09b`): 11 informes en bruto (~90.000 palabras): referentes y libros; herramientas
  líderes (Optmyzr, Adalysis, Opteo, TrueClicks); resto del mercado y agentes de IA; API de Google Ads y novedades 2024-2026;
  auditoría y causa raíz; lead gen, medición, nivel de calidad y landing; comunidad y casos en varios idiomas; papers y
  técnicas avanzadas; estrategias por campaña (+ ampliación); segunda tanda de huecos con el navegador.
- `docs/ads/investigacion/HUECOS.md`: lo que quedó sin cubrir en la primera tanda y cómo se resolvió.
- `docs/ads/investigacion/revision/R1..R4`: revisiones de consultor de cuentas, consultor PPC de agencia, consultor de paid
  media y auditoría independiente con Opus 5.5 (esfuerzo alto).
- `docs/ads/investigacion/calc_v3.py`: cálculo exacto de la regla bayesiana de términos con miradas semanales (reproduce la
  auditoría y da las tablas del apartado 5.3).
- `docs/ads/INVESTIGACION-GOOGLE-ADS.md` **v3**: documento final (16 apartados, ~155 capacidades en 18 familias, motor de
  diagnóstico, estadística con pocos datos, IA sí/no, experiencia de uso, modelo de datos conceptual, restricciones de la API,
  mercado, innovaciones, riesgos y RGPD, decisiones en 5 paquetes, orden de construcción, registro de la revisión).
- `docs/ESTADO.md` (cabecera, §17 hoja de ruta, §18 cronología) y `docs/PENDIENTES-ENRIC.md` (ya no hay token de desarrollador).

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Modelos:** Enric dejó elegir. Investigación con Opus 5.5 donde hacía falta criterio (referentes, herramientas líderes, API,
  auditoría, lead gen, papers, segunda tanda) y Sonnet 5.5 para recopilar (mercado/IA, foros, estrategias). Síntesis, las tres
  revisiones expertas y las versiones 2 y 3 con Fable 5.2 (lo pidió Enric). Auditoría con Opus 5.5 en esfuerzo alto
  (protocolo de decisión del CLAUDE.md).
- **Ampliación de estrategias (09b):** el informe 09 se quedó corto (25 búsquedas, sin otros idiomas); no se pudo reanudar al
  investigador (el clasificador denegó el mensaje), así que se lanzó otro con Opus en un archivo aparte.
- **Cupo de búsquedas agotado:** el límite de 200 búsquedas web de la sesión se acabó a mitad de la primera tanda. La segunda
  tanda buscó en Google con el Chrome del usuario (pestaña propia, sin iniciar sesión ni formularios). Reddit está bloqueado
  por la extensión y G2 tiene comprobación anti-bots: no se intentó saltar.
- **Pronombres:** el documento final se refería a Eury con un pronombre masculino; se cambió por el nombre.

## Qué verificar manualmente
- Leer el **resumen para Enric** (apartado 0) y el **paquete A** (apartado 13.1) de `docs/ads/INVESTIGACION-GOOGLE-ADS.md`.
- Probar el acceso a la API (paquete A, decisión 1): crear el proyecto de Google Cloud, pedir el nivel, añadir la cuenta de
  servicio de solo lectura a la MCC y leer una cuenta. La documentación es de sep-oct 2026 y nadie lo ha probado.

## Pendientes detectados
- Paquetes de decisiones A-E (apartado 13.1); esta semana solo el A.
- Fuentes no leídas: hilos de Reddit (bloqueado), reseñas de G2; alemán/francés/portugués flojos.
- Ecommerce (Shopping, feeds) fuera del alcance investigado.
- Las cifras de tiempo, coste de construcción (36-46 jornadas) y coste de IA (10-20 $/mes) son estimaciones sin medir.
- Al construir: el historial de la web vive en SEO (congelado en `seo-v1`); publicarlo hacia el núcleo exige una rama aparte.
- Sin pruebas ni Mapa Visual en esta sesión porque no hay código; el módulo `ads` aún no tiene nodos propios en el mapa.
