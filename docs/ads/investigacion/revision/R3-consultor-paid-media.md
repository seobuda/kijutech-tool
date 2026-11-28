# R3 · Revisión del consultor de Paid Media y negocio

**Fecha:** 28 nov 2026 · **Documento revisado:** `docs/ads/INVESTIGACION-GOOGLE-ADS.md` (apartados 0 a 11 completos; el 12, de
fuentes, no) y `investigacion/BRIEF.md`. De `bruto/` solo he consultado pasajes concretos por búsqueda (01, 06, 08, 09b), no
los informes enteros.

**Qué no he comprobado.** No he verificado en fuentes externas ningún hecho de plataforma posterior a mediados de 2026
(retirada del token, cambio del 17 ago, corte de la Data Manager API). Los cálculos del apartado 4 sí los he rehecho: las
tablas de Poisson, e^(−k), el ejemplo bayesiano, el LMDI y el CPA marginal son correctos. Lo legal de este documento es
criterio de consultor, no asesoría jurídica: cada punto marcado **[validar con asesoría]** lo necesita.

---

## Veredicto

El documento diseña un **excelente auditor de cuentas de Google Ads** y lo presenta como «un gestor que conoce el negocio».
No lo es todavía. De 120 capacidades, unas 110 miran dentro de la cuenta; el negocio del cliente entra como dato auxiliar
(ficha, CRM) y el negocio de la agencia no entra. Faltan cuatro cosas que un Head of Paid Media pone antes que cualquier
regla de términos:

1. Un **objetivo de negocio pactado** por cliente, con fórmula, dueño, fecha y restricciones (capacidad, temporada, margen).
2. **Previsión y planificación** de presupuesto con escenarios, y la capacidad de proponer estrategia (más, menos, otro canal).
3. La **economía de la agencia**: cuánto cuesta atender cada cuenta, cuál se va a ir y qué más se le puede vender.
4. **Honestidad de incrementalidad** llevada hasta el final (marca, PMax, ficha de Google), no solo en una fila (ESC-01).

Además, el plan pone primero lo que Google va a absorber (términos, pujas, anuncios) y deja para la fase 4 lo único que
seguirá siendo nuestro dentro de tres años (el dato del CRM).

---

## Hallazgos por prioridad

| # | Gravedad | Hallazgo | Dónde | Propuesta |
|---|---|---|---|---|
| 1 | Crítica | No existe un objetivo de negocio por cliente; todo cuelga de un «CPA objetivo» que nadie ha definido | 11.1 nº 6-7, LEAD-04 | Familia NEG, fase 1 (ver §1) |
| 2 | Crítica | El agente recomienda subir presupuesto sin saber si el cliente puede atender más leads | CUO-02, ESC-03, ESC-04 | Capacidad y respuesta al lead como puerta de escalado (§1.3) |
| 3 | Crítica | La captura del identificador de clic está en la fase 4; cada día sin capturarlo es histórico perdido, el mismo argumento que el documento usa para la fase 0 | 11.2 | Subirla a la fase 0 (§5.3) |
| 4 | Crítica | Subir datos de leads a Google en clínicas, psicología, estética o despachos es tratamiento de categorías especiales; el documento lo trata como un riesgo genérico | MED-10, LEAD-07, riesgo RGPD | «Modo sector sensible» y roles RGPD (§6) |
| 5 | Alta | No hay previsión ni escenarios; el «Estratega» es una línea | ESC-06, ESC-07, 5.4 | Familia PLAN (§2) |
| 6 | Alta | No hay nada sobre rentabilidad por cuenta, riesgo de baja ni venta adicional | Todo el documento | Familia AGE (§3) |
| 7 | Alta | La marca se defiende con presupuesto (CUO-06) mientras ESC-01 dice que hay que probar si sobra: contradicción | CUO-06 frente a ESC-01 | Regla única de marca y prueba por semanas alternas (§4) |
| 8 | Alta | El resumen promete «coste por venta por término» y «qué funciona, por sector, con probabilidad, en meses»; el apartado 4 del propio documento demuestra que con estos volúmenes no se puede | Apdo. 0, tabla «Ellos / Nosotros» | Rebajar la promesa (§7.1-7.2) |
| 9 | Alta | El modelo de datos nace atado a Google; Microsoft Ads y Meta obligarían a rehacerlo | 6.1-6.2 | Columna de plataforma y métricas neutras desde el primer día (§5.2) |
| 10 | Media | El CPA máximo se iguala al valor del lead (punto de equilibrio, beneficio cero) y el reparto iguala CPA marginal entre servicios de valor distinto | LEAD-04, PUJ-05, 4.7 | Fórmulas corregidas (§1.2, §7.3-7.4) |
| 11 | Media | El informe al cliente no lleva objetivo frente a resultado, previsión ni tareas del cliente | INF-03 | Plantilla (§3.3) |
| 12 | Media | El diagnóstico no tiene rama «cambió otra cosa del marketing del cliente» | 3.2 paso 3 | Añadirla (§4.5) |

