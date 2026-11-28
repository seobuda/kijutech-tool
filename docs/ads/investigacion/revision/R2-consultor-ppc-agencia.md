# R2 · Revisión desde la operativa de agencia (consultor PPC)

**Fecha:** 28 nov 2026 · **Documento revisado:** `docs/ads/INVESTIGACION-GOOGLE-ADS.md` (entero), `BRIEF.md` y consultas a
`bruto/` 02, 04, 05, 07 y 09b.
**Encargo:** intentar tirarlo abajo desde el día a día de una agencia con un solo gestor.
**Cómo leerlo:** las cifras de tiempo, volumen de alertas y tasas son **estimaciones mías de oficio**, no datos medidos; van
marcadas [est.]. Lo que no he podido comprobar va marcado [sin verificar].

---

## Veredicto en 12 líneas

1. El documento diseña un **analista**, no un **puesto de trabajo**. Tiene 120 capacidades y ninguna pantalla, ningún
   flujo del día, ningún reparto de quién hace qué. Así nacen las herramientas que se abandonan.
2. **Las fases 0-2 no le quitan a Eury ni un minuto**: le añaden lectura (avisos y diagnósticos) mientras sigue haciendo
   su L-X-V a mano. Lo único que sustituye trabajo suyo (términos) llega en la fase 3.
3. **«Solo lectura» durante cinco fases reproduce la queja que el propio documento cita de Adalysis** («cambios que hay
   que aplicar fuera», §8.3): Eury revisa en nuestra herramienta y luego repite el cambio en Google Ads. Doble trabajo.
4. **La puerta de medición (MED-01) dejará mudo al agente en la mayoría de las cuentas** durante semanas, y arreglar la
   medición rompe el histórico de CPL que ve el cliente. No hay plan para ninguna de las dos cosas.
5. **Los cruces que justifican construir dependen de datos que nadie ha contado**: cuántas de las 25 cuentas tienen
   GoHighLevel con etapas marcadas, cuántas landings de pago están en la web rastreada, cuántas tienen CPA objetivo.
6. **El agente aprende del gestor que aún está aprendiendo** (APR-07 reajusta umbrales con sus «no útil»). Eso enseña al
   agente a callar justo lo que Eury no domina.
7. La prioridad es «euros en riesgo»: **las cuentas pequeñas no saldrán nunca en la cola** y son las que se dan de baja.
8. Faltan por completo: nivel de cliente, pendientes del cliente, guardias y ausencias, traspaso, control de calidad
   del trabajo humano y qué sustituye al ritual L-X-V.
9. Poisson está bien calculado, pero **en campañas de 6 leads al mes avisa a los 15-20 días**: para esas cuentas
   (probablemente muchas) el aviso «sin convertir» no protege nada. Hace falta una prueba activa del formulario.
10. Hay varias contradicciones internas (riesgo R1 de EST-01, cupo de Explorer con comprobaciones horarias, presupuesto
    del contrato oculto al gestor, «manos quietas» que no puede bloquear nada en solo lectura). Apartado 6.

---

## 1. El día de Eury con el agente

### 1.1 Lo que el documento da por hecho y no dice

- No dice **qué deja de hacer Eury**. Si nadie retira explícitamente la revisión L-X-V, hará las dos cosas: la suya (por
  costumbre y porque es lo que Enric le pide) y la cola del agente.
- No dice **dónde aplica los cambios**. En solo lectura, en Google Ads a mano.
- No dice **qué pasa fuera de horario**. Hay capacidades horarias (PRO-01, PRO-06, MED-03). Un sábado a las 11:00 la
  landing da error 500: el agente avisa por Telegram a una persona que no trabaja y que, aunque lo vea, tiene que entrar
  en Google Ads desde el móvil. Un aviso sin capacidad de actuar es solo estrés.

### 1.2 Un lunes (tal como quedaría con el diseño actual) [est.]

| Hora | Qué ve | Volumen | Tiempo |
|---|---|---|---|
| 9:00 | Telegram con lo urgente del fin de semana (rechazos, campañas paradas, gasto desbocado, landings caídas) | 2-5 avisos; con 25 cuentas pequeñas, los rechazos y las limitaciones de política son lo más frecuente | 30-45 min, porque cada uno acaba en Google Ads |
| 9:45 | Parte diario INF-01 «qué cuenta mirar hoy» | hasta 10 (tope del documento) | 60-90 min si cada diagnóstico se lee de verdad (5-8 min) |
| 11:15 | Resumen del lunes INF-02, 25 cuentas | 25 bloques de texto | 30-40 min, o no se lee (lo probable a la tercera semana) |
| 12:00 | Cola de términos de la semana (fase 3) | 25 cuentas × 30-150 términos nuevos = 1.000-3.000; tras la cascada, 150-400 propuestas | 2-3 h revisando + 1,5-2 h aplicándolas a mano en Google Ads |
| Tarde | Lo que le pide Enric, el cliente y el equipo web | — | — |

Lectura: el lunes se va entero. No es peor que hoy, pero **tampoco es el ahorro que promete el resumen**. Y hasta la
fase 3 la fila de las 12:00 la sigue haciendo a su manera.

### 1.3 Un miércoles

Debería ser el día ligero: 15 minutos de «¿hay algo roto?» y seguimiento de lo abierto. Con el diseño actual se atasca en
tres sitios:

1. **Hallazgos abiertos que dependen de otros.** El lunes se creó un encargo a web por una landing lenta. El miércoles
   el hallazgo sigue abierto. El documento no dice si vuelve a avisar, si se silencia mientras el encargo está abierto ni
   quién persigue al equipo web.
