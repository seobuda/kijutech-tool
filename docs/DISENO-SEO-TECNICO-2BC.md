# Diseño · SEO parte 6: técnico 2b + 2c

**Fecha:** 2026-11-27 · **Rama:** `feature/seo-tecnico-2b` · **Lista:** parte 6 de `docs/LISTA-CERRADA-SEO.md`.

## Objetivo
- **2b. Reglas que faltan** para cerrar el técnico al nivel de Screaming Frog o SEOnaut en webs WordPress de pyme:
  - etiquetas duplicadas;
  - soft 404;
  - staging;
  - nofollow interno;
  - sitemap frente a canonical;
  - datos incoherentes entre páginas;
  - rastreadores de IA;
  - tecnología (CMS y plugins);
  - web hackeada.
- **2c.** Dos piezas:
  - **registro de cambios** de la web, con su tabla y su protocolo. Es la base de «¿funcionó?» (fecha real de cada intervención) y del asistente de migraciones;
  - **vigilancia de las páginas de dinero** cada pocas horas.

## Lo que ya existe (no se rehace)
- Títulos y descripciones duplicados: `seo.title_duplicate` y `seo.meta_description_duplicate`.
- Rastreadores de IA bloqueados: `seo.ai_crawlers_blocked`.
- Noindex en el sitemap: `seo.noindex_in_sitemap`.
- Canonical roto o hacia otra URL: `seo.canonical_broken` y `seo.canonical_other`.
- Regresiones entre rastreos: `seo.page_regressed` (antes 200 e indexable; ahora error o noindex).

**Datos disponibles sin volver a descargar** (`crawl_pages`): estado, redirección, título, descripción, H1, encabezados, canonical, robots, X-Robots, lang, hreflang, palabras, `contentHash`, `simhash`, si está en el sitemap, JSON-LD (≤ 200 KB), tipos de schema y `facts` (`ext`: enlaces a otras webs, como mucho 100; `res`: CSS y JS, como mucho 40). `crawl_links` guarda los enlaces internos con su `nofollow`. GSC: `gsc_queries` (con `first_seen`) y `gsc_daily`.

## 2b · Reglas nuevas

Todas son puras sobre el rastreo, salvo la sonda de soft 404 y las búsquedas de GSC.

1. **Soft 404 de la web** (`seo.soft_404_site`, importante): en la auditoría se pide una URL que seguro no existe (`/kijutech-404-<aleatorio>`, con `fetchPublic`, una sola petición). Si responde 200, Google indexa páginas vacías y las URLs viejas no caducan.
2. **Soft 404 por página** (`seo.soft_404`, aviso): página con 200 cuyo título o H1 dice «no encontrada», «404», «not found», «no existe» o «no s'ha trobat». Se agrupa en un hallazgo por rastreo, con hasta 20 URLs.
3. **Restos de staging** (`seo.staging_links`, importante): enlaces, CSS/JS o canonical que apuntan a:
   - `localhost`, `127.0.0.1` o `*.local`;
   - subdominios `staging.`, `dev.`, `test.`, `pre.` o `demo.` del propio dominio;
   - hostings de staging conocidos: `*.wpengine.com`, `*.kinsta.cloud`, `*.wpcomstaging.com`, `*.cloudwaysapps.com`, `*.flywheelstaging.com`, `*.pantheonsite.io` y `*.instawp.xyz`.

   Un hallazgo con las URLs de destino y las páginas que los tienen.