---

## 1. Resultado de negocio del cliente

### 1.1 Qué falla

- La «métrica rectora» (LEAD-01) es correcta, pero **el objetivo contra el que se mide no existe**. La decisión 7 de 11.1
  («derivarlo del valor del lead; revisión trimestral») es una frase. Sin objetivo pactado, los 120 umbrales «en múltiplos
  del CPA objetivo» cuelgan de un número que pondrá Eury a ojo.
- Lo que más mueve el resultado de un negocio local después del clic está en **una sola fila, mensual, de riesgo cero y
  condicionada a «si el CRM lo da»** (LEAD-09): tiempo de respuesta al lead, llamadas perdidas, tasa de cierre. No hay nada
  sobre citas no presentadas, agenda llena, vacaciones del cliente o cambios de precio.
- La estacionalidad está tratada como demanda de búsqueda (ESC-05), no como **calendario comercial del cliente**: cierre de
  agosto, campaña de la declaración de la renta, temporada alta de climatización con el equipo desbordado, lista de espera.
- El margen, el ticket y el valor de vida aparecen en LEAD-04 como «margen medio». En dental, fisioterapia, estética o
  mantenimiento, el primer ticket infravalora al cliente varias veces; en reformas, un solo servicio (cocina frente a
  reforma integral) cambia el valor por diez.

### 1.2 Propuesta: familia NEG (negocio del cliente), en la fase 1

**NEG-01 · Acuerdo de objetivos por cliente (registro con versiones).** Campos:

- Resultado que el cliente compra: ventas nuevas al mes, citas, o leads cualificados (lo más abajo del embudo que el
  cliente sea capaz de informar).
- Economía por servicio: ticket medio, margen bruto, recurrencia (valor a 12 meses), tasa de cierre de lead a venta.
- Coste máximo por lead cualificado, **calculado, no escrito a mano**:

```
Valor del lead      = ticket × margen bruto × tasa de cierre × factor de recurrencia
CPL máximo de medios = Valor del lead × % del margen que el cliente acepta invertir en captar
                       − cuota de agencia repartida por lead
```

  Ejemplo: reforma de 8.000 €, margen 25 %, cierra 1 de cada 10 leads → valor del lead 200 €. Si el cliente acepta invertir
  el 30 % del margen: 60 €. Con una cuota de 200 €/mes y 20 leads, la agencia pesa 10 € por lead → **CPL máximo de medios
  50 €**. LEAD-04 tal como está daría 200 €: el cliente trabajaría gratis.
- Banda de presupuesto mensual (mínimo, habitual, máximo autorizado sin preguntar).
- Capacidad: leads o citas por semana que puede atender, por servicio.
- Calendario comercial: cierres, picos, servicios que se apagan.
- Quién lo pactó, cuándo, y **disparadores de revisión**: cambio de precios, de equipo comercial, tasa de cierre que se
  desvía más de un tercio, dos meses fuera de banda, o seis meses sin revisar (trimestral en cuentas grandes).
- Calidad del dato: «medido en CRM», «declarado por el cliente» o «supuesto de sector». El agente lo enseña en cada cifra.

**NEG-02 · Capacidad como puerta de escalado.** ESC-03 pasa a tener tres luces: medición sana, calidad sana **y capacidad
libre**. Con la agenda llena, la propuesta correcta es bajar o pausar ese servicio y decirlo, no subir presupuesto porque
«hay cuota perdida y el CPL es bueno».

**NEG-03 · Respuesta al lead.** Semanal, no mensual. Mediana de minutos hasta el primer contacto, % de leads sin contactar a
las 24 h, llamadas perdidas en horario de anuncios, citas no presentadas. Cuando el problema está aquí, el hallazgo va
primero en la cola con el texto «la campaña funciona; se pierden N leads al mes después del clic (unos X €)». Es también la
mejor oportunidad de venta adicional (AGE-03).