2. **Falsas alarmas de «sin convertir».** Con unas 100 campañas y α = 2 %, PRO-03 solo genera del orden de 4-5 avisos
   falsos por semana [est.: 100 campañas × ~0,8 %/día de cruzar el umbral por azar]. Los incidentes reales son menos que
   eso. Sin la corrección por pruebas múltiples aplicada **a lo largo del tiempo** (no solo entre cuentas), la mayoría
   de avisos de PRO-03 serán ruido y a las tres semanas no se abren.
3. **«No concluyente».** Es honesto, pero para un gestor junior es un callejón: «no sé la causa; comprueba X». Si X exige
   saber leer el informe de subastas, se queda ahí.

### 1.4 Un día de revisión profunda

Hoy dedica unos 3 días. El documento ofrece muchas piezas (auditoría EST-07, tablero de cuota, nivel de calidad,
sintonía) pero **no una pantalla de «revisión de cuenta» que las ordene**. Lo que un gestor necesita ese día es un guion:

1. ¿Está sana la medición? (una línea, con enlace si no)
2. ¿Vamos en ritmo de gasto y en objetivo de CPL? (dos cifras con contexto)
3. ¿Qué cambió desde la última revisión? (cambios nuestros, de Google, de la web; línea de tiempo)
4. ¿Dónde se va el dinero sin resultado? (3 elementos, no 30)
5. ¿Dónde hay margen? (3 elementos)
6. ¿Qué espera de terceros? (cliente, web, SEO)
7. Cerrar: «revisada», con nota de una línea y fecha de la próxima.

Sin ese guion, el día profundo será abrir ocho tableros. Con él, 25 cuentas pasan de ~1 h a 20-30 min cada una [est.].

### 1.5 Ahorro real, por fase [est.]

| Fase del documento | Efecto neto en el tiempo de Eury |
|---|---|
| 0 (almacén) | 0 |
| 1 (medición y protección) | **−20 a −40 min al día** (lee avisos y sigue con su rutina). A cambio, menos sustos |
| 2 (diagnóstico) | Ahorra tiempo solo cuando hay incidente (antes 30-60 min de investigar, ahora 5-10). 1-3 incidentes reales a la semana: 1-2 h/semana |
| 3 (términos, solo lectura) | De 8-10 h/semana a 4-5 h (revisar + aplicar a mano). Con lista lista para pegar, 3 h |
| 3 + aplicar negativas con un clic | 1,5-2 h/semana. **Aquí está el ahorro de verdad** |
| 6 | El que promete el resumen |

Conclusión: **el primer ahorro tangible depende de una decisión de Enric (aplicar R1 con aprobación) que el documento
aplaza a la fase 6.** Hay que adelantarla o dar un sustituto (1.7).

### 1.6 Pantallas: las que hacen falta y las que sobran

**Hacen falta (cinco, y ninguna está descrita):**

| Pantalla | Qué es | Detalle que importa |
|---|---|---|
| **Hoy** | Bandeja única: urgente · por decidir · esperando a terceros · vencido | Es la página de inicio. Arriba, «comprobadas 25 cuentas, 1.240 controles, 4 cosas para ti» (la idea de Opteo que el documento cita y no coloca en ningún sitio) |
| **Cartera** | Las 25 cuentas en una tabla: nivel de cliente, ritmo de gasto, CPL frente a objetivo, medición, último toque humano, próxima revisión | Es la pantalla de Enric y la que sustituye a la sensación de «las he mirado todas» |
| **Cuenta** | Expediente: objetivo, guion de revisión (1.4), línea de tiempo (cambios + sucesos + notas), hallazgos, pendientes del cliente, decisiones | Es también el documento de traspaso |
| **Lote de términos** | Por cuenta, agrupado por motivo («fuera de zona: 14», «empleo/curso: 9», «servicio que no ofrece: 6», «dudosos: 5») | Aprobar el grupo entero, sacar excepciones, y **salida lista para pegar** |
| **Hallazgo** | El diagnóstico de §3.7, con evidencia, lo descartado y los botones de respuesta | Con enlace directo a la entidad en Google Ads |

**Sobran como pantallas propias al principio** (deben vivir como evidencia dentro de un hallazgo o del expediente):
tablero de visibilidad con las once métricas de cuota (CUO-01), nivel de calidad diario (LAN-01), ratio Lin-Rodnitzky
(TER-08), «gasto invisible» (TER-09), benchmark por sector (APR-04), gráficos de descomposición (DIA-02), «preguntar a
la cuenta» (INF-06). Un gestor que aún no domina la cuota de impresiones no necesita un tablero de cuota: necesita que
le digan cuándo importa y por qué.

**Regla de producto:** 120 capacidades internas, pero **no más de 12-15 tipos de hallazgo visibles** en el lanzamiento.

### 1.7 Propuestas concretas para el flujo

- **P1. Cierre automático por historial de cambios.** Si Eury aplica el cambio en Google Ads, el agente lo ve en
  `change_event` y cierra la propuesta solo, anotando quién y cuándo. Nada de marcar «hecho» a mano. Es lo que hace
  soportable el solo lectura.
- **P2. Salida lista para aplicar.** Cada lote de negativas genera el texto para pegar en la lista compartida o el
  archivo para Google Ads Editor, más el enlace directo. (Ojo con la afirmación de que el historial no cubre Editor:
  ver 6.9; si fuera cierta, P1 y Editor chocan y habría que elegir.)
- **P3. Decisión adelantada para Enric:** aplicar con un clic **solo negativas en listas compartidas creadas por la
  herramienta**, con aprobación de Eury, etiqueta y deshacer. Es el cambio más reversible que existe y es el que
  convierte la fase 3 en ahorro. Sigue siendo línea roja hasta que Enric lo apruebe; lo que digo es que se decida al
  empezar la fase 3, no en la 6.
- **P4. Segunda decisión adelantada:** pausa de emergencia automática y acotada (landing con error confirmado dos veces
  o gasto desbocado), con reanudación automática al recuperarse y aviso. Sin esto, los avisos de fin de semana no
  sirven. También línea roja: decide Enric.