4. **Nofollow interno** (`seo.internal_nofollow`, aviso): enlaces internos con `nofollow` hacia páginas indexables. No cuentan los que van a `/wp-admin`, `/wp-login`, carrito, cuenta o checkout. Un hallazgo por rastreo, con las 10 páginas destino que más reciben.
5. **Sitemap frente a canonical** (`seo.sitemap_not_canonical`, aviso): URLs del sitemap cuyo canonical apunta a otra URL, o que redirigen o dan 4xx o 5xx. Un hallazgo con hasta 30 URLs.
6. **Datos incoherentes entre páginas** (`seo.schema_inconsistent`, aviso): el JSON-LD `LocalBusiness`/`Organization` (o sus subtipos) declara teléfonos, nombres o direcciones distintos en distintas páginas (normalizados con `normPhone`/`normText`). La incoherencia con la ficha de Google ya la cubre `seo.nap_*`.
7. **Tecnología** (sin hallazgo; se ve en Salud): a partir de los CSS/JS (`facts.res`):
   - WordPress (`/wp-content/`, `/wp-includes/`), su tema y sus plugins (`/wp-content/plugins/<slug>/`);
   - Shopify, Wix, Squarespace, Webflow, Joomla y PrestaShop.

   Hallazgo **`seo.seo_plugins_conflict`** (aviso): dos o más plugins de SEO activos (Yoast `wordpress-seo`, Rank Math `seo-by-rank-math`, AIOSEO `all-in-one-seo-pack`, SEOPress `wp-seopress`, The SEO Framework `autodescription`). Generan metas y schema duplicados.
   - **Limitación:** solo se ven los plugins que cargan CSS o JS en el front.
8. **Web hackeada**:
   - **(a) Búsquedas basura en GSC** (`seo.hacked_queries`, crítico; en los detectores semanales, fuente propia `seo.vigilancia:hackeo`). Cuenta las búsquedas con `first_seen` en los últimos 60 días e impresiones que:
     - llevan escritura japonesa, china, cirílica o tailandesa, si la web no está en esos idiomas;
     - o llevan términos de farmacia o falsificaciones (`viagra|cialis|levitra|kamagra|tadalafil|sildenafil|replica|réplica|louis vuitton|rolex replica|casino online|slot gacor|porn|xxx|escort`).

     Salta con 3 o más búsquedas, o con 50 impresiones o más.
   - **(b) Páginas basura en el rastreo** (`seo.hacked_pages`, crítico; en la auditoría): páginas del sitio o del sitemap con los mismos patrones en la URL o el título, o con escritura ajena al idioma de la web. Hacen falta 2 o más páginas.

Técnicas: `soft_404` → nueva `corregir_soft_404`; staging → nueva `quitar_staging`; nofollow → nueva `quitar_nofollow_interno`; sitemap → existente `sitemap_limpio` (o nueva si no existe); `schema_inconsistent` → existente de schema; plugins → nueva `un_plugin_seo`; hackeo → nueva `limpiar_hackeo` (crítico: siempre arriba en el plan).

## 2c · Registro de cambios y páginas de dinero

### Registro de cambios (`seo_change_log`, tabla nueva, aditiva)
- **Una fila por cambio detectado:**
  - `tenant_id`, `project_id`, `url`, `url_hash`, `field`, `before` y `after` (texto, 500 caracteres como mucho), `source` y `detected_at`;
  - `field`: `title`, `meta_description`, `h1`, `canonical`, `indexable`, `status`, `content`, `schema`, `url_new`, `url_gone`, `tech` (CMS, tema o plugin que aparece o desaparece);
  - `source`: `rastreo` o `dinero`.
- **De dónde salen:**
  - **Rastreo:** al terminar cada auditoría, se compara con el rastreo anterior completo (`previousCrawlPages`, ampliado con título, H1, `simhash`, palabras y descripción).
  - `content` se apunta solo si cambia el `simhash` en 10 bits o más, o las palabras en un 30 % o más. Es ruido acotado, no cada coma.
  - `url_new` y `url_gone` solo si **ninguno** de los dos rastreos quedó truncado. Si no, se omiten, porque son falsos.
  - Como mucho 500 filas por rastreo, con prioridad a las páginas con clics.
- **No es un hallazgo:** un cambio es información con fecha, no un problema. Los problemas siguen siendo los hallazgos de siempre. Se ve en Salud → «Cambios en la web» (últimos 90 días, filtrable por página).
- **Retención:** 18 meses, para comparar con el año anterior. La purga va en el mantenimiento diario existente.
- **Uso futuro** (partes 8 y migraciones):
  - la fecha real de una intervención es el primer cambio en sus URLs después de crear el encargo;
  - el asistente de migraciones usa `url_gone`.