**NEG-04 · Tasa de cierre vigilada.** Si la tasa de cierre de un cliente cae y la mezcla de términos no ha cambiado, la
causa es comercial (precio, comercial nuevo, competencia en la oferta), no de campaña. Hoy LEAD-02 culparía a la campaña.

**NEG-05 · Retorno del dato desde el cliente.** El riesgo «nadie marca la etapa» solo tiene un indicador. Propuesta: una
lista semanal de leads con tres botones (válido, no válido, venta) por el canal que el cliente ya usa. Es un mensaje a un
cliente real: línea roja del proyecto, requiere aprobación de Enric y diseño propio. Sin esto, la fase 4 se queda sin datos
en la mayoría de las cuentas.

### 1.3 Cambios en capacidades existentes

- CUO-02, ESC-04 y PUJ-05: no proponen subir sin NEG-02 en verde y sin CPL marginal por debajo del CPL máximo de NEG-01.
- LEAD-09 se sustituye por NEG-03.
- ESC-05 añade el calendario comercial del cliente, no solo la demanda.

---

## 2. Estrategia, no solo optimización

### 2.1 Qué falla

La estrategia ocupa tres filas (ESC-06 zonas y servicios, ESC-07 mezcla de campañas, EST-09 funciones sin usar) y un agente
«Estratega» trimestral sin especificar. No hay previsión: la palabra aparece una vez en todo el documento, hablando de
SA360. Un cliente pregunta «si pongo 300 € más, ¿qué saco?» y «¿cuánto necesito para 10 clientes nuevos al mes?»; el diseño
no sabe contestar. Microsoft Ads y Meta no aparecen ni una vez.

### 2.2 Propuesta: familia PLAN

**PLAN-01 · Previsión mensual por cuenta, con rango.** Leads cualificados y ventas esperadas el mes próximo con el
presupuesto actual: gasto × índice estacional × tasas del embudo, con intervalo (P10, P50, P90), nunca una cifra sola. Se
compara cada mes con lo ocurrido; el error de previsión se publica (encaja con APR-01).

**PLAN-02 · Escenarios de presupuesto.** Tres por defecto: −20 %, igual, +20 % (y el que pida el responsable). Fuentes: los
simuladores de Google, la cuota perdida por presupuesto, la curva marginal del 4.7 y la referencia del sector. Salida:

> «Con 300 € más al mes esperamos entre 3 y 7 leads cualificados adicionales (lo más probable, 5) y de 0 a 2 ventas. El lead
> adicional costará unos 60 €, frente a 42 € de media; el máximo rentable es 50 €. **No lo recomendamos** en "Baños"; sí en
> "Cocinas", donde el lead adicional sale a 38 €.»

**PLAN-03 · Propuesta de reducción honesta.** Se dispara cuando el CPL marginal supera el máximo, la capacidad está llena,
la marca no demuestra ser incremental o la demanda cae por temporada. El texto dice cuánto se ahorra y qué se pierde. Si la
cuota de la agencia fuera un porcentaje de la inversión (no lo sé; no consta en lo leído), aquí hay un conflicto de interés
que Enric debe resolver de antemano por escrito.

**PLAN-04 · Oportunidades de expansión con previsión.** Servicio nuevo, zona nueva o canal nuevo, cada una con demanda
estimada (volumen de búsquedas, consultas orgánicas, CPC de referencia del sector), inversión de prueba, criterio de éxito
y fecha de decisión. Canales a cubrir como recomendación (no como gestión) desde el principio:

| Canal | Cuándo proponerlo | Señal que ya tenemos |
|---|---|---|
| Microsoft Ads | Search rentable y saturado (cuota perdida por presupuesto baja), público de escritorio o de más edad, B2B | Cuota de impresiones alta y CPL bajo; se importa la campaña de Google. Volumen esperado en España: pequeño [no verificado] |
| Meta (formularios o WhatsApp) | Servicios de demanda latente: estética, dental, reformas, formación | Poco volumen de búsqueda con buen cierre |
| Demand Gen y YouTube | Decisión larga y ticket alto, con creatividad disponible | ESC-07 ya lo apunta; falta el criterio de entrada y de salida |
| Servicios locales de Google | Oficios del hogar elegibles | EST-09; gestión por API sin verificar (06) |
| Ficha de Google y reseñas | Negocio local con paquete local débil | Ya está en la herramienta; hoy solo se usa como control |