- **P5. Sustituir el ritual, por escrito.** «Desde el día X ya no se revisan todas las cuentas L-X-V. Se hace: Hoy cada
  mañana (20 min), lote de términos una vez por semana y cuenta, revisión de cuenta según nivel (2.1).» Y la pantalla
  Cartera demuestra la cobertura. Si no se retira el ritual viejo, el agente es trabajo añadido.

---

## 2. Adopción y fatiga

### 2.1 Qué resuelve el diseño y qué no

| Fallo típico | ¿Lo evita? | Por qué |
|---|---|---|
| Demasiados avisos | **A medias** | Tiene los principios (una alerta por causa, suelos, tope de ~10). Pero 10 al día para una sola persona son 50 a la semana más los términos; no reparte entre canales; el tope es por módulo y Eury ya recibe avisos de Operaciones y SEO |
| Nota de cuenta que obliga | **No del todo** | Dice «ninguna nota que penalice descartar» y a la vez crea una **nota de medición con mínimo** (MED-01) que bloquea al agente. Es una nota que obliga, con otro nombre |
| Recomendaciones sin contexto de negocio | **En teoría sí** | Depende de que la ficha tenga «lo que NO hace», zona real, términos protegidos y objetivo. Nadie ha comprobado si las 25 fichas lo tienen |
| Cambios masivos peligrosos | **Sí** (no escribe) | Pero cuando escriba, las listas de negativas por sector entre cuentas (TER-03) son exactamente «cambio masivo entre cuentas»: una negativa de frase mal elegida corta tráfico en 6 clientes a la vez |
| Aplicar fuera | **No** | Ver 1.5 |
| Avisos repetidos de lo ya sabido | **Sin definir** | No hay política de recordatorio ni estado «esperando a tercero» |
| Avisos que piden lo que el gestor no sabe hacer | **No** | Ver apartado 3 |

### 2.2 Reglas que propongo (redactadas para el diseño)

**Presupuesto de atención (por persona y día, sumando todos los módulos, no por módulo):**

| Canal | Qué entra | Tope |
|---|---|---|
| **Interrupción** (Telegram, al momento) | Solo lo que pierde dinero cada hora **y** tiene acción posible ahora: web o formulario caídos con gasto, gasto desbocado, pago o suspensión, rechazo de lo que más gasta | **2 al día**. El tercero y siguientes se agrupan en uno. Solo en horario laboral salvo las dos pausas automáticas de P4 |
| **Parte de la mañana** (pantalla Hoy + un único mensaje) | Hallazgos nuevos con decisión | **5 con decisión + 3 «para que lo sepas»**. Lo demás espera en la cola, ordenado |
| **Lote semanal** | Términos, higiene, oportunidades | Un lote por cuenta, en el día de la semana asignado a esa cuenta. Nunca a goteo |
| **Revisión de cuenta** | Lo estructural y lo estratégico | Solo aparece dentro del guion de revisión; nunca como aviso |

Si un día hay 14 hallazgos que superan los umbrales, **el fallo es del umbral, no del día**: se muestran 5 y la pantalla
dice «9 más por debajo del corte».

**Agrupación:**
- Una alerta por causa (ya está). Añadir: **una alerta por causa y por cliente**, y **una sola por causa común** entre
  cuentas (PRO-09) con la lista dentro.
- Los términos nunca son alertas individuales: siempre lote.
- Dos hallazgos sobre la misma entidad en 7 días se funden en uno con historial.

**Silencios (cada uno con fecha de fin visible):**
- Mientras hay un encargo abierto que cubre la causa: silencio hasta su fecha de entrega; si vence, **un** recordatorio y
  escalado (2.3).
- «Esperando al cliente»: silencio hasta la fecha que ponga Eury; el pendiente pasa al informe del cliente.
- Tras un cambio propio en esa campaña: 2 ciclos de conversión o 14 días (ya está en PUJ-06; aplicarlo también a los
  avisos, no solo a las propuestas).
- Cuenta en alta (primeras 2-4 semanas): solo interrupciones; lo demás va a la auditoría de entrada.
- Navidad, Semana Santa, agosto y festivos locales: anomalías de volumen en modo «para que lo sepas».
- Posponer 1, 7 o 28 días (lo copia de Optmyzr; bien) con **máximo dos posposiciones**: a la tercera, decidir o descartar
  con motivo.

**Recordatorios:** un hallazgo abierto **no se reenvía**. Vive en Hoy con «días abierto» y coste acumulado. Solo vuelve a
avisar si empeora de forma material o si vence su plazo.

**«Por qué te lo digo» (plantilla fija, cuatro líneas, siempre en este orden):**

> **Qué pasa** (un hecho, una cifra). **Por qué te lo digo ahora** (qué umbral saltó y qué cuesta esperar, en euros o
> leads). **Qué creo que es y qué he descartado** (con la cobertura: «no he podido mirar el CRM»). **Qué haría yo** (una
> acción, quién la hace, cuánto tarda).

Sin la segunda línea, toda alerta parece igual de urgente. Es la que falta en el ejemplo de §3.7.

**Respuestas que enseñan al agente (sustituyen a «útil / no útil / ya lo sabía»):**

| Respuesta | Efecto en el sistema |
|---|---|
| Hecho / lo hago | Seguimiento y cierre automático por historial de cambios |
| Ya lo sabía | No cambia umbrales. Si se repite: el agente llega tarde, revisar la frecuencia de esa regla |
| **El cliente lo quiere así** (contexto de negocio) | Pide una frase y propone guardarla como **regla permanente en la ficha** («no excluir “barato”», «la campaña X no se toca»). Es la respuesta más valiosa |
| No compensa (poco dinero) | Sube el suelo de materialidad **de esa cuenta y ese tipo**, con tope y caducidad de 90 días |
| Los datos están mal | Abre hallazgo de medición; no toca umbrales |
| No estoy de acuerdo con la causa | No toca nada. Va a la revisión semanal con Enric y a los casos de oro |
| No lo entiendo | No toca nada. Cuenta para el nivel de Eury (apartado 3) y marca la explicación como mejorable |
| Ahora no | Posponer con fecha |

