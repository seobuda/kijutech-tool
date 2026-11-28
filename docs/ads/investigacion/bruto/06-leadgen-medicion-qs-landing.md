# 06 — Google Ads para lead generation: medición, calidad del lead, nivel de calidad y landing

**Investigador:** consultor PPC (lead gen de servicios y negocios locales) + CRO
**Fecha:** 28 nov 2026
**Ámbito:** de la medición (qué se cuenta como conversión) a la landing (el «otro 50 %»), pasando por la calidad real del
lead, el nivel de calidad (Quality Score) y las particularidades de negocio local en España.

> **Aviso de método.** Durante esta investigación se agotó el cupo de búsquedas web de la sesión (compartido con los otros
> investigadores). Lo que viene de una página leída en esta sesión lleva su URL. Lo que procede de conocimiento previo del
> sector y no he podido volver a comprobar hoy va marcado **[no verificado hoy]**. Distingo: **[Hecho Google]** (documentación
> oficial), **[Dato]** (estudio con cifras), **[Opinión experto]**, **[Anécdota]** (caso aislado, foro o proveedor que vende
> la solución).

---

## Resumen (lo esencial en 15 líneas)

1. En lead gen, **el mayor fallo no está en las pujas, sino en qué se le dice a Google que es una conversión**. Si se cuenta
   cada envío de formulario (incluido spam) y cada llamada de 30 s, Smart Bidding aprende a traer más de eso.