### Páginas de dinero (`seo_money_pages`, tabla nueva, aditiva)
- **Cuáles:** la portada y las 5 páginas con más clics de GSC (28 días), recalculadas cada semana. Una persona puede fijar o quitar páginas: columna `pinned`, como mucho 10 por proyecto.
- **Qué se guarda por página:** la última foto estructurada: estado, título, H1, canonical, indexable (meta robots y X-Robots), `simhash`, palabras y comprobada a las.
- **Proceso `seo.dinero`:**
  - cada 6 horas por defecto, editable a 3, 6, 12 o 24;
  - `fetchPublic` + `extractPage` del núcleo, una página detrás de otra, con 15 s de tiempo límite;
  - es gratis, porque es su propia web.
- **Cada cambio va al registro de cambios** (`source='dinero'`).
- **Hallazgo `seo.money_page_changed`** (fuente propia `seo.vigilancia:dinero`) solo para lo grave, y confirmado en dos pasadas seguidas para no avisar de un fallo momentáneo:
  - pasa a noindex (crítico);
  - deja de dar 200 (crítico);
  - el canonical pasa a otra URL (importante);
  - el título o el H1 se vacían (importante);
  - el contenido cae más del 50 % en palabras (importante).
  - Se resuelve cuando vuelve a estar bien. Si el cambio lo hicimos nosotros, la persona lo marca «Dejar así».
- **No duplica la vigilancia horaria** (`seo.vigilancia`), que solo mira la portada (caída, noindex, robots, SSL): la portada en dinero solo apunta cambios en el registro y no crea el hallazgo de noindex ni de estado, que ya cubre la vigilancia.

## Puntos de vista
1. **SEO técnico (auditor de agencia):**
   - soft 404, staging y nofollow interno son los fallos típicos de un WordPress de pyme hecho por terceros;
   - el hackeo japonés y el de farmacia siguen siendo frecuentes y Search Console tarda en avisar;
   - el registro de cambios es lo que separa «creemos que funcionó» de «medimos».
2. **Arquitecto (datos y costes):**
   - todo sale del rastreo ya guardado, salvo una petición de sonda y 6 páginas cada 6 horas por proyecto;
   - con 30 proyectos son 720 peticiones al día a webs de clientes, sin coste;
   - dos tablas pequeñas, con índice por proyecto y fecha y retención.
3. **Producto (quien usa Salud):**
   - los avisos deben ser pocos y claros (un hallazgo por regla y rastreo, con la lista dentro);
   - el registro de cambios es una línea de tiempo, no más avisos;
   - la tecnología detectada ayuda a quien recibe el encargo.

## Alternativas
| | Qué | Coste | Riesgo | Se pierde |
|---|---|---|---|---|
| **A. Reglas sobre el rastreo y dos tablas propias (elegida)** | Lo descrito | 0 $ en datos; 2 tablas | Detección de plugins incompleta | — |
| B. Guardar el HTML de cada página en cada rastreo y comparar | Diferencias completas | Almacenamiento: unos 50-100 KB × 500 páginas × 3 rastreos por proyecto | Tamaño de la base de datos | Simplicidad |
| C. Herramienta externa (ContentKing/Conductor, Little Warden) | Vigilancia en tiempo real | 50-200 $/mes por cuenta (precio no verificado) | Contratar es línea roja; los datos quedan fuera | Integración con el plan |
| D. No hacer el registro (solo hallazgos) | Nada nuevo | 0 | La parte 8 no tendría fecha real | Medir el efecto |

## Decisión (hipótesis)
**A**: 2b va en una tanda sin migración y se despliega primero; 2c va en una segunda tanda con la migración 0072 (`seo_change_log` y `seo_money_pages`).

**Pregunta 1. ¿Cumple el objetivo final** (que Operaciones sustituya a un humano, con supervisión)? Sí. El sistema detecta y data los cambios solo, y la persona decide sobre los hallazgos.

**Pregunta 2. ¿Qué coste o riesgo oculto tiene a semanas vista?**
- Ruido del registro (cambios cosméticos): se mitiga con los umbrales de contenido y el tope de 500 filas.
- Webs que bloquean peticiones cada 6 h: el fallo momentáneo no avisa (hacen falta dos pasadas) y 6 peticiones son poca carga.
- La sonda 404 puede activar un WAF: es una sola petición al mes.

