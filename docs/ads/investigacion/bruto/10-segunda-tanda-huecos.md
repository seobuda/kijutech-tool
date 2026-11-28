# 10 — Segunda tanda: huecos de la primera investigación (28 nov 2026)

Investigación hecha con el navegador Chrome (búsquedas de Google) y WebFetch, con el cupo de WebSearch agotado.
Marcas: **VERIFICADO** = leído en la fuente (oficial cuando se dice); **NO VERIFICADO** = visto solo en extracto de Google,
en una fuente secundaria o deducido.

## Resumen

- **Developer token retirado el 9 sep 2026 (oficial):** el acceso va por proyecto de Google Cloud (Test → Explorer 2.880 op/día,
  aprobación automática → Basic 15.000, exige verificación de marca → Standard ilimitado, con auditoría). **Ya no hace falta MCC**
  para usar la API (sí para gestionar varias cuentas). La cuenta de servicio se añade como usuario; máximo 20 cuentas por email, así que
  con 25+ cuentas va en la MCC. Explorer no da Keyword Planner.
- **Data Manager API:** no pide nivel de acceso de la Google Ads API ni token; sí proyecto, alcance `datamanager` y acceso en la
  cuenta o MCC. Verificación OAuth solo si se usan credenciales de usuario.
- **Conversiones offline en la cuenta equivocada (SEL, 5 nov 2026):** pasa al subir un lote a varias cuentas con el mismo nombre de
  acción. Además, «#OK» solo significa que la fila se pudo leer. Solución: subir por cuenta, nombre único por cuenta y conciliar.
- **17 ago 2026:** tCPA y tROAS limitadas por presupuesto pujan hacia el objetivo, no por debajo. Afecta al tCPA de leads (y a
  Maximizar conversiones con CPA objetivo). Con menos de 7 conversiones no hay objetivo recomendado.
- **Prioridad de canal (desde el 15 oct 2026):** Alta o Baja con % de presupuesto para socios y Display. Display Expansion migra en
  febrero de 2027. Aún no está en la API.
- **tCPA:** no hay mínimo oficial; Google recomienda evaluar con ≥30 conversiones en 30 días. **Exclusiones de datos:** relleno ≥5
  días después y en general desaconsejado; no hay ningún «14 días» oficial.
- **GoHighLevel:** la acción nativa no admite disparadores de etapa del pipeline ni envía email; hay indicios de que sigue funcionando
  tras el 15 jun (adoptante existente), pero sin confirmación oficial. Recomendación: subidor propio con Data Manager API.
- **Reseñas:** las quejas que se repiten son el ruido sin priorizar (TrueClicks), la falta de contexto (Opteo), el riesgo de cambios
  masivos (Optmyzr) y los datos con 24 h de retraso o cambios que hay que aplicar fuera (Adalysis).
- **Diagnóstico:** árboles de SEL y Brad Geddes resumidos en un árbol unificado (4.5). LeadsRx cerró el 30 oct 2026. No hay datos
  públicos de estacionalidad española: hay que calcularla con DataForSEO, GSC y el histórico. No existe ninguna herramienta española
  equivalente.

---

## 1. Verificaciones en documentación oficial de Google

### 1.1 Fin del developer token y acceso por proyecto de Google Cloud — VERIFICADO (oficial)

Fuentes: https://developers.google.com/google-ads/api/docs/api-policy/developer-token y
https://developers.google.com/google-ads/api/docs/api-policy/access-levels (actualizada 19 nov 2026 según el extracto de Google).

- **Los developer tokens se retiraron el 9 de septiembre de 2026.** El acceso a la API se gestiona ahora **por proyecto de
  Google Cloud**. VERIFICADO.
- **La cabecera `developer-token` ya no hace falta**: se puede seguir enviando, pero «es opcional y los servidores la ignoran».
  Google rechazará tokens en las llamadas en una futura versión mayor, así que las bibliotecas cliente deben dejar de enviarlo. VERIFICADO.
- **Ya no hace falta cuenta de administrador (MCC) para usar la API**: «You no longer need a Google Ads manager account to use
  the Google Ads API». La MCC solo hace falta si se quieren vincular y gestionar varias cuentas a través de la API. VERIFICADO.
  → Para Kijutech (25+ cuentas bajo una MCC) seguiremos usando la MCC y `login-customer-id`, pero **ya no hay que esperar
  al «token de desarrollador de la MCC»**: lo que hay que pedir es el nivel de acceso del proyecto de Cloud.
- **Qué proyecto manda:** el nivel de acceso lo da el proyecto de Cloud que generó las credenciales OAuth: en flujo de usuario,
  el dueño del client ID/secret; en flujo de cuenta de servicio, el proyecto dueño de la cuenta de servicio. Una cuenta puede
  tener varios proyectos con niveles distintos. VERIFICADO.
- **Transferencia:** Google miró los 90 días de llamadas anteriores al cierre y pasó el nivel de cada token aprobado a los
  proyectos que lo usaron. Tokens nunca usados no se transfirieron; inactivos 90 días, revocados. **Proyectos nuevos empiezan
  en Test.** Ya no se puede reasociar un token aprobado a un proyecto nuevo. VERIFICADO.

**Niveles de acceso** (ventana deslizante de 24 h) — VERIFICADO (access-levels):

| Nivel | Cuentas | Operaciones/día | Cómo se obtiene |
|---|---|---|---|
| Test | solo cuentas de prueba | 15.000 | automático al habilitar la API en el proyecto |
| Explorer | prueba y producción | 2.880 en producción (15.000 en prueba) | «Upgrade access level» → «Apply for access» en la página Overview de la API en Cloud Console; revisión automática «en la mayoría de los casos» |
| Basic | prueba y producción | 15.000 | desde Explorer; exige **verificación de marca (brand verification)** sin avisos pendientes |
| Standard | prueba y producción | ilimitadas (cada servicio puede tener su propio límite) | «Start application» desde Basic; auditoría manual, ~10 días hábiles; la herramienta debe cumplir la «Required Minimum Functionality» |

- **Restricciones de Explorer:** no permite creación y vinculación de cuentas, gestión de usuarios, planificación (Keyword Plan,
  servicios de alcance/audiencias), facturación ni aprobaciones multiparte. Para eso hace falta Basic o Standard. VERIFICADO.
  → Implicación: con Explorer **no podemos usar `KeywordPlanIdeaService`** (ideas de palabras clave); para eso, Basic.
- **Uso permitido** (solo aplica a Standard): creación/gestión de anuncios, informes (solo Search/SearchStream o lectura),
  investigación de palabras y recomendaciones. VERIFICADO.
- **Cálculo para nuestro caso** (deducción propia, NO VERIFICADO con pruebas): 2.880 operaciones/día con 25-30 cuentas ≈ 100
  operaciones por cuenta y día. Una consulta GAQL de informe (Search/SearchStream) cuenta como operación; con 5-10 consultas
  agrupadas por cuenta y pasada, 2-3 pasadas al día caben en Explorer. Para lectura frecuente + Keyword Planner + cambios,
  pedir **Basic** (15.000) cuanto antes; requiere verificación de marca.