**Regla dura:** ninguna respuesta de una sola persona cambia un umbral de forma automática y permanente. Los ajustes se
proponen en un resumen mensual que aprueba Enric (o quien haga de sénior). Motivo en 3.3.

### 2.3 La puerta de medición, rehecha

Tal como está («si la nota no llega al mínimo, el agente no propone nada de rendimiento»), con una mediana de 9
acciones primarias en auditorías (dato del propio documento) lo esperable es que **más de la mitad de las cuentas
suspendan** [est.]. El agente quedaría mudo donde más falta hace, y Eury seguiría a mano en esas cuentas.

Propuesta: tres estados, no aprobado o suspenso.

| Estado de la medición | Qué puede proponer el agente |
|---|---|
| **Rota** (no llegan conversiones, doble conteo evidente) | Solo protección (web, gasto, rechazos) y el arreglo de medición |
| **Dudosa** (demasiadas primarias, clic de teléfono como primaria, sin conciliar con CRM) | Protección + términos por intención y por zona + higiene + ritmo de gasto. **No** escalado, **no** cambios de objetivo, **no** pausas por «no convierte» |
| **Sana** | Todo |

Es lo que ya dice ESC-03 («control antes de escalar»), que contradice a MED-01. Vale ESC-03.

**Y lo que falta: el plan de saneamiento.** Arreglar la medición de 15 cuentas es R3 en las 15: reinicia lo que aprende
la puja y **hace «caer» las conversiones del informe del cliente** (se dejan de contar clics de teléfono). Hace falta:
orden por nivel de cliente, máximo 2-3 cuentas por semana, serie antigua y nueva en paralelo 4-6 semanas (la antigua
como secundaria), y un texto para el cliente **antes** del cambio («a partir del día X verá menos conversiones porque
dejamos de contar…»; borrador, lo envía una persona). Sin esto, la primera consecuencia visible del módulo será un
cliente preguntando por qué han bajado sus resultados.

---

## 3. Aprendizaje del gestor

El documento le dedica dos líneas («explicar cada propuesta», «implicarle desde el diseño»). Es insuficiente para un
gestor que no domina cuota de impresiones, subastas ni parte superior, y al que el agente va a hablarle justo de eso.

### 3.1 Cómo debe enseñar

- **Tres capas en cada hallazgo:** (1) qué hacer; (2) por qué en esta cuenta; (3) el concepto, en tres líneas y con el
  enlace al glosario que ya tiene la herramienta. La capa 3 se muestra abierta las primeras veces que aparece ese
  concepto y plegada después.
- **Nivel por familia, no global.** Eury es sénior en términos y novato en cuota. Para cada familia (términos,
  medición, pujas, cuota y competencia, landing, estructura): *aprendiz* (explicación completa, la propuesta la
  confirma Enric si es R2+), *autónomo* (explicación breve), *experto* (solo el dato). Se sube de nivel con decisiones
  que luego salieron bien y con las correcciones acertadas al agente, no por antigüedad.
- **«Primero tú» en una muestra.** En 1 de cada 5 diagnósticos [valor de partida], antes de enseñar la causa: «CPL +40 %
  en Cocinas. ¿Qué mirarías primero?» con 4 opciones. Después se muestra el árbol. Diez segundos, y es la única forma de
  que aprenda a diagnosticar en vez de a leer diagnósticos.
- **Caso de la semana:** un incidente real ya cerrado (de cualquier cuenta), con lo que se vio, lo que se descartó y
  cómo acabó. Cinco minutos los viernes.
- **Explicar también lo que NO se propone:** «No toco el presupuesto aunque Google lo recomienda, porque la campaña
  lleva 6 días desde el último cambio». Enseña criterio, que es lo que más cuesta.

### 3.2 El riesgo de aprobar sin pensar

Es el riesgo principal cuando haya aprobación con un clic, y el documento no lo nombra. Controles:

| Control | Regla |
|---|---|
| Fricción proporcional al riesgo | R1: lote con excepciones. R2: una a una, eligiendo **qué evidencia te convence** (casillas). R3: frase escrita + segunda persona |
| Señales de piloto automático | Tasa de aprobación > 95 % en 4 semanas, mediana de tiempo por propuesta R2 < 10 s, cero excepciones en lotes de términos. Si saltan: aviso a Enric, no a Eury |
| Muestra ciega | Un 5-10 % de lo aprobado en R1 lo revisa otra persona (o un segundo juez de IA con otro prompt) cada semana. El desacuerdo va a la revisión semanal |
| Propuestas de control | **Solo mientras el agente no escribe**: de vez en cuando, una propuesta deliberadamente dudosa (confianza baja, marcada internamente). Si se aprueban todas, hay piloto automático. Cuando haya escritura, el validador impide que una de control llegue a aplicarse |
| Tope de lote | Ningún clic aprueba más de N cambios ni más de una cuenta a la vez |
| Retrospectiva | Mensual: las 5 decisiones que peor salieron y las 5 mejores, de Eury y del agente por igual |

### 3.3 El agente no debe aprender del aprendiz sin supervisión

APR-07 dice «reajuste de umbrales por cuenta» a partir de útil / no útil. Si Eury marca «no útil» los avisos de cuota
perdida por ranking porque aún no sabe qué hacer con ellos, **el agente aprende a no avisar de ranking**. Es el fallo
clásico de los sistemas con realimentación: optimizan para la comodidad del usuario, no para el resultado.