**Pregunta 3. ¿Hay algo que ya tengamos y no usemos?** Sí, y se reutiliza:
- `previousCrawlPages` y `pageRegressions` (sirven de base para el diff);
- `extractPage` y `fetchPublic` del núcleo;
- `normPhone`/`normText`;
- los detectores semanales;
- `gsc_queries.first_seen`.

## Auditoría independiente
Hecha por un subagente Opus 5.5 con esfuerzo alto. **Veredicto: vale con cambios.**

**Graves:**
1. **`gsc_queries.first_seen` no indica que una búsqueda sea nueva.** Es el primer día que se sincronizó: al conectar GSC, todas las búsquedas cuentan como «nuevas». Hay que calcularlo desde `gsc_daily`: impresiones en los últimos 28 días y ninguna entre los días 29 y 120, y solo cuando el histórico ya está descargado.
2. **El hackeo daría críticos falsos:**
   - términos legítimos: «XXX edició», Ford Escort, pornografía, farmacias, réplica;
   - búsquedas en ruso o chino en webs de costa.

   Hace falta poner límites de palabra y quitar los términos ambiguos. Solo debe ser crítico si la URL no está en el rastreo ni en el sitemap o tiene una ruta basura; si no, aviso. Falta además usar `gsc_pages` (páginas basura ya indexadas). Hay que anotar el cloaking: el rastreo normalmente no lo ve.
3. **Los plugins SEO casi nunca cargan CSS o JS en la web pública**, y `facts.res` tiene un tope de 40 y la caché los junta. Hay que guardar en `extractPage` (núcleo, aditivo en `facts`) el `meta generator` y las firmas de comentarios y clases (Yoast, Rank Math, AIOSEO).
4. **`seo_money_pages` con solo «la última foto» no sirve.** Hace falta una referencia aceptada (`baseline`), un estado pendiente y la confirmación a los 30 min, no 6 h después.

**Importantes:**
- `sitemap_not_canonical` repite `seo.non200_in_sitemap` y `seo.canonical_other`.
- `money_page_changed` se solapa con `seo.page_regressed`.
- Un fallo de red en la sonda o en dinero resolvería hallazgos sin motivo; además, `fetchPublic` lanza la excepción y tumbaría la auditoría.
- La sonda tiene que:
  - detectar la redirección a la portada;
  - dar «no concluyente» con 401/403/429/503;
  - usar una ruta neutra (sin «kijutech») y dos rutas.
- El diff entre rastreos:
  - `previousCrawlPages` filtra por `rootUrl`, así que no sirve en una migración;
  - las URLs con parámetros dan altas y bajas falsas;
  - necesita idempotencia (clave única);
  - necesita la guarda de bloqueos.
- **Fecha real:** el rastreo se hace cada 30 días, así que hay que guardar el inicio de la ventana y vigilar unos días las URLs de cada encargo.
- **Ruido:**
  - del schema, comparar los campos clave, no el JSON-LD entero;
  - un cambio de plantilla en toda la web debe ser una sola fila.
- **Dinero:** leer hasta 2 MB, no 400 KB.

**Menores:**
- **Soft 404 por página:** solo frases completas y con poco texto.
- **Nofollow interno:** excluir aviso legal, privacidad y cookies (también en catalán), y carrito o cuenta.
- **Staging:**
  - faltan las subcarpetas del plugin WP Staging;
  - faltan `staging\d+.` y los dominios temporales;
  - mirar también el JSON-LD y el hreflang;
  - las imágenes no se guardan (limitación).
- **`schema_inconsistent`:** compararlo solo por teléfono y no aplicarlo con varias sedes.
- **Nombres de técnicas:** las que existen son `sitemap_corregido`, `schema_negocio` y `nap_coherente`.
- **Tecnología:** no necesita tabla.

**Decisión final, rehecha:**