2. Google empuja con fuerza hacia **conversiones mejoradas para leads (EC4L) + importación desde CRM**: desde abril 2026 «web»
   y «leads» son un solo interruptor, y desde el **15 jun 2026** las subidas offline van por la **Data Manager API**, no por la
   API de Google Ads ([Google](https://support.google.com/google-ads/answer/14274408?hl=en)). Esto afecta directamente a nuestro módulo.
3. GoHighLevel tiene una acción de workflow **«Add to Google Ads»** que manda conversiones por API, pero **solo si el contacto
   tiene GCLID/GBRAID/WBRAID guardado**; el fallo típico es que el GCLID se pierde en redirecciones, iframes y funnels multipaso.
4. Las metas «lead cualificado» / «lead convertido» **activan protecciones contra tráfico inválido específicas de lead gen**
   ([Google](https://support.google.com/google-ads/answer/13489421?hl=en)). Mínimo 15 conversiones/30 días para pujar a ellas.
5. Spam de formularios en PMax/Display/Search Partners: no hay estudio independiente con un % global; solo anécdotas (88,9 %
   de leads basura en un caso). Hay que **medirlo por cuenta cruzando con el CRM**.
6. El **Quality Score visible NO entra en la subasta** (Google lo dice textualmente); es un diagnóstico. La fórmula visible
   reconstruida por Adalysis/Geddes: `QS = 1 + LPE (0/1,75/3,5) + Relevancia (0/1/2) + CTR esperado (0/1,75/3,5)`.
7. Usar el **QS ponderado por impresiones** (y por coste) en vez de la media simple; priorizar grupos con mucho gasto y
   componentes «por debajo de la media».
8. La landing pesa: en lead gen B2B, una página que carga en 1 s convierte **3 veces** más que una de 5 s
   ([Portent 2022](https://www.portent.com/blog/analytics/research-site-speed-hurting-everyone.htm)); 0,1 s menos de carga
   móvil subió un **21,6 %** el paso de formulario a envío en lead gen (Deloitte/Google).
9. **AI Max (Final URL expansion)** puede mandar el tráfico a cualquier página del dominio y salta los anuncios fijados
   (pinned): para lead gen hay que vigilar a qué URL llega el tráfico y excluir blog/legales.
10. Referencias 2026 LocaliQ/WordStream (EE. UU., Google+Microsoft): CPC medio 5,42 $, CTR 6,64 %, CR 8,18 %; dentistas CR
    10,67 % y CPL 72,97 $; reformas CR 8,05 % y CPL 90,92 $; abogados CPC 9,87 $ y CPL 131,63 $. **No hay benchmark público
    fiable por sector para España**; lo correcto es construir el nuestro con 25+ cuentas.
11. Los números de desvío de Google (call reporting) **sí existen en España**; las «AI-qualified call leads» (la IA escucha la
    grabación y decide si la llamada es un lead) **solo en EE. UU./Canadá** de momento.
12. Local Services Ads **existen en España** desde 2020 para servicios del hogar (no para abogados ni clínicas); cerrajeros
    prohibidos en España desde nov 2024.
13. Hueco de mercado claro: **nadie cruza de forma automática término de búsqueda → anuncio → landing → lead del CRM → venta**
    con texto real de la landing y embeddings. Nosotros ya tenemos casi todas las piezas.

---

## 1. Medición en lead gen

### 1.1 Acciones de conversión primarias y secundarias

- **[Hecho Google]** La columna «Conversiones» solo suma acciones marcadas como **primarias**, con su método de recuento; las
  secundarias solo se observan («Todas las conversiones»)
  ([Google, recuento](https://support.google.com/google-ads/answer/3438531?hl=en)).
- **[Hecho Google]** Recuento: «Una» (una por clic) se recomienda para leads; «Cada una» para ventas. Las importadas vienen por
  defecto en «Cada una» ([Google](https://support.google.com/google-ads/answer/3438531?hl=en)). → En lead gen, si un usuario
  manda el formulario dos veces o recarga la página de gracias, con «Cada una» se duplica.
- **[Hecho Google]** Para evitar duplicados al migrar de UA a GA4, Google pide marcar la acción vieja como secundaria
  ([Google](https://support.google.com/google-ads/answer/12495138?hl=en)). La regla general: **una sola fuente primaria por
  evento real** (o la etiqueta de Ads, o la importación de GA4, nunca ambas primarias).
- **[Hecho Google]** Google recomienda **elegir UNA meta de conversión alineada con el negocio y no optimizar a la vez a
  metas de varias etapas del embudo**; preferir una conversión que ocurra en los **7 días** siguientes a la interacción
  ([Google, leads de calidad](https://support.google.com/google-ads/answer/13489421?hl=en)).
- **[Hecho Google]** En PMax lead gen: «puja hacia una sola etapa del embudo dentro de una estrategia tCPA», para evitar pujas
  duplicadas ([Google PMax lead gen](https://support.google.com/google-ads/answer/13775965?hl=en)).

**Esquema recomendado para una cuenta de servicios (consenso de práctica, [Opinión experto]):**

| Evento | Fuente | Primaria | Recuento | Valor |
|---|---|---|---|---|
| Formulario enviado (válido, tras antispam) | Etiqueta Google/GTM + EC4L | Sí al principio; secundaria cuando haya ≥15 cualificados/30 días | Una | Valor estimado del lead |
| Llamada desde anuncio ≥ X s | Google forwarding number | Sí | Una | Valor estimado |
| Llamada al número de la web ≥ X s | Website call conversion (DNI) | Sí | Una | Valor estimado |
| Clic en teléfono / WhatsApp / chat | Etiqueta | **No** (secundaria, micro-conversión) | Una | 0 |
| Lead cualificado (CRM) | Importación / Data Manager | Sí cuando haya volumen | Una | Valor por etapa |
| Cita / Venta (CRM) | Importación | Sí o secundaria según volumen | Una / Cada una | Valor real |

El clic en WhatsApp **no** es un lead: es intención. Contarlo como primaria infla conversiones y lleva a Smart Bidding a
optimizar a clics fáciles. Lo mismo el clic en `tel:` en móvil: Google lo trata como tipo aparte («clics en un número en tu
web móvil»: solo cuenta el clic, no la llamada)
([Google, conversiones de llamada](https://support.google.com/google-ads/answer/6100664?hl=en-GB)).

### 1.2 Llamadas

**[Hecho Google]** Cinco tipos de conversión de llamada
([Google](https://support.google.com/google-ads/answer/6100664?hl=en-GB)):
1. Llamadas desde anuncios (extensión/recurso de llamada) — requiere *call reporting* (números de desvío de Google).
2. Llamadas a un número de la web — Google tag + fragmento de evento para «website call conversion» (inserción dinámica de
   número para usuarios que llegan de un clic de anuncio).
3. Clics en un número de la web móvil — solo el clic.
4. Clics en anuncios/recursos de llamada sin número de desvío — Google **estima** si hubo una llamada significativa.
5. Importación de llamadas desde un CRM / sistema de seguimiento.

- **[Hecho Google]** Duración mínima: la fija el anunciante; **por defecto 60 s** (anuncio de 2018 recogido en la ayuda,
  [Google](https://support.google.com/google-ads/answer/6095882)). Las llamadas más cortas no cuentan.
- **[Hecho Google]** Los números de desvío de Google **están disponibles en España** (lista de 29-30 países que incluye
  España, Portugal, Francia, Italia, Alemania, Reino Unido…). El número del llamante se muestra en llamadas de más de 15 s
  (salvo India) ([Google, países](https://support.google.com/google-ads/answer/2454052?hl=en-GB)).
- **[Hecho Google, novedad 2025-2026]** **AI-qualified call leads**: con la grabación activada, la IA de Google escucha cada
  llamada y solo cuenta como conversión las que son lead real (pregunta por servicios, pide cita…), filtra robots, spam y
  equivocaciones, y añade resumen y etiquetas (#HighIntent). Si no se puede grabar, cae al umbral de duración. **La grabación
  solo funciona si ambos números están en EE. UU. o Canadá**; la grabación está activada por defecto salvo en salud y
  finanzas ([Google](https://support.google.com/google-ads/answer/16913326)). → En España hoy no aplica, pero marca la
  dirección: «calificar la llamada por su contenido, no por su duración». Nosotros podemos hacerlo nosotros mismos si el
  cliente graba con su centralita o con GHL (ver ideas).

**Umbral de duración práctico [Opinión experto / no verificado hoy]:** 60 s es razonable para servicios con presupuesto
(reformas, abogados); 30-45 s para negocios donde la llamada es corta y decisiva (cerrajeros, taxis, urgencias). La forma
correcta de fijarlo es con datos: distribución de duraciones de llamada en el CRM/centralita frente a si acabó en cita.
Ejemplo de regla para el agente: *«el X % de llamadas que acaban en cita duran > N s; el umbral actual cuenta como
conversión llamadas de < N s que nunca acaban en cita → subir el umbral»*.

### 1.3 Formularios, WhatsApp y chat

- **Formularios:** la conversión debe dispararse **tras la validación del servidor**, no al pulsar «Enviar» ni al cargar
  `/gracias`. Google recomienda reCAPTCHA, doble opt-in o validación en servidor
  ([Google](https://support.google.com/google-ads/answer/13489421?hl=en)). Si el spam se bloquea **antes** de que dispare la
  etiqueta, PMax deja de aprender de él ([Search Engine Land, PMax lead gen](https://searchengineland.com/why-performance-max-lead-generation-fails-make-it-work-393038)).
- **Formularios de lead (lead form assets) dentro de Google:** existen en Search, PMax, Video y Display
  ([Google](https://support.google.com/google-ads/answer/13489421?hl=en)); se pueden añadir preguntas de cualificación. Suelen
  dar más volumen y peor calidad que la landing [Opinión experto, no verificado hoy]; Peter Bowen recordaba en 2022 que todas
  las comprobaciones antispam ocurren **después de haber pagado el clic**
  ([SERoundtable](https://seroundtable.com/google-ads-decreasing-invalid-leads-34272.html)).
- **WhatsApp:** en España es el canal principal de muchos negocios locales. El clic a `wa.me` es medible como evento, pero
  la conversación ocurre fuera de la web. La forma de cerrar el circuito es que el número de WhatsApp esté integrado en el
  CRM (GHL tiene canal de WhatsApp) y que el primer mensaje lleve un identificador (p. ej. texto prellenado con un código
  corto ligado al GCLID guardado en una cookie), para luego importar «conversación con lead real» con el GCLID o con el
  teléfono (EC4L acepta teléfono). **[No verificado hoy]**: no he podido confirmar en esta sesión el estado de los «message
  assets» de WhatsApp en Google Ads para España.

### 1.4 Conversiones mejoradas para leads (EC4L) e importación offline

**[Hecho Google]** Estado a noviembre 2026 ([Google, upgrade OCI](https://support.google.com/google-ads/answer/14274408?hl=en);
[Google, EC4L](https://support.google.com/google-ads/answer/15713840?hl=en)):
- **Abril 2026:** conversiones mejoradas para web y para leads se fusionan en **un solo ajuste**; Google acepta a la vez datos
  de la etiqueta, de Data Manager y de API.
- **15 junio 2026:** la importación offline (OCI) y las subidas de EC4L **migran a la Data Manager API** y quedan bloqueadas en
  la API de Google Ads. Los tokens de desarrollador sin peticiones de enero a junio de 2026 **no entran en la lista de acceso
  heredado**. → **Para nuestro módulo:** cuando tengamos el token de la MCC, la subida de conversiones desde el CRM debe
  diseñarse contra la **Data Manager API**, no contra `ConversionUploadService` de la API de Ads. (A confirmar con la
  documentación de developers en el momento de construir.)
- **Campos obligatorios:** GCLID **o** dato de usuario (email, teléfono o dirección, normalizados y con hash SHA-256 según la
  política), nombre de la conversión, hora de la conversión, meta (lead cualificado / convertido).
- **Recomendados:** GCLID aunque se use dato de usuario; **order ID** (para deduplicar y para ajustes posteriores);
  valor y moneda; **consentimiento** («muy recomendado»: sin él la conversión puede no atribuirse); GBRAID/WBRAID cuando
  existan.
- **Hay que subir TODAS las conversiones del evento, también las que no vienen de Google Ads** (requisito para que EC4L
  funcione) ([Google](https://support.google.com/google-ads/answer/15707550?hl=en)).
- **Frecuencia:** idealmente **diaria** ([Google](https://support.google.com/google-ads/answer/13489421?hl=en)).
- **Migración:** mantener OCI y EC4L en paralelo **1-2 ciclos de conversión o 4 semanas (lo que sea mayor)**, luego pasar la
  nueva a primaria y la vieja a secundaria; si suben las conversiones, revisar el tCPA/tROAS.
- **Ventana de Data Manager:** algunas fuentes reimportan los últimos **90 días** en cada ejecución; BigQuery, los últimos 14.
- **Diagnóstico:** informe de diagnóstico de EC4L en Objetivos → Resumen.

**GCLID / GBRAID / WBRAID [Hecho Google + no verificado hoy en detalle]:** el GCLID requiere auto-etiquetado activo
([Google](https://support.google.com/google-ads/answer/7012522)). GBRAID y WBRAID aparecen en clics de iOS (tras ATT) en lugar
del GCLID: WBRAID para conversiones web que vienen de clics en apps iOS, GBRAID para conversiones de app desde web. Solo admiten
recuento «Cada una» (lo confirma también la ayuda de GHL, más abajo). Una fila de importación no puede llevar GCLID y GBRAID a
la vez **[no verificado hoy]**. Consecuencia práctica: **un formulario que solo guarda `gclid` pierde los leads de iPhone que
llegan con `wbraid`**. Hay que guardar los tres.

**Ajustes de conversión [no verificado hoy]:** se pueden retractar o reexpresar conversiones ya subidas (por order ID o
GCLID+hora). Útil para «este lead era spam» → retractar, de modo que el algoritmo deje de aprender de él.

### 1.5 GoHighLevel: cómo se hace

**[Hecho, ayuda de HighLevel (espejo freshdesk)]**
([HighLevel – Add to Google Ads](https://gohighlevelassist.freshdesk.com/support/solutions/articles/155000003368-workflow-action-add-to-google-ads)):
- Se conecta Google Ads en *Settings → Integrations* de la subcuenta y se elige la cuenta.
- La acción de conversión **debe existir antes en Google Ads**; el nombre tiene que coincidir **exactamente** (mayúsculas,
  espacios, puntuación).
- La acción de workflow **«Add to Google Ads»** envía la conversión por API (sin Zapier). Campos: conversión, moneda, valor
  (p. ej. 100 por una revisión dental), y un *custom mapping* opcional para mapear GCLID/GBRAID/WBRAID desde campos propios.
- El contacto **debe tener guardado GCLID, GBRAID o WBRAID**; si no, la ejecución sale como *Skipped* en *Execution Logs*.
  No hay modo de prueba.
- Disparadores admitidos según el FAQ: envío de formulario, compra, llamada de *number pool* (Call Status), encuesta, chat
  (Customer Replied con canal Chat Widget). **El artículo no menciona «Opportunity Stage Changed»** — es decir, no queda claro
  que se pueda mandar «lead cualificado» o «venta» al mover la oportunidad de etapa en el pipeline. **[No verificado]**;
  hay que probarlo en una subcuenta. Si no funciona, la alternativa es leer el pipeline de GHL desde nuestra herramienta
  (ya tenemos la conexión) y subir nosotros la conversión vía Data Manager.
- Nota: el artículo dice que GBRAID/WBRAID son «para campañas de app»; eso es inexacto (son identificadores de clics de iOS),
  pero lo relevante es que **solo admiten conversiones «Many per click»**.

**Por qué GHL pierde el GCLID [Proveedor que vende la solución, CustomerLabs]**
([CustomerLabs](https://www.customerlabs.com/blog/gohighlevel-google-ads-conversion-tracking-missing-gclid-fix)):
- **Funnels multipaso:** el `?gclid=` desaparece entre páginas si nadie lo pasa adelante.
- **Iframes:** el formulario/calendario embebido no ve la URL ni las cookies de la página madre.
- **Redirecciones** (http→https, sin www→www, enlaces cortos): un 301/302 suele eliminar el parámetro.
- **Formularios nativos** que solo leen la URL en el momento del envío.
- **Calendarios** con redirección.
- Arreglo: script en todas las páginas de aterrizaje que lea `gclid`/`gbraid`/`wbraid` al llegar, lo guarde (cookie/
  localStorage de primera parte) y lo inyecte en campos ocultos del formulario o del iframe; y ligar el click ID a email y
  teléfono del contacto para poder mandar la conversión semanas después.

**Comprobación que nuestro agente puede hacer con datos:** % de contactos de GHL con `utm_source=google` / `gclid` relleno
frente a clics de Ads del mismo periodo; % de ejecuciones *Skipped*; leads del CRM con origen «Google Ads» sin click ID.

### 1.6 Embudo y valores

- **[Hecho Google]** Si se pueden asignar valores distintos a los leads: **value-based bidding** (Maximizar valor de
  conversión, con o sin tROAS) + **reglas de valor de conversión** por ubicación, dispositivo y audiencia. Si no: **tCPA a
  lead cualificado o convertido** ([Google](https://support.google.com/google-ads/answer/13489421?hl=en)). En PMax: tROAS
  realista; tCPA cerca del CPL máximo aceptable (demasiado bajo limita); sin datos suficientes, empezar con Maximizar
  conversiones ([Google PMax](https://support.google.com/google-ads/answer/13775965?hl=en)).
- **[Hecho Google]** Google habla de **«Lead Journey Mapping»**: mapear el camino lead → venta en la cuenta, con etapas,
  pasos no medidos, valores y retrasos ([Google](https://support.google.com/google-ads/answer/13489421?hl=en)). **[No
  verificado hoy]** cómo es la pantalla.
- **Cómo calcular el valor de cada etapa [Opinión experto, práctica estándar]:**
  `valor(etapa) = P(venta | etapa) × margen medio por venta`. Ejemplo clínica dental: venta media 1.800 €, margen 50 % →
  900 €; si de cada 10 leads cualificados 3 acaban en tratamiento, `valor(lead cualificado) = 0,3 × 900 = 270 €`; si de cada
  10 leads brutos 4 se cualifican, `valor(lead bruto) = 0,4 × 270 = 108 €`. Esto sale de los datos del CRM (GHL) y debe
  **recalcularse cada mes** por cliente.
- **Retraso de conversión:** si la venta tarda 30-90 días, optimizar a «venta» deja a Smart Bidding a ciegas; por eso Google
  pide una conversión en < 7 días. Patrón: optimizar a «lead cualificado» (rápido) con valor que anticipe la venta.

### 1.7 Consent Mode v2 en España / UE

- **[Hecho Google]** Impacto del modo de consentimiento = conversiones modeladas / observadas, por par dominio × país; se
  actualiza semanalmente; requiere ≥ 7 días completos implantado; se muestra 4 semanas desde el inicio del modelado; no se
  enseña si el aumento es < 1 % ([Google](https://support.google.com/google-ads/answer/11954524)).
- **[Hecho Google]** Umbral para modelar: **700 clics de anuncio en 7 días por país × dominio**
  ([Google, modelado](https://support.google.com/google-ads/answer/10548233)). → **La mayoría de nuestras cuentas locales
  NO llegan a 700 clics/semana**, así que en ellas **no habrá modelado**: lo que se pierde por rechazo de cookies se pierde.
  Esto refuerza EC4L + importación desde CRM (datos de primera parte del propio lead), que no dependen de la cookie.
- **Básico vs. avanzado:** en básico, si el usuario rechaza no se manda nada; en avanzado se mandan pings sin cookies que
  permiten modelar ([resumen de proveedor, iubenda/cookie-script](https://www.iubenda.com/en/blog/what-is-google-consent-mode/)).
  El «hasta 70 % de conversiones perdidas sin modo avanzado» es un **reclamo de proveedor sin fuente** (Cookiebot).
- **Caso Google:** TUI midió **+7 %** de conversiones con modo de consentimiento y modelado (caso de Google, no media del
  sector).
- **[No verificado hoy]** Desde marzo 2024 Google exige Consent Mode v2 (`ad_user_data`, `ad_personalization`) para usar
  audiencias/remarketing y medición personalizada con tráfico del EEE. La AEPD (guía de cookies de 2023) exige que el botón
  de rechazar esté al mismo nivel que el de aceptar, lo que en la práctica deja tasas de aceptación en España bastante por
  debajo del 100 % (no tengo cifra fiable española).
- **Qué hacer con datos:** comparar leads del CRM con conversiones de Ads por semana; si Ads ve sistemáticamente un 30-50 %
  menos que el CRM con origen Google, el problema es consentimiento/medición, no rendimiento.

### 1.8 Errores de medición típicos y cómo detectarlos con datos

| Error | Señal en los datos | Regla para el agente (propuesta) |
|---|---|---|
| Doble conteo (etiqueta Ads + importación GA4 ambas primarias) | Conversiones ≈ 2× leads del CRM; dos acciones primarias con volúmenes casi idénticos | Si dos acciones primarias tienen correlación diaria > 0,9 y ratio ≈ 1 → alerta «posible duplicado» |
| Página de gracias recargada / visitada directamente | Recuento «Cada una»; conversiones > envíos de formulario en el CRM; conversiones sin interacción | Ratio conversiones Ads / leads CRM (origen Google) > 1,2 durante 7 días |
| Conversión que dispara en clic del botón, no en envío válido | Tasa de conversión anormal (> 30-40 % en Search de servicios) | CR por campaña > p95 histórico de la cuenta o > 3× benchmark del sector |
| Spam de formularios | Picos nocturnos, nombres/emails basura, teléfonos con prefijo extranjero, tiempo de relleno < 3 s, leads de fuera de la zona | Leads CRM marcados «spam/no válido» por red (Search / Partners / Display / PMax) |
| Llamadas de 5-10 s contadas | Umbral de duración bajo; muchas conversiones de llamada sin cita | Distribución de duraciones vs. llamadas que acaban en cita |
| GCLID perdido | Contactos de GHL de Google sin click ID; *Skipped* en el workflow | % de leads Google sin GCLID > 20 % |
| Etiqueta rota tras cambio en la web | Conversiones = 0 con clics normales; estado «Etiqueta inactiva» | 2-3 días sin conversiones con clics ≥ media → cruzar con el **registro de cambios de la web** del módulo SEO |
| Conversiones de micro-acciones como primarias (clic WhatsApp, scroll, visita a contacto) | CPA artificialmente bajo, ventas planas | Acción primaria con categoría «página vista»/«otro» o sin valor |

Nota de fuente: estas reglas son **mías** (síntesis de práctica habitual); los umbrales concretos hay que calibrarlos con las
25+ cuentas.

---

## 2. Calidad del lead

### 2.1 Spam y fraude en lead gen

- **[Hecho Google]** Las metas de lead (lead cualificado, convertido, reservar cita, pedir presupuesto) **activan
  protecciones contra tráfico inválido creadas para lead gen**
  ([Google](https://support.google.com/google-ads/answer/13489421?hl=en);
  [PMax lead gen](https://support.google.com/google-ads/answer/13775965?hl=en)).
- **[Hecho Google, 2022]** Ginny Marvin (Google Ads Liaison) reconoció el problema de leads inválidos en PMax y recomendó
  validación en servidor, doble opt-in, reCAPTCHA y optimizar a «Qualified/Converted» con OCI o EC4L
  ([SERoundtable, 20 oct 2022](https://seroundtable.com/google-ads-decreasing-invalid-leads-34272.html)). Gordon Campbell
  sugería buscar y excluir las fuentes (Display/YouTube).
- **[Opinión experto]** Sin datos offline, PMax tiende a traer spam: si el spam cuenta como conversión, la campaña busca más
  usuarios parecidos al spam ([Search Engine Land](https://searchengineland.com/why-performance-max-lead-generation-fails-make-it-work-393038)).
  Recomiendan desactivar recursos automáticos a nivel de cuenta hasta tener medición offline.
- **[Opinión experto]** WordStream describe la red de **Search Partners** como «sitios mayoritariamente de baja calidad» y
  sugiere desactivarla cuando hay muchas impresiones, CPC muy bajos y leads malos
  ([WordStream](https://www.wordstream.com/blog/google-ads-lead-quality)). No es un estudio controlado.
- **[Dato secundario]** Adalysis: en 3.300+ campañas no retail, cuando Search y PMax podían entrar en los mismos términos,
  **Search tuvo mejor tasa de conversión el 84 % de las veces** (citado por HockeyStack; no he leído el original).
- **[Anécdotas de proveedores]** LeadGenius: 16 de 18 leads de Search eran bots o no cualificados (88,9 %); ClickCease:
  ~90 % de 200+ leads B2B inútiles; Kontrolit: en una PMax solo 1 de cada 10 contactados reconocía haber rellenado el
  formulario ([ClickCease](https://www.clickcease.com/blog/?p=10719); [Kontrolit](https://www.kontrolit.net/blog/how-ai-age-spam-is-breaking-google-ads-and-what-we-did-about-it-.htm)).
  Son casos aislados y de quien vende la solución. **No existe un % global fiable.** Conclusión: medirlo por cuenta.

### 2.2 Coste por lead cualificado y coste por venta

Métricas que el módulo debería calcular por cliente, campaña, red y término (cruzando Ads con GHL):
- **CPL bruto** = coste / leads (Ads).
- **Tasa de cualificación** = leads cualificados / leads brutos (CRM).
- **CPQL** (coste por lead cualificado) = coste / leads cualificados.
- **Tasa de cierre** = ventas / leads cualificados.
- **CPS / CAC** (coste por venta) = coste / ventas.
- **ROAS real** = ingresos CRM / coste.
- Por **red** (Search, Search Partners, Display, PMax por canal, YouTube) y por **franja horaria/día** (el spam se concentra
  de noche [anécdota de práctica]).

**[Anécdota de agencia]** WebFX: CPQL −47 % interanual en una cuenta al **limpiar la señal** que recibe la estrategia de puja
(no por el cambio de estrategia en sí) (resumen vía Stacker, no leído el original).

### 2.3 Value-based bidding para leads — casos publicados

- **Sansiri** (inmobiliaria, Google): importó conversiones offline de Salesforce → **+43 % leads cualificados, −48 % CPA**.
- **WeLend** (finanzas, Google): EC4L + value-based bidding → **+12 % tasa de conversión, +17 % valor de conversión**.
- **Neo4j** (B2B, Google): **+157 % leads B2B cualificados** con PMax + OCI.
- Fuente de los tres: resúmenes de casos de Think with Google
  ([Google, AI lead gen first-party data](https://business.google.com/in/think/marketing-strategies/ai-lead-generation-first-party-data/)).
  Son casos que publica Google (sesgo de selección); no son medias.
- **[Hecho Google]** Ad Strength «Excelente» en PMax: **+6 % conversiones** de media (datos Google, feb 2024)
  ([Google](https://support.google.com/google-ads/answer/13775965?hl=en)).
- **[Hecho Google]** Aprendizaje PMax: 1-2 semanas, hasta 6 con poco volumen; tras un cambio de landing que baje el
  rendimiento, acercar el tCPA al CPA real y dejar reaprender.

### 2.4 «Optimizar a lo que de verdad le importa al cliente»

Principio: **el KPI del agente no es el CPL de Ads, es el coste por cliente ganado del CRM**, con el CPL bruto solo como
indicador adelantado. Escalera práctica por volumen mensual de cada cuenta (umbral de 15 conv./30 días de Google):
1. < 15 leads cualificados/mes → pujar a lead válido (antispam) con valor estimado; importar cualificados como **secundaria**
   para medir.
2. ≥ 15 cualificados/30 días → cualificado como primaria (tCPA) o valor por etapa (tROAS).
3. ≥ 15 ventas/30 días y valores variables → valor real de venta.

---

## 3. Nivel de calidad (Quality Score)

### 3.1 Qué dice Google

- **[Hecho Google]** QS de 1 a 10 por palabra clave, a partir de **CTR esperado, relevancia del anuncio y experiencia en la
  página de destino**; cada uno «por encima de la media / en la media / por debajo», comparado con otros anunciantes que
  aparecieron en la **misma búsqueda en los últimos 90 días**. Se basa en impresiones históricas de búsquedas **exactas** de
  la palabra clave, así que cambiar la concordancia no lo cambia. Sale como «—» si no hay suficientes búsquedas exactas.
  **«El nivel de calidad no es un factor de la subasta»: es una herramienta de diagnóstico**
  ([Google, QS](https://support.google.com/google-ads/answer/6167118?hl=en)).
- **[Hecho Google]** Ad Rank depende de 6 factores: puja; calidad del anuncio y la landing (en el momento de la subasta);
  umbrales de Ad Rank; competitividad de la subasta; contexto de la búsqueda (términos, ubicación, dispositivo, hora, otros
  anuncios, señales del usuario); impacto esperado de los recursos (sitelinks, llamada…). Ejemplo ilustrativo de umbrales: 0
  para salir en la página, 40 para la parte superior. La calidad afecta a la elegibilidad, al CPC real y a la elegibilidad de
  recursos ([Google, Ad Rank](https://support.google.com/google-ads/answer/1722122?hl=en)).
- **[Hecho Google, no verificado hoy en esta página]** El CPC real es lo mínimo necesario para mantener la posición y superar
  los umbrales; un anuncio puede pagar más que el siguiente si la diferencia de Ad Rank es grande (lo dice la página de Ad
  Rank: «un anuncio mejor clasificado puede pagar más por mayor certeza de ganar»).

### 3.2 Fórmulas de expertos (no oficiales)

- **Fórmula clásica (WordStream 2014, simplificada y obsoleta como fórmula exacta):**
  `CPC real ≈ (Ad Rank del siguiente / tu QS) + 0,01` con `Ad Rank = puja × QS`. Google hoy dice que el QS visible no entra
  en la subasta; sirve solo como intuición: **a igual posición, mejor calidad = CPC más bajo**.
- **Larry Kim (WordStream, datos de ~100 M$ de gasto anualizado de clientes, 2013-2014):** con QS 5 como base, QS 10 ≈
  **−50 % CPC**; QS 1 ≈ **+400 %** [la cifra de +400 % no la he releído hoy]; en 2013 comparaba QS 10 vs 7 → −30 % CPC. «A
  mayor QS, menor CPA de media»
  ([WordStream 2013](https://www.wordstream.com/blog/ws/2013/07/16/quality-score-cost-per-conversion);
  [WordStream 2014](https://www.wordstream.com/blog/ws/2014/01/29/hacking-adwords)). Datos antiguos, de la era pre-Smart
  Bidding.
- **Crítica:** un análisis de Business 2 Community con datos tipo WordStream concluía que el QS explicaría solo ~1 % de la
  variación del coste por conversión ([B2C](https://www.business2community.com/?p=1680004)). → El QS correlaciona con CPC, no
  necesariamente con CPA.
- **Brad Geddes / Adalysis (2016-2017) — pesos del QS visible, ingeniería inversa:**
  `QS visible = 1 + LPE + Relevancia + CTR esperado`, con

  | Estado | Experiencia landing | Relevancia del anuncio | CTR esperado |
  |---|---|---|---|
  | Por encima | 3,5 | 2 | 3,5 |
  | En la media | 1,75 | 1 | 1,75 |
  | Por debajo | 0 | 0 | 0 |

  Fuente: [Adalysis, visible vs auction QS (12 ene 2017)](https://adalysis.com/blog/visible-quality-score-versus-auction-quality-score/).
  Implicación: **CTR esperado y landing pesan 39 % cada uno y la relevancia 22 %** del tramo variable. Todo «en la media» →
  5,5 (sale 5 o 6). El QS de subasta es otro número, calculado en cada búsqueda con consulta, intención, dispositivo, hora,
  ubicación…
- **Geddes (webinar, citado por Acquisio):** Ad Rank ≈ 50 % puja, 40 % calidad, 10 % recursos (estimación suya, de segunda
  mano) ([Acquisio](https://www.acquisio.com/blog/?p=6300)).
- **[Opinión experto]** El CTR esperado es **relativo** a la consulta y la posición: un 2 % puede ser «por encima» en una
  palabra y un 6 % «por debajo» en otra.
- **[No verificado]** Un blog de proveedor habla de un «modelo predictivo de calidad de landing» de Google en feb 2025 que
  evalúa la página antes de la subasta; **no lo he podido confirmar en documentación de Google**.

### 3.3 QS ponderado por impresiones (y por coste)

- **Adalysis:** QS del grupo = media de los QS de sus palabras ponderada por las impresiones de 30 días; solo palabras
  activas en grupos y campañas activas; escala 1,0-10,0. Ejemplo: palabras con 10.000 impr./QS 5, 1.000/QS 9 y 1/QS 1 →
  **5,36**. Los tres componentes también se ponderan y se muestran verde/neutro/rojo. Prioriza grupos combinando QS ponderado
  y coste de 30 días; los datos se actualizan una vez por semana e incluyen histórico de un año
  ([Adalysis](https://adalysis.freshdesk.com/support/solutions/articles/1000241611-quality-score-analysis-and-management)).
- Fórmula: `QS_pond = Σ(QS_i × impr_i) / Σ impr_i`, y por componente `%impr_por_debajo(LPE) = Σ impr de palabras con LPE
  «por debajo» / Σ impr`.
- **Histórico:** la API de Google Ads da QS y componentes actuales y, en los informes por fecha, columnas «históricas»
  (`historical_quality_score`, etc.) **[no verificado hoy el nombre exacto de los campos]**. Conviene **guardar una foto
  diaria** nosotros (como hacemos con GSC) para ver tendencias y relacionarlas con cambios en la landing.

### 3.4 Cómo mejorar cada componente

| Componente | Causas habituales en lead gen local | Acciones |
|---|---|---|
| CTR esperado | Anuncio genérico, sin ciudad ni servicio; sin recursos; competidores con reseñas/precio | Titulares con servicio + ciudad + diferencial; recursos de llamada, ubicación, sitelinks, extractos; recursos de precio/promoción; separar términos de marca |
| Relevancia del anuncio | Grupo con palabras de varios servicios; anuncio que no menciona la palabra | Grupos temáticos por servicio (no SKAG, que están obsoletos con la concordancia actual); titular con la palabra clave; DKI con cuidado |
| Experiencia de la landing | Mandar a la home; página lenta en móvil; no habla del servicio buscado; formulario largo; contenido escaso | Landing por servicio (y por ciudad si el negocio lo justifica); LCP < 2,5 s; mensaje que repita la intención; teléfono visible; prueba social |

**Umbrales prácticos [Opinión experto, consenso]:** QS ≤ 4 en palabras con gasto relevante = prioridad; QS 7+ = sano; perseguir
10 en todo no compensa. Priorizar por **gasto × (10 − QS)** o por impresiones con componente «por debajo».

**Advertencia 2025-2026:** con concordancia amplia + Smart Bidding + AI Max, buena parte del tráfico entra por consultas que
no son la palabra exacta, y el QS (basado en búsquedas exactas) cubre cada vez menos tráfico. Por eso **el diagnóstico de
sintonía tiene que hacerse a nivel de término de búsqueda real**, no solo de palabra clave (ver §4).

---

## 4. Sintonía palabra clave → anuncio → landing («message match», «scent»)

### 4.1 Evidencia

- **[Dato, Optimizely 2014]** variante que repetía el titular del anuncio de búsqueda en la landing: CR **16,99 %** (no se ve
  el control en el extracto) ([Optimizely](https://optimizely.com/2014/09/04/symmetry-in-online-marketing)).
- **[Dato proveedor]** Unbounce: texto dinámico en la landing (cambia según la palabra) → **+31,4 %** conversiones en un A/B
  ([Unbounce](https://unbounce.com/landing-page-examples/built-using-unbounce/dynamic-text-a-b-test/)).
- **[Anécdota proveedor]** KlientBoost: alinear «Fully Free for Life» en anuncio y landing → **+66 % CR** en un cliente
  ([KlientBoost](https://www.klientboost.com/cro/message-match/)). El famoso «+212 % Moz/Conversion Rate Experts» no lo he
  podido verificar en origen.
- **[Dato]** Unbounce Conversion Benchmark Report 2024: **mediana 6,6 %** de conversión de landing en todos los sectores
  (41.000 landings, 464 M de visitas, 57 M de conversiones); servicios profesionales mediana ~6,1 % con top 25 % ≥ 14,1 %
  (cifra sin año clara) ([Unbounce](https://unbounce.com/conversion-benchmark-report/);
  [Search Engine Land](https://searchengineland.com/how-does-your-landing-page-performance-compare-453224)).

### 4.2 Cómo se audita (manual, como lo hace un buen consultor)

1. Tomar los **términos de búsqueda con gasto** (no las palabras clave).
2. Para cada uno, ver el **anuncio que se mostró** (o los titulares de la RSA del grupo) y la **URL final real** (cuidado con
   AI Max, que puede cambiarla).
3. Abrir la landing en **móvil**: ¿el H1 responde al término? (servicio, ciudad, urgencia, precio); ¿la oferta del anuncio
   (p. ej. «presupuesto gratis en 24 h») está en la primera pantalla?; ¿el CTA es el mismo que promete el anuncio?
4. Marcar desajustes: término de un servicio que no se ofrece (→ negativa), servicio que se ofrece pero sin página (→ crear
   landing), página que existe pero no se usa (→ cambiar URL final).

### 4.3 Cómo automatizarlo (lo que podemos construir)

- **Embeddings** (similitud coseno) entre: término de búsqueda, titulares/descr. del anuncio, y **texto de la landing**
  (H1, títulos, primer bloque) que ya tiene nuestro **rastreador SEO**. Tres puntuaciones: `sim(término, anuncio)`,
  `sim(anuncio, landing)`, `sim(término, landing)`. Ordenar por **coste × (1 − similitud)**. Esto es similitud, no
  razonamiento → **embeddings, no LLM** (directiva de optimización de IA del proyecto): coste casi nulo y escala a todas las
  cuentas.
- **LLM solo en el último paso** (Haiku/Sonnet) para los 10-20 peores casos de cada cuenta: explicar el desajuste en lenguaje
  claro y proponer titular/H1/negativa. Opcional: comprobar señales que el embedding no ve (¿la landing menciona la ciudad?
  ¿hay teléfono en la primera pantalla? ¿el precio del anuncio coincide con la web?) con reglas/regex.
- **Cruce con el mapa de palabras del SEO** (que ya está en embeddings): si un término de pago cae en un clúster que tiene
  una página orgánica mejor posicionada que la URL final de Ads, proponerla como landing.
- **Cruce con el registro de cambios de la web**: si cae el CR o el QS de landing tras un cambio de página, enlazarlo.

### 4.4 Dynamic Keyword Insertion (DKI) y personalización

- DKI (`{KeyWord:Texto por defecto}`) sigue existiendo en RSA [conocimiento previo]. Con concordancia amplia inserta la
  **palabra clave**, no el término de búsqueda, así que la «sintonía» es menor de lo que parece y puede generar titulares
  raros. Útil en grupos muy ajustados.
- **AI Max – Final URL expansion** ([Google](https://support.google.com/google-ads/answer/16230205?hl=en)): activado por
  defecto al activar AI Max; requiere «personalización de texto»; Google puede **cambiar la URL final** por otra «más
  relevante» del dominio y generar titulares que la sigan; **los recursos fijados (pinned) no se respetan** si cambia la URL;
  controles: exclusiones de URL (exactas o por regla, a nivel de campaña) e inclusiones (a nivel de grupo; también anulan
  los pinned). En los informes de landing aparece «Seleccionada por: Automáticamente»
  ([guía de agencia](https://oneppcagency.co.uk/google-ads/ai-max/)). Google en PMax recomienda **desactivarlo si los anuncios
  van a páginas irrelevantes** ([Google](https://support.google.com/google-ads/answer/13775965?hl=en)).
  → Para lead gen: excluir blog, aviso legal, empleo, «quiénes somos»; vigilar el % de clics que van a URLs no elegidas.

### 4.5 Landings por servicio y por ciudad

- [Opinión experto] Una landing por **servicio** es el mínimo; por **ciudad** solo si el negocio cubre varias zonas y el
  mensaje cambia (prueba local: dirección, reseñas de la zona, fotos de trabajos allí). Riesgo SEO: páginas de ciudad
  «puerta» casi duplicadas → si son solo para pago, `noindex`.
- La sintonía no es solo léxica: **intención** (urgencia vs. presupuesto vs. información). «Fontanero urgente» pide teléfono
  arriba y tiempo de llegada; «precio reforma baño» pide rangos de precio y formulario.

### 4.6 Velocidad y Core Web Vitals en móvil

- **[Dato] Portent (abr 2022, ~100 M de páginas vistas, 14 webs B2B lead gen + 6 e-commerce, 27.000 landings):** en B2B lead
  gen, CR **~40 % a 1 s, 34 % a 2 s, 29 % a 3 s**; 1 s vs 5 s = **3×**; 1 s vs 10 s = **5×**. (No especifica la métrica de
  tiempo de carga; muestras por tramo no publicadas.)
  ([Portent](https://www.portent.com/blog/analytics/research-site-speed-hurting-everyone.htm)).
- **[Dato] Deloitte/Google «Milliseconds make millions» (2020, 37 marcas, 30 M de sesiones, Europa y EE. UU.):** mejorar
  0,1 s la velocidad móvil → en **lead gen +21,6 %** de avance del primer paso del formulario al envío, +7 % páginas vistas,
  −8,3 % rebote en páginas informativas; retail +8,4 % conversiones, viajes +10,1 %
  ([web.dev](https://web.dev/case-studies/milliseconds-make-millions)).
- **Umbrales CWV [conocimiento previo, estable]:** LCP ≤ 2,5 s; INP ≤ 200 ms (sustituyó a FID en mar 2024); CLS ≤ 0,1, en
  el percentil 75. **Ya los medimos** (PageSpeed/CrUX en el módulo SEO): basta con cruzarlos con las URL finales de Ads.

### 4.7 Formularios

- **[Dato proveedor]** Multipaso: caso de reparación de aire acondicionado (Geek Powered) **7,62 % → 13,13 %** con formulario
  de 4 pasos, A/B de 14 días con 854 sesiones (muestra pequeña)
  ([Medium](https://medium.com/@jenningscreate/case-study-stans-ac-multi-step-form-25ee54cfb5aa)); BrokerNotes 11 % → 46 %
  según Instapage ([Instapage](https://instapage.com/blog/multi-step-form-part-2/)); Venture Harbour (citado de segunda mano):
  +35 % BrokerNotes, +59 % Vendio, +214 % una empresa de césped artificial. Cifras de proveedores, probablemente infladas.
- **[Opinión experto]** Menos campos = más envíos, pero a veces peor calidad; el multipaso con preguntas fáciles primero
  (servicio, código postal) y datos de contacto al final suele dar lo mejor de ambos, y además **cualifica** (las respuestas
  sirven para dar valor al lead).
- Campo de **código postal** = filtro de zona y dato para valorar el lead (y para detectar spam de fuera).
- Honeypot + reCAPTCHA invisible + validación de teléfono español en servidor antes de disparar la conversión.

### 4.8 Pruebas de confianza

[Opinión experto, consenso CRO; sin estudio que haya podido leer hoy] Para servicios locales: reseñas de Google con
puntuación y número (y que coincidan con la ficha), **teléfono visible y clicable arriba**, fotos reales del equipo y de
trabajos, garantías, colegiación (abogados, clínicas), tiempo de respuesta, precios orientativos, zona atendida. Nuestra
herramienta ya tiene la ficha de GBP con reseñas → podemos comprobar si la landing muestra la nota y si está al día.

### 4.9 Benchmarks por sector

**LocaliQ/WordStream 2026** (actualizado 1 jun 2026; miles de campañas de clientes LocaliQ en Google Ads y Microsoft Ads;
23 sectores; mayoritariamente EE. UU.) ([LocaliQ](https://localiq.com/blog/search-advertising-benchmarks/)):

Medias: **CPC 5,42 $ · CTR 6,64 % · CPL 66,69 $ · CR 8,18 %**. El CPL bajó por primera vez en cinco años.

| Sector | CPC | CTR | CR | CPL |
|---|---|---|---|---|
| Animales y mascotas | 4,06 $ | 7,49 % | 16,22 % | 31,50 $ |
| Abogados y servicios legales | 9,87 $ | 5,87 % | 5,55 % | 131,63 $ |
| Automoción – reparación | 4,35 $ | 5,56 % | 15,51 % | 29,96 $ |
| Belleza y cuidado personal | 4,62 $ | 6,75 % | 10,35 % | 39,25 $ |
| Servicios a empresas | 5,87 $ | 6,10 % | 4,85 % | 93,69 $ |
| Dentistas | 8,00 $ | 5,66 % | 10,67 % | 72,97 $ |
| Educación | 4,81 $ | 7,56 % | 13,14 % | 77,48 $ |
| Finanzas y seguros | 3,39 $ | 9,83 % | 2,64 % | 74,44 $ |
| Salud y fitness | 6,17 $ | 5,81 % | 6,94 % | 67,36 $ |
| Hogar y reformas | 8,33 $ | 6,47 % | 8,05 % | 90,92 $ |
| Industrial y comercial | 5,87 $ | 6,57 % | 8,20 % | 75,19 $ |
| Servicios personales | 7,17 $ | 7,16 % | 12,34 % | 54,60 $ |
| Médicos y cirujanos | 4,76 $ | 6,61 % | 12,43 % | 40,04 $ |
| Inmobiliaria | 3,22 $ | 7,61 % | 3,70 % | 102,51 $ |
| Restaurantes | 2,05 $ | 6,83 % | 8,05 % | 30,57 $ |
| Deportes y ocio | 2,77 $ | 8,75 % | 7,69 % | 44,26 $ |
| Viajes | 2,14 $ | 9,32 % | 5,83 % | 44,70 $ |

**Edición 2025** (abr 2024-mar 2025, ~16.000 campañas): CPC 5,26 $ (+12,88 %), CTR 6,66 %, CR 7,52 %, CPL 70,11 $ (+5,13 %);
legal CPC 8,58 $ y CPL 131,63 $; CPC subió en el 87 % de sectores
([resumen Search Engine Land/PPC Land](https://ppc.land/google-ads-costs-rise-12-88/)).
**Cautelas:** el CPL «66,69 $» de 2026 coincide con el de 2024 y el CPL legal 131,63 $ se repite en 2025 y 2026; hay
etiquetas mezcladas entre ediciones. No usar como verdad, solo como orden de magnitud.

**España/Europa:** no he encontrado benchmark primario público por sector para España. Statista tiene CPC por sector en
España (dic 2024) tras muro de pago ([Statista](https://www.statista.com/statistics/1243710/spain-search-advertising-cpc/)).
LocaliQ UK 2025 tiene un PDF con cifras británicas que mezcla social y búsqueda
([LocaliQ UK](https://localiq.co.uk/wp-content/uploads/2025/04/2025-UK-Paid-Advertising-Benchmark-Report.pdf)). Un consultor
afirma que los CPC en mercados hispanohablantes son 20-40 % menores que en EE. UU. (no verificado). → **Oportunidad: nuestro
propio benchmark** anónimo por sector y provincia con 25+ cuentas (CPC, CTR, CR, CPL, CPQL), que nadie publica para España.

---

## 5. Negocios locales

### 5.1 Ubicación, radio, presencia vs. interés

- **[Hecho Google]** Por defecto en Search/Display/Shopping: **«Presencia o interés»** (personas que están o suelen estar en
  la zona **o que muestran interés** en ella); ya no existe «solo interés». Exclusiones: siempre «presencia». Google cita +5 %
  conversiones en Search para viajes, inmobiliaria y educación al pasar de Presencia a Presencia o interés (datos internos
  mayo-jun 2022) ([Google](https://support.google.com/google-ads/answer/1722038?hl=en)).
- **[Hecho Google]** En PMax lead gen, **si llegan leads de fuera de la zona, cambiar a «Presencia»**
  ([Google](https://support.google.com/google-ads/answer/13775965?hl=en)).
- **[Opinión experto]** Para servicios locales (fontanero, clínica, abogado de una ciudad), «Presencia» es la opción
  razonable salvo turismo o mudanzas/servicios contratados desde fuera
  ([StatCounter](https://blog.statcounter.com/2023/02/presence-or-interest-the-1-mistake-we-see-people-make-in-google-ads/)).
- Regla para el agente: % de leads del CRM con código postal/provincia fuera de la zona de servicio de la ficha del cliente;
  informe de «ubicación del usuario» vs «ubicación de interés». Si > 10 % de coste va a usuarios fuera de la zona con
  «Presencia o interés» → proponer «Presencia».
- **Radio:** el radio debe salir de la **zona de servicio real** de la ficha (y del tiempo de desplazamiento), no de un
  número redondo. Ajustes de puja por zona solo con datos (con Smart Bidding las pujas manuales por ubicación pesan poco; se
  pueden usar **reglas de valor** por ubicación, que sí funcionan con value-based bidding
  ([Google](https://support.google.com/google-ads/answer/13489421?hl=en))).

### 5.2 Recursos de ubicación y de llamada, horarios

- Recurso de ubicación vinculado a GBP: muestra dirección, distancia y abre Maps. Desde 2018 se pueden contar llamadas desde
  extensiones de ubicación como conversiones ([SEJ](https://www.searchenginejournal.com/google-ads-can-now-count-calls-from-location-extensions-as-conversions/280259/)).
- **Llamadas fuera de horario [opinión experto + práctica]:** programar el recurso de llamada solo en horario en que alguien
  coge el teléfono; fuera de horario, priorizar formulario/WhatsApp. Una llamada perdida pagada es el peor lead. Con datos:
  cruzar hora de llamadas de Ads (informe de detalles de llamada: hora, duración, estado «perdida/recibida», código de área)
  con el horario de la ficha de GBP; si hay llamadas perdidas > X % en una franja → proponer programación.
- El horario de la ficha GBP ya lo tenemos → detectar incoherencias anuncio/ficha automáticamente.

### 5.3 Local Services Ads en España

- **[Hecho]** Google lanzó LSA en **10 países europeos, incluida España**, en 2020, para **servicios del hogar** (16
  categorías al inicio, no servicios profesionales) ([Search Engine Land](https://searchengineland.com/google-takes-local-services-ads-to-europe-341284)).
  La ayuda de LSA con selector de España lista categorías del hogar (fontaneros, electricistas, climatización, cerrajería no,
  limpieza, mudanzas, control de plagas, tejados, jardinería, reparación de electrodomésticos…)
  ([Google LSA](https://support.google.com/localservices/answer/6224841?hl=en)). La ampliación a abogados se hizo en Reino
  Unido (Londres), no en España ([Google blog](https://blog.google/products/ads-commerce/a-new-way-for-legal-firms-and-estate-agents-to-reach-more-customers/)).
- **[Hecho]** Garantía de Google en España con tope de reembolso de **1.500 €** (según resumen; no leído en origen hoy);
  **cerrajeros prohibidos en España** desde la actualización de política de nov 2024
  ([Google policy](https://support.google.com/adspolicy/answer/15303051?hl=en)).
- LSA se paga por lead (no por clic) y no se gestiona con la API normal de campañas de la misma forma **[no verificado hoy:
  soporte en API de Google Ads para LSA fuera de EE. UU.]**. Para nuestros clientes de reformas/climatización/fontanería
  merece la pena comprobar elegibilidad.
- No hay LSA para clínicas dentales ni abogados en España (al menos en lo que he podido leer).

### 5.4 Estacionalidad por sector (España)

[Opinión experto / conocimiento previo, **no verificado con datos hoy**]:
- **Reformas:** picos en enero-marzo (propósitos, planificar antes de primavera) y septiembre-octubre; agosto muy bajo.
- **Climatización:** aire acondicionado mayo-julio (picos con olas de calor); calefacción/calderas octubre-diciembre;
  urgencias dependen del tiempo (correlación con temperatura).
- **Clínicas dentales/estéticas:** enero y septiembre fuertes; julio-agosto bajos; diciembre bajo.
- **Abogados de familia:** septiembre y enero (tras vacaciones); accidentes de tráfico más planos con picos en verano.
- **Mudanzas:** verano y fin de mes; **cerrajeros/fontaneros urgentes**: poco estacionales pero con picos de fin de semana y
  noche.
- **Cómo hacerlo bien:** no con una tabla fija, sino con datos: **Google Trends + histórico de impresiones de GSC del propio
  cliente** (ya guardado a diario) + histórico de Ads. El agente puede distinguir «la campaña no convierte porque baja la
  demanda del sector esta semana» de «porque algo se ha roto», comparando con la curva de impresiones orgánicas del mismo
  cliente y de otros clientes del mismo sector. Google ofrece **ajustes de estacionalidad** para Smart Bidding en eventos
  cortos (1-7 días) **[conocimiento previo]**, útiles para promociones, no para estaciones largas.

---

## 6. Ideas para nuestro módulo

1. **Auditor de medición (lo primero que hay que construir).** Para cada cuenta: lista de acciones primarias/secundarias,
   recuento, valor, origen (etiqueta/GA4/importación), y alertas: dos primarias duplicadas, micro-conversiones como primarias,
   «Cada una» en leads, umbral de llamada < 30 s, etiqueta inactiva, EC4L desactivado, sin consentimiento en la subida.
   Puntuación de «salud de medición» por cliente. Sin datos fiables, el resto del agente optimiza a ciegas.
2. **Conciliación Ads ↔ CRM (GHL) diaria.** Ratio conversiones Ads / leads GHL con origen Google, por campaña. % de leads
   Google sin GCLID/GBRAID/WBRAID. % de ejecuciones *Skipped* del workflow. Detección de leads de fuera de zona y de spam.
   Esto es lo que convierte «CPL» en **CPQL y coste por venta**.
3. **Subida propia de conversiones offline vía Data Manager API** (no la API de Ads, cerrada a esto desde jun 2026), con
   etapas del pipeline de GHL → «lead cualificado», «cita», «venta», con valor por etapa calculado de los datos del cliente
   (`P(venta|etapa) × margen`) y recalculado cada mes. Retractar conversiones de leads marcados como spam.
4. **Valor del lead por cliente** guardado en la ficha (ticket medio, margen, tasa de cierre) → objetivos de CPA/ROAS
   **derivados del negocio**, no inventados: `CPA máx = valor del lead cualificado × margen de beneficio que quiere la agencia`.
5. **Detector de spam por red y franja:** leads marcados «no válido» en GHL agrupados por red (Search / Partners / Display /
   PMax), hora, dispositivo, ubicación → propuesta concreta («excluir Search Partners en la campaña X: 9 de 11 leads no
   válidos en 30 días frente a 1 de 25 en Search»).
6. **Sintonía término → anuncio → landing con embeddings** (barato): reutiliza el rastreador SEO (texto de la landing), el
   texto de los anuncios y los términos de búsqueda; ordena por coste × desajuste; LLM pequeño solo para explicar los peores.
   Añade la comprobación de URLs elegidas por AI Max.
7. **QS diario guardado + ponderado por impresiones y coste**, con los tres componentes, y enlazado a cambios de la web
   (registro de cambios del SEO) y a velocidad (CrUX de la URL final). Alertas «LPE pasó a por debajo de la media en la
   landing X tras el cambio del día D».
8. **Velocidad de las URL finales de Ads**: lista de landings con gasto y su LCP/INP/CLS móvil; estimar «coste extra» por
   lentitud con la curva de Portent como referencia (marcada como estimación).
9. **Revisión de la landing con checklist objetiva** (reglas + Clarity): teléfono visible en la primera pantalla móvil,
   formulario y nº de campos, mensaje del anuncio presente, ciudad, reseñas, CTA; con Clarity: rage clicks, scroll hasta el
   formulario, abandonos del formulario. Nadie cruza Clarity con Ads por término.
10. **Llamadas cualificadas sin la IA de Google** (que en España no está): si el cliente usa número de GHL con grabación,
    transcribir y clasificar la llamada (Haiku basta: es clasificación) y subir solo las cualificadas como conversión.
    *Señalo la optimización: transcripción + clasificación con modelo pequeño; no hace falta Sonnet.* Ojo RGPD: aviso de
    grabación y base legal (consultar antes; podría rozar línea roja de datos personales).
11. **Benchmark propio España** por sector y provincia (anónimo, entre clientes): CPC, CTR, CR, CPL, CPQL, estacionalidad.
12. **Explicación de «por qué no convierte»** combinando: medición rota (etiqueta/consentimiento), demanda (GSC/Trends del
    sector), competencia (cuota de impresiones perdida, subastas), landing (cambio/velocidad/caída), horario (llamadas
    perdidas), calidad (spam). Es exactamente lo que pide Eury y lo que hoy nadie da en una sola frase.
13. **Coherencia ficha GBP ↔ anuncios ↔ landing**: horario, teléfono, dirección, nota de reseñas, servicios ofrecidos.
14. **Elegibilidad LSA** para clientes de servicios del hogar (aviso al comercial).

## 7. Lo que nadie hace bien (huecos de mercado)

- **Cerrar el bucle término de búsqueda → lead → venta en el CRM** a nivel de término y de red. Optmyzr y Adalysis analizan
  landings por URL y QS ([Optmyzr](https://www.optmyzr.com/help/landing-page/landing-page-analysis)), pero no leen el CRM ni
  el texto de la página contra el término.
- **Sintonía semántica real** con el texto de la landing (no con la URL) y con AI Max cambiando URLs. No he encontrado una
  herramienta que lo haga con embeddings.
- **Medición auditada de forma continua**: las herramientas asumen que las conversiones son verdad. Ninguna concilia
  diariamente Ads con el CRM y avisa «tus conversiones no son leads».
- **Calificación de llamadas en España**: Google solo la da en EE. UU./Canadá.
- **Benchmarks españoles por sector** públicos y recientes: no existen.
- **Diagnóstico causal** de una caída (medición vs. demanda vs. competencia vs. landing) usando datos orgánicos del mismo
  cliente (GSC) como grupo de control.

## 8. Lo no verificado (revisar antes de construir)

- Si la acción «Add to Google Ads» de GHL funciona con «Opportunity Stage Changed» (para mandar cualificado/venta).
- Nombres exactos de campos de QS histórico en la API de Google Ads, y endpoints concretos de la Data Manager API.
- Estado de los recursos de mensaje/WhatsApp de Google Ads en España.
- El «modelo predictivo de calidad de landing» de feb 2025 (solo blog de proveedor).
- Tasa de aceptación de cookies típica en España tras la guía de la AEPD.
- Cifra de +400 % CPC para QS 1 (Larry Kim) — la recuerdo pero no la he releído hoy.
- Tope de 1.500 € de la Garantía de Google en España.
- Toda la estacionalidad por sector del §5.4 (opinión, sin datos).
- Benchmarks LocaliQ: posibles cifras arrastradas entre ediciones (CPL 66,69 $).
- Se agotó el cupo de búsquedas: no he podido profundizar en CXL / Conversion Rate Experts, en casos españoles ni en las
  novedades de Google de la segunda mitad de 2026 sobre lead gen.

## 9. Fuentes

**Google (oficial)**
- Upgrade OCI a EC4L y calendario Data Manager: https://support.google.com/google-ads/answer/14274408?hl=en
- Sobre EC4L: https://support.google.com/google-ads/answer/15713840?hl=en
- Data Manager con EC4L: https://support.google.com/google-ads/answer/15707550?hl=en
- OCI con GCLID: https://support.google.com/google-ads/answer/7012522
- Leads de calidad (buenas prácticas): https://support.google.com/google-ads/answer/13489421?hl=en
- PMax lead gen: https://support.google.com/google-ads/answer/13775965?hl=en
- Recuento de conversiones: https://support.google.com/google-ads/answer/3438531?hl=en
- Migración GA4 (duplicados): https://support.google.com/google-ads/answer/12495138?hl=en
- Conversiones de llamada: https://support.google.com/google-ads/answer/6100664?hl=en-GB
- Medir llamadas: https://support.google.com/google-ads/answer/6095882
- Países con números de desvío: https://support.google.com/google-ads/answer/2454052?hl=en-GB
- AI-qualified call leads: https://support.google.com/google-ads/answer/16913326
- Impacto del modo de consentimiento: https://support.google.com/google-ads/answer/11954524
- Modelado del modo de consentimiento: https://support.google.com/google-ads/answer/10548233
- Quality Score: https://support.google.com/google-ads/answer/6167118?hl=en
- Ad Rank: https://support.google.com/google-ads/answer/1722122?hl=en
- Final URL expansion (AI Max): https://support.google.com/google-ads/answer/16230205?hl=en
- Opciones avanzadas de ubicación: https://support.google.com/google-ads/answer/1722038?hl=en
- LSA categorías: https://support.google.com/localservices/answer/6224841?hl=en
- Política servicios locales nov 2024: https://support.google.com/adspolicy/answer/15303051?hl=en
- Casos lead gen first-party (Sansiri, WeLend, Neo4j): https://business.google.com/in/think/marketing-strategies/ai-lead-generation-first-party-data/
- Milliseconds make millions: https://web.dev/case-studies/milliseconds-make-millions

**Estudios, expertos y prensa**
- LocaliQ benchmarks 2026: https://localiq.com/blog/search-advertising-benchmarks/
- PPC Land, benchmarks 2025: https://ppc.land/google-ads-costs-rise-12-88/
- LocaliQ UK 2025 (PDF): https://localiq.co.uk/wp-content/uploads/2025/04/2025-UK-Paid-Advertising-Benchmark-Report.pdf
- Statista España (muro de pago): https://www.statista.com/statistics/1243710/spain-search-advertising-cpc/
- Adalysis, QS visible vs subasta: https://adalysis.com/blog/visible-quality-score-versus-auction-quality-score/
- Adalysis, QS ponderado: https://adalysis.freshdesk.com/support/solutions/articles/1000241611-quality-score-analysis-and-management
- WordStream QS y CPA (2013): https://www.wordstream.com/blog/ws/2013/07/16/quality-score-cost-per-conversion
- WordStream Hacking AdWords (2014): https://www.wordstream.com/blog/ws/2014/01/29/hacking-adwords
- Acquisio (Geddes, pesos Ad Rank): https://www.acquisio.com/blog/?p=6300
- Business 2 Community (crítica QS): https://www.business2community.com/?p=1680004
- Portent velocidad 2022: https://www.portent.com/blog/analytics/research-site-speed-hurting-everyone.htm
- Unbounce benchmark: https://unbounce.com/conversion-benchmark-report/
- Search Engine Land sobre Unbounce: https://searchengineland.com/how-does-your-landing-page-performance-compare-453224
- Unbounce texto dinámico: https://unbounce.com/landing-page-examples/built-using-unbounce/dynamic-text-a-b-test/
- Optimizely symmetry: https://optimizely.com/2014/09/04/symmetry-in-online-marketing
- KlientBoost message match: https://www.klientboost.com/cro/message-match/
- Multipaso (caso AC): https://medium.com/@jenningscreate/case-study-stans-ac-multi-step-form-25ee54cfb5aa
- Instapage multipaso: https://instapage.com/blog/multi-step-form-part-2/
- SERoundtable leads inválidos 2022: https://seroundtable.com/google-ads-decreasing-invalid-leads-34272.html
- Search Engine Land PMax lead gen: https://searchengineland.com/why-performance-max-lead-generation-fails-make-it-work-393038
- WordStream calidad del lead: https://www.wordstream.com/blog/google-ads-lead-quality
- ClickCease (bots y leads falsos): https://www.clickcease.com/blog/?p=10719
- Kontrolit (spam IA): https://www.kontrolit.net/blog/how-ai-age-spam-is-breaking-google-ads-and-what-we-did-about-it-.htm
- Search Engine Land LSA Europa: https://searchengineland.com/google-takes-local-services-ads-to-europe-341284
- Google blog LSA abogados UK: https://blog.google/products/ads-commerce/a-new-way-for-legal-firms-and-estate-agents-to-reach-more-customers/
- StatCounter presencia vs interés: https://blog.statcounter.com/2023/02/presence-or-interest-the-1-mistake-we-see-people-make-in-google-ads/
- SEJ llamadas desde ubicación: https://www.searchenginejournal.com/google-ads-can-now-count-calls-from-location-extensions-as-conversions/280259/
- Optmyzr landing page analysis: https://www.optmyzr.com/help/landing-page/landing-page-analysis
- AI Max guía de agencia: https://oneppcagency.co.uk/google-ads/ai-max/
- iubenda Consent Mode: https://www.iubenda.com/en/blog/what-is-google-consent-mode/

**GoHighLevel**
- Acción «Add to Google Ads»: https://gohighlevelassist.freshdesk.com/support/solutions/articles/155000003368-workflow-action-add-to-google-ads
- CustomerLabs, GCLID perdido en GHL (proveedor): https://www.customerlabs.com/blog/gohighlevel-google-ads-conversion-tracking-missing-gclid-fix
