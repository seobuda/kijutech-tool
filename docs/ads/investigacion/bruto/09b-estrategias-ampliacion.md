# 09b — Estrategias de campañas: ampliación (políticas España, conversiones offline, benchmarks, palancas con Smart Bidding)

Investigación del 28 nov 2026. Complementa a `09-estrategias-campanas.md`; no repite lo que ya está allí.
Misma leyenda de fiabilidad: **[DOC]** documentación oficial de Google o texto legal leído en esta sesión; **[EXP]** estudio u
opinión de experto/herramienta (posible sesgo comercial); **[ANEC]** caso aislado; **[NV]** no verificado en esta sesión (conocimiento
previo o resumen indirecto).

> **Nota de método (importante, para no sobrevalorar este archivo).** El encargo pedía ≥30 búsquedas. El presupuesto de búsquedas
> web de la sesión (compartido por todos los investigadores en paralelo) se agotó tras la **primera** búsqueda de este agente. Sin
> poder buscar, el trabajo se hizo **leyendo páginas directamente** a partir de URL conocidas o enlazadas desde otras páginas:
> **~48 lecturas de páginas, de ellas ~32 con contenido útil** (el resto: 404, 403 o páginas índice sin el tema). Consecuencias:
> - Los apartados 1 (conversiones offline), 2 (políticas) y 5 (palancas con Smart Bidding) son sólidos: salen de documentación
>   oficial de Google y del BOE leídos hoy.
> - El apartado de **fuentes en otros idiomas** es **corto**: sin buscador no pude localizar artículos concretos de agencias alemanas,
>   francesas o neerlandesas; los índices de blog que leí (Frankwatching, t3n, Internetwarriors, Abondance, RD Station, Marketing&Web)
>   casi no tenían piezas de Google Ads recientes. Lo que hay de DE/FR/NL/PT/LatAm está marcado y es lo que se pudo leer.
> - **Benchmarks europeos/españoles por sector: no encontré ninguno público** (ver apartado 4). Search Engine Land y WordStream dieron 403.
> Recomendación: repetir los apartados 3 y 4 cuando haya presupuesto de búsqueda (lista de consultas sugeridas al final).

## Resumen (lo esencial)

1. **VERIFICADO [DOC]:** desde el **15 jun 2026** la API de Google Ads **no acepta nuevos adoptantes** de importación de conversiones
   offline **ni de conversiones mejoradas para leads**; quien no subía nada entre dic 2025 y may 2026 recibe el error
   `CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE` en `UploadClickConversions`. El sustituto es la **Data Manager API** (y la interfaz
   **Data Manager** dentro de Google Ads). **Nuestra herramienta, con un token de desarrollador nuevo, es «nuevo adoptante»: no podrá
   subir conversiones por la API de Google Ads; tendrá que usar Data Manager.**
2. La **Data Manager API no admite retracciones** (solo reexpresar el valor; el recuento se queda) y usa modelo *fast-fail* (un error
   tumba el lote) [DOC]. Diseño de la cola de envíos: validar antes (`validateOnly`) y no contar con «deshacer» una conversión.
3. La **interfaz Data Manager** puede leer directamente de **PostgreSQL** (además de BigQuery, Sheets, SFTP, HubSpot, Salesforce…):
   importa los últimos 14 días en cada ejecución [DOC]. Vía alternativa sin código de API: exponer una vista de leads cualificados.
4. **Políticas en España [DOC]:** cerrajería **prohibida** (desde 4 nov 2024); en Países Bajos también **fontanería**; telemedicina con
   receta solo con certificación LegitScript + Google; servicios financieros con **verificación por país (España incluida, vía G2RS)**;
   salud = **categoría sensible**: prohíbe listas de clientes (Customer Match), segmentos propios y similares en anuncios de salud.
5. **Ley española [DOC BOE]:** RD 1907/1996 (publicidad sanitaria: prohíbe garantías de curación, testimonios de profesionales o
   famosos, y la publicidad de centros sanitarios/estéticos fuera de su autorización) y art. 20 del Estatuto de la Abogacía (prohíbe
   prometer resultados y ofrecer servicios a víctimas de accidentes). Son reglas que **Google no revisa**, pero el cliente sí responde.
6. **Benchmarks:** no hay benchmarks públicos de España/Europa por sector. Lo más cercano: LocaliQ/WordStream 2026 (sin país; casi
   seguro EE. UU.) y Optmyzr Q3 2026 (incluye por primera vez Alemania, Reino Unido y Países Bajos, pero las cifras por país están tras
   formulario). Mejor fuente realista: **nuestras propias 25+ cuentas** (benchmark interno por sector y provincia).
7. **Novedades 2026 que faltaban en 09:** «**prioridad de canal**» (anunciada 14 oct 2026): poner Display y Search Partners en prioridad
   baja con tope de presupuesto (0 % = no gastar) en Search y PMax; a partir de **feb 2027** desaparece el reparto fijo 50 % de la
   expansión a Display y **DSA pasa automáticamente a AI Max** [EXP smec, coincide con Abondance].
8. **Efecto medido del cambio del 17 ago 2026 (fin de la «supresión de pujas»):** en campañas tROAS limitadas por presupuesto, CPC
   mediano +15,8 %, cuota de impresiones 40 %→31 %, cuota perdida por presupuesto 4 %→33 %; el «exceso» de ROAS (~20 % sobre objetivo)
   desapareció en 3 semanas [EXP smec, datos propios]. Es probable el mismo efecto en tCPA (inferencia, no medido).
9. **Lo que le queda al gestor con Smart Bidding** [DOC]: solo ajuste de dispositivo −100 % (y en tCPA se trata como ajuste del objetivo);
   programación horaria se respeta como *on/off* pero los % no; ubicación, audiencia, demografía: sin efecto. Las palancas reales son
   objetivo, presupuesto, conversiones (qué y con qué valor), estacionalidad, exclusión de datos, negativas, prioridad de canal y estructura.
10. Optmyzr (72.358 cuentas, feb-jul 2026): el **90 % de los cambios manuales** son de segmentación (palabras, negativas); los presupuestos
    son el 1 % del volumen pero la tarea más repetida; razón nº 1 para tocar a mano: **no confiar en la automatización (40 %)** [EXP]. Un
    agente que explique sus cambios ataca justo esa barrera.

---

## 1. Importación de conversiones offline: verificación y qué la sustituye