**PLAN-05 · Revisión estratégica trimestral con guion fijo.** Objetivo frente a resultado, previsión frente a resultado, qué
se probó y qué enseñó, dos o tres opciones para el trimestre con su previsión, y lo que tiene que hacer el cliente. El
código calcula; el modelo grande redacta y argumenta. Sin guion, «Estratega con Fable» producirá prosa cara.

---

## 3. Negocio de la agencia

### 3.1 La cuenta que el documento no hace

Con las cifras del brief (más de 5.000 €/mes, más de 25 cuentas) la cuota media ronda **200 € por cuenta y mes**. El propio
documento estima 15-30 horas semanales solo en la revisión manual: entre 60 y 120 horas al mes, es decir, de 40 a 80 € de
ingreso por hora antes de cualquier otro coste. Construir 120 capacidades para proteger 5.000 €/mes solo se justifica si
cambia uno de estos cuatro números, y el documento no dice cuál persigue:

1. **Cuentas por persona** (de unas 25 a 60 o más sin contratar).
2. **Precio** (un nivel superior con calidad de lead y ventas que hoy no se puede vender).
3. **Bajas** (retener dos cuentas al año ya son unos 5.000 €).
4. **Venta adicional** a clientes actuales (web, SEO, CRM, reseñas).

Propuesta redactada para el apartado 0: «El módulo se mide por cuatro cifras de agencia: horas por cuenta y mes, cuentas por
gestor, bajas anuales e ingreso medio por cuenta. Se fija la línea base antes de construir.»

### 3.2 Propuesta: familia AGE

**AGE-01 · Rentabilidad por cuenta.** Horas imputadas (encargos y ClickUp, que ya existen) más minutos de revisión de la
cola, frente a la cuota del contrato. Salida: margen por cuenta y lista de cuentas que cuestan más de lo que pagan. Efecto
en el diseño: la fórmula de prioridad del 3.6 solo mira el dinero del cliente; debe tener un **tope de horas por cuenta
según su cuota**, o las cuentas pequeñas y ruidosas se comerán a Eury.

**AGE-02 · Riesgo de baja.** Señales que ya están en la herramienta o en el diseño: coste por lead cualificado por encima
del objetivo dos meses, volumen de leads a la baja, presupuesto recortado por el cliente, **usuario nuevo o desconocido en
la cuenta** (MED-12 lo detecta como seguridad; es también la señal clásica de que otra agencia está auditando), fecha de
renovación del contrato, cliente que deja de contestar, quejas en el correo o en Telegram. Salida: semáforo y acción
sugerida para Enric antes de que llegue el aviso de baja.

**AGE-03 · Venta adicional con evidencia.** Cada hallazgo que no se arregla dentro de Google Ads es una oportunidad con
importe:

| Hallazgo | Servicio |
|---|---|
| LAN-03, LAN-05: landing lenta o que no convierte | Web o mejora de conversión |
| ESC-01: términos que convierten sin página orgánica | SEO |
| NEG-03: respuesta lenta, llamadas perdidas | Automatización del CRM, centralita |
| Reseñas por detrás de la competencia | Reputación y ficha de Google |
| PLAN-02 favorable | Más inversión (con previsión) |
| PLAN-04 | Canal nuevo |

**AGE-04 · Registro de valor.** Por cuenta y mes: incidencias detectadas y en cuántas horas, gasto retirado de términos sin
intención, cambios hechos y su resultado medido. Regla de honestidad: «gasto evitado» solo se afirma cuando hay hecho
(página caída, medición rota); el resto se presenta como rango o como «no concluyente». Un «te hemos ahorrado 3.200 €»
inventado destruye la confianza la primera vez que el cliente pregunta cómo se calculó.

**AGE-05 · Niveles de servicio y precio.** Decisión de Enric, pero el diseño debe permitirla: nivel base (vigilancia e
higiene, muy automatizado, pocas horas) y nivel avanzado (CRM conectado, calidad de lead, subida de conversiones, informe de
ventas, revisión estratégica). Cuota mínima por cuenta y revisión de las que están por debajo. Mejor cuota fija por nivel
que porcentaje de inversión: elimina el conflicto de interés de PLAN-03.

### 3.3 Informe al cliente (INF-03) que retiene

Estructura propuesta, una página:

1. Objetivo pactado frente a resultado (leads cualificados, ventas si se conocen, coste), con el semáforo.
2. Leads **sin marca** por separado de los de marca.
3. Qué hicimos y qué efecto tuvo (medido, con su incertidumbre).
4. Qué hemos detectado fuera de la cuenta (web, respuesta al lead, reseñas).
5. Previsión del mes próximo y, si procede, propuesta de presupuesto.
6. **Lo que necesitamos de ti** (marcar leads, contestar antes, aprobar X).

Nunca cuota de impresiones ni CTR en la primera página. Siempre revisado por una persona antes de enviarse.

---

## 4. Medición e incrementalidad

### 4.1 Qué falla

El documento es honesto con la estadística y con AI Max, y deja el resto a medias:

- **Marca.** CUO-06 propone dar presupuesto a la marca si su cuota baja del 90 %; ESC-01 dice que hay que probar si sobra.
  Las dos no pueden ser reglas a la vez. Y los informes y el benchmark mezclan marca con no marca.
- **PMax.** GOO-01 audita la proporción de marca, pero LEAD-01 cuenta sus conversiones con el mismo peso que las de Search.
- **Ficha de Google.** No se menciona que las «acciones locales» (cómo llegar, llamar desde la ficha) entran como conversión
  en PMax y en campañas con recursos de ubicación. Infla resultados con leads que la ficha ya traía gratis.
- **Conversiones tras ver** (Demand Gen, YouTube): ESC-07 las recomienda sin decir cómo se cuentan.
- **4.8** descarta los geoexperimentos y no ofrece el sustituto natural para una sola zona.

### 4.2 Regla única de marca (sustituye a CUO-06)

> La campaña de marca se trata como gasto defensivo, no como captación. Se informa siempre aparte. Se mantiene si (a) hay
> competidores pujando por la marca, o (b) una prueba ha medido que al apagarla se pierden leads totales de marca. Si no se
> da ninguna de las dos, se propone la prueba, no más presupuesto.

### 4.3 Prueba por semanas alternas (añadir al 4.8)

Para un negocio de una sola zona: encender y apagar por semanas completas (cuatro a ocho semanas) y medir **leads totales
de marca en el CRM**, clics orgánicos de marca en Search Console y llamadas desde la ficha, no las conversiones de Google
Ads. Sirve para marca, remarketing y socios de búsqueda. Límites que hay que decir: con menos de unos 10 leads de marca por
semana el resultado será «no concluyente»; con Smart Bidding el encendido y apagado altera el aprendizaje, así que la
campaña de marca debe ir aparte y con puja sencilla.

### 4.4 El árbitro son los leads totales del negocio

Con cuentas pequeñas no hay atribución que valga (el documento acierta al dejar fuera X04), pero entonces falta el
sustituto: **leads y ventas totales del CRM, de todas las fuentes, y coste de captación combinado** (inversión total más
cuota, dividido por clientes nuevos). Si las conversiones de Google suben y los leads totales no, es canibalización. Este
indicador debe ir en el tablero y en el informe, por encima de cualquier cifra de plataforma.

Tres ajustes de contabilidad:

- MED-01: «acciones locales» y conversiones tras ver, nunca primarias.
- LEAD-01: tres columnas, no una: no marca, marca, y «automático sin desglose» (PMax y lo que traiga AI Max sin término
  visible), esta última con la advertencia de que no está probada como incremental.
- APR-04: el benchmark se calcula solo con no marca.

### 4.5 Rama que falta en el diagnóstico

Paso 3 del árbol: «¿cambió otra cosa del marketing o del negocio del cliente?». Campaña en Meta, radio, buzoneo, cambio de
precio, feria, noticia. Fuente: la memoria del cliente y una pregunta al responsable de cuenta. Sin esta rama el agente
atribuirá a la cuenta subidas y bajadas que vienen de fuera.

### 4.6 SEO, ficha y Ads en la misma decisión

Hoy lo orgánico y la ficha son controles estadísticos (DIA-04). Falta la vista de decisión: por grupo de consultas, qué
presencia hay (anuncio, paquete local, orgánico) y qué leads totales salen. De ahí salen decisiones reales: invertir en
reseñas en vez de en clics, o dejar de pagar donde ya se domina, siempre con la prueba del 4.3.

---

## 5. Visión a 2-3 años

### 5.1 Qué caduca y qué se queda