- Las respuestas ajustan **prioridad y presentación**, no detección.
- «No lo entiendo» es una respuesta distinta de «no útil» (2.2).
- Los cambios de umbral pasan por el resumen mensual aprobado por un sénior.
- Lo mismo para los **casos de oro** (APR-06, «revisiones históricas de Eury»): si el examen del agente es «¿coincide
  con lo que hizo Eury?», se le enseña el nivel básico que el brief quiere superar. Los casos de oro deben ser
  incidentes con **desenlace conocido**, validados por alguien con más experiencia o por el resultado.

### 3.4 Descualificación

Si el agente diagnostica siempre, Eury no aprenderá nunca a hacerlo y la agencia dependerá por completo de la
herramienta. Es aceptable solo si se decide a sabiendas. Si no: «primero tú» (3.1) y una revisión de cuenta al mes hecha
sin diagnóstico previo y comparada después.

---

## 4. Lo que falta para la agencia

Ordenado por lo que más daño hace si no está.

### 4.1 Inventario de cobertura (antes de diseñar nada)

Toda la diferenciación (§8, §9) depende de datos por cuenta que el documento no ha contado. Tabla a rellenar para las
25+ cuentas, una fila por cuenta:

| Dato | Por qué decide |
|---|---|
| Inversión mensual y cuota de agencia | Nivel de cliente; si TrueClicks es gratis; materialidad |
| Conversiones al mes por campaña | Cuántas cuentas están por debajo de 15-30 al mes (donde Poisson y la puja por objetivo no funcionan) |
| ¿GoHighLevel conectado? ¿Entran ahí los leads de Ads? ¿**Alguien marca etapas**? | Sin esto, toda la familia LEAD, MED-02, MED-10 y la «métrica rectora» son teoría |
| ¿La landing de los anuncios está en la web que rastrea el SEO? | Muchas landings de captación viven en embudos de GoHighLevel, subdominios o constructores aparte. Si es así, PRO-06, LAN-02 a 04 y el «cruce que solo tenemos nosotros» no ven nada |
| ¿Search Console, GA4 y GBP conectados para **ese** cliente? | No todo cliente de Ads es cliente de SEO |
| ¿Hay CPA objetivo y presupuesto mensual de medios acordado? | Todos los umbrales cuelgan de ahí |
| ¿Quién tiene el acceso de administrador y la facturación? | Quién puede arreglar un pago fallido |
| ¿Quién habla con el cliente? | A quién van los borradores |

Mi apuesta [est.]: menos de un tercio de las cuentas tendrá etapas del CRM usables. Si es así, **la fase 4 («el mayor
salto de valor») es un proyecto de cambio de hábitos del cliente, no de software**, y hay que decirlo antes de
presentarla como la ventaja.

### 4.2 Nivel de cliente y prioridad

La fórmula de §3.6 (euros × confianza × urgencia / esfuerzo) ordena por dinero en riesgo dentro de la cuenta. Dos
efectos malos: las cuentas de 300-500 € al mes **no salen nunca**, y los hallazgos de medición (sin euros directos)
quedan abajo aunque el documento diga que la medición manda.

Propuesta:

```
Prioridad = (Impacto relativo × Confianza × Urgencia × Peso del cliente) / Esfuerzo
Impacto relativo = impacto en € / inversión mensual de esa cuenta   (un 20 % de una cuenta pequeña pesa como un 20 % de una grande)
Peso del cliente = nivel (A 1,5 · B 1 · C 0,7) × riesgo de baja (1 a 1,5)
```

- **Nivel** (A, B, C): cuota de agencia, antigüedad, otros servicios contratados. Lo fija Enric.
- **Riesgo de baja**, calculado: CPL por encima del objetivo dos meses seguidos, leads a la baja, renovación del
  contrato en menos de 60 días, queja reciente, cliente que no contesta, informe sin enviar.
- **Suelo de atención:** toda cuenta recibe una revisión humana registrada cada N días según nivel (A 7, B 14, C 30).
  La pantalla Cartera marca en rojo las vencidas.
- Los hallazgos de medición llevan impacto imputado = inversión mensual de la cuenta × un factor fijo, para que no se
  hundan en la cola.

### 4.3 Relación con el cliente

Lo que hay: informe mensual (INF-03) y aviso proactivo (INF-04), ambos como borrador. Falta:

- **Pendientes del cliente** como entidad: qué se le pidió (landing, acceso, marcar leads, subir presupuesto, aprobar
  textos), cuándo, quién, recordatorios, y efecto: silencia hallazgos dependientes y aparece en el informe como
  «pendiente por su parte». Sin esto, el agente repetirá cada semana un problema que la agencia no puede resolver.
- **Lo que decide el cliente, no Eury:** subir presupuesto (CUO-02, ESC-04) es dinero del cliente. La propuesta debe
  generar el **argumento para el cliente** (cuánto, qué se espera, con qué probabilidad), no un botón de aprobar.
- **Ficha de reunión:** una página por cliente antes de cada llamada (qué pasó, qué hicimos, qué funcionó, qué le
  pedimos y no ha hecho, qué proponemos).
- **Respuesta rápida a «¿por qué han bajado los leads?»:** el diagnóstico en versión cliente, sin jerga, en dos minutos.
- **Marcado de leads sin depender del CRM:** donde el cliente no marca etapas, un borrador semanal «de estos 7 contactos,
  ¿cuáles eran buenos?» que envía una persona. Es la forma realista de conseguir «válido / no válido».
- **Discontinuidad de informes** al sanear la medición (2.3).

### 4.4 Coordinación con web y SEO por encargos

El documento dice «un hallazgo R0 que pide trabajo humano se convierte en encargo». Falta el circuito:

- El encargo lleva el **coste diario de no hacerlo** y el nivel del cliente.
- Plazo por tipo: web o formulario caídos, el mismo día; etiqueta rota, 24 h; landing lenta, 10 días; página nueva, según
  acuerdo.
- El hallazgo queda en «esperando a web» y se silencia hasta el plazo. Vencido: un recordatorio al responsable y entrada
  en el parte de Enric.
- **Verificación al cerrar:** cuando el encargo se marca hecho, el agente vuelve a medir. Si no se arregló, lo reabre
  con la evidencia.
- **Deduplicar con el SEO:** la misma página lenta o caída ya puede tener hallazgo y encargo del módulo SEO. Un solo
  encargo con los dos motivos (vía núcleo, sin que Ads importe al SEO).
- **Quién paga:** rehacer una landing puede no estar en el contrato. Ese hallazgo va al responsable de la cuenta como
  oportunidad comercial, no a la cola de web.
- Toda creación de tareas respeta la regla del proyecto (cliente de ClickUp y bandeja de salida).

### 4.5 Plazos internos

| Qué | Plazo propuesto |
|---|---|
| Interrupción: visto | 1 h laboral; si no, escala a Enric |
| Interrupción: resuelto o con plan | 4 h laborales |
| Hallazgo del parte: decidido (hacer, descartar con motivo, posponer) | 2 días laborables |
| Lote de términos por cuenta | Semanal en A y B; quincenal en C |
| Revisión de cuenta | Según nivel (4.2) |
| Evaluación posterior de un cambio R2 o R3 | Fecha fijada al aprobar; la recuerda el agente |

### 4.6 Alta de cuentas nuevas

EST-07 da el informe; falta el proceso. Lista de alta (bloquea el paso a «vigilada»):

1. Acceso por MCC y cuenta de servicio; quién paga y con qué tarjeta.
2. **Descarga del historial de cambios el primer día** (solo hay 30 días) y del histórico de métricas (hay 37 meses:
   la línea base puede existir desde el día 1; el documento no lo dice y deja entender que hay que esperar 6-8 semanas).
3. Mapa de conversiones y estado de la medición (2.3).
4. Objetivo: CPA objetivo (o provisional = mediana del CPL de 90 días, marcado como provisional), presupuesto mensual
   de medios, qué es un lead válido.
5. Ficha: servicios, lo que **no** hace, zona real, horario, competidores, términos y campañas protegidos.
6. Conexiones: CRM, GA4, Search Console, GBP, landing rastreada.
7. Nivel de cliente y día de la semana de su lote.
8. Auditoría de entrada por tandas, y **30 días de avisos reducidos**.
9. Informe de entrada al cliente (borrador).

### 4.7 Guardias, ausencias y traspaso

Un solo gestor es el mayor riesgo operativo del servicio y el documento no lo toca.

- **Suplente** definido para vacaciones y bajas: a quién van las interrupciones y con qué permisos.
- **Modo ausencia:** el agente sube los suelos (solo interrupciones y lo que vence) y prepara un parte de vuelta.
- **Expediente de cuenta** (pantalla Cuenta) como documento de traspaso generado solo: estrategia vigente, por qué la
  estructura es así, decisiones de los últimos 6 meses con su motivo, lo que el cliente quiere y no quiere, lo abierto.
  Prueba de fuego: ¿podría otra persona llevar la cuenta mañana leyendo solo eso?
- Las «reglas del cliente» nacidas de los descartes (2.2) son precisamente lo que hoy está solo en la cabeza de Eury.

### 4.8 Control de calidad del trabajo humano

PRO-08 vigila el historial para detectar intrusos y explicar caídas. Falta usarlo como control de calidad, sin
convertirlo en vigilancia:

- **Cambios manuales R2 y R3 hechos fuera de una propuesta:** el agente pide una línea de motivo (una vez, en Hoy, no
  por Telegram) y abre su evaluación posterior. Los R1 no se preguntan.
- **Avisos de oficio tras el hecho:** cambio > ±20 %, segundo cambio grande en 14 días, cambio en campaña en
  aprendizaje, campaña nueva lanzada en viernes, recomendación de Google aplicada tal cual.
- **Lista previa al lanzamiento** de campaña nueva (medición, ritmo, landing, zona, redes), que el agente comprueba solo.
- **Parte mensual para Enric:** cobertura de revisiones, plazos cumplidos, decisiones evaluadas, pendientes de clientes
  y de web. Sin clasificación de personas.

### 4.9 Registro de lo hecho y por qué

APR-01 lo cubre para lo que propone el agente. Faltan: los cambios manuales (4.8), las **no-acciones** («decidimos no
subir presupuesto porque…»), lo acordado con el cliente y las notas de reunión. Todo en la línea de tiempo de la cuenta.
Y un matiz: pedir predicción con intervalo y evaluación con control **para cada negativa** es burocracia; el efecto de
una negativa suelta no se puede medir. Predicción individual solo en R2 y R3; las R1 se evalúan en conjunto.

---

## 5. Orden de construcción

### 5.1 Crítica al orden propuesto

- Fases 0-2 = semanas de construcción con valor de «seguro» pero sin ahorro de tiempo (1.5). Riesgo real: que el equipo
  concluya «esto solo me da más avisos».
- La fase 4 se presenta como «el mayor salto de valor» sin saber si hay datos (4.1).
- La fase 6 mezcla lo que más ahorra (aplicar R1) con lo más arriesgado (pujas, escalado). Hay que partirla.
- No existe una fase de **producto** (pantallas, flujo, respuestas) ni de **modo sombra**.
- Se lanzaría en diciembre-enero: las 6-8 semanas de línea base incluirán Black Friday, Navidad y Reyes. Si se avisa
  desde el primer día, la primera impresión será una lluvia de falsas anomalías.

### 5.2 Orden alternativo