### 1.1 La afirmación — **VERIFICADA**
- Blog oficial de desarrolladores de Google Ads, 15 may 2026: *«Starting on June 15, 2026, the Google Ads API will no longer accept new
  adopters of offline conversion imports»* [DOC https://developers.google.com/ads/blog/posts/2026/05/changes-to-offline-click-conversion].
- Afectados: quien no haya adoptado la importación offline **ni** las conversiones mejoradas para leads, o no haya importado entre
  **dic 2025 y may 2026**. Recibirá `CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE` en `ConversionUploadService.UploadClickConversions`.
  La lista blanca va **por token de desarrollador** [DOC mismo post].
- Quien ya lo usaba puede seguir con la API de Google Ads mientras migra. El resto de operaciones de la API siguen igual [DOC].
- El post **no menciona** llamadas importadas ni ajustes de conversión (`ConversionAdjustmentUploadService`); no se puede afirmar que
  estén afectados ni que no [DOC: ausencia].
- La ayuda de Google Ads lo confirma con matiz: *«Starting June 15, 2026, offline conversions import and enhanced conversions for leads
  uploads will be migrated»* a Data Manager API y **bloqueados en la API de Google Ads**; los tokens sin peticiones entre **enero y junio
  2026** no entran en la lista de acceso heredado [DOC https://support.google.com/google-ads/answer/2998031 y
  https://support.google.com/google-ads/answer/14274408]. (Pequeña diferencia de ventanas: el blog dice dic 2025-may 2026, la ayuda
  ene-jun 2026; para nosotros da igual: no subíamos nada.)

### 1.2 Qué la sustituye
| Vía | Qué es | Notas para nosotros |
|---|---|---|
| **Data Manager API** (`events.ingest`) | API principal de Google para eventos offline, listas de clientes, etc. | Proyecto de Google Cloud; hashing SHA-256 normalizado de email/teléfono; cifrado opcional; `validateOnly` para probar; `requestStatus.retrieve` para ver diagnóstico asíncrono [DOC https://developers.google.com/data-manager/api/devguides/events/google-ads/offline] |
| **Data Manager (interfaz en Google Ads)** | Conectores sin código | Fuentes: Cloud Storage, S3, HTTP, SFTP, Google Sheets (importa los **últimos 90 días** cada vez); Salesforce y HubSpot (14 días la primera vez, luego cambios); **BigQuery, Redshift, Snowflake, MySQL y PostgreSQL** (los **últimos 14 días** en cada ejecución) [DOC https://support.google.com/google-ads/answer/11021502] |
| **Conversiones mejoradas para leads** (enhanced conversions for leads) | Versión mejorada de la importación offline: datos de usuario con hash + GCLID si existe | Google la recomienda para **nuevos adoptantes** en lugar de la importación clásica. Desde **abril 2026** web y leads son un único ajuste [DOC .../answer/2998031, .../answer/14274408] |
| Subida de archivo (legacy) | CSV manual | Sigue listada como «legacy» [DOC .../answer/2998031] |
| Zapier | Conector de terceros | Listado por Google [DOC] |

**Requisitos de conversiones mejoradas para leads** [DOC .../answer/14274408 y .../answer/11021502]:
- GCLID **obligatorio si no hay etiqueta** que recoja los datos de usuario; con etiqueta, igualmente *«include GCLIDs … whenever possible»*.
- Al menos uno de: email, teléfono o dirección. Nombre de la conversión, hora y objetivo (Google recomienda objetivos «lead cualificado»
  o «lead convertido»). Recomendados: Order ID, valor, moneda, consentimiento, atributos de sesión.
- Aceptar las condiciones de datos de clientes (si las conversiones se miden desde la MCC, **aceptarlas en la MCC**).
- Migración desde una importación existente: tener ambas acciones en paralelo y, tras **el mayor de 3 ciclos de conversión o 4 semanas**
  (otra página dice 1-2 ciclos o 4 semanas), poner la nueva como principal y la antigua como secundaria [DOC .../answer/15479791].
- Con GBRAID/WBRAID, el recuento debe estar en «Todas» o la subida puede fallar [DOC .../answer/15479791].

**Diferencias de comportamiento Data Manager API vs. API de Google Ads** [DOC
https://developers.google.com/data-manager/api/devguides/events/google-ads/offline/upgrade]:
- **Ajustes**: un evento con un `transaction_id` existente se trata como ajuste; no hace falta tipo de ajuste.
- **Retracciones: NO soportadas.** *«You can restate the value of a conversion, but the conversion count will remain the same.»*
  → Un lead que resulta spam y ya se subió como «cualificado» **no se puede retirar**: hay que filtrar **antes** de subir.
- **Fast-fail** en vez de fallo parcial: un registro malo puede rechazar el lote. Validar fila a fila antes.
- `operating_account` debe ser la cuenta **dueña de la acción de conversión** (no vale la MCC ni una cuenta hija como en la API de Ads).
- Las cuotas son por proyecto de Google Cloud. La página dice que, habilitada la API, solo se gestionan cuentas de prueba de Google Ads y
  que para producción hace falta acceso Explorer/Basic/Standard [DOC, redacción ambigua: **comprobar** si exige el nivel de acceso del
  token de desarrollador de la MCC — es justo lo que aún no tenemos].

### 1.3 Consecuencias para GoHighLevel (GHL) y nuestro módulo
- La integración nativa de GHL con Google Ads, si GHL ya subía conversiones con **su** token antes de junio, puede seguir funcionando
  durante la transición (es «adoptante existente») [inferencia, NV: no he leído la documentación de GHL en esta sesión].
- **Nuestra herramienta** (token nuevo) es nuevo adoptante → **Data Manager API** o **conector PostgreSQL de Data Manager**.
- Opción de bajo esfuerzo y alto valor (a validar): una **vista en nuestra PostgreSQL** con los leads cualificados (GCLID, email/teléfono
  con hash, hora, valor, acción) que Data Manager lea cada día. Cero código de API para la subida; la lógica de calificación queda en
  nuestro lado. Riesgos: exponer la BD a Google (usuario de solo lectura, IP/SSL), y la ventana de 14 días (un lead que se cualifica a
  los 20 días se pierde → para ciclos largos, API o Sheets/SFTP con 90 días).
- Como no hay retracciones, el agente debe **subir solo lo que pase un filtro anti-spam** (teléfono válido, no duplicado, no marcado
  como spam en GHL) y con un retraso mínimo prudente (p. ej. 24-48 h) [propuesta propia].

### 1.4 Consentimiento en el EEE (afecta a todo lo anterior)
- Modo de consentimiento **básico**: si no hay consentimiento, no se envía nada a Google, ni siquiera el estado; **avanzado**: pings sin
  cookies y modelado específico del anunciante (más detallado) [DOC https://support.google.com/google-ads/answer/10000067].
- La página no da el umbral de datos para el modelado (el conocido «700 clics en 7 días por país y dominio» **no aparece** ahí) [NV].
- Para el módulo: el agente debe saber si cada web tiene modo de consentimiento básico o avanzado (lo puede detectar el rastreador SEO
  leyendo la etiqueta) porque cambia cuántas conversiones «faltan» y explica caídas de conversiones tras cambiar el banner de cookies.

---

## 2. Políticas de Google Ads aplicables en España (sectores restringidos) — leídas en las páginas oficiales

### 2.1 Servicios locales [DOC https://support.google.com/adspolicy/answer/13527633 y .../answer/15303051]
| País | Restricción |
|---|---|
| **España** | *«Los anuncios de servicios de cerrajería están restringidos en España. No se pueden publicar anuncios.»* En vigor desde el **4 nov 2024**. |
| **Países Bajos** | Fontanería **y** cerrajería restringidas: no se puede anunciar. |
| Alemania, Bélgica, Suecia | Cerrajería restringida: no se puede anunciar. |
| EE. UU. | Cerrajería y puertas de garaje: verificación avanzada. Canadá: cerrajería con verificación avanzada. |
- En España **no** aparecen restringidos (en el texto leído) fontanería, electrodomésticos, plagas, mudanzas, grúas. Ojo: un cliente de
  «urgencias del hogar» que mezcle cerrajería con fontanería en la landing puede ver rechazados todos los anuncios que apunten ahí.
  Remedio documentado: cambiar la URL final a una parte del sitio que cumpla; apelar si es error. Aviso ≥7 días antes de suspender.
- «Otros negocios restringidos» [DOC .../answer/6368711]: prohibidos **soporte técnico de terceros**, **servicios de grabación, desvío y
  directorio de llamadas** y **fianzas judiciales**; documentos oficiales solo para gobiernos/proveedores autorizados (los privados deben
  decir que no están afiliados); servicios de citas con certificación; alimentos HFSS restringidos en Display y YouTube en la UE.

### 2.2 Sanidad y medicamentos [DOC https://support.google.com/adspolicy/answer/176031 (es/en)]
- **España** solo tiene entrada específica para **telemedicina**: se permiten servicios de medicamentos con receta de proveedores de
  telesalud **certificados por LegitScript** y además **certificados por Google**; *«Advertisers cannot promote prescription drugs in their
  ads and landing pages.»*
- Medicamentos con receta: no se pueden promocionar en anuncios ni landing (España). Términos de medicamentos restringidos: controlados
  en anuncio, landing **y palabras clave**.
- Adicciones: solo servicios de rehabilitación y con certificación (la versión es menciona entidades públicas; matiz a verificar) [DOC].
- Tratamientos especulativos o experimentales: no permitidos; terapias celulares/génicas solo excepción en EE. UU. [DOC].
- Farmacias online en España: la página **no** tiene regla específica; la regla general pide certificación [DOC, ausencia].
- **Medicina estética, bótox, inyectables, cirugía estética: la política de sanidad no los menciona** [DOC, ausencia]. Lo que les afecta:
  (a) política de **contenido sexual** si las imágenes muestran zonas íntimas o el pecho como foco [DOC .../answer/6023699]; (b) la
  toxina botulínica es medicamento con receta en España → nombrarla como producto («Botox») puede caer en «términos de medicamentos
  restringidos» [NV: no comprobado caso a caso; práctica de agencias: hablar de «tratamiento de arrugas de expresión»].

### 2.3 Publicidad personalizada (remarketing) [DOC https://support.google.com/adspolicy/answer/143465]
- Categorías sensibles (sin calificador regional en la página, es decir, de aplicación general): entre otras **Salud**, **Situación
  financiera negativa**, Anticoncepción, Reclutamiento para ensayos clínicos, Términos de medicamentos restringidos, Juego, Alcohol,
  Dificultades en las relaciones.
- Si los anuncios caen en una categoría sensible: **no se pueden usar audiencias seleccionadas por el anunciante** (Customer Match /
  listas de clientes, tus segmentos de datos, segmentos similares, expansión de audiencia). **Sí** se pueden usar las audiencias
  predefinidas de Google (en el mercado, afinidad, eventos vitales) y la ubicación.
- «Acceso a oportunidades» (vivienda, empleo, banca de consumo): **solo EE. UU. y Canadá** → no aplica a inmobiliarias españolas.
- Conclusión práctica para clínicas: el remarketing con lista de visitantes en una campaña de **tratamiento médico** es arriesgado; para
  una clínica dental el criterio de Google es el contenido del anuncio/landing (salud) [DOC; aplicación concreta a dental = NV].

### 2.4 Servicios financieros [DOC https://support.google.com/adspolicy/answer/2464998 y .../answer/15332527]
- **España requiere verificación de servicios financieros**: el anunciante debe demostrar licencia del regulador financiero español
  correspondiente (o exención) mediante verificación de terceros con **G2RS**; los datos deben coincidir *exactamente* con los registros
  españoles; se envía el código G2RS a Google por formulario; lo presenta un representante autorizado. La lista de reguladores españoles
  está en otra página (no leída: previsiblemente Banco de España, CNMV y DGSFP [NV]).
- Generales: avisos visibles sin clic; dirección física; tarifas. **Préstamos personales: plazo de devolución ≥61 días**; en la landing,
  plazo mínimo y máximo, TAE máxima y ejemplo representativo. Prohibido: reparación de historial crediticio, opciones binarias;
  CFD/Forex solo con licencia y aprobación; negociación de deudas solo en ciertas ubicaciones con certificación; criptomonedas con
  certificación según país. Aviso ≥7 días antes de suspensión.
- Ley española añadida (no Google): publicidad de productos bancarios (Circular 4/2020 del Banco de España) y crédito al consumo (TAE
  y ejemplo representativo) [NV, no leído hoy].

### 2.5 Servicios legales (abogados)
- Google **no tiene** política específica de abogados; aplica «Requisitos legales» (cumplir la ley local del país de destino)
  [DOC https://support.google.com/adspolicy/answer/6023676] e «Información engañosa» (prohibido presentar como probable un resultado
  improbable) [DOC https://support.google.com/adspolicy/answer/6020955].
- **Ley española [DOC BOE https://www.boe.es/eli/es/rd/2021/03/02/135, art. 20.2 del Estatuto General de la Abogacía]**: la publicidad no
  puede suponer: revelar hechos bajo secreto profesional; **incitar al pleito**; **ofrecer servicios a víctimas directas o indirectas de
  accidentes** (por sí o mediante terceros); **prometer resultados** que no dependan solo del abogado; citar clientes sin autorización;
  usar emblemas colegiales. → Textos tipo «Ganamos tu caso», «Recupera tu indemnización garantizada» o campañas dirigidas a
  «accidente de tráfico [ciudad]» con oferta directa son riesgo deontológico (no de Google).

### 2.6 Salud: ley española de publicidad sanitaria [DOC BOE https://www.boe.es/eli/es/rd/1996/08/02/1907]
RD 1907/1996, art. 4 (prohibiciones), art. 5 (profesionales) y art. 6 (centros):
- Prohibido: dar *«seguridades de alivio o curación cierta»* (4.4); usar *«testimonios de profesionales sanitarios, de personas famosas
  o conocidas por el público»* (4.7); usar autorizaciones sanitarias como aval (4.5); sugerir que sustituye la consulta (4.15);
  propiedades adelgazantes (4.2); efectos sin pruebas científicas suficientes (4.16).
- **Art. 6: la publicidad de centros sanitarios, de belleza, adelgazamiento o estéticos debe ajustarse a su autorización sanitaria;
  cualquier otra requiere autorización previa y expresa** de las autoridades sanitarias. Infracción grave (art. 8).
- Implicación: un anuncio de clínica estética con «resultados garantizados», un médico famoso como reclamo o un tratamiento no incluido
  en su autorización sanitaria incumple la ley aunque Google lo apruebe. Algunas comunidades autónomas exigen además autorización previa
  de publicidad sanitaria [NV: no leído hoy, comprobar por CCAA].

### 2.7 Checklist de sector regulado para el agente (propuesta)
| Sector (ficha del cliente) | Comprobaciones automáticas |
|---|---|
| Cerrajería (ES, NL, DE, BE, SE) / fontanería (NL) | Bloquear propuestas de campaña; avisar si la landing mezcla cerrajería |
| Clínica médica/dental/estética | Sin Customer Match ni segmentos propios en anuncios de salud; vetar palabras «garantizado», «cura», «sin dolor 100 %», nombres de fármacos con receta; no usar testimonios de médicos/famosos; avisar si el tratamiento anunciado no es de la cartera autorizada |
| Telemedicina con receta | Requiere LegitScript + certificación de Google |
| Financiero (préstamos, seguros, inversión) | Verificación G2RS hecha; TAE y ejemplo representativo en landing; plazo ≥61 días |
| Abogados | Vetar promesas de resultado y captación a víctimas de accidentes; revisar textos generados por AI Max/personalización con «text guidelines» |
| Todos | Los recursos generados automáticamente y AI Max pueden escribir frases que incumplan lo anterior → exclusiones de términos en «text guidelines» |

---

## 3. Lo que se pudo leer en otros idiomas (corto — ver nota de método)

- **Francés — Abondance (25 nov 2026)**: método SEA→SEO/GEO con el informe de términos de búsqueda: exportar 3-6 meses; aislar consultas
  largas e interrogativas (≥6 palabras; «comment», «combien», «quel»…); agrupar por intención (problema + restricciones: presupuesto,
  lugar, plazo); cruzar con conversiones; **confrontar con Search Console**: una pregunta frecuente en Ads sin página orgánica = hueco de
  contenido; si Google manda preguntas precisas a una página genérica, falta una página específica. Propone un intercambio **mensual**
  SEA↔SEO de las consultas AI Max, y que las nuevas páginas sirvan de mejores destinos para la expansión de URL de AI Max. Según el
  artículo, las consultas en AI Mode son de media **3× más largas**, y las campañas migran a AI Max desde sep 2026 y DSA desde feb 2027
  [EXP https://www.abondance.com/20261125-3104114-google-ads-rapport-termes-recherche-strategie-seo-geo.html].
  → **Encaja de lleno con nuestro módulo SEO** (ya tenemos Search Console y mapa de palabras).
- **Alemán/austriaco — smarter-ecommerce (smec, Linz)**: los datos de fin de la supresión de pujas y prioridad de canal (apartados 5.2 y
  5.3). Orientado a e-commerce, pero la mecánica afecta igual a tCPA de leads.
- **Alemán — fraud0**: herramienta europea (precios en euros) que audita tráfico inválido y **reclama reembolsos** a Google (dice
  recuperar «hasta el 10 %» del gasto); excluye IP, audiencias negativas y ubicaciones MFA en PMax. Su FAQ afirma que nunca han visto
  0 % de tráfico fraudulento («1 %-100 %») [EXP vendedor, https://fraud0.com/]. Idea: el agente puede detectar señales de clic inválido
  (picos de clics sin sesión en GA4/Clarity, misma IP) y preparar la reclamación con datos.
- **Neerlandés — AdCalls**: seguimiento de llamadas dinámico y «offsite» líder en NL (Emerce 100 durante 10 años); un cliente afirma que el
  **40 % de sus leads eran llamadas** [EXP vendedor, https://www.adcalls.nl/]. Recordatorio de que sin seguimiento de llamadas el CPL de
  un negocio local puede estar sobrestimado. Frankwatching (NL) solo tenía un artículo de estructura de 2020 [lectura índice].
- **Portugués (Brasil) — Tintim**: herramienta para atribuir conversaciones de **WhatsApp** a campaña/anuncio (Meta automático; Google
  Ads: informes «listos para importar», sin envío automático en el plan visto); plan con envío a Google Ads ~R$ 297/mes. Limitación
  declarada: el origen solo se capta desde el primer mensaje del lead [EXP vendedor, https://tintim.app/]. En LatAm el lead por WhatsApp
  es la conversión principal; en España crece (la agencia ya mide WhatsApp).
- **Estrategias de agencias DE/FR/NL/ES sin fuente leída hoy [NV, conocimiento previo, verificar]:**
  - DE: la puja por marcas ajenas es legal si el anuncio no confunde sobre el origen (TJUE *Google France*, 2010; BGH *Bananabay II*,
    2011); algunos sectores pactan «no pujar por la marca del otro» (cuidado: estos pactos pueden ser anticompetitivos).
  - DE/AT: uso intensivo de herramientas de pujas y feeds propias (Adspert, smec Whoop, Adference) y de modo de consentimiento avanzado
    por el alto porcentaje de rechazo de cookies en Alemania.
  - FR: los médicos tienen publicidad muy limitada por el código deontológico (solo información desde 2020).
  - ES: las agencias de leads locales usan mucho extensiones de llamada + formulario corto + WhatsApp, y listas negativas por sector
    («gratis», «curso», «trabajo», «oposiciones», «segunda mano», «pdf»).

---

## 4. Benchmarks de CTR, CPC, CR y CPL

### 4.1 Lo que hay (y por qué no sirve tal cual)
**No encontré benchmarks públicos de España ni de Europa por sector (2024-2026).** Ni las fuentes españolas leídas ni los índices
alemanes/neerlandeses los tenían. Lo más cercano:

**LocaliQ / WordStream «Search advertising benchmarks» (1 jun 2026)** — sin país indicado (clientes de LocaliQ/WordStream, presumiblemente
EE. UU.), Google + Microsoft Ads [EXP https://localiq.com/blog/search-advertising-benchmarks/]:

| Sector | CPC | CTR | CVR | CPL |
|---|---|---|---|---|
| Dentistas | 8,00 $ | 5,66 % | 10,67 % | 72,97 $ |
| Médicos y cirujanos | 4,76 $ | 6,61 % | 12,43 % | 40,04 $ |
| Abogados | 9,87 $ | 5,87 % | 5,55 % | 131,63 $ |
| Hogar y reformas | 8,33 $ | 6,47 % | 8,05 % | 90,92 $ |
| Inmobiliaria | 3,22 $ | 7,61 % | 3,70 % | 102,51 $ |
| Educación | 4,81 $ | 7,56 % | 13,14 % | 77,48 $ |
| Finanzas y seguros | 3,39 $ | 9,83 % | 2,64 % | 74,44 $ |
| Belleza y cuidado personal | 4,62 $ | 6,75 % | 10,35 % | 39,25 $ |
| Automoción y taller | 4,35 $ | 5,56 % | 15,51 % | 29,96 $ |
| **Media** | **5,42 $** | **6,64 %** | **8,18 %** | **66,69 $** |

**Optmyzr, CTR mediano por vertical, Q3 2026** (20.000+ cuentas, 250.000+ campañas; mediana por cuenta) [EXP
https://www.optmyzr.com/blog/what-is-a-good-ctr-for-google-ads/]: inmobiliaria 6,2 % (+13 % interanual), salud y fitness 6,1 % (+12,1 %),
hogar y jardín 4,7 % (+9,8 %), automoción 3,4 %; media 4,8 % (+14 %). CTR sube en todos los verticales mientras el ROAS mediano cae
(−2,9 % trimestral, segundo trimestre seguido) → *«CTR is no longer a useful health check»* (Ann Stanley). El informe completo incluye por
primera vez **Alemania, Reino Unido y Países Bajos**, pero las cifras por país están **tras formulario** [EXP
https://www.optmyzr.com/blog/state-of-google-ads-q3-2026/].

**Optmyzr Q1 2026** (21.425 cuentas, Q1 2025→Q1 2026): impresiones totales **−11 %** (45,9 → 40,25 mil millones), CTR 1,83 % → 2,22 %,
CVR 6,26 % → 6,20 %, CPA 12,70 $ → 13,27 $ [EXP https://www.optmyzr.com/blog/google-ads-benchmark-report-q1-2026/]. Lectura: menos
impresiones (AI Overviews/AI Mode), más CTR, conversión estable → el mercado de clics se encarece poco a poco.

Storegrowers recopila tablas de WordStream de **2016/2019** (obsoletas) [EXP https://www.storegrowers.com/google-ads-benchmarks/]; Databox
(oct 2023, sin país): CTR Google Ads salud 7,71 %, CPC salud 3,64 $ [EXP https://databox.com/ppc-industry-benchmarks].

### 4.2 Cómo usarlo (propuesta)
- Los CPC de EE. UU. **no** son trasladables: en España los CPC de servicios locales suelen ser bastante menores [NV, experiencia común].
  Los **ratios** (CTR, CVR) son más transferibles que los importes.
- CTR como métrica de salud pierde valor (Optmyzr): el agente debe juzgar por **CPL cualificado** y **cuota de impresiones**, no por CTR.
- **Benchmark propio**: con 25+ cuentas, la herramienta puede calcular medianas por sector × provincia × tipo de campaña (anonimizado
  dentro de la agencia) y comparar cada cuenta contra «sus pares». Ninguna fuente pública da esto para España.
- Para CPC esperados por palabra y provincia: Keyword Planner vía API (cuando haya token) o DataForSEO (ya conectado: da CPC de Google Ads
  por palabra y ubicación) [DataForSEO ya está en la herramienta; exactitud de su CPC = NV].

---

## 5. Convivir con Smart Bidding: palancas que le quedan al gestor

### 5.1 Qué ajustes manuales siguen funcionando [DOC https://support.google.com/google-ads/answer/2732132]
- Con Smart Bidding, *«If you make a manual bid adjustment … it won't be supported»*, salvo:
  - **Dispositivo: solo −100 %** en tROAS, Maximizar conversiones, Maximizar valor y Cuota de impresiones objetivo.
  - **En tCPA, el ajuste por dispositivo se trata como ajuste del objetivo** (p. ej. −30 % en móvil = tCPA móvil un 30 % menor). Es la
    única forma oficial de tener un CPA distinto por dispositivo sin partir la campaña.
  - **Programación de anuncios**: se respeta como encendido/apagado; los % por franja no se usan.
  - Ubicación, audiencias, demografía, llamadas: sin efecto en la puja.
- Rangos (para CPC manual/Maximizar clics): dispositivo −100 % a +900 %; resto −90 % a +900 %.

### 5.2 Mapa de palancas reales (con su efecto documentado)
| Palanca | Efecto | Reinicia aprendizaje | Fuente |
|---|---|---|---|
| Objetivo tCPA/tROAS | Desde 17 ago 2026 el resultado real sigue al objetivo también con presupuesto limitado | No | [DOC 09 + EXP smec] |
| Presupuesto | Más volumen; si deja de estar limitada, bajan CPC (smec: −13 % en no limitadas) | No | [DOC/EXP] |
| Acción de conversión principal y valores | Cambia lo que se optimiza; la palanca más potente en leads (lead cualificado con valor) | Sí, si es cambio significativo | [DOC 09] |
| Reglas de valor de conversión | Valorar más/menos por ubicación, dispositivo o audiencia (sustituto de los ajustes de puja) | — | [NV: no releído hoy] |
| Ajuste de estacionalidad | Solo cambios grandes y breves (**1-7 días; mal >14 días**); no hace falta ajuste negativo al terminar; **se puede crear desde la MCC** para varias cuentas | No | [DOC https://support.google.com/google-ads/answer/10369906] |
| Exclusión de datos | Fallos de medición | No | [DOC 09] |
| Prioridad de canal + tope | Reparte presupuesto Search/Partners/Display (y Google channels en PMax) | NV | [EXP smec, 5.3] |
| Negativas, exclusiones de marca/URL/ubicación | Lo que puede entrar en la subasta | No | [DOC 09] |
| Programación horaria y ubicación (*on/off*) | Dónde/cuándo se puede servir | No | [DOC] |
| Dispositivo −100 % / ajuste de tCPA por dispositivo | Excluir o fijar CPA distinto | NV | [DOC] |
| Estructura (cartera, fusiones) | Datos por estrategia | Sí | [DOC 09] |
| Creatividad y landing | Ranking, CVR | No | [DOC 09] |

### 5.3 Cambios de 2026 que mueven las palancas
**a) Fin de la «supresión de pujas» (17 ago 2026)** [EXP smec, datos propios de clientes;
https://smarter-ecommerce.com/blog/en/google-ads/google-ends-its-bid-suppression-era-what-it-means-for-your-roas/ y
https://smarter-ecommerce.com/blog/en/google-ads/budget-limited-campaigns-after-august-17-the-roas-data/]:
- Antes, Google bajaba pujas automáticamente cuando la campaña estaba limitada por presupuesto (cita de Google: *«the system automatically
  decreases bids to avoid hitting the budget cap»*). Por eso las limitadas daban mejor ROAS que su objetivo: el **55 %** lo superaba
  (vs. ~30 % de las no limitadas), con exceso mediano ~20 %.
- Después: CPC mediano de limitadas **+15,8 %** (0,38 → 0,44 €); no limitadas **−13 %**; cuota de impresiones 40 % → 31 %; cuota perdida por
  ranking 45 % → ~30 %, por presupuesto 4 % → ~33 %. El exceso de ROAS llegó a ~0 en 3 semanas. Caso: retail británico CPC +44 % en una
  semana. Un 15-25 % de las campañas están limitadas por presupuesto.
- Muchos anunciantes **subieron el tROAS ~12 %** justo antes (para defenderse) y siguen así dos meses después.
- Palancas que proponen: no hacer nada (CPC sube, alcance baja); **acercar el objetivo al real**; subir presupuesto; pasar a Maximizar
  conversiones (no puede estar «limitada»).
- **Para leads (tCPA)**: no hay datos publicados; es razonable esperar el mismo efecto (inferencia). **Alerta para el módulo**: en
  campañas tCPA limitadas por presupuesto, un aumento de CPC desde agosto 2026 con CPL ≈ tCPA **no es un fallo**, es el nuevo diseño.

**b) Prioridad de canal (anunciada 14 oct 2026; despliegue gradual)** [EXP smec
https://smarter-ecommerce.com/blog/en/google-ads/google-ads-channel-prioritization-budget-allocation/; no localicé la página de ayuda
de Google — verificar]:
- Por cuenta, presupuesto compartido o campaña (no desde la MCC; API y Editor «próximamente»).
- Search: Google Search, Search Partners, Red de Display; PMax: «Google channels» (Search+YouTube+Maps+Gmail+Discover juntos), Search
  Partners, Display; Demand Gen: Google channels, Display (sin tope).
- Prioridad baja = solo recibe presupuesto cuando los de prioridad alta ya gastaron. **Tope de asignación** = % máximo del presupuesto
  diario medio para el canal bajo; **0 % = no gasta**; es «best effort», se reinicia cada día, y aplica aunque una campaña con objetivo
  no esté limitada.
- Con tCPA/tROAS la prioridad solo importa si la campaña está limitada por presupuesto; con Maximizar/CPC manual/Cuota de impresiones
  afecta siempre.
- **Febrero 2027**: desaparece el reparto fijo e invisible del **50 %** de la expansión a Display en Search → el gasto podría moverse hacia
  Display; las campañas de **Cuota de impresiones objetivo dejan de servir en Display**; los ajustes nuevos nacen en prioridad alta.
- Recomendación de smec: listar campañas Search con expansión a Display; poner Display en baja con 50 % (o menos); en PMax de leads,
  Display y Search Partners en baja con tope 0 % si no se quieren.
- **Para nuestras cuentas de leads**: tarea de auditoría antes de feb 2027 (y oportunidad de controlar el Display de PMax, la queja nº 1
  de leads basura).

**c) DSA → AI Max**: Google retrasó la retirada de DSA (prevista sep 2026; anuncio del 11 jun 2026) y las **actualizará automáticamente a
AI Max a partir de feb 2027**. Google cita +14 % conversiones/valor a CPA/ROAS similar al activar AI Max, +27 % en campañas sobre todo de
exacta y frase (datos de Google, anunciantes no retail) [EXP smec que cita a Google,
https://smarter-ecommerce.com/blog/en/google-ads/ai-max-vs-dsa-pmax-vs-shopping-troas-vs-max-conversion-value/]. smec prefiere tROAS a
Maximizar valor sin objetivo (el objetivo actúa como barandilla).

### 5.4 Qué hacen los gestores a mano hoy (y qué automatizar) [EXP Optmyzr https://www.optmyzr.com/blog/google-ads-manual-work-study/]
- 72.358 cuentas, 578 M de cambios (feb-jul 2026): **10,8 %** manuales; **~90 % de lo manual = segmentación** (palabras, negativas);
  pausar/activar palabras: 132.000 sesiones, mediana **30 cambios por sesión**; presupuestos: 1 % del volumen pero **130.800 sesiones** en
  20.141 cuentas (la tarea más repetida). ~44 personas a jornada completa de trabajo manual en 6 meses (~1,8 M$ a 40 $/h).
- Encuesta informal (64 profesionales): 40 % no confía en la automatización con presupuestos de clientes; 34 % costumbre; 13 % el cliente
  lo espera; 10 % las herramientas no hacen lo que necesitan.
- Lectura para el módulo: lo que Eury hace (términos, pausar, CPL) es exactamente el 90 % manual del mercado. **El agente debe empezar
  por términos de búsqueda/negativas y presupuestos**, y ganarse la confianza explicando cada propuesta (barrera nº 1).

---

## 6. Escalado y estacionalidad por sector

### 6.1 Escalado (complementa 09 §5.2)
- Escalar **antes** de que la campaña esté limitada: tras el 17 ago 2026 estar limitado por presupuesto sube el CPC (smec). Regla
  propuesta: si «perdida por presupuesto» > 10-15 % y CPL ≤ objetivo → proponer subida de presupuesto; si CPL > objetivo y limitada →
  bajar ámbito (zonas/servicios peores) o pasar a Maximizar conversiones con un tCPA realista, no recortar el objetivo a ciegas.
- Escalar por objetivo: con la nueva mecánica, el objetivo es un «mando de volumen» fiable (smec): subir tCPA un 10-15 % = más volumen a
  CPL ≈ nuevo objetivo.
- Escalar con Display/Partners: ahora controlable por prioridad de canal (probar con tope bajo, no por defecto).

### 6.2 Estacionalidad por sector (España) [NV salvo indicación — patrones de práctica, sin fuente leída hoy]
| Sector | Picos | Valles | Acción |
|---|---|---|---|
| Clínica dental / estética | Ene-mar (propósitos), sep-oct (vuelta) | Agosto, Navidad | No usar ajuste de estacionalidad para picos anuales (Smart Bidding ya los modela [DOC 10369906]); sí presupuesto |
| Climatización | Jun-ago (aire), nov-ene (calefacción) | Primavera/otoño | Presupuestos estacionales; ojo a las olas de calor (pico de 3-7 días → ajuste de estacionalidad sí encaja) |
| Reformas | Ene-may | Agosto, diciembre | Presupuesto |
| Academias/formación | Ago-oct, enero | Mayo-julio salvo verano | Ya en 09 |
| Abogados (laboral, divorcio) | Enero, septiembre | Agosto | Presupuesto |
| Fiscal/gestorías | Abril-junio (renta), trimestres | — | Ajuste de estacionalidad solo si cambio brusco |
| Urgencias hogar | Lluvias/heladas (sucesos breves) | — | Ajuste de estacionalidad 1-3 días |
- **Ajuste de estacionalidad desde la MCC** para varias cuentas a la vez [DOC 10369906] → nuestro agente puede proponer «ola de calor:
  +X % CVR en clientes de climatización de la provincia afectada» (cruce con meteorología = nadie lo hace).
- Para saber la estacionalidad real de cada cliente ya tenemos **GSC + GA4 + GBP con histórico diario**: la estacionalidad de la demanda
  orgánica predice la de Ads sin esperar a tener historial de campaña.

---

## 7. Competencia e informe de subastas (complementa 09 §6)
- Tras el 17 ago 2026, **la cuota perdida por presupuesto creció y la perdida por ranking bajó** en limitadas (smec) → un cambio brusco
  de esas dos métricas en ago-sep 2026 **no indica un competidor nuevo**. El motor de causas debe fechar este cambio.
- Cuota de impresiones: no incluye Search Partners; los datos tardan **24-48 h** [DOC https://support.google.com/google-ads/answer/2497703]
  → no alertar de «caída de cuota» con datos de ayer.
- Menos impresiones totales en el mercado (Optmyzr −11 % interanual en Q1 2026) por AI Overviews/AI Mode: una bajada de impresiones con
  cuota estable es **mercado**, no competencia.
- Puja por marca ajena (UE): legal si no confunde sobre el origen [NV TJUE 2010]; en abogados y salud, además, cuidado con comparaciones
  (art. 20 abogacía; publicidad comparativa en Ley General de Publicidad [NV]).
- Clic inválido: herramientas europeas (fraud0) piden reembolsos; Google exige pruebas. El agente puede preparar el expediente cruzando
  clics de Ads con sesiones GA4/Clarity [propuesta].

---

## Ideas para nuestro módulo

1. **Subida de conversiones por Data Manager, no por la API de Ads** (obligado por el bloqueo del 15 jun 2026). Dos vías a decidir con el
   protocolo de decisión: (a) Data Manager API desde la herramienta; (b) **conector PostgreSQL de Data Manager** leyendo una vista de solo
   lectura con leads cualificados de GHL (últimos 14 días). Filtro anti-spam **antes** de subir (no hay retracciones).
2. **Comprobador de modo de consentimiento** por web (básico/avanzado) con el rastreador SEO; explica caídas de conversiones.
3. **Checklist de sector regulado** (tabla §2.7) activado por la ficha del cliente, que veta textos (incluidos los que genere AI Max) y
   audiencias propias en salud, y bloquea cerrajería en ES/DE/BE/SE/NL.
4. **Auditoría «prioridad de canal» antes de feb 2027**: listar campañas con expansión a Display y PMax sin tope; proponer prioridad baja.
5. **Detector «efecto 17 de agosto»**: campañas tCPA/tROAS limitadas por presupuesto con CPC al alza desde ago 2026 → explicación +
   palancas (acercar objetivo, subir presupuesto, Maximizar conversiones).
6. **Ajuste por dispositivo como tCPA diferencial** (único mando oficial) cuando el CPL cualificado móvil/escritorio diverge de forma estable.
7. **Ajustes de estacionalidad desde la MCC** disparados por sucesos (meteorología, festivos locales, campañas de renta) y por la curva de
   GSC del cliente.
8. **Benchmark interno** por sector × provincia × tipo de campaña con nuestras cuentas (mediana y percentiles), sustituyendo los benchmarks
   de EE. UU.
9. **Puente SEA→SEO mensual** (método Abondance): consultas largas que convierten en Ads sin página orgánica → encargo de contenido en el
   módulo SEO; nueva página → mejor destino para AI Max.
10. **Expediente de clic inválido** (Ads × GA4 × Clarity) listo para pedir reembolso.
11. **Priorizar automatizar lo que más tiempo manual consume** (Optmyzr): términos/negativas, pausar en lote, presupuestos.

## Lo que nadie hace bien
- Integrar **ley española** (RD 1907/1996, Estatuto de la Abogacía) en la revisión de anuncios: Google solo mira sus políticas.
- Explicar el **cambio del 17 ago 2026** y la **prioridad de canal** como causas de variación, con fecha.
- Benchmarks **españoles** por sector y provincia: no existen públicamente.
- Atribución de **WhatsApp y llamadas** a palabra clave con subida a Google en España (lo hay en NL —AdCalls— y Brasil —Tintim—, pero
  fragmentado y sin conexión con la calidad del lead en el CRM).
- Usar la estacionalidad **orgánica** (GSC/GBP) para anticipar la de pago.

## Lo no verificado
- Si Data Manager API exige el nivel de acceso del token de desarrollador para cuentas de producción (redacción ambigua).
- Si la integración nativa de GoHighLevel sigue subiendo conversiones tras el 15 jun 2026.
- Si las llamadas importadas y los ajustes de conversión de la API de Ads también quedan bloqueados para nuevos adoptantes.
- Página de ayuda oficial de la «prioridad de canal» (solo fuente smec; Abondance confirma las fechas de AI Max/DSA).
- Efecto del 17 ago 2026 en **tCPA** de leads (solo hay datos de tROAS).
- Umbral de modelado del modo de consentimiento (700 clics/7 días).
- Lista de reguladores españoles en la verificación financiera; autorizaciones autonómicas de publicidad sanitaria; Circular 4/2020.
- Tratamiento de «Botox» como término de medicamento restringido.
- Todo el bloque de estrategias DE/FR/ES marcado [NV] en §3 y la tabla de estacionalidad §6.2.
- Benchmarks por país de Optmyzr Q3 2026 (tras formulario).

## Búsquedas pendientes (cuando haya presupuesto)
«Google Ads Benchmarks Deutschland 2026 Branche CPC», «coût par lead Google Ads France 2026 secteur», «Google Ads benchmarks Nederland
2026», «CPC medio Google Ads España 2026 sector clínica dental», «custo por lead Google Ads Brasil 2026», «publicidad sanitaria
autorización previa comunidad de Madrid / Cataluña», «Google Ads channel prioritization help center», «GoHighLevel Google Ads offline
conversions Data Manager 2026», «Search Engine Land AI Max 30 days testing» (en fuentes espejo).

## Fuentes (leídas en esta sesión)
**Google — documentación oficial**
- https://developers.google.com/ads/blog/posts/2026/05/changes-to-offline-click-conversion
- https://support.google.com/google-ads/answer/2998031
- https://support.google.com/google-ads/answer/15479791
- https://support.google.com/google-ads/answer/14274408
- https://support.google.com/google-ads/answer/11021502
- https://developers.google.com/data-manager/api/devguides/events/google-ads/offline
- https://developers.google.com/data-manager/api/devguides/events/google-ads/offline/upgrade
- https://support.google.com/google-ads/answer/10000067 (modo de consentimiento)
- https://support.google.com/google-ads/answer/2732132 (ajustes de puja)
- https://support.google.com/google-ads/answer/10369906 (estacionalidad)
- https://support.google.com/google-ads/answer/2497703 (cuota de impresiones)
- https://support.google.com/adspolicy/answer/13527633 (servicios locales) y https://support.google.com/adspolicy/answer/15303051
- https://support.google.com/adspolicy/answer/176031 (sanidad, es y en)
- https://support.google.com/adspolicy/answer/2464998 (financieros, es y en) y https://support.google.com/adspolicy/answer/15332527 (verificación)
- https://support.google.com/adspolicy/answer/143465 (publicidad personalizada, es y en)
- https://support.google.com/adspolicy/answer/6368711 (otros negocios restringidos)
- https://support.google.com/adspolicy/answer/6020955 (información engañosa)
- https://support.google.com/adspolicy/answer/6023676 (requisitos legales)
- https://support.google.com/adspolicy/answer/6023699 (contenido sexual)
- https://support.google.com/adspolicy/answer/6008942 (índice de políticas)

**Legislación española (BOE)**
- RD 1907/1996, publicidad con pretendida finalidad sanitaria: https://www.boe.es/eli/es/rd/1996/08/02/1907
- RD 135/2021, Estatuto General de la Abogacía (art. 20): https://www.boe.es/eli/es/rd/2021/03/02/135

**Terceros**
- smarter-ecommerce (AT): https://smarter-ecommerce.com/blog/en/google-ads/ (índice),
  .../budget-limited-campaigns-after-august-17-the-roas-data/, .../google-ends-its-bid-suppression-era-what-it-means-for-your-roas/,
  .../google-ads-channel-prioritization-budget-allocation/, .../ai-max-vs-dsa-pmax-vs-shopping-troas-vs-max-conversion-value/
- Optmyzr: https://www.optmyzr.com/blog/ (índice), .../state-of-google-ads-q3-2026/, .../what-is-a-good-ctr-for-google-ads/,
  .../google-ads-benchmark-report-q1-2026/, .../google-ads-manual-work-study/
- LocaliQ: https://localiq.com/blog/search-advertising-benchmarks/
- Storegrowers: https://www.storegrowers.com/google-ads-benchmarks/
- Databox: https://databox.com/ppc-industry-benchmarks
- Abondance (FR): https://www.abondance.com/20261125-3104114-google-ads-rapport-termes-recherche-strategie-seo-geo.html
- fraud0 (DE/UE): https://fraud0.com/
- AdCalls (NL): https://www.adcalls.nl/
- Tintim (BR): https://tintim.app/
- Índices leídos sin resultado útil: frankwatching.com (NL), t3n.de (DE), internetwarriors.de (DE), marketingandweb.es (ES),
  rdstation.com/blog (BR), ppc.land (portada y pág. 2), ppc-epiphany.com.
- Bloqueados/404: wordstream.com (403), adalysis.com, lunio.ai, wolfgangdigital.com, semrush.com/blog, humanlevel.com, cyberclick.es,
  bloofusion.de (rutas no encontradas).