| Vida corta (Google lo absorbe o lo oculta) | Defendible |
|---|---|
| Términos y negativas (familia TER, 11 capacidades): cada año se ve menos término y hay menos control | El dato propio: lead cualificado y venta del CRM, limpio y subido a Google |
| Horario, dispositivo y ajustes de puja (PUJ-07) | El objetivo y las restricciones del negocio (margen, capacidad, calendario, ley) |
| Tests y redacción de anuncios (ANU-03, ANU-05): Google genera y rota | Diagnóstico con causas de fuera de Google (web, CRM, ficha, otros canales) |
| Nivel de calidad y estructura fina (LAN-01, EST-03, EST-08) | Auditor independiente de la automatización: Google cobra por gasto, no por beneficio del cliente |
| Recomendaciones de un clic (ya las hace el asistente de Google, gratis) | Reparto entre canales, previsión y relación con el cliente |
| | Memoria de resultados entre cuentas (con los límites del §7.2) |

Aproximadamente un tercio del catálogo está en la columna izquierda, y el orden de construcción lo pone antes (fase 3:
términos) que lo defendible (fase 4: calidad del lead). Es comprensible para ganarse a Eury, pero es invertir primero en lo
que antes caduca.

### 5.2 Multicanal sin rehacer

El apartado 6 fija «identificadores nativos de Google», nombres de recursos de la v26 y una familia de tablas pensada para
Google. Propuesta, barata hoy y cara mañana:

- Columna **plataforma** en cuentas, campañas, rendimiento diario, hallazgos, propuestas y resultados.
- **Métricas neutras** en el núcleo del módulo (coste, impresiones, clics, leads, leads cualificados, ventas, valor); lo
  propio de Google (cuota de impresiones, nivel de calidad, estado de Smart Bidding) en tablas de extensión.
- El motor de diagnóstico, la estadística, la cola, la memoria y las familias NEG, PLAN y AGE **no deben conocer a Google**:
  reciben series y eventos. Solo la sincronización y las reglas de configuración son por plataforma.
- El enlace lead ↔ clic admite cualquier identificador (gclid, msclkid, fbclid) y UTM.

No propongo construir Microsoft ni Meta ahora; propongo no cerrarles la puerta en el esquema.

### 5.3 Reordenar las fases

| Cambio | Motivo |
|---|---|
| Captura del identificador de clic y de la etapa del lead, a la **fase 0** (con la decisión legal del §6 por delante) | No es retroactiva: cada mes de retraso es un mes menos de histórico de calidad. Es exactamente el argumento del documento para el almacén |
| NEG-01 (acuerdo de objetivos) y AGE-01 (línea base de horas), a la **fase 1** | Sin objetivo no hay umbral; sin línea base no se podrá demostrar que el módulo valió la pena |
| PLAN-01 y PLAN-02, con la fase 2 | Necesitan solo el almacén y los simuladores |
| Términos (fase 3) y calidad del lead (fase 4), **en paralelo o invertidas** | Lo defendible primero |
| Informe al cliente (INF-03), pronto | Es lo que el cliente ve y lo que retiene |

---

## 6. Ley y ética en España y la UE

Todo este apartado: **[validar con asesoría]**. Señalo lo que el documento no plantea.

### 6.1 RGPD al subir datos del CRM

- **Roles.** El cliente es responsable del tratamiento; la agencia, encargada. Hace falta contrato de encargo (art. 28) que
  cubra esta herramienta y sus subencargados: alojamiento, GoHighLevel, proveedor de IA, Microsoft Clarity. La decisión 3
  de 11.1 no es solo de Enric: **cada cliente debe autorizarla**.
- **«Sin datos personales en claro» no es una salida.** El identificador de clic es un identificador en línea; unido a la
  etapa del lead es dato personal seudonimizado. El hash de correo y teléfono no es anonimización (hay criterio publicado de
  la AEPD sobre el hash). Aplica el RGPD entero: base legal, información, plazo de conservación, derechos.
- **Base legal y consentimiento.** La política de consentimiento de usuarios de la UE de Google exige consentimiento para
  usar datos con fines publicitarios; la subida debe llevar la señal de consentimiento del usuario y **no subir a quien lo
  rechazó**. El conciliador de MED-10 debe contar aparte los leads no subidos por falta de consentimiento.
- **Papel de Google** en conversiones mejoradas y listas de clientes (encargado según sus términos de tratamiento) y
  transferencias internacionales: comprobar el estado vigente.
- **Derecho de supresión.** La Data Manager API no permite retirar conversiones (7.3): hay que decidir cómo se atiende una
  solicitud de supresión de un lead ya subido.
