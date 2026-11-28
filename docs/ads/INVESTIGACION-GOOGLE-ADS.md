# Investigación Google Ads: cómo debe ser el agente de Kijutech

**Fecha:** 28 nov 2026 · **Estado:** documento de conclusiones para debatir con Enric (no es un diseño aprobado).
**Base:** los 11 informes de `docs/ads/investigacion/bruto/` (01 a 10 y 09b, unas 85.000 palabras), `HUECOS.md`, el PDF de
contraste de otra IA y `docs/ESTADO.md`.

**Cómo leerlo.** Las citas entre paréntesis remiten al informe interno, p. ej. «(05)» = `bruto/05-auditoria-diagnostico.md`;
las URL clave están en el apartado 12. Lo marcado **[opinión]** es criterio propio de quien firma este documento, no un hecho.
Lo marcado **[no verificado]** viene de fuentes secundarias o no se pudo comprobar. La estrella ★ señala lo que ninguna
herramienta del mercado hace bien según lo investigado. «PDF» remite al mapa de auditorías del informe de contraste
(A01-A06, P01-P06, E01-E06, C01-C06, D01-D06, X01-X05).

**Aviso de alcance.** Nada de lo que aquí se propone toca cuentas reales todavía. Cambiar pujas, presupuestos o anuncios en
cuentas de clientes es una línea roja del proyecto: el agente nace en **solo lectura** y cada paso hacia la escritura es una
decisión de Enric (apartado 11).

---

## 0. Resumen para Enric

**Qué hemos aprendido**

1. **El trabajo del mejor consultor ya no es mover pujas.** La máquina de Google ejecuta; el experto define el objetivo de
   negocio, le da datos buenos (lead cualificado del CRM, no «formulario enviado»), vigila y corrige. Vallaeys lo resume en
   tres papeles: médico (diagnostica), piloto (evita desastres) y profesor (entrena al algoritmo con mejores datos) (01).
2. **Lo que hace hoy Eury es exactamente el 90 % del trabajo manual del mercado** (términos, pausas, CPL), y es la capa más
   automatizable (09b, estudio de Optmyzr sobre 72.358 cuentas). Lo que no se hace hoy —medición auditada, calidad real del
   lead, cuota de impresiones, causa raíz, cambios de Google— es donde está el dinero.
3. **«2-3 días sin convertir» es una mala regla para la mayoría de vuestras campañas.** Una campaña que espera medio lead al
   día pasa 3 días a cero el 22 % de las veces por puro azar. Hay una fórmula sencilla (Poisson) que dice cuántos días a cero
   son anormales para cada campaña; ninguna herramienta la usa (05, 08).
4. **Ninguna herramienta del mercado cruza la cuenta de Google Ads con el CRM, la web, el SEO y la ficha del negocio.**
   Optmyzr, Adalysis, Opteo y TrueClicks solo ven la plataforma de anuncios y, como mucho, GA4 (02, 03, 10). Sus usuarios se
   quejan justo de eso: ruido sin priorizar, sugerencias sin contexto de negocio y umbrales pensados para cuentas grandes (10).
5. **Dos bloqueos que creíamos tener ya no existen como tales.** El «token de desarrollador» se retiró el 9 sep 2026: ahora
   se pide acceso por proyecto de Google Cloud (Explorer es automático y basta para leer 25-30 cuentas). Y subir leads
   cualificados a Google ya no va por la API de Ads sino por la Data Manager API, que no exige ese nivel de acceso (04, 10).
6. **Google ha cambiado las reglas en 2026 y casi nadie lo usa como causa en sus alertas:** desde el 17 ago las campañas con
   CPA objetivo limitadas por presupuesto pujan hasta el objetivo (CPC mediano +15,8 % en el estudio de smec); en feb 2027
   migran DSA a AI Max y el reparto a Display (09b, 10).

**Qué construiríamos** [opinión]

Un agente con cinco piezas, en este orden:

1. **Almacén propio** (`ads_*`): copia diaria de todo lo que Google borra o no guarda (historial de cambios, nivel de calidad,
   estado de Smart Bidding, términos, cuota de impresiones) enlazada con cliente, CRM, web y SEO.
2. **Motor de reglas y estadística en código** (sin IA): 120 capacidades con umbrales editables, adaptadas al volumen de
   cada cuenta.
3. **Motor de diagnóstico**: ante cualquier anomalía recorre un árbol fijo (¿es real?, ¿medición?, ¿cambio nuestro, del
   cliente o de Google?, ¿entrega?, descomposición del KPI) y entrega **una alerta por causa**, con evidencia y con lo
   descartado.
4. **Cola de propuestas** con impacto en euros, probabilidad y botón de aprobar o descartar con motivo. La IA redacta y juzga
   lo ambiguo; el código calcula y pone los límites.
5. **Memoria de resultados**: cada acción guarda su predicción y se mide después contra un control. Con 25+ cuentas, eso
   produce en meses algo que nadie tiene: qué funciona, en qué sector, con qué probabilidad.

**Por qué será mejor que Optmyzr, Adalysis, Opteo y TrueClicks** [opinión, razonada en los apartados 8 y 9]

| Ellos | Nosotros |
|---|---|
| Optimizan a «conversiones» de Google | Optimizamos a **lead cualificado y venta** del CRM, por término, red y campaña |
| Alertas por métrica («CPA +30 %») | **Una alerta por causa**, con el porqué y lo descartado |
| Umbrales fijos («150 clics sin conversión») | Probabilidades adaptadas al volumen, con el sector entero como referencia |
| Solo ven Google Ads | Ven la web caída, el formulario roto, la demanda orgánica, las reseñas, el horario y la zona |
| No miden si sus recomendaciones funcionan | Cada acción se evalúa y alimenta la siguiente |
| En inglés, calibradas para EE. UU. | En español, con festivos locales, ley española y benchmark propio |

**Decisiones que te tocan** (detalle en el apartado 11)

1. Crear el proyecto de Google Cloud, verificar la marca y añadir la cuenta de servicio a la MCC (desbloquea todo).
2. Aprobar el principio «solo lectura primero» y decidir qué categorías podrán aplicarse con un clic más adelante.
3. Decidir si ampliamos la conexión con GoHighLevel para guardar el identificador de clic y la etapa del lead (hoy no se
   guardan; sin eso no hay «coste por lead cualificado» por término ni subida de conversiones a Google). Tiene implicaciones
   de protección de datos.
4. Fijar por cliente qué es un «lead cualificado», quién lo marca en el CRM, y cuánto vale un lead.
5. Aceptar un informe programado de subastas (Auction Insights) a un buzón o hoja, porque la API no lo da.
6. Orden de construcción (propuesta al final del apartado 11).

---

## 1. Cómo trabaja el mejor consultor del mundo

### 1.1 Los ocho principios en los que casi todos coinciden

| # | Principio | Quién lo sostiene | Qué implica para el agente |
|---|---|---|---|
| 1 | **La medición manda.** Sin conversiones correctas y con valor, la automatización optimiza lo equivocado | Vallaeys (caso «Betty»), Lolk, Ani, Rooijmans (01); todas las checklists empiezan por ahí (05) | Ninguna recomendación de rendimiento si la medición no pasa su examen |
| 2 | **El humano define el objetivo y vigila; la máquina ejecuta** | Vallaeys («automation layering»), Rhodes (4C), Ryan (01) | El agente es nuestra capa encima de la de Google |
| 3 | **Diagnosticar la causa antes de reaccionar al síntoma** | Vallaeys: bajar pujas porque caen las conversiones cuando la causa era la pasarela rota (01) | Árbol de causa raíz obligatorio antes de proponer |
| 4 | **Separar marca de no marca** | Lolk, Ani, Geddes, Finn; solo el 3 % usa exclusión de marca en PMax (01) | Clasificar todo el tráfico en marca, genérico y competencia |
| 5 | **Volumen suficiente por campaña; consolidar antes que fragmentar** | Google, Lolk, smec, Optmyzr (01, 09) | Detectar campañas con datos insuficientes y proponer fusión |
| 6 | **No fiarse de las cifras de la plataforma sin cruzarlas con el negocio** | Lolk, Ryan, Ani (01) | Conciliación diaria Ads frente a CRM |
| 7 | **Ad Strength y nivel de optimización no son objetivos** | Optmyzr (1M+ anuncios sin correlación), Google mismo sobre el QS (01, 06) | No perseguir notas; medir resultado |
| 8 | **Agentes: solo lectura, luego sugerencias, luego acción con aprobación y registro** | Rooijmans, Wenner, Vallaeys, Williams, Leake (01, 07) | Patrón del apartado 5 |

### 1.2 Donde no se ponen de acuerdo (y qué decidimos)

| Tema | Posturas | Nuestra decisión [opinión] |
|---|---|---|
| **Performance Max en leads** | A favor con matices: Gales, Hopkins. En contra o con cautela: Williams («nunca peor que en 2025»), Rooijmans («maximiza tu gasto, no tu beneficio»), Lolk (01) | No recomendar PMax de leads hasta que Search convierta, haya ≥30 leads cualificados al mes y la conversión venga del CRM (Ani, ppc.io; 01, 05). El agente lo trata como «segunda fase» y audita marca, canales y URL |
| **AI Max** | Google: +14 % conversiones (y +27 % en campañas de exacta y frase). smec (250+ campañas): +13 % de valor, CPA +16 %, ROAS mediano 0 % con rango de +42 % a −35 %. Geddes: se apunta conversiones de tus exactas (01, 07, 09b) | Los informes internos se contradicen (el 03 habla de «ROAS ~35 % menor»; es el extremo del rango, no la mediana). Postura: nunca por defecto; solo como experimento 50/50 en no marca rentable y no limitada por presupuesto, midiendo lead cualificado |
| **Concordancia amplia** | Google la recomienda; Optmyzr 2023: exacta gana en ROAS en el 72,5 % de cuentas (01) | Amplia para descubrir, con negativas y conversión de calidad; exacta como grupo de control. En cuentas pequeñas, frase y exacta primero |
| **Poner objetivo (tCPA/tROAS) o no** | Optmyzr 2024: los objetivos empeoran más veces que mejoran. smec: el objetivo es una barandilla (01, 09b) | Desde el 17 ago 2026 el objetivo es un mando de volumen fiable: poner el que el negocio puede pagar, no el que «pide Google» (caso Rooijmans: bajar el tCPA de 300 a 220 hundió los leads de 20-30 a 6; 07) |
| **¿Cambiar presupuesto u objetivo reinicia el aprendizaje?** | Google: no dispara el estado «Aprendiendo» (09). Practicantes: cada cambio grande desestabiliza (05, 08) | Ambas son ciertas: no cambia el estado formal, pero el rendimiento oscila. Regla: cambios ≤ ±20 %, uno cada 10-14 días, evaluar tras 2 ciclos de conversión o 2 semanas |
| **Fijar titulares (pinning)** | Adalysis (5.900 cuentas): más fijación, más conversión. Optmyzr: fijar todo empeora (01) | Datos de proveedor contradictorios. Fijación parcial (servicio y ciudad en posición 1) y medir; obligatoria en sectores regulados |
| **Test de anuncios** | Geddes: conversiones por impresión. Röttgerding: el 55-81 % de tests entre anuncios idénticos sale «significativo» alguna vez si miras a diario (01) | Conversiones por impresión con método bayesiano y horizonte fijo; nunca «95 % de confianza» mirado cada día |
| **Negativas: por números o por intención** | Rooijmans clásico (>60 clics, >5 €, <0,5 conv. en 90 días) frente a Rooijmans 2026 (juez de intención con IA que evita quemar 7.000 $ esperando clics) (01) | Las dos, combinadas: la intención fija el punto de partida y los datos lo corrigen (apartado 4.3) |
| **Socios de búsqueda** | Rooijmans y checklists: apagar al heredar. Adalysis, WordStream: decidir con datos de CPA (05, 09) | Apagados por defecto en cuentas nuevas de leads; donde hay volumen, decidir por coste por lead cualificado, no por CTR |
| **Construir o comprar** | Rhodes, Rooijmans, Wenner construyen; Williams compra (01) | Construir solo lo que nadie vende (cruces con CRM, web, SEO, ficha); copiar sin pudor las reglas ya probadas |

### 1.3 Las rutinas del experto

Regla general de todas las fuentes: **la cadencia depende del volumen y del riesgo, no del calendario** (05). Revisar tres
veces por semana una campaña con 6 leads al mes no la gestiona mejor: le impide reunir evidencia.

| Cadencia | Qué mira el experto | Qué NO mira | Fuente |
|---|---|---|---|
| **Diaria (15 min, «¿hay algo roto?»)** | Gasto, clics y CPC de ayer frente a anteayer y frente al mismo día de la semana; campaña que deja de gastar o gasta +140 %; rechazos; facturación; medición a cero; landing viva; entradas raras en el historial de cambios | Conversiones de ayer (llegan tarde), términos de un día, presupuestos. **No arregla nada durante la revisión: crea tarea** | Lolk (01); One PPC Agency (05, 07) |
| **Semanal** | CPL frente a objetivo, términos y negativas, estado de Smart Bidding, segmentos (zona, dispositivo, hora, red), **calidad del lead contra el CRM**, marca frente a no marca | — | 05, 07 |
| **Quincenal** | Tests de anuncios, nivel de calidad, tendencia de CPC, cuota perdida | — | Swydo (05) |
| **Mensual** | Cuadre de gasto con leads cualificados y ventas; reparto de presupuesto por rendimiento **marginal**; estructura y solapes; recomendaciones autoaplicadas; informe al cliente con acciones | — | 05, 07 |
| **Trimestral** | Prueba de medición de punta a punta, auditoría completa, valores y objetivos, estrategia de marca, Search y PMax, landing | — | 05 |
| **Por evento** | Web nueva, cambio de etiquetas o de banner de cookies, cambio de estrategia de puja, migración automática de Google, cuenta heredada | — | 05 |

Otras reglas de oficio que el agente debe llevar dentro: una anomalía provoca investigación, no un cambio automático (07); no
lanzar campañas nuevas en viernes (07); campañas nuevas, revisión diaria hasta estabilizarse (07); no basar sugerencias en
campañas de poco gasto, y decir también lo que está bien (Lolk, 01).

### 1.4 Dónde está hoy la agencia y a dónde hay que llegar

| Dimensión | Hoy (nivel básico) | El experto | El agente |
|---|---|---|---|
| Cadencia | L-X-V, todas las cuentas igual | Proporcional a volumen y riesgo | Vigilancia continua de lo crítico; humano por excepción |
| Métrica rectora | Coste por lead de Google | Coste por lead cualificado y por venta | Lo mismo, por término, red y campaña |
| Términos | Añadir los que convierten barato, pausar los caros «desde hace tiempo» | Umbral ligado al CPA objetivo, n-gramas, intención, conflictos | Cascada reglas → embeddings → IA pequeña → estadística |
| Medición | Se da por buena | Se audita primero y siempre | Examen diario de medición y conciliación con el CRM |
| Cuota de impresiones y subastas | No se dominan | Separa presupuesto de ranking y de competencia | Descomposición automática del KPI |
| Landing y nivel de calidad | Se empieza a mirar | QS ponderado por impresiones y gasto; sintonía por término | Sintonía con embeddings, velocidad, cambios en la web |
| «Sin convertir» | Sensación tras 2-3 días | Sabe cuándo es ruido | Probabilidad exacta por campaña y causa adjunta |
| Cambios de Google | Se descubren tarde | Los conoce y los fecha | Calendario de cambios consultado por el diagnóstico |
| Memoria | En la cabeza de Eury | Registro de cambios por cuenta | Predicción y resultado de cada acción |

Dato de contexto: con 25 cuentas, solo la parte semanal hecha a mano son 15-30 horas (estimación propia del informe 05, sin
fuente publicada), coherente con los «3 días de revisión» del brief. Las agencias encuestadas llevan de media 35 clientes por
gestor y el 55 % hace el control de presupuesto a mano (07).

---

## 2. Catálogo completo de capacidades del agente

**Cómo leer las tablas**

- **Frec.:** H cada hora · D diaria · S semanal · M mensual · T trimestral · E por evento.
- **Motor:** C código (reglas y estadística, sin IA) · E embeddings · Hk Haiku · So Sonnet · Op Opus · Fb Fable. Cuando
  aparecen dos, el primero decide y el segundo solo redacta o juzga lo ambiguo.
- **Riesgo de la acción propuesta:** R0 aviso o tarea, no toca la cuenta · R1 cambio pequeño y reversible (negativa,
  etiqueta) · R2 cambio medio (pausa, presupuesto dentro del tope del contrato) · R3 cambio que altera lo que aprende el
  algoritmo (objetivo, estrategia, conversión, estructura): siempre con una persona.
- **Umbrales:** todos son valores de partida, editables en el panel por defecto y por cliente (regla del proyecto). Donde
  una fuente da «150 clics», aquí se reescribe en múltiplos del CPA objetivo del cliente, porque en una cuenta local 150
  clics pueden ser 300 € (08).
- **Recursos de la API:** nombres de la versión v26 según el informe 04.

Son 120 capacidades en 14 familias. No se construyen todas a la vez: el orden propuesto está en el apartado 11.

