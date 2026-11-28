# Brief común de la investigación del módulo Google Ads (28 nov 2026)

Lee esto entero antes de empezar. Es el contexto que comparten todos los investigadores.

## Quién encarga y para qué

Kijutech es una agencia de marketing digital en España. Gestiona **más de 25 cuentas de Google Ads** de sectores distintos
(sobre todo negocios de servicios y locales que buscan **leads**: formularios, llamadas, WhatsApp; algún e-commerce). Este
servicio factura más de 5.000 €/mes. La agencia está construyendo su propia herramienta interna (Next.js + PostgreSQL) y va a
crear un **módulo Google Ads con un agente de IA** que vigile todas las cuentas como lo haría el mejor consultor PPC del mundo:
detectar, diagnosticar la causa, proponer (y en el futuro aplicar con aprobación) mejoras, y avisar.

El objetivo NO es copiar lo que hace hoy el equipo ni lo que hace una herramienta concreta. Es construir algo **superior a lo
que existe en el mercado**. Lo que hace hoy la agencia es un nivel básico y solo sirve de punto de partida:

- Una persona (Eury) revisa todas las cuentas lunes, miércoles y viernes: coste por lead, CPC de algunas palabras, términos
  de búsqueda nuevos que convierten más barato, pausar términos que llevan tiempo con conversiones caras.
- Dedica unos 3 días a revisiones más minuciosas, pero se le escapan cosas básicas en algunas cuentas.
- Aún no domina métricas avanzadas (cuota de impresiones, cuota perdida por presupuesto/ranking, subastas, parte superior).
- Empieza a mirar la landing y el nivel de calidad (sintonía palabra clave → anuncio → landing).
- Quieren alertas tipo «esta campaña lleva 2-3 días sin convertir» **con el porqué** (más competencia, cuota perdida, etc.).

## Lo que la herramienta ya tiene (para que pienses en cruces que nadie más puede hacer)

- Ficha completa de cada cliente (negocio, servicios, zona, público, propuesta de valor, contrato, competidores, contactos).
- Search Console, Analytics 4 y Google Business Profile por cliente, con histórico diario guardado.
- Módulo SEO: rastreador de la web, velocidad (PageSpeed/CrUX), registro de cambios en la web, vigilancia de páginas caídas,
  posiciones con DataForSEO, mapa de palabras con embeddings, competencia en la SERP.
- Conexión con GoHighLevel (CRM: leads del cliente) y Microsoft Clarity.
- Equipo y encargos (ClickUp), avisos por Telegram, agentes de IA (modelos Claude: Haiku, Sonnet, Opus, Fable).
- Aún NO hay conexión con la API de Google Ads (falta el token de desarrollador de la MCC).

## Reglas de la investigación

1. **Exhaustiva, no perezosa.** Busca mucho (decenas de búsquedas), lee las páginas de verdad (no te quedes en el titular),
   sigue los enlaces interesantes. Varios idiomas cuando tenga sentido (inglés, español, alemán, francés, portugués,
   neerlandés…). Si una fuente está tras un muro de pago, dilo y busca resúmenes, entrevistas, podcasts, charlas o reseñas.
2. **Concreto y accionable.** Lo que más valor tiene: reglas y umbrales concretos (p. ej. «X clics sin conversión con
   CPA objetivo Y»), fórmulas, qué datos se cruzan con cuáles, cómo se prioriza, qué pantallas y flujos tiene una herramienta,
   qué falla según los usuarios. Evita generalidades de blog («optimiza tus anuncios»).
3. **Cita las fuentes** con su URL al lado de cada afirmación importante. Marca lo **no verificado** como tal. Distingue
   hecho documentado / opinión de experto / anécdota de foro.
4. **Fecha.** Estamos a 28 nov 2026. Google Ads cambia mucho: señala si algo está obsoleto (posición media, audiencias
   similares, SKAGs, modificadores retirados, etc.) y busca lo más reciente (2025-2026: AI Max for Search, cambios en
   Performance Max, agentes de IA de Google, etc.).
5. **Piensa en el producto.** Al final de tu archivo añade una sección «Ideas para nuestro módulo» con lo que esta parte
   de la investigación sugiere construir, y otra «Lo que nadie hace bien» si encontraste huecos del mercado.
6. **Escribe en español.** Términos técnicos en inglés entre paréntesis cuando ayude.

## Entrega

- Escribe UN archivo Markdown en la ruta que te indiquen (`docs/ads/investigacion/bruto/NN-tema.md`). Puede ser largo
  (cuanto más contenido útil, mejor; 4.000-12.000 palabras es razonable). Ve guardando mientras avanzas para no perder trabajo.
- Estructura sugerida: resumen de 10-15 líneas arriba → cuerpo por apartados → ideas para nuestro módulo → lo que nadie hace
  bien → lo no verificado → lista de fuentes.
- **No toques ningún otro archivo del repositorio**, no ejecutes `git` (ni checkout, ni commit), no ejecutes `pnpm`/`npm`.
- Tu respuesta final: 5-10 líneas con lo más importante y la ruta del archivo.