**Cuenta de servicio** — VERIFICADO (https://developers.google.com/google-ads/api/docs/oauth/service-accounts):
- Se añade el email de la cuenta de servicio como **usuario** en Google Ads (Administración → Acceso y seguridad), en la cuenta
  o en la **MCC**; con MCC se usa `login-customer-id` = ID de la MCC.
- No admite el nivel «Solo correo electrónico»; **por defecto no se le puede dar acceso de administrador** (hay que subirlo a mano
  si de verdad hace falta). Principio de mínimo privilegio: para leer basta «Solo lectura»/«Estándar».
- **Un mismo email puede asociarse a un máximo de 20 cuentas de Google Ads**; para más de 20 → añadirla a la MCC y gestionar las
  cuentas colgando de ella. → Con 25+ cuentas, **la cuenta de servicio debe ir en la MCC**, no cuenta por cuenta.
- No menciona delegación de dominio (domain-wide delegation).

### 1.2 Data Manager API: ¿exige nivel de acceso? — VERIFICADO (oficial) con matiz

Fuente: https://developers.google.com/data-manager/api/get-started/set-up-access
- La página de configuración **no menciona developer token ni nivel de acceso de la Google Ads API**. Pasos: proyecto de Cloud,
  habilitar la Data Manager API, pantalla de consentimiento OAuth con alcance `https://www.googleapis.com/auth/datamanager`,
  credenciales (usuario o cuenta de servicio con rol Service Usage Consumer + suplantación con Service Account Token Creator),
  y **dar acceso al email en la cuenta de Google Ads o en una MCC padre**. VERIFICADO.
- Aprobaciones que sí menciona: (a) las apps con credenciales de usuario «deben pasar con el tiempo la verificación OAuth de
  Google» antes de producción (alcance sensible); (b) las cuentas de **socio de datos (data partner)** solo se emiten tras un
  proceso de aprobación. Kijutech no necesita ser data partner: sube a sus propias cuentas como anunciante/agencia. VERIFICADO.
- No habla de cuotas en esa página. NO VERIFICADO: límites de peticiones de la Data Manager API.
- Conclusión: **la subida de conversiones offline no depende de conseguir Basic/Standard en la Google Ads API**; con una cuenta
  de servicio (sin verificación OAuth de usuario) y acceso en la MCC debería bastar. NO VERIFICADO en la práctica.

### 1.3 Conversiones offline atribuidas a la cuenta equivocada (Search Engine Land, 5 nov 2026) — VERIFICADO (artículo leído)

Fuente: John Horn, «Google Ads may count offline conversions in the wrong accounts», Search Engine Land, 5 nov 2026,
https://searchengineland.com/google-ads-may-count-offline-conversions-in-the-wrong-accounts-500544

- **Qué pasa:** si se suben conversiones offline a **varias cuentas en un solo lote** y cada cuenta tiene una acción de conversión
  **con el mismo nombre** (p. ej. «Purchase»), Google puede **aceptar el GCLID/teléfono en una cuenta que no generó el clic o la
  llamada**. Antes lo rechazaba en las cuentas ajenas. El caso: anunciante multimarca, una cuenta por marca bajo una MCC.
  Google Support les dijo que es **comportamiento esperado**.
- **¿Infla?** Sí: aparecen conversiones en la columna Conversiones y en el coste/conversión de campañas que no las generaron.
  Google dice que el crédito de puja va solo a la campaña del clic, pero los autores **no pudieron confirmar si afecta a Smart
  Bidding**. No pasa siempre: a veces Google sigue rechazando con «click not associated with the account», sin patrón claro.
- **Segundo hallazgo:** «Successful» / «#OK» en el historial de subidas **solo significa que la fila se pudo leer** (estructura,
  acción existe, GCLID existe); la atribución real se comprueba después. Caso: subieron N, Google dijo OK a casi todas y en la
  cuenta aparecieron bastantes menos. Causas genéricas que dio Google: duplicados (mismo GCLID varias veces) y clics considerados
  inválidos.
- **Soluciones que proponen:** (1) segmentar las subidas: cada conversión solo a la cuenta que generó el clic; (2) **nombre único
  de acción de conversión por cuenta**; (3) usar seguimiento de conversiones entre cuentas a nivel de MCC. Además: subir solo
  conversiones nuevas, **guardar registro de los GCLID enviados** y **conciliar** periódicamente lo subido con lo que aparece en
  Google Ads por fecha de conversión («por hora de conversión»), recordando que la columna estándar atribuye a la fecha del clic.
- Contexto citado en el mismo artículo: el 26 de marzo (2026) el blog de desarrolladores anunció mejoras en la importación offline
  (atribuir algunos GCLID caducados y clics previos; menos errores EXPIRED_EVENT y CONVERSION_PRECEDES_EVENT; estructura de
  autorización más flexible para MCC/cliente, menos errores INVALID_CUSTOMER_FOR_CLICK). Leído en el artículo; NO VERIFICADO en
  el blog original.
- Ecos: adriaan-dekker.nl (4 nov 2026) y parsehppc.com (10 nov 2026) lo repiten (solo extractos de Google; NO VERIFICADO).

**Implicaciones para el módulo:** subir siempre por cuenta (nunca lote multi-cuenta), nombre de acción único por cuenta
(p. ej. `kj_<cliente>_lead_cualificado`), tabla propia de GCLID/gbraid enviados con su respuesta, y un **conciliador** diario
«subidas aceptadas vs conversiones que Google muestra por fecha de conversión» con alerta si la tasa real cae (p. ej. <85 %).

### 1.4 Prioridad de canal (channel prioritization), octubre 2026 — VERIFICADO (oficial)

Fuentes: https://support.google.com/google-ads/answer/18385152?hl=en y https://support.google.com/google-ads/answer/7193800?hl=en
- Despliegue progresivo **desde el 15 oct 2026** (anunciado el 14 oct según commonthreadco.com y smarter-ecommerce.com, extractos).
- Canales: **Búsqueda** (Google Search, socios de búsqueda, Red de Display), **Shopping** (Search, socios), **PMax** (canales de
  Google, socios, Display), **Demand Gen** (canales de Google, Display; sin reparto de presupuesto).
- Dos niveles: **Alta** (gasta primero) y **Baja** (recibe lo que sobra). **Por defecto todos los canales en Alta.**
- **Reparto de presupuesto** (budget allocation): solo en canales de prioridad Baja, % opcional del presupuesto diario medio, «best
  effort» (no garantizado). Ejemplo oficial: 5 % sobre 1.000 $/día → aspira a ≤50 $/día en ese canal. **0 % = no gasta en ese canal.**
- **Display Expansion en Búsqueda:** hasta **febrero de 2027** se mantiene el comportamiento actual en campañas que no configuren
  prioridades; desde febrero 2027 se migran automáticamente y «la configuración actual de reparto desaparece». Antes había un 50 %
  aplicado internamente; para conservarlo: Display en **Baja con 50 %**.
- **La Red de Display dejará de servir en campañas de Búsqueda con estrategia Cuota de impresiones objetivo.**
- Quien había quitado socios o Display puede volver a activarlos con estos controles.
- **API: «Support for the Google Ads API and Google Ads Editor is coming soon»** → hoy no se puede leer/cambiar por API. VERIFICADO.
- No se puede configurar desde la MCC. VERIFICADO.
- **Para el módulo:** regla de auditoría «campaña de Búsqueda de leads con Display o socios en Alta / sin tope» y aviso antes de
  febrero 2027. Mientras no esté en la API, comprobarlo con el informe de segmento por red (`segments.ad_network_type`: SEARCH,
  SEARCH_PARTNERS, CONTENT) y alertar si socios/Display superan X % del gasto con CPA peor.

### 1.5 Cambio del 17 ago 2026 en tCPA/tROAS limitadas por presupuesto — VERIFICADO (oficial)