### 2.A Medición y salud de la cuenta (lo primero, siempre)

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| MED-01 | **Examen de medición** con nota por cuenta: acciones primarias y secundarias, recuento, valores, ventana, atribución, etiquetado automático | `conversion_action`, `campaign_conversion_goal`, `customer.auto_tagging_enabled` | Reglas fijas: 1-3 acciones primarias que signifiquen dinero (la mediana vista en auditorías es 9); leads con recuento «Una»; clic en teléfono o WhatsApp nunca primaria; una sola fuente primaria por evento | D + E | C | Lista de arreglos. **Si la nota no llega al mínimo, el agente no propone nada de rendimiento** | R0 (arreglos: R3) | 05 §2.2, 06 §1 · P01 |
| MED-02 ★ | **Conciliación diaria Ads ↔ CRM** por campaña | `metrics.conversions_by_conversion_date` por acción; leads de GoHighLevel (canal, UTM, página) | Cociente conversiones Ads / leads CRM de Google. >1,2 durante 7 días: sobreconteo. Ads 30-50 % por debajo de forma estable: consentimiento o etiqueta | D | C | Aviso con hipótesis y prueba a hacer | R0 | 06 §1.7-1.8 · X02 |
| MED-03 ★ | **Medición rota frente a caída real** | Conversiones por acción y hora; sesiones GA4; leads CRM; registro de cambios de la web y vigilancia de caídas (módulo SEO, vía núcleo) | Firma de medición rota: caída a cero de una acción con clics normales mientras el CRM sigue recibiendo. Si el CRM también cae: es real (landing u oferta) | H | C → So | Tarea a web; propuesta de exclusión de datos (PUJ-08); no tocar pujas | R0 | 05 §4.3, 10 §4.1 · P01 |
| MED-04 | **Doble conteo** | Conversiones diarias por acción; clics | Dos acciones primarias con correlación diaria >0,9 y cociente ≈1; conversiones ≈ clics; tasa de conversión >30-40 % en Search de servicios | S | C | Pasar una a secundaria | R3 | 06 §1.8, 02 §3.3 |
| MED-05 ★ | **Fuga del identificador de clic** | Leads del CRM con y sin gclid/gbraid/wbraid (exige ampliar la conexión con GoHighLevel) | >20 % de leads de Google sin identificador; ejecuciones «Skipped» del flujo del CRM | D | C | Tarea a web: script que guarda los tres identificadores y los inyecta en formularios e iframes | R0 | 06 §1.5, 10 §2.4 |
| MED-06 ★ | **Curva de madurez de conversiones** por cuenta y acción | `segments.conversion_lag_bucket`; fecha del lead en CRM frente a fecha del clic | F(d) = fracción de conversiones ya registradas d días después del clic. Ninguna regla usa días con F < 0,85 (apartado 4.4) | S | C | Marca días «inmaduros» en pantalla y en todas las reglas | R0 | 05 §5.4, 08 §3.3 |
| MED-07 | **Consentimiento** (modo básico o avanzado, cambio de banner) | Rastreador de la web; MED-02 | Detectar el modo leyendo la etiqueta; un cambio de banner se anota como evento. Sin 700 clics en 7 días por país y dominio no hay modelado: lo que se rechaza se pierde [umbral citado en 04 y 06; el 09b no lo encontró en otra página] | E + M | C | Aviso; reforzar conversiones mejoradas para leads | R0 | 04 §4.5, 06 §1.7 |
| MED-08 | **Llamadas bien contadas** | Detalle de llamadas de Google Ads [recurso de API por verificar]; llamadas del CRM | Umbral de duración fijado con datos: duración de las llamadas que acaban en cita (por defecto Google usa 60 s). Llamadas perdidas por franja frente al horario de la ficha | M | C | Subir umbral; programar el recurso de llamada | R1 | 06 §1.2, §5.2 |
| MED-09 | **WhatsApp bien medido** | Acciones de conversión (categoría `MESSAGE_LEAD`); conversaciones en el CRM | Clic a WhatsApp como secundaria; conversación, lead cualificado o venta del CRM como primaria. La práctica habitual en España (contar el clic) infla conversiones | T + E | C | Rehacer el esquema de conversiones | R3 | 10 §5.1 |
| MED-10 ★ | **Subida de leads cualificados y ventas a Google** con conciliador | CRM (etapa, identificador de clic, correo y teléfono con hash); Data Manager API | Subir por cuenta, nunca lotes multicuenta; nombre de acción único por cuenta; filtro antispam antes (no se puede retirar una conversión); retraso de 24-48 h. Conciliador: aceptadas frente a contadas por fecha de conversión, alerta si <85 % («OK» solo significa que la fila se leyó) | D | C | Activar por cliente tras decisión de Enric | R3 | 09b §1, 10 §1.2-1.3 · X02 |
| MED-11 | **Prueba de punta a punta** y etiqueta presente en todas las landings | Rastreador; tarea humana guiada | Formulario y llamada de prueba; la página de gracias dispara una vez | T + E | C | Tarea con lista de pasos | R0 | 05 M15-M16 |
| MED-12 | **Salud y acceso de la cuenta** | `customer.status`, usuarios con acceso, `campaign.primary_status_reasons`, presupuesto de cuenta, fechas de fin | La API no tiene recurso de «alertas de cuenta»: el pago fallido se infiere (gasto a 0 en todas las campañas, motivos de estado). Usuarios desconocidos o de agencias anteriores | D | C | Aviso inmediato | R0 | 04 §2.13, 05 §2.1 · P03 |

### 2.B Protección y anomalías

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| PRO-01 | **Campaña parada o desbocada** | `campaign` por día y hora | Activa con 0 impresiones; gasto +140 % frente a ayer; gasto >2× el presupuesto diario; impresiones o clics −70 % frente al mismo día de la semana anterior | H | C | Aviso; pausa de emergencia solo si está autorizada | R0 / R2 | 01 (Lolk, Rhodes), 02 §4.2 · P04 |
| PRO-02 ★ | **Anomalía con línea base propia** | Serie diaria por cuenta y campaña; festivos de la zona del cliente (calendario de la agencia) | Mediana y MAD del mismo día de la semana (6-8 semanas), sin el día en curso ni días ya marcados; suelo de volumen y de euros (apartado 4.5) | D | C | Dispara el diagnóstico (DIA-01), no un cambio | R0 | 05 §5.5, 08 §3 · P04 |
| PRO-03 ★ | **«N días sin convertir» bien hecho** | Conversiones esperadas por día (línea base), madurez (MED-06), gasto | Poisson: avisar si e^(−λN) < 2 %. Si el gasto también cayó, la causa es la entrega, no la conversión (apartado 4.1) | D | C | Dispara el diagnóstico | R0 | 05 §5.5, 08 §3.2 |
| PRO-04 | **Deriva lenta** (lo que un umbral diario no ve) | Series semanales de CR, CPC, CTR, CPL | CUSUM o tendencia de 4-8 semanas contra una referencia fija: −2 % diario son −25 % en dos semanas | S | C | Aviso con gráfico | R0 | 05 §5.5 |
| PRO-05 | **Rechazos y limitaciones** | `ad_group_ad.policy_summary`, política de recursos, `ad_group_criterion.approval_status` | Cualquier rechazo en entidad con gasto | D | C → So | Borrador del arreglo (texto que cumple, URL nueva) | R0 / R1 | 05 R1, 02 §1.4 · P02 |
| PRO-06 | **URL final viva** (anuncios, enlaces de sitio y URL elegidas por Google) | Vigilancia de páginas caídas del SEO; `landing_page_view`, `expanded_landing_page_view` | 404 o 5xx confirmado dos veces; se calcula el gasto expuesto por hora | H | C | Aviso; propuesta de pausa temporal | R0 / R2 | 05 L1 · P05 |
| PRO-07 | **Ritmo de presupuesto** | Gasto acumulado; presupuesto del contrato (ficha); `campaign_budget` | Proyección a fin de mes fuera de ±10 %. Recordar: un día puede gastar 2×, el mes 30,4×, y desde el 1 jun 2026 las campañas con días apagados gastan más en los días activos. Presupuesto agotado antes de las 14:00 | D | C | Ajuste de presupuesto diario | R2 | 09 §5, 10 §5.5 · A06 |
| PRO-08 | **Historial de cambios guardado y vigilado** | `change_event` (30 días, con usuario y valor antes y después), `change_status` (90 días) | Guardar cada noche. Señales: usuario o herramienta desconocidos, ráfaga de cambios, cambios en los 14 días previos a una caída, cambios hechos por Google (`client_type` de recomendaciones). No cubre Google Ads Editor ni negativas puestas en la MCC | D | C | Aviso; contexto para el diagnóstico | R0 | 01 §2.14, 04 §2.7, 10 §4.4 |
| PRO-09 ★ | **Causa común entre cuentas** | Anomalías del día de todas las cuentas | Si una fracción alta de cuentas (o de un sector, o de una zona) se desvía el mismo día: una alerta de agencia, no 15 | D | C | Aviso único | R0 | 05 §4.3 |
| PRO-10 | **Tráfico inválido con datos propios** | Clics de Ads frente a sesiones GA4 y Clarity por hora y zona | Picos de clics sin sesión; la API no da las IP | S | C | Expediente para pedir reembolso; exclusión de zona | R0 / R1 | 03 §3.1, 09b §3 |
| PRO-11 | **Freno de emergencia fuera de nuestro servidor** | Script en la MCC | Tope de gasto diario que funciona aunque la herramienta caiga | H | C | Pausa y aviso | R2 | 04 §6 |
| PRO-12 ★ | **Gobierno de las alertas** | Todas las anteriores | Una alerta por causa; agrupar; suprimir lo explicado por cambios propios, festivos o aprendizaje; tope diario por persona; botón útil / no útil / ya lo sabía (apartado 10) | D | C | — | R0 | 05 §6.3, 08 §3.4 |

### 2.C Diagnóstico de causa raíz (detalle en el apartado 3)

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| DIA-01 ★ | **Árbol de causa raíz unificado**, ejecutado solo al saltar una anomalía | Todo el almacén más núcleo (web, SEO, CRM, GBP, ficha) | Orden fijo: ¿real? → medición → cambios → entrega → descomposición → validación | E | C | Diagnóstico con evidencia | R0 | 05 §4.3, 10 §4.5 · P04 |
| DIA-02 | **Descomposición del KPI** en factores | Impresiones, cuota, CTR, CPC, CR por periodo | Logarítmica (LMDI): contribuciones que suman 100 % | E | C | «El 62 % de la caída es cuota de impresiones» | R0 | 05 §4.2, 08 §4.1 |
| DIA-03 | **Mezcla frente a tasa** y búsqueda de la combinación culpable | Segmentos: campaña, red, dispositivo, zona, hora, término, origen del emparejamiento | Efecto mezcla y efecto tasa; bajar por la dimensión que concentra ≥60-70 % del cambio en ≤3 elementos | E | C | Señala dónde | R0 | 05 §4.2 |
| DIA-04 ★ | **Demanda frente a subasta** | Impresiones orgánicas de Search Console de las consultas equivalentes; GBP; mismo sector en otras cuentas | Si baja también lo orgánico: mercado. Si solo baja Ads: es nuestro | E | C | Evita tocar la cuenta cuando es estacionalidad | R0 | 05, 06 §5.4, 08 §4.1 |
| DIA-05 ★ | **Cambios de Google como causa** | Calendario de plataforma (GOO-04) | ¿El inicio coincide con un cambio de Google fechado? | E | C | Explicación y palancas | R0 | 09b §5.3, 10 §1.5 |
| DIA-06 ★ | **Explicación en lenguaje llano**, con lo descartado y con «no concluyente» cuando falta evidencia | Salida de DIA-01 a 05 | La IA solo puede citar causas que el código haya calculado; cobertura de evidencia visible | E | C → So | Mensaje a Telegram y a la cola | R0 | 03 §2.2 (claude-ads), 05 §4.4 |

### 2.D Términos de búsqueda y palabras clave

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| TER-01 ★ | **Cascada de clasificación** de cada término nuevo | `search_term_view`, `campaign_search_term_view` (incluye PMax), `segments.search_term_match_source`; ficha (servicios, zona, lo que NO hace); consultas orgánicas de Search Console | 1) reglas de sector y zona; 2) distancia de embeddings a servicios, palabras activas y consultas orgánicas; 3) IA pequeña solo en la zona gris, con la ficha y decisiones previas; 4) evidencia estadística; 5) comprobación de conflictos | D | C → E → Hk | Negativa, nueva palabra, o «vigilar», con nivel y concordancia | R1 | 01 §2.4, 02 §3.3, 08 §1.4 · A02 |
| TER-02 | **Término con gasto y sin resultado** | Coste, clics y conversiones maduras (Ads y CRM) | Gasto ≥ k × CPA objetivo sin conversión: k = 3 por defecto, 2 en respuesta directa, 4-5 en ticket alto. No actuar con <20 clics salvo intención claramente errónea. Versión completa: probabilidad bayesiana (apartado 4.3) | S | C | Negativa | R1 | 05 §5.1, 07 §4, 08 §2.5 · A03 |
| TER-03 ★ | **N-gramas**, también agregados entre cuentas del mismo sector | Términos partidos en 1-3 palabras | Sumar coste y conversiones por fragmento («gratis», «curso», «empleo», «segunda mano», «oposiciones»); mismo umbral k × CPA sobre el agregado | S | C | Negativa de frase en lista compartida del sector | R1 | 08 §1.1, 03 §4.1 · A02 |
| TER-04 ★ | **Lugares fuera de la zona de servicio** | Términos; zona y locales de la ficha; lista de municipios | El término nombra un municipio o provincia que el cliente no atiende | S | C | Negativa de frase con el nombre del lugar | R1 | 02 §1.3 (Opteo lo hace sin ficha) |
| TER-05 | **Término que merece ser palabra clave** | Términos con conversiones; calidad en CRM | ≥2 conversiones en 90 días y CPA ≤ objetivo (≥3 para ser más prudente); sin duplicar una palabra existente; ★ con tasa de cualificación del CRM | S | C | Añadir en exacta | R1 | 02 §2.3, 10 §5.5 · D01 |
| TER-06 | **Conflictos de negativas** | Negativas de grupo, campaña, listas compartidas y PMax | Una negativa bloquea una palabra activa o un término que ha convertido | S | C | Quitar o acotar la negativa | R1 | 02, 08 §1.4 · P06 |
| TER-07 | **Higiene de palabras** | `keyword_view`, `ad_group_criterion` | Gasto ≥ k × CPA sin conversión; duplicadas entre grupos y campañas; 90 días sin impresiones o «poco volumen»; variante cercana peor que su palabra | S | C | Pausar, fusionar, archivar | R1-R2 | 02 §2.3, 05 §2.5 · A03, P06 |
| TER-08 | **Ratio Lin-Rodnitzky** por cuenta | Términos de 28 días | CPA de todos los términos / CPA de los que convierten: 1,0-1,5 demasiado conservador; 1,5-2,0 sano; 2,0-2,5 agresivo; >2,5 mal gestionado | S | C | Indicador en el tablero | R0 | 01 §2.4 |
| TER-09 ★ | **Lo que Google esconde** | Coste de campaña menos suma de coste de términos visibles; origen del emparejamiento | «% de gasto invisible» y «% de tráfico traído por la IA de Google» con su CPA comparado | S | C | Indicador; base para decidir sobre AI Max y amplia | R0 | 04 §2.3 |
| TER-10 | **Términos nuevos y en tendencia** | Términos por semana | Impresiones en 7 días y ninguna en los 7 anteriores; subidas sostenidas con volumen mínimo | S | C | Revisar; oportunidad o negativa temprana | R0 | 02 §3.3 · D06 |
| TER-11 | **Marca, genérico y competencia** | Términos; marca y competidores de la ficha | Clasificar todo el tráfico; marca dentro de campañas genéricas; términos de competidor no decididos | S | C → E | Negativa de marca en no marca; campaña propia | R1-R3 | 01 §6.1, 09 §1.3 |

### 2.E Pujas y presupuesto

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| PUJ-01 | **Estado de Smart Bidding**, guardado a diario | `campaign.bidding_strategy_system_status` (aprendiendo y por qué, limitada por presupuesto, datos, inventario o calidad, conversiones mal configuradas) | Más de 21 días aprendiendo; cualquier «mal configurada»; «limitada por datos» | D | C | Contexto para todo lo demás; aviso | R0 | 04 §2.10, 10 §5.5 · E04 |
| PUJ-02 | **Estrategia coherente con el volumen** | Conversiones de 30 días por campaña y estrategia | No hay mínimo oficial para CPA objetivo; Google pide evaluar con ≥30 conversiones en 30 días y no recomienda objetivo con <7. Regla propia: <15 en 30 días = riesgo; «maximizar clics» en campaña de leads = error | M | C | Consolidar, cartera, o estrategia menos exigente | R3 | 10 §1.6, 05 B3-B4 · E04 |
| PUJ-03 ★ | **«Efecto 17 de agosto»** | Estado «limitada por presupuesto», CPC, CPA real frente a objetivo | CPA objetivo o ROAS objetivo + limitada por presupuesto + CPC al alza: no es un fallo, es el diseño nuevo | S | C → So | Acercar el objetivo al CPA real, subir presupuesto o pasar a maximizar conversiones | R3 | 09b §5.3, 10 §1.5 |
| PUJ-04 | **Objetivo irreal y el error de «bajar el tCPA como pide Google»** | Historial de cambios; CPC y conversiones 7-14 días después | Cambio de objetivo seguido de CPC ↑ y conversiones ↓. Objetivo muy por debajo del CPA histórico | S | C | Receta de Rooijmans: CPA objetivo que el negocio acepta, tope de CPC en el percentil 90-95 de los términos que convierten, pasos de 10-20 % | R3 | 07 §3.1 |
| PUJ-05 | **Reparto de presupuesto por rendimiento marginal** | `campaign_simulation` (puntos de presupuesto y objetivo), cuota perdida por presupuesto, curva con referencia del sector | Igualar el CPA **marginal** entre campañas, no el medio (apartado 4.7); siempre dentro del presupuesto del contrato | M | C | Mover presupuesto entre campañas | R2 | 08 §5.1 · A04, E06 |
| PUJ-06 | **«Manos quietas»** | Historial de cambios; estado de aprendizaje; ciclo de conversión | Avisa si se quiere tocar una campaña en aprendizaje, con <2 ciclos de conversión desde el último cambio, con un cambio >±20 %, o con más de un cambio grande cada 10-14 días | E | C | Bloquea o pide confirmación | R0 | 05 B6-B7, 09 §2.3 |
| PUJ-07 | **Horario y dispositivo** | `segments.hour`, `day_of_week`, `device`; horario de la ficha y de GBP; llamadas perdidas | Con Smart Bidding solo sirven: horario como encendido o apagado, dispositivo −100 %, o CPA objetivo distinto por dispositivo. Exigir ≥10 conversiones por segmento o probabilidad bayesiana | M | C | Programación; CPA diferencial por dispositivo | R2 | 09b §5.1, 02 §2.3 · A01, A05 |
| PUJ-08 ★ | **Exclusión de datos con las fechas ya calculadas** | MED-03; retraso de conversión | Desde (inicio de la caída − retraso) hasta el arreglo, cubriendo ≥90 % de los clics afectados; aplicarla cuanto antes; no rellenar (y si se rellena, ≥5 días después) | E | C | Propuesta lista para aplicar | R3 | 10 §1.7, 08 §5.2 |
| PUJ-09 | **Ajuste de estacionalidad por sucesos breves** | Festivos locales, meteorología, promociones del cliente | Solo cambios grandes de 1-7 días (mal si >14); Smart Bidding ya modela la estacionalidad anual; se puede crear desde la MCC para varias cuentas | E | C | Propuesta («ola de calor: clientes de climatización de la provincia») | R3 | 09b §5.2, §6.2 |
| PUJ-10 | **CPC anómalo y topes** | CPC por palabra y campaña; topes de cartera | CPC muy por encima del histórico (caso real: 500 %); tope de cartera que impide entrar en subastas | D | C | Aviso; revisar tope | R0 / R2 | 01 §2.1, §2.2 |