- **Evaluación de impacto.** Recomendable una plantilla única para la combinación CRM + publicidad + IA; casi seguro
  obligatoria en clientes de salud y si se transcriben llamadas.
- **IA.** Ningún dato identificable de un lead (nombre, teléfono, texto libre del formulario, transcripción) debe llegar a
  un modelo sin que el contrato de encargo lo cubra. Para clasificar leads basta la etapa y metadatos.

### 6.2 «Modo sector sensible» por cliente (propuesta)

Para clínicas (médica, dental, estética, fertilidad, psicología, adicciones), despachos de abogados (secreto profesional) y
cualquier servicio que revele salud, situación económica o judicial:

- Que alguien pida cita en una clínica de fertilidad es dato de salud (art. 9). Enviar su identificador a Google, aunque sea
  con hash, exige como mínimo consentimiento explícito. **Por defecto, desactivado**: MED-10 sin correo ni teléfono; decidir
  con asesoría si se permite al menos el identificador de clic.
- Sin listas de clientes ni remarketing (el documento ya lo recoge para salud, EST-05).
- LEAD-07 (transcribir llamadas): excluido.
- Clarity: sin grabación en formularios y páginas de cita.
- Informes y benchmark: solo agregados.

Es una bandera de la ficha que el código aplica como límite duro, igual que el tope del contrato.

### 6.3 Consent Mode

MED-07 detecta si el modo es básico o avanzado y «refuerza» la medición. Pasar de básico a avanzado (envío de señales sin
cookies cuando el usuario rechaza) **es una decisión legal del cliente**, no una optimización. El agente puede informar del
coste en datos de cada opción, pero la propuesta debe ir marcada como «requiere decisión del cliente» y nunca como arreglo.
Añadir la comprobación básica de la guía de cookies de la AEPD (botón de rechazar al mismo nivel, nada se dispara antes de
aceptar): un banner que incumple es riesgo del cliente y explica cifras «demasiado buenas».

### 6.4 Publicidad sanitaria y legal

Añadir a ANU-06:

- **Medicamentos de prescripción**: está prohibida su publicidad al público. Afecta de lleno a estética («bótox» y similares
  como palabra clave o en el anuncio) y lo rechaza también Google. Es el fallo más frecuente en clínicas estéticas.
- **Autorización previa autonómica** de publicidad sanitaria: el documento la da por no cubierta (11.3). Para una agencia con
  clínicas es obligatorio cerrarlo por comunidad antes de que el agente redacte un solo anuncio.
- Superlativos y comparativas («la mejor clínica», «nº 1») sin prueba: publicidad engañosa o desleal, y normas deontológicas
  de los colegios (dentistas, médicos, abogacía).
- Antes y después, precios y financiación en estética y dental: revisar caso a caso.
- Los vetos se aplican también a **lo que Google genera solo** (el documento lo dice; hace falta que GOO-03 apague los
  textos automáticos por defecto en sectores regulados, no que los revise después).

### 6.5 Transparencia y ética con el cliente

- **Cláusula de IA en el contrato**: la agencia usa sistemas de IA bajo supervisión humana; la responsabilidad es de la
  agencia; qué datos del cliente se tratan y dónde.
- **Uso cruzado de datos** (benchmark, referencia del sector, APR-05): los datos del cliente A mejoran las decisiones del
  cliente B, a veces su competidor en la misma provincia. Necesita cláusula, y un límite: nunca términos, anuncios ni
  cifras identificables entre competidores directos.
- **Experimentos de agencia** (APR-03, decisión 13): dejar a la mitad de las cuentas sin una mejora para medirla es
  defendible solo con consentimiento contractual y en riesgo bajo. El documento lo plantea como decisión interna; no lo es.
- **Dos clientes competidores en la misma subasta**: el agente no puede recomendar a uno pujar contra el otro con
  información del otro. Hace falta una regla explícita de conflicto.
- **Reglamento de IA de la UE**: no veo que obligue a etiquetar textos de anuncios; sí hay una obligación general de
  formación del personal que usa sistemas de IA. Sin verificar el detalle.

---

## 7. Errores, contradicciones y afirmaciones dudosas

1. **«Coste por lead cualificado y venta, por término, red y campaña»** (apdo. 0 y LEAD-01). Con 20 leads al mes, un 40 %
   cualificado y un 10 % de cierre son 8 cualificados y 2 ventas al mes en toda la cuenta. Por término no hay dato ni en un
   año. Redacción honesta: «por campaña y servicio a 90 días, con referencia del sector; por término solo para detectar
   spam y leads no válidos».