Fuentes: https://support.google.com/google-ads/answer/17061251?hl=en y FAQ https://support.google.com/google-ads/answer/17125145?hl=en
- Desde el 17 ago 2026 (despliegue completado el 27 ago), en campañas **«Limitada por presupuesto»** con **CPA objetivo o ROAS
  objetivo**, el sistema puja para acercarse **al objetivo fijado**, no para batirlo. Ejemplo oficial: tCPA 10 $ que venía logrando
  5 $ → ahora entregará **más cerca de 10 $** salvo que se cambie el objetivo.
- Ámbito: Búsqueda, Shopping, PMax, Demand Gen, Display, Hoteles, Viajes (Display y Hoteles ya lo tenían). No afecta a App, Video
  reach/view, **CPC manual** ni **Cuota de impresiones objetivo**. Incluye **todas las conversiones, online y offline**. No afecta a
  campañas que no estén limitadas por presupuesto.
- **¿Afecta al tCPA de leads?** Sí: el ámbito se define por estrategia y tipo de campaña, no por objetivo; una campaña de Búsqueda
  de leads con tCPA limitada por presupuesto entra. Además, Google ha renombrado «Maximizar conversiones con CPA objetivo» a
  «CPA objetivo» y dice que el comportamiento subyacente «es exactamente el mismo»
  (https://support.google.com/google-ads/answer/6268632?hl=en), así que **Maximizar conversiones con CPA objetivo también entra**.
  (Lo de «sí» para leads es deducción directa del texto; VERIFICADO el ámbito.)
- Google **no cambia solo objetivos ni presupuestos**. Recomienda: alinear el objetivo al CPA real del último mes (excluyendo el
  periodo de retraso de conversión), poner otro objetivo, o pasar a Maximizar conversiones; dejar presupuesto «holgadamente por
  encima del gasto medio diario»; **no aplicar exclusiones de datos ni límites de puja solo por este cambio**; esperar **1-2 ciclos
  de conversión** antes de juzgar. **Con menos de 7 conversiones no se calcula objetivo recomendado.** VERIFICADO.
- **Para el módulo:** regla «tCPA + limitada por presupuesto + CPA real << objetivo antes del 17 ago» → el CPA habrá subido hacia el
  objetivo: proponer bajar el objetivo al CPA real o pasar a Maximizar conversiones. Y al diagnosticar subidas de CPA posteriores
  al 17 ago, este cambio es una causa candidata.

### 1.6 Mínimo de conversiones para tCPA — VERIFICADO (oficial)

Fuente: https://support.google.com/google-ads/answer/6268632?hl=en
- **No hay mínimo oficial**: «Advertisers can start using Target CPA with no conversion history». Para evaluar el rendimiento
  recomiendan mirar 30 días «including at least 30 conversions». El tCPA recomendado = CPA medio de 30 días ajustado por retraso
  de conversión. Las recomendaciones pueden aparecer en campañas de poco volumen si las simulaciones son fuertes.
- Los «15 o 30 conversiones en 30 días» que circulan son **reglas antiguas o de practicantes**, no requisito actual. La FAQ del
  17 ago añade el único umbral numérico oficial visto: **<7 conversiones → sin objetivo recomendado**.
- **Para el módulo:** umbral propio razonable: avisar de «tCPA con <15 conversiones/30 días» como riesgo (opinión), y no fiarse
  de evaluar tCPA con <30 conversiones (recomendación oficial de evaluación).

### 1.7 Exclusiones de datos: días de relleno y recuperación — VERIFICADO (oficial)

Fuentes: https://support.google.com/google-ads/answer/10370710?hl=en y https://support.google.com/google-ads/answer/10276486?hl=en
- Disponibles en **Búsqueda, Display, Shopping y PMax** (no Hoteles/Viajes), solo con estrategias basadas en conversiones o valor.
- Aplicarlas **lo antes posible**; las de fechas futuras surten efecto **en un día**; las de fechas pasadas estabilizan «en unos días».
- Las fechas se aplican a **clics**: hay que incluir el retraso de conversión. Ejemplo oficial: retraso de 5 días, caída del 15 al
  18 oct → excluir del **10 al 18 oct**. Excluir al menos el **90 % de los clics** afectados.
- **Relleno (backfill):** en general **no recomendado** (ni siquiera tras una caída); si se hace para informes, **esperar al menos 5
  días** desde que se aplicó la exclusión y **no quitar la exclusión**. → El «5 frente a 14» de la primera tanda: el dato oficial es
  **5 días**; **no aparece ningún 14** en las páginas oficiales.
- Si se ven afectados una semana o más de clics, las fluctuaciones pueden durar **1-2 ciclos de conversión**. No usarlas con
  frecuencia ni por periodos largos.
- **Para el módulo:** detector de «caída de conversiones por medición» (formulario roto, etiqueta caída: cruzar con el rastreador
  SEO, GA4 y GoHighLevel) → proponer exclusión con las fechas ya calculadas (inicio − retraso de conversión) y avisar de no
  rellenar.

---

## 2. GoHighLevel + Google Ads después del 15 jun 2026

### 2.1 Qué dice la ayuda oficial de HighLevel — VERIFICADO (help.gohighlevel.com)

- **Acción de flujo «Add to Google Ads»** (https://help.gohighlevel.com/support/solutions/articles/155000003368-workflow-action-add-to-google-ads,
  modificada el 6 feb 2026): envía la conversión «vía API» usando **GCLID, GBRAID o WBRAID** capturados en el clic; valor y moneda
  por evento. **Solo funciona con los disparadores Form Submission, Order Purchase, Number Pool Calling (Call Status), Survey
  Submission y Chat Widget (Customer Replied).** **No menciona Opportunity/Pipeline Stage Changed.** El nombre de la acción de
  conversión debe coincidir exactamente (mayúsculas, espacios) o se salta. GBRAID/WBRAID solo con conversiones «Cada una»
  (many per click). **No hay forma de probar el evento**: solo los registros de ejecución (Executed / Skipped). No menciona email/
  teléfono (conversiones mejoradas para leads) ni Data Manager API.
- **Ad Manager → crear conversiones offline** (https://help.gohighlevel.com/support/solutions/articles/155000005431-ad-manager-create-manage-google-ads-offline-conversions,
  modificada el **9 oct 2026**): HighLevel crea la acción de conversión offline en Google Ads por API, con «Conversion Source»
  (p. ej. *Qualified lead* o *Purchase*), recuento, valor fijo/por defecto/sin valor y ventana. Atribución basada en datos no
  editable. «Crear la acción no registra conversiones»: hay que enviarlas con la acción de flujo u otro método. No menciona Data
  Manager API ni etapas del pipeline.
- **Configuración en Google Ads** (https://help.gohighlevel.com/support/solutions/articles/48001220947-how-to-set-up-google-ads-offline-conversion-actions-google-platform-side-setup-,
  24 mar 2026): solo fuente «offline»; recomiendan ventana de 90 días, basada en datos, «Cada una». Pone «lead cualificado» y
  «venta ganada en el CRM» como ejemplos, pero sin explicar cómo enviarlos desde etapas.

### 2.2 ¿Sigue funcionando la subida tras el 15 jun? — PARCIAL / NO VERIFICADO del todo

- Lo oficial de Google: desde el 15 jun 2026 la Google Ads API **no acepta nuevos adoptantes** de importación offline (incluidas
  conversiones mejoradas para leads); los que ya subían pueden seguir mientras migran (citado por
  https://scalewithhunaid.com/guides/gohighlevel-google-ads-conversions-not-working y oligamy.marketing, 17 nov 2026; la página de
  Google https://support.google.com/google-ads/answer/... «Upgrade offline conversion import to enhanced conversions for leads»
  dice en el extracto que se migran a Data Manager API y se bloquean en la Google Ads API). Coherente con 09b (VERIFICADO allí).
- **HighLevel es un integrador grande que ya subía antes del 15 jun** → previsiblemente «adoptante existente» y su acción sigue
  operativa. Ninguna fuente de HighLevel (ayuda, changelog) **anuncia migración a Data Manager API**; las páginas de ayuda de
  2026 no mencionan el cambio. Guías de terceros (scalewithhunaid.com; ghlprime.com/blog/gohighlevel-google-ads, 29 oct 2026)
  dicen: si los registros muestran «Executed» y las conversiones aparecen en Google Ads, no hay que cambiar nada; lo que se rompe
  son las **subidas propias** (n8n/Make/Zapier/código) creadas después del 15 jun. **NO VERIFICADO** con HighLevel; no se
  encontraron quejas masivas de que dejara de funcionar (búsqueda en Google, 28 nov).
- Petición en el tablero de ideas de HighLevel para **pasar el email (conversiones mejoradas)** — citada por scalewithhunaid; indica
  que **la acción nativa no envía email/teléfono hasheado**. NO VERIFICADO directamente.

### 2.3 ¿Puede enviar etapas del pipeline (lead cualificado, venta)? — NO de forma nativa (VERIFICADO por la lista de disparadores)

- La propia ayuda limita los disparadores a formulario, compra, llamada, encuesta y chat. hlgrowthpartner.com (1 oct 2026,
  https://hlgrowthpartner.com/post/gohighlevel-google-ads-conversion-tracking-2026) lo dice claro: «un cambio de etapa no es uno de
  esos disparadores, así que una venta ganada necesita otra vía». Una petición antigua del tablero de ideas también decía que no
  funcionaba con cambios de etapa (vía scalewithhunaid). Algunos tutoriales (consultevo.com, abdulkayium.com) dicen que sí se puede
  con «Pipeline stage changed»: **contradicción**, sin confirmar; prima la ayuda oficial.
- **Rodeos documentados por terceros:** (a) webhook saliente del flujo en el cambio de etapa → middleware que sube a Google;
  (b) exportar oportunidades ganadas con su GCLID y subir el archivo; (c) mantener además una conversión de lead para no dejar
  sin señal a la puja mientras maduran los tratos.

### 2.4 Implicación para Kijutech — recomendación (opinión)

- **Nuestra herramienta ya tiene la conexión con GoHighLevel**: el camino robusto es que **nuestro módulo** lea oportunidades y
  etapas de GHL (con GCLID/gbraid/wbraid y email/teléfono del contacto) y suba a Google por **Data Manager API** (nuevo adoptante
  → obligatoriamente Data Manager), con acciones «lead cualificado» y «venta» por cuenta y con **nombre único por cuenta**
  (ver 1.3), registro de lo enviado y conciliación. Así no dependemos de los disparadores limitados de GHL y añadimos conversiones
  mejoradas para leads (email/teléfono hasheados), que la acción nativa no manda.
- Riesgo: doble conteo si GHL nativo y nuestro módulo envían a la misma acción → regla: o uno u otro por acción de conversión.
- Comprobar en cada subcuenta de GHL que se captura el GCLID (campo vacío = acción «Skipped»): alerta «% de leads de Google Ads sin
  GCLID» (customerlabs.com y dealoracle.io lo señalan como la fuga nº 1; extractos, NO VERIFICADO).

---

## 3. Reseñas reales de Optmyzr, Adalysis, Opteo y TrueClicks

Fuente principal: Capterra (leído con el navegador el 28 nov 2026; G2 sigue sin dar texto). Las reseñas de Capterra son de fechas
muy variadas (2020-2026); muchas antiguas. Lo citado son **anécdotas de usuarios** (VERIFICADO que están publicadas, no que sean
ciertas). Los blogs «comparativos» encontrados (groas.com, tryatria.com, get-ryze.ai) son **de competidores**: se usan solo para
precios y con cautela.

### 3.1 Optmyzr — Capterra 4,7 (184 reseñas), actualizado 20 nov 2026 — https://www.capterra.com/p/156308/Optmyzr/reviews/
- **Lo que gusta:** vista consolidada de gasto/ingresos/ROAS de todas las cuentas y control del ritmo de presupuesto (pacing);
  comparativa semana contra semana de todas las cuentas «de un vistazo»; **Rule Engine** (automatizaciones que la plataforma
  nativa no permite); informes PMax Channel Distribution y Shopping Analysis; creación masiva de campañas.
- **Quejas:** caro y sube con el gasto y el número de clientes; **curva de aprendizaje** («no es para novatos», «no se lo des a
  los no iniciados, se meten en líos rápido»); **riesgo de cambios masivos**: un usuario (2020) se quejaba de pujas por defecto de
  0,1 o 1 en Shopping que, aplicadas con una regla a cientos de campañas, «cuestan miles de dólares en minutos»; otro (Reddit vía
  tryatria.com) «hizo más daño que bien, es demasiado fácil hacer cambios masivos entre cuentas»; interfaz anticuada; menos
  profundidad en Microsoft/Meta/Amazon; soporte para RSA peor que para ETA (antiguo); un CEO (2023) denuncia «sin soporte» y cobros
  poco claros. Precios 2026 citados por competidores: Essentials 209 $/mes anual (299 $ mensual) hasta 150.000 $ de gasto;
  Premium desde 272-389 $; 8 tramos 209-899 $ (https://www.tryatria.com/blog/optmyzr-reviews; https://groas.com/post/optmyzr-vs-opteo-vs-adalysis-three-recom). NO VERIFICADO en la web de Optmyzr.

### 3.2 Opteo — Capterra 4,9 (114) — https://www.capterra.com/p/153001/Opteo/reviews/
- **Gusta:** como «un asistente que te presenta la información correcta para decidir»; aburre la gestión en el buen sentido; valor.
- **Quejas (las más útiles para nosotros):** **«Opteo no entiende el contexto»**: sugiere añadir palabras clave fuera de la intención
  del usuario objetivo; recomendaciones **incorrectas, redundantes o contradictorias** («hay que revisarlas antes de aplicar»);
  alguna recomendación «no pondera bien conversiones totales frente a coste»; dudas de su valor frente a la puja automática de
  Google; solo Google Ads (sin Microsoft, «no está en su hoja de ruta» según una reseña); fallos de API ~1 de cada 20 sugerencias;
  faltaban informes PDF para clientes/prospectos (otro usuario pide justo lo contrario: «no hagáis informes, centraos en optimizar»).
- Precios 2026 citados por un competidor: Basic 129 $, Professional 249 $, Agency 499 $ (groas.com). NO VERIFICADO.

### 3.3 Adalysis — Capterra 4,6 (119) — https://www.capterra.com/p/173311/Adalysis/reviews/
- **Gusta:** recomendaciones sensatas para anuncios; guías de incorporación; informes de auditoría que ahorran trabajo.
- **Quejas:** **datos no en tiempo real (se actualiza cada 24 h)**; muchas sugerencias **hay que aplicarlas en Google Ads** y no desde la
  herramienta; no se pueden **guardar vistas y filtros personalizados**; auditorías no personalizables; interfaz pesada / «una tarea
  estar dentro»; sin Meta ni vídeo; precio alto para pymes (hasta un 8-10 % del gasto en un caso), y caro «si la auditoría ya sale casi
  perfecta»; «algunas comprobaciones ya las hacen gratis las herramientas de Google». Precios citados: desde 149 $ (50.000 $ de gasto)
  hasta 2.500 $ (4 M$) (groas.com, NO VERIFICADO).

### 3.4 TrueClicks — Capterra 4,6 (68) — https://www.capterra.com/p/213461/TrueClicks/reviews/
- **Gusta:** hace lo que promete; soporte rápido; auditoría constante.
- **Quejas (muy relevantes para el diseño):** **«encuentra tantos problemas que se vuelve abrumador con muchas cuentas; el reto es
  saber qué priorizar»**; la **puntuación de cuenta** baja si dejas abiertas optimizaciones que no aplican → incentiva cambios que el
  gestor no quiere («para tener buena nota acabas haciendo cambios de los que no estás convencido»); falta **personalizar umbrales,
  prioridad de comprobaciones y formato de informe** según los objetivos de la cuenta; alertas heredadas sin actualizar; interfaz
  abrumadora al principio; PMax insights flojos; Meta por detrás de Google.

### 3.5 Patrones comunes (síntesis propia)
1. **Ruido y priorización**: todas generan listas largas; los usuarios piden saber **qué importa primero** y poder **descartar con
   motivo** sin penalizar la nota.
2. **Falta de contexto de negocio**: sugerencias de palabras fuera de intención, recomendaciones que no ponderan coste/volumen.
   Nuestra ficha de cliente (servicios, zona, propuesta) es justo lo que les falta.
3. **Riesgo de cambios masivos**: piden barreras (valores por defecto peligrosos, aplicar a cientos de campañas).
4. **Datos con retraso** (24 h) y **aplicar fuera** de la herramienta.
5. **Umbrales no ajustables por cuenta/objetivo.**

---

## 4. Diagnóstico PPC: Search Engine Land y Brad Geddes (árboles de diagnóstico)

### 4.1 «PPC diagnostics: How to find and fix the root cause of low conversions» — Menachem Ani, SEL, 16 ene 2025 — VERIFICADO (leído)
https://searchengineland.com/ppc-diagnostics-low-conversions-450710 — Lista de comprobación de su agencia, en orden:
1. **Poco tráfico**: trabajar hacia atrás con las tasas propias de la cuenta. Ejemplo: 1 conversión cada 10 clics y 1 clic cada 100
   impresiones → con <10 clics/día no se llega al umbral y probablemente no habrá conversiones. → regla para nosotros: «días sin
   conversión» solo es alarma si los clics del periodo superan (1 / tasa de conversión histórica) × un factor.
2. **Limitada por presupuesto** (lo más frecuente según el autor): mirar cuota perdida por presupuesto y gráfico del grupo. Si gasta todo,
   bajar pujas (CPC manual) o **aflojar objetivos** (Smart Bidding) para más tráfico con el mismo presupuesto; revisar términos.
3. **Cambios recientes** (presupuesto, pujas, objetivos, palabras, ubicaciones; Merchant Center en Shopping/PMax). **No tocar nada
   fuerte con caídas de hasta 7 días; cambios de ~10 % son fluctuación normal** (opinión del autor).
4. **Cambios del lado del cliente** (oferta, precios, proceso de venta): alinear la fecha de la caída con la del cambio.
5. Desequilibrio intención/concordancias (limitar la amplia en términos genéricos de investigación).
6. Demasiadas o muy pocas negativas (solo bloquear con datos suficientes).
7. **Seguimiento roto: la firma es una caída a cero, no un -20 %**; probar las acciones con Tag Assistant.
8. Landing débil (mensaje, CTA, confianza, velocidad, móvil).
9. Demanda insuficiente / mercado agotado → más palabras, pujas o zonas (consultando al cliente).
10. Volatilidad de mercado (estacionalidad, actualidad, desastres, economía, mala prensa). Ejemplo: terapia ABA en EE. UU. floja de
    Acción de Gracias a Año Nuevo → no sobrepujar en el valle, cargar presupuesto en el pico.

### 4.2 «How to recover from Google Ads performance drops» — Benjamin Wenner, SEL, 24 jul 2024 — VERIFICADO (leído)
https://searchengineland.com/google-ads-performance-drops-recover-444357
- **Árbol de métricas en 4 niveles:** N1 conversiones, CPA, ROAS → N2 CTR, tasa de conversión, clics, impresiones, CPC medio → N3 cuota
  de impresiones, nivel de calidad, relevancia del anuncio, experiencia de landing, cuota perdida (presupuesto), cuota perdida (ranking)
  → N4 palabra clave, anuncio, dispositivo, geografía, audiencia. Se baja por la rama que cambia. Ejemplo: conversiones ↓, CTR estable,
  tasa de conversión ↓ → experiencia de landing ↓ → solo en móvil → problema en la versión móvil de la landing.
- Tres áreas: **cuenta** (CTR, tasa de conversión, QS —indicador lento—, cuota; historial de cambios, subastas, vista previa), **mercado**
  (Google Trends, CPC medio y estimaciones de puja de parte superior, geografía; Keyword Planner, Performance Planner, noticias) y **web
  del cliente** (rebote, velocidad, móvil, embudos GA4, **estado del seguimiento**; PageSpeed; recorrer el embudo dos veces a mano).
- Menciona que **Optmyzr tiene gráficos de árbol de causa raíz** (root cause tree charts).
- Comunicación al cliente: proactiva, antes de que lo note; llamada si es crítico; llegar con datos y análisis inicial.

### 4.3 «How to uncover the root cause of PPC performance changes» — Joseph Kerschbaum, SEL, 26 abr 2023 — VERIFICADO (leído)
https://searchengineland.com/ppc-root-cause-analysis-396427
- Proceso: definir el problema → recoger datos (cuándo empezó, frecuencia, factores) → posibles causas (espina de pescado, **5 porqués**)
  → probar la hipótesis → solucionar y documentar. Ejemplo: conversiones -25 % del 15 al 18 abr; tráfico estable, tasa de conversión ↓;
  sin cambios de segmentación/puja; web estable en interacción pero compras ↓ → el equipo web había retirado productos populares por
  falta de stock sin avisar.
- **Aislar la ventana temporal** primero; separar problemas **macro** (toda la cuenta: presupuesto, landing, competidores, algoritmo) de
  **micro** (campaña: CTR, rebote, conversión). Herramientas: historial de cambios + informe por campaña/fecha, **GA4 para ver si
  bajan todos los canales** (si cae también orgánico → mercado/web, no Ads), Google Trends.

### 4.4 Brad Geddes / Adalysis: árboles de diagnóstico por KPI — VERIFICADO (leído; artículos de 2020)
Índice: https://adalysis.com/blog/category/ppc-management/performance-analyzer/
- **Conversiones y tasa de conversión** (25 feb 2020, https://adalysis.com/blog/kpi-monitoring-diagnosis-why-did-your-conversions-and-conversion-rate-change/):
  conversiones = clics × tasa de conversión. (1) aislar dónde está el cambio y empezar por el mayor; (2) comparar con el año anterior
  (si baja mes contra mes pero sube año contra año → estacionalidad); (3) **fecha de inicio** e **historial de cambios de 1-2 semanas
  antes**; cambios en la web o en cómo se cuentan conversiones; (4) subastas y anuncios de competidores; (5) palabras y términos:
  palabras top que pierden posición/impresiones, **términos servidos desde el grupo equivocado**, palabras duplicadas en grupos que
  convierten peor; (6) anuncios: cambios de formato RSA, impresiones que pasan de un anuncio a otro; (7) **rarezas**: negativas
  añadidas en la **MCC** (no salen en el historial de la cuenta), **puja automática que falla tras cambios de seguimiento**, scripts
  desbocados, enlaces rotos/404, mala prensa, **audiencias puestas como «segmentación» en Búsqueda** (reducen alcance).
- **CPC y coste** (13 ene 2020, https://adalysis.com/blog/kpi-monitoring-diagnosis-why-does-your-cpc-and-cost-change/): segmentar
  primero (marca/genérica/competencia, embudo, tipo de segmentación, dispositivo) porque el CPC medio mezcla. Ramas: (A) cambios de
  segmentación (efecto mezcla); (B) **cambios de puja, la causa más común**; con puja automática, un CPC muy cambiado suele reflejar
  cambios en tasa de conversión o valor; **«si el CPC sube un 25 % pero el CPA no cambia, el sistema funciona»**; (C) competidores
  (subastas: sube su tasa de parte superior o de superación); (D) nivel de calidad; (E) Display (Smart Pricing).
- Otros del mismo índice (no leídos): CTR (https://adalysis.com/blog/kpi-monitoring-diagnosis-why-does-your-ctr-change-over-time/),
  clics (https://adalysis.com/blog/kpi-monitoring-diagnosis-why-does-the-number-of-clicks-you-receive-change-over-time/), plantilla
  gratuita de Looker Studio «Performance Analyzer».
- No hay umbrales numéricos en estos artículos; son árboles cualitativos.

### 4.5 Árbol unificado para nuestro agente (síntesis propia, a validar)
1. **¿Es medición?** Caída a 0 o caída brusca en todas las campañas a la vez → seguimiento (cruzar GA4, GHL, rastreador SEO, estado de
   la etiqueta). Si sí → exclusión de datos (ver 1.7), no tocar pujas.
2. **¿Es mercado?** ¿Cae también el orgánico (impresiones de GSC) y Trends / año anterior? → estacionalidad o demanda.
3. **¿Es un cambio nuestro, del cliente o de Google?** Historial de cambios 1-14 días antes del inicio + registro de cambios de la web
   (módulo SEO) + cambios de Google (p. ej. 17 ago 2026, prioridad de canal).
4. **Descomposición:** conversiones = impresiones × CTR × tasa de conversión; impresiones = impresiones elegibles × cuota; cuota perdida
   → presupuesto o ranking; ranking → puja vs QS vs competidores (subastas).
5. **Dónde:** campaña → red (socios/Display) → dispositivo → zona → hora → término → anuncio → landing.
6. **¿Es ruido?** Comprobar que el volumen esperado de conversiones en la ventana basta (regla de Ani) antes de alertar; ±10 % con
   <7 días = no actuar.

---

## 5. España y otros idiomas

### 5.1 WhatsApp como conversión en Google Ads

- **Recursos de mensaje (message assets) — VERIFICADO (oficial):** https://support.google.com/google-ads/answer/14888522?hl=en y
  https://support.google.com/google-ads/answer/16669591?hl=en. Canales: **WhatsApp, SMS, Facebook Messenger, Zalo**. Solo en
  **Búsqueda y PMax**. Siguen **en beta**. Requisitos: buen historial de políticas, **vertical elegible**, **verificación de
  anunciante completada**, número activo de WhatsApp Business o SMS. Verticales sensibles no elegibles. Anunciantes nuevos: impresiones
  limitadas hasta acumular interacciones positivas. Al aprobarse, aparece automáticamente el objetivo de conversión **«Leads from
  Messages»**; en campañas nuevas, objetivo Leads → «Messages from your ads». **No se indica la lista de países** (NO VERIFICADO que
  esté disponible en España; hay hilos de la comunidad de Google de 2026 con «no me sale la opción de WhatsApp», lo que sugiere
  disponibilidad desigual).
- **Práctica local (opinión de expertos, VERIFICADO que lo publican):** separar niveles — **clic al botón** (micro, secundaria),
  **conversación iniciada**, **lead cualificado**, **venta** — y no contar cada clic como cliente; «la coincidencia temporal no
  demuestra identidad» (SEOMOS, 6 nov 2026, https://www.seomos.com/blog/medir-whatsapp-google-ads/). La vía con GCLID: guardarlo en
  campo oculto/cookie e **insertarlo en el mensaje prellenado o asociarlo al teléfono** antes de abrir WhatsApp, guardarlo en el CRM y
  subir la venta como conversión offline (Data Manager API desde el 15 jun 2026)
  (https://iskaliconsultoria.com/medir-ventas-whatsapp-google-ads-meta-ads/, 23 oct 2026; es de México, no de España). Otras guías
  españolas de 2026 (migoramarketing.es, carlosgarciamarketing.com, 14 nov 2026) solo cubren el clic con GTM (extractos, NO VERIFICADO).
- OnlySEM cuenta como conversión «llamada, mensaje de WhatsApp o formulario» (https://onlysemagency.com/datos-campanas-google-ads-espana/):
  la práctica habitual en España es **optimizar al clic de WhatsApp**, lo que infla conversiones. → oportunidad clara para nosotros.
- RGPD: ninguna fuente leída trata el consentimiento para pasar el teléfono hasheado (conversiones mejoradas) desde WhatsApp. NO
  VERIFICADO; consultarlo antes de construir.

### 5.2 Costes y benchmarks en España (datos con fuente)

- **CPC estimado por búsqueda (Keyword Planner vía DataForSEO, España, sep 2026)** — https://georgegrowth.com/google-ads/precios/
  (VERIFICADO que lo publican; son estimaciones de Google): «reformas integrales» 5.400 búsq./mes, CPC 4,32 €; «abogado divorcio» 1.900,
  4,32 €; «fontanero urgente» 1.000, 4,68 €; «mudanzas» 12.100, 7,42 €; «academia de inglés» 9.900, 3,48 €; «clínica estética» 8.100,
  2,10 €; «alarmas para casa» 8,57 €; «placas solares» 3,83 €; «gestoría autónomos» 12,32 €; «seguro de coche» 12,36 €.
- **CPA reales de una agencia española (OnlySEM)** — https://onlysemagency.com/datos-campanas-google-ads-espana/ (datos propios de la
  agencia, no auditados): reformas integrales Madrid CPA 18,49 €, CTR 6,90 %; abogado de familia Sevilla 11,53 €; psicología Barcelona
  12,55 €; fontanería 24 h Madrid 10,33 €; climatización Valencia 9,44 € («estacional»). Agregado 1 nov 2025-2 nov 2026, 51 cuentas:
  **pintura/reformas/multiservicios 7,59 €/conv (rango 6,05-44,80)**, **fontanería 14,56 €**, **electricistas 26,50 €**. Ojo: conversión =
  llamada/WhatsApp/formulario, no cliente.
- Rangos genéricos en blogs: CPC local 0,30-3 € (jaimegarrido.marketing, 15 sep 2026), legal 5-10 €+ (summummarketing.es, may 2026).
  Extractos; NO VERIFICADO.

### 5.3 Estacionalidad española por sector — NO se encontraron datos públicos sólidos

- Las páginas que prometen estacionalidad por sector (p. ej. https://contextera.es/seo/estacionalidad-clinicas) **no dan meses ni
  cifras**: «no existe un calendario universal para todas las clínicas»; recomiendan comparar periodos equivalentes con el histórico
  propio. VERIFICADO (leído).
- **Conclusión práctica:** la estacionalidad hay que **calcularla nosotros**: (a) volumen mensual de 12-24 meses por palabra con DataForSEO
  (`monthly_searches` de Keyword Planner), que ya pagamos en el módulo SEO; (b) impresiones de GSC por cliente (ya guardadas a diario);
  (c) histórico de Google Ads por cuenta. Con eso se construye un índice estacional por sector y zona (reformas, clínicas, abogados,
  academias) mejor que cualquier publicación. Hipótesis a comprobar con datos (NO VERIFICADO): academias con picos en sep y ene;
  reformas con pico ene-mar y caída en agosto; clínicas estéticas con picos pre-verano; climatización con picos jun-jul y nov-dic;
  agosto bajo en casi todos los servicios B2C locales.

### 5.4 Agencias y comunidad en español

- Lista oficial de **Google Partner Premier 2026 en España** recogida por Marketing4eCommerce y Enrique Osnola (Adgoritmo, AdGuido,
  Adsmurai, Advent, Marketalia, Artefact, BIGSEO, Carat, ClickOnline 360…) (extractos de Google, NO VERIFICADO el listado completo).
  Rankings de blogs: Making Science, Adsmurai, Elogia, Labelium, Webimpacto, Pixelclip (mejores-agencias.com; marketing4ecommerce.net).
- **Herramientas españolas:** no se encontró ninguna SaaS española de auditoría/alertas de Google Ads para agencias. Lo más cercano:
  **Adsmurai Marketing Platform** (Barcelona; plataforma de medios y datos, orientada a grandes cuentas/social) y comparativas en español
  de herramientas extranjeras (theoptimizer.io, dynares.ai). → **Hueco de mercado en español** (VERIFICADO solo como «no encontrado»).
- Vídeos en español 2026 sobre WhatsApp en Google Ads (Alan Valdez, Raúl Adsual) — no leídos (YouTube sin transcripción accesible).

### 5.5 Alemán, francés y portugués

- **Alemán:** Martin Röttgerding (Head of SEA de **Bloofusion**, blog Internetkapitäne) es la referencia técnica alemana (query sculpting
  en Shopping, personalizadores) (bloocon.de, smarter-ecommerce.com; extractos). No se encontró material nuevo de 2026 sobre
  monitorización/alertas; PPC-Blog y OMR no dieron resultados útiles en esta búsqueda. NO VERIFICADO / sin cubrir.
- **Francés:** Abondance cubre sobre todo SEO; blogs SEA (thibaultfayol.com «CTR moyen par secteur 2026», tactee.fr) sin reglas nuevas
  leídas. Sin cubrir en profundidad.
- **Portugués (Brasil)** — rutina de un «gestor de tráfego» con umbrales concretos (https://nexusgrowth.com.br/blog/google-ads/rotina-otimizacao-google-ads,
  17 feb 2026; opinión de agencia, VERIFICADO que lo publica):
  - Semanal: campaña que **gasta el 100 % del presupuesto antes de las 14 h** = problema; gasta solo 60-70 % = investigar. **CPA ±15 % vs 7
    días = normal; >30 % = bandera roja.** Negativas: términos con **0 conversiones y ≥20 clics o CPA > 2× objetivo**; nuevas palabras:
    términos con **≥3 conversiones y CPA < objetivo** (5-10 por semana).
  - Quincenal: comparar 14 días contra 14 previos; ajustes por hora +20/+50 % y −30/−50 %; **cuota perdida por ranking >30 %** = calidad o
    puja; **por presupuesto >20 %** = falta presupuesto; PageSpeed móvil >90; **aprendizaje: <14 días no tocar; a los 21 días aún en
    aprendizaje = investigar**; tCPA/tROAS fuera de objetivo >2 semanas → cambiar como mucho **20 %** y esperar 2 semanas.
  - Mensual: subidas de presupuesto de 20-30 % seguras, nunca >50 % de golpe.
  - Afirmación «cada punto de QS reduce el CPC hasta un 16 %»: NO VERIFICADO.
- Ciclicko (Brasil, https://ciclicko.com.br/blog/como-otimizar-campanha-google-ads/): checklist de 11 puntos anclado a la ayuda oficial;
  datos oficiales citados: aprendizaje de 7-14 días; gasto diario de hasta 2× el presupuesto y 30,4× al mes; ≥2 RSA buenas por grupo.

---

## 6. Herramientas que quedaron sin cubrir

- **LeadsRx — CERRADA.** Su web dice que «LeadsRx has closed» y el servicio dejó de estar disponible el **30 oct 2026**; pide retirar sus
  scripts del GTM (https://www.leadsrx.com/). VERIFICADO. (Atribución multitoque; descartada como referencia viva.)
- **Hyros** (https://hyros.com/): atribución que cruza ventas con anuncios y **devuelve a Meta y Google las ventas que no vieron**;
  sincronización con CRM; seguimiento de llamadas B2B; **sistema de puntuación de calidad de llamadas** por anuncio/fuente; modelos de
  atribución ponderados (p. ej. 20/30/50) y LTV a 90 días. Precios solo con demo. Cifras de mejora del propio vendedor (sin verificar).
  Público: e-commerce, SaaS, infoproductos, B2B por llamada, agencias.
- **Factors.ai** (https://www.factors.ai/): B2B, identificación de cuentas, atribución primer/último toque e «influencia» (modelo
  multitoque de jun 2026), «Google Adpilot» y «LinkedIn Adpilot»; no detalla envío de etapas a Google Ads. Poco aplicable a pymes locales.
- **Bïrch (antes Revealbot)** (https://www.bir.ch/): sobre todo **social** (Meta, TikTok, Snapchat); reglas con condiciones anidadas, métricas
  propias, **comparar contra la semana anterior o el top 10**, ejecución cada **15 min**, multi-cuenta; **Birch AI convierte una petición en
  lenguaje natural en una regla revisable antes de activarse**; Routines; **Birch MCP** para conectar asistentes como Claude. Google Ads:
  hay página pero no se describe en la portada.
- **AdsGency AI**: plataforma de IA que genera creatividades y automatiza campañas multicanal (resúmenes de coldiq.com, airframe.ai,
  gethookd.ai; extractos de Google, NO VERIFICADO; la web no dio texto).
- **Adobe Advertising Search, Social & Commerce** (https://experienceleague.adobe.com/en/docs/advertising/search-social-commerce/intro/about):
  optimización de pujas y presupuestos **por cartera** con enfoque de teoría de carteras; simulaciones predictivas del punto óptimo de gasto;
  informes de precisión de previsión; herramienta de recomendación de reparto de presupuesto; usa conversiones de su píxel, Adobe Analytics,
  Google Ads, GA y fuentes propias. Su **registro de cambios** guarda valores antiguo/nuevo, usuario y fecha (contentgrip.com). Nuevo
  «Custom Algorithms» que entrena pujas con datos brutos de Adobe Analytics (metodoviral.com, 7 oct 2026, extracto, NO VERIFICADO). Enterprise.
- **Registro de decisiones de campaña** (ContentGrip, 1 nov 2026, https://www.contentgrip.com/ai-ad-change-management/): con plataformas que
  cambian solas, la agencia debe registrar qué autorizó, qué puede cambiar la plataforma sin nueva aprobación, actor, valor antes/después,
  motivo, responsable y techo de gasto, **línea base y fecha de revisión**, y vía de vuelta atrás; aprobación proporcional a la consecuencia.
  Menciona (28 oct 2026) que campañas de Búsqueda, Shopping y PMax pueden entrar en **AI Mode** por la subasta normal, con informes solo
  agregados. NO VERIFICADO en fuente de Google.

---

## Ideas para nuestro módulo

1. **Acceso API sin esperar al «token de la MCC»:** crear el proyecto de Cloud, habilitar la API (Test), pedir **Explorer** (automático) y
   después **Basic** (verificación de marca). Cuenta de servicio añadida **en la MCC** (límite de 20 cuentas por email) con acceso estándar o
   de solo lectura. Presupuestar operaciones: Explorer = 2.880/día.
2. **Subidor propio por Data Manager API** desde GoHighLevel: etapas «lead cualificado» y «venta», con GCLID/gbraid/wbraid + email/teléfono
   hasheados; **una acción con nombre único por cuenta**, nunca lotes multi-cuenta; tabla de envíos con respuesta; **conciliador** diario de
   «aceptadas por Google vs enviadas» (el «#OK» no vale) y alerta de % de leads sin GCLID.
3. **Detector de efectos de cambios de Google**: calendario de cambios de plataforma (17 ago 2026 tCPA/tROAS limitadas; prioridad de canal
   oct 2026 → migración de Display Expansion en feb 2027; AI Mode) que el diagnóstico consulta antes de culpar a la cuenta.
4. **Reglas concretas nuevas:** tCPA limitada por presupuesto con CPA real muy por debajo del objetivo; socios/Display en prioridad Alta en
   campañas de leads; tCPA con <15 conv/30 días (riesgo) y evaluación con ≥30; exclusión de datos con fechas calculadas (inicio − retraso de
   conversión; ≥90 % de clics; no rellenar; si se rellena, ≥5 días después).
5. **Árbol de diagnóstico** de 4.5 (medición → mercado → cambios → descomposición → dónde → ruido) con el cruce que solo nosotros tenemos:
   GSC/GA4/GHL/rastreador/registro de cambios de la web.
6. **Priorización y descarte con motivo** (contra la queja nº 1 de TrueClicks/Opteo): cada hallazgo con impacto estimado en € y leads, una
   cola corta por cuenta, y «no aplica porque…» que no penaliza ninguna nota y enseña al agente.
7. **Contexto de negocio en las sugerencias de palabras** (contra «Opteo no entiende el contexto»): filtrar por servicios y zona de la ficha y
   por el mapa de embeddings del módulo SEO.
8. **Barreras ante cambios masivos**: tope de cambio por regla (p. ej. ±20 % en objetivos, como la rutina brasileña), vista previa con
   cuentas afectadas y registro de decisiones con línea base, fecha de revisión y vuelta atrás (modelo ContentGrip).
9. **WhatsApp bien medido**: clic de WhatsApp como secundaria; conversación/lead cualificado/venta desde GHL como primaria; GCLID en el mensaje
   prellenado; revisar disponibilidad de recursos de mensaje en España y su objetivo «Leads from Messages».
10. **Índice estacional propio por sector y zona** con DataForSEO + GSC + histórico de Ads, para que «bajan las conversiones en agosto» no
    dispare alarmas y para planificar presupuestos.
11. **Interfaz en español y para pymes de servicios**: no hay herramienta española equivalente.

## Lo que nadie hace bien

- **Cerrar el ciclo CRM → Google Ads con etapas reales y conciliación**: GHL nativo no envía etapas ni email; las herramientas PPC no
  concilian lo aceptado; Google admite que «#OK» no significa contado y que puede contar en cuentas ajenas.
- **Priorizar entre muchas cuentas** sin abrumar ni empujar a cambios por «subir la nota».
- **Distinguir medición rota de caída real** cruzando fuentes externas a Google Ads.
- **Contexto de negocio** (servicio, zona, capacidad, estacionalidad local) en las recomendaciones.
- **Medición de WhatsApp más allá del clic** en España.
- **Registro de decisiones** con hipótesis, línea base y fecha de revisión (solo Adobe tiene un registro de cambios, y sin el porqué).

## Lo no verificado (resumen)

- Cuotas de la Data Manager API; que una cuenta de servicio sin verificación OAuth baste en producción para subir conversiones.
- Que la acción nativa de HighLevel siga funcionando para todas las subcuentas tras el 15 jun 2026 (indicios a favor, sin confirmación
  oficial de HighLevel); que «Pipeline stage changed» funcione con «Add to Google Ads» (la ayuda oficial dice que no).
- El anuncio del 26 mar 2026 sobre mejoras de la importación offline (leído solo a través de SEL).
- Disponibilidad de los recursos de mensaje de WhatsApp en España.
- Precios de Optmyzr/Opteo/Adalysis (citados por competidores).
- Estacionalidad española por sector (hipótesis sin datos).
- AI Mode en campañas desde el 28 oct 2026 (solo vía ContentGrip). Custom Algorithms de Adobe.
- «Cada punto de QS reduce el CPC hasta un 16 %».

## Fuentes principales

- https://developers.google.com/google-ads/api/docs/api-policy/developer-token
- https://developers.google.com/google-ads/api/docs/api-policy/access-levels
- https://developers.google.com/google-ads/api/docs/oauth/service-accounts
- https://developers.google.com/data-manager/api/get-started/set-up-access
- https://searchengineland.com/google-ads-may-count-offline-conversions-in-the-wrong-accounts-500544
- https://support.google.com/google-ads/answer/18385152?hl=en · https://support.google.com/google-ads/answer/7193800?hl=en
- https://support.google.com/google-ads/answer/17061251?hl=en · https://support.google.com/google-ads/answer/17125145?hl=en
- https://support.google.com/google-ads/answer/6268632?hl=en
- https://support.google.com/google-ads/answer/10370710?hl=en · https://support.google.com/google-ads/answer/10276486?hl=en
- https://support.google.com/google-ads/answer/14888522?hl=en · https://support.google.com/google-ads/answer/16669591?hl=en
- https://help.gohighlevel.com/support/solutions/articles/155000003368-workflow-action-add-to-google-ads
- https://help.gohighlevel.com/support/solutions/articles/155000005431-ad-manager-create-manage-google-ads-offline-conversions
- https://help.gohighlevel.com/support/solutions/articles/48001220947-how-to-set-up-google-ads-offline-conversion-actions-google-platform-side-setup-
- https://hlgrowthpartner.com/post/gohighlevel-google-ads-conversion-tracking-2026 · https://scalewithhunaid.com/guides/gohighlevel-google-ads-conversions-not-working · https://ghlprime.com/blog/gohighlevel-google-ads
- Capterra: https://www.capterra.com/p/156308/Optmyzr/reviews/ · https://www.capterra.com/p/153001/Opteo/reviews/ · https://www.capterra.com/p/173311/Adalysis/reviews/ · https://www.capterra.com/p/213461/TrueClicks/reviews/
- https://www.tryatria.com/blog/optmyzr-reviews · https://groas.com/post/optmyzr-vs-opteo-vs-adalysis-three-recom (competidores)
- https://searchengineland.com/ppc-diagnostics-low-conversions-450710 · https://searchengineland.com/google-ads-performance-drops-recover-444357 · https://searchengineland.com/ppc-root-cause-analysis-396427
- https://adalysis.com/blog/kpi-monitoring-diagnosis-why-did-your-conversions-and-conversion-rate-change/ · https://adalysis.com/blog/kpi-monitoring-diagnosis-why-does-your-cpc-and-cost-change/
- https://georgegrowth.com/google-ads/precios/ · https://onlysemagency.com/datos-campanas-google-ads-espana/ · https://contextera.es/seo/estacionalidad-clinicas
- https://www.seomos.com/blog/medir-whatsapp-google-ads/ · https://iskaliconsultoria.com/medir-ventas-whatsapp-google-ads-meta-ads/
- https://nexusgrowth.com.br/blog/google-ads/rotina-otimizacao-google-ads · https://ciclicko.com.br/blog/como-otimizar-campanha-google-ads/
- https://www.leadsrx.com/ · https://hyros.com/ · https://www.factors.ai/ · https://www.bir.ch/ · https://experienceleague.adobe.com/en/docs/advertising/search-social-commerce/intro/about · https://www.contentgrip.com/ai-ad-change-management/