### 2.F Cuota de impresiones y competencia

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| CUO-01 | **Tablero de visibilidad** | `search_impression_share`, perdida por presupuesto y por ranking, parte superior y superior absoluta, cuota de concordancia exacta, cuota de clics | Guardar al nivel que se enseña (no se puede sumar de palabra a campaña). Llega con unos 3 días de retraso: nunca usarla para una alerta de hoy | D | C | Indicador con tendencia | R0 | 04 §2.11, §5 · E01 |
| CUO-02 | **Oportunidad por presupuesto** | Cuota perdida por presupuesto; CPL frente a objetivo | Perdida por presupuesto >10 % tres días seguidos con CPL ≤ objetivo (umbral prudente; otras fuentes usan >20 %). Palabra con CPA ≤ mitad de la media y cuota <70 % | S | C | Subir presupuesto 10-20 %, con estimación de lo que se gana | R2 | 02 §2.3-2.4, 09b §6.1 · E01 |
| CUO-03 | **Pérdida por ranking, con su porqué** | Cuota perdida por ranking; nivel de calidad por componente; historial de objetivos; CUO-04 y 05 | >30 %: separar si es puja u objetivo, calidad, o competencia. Mejorar anuncio y landing antes que subir pujas | S | C | Tarea de calidad, o cambio de objetivo | R0-R3 | 09 §6.3, 10 §5.5 |
| CUO-04 ★ | **Subastas por la puerta de atrás** | Informe programado de Auction Insights (interfaz de Google → correo u hoja), semanal | La API no lo da (apartado 7). Señales: competidor nuevo con cuota ≥10 %; solapamiento alto con tasa de superación a la baja | S | C | Contexto para el diagnóstico; aviso de competidor nuevo | R0 | 02 §4.2, 04 §2.12 · D03 |
| CUO-05 ★ | **Presión competitiva sin subastas** | Cuota perdida por ranking, CPC, % en parte superior; anuncios de la página de resultados (DataForSEO); competidores de la ficha | Ranking perdido ↑ + CPC ↑ + parte superior ↓ a la vez = más competencia. Quién: los anunciantes que aparecen en los resultados | S | C | Explicación; revisar oferta frente al competidor | R0 | 04 §2.12 |
| CUO-06 | **Defensa de la marca** | Cuota de impresiones de la campaña de marca; posición orgánica | Cuota de marca <90 %; alguien puja por la marca | S | C | Presupuesto o puja de marca; valorar si compensa cuando lo orgánico ya es primero | R2 | 05 P2, 09 §6.2 |
| CUO-07 | **Mercado frente a competencia** | Impresiones con cuota estable; Search Console | Menos impresiones con la misma cuota = baja el mercado (en 2026 las impresiones totales cayeron un 11 % interanual en la muestra de Optmyzr) | S | C | Explicación | R0 | 09b §4.1, §7 |

### 2.G Anuncios y recursos

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| ANU-01 | **Cobertura mínima** | `ad_group_ad`, recursos de campaña, grupo y cuenta | Grupo sin anuncio adaptable; anuncio con 3-4 titulares; menos de 4 enlaces de sitio; sin llamada o ubicación en negocio local. La «fuerza del anuncio» es higiene, no objetivo | M | C | Tarea o borrador | R1 | 05 §2.6 · C02 |
| ANU-02 | **Recursos que no rinden** | `ad_group_ad_asset_view` (impresiones, clics, conversiones, etiqueta de rendimiento) | Etiqueta «bajo» más de 30 días; CTR muy bajo con muchas impresiones; buen CTR y mala conversión | M | C | Sustituir | R1 | 01 §2.7, 05 R8 |
| ANU-03 ★ | **Test de anuncios honesto** | Impresiones y conversiones por anuncio, solo red de Google, separando parte superior y resto | Métrica: conversiones por impresión. Método bayesiano con horizonte fijo; en grupos pequeños, test multigrupo. Nunca «95 %» mirado a diario (apartado 4.6) | M | C | Pausar perdedor; proponer siguiente variante | R1 | 01 §2.2, §2.12 |
| ANU-04 | **CTR en caída** | CTR 7 días frente a 30 | Caída >30 % con ≥25 clics en 7 días y ≥100 en 30; se excluyen campañas que cambiaron de puja | S | C | Revisar posición, mezcla de consultas y anuncio | R0 | 02 §2.3 |
| ANU-05 ★ | **Redactor de anuncios anclado** | Ficha, texto de la landing (rastreador), resultados orgánicos y anuncios de competidores (DataForSEO), recursos que funcionaron | Generar → reglas (longitud, políticas) → juez de anclaje: cada afirmación debe estar en la landing o en la ficha → persona aprueba | E | So → C → So | Borrador de anuncio | R1 | 08 §6 |
| ANU-06 ★ | **Cumplimiento en sectores regulados** (política de Google y ley española) | Sector de la ficha; textos de anuncios, incluidos los que genera Google | Vetos por sector: sanidad (sin garantías de curación ni testimonios de profesionales o famosos), abogados (sin promesas de resultado ni captación de víctimas de accidentes), financiero (verificación, TAE), cerrajería prohibida en España | D | C → Hk | Aviso; exclusiones de términos en las guías de texto | R0 / R1 | 09b §2 |
| ANU-07 | **Coherencia con el negocio** | Ficha (servicios vigentes, ofertas), anuncios y recursos | Servicio que ya no se ofrece, oferta caducada, faltas de ortografía, teléfono u horario distinto al de la ficha de Google | M | C → Hk | Corregir | R1 | 05 C12, 06 §6 |

### 2.H Landing, nivel de calidad y sintonía

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| LAN-01 | **Nivel de calidad guardado a diario**, ponderado | `ad_group_criterion.quality_info` (nota y tres componentes) | Media ponderada por impresiones; prioridad = gasto × (10 − nota); % de impresiones con cada componente «por debajo de la media»; caída de nota en palabras con >100 impresiones en 30 días. Recordar: es diagnóstico, no entra en la subasta | D | C | Lista priorizada por componente | R0 | 06 §3, 02 §2.7 · C01 |
| LAN-02 ★ | **Sintonía término → anuncio → landing** | Términos con gasto; titulares y descripciones; texto de la landing (H1, títulos, primer bloque) del rastreador | Tres similitudes con embeddings; ordenar por coste × (1 − similitud). IA solo para explicar los 10-20 peores casos | S | E → Hk | Negativa, landing distinta, o encargo de página nueva | R0-R1 | 06 §4.3 · C04 |
| LAN-03 ★ | **Velocidad de las páginas que reciben gasto** | URL finales con coste; PageSpeed y CrUX del módulo SEO | LCP ≤2,5 s, INP ≤200 ms, CLS ≤0,1 en móvil; ordenar por gasto. Referencia: una página de 1 s convierte 3 veces más que una de 5 s en captación de leads B2B (Portent) | S | C | Tarea a web con el gasto afectado | R0 | 06 §4.6 · C04 |
| LAN-04 ★ | **Cambio en la web ↔ caída de conversión o de nota de landing** | Registro de cambios de la web (SEO); CR por landing; componente de landing del nivel de calidad | Coincidencia de fechas entre el cambio y el inicio de la caída | E | C | Causa candidata en el diagnóstico | R0 | 05 L6, 06 §6 |
| LAN-05 | **Landing con gasto y sin resultado** | `landing_page_view`; Clarity | Gasto ≥ k × CPA sin conversión (la referencia de mercado es 150 clics en 90 días). Lista objetiva: teléfono visible en móvil, campos del formulario, ciudad, reseñas, mensaje del anuncio presente; clics de rabia y abandono del formulario | M | C → Hk | Tarea de mejora | R0 | 02 §2.3, 06 §6 |
| LAN-06 ★ | **Páginas elegidas por Google** | `expanded_landing_page_view` frente a las URL configuradas; mapa de páginas del SEO | % de clics a páginas no elegidas; tráfico a blog, legales, empleo, páginas sin formulario o caídas. En auditorías de PMax, la mitad servía páginas no elegidas | S | C | Exclusiones de URL o apagar la expansión | R2 | 05 C14, 06 §4.4 |
| LAN-07 | **Embudo después del clic** | Clics de Ads, sesiones GA4 por landing, formulario iniciado y enviado | Dónde se pierde: clic sin sesión (velocidad, consentimiento), sesión sin inicio de formulario (mensaje), inicio sin envío (formulario) | M | C | Derivar a PPC, web o medición | R0 | 05 §4.3 · C05, X03 |

### 2.I Calidad del lead y CRM

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| LEAD-01 ★ | **Coste por lead cualificado y por venta**, por campaña, red, término, landing y dispositivo | Coste de Ads; leads, etapas y ventas del CRM unidos por identificador de clic o por UTM | CPL bruto, tasa de cualificación, coste por cualificado, tasa de cierre, coste por venta | D | C | Es la métrica rectora del agente | R0 | 06 §2.2 · C06, X02 |
| LEAD-02 ★ | **«Barata pero no cierra»** | LEAD-01 a 90 días | CPL por debajo del objetivo y tasa de cualificación o cierre muy por debajo de la cuenta (con encogimiento bayesiano) | M | C | Bajar peso, cambiar mensaje, o cambiar la conversión que se optimiza | R2-R3 | 07 §6, 06 §2.4 |
| LEAD-03 ★ | **Spam por red y franja** | Leads marcados no válidos en el CRM; red, hora, dispositivo, zona | Proporción de no válidos por segmento frente al resto («9 de 11 en socios de búsqueda frente a 1 de 25 en Search») | S | C | Excluir red, canal o franja; proteger el formulario | R1-R2 | 06 §2.1, §6 |
| LEAD-04 ★ | **Valor del lead por etapa**, recalculado cada mes | Ventas y etapas del CRM; ticket y margen de la ficha | Valor de la etapa = probabilidad de venta desde esa etapa × margen medio. De ahí sale el CPA máximo, no de la intuición | M | C | Objetivos de CPA o valores de conversión por cliente | R3 | 06 §1.6 |
| LEAD-05 | **Escalera de qué optimizar** | Volumen mensual de cualificados y ventas | <15 cualificados al mes: pujar a lead válido y medir cualificados como secundaria; ≥15 en 30 días: cualificado como primaria; ≥15 ventas con valor variable: valor real | M | C | Propuesta de cambio de conversión primaria | R3 | 06 §2.4 |
| LEAD-06 | **Leads de fuera de zona** | Código postal o provincia del lead; zona de la ficha | >10 % de leads o de coste fuera de zona | M | C | Pasar a «presencia»; negativas de lugar | R1-R2 | 06 §5.1 |
| LEAD-07 ★ | **Llamadas cualificadas por su contenido** (Google solo lo ofrece en EE. UU. y Canadá) | Grabaciones del CRM, si el cliente graba | Transcribir y clasificar si la llamada es un lead real. Exige aviso de grabación y base legal: decisión de Enric | D | Hk | Subir solo las cualificadas | R3 | 06 §1.2, §6 |
| LEAD-08 | **Calidad por vía de entrada** | Formulario de Google, formulario web, llamada, WhatsApp | Tasa de cualificación por vía | M | C | Quitar o cualificar el formulario de Google | R1 | 09 §4.2 |
| LEAD-09 | **Lo que no es culpa de la campaña** | Tiempo de respuesta al lead y llamadas perdidas, si el CRM lo da | Respuesta lenta o llamadas sin contestar en horario de anuncios | M | C | Aviso al responsable de cuenta | R0 | 07 §4 |

### 2.J Estructura y configuración

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| EST-01 | **Higiene de entrada** (lo que más dinero ahorra y menos luce) | Ajustes de campaña; `recommendation_subscription`; segmento de red | Socios de búsqueda sin datos que los avalen; Display dentro de Search; «presencia o interés» en negocio local; recomendaciones autoaplicadas; textos e imágenes automáticos | S + E | C | Corregir (candidatas a aplicación en un clic) | R1 | 05 §2.3, 07 §3.1 · A05 |
| EST-02 ★ | **Zona real del negocio** | `user_location_view` (ubicación física y si estaba en la segmentación); zona y locales de la ficha | Coste fuera de la zona de servicio >10 %; radio que no corresponde a la zona atendida | M | C | Ajustar ubicación y exclusiones | R2 | 06 §5.1 · A05 |
| EST-03 | **Demasiado partida o demasiado junta** | Conversiones por campaña; CPA objetivo; valor de cada servicio (ficha) | Campañas con <15 conversiones en 30 días y el mismo objetivo: fusionar o cartera. Grupo o campaña que mezcla servicios de valor muy distinto bajo un mismo CPA: partir | T | C → Op | Propuesta de reestructura | R3 | 09 §1.3, 07 §6 · P06 |
| EST-04 | **Marca aparte** | TER-11; exclusiones de marca | Marca mezclada con no marca; PMax y AI Max sin exclusión de marca | M | C | Separar; añadir exclusiones | R2-R3 | 01 §6.1 |
| EST-05 | **Audiencias** | Criterios de audiencia; listas | Lista en «segmentación» en vez de «observación» en Search (deja la campaña sin alcance). En salud: sin listas de clientes ni segmentos propios | T | C | Corregir | R1 | 05 U1, 09b §2.3 · C03, E03 |
| EST-06 ★ | **Ajustes que reaparecen solos** | Fotos diarias de configuración; historial | Un ajuste corregido vuelve a su valor anterior (autoaplicadas, expansión) | D | C | Aviso y volver a corregir | R1 | 07 §9 |
| EST-07 | **Auditoría de entrada** al dar de alta o heredar una cuenta | Todo el catálogo | Informe por tandas: 1) datos y riesgo; 2) gasto recortable sin riesgo; 3) aprendizaje y estructura; 4) tests. Decir también lo que está bien | E + T | C → Op | Informe y plan | R0 | 05 §6.1, 01 §2.7 |
| EST-08 | **Nombres y convenciones** | Nombres de campaña frente a su configuración | El nombre contradice la concordancia, la zona o el tipo | T | C | Renombrar | R1 | 01 §2.7 |
| EST-09 | **Funciones elegibles sin usar** | Sector y país de la ficha; recursos | Servicios locales de Google para oficios del hogar, recursos de mensaje, formularios con preguntas. Sin perseguir la nota de optimización | T | C | Sugerencia al responsable | R0 | 06 §5.3, 10 §5.1 · D04 |

### 2.K Performance Max, AI Max y cambios de Google

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| GOO-01 | **Auditoría de Performance Max** | `campaign` por `segments.ad_network_type`; `campaign_search_term_view`; categorías; `asset_group`; `performance_max_placement_view` | Marca >20 % del gasto; Display y vídeo cerca de un tercio del gasto con pocas conversiones (en comercio electrónico la bandera es >10 %); un grupo de recursos que acapara; 20 categorías con más gasto; ubicaciones basura | M | C | Exclusiones de marca, negativas, exclusión de ubicaciones | R1-R2 | 05 §2.9, 01 §2.7 · E02 |
| GOO-02 ★ | **Canibalización** entre PMax o AI Max y Search | Conversiones por campaña y semana; términos por origen | Sube una lo que baja la otra: se han movido leads, no añadido. Deduplicar los términos de AI Max contra los de exacta y frase | S | C | Añadir los mejores como exacta; revisar si aporta | R2 | 01 §2.2, §2.13 |
| GOO-03 | **Vigilancia de AI Max** | `campaign.aca_migration_date_time`, `broad_match_migration_date_time`; `ai_max_search_term_ad_combination_view` | Qué campañas migró Google y cuándo; 28 días antes y después; términos de marca a genérico y de genérico a competidor; guías de texto | S + E | C | Exclusiones, guías de texto, o desactivar por grupo | R2 | 04 §4.1 |
| GOO-04 ★ | **Calendario de cambios de la plataforma** | Tabla propia con fecha, ámbito y efecto esperado (apartado 7.5); novedades | Lo mantiene el equipo con ayuda de un agente que lee las fuentes; el diagnóstico lo consulta | S | C + So | — | R0 | 01 (idea 11), 10 (idea 3) |
| GOO-05 | **Prioridad de canal y expansión a Display (feb 2027)** | Aún no está en la API: segmento de red como sustituto | Campaña de leads con socios o Display que superan X % del gasto con peor coste por lead | M | C | Poner Display y socios en prioridad baja con tope | R2 | 10 §1.4 |
| GOO-06 | **Recomendaciones de Google, cribadas** | `recommendation`; `metrics.optimization_score` | Separar higiene útil (conflictos, recursos que faltan) de lo que sirve al gasto (amplia, subir presupuesto sin base) | S | C | Aplicar las útiles; descartar el resto con motivo | R1-R3 | 01 §3, 04 §2.8 |
| GOO-07 | **Vigía de la API** | Versión en uso; fechas de retirada | Aviso 60 días antes de la retirada de la versión; enumerados que cambian entre versiones | M | C | Tarea técnica | R0 | 04 §1.6 |
| GOO-08 | **Experimentos asistidos** | `experiment`, `experiment_arm` | Probar AI Max, apagar socios o cambiar estrategia con criterio de éxito escrito, duración (2 ciclos o 2 semanas, lo mayor) y lectura automática | E | C | Propuesta de experimento | R3 | 09 §3.1, 08 §2.6 |