**Tanda 6a (2b, sin migración):**
- **Núcleo** (aditivo y genérico, anotado según el protocolo): `extractPage` guarda en `facts` el `gen` (meta generator) y las `sig` (firmas de plugins de SEO en comentarios y clases).
- **Soft 404 de la web:**
  - dos sondas neutras (`/<aleatorio>-x` y `/<aleatorio>/<aleatorio>/`) dentro de un try/catch;
  - 200, o redirección a la portada, es soft 404;
  - 401, 403, 429, 5xx o un error de red dan «no concluyente» y se vuelve a emitir lo que estaba abierto.
- **Soft 404 por página:** frases completas («página no encontrada», «pàgina no trobada», «page not found», «error 404», «la página que buscas no existe»…) en el título o el H1, y menos de 300 palabras.
- **Staging:** la lista ampliada, las subcarpetas `/staging/` y `/wp-staging/` del propio dominio, el canonical, el hreflang y los `url`, `logo` y `@id` del JSON-LD. Las imágenes quedan fuera y se dice.
- **Nofollow interno:** con exclusiones (legal, privacidad, cookies, carrito, cuenta y checkout, en es, ca y en).
- **Sin `sitemap_not_canonical`:** `canonical_other` pasa a importante si la URL está en el sitemap.
- **`schema_inconsistent`:** solo por teléfono, y no se aplica si el cliente tiene más de un local.
- **Tecnología:** se calcula del último rastreo (generator, firmas, CSS y JS) y se ve en Salud. `seo.seo_plugins_conflict` sale de las firmas.
- **Hackeo:**
  - **(a)** búsquedas nuevas desde `gsc_daily` (28 días con impresiones y ninguna en los días 29 a 120), solo con el histórico completo, y una lista de patrones estrecha con límites de palabra:
    - fármacos de marca;
    - «replica» de relojes y bolsos;
    - «slot gacor» y «casino online»;
    - escritura japonesa o china, solo si ninguna página de la web está en ese idioma.

    Hacen falta 3 búsquedas o 50 impresiones. Es crítico si sus URLs (`gsc_daily.page_id`) no están en el rastreo ni en el sitemap o tienen una ruta basura; si no, aviso.
  - **(b)** URLs basura en `gsc_pages` y en el rastreo.
  - Las dos van en los detectores semanales, con fuente propia `seo.vigilancia:hackeo`.

**Tanda 6b (2c, migración 0072):**
- **`seo_change_log`:**
  - con `run_id`, `prev_observed_at` y clave única `(project_id, run_id, url_hash, field)`;
  - índices por proyecto y fecha, y por proyecto, URL y fecha.
- **Diff entre rastreos:**
  - el rastreo anterior se busca por proyecto (no por `rootUrl`) y se compara por ruta si cambió el dominio;
  - `url_new` y `url_gone` solo para URLs sin parámetros, sin truncar y con la guarda de bloqueos;
  - del schema solo se comparan los tipos y los campos clave;
  - un cambio de plantilla en toda la web se guarda como una sola fila `url='*'`;
  - el contenido cuenta con 150 palabras o más y los dos umbrales a la vez.
- **`seo_money_pages`:**
  - columnas `reason` (`home`, `top`, `pinned`, `encargo`) y `expires_at`;
  - `baseline` (la referencia buena o aceptada), `last`, `pending_kind`, `pending_since` y `fail_streak`;
  - confirmación a los 30 min;
  - lectura hasta 2 MB;
  - no avisa de lo que ya cubre `page_regressed`, ni del noindex o el estado de la portada (lo cubre la vigilancia).
- Se rehará esta parte del diseño antes de construirla, con lo aprendido en la 6a.

## Tanda 6b, diseño concreto (27 nov, tras desplegar la 6a)

### Tablas (migración 0072, aditiva)

**`seo_change_log`:**
- Columnas:
  - `id bigserial`;
  - `tenant_id` y `project_id` (FK, en cascada);
  - `url text` y `url_hash varchar(40)`;
  - `field varchar(30)`;
  - `before` y `after` (`text`, como mucho 500 caracteres);
  - `extra jsonb` (p. ej. `{pages: 37}` en un cambio de plantilla);
  - `source varchar(10)` (`rastreo` o `dinero`);
  - `batch varchar(64)` (el `run_id` del rastreo o `dinero:<fecha y hora>`);
  - `prev_observed_at timestamp` (inicio de la ventana en que pasó el cambio);
  - `detected_at timestamp`.
