# Diseño: cierre del módulo SEO (partes 9b, 10, 10b, 11 panel de IA y 12)

**Fecha:** 2026-11-27 · **Rama:** `feature/seo-cierre` · **Decisiones de Enric (27 nov, tarde):**
- WordPress: **sí, en el núcleo**. Contraseña de aplicación cifrada, solo para esto; usuario **Colaborador**; solo borradores nuevos; solo `https`; se prueba antes en una web WordPress de Kijutech.
- Panel de IA mensual: **sí, con un tope de 2 $ por proyecto**. La IA propone las preguntas y el equipo las confirma.
- Autoridad: **verificar precio y cobertura** antes de nada.
- GoHighLevel: Enric pega en `.env` el token de una subcuenta de prueba y el ID de un formulario.

Investigación (solo documentación pública, 27 nov). Lo marcado [NV] no está verificado.
- **DataForSEO Backlinks** es de pago por uso desde el 1 jul 2026 ([dataforseo.com/update/pricing-update-in-dataforseo-apis](https://dataforseo.com/update/pricing-update-in-dataforseo-apis)): ya no exige suscripción mínima. Cuesta 0,024 $ por petición más 0,000036 $ por fila [NV si ya incluye la subida del 20 %]. **No hay que contratar nada**: es la misma cuenta y el mismo saldo.
- **Panel de IA:** DataForSEO «LLM Scraper» para ChatGPT y Gemini (lo que ve un usuario, con país e idioma, `sources[].domain` y `brand_entities`, 0,004 $ en directo). Google AI Mode por la SERP API (0,004 $). Perplexity `sonar` por LLM Responses (~0,007 $ [NV]). 15 preguntas × 4 asistentes ≈ **0,28 $ al mes**. Claude por LLM Responses con búsqueda costó 0,55 $ en el ejemplo de la doc: descartado.
- **GoHighLevel:** Private Integration de subcuenta, `Authorization: Bearer` + `Version: 2021-07-28` [NV, o `v3`], scopes `forms.readonly` y `contacts.readonly`. `GET /forms/submissions` (locationId, startAt/endAt, page, limit ≤ 100) trae `others.eventData.page.url`, `referrer`, `source` y `medium`. El contacto trae `attributionSource` y `lastAttributionSource` (utmSource, utmMedium, gclid, referrer…). Límite: 100 cada 10 s y 200.000 al día.

## A. Panel de IA mensual (SEO, parte 11)

**Tres puntos de vista.**
- **SEO local:** importa si el asistente **recomienda** al cliente (lo cita o lo nombra) frente a su competencia, para preguntas de compra del tipo «mejor X en Y». Las respuestas varían, así que una sola pasada al mes es una muestra, no una verdad. Se dice así en la pantalla.
- **Costes:** es determinista salvo la propia respuesta. Las preguntas salen de una plantilla (servicio × población + temas con más valor de Demanda), **sin IA**, siguiendo la directiva de optimización. La detección se hace por dominio exacto en las fuentes y por el nombre de marca (sin acentos) en el texto, también sin IA. El tope se comprueba antes de gastar y el gasto se apunta al enviar.
- **Producto:** sin preguntas confirmadas, no gasta nada (equivale a estar apagado). El equipo confirma, quita o escribe preguntas (15 como máximo). La pestaña muestra, por pregunta y asistente: ✔ citado / nombrado / ✖, quién aparece en su lugar y la evolución mes a mes.

**Alternativas.**
1. **LLM Scraper + AI Mode + Perplexity, en directo (elegida).** Unos 0,28 $ al mes y lo que ve un usuario real.
2. LLM Responses (la API de cada modelo). Responde el modelo «sin interfaz», que no es lo que ve el cliente final; Gemini con búsqueda cuesta unos 0,036 $ y Claude se dispara. Descartada.
3. LLM Mentions (la base de datos de DataForSEO). No usa nuestras preguntas y en ChatGPT solo cubre EE. UU. Descartada.
4. No hacer nada: ya hay AI Overview en Posiciones. Se pierden ChatGPT, Gemini y Perplexity, que es lo que pidió Enric.

**Datos (migración aditiva):**
- `seo_ai_questions`: `project_id`, `question`, `question_key` (único por proyecto), `origin` (plantilla | manual), `status` (propuesta | activa | quitada) y `created_by`.
- `seo_ai_checks`: `question_id`, `run_month` (date), `assistant` (chatgpt | gemini | google_ai | perplexity), `status` (pendiente | hecha | fallida), `client_cited`, `client_named`, `competitors` (jsonb: `[{domain, cited, named}]`), `sources` (jsonb: los 10 primeros dominios), `excerpt` (≤ 600 caracteres), `cost_usd` y `error`.
  - Único (`question_id`, `run_month`, `assistant`): un reintento no paga dos veces.
  - Se guarda lo justo, en filas compactas y sin la respuesta entera.
  - Retención: 24 meses.

**Proceso `seo.panel_ia`:** mensual, en el registro de procesos por proyecto.
1. Filas pendientes con clave única.
2. Tope del panel: el ajuste `ai_panel_budget_usd`, 2 $ por defecto, que además cuenta dentro del tope general de 5 $.
3. Envío en directo (60 peticiones como máximo, de una en una con pausa).
4. Detección.
5. Hallazgo «la competencia aparece y tú no» solo si se repite dos meses seguidos (con margen).

**Núcleo:** la capacidad `serpSource()` se amplía con `aiAnswer?(tenantId, {assistant, question, location, language})` → `{text, sources[{domain,url}], brands[], costUsd}`. El adaptador vive en `lib/agentes/integrations.ts`, igual que el resto de DataForSEO. Es un campo opcional más en un tipo del núcleo, no una dependencia de SEO.

## B. Autoridad (SEO, parte 10)

**Tres puntos de vista.**
- **SEO:** a una pyme local le sirve: dominios que enlazan (cuántos y de qué calidad), nuevos y perdidos al mes, y el *gap* (dominios que enlazan a 2 o más competidores y no al cliente), como lista de oportunidades. Comprar enlaces no entra.
- **Costes:** `summary` × (cliente + 4 competidores), `domain_intersection` (gap) y `timeseries_new_lost_summary` del cliente. Sale por **unos 0,25-0,75 $ al mes por proyecto** [NV], dentro del tope de 5 $.
- **Riesgo:** la cobertura en webs pequeñas no está probada. Por eso hay un **interruptor de cuenta** (`autoridad_activa`, apagado) y un botón «Probar cobertura» (cliente + 2 competidores, unos 0,10 $) para que Enric compare con el informe Enlaces de Search Console antes de encenderlo para todos.

**Alternativas:**
- DataForSEO por uso (elegida: misma cuenta, sin contrato);
- Ahrefs, Semrush o Majestic (119-550 $ al mes de mínimo; descartadas por coste);
- SE Ranking (más caro y con un índice menos probado);
- solo Search Console (no tiene API de enlaces: no se puede automatizar).

**Datos:** `seo_link_snapshots`, con `project_id`, `domain`, `is_client`, `month`, `summary` (jsonb: backlinks, dominios, rank, spam y nuevos/perdidos), `gap` (jsonb, solo en la fila del cliente: los 50 primeros) y `cost_usd`. Único (`project_id`, `domain`, `month`).

**Proceso `seo.autoridad`:** mensual. No corre si el interruptor de cuenta está apagado, salvo que se pida a mano.

## C. Conexiones del cliente en el núcleo: WordPress y GoHighLevel (partes 9b y 10b)

**Tres puntos de vista.**
- **Arquitectura:** la conexión es del **cliente**, no de SEO: Webs, Ads y el futuro departamento de mantenimiento la usarán igual. Va en el núcleo, con una tabla y dos adaptadores. SEO la usa por capacidad.
- **Seguridad:**
  - El secreto se guarda cifrado (`lib/ai/encryption.ts`, el mismo que las integraciones) y nunca vuelve al navegador (se muestra enmascarado).
  - Conectar y desconectar es de nivel `admin`. Crear un borrador es de nivel `edit` y lo pulsa siempre una persona.
  - WordPress:
    - Al conectar se comprueba `GET /wp-json/wp/v2/users/me?context=edit` y **se rechaza** si los roles incluyen administrator, editor o author, o si tiene la capacidad `publish_posts`.
    - Solo `POST /wp/v2/posts` con `status: 'draft'`. Nunca se edita nada existente.
    - `redirect: 'manual'`, para no seguir redirecciones con la contraseña.
    - Solo `https` y `publicFetch` contra DNS rebinding.
  - GoHighLevel: solo GET (y el POST de búsqueda de contactos), con el token de solo lectura.
  - `client_assets` sigue sin guardar contraseñas.
- **Privacidad (leads):** de cada lead se guarda **lo mínimo para medir**: fecha, formulario, página, referente, fuente/medio, UTM y si trae gclid. **Ni nombre, ni correo, ni teléfono**: solo el id externo del contacto para no duplicar. Retención de 25 meses.

**Alternativas:**
- Una tabla genérica `client_connections` en el núcleo (elegida).
- Credenciales en `agt_integrations`: son de cuenta, no de cliente; descartada.
- Dentro de SEO: Enric eligió núcleo.
- Copiar el brief como texto (lo que hay hoy, que sigue existiendo).

**Datos (migración aditiva):**
- `client_connections`: `client_id`, `kind` (wordpress | gohighlevel), `base_url`, `external_id` (locationId de GoHighLevel), `username`, `secret` (cifrado: encrypted + iv), `status` (ok | error | rechazada), `detail` (jsonb: roles, formularios), `last_ok_at`, `last_error` y `created_by`. Único (`tenant_id`, `client_id`, `kind`).
- `client_leads`: `client_id`, `provider`, `external_id` (id del envío, único por cuenta y proveedor), `contact_ref`, `form_id`, `form_name`, `page_url`, `referrer`, `channel` (orgánico | pago | directo | social | referido | otros, normalizado), `utm` (jsonb), `has_gclid` y `submitted_at`.

**WordPress (9b):** botón «Crear borrador en WordPress» en el brief. Crea una entrada **en borrador**, con el título y un esqueleto HTML del brief: H2 de los subtemas, preguntas y enlaces internos sugeridos. Guarda el enlace de edición en el brief. El redactor escribe en WordPress; publicar lo hace una persona en WordPress. Así se cumple la línea roja: nunca publica la herramienta.

**GoHighLevel (10b):** sincronización diaria (y a mano) de los envíos de los últimos 35 días, con paginación y clave única. Para el canal, se lee la atribución del contacto solo de los envíos nuevos: una petición por contacto nuevo, con el límite respetado.

## D. Panel en vivo e informe mensual (SEO, parte 12)

- **Sub-vista «En vivo»** en Resumen. Muestra los leads del mes y su evolución (12 meses), los leads por página y por canal cruzados con los clics de Search Console de esa página, el trabajo hecho (intervenciones), las posiciones y el panel de IA. Todo sale de tablas propias: **ninguna llamada externa al pintar**.
- **Informe mensual v1:** borrador **determinista** (plantilla, sin IA) con lo anterior y el texto de «qué hicimos / qué conseguimos / qué viene». Pasa por `createClientMessage` (bandeja con aprobación). Nunca se envía solo.
  - Ahorra el agente E de la simulación, que queda para más adelante, si Enric lo quiere.

## Lo que no está verificado
- Precios exactos tras la subida de julio (Backlinks).
- Si `es` está en LLM Scraper/Gemini para España.
- La cabecera `Version` de GoHighLevel.
- Si `page.url` es la página del cliente o la del iframe.
- Que `sessionSource` llegue en la respuesta real.

Se comprueban con la primera llamada real (en local, saldo de Kijutech, cuenta de prueba).

## Auditoría independiente (Opus 5.5, esfuerzo alto, 27 nov) y cambios que provoca

La auditoría buscó fallos, no confirmó. Todo lo que encontró se acepta:

| # | Gravedad | Hallazgo | Cambio en el diseño |
|---|---|---|---|
| 1 | grave | `createClientMessage` solo pide aprobación si el ajuste lo exige: el informe podía salir solo | El informe va siempre con `forceApproval: true` y `dedupeKey` `informe:<proyecto>:<mes>`, con su prueba |
| 2 | grave | Panel de IA: 60 peticiones en un trabajo superan su tiempo; un reintento reenvía (doble cobro); el corte de 60 s de `dfs()` deja gasto sin apuntar | **Un trabajo por pregunta** (4 peticiones como mucho). Cada fila se reclama de forma atómica (`pendiente → enviando` con `RETURNING`). El coste estimado se apunta **antes** de enviar y se corrige con el real. Lo que queda en «enviando» más de 1 h pasa a «fallida» y no se reenvía ese mes. El tope se comprueba antes de cada petición. Las llamadas de IA esperan hasta 120 s |
| 3 | grave | WordPress: la lista negra de roles no basta (roles de plugins, multisitio, ascensos posteriores) | **Lista blanca**: `roles = ['contributor']`, sin `upload_files`, `unfiltered_html`, `publish_*`, `edit_published_posts`, `edit_others_posts` ni `manage_*`. Se vuelve a comprobar `users/me` **antes de cada borrador**. Si se rechaza, no se guarda el secreto |
| 4 | importante | El secreto podía viajar a otro servidor | Cambiar la URL obliga a escribir de nuevo la contraseña. El host tiene que ser una web del cliente (`client_assets`), solo `https` en el 443 y sin seguir redirecciones. Se borra en cascada con el cliente. Nunca se registran cabeceras ni cuerpos. GoHighLevel, con host fijo |
| 5 | importante | XSS en el borrador (texto de terceros) y borradores duplicados | Todo se escapa. Los enlaces solo pueden ser `https` del dominio del cliente. El enlace de edición lo construimos nosotros (`post.php?post=ID&action=edit`). Se guarda `wp_post_id` en el brief y el botón no repite |
| 6 | importante | RGPD: `contact_ref` es un dato seudónimo y las URL pueden llevar datos personales | No se guarda `contact_ref`: se deduplica por el id del envío. Las URL se guardan sin parámetros; solo se conservan los `utm_*` de una lista blanca. Retención de 25 meses registrada. **Enric:** contrato de encargado del tratamiento (art. 28) con cada cliente antes de conectarlo |
| 7 | importante | El tope de 2 $ del panel no existía | `canSpendOn(projectId, operaciónPrefijo, usd, topeOperación)`: tope propio por operación (panel de IA 2 $), dentro del general de 5 $. Lo manual también lo respeta |
| 8 | importante | Una muestra al mes no basta; nombres genéricos; competidores sin definir; Perplexity por API | **3 muestras al mes** (días 1, 11 y 21; unos 0,85 $ al mes) y una **cuota de presencia** por asistente. El aviso solo salta con una cuota del 0 % dos meses seguidos y la competencia por encima del 50 %. Del nombre se quitan las palabras que ya están en la pregunta: si no queda nada distintivo, solo cuenta el dominio. Competidores = los confirmados de la ficha. «Quién aparece en su lugar» = dominios de las fuentes, sin directorios. Perplexity solo tiene API («sonar» busca siempre): se acepta y se dice en pantalla. **Para Enric:** las preguntas salen de una plantilla y no de la IA (directiva de IA: misma calidad, coste 0); el equipo las edita |
| 9 | importante | Autoridad: faltaba la capacidad, el interruptor debía ser por proyecto y la prueba de cobertura no tenía criterio | `serpSource().links` en el núcleo. Activación **por proyecto** (apagada). «Probar cobertura»: solo `admin`, una vez al día y dentro del tope. Criterio: DataForSEO debe encontrar al menos el 60 % de los dominios que Enric ve en Search Console → Enlaces, en 3 clientes. El gap se filtra (rank mínimo, sin directorios ni spam) y propone encargos al plan |
| — | menor | Cerrar el ciclo del borrador | Se guarda `wp_post_id`. El proceso diario mira si la entrada se publicó y la marca como «usada» con su URL (registro de intervención) |
| — | menor | Leads | En pantalla: «solo formularios (no llamadas ni WhatsApp)». URL normalizadas para cruzarlas con Search Console. Contraseñas de aplicación bloqueadas por Wordfence u hosting: estado «error» con mensaje claro |