### 2.L Descubrimiento y escalado

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| ESC-01 ★ | **Puente Ads ↔ SEO** | Términos de pago con conversión; posiciones y páginas (SEO); Search Console | Consultas largas que convierten en Ads sin página orgánica: encargo de contenido. Palabra de pago con orgánico estable en 1-3: **prueba** de reducción midiendo leads totales (una posición alta no demuestra que el anuncio sobre) | M | C → E | Brief al SEO; experimento | R0 / R3 | 09b §3 · D02, X01 |
| ESC-02 | **Palabras nuevas desde lo orgánico** | Consultas de Search Console que traen leads; mapa de palabras | Temas con demanda y conversión orgánica sin cobertura de pago | M | E | Nuevas palabras | R1 | 03 (idea 7) · D01 |
| ESC-03 ★ | **Semáforo «control antes de escalar»** | MED-01, MED-02, LEAD-01 | No se propone subir presupuesto ni objetivo hasta que medición y calidad estén sanas | E | C | Bloquea propuestas de escalado | R0 | 07 (idea 5) |
| ESC-04 | **Escalar donde hay margen** | CUO-02; PUJ-05 | CPL cualificado ≤ objetivo y cuota perdida por presupuesto: +10-20 % y evaluar tras 1-2 ciclos. Con la mecánica nueva, subir el CPA objetivo un 10-15 % da más volumen a ese coste | M | C | Subida gradual | R2-R3 | 09b §6.1 · E01, E06 |
| ESC-05 ★ | **Estacionalidad propia por sector y zona** | Volumen mensual por palabra (DataForSEO), Search Console y GBP diarios, histórico de Ads | Índice estacional calculado con nuestros datos: no existe ninguno público para España | M | C | Presupuestos por temporada; silenciar alarmas de agosto | R0 | 10 §5.3 |
| ESC-06 | **Zonas y servicios sin cubrir** | Ubicaciones con conversiones recientes; servicios de la ficha sin campaña | Ciudad nueva que convierte; servicio rentable sin campaña propia | M | C | Propuesta de ampliación | R3 | 02 §3.3 |
| ESC-07 | **Mezcla de tipos de campaña** | Tipos activos; sector; volumen | Demand Gen o remarketing para decisiones largas; nada de eso en urgencias. En salud, restricciones de audiencias propias | T | C → Op | Recomendación estratégica | R3 | 09 §3 · E02, E05 |
| ESC-08 | **Clientes existentes** | Listas de clientes del CRM | Excluir clientes recientes de la captación; venta cruzada donde tenga sentido (prioridad baja en leads locales) | T | C | Lista de exclusión | R2 | 05 U2 · D05, E03 |

### 2.M Informes al equipo y al cliente

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| INF-01 ★ | **«Qué cuenta mirar hoy»**: parte por excepción | Hallazgos abiertos de todas las cuentas | Orden por euros en riesgo × confianza × urgencia / esfuerzo (apartado 3.6) | D | C → Hk | Telegram por la cola de avisos existente | R0 | 05 §6.2, 07 (idea 9) |
| INF-02 | **Resumen del lunes** para el equipo | Semana cerrada con datos maduros | Por cuenta: estado, lo que cambió y por qué, lo que se hizo, lo pendiente | S | C → So | Apartado del informe semanal | R0 | 01 §2.10 |
| INF-03 ★ | **Informe mensual al cliente** en lenguaje de negocio | LEAD-01, acciones del mes y su resultado | Tres hechos y tres acciones; leads cualificados y coste por cliente, no cuota de impresiones | M | C → So | Borrador para revisar | R0 | 07 §5 |
| INF-04 | **Aviso proactivo al cliente** cuando algo suyo está roto | DIA-06 | Borrador. Nunca se envía sin aprobación (línea roja del proyecto) | E | So | Borrador | R0 | 10 §4.2 |
| INF-05 | **Informe de auditoría** de alta o de captación comercial | EST-07 | Por tandas, con impacto en euros | E | Op | Documento | R0 | 05 §6.1 |
| INF-06 | **Preguntar a la cuenta** | Herramienta de solo lectura para los agentes existentes | Las cifras las calcula el código; la fecha va siempre explícita (apartado 5.3) | — | C → So | Respuesta | R0 | 01 §2.2, 03 (idea 12) |

### 2.N Aprendizaje de la agencia

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| APR-01 ★ | **Registro de decisiones con predicción previa** | Cada propuesta: hipótesis, métrica, efecto esperado con intervalo, ventana, criterio de vuelta atrás, quién aprobó | Se escribe antes de actuar | E | C | — | R0 | 08 §4.5, 10 §6 |
| APR-02 ★ | **Evaluación posterior con control** | Datos maduros tras la ventana | Mejor control disponible: experimento de Google → aleatorización entre entidades → series de control (Search Console, campañas y cuentas no tocadas) → antes y después ajustado | E | C | Resultado: funcionó, no concluyente o perjudicó | R0 | 08 §4 |
| APR-03 ★ | **Experimentos de agencia** | Entidades elegibles para una misma recomendación de riesgo bajo | Aplicar en una mitad al azar, la otra de control 2-4 semanas | E | C | — | R1 | 08 §4.3 |
| APR-04 ★ | **Benchmark interno** por sector, provincia y tipo de campaña | Todas las cuentas | Medianas y percentiles de CPC, CTR, CR, CPL y coste por cualificado; conversiones normalizadas por tipo | M | C | Comparar cada cuenta con sus pares | R0 | 06 §4.9, 09b §4 |
| APR-05 ★ | **Referencia del sector** para decidir con pocos datos | APR-04 | Punto de partida bayesiano de cada término, campaña y cuenta nueva (apartado 4.3) | S | C | — | R0 | 08 §2 |
| APR-06 | **Casos de oro y repetición del pasado** | Revisiones históricas de Eury; casos con fallo conocido | Antes de dejar actuar al agente: ¿habría diagnosticado bien lo que ya sabemos que pasó? | E | C | Examen del agente | R0 | 08 §7.2 |
| APR-07 | **Tasa de alertas útiles** | Respuestas útil / no útil / ya lo sabía; descartes con motivo | Reajuste de umbrales por cuenta; el descarte con motivo no penaliza ninguna nota | M | C | — | R0 | 08 §3.4, 10 §3.5 |
| APR-08 | **Conocimiento vivo de la plataforma** | Base de conocimiento del núcleo | Lista de lo obsoleto (posición media, audiencias similares, SKAG, anuncios de texto, CPC mejorado) para que la IA no repita sabiduría vieja: un estudio encontró un 20 % de respuestas erróneas de IA generalista sobre PPC | M | So | — | R0 | 03 §2.1 |

### 2.O Equivalencia con el mapa del PDF de contraste

El PDF propone 35 auditorías. Todas quedan cubiertas, y en cada una añadimos el método concreto que el PDF deja abierto.

| PDF | Nuestras capacidades | Qué añadimos |
|---|---|---|
| A01 Horarios | PUJ-07 | Horario del negocio y llamadas perdidas; límites reales de Smart Bidding |
| A02 Términos y negativas | TER-01, 02, 03, 04, 06 | Cascada con ficha del cliente, n-gramas entre cuentas, lugares fuera de zona |
| A03 Gasto desperdiciado | TER-02, TER-07, LAN-05 | Umbral ligado al CPA y probabilidad en vez de importe fijo |
| A04 Reparto de presupuesto | PUJ-05 | CPA marginal con simuladores |
| A05 Zona, dispositivo, ubicaciones | EST-01, EST-02, PUJ-07, GOO-01 | Zona real de la ficha |
| A06 Ritmo | PRO-07 | Reglas de 2026 (30,4×, días apagados) |
| P01 Medición | MED-01 a MED-11 | Conciliación diaria con el CRM, madurez, fuga de identificadores |
| P02 Políticas | PRO-05, ANU-06 | Ley española además de la política de Google |
| P03 Salud y acceso | MED-12, PRO-08 | — |
| P04 Anomalías | PRO-01 a 04, PRO-09, DIA-01 | Poisson, causa común entre cuentas, una alerta por causa |
| P05 URL rotas | PRO-06, LAN-06 | Páginas elegidas por Google |
| P06 Estructura y conflictos | TER-06, TER-07, EST-03, EST-06 | Regresiones que reaparecen |
| E01 Cuota de impresiones | CUO-01, 02, 03, ESC-04 | Separar presupuesto, ranking y competencia |
| E02 Mezcla de campañas | GOO-01, ESC-07 | — |
| E03 Audiencias propias | EST-05, ESC-08 | Restricción de salud |
| E04 Estrategia de puja | PUJ-01 a 04, PUJ-06 | Efecto 17 de agosto; «manos quietas» |
| E05 Expansión de canal | ESC-07 | — |
| E06 Retorno marginal | PUJ-05, ESC-04 | — |
| C01 Nivel de calidad | LAN-01 | Histórico propio ponderado |
| C02 Anuncios y recursos | ANU-01 a 05, ANU-07 | Test honesto; redactor anclado |
| C03 Audiencias | EST-05 | — |
| C04 Relevancia de landing | LAN-02 a 05 | Embeddings con el texto real de la página; cambios en la web |
| C05 Calidad tras el clic | LAN-07, PRO-10 | Clarity |
| C06 Calidad de conversión | LEAD-01 a 08 | Por término y red; spam; valor por etapa |
| D01 Minería de términos | TER-05, ESC-02 | Con calidad del CRM |
| D02 Hueco SEO-PPC | ESC-01 | En las dos direcciones |
| D03 Hueco competitivo | CUO-04, 05, 06 | Subastas sin API; resultados de búsqueda |
| D04 Funciones sin usar | EST-09, GOO-06 | — |
| D05 Venta cruzada | ESC-08 | — |
| D06 Términos en tendencia | TER-10 | — |
| X01 Incrementalidad pago-orgánico | ESC-01, APR-03 | Experimento, no suposición |
| X02 Offline y CRM | MED-02, MED-10, LEAD-01 | Data Manager API, conciliador |
| X03 Embudo GA4 | LAN-07 | — |
| X04 Atribución entre canales | DIA-04 (parcial) | Lo dejamos fuera a propósito: con estas cuentas no hay datos para modelos de atribución (apartado 4.8) |
| X05 Puntuación de audiencias | LEAD-04 (valor por etapa) | Sin unir usuarios entre plataformas |

**Lo que nuestro catálogo tiene y el PDF no:** toda la familia de diagnóstico (DIA), la estadística para pocos datos
(PRO-03, MED-06, APR-05), los cambios de Google como causa (PUJ-03, GOO-03 a 05, DIA-05), la exclusión de datos calculada
(PUJ-08), el cumplimiento de la ley española (ANU-06), el negocio local (TER-04, EST-02, LEAD-06, PUJ-07), el gobierno de
alertas (PRO-12) y toda la familia de aprendizaje (APR). Además, el PDF da precios desfasados (TrueClicks «desde 208 $»; es
gratis hasta 50.000 $ de inversión mensual; 02) y propone BigQuery y Looker, que aquí no hacen falta.

---

## 3. El motor de diagnóstico

Es la pieza que convierte «el CPL ha subido» en «ha subido por esto, hemos descartado esto otro, y proponemos esto». Es
también lo que pide el brief («con el porqué») y lo que el mercado no entrega: Adalysis y Optmyzr tienen árboles de métricas,
pero el usuario tiene que abrirlos e interpretarlos, y solo ven Google Ads (02).

### 3.1 Tres reglas de diseño

1. **El código calcula; la IA redacta.** Todas las ramas del árbol son comprobaciones de datos. La IA recibe el resultado ya
   calculado y solo puede citar causas que estén en él. Así no puede inventarse un competidor ni un cambio que no existió.
2. **Una alerta por causa, no por métrica.** «Landing caída» explica a la vez que baje la conversión, suba el CPA y falten
   leads: es un solo mensaje (05 §6.3).
3. **Se permite «no concluyente».** Si falta evidencia, el diagnóstico lo dice y propone la siguiente comprobación, en vez de
   elegir la causa más verosímil. Es la práctica del único proyecto que distingue «no lo sé» de «falla» (claude-ads, 03).

### 3.2 El árbol unificado

Los informes proponen cinco órdenes distintos (01, 04, 05, 07 y 10). Decisión [opinión]: el código ejecuta **todas** las
ramas siempre (es barato); el orden de abajo decide qué causa gana cuando varias encajan. Va primero lo que invalida todo lo
demás y lo que es un hecho comprobable, y al final lo interpretable.

| Paso | Pregunta | Comprobaciones | De dónde sale el dato | Si la respuesta es sí |
|---|---|---|---|---|
| **0** | **¿Es real el cambio?** | Datos maduros (MED-06); dentro del ruido esperado (apartados 4.1 y 4.5); festivo o puente local; estacionalidad (mismo periodo del año anterior, índice del sector); cambio de definición (acción pasada a secundaria: baja «Conversiones» pero no «Todas») | Ads; calendario de la agencia; ESC-05 | No se alerta. Se anota |
| **1** | **¿Se rompió la medición?** | Estado de cada acción; caída a cero de una acción con clics normales; Ads frente a GA4 frente a CRM; cambio en la web o en el banner de cookies en esa fecha; subida de conversiones con errores | Ads; GA4; GoHighLevel; registro de cambios de la web | Tarea a web, exclusión de datos (PUJ-08). **No tocar pujas** |
| **2** | **¿La cuenta puede servir?** | Pago y presupuesto de cuenta; fecha de fin; rechazos; URL final caída; presupuesto agotado temprano | Ads; vigilancia de páginas caídas | Aviso urgente |
| **3** | **¿Cambió algo nuestro, del cliente o de Google?** | Historial de cambios de los 14 días previos al inicio (qué, quién, valor antes y después); recomendaciones autoaplicadas; migraciones automáticas; estado de Smart Bidding (aprendiendo, limitada); calendario de plataforma; cambios del cliente (oferta, precio, horario, servicio retirado) | Almacén propio de `change_event`; GOO-04; ficha y memoria del cliente | Se evalúa como «efecto de un cambio»: revertir, esperar o ajustar |
| **4** | **¿Qué factor explica el cambio?** | Descomposición del KPI (3.3) y bajada por la rama con más peso (3.4) | Ads más cruces | Causa candidata con su % de contribución |
| **5** | **¿Dónde?** | Campaña → red → dispositivo → zona → hora → término → anuncio → landing; mezcla frente a tasa | Ads por segmentos | Señala la combinación culpable |
| **6** | **¿Se sostiene la hipótesis?** | ¿Coincide la fecha? ¿La magnitud explica ≥50 % del cambio? ¿Hay contraste: otras campañas u otras cuentas del sector sin esa causa no cayeron? | Todas las cuentas | Confianza alta, media o «no concluyente» |

### 3.3 Descomposición del KPI

Identidades (aritmética, no opinión; 05 §4.2, 08 §4.1):

```
Impresiones  = Búsquedas elegibles × Cuota de impresiones
Cuota + Perdida por presupuesto + Perdida por ranking = 100 %      (solo Búsqueda)
Clics        = Impresiones × CTR
Coste        = Clics × CPC
Conversiones = Clics × CR  = Elegibles × Cuota × CTR × CR
CPA          = CPC / CR
Búsquedas elegibles ≈ Impresiones / Cuota
```

Como son productos, el cambio se reparte de forma exacta con logaritmos, sin depender del orden:

```
ln(Conv₁/Conv₀) = ln(Eleg₁/Eleg₀) + ln(Cuota₁/Cuota₀) + ln(CTR₁/CTR₀) + ln(CR₁/CR₀)
ln(CPA₁/CPA₀)   = ln(CPC₁/CPC₀) − ln(CR₁/CR₀)
Contribución de un factor = su logaritmo / logaritmo del KPI
```

**Ejemplo.** Las conversiones bajan un 30 % (logaritmo −0,357). Búsquedas elegibles −5 % (−0,051), cuota −20 % (−0,223), CTR
+2 % (+0,020), CR −10 % (−0,105). Reparto: **62 % de la caída es cuota de impresiones**, 29 % tasa de conversión, 14 %
demanda, y el CTR compensa un 6 %. La pregunta siguiente es mecánica: ¿la cuota se perdió por presupuesto o por ranking?

Es el método LMDI de economía; ninguna fuente de PPC lo nombra y Optmyzr no publica cómo calcula sus contribuciones (05).

**Mezcla frente a tasa.** El CPL de una cuenta puede empeorar sin que ninguna campaña empeore, solo porque el tráfico se
desplaza hacia lo peor (más móvil, más socios de búsqueda, AI Max ampliando):

```
ΔCR = Σ (peso₁ − peso₀) × CR₀      ← efecto mezcla
    + Σ peso₀ × (CR₁ − CR₀)        ← efecto tasa
    + interacción
```

Regla práctica para bajar de nivel: elegir la dimensión en la que ≤3 elementos concentran ≥60-70 % del cambio (estimación
propia del informe 05).

### 3.4 Las ramas, y lo que aporta nuestra herramienta en cada una