| Paso | Qué | Valor para Eury |
|---|---|---|
| **A** | Inventario de cobertura (4.1), nivel de cliente, CPA y presupuesto de medios por cuenta. Sin código | Decide el resto del orden |
| **B** | Acceso + almacén + descarga del histórico (métricas de 24 meses, historial de cambios desde ya) | — |
| **C** | **Pantalla Cartera** con ritmo de gasto, CPL frente a objetivo, estado de medición y último cambio. Las cuatro interrupciones (parada o desbocada, rechazo, landing caída, pago) | Sustituye el «entrar en las 25 cuentas a ver si pasa algo». Es el dolor nº 1 de las agencias según el propio informe 07 (ritmo de presupuesto) |
| **D** | **Lote de términos** con ficha del cliente (reglas, n-gramas, zona, embeddings; IA solo en lo dudoso), salida lista para pegar y cierre por historial de cambios | Primer ahorro real: es el 90 % de su trabajo manual |
| **E** | Decisión de Enric: aplicar negativas con aprobación (P3) y pausas de emergencia (P4) | Convierte D en ahorro grande |
| **F** | Diagnóstico con el porqué (árbol), **dos semanas en modo sombra**: se guarda lo que habría avisado, Enric y Eury lo puntúan, se calibra el tope | Responde al brief sin quemar la confianza |
| **G** | Guion de revisión de cuenta y expediente | Recorta los 3 días de revisión profunda |
| **H** | Saneamiento de la medición por tandas (2.3) e informes al cliente | — |
| **I** | Calidad del lead, donde el inventario diga que hay datos | — |
| **J** | Landing y anuncios; propuestas R2; aprendizaje | — |

Diferencia de fondo: el documento ordena por **dependencia lógica** (la medición invalida todo → primero). Yo ordeno
por **adopción**: primero lo que quita trabajo y gana confianza, con la medición como estado visible desde el principio
(paso C) pero saneada por tandas después.

### 5.3 Primera semana de uso real

Solo esto:

1. **Cartera**: 25 filas, cinco columnas, colores. Nada más.
2. **Como máximo 2 interrupciones al día**, solo de los cuatro tipos del paso C.
3. **Un lote de términos al día para 5 cuentas** (las 25 en la semana), con salida para pegar.
4. Las ocho respuestas de 2.2 activas desde el primer día.
5. **Diagnóstico y anomalías en sombra**: no se envían.
6. Viernes, 30 minutos con Eury y Enric: qué sobró, qué faltó, qué no entendió.

Criterio de éxito de la semana: que Eury **deje de abrir las 25 cuentas L-X-V** porque Cartera le basta, y que diga cuántas
horas le ha costado el lote frente a su revisión de términos habitual. Si eso no pasa, no se construye nada más hasta
entender por qué.

### 5.4 Mientras se construye

El módulo tardará. Eury «se deja cosas básicas» hoy. El documento sugiere TrueClicks en paralelo como vara de medir; yo
lo usaría además como **parche temporal** (lo lee Enric o el agente, no se le añade a Eury otra bandeja), junto con un
script de ritmo de presupuesto en la MCC. Decisión de Enric: implica dar acceso a un tercero a cuentas de clientes y
revisar que la inversión total no supere su tramo gratuito [sin verificar].

---

## 6. Errores, contradicciones y afirmaciones dudosas

Por gravedad.

1. **MED-01 contra ESC-03.** MED-01: sin nota mínima «el agente no propone nada de rendimiento». ESC-03: solo bloquea
   el escalado. Son dos políticas distintas. Vale la segunda (2.3).
2. **«Ninguna nota que penalice» (§8.3) contra «examen de medición con nota» y mínimo (MED-01).** Es una nota que
   obliga. Sustituir por tres estados.
3. **Presupuesto del contrato oculto (§6.4):** «solo lo ven administradores: el agente lo usa como límite sin
   mostrarlo». Un gestor de Ads no puede llevar el ritmo de gasto (PRO-07) sin conocer el presupuesto mensual de medios.
   Parece confundir **inversión en medios** (Eury debe verla) con **cuota de agencia** (solo administradores). Separar
   los dos campos.
4. **PUJ-06 «bloquea o pide confirmación»** es imposible en solo lectura: Eury cambia en Google Ads y el agente se
   entera después. Hasta que los cambios pasen por la herramienta, es un aviso posterior. Alternativa útil: semáforo
   «no tocar hasta el día X» visible en cada campaña.
5. **EST-01 como R1 y «candidatas a un clic».** Apagar socios de búsqueda o Display, cambiar a «presencia» o desactivar
   recomendaciones autoaplicadas cambia el volumen y lo que aprende la puja. No es «pequeño y reversible» en el sentido
   de una negativa. Es R2, y en campañas con puja por objetivo, R2 con «manos quietas».
6. **Cupo de Explorer.** El cálculo («40 consultas diarias por cuenta», caben en 2.880) ignora las capacidades marcadas
   como horarias: 25 cuentas × 24 h × 2-3 consultas son 1.200-1.800 operaciones al día, más las ~1.000 diarias, más la
   resincronización de 7-10 días y la descarga inicial. Explorer no basta si «H» es de verdad cada hora. El documento
   ya recomienda Basic; debería decir que es **requisito**, no margen, o limitar lo horario al horario de anuncios.
   [Límites tomados del propio documento; sin verificar por mi parte.]
7. **Poisson no protege a las cuentas pequeñas.** La tabla es correcta (la he recalculado), pero su consecuencia no se
   saca: con 0,2 leads al día el aviso llega a los 15-20 días, es decir, tras perder más de medio mes. §4.8 menciona
   «métricas con más volumen que adelantan el problema» y no lo convierte en capacidad. Y MED-11 (prueba de punta a
   punta del formulario) es **trimestral y manual**. Para estas cuentas lo único que protege es una **prueba activa**:
   comprobación automática diaria de que la landing carga, el formulario existe y su envío responde, más sesiones e
   inicios de formulario de GA4 como señal adelantada. Falta en el catálogo.