- Clave única `(project_id, batch, url_hash, field)`: un reintento no duplica.
- Índices `(project_id, detected_at desc)` y `(project_id, url_hash, detected_at)`.
- Sin FK al rastreo, porque los rastreos se purgan (se guardan 3).

**`seo_money_pages`:**
- Columnas:
  - `id`, `tenant_id`, `project_id`, `url` y `url_hash`;
  - `reason varchar(10)` (`home`, `top`, `pinned` o `encargo`) y `expires_at`;
  - `active boolean`;
  - `baseline jsonb` (la última foto sana o aceptada) y `last jsonb`;
  - `last_checked_at`;
  - `pending_kind varchar(40)` y `pending_since`;
  - `fail_streak int`;
  - `created_at` y `updated_at`.
- Clave única `(project_id, url_hash)`.
- Foto: `{status, title, h1, canonical, indexable, words, simhash}`.

### Registro desde el rastreo (al terminar cada auditoría)
- **Rastreo anterior:** el último rastreo `hecho` del proyecto que no sea este, sin filtrar por `rootUrl`. Si cambia el host, se empareja por ruta.
- **Campos comparados:**
  - `title`, `meta_description`, `h1` (el primero), `canonical` (como ruta si es interno), `indexable` y `status`;
  - `content`: con 150 palabras o más en alguna de las dos versiones, simhash a 10 bits o más **y** las palabras cambian un 30 % o más;
  - `schema`: los tipos y el nombre, teléfono y dirección del negocio, normalizados.
- **`url_new` / `url_gone`:**
  - solo URLs sin parámetros, con los dos rastreos sin truncar y menos del 20 % de bloqueos (la misma guarda que `pageRegressions`);
  - `gone` solo de URLs que antes eran indexables. Se apunta «ya no aparece en el rastreo», no «ya no existe».
- **Plantilla:** si un mismo campo cambia en 20 páginas o más y en el 50 % o más de las comunes, se guarda **una sola fila** `url='*'`, con el número de páginas y un ejemplo.
- Como mucho 500 filas por rastreo, primero las páginas con clics de GSC.
- `prev_observed_at` = `finished_at` del rastreo anterior.

### Páginas de dinero (proceso `seo.dinero`, cada 6 h; editable a 3, 6, 12 o 24)
- **Lista:** se repasa en cada pasada, que es barato.
  - `home`: la web del proyecto;
  - `top`: las 5 con más clics de GSC en 28 días; las que dejan de serlo pasan a `active=false`;
  - `pinned`: como mucho 5, las fija una persona;
  - `encargo`: URLs de los ítems del plan `hecha` en los últimos 30 días, como mucho 10, con `expires_at` = hecha + 30 días. Sirven para la fecha real de la parte 8.
- **Lectura:** con `publicFetch` y `resolvesPublic`, sin seguir redirecciones, hasta 2 MB y `extractPage` del núcleo. 15 s por página, una detrás de otra.
- **Error de red:**
  - `fail_streak` + 1 y no se decide nada;
  - los hallazgos abiertos de esa URL se vuelven a emitir tal cual;
  - con 4 fallos seguidos hay un aviso informativo («no podemos leer la página»), no crítico.
- **Condiciones** (sobre la foto actual; las relativas, frente a `baseline`):
  - noindex (crítico) o estado distinto de 200 (crítico): **no en la portada**, que ya la cubre la vigilancia horaria;
  - canonical a otra URL (importante);
  - título o H1 vacíos (importante);
  - palabras por debajo del 50 % de `baseline` con `baseline` de 150 o más (importante).
- **Confirmación:**
  - la primera vez se guarda `pending_kind`/`pending_since` y se encola `seo.dinero.confirmar` a los 30 min;
  - si en la confirmación sigue igual, sale el hallazgo `seo.money_page_changed` (clave por URL y tipo), con fuente `seo.vigilancia:dinero`;
  - si se arregla, se limpia lo pendiente y se resuelve.