| Rama | Sub-causas | Dato de Google Ads | **Cruce que solo tenemos nosotros** |
|---|---|---|---|
| **Impresiones ↓ por demanda** | Estacionalidad, festivo, clima, el mercado encoge (resultados con IA) | Elegibles ≈ impresiones / cuota | **Search Console**: impresiones orgánicas de las mismas consultas como serie de control. **GBP**: vistas y llamadas. **Otras cuentas del sector**: ¿les pasa lo mismo? |
| **Cuota ↓ por presupuesto** | Presupuesto recortado; CPC más alto con el mismo presupuesto; cambio del 17 ago 2026 | Cuota perdida por presupuesto; estado «limitada» | **Contrato** de la ficha: ¿hay margen para subir? |
| **Cuota ↓ por ranking** | (a) objetivo o puja; (b) calidad; (c) competencia | Cuota perdida por ranking; nivel de calidad por componente; historial de objetivos | **Informe de subastas importado**; anuncios vistos en los resultados (DataForSEO); **competidores de la ficha**; velocidad y cambios de la landing |
| **Cobertura ↓** | Palabras pausadas o de «poco volumen», negativas nuevas, zona, horario o audiencia estrechados | Historial de cambios; estado de criterios | **Zona y horario reales** de la ficha |
| **CTR ↓** | Peor posición; peor mezcla de consultas; anuncio; resultados con más cosas encima | Parte superior; términos por origen | Página de resultados (DataForSEO): qué más aparece |
| **CPC ↑** | Competencia; objetivo cambiado; calidad; mezcla hacia lo caro | CPC por segmento | Regla de Geddes: **si el CPC sube un 25 % y el CPA no cambia, el sistema funciona** (10 §4.4) |
| **CR ↓** (la rama clave en leads) | Medición (volver al paso 1); landing caída, lenta o cambiada; formulario roto; mezcla de tráfico peor; oferta; reputación; calidad del lead | CR por landing, red, dispositivo, zona, hora | **Vigilancia de caídas, registro de cambios, PageSpeed y CrUX** (SEO); **GA4** por landing; **Clarity** (errores, clics de rabia); **reseñas de GBP**; **CRM**: ¿llegan leads y no cualifican?; **ficha**: ¿se sigue ofreciendo ese servicio? |
| **Gasto ↑ sin conversiones** | Presupuesto u objetivo relajado; término o zona nueva que se come el gasto; clics no válidos; exploración tras un cambio | Términos y zonas nuevas; historial | Clics sin sesión en GA4 o Clarity |

Nota sobre el retraso de los datos: la cuota de impresiones llega con unos 3 días de retraso (04). Para una alerta de hoy, el
motor usa señales rápidas (impresiones, CPC, % en parte superior, que se actualizan cada hora) y la cuota hasta hace 3 días
como contexto; el diagnóstico se completa solo cuando llega.

### 3.5 Confianza de la causa

Cada causa candidata recibe una nota con cuatro criterios que el código puede comprobar:

| Criterio | Pregunta | Peso [opinión, a calibrar] |
|---|---|---|
| Tipo de evidencia | ¿Es un hecho (404, pago rechazado, acción inactiva) o una inferencia? | Un hecho da confianza alta por sí solo |
| Fecha | ¿El inicio del problema coincide con el evento? | Alto |
| Magnitud | ¿Explica al menos la mitad del cambio? | Alto |
| Contraste | ¿Lo que no tuvo esa causa (otras campañas, otras cuentas del sector) no cayó? | Medio |

Y se informa de la **cobertura**: cuántas ramas se pudieron comprobar de verdad. Si el cliente no tiene CRM conectado o el
informe de subastas no ha llegado, el mensaje lo dice.

### 3.6 Prioridad de cada hallazgo

```
Prioridad = (Impacto mensual en € × Confianza × Urgencia) / Esfuerzo
```

- **Impacto:** gasto evitable, o leads perdidos × valor del lead (o × CPA objetivo si no hay valor).
- **Confianza:** la probabilidad del método estadístico, o 1 para hechos.
- **Urgencia:** 3 si pierde dinero cada hora (web caída, medición rota, pago), 2 semanal, 1 estructural.
- **Esfuerzo:** de 1 (un clic) a 5 (rehacer una landing).

Fórmula propuesta en el informe 05; es criterio propio, no sale de una fuente. Las etiquetas de impacto anual de Opteo y el
orden por impacto de TrueClicks y Adalysis van en la misma dirección, pero ninguna publica su cálculo (02).

### 3.7 Cómo se ve el resultado

> **Reformas López · campaña «Cocinas»: 3 días sin leads.** Lo normal son 1,5 al día; que sea casualidad tiene una
> probabilidad del 1,1 %.
> **Causa más probable (confianza alta):** la página /reformas-cocina devuelve error 500 desde el martes a las 10:40.
> **Descartado:** medición (el CRM tampoco recibe leads de esa página), presupuesto (cuota perdida por presupuesto 2 %),
> competencia (subastas sin cambios), cambios en la cuenta (ninguno en 14 días).
> **Propuesta:** avisar a web; pausar la campaña hasta que la página vuelva; después, exclusión de datos del martes al día
> del arreglo. **Coste de no hacer nada:** unos 57 € al día en clics a una página rota.

---

## 4. Estadística con pocos datos

El problema de fondo de vuestras cuentas no es que falten algoritmos, es que faltan datos. Con uno a cinco leads al día por
campaña, las técnicas de los grandes anunciantes no sirven, y las reglas fijas de las herramientas («150 clics sin
conversión») llegan tarde o dan falsas alarmas (08). Estos son los métodos concretos. Todo es cálculo en código: coste de IA,
cero.

### 4.1 «Días sin convertir»: Poisson

Si una campaña espera λ conversiones al día, la probabilidad de pasar N días a cero por puro azar es:

```
P(0 en N días) = e^(−λ × N)        →  avisar cuando sea menor que α:   N ≥ ln(1/α) / λ
```

| Conversiones esperadas al día | P(0 en 2 días) | P(0 en 3 días) | Días a cero para avisar con α = 5 % | con α = 2 % |
|---|---|---|---|---|
| 3 | 0,2 % | ≈ 0 | 1 | 2 |
| 2 | 1,8 % | 0,2 % | 2 | 2 |
| 1,5 | 5 % | 1,1 % | 2 | 3 |
| 1 | 13,5 % | 5 % | 3 | 4 |
| 0,5 | 37 % | **22 %** | 6 | 8 |
| 0,2 (unas 6 al mes) | 67 % | 55 % | 15 | 20 |

**Conclusión:** la regla «2-3 días sin convertir» solo es señal en campañas con 1,5 o más leads al día. En una de medio lead
al día, tres días a cero pasan una de cada cinco veces.

Cuatro ajustes que la hacen fiable:

1. **λ sale de la línea base del mismo día de la semana** (4.5), no de la media plana.
2. **Mejor contar clics que días.** Con n clics y una tasa de conversión esperada CR, lo esperado es μ = n × CR y
   P(0) = e^(−μ). Así, si el gasto también cayó, la regla no acusa a la conversión: manda al paso «¿la cuenta puede servir?».
   Es la comprobación de Ani: sin clics suficientes no puede haber conversiones (10 §4.1).
3. **Descontar los días inmaduros** (4.4).
4. **Si los datos tienen más ceros de los que predice Poisson** (leads que llegan a rachas), usar binomial negativa (08).

### 4.2 «Gasto sin conversión»: la regla e^(−k)

La regla de oficio «pausar tras gastar 2-3 veces el CPA objetivo sin convertir» tiene base exacta. Si un término convirtiera
de verdad al ritmo del objetivo, gastar k veces el CPA objetivo sin ninguna conversión tiene probabilidad e^(−k):

| k (veces el CPA objetivo gastadas) | 1 | 1,5 | 2 | 2,5 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|---|
| Probabilidad de que sea un término «bueno con mala suerte» | 37 % | 22 % | 13,5 % | 8 % | **5 %** | 1,8 % | 0,7 % |

Ejemplo: CPA objetivo 40 €, CPC 2 € (tasa necesaria 5 %). Con 40 clics a cero (80 €, k = 2) la probabilidad es 12,9 %; con 60
clics (120 €, k = 3), 4,6 %.

Lo que la regla no dice, y el agente debe saber (05 §5.1):

- Solo prueba que el término es peor que «justo en objetivo». Uno al 60 % del objetivo también es malo y pide más datos.
- Con cientos de términos evaluados a la vez, un 5 % de los buenos cae al umbral k = 3 por azar. En cuentas grandes, k = 4 o
  una confirmación adicional.
- Hay que contar las conversiones del CRM y descontar los clics recientes que aún no han madurado.

### 4.3 Bayesiano jerárquico: pedir prestados datos al grupo y al sector

Es la técnica que más valor da y que ninguna herramienta del mercado usa para cuentas pequeñas (08). La tasa de conversión
de un término con pocos clics se «encoge» hacia la de su grupo:

```
Punto de partida:  CR ~ Beta(α₀, β₀)   con  α₀ = m × μ ,  β₀ = m × (1 − μ)
   μ = tasa del nivel superior ;  m = fuerza del punto de partida, en «clics equivalentes» (20-200)
Tras c conversiones en n clics:  Beta(α₀ + c, β₀ + n − c)
Estimación encogida:  (m × μ + c) / (m + n)
Decisión:  P(CR ≥ CR*) , con  CR* = CPC / CPA objetivo
```

**Jerarquía:** término → palabra → grupo → campaña → cuenta → **sector (varias cuentas)**. El último nivel es la ventaja de
tener 25+ cuentas con su ficha al lado. Condición: que las conversiones signifiquen lo mismo (una llamada de cerrajero no es
un formulario de clínica), así que se normaliza por tipo de conversión (08 §2.3).

**Ejemplo calculado.** Sector con tasa media del 8 % y fuerza m = 50, es decir Beta(4, 46). CPC 2 €, CPA objetivo 40 €
(CR* = 5 %).

| Caso | Tasa ingenua | Estimación encogida | P(cumple el objetivo) | Qué haría una regla fija | Qué hace el agente |
|---|---|---|---|---|---|
| 3 conversiones en 10 clics | 30 % | 11,7 % | 97 % | «¡Término estrella!» | Bueno, pero no un 30 % |
| 0 en 45 clics (90 €) | 0 % | 4,2 % | 30 % | Con k > 2, negativa | **Esperar**: en este sector, 45 clics a cero aún es normal |
| 0 en 90 clics (180 €) | 0 % | 2,9 % | 7,9 % | Negativa | Negativa (por debajo del 10 %) |
| 0 en 90 clics, con referencia débil (m = 20) | 0 % | 1,5 % | 1,3 % | Negativa | Negativa clara |

Reglas de decisión de partida [opinión]: actuar si P(cumple) < 10 % y el gasto es material; «vigilar» entre 10 % y 30 %.

**Dos ideas propias sobre esta base:**

- **Punto de partida semántico.** La media μ no tiene por qué ser la misma para todos los términos del grupo. Un término
  cercano a los servicios de la ficha (por embeddings) parte de la media del grupo; uno lejano parte de una media más baja y
  llega antes al umbral. Así se unen el juez de intención y la estadística en un solo número, en vez de dos reglas que
  discuten (el desacuerdo «números o intención» del apartado 1.2).
- **La fuerza m se calibra con los datos:** si los términos de un sector convierten todos parecido, m sale grande; si son muy
  dispares, pequeño (bayes empírico; 05 §5.3). La referencia académica es el modelo DHEB de Adobe, que mide que la ventaja
  frente a la media histórica crece cuanto más escasos son los datos (08 §2.3).

Para comparar tasas con pocos datos sin punto de partida, el intervalo correcto es el de Wilson: 2 conversiones en 40 clics
dan un intervalo del 1,4 % al 16,5 %, es decir, un CPA entre 12 € y 145 € con CPC de 2 €. No se puede decidir (05 §5.2).

### 4.4 Madurez de las conversiones

Google atribuye la conversión al **día del clic**. Un lead que llega dos días después «rellena» el pasado, así que los
últimos días siempre parecen peores de lo que son. El agente construye, por cuenta y por acción, la curva F(d): qué fracción
de las conversiones ya está registrada d días después del clic (con el segmento de retraso de Google o, mejor, con la fecha
del lead en el CRM).

```
Conversiones finales estimadas de un día con antigüedad d  =  observadas / F(d)
```

Ejemplo ilustrativo: F(0) = 0,70; F(1) = 0,85; F(3) = 0,90; F(7) = 0,97. Ayer: 120 € y 2 leads, CPL aparente 60 €.
Corregido: 2 / 0,70 = 2,9 leads, CPL de 42 €. Un sistema ingenuo avisaría cada mañana.

Reglas: ninguna regla de CR o CPA usa días con F < 0,85; en pantalla salen en gris; el día en curso nunca se puntúa. Cada
acción tiene su curva: el formulario madura en horas, el «lead cualificado» en días o semanas. Y para las alertas de «hoy no
hay leads» se usa la métrica por fecha de conversión (`conversions_by_conversion_date`), no la de fecha de clic (04 §5).

### 4.5 Línea base por día de la semana y umbrales adaptativos

**Línea base.** Para cada métrica y día de la semana: mediana de las últimas 6-8 semanas del mismo día, y dispersión con la
desviación absoluta mediana (MAD), que no se deja engañar por un pico.

```
z robusto = 0,6745 × (valor − mediana) / MAD
```

Ejemplo: clics de los últimos seis martes: 40, 46, 38, 52, 44, 41. Mediana 42,5; MAD 3,0. Hoy, 22 clics: z = −4,6. Es una
anomalía clara. Con 36 clics, z = −1,5: ruido.

Higiene de la línea base: fuera el día en curso, fuera los días ya marcados como anómalos (si no, un problema persistente «se
normaliza» solo), fuera los festivos de la zona del cliente. Para recuentos pequeños (leads), no z sino Poisson (4.1). Para
derivas lentas, CUSUM o tendencia de 4-8 semanas (PRO-04).

**Umbrales adaptativos.** Lo que más reduce las falsas alarmas no es afinar el umbral estadístico sino poner suelos (05 §6.3):

| Mecanismo | Regla |
|---|---|
| Suelo de materialidad | No se avisa por debajo de un impacto mínimo en euros o leads, por cuenta |
| Cambio absoluto además del relativo | Un +50 % sobre 4 clics no es nada |
| Persistencia | En métricas ruidosas, 2 de 3 periodos anómalos |
| Jerarquía | Se detecta en cuenta y campaña; se baja a término solo para explicar |
| Muchas pruebas a la vez | Con 25 cuentas × campañas × métricas, corrección de falsos descubrimientos (Benjamini-Hochberg) |
| Presupuesto de alertas | El umbral se fija probando 90 días de histórico para que salgan las alertas que una persona lee de verdad (unas 10 por mañana) |
| Realimentación | Cada alerta lleva útil / no útil / ya lo sabía; los umbrales se reajustan por cuenta |

### 4.6 Tests de anuncios sin autoengaño

Martin Röttgerding dejó correr 576 tests entre anuncios **idénticos**: el 55 % de los que tenían ≥1.000 impresiones salió
«significativo al 95 %» en algún momento, y el 81 % con 100.000 (01 §2.12). Mirar el test cada día y parar al primer «95 %»
no es estadística. Además, en un tercio de los tests el ganador global de CTR perdía en la red de Google (efecto de los
socios de búsqueda).

Método del agente: métrica **conversiones por impresión** (une CTR y conversión; Geddes); solo red de Google, separando parte
superior y resto; probabilidad bayesiana de que A supere a B con la referencia del grupo; **horizonte fijado de antemano**
(mínimo una semana completa; mínimos de Adalysis para tráfico bajo: 350 impresiones y 7 conversiones por anuncio); en grupos
pequeños, test multigrupo sumando grupos con el mismo patrón de anuncio. Y con la lógica de decisión de «Test & Roll» (Feit y
Berman): con poblaciones pequeñas conviene decidir antes minimizando la pérdida esperada, no esperar una significancia que
nunca llegará (08 §2.5). Limitación honesta: Google ya rota las combinaciones a su manera; el único A/B limpio son los
experimentos de campaña.

### 4.7 Presupuesto: CPA marginal, no medio

Con rendimientos decrecientes, Conv = a × gasto^b (con b entre 0 y 1), el coste del lead **adicional** es el CPA medio
dividido por b. Con b = 0,7, el siguiente lead cuesta 1,43 veces el medio: una campaña justo en objetivo empeora un 40 % el
coste de cada lead extra si se le sube el presupuesto. El reparto óptimo iguala el CPA marginal entre campañas (08 §5.1). La
curva sale de los simuladores de Google por API, de la cuota perdida por presupuesto (si es alta y el CPL es bueno, la curva
aún es casi recta) y, con pocos datos, de la referencia del sector.

### 4.8 Qué no aplica a estas cuentas, y con qué se sustituye

| Técnica | Por qué no | Sustituto |
|---|---|---|
| Conversion Lift de Google | Pide unos 5.000 $ y unas 1.000 conversiones por estudio | Experimentos de campaña de Google |
| Geoexperimentos | Un negocio local tiene una sola zona | Aleatorizar entre entidades o entre cuentas (APR-03) |
| Modelos de mezcla de medios (Meridian) | Dos años de datos semanales, idealmente 50 zonas | Series de control: Search Console y cuentas no tocadas (método CausalImpact) |
| Detectores de anomalías estándar sobre leads diarios | Con recuentos muy bajos rinden apenas mejor que el azar | Rachas de ceros, ventanas de 3, 7 y 14 días, y métricas con más volumen que adelantan el problema |

Fuente: 08 §3.2 y §4.4.

---

## 5. Dónde usar IA y dónde no

### 5.1 Reparto por tipo de tarea

Aplicando la directiva de optimización de IA del proyecto (¿razonamiento o similitud?, ¿hay algoritmo?, ¿vale un modelo más
pequeño?). La mayor parte del agente **no es IA**.

| Tarea | Motor | Por qué |
|---|---|---|
| Sincronizar datos, métricas, CPA, proyecciones | Código | Geddes vio a los modelos invertir la fórmula del CPA y multiplicar un presupuesto por 100 por un separador decimal (01 §2.2). Ninguna cifra la calcula un modelo |
| Anomalías, Poisson, bayesiano, madurez, descomposición, reparto de presupuesto, prioridad | Código | Son fórmulas cerradas. Gratis, explicables y con pruebas automáticas |
| Reglas de configuración (las familias MED, EST, PRO) | Código | Comprobaciones deterministas |
| N-gramas, duplicados, conflictos de negativas, lugares fuera de zona | Código | Texto y conjuntos; no hace falta entender nada |
| Similitud término ↔ servicios ↔ anuncio ↔ landing; agrupar términos | Embeddings (los que ya usa el módulo SEO) | Es similitud, no razonamiento. Céntimos por miles de términos |
| Clasificar la intención de términos dudosos; clasificar llamadas; vetar textos por sector | Haiku, por lotes, con la ficha en caché | Clasificación con contexto corto. La literatura (eBay, Walmart) usa el modelo grande para etiquetar y el barato para servir (08 §1.3) |
| Redactar el diagnóstico ya calculado; resumen semanal; informe al cliente | Sonnet | Redacción con criterio sobre datos cerrados |
| Redactar anuncios y juzgar su anclaje en la landing | Sonnet | Generación más evaluación con criterios claros |
| Auditoría de entrada, reestructuras, recomendación de mezcla de campañas | Opus, ocasional | Razonamiento largo con mucho contexto; pocas veces al mes |
| Revisión estratégica trimestral de una cuenta y segunda opinión sobre propuestas R3 antes de enseñarlas | Fable, puntual | Lo más difícil y lo más caro de equivocarse; volumen mínimo [opinión; coste por verificar antes de presupuestar] |