8. **Falsas alarmas de PRO-03 en el tiempo.** α = 2 % por campaña y día, con ~100 campañas, da varias falsas a la
   semana (1.3). La corrección de Benjamini-Hochberg de §4.5 se plantea entre cuentas, no para pruebas repetidas cada
   día. Hay que calibrarlo con la repetición de 90 días que el propio documento propone, antes de enviar nada.
9. **«El historial no cubre Google Ads Editor» (PRO-08, §7.2; viene del informe 04).** Dudoso: que yo recuerde, el
   enumerado de tipo de cliente de `change_event` incluye un valor para Editor. [Sin verificar.] Importa porque de
   ello dependen P1, P2 y el control de calidad. Comprobar con una cuenta real antes de diseñar.
10. **«Lo que hace hoy Eury es exactamente el 90 % del trabajo manual del mercado» (§0).** El dato de Optmyzr (09b) es
    que ~90 % de los **cambios manuales** son de segmentación (palabras y negativas). Es una proporción de cambios, no
    del trabajo ni del tiempo, y no describe a Eury. La frase del resumen lo exagera.
11. **El ejemplo bayesiano contradice el argumento de venta.** En §4.3, con la referencia del sector el agente espera
    hasta 90 clics (180 €, k = 4,5) donde la regla fija k = 3 cortaba en 120 €. Es defendible, pero entonces no se puede
    decir que las reglas fijas «llegan tarde»: aquí la nuestra llega más tarde y gasta más. Y Eury, por intención,
    cortaría a los 5 clics. Aclarar que el beneficio es **menos falsos positivos**, no rapidez, y que el corte rápido
    lo da el juez de intención.
12. **Referencia de sector y benchmark con 25 cuentas.** Sector × provincia × tipo de campaña deja casi todas las
    celdas con 1 cuenta. El documento lo admite en los límites, pero lo sigue vendiendo en la tabla del resumen («con
    el sector entero como referencia»). Contar antes cuántos sectores tienen 3 o más cuentas.
13. **Experimentos de agencia (APR-03) entre cuentas.** Con 25 cuentas heterogéneas no hay potencia estadística; el
    veredicto será «no concluyente» casi siempre. Y dejar a media cartera sin una mejora que se cree buena tiene un
    coste con el cliente. Limitarlo a aleatorizar **entidades dentro de una cuenta**.
14. **«Cada acción se evalúa» (tabla del resumen).** Falso para R1: el efecto de una negativa o de un cambio de higiene
    suelto no es medible. Decir «cada acción R2 y R3; las R1, en conjunto».
15. **Línea base de 6-8 puntos con MAD.** Funciona en el ejemplo (40-50 clics). En campañas de 5-10 clics al día la MAD
    es 1 o 0 y el z se dispara. Hace falta el suelo absoluto siempre y, en recuentos bajos, Poisson también para clics.
16. **PRO-01 «gasto > 2× el presupuesto diario».** Google limita el gasto diario a 2× el presupuesto, así que ese
    umbral no saltará casi nunca. Usar ≥ 1,7-1,8×, o el acumulado de varios días.
17. **INF-02 «resumen del lunes con datos maduros».** El lunes, viernes a domingo están inmaduros según §4.4. O el
    resumen cubre hasta el jueves, o se envía el miércoles.
18. **«Dos bloqueos ya no existen» (§0.5).** Es la afirmación con más consecuencias del resumen y se apoya en
    documentación leída, no en una prueba. Antes de decírselo a Enric como hecho: crear el proyecto, pedir el nivel y
    leer una cuenta. La Data Manager API el propio documento la marca «no verificado en la práctica» en §7.3, pero en el
    resumen aparece sin matiz.
19. **Tope de alertas sin dueño.** §4.5 y §11 hablan de «unas 10 por mañana» sin decir si es por persona, por módulo o
    para toda la agencia. Eury ya recibe avisos de Operaciones. El tope debe ser por persona y global (2.2).
20. **Organización en seis agentes (§5.4).** Para el usuario debe ser **una sola voz**. Si Vigía, Diagnosticador y Juez
    escriben cada uno por su lado, se rompe «una alerta por causa». Que sea arquitectura interna, no interfaz.
21. **Listas de negativas por sector entre cuentas (TER-03)** chocan con la lección de §8.3 («demasiado fácil hacer
    cambios masivos»). Dos clientes del mismo sector no excluyen lo mismo (uno hace «urgencias», otro no). La lista de
    sector debe ser **sugerencia por cuenta**, validada contra la ficha de cada una, no lista compartida en la MCC.
22. **Tiempos del §1.4** («15-30 h la parte semanal»): el documento reconoce que no tienen fuente. No sirven para
    prometer ahorro. Medir una semana real de Eury antes de empezar (qué hace, cuánto tarda): es la línea base del
    proyecto y hoy no existe.

---

## 7. Preguntas que Enric debería contestar antes del diseño

1. ¿Qué deja de hacer Eury el día que esto funcione, y a qué dedica el tiempo liberado?
2. ¿Quién habla con el cliente de Ads: Eury, Enric u otra persona?
3. ¿Quién cubre a Eury en vacaciones y en fin de semana?
4. ¿Cuántas cuentas tienen el CRM con etapas marcadas? (4.1)
5. ¿Las landings de pago están en la web que rastreamos?
6. ¿Aceptas adelantar la decisión de aplicar negativas con aprobación y la pausa de emergencia? (P3, P4)
7. ¿Quién hace de sénior que valida umbrales, casos de oro y la muestra ciega, si Eury es el único que sabe de Ads?
   Si la respuesta es «nadie», el agente será el sénior de hecho y los controles del apartado 3 dejan de ser opcionales.