- **No avisa** si ya está abierto `seo.page_regressed` para esa URL.
- **`baseline`:**
  - se actualiza a la foto actual cuando no hay ninguna condición;
  - si la persona marca el hallazgo «Dejar así» o «No es un problema», `baseline` = la última foto (lo acepta).
- **Registro:** cada diferencia con `last` en los mismos campos va al registro de cambios (`source='dinero'`). El contenido solo cuenta si la diferencia ya estaba en la pasada anterior (que persista).
- **Purga** del registro con más de 18 meses en cada pasada de dinero del proyecto.

### Pantallas
- **Salud → «Cambios en la web»:** los últimos 90 días, 200 filas, con filtro por texto de URL. Por fila: fecha, URL, qué cambió, antes y después y de dónde sale.
- **Salud → «Páginas de dinero»:**
  - la lista con su motivo, la última comprobación y el estado;
  - «Fijar una página» (URL de la web del proyecto) y «Quitar»;
  - permiso `edit`.

### Mapa Visual y ESTADO
- Pasos «Registro de cambios» y «Páginas de dinero», con `runs` y `tables`.
- Proveedor `live` si el patrón de SEO lo usa.

### Auditoría del diseño concreto (Opus 5.5, esfuerzo alto)
**Veredicto: vale con cambios.** Aplicados todos.

**Graves:**
1. Las URLs de un encargo se vigilan **desde que se aprueba**: la intervención `prevista` se crea al aprobar. La vigilancia dura hasta `interventions.done_at` + 30 días; si no, la fecha real se pierde.
2. **«Dejar así» actualiza `baseline` en la propia acción** (`decideSaludFindingAction`) y sube `baseline_version`. La versión forma parte de la clave del hallazgo, así que un fallo posterior abre uno nuevo y el descartado queda como historia.
3. **Todas las condiciones son relativas a `baseline`** («antes 200 e indexable, ahora no»). La primera foto se toma como `baseline`, sea cual sea.
4. Una página con algo pendiente o con hallazgo abierto **no se desactiva**. Una página que sale del top se desactiva a las 4 semanas.

**Importantes:**
- 401, 403, 429, 5xx y los errores de red son «no concluyente»: suman a `fail_streak` y no deciden nada.
- El contenido en dinero se compara con la última versión estable (`stable`), no con `last`.
- **En el registro desde el rastreo:**
  - se saltan las páginas sin respuesta o bloqueadas en cualquiera de los dos rastreos;
  - la guarda del 20 % de bloqueos se aplica a los dos rastreos;
  - la fila de plantilla guarda en `extra.urls` las URLs afectadas (como mucho 500). Las páginas vigiladas o con encargo conservan además su fila propia.
- `reasons text[]`: una página solo se desactiva cuando no le queda ningún motivo.
- Todas las URLs pasan por `normalizeUrl` antes del hash, y lo fijado y los encargos solo se aceptan del mismo sitio (`sameSite`).
- El rastreo anterior se busca con `target='propio'`. Si cambia de host a una web distinta, se apunta una sola fila `host`.
- La clave de dinero es `dinero:<id del trabajo>` (los reintentos no duplican).
- **Aviso:** un crítico de dinero confirmado va a Telegram (`notifyOwner`) y a la alerta del proyecto, igual que la vigilancia.

**Menores:**
- La pasada normal también confirma lo pendiente que tenga más de 30 min.
- `baseline` solo avanza si no hay ninguna condición y el cambio de palabras es menor del 20 % (una erosión lenta no se cuela).
- Si falta el JSON-LD en uno de los dos rastreos, solo se comparan los tipos.
- La supresión por `page_regressed` solo afecta a estado y noindex.
- Si no se puede leer ninguna página, sale un único aviso de proyecto, y nada si `site_down` está abierto.
- La purga va en una tarea diaria.
- La lectura usa `safeFetcher` del núcleo (2 MB, sin redirecciones).
- Permisos: el listado pide `view`; fijar y quitar, `edit`. Ambos tienen pruebas de seguridad.