Orden de magnitud [opinión, sin precios verificados]: los términos nuevos de 25 cuentas son miles a la semana, no millones;
tras las capas de reglas y embeddings, a la IA llega una fracción. El riesgo de coste no está ahí sino en pasar tablas
enteras a un modelo caro (Rooijmans cita 10 $ por un solo análisis de términos mal planteado; 07). Todo pasa por la pasarela
de IA existente, con su presupuesto y su registro.

### 5.2 El patrón de agente seguro

Coinciden en él los practicantes (Rooijmans, Wenner, Vallaeys, Leake), el servidor oficial de Google (proponer y confirmar)
y la literatura (HOBA: el modelo propone parámetros, el código los recorta) (01 §4, 04 §4.9, 08 §7).

| Paso | Qué ocurre | Quién | Detalle |
|---|---|---|---|
| 1. **Proponer** | Hallazgo → propuesta con datos, rango de fechas, impacto en €, probabilidad y cómo deshacerla | Código; la IA redacta | Cada propuesta declara su predicción (APR-01) |
| 2. **Validar con código** | Límites duros: cambio máximo por día y por semana (±20 % en objetivos y presupuestos), nunca por encima del presupuesto del contrato, nunca pausar la marca ni la única campaña activa, «manos quietas» (PUJ-06), conflictos de negativas, sector regulado, simulación con `validate_only` | Código | Lo que no pasa no llega a la persona |
| 3. **Aprobar** | Según riesgo: R0 no necesita; R1 un clic o por lotes; R2 una persona; R3 una persona y, en clientes clave, Enric | Persona | Se guarda quién, cuándo y por qué. Descartar con motivo enseña al agente |
| 4. **Aplicar** | Por la API, con una etiqueta de Google Ads en lo tocado y registro propio del valor antes y después | Código | Comprobar que lo aplicado es exactamente lo aprobado: Wenner vio agentes cuyo razonamiento no coincidía con el cambio hecho |
| 5. **Medir** | Al cerrar la ventana, con datos maduros y contra un control (APR-02). Si las métricas de protección caen, propuesta de vuelta atrás | Código | Resultado: funcionó, no concluyente o perjudicó |
| 6. **Aprender** | El resultado medido, con su incertidumbre, actualiza la tasa de acierto por tipo de acción, sector y tamaño de cuenta | Código | Nunca conclusiones en prosa del propio agente (ver abajo) |

Sobre el paso 6: las memorias de agente que guardan «reflexiones» asumen que el agente acierta al explicar por qué algo
funcionó. Con datos ruidosos, una conclusión equivocada se queda grabada y el agente deja de probar lo que «no funciona»
(crítica «Honest Lying», 08 §7.3). Por eso la memoria guarda **resultados medidos, con caducidad y con un mínimo de
exploración**.

### 5.3 Guardarraíles específicos de la IA sobre datos de Ads

- **Fecha explícita en cada consulta** (sin fecha, cada modelo elige un periodo distinto; Geddes, 01).
- **Validación de magnitud** antes de cualquier propuesta de puja o presupuesto.
- **Un agente, una tarea, pocas herramientas.** Wenner creó unas 140 funciones y solo unas 30 sirven en producción; por
  encima de 10-12 herramientas por agente, inestabilidad (01 §4).
- **Umbral de confianza.** El juez de términos puntúa su seguridad; ≥85 % propone con prioridad, por debajo pregunta
  (Rooijmans). Es un umbral de partida que hay que calibrar con las correcciones de Eury.
- **Contexto del cliente siempre.** El juez de Rooijmans quiso negativizar coches baratos a un cliente que sí los aseguraba.
  Con la ficha (servicios, zona, lo que no hace) ese error se evita; es la queja nº 1 contra Opteo («no entiende el
  contexto», 10 §3.2).
- **Examen antes de activar o cambiar un prompt** (ya es regla del proyecto) y casos de oro (APR-06): las actualizaciones de
  modelo cambian el comportamiento con los mismos datos.
- **La responsabilidad es de la agencia**, no del modelo (Kirk Williams, 01): por eso la traza de quién aprobó.

### 5.4 Organización propuesta [opinión]

Agentes estrechos coordinados por el núcleo, encajados en el organigrama que ya existe (un «Jefe de Google Ads» al estilo
del Jefe SEO): **Vigía** (solo código: reglas y anomalías), **Diagnosticador** (código + Sonnet), **Juez de términos**
(embeddings + Haiku), **Redactor** (Sonnet), **Auditor** (Opus, por evento) y **Estratega** (Fable u Opus, trimestral).

---

## 6. Datos: qué se guarda y cómo se relaciona

Modelo conceptual para diseñar después las tablas `ads_*`. Wenner lo resume bien: un agente de PPC «es más un proyecto de
base de datos que de scripts» (01).

### 6.1 Principios

1. **Cada granularidad en su sitio.** No mezclar filas de campaña con filas de término: Google no permite sumar algunas
   métricas (la cuota de impresiones) y otras se duplican (un mismo término aparece en varios grupos).
2. **Identificadores nativos de Google** junto a cuenta, moneda y zona horaria (todas las fechas de la API van en la zona de
   la cuenta).
3. **Conversiones fraccionarias tal cual** (con atribución basada en datos salen valores como 0,37); los CPA se recalculan
   desde las sumas; un dato ausente no es un cero.
4. **Resincronizar siempre los últimos 7-10 días**, porque conversiones y cuota llegan tarde y Google corrige.
5. **Configuración con historia**: no basta el valor actual; hay que poder preguntar «¿qué objetivo tenía esta campaña el día
   12?».
6. **Formato largo para métricas** donde ayude (como ya hace Rendimiento), para que una métrica nueva no exija migración.

### 6.2 Entidades

| Grupo | Entidad | Granularidad | Qué guarda |
|---|---|---|---|
| **Cuentas** | Cuenta de Ads | Una por cuenta de Google | Enlace al cliente (la cuenta ya figura en «Webs y cuentas» de la ficha), MCC, moneda, zona horaria, estado, ajustes de medición |
| | Estado de sincronización | Cuenta × recurso | Cursor, último éxito, errores, operaciones gastadas del cupo diario |
| **Estructura** | Campaña, grupo, palabra, negativa, lista compartida, anuncio, recurso, grupo de recursos, presupuesto, estrategia de puja, acción de conversión, criterios (zona, horario, audiencia) | Una fila por entidad | Identidad y atributos actuales |
| | **Versiones de configuración** | Entidad × periodo de validez | Foto de los ajustes que importan (objetivo, presupuesto, estrategia, redes, tipo de ubicación, AI Max, estado) con «válido desde / hasta» |
| | Clasificación propia | Entidad | Marca, genérico o competidor; servicio de la ficha; zona; grupo de comparación |
| **Rendimiento** | Diario por campaña | Campaña × día × red × dispositivo | Coste, impresiones, clics, conversiones, valor, conversiones por fecha de conversión |
| | Diario por grupo y por palabra | Entidad × día | Lo mismo, sin segmentos finos |
| | Por acción de conversión | Campaña × acción × día | Conversiones por acción; base de MED-02 |
| | Por hora y día de la semana | Campaña × día × hora | Para horario y agotamiento de presupuesto |
| | Por zona | Campaña × ubicación física × semana | Con el indicador «dentro o fuera de la segmentación» |
| | Por landing | URL configurada y URL expandida × semana | Para LAN-03, 05 y 06 |
| | Por recurso de anuncio | Anuncio × recurso × semana | Con etiqueta de rendimiento y fijación |
| | Canales de PMax | Campaña × canal × día | |
| **Visibilidad** | Cuota de impresiones | Cuenta, campaña y palabra × día | Las once métricas de cuota, **al nivel en que se vayan a mostrar** |
| | Nivel de calidad | Palabra × día | Nota y tres componentes |
| | Subastas | Campaña × competidor × semana | Del informe programado importado |
| **Términos** | Término de búsqueda | Texto normalizado, único por cuenta | Embedding, n-gramas, clasificación (intención, servicio, lugar, marca), confianza, quién decidió |
| | Rendimiento del término | Término × campaña o grupo × semana × origen del emparejamiento | Coste, clics, conversiones; estado (añadido, excluido) |
| | Categorías de búsqueda | Campaña × categoría × mes | Para PMax y para el «gasto invisible» |
| **Estado y cambios** | Foto diaria de estado | Campaña × día | Estado de Smart Bidding, motivos de estado, presupuesto recomendado, rechazos |
| | **Historial de cambios** | Evento | Fecha, usuario, herramienta, recurso, campos, valor antes y después |
| | Recomendaciones de Google | Recomendación × día | Tipo, impacto estimado, qué se hizo con ella |
| | Simulaciones | Campaña × día | Puntos de presupuesto y objetivo (para las curvas) |
| **Leads** | Enlace lead ↔ clic | Lead | Identificador de clic, campaña, término si se conoce, etapa, validez, valor; **sin datos personales en claro** |
| | Subidas a Google | Envío | Qué se envió, a qué acción, respuesta, y si Google lo contó |
| | Curva de madurez | Cuenta × acción | F(d) vigente |
| **Inteligencia** | Hallazgo | Uno por causa | Capacidad que lo detectó, entidad, evidencia, impacto, confianza, urgencia, estado, días abierto |
| | Propuesta y decisión | Una por acción | Cambio exacto, predicción, límites aplicados, quién aprobó o descartó y por qué |
| | Resultado | Una por acción evaluada | Efecto medido, intervalo, control usado, veredicto |
| | Experimento de agencia | Experimento | Entidades tratadas y de control |
| | Umbrales | Por defecto, por sector, por cliente | Valores editables del panel |
| | Referencia del sector | Sector × provincia × tipo de campaña × métrica | Medianas, percentiles y parámetros bayesianos |
| | Calendario de plataforma | Evento | Fecha, ámbito, efecto esperado, fuente |

### 6.3 Lo que hay que guardar cada noche porque Google no lo guarda (o lo borra)

| Dato | Lo que da Google | Consecuencia |
|---|---|---|
| Historial de cambios con valores y usuario | 30 días por API (la interfaz enseña 2 años) | Guardar `change_event` a diario desde el primer día |
| Qué recurso cambió | 90 días, sin valores | Complemento |
| Nivel de calidad y componentes | El valor actual; el histórico por API está sin confirmar | Foto diaria propia |
| Estado de Smart Bidding y motivos de estado | Solo el actual | Foto diaria: es oro para el porqué |
| Configuración (objetivos, presupuestos, redes, ubicación) | Solo la actual | Versiones propias |
| Recomendaciones y su impacto estimado | Solo las vigentes | Foto diaria |
| Simulaciones | Unos 7 días [detalle por verificar] | Guardar los puntos |
| Informe de subastas | Solo en la interfaz | Importación semanal |
| Cuota de impresiones | Sí, pero no se puede recalcular a otro nivel | Guardarla a cada nivel que se quiera mostrar |
| Datos diarios | 37 meses (desde jun 2026) | Nuestro histórico no caduca |
| Etiquetas de rendimiento de recursos | Solo la actual | Foto semanal |
| Leads del CRM | La conexión actual guarda 25 meses | Decidir retención del enlace lead ↔ clic |

### 6.4 Relación con el núcleo y con otros módulos

Regla del proyecto: el módulo Ads no importa a otro módulo; todo pasa por el núcleo.

| Necesidad de Ads | Lo que ya existe | Cómo se conecta |
|---|---|---|
| Cliente, sector, zona, locales, servicios, competidores, contrato, memoria | Ficha del cliente en el núcleo | Lectura directa del núcleo. El presupuesto del contrato solo lo ven administradores: el agente lo usa como límite sin mostrarlo |
| Cuenta de Ads de cada cliente | «Webs y cuentas» ya admite el tipo Ads | Registrar un directorio de cuentas de Ads, como hace Agentes con Google |
| Search Console, GA4 y GBP diarios | Módulo Rendimiento | Su proveedor de cifras para otros módulos y la fuente de métricas del núcleo |
| Landing: texto, caídas, velocidad, registro de cambios | Módulo SEO | **Hace falta un contrato nuevo en el núcleo** («dime el estado de esta URL en esta fecha»); Ads no puede importar SEO |
| Embeddings y mapa de palabras | Módulo SEO | Mismo criterio: una capacidad del núcleo para embeddings y similitud |
| Leads | Conexión con GoHighLevel (hoy: fecha, formulario, página, canal y UTM, **sin identificador de contacto ni de clic**) | Ampliación necesaria para LEAD-01 y MED-10 (decisión de Enric, apartado 11) |
| Festivos, actualizaciones de Google, incidencias | Calendario de la agencia | Ads aporta sus eventos de plataforma al mismo calendario |
| Hallazgos, intervenciones y propuestas | Tablas y registros del núcleo (hallazgos, intervenciones, motor de propuestas) | Valorar reutilizarlos antes de crear equivalentes `ads_*` (protocolo de decisión) |
| Trabajos periódicos | Cola de trabajos del núcleo | Tareas de sincronización y evaluación |
| Avisos | Cola de avisos de Operaciones | Nunca Telegram directo |
| IA | Pasarela con coste, prompts con examen | Igual que el resto |
| Tareas para el equipo | Encargos y ClickUp | Un hallazgo R0 que pide trabajo humano se convierte en encargo |

---

## 7. Restricciones técnicas reales

### 7.1 Acceso a la API (verificado en documentación oficial; 04, 10)

- **El token de desarrollador ya no existe** (retirado el 9 sep 2026). El nivel de acceso pertenece al **proyecto de Google
  Cloud** dueño de las credenciales. Lo apuntado en la memoria del proyecto («falta el token de la MCC») está obsoleto.
- Pasos: crear o elegir el proyecto de Cloud de la agencia → habilitar la API (queda en nivel de prueba) → pedir **Explorer**
  (revisión automática en la mayoría de los casos) → verificar la marca del proyecto y pedir **Basic**.

| Nivel | Operaciones al día en cuentas reales | Cómo se obtiene | Límites |
|---|---|---|---|
| Prueba | 0 (solo cuentas de prueba) | Automático | — |
| **Explorer** | 2.880 | Automático casi siempre | Sin planificador de palabras, sin gestión de usuarios ni facturación |
| **Basic** | 15.000 | Explorer + verificación de marca (minutos) | — |
| Standard | Ilimitadas | Auditoría manual, unos 10 días hábiles | — |

- **Cupo:** cada consulta cuenta como una operación; paginar no gasta. Los informes dan dos estimaciones distintas: 25
  cuentas × unas 40 consultas diarias = 1.000 operaciones más las pasadas ligeras (04), o unas 100 por cuenta y día en total
  (10). Las dos caben en Explorer para leer; **Basic da margen** para histórico inicial, simulaciones, planificador y
  escritura. Recomendación: pedir Basic cuanto antes.
- **Autenticación: cuenta de servicio añadida a la MCC** (un mismo correo solo puede estar en 20 cuentas, así que con 25+ va
  en la MCC). No le afectan la doble verificación ni las llaves de acceso obligatorias desde 2026 para los accesos de
  usuario, y no depende de un empleado. Mínimo privilegio: lectura al principio.
- **Sin librería oficial para Node.** Recomendación del informe 04: cliente REST propio con contador de operaciones,
  reintentos y versión configurable, como el de ClickUp.
- **Versiones:** vigente la v26 (14 oct 2026), que se retira en nov 2027. Cada versión dura unos 13 meses: hay que subir de
  versión al menos una vez al año. Google puede revocar el acceso tras 90 días sin uso.
- **La API es gratuita** [conocimiento general del sector; la documentación no lo afirma de forma expresa].

### 7.2 Lo que la API no da

| Dato | Estado | Alternativa |
|---|---|---|
| **Subastas (Auction Insights)** | Los campos existen en la v26 pero «no están disponibles públicamente». El informe 05 lo daba como posible; el 04 lo comprobó: **no** | Informe programado de la interfaz a un buzón u hoja (así lo hace TrueClicks); señales propias (CUO-05); anuncios en los resultados vía DataForSEO |
| **Prioridad de canal** (oct 2026) | «Próximamente» en API y Editor; no se configura desde la MCC | Segmento de red como aproximación |
| Alertas de cuenta (pago fallido, suspensión) | No hay recurso | Inferir (MED-12) |
| Diagnóstico de etiqueta como en la interfaz | No confirmado | Inferir con conversiones por acción y día; cruzar con CRM |
| Historial de cambios de más de 30 días, y los cambios hechos con Editor | No | Guardado propio; hueco asumido en Editor |
| Conversiones modeladas por consentimiento, separadas | Van mezcladas en «Conversiones» | Comparar con el CRM |
| Términos de bajo volumen | Ocultos por privacidad | Medir el «% de gasto invisible» (TER-09) |
| Asistente de Google (Ask Advisor) y algunas recomendaciones | Solo interfaz, cuenta a cuenta | — |
| IP de los clics | No | GA4 y Clarity |
| Subir conversiones offline (nuevos usuarios) | Bloqueado en la API de Ads desde el 15 jun 2026 | Data Manager API (7.3) |
| Ubicaciones de PMax | Solo impresiones | — |

### 7.3 Conversiones offline: Data Manager API (verificado; 09b, 10)

- Desde el **15 jun 2026**, quien no subía conversiones antes no puede hacerlo por la API de Ads. Nuestra herramienta es
  «nuevo adoptante»: el camino es la **Data Manager API**.