2. **«En meses produce algo que nadie tiene: qué funciona, en qué sector, con qué probabilidad»** (apdo. 0, pieza 5). Con
   25 cuentas repartidas en varios sectores hay de dos a cinco por sector, y el efecto de una acción de riesgo bajo es mucho
   menor que el ruido mensual. El propio apartado 9 (nº 5) admite que saldrá «no concluyente» muchas veces. El resumen debe
   decir «en uno o dos años, para las acciones más frecuentes».
3. **LEAD-04: «de ahí sale el CPA máximo».** El valor del lead es el punto de equilibrio, no el máximo. Falta el porcentaje
   de margen a invertir, la cuota de la agencia y la recurrencia (§1.2).
4. **PUJ-05 y 4.7: «igualar el CPA marginal entre campañas».** Solo es óptimo si un lead vale lo mismo en todas. Entre
   servicios de valor distinto se iguala el **retorno marginal** (valor del lead dividido por CPA marginal), con el tope de
   capacidad. EST-03 ya reconoce que los servicios valen distinto; PUJ-05 lo olvida.
5. **CUO-06 contra ESC-01** (marca): ver §4.2.
6. **CUO-02 y ESC-04 contra el negocio**: subir presupuesto por cuota perdida sin mirar capacidad ni CPL marginal. El
   propio 4.7 dice que el lead adicional cuesta un 43 % más; CUO-02 compara con el CPL medio.
7. **«Lo que hace hoy Eury es exactamente el 90 % del trabajo manual del mercado»** (apdo. 0, punto 2). «Exactamente» no se
   sostiene sobre un estudio de proveedor; huele a cifra mal trasladada. Citar el dato literal del estudio o quitarlo.
8. **Umbrales incoherentes de volumen**: PMax exige 30 leads cualificados al mes (1.2); LEAD-05 pasa el cualificado a
   primaria con 15 en 30 días; PUJ-02 llama «riesgo» a menos de 15. Unificar y decir cuál es de Google y cuál propio.
9. **Riesgo legal «pujar por marcas ajenas (Ley de Marcas)»** (apdo. 10). Pujar por la marca de un competidor es en general
   lícito en la UE; el riesgo está en usar la marca en el texto del anuncio o inducir a confusión. Tal como está, llevaría
   al agente a vetar campañas de competencia legítimas. [validar con asesoría]
10. **«Guardar el enlace lead ↔ clic sin datos personales en claro»** como mitigación RGPD: falsa tranquilidad (§6.1).
11. **Orden de fases** incoherente con su propio criterio de «histórico que se pierde» (§5.3).
12. **Fórmula de prioridad (3.6)**: ignora el coste para la agencia y la cuota de la cuenta (§3.2). Además multiplica una
    probabilidad por una escala de 1 a 3 y divide por otra de 1 a 5: sirve para ordenar, no para enseñar «euros».
13. **«Por qué será mejor que Optmyzr…»**: compara el objetivo de Kijutech con el presente de los demás. Varias filas
    («sí, por término y red»; «mide si sus recomendaciones funcionan») dependen de la disciplina del CRM y de volúmenes que
    no hay. Presentarlo como hipótesis de producto.
14. **Alarmas con α = 2 %** (PRO-03): con unas 100 campañas vigiladas a diario, un 2 % por ventana independiente son falsas
    alarmas todas las semanas. El 4.5 menciona la corrección por pruebas múltiples; PRO-03 debe aplicarla expresamente.
15. **Todo el acceso (apdos. 0.5 y 7.1) descansa en hechos de sep-oct 2026** dados por verificados. Antes de planificar,
    media hora de Enric en la consola de Google Cloud lo confirma o lo desmiente.
16. **EST-09 y servicios locales de Google**: se recomiendan sin haber verificado categorías disponibles ni gestión por API
    en España (el informe 06 lo marca como no verificado).
17. **INF-03: «coste por cliente»** en el informe mensual: la mayoría de clientes no informará ventas. Decir qué se enseña
    cuando solo hay «válido / no válido».

---

## Lo que sí está bien y no hay que tocar

Solo lo necesario para que no se pierda al corregir: medición como puerta de todo lo demás, solo lectura primero, «el código
calcula y la IA redacta», la estadística para pocos datos del apartado 4, «no concluyente» permitido, y la decisión de no
reimplementar lo que TrueClicks da gratis.