- **No exige el nivel de acceso de la API de Ads**: proyecto de Cloud, su propio permiso y acceso a la cuenta o a la MCC. Es
  decir, la subida de leads cualificados no depende de conseguir Basic. [No verificado en la práctica; cuotas sin publicar.]
- **No admite retirar conversiones** (solo corregir el valor): hay que filtrar el spam antes de subir. **Un registro malo
  puede tumbar el lote**: validar fila a fila. La cuenta que opera debe ser la dueña de la acción de conversión.
- **Riesgo documentado (Search Engine Land, 5 nov 2026):** al subir un lote a varias cuentas con acciones del mismo nombre,
  Google puede contar la conversión en una cuenta que no generó el clic; y «OK» solo significa que la fila se pudo leer. De
  ahí las reglas de MED-10.
- **Alternativa sin código de API:** la interfaz Data Manager de Google Ads puede leer de PostgreSQL (últimos 14 días en cada
  ejecución). Barato, pero expone la base a Google y pierde los leads que se cualifican más tarde de 14 días. Queda como
  alternativa a comparar con el protocolo de decisión.
- **GoHighLevel:** su acción nativa «Add to Google Ads» solo se dispara con formulario, compra, llamada, encuesta o chat; **no
  con cambios de etapa**, y no envía correo ni teléfono con hash. Hay indicios, sin confirmación oficial, de que sigue
  funcionando tras el 15 jun por ser integrador previo. Para «lead cualificado» y «venta» hace falta subidor propio. Cuidado
  con el doble conteo: o lo nativo o lo nuestro por cada acción.

### 7.4 Retrasos de los datos (04 §5)

| Dato | Cuándo es fiable |
|---|---|
| Clics, impresiones, coste, conversiones de último clic | Casi en tiempo real (refresco horario) |
| Conversiones con atribución basada en datos | Aproximadamente un día |
| Términos de búsqueda y datos geográficos | Al día siguiente |
| **Cuota de impresiones y parte superior** | **2-3 días** (el informe 09b cita 24-48 h de otra página de ayuda; tomamos el plazo prudente de 3 días) |
| Cuota de clics | 3 días |
| Historial de cambios | Minutos |
| Lead cualificado y venta del CRM | Días o semanas: cada acción con su curva (4.4) |
| GBP | Unos 3 días (ya lo aplica Rendimiento) |

Además, las cifras cambian días después: tráfico inválido descontado, conversiones tardías, ajustes de facturación.

### 7.5 Calendario de cambios de Google que el agente debe conocer

| Fecha | Cambio | Efecto en el diagnóstico | Fuente |
|---|---|---|---|
| Mar 2024 | Consent Mode v2 obligatorio en el EEE | Conversiones que faltan sin modelado en cuentas pequeñas | 04 [fecha no verificada en la sesión] |
| 10 feb 2026 | Los dominios aparcados dejan de ser superficie en socios de búsqueda | Cambia la calidad de socios | 05 |
| Abr 2026 | Conversiones mejoradas de web y de leads, un solo ajuste | Medición | 06 |
| 1 jun 2026 | Datos diarios: solo 37 meses. Ritmo de gasto: las campañas con días apagados intentan gastar el límite mensual | Picos de gasto diario que no son anomalía | 04, 09 |
| 15 jun 2026 | Conversiones offline solo por Data Manager para nuevos | Diseño de MED-10 | 09b |
| **17 ago 2026** | CPA y ROAS objetivo limitadas por presupuesto pujan hasta el objetivo. smec: CPC mediano +15,8 %, cuota 40 % → 31 %, perdida por presupuesto 4 % → 33 % (datos de comercio electrónico con ROAS objetivo; en leads con CPA objetivo el ámbito oficial lo incluye, pero no hay cifras) | Subidas de CPC y CPL que **no** son un competidor nuevo | 09b, 10 |
| Sep 2026 | Token de desarrollador retirado. Campañas con recursos automáticos o amplia a nivel de campaña, migradas a AI Max. Sin segmentación manual de idioma en Search. No se crean Smart Campaigns | Cambios de mezcla de consultas sin que nadie tocara nada | 04 |
| 15 oct 2026 | Prioridad de canal | Nuevo mando para socios y Display | 10 |
| **Feb 2027** | DSA migra sola a AI Max. Desaparece el reparto fijo del 50 % de la expansión a Display. Los anuncios solo de llamada dejan de servir. Se retira la v23 de la API | Auditar antes: campañas con DSA, con Display en Search y con anuncios de llamada | 04, 09b, 10 |
| Nov 2027 | Se retira la v26 de la API | Tarea técnica | 04 |

Contradicción resuelta: el informe 03 da la retirada de DSA en septiembre de 2026; los informes 04, 09b y 10, con fuentes de
Google, la sitúan en **febrero de 2027** tras un aplazamiento. Vale febrero de 2027.

### 7.6 Scripts de Google Ads: puente y red de seguridad

No necesitan acceso de Cloud y son gratis, con límites (30 minutos y 50 cuentas por ejecución). Dos usos: **puente** mientras
llega el acceso (un script en la MCC que exporte cada noche a un punto de entrada nuestro; solución provisional) y **freno de
emergencia** (PRO-11) (04 §6).

---

## 8. Mercado y diferenciación

### 8.1 Tabla comparativa

Sí = documentado · Parcial = limitado o manual · No = no lo hace según lo investigado. Los precios de Optmyzr y Adalysis no
se pudieron leer en sus webs y vienen de terceros [no verificado].

| | Optmyzr | Adalysis | Opteo | TrueClicks | Agente de Google (Ask Advisor) | **Kijutech (objetivo)** |
|---|---|---|---|---|---|---|
| Precio para 25 cuentas y <50.000 $/mes | Desde unos 208 $/mes | Desde unos 149 $/mes | 249-499 $/mes | **0 $** | Gratis, dentro de Google | Interno |
| Punto fuerte | Motor de reglas, amplitud | Auditoría y test de anuncios, umbrales publicados | Sencillez, mejoras de un clic | Higiene y vista multicuenta | Está dentro de la plataforma | Cruces y diagnóstico |
| Umbrales publicados y editables | Sí (reglas) | **Sí** | No (solo «agresividad») | Parcial | No | Sí, por defecto, sector y cliente |
| Anomalías con línea base propia | Sí | Parcial | Sí (aprende la variabilidad) | Parcial | — | Sí, con festivos locales |
| Causa raíz | Sí (hay que abrirla) | Sí (hay que abrirla) | Parcial | No | Parcial; quien lo probó dice que diagnostica mal (03) | **Automática, una alerta por causa** |
| Historial de cambios junto a la causa | Sí | Sí | No | No | — | Sí, sin límite de 30 días |
| Subastas | Parcial | No | No | Sí (vía hoja) | Sí (es Google) | Sí (informe importado + resultados de búsqueda) |
| Calidad real del lead (CRM) | Parcial (hojas a mano) | No | No | No | No | **Sí, por término y red** |
| Web, SEO y ficha de Google del cliente | No | No (solo URL rotas) | No (solo enlaces rotos) | No | No | **Sí** |
| Decide bien con pocos datos | No (umbrales fijos) | No | Parcial (ventana adaptativa) | No | — | **Sí (bayesiano con sector)** |
| Corrige el retraso de conversión | No documentado | No documentado | **No (lo dice su ayuda)** | No | Google ofrece informes de retraso | Sí, en todas las reglas |
| IA que propone con aprobación | Sí | Sí | Sí | Beta | Sí | Sí |
| Mide si sus recomendaciones funcionaron | No | No | No | No | No | **Sí** |
| Conoce el negocio del cliente | Perfil de IA escrito a mano | No | Contexto del agente | Atributos propios | No | Ficha completa |
| Español y mercado español | Chat en español | No | No | No | Solo cuentas en inglés | Sí |

Fuentes: 02 (funciones leídas página a página en la ayuda oficial de cada una), 03, 10 §3 (reseñas de Capterra).

**Otros actores** (03): las plataformas de gran empresa (SA360, Skai) marcan la dirección —carteras, previsión, «escuadrones
de agentes» con puntos de aprobación— pero no son para agencias de leads locales, y Marin quebró en 2025 (lección: no
depender de proveedores de nicho). Los agentes «totalmente autónomos» (Groas, Albert, Ryze) **no tienen ninguna medición
independiente**. El servidor oficial de Google para asistentes solo lee y apenas escribe. No se encontró ninguna herramienta
española equivalente (10 §5.4).

### 8.2 Qué copiar de cada una

| De | Qué copiar |
|---|---|
| **Adalysis** | La transparencia: cada control con su umbral por defecto, editable. El árbol de tres etapas (antes del clic, clic, conversión) con el historial de cambios encima. El nivel de calidad ponderado por impresiones y gasto. La pantalla inicial multicuenta con alertas y presupuesto. «Resolver solo» lo rutinario |
| **Opteo** | La ventana de datos que se alarga hasta tener suficientes. El impacto anualizado en cada mejora. «Comprobaciones hechas: 1.240, nada que proponer» (enseña que se ha mirado). Supresiones de la alerta de cero conversiones (no repetir en 4 días, no avisar si la acción suele tener pocas). Segmentos y términos protegidos. Nombre de lugar como negativa |
| **Optmyzr** | Excluir cambios recientes para que una regla no reaccione a sí misma. La similitud término ↔ palabra como filtro secundario (≥85 muy relevante, ≤20 no relevante). Las peticiones de cambio que otro compañero revisa. Los tres mayores contribuyentes positivos y negativos. Posponer alertas 1, 7 o 28 días |
| **TrueClicks** | Separar monitorización diaria (cosas rotas) de recomendaciones semanales (buenas prácticas). «Días que lleva fallando». Aplicar higiene por patrón de nombre de campaña. El truco del informe de subastas a una hoja |
| **Google** | Proponer y confirmar con simulación previa. El detector oficial que compara con el mismo día de la semana |
| **Proyectos abiertos** | «Desconocido» nunca se adivina; cobertura de evidencia visible (claude-ads) |
| **Practicantes** | Rutina de 15 minutos de Lolk; las 4C de Rhodes; umbral del 85 % de Rooijmans; registro de decisiones con línea base y fecha de revisión |

### 8.3 Qué evitar (quejas reales de usuarios; 10 §3)

| Queja | De quién | Cómo lo evitamos |
|---|---|---|
| «Encuentra tantos problemas que abruma; el reto es saber qué priorizar» | TrueClicks | Cola corta ordenada por euros; presupuesto de alertas |
| «Para tener buena nota acabas haciendo cambios de los que no estás convencido» | TrueClicks | **Ninguna nota que penalice descartar.** Descartar con motivo es un dato valioso |
| «No entiende el contexto»; recomendaciones redundantes o contradictorias | Opteo | Ficha del cliente en cada juicio; una propuesta por causa; deduplicar las que afectan al mismo gasto |
| «Demasiado fácil hacer cambios masivos entre cuentas»; valores por defecto peligrosos | Optmyzr | Límites duros, vista previa de cuentas afectadas, nada masivo sin revisión |
| Curva de aprendizaje, interfaz densa | Optmyzr, Adalysis | Lenguaje llano; lo primero que se ve es qué hacer hoy |
| Datos con 24 h de retraso; cambios que hay que aplicar fuera | Adalysis | Señales horarias para lo crítico; aplicar desde la herramienta cuando Enric lo autorice |
| Umbrales no ajustables a los objetivos de cada cuenta | TrueClicks | Umbrales por cliente |
| Herramientas de puja pensadas para CPC manual | Optmyzr, Opteo | Todo el catálogo parte de Smart Bidding |
| El precio sube con cuentas y gasto | Todas | No aplica |

### 8.4 Comprar o construir [opinión]

La auditoría y las recomendaciones de un clic ya existen y son baratas (TrueClicks es gratis para vuestro tamaño). **Reimplementar
eso no es la ventaja.** El valor de construir está en lo que no se puede comprar: los cruces con CRM, web, SEO y ficha, la
estadística para cuentas pequeñas y la memoria de resultados. Sugerencia práctica: dar de alta TrueClicks en paralelo unas
semanas como **vara de medir** (¿encuentra algo que nuestro catálogo no?), sin depender de ella.

---

## 9. Innovaciones propias

Lo que nadie hace y nosotros podemos hacer por tener 25+ cuentas, el CRM, el SEO y la web en la misma herramienta. Para cada
una, lo que hace falta y su límite real.

| # | Innovación | Por qué nadie la tiene | Qué hace falta | Límite honesto |
|---|---|---|---|---|
| 1 | **Diagnóstico con causas de fuera de Google Ads**: web caída, formulario roto, cambio en la landing, demanda orgánica, reseñas, horario | Las herramientas solo ven la plataforma de anuncios | Un contrato nuevo en el núcleo para consultar el estado de una URL en una fecha | Solo en clientes con web rastreada y cuentas de Google conectadas |
| 2 | **Coste por lead cualificado por término, red y landing**, con conciliación diaria | Asumen que las conversiones son verdad; el CRM pequeño (GoHighLevel) no entra en sus paneles | Guardar identificador de clic y etapa del lead | Depende de que alguien marque la etapa en el CRM |
| 3 | **Referencia del sector entre cuentas** para decidir con pocos datos, con punto de partida semántico | Una herramienta de una cuenta no puede; las multicuenta no lo hacen | Sector y tipo de conversión normalizados en la ficha | En sectores con uno o dos clientes la referencia es débil: se usa la de la cuenta |
| 4 | **Causa común**: si medio sector cae el mismo día, es el mercado o Google | Nadie compara cuentas entre sí | El almacén | — |
| 5 | **Experimentos de agencia y tasa de acierto por tipo de acción** | Nadie mide si sus recomendaciones funcionan; la nota de optimización de Google mide adopción, no efecto | Registro de predicciones y evaluación | Con pocas conversiones, el veredicto será muchas veces «no concluyente». Hay que decirlo |
| 6 | **La demanda orgánica como grupo de control** y estacionalidad calculada con datos propios | No tienen Search Console del mismo cliente con histórico diario | Ya existe en Rendimiento | La equivalencia entre consultas de pago y orgánicas es aproximada |
| 7 | **Negocio local de verdad**: zona de servicio real, horario frente a llamadas perdidas, municipios como negativas, coherencia con la ficha de Google | Las herramientas son para comercio electrónico de EE. UU. | Ficha completa (zona, horario) | Datos de llamadas según lo que el CRM ofrezca |
| 8 | **Ley española en la revisión de anuncios**, incluidos los textos que genera Google | Google solo revisa sus políticas | Lista de vetos por sector, mantenida | No sustituye al criterio legal del cliente |
| 9 | **Sintonía con el texto real de la página**, páginas elegidas por Google y cambios en la web | No tienen el rastreador | Capacidad de embeddings en el núcleo | — |
| 10 | **Los cambios de Google como causa fechada** | Las alertas culpan al gestor de lo que cambió Google | Calendario mantenido | Requiere disciplina para mantenerlo |
| 11 | **Puente Ads ↔ SEO en las dos direcciones** | Son herramientas distintas | Encargos entre módulos vía núcleo | La reducción de inversión por «ya somos primeros» hay que probarla, no asumirla |
| 12 | **Benchmark español** por sector y provincia | No existe ninguno público | Tiempo y cuentas | 25 cuentas es poco para percentiles finos |
| 13 | **Auditor de lo que Google automatiza**: gasto invisible, tráfico traído por la IA, migraciones | Empieza a verse (Adalysis), nadie lo resume | El almacén | — |
| 14 | **Honestidad**: probabilidad en cada propuesta, «no concluyente», cobertura de evidencia, datos inmaduros en gris | Las herramientas venden certezas | Diseño | — |
| 15 | **Llamadas cualificadas por su contenido** en España | Google solo lo da en EE. UU. y Canadá | Grabación en el CRM y base legal | Decisión legal previa |
| 16 | **Ajustes de estacionalidad por sucesos locales** (ola de calor, festivo) para varios clientes desde la MCC | Nadie cruza meteorología y calendario local con el sector | Fuente de sucesos | Solo para sucesos de 1-7 días |

**La idea de fondo** [opinión]: las herramientas del mercado son *auditoras de la cuenta*. Lo que proponemos es un *gestor
que conoce el negocio*, que duda cuando debe y que aprende de sus resultados. Lo primero se compra; lo segundo solo se puede
construir donde ya viven la ficha, la web, el SEO y el CRM.

---

## 10. Riesgos y cómo mitigarlos

| Riesgo | Cómo se manifiesta | Mitigación |
|---|---|---|
| **Alucinaciones** | Causa inventada; cifra mal calculada; consejo obsoleto (un estudio halló un 20 % de respuestas erróneas de IA generalista sobre PPC); anuncio que promete lo que el cliente no ofrece | El código calcula y la IA solo cita lo calculado; juez de anclaje en los textos; base de conocimiento con lo obsoleto; examen de prompts; «no concluyente» permitido |
| **Acciones peligrosas** | Cambio masivo; presupuesto × 100; pausar la marca; bajar un objetivo y hundir los leads; cambios cada hora que disparan el gasto | Solo lectura primero; límites duros en código; simulación previa; aprobación según riesgo; etiqueta y registro; vuelta atrás; freno de emergencia fuera del servidor; nada R3 sin persona |
| **Fatiga de alertas** | El equipo deja de leer | Una alerta por causa; suelos de materialidad; presupuesto diario de alertas calibrado con histórico; supresión por contexto; realimentación; lo urgente al momento y lo demás en el parte diario |
| **Datos malos** | Medición rota; días inmaduros; conversiones fraccionarias redondeadas; zona horaria; cuota sumada entre niveles; CRM sin etapas; conversiones contadas en la cuenta equivocada | Examen de medición como puerta; madurez en todas las reglas; conciliador; principios del apartado 6.1 |
| **Regresión a la media** | Se pausa lo peor de una muestra pequeña y «mejora» solo; se premia lo que tuvo suerte | Encogimiento bayesiano antes de ordenar; evaluar contra control; no medir el éxito con el mismo periodo que sirvió para elegir |
| **Memoria que se engaña** | El agente concluye que algo «nunca funciona» por un resultado ruidoso | Memoria de resultados medidos, con caducidad y exploración mínima |
| **Cambios de Google** | Versión retirada; enumerados que cambian; función que desaparece; nuevos mandos fuera de la API | Vigía de la API (GOO-07); calendario de plataforma; cliente propio con versión configurable; no diseñar sobre lo retirado (posición media, audiencias similares, anuncios de llamada, DSA) |
| **Acceso** | Google revoca tras 90 días sin uso; clave de la cuenta de servicio expuesta; proyecto rechazado por facturación | Uso diario; clave solo en el entorno, nunca en un archivo versionado; mínimo privilegio |
| **Protección de datos (RGPD)** | Subir correo y teléfono con hash sin base legal; grabar y transcribir llamadas; exponer la base a Google; reCAPTCHA sin consentimiento (hay una sentencia austriaca en ese sentido) | Decisión previa de Enric con asesoría; consentimiento en la subida; guardar el enlace lead ↔ clic sin datos personales en claro; validación en servidor como alternativa a reCAPTCHA |
| **Políticas de Google y ley española** | Cerrajería prohibida; sanidad sin listas de clientes ni garantías de curación (RD 1907/1996); abogados sin promesas de resultado (art. 20 del Estatuto); financiero con verificación; pujar por marcas ajenas (Ley de Marcas) | Detector de sector regulado desde la ficha (ANU-06); vetos también sobre textos automáticos |
| **Dependencia de la disciplina del CRM** | Nadie marca la etapa: no hay lead cualificado | Indicador de «% de leads con etapa»; empezar por lead válido o no válido; avisar al responsable |
| **Sector con pocos clientes** | Referencia del sector poco fiable | Peso de la referencia proporcional al número de cuentas; mostrarlo |
| **Coste de IA** | Tablas enteras a un modelo caro | Cascada; lotes; caché; presupuesto por agente en la pasarela |
| **Responsabilidad** | Un error del agente lo paga la agencia | Traza de quién aprobó y por qué; cambios como «petición revisada», no como acción del modelo |
| **Confianza del equipo** | El 40 % de los profesionales no automatiza porque no se fía con presupuestos de clientes (Optmyzr) | Explicar cada propuesta; empezar por lo que Eury ya hace; medir y enseñar la tasa de acierto |

---

## 11. Preguntas abiertas para Enric y lo no verificado

### 11.1 Decisiones que te tocan

| # | Decisión | Por qué importa | Recomendación [opinión] |
|---|---|---|---|
| 1 | **Acceso:** crear el proyecto de Google Cloud, verificar la marca, añadir la cuenta de servicio a la MCC | Sin esto no hay módulo. Ya no hay que pedir ningún token | Hacerlo ya; pedir Basic directamente |
| 2 | **Solo lectura primero.** ¿Cuándo y qué podrá aplicar el agente con un clic? | Es línea roja del proyecto | Fase 1: nada. Después, solo R1 (negativas con confianza alta, higiene) y siempre con aprobación; R3 nunca sin persona |
| 3 | **Ampliar la conexión con GoHighLevel** para guardar identificador de clic, etapa del lead y un identificador interno | Hoy se guardan fecha, formulario, página, canal y UTM, sin contacto. Sin ampliar no hay coste por lead cualificado por término ni subida a Google | Sí, guardando lo mínimo y sin datos personales en claro; revisar la base legal |
| 4 | **Subir leads cualificados y ventas a Google** (Data Manager API) | Es la palanca más potente en leads según todas las fuentes, y cambia lo que aprende el algoritmo | Sí, cliente a cliente, empezando como conversión secundaria unas semanas |
| 5 | **Qué es «lead cualificado»** en cada cliente y quién lo marca | Sin definición no hay métrica | Empezar por «válido / no válido» y afinar |
| 6 | **Valor del lead, ticket y margen** por cliente en la ficha | De ahí sale el CPA máximo real | Añadir tres campos a la ficha |
| 7 | **CPA objetivo por cliente**: ¿quién lo fija y cada cuánto se revisa? | Todos los umbrales cuelgan de él | Derivarlo del valor del lead; revisión trimestral |
| 8 | **Informe de subastas programado** a un buzón u hoja de la agencia | La API no lo da | Sí; es montarlo una vez en la MCC |
| 9 | **Papel de Eury**: de revisar todo a revisar la cola, corregir al agente y aportar casos de oro | El agente aprende de sus correcciones | Implicarle desde el diseño |
| 10 | **Quién recibe qué avisos** y cuántos al día | Fatiga | Lo urgente al responsable de la cuenta; un parte diario; tope de unas 10 |
| 11 | **Llamadas**: ¿grabación y clasificación? | Implicación legal | Aplazar; antes, medir bien duración y llamadas perdidas |
| 12 | **Benchmark entre clientes**: ¿solo interno o también en informes? | Confidencialidad | Interno; en informes, solo como «frente a negocios similares», agregado |
| 13 | **Experimentos entre cuentas**: aplicar una mejora de riesgo bajo solo a la mitad al azar para medirla | Retrasa unas semanas la mejora en la otra mitad | Sí, solo en R1 |
| 14 | **TrueClicks en paralelo** como vara de medir | Gratis para vuestro tamaño | Sí, unas semanas |
| 15 | **Sectores regulados**: ¿quién responde de la lista de vetos legales? | Responsabilidad | Lista mantenida por la agencia, validada una vez con asesoría |
| 16 | **Comercio electrónico** (las pocas cuentas que hay) | Shopping y feeds no se han investigado a fondo | Fuera del primer alcance |
| 17 | **Informe al cliente**: ¿enseñamos calidad del lead y coste por venta? | Cambia la conversación con el cliente | Sí, donde el CRM esté sano |

### 11.2 Orden de construcción propuesto [opinión, para debatir]

| Fase | Qué | Capacidades | Por qué en ese orden |
|---|---|---|---|
| 0 | Acceso y almacén | Sincronización, historial de cambios, fotos diarias | Cada día sin guardar es histórico que Google borra |
| 1 | Medición y protección | MED-01 a 04, MED-06, MED-12; PRO-01 a 09 y 12; EST-01 | Lo que invalida todo lo demás y lo que más ahorra sin riesgo |
| 2 | Diagnóstico | DIA-01 a 06; CUO-01 a 03; PUJ-01 a 03; GOO-04 | Responde a la petición literal: avisar con el porqué |
| 3 | Términos | TER-01 a 11 | Sustituye la parte más repetitiva del trabajo de Eury |
| 4 | Calidad del lead | MED-05, MED-10; LEAD-01 a 06 | Exige ampliar GoHighLevel; es el mayor salto de valor |
| 5 | Landing y anuncios | LAN-01 a 07; ANU-01 a 07 | Aprovecha el módulo SEO |
| 6 | Propuestas aplicables y aprendizaje | Patrón del apartado 5.2; APR-01 a 08; PUJ-04 a 10; ESC | Solo cuando lo anterior haya ganado confianza |

Informes (INF) y auditoría de entrada (EST-07) pueden salir en cuanto haya datos de las fases 1 y 2.

### 11.3 Lo no verificado (consolidado)

**Técnico, comprobar antes de diseñar**
- Que una cuenta de servicio baste en producción para la Data Manager API, y sus cuotas.
- Si la acción nativa de GoHighLevel sigue subiendo conversiones tras el 15 jun 2026, y si llamadas importadas y ajustes de
  conversión de la API de Ads también quedaron bloqueados.
- Histórico del nivel de calidad por API segmentado por fecha; recurso de la API para el detalle de llamadas; tipos de
  simulación por recurso y cuántos días cubren; lista exacta de motivos de estado de campaña.
- Límite de peticiones por segundo de la API; estado de las librerías para Node.
- Umbral de 700 clics en 7 días para el modelado por consentimiento (dos informes lo citan; uno no lo encontró).
- Disponibilidad en España de los recursos de mensaje de WhatsApp.
- Plazo real de la cuota de impresiones (2-3 días frente a 24-48 h).

**De mercado**
- Precios de Optmyzr y Adalysis; rendimiento de cualquier agente autónomo; reseñas de G2 y Reddit (bloqueadas; solo se leyó
  Capterra).
- Los estudios de Optmyzr, Adalysis y smec son de proveedores, con sus clientes: correlaciones, no causalidad.
- Cifras de AI Max de fuentes secundarias (Monks, Mantica, Brainlabs).

**De método**
- La fórmula del nivel de calidad de Geddes (pesos 3,5 / 1,75 / 2 / 1) es ingeniería inversa de 2017.
- El efecto del 17 ago 2026 en campañas de **leads con CPA objetivo** no está medido (los datos son de comercio electrónico).
- La estacionalidad por sector en España y que los CPC españoles sean menores que los de EE. UU. son hipótesis sin datos.
- Los benchmarks de LocaliQ repiten cifras entre ediciones: solo orden de magnitud.
- Los pesos de la confianza de causa, la fórmula de prioridad, los umbrales bayesianos (10 % y 30 %), la fuerza m y el
  «punto de partida semántico» son propuestas propias: hay que calibrarlas con vuestros datos antes de fiarse.
- Los tiempos por tarea del apartado 1.4 son una estimación sin fuente.

**Sin cubrir**
- Comercio electrónico (feeds, Shopping) a fondo; comunidades en español, portugués y alemán más allá de lo leído;
  autorizaciones autonómicas de publicidad sanitaria; lista de reguladores financieros españoles para la verificación.

---

## 12. Fuentes clave

**Google: API y plataforma**
1. Niveles de acceso: https://developers.google.com/google-ads/api/docs/api-policy/access-levels
2. Retirada del token de desarrollador: https://developers.google.com/google-ads/api/docs/api-policy/developer-token
3. Cuentas de servicio: https://developers.google.com/google-ads/api/docs/oauth/service-accounts
4. Cuotas: https://developers.google.com/google-ads/api/docs/best-practices/quotas
5. Fechas de retirada de versiones: https://developers.google.com/google-ads/api/docs/sunset-dates
6. Historial de cambios (`change_event`): https://developers.google.com/google-ads/api/docs/change-event
7. Métricas v26 (subastas «no disponibles públicamente»): https://developers.google.com/google-ads/api/fields/v26/metrics
8. Estado de Smart Bidding: https://developers.google.com/google-ads/api/reference/rpc/v26/BiddingStrategySystemStatusEnum.BiddingStrategySystemStatus
9. Informes de PMax: https://developers.google.com/google-ads/api/performance-max/reporting
10. AI Max por API: https://developers.google.com/google-ads/api/docs/campaigns/ai-max-for-search-campaigns/getting-started
11. Fin de la importación offline para nuevos: https://developers.google.com/ads/blog/posts/2026/05/changes-to-offline-click-conversion
12. Data Manager API, acceso: https://developers.google.com/data-manager/api/get-started/set-up-access
13. Data Manager API, diferencias: https://developers.google.com/data-manager/api/devguides/events/google-ads/offline/upgrade
14. Servidor oficial para asistentes: https://developers.google.com/google-ads/api/docs/developer-toolkit/mcp-server
15. Detector oficial de anomalías: https://developers.google.com/google-ads/scripts/docs/solutions/account-anomaly-detector

**Google: ayuda**
16. Frescura de los datos: https://support.google.com/google-ads/answer/2544985
17. Cambio del 17 ago 2026: https://support.google.com/google-ads/answer/17061251
18. Prioridad de canal: https://support.google.com/google-ads/answer/18385152
19. CPA objetivo (sin mínimo oficial): https://support.google.com/google-ads/answer/6268632
20. Exclusiones de datos: https://support.google.com/google-ads/answer/10370710
21. Periodo de aprendizaje: https://support.google.com/google-ads/answer/13020501
22. Diez causas de fluctuación: https://support.google.com/google-ads/answer/12077891
23. Leads de calidad: https://support.google.com/google-ads/answer/13489421
24. PMax para leads: https://support.google.com/google-ads/answer/13775965
25. Conversiones mejoradas para leads y calendario: https://support.google.com/google-ads/answer/14274408
26. Nivel de calidad: https://support.google.com/google-ads/answer/6167118
27. AI Max: https://support.google.com/google-ads/answer/15910187
28. Retraso de conversión: https://support.google.com/google-ads/answer/6239119
29. Estructura de cuenta: https://support.google.com/google-ads/answer/14752782
30. Política de servicios locales (cerrajería): https://support.google.com/adspolicy/answer/15303051
31. Publicidad personalizada (categorías sensibles): https://support.google.com/adspolicy/answer/143465

**Ley española**
32. RD 1907/1996, publicidad sanitaria: https://www.boe.es/eli/es/rd/1996/08/02/1907
33. Estatuto General de la Abogacía, art. 20: https://www.boe.es/eli/es/rd/2021/03/02/135

**Referentes y métodos**
34. Vallaeys, capas de automatización: http://www.optmyzr.com/blog/automation-layering-ppc
35. Rooijmans sobre agentes: https://www.optmyzr.com/ppctownhall/can-ai-agents-really-manage-google-ads-accounts/
36. Wenner, agentes en la práctica: https://www.optmyzr.com/ppctownhall/what-agentic-ppc-actually-looks-like-in-practice/
37. Rooijmans, ratio Lin-Rodnitzky: https://nilsrooijmans.com/google-ads-script-lin-rodnitzky-ratio/
38. Lolk, revisión diaria: https://savvyrevenue.com/blog/google-ads-daily-check/
39. Lolk, auditoría: https://savvyrevenue.com/blog/google-ads-audit/
40. Geddes, por qué una campaña no gasta: https://adalysis.com/blog/why-your-campaigns-are-underspending-and-how-to-fix-it/
41. Geddes, términos de AI Max: https://adalysis.com/blog/ai-max-search-term-reporting/
42. Geddes, asistentes sobre datos de Ads: https://adalysis.com/blog/chatgpt-or-claude-for-google-ads-analysis/
43. Geddes, diagnóstico de conversiones: https://adalysis.com/blog/kpi-monitoring-diagnosis-why-did-your-conversions-and-conversion-rate-change/
44. Röttgerding, tests de anuncios: https://www.ppc-epiphany.com/2018/10/23/debunking-ad-testing-part-1-statistical-significance/
45. Ani, PMax para leads: https://www.jxtgroup.com/performance-max-for-lead-generation/
46. Ani, diagnóstico de pocas conversiones: https://searchengineland.com/ppc-diagnostics-low-conversions-450710
47. Mike Rhodes, las 4C: https://mikerhodes.com.au/4cs
48. ppc.io, auditoría de 84 PMax: https://ppc.io/blog/performance-max-audit
49. Lionelz, auditoría de 77 puntos (en español): https://lionelz.com/blog/auditoria-cuenta-google-ads/

**Estudios de datos**
50. smec, fin de la supresión de pujas: https://smarter-ecommerce.com/blog/en/google-ads/budget-limited-campaigns-after-august-17-the-roas-data/
51. smec, AI Max: https://smarter-ecommerce.com/blog/en/google-ads/the-ultimate-guide-to-ai-max-for-google-search/
52. Optmyzr, estrategias de puja: https://www.optmyzr.com/blog/impact-of-ppc-bidding-strategies/
53. Optmyzr, trabajo manual: https://www.optmyzr.com/blog/google-ads-manual-work-study/
54. Optmyzr, fuerza del anuncio: https://www.optmyzr.com/blog/google-ad-strength-study/
55. Conversiones offline en la cuenta equivocada: https://searchengineland.com/google-ads-may-count-offline-conversions-in-the-wrong-accounts-500544
56. Errores de IA generalista en PPC: https://ppc.land/one-in-five-ai-responses-for-ppc-strategy-contain-inaccuracies-study-finds/
57. Portent, velocidad y conversión: https://www.portent.com/blog/analytics/research-site-speed-hurting-everyone.htm
58. LocaliQ, benchmarks 2026: https://localiq.com/blog/search-advertising-benchmarks/

**Herramientas**
59. Adalysis, documentación: https://docs.adalysis.com/llms.txt
60. Adalysis, análisis de causa: https://docs.adalysis.com/tools/performance/root-cause-analysis-with-the-performance-analyzer.md
61. Optmyzr, PPC Investigator: https://help.optmyzr.com/en/articles/3075363-ppc-investigator-about-user-guide
62. Optmyzr, similitud de intención: https://help.optmyzr.com/en/articles/13428310-search-term-and-keyword-intent-similarity-using-ai
63. Opteo, ventana de datos: https://opteo.com/docs/en/articles/12301289-how-opteo-chooses-the-date-range-for-an-improvement
64. Opteo, alerta de cero conversiones: https://opteo.com/docs/en/articles/18339463-zero-conversions-alerts
65. TrueClicks, subastas para IA: https://help.trueclicks.com/en/articles/17673896-how-to-set-up-auction-insights-for-ai
66. TrueClicks, precios: https://www.trueclicks.com/pricing
67. GoHighLevel, acción «Add to Google Ads»: https://help.gohighlevel.com/support/solutions/articles/155000003368-workflow-action-add-to-google-ads
68. Reseñas de Capterra: https://www.capterra.com/p/156308/Optmyzr/reviews/ · https://www.capterra.com/p/153001/Opteo/reviews/ · https://www.capterra.com/p/173311/Adalysis/reviews/ · https://www.capterra.com/p/213461/TrueClicks/reviews/

**Estadística y agentes**
69. Adobe, bayes jerárquico dinámico: https://arxiv.org/abs/1809.02213
70. Feit y Berman, Test & Roll: https://arxiv.org/abs/1811.00457
71. Brodersen y otros, CausalImpact: https://arxiv.org/abs/1506.00356
72. Series de recuentos bajos: https://ar5iv.labs.arxiv.org/html/2308.12925
73. Evan Miller, cómo no hacer un test A/B: https://www.evanmiller.org/how-not-to-run-an-ab-test.html
74. Anthropic, agentes eficaces: https://www.anthropic.com/research/building-effective-agents
75. ToolEmu, riesgos de agentes: https://arxiv.org/abs/2309.15817v2

El resto de fuentes está en el apartado final de cada informe de `docs/ads/investigacion/bruto/`.

