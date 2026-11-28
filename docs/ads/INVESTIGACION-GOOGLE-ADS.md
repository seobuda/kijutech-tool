# Investigación Google Ads: cómo debe ser el agente de Kijutech

**Versión 2 · 28 nov 2026** · **Estado:** documento de conclusiones para debatir con Enric (no es un diseño aprobado).
**Base:** los 11 informes de `docs/ads/investigacion/bruto/` (01 a 10 y 09b, unas 85.000 palabras), `HUECOS.md`, el PDF de
contraste de otra IA, `docs/ESTADO.md` y **tres revisiones críticas** de `docs/ads/investigacion/revision/`: R1 (consultor
de cuentas), R2 (operativa de agencia) y R3 (paid media y negocio).

**Qué es la versión 2.** Los tres revisores recibieron el encargo de tirar abajo la v1. Encontraron errores reales
(diagnósticos al revés, un método que no existe cuando las conversiones son cero, umbrales que con Smart Bidding son ruido
permanente, un ejemplo mal calculado, promesas del resumen que el propio apartado de estadística desmentía) y tres huecos
grandes: no había objetivo de negocio por cliente, no había pantallas ni día de trabajo, y la protección de datos estaba
tratada por encima. Esta versión los integra en el cuerpo del documento. Cada crítica, con su decisión (aceptada, en parte
o rechazada) y el motivo, está en el **apartado 15**.

**Cómo leerlo.** Las citas entre paréntesis remiten al informe interno, p. ej. «(05)» = `bruto/05-auditoria-diagnostico.md`;
las URL clave están en el apartado 14. **[opinión]** es criterio propio de quien firma, no un hecho. **[no verificado]**
viene de fuentes secundarias o no se pudo comprobar. **[estimación]** es una cifra de oficio de un revisor, sin medir. La
estrella ★ señala lo que ninguna herramienta analizada hace bien según lo investigado. «PDF» remite al mapa de auditorías
del informe de contraste. «rev. R1/R2/R3» marca lo cambiado por una revisión.

**Aviso de alcance.** Nada de lo que aquí se propone toca cuentas reales todavía. Cambiar pujas, presupuestos o anuncios en
cuentas de clientes es una línea roja del proyecto: el agente nace en **solo lectura** y cada paso hacia la escritura es una
decisión de Enric (apartado 13).

---

## 0. Resumen para Enric

**Lo que sabemos**

1. **El trabajo del mejor consultor ya no es mover pujas.** La máquina de Google ejecuta; el experto define el objetivo de
   negocio, le da datos buenos, vigila y corrige (01). Lo que hace hoy Eury (términos, pausas, CPL) es la capa más
   automatizable: según Optmyzr, el 90 % de los **cambios manuales** del mercado son de ese tipo (09b).
2. **«2-3 días sin convertir» es mala regla para casi todas vuestras campañas.** Con medio lead al día, tres días a cero
   pasan el 22 % de las veces por azar. Y en campañas de 6 leads al mes ninguna estadística avisa a tiempo: ahí lo que
   protege es comprobar cada día que el formulario y el teléfono funcionan.
3. **Los fallos más caros no se ven desde las métricas de campaña:** el lead que no llega al cliente, el teléfono que nadie
   coge, la campaña pausada y olvidada, la tarjeta rechazada. La v1 fallaba 10 de 26 casos de este tipo; ahora son el examen
   de aceptación.
4. **Ninguna herramienta analizada cruza la cuenta con el CRM, la web, el SEO y la ficha del negocio** (02, 03, 10). Esa es
   la ventaja posible. **Pero no sabemos en cuántas de las 25 cuentas existen esos cruces:** nadie ha contado cuántas tienen
   el CRM con etapas marcadas o la landing en la web que rastreamos.
5. **El acceso a la API parece más fácil de lo que creíamos** (sin token de desarrollador; subida de leads por otra API).
   Es lo que dice la documentación de septiembre de 2026; **nadie lo ha probado**. Media hora lo confirma.

**Lo que cambia respecto a la v1**

| La v1 decía | La v2 dice |
|---|---|
| 120 capacidades | El número no es un activo. Unas 150 por dentro; **12-15 tipos de aviso** a la vista y cinco pantallas |
| Si la medición no aprueba, el agente calla | Tres estados (rota, dudosa, sana): nunca calla lo que es cierto sin la conversión |
| Todo cuelga del «CPA objetivo» | Todo cuelga de un **acuerdo de objetivos por cliente**: coste máximo por lead calculado desde el margen, capacidad del cliente y calendario |
| Coste por venta por término; el sector entero como referencia; en meses sabremos qué funciona | Por campaña y servicio, donde el cliente marque sus leads; el sector solo con 3 o más cuentas; algo útil en uno o dos años |
| Solo lectura durante cinco fases | Solo lectura, pero con salida lista para pegar y cierre automático; y dos decisiones tuyas adelantadas |
| Primero medición y diagnóstico | Primero lo que no se recupera después y lo que quita trabajo la primera semana |

**Qué construiríamos** [opinión]

1. **Un acuerdo de objetivos por cliente** y un inventario de qué datos hay en cada cuenta. Sin código.
2. **Un almacén propio** con lo que Google borra o no guarda, y desde el primer día la captura del identificador de clic.
3. **Un puesto de trabajo para Eury**: pantalla Cartera (las 25 cuentas de un vistazo), pantalla Hoy (como mucho 2
   interrupciones al día y 5 decisiones por la mañana), lote semanal de términos y guion de revisión de cuenta.
4. **Un vigilante de hechos**: pago, rechazos, web, formulario, entrega del lead, llamadas, pausas olvidadas.
5. **Un diagnóstico con el porqué**, que dice también lo que descartó y lo que no pudo mirar. Antes de avisar, dos semanas
   en sombra.
6. **Calidad del lead y previsión**, donde haya datos; y lo estadístico entre cuentas, al final.

**Para qué** [pregunta abierta]. Con unos 200 € de cuota media por cuenta, este módulo solo se justifica si mueve uno de
cuatro números: horas por cuenta, cuentas por gestor, bajas al año o ingreso por cuenta. Hoy no hay línea base de ninguno.

**Por qué puede ser mejor que Optmyzr, Adalysis, Opteo y TrueClicks** [hipótesis de producto, no hecho: compara nuestro
objetivo con su presente]. Conoce el negocio (objetivo, capacidad, zona, lo que el cliente no hace), ve fuera de Google Ads
(web, formulario, CRM, ficha), da una alerta por causa con lo descartado, y dice «no lo sé» cuando no lo sabe. No será
mejor en lo que ellas ya hacen bien y barato: por eso la parte de términos se construye delgada.

**Las ocho decisiones que más pesan** (las 28, con recomendación, en el apartado 13.1)

| # | Decisión | Mi recomendación |
|---|---|---|
| 1 | Probar el acceso: crear el proyecto de Google Cloud y leer una cuenta | Esta semana |
| 2 | ¿Qué número de agencia perseguimos? | Horas por cuenta primero; bajas después |
| 3 | Medir una semana real de Eury e inventariar las 25 cuentas | Antes de escribir código |
| 6 | Pactar un objetivo por cliente (coste máximo por lead, presupuesto, capacidad) | Empezar por los clientes principales; provisional en el resto |
| 8 | Capturar ya el identificador de clic y la etapa del lead (necesita permiso de cada cliente y consulta legal) | Sí: es lo único que no se puede recuperar después |
| 9 | Aplicar con un clic las negativas que Eury apruebe | Sí, al empezar el paso de términos |
| 10 | Pausa de emergencia automática si la página de destino está caída | Sí, solo en ese caso |
| 17-18 | ¿Quién hace de sénior y quién cubre a Eury? | Tú a corto plazo; nombrar suplente |

---

## 1. Cómo trabaja el mejor consultor del mundo

### 1.1 Los principios en los que casi todos coinciden

| # | Principio | Quién lo sostiene | Qué implica para el agente |
|---|---|---|---|
| 1 | **La medición manda.** Sin conversiones correctas y con valor, la automatización optimiza lo equivocado | Vallaeys (caso «Betty»), Lolk, Ani, Rooijmans (01); todas las checklists empiezan por ahí (05) | El estado de la medición (rota, dudosa, sana) decide qué puede proponer el agente; nunca lo deja mudo (apartado 3.B) |
| 2 | **El humano define el objetivo y vigila; la máquina ejecuta** | Vallaeys («automation layering»), Rhodes (4C), Ryan (01) | El agente es nuestra capa encima de la de Google |
| 3 | **Diagnosticar la causa antes de reaccionar al síntoma** | Vallaeys: bajar pujas porque caen las conversiones cuando la causa era la pasarela rota (01) | Árbol de causa raíz obligatorio antes de proponer |
| 4 | **Separar marca de no marca** | Lolk, Ani, Geddes, Finn; solo el 3 % usa exclusión de marca en PMax (01) | Clasificar todo el tráfico en marca, genérico y competencia |
| 5 | **Volumen suficiente por campaña; consolidar antes que fragmentar** | Google, Lolk, smec, Optmyzr (01, 09) | Detectar campañas con datos insuficientes y proponer fusión |
| 6 | **No fiarse de las cifras de la plataforma sin cruzarlas con el negocio** | Lolk, Ryan, Ani (01) | Conciliación diaria Ads frente a CRM |
| 7 | **Ad Strength y nivel de optimización no son objetivos** | Optmyzr (1M+ anuncios sin correlación), Google mismo sobre el QS (01, 06) | No perseguir notas; medir resultado |
| 8 | **Agentes: solo lectura, luego sugerencias, luego acción con aprobación y registro** | Rooijmans, Wenner, Vallaeys, Williams, Leake (01, 07) | Patrón del apartado 6 |
| 9 | **El objetivo lo pone el negocio, no la plataforma**: margen, capacidad y calendario antes que cualquier CPA | Rooijmans («maximiza tu gasto, no tu beneficio»; el CPA que el negocio acepta; 01, 07); añadido en la revisión por el consultor de negocio | Acuerdo de objetivos por cliente (apartado 2) |

### 1.2 Donde no se ponen de acuerdo (y qué decidimos)

| Tema | Posturas | Nuestra decisión [opinión] |
|---|---|---|
| **Performance Max en leads** | A favor con matices: Gales, Hopkins. En contra o con cautela: Williams («nunca peor que en 2025»), Rooijmans («maximiza tu gasto, no tu beneficio»), Lolk (01) | No recomendar PMax de leads hasta que Search convierta, haya ≥30 leads cualificados al mes y la conversión venga del CRM (Ani, ppc.io; 01, 05). El agente lo trata como «segunda fase» y audita marca, canales y URL. Los 30 al mes son criterio de expertos, no un mínimo de Google. **Una PMax heredada que funciona se audita y se compara; no se desmonta por regla** |
| **AI Max** | Google: +14 % conversiones (y +27 % en campañas de exacta y frase). smec (250+ campañas): +13 % de valor, CPA +16 %, ROAS mediano 0 % con rango de +42 % a −35 %. Geddes: se apunta conversiones de tus exactas (01, 07, 09b) | Los informes internos se contradicen (el 03 habla de «ROAS ~35 % menor»; es el extremo del rango, no la mediana). Postura: nunca por defecto; solo como experimento 50/50 en no marca rentable y no limitada por presupuesto, midiendo lead cualificado |
| **Concordancia amplia** | Google la recomienda; Optmyzr 2023: exacta gana en ROAS en el 72,5 % de cuentas (01) | Amplia para descubrir, con negativas y conversión de calidad; exacta como grupo de control. En cuentas pequeñas, frase y exacta primero |
| **Poner objetivo (tCPA/tROAS) o no** | Optmyzr 2024: los objetivos empeoran más veces que mejoran. smec: el objetivo es una barandilla (01, 09b) | Desde el 17 ago 2026 el objetivo es un mando de volumen fiable: poner el que el negocio puede pagar (el CPL máximo del apartado 2.2), no el que «pide Google» (caso Rooijmans: bajar el tCPA de 300 a 220 hundió los leads de 20-30 a 6; 07) |
| **¿Cambiar presupuesto u objetivo reinicia el aprendizaje?** | Google: no dispara el estado «Aprendiendo» (09). Practicantes: cada cambio grande desestabiliza (05, 08) | Ambas son ciertas: no cambia el estado formal, pero el rendimiento oscila. Regla: cambios ≤ ±20 %, uno cada 10-14 días, evaluar tras 2 ciclos de conversión o 2 semanas |
| **Fijar titulares (pinning)** | Adalysis (5.900 cuentas): más fijación, más conversión. Optmyzr: fijar todo empeora (01) | Datos de proveedor contradictorios. Fijación parcial (servicio y ciudad en posición 1) y medir; obligatoria en sectores regulados |
| **Test de anuncios** | Geddes: conversiones por impresión. Röttgerding: el 55-81 % de tests entre anuncios idénticos sale «significativo» alguna vez si miras a diario (01) | Conversiones por impresión con método bayesiano y horizonte fijo; nunca «95 % de confianza» mirado cada día. En la mayoría de estas cuentas no hay volumen para testar: mejor no testar que testar mal (apartado 5.6) |
| **Negativas: por números o por intención** | Rooijmans clásico (>60 clics, >5 €, <0,5 conv. en 90 días) frente a Rooijmans 2026 (juez de intención con IA que evita quemar 7.000 $ esperando clics) (01) | Las dos, combinadas: la intención fija el punto de partida y los datos lo corrigen (apartado 5.3) |
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
| Objetivo | Un CPL orientativo | El coste máximo que el negocio puede pagar, con su capacidad y su calendario | Acuerdo de objetivos por cliente, con fórmula y versiones (apartado 2.2) |
| Métrica rectora | Coste por lead de Google | Coste por lead cualificado y por venta | Lo mismo por campaña y servicio donde el CRM lo permita; lead válido donde no |
| Términos | Añadir los que convierten barato, pausar los caros «desde hace tiempo» | Umbral ligado al CPA objetivo, n-gramas, intención, conflictos | Cascada reglas → embeddings → IA pequeña → estadística |
| Medición | Se da por buena | Se audita primero y siempre | Examen diario de medición y conciliación con el CRM |
| Cuota de impresiones y subastas | No se dominan | Separa presupuesto de ranking y de competencia | Descomposición automática del KPI |
| Landing y nivel de calidad | Se empieza a mirar | QS ponderado por impresiones y gasto; sintonía por término | Sintonía con embeddings, velocidad, cambios en la web |
| «Sin convertir» | Sensación tras 2-3 días | Sabe cuándo es ruido | Probabilidad sobre clics y causa adjunta; en cuentas pequeñas, prueba activa del formulario en vez de estadística |
| Llamadas | No se miran | Perdidas, duración, horario | Familia propia (LLA), diaria |
| Cambios de Google | Se descubren tarde | Los conoce y los fecha | Calendario de cambios consultado por el diagnóstico |
| Memoria | En la cabeza de Eury | Registro de cambios por cuenta | Expediente de cuenta, reglas del cliente y resultado de las acciones R2 y R3 |

Dato de contexto: con 25 cuentas, solo la parte semanal hecha a mano son 15-30 horas (estimación propia del informe 05, sin
fuente publicada), coherente con los «3 días de revisión» del brief. No sirve para prometer ahorro: antes de construir hay que medir una
semana real de Eury (apartado 13.2). Las agencias encuestadas llevan de media 35 clientes por
gestor y el 55 % hace el control de presupuesto a mano (07).

---

## 2. Antes que cualquier regla: el negocio del cliente y el de la agencia

Apartado nuevo en la v2. La v1 diseñaba un excelente **auditor de cuentas** y lo llamaba «gestor que conoce el negocio»: de
120 capacidades, unas 110 miraban dentro de la cuenta, el negocio del cliente entraba como dato auxiliar y el de la agencia
no entraba (crítica de R3, aceptada). Todo lo que sigue cuelga de lo que se fija aquí.

### 2.1 El problema: todos los umbrales colgaban de un número que nadie había definido

El catálogo expresa sus umbrales «en múltiplos del CPA objetivo del cliente». En la v1 ese objetivo era una frase en la
lista de decisiones («derivarlo del valor del lead; revisión trimestral»). Sin un objetivo pactado, lo pondría el gestor a
ojo, y todo lo demás heredaría el error. Además, lo que más mueve el resultado de un negocio local después del clic
(cuánto tarda en contestar, si coge el teléfono, si tiene la agenda llena) ocupaba una sola fila mensual.

### 2.2 El acuerdo de objetivos por cliente (NEG-01)

Un registro con versiones, uno por cliente, que se pacta al dar de alta y se revisa cuando algo cambia.

| Campo | Qué contiene |
|---|---|
| Resultado que compra el cliente | Ventas nuevas al mes, citas, o leads cualificados: lo más abajo del embudo que el cliente sea capaz de informar |
| Economía por servicio | Ticket medio, margen bruto, recurrencia (valor a 12 meses), tasa de cierre de lead a venta |
| **CPL máximo de medios** | Calculado con la fórmula de abajo, no escrito a mano |
| Banda de presupuesto de medios | Mínimo, habitual y máximo autorizado sin preguntar. El gestor **sí** la ve (la v1 la confundía con la cuota de agencia, que solo ven administradores) |
| Capacidad | Leads o citas por semana que puede atender, por servicio |
| Calendario comercial | Cierres, picos, temporadas, servicios que se apagan |
| Qué es un lead válido y uno cualificado | Y quién lo marca |
| Reglas del cliente | Lo que no hace, términos y campañas que no se tocan, separaciones con motivo de negocio |
| Quién lo pactó y cuándo | Con disparadores de revisión: cambio de precios o de equipo comercial, tasa de cierre que se desvía más de un tercio, dos meses fuera de banda, o seis meses sin revisar |
| Calidad de cada dato | «Medido en CRM», «declarado por el cliente» o «supuesto de sector». El agente la enseña junto a cada cifra |

**Fórmula del coste máximo por lead:**

```
Valor del lead       = ticket × margen bruto × tasa de cierre × factor de recurrencia
CPL máximo de medios = Valor del lead × % del margen que el cliente acepta invertir en captar
                       − cuota de agencia repartida por lead
```

**Ejemplo.** Reforma de 8.000 €, margen del 25 %, cierra 1 de cada 10 leads, sin recurrencia: el lead vale 200 €. El cliente
acepta invertir el 30 % de ese margen en captar: 60 €. Con una cuota de 200 € al mes y 20 leads, la agencia pesa 10 € por
lead: **CPL máximo de medios, 50 €**.

La v1 decía (LEAD-04) que del valor del lead «sale el CPA máximo». Habría dado 200 €: el punto de equilibrio, con el que el
cliente trabaja gratis. Era un error de concepto.

Cuatro precisiones [criterio propio]:

1. La tasa de cierre tiene que ser la del **mismo tipo de lead** que se cuenta. Si el objetivo es por lead cualificado, la
   de cualificado a venta; si es por lead bruto, la de lead bruto a venta.
2. En servicios con recurrencia (dental, fisioterapia, estética, mantenimiento) el primer ticket infravalora al cliente
   varias veces; en reformas, un servicio distinto cambia el valor por diez. Por eso la economía es **por servicio**.
3. Restar la cuota por lead es correcto, pero es un número que se mueve (más leads, menos cuota por lead). Se recalcula con
   el volumen de los últimos 90 días y se enseña aparte.
4. Muchos clientes no sabrán su margen ni su tasa de cierre. Entonces el acuerdo arranca con un **objetivo provisional**
   (la mediana del CPL de los últimos 90 días), marcado como «supuesto», y el agente lo dice cada vez que lo usa. Un
   objetivo provisional visible es mejor que uno inventado con apariencia de exacto.

### 2.3 Capacidad y lo que pasa después del clic

- **Capacidad como puerta (NEG-02).** El agente no propone subir presupuesto sin saber si el cliente puede atender más
  leads. Con la agenda llena, la propuesta correcta es bajar o pausar ese servicio y decirlo, no subir porque «hay cuota
  perdida y el CPL es bueno». El semáforo de escalado (ESC-03) pasa a tener tres luces: medición, calidad del lead y
  capacidad.
- **Respuesta al lead (NEG-03), semanal.** Mediana de minutos hasta el primer contacto, leads sin contactar a las 24 horas,
  llamadas perdidas en horario de anuncios (LLA-01), citas no presentadas. Es la primera causa de «los leads son malos».
  Cuando el problema está aquí, el hallazgo va primero: «la campaña funciona; se pierden N leads al mes después del clic».
- **Tasa de cierre (NEG-04).** Si cae sin que cambie la mezcla de términos, la causa es comercial, no de campaña. Con dos
  ventas al mes esto solo se ve a escala de trimestre, y hay que decirlo.
- **Cierres y calendario (EST-10).** Agosto, fiestas locales, baja del autónomo: el anuncio sigue y nadie contesta.
- **El dato que falta (NEG-05).** Casi todo esto depende de que el cliente diga qué leads eran buenos. Donde no marca
  etapas en el CRM, la vía realista es una lista semanal («de estos 7 contactos, ¿cuáles eran buenos?») que envía una
  persona. Es un proyecto de **hábitos del cliente**, no de software.

### 2.4 El árbitro: leads totales del negocio

Con cuentas de este tamaño no hay modelo de atribución que valga. El sustituto (NEG-06) son los **leads y ventas totales
del CRM, de todas las fuentes, y el coste de captación combinado**: inversión en medios más cuota, dividido por clientes
nuevos. Si las conversiones de Google suben y los leads totales no, se han movido leads de un sitio a otro, no se han
añadido. Este indicador va por encima de cualquier cifra de plataforma en el tablero y en el informe.

De ahí salen las reglas de honestidad que la v1 dejaba a medias:

- **Marca:** es gasto defensivo, no captación, y se informa siempre aparte (regla única, CUO-06).
- **Performance Max y AI Max:** lo que traen sin término visible se cuenta en una columna propia, «automático sin
  desglose», con la advertencia de que no está probado como incremental (LEAD-01).
- **Ficha de Google:** las «acciones locales» (cómo llegar, llamar desde la ficha) entran como conversión en PMax y en
  campañas con recursos de ubicación. Inflan resultados con leads que la ficha ya traía gratis: nunca primarias (MED-01).
- **Conversiones tras ver** (Demand Gen, YouTube): nunca primarias.
- **Benchmark:** solo con tráfico de no marca (APR-04).

### 2.5 Los cuatro números de la agencia

La cuenta que la v1 no hacía (R3). Con las cifras del brief (más de 5.000 € al mes, más de 25 cuentas) la cuota media ronda
los **200 € por cuenta y mes**. Si la revisión manual ocupa los «3 días» del brief, son del orden de 60-120 horas al mes
[estimación sin fuente], es decir, unos 40-80 € de ingreso por hora antes de cualquier otro coste. Construir un módulo de
este tamaño para proteger 5.000 € al mes solo tiene sentido si mueve alguno de estos cuatro números:

| Número | Qué significaría mejorarlo |
|---|---|
| **Horas por cuenta y mes** | El mismo servicio con menos tiempo |
| **Cuentas por gestor** | De unas 25 a 50 o más sin contratar |
| **Bajas al año** | Retener dos cuentas al año ya son unos 5.000 € |
| **Ingreso medio por cuenta** | Un nivel de servicio superior (calidad del lead, informe de ventas) o venta adicional (web, SEO, CRM) |

**Hoy no existe la línea base de ninguno.** Antes de escribir código hay que medir una semana real de Eury (qué hace, en
qué cuentas, cuánto tarda) y anotar las bajas del último año. Sin eso no se podrá demostrar que el módulo valió la pena ni
decidir qué construir primero (apartado 13.2). Y falta una decisión de Enric: **cuál de los cuatro persigue**, porque el
orden cambia (apartado 13.1, decisión 2).

Las capacidades que lo sostienen son la familia AGE (apartado 3.Q). Matiz de arquitectura [opinión]: son de la agencia
entera, no de Google Ads; viven en el núcleo y el módulo aporta señales.

### 2.6 Qué seguirá siendo nuestro dentro de tres años

Google absorbe cada año más trabajo del gestor y enseña menos datos. Conviene saber qué parte del catálogo caduca (R3):

| Vida corta (Google lo absorbe o lo oculta) | Defendible |
|---|---|
| Términos y negativas: cada año se ve menos término y hay menos control | El dato propio: lead cualificado y venta del CRM, limpio y devuelto a Google |
| Horario, dispositivo y ajustes de puja | El objetivo y las restricciones del negocio (margen, capacidad, calendario, ley) |
| Tests y redacción de anuncios: Google genera y rota | Diagnóstico con causas de fuera de Google (web, CRM, ficha, otros canales) |
| Nivel de calidad y estructura fina | Auditor independiente de la automatización: Google cobra por gasto, no por beneficio del cliente |
| Recomendaciones de un clic (el asistente de Google ya las da gratis) | Reparto entre canales, previsión y relación con el cliente |

Aproximadamente un tercio del catálogo está en la columna izquierda. **No por eso se deja de construir** [decisión propia,
resolviendo un desacuerdo entre revisores]: R1 y R2 tienen razón en que los términos son hoy el trabajo que más horas se
lleva y el primer ahorro que el equipo notará, y sin adopción no hay nada que defender; R3 tiene razón en que no merece una
inversión larga. La salida es construir la parte de términos **delgada** (reglas, ficha, embeddings y un juez pequeño; sin
el bayesiano entre cuentas) y empezar **desde el primer día** lo que no es retroactivo: capturar el identificador de clic,
pactar los acuerdos de objetivos y conseguir que el cliente devuelva el dato.

---

## 3. Catálogo completo de capacidades del agente

**Cómo leer las tablas**

- **Frec.:** H cada hora · D diaria · S semanal · M mensual · T trimestral · E por evento.
- **Motor:** C código (reglas y estadística, sin IA) · E embeddings · Hk Haiku · So Sonnet · Op Opus · Fb Fable. Cuando
  aparecen dos, el primero decide y el segundo solo redacta o juzga lo ambiguo.
- **Riesgo de la acción propuesta** (definición corregida en la v2; antes R1 incluía cambios que mueven volumen):
  - **R0** aviso o tarea; no toca la cuenta.
  - **R1** cambio pequeño, reversible y **que no mueve volumen de golpe**: negativa exacta, etiqueta, texto, término protegido.
  - **R2** cambio que mueve volumen o afecta a más de una entidad: pausa, presupuesto dentro de la banda acordada, redes,
    tipo de presencia, negativa de frase.
  - **R3** cambio que altera lo que aprende el algoritmo (objetivo, estrategia, conversión, estructura): siempre con una
    persona y, mientras no haya otro sénior, con Enric.
  - **RC** decisión que es **del cliente**, no del gestor (más inversión, modo de consentimiento, sus propios procesos): el
    agente prepara el argumento, no un botón.
- **Umbrales:** todos son valores de partida, editables en el panel por defecto y por cliente (regla del proyecto). Donde
  una fuente da «150 clics», aquí se reescribe en múltiplos del CPL máximo del cliente (apartado 2.2), porque en una cuenta
  local 150 clics pueden ser 300 € (08).
- **Recursos de la API:** nombres de la versión v26 según el informe 04. Los que aportó un revisor de memoria van marcados
  «por comprobar en v26».
- **«rev. R1/R2/R3»** en la última columna: la fila se cambió por la crítica de ese revisor (apartado 15).

**Cuántas son y cuántas se ven.** Son unas 150 capacidades en 18 familias. La cifra **no es un activo**: cada capacidad es
una fuente posible de avisos, y un catálogo largo es un pasivo para quien revisa la cola. Tres reglas lo acotan:

1. **Como mucho 12-15 tipos de hallazgo visibles** en el lanzamiento (apartado 7). El resto trabaja por dentro, como
   evidencia de un hallazgo o dentro del guion de revisión de cuenta.
2. **Apagadas por defecto en cuentas con menos de 15 leads al mes** (probablemente la mayoría; lo dirá el inventario): PRO-04,
   DIA-03, los porcentajes de DIA-02, TER-09, TER-10, PUJ-05, PUJ-07, LAN-02, LAN-07, ANU-02, ANU-04, GOO-02, ESC-06 y
   APR-05. Se encienden por cuenta cuando hay volumen para que digan algo.
3. **Aparcadas** (no se construyen hasta que haya un motivo concreto): TER-08 (pensada para cuentas grandes con puja
   manual), ANU-03 (un grupo local no reúne 7 conversiones por anuncio en meses; queda el método del apartado 5.6 para no
   hacer tests falsos), EST-08, ESC-08, LEAD-07 y GOO-08 fuera de AI Max.

**Datos de la ficha con fecha.** Media docena de capacidades (TER-04, EST-02, ANU-07, PUJ-07, LEAD-06, el tope de
presupuesto) heredan los errores de una ficha que nadie mantenga. Cada dato de la ficha que usa Ads lleva su **fecha de
última confirmación**; con más de 6 meses, el hallazgo baja a «confirmar con el responsable» (NEG-07).

No se construyen todas a la vez: el orden propuesto está en el apartado 13.2. El orden de las familias aquí es lógico (el
negocio, luego la medición, luego lo demás), no cronológico.

### 3.A Negocio del cliente (de aquí cuelgan todos los umbrales)

Familia nueva en la v2 (crítica de R3, aceptada). El detalle y la fórmula están en el apartado 2.

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| NEG-01 ★ | **Acuerdo de objetivos por cliente**, registro con versiones | Ficha y contrato (núcleo); CRM; lo que declare el cliente | Resultado que compra, economía por servicio, **CPL máximo calculado** (apartado 2.2), banda de presupuesto de medios, capacidad, calendario comercial, quién lo pactó y cuándo. Cada cifra con su calidad: «medido en CRM», «declarado por el cliente» o «supuesto de sector». Disparadores de revisión: cambio de precios o de equipo comercial, tasa de cierre que se desvía más de un tercio, dos meses fuera de banda, seis meses sin revisar | E + T | C | Borrador de acuerdo; aviso de revisión | R0 | R3 §1.2 |
| NEG-02 ★ | **Capacidad del cliente como puerta de escalado** | Capacidad por servicio del acuerdo; agenda o lista de espera si el CRM la da; lo que diga el responsable | Leads o citas por semana que puede atender frente a los que recibe. Tercera luz de ESC-03 | S | C | Con capacidad llena: bajar o pausar ese servicio y decirlo; nunca subir | R0 / R2 | R3 §1.2 |
| NEG-03 ★ | **Respuesta al lead** (sustituye a LEAD-09) | CRM: hora del lead y del primer contacto; LLA-01; citas | Mediana de minutos hasta el primer contacto, % de leads sin contactar a las 24 h, llamadas perdidas en horario de anuncios, citas no presentadas. Si el problema está aquí, el hallazgo va primero: «la campaña funciona; se pierden N leads al mes después del clic». Entra en el árbol como sub-causa de «CR ↓» y de «los leads son malos» | S | C | Aviso al responsable de la cuenta; oportunidad (AGE-03) | R0 | R3 §1.2, R1 (F19) |
| NEG-04 | **Tasa de cierre vigilada** | Ventas y etapas del CRM; mezcla de términos | Si la tasa de cierre cae y la mezcla de términos no ha cambiado, la causa es comercial (precio, comercial nuevo, oferta), no de campaña. Límite: con 2 ventas al mes solo se ve a escala de trimestre | T | C | Aviso al responsable; revisar el acuerdo | R0 | R3 §1.2 |
| NEG-05 ★ | **Retorno del dato desde el cliente** donde nadie marca etapas | Leads de la semana | Lista semanal «de estos 7 contactos, ¿cuáles eran buenos?». Primera versión: **borrador que envía una persona** por el canal que el cliente ya usa. Una versión con botones para el cliente es un mensaje a un cliente real: línea roja, decisión de Enric y diseño propio | S | C → So | Borrador | R0 | R3 §1.2, R2 §4.3 |
| NEG-06 ★ | **Leads totales del negocio y coste de captación combinado** | Leads y ventas del CRM de todas las fuentes; inversión en medios y cuota (esta, solo administradores) | Es el árbitro: si las conversiones de Google suben y los leads totales no, es canibalización. Coste combinado = (inversión + cuota) ÷ clientes nuevos. Va por encima de cualquier cifra de plataforma en tablero e informe | M | C | Indicador rector | R0 | R3 §4.4 |
| NEG-07 | **Frescura de la ficha** | Fecha de última confirmación de servicios, zona, horario, presupuesto y lo que el cliente no hace | Más de 6 meses sin confirmar: los hallazgos que dependen de ese dato bajan a «confirmar con el responsable» | M | C | Tarea de confirmación | R0 | R1 §5.3 |

### 3.B Medición y salud de la cuenta (lo primero, siempre)

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| MED-01 | **Examen de medición** con **tres estados** por cuenta (rota, dudosa, sana; ver debajo de la tabla), no una nota con aprobado | `conversion_action`, `campaign_conversion_goal`, `customer.auto_tagging_enabled` | Cada acción primaria es un lead distinto y ninguna cuenta dos veces el mismo evento (formulario, llamada desde el anuncio, llamada desde la web y WhatsApp pueden ser cuatro primarias legítimas); leads con recuento «Una»; una sola fuente primaria por evento. Las acciones creadas solas o heredadas (campañas Smart, «acciones locales» de la ficha de Google, eventos de GA4 importados automáticamente) y las conversiones tras ver nunca son primarias sin decisión expresa. El clic en teléfono o WhatsApp solo deja de ser primaria **cuando existe una señal mejor del mismo evento** | D + E | C | Estado y lista de arreglos. El estado limita **solo lo que depende de la conversión** (pujas, objetivos, presupuesto, escalado, pausas por CPA); nunca calla lo que es cierto sin ella (zona, redes, URL rotas, rechazos, términos fuera de servicio, ritmo de gasto) | R0 (arreglos: R3, por tandas) | 05 §2.2, 06 §1 · P01 · rev. R1, R2, R3 |
| MED-02 ★ | **Conciliación Ads ↔ CRM** por tipo de acción (formularios con formularios, llamadas con llamadas) | `metrics.conversions_by_conversion_date` por acción; leads de GoHighLevel (canal, UTM, página) | Prueba de recuento (¿la diferencia supera lo que da el azar con este volumen?), no un cociente fijo: con 10 leads a la semana, 12 frente a 10 no es señal. **Ads > CRM:** primero comprobar la entrega del lead (webhook caído, correo en spam): es urgente, es un lead pagado que el cliente no ha visto; solo después, doble conteo. **Ads < CRM:** consentimiento o etiqueta. Límite: la atribución de canal del CRM pierde llamadas | D (cuenta) · S (campaña) | C | Aviso con la hipótesis en ese orden y la prueba a hacer | R0 | 06 §1.7-1.8 · X02 · rev. R1 |
| MED-03 ★ | **Medición rota, entrega rota o caída real** | Conversiones por acción; sesiones GA4; leads del CRM **de todos los canales**; llamadas; registro de cambios de la web y vigilancia de caídas (módulo SEO, vía núcleo) | Tres firmas. (a) Ads a cero y CRM normal: etiqueta. (b) Ads normal y CRM a cero: entrega. (c) Los dos a cero con sesiones normales: mirar los leads de otros canales y las llamadas; si también están a cero, formulario o web rotos; si siguen llegando, oferta o tráfico. Siempre con el filtro de recuento de PRO-03 | D; cada hora solo a nivel de cuenta y en horario de anuncios | C → So | Tarea a web; propuesta de exclusión de datos (PUJ-08); no tocar pujas | R0 | 05 §4.3, 10 §4.1 · P01 · rev. R1 |
| MED-04 | **Doble conteo** | Conversiones diarias por acción; clics | Dos acciones primarias con correlación diaria >0,9 y cociente ≈1; conversiones ≈ clics; tasa de conversión muy por encima de la referencia **de su tipo** (se excluyen marca, campañas de llamada y urgencias, donde un 30-40 % es normal) | S + E (tras un cambio en la web) | C | Pasar una a secundaria | R3 | 06 §1.8, 02 §3.3 · rev. R1 |
| MED-05 ★ | **Fuga del identificador de clic** | Leads del CRM con y sin identificador (gclid, gbraid, wbraid; el campo admite también los de otras plataformas) | >20 % de leads de Google sin identificador; ejecuciones «Skipped» del flujo del CRM. Se complementa con MED-15, que lo ve antes | D | C | Tarea a web: script que guarda los identificadores y los inyecta en formularios e iframes. **Va al principio del proyecto** (apartado 13.2): lo que no se captura hoy no se recupera | R0 | 06 §1.5, 10 §2.4 · rev. R1, R3 |
| MED-06 | **Curva de madurez de conversiones** por cuenta y acción | `segments.conversion_lag_bucket`; fecha del lead en CRM frente a fecha del clic | F(d) = fracción de conversiones ya registradas d días después del clic. Importa sobre todo para el **lead cualificado y la venta** (días o semanas); en formulario y llamada de negocio local la conversión suele caer en la misma visita. Se mide por cuenta en vez de suponerlo; solo donde F(1) < 0,85 se marcan días «inmaduros» (apartado 5.4) | S | C | Marca días inmaduros en pantalla y en las reglas que usan esa acción | R0 | 05 §5.4, 08 §3.3 · rev. R1 |
| MED-07 | **Consentimiento** (modo básico o avanzado, cambio de banner) | Rastreador de la web; MED-02 | Detectar el modo leyendo la etiqueta; un cambio de banner se anota como evento. Sin 700 clics en 7 días por país y dominio no hay modelado [umbral citado en 04 y 06; el 09b no lo encontró]. Comprobación informativa del banner (¿se dispara algo antes de aceptar?, ¿rechazar está al mismo nivel?). **Pasar de básico a avanzado es una decisión legal del cliente, no un arreglo** | E + M | C | Informar del coste en datos de cada opción; la decisión es del cliente (RC) | R0 / RC | 04 §4.5, 06 §1.7 · rev. R3 |
| MED-08 | **Umbral de duración de las llamadas** (el resto de lo relativo a llamadas está en la familia LLA) | Detalle de llamadas (ver LLA-01); llamadas del CRM | Umbral de duración fijado con datos: duración de las llamadas que acaban en cita (por defecto Google usa 60 s) | M | C | Subir o bajar el umbral | R1 | 06 §1.2, §5.2 |
| MED-09 | **WhatsApp bien medido** | Acciones de conversión (categoría `MESSAGE_LEAD`); conversaciones en el CRM | Objetivo: conversación, lead cualificado o venta del CRM como primaria y el clic como secundaria. **Mientras esa señal no exista, el clic se mantiene como primaria** y el hallazgo es «construir la señal mejor», no «degradar»: degradarlo sin sustituto deja a Smart Bidding optimizando solo formularios y hunde el volumen | T + E | C | Construir la señal; después, cambio de una acción cada vez, con la nueva 2-4 semanas en secundaria para comparar recuentos | R3 | 10 §5.1 · rev. R1 |
| MED-10 ★ | **Subida de leads cualificados y ventas a Google** con conciliador | CRM (etapa, identificador de clic, correo y teléfono con hash, **señal de consentimiento**); Data Manager API | Subir por cuenta, nunca lotes multicuenta; nombre de acción único por cuenta; filtro antispam antes (no se puede retirar una conversión); retraso de 24-48 h. **No se sube a quien rechazó el consentimiento**, y se cuentan aparte. Conciliador: aceptadas frente a contadas, alerta si <85 %. **Desactivada por defecto en clientes de sector sensible** (apartado 12.3) | D | C | Activar por cliente tras decisión de Enric, autorización del cliente y revisión legal | R3 | 09b §1, 10 §1.2-1.3 · X02 · rev. R3 |
| MED-11 | **Prueba de punta a punta** hecha por una persona, y etiqueta presente en todas las landings | Rastreador; tarea humana guiada | Formulario y llamada de prueba; la página de gracias dispara una vez. Es la versión completa y manual de MED-18 | T + E | C | Tarea con lista de pasos | R0 | 05 M15-M16 |
| MED-12 | **Salud y acceso de la cuenta** | `customer.status`, usuarios con acceso, `campaign.primary_status_reasons`, presupuesto de cuenta, fechas de fin; estado de verificación del anunciante [recurso por comprobar en v26] | La API no tiene recurso de «alertas de cuenta»: el corte se infiere con **impresiones por hora de toda la cuenta en horario de servicio** (3-4 horas a cero frente a su línea base), no esperando al «gasto a cero» del día. Usuarios desconocidos o de agencias anteriores (también es señal de riesgo de baja: AGE-02). El aviso **antes** del corte solo lo da MED-14 | H (horario de anuncios) | C | Aviso inmediato | R0 | 04 §2.13, 05 §2.1 · P03 · rev. R1 |
| MED-13 | **Formularios de Google sin entregar** | Envíos de recursos de formulario en Ads; leads recibidos en el CRM por esa vía | Cualquier diferencia entre enviados y recibidos. Los leads de un formulario de Google dejan de poder descargarse a los 30 días [según R1; comprobar en la ayuda de Google] | D | C | Aviso urgente: es un lead pagado que el cliente no ha visto | R0 | R1 (F2) |
| MED-14 | **Avisos de Google por correo** (pago rechazado, verificación del anunciante con fecha límite, aviso de suspensión, rechazos) | Un buzón de la agencia dado de alta como usuario con notificaciones en cada cuenta; lo lee el agente de correo que ya existe | Clasificar cada correo de Google por tipo y urgencia. Es el único camino que avisa **antes** del corte. Requiere decisión de Enric y, donde la cuenta es del cliente, su permiso | E | C → Hk | Aviso inmediato con la fecha límite | R0 | R1 (F3) |
| MED-15 | **El identificador de clic sobrevive al viaje** | Rastreador: cada URL final pedida con un identificador de prueba; plantilla de seguimiento y sufijo de la cuenta | El identificador y los UTM llegan a la página final tras las redirecciones; plantilla y sufijo coherentes en toda la cuenta, sin UTM escritas a mano distintas por anuncio | S + E | C | Tarea a web; corregir plantilla | R0 / R1 | R1 (F7) |
| MED-16 | **Cambio en las etiquetas o en el formulario** | Rastreador: versión publicada del contenedor de etiquetas [viabilidad por comprobar] y huella del marcado del formulario (identificadores, acción, campos) en cada landing con gasto | Un cambio es un **evento fechado** para el árbol, igual que el banner de cookies. Es la causa nº 1 de medición rota | D | C | Evento para el diagnóstico; lanza MED-04 y MED-18 | R0 | R1 (F8) |
| MED-17 ★ | **Latido de leads por todos los canales** | Leads del CRM de todas las fuentes (pago, orgánico, directo) | Si la web no recibe ningún formulario de ninguna fuente en un plazo anormal para ella, el formulario está roto. Es el mismo dato que alimenta «leads totales del negocio» (apartado 2.4) | D | C | Aviso; tarea a web | R0 | R1 (F12), R3 §4.4 |
| MED-18 ★ | **Prueba activa del formulario** y señales adelantadas, para las cuentas donde «días sin convertir» llega tarde | Rastreador; GA4 (sesiones e inicios de formulario por landing) | A diario, sin enviar nada: la landing carga, el formulario existe y su punto de envío responde; sesiones e inicios de formulario frente a su línea base (tienen 10-50 veces más volumen que los leads). Envío real de un lead de prueba marcado: solo donde el cliente lo acepte (crea un contacto en su CRM) | D | C | Aviso; tarea a web | R0 | R2 §6.7 |

**Los tres estados de la medición** (sustituyen a la «nota mínima» de la v1, que habría dejado mudo al agente en más de la
mitad de las cuentas; críticas R1 y R2, aceptadas):

| Estado | Cuándo | Qué puede proponer el agente |
|---|---|---|
| **Rota** | No llegan conversiones, doble conteo evidente, entrega del lead caída | Solo protección (web, gasto, rechazos) y el arreglo de medición |
| **Dudosa** | Demasiadas primarias, clic de teléfono como primaria sin señal mejor, sin conciliar con el CRM | Protección, términos por intención y por zona, higiene, ritmo de gasto. **No** escalado, **no** cambios de objetivo, **no** pausas por «no convierte» |
| **Sana** | Pasa MED-01 y concilia con el CRM | Todo |

**Plan de saneamiento.** Arreglar la medición es R3 en cada cuenta: cambia lo que aprende la puja y **hace «caer» las
conversiones del informe del cliente** (se dejan de contar clics de teléfono). Por eso: orden por nivel de cliente; 2-3
cuentas por semana como máximo; una acción cada vez; serie antigua y nueva en paralelo 4-6 semanas (la antigua como
secundaria); y un texto para el cliente **antes** del cambio («a partir del día X verá menos conversiones porque dejamos de
contar…»), como borrador que envía una persona. Sin esto, la primera consecuencia visible del módulo sería un cliente
preguntando por qué han bajado sus resultados.

### 3.C Llamadas

Familia nueva en la v2 (crítica de R1, aceptada). En negocio local, entre la mitad y tres cuartos de los leads son llamadas
[estimación de oficio de R1, sin fuente]; la v1 las despachaba en una fila mensual.

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| LLA-01 ★ | **Llamadas perdidas y duración** por franja y campaña | Detalle de llamadas de Google Ads (`call_view` en versiones anteriores: estado, duración, hora, campaña) [**por comprobar en v26**]; llamadas del CRM | Tasa de perdidas en horario de anuncios por encima de la propia línea base o del 25 %. Entra en el árbol como sub-causa de «CR ↓» | D | C | Aviso al responsable; ajustar el horario del recurso de llamada (PUJ-07) | R0 / R2 | R1 (F1) |
| LLA-02 | **Recurso de llamada bien configurado** | Recursos de llamada; teléfono y horario de la ficha y de GBP | Recurso activo, con el número de la ficha, con horario igual al de atención real y con informes de llamada activados. Número distinto del de la web o del de GBP: aviso | S | C | Corregir | R1 | R1 (F1) |
| LLA-03 ★ | **Llamadas a cero con formularios normales, y al revés** | Llamadas y formularios por día | Es la firma de un número de seguimiento caducado o mal desviado, o de un formulario roto. Con el filtro de recuento de PRO-03 | D | C | Aviso urgente | R0 | R1 (F1) |

### 3.D Protección y anomalías

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| PRO-01 | **Campaña parada o desbocada** | `campaign` por día y hora | Activa con 0 impresiones; gasto muy por encima del **mismo día de la semana** con suelo en euros (no «+140 % frente a ayer», que salta cada lunes); gasto ≥1,5× el presupuesto diario sin conversiones cuando se esperaba alguna, o acumulado de 3 días por encima de 1,3× (Google ya corta en 2×: «más de 2×» no ocurre); impresiones o clics −70 % frente al mismo día de la semana anterior | H | C | Aviso; pausa de emergencia solo si Enric la autoriza (apartado 13.1) | R0 / R2 | 01 (Lolk, Rhodes), 02 §4.2 · P04 · rev. R1, R2 |
| PRO-02 ★ | **Anomalía con línea base propia** | Serie diaria por cuenta y campaña (se descargan hasta 37 meses de histórico al dar de alta: **la línea base existe desde el día 1**); festivos de la zona del cliente; cierres del cliente (EST-10) | Mediana y MAD del mismo día de la semana (6-8 semanas) en métricas con volumen; en recuentos bajos, media y Poisson (apartado 5.5). Fuera el día en curso, los días ya marcados y los periodos especiales (Black Friday a Reyes, Semana Santa, agosto). Suelo en euros siempre | D | C | Dispara el diagnóstico (DIA-01), no un cambio | R0 | 05 §5.5, 08 §3 · P04 · rev. R1, R2 |
| PRO-03 ★ | **«Sin convertir» bien hecho** | Clics, tasa de conversión esperada (media de 8 semanas), madurez (MED-06), gasto | Regla principal **sobre clics, no sobre días**: con n clics y tasa esperada CR, lo esperado es μ = n × CR; se avisa si la probabilidad de cero es muy baja, con binomial negativa por defecto (los leads llegan a rachas). A diario solo a nivel de **cuenta**; por campaña, semanal. El umbral no es «α = 2 %» fijo: se calibra repitiendo 90 días de histórico hasta que las falsas alarmas quepan en el presupuesto de atención (apartado 5.1). En cuentas de pocos leads llega tarde por diseño: ahí protegen MED-17 y MED-18 | D (cuenta) · S (campaña) | C | Dispara el diagnóstico | R0 | 05 §5.5, 08 §3.2 · rev. R1, R2, R3 |
| PRO-04 | **Deriva lenta** (lo que un umbral diario no ve) | Series semanales de CR, CPC, CTR, CPL | CUSUM o tendencia de 4-8 semanas contra una referencia fija: −2 % diario son −25 % en dos semanas | S | C | Aviso con gráfico | R0 | 05 §5.5 |
| PRO-05 | **Rechazos y limitaciones** | `ad_group_ad.policy_summary`, política de recursos, `ad_group_criterion.approval_status` | Cualquier rechazo en entidad con gasto | D | C → So | Borrador del arreglo (texto que cumple, URL nueva) | R0 / R1 | 05 R1, 02 §1.4 · P02 |
| PRO-06 | **URL final viva** (anuncios, enlaces de sitio y URL elegidas por Google), **certificado y dominio** | Vigilancia de páginas caídas del SEO; `landing_page_view`, `expanded_landing_page_view`; caducidad de certificado y dominio | 404 o 5xx confirmado dos veces; se calcula el gasto expuesto por hora. Certificado o dominio que caducan en 14 días. Límite: solo cubre las landings que el rastreador ve (ver inventario, apartado 13.2) | H | C | Aviso; propuesta de pausa temporal | R0 / R2 | 05 L1 · P05 · rev. R1 |
| PRO-07 | **Ritmo de presupuesto** | Gasto acumulado; **presupuesto mensual de medios** del acuerdo de objetivos (NEG-01), que el gestor sí ve; `campaign_budget` | Proyección a fin de mes fuera de ±10 %. Recordar: un día puede gastar 2×, el mes 30,4×, y desde el 1 jun 2026 las campañas con días apagados gastan más en los días activos. Presupuesto agotado antes de las 14:00 | D | C | Ajuste de presupuesto diario dentro de la banda acordada | R2 | 09 §5, 10 §5.5 · A06 · rev. R2 |
| PRO-08 | **Historial de cambios guardado, vigilado y con autor clasificado** | `change_event` (30 días, con usuario y valor antes y después), `change_status` (90 días) | Guardar cada noche. Cada usuario se etiqueta como **agencia, cliente, Google o herramienta** (scripts y reglas del gestor anterior incluidos). Todo cambio de «cliente» o «Google» en entidades con gasto avisa el mismo día. Otras señales: ráfaga de cambios, usuario nuevo. Sirve además para cerrar solas las propuestas que el gestor aplica a mano (apartado 7.2). El informe 04 dice que no cubre Google Ads Editor ni negativas de la MCC; un revisor lo duda: **comprobar con una cuenta real** | D | C | Aviso; contexto para el diagnóstico | R0 | 01 §2.14, 04 §2.7, 10 §4.4 · rev. R1, R2 |
| PRO-09 ★ | **Causa común entre cuentas** | Anomalías del día de todas las cuentas | Si una fracción alta de cuentas (o de un sector, o de una zona) se desvía el mismo día: una alerta de agencia, no 15 | D | C | Aviso único | R0 | 05 §4.3 |
| PRO-10 | **Clics sin sesión** | Clics de Ads frente a sesiones GA4 y Clarity por hora y zona | Picos de clics sin sesión; la API no da las IP. Se usa como evidencia en la rama «gasto ↑ sin conversiones» y para excluir zonas; **no** como expediente de reembolso (Google casi nunca devuelve) | S | C | Exclusión de zona | R0 / R1 | 03 §3.1, 09b §3 · rev. R1 |
| PRO-11 | **Freno de emergencia fuera de nuestro servidor** | Script en la MCC | Tope de gasto diario que funciona aunque la herramienta caiga | H | C | Pausa y aviso | R2 | 04 §6 |
| PRO-12 ★ | **Gobierno de las alertas** | Todas las anteriores | Una alerta por causa **y por cliente**; una sola por causa común; presupuesto de atención **por persona y sumando todos los módulos**, con canales y silencios definidos (apartado 7.3); respuestas que enseñan (apartado 7.4) | D | C | — | R0 | 05 §6.3, 08 §3.4 · rev. R1, R2 |
| PRO-13 | **Lo pausado que debería estar activo** | Estado de campañas, grupos y palabras; historial de cambios; fechas de fin | Entidad pausada o con fecha de fin vencida que en los 60 días previos aportaba más del 10 % de los leads de la cuenta. Aviso a los 3 días, con quién la pausó. Toda pausa que proponga el agente lleva fecha de revisión obligatoria | D | C | Aviso; propuesta de reactivación | R0 / R2 | R1 (F4) |

### 3.E Diagnóstico de causa raíz (detalle en el apartado 4)

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| DIA-01 ★ | **Árbol de causa raíz unificado** | Todo el almacén más núcleo (web, SEO, CRM, GBP, ficha) | Los **hechos duros** (pago, suspensión, rechazo, URL o certificado caídos, etiqueta ausente, entrega del lead) se comprueban siempre, a diario, haya o no anomalía y aunque sea festivo. El filtro «¿es real?» solo se aplica a las anomalías estadísticas. Después: medición → cambios (con filtro de peso) → entrega → descomposición → validación (apartado 4.2) | D (hechos) · E (resto) | C | Diagnóstico con evidencia | R0 | 05 §4.3, 10 §4.5 · P04 · rev. R1 |
| DIA-02 | **Descomposición del KPI** en factores | Impresiones, cuota, CTR, CPC, CR por periodo | Logarítmica (LMDI) cuando hay volumen; **aditiva sobre lo esperado** cuando las conversiones son cero. Un factor solo entra si su cambio supera su propio ruido; con menos de 30 conversiones en el periodo de comparación se enseña el **orden** de los factores, no porcentajes (apartado 4.3) | E | C | «Lo que más pesa es la cuota de impresiones» | R0 | 05 §4.2, 08 §4.1 · rev. R1 |
| DIA-03 | **Mezcla frente a tasa** y búsqueda de la combinación culpable | Segmentos: campaña, red, dispositivo, zona, hora, término, origen del emparejamiento | Efecto mezcla y efecto tasa; bajar por la dimensión que concentra ≥60-70 % del cambio en ≤3 elementos | E | C | Señala dónde | R0 | 05 §4.2 |
| DIA-04 ★ | **Demanda frente a subasta** | Impresiones orgánicas de Search Console de las consultas equivalentes; GBP; mismo sector en otras cuentas | Si baja también lo orgánico: mercado. Si solo baja Ads: es nuestro. Válido solo con volumen orgánico mínimo y posición estable (Search Console también llega con 2-3 días y en webs pequeñas es ruido); si no, se usa el sector, y si tampoco hay, se dice | E | C | Evita tocar la cuenta cuando es estacionalidad | R0 | 05, 06 §5.4, 08 §4.1 · rev. R1 |
| DIA-05 ★ | **Cambios de Google como causa** | Calendario de plataforma (GOO-04) | ¿El inicio coincide con un cambio de Google fechado? Donde el efecto no está medido para leads (cambio del 17 ago 2026), la causa sale como **«posible»**, nunca con confianza alta | E | C | Explicación y palancas | R0 | 09b §5.3, 10 §1.5 · rev. R1 |
| DIA-06 ★ | **Explicación en lenguaje llano**, con plantilla fija de cuatro líneas (qué pasa · por qué te lo digo ahora · qué creo que es y qué he descartado · qué haría yo) y «no concluyente» con la siguiente comprobación **guiada** | Salida de DIA-01 a 07 | La IA solo puede citar causas que el código haya calculado; cobertura de evidencia visible. Una sola voz hacia el usuario (apartado 6.4) | E | C → So | Hallazgo en la pantalla Hoy; Telegram solo si es interrupción | R0 | 03 §2.2 (claude-ads), 05 §4.4 · rev. R2 |
| DIA-07 | **¿Cambió otra cosa del marketing o del negocio del cliente?** | Memoria del cliente; calendario comercial (NEG-01); una pregunta al responsable de la cuenta | Campaña en Meta, radio, buzoneo, cambio de precio, feria, noticia, comercial nuevo. Sin esta rama el agente atribuye a la cuenta subidas y bajadas que vienen de fuera | E | C | Pregunta al responsable antes de cerrar el diagnóstico | R0 | R3 §4.5 |

### 3.F Términos de búsqueda y palabras clave

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| TER-01 ★ | **Cascada de clasificación** de cada término nuevo, entregada como **lote por cuenta** agrupado por motivo, nunca como alertas sueltas | `search_term_view`, `campaign_search_term_view` (incluye PMax), `segments.search_term_match_source`; ficha (servicios, zona, lo que NO hace, términos protegidos, reglas del cliente); consultas orgánicas de Search Console | 1) reglas de sector y zona; 2) distancia de embeddings a servicios, palabras activas y consultas orgánicas; 3) IA pequeña solo en la zona gris, con la ficha y decisiones previas; 4) evidencia estadística; 5) comprobación de conflictos. Control diario aparte: término nuevo que se lleva más de X % del gasto del día | S (lote) · D (control de gasto) | C → E → Hk | Negativa, «término protegido» o «vigilar», con nivel y concordancia; salida lista para pegar (apartado 7.2) | R1 | 01 §2.4, 02 §3.3, 08 §1.4 · A02 · rev. R1, R2 |
| TER-02 | **Término con gasto y sin resultado** | Coste, clics y conversiones (Ads y CRM) del término **en toda la ventana o en su vida**, no en una racha | Gasto ≥ k × CPA objetivo sin conversión: k = 3 por defecto, 2 en respuesta directa, 4-5 en ticket alto. Si el término convirtió alguna vez, se juzga por su CPA acumulado. La regla no se «vuelve a mirar cada semana hasta que salte» (apartado 5.2). La negativa estadística va **en exacta y con fecha de revisión** (TER-12); negativa de frase solo por intención o por n-grama con evidencia agregada | S | C | Negativa exacta con caducidad | R1 | 05 §5.1, 07 §4, 08 §2.5 · A03 · rev. R1 |
| TER-03 ★ | **N-gramas**, con evidencia agregada entre cuentas del mismo sector | Términos partidos en 1-3 palabras | Sumar coste y conversiones por fragmento («gratis», «curso», «empleo», «segunda mano»). La evidencia se agrega entre cuentas, pero la propuesta es **una sugerencia por cuenta**, validada contra la ficha de cada una y con vista previa de los términos con conversión que bloquearía. Nunca una lista compartida en la MCC: «curso» o «urgencias» son servicio para algún cliente | S | C | Negativa de frase en esa cuenta | R2 | 08 §1.1, 03 §4.1 · A02 · rev. R1, R2 |
| TER-04 ★ | **Lugares fuera de la zona de servicio** | Términos; zona y locales de la ficha; lista de municipios | El término nombra un municipio o provincia que el cliente no atiende | S | C | Negativa de frase con el nombre del lugar | R1 | 02 §1.3 (Opteo lo hace sin ficha) |
| TER-05 | **Término que merece protegerse o ser palabra clave** | Términos con conversiones; calidad en CRM | ≥2 conversiones en 90 días y CPA ≤ objetivo: se marca **«término protegido»** (ninguna negativa puede bloquearlo). Solo se añade como palabra exacta si hace falta controlar algo: anuncio o landing distintos, enviarlo a otro grupo, o no depender de un emparejamiento amplio que Google puede dejar de hacer [este último motivo es opinión propia]. Añadirlo sin motivo no trae tráfico y trocea los datos | S | C | Proteger; añadir en exacta solo con motivo | R1 | 02 §2.3, 10 §5.5 · D01 · rev. R1 |
| TER-06 | **Conflictos de negativas** | Negativas de grupo, campaña, listas compartidas y PMax | Una negativa bloquea una palabra activa o un término que ha convertido | S | C | Quitar o acotar la negativa | R1 | 02, 08 §1.4 · P06 |
| TER-07 | **Higiene de palabras** | `keyword_view`, `ad_group_criterion`; términos por campaña | Gasto ≥ k × CPA sin conversión en la ventana completa; duplicadas entre grupos y campañas; **mismo término servido por dos o más campañas o grupos** (Search, PMax, AI Max) con coste distinto: decidir cuál lo sirve; 90 días sin impresiones; variante cercana peor que su palabra | S | C | Pausar, fusionar, archivar | R1-R2 | 02 §2.3, 05 §2.5 · A03, P06 · rev. R1 |
| TER-08 | **Ratio Lin-Rodnitzky** por cuenta | Términos de 28 días | CPA de todos los términos / CPA de los que convierten: 1,0-1,5 demasiado conservador; 1,5-2,0 sano; 2,0-2,5 agresivo; >2,5 mal gestionado | S | C | Indicador en el tablero | R0 | 01 §2.4 |
| TER-09 ★ | **Lo que Google esconde** | Coste de campaña menos suma de coste de términos visibles; origen del emparejamiento | «% de gasto invisible» y «% de tráfico traído por la IA de Google» con su CPA comparado | S | C | Indicador; base para decidir sobre AI Max y amplia | R0 | 04 §2.3 |
| TER-10 | **Términos nuevos y en tendencia** | Términos por semana | Impresiones en 7 días y ninguna en los 7 anteriores; subidas sostenidas con volumen mínimo | S | C | Revisar; oportunidad o negativa temprana | R0 | 02 §3.3 · D06 |
| TER-11 | **Marca, genérico y competencia** | Términos; marca y competidores de la ficha | Clasificar todo el tráfico; marca dentro de campañas genéricas; términos de competidor no decididos | S | C → E | Negativa de marca en no marca; campaña propia | R1-R3 | 01 §6.1, 09 §1.3 |
| TER-12 | **Caducidad de negativas** | Negativas con su origen (regla estadística o intención) y fecha | Toda negativa puesta por regla estadística se revisa a los 6 meses. Listas compartidas: comprobar que están enlazadas a todas las campañas, incluidas las nuevas | T | C | Retirar, mantener o acotar | R1 | R1 (F14) |

### 3.G Pujas y presupuesto

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| PUJ-01 | **Estado de Smart Bidding**, guardado a diario | `campaign.bidding_strategy_system_status` (aprendiendo y por qué, limitada por presupuesto, datos, inventario o calidad, conversiones mal configuradas) | Más de 21 días aprendiendo; cualquier «mal configurada»; «limitada por datos» | D | C | Contexto para todo lo demás; aviso | R0 | 04 §2.10, 10 §5.5 · E04 |
| PUJ-02 | **Estrategia coherente con el volumen** | Conversiones de 30 días por **cuenta y cartera**, no por campaña | Umbrales, cada uno con su origen: Google pide ≥15 conversiones en 30 días para pujar a una acción y ≥30 para evaluar un CPA objetivo, y no recomienda objetivo con <7 (06, 10); que PMax de leads espere a 30 cualificados al mes es criterio de expertos (01). Con menos de 15 al mes en toda la cuenta: maximizar conversiones sin objetivo o cartera común; **no es alerta, es contexto**. Maximizar clics solo es hallazgo si la campaña lleva más de 30 días, tiene conversiones medidas y no es de marca | M | C | Cartera o estrategia menos exigente; fusionar solo si no hay motivo de negocio para la separación | R3 | 10 §1.6, 05 B3-B4 · E04 · rev. R1, R3 |
| PUJ-03 ★ | **«Efecto 17 de agosto»** | Estado «limitada por presupuesto», CPC, CPA real frente a objetivo | CPA objetivo o ROAS objetivo + limitada por presupuesto + CPC al alza: puede no ser un fallo sino el diseño nuevo. **En leads no hay cifras publicadas: la causa se presenta como «posible»** hasta medirla en nuestras cuentas | S | C → So | Acercar el objetivo al CPA real, redistribuir, o pasar a maximizar conversiones | R3 | 09b §5.3, 10 §1.5 · rev. R1 |
| PUJ-04 | **Objetivo irreal y el error de «bajar el tCPA como pide Google»** | Historial de cambios; CPC y conversiones 7-14 días después | Cambio de objetivo seguido de CPC ↑ y conversiones ↓. Objetivo muy por debajo del CPA histórico | S | C | Receta de Rooijmans: CPA objetivo que el negocio acepta, tope de CPC en el percentil 90-95 de los términos que convierten, pasos de 10-20 % | R3 | 07 §3.1 |
| PUJ-05 | **Reparto de presupuesto por retorno marginal** | `campaign_simulation` (puntos de presupuesto y objetivo), cuota perdida por presupuesto; valor del lead por servicio (NEG-01); capacidad (NEG-02) | Igualar el **retorno marginal** (valor del lead ÷ CPA marginal) entre campañas; igualar el CPA marginal solo vale si un lead vale lo mismo en todas (apartado 5.7). Siempre dentro de la banda de presupuesto y sin superar la capacidad del cliente | M | C | Mover presupuesto entre campañas | R2 | 08 §5.1 · A04, E06 · rev. R3 |
| PUJ-06 | **«Manos quietas»** | Historial de cambios; estado de aprendizaje; ciclo de conversión | Campaña en aprendizaje, con <2 ciclos de conversión desde el último cambio, con un cambio >±20 %, o con más de un cambio grande cada 10-14 días. En solo lectura **no puede bloquear nada**: es un semáforo «no tocar hasta el día X» visible en cada campaña y un aviso posterior si alguien la toca. Bloqueará solo cuando los cambios pasen por la herramienta | E | C | Semáforo; aviso posterior | R0 | 05 B6-B7, 09 §2.3 · rev. R2 |
| PUJ-07 | **Horario y dispositivo** | `segments.hour`, `day_of_week`, `device`; horario de la ficha y de GBP; llamadas perdidas (LLA-01) | Con Smart Bidding solo sirven: horario como encendido o apagado, dispositivo −100 %, o CPA objetivo distinto por dispositivo. **Llamada y formulario se deciden por separado**: fuera de horario se quita el recurso de llamada, no la campaña (los formularios nocturnos suelen ser los leads más baratos). Exigir ≥10 conversiones por segmento | M | C | Programar el recurso de llamada; CPA diferencial por dispositivo | R2 | 09b §5.1, 02 §2.3 · A01, A05 · rev. R1 |
| PUJ-08 ★ | **Exclusión de datos con las fechas ya calculadas** | MED-03; retraso de conversión | Desde (inicio de la caída − retraso) hasta el arreglo, cubriendo ≥90 % de los clics afectados; aplicarla cuanto antes; no rellenar (y si se rellena, ≥5 días después) | E | C | Propuesta lista para aplicar | R3 | 10 §1.7, 08 §5.2 |
| PUJ-09 | **Suceso local breve** (ola de calor, feria, festivo) | Festivos locales, meteorología, promociones del cliente | Un suceso que sube la **demanda** lo absorbe Smart Bidding solo; la palanca es el presupuesto. Propuesta de presupuesto temporal dentro de la banda acordada y con capacidad libre (NEG-02). El «ajuste de estacionalidad» de Google sirve para un cambio previsto de la **tasa de conversión** (una promoción fuerte) y con 1-2 leads al día no hay con qué estimarlo: queda fuera del catálogo local | E | C | Presupuesto temporal, cuenta a cuenta | R2 | 09b §5.2, §6.2 · rev. R1 |
| PUJ-10 | **CPC anómalo y topes** | CPC por palabra y campaña; topes de cartera | CPC muy por encima del histórico (caso real: 500 %); tope de cartera que impide entrar en subastas | D | C | Aviso; revisar tope | R0 / R2 | 01 §2.1, §2.2 |
| PUJ-11 | **Marca con Smart Bidding** | CPC de marca frente a su histórico; estrategia de la campaña de marca | Una campaña de marca en maximizar conversiones o CPA objetivo paga de más de forma sistemática | M | C | Cuota de impresiones objetivo con tope de CPC, o CPC manual. Va unida a la regla de marca (CUO-06) | R2 | R1 (F13) |

### 3.H Cuota de impresiones y competencia

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| CUO-01 | **Tablero de visibilidad** | `search_impression_share`, perdida por presupuesto y por ranking, parte superior y superior absoluta, cuota de concordancia exacta, cuota de clics | Guardar al nivel que se enseña (no se puede sumar de palabra a campaña). Llega con unos 3 días de retraso: nunca usarla para una alerta de hoy | D | C | Indicador con tendencia | R0 | 04 §2.11, §5 · E01 |
| CUO-02 | **Cuota perdida por presupuesto: redistribuir u oportunidad comercial** | Cuota perdida por presupuesto; CPL frente al máximo (NEG-01); curva marginal; capacidad (NEG-02) | Solo en campañas **con objetivo** (en maximizar conversiones sin objetivo estar limitada por presupuesto es el diseño). Se compara el coste del lead **adicional**, no el medio, con el CPL máximo. Salida 1: redistribuir dentro del contrato. Salida 2: argumento para el cliente con escenario (PLAN-02). El presupuesto es del cliente: no hay botón de aprobar | S | C | Redistribuir (R2) o argumento para el cliente (RC) | R0 / R2 / RC | 02 §2.3-2.4, 09b §6.1 · E01 · rev. R1, R3 |
| CUO-03 | **Pérdida por ranking, con su porqué** | Cuota perdida por ranking; nivel de calidad por componente; historial de objetivos; CUO-04 y 05 | **Variación frente a la propia línea base de 8 semanas**, solo en las palabras principales y en la cuota de concordancia exacta. Nunca umbral absoluto: con CPA objetivo, perder el 40-70 % por ranking es normal (el algoritmo renuncia a subastas a propósito). Si empeora: separar puja u objetivo, calidad, o competencia | S | C | Tarea de calidad, o revisar objetivo | R0-R3 | 09 §6.3, 10 §5.5 · rev. R1 |
| CUO-04 ★ | **Subastas por la puerta de atrás**, donde haya datos | Informe programado de Auction Insights (interfaz de Google → correo u hoja), semanal | La API no lo da (apartado 9). No devuelve filas en campañas pequeñas y quizá haya que programarlo cuenta a cuenta [por comprobar]: estará **en parte de las cuentas**. La vía principal es CUO-05 | S | C | Contexto para el diagnóstico; aviso de competidor nuevo | R0 | 02 §4.2, 04 §2.12 · D03 · rev. R1 |
| CUO-05 ★ | **Presión competitiva sin subastas** (vía principal) | Cuota perdida por ranking, CPC, % en parte superior; anuncios de la página de resultados (DataForSEO); competidores de la ficha | Ranking perdido ↑ + CPC ↑ + parte superior ↓ a la vez = más competencia. Quién: los anunciantes que aparecen en los resultados rastreados. Llega con 3-7 días y da **confianza media como máximo** | S | C | Explicación; revisar oferta frente al competidor | R0 | 04 §2.12 · rev. R1 |
| CUO-06 | **Regla única de marca** | Cuota y CPC de la campaña de marca; posición orgánica; competidores que pujan por la marca; leads totales de marca en el CRM | La marca es gasto defensivo, no captación, y se informa siempre aparte. Se mantiene si (a) hay competidores pujando por ella o (b) una prueba ha medido que al apagarla se pierden leads totales de marca. Si no se da ninguna, se propone **la prueba** (semanas alternas, apartado 5.8), no más presupuesto. Si no hay volumen para probar: mantenerla con tope de CPC bajo [opinión] | M | C | Prueba; tope de CPC (PUJ-11) | R2 | 05 P2, 09 §6.2 · rev. R3 |
| CUO-07 | **Mercado frente a competencia** | Impresiones con cuota estable; Search Console | Menos impresiones con la misma cuota = baja el mercado (en 2026 las impresiones totales cayeron un 11 % interanual en la muestra de Optmyzr) | S | C | Explicación | R0 | 09b §4.1, §7 |

### 3.I Anuncios y recursos

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| ANU-01 | **Cobertura mínima** | `ad_group_ad`, recursos de campaña, grupo y cuenta | Grupo sin anuncio adaptable; anuncio con 3-4 titulares; menos de 4 enlaces de sitio; sin llamada o ubicación en negocio local. La «fuerza del anuncio» es higiene, no objetivo | M | C | Tarea o borrador | R1 | 05 §2.6 · C02 |
| ANU-02 | **Recursos que no rinden** | `ad_group_ad_asset_view` (impresiones, clics, conversiones, etiqueta de rendimiento) | Etiqueta «bajo» más de 30 días; CTR muy bajo con muchas impresiones; buen CTR y mala conversión | M | C | Sustituir | R1 | 01 §2.7, 05 R8 |
| ANU-03 ★ | **Test de anuncios honesto** | Impresiones y conversiones por anuncio, solo red de Google, separando parte superior y resto | Métrica: conversiones por impresión. Método bayesiano con horizonte fijo; en grupos pequeños, test multigrupo. Nunca «95 %» mirado a diario (apartado 5.6) | M | C | Pausar perdedor; proponer siguiente variante | R1 | 01 §2.2, §2.12 |
| ANU-04 | **CTR en caída** | CTR 7 días frente a 30 | Caída >30 % con ≥25 clics en 7 días y ≥100 en 30; se excluyen campañas que cambiaron de puja | S | C | Revisar posición, mezcla de consultas y anuncio | R0 | 02 §2.3 |
| ANU-05 ★ | **Redactor de anuncios anclado** | Ficha, texto de la landing (rastreador), resultados orgánicos y anuncios de competidores (DataForSEO), recursos que funcionaron | Generar → reglas (longitud, políticas) → juez de anclaje: cada afirmación debe estar en la landing o en la ficha → persona aprueba | E | So → C → So | Borrador de anuncio | R1 | 08 §6 |
| ANU-06 ★ | **Cumplimiento en sectores regulados** (política de Google y ley española) | Sector de la ficha; textos de anuncios, incluidos los que genera Google | Vetos por sector [todos a validar con asesoría]: sanidad (sin garantías de curación ni testimonios de profesionales o famosos; **medicamentos de prescripción como «bótox» ni en palabra clave ni en anuncio**; antes y después, precios y financiación caso a caso; autorización autonómica previa pendiente de cerrar), abogados (sin promesas de resultado), financiero (verificación, TAE), superlativos sin prueba («la mejor clínica»), cerrajería no admitida según la política leída. En sector regulado, los textos automáticos de Google se **apagan por defecto** (GOO-03) | D | C → Hk | Aviso; exclusiones de términos en las guías de texto | R0 / R1 | 09b §2 · rev. R3 |
| ANU-07 | **Coherencia con el negocio** | Ficha (servicios vigentes, ofertas), anuncios y recursos | Servicio que ya no se ofrece, oferta caducada, faltas de ortografía, teléfono u horario distinto al de la ficha de Google | M | C → Hk | Corregir | R1 | 05 C12, 06 §6 |

### 3.J Landing, nivel de calidad y sintonía

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| LAN-01 | **Nivel de calidad guardado a diario**, ponderado | `ad_group_criterion.quality_info` (nota y tres componentes) | Media ponderada por impresiones; prioridad = gasto × (10 − nota); % de impresiones con cada componente «por debajo de la media». Se enseña la **cobertura** (% del gasto con nota): en cuentas locales la mayoría de palabras no la tiene. Es diagnóstico, no entra en la subasta. No tiene pantalla propia: aparece como evidencia | D | C | Evidencia en hallazgos de ranking y landing | R0 | 06 §3, 02 §2.7 · C01 · rev. R1, R2 |
| LAN-02 ★ | **Sintonía término → anuncio → landing** | Términos con gasto; titulares y descripciones; texto de la landing (H1, títulos, primer bloque) del rastreador | Tres similitudes con embeddings; ordenar por coste × (1 − similitud). IA solo para explicar los 10-20 peores casos | S | E → Hk | Negativa, landing distinta, o encargo de página nueva | R0-R1 | 06 §4.3 · C04 |
| LAN-03 ★ | **Velocidad de las páginas que reciben gasto** | URL finales con coste; PageSpeed y CrUX del módulo SEO | LCP ≤2,5 s, INP ≤200 ms, CLS ≤0,1 en móvil; ordenar por gasto. No se estima el impacto en euros a partir de estudios de proveedor (son correlaciones) | S | C | Tarea a web con el gasto afectado; si no está en contrato, oportunidad comercial (AGE-03) | R0 | 06 §4.6 · C04 · rev. R1 |
| LAN-04 ★ | **Cambio en la web ↔ caída de conversión o de nota de landing** | Registro de cambios de la web (SEO); CR por landing; componente de landing del nivel de calidad | Coincidencia de fechas entre el cambio y el inicio de la caída | E | C | Causa candidata en el diagnóstico | R0 | 05 L6, 06 §6 |
| LAN-05 | **Landing con gasto y sin resultado** | `landing_page_view`; Clarity | Gasto ≥ k × CPA sin conversión (la referencia de mercado es 150 clics en 90 días). Lista objetiva: teléfono visible en móvil, campos del formulario, ciudad, reseñas, mensaje del anuncio presente; clics de rabia y abandono del formulario | M | C → Hk | Tarea de mejora | R0 | 02 §2.3, 06 §6 |
| LAN-06 ★ | **Páginas elegidas por Google** | `expanded_landing_page_view` frente a las URL configuradas; mapa de páginas del SEO | % de clics a páginas no elegidas; tráfico a blog, legales, empleo, páginas sin formulario o caídas. En auditorías de PMax, la mitad servía páginas no elegidas | S | C | Exclusiones de URL o apagar la expansión | R2 | 05 C14, 06 §4.4 |
| LAN-07 | **Embudo después del clic** | Clics de Ads, sesiones GA4 por landing, formulario iniciado y enviado | Dónde se pierde: clic sin sesión (velocidad, consentimiento), sesión sin inicio de formulario (mensaje), inicio sin envío (formulario) | M | C | Derivar a PPC, web o medición | R0 | 05 §4.3 · C05, X03 |

### 3.K Calidad del lead y CRM

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| LEAD-01 ★ | **Coste por lead cualificado**, por **campaña y servicio a 90 días**; por término solo para detectar spam y leads no válidos | Coste de Ads; leads, etapas y ventas del CRM unidos por identificador de clic o por UTM | CPL bruto, tasa de cualificación, coste por cualificado; tasa de cierre y coste por venta **solo donde el cliente informe ventas** y a 6-12 meses. Tres columnas, no una: **no marca · marca · automático sin desglose** (PMax y lo que AI Max traiga sin término visible; esta, con la advertencia de que no está probada como incremental). Con 20 leads al mes no hay dato por término ni en un año | S | C | Es la métrica rectora del agente donde el CRM lo permite; donde no, lead válido | R0 | 06 §2.2 · C06, X02 · rev. R3 |
| LEAD-02 ★ | **«Barata pero no cierra»** | LEAD-01 a 90 días; NEG-04 | CPL por debajo del objetivo y tasa de cualificación muy por debajo de la cuenta (con encogimiento bayesiano). Quincenal cuando el historial muestra un cambio de concordancia o la activación de AI Max. Antes de culpar a la campaña: si la mezcla de términos no cambió, la causa puede ser comercial (NEG-04) | M · quincenal tras cambio | C | Bajar peso, cambiar mensaje, o cambiar la conversión que se optimiza | R2-R3 | 07 §6, 06 §2.4 · rev. R1, R3 |
| LEAD-03 ★ | **Spam por red y franja** | Leads marcados no válidos en el CRM; red, hora, dispositivo, zona | Proporción de no válidos por segmento frente al resto. Señal que no necesita CRM: conversiones de madrugada, concentradas en una zona, con tasa imposible | S | C | Excluir red, canal o franja; proteger el formulario | R1-R2 | 06 §2.1, §6 · rev. R1 |
| LEAD-04 ★ | **Valor del lead por etapa**, recalculado cada trimestre | Ventas y etapas del CRM; economía por servicio del acuerdo (NEG-01) | Valor de la etapa = probabilidad de venta desde esa etapa × margen × recurrencia. Es el **punto de equilibrio**, no el máximo a pagar: el CPL máximo sale de la fórmula del apartado 2.2 | T | C | Alimenta el acuerdo de objetivos | R0 | 06 §1.6 · rev. R3 |
| LEAD-05 | **Escalera de qué optimizar** | Volumen mensual de cualificados y ventas | <15 cualificados en 30 días (umbral de Google para pujar a una acción): pujar a lead válido y medir cualificados como secundaria; ≥15: cualificado como primaria; ≥15 ventas con valor variable: valor real. En la mayoría de estas cuentas el primer escalón será permanente: decirlo | M | C | Propuesta de cambio de conversión primaria | R3 | 06 §2.4 · rev. R3 |
| LEAD-06 | **Leads de fuera de zona** | Código postal o provincia del lead; zona de la ficha | >10 % de leads o de coste fuera de zona | M | C | Pasar a «presencia»; negativas de lugar | R1-R2 | 06 §5.1 |
| LEAD-07 ★ | **Llamadas cualificadas por su contenido** (Google solo lo ofrece en EE. UU. y Canadá) | Grabaciones del CRM, si el cliente graba | Transcribir y clasificar si la llamada es un lead real. Exige aviso de grabación y base legal: decisión de Enric | D | Hk | Subir solo las cualificadas | R3 | 06 §1.2, §6 |
| LEAD-08 | **Calidad por vía de entrada** | Formulario de Google, formulario web, llamada, WhatsApp | Tasa de cualificación por vía | M | C | Quitar o cualificar el formulario de Google | R1 | 09 §4.2 |

### 3.L Estructura y configuración

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| EST-01 | **Higiene de entrada** (lo que más dinero ahorra y menos luce) | Ajustes de campaña; `recommendation_subscription`; segmento de red; exclusiones de contenido y de ubicaciones a nivel de cuenta | Socios de búsqueda sin datos que los avalen; Display dentro de Search; «presencia o interés» en negocio local; recomendaciones autoaplicadas; textos e imágenes automáticos; sin exclusiones de aplicaciones y canales infantiles donde hay Display, vídeo o PMax | S + E | C | Corregir **de uno en uno por campaña** y respetando «manos quietas»: apagar socios o cambiar la presencia mueve volumen de golpe | **R2** | 05 §2.3, 07 §3.1 · A05 · rev. R1, R2 |
| EST-02 ★ | **Zona real del negocio** | `user_location_view` (ubicación física y si estaba en la segmentación); zona y locales de la ficha | Coste fuera de la zona de servicio >10 %; radio que no corresponde a la zona atendida | M | C | Ajustar ubicación y exclusiones | R2 | 06 §5.1 · A05 |
| EST-03 | **Demasiado partida o demasiado junta** | Conversiones por campaña; CPA objetivo; valor de cada servicio (NEG-01); campo «motivo de negocio» | Campañas con pocas conversiones y el mismo objetivo: cartera o fusión, **salvo que la separación tenga motivo de negocio** (presupuesto por servicio o por sede que pide el cliente), que exime. Campaña que mezcla servicios de valor muy distinto bajo un mismo CPA: partir | T | C → Op | Propuesta de reestructura | R3 | 09 §1.3, 07 §6 · P06 · rev. R1 |
| EST-04 | **Marca aparte** | TER-11; exclusiones de marca | Marca mezclada con no marca; PMax y AI Max sin exclusión de marca | M | C | Separar; añadir exclusiones | R2-R3 | 01 §6.1 |
| EST-05 | **Audiencias** | Criterios de audiencia; listas | Lista en «segmentación» en vez de «observación» en Search, **salvo que la campaña sea de remarketing a propósito** (por nombre o por uso). En sector sensible: sin listas de clientes ni segmentos propios (apartado 12.3) | T | C | Corregir | R1 | 05 U1, 09b §2.3 · C03, E03 · rev. R1 |
| EST-06 ★ | **Ajustes que reaparecen solos** | Fotos diarias de configuración; historial | Un ajuste corregido vuelve a su valor anterior (autoaplicadas, expansión) | D | C | Aviso y volver a corregir | R1 | 07 §9 |
| EST-07 | **Auditoría de entrada**, que se pasa primero **a las 25 cuentas actuales** y después a cada alta o cuenta heredada | Todo el catálogo; accesos | Tanda 0: propiedad y accesos (quién es dueño de la cuenta, del perfil de pagos, de GA4, de Tag Manager y de la ficha; gestores y enlaces que siguen conectados; scripts y reglas del gestor anterior) y **línea base congelada de los 90 días previos**. Después: 1) datos y riesgo; 2) gasto recortable sin riesgo; 3) aprendizaje y estructura; 4) tests. Decir también lo que está bien | E + T | C → Op | Informe y plan | R0 | 05 §6.1, 01 §2.7 · rev. R1 |
| EST-08 | **Nombres y convenciones** | Nombres de campaña frente a su configuración | El nombre contradice la concordancia, la zona o el tipo | T | C | Renombrar | R1 | 01 §2.7 |
| EST-09 | **Funciones elegibles sin usar** | Sector y país de la ficha; recursos | Recursos de mensaje, formularios con preguntas. Servicios locales de Google: un informe dice que existen en España para hogar desde 2020 y otro lo deja sin verificar: **no se sugiere hasta comprobar categorías**. Sin perseguir la nota de optimización | T | C | Sugerencia al responsable | R0 | 06 §5.3, 10 §5.1 · D04 · rev. R1, R3 |
| EST-10 | **Cierres del cliente** (agosto, fiestas locales, baja del autónomo) | Calendario comercial del acuerdo (NEG-01) | Al inicio del cierre: propuesta de pausa o de dejar solo formulario; al final: reactivación (enlaza con PRO-13). Silencia las alarmas de ese periodo | E | C | Pausa y reactivación programadas | R2 | R1 (F5), R3 §1.1 |
| EST-11 | **Modo lanzamiento** | Configuración de la campaña nueva; referencia del sector | Lista previa (zona y tipo de presencia, redes, negativas enlazadas, objetivos de conversión, horario, URL y parámetros, presupuesto, fecha de fin, recursos). Después, 14 días con umbrales absolutos: impresiones en términos del servicio, primer lead antes de gastar 2 × CPA, términos a diario. Las reglas con línea base quedan suspendidas | E + D (14 días) | C | Lista y vigilancia reforzada | R0 | R1 (F6), R2 §4.8 |
| EST-12 | **Otra cuenta anunciando al mismo cliente** | Sesiones de pago de Google en GA4 cuyo identificador o nombre de campaña no existe en nuestra cuenta | El cliente lanzó algo desde la ficha de Google, o sigue viva la cuenta de la agencia anterior. No aparece en subastas | S | C | Aviso al responsable | R0 | R1 (F11) |

### 3.M Performance Max, AI Max y cambios de Google

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| GOO-01 | **Auditoría de Performance Max** | `campaign` por `segments.ad_network_type`; `campaign_search_term_view`; categorías; `asset_group`; `performance_max_placement_view` | Marca >20 % del gasto; Display y vídeo cerca de un tercio del gasto con pocas conversiones (en comercio electrónico la bandera es >10 %); un grupo de recursos que acapara; 20 categorías con más gasto; ubicaciones basura | M | C | Exclusiones de marca, negativas, exclusión de ubicaciones | R1-R2 | 05 §2.9, 01 §2.7 · E02 |
| GOO-02 ★ | **Canibalización** entre PMax o AI Max y Search | Conversiones por campaña y semana; términos por origen | Sube una lo que baja la otra: se han movido leads, no añadido. Deduplicar los términos de AI Max contra los de exacta y frase | S | C | Añadir los mejores como exacta; revisar si aporta | R2 | 01 §2.2, §2.13 |
| GOO-03 | **Vigilancia de AI Max** | `campaign.aca_migration_date_time`, `broad_match_migration_date_time`; `ai_max_search_term_ad_combination_view` | Qué campañas migró Google y cuándo; 28 días antes y después; términos de marca a genérico y de genérico a competidor; guías de texto. En sector regulado, textos automáticos **apagados por defecto**, no revisados después | S + E | C | Exclusiones, guías de texto, o desactivar por grupo | R2 | 04 §4.1 · rev. R3 |
| GOO-04 ★ | **Calendario de cambios de la plataforma** | Tabla propia con fecha, ámbito y efecto esperado (apartado 9.5); novedades | Lo mantiene el equipo con ayuda de un agente que lee las fuentes; el diagnóstico lo consulta | S | C + So | — | R0 | 01 (idea 11), 10 (idea 3) |
| GOO-05 | **Prioridad de canal y expansión a Display (feb 2027)** | Aún no está en la API: segmento de red como sustituto | Campaña de leads con socios o Display que superan X % del gasto con peor coste por lead | M | C | Poner Display y socios en prioridad baja con tope | R2 | 10 §1.4 |
| GOO-06 | **Recomendaciones de Google, cribadas** | `recommendation`; `metrics.optimization_score` | Separar higiene útil (conflictos, recursos que faltan) de lo que sirve al gasto (amplia, subir presupuesto sin base) | S | C | Aplicar las útiles; descartar el resto con motivo | R1-R3 | 01 §3, 04 §2.8 |
| GOO-07 | **Vigía de la API** | Versión en uso; fechas de retirada | Aviso 60 días antes de la retirada de la versión; enumerados que cambian entre versiones | M | C | Tarea técnica | R0 | 04 §1.6 |
| GOO-08 | **Experimentos asistidos** (solo donde hay volumen para leerlos) | `experiment`, `experiment_arm` | Para AI Max y para decisiones grandes en las cuentas con más volumen, con criterio de éxito escrito, duración (2 ciclos o 2 semanas, lo mayor) y lectura automática. En cuentas pequeñas el sustituto es la prueba por semanas alternas (apartado 5.8) | E | C | Propuesta de experimento | R3 | 09 §3.1, 08 §2.6 · rev. R1 |

### 3.N Descubrimiento y escalado

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| ESC-01 ★ | **Puente Ads ↔ SEO** | Términos de pago con conversión; posiciones y páginas (SEO); Search Console | Consultas largas que convierten en Ads sin página orgánica: encargo de contenido. Palabra de pago con orgánico estable en 1-3: **prueba** de reducción midiendo leads totales (una posición alta no demuestra que el anuncio sobre) | M | C → E | Brief al SEO; experimento | R0 / R3 | 09b §3 · D02, X01 |
| ESC-02 | **Palabras nuevas desde lo orgánico** | Consultas de Search Console que traen leads; mapa de palabras | Temas con demanda y conversión orgánica sin cobertura de pago | M | E | Nuevas palabras | R1 | 03 (idea 7) · D01 |
| ESC-03 ★ | **Semáforo «control antes de escalar»**, con tres luces | MED-01, LEAD-01, NEG-02 | No se propone subir presupuesto ni objetivo hasta que estén en verde **medición, calidad del lead y capacidad del cliente**. Con la agenda llena, la propuesta correcta es bajar o pausar ese servicio y decirlo | E | C | Bloquea propuestas de escalado | R0 | 07 (idea 5) · rev. R2, R3 |
| ESC-04 | **Escalar donde hay margen** | CUO-02; PUJ-05; PLAN-02 | ESC-03 en verde y coste del lead **adicional** por debajo del CPL máximo: +10-20 % y evaluar tras 1-2 ciclos. Subir el presupuesto es dinero del cliente: la salida es un argumento con escenario, no un botón | M | C | Argumento para el cliente | RC | 09b §6.1 · E01, E06 · rev. R2, R3 |
| ESC-05 ★ | **Estacionalidad propia por sector y zona**, más el calendario comercial del cliente | Volumen mensual por palabra (DataForSEO), Search Console y GBP diarios, histórico de Ads (37 meses); calendario comercial (NEG-01) | Índice estacional calculado con nuestros datos: no existe ninguno público para España [hipótesis]. La demanda no es lo único: cierres, picos con el equipo desbordado, servicios que se apagan | M | C | Presupuestos por temporada; silenciar alarmas de agosto | R0 | 10 §5.3 · rev. R3 |
| ESC-06 | **Zonas y servicios sin cubrir** | Ubicaciones con conversiones recientes; servicios de la ficha sin campaña | Ciudad nueva que convierte; servicio rentable sin campaña propia | M | C | Propuesta de ampliación | R3 | 02 §3.3 |
| ESC-07 | **Mezcla de tipos de campaña y de canales**: pasa a PLAN-04 y PLAN-05 (recomendación en la revisión trimestral, no control periódico) | — | — | — | — | — | — | rev. R1, R3 |
| ESC-08 | **Clientes existentes** | Listas de clientes del CRM | Excluir clientes recientes de la captación; venta cruzada donde tenga sentido (prioridad baja en leads locales) | T | C | Lista de exclusión | R2 | 05 U2 · D05, E03 |

### 3.O Planificación y previsión

Familia nueva en la v2 (crítica de R3, aceptada en parte: se acepta el contenido; se coloca después del diagnóstico y con
rangos anchos, porque con estas cuentas una previsión estrecha sería falsa precisión). Sustituye al «Estratega» de una
línea de la v1 y absorbe ESC-07.

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| PLAN-01 | **Previsión mensual por cuenta, con rango** | Gasto previsto, índice estacional (ESC-05), tasas del embudo | Leads (y cualificados donde los haya) esperados el mes próximo con el presupuesto actual, siempre como rango (P10, P50, P90), nunca una cifra sola. Cada mes se compara con lo ocurrido y **el error de previsión se publica** | M | C | Bloque del informe al cliente | R0 | R3 §2.2 |
| PLAN-02 | **Escenarios de presupuesto** | Simuladores de Google [cobertura por comprobar], cuota perdida por presupuesto, curva marginal (apartado 5.7), referencia del sector | Tres por defecto: −20 %, igual, +20 %. Salida: leads adicionales como rango, coste del lead adicional frente al CPL máximo, y recomendación por servicio. Si no hay datos para estimar la curva, lo dice | E + M | C → So | Argumento para el cliente | RC | R3 §2.2 |
| PLAN-03 ★ | **Propuesta de reducción honesta** | PLAN-02, NEG-02, CUO-06, ESC-05 | Se dispara cuando el coste del lead adicional supera el máximo, la capacidad está llena, la marca no demuestra ser incremental o la demanda cae por temporada. Dice cuánto se ahorra y qué se pierde | M | C → So | Argumento para el cliente | RC | R3 §2.2 |
| PLAN-04 | **Oportunidades de expansión** (servicio, zona o canal nuevo), como **recomendación, no como gestión** | Volumen de búsquedas, consultas orgánicas, CPC de referencia; servicios de la ficha sin campaña | Cada oportunidad con demanda estimada, inversión de prueba, criterio de éxito y fecha de decisión. Canales: Microsoft Ads (Search rentable y saturado; volumen en España pequeño [no verificado]), Meta (demanda latente: estética, dental, reformas), Demand Gen y YouTube (decisión larga, con creatividad), ficha de Google y reseñas (paquete local débil) | T | C → Op | Recomendación al responsable | R0 | R3 §2.2 |
| PLAN-05 | **Revisión estratégica trimestral con guion fijo** | Todo lo anterior | Objetivo frente a resultado · previsión frente a resultado · qué se probó y qué enseñó · dos o tres opciones para el trimestre con su previsión · lo que tiene que hacer el cliente. Incluye la vista SEO + ficha + Ads por grupo de consultas (qué presencia hay y qué leads totales salen). El código calcula; el modelo grande redacta. Sin guion, produciría prosa cara | T | C → Op / Fb | Documento para la reunión | R0 | R3 §2.2, §4.6 |

### 3.P Informes al equipo y al cliente

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| INF-01 ★ | **Pantalla «Hoy»**: parte por excepción | Hallazgos abiertos de todas las cuentas | Orden por la prioridad del apartado 4.6; topes del apartado 7.3; arriba, «comprobadas 25 cuentas, 1.240 controles, 4 cosas para ti» | D | C → Hk | Pantalla de inicio y un único mensaje por la cola de avisos existente | R0 | 05 §6.2, 07 (idea 9) · rev. R2 |
| INF-02 | **Resumen del lunes** para el equipo | Semana cerrada. Gasto, clics y leads primarios se dan por cerrados donde la cuenta madura en horas (MED-06); los cualificados del CRM salen como «provisional» | Por cuenta: estado, lo que cambió y por qué, lo que se hizo, lo pendiente. Solo las cuentas con algo que decir; el resto, una línea | S | C → So | Bloque de la pantalla Cartera, no 25 textos | R0 | 01 §2.10 · rev. R2 |
| INF-03 ★ | **Informe mensual al cliente** en lenguaje de negocio | Acuerdo de objetivos (NEG-01), LEAD-01, acciones del mes y su resultado, PLAN-01, pendientes del cliente | Una página, seis bloques: objetivo pactado frente a resultado · leads sin marca aparte de los de marca · qué hicimos y qué efecto tuvo (con su incertidumbre) · qué detectamos fuera de la cuenta · previsión del mes próximo · **lo que necesitamos de ti**. Donde solo hay «válido / no válido», se enseña eso y no «coste por cliente». Nunca cuota de impresiones ni CTR en la primera página | M | C → So | Borrador; lo revisa y envía una persona | R0 | 07 §5 · rev. R3 |
| INF-04 | **Aviso proactivo al cliente** cuando algo suyo está roto | DIA-06 | Borrador. Nunca se envía sin aprobación (línea roja del proyecto) | E | So | Borrador | R0 | 10 §4.2 |
| INF-05 | **Informe de auditoría** de alta o de captación comercial | EST-07 | Por tandas, con impacto en euros | E | Op | Documento | R0 | 05 §6.1 |
| INF-06 | **Preguntar a la cuenta** | Herramienta de solo lectura para los agentes existentes | Las cifras las calcula el código; la fecha va siempre explícita (apartado 6.3) | — | C → So | Respuesta | R0 | 01 §2.2, 03 (idea 12) |
| INF-07 | **Cierre de mes** | Gasto real, presupuesto de medios del acuerdo, factura | Día −5 y día 1: cuadre de gasto frente a lo contratado, propuesta de presupuestos diarios del mes siguiente, campañas con presupuesto compartido, aviso al responsable si se gastó más o menos de lo pactado | M | C | Propuesta de presupuestos diarios | R2 | R1 (F18) |
| INF-08 | **Ficha de reunión y respuesta rápida** a «¿por qué han bajado los leads?» | Expediente de la cuenta (apartado 7.1); DIA-06 | Una página antes de cada llamada (qué pasó, qué hicimos, qué funcionó, qué le pedimos y no ha hecho, qué proponemos) y el diagnóstico en versión cliente, sin jerga | E | C → So | Borrador para el responsable | R0 | R2 §4.3 |

### 3.Q Negocio de la agencia

Familia nueva en la v2 (crítica de R3, aceptada en parte). **Matiz de arquitectura [opinión]:** rentabilidad por cuenta,
riesgo de baja y venta adicional no son cosa de Google Ads sino de toda la agencia (valen igual para SEO). Deben vivir en el
núcleo u Operaciones, y el módulo Ads solo aporta sus señales; así se respeta la regla «un módulo no importa a otro». Todo
lo que toque cuota o margen de la agencia lo ven solo administradores.

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| AGE-01 | **Horas y rentabilidad por cuenta** | Horas imputadas (encargos, ClickUp), minutos de revisión de la cola; cuota del contrato | Margen por cuenta y cuentas que cuestan más de lo que pagan. Efecto en el diseño: **techo de horas por cuenta según su cuota** (apartado 4.6). La línea base se mide antes de construir (apartado 13.2) | M | C | Parte para Enric | R0 | R3 §3.2 |
| AGE-02 ★ | **Riesgo de baja** | Coste por lead por encima del objetivo dos meses, leads a la baja, presupuesto recortado por el cliente, usuario nuevo en la cuenta, renovación en menos de 60 días, cliente que no contesta, queja reciente, informe sin enviar | Semáforo sencillo por cuenta. Se enseña en la pantalla Cartera y sube la prioridad de sus hallazgos | S | C | Acción sugerida para Enric antes de que llegue el aviso de baja | R0 | R3 §3.2, R2 §4.2 |
| AGE-03 | **Venta adicional con evidencia** | Hallazgos que no se arreglan dentro de Google Ads | Landing lenta o que no convierte → web; términos que convierten sin página orgánica → SEO; respuesta lenta o llamadas perdidas → automatización del CRM; reseñas por detrás → reputación; escenario favorable → más inversión | M | C → So | Oportunidad para el responsable de la cuenta; nunca se envía sola al cliente | R0 | R3 §3.2 |
| AGE-04 ★ | **Registro de valor** por cuenta y mes | Incidencias detectadas y en cuánto tiempo, gasto retirado de términos sin intención, cambios y su resultado | Regla de honestidad: «gasto evitado» solo se afirma cuando hay un hecho (página caída, medición rota); lo demás, como rango o «no concluyente». Un «te hemos ahorrado 3.200 €» inventado destruye la confianza la primera vez que el cliente pregunta cómo se calculó | M | C | Bloque del informe al cliente | R0 | R3 §3.2 |
| AGE-05 | **Niveles de servicio** | Decisión de Enric | El diseño debe permitir un nivel base (vigilancia e higiene, pocas horas) y uno avanzado (CRM conectado, calidad del lead, informe de ventas, revisión estratégica). No es una capacidad del agente: es una opción comercial que el módulo hace posible | — | — | — | — | R3 §3.2 |

### 3.R Aprendizaje de la agencia

| ID | Qué detecta o hace | Datos y fuente | Regla o método | Frec. | Motor | Acción propuesta | Riesgo | Fuente · PDF |
|---|---|---|---|---|---|---|---|---|
| APR-01 ★ | **Registro de decisiones con predicción previa** | Cada propuesta R2 o R3: hipótesis, métrica, efecto esperado con intervalo, ventana, criterio de vuelta atrás, quién aprobó. También los cambios manuales R2-R3 (se pide una línea de motivo) y las **no-acciones** («decidimos no subir presupuesto porque…») | Se escribe antes de actuar. Las R1 (negativas, higiene) no llevan predicción individual: su efecto suelto no es medible y se evalúan en conjunto | E | C | — | R0 | 08 §4.5, 10 §6 · rev. R2 |
| APR-02 ★ | **Evaluación posterior con control** | Datos maduros tras la ventana | Mejor control disponible: experimento de Google → aleatorización entre entidades → series de control (Search Console, campañas y cuentas no tocadas) → antes y después ajustado | E | C | Resultado: funcionó, no concluyente o perjudicó | R0 | 08 §4 |
| APR-03 | **Experimentos dentro de una cuenta** | Entidades elegibles para una misma recomendación de riesgo bajo, **dentro de una misma cuenta** | Aplicar en una mitad al azar, la otra de control 2-4 semanas. No se hace entre cuentas: con 25 cuentas distintas no hay potencia estadística y no se puede explicar a un cliente por qué no recibió una mejora que se creía buena | E | C | — | R1 | 08 §4.3 · rev. R1, R2, R3 |
| APR-04 | **Benchmark interno** por sector y tipo de campaña, **solo con tráfico de no marca** | Todas las cuentas | Medianas de CPC, CTR, CR, CPL y coste por cualificado. Solo se calcula en celdas con 3 o más cuentas; antes de construirlo se cuenta cuántos sectores las tienen (inventario). Con una o dos cuentas no hay benchmark y se dice | M | C | Comparar cada cuenta con sus pares, como evidencia | R0 | 06 §4.9, 09b §4 · rev. R2, R3 |
| APR-05 ★ | **Referencia del sector** para decidir con pocos datos | APR-04 | Punto de partida bayesiano de cada término, campaña y cuenta nueva (apartado 5.3) | S | C | — | R0 | 08 §2 |
| APR-06 | **Casos de oro y repetición del pasado** | Incidentes con **desenlace conocido** (no «lo que hizo Eury»), validados por el resultado o por alguien con más experiencia; los 26 casos semanales del apartado 4.8 | Antes de enviar un solo aviso: ¿habría detectado y explicado bien lo que ya sabemos que pasó? | E | C | Examen del agente | R0 | 08 §7.2 · rev. R1, R2 |
| APR-07 | **Tasa de alertas útiles** | Las ocho respuestas del apartado 7.4; descartes con motivo | Las respuestas ajustan **prioridad y presentación, nunca detección**. Ninguna respuesta de una sola persona cambia un umbral de forma automática: los ajustes se proponen en un resumen mensual que aprueba quien haga de sénior | M | C | Propuesta de ajuste | R0 | 08 §3.4, 10 §3.5 · rev. R2 |
| APR-08 | **Conocimiento vivo de la plataforma** | Base de conocimiento del núcleo | Lista de lo obsoleto (posición media, audiencias similares, SKAG, anuncios de texto, CPC mejorado) para que la IA no repita sabiduría vieja: un estudio encontró un 20 % de respuestas erróneas de IA generalista sobre PPC | M | So | — | R0 | 03 §2.1 |

### 3.S Equivalencia con el mapa del PDF de contraste

El PDF propone 35 auditorías. Todas quedan cubiertas, y en cada una añadimos el método concreto que el PDF deja abierto.

| PDF | Nuestras capacidades | Qué añadimos |
|---|---|---|
| A01 Horarios | PUJ-07 | Horario del negocio y llamadas perdidas; límites reales de Smart Bidding |
| A02 Términos y negativas | TER-01, 02, 03, 04, 06 | Cascada con ficha del cliente, n-gramas entre cuentas, lugares fuera de zona |
| A03 Gasto desperdiciado | TER-02, TER-07, LAN-05 | Umbral ligado al CPA y probabilidad en vez de importe fijo |
| A04 Reparto de presupuesto | PUJ-05 | Retorno marginal con simuladores, valor por servicio y capacidad |
| A05 Zona, dispositivo, ubicaciones | EST-01, EST-02, PUJ-07, GOO-01 | Zona real de la ficha |
| A06 Ritmo | PRO-07 | Reglas de 2026 (30,4×, días apagados) |
| P01 Medición | MED-01 a MED-18, LLA-01 a 03 | Conciliación diaria con el CRM, madurez, fuga de identificadores |
| P02 Políticas | PRO-05, ANU-06 | Ley española además de la política de Google |
| P03 Salud y acceso | MED-12, PRO-08 | — |
| P04 Anomalías | PRO-01 a 04, PRO-09, DIA-01 | Poisson, causa común entre cuentas, una alerta por causa |
| P05 URL rotas | PRO-06, LAN-06 | Páginas elegidas por Google |
| P06 Estructura y conflictos | TER-06, TER-07, EST-03, EST-06 | Regresiones que reaparecen |
| E01 Cuota de impresiones | CUO-01, 02, 03, ESC-04 | Separar presupuesto, ranking y competencia |
| E02 Mezcla de campañas | GOO-01, PLAN-04, PLAN-05 | Como recomendación trimestral con guion |
| E03 Audiencias propias | EST-05, ESC-08 | Restricción de salud |
| E04 Estrategia de puja | PUJ-01 a 04, PUJ-06 | Efecto 17 de agosto; «manos quietas» |
| E05 Expansión de canal | PLAN-04 | Con inversión de prueba y criterio de éxito |
| E06 Retorno marginal | PUJ-05, ESC-04, PLAN-02 | Retorno marginal con valor por servicio y tope de capacidad |
| C01 Nivel de calidad | LAN-01 | Histórico propio ponderado |
| C02 Anuncios y recursos | ANU-01 a 05, ANU-07 | Test honesto; redactor anclado |
| C03 Audiencias | EST-05 | — |
| C04 Relevancia de landing | LAN-02 a 05 | Embeddings con el texto real de la página; cambios en la web |
| C05 Calidad tras el clic | LAN-07, PRO-10 | Clarity |
| C06 Calidad de conversión | LEAD-01 a 08, NEG-03 a 06 | Por campaña y servicio; spam por término y red; respuesta al lead |
| D01 Minería de términos | TER-05, ESC-02 | Con calidad del CRM |
| D02 Hueco SEO-PPC | ESC-01 | En las dos direcciones |
| D03 Hueco competitivo | CUO-04, 05, 06 | Subastas sin API; resultados de búsqueda |
| D04 Funciones sin usar | EST-09, GOO-06 | — |
| D05 Venta cruzada | ESC-08 | — |
| D06 Términos en tendencia | TER-10 | — |
| X01 Incrementalidad pago-orgánico | ESC-01, CUO-06, NEG-06 | Prueba por semanas alternas y leads totales, no suposición |
| X02 Offline y CRM | MED-02, MED-10, LEAD-01 | Data Manager API, conciliador |
| X03 Embudo GA4 | LAN-07 | — |
| X04 Atribución entre canales | DIA-04 (parcial) | Lo dejamos fuera a propósito: con estas cuentas no hay datos para modelos de atribución (apartado 5.8) |
| X05 Puntuación de audiencias | LEAD-04 (valor por etapa) | Sin unir usuarios entre plataformas |

**Lo que nuestro catálogo tiene y el PDF no:** toda la familia de diagnóstico (DIA), la estadística para pocos datos
(PRO-03, MED-06, APR-05), los cambios de Google como causa (PUJ-03, GOO-03 a 05, DIA-05), la exclusión de datos calculada
(PUJ-08), el cumplimiento de la ley española (ANU-06), el negocio local (TER-04, EST-02, LEAD-06, PUJ-07), el gobierno de
alertas (PRO-12), la familia de aprendizaje (APR) y, desde la v2, el negocio del cliente (NEG), las llamadas (LLA), la
previsión (PLAN) y el negocio de la agencia (AGE). Además, el PDF da precios desfasados (TrueClicks «desde 208 $»; es
gratis hasta 50.000 $ de inversión mensual; 02) y propone BigQuery y Looker, que aquí no hacen falta.

---

## 4. El motor de diagnóstico

Es la pieza que convierte «el CPL ha subido» en «ha subido por esto, hemos descartado esto otro, y proponemos esto». Es
también lo que pide el brief («con el porqué») y lo que el mercado no entrega: Adalysis y Optmyzr tienen árboles de métricas,
pero el usuario tiene que abrirlos e interpretarlos, y solo ven Google Ads (02).

**Dónde encaja de verdad** (corrección de la v2). El consultor de cuentas estima que el diagnóstico fino aporta poco dinero
directo en cuentas locales pequeñas y mucha confianza del equipo; lo que más recupera es la lista de hechos duros de 4.2.
Lo acepto: el motor se construye **en dos escalones**. Primero los hechos duros y los cambios (código simple, útil desde la
primera semana); después la descomposición y las ramas finas, que solo dicen algo en las cuentas con volumen.

### 4.1 Tres reglas de diseño

1. **El código calcula; la IA redacta.** Todas las ramas del árbol son comprobaciones de datos. La IA recibe el resultado ya
   calculado y solo puede citar causas que estén en él. Así no puede inventarse un competidor ni un cambio que no existió.
2. **Una alerta por causa, no por métrica.** «Landing caída» explica a la vez que baje la conversión, suba el CPA y falten
   leads: es un solo mensaje (05 §6.3).
3. **Se permite «no concluyente», pero nunca como callejón.** Si falta evidencia, el diagnóstico lo dice y propone la
   siguiente comprobación **guiada paso a paso** (dónde se mira y qué se espera ver), porque para un gestor que aún no
   domina el informe de subastas, «no sé; comprueba X» es quedarse ahí (R2).

### 4.2 El árbol unificado

Los informes proponen cinco órdenes distintos (01, 04, 05, 07 y 10). El orden de la v1 tenía un fallo grave que señaló R1:
ponía primero «¿es real el cambio?» y eso podía silenciar una tarjeta rechazada en un puente como «festivo, se anota».
Orden corregido:

**A. Hechos duros: siempre, a diario, haya o no anomalía, y aunque sea festivo.**

| Hecho | Comprobación | Capacidad |
|---|---|---|
| La cuenta no puede servir | Pago, suspensión, verificación del anunciante, presupuesto de cuenta, fecha de fin; impresiones de la cuenta a cero en horario de servicio | MED-12, MED-14 |
| Anuncios rechazados o limitados | Política de anuncios y recursos con gasto | PRO-05 |
| La página no responde | 404 o 5xx confirmado dos veces; certificado o dominio caducados | PRO-06 |
| La etiqueta o el formulario cambiaron o faltan | Versión del contenedor, huella del formulario, prueba activa | MED-16, MED-18 |
| El lead no llega | Ads frente a CRM por tipo; formularios de Google sin entregar; latido de todos los canales; llamadas a cero | MED-02, MED-13, MED-17, LLA-03 |
| Algo pausado que no debería | Entidad pausada que aportaba leads; cierre del cliente sin pausar | PRO-13, EST-10 |

Un hecho duro da confianza alta por sí solo y no pasa por ningún filtro estadístico.

**B. Anomalías estadísticas: el árbol.** El código ejecuta todas las ramas (es barato); el orden decide qué causa gana
cuando varias encajan.

| Paso | Pregunta | Comprobaciones | De dónde sale el dato | Si la respuesta es sí |
|---|---|---|---|---|
| **1** | **¿Es real el cambio?** (solo para anomalías estadísticas; los hechos de A ya se han mirado) | Dentro del ruido esperado (apartados 5.1 y 5.5); datos maduros donde aplique (MED-06); festivo o puente local; cierre del cliente; estacionalidad (mismo periodo del año anterior); cambio de definición (acción pasada a secundaria) | Ads; calendario de la agencia; NEG-01; ESC-05 | No se alerta. Se anota |
| **2** | **¿Se rompió la medición o la entrega?** | Las tres firmas de MED-03; Ads frente a GA4 frente a CRM; cambio en la web, en las etiquetas o en el banner en esa fecha | Ads; GA4; GoHighLevel; registro de cambios de la web | Tarea a web, exclusión de datos (PUJ-08). **No tocar pujas** |
| **3** | **¿Cambió algo nuestro, del cliente o de Google?** | Historial de cambios previo al inicio, **con filtro de peso**: en una cuenta gestionada siempre hay cambios en los 14 días previos, así que un cambio solo es causa candidata si toca entidades que suman al menos el 20-30 % del gasto afectado y su fecha encaja con ±2 días (más el retraso de conversión). Recomendaciones autoaplicadas; migraciones; estado de Smart Bidding; calendario de plataforma | Almacén propio de `change_event`; GOO-04 | Se evalúa como «efecto de un cambio»: revertir, esperar o ajustar |
| **3b** | **¿Cambió otra cosa del marketing o del negocio del cliente?** (DIA-07) | Campaña en otro canal, precio, feria, comercial nuevo, noticia | Memoria del cliente; una pregunta al responsable de la cuenta | Se anota como causa externa; no se toca la cuenta |
| **4** | **¿Qué factor explica el cambio?** | Descomposición del KPI (4.3), con sus límites, y bajada por la rama con más peso (4.4) | Ads más cruces | Causa candidata, con su orden de importancia |
| **5** | **¿Dónde?** | Campaña → red → dispositivo → zona → hora → término → anuncio → landing; mezcla frente a tasa | Ads por segmentos | Señala la combinación culpable |
| **6** | **¿Se sostiene la hipótesis?** | ¿Coincide la fecha? ¿La magnitud explica ≥50 % del cambio? ¿Hay contraste: otras campañas u otras cuentas del sector sin esa causa no cayeron? | Todas las cuentas | Confianza alta, media o «no concluyente» |

### 4.3 Descomposición del KPI

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

**Ejemplo (cuenta con volumen).** Las conversiones bajan un 30 % (logaritmo −0,357). Búsquedas elegibles −5 % (−0,051),
cuota −20 % (−0,223), CTR +2 % (+0,020), CR −10 % (−0,105). Reparto: 62 % de la caída es cuota de impresiones, 29 % tasa de
conversión, 14 % demanda, y el CTR compensa un 6 %. La pregunta siguiente es mecánica: ¿la cuota se perdió por presupuesto o
por ranking?

Es el método LMDI de economía; ninguna fuente de PPC leída lo nombra y Optmyzr no publica cómo calcula sus contribuciones (05).

**Cuándo NO sirve** (la v1 lo presentaba como método universal; R1 demostró que falla justo en el caso estrella):

1. **Con conversiones a cero no existe** (el logaritmo de cero no está definido). «3 días sin leads» no se puede descomponer
   así. Versión aditiva sobre lo esperado: conversiones esperadas = clics esperados × tasa esperada; la falta se reparte
   entre «faltaron clics» (entrega) y «los clics no convirtieron» (conversión).
2. **Con 10-30 conversiones los porcentajes son precisión falsa.** Un factor solo entra en el reparto si su cambio supera su
   propio ruido; si ninguno lo supera, «no concluyente». Con menos de 30 conversiones en el periodo de comparación se enseña
   el **orden** de los factores («lo que más pesa es…»), no porcentajes.
3. **La cuota de impresiones por debajo del 10 % llega como «< 10 %».** En campañas pequeñas, «búsquedas elegibles» no se
   puede calcular: esa rama se declara no disponible.
4. **Con concordancia amplia y AI Max, Google estira el universo elegible.** «Impresiones / cuota» deja de medir demanda; la
   demanda se contrasta con Search Console o con el sector (DIA-04), o no se afirma.

**Mezcla frente a tasa.** El CPL de una cuenta puede empeorar sin que ninguna campaña empeore, solo porque el tráfico se
desplaza hacia lo peor (más móvil, más socios de búsqueda, AI Max ampliando):

```
ΔCR = Σ (peso₁ − peso₀) × CR₀      ← efecto mezcla
    + Σ peso₀ × (CR₁ − CR₀)        ← efecto tasa
    + interacción
```

Regla práctica para bajar de nivel: elegir la dimensión en la que ≤3 elementos concentran ≥60-70 % del cambio (estimación
propia del informe 05).

### 4.4 Las ramas, y lo que aporta nuestra herramienta en cada una

| Rama | Sub-causas | Dato de Google Ads | **Cruce que solo tenemos nosotros** |
|---|---|---|---|
| **Impresiones ↓ por demanda** | Estacionalidad, festivo, clima, el mercado encoge (resultados con IA) | Elegibles ≈ impresiones / cuota (con los límites de 4.3) | **Search Console**: impresiones orgánicas de las mismas consultas como serie de control, si hay volumen. **GBP**: vistas y llamadas. **Otras cuentas del sector**, si las hay |
| **Cuota ↓ por presupuesto** | Presupuesto recortado; CPC más alto con el mismo presupuesto; posible efecto del cambio del 17 ago 2026 | Cuota perdida por presupuesto; estado «limitada» | **Banda de presupuesto** del acuerdo: ¿hay margen sin preguntar al cliente? |
| **Cuota ↓ por ranking** | (a) objetivo o puja; (b) calidad; (c) competencia | Cuota perdida por ranking frente a su propia línea base; nivel de calidad por componente; historial de objetivos | Anuncios vistos en los resultados (DataForSEO); **competidores de la ficha**; informe de subastas donde exista; velocidad y cambios de la landing |
| **Cobertura ↓** | Palabras pausadas o de «poco volumen», negativas nuevas, zona, horario o audiencia estrechados; algo pausado y olvidado | Historial de cambios; estado de criterios | **Zona, horario y cierres reales** del cliente |
| **CTR ↓** | Peor posición; peor mezcla de consultas; anuncio; resultados con más cosas encima | Parte superior; términos por origen | Página de resultados (DataForSEO): qué más aparece |
| **CPC ↑** | Competencia; objetivo cambiado; calidad; mezcla hacia lo caro | CPC por segmento | Regla de Geddes: **si el CPC sube un 25 % y el CPA no cambia, el sistema funciona** (10 §4.4) |
| **CR ↓** (la rama clave en leads) | Medición o entrega (volver al paso 2); landing caída, lenta o cambiada; formulario roto; **llamadas que nadie coge**; mezcla de tráfico peor; oferta; reputación | CR por landing, red, dispositivo, zona, hora; llamadas perdidas | **Vigilancia de caídas, registro de cambios, PageSpeed y CrUX** (SEO); **GA4** por landing; **Clarity**; **reseñas de GBP**; **CRM**; **ficha**: ¿se sigue ofreciendo ese servicio? |
| **«Los leads son malos»** | Respuesta lenta; llamadas perdidas; tasa de cierre que cae sin cambio de términos; spam; concordancia abierta | Términos por origen; red | **NEG-03** (respuesta al lead), **NEG-04** (cierre), LEAD-03 (spam). La primera causa suele estar después del clic, no en la campaña |
| **Gasto ↑ sin conversiones** | Presupuesto u objetivo relajado; término o zona nueva que se come el gasto; clics no válidos; exploración tras un cambio | Términos y zonas nuevas; historial | Clics sin sesión en GA4 o Clarity |
| **Causa de fuera de la cuenta** | Otro canal del cliente, precio, comercial nuevo, feria, otra cuenta anunciando al mismo cliente | — | DIA-07, EST-12, memoria del cliente |

Límite que hay que decir: estos cruces solo existen **donde el cliente tiene la web rastreada, el CRM conectado y las
cuentas de Google enlazadas**. No todo cliente de Ads es cliente de SEO, y muchas landings de captación viven en embudos del
CRM o en constructores aparte que el rastreador no ve. Cuántas cuentas tienen cada cruce no se sabe todavía: es lo primero
que hay que contar (inventario, apartado 13.2).

Nota sobre el retraso de los datos: la cuota de impresiones llega con unos 3 días de retraso (04). Para una alerta de hoy, el
motor usa señales rápidas (impresiones, CPC, % en parte superior) y la cuota hasta hace 3 días como contexto; el diagnóstico
se completa solo cuando llega.

### 4.5 Confianza de la causa

Cada causa candidata recibe una nota con cuatro criterios que el código puede comprobar:

| Criterio | Pregunta | Peso [opinión, a calibrar] |
|---|---|---|
| Tipo de evidencia | ¿Es un hecho (404, pago rechazado, acción inactiva) o una inferencia? | Un hecho da confianza alta por sí solo |
| Fecha | ¿El inicio del problema coincide con el evento? | Alto |
| Magnitud | ¿Explica al menos la mitad del cambio? | Alto |
| Contraste | ¿Lo que no tuvo esa causa (otras campañas, otras cuentas del sector) no cayó? | Medio |

Dos topes: «competidor nuevo» nunca pasa de confianza **media** (se infiere con 3-7 días de retraso y solo se sabe quién es
si sale en los resultados rastreados), y los efectos de cambios de Google sin medir en leads salen como **«posible»**.

Y se informa de la **cobertura**: cuántas ramas se pudieron comprobar de verdad. Si el cliente no tiene CRM conectado o la
landing no está rastreada, el mensaje lo dice.

### 4.6 Prioridad de cada hallazgo

La fórmula de la v1 ordenaba por euros en riesgo. Tenía tres defectos que señalaron R2 y R3: las cuentas de 300-500 € al mes
no salían nunca (y son las que se dan de baja), los hallazgos de medición quedaban abajo por no tener euros directos, y no
contaba lo que le cuesta a la agencia. Versión corregida:

```
Prioridad = (Impacto relativo × Confianza × Urgencia × Peso del cliente) / Esfuerzo

Impacto relativo  = impacto mensual en € / inversión mensual de esa cuenta
Peso del cliente  = nivel (A 1,5 · B 1 · C 0,7) × riesgo de baja (1 a 1,5)
```

- **Impacto:** gasto evitable, o leads perdidos × valor del lead (o × CPL máximo si no hay valor). Los hallazgos de medición
  llevan un impacto imputado (inversión mensual × un factor fijo) para que no se hundan en la cola.
- **Confianza:** la probabilidad del método estadístico, o 1 para hechos.
- **Urgencia:** 3 si pierde dinero cada hora (web caída, entrega rota, pago), 2 semanal, 1 estructural.
- **Esfuerzo:** de 1 (un clic) a 5 (rehacer una landing).
- **Nivel** (A, B, C): lo fija Enric (cuota, antigüedad, otros servicios). **Riesgo de baja:** semáforo de AGE-02.

**Suelo y techo de atención.** R2 pide que ninguna cuenta quede sin mirar; R3, que las cuentas pequeñas y ruidosas no se
coman al gestor. No se contradicen si se separan [decisión propia]: hay un **suelo** (toda cuenta recibe una revisión humana
registrada cada N días según nivel: A 7, B 14, C 30; los hechos duros avisan siempre, sea cual sea el nivel) y un **techo**
(horas al mes por cuenta según su cuota, AGE-01). Cuando una cuenta agota su techo, lo estructural que quede no desaparece:
pasa a Enric como «esta cuenta pide más horas de las que paga», que es una decisión comercial.

La fórmula **sirve para ordenar, no para enseñar**. En pantalla se muestra el impacto en euros (como rango cuando no es un
hecho) y la posición en la cola, no el resultado de multiplicar una probabilidad por escalas de 1 a 3. Todos los pesos son
criterio propio y hay que calibrarlos en el modo sombra (apartado 13.2). Las etiquetas de impacto anual de Opteo y el orden
por impacto de TrueClicks y Adalysis van en la misma dirección, pero ninguna publica su cálculo (02).

### 4.7 Cómo se ve el resultado

Plantilla fija de cuatro líneas, siempre en este orden (R2). La segunda es la que faltaba en la v1: sin ella, toda alerta
parece igual de urgente.

> **Reformas López · campaña «Cocinas»**
> **Qué pasa.** 212 clics desde el martes y ningún lead; con su tasa habitual se esperaban entre 4 y 5.
> **Por qué te lo digo ahora.** Que sea casualidad tiene una probabilidad del 1 %, y cada día así son unos 57 € en clics.
> **Qué creo que es y qué he descartado.** La página /reformas-cocina devuelve error 500 desde el martes a las 10:40
> (hecho, confianza alta). Descartado: medición (el CRM tampoco recibe leads de esa página, ni de pago ni orgánicos),
> presupuesto, cambios en la cuenta (ninguno con peso en 14 días). No he podido mirar: subastas (esta cuenta no tiene informe).
> **Qué haría yo.** Avisar a web hoy (encargo creado, plazo: mismo día). Pausar la campaña hasta que la página vuelva: 2
> minutos en Google Ads, enlace directo. Después propondré la exclusión de datos.

Cada hallazgo se puede abrir en tres capas (qué hacer · por qué en esta cuenta · el concepto en tres líneas, apartado 7.5).

### 4.8 Examen del motor: los 26 casos de cada semana

El consultor de cuentas pasó el diseño de la v1 por 26 situaciones que ocurren de verdad en cuentas locales. Resultado de
la v1: 10 bien, 6 a medias, 10 falladas o invisibles; los fallos se concentraban en lo que no se ve desde las métricas de
campaña. Esta lista pasa a ser el **examen de aceptación** del motor (APR-06): antes de enviar un solo aviso, el agente
tiene que detectar y explicar bien cada caso en datos históricos o simulados.

| Caso que la v1 fallaba o resolvía a medias | Qué lo cubre en la v2 |
|---|---|
| El formulario se rompe de verdad (no envía) | MED-03 firma (c), MED-17, MED-18 |
| El formulario envía pero el lead no llega al CRM ni al correo | MED-02 (primera hipótesis: entrega) |
| Tarjeta caducada o pago rechazado | MED-14 (antes del corte), MED-12 (por horas) |
| El cliente deja de coger el teléfono | LLA-01, NEG-03 |
| El cliente entra y cambia cosas tras hablar con un comercial de Google | PRO-08 (autor clasificado) |
| Entra un competidor con presupuesto | CUO-05; se asume confianza media y retraso de 3-7 días |
| Certificado o dominio caducados | PRO-06 |
| Verificación del anunciante vencida | MED-14 |
| Campaña pausada por vacaciones y no reactivada | PRO-13, EST-10 |
| Negocio cerrado en agosto con anuncios activos | EST-10 |
| Lanzamiento de campaña nueva que no arranca o gasta mal | EST-11 |
| Otra campaña del propio cliente o de la agencia anterior | EST-12 |
| Número de seguimiento de llamadas caducado | LLA-03 |
| Formularios de Google que nadie descarga | MED-13 |
| Redirección nueva que borra el identificador de clic | MED-15 |
| Leads baratos que no cualifican tras abrir amplia o AI Max | LEAD-02 quincenal tras el cambio |

Los 10 que la v1 ya resolvía (cambio de formulario con CRM vivo, recomendaciones autoaplicadas, web caída, rechazos, término
que se come el presupuesto, etiqueta duplicada, spam, bajada de objetivo «porque lo pedía Google», presupuesto agotado a
media mañana, festivo local) se mantienen, con dos ajustes: el control del término que se come el gasto pasa a diario
(TER-01) y el doble conteo se dispara también por evento de cambio en la web (MED-04).

Que esté en el catálogo no es que esté resuelto: es que hay una capacidad que debe resolverlo, y el examen dirá si lo hace.

---

## 5. Estadística con pocos datos

El problema de fondo de vuestras cuentas no es que falten algoritmos, es que faltan datos. Con uno a cinco leads al día por
campaña (y muchas veces menos de uno), las técnicas de los grandes anunciantes no sirven, y las reglas fijas de las
herramientas («150 clics sin conversión») llegan tarde o dan falsas alarmas (08). Estos son los métodos concretos. Todo es
cálculo en código: coste de IA, cero.

Los tres revisores rehicieron los cálculos de este apartado y los dieron por correctos. Lo que corrigieron son **las
consecuencias que la v1 no sacaba**: que en las cuentas más pequeñas la estadística llega tarde por diseño, que una regla
evaluada cada semana no tiene el error que dice tener, y que el ejemplo bayesiano se vendía como rapidez cuando era
prudencia. Cada subapartado lleva ahora su límite.

### 5.1 «Sin convertir»: Poisson, y dónde deja de proteger

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

**Primera conclusión:** la regla «2-3 días sin convertir» solo es señal en campañas con 1,5 o más leads al día. En una de
medio lead al día, tres días a cero pasan una de cada cinco veces.

**Segunda conclusión, que la v1 no sacaba (R2):** en una campaña de 6 leads al mes el aviso llega a los 15-20 días, es
decir, después de perder más de medio mes. Para esas cuentas, que probablemente son muchas, **la estadística sobre leads no
protege de nada**. Lo que protege es mirar más arriba en el embudo, donde hay volumen, y comprobar los hechos:

- prueba activa del formulario y de la landing cada día (MED-18);
- sesiones e inicios de formulario de GA4 como señal adelantada (10-50 veces más volumen que los leads);
- latido de leads de todos los canales (MED-17) y llamadas (LLA-03);
- los hechos duros del apartado 4.2.

Cómo se aplica la regla donde sí sirve:

1. **Sobre clics, no sobre días** (regla principal, no un ajuste). Con n clics y una tasa de conversión esperada CR, lo
   esperado es μ = n × CR y P(0) = e^(−μ). Así, si el gasto también cayó, la regla no acusa a la conversión: manda a la
   rama de entrega. Es la comprobación de Ani: sin clics suficientes no puede haber conversiones (10 §4.1).
2. **Binomial negativa por defecto**, no Poisson: los leads llegan a rachas y Poisson se queda corto de ceros (08).
3. **λ y CR salen de la media de 8 semanas**, no de la mediana del mismo día de la semana: con recuentos bajos esa mediana
   es 0 o 1 y no sirve (R1).
4. **A diario solo a nivel de cuenta; por campaña, semanal.** Resuelve la contradicción de la v1 entre «la rutina diaria no
   mira conversiones de ayer» y una alerta diaria de conversiones por campaña.
5. **El umbral no es un α fijo.** Un 2 % por campaña y día, sobre unas 100 campañas, son varias falsas alarmas por semana
   cuando los incidentes reales son menos que eso (R1, R2 y R3 coinciden). La corrección por pruebas múltiples hay que
   aplicarla **también a lo largo del tiempo**, no solo entre cuentas. En la práctica: se repiten 90 días de histórico y
   se ajusta el umbral hasta que las falsas alarmas quepan en el presupuesto de atención (apartado 7.3). Hasta hacerlo, no
   se envía nada (modo sombra).

Afirmación rebajada: ninguna de las cuatro herramientas analizadas **documenta** un método de este tipo (Opteo usa 4 días
fijos; 02). No es lo mismo que «nadie lo usa».

### 5.2 «Gasto sin conversión»: la regla e^(−k), y su trampa

La regla de oficio «pausar tras gastar 2-3 veces el CPA objetivo sin convertir» tiene base exacta. Si un término convirtiera
de verdad al ritmo del objetivo, gastar k veces el CPA objetivo sin ninguna conversión tiene probabilidad e^(−k):

| k (veces el CPA objetivo gastadas) | 1 | 1,5 | 2 | 2,5 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|---|
| Probabilidad de que sea un término «bueno con mala suerte» | 37 % | 22 % | 13,5 % | 8 % | **5 %** | 1,8 % | 0,7 % |

Ejemplo: CPA objetivo 40 €, CPC 2 € (tasa necesaria 5 %). Con 40 clics a cero (80 €, k = 2) la probabilidad es 12,9 %; con 60
clics (120 €, k = 3), 4,6 %.

**La trampa (R1; error real de la v1).** Ese 5 % vale para **una sola mirada**. Si la regla se evalúa cada semana sobre
cientos de términos y salta en cuanto aparece una racha, se comete el mismo error que el apartado 5.6 critica en los tests
de anuncios: mirar hasta que algo cruce el umbral. Un término que convierte justo en objetivo 12 veces al año tiene un 46 %
de probabilidad de sufrir al menos una racha de 3 × CPA sin conversión; con 30 conversiones al año, un 79 %. La v1 habría
ido negativizando términos buenos con mala racha, y una negativa no caduca sola.

Reglas corregidas:

- La regla se aplica **al total del término en la ventana (o en su vida)**, nunca a una racha.
- Si el término ha convertido alguna vez, se juzga por su **CPA acumulado**, no por el tramo malo.
- La negativa estadística se pone **en exacta y con fecha de revisión** a 6 meses (TER-12). La negativa de frase solo por
  intención o por n-grama con evidencia agregada.
- Solo prueba que el término es peor que «justo en objetivo». Uno al 60 % del objetivo también es malo y pide más datos.
- Hay que contar las conversiones del CRM donde existan.

### 5.3 Bayesiano jerárquico: pedir prestados datos al grupo y al sector

La tasa de conversión de un término con pocos clics se «encoge» hacia la de su grupo:

```
Punto de partida:  CR ~ Beta(α₀, β₀)   con  α₀ = m × μ ,  β₀ = m × (1 − μ)
   μ = tasa del nivel superior ;  m = fuerza del punto de partida, en «clics equivalentes» (20-200)
Tras c conversiones en n clics:  Beta(α₀ + c, β₀ + n − c)
Estimación encogida:  (m × μ + c) / (m + n)
Decisión:  P(CR ≥ CR*) , con  CR* = CPC / CPA objetivo
```

**Jerarquía:** término → palabra → grupo → campaña → cuenta → sector (varias cuentas). Condición: que las conversiones
signifiquen lo mismo (una llamada de fontanero de urgencias no es un formulario de clínica), así que se normaliza por tipo
de conversión (08 §2.3).

**Qué da de verdad y qué no** (corregido; R1 y R2 tenían razón contra la v1):

- **No da rapidez.** En el ejemplo de la v1, con la media del sector como punto de partida, el agente esperaba hasta 180 €
  (4,5 × CPA) donde la regla de oficio corta en 120 €, y se presentaba como ventaja. Lo que da es **menos falsos positivos**
  y una probabilidad explícita. El corte rápido lo da el **juez de intención**: un término claramente ajeno se excluye a los
  5 clics, sin esperar a ninguna estadística.
- **El punto de partida de un término nuevo no es la media del sector.** Los términos nuevos que entran por concordancia
  amplia son peores que la media: los buenos ya son palabras clave. Se parte de la tasa de **los términos nuevos** de la
  cuenta o del sector.
- **Se decide por pérdida esperada**, no solo por «P < 10 %»: euros que se seguirán gastando si el término es malo, frente a
  leads que se pierden si era bueno y se corta.

**Ejemplo recalculado.** CPC 2 €, CPA objetivo 40 € (CR* = 5 %). Las campañas del sector convierten al 8 %, pero sus términos
nuevos solo al 4 % [cifra ilustrativa]; con m = 50, el punto de partida es Beta(2, 48).

| Caso | Tasa ingenua | Estimación encogida | P(cumple el objetivo) | Qué hace el agente |
|---|---|---|---|---|
| Término nuevo, sin datos | — | 4,0 % | 29 % | Vigilar; si la intención es mala, fuera ya |
| 0 conversiones en 30 clics (60 €) | 0 % | 2,5 % | 9 % | Candidato a negativa exacta con caducidad |
| 0 en 45 clics (90 €) | 0 % | 2,1 % | 4,8 % | Negativa |
| 1 en 30 clics | 3,3 % | 3,8 % | 24 % | Seguir: aún no se sabe |
| 3 en 10 clics | 30 % | 8,3 % | 83 % | Bueno, pero no un 30 %: «término protegido» |

Con el punto de partida honesto, el método corta **antes** que k = 3 (120 €) en los términos nuevos sin conversiones, y
protege a los que han dado alguna. Reglas de decisión de partida [opinión, a calibrar]: actuar si P(cumple) < 10 % y el
gasto es material; «vigilar» entre 10 % y 30 %.

**El último nivel (sector) hay que ganárselo.** La v1 lo anunciaba como «el sector entero como referencia». Con 25 cuentas
repartidas en varios sectores, sector × provincia × tipo de campaña deja casi todas las celdas con una cuenta (R1, R2 y R3
coinciden). Regla: el nivel de sector solo se usa en celdas con **3 o más cuentas**, sin partir por provincia; en el resto,
la jerarquía termina en la cuenta. Cuántos sectores llegan a 3 cuentas es una de las cifras del inventario (apartado 13.2).
Por eso esta pieza va **al final** del orden de construcción y no al principio.

**Dos ideas propias sobre esta base [opinión, sin validar]:**

- **Punto de partida semántico.** Un término cercano a los servicios de la ficha (por embeddings) parte de una media más
  alta; uno lejano, de una más baja, y llega antes al umbral. Así se unen el juez de intención y la estadística en un solo
  número (el desacuerdo «números o intención» del apartado 1.2).
- **La fuerza m se calibra con los datos:** si los términos de una cuenta convierten todos parecido, m sale grande; si son
  muy dispares, pequeño (bayes empírico; 05 §5.3). La referencia académica es el modelo DHEB de Adobe (08 §2.3).

Para comparar tasas con pocos datos sin punto de partida, el intervalo correcto es el de Wilson: 2 conversiones en 40 clics
dan un intervalo del 1,4 % al 16,5 %, es decir, un CPA entre 12 € y 145 € con CPC de 2 €. No se puede decidir (05 §5.2).

### 5.4 Madurez de las conversiones

Google atribuye la conversión al **día del clic**. Un lead que llega dos días después «rellena» el pasado, así que los
últimos días pueden parecer peores de lo que son. El agente construye, por cuenta y por acción, la curva F(d): qué fracción
de las conversiones ya está registrada d días después del clic.

```
Conversiones finales estimadas de un día con antigüedad d  =  observadas / F(d)
```

**Alcance, corregido (R1).** La v1 lo presentaba como problema central. En formulario y llamada de un negocio local la
conversión suele caer en la misma visita: la curva será casi plana y no hay nada que corregir. Donde importa de verdad es en
el **lead cualificado y la venta del CRM** (días o semanas) y en cuentas con atribución basada en datos y ciclos largos. Por
eso se mide por cuenta en vez de suponerlo, y no retrasa nada del arranque.

Ejemplo ilustrativo de una acción que sí madura despacio (corregido: la v1 aplicaba a «ayer» el factor del día en curso):
F(0) = 0,70; F(1) = 0,85; F(3) = 0,90; F(7) = 0,97. Ayer (un día de antigüedad): 120 € y 2 leads, CPL aparente 60 €.
Corregido: 2 / 0,85 = 2,35 leads, CPL de 51 €. El día en curso (F(0) = 0,70) nunca se puntúa.

Reglas: donde F(1) < 0,85, las reglas de CR o CPA no usan los días inmaduros y en pantalla salen en gris. Cada acción tiene
su curva. Para las alertas de «hoy no hay leads» se usa la métrica por fecha de conversión
(`conversions_by_conversion_date`), no la de fecha de clic (04 §5).

### 5.5 Línea base y umbrales adaptativos

**De dónde sale.** Google guarda 37 meses de datos diarios. Al dar de alta una cuenta se descarga ese histórico y **la línea
base existe desde el primer día**; la v1 dejaba entender que había que esperar 6-8 semanas (R2). Lo que sí empieza de cero
es lo que Google no guarda (apartado 8.3).

**El arranque en Navidad.** Si el módulo empieza a vigilar en diciembre-enero, las últimas 6-8 semanas son Black Friday,
Navidad y Reyes. Dos medidas: la línea base se calcula con el histórico, marcando esos periodos (y Semana Santa y agosto)
como especiales, y durante esas semanas las anomalías de volumen van como «para que lo sepas», no como alerta.

**Método según el volumen** (la v1 daba uno solo; R1 y R2 mostraron que falla en campañas pequeñas):

| Tamaño de la serie | Método |
|---|---|
| Métricas con volumen (decenas de clics al día o más) | Mediana y MAD del mismo día de la semana, 6-8 semanas: `z = 0,6745 × (valor − mediana) / MAD` |
| Recuentos bajos (5-10 clics al día, leads) | La MAD es 0 o 1 y el z se dispara: media de 8 semanas y Poisson o binomial negativa, **también para clics** |
| Cualquiera | Suelo absoluto en euros o unidades, siempre |

Ejemplo del primer caso: clics de los últimos seis martes: 40, 46, 38, 52, 44, 41. Mediana 42,5; MAD 3,0. Hoy, 22 clics:
z = −4,6, anomalía clara. Con 36 clics, z = −1,5: ruido.

Higiene: fuera el día en curso, los días ya marcados como anómalos (si no, un problema persistente «se normaliza» solo), los
festivos de la zona y los cierres del cliente. Para derivas lentas, CUSUM o tendencia de 4-8 semanas (PRO-04).

**Umbrales adaptativos.** Lo que más reduce las falsas alarmas no es afinar el umbral estadístico sino poner suelos (05 §6.3):

| Mecanismo | Regla |
|---|---|
| Suelo de materialidad | No se avisa por debajo de un impacto mínimo, **relativo a la inversión de la cuenta** (apartado 4.6) |
| Cambio absoluto además del relativo | Un +50 % sobre 4 clics no es nada |
| Persistencia | En métricas ruidosas, 2 de 3 periodos anómalos |
| Jerarquía | Se detecta en cuenta y campaña; se baja a término solo para explicar |
| Muchas pruebas a la vez **y repetidas cada día** | Corrección de falsos descubrimientos entre cuentas y calibración en el tiempo (5.1) |
| Presupuesto de atención | El umbral se fija para que salga lo que una persona lee de verdad: por persona y sumando todos los módulos (apartado 7.3). Si un día hay 14 hallazgos sobre el corte, el fallo es del umbral, no del día |
| Realimentación | Las respuestas del gestor ajustan prioridad y presentación, no detección (apartado 7.4) |

### 5.6 Tests de anuncios sin autoengaño

Martin Röttgerding dejó correr 576 tests entre anuncios **idénticos**: el 55 % de los que tenían ≥1.000 impresiones salió
«significativo al 95 %» en algún momento, y el 81 % con 100.000 (01 §2.12). Mirar el test cada día y parar al primer «95 %»
no es estadística.

**Alcance, corregido (R1).** Un grupo de anuncios local no reúne 7 conversiones por anuncio en meses: en la mayoría de
estas cuentas **no hay test posible**, y la capacidad (ANU-03) queda aparcada. Lo que se mantiene es la lección: mejor no
testar que testar mal, y bastan la cobertura mínima (ANU-01) y la sustitución de recursos que no rinden (ANU-02).

Método para las cuentas con volumen: métrica **conversiones por impresión** (Geddes); solo red de Google; probabilidad
bayesiana de que A supere a B; **horizonte fijado de antemano** (mínimo una semana completa; mínimos de Adalysis para
tráfico bajo: 350 impresiones y 7 conversiones por anuncio); y la lógica de «Test & Roll» (Feit y Berman): con poblaciones
pequeñas conviene decidir minimizando la pérdida esperada, no esperar una significancia que nunca llegará (08 §2.5).
Limitación: Google ya rota las combinaciones a su manera; el único A/B limpio son los experimentos de campaña.

### 5.7 Presupuesto: lo que cuesta el lead adicional y lo que vale

Con rendimientos decrecientes, Conv = a × gasto^b (con b entre 0 y 1), el coste del lead **adicional** es el CPA medio
dividido por b. Con b = 0,7, el siguiente lead cuesta 1,43 veces el medio: una campaña justo en objetivo empeora un 43 % el
coste de cada lead extra si se le sube el presupuesto (08 §5.1).

Tres correcciones de la v2 (R1 y R3):

1. **No se iguala el CPA marginal, sino el retorno marginal.** Igualar el CPA marginal entre campañas solo es óptimo si un
   lead vale lo mismo en todas. Entre servicios de valor distinto se iguala `valor del lead ÷ CPA marginal`. Ejemplo:
   «Cocinas», lead que vale 200 € y cuesta 60 € el adicional (retorno 3,3); «Baños», lead de 80 € que cuesta 40 € el
   adicional (retorno 2,0). El euro siguiente va a Cocinas aunque su lead sea más caro.
2. **El lead adicional se compara con el CPL máximo** del acuerdo (apartado 2.2), no con el CPL medio. La v1 se contradecía:
   CUO-02 proponía subir presupuesto porque «el CPL está en objetivo» mientras este apartado decía que el siguiente lead
   cuesta un 43 % más.
3. **Tope de capacidad.** Ningún reparto lleva a un servicio más leads de los que el cliente puede atender (NEG-02).

La curva sale de los simuladores de Google por API [cobertura por comprobar], de la cuota perdida por presupuesto y, con
pocos datos, de la referencia de la cuenta. En muchas cuentas pequeñas no habrá curva estimable: entonces el agente lo dice
y no inventa un escenario.

### 5.8 Qué no aplica a estas cuentas, y con qué se sustituye

| Técnica | Por qué no | Sustituto |
|---|---|---|
| Conversion Lift de Google | Pide unos 5.000 $ y unas 1.000 conversiones por estudio | Experimentos de campaña de Google, en las cuentas con volumen |
| Geoexperimentos | Un negocio local tiene una sola zona | **Prueba por semanas alternas** (abajo); aleatorizar entidades dentro de una cuenta (APR-03) |
| Modelos de mezcla de medios (Meridian) | Dos años de datos semanales, idealmente 50 zonas | Series de control: Search Console y campañas no tocadas (método CausalImpact) |
| Modelos de atribución entre canales | No hay datos | **Leads totales del negocio** y coste de captación combinado (NEG-06) como árbitro |
| Detectores de anomalías estándar sobre leads diarios | Con recuentos muy bajos rinden apenas mejor que el azar | Señales con más volumen que adelantan el problema, prueba activa y hechos duros (5.1) |
| Experimentos entre cuentas | 25 cuentas distintas no dan potencia, y hay que poder explicarle a un cliente por qué no recibió una mejora | Dentro de una cuenta |

Fuente: 08 §3.2 y §4.4; filas 2, 4 y 6 añadidas en la revisión.

**Prueba por semanas alternas** (R3; sustituye al geoexperimento en negocios de una sola zona). Encender y apagar por
semanas completas, de cuatro a ocho semanas, y medir **leads totales en el CRM**, clics orgánicos en Search Console y
llamadas desde la ficha; no las conversiones de Google Ads. Sirve para marca, remarketing y socios de búsqueda. Límites que
hay que decir: con menos de unos 10 leads por semana en lo que se prueba, el resultado será «no concluyente»; y con Smart
Bidding el encendido y apagado altera el aprendizaje, así que lo probado debe ir en campaña aparte y con puja sencilla.

---

## 6. Dónde usar IA y dónde no

### 6.1 Reparto por tipo de tarea

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

### 6.2 El patrón de agente seguro

Coinciden en él los practicantes (Rooijmans, Wenner, Vallaeys, Leake), el servidor oficial de Google (proponer y confirmar)
y la literatura (HOBA: el modelo propone parámetros, el código los recorta) (01 §4, 04 §4.9, 08 §7).

| Paso | Qué ocurre | Quién | Detalle |
|---|---|---|---|
| 1. **Proponer** | Hallazgo → propuesta con datos, rango de fechas, impacto en €, probabilidad y cómo deshacerla | Código; la IA redacta | Las propuestas R2 y R3 declaran su predicción (APR-01); las R1 se evalúan en conjunto |
| 2. **Validar con código** | Límites duros: cambio máximo por día y por semana (±20 % en objetivos y presupuestos), nunca fuera de la banda de presupuesto del acuerdo ni por encima de la capacidad del cliente, límites del modo sector sensible (apartado 12.3), nunca pausar la marca ni la única campaña activa, «manos quietas» (PUJ-06), conflictos de negativas, sector regulado, simulación con `validate_only` | Código | Lo que no pasa no llega a la persona |
| 3. **Aprobar** | Con fricción proporcional al riesgo (apartado 7.6): R0 no necesita; R1 por lotes con excepciones; R2 una a una; R3 con una frase escrita y segunda persona; RC no se aprueba aquí: va al cliente como argumento | Persona | Se guarda quién, cuándo y por qué. Descartar con motivo enseña al agente |
| 4. **Aplicar** | Por la API, con una etiqueta de Google Ads en lo tocado y registro propio del valor antes y después | Código | Comprobar que lo aplicado es exactamente lo aprobado: Wenner vio agentes cuyo razonamiento no coincidía con el cambio hecho |
| 5. **Medir** | Solo R2 y R3, al cerrar la ventana y contra el mejor control disponible (APR-02). Si las métricas de protección caen, propuesta de vuelta atrás | Código | Resultado: funcionó, no concluyente o perjudicó. Con estos volúmenes, «no concluyente» será lo más frecuente, y se dice |
| 6. **Aprender** | El resultado medido, con su incertidumbre, actualiza la tasa de acierto por tipo de acción (por sector, solo si algún día hay cuentas suficientes) | Código | Nunca conclusiones en prosa del propio agente (ver abajo) |

**Mientras el agente no escribe** (así nace), los pasos 3 y 4 los hace el gestor a mano en Google Ads: el agente entrega la
salida lista para pegar y cierra la propuesta solo cuando ve el cambio en el historial (apartado 7.2).

Sobre el paso 6: las memorias de agente que guardan «reflexiones» asumen que el agente acierta al explicar por qué algo
funcionó. Con datos ruidosos, una conclusión equivocada se queda grabada y el agente deja de probar lo que «no funciona»
(crítica «Honest Lying», 08 §7.3). Por eso la memoria guarda **resultados medidos, con caducidad y con un mínimo de
exploración**.

### 6.3 Guardarraíles específicos de la IA sobre datos de Ads

- **Fecha explícita en cada consulta** (sin fecha, cada modelo elige un periodo distinto; Geddes, 01).
- **Validación de magnitud** antes de cualquier propuesta de puja o presupuesto.
- **Un agente, una tarea, pocas herramientas.** Wenner creó unas 140 funciones y solo unas 30 sirven en producción; por
  encima de 10-12 herramientas por agente, inestabilidad (01 §4).
- **Umbral de confianza.** El juez de términos puntúa su seguridad; ≥85 % propone con prioridad, por debajo pregunta
  (Rooijmans). Es un umbral de partida que se calibra con casos de desenlace conocido, no solo con las correcciones del gestor
  (apartado 7.4).
- **Contexto del cliente siempre.** El juez de Rooijmans quiso negativizar coches baratos a un cliente que sí los aseguraba.
  Con la ficha (servicios, zona, lo que no hace) ese error se evita; es la queja nº 1 contra Opteo («no entiende el
  contexto», 10 §3.2).
- **Examen antes de activar o cambiar un prompt** (ya es regla del proyecto) y casos de oro (APR-06): las actualizaciones de
  modelo cambian el comportamiento con los mismos datos.
- **Ningún dato identificable de un lead llega a un modelo** (nombre, teléfono, texto libre del formulario, transcripción)
  sin que el contrato de encargo lo cubra. Para clasificar leads basta la etapa y metadatos (apartado 12.2).
- **La responsabilidad es de la agencia**, no del modelo (Kirk Williams, 01): por eso la traza de quién aprobó.

### 6.4 Organización propuesta [opinión]

Agentes estrechos coordinados por el núcleo, encajados en el organigrama que ya existe (un «Jefe de Google Ads» al estilo
del Jefe SEO): **Vigía** (solo código: reglas y anomalías), **Diagnosticador** (código + Sonnet), **Juez de términos**
(embeddings + Haiku), **Redactor** (Sonnet), **Auditor** (Opus, por evento) y **Estratega** (Fable u Opus, trimestral,
siempre sobre el guion fijo de PLAN-05: sin guion produciría prosa cara).

Esto es **arquitectura interna, no interfaz**. Hacia el usuario hay una sola voz: si cada agente escribiera por su lado se
rompería «una alerta por causa» (R2).

---

## 7. La experiencia de uso: un puesto de trabajo, no un analista

Apartado nuevo en la v2. La v1 tenía 120 capacidades y ninguna pantalla, ningún flujo del día y ningún reparto de quién
hace qué. «Así nacen las herramientas que se abandonan» (R2, aceptado). Las cifras de tiempo de este apartado son
estimaciones de oficio del revisor, no mediciones: la línea base real hay que medirla (apartado 13.2).

### 7.1 Cinco pantallas (y las que no hacen falta)

| Pantalla | Qué es | Detalle que importa |
|---|---|---|
| **Hoy** | Bandeja única: urgente · por decidir · esperando a terceros · vencido | Es la página de inicio. Arriba: «comprobadas 25 cuentas, 1.240 controles, 4 cosas para ti» (enseña que se ha mirado) |
| **Cartera** | Todas las cuentas en una tabla: nivel de cliente, ritmo de gasto, CPL frente a objetivo, estado de la medición, riesgo de baja, último toque humano, próxima revisión | Es la pantalla de Enric y la que sustituye a la sensación de «las he mirado todas». En rojo, las revisiones vencidas |
| **Cuenta** | Expediente: acuerdo de objetivos, guion de revisión, línea de tiempo (cambios nuestros, de Google, de la web; sucesos; notas), hallazgos, pendientes del cliente, decisiones y no-decisiones | Es también el documento de traspaso. Prueba de fuego: ¿podría otra persona llevar la cuenta mañana leyendo solo esto? |
| **Lote de términos** | Por cuenta, agrupado por motivo («fuera de zona: 14», «empleo o curso: 9», «servicio que no ofrece: 6», «dudosos: 5») | Aprobar el grupo, sacar excepciones, y **salida lista para pegar** |
| **Hallazgo** | El diagnóstico del apartado 4.7, con evidencia, lo descartado y los botones de respuesta | Con enlace directo a la entidad en Google Ads |

**No tienen pantalla propia al principio** (viven como evidencia dentro de un hallazgo o del expediente): las once métricas
de cuota de impresiones, el nivel de calidad diario, el «gasto invisible», el benchmark, los gráficos de descomposición y
«preguntar a la cuenta». Un gestor que aún no domina la cuota de impresiones no necesita un tablero de cuota: necesita que
le digan cuándo importa y por qué.

**Regla de producto:** por dentro, unas 150 capacidades; a la vista, **no más de 12-15 tipos de hallazgo** en el
lanzamiento. Y **una sola voz**: los agentes del apartado 6.4 son arquitectura interna; el usuario nunca recibe mensajes de
«Vigía», «Diagnosticador» y «Juez» por separado.

**Guion de revisión de cuenta** (dentro de la pantalla Cuenta; lo que el gestor necesita el día de revisión profunda en
vez de abrir ocho tableros):

1. ¿Está sana la medición? (una línea, con enlace si no)
2. ¿Vamos en ritmo de gasto y en objetivo de CPL? (dos cifras con contexto)
3. ¿Qué cambió desde la última revisión? (línea de tiempo)
4. ¿Dónde se va el dinero sin resultado? (3 elementos, no 30)
5. ¿Dónde hay margen? (3 elementos)
6. ¿Qué se espera de terceros? (cliente, web, SEO)
7. Cerrar: «revisada», con una nota de una línea y la fecha de la próxima.

### 7.2 El día de Eury, y lo que deja de hacer

**Lo que la v1 no decía.** No decía qué deja de hacer Eury (si nadie retira la revisión L-X-V, hará las dos cosas), ni
dónde aplica los cambios (en solo lectura, a mano en Google Ads: doble trabajo), ni qué pasa fuera de horario (un aviso un
sábado a alguien que no trabaja y que no puede actuar es solo estrés).

**Un lunes con el diseño de la v1** [estimación de R2]: 30-45 minutos de avisos urgentes del fin de semana, 60-90 de parte
diario, 30-40 de un resumen de 25 bloques que a la tercera semana no se lee, y 3,5-5 horas de términos entre revisarlos y
aplicarlos a mano. El lunes entero. No era peor que hoy, pero tampoco el ahorro que prometía el resumen: las fases 0 a 2 de
la v1 le añadían lectura sin quitarle ni un minuto.

**Cómo queda en la v2:**

| Momento | Qué hace | Tiempo objetivo [a medir] |
|---|---|---|
| Cada mañana | Pantalla Hoy: como mucho 5 decisiones y 3 «para que lo sepas» | 20 min |
| Un día fijo por cuenta | Lote de términos de esa cuenta (5 cuentas al día cubren las 25 en la semana) | 5-10 min por cuenta |
| Según nivel de cliente | Revisión de cuenta con guion (A cada 7 días, B cada 14, C cada 30) | 20-30 min |
| Cuando ocurre | Interrupción: como mucho 2 al día, en horario laboral | — |
| Viernes | Caso de la semana (5 min) y, al principio, 30 min con Enric: qué sobró, qué faltó, qué no se entendió | — |

Cuatro piezas hacen que esto sea ahorro y no trabajo añadido:

- **Cierre automático por historial de cambios.** Si Eury aplica el cambio en Google Ads, el agente lo ve en el historial y
  cierra la propuesta solo, anotando quién y cuándo. Nada de marcar «hecho» a mano. Es lo que hace soportable el solo
  lectura. [Depende de que el historial recoja los cambios hechos con Google Ads Editor: por comprobar, apartado 9.2.]
- **Salida lista para aplicar.** Cada lote de negativas genera el texto para pegar o el archivo para Editor, más el enlace
  directo.
- **Retirar el ritual viejo, por escrito.** «Desde el día X ya no se revisan todas las cuentas lunes, miércoles y viernes.
  Se hace: Hoy cada mañana, un lote de términos por cuenta a la semana y revisión de cuenta según nivel.» La pantalla
  Cartera demuestra la cobertura. Es decisión de Enric (apartado 13.1).
- **Dos decisiones adelantadas.** El primer ahorro grande llega cuando las negativas aprobadas se aplican con un clic, y los
  avisos de fin de semana solo sirven si existe una pausa de emergencia acotada. La v1 dejaba ambas para la última fase.
  Siguen siendo línea roja del proyecto: las decide Enric, pero **al empezar**, no al final (apartado 13.1, decisiones 9 y 10).

**Ahorro esperado por paso** [estimación de R2, no medida]: la pantalla Cartera sustituye al «entrar en las 25 cuentas a
ver si pasa algo»; el lote de términos en solo lectura baja esa tarea de 8-10 horas a la semana a 3-5; con aplicación en un
clic, a 1,5-2. El diagnóstico ahorra tiempo solo cuando hay incidente (1-2 horas a la semana).

### 7.3 Presupuesto de atención

La v1 hablaba de «unas 10 alertas por mañana» sin decir de quién. Diez diarias para una sola persona no es «informar por
excepción» (R1 pedía 3 urgentes al día; R2, el reparto de abajo; se adopta el de R2, que es compatible con el de R1 y más
completo). El tope es **por persona y sumando todos los módulos**: Eury ya recibe avisos de Operaciones y de SEO.

| Canal | Qué entra | Tope de partida |
|---|---|---|
| **Interrupción** (Telegram, al momento) | Solo lo que pierde dinero cada hora **y** tiene acción posible ahora: web o formulario caídos con gasto, gasto desbocado, pago o suspensión, rechazo de lo que más gasta | **2 al día**; el tercero y siguientes se agrupan en uno. Solo en horario laboral, salvo lo que cubra la pausa de emergencia |
| **Parte de la mañana** (pantalla Hoy y un único mensaje) | Hallazgos nuevos con decisión | **5 con decisión + 3 «para que lo sepas»**. Lo demás espera en la cola, ordenado, y la pantalla dice «9 más por debajo del corte» |
| **Lote semanal** | Términos, higiene, oportunidades | Un lote por cuenta, en su día. Nunca a goteo |
| **Revisión de cuenta** | Lo estructural y lo estratégico | Solo dentro del guion; nunca como aviso |

**Agrupación.** Una alerta por causa y por cliente; una sola por causa común entre cuentas, con la lista dentro; los
términos nunca son alertas individuales; dos hallazgos sobre la misma entidad en 7 días se funden en uno con historial.

**Silencios, cada uno con fecha de fin visible:**

- Mientras hay un encargo abierto que cubre la causa: silencio hasta su fecha de entrega; si vence, **un** recordatorio y
  escalado.
- «Esperando al cliente»: silencio hasta la fecha que ponga el gestor; el pendiente pasa al informe del cliente.
- Tras un cambio propio en esa campaña: 2 ciclos de conversión o 14 días («manos quietas» aplicado también a los avisos).
- Cuenta en alta (primeras 2-4 semanas): solo interrupciones; lo demás va a la auditoría de entrada.
- Navidad, Semana Santa, agosto, festivos locales y cierres del cliente: las anomalías de volumen, como «para que lo sepas».
- Posponer 1, 7 o 28 días, con un máximo de dos posposiciones: a la tercera, decidir o descartar con motivo.
- Modo ausencia del gestor: solo interrupciones (al suplente) y lo que vence; al volver, un parte de vuelta.

**Recordatorios.** Un hallazgo abierto no se reenvía. Vive en Hoy con «días abierto» y coste acumulado, y solo vuelve a
avisar si empeora de forma material o si vence su plazo.

Todos los topes son valores de partida: se calibran en el modo sombra, antes de enviar nada (apartado 13.2).

### 7.4 Respuestas que enseñan al agente

Sustituyen al «útil / no útil / ya lo sabía» de la v1, que mezclaba cosas distintas.

| Respuesta | Efecto en el sistema |
|---|---|
| Hecho / lo hago | Seguimiento y cierre automático por historial de cambios |
| Ya lo sabía | No cambia umbrales. Si se repite, el agente llega tarde: revisar la frecuencia de esa regla |
| **El cliente lo quiere así** | Pide una frase y propone guardarla como **regla permanente del cliente** («no excluir "barato"», «la campaña X no se toca»). Es la respuesta más valiosa: hoy eso solo está en la cabeza de Eury |
| No compensa (poco dinero) | Sube el suelo de materialidad de esa cuenta y ese tipo, con tope y caducidad de 90 días |
| Los datos están mal | Abre un hallazgo de medición; no toca umbrales |
| No estoy de acuerdo con la causa | No toca nada. Va a la revisión semanal con Enric y a los casos de oro |
| No lo entiendo | No toca nada. Marca la explicación como mejorable y abre la capa de concepto (7.5) |
| Ahora no | Posponer con fecha |

**Regla dura: el agente no aprende del aprendiz sin supervisión.** La v1 reajustaba umbrales con los «no útil» del gestor
(APR-07). Si Eury marca «no útil» los avisos de cuota perdida por ranking porque aún no sabe qué hacer con ellos, el agente
aprende a callar justo lo que Eury no domina. Por eso:

- las respuestas ajustan **prioridad y presentación, nunca detección**;
- ninguna respuesta de una sola persona cambia un umbral de forma automática y permanente: los ajustes se proponen en un
  resumen mensual que aprueba quien haga de sénior;
- los **casos de oro** no son «lo que hizo Eury» (eso enseñaría el nivel básico que el brief quiere superar), sino
  incidentes con desenlace conocido.

Pregunta abierta que esto destapa: **quién hace de sénior** si Eury es la única persona que sabe de Google Ads (apartado
13.1, decisión 17). Si la respuesta es «nadie», el agente será el sénior de hecho y los controles de 7.6 dejan de ser
opcionales.

### 7.5 Cómo aprende el gestor

La v1 le dedicaba dos líneas. El agente va a hablarle a Eury justo de lo que el brief dice que aún no domina (cuota de
impresiones, subastas, parte superior).

- **Tres capas en cada hallazgo:** qué hacer · por qué en esta cuenta · el concepto, en tres líneas y con enlace al
  glosario que la herramienta ya tiene. La tercera capa sale abierta las primeras veces que aparece ese concepto y plegada
  después.
- **Nivel por familia, no global.** Eury es sénior en términos y novato en cuota. Para cada familia: *aprendiz*
  (explicación completa; las propuestas R2 o superiores las confirma Enric), *autónomo* (explicación breve), *experto*
  (solo el dato).
- **Explicar también lo que NO se propone:** «No toco el presupuesto aunque Google lo recomienda, porque la campaña lleva 6
  días desde el último cambio». Enseña criterio, que es lo que más cuesta.
- **Caso de la semana:** un incidente real ya cerrado, de cualquier cuenta, con lo que se vio, lo que se descartó y cómo
  acabó. Cinco minutos los viernes.
- **«Primero tú».** Antes de enseñar la causa: «CPL +40 % en Cocinas. ¿Qué mirarías primero?», con cuatro opciones; después
  se muestra el árbol. Diez segundos, y es la única forma de aprender a diagnosticar en vez de a leer diagnósticos.

Dos matices propios sobre lo que propone R2 [opinión; aplico el criterio del proyecto de diseñar con psicología los
sistemas que miden al equipo]:

1. **El nivel lo fijan Enric y Eury hablando, no un cálculo.** R2 propone subir de nivel «con decisiones que luego salieron
   bien». Con estos volúmenes casi ninguna decisión tiene un resultado medible, así que el cálculo sería ruido con
   apariencia de nota. Y una nota calculada sobre una sola persona se vive como examen permanente.
2. **«Primero tú» es voluntario y sus aciertos no se informan a nadie.** Se le ofrece a Eury como entrenamiento; él elige la
   frecuencia. Si se convierte en control, deja de enseñar.

**Descualificación.** Si el agente diagnostica siempre, Eury no aprenderá a hacerlo y la agencia dependerá por completo de
la herramienta. Es aceptable solo si se decide a sabiendas. Mi recomendación: «primero tú» y una revisión de cuenta al mes
hecha sin diagnóstico previo y comparada después.

### 7.6 Controles contra aprobar sin pensar

Es el riesgo principal en cuanto haya aprobación con un clic, y la v1 no lo nombraba.

| Control | Regla |
|---|---|
| Fricción proporcional al riesgo | R1: lote con excepciones. R2: una a una, marcando **qué evidencia convence**. R3: una frase escrita y segunda persona |
| Tope de lote | Ningún clic aprueba más de N cambios ni más de una cuenta a la vez |
| Muestra ciega | Cada semana, un 5-10 % de lo aprobado en R1 lo revisa un segundo juez (otra persona si la hay; si no, un juez de IA con otro prompt y Enric sobre los desacuerdos) |
| Señales de piloto automático | Tasa de aprobación por encima del 95 % en 4 semanas, mediana de menos de 10 segundos por propuesta R2, cero excepciones en lotes de términos |
| Retrospectiva mensual | Las 5 decisiones que peor salieron y las 5 mejores, del gestor y del agente por igual |
| Control de calidad del trabajo humano, sin vigilancia | Cambios manuales R2 o R3 hechos fuera de una propuesta: el agente pide una línea de motivo (una vez, en Hoy) y abre su evaluación. Avisos de oficio tras el hecho: cambio de más de ±20 %, segundo cambio grande en 14 días, cambio en campaña en aprendizaje, campaña lanzada en viernes, recomendación de Google aplicada tal cual |

Dos cosas que **no** adopto de la propuesta de R2, con su motivo:

- **Las señales de piloto automático no van «a Enric, no a Eury».** Van a los dos, y Eury las ve primero. Un indicador
  oculto sobre la única persona del equipo, descubierto después, cuesta más confianza de la que protege.
- **«Propuestas de control» deliberadamente dudosas, rechazadas.** Plantar propuestas malas para ver si el gestor las
  aprueba es una trampa; el día que se sepa, toda propuesta del agente será sospechosa, y el propio documento reconoce que
  la desconfianza es lo que frena la adopción (apartado 12). La muestra ciega y las señales cubren el mismo riesgo sin
  engañar a nadie.

### 7.7 Lo que rodea a la cuenta: cliente, web, plazos, ausencias

**Pendientes del cliente**, como entidad propia: qué se le pidió (landing, acceso, marcar leads, más presupuesto, aprobar
textos), cuándo, quién y con qué recordatorios. Efecto: silencia los hallazgos que dependen de ello y aparece en el informe
como «pendiente por su parte». Sin esto, el agente repetiría cada semana un problema que la agencia no puede resolver.

**Lo que decide el cliente** (riesgo RC): subir presupuesto, cambiar el modo de consentimiento, contestar antes. La
propuesta genera el **argumento para el cliente** (cuánto, qué se espera, con qué probabilidad), no un botón de aprobar.

**Encargos a web y SEO.** El circuito que faltaba:

- el encargo lleva el **coste diario de no hacerlo** y el nivel del cliente;
- plazo por tipo [valores de partida]: web o formulario caídos, el mismo día; etiqueta rota, 24 horas; landing lenta, 10
  días; página nueva, según acuerdo;
- el hallazgo queda «esperando a web» y en silencio hasta el plazo; vencido, un recordatorio y entrada en el parte de Enric;
- **verificación al cerrar:** cuando el encargo se marca hecho, el agente vuelve a medir, y si no se arregló lo reabre con
  la evidencia;
- **un solo encargo** si el módulo SEO ya tiene uno por la misma página (vía núcleo, sin que Ads importe a SEO);
- si el arreglo no está en el contrato (rehacer una landing), va al responsable de la cuenta como oportunidad comercial, no
  a la cola de web;
- toda creación de tareas respeta la regla del proyecto: cliente de ClickUp y bandeja de salida.

**Plazos internos** [valores de partida; los decide Enric]: interrupción vista en 1 hora laboral y resuelta o con plan en
4; hallazgo del parte decidido (hacer, descartar con motivo, posponer) en 2 días laborables; lote de términos semanal en
clientes A y B, quincenal en C; evaluación de un cambio R2 o R3 en la fecha fijada al aprobarlo.

**Alta de una cuenta nueva** (bloquea el paso a «vigilada»):

1. Acceso por MCC y cuenta de servicio; quién paga y con qué tarjeta; quién es dueño de cada cosa (tanda 0 de EST-07).
2. **Descarga del historial de cambios el primer día** (solo hay 30) y del histórico de métricas (hay 37 meses).
3. Mapa de conversiones y estado de la medición.
4. Acuerdo de objetivos (apartado 2.2), aunque sea provisional.
5. Ficha: servicios, lo que no hace, zona real, horario, competidores, términos y campañas protegidos.
6. Conexiones: CRM, GA4, Search Console, GBP, landing rastreada. Lo que falte queda anotado como cruce no disponible.
7. Nivel de cliente y día de la semana de su lote.
8. Auditoría de entrada por tandas, y 30 días de avisos reducidos.
9. Informe de entrada al cliente (borrador).

**Guardias, ausencias y traspaso.** Un solo gestor es el mayor riesgo operativo del servicio. Hace falta un **suplente**
definido para vacaciones, bajas y fines de semana (a quién van las interrupciones y con qué permisos), el modo ausencia de
7.3 y el expediente de cuenta como documento de traspaso. Quién es ese suplente es decisión de Enric.

---

## 8. Datos: qué se guarda y cómo se relaciona

Modelo conceptual para diseñar después las tablas `ads_*`. Wenner lo resume bien: un agente de PPC «es más un proyecto de
base de datos que de scripts» (01).

### 8.1 Principios

1. **Cada granularidad en su sitio.** No mezclar filas de campaña con filas de término: Google no permite sumar algunas
   métricas (la cuota de impresiones) y otras se duplican (un mismo término aparece en varios grupos).
2. **Columna de plataforma e identificadores nativos** junto a cuenta, moneda y zona horaria (todas las fechas de la API de
   Google van en la zona de la cuenta).
3. **Conversiones fraccionarias tal cual** (con atribución basada en datos salen valores como 0,37); los CPA se recalculan
   desde las sumas; un dato ausente no es un cero.
4. **Resincronizar siempre los últimos 7-10 días**, porque conversiones y cuota llegan tarde y Google corrige.
5. **Configuración con historia**: no basta el valor actual; hay que poder preguntar «¿qué objetivo tenía esta campaña el día
   12?».
6. **Formato largo para métricas** donde ayude (como ya hace Rendimiento), para que una métrica nueva no exija migración.
7. **Preparado para otras plataformas sin construirlas** (R3, aceptado: barato hoy, caro mañana). La columna *plataforma*
   va en cuentas, campañas, rendimiento diario, hallazgos, propuestas y resultados. Las **métricas neutras** (coste,
   impresiones, clics, leads, leads cualificados, ventas, valor) viven en las tablas principales; lo propio de Google (cuota
   de impresiones, nivel de calidad, estado de Smart Bidding) va en tablas de extensión.
8. **El motor no conoce a Google.** Diagnóstico, estadística, cola, memoria y las familias NEG, PLAN y AGE reciben series y
   eventos. Solo la sincronización y las reglas de configuración son por plataforma. No se propone construir Microsoft Ads
   ni Meta ahora; se propone no cerrarles la puerta en el esquema.

### 8.2 Entidades

| Grupo | Entidad | Granularidad | Qué guarda |
|---|---|---|---|
| **Cuentas** | Cuenta de Ads | Una por cuenta y **plataforma** | Enlace al cliente (la cuenta ya figura en «Webs y cuentas» de la ficha), MCC, moneda, zona horaria, estado, ajustes de medición |
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
| **Leads** | Enlace lead ↔ clic | Lead | Cualquier identificador de clic (gclid, gbraid, wbraid, msclkid, fbclid) y UTM; campaña; etapa, validez, valor; **señal de consentimiento**. Aunque no lleve nombre ni teléfono, es **dato personal seudonimizado**: plazo de conservación, supresión y contrato de encargo (apartado 12.2) |
| | Llamadas | Llamada | Campaña, hora, duración, atendida o perdida (sin número en claro) |
| | Subidas a Google | Envío | Qué se envió, a qué acción, respuesta, y si Google lo contó |
| | Curva de madurez | Cuenta × acción | F(d) vigente |
| **Inteligencia** | Hallazgo | Uno por causa | Capacidad que lo detectó, entidad, evidencia, impacto, confianza, urgencia, estado, días abierto |
| | Propuesta y decisión | Una por acción | Cambio exacto, predicción, límites aplicados, quién aprobó o descartó y por qué |
| | Resultado | Una por acción evaluada | Efecto medido, intervalo, control usado, veredicto |
| | Experimento de agencia | Experimento | Entidades tratadas y de control |
| | Umbrales | Por defecto, por sector, por cliente | Valores editables del panel |
| | Referencia del sector | Sector × tipo de campaña × métrica, **solo en celdas con 3 o más cuentas** | Medianas y parámetros bayesianos, solo con tráfico de no marca |
| | Calendario de plataforma | Evento | Fecha, ámbito, efecto esperado, fuente |
| **Negocio y operación** (nuevo) | Acuerdo de objetivos | Cliente × versión | Campos del apartado 2.2, con la calidad de cada dato y quién lo pactó |
| | Regla del cliente | Cliente | Lo que no se toca y por qué; nace de la respuesta «el cliente lo quiere así» |
| | Pendiente del cliente | Petición | Qué se pidió, cuándo, plazo, qué hallazgos silencia |
| | Respuesta del gestor | Hallazgo × persona | Cuál de las ocho respuestas, con su motivo |
| | Revisión de cuenta | Cuenta × fecha | Quién, nota de una línea, fecha de la próxima |
| | Previsión | Cuenta × mes | Rango previsto y, después, lo ocurrido (el error se publica) |
| | Inventario de cobertura | Cuenta | Qué cruces existen de verdad: CRM con etapas, landing rastreada, GA4, Search Console, GBP, objetivo pactado |

### 8.3 Lo que hay que guardar cada noche porque Google no lo guarda (o lo borra)

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

### 8.4 Relación con el núcleo y con otros módulos

Regla del proyecto: el módulo Ads no importa a otro módulo; todo pasa por el núcleo.

| Necesidad de Ads | Lo que ya existe | Cómo se conecta |
|---|---|---|
| Cliente, sector, zona, locales, servicios, competidores, contrato, memoria | Ficha del cliente en el núcleo | Lectura directa del núcleo. Son **dos campos distintos** (la v1 los confundía): la inversión mensual en medios, que el gestor tiene que ver para llevar el ritmo de gasto, y la cuota de agencia, que solo ven administradores |
| Acuerdo de objetivos, nivel de cliente, riesgo de baja, horas por cuenta | No existe | Son de la agencia entera, no de Ads: candidato a vivir en el núcleo, con Ads como primer usuario (protocolo de decisión antes de crear tablas) |
| Cuenta de Ads de cada cliente | «Webs y cuentas» ya admite el tipo Ads | Registrar un directorio de cuentas de Ads, como hace Agentes con Google |
| Search Console, GA4 y GBP diarios | Módulo Rendimiento | Su proveedor de cifras para otros módulos y la fuente de métricas del núcleo |
| Landing: texto, caídas, velocidad, registro de cambios | Módulo SEO | **Hace falta un contrato nuevo en el núcleo** («dime el estado de esta URL en esta fecha»); Ads no puede importar SEO. Solo cubre las landings que el rastreador ve: las que viven en embudos del CRM o en constructores aparte quedan fuera hasta darlas de alta |
| Embeddings y mapa de palabras | Módulo SEO | Mismo criterio: una capacidad del núcleo para embeddings y similitud |
| Leads | Conexión con GoHighLevel (hoy: fecha, formulario, página, canal y UTM, **sin identificador de contacto ni de clic**) | Ampliación necesaria para LEAD-01 y MED-10 (decisión de Enric, apartado 13) |
| Festivos, actualizaciones de Google, incidencias | Calendario de la agencia | Ads aporta sus eventos de plataforma al mismo calendario |
| Hallazgos, intervenciones y propuestas | Tablas y registros del núcleo (hallazgos, intervenciones, motor de propuestas) | Valorar reutilizarlos antes de crear equivalentes `ads_*` (protocolo de decisión) |
| Trabajos periódicos | Cola de trabajos del núcleo | Tareas de sincronización y evaluación |
| Avisos | Cola de avisos de Operaciones | Nunca Telegram directo |
| IA | Pasarela con coste, prompts con examen | Igual que el resto |
| Tareas para el equipo | Encargos y ClickUp | Un hallazgo R0 que pide trabajo humano se convierte en encargo |

---

## 9. Restricciones técnicas reales

### 9.1 Acceso a la API (según la documentación leída; **pendiente de prueba real**)

**Aviso de la v2.** Todo este apartado descansa en documentación de Google de septiembre y octubre de 2026 leída por los
informes 04 y 10. Ninguno de los tres revisores pudo confirmarlo ni desmentirlo, y nadie ha hecho todavía una consulta real.
La v1 se lo presentaba a Enric como «bloqueo resuelto»; lo correcto es «según la documentación, parece resuelto». Se
comprueba en media hora: crear el proyecto de Google Cloud, pedir el nivel y leer una cuenta. Hasta entonces, nada del
calendario depende de ello.

- Según la documentación, **el token de desarrollador ya no existe** (retirado el 9 sep 2026). El nivel de acceso pertenece al **proyecto de Google
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
  (10). Las dos caben en Explorer **solo si no hay nada horario**. Con las comprobaciones marcadas «H» (25 cuentas × 24 horas ×
  2-3 consultas son 1.200-1.800 operaciones al día), más la resincronización de 7-10 días y la descarga del histórico,
  Explorer no basta. **Basic es requisito, no margen**; y aun así lo horario se limita al horario de anuncios y a nivel
  de cuenta. [Límites tomados de la documentación leída; sin probar.]
- **Autenticación: cuenta de servicio añadida a la MCC** (un mismo correo solo puede estar en 20 cuentas, así que con 25+ va
  en la MCC). No le afectan la doble verificación ni las llaves de acceso obligatorias desde 2026 para los accesos de
  usuario, y no depende de un empleado. Mínimo privilegio: lectura al principio.
- **Sin librería oficial para Node.** Recomendación del informe 04: cliente REST propio con contador de operaciones,
  reintentos y versión configurable, como el de ClickUp.
- **Versiones:** vigente la v26 (14 oct 2026), que se retira en nov 2027. Cada versión dura unos 13 meses: hay que subir de
  versión al menos una vez al año. Google puede revocar el acceso tras 90 días sin uso.
- **La API es gratuita** [conocimiento general del sector; la documentación no lo afirma de forma expresa].

### 9.2 Lo que la API no da

| Dato | Estado | Alternativa |
|---|---|---|
| **Subastas (Auction Insights)** | Los campos existen en la v26 pero «no están disponibles públicamente». El informe 05 lo daba como posible; el 04 lo comprobó: **no** | Informe programado de la interfaz a un buzón u hoja (así lo hace TrueClicks); señales propias (CUO-05), que son la vía principal porque el informe no devuelve filas en campañas pequeñas; anuncios en los resultados vía DataForSEO |
| **Prioridad de canal** (oct 2026) | «Próximamente» en API y Editor; no se configura desde la MCC | Segmento de red como aproximación |
| Alertas de cuenta (pago fallido, suspensión) | No hay recurso | Inferir (MED-12) |
| Diagnóstico de etiqueta como en la interfaz | No confirmado | Inferir con conversiones por acción y día; cruzar con CRM |
| Historial de cambios de más de 30 días, y los cambios hechos con Editor | No | Guardado propio. Sobre Editor: el informe 04 dice que sus cambios no aparecen; un revisor cree recordar que el tipo de cliente del historial sí tiene un valor para Editor. **Comprobar con una cuenta real**: de ello depende el cierre automático de propuestas (apartado 7.2) |
| Conversiones modeladas por consentimiento, separadas | Van mezcladas en «Conversiones» | Comparar con el CRM |
| Términos de bajo volumen | Ocultos por privacidad | Medir el «% de gasto invisible» (TER-09) |
| Asistente de Google (Ask Advisor) y algunas recomendaciones | Solo interfaz, cuenta a cuenta | — |
| IP de los clics | No | GA4 y Clarity |
| Subir conversiones offline (nuevos usuarios) | Bloqueado en la API de Ads desde el 15 jun 2026 | Data Manager API (9.3) |
| Ubicaciones de PMax | Solo impresiones | — |

### 9.3 Conversiones offline: Data Manager API (según documentación; sin probar)

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

### 9.4 Retrasos de los datos (04 §5)

| Dato | Cuándo es fiable |
|---|---|
| Clics, impresiones, coste, conversiones de último clic | Casi en tiempo real (refresco horario) |
| Conversiones con atribución basada en datos | Aproximadamente un día |
| Términos de búsqueda y datos geográficos | Al día siguiente |
| **Cuota de impresiones y parte superior** | **2-3 días** (el informe 09b cita 24-48 h de otra página de ayuda; tomamos el plazo prudente de 3 días) |
| Cuota de clics | 3 días |
| Historial de cambios | Minutos |
| Lead cualificado y venta del CRM | Días o semanas: cada acción con su curva (5.4) |
| GBP | Unos 3 días (ya lo aplica Rendimiento) |

Además, las cifras cambian días después: tráfico inválido descontado, conversiones tardías, ajustes de facturación.

### 9.5 Calendario de cambios de Google que el agente debe conocer

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

### 9.6 Scripts de Google Ads: puente y red de seguridad

No necesitan acceso de Cloud y son gratis, con límites (30 minutos y 50 cuentas por ejecución). Dos usos: **puente** mientras
llega el acceso (un script en la MCC que exporte cada noche a un punto de entrada nuestro; solución provisional) y **freno de
emergencia** (PRO-11) (04 §6).

---

## 10. Mercado y diferenciación

### 10.1 Tabla comparativa

Sí = documentado · Parcial = limitado o manual · No = no lo hace según lo investigado. Los precios de Optmyzr y Adalysis no
se pudieron leer en sus webs y vienen de terceros [no verificado].

**Cómo leer la última columna** (corrección de la v2; R3). Compara **nuestro objetivo** con **el presente** de los demás:
es una hipótesis de producto, no un hecho. Varias celdas dependen de la disciplina del CRM de cada cliente y de volúmenes
que quizá no haya; se han rebajado a lo que el apartado 5 permite sostener.

| | Optmyzr | Adalysis | Opteo | TrueClicks | Agente de Google (Ask Advisor) | **Kijutech (objetivo)** |
|---|---|---|---|---|---|---|
| Precio para 25 cuentas y <50.000 $/mes | Desde unos 208 $/mes | Desde unos 149 $/mes | 249-499 $/mes | **0 $** | Gratis, dentro de Google | Interno |
| Punto fuerte | Motor de reglas, amplitud | Auditoría y test de anuncios, umbrales publicados | Sencillez, mejoras de un clic | Higiene y vista multicuenta | Está dentro de la plataforma | Cruces y diagnóstico |
| Umbrales publicados y editables | Sí (reglas) | **Sí** | No (solo «agresividad») | Parcial | No | Sí, por defecto, sector y cliente |
| Anomalías con línea base propia | Sí | Parcial | Sí (aprende la variabilidad) | Parcial | — | Sí, con festivos locales |
| Causa raíz | Sí (hay que abrirla) | Sí (hay que abrirla) | Parcial | No | Parcial; quien lo probó dice que diagnostica mal (03) | **Automática, una alerta por causa** |
| Historial de cambios junto a la causa | Sí | Sí | No | No | — | Sí, sin límite de 30 días |
| Subastas | Parcial | No | No | Sí (vía hoja) | Sí (es Google) | Parcial (señales propias y resultados de búsqueda; informe importado donde devuelva filas) |
| Calidad real del lead (CRM) | Parcial (hojas a mano) | No | No | No | No | Donde el CRM tenga etapas: por campaña y servicio; por término, solo spam |
| Web, SEO y ficha de Google del cliente | No | No (solo URL rotas) | No (solo enlaces rotos) | No | No | **Sí** |
| Decide bien con pocos datos | No (umbrales fijos) | No | Parcial (ventana adaptativa) | No | — | Juez de intención y bayesiano dentro de la cuenta; el sector, solo con 3 o más cuentas |
| Corrige el retraso de conversión | No documentado | No documentado | **No (lo dice su ayuda)** | No | Google ofrece informes de retraso | Sí, donde la acción madura despacio |
| IA que propone con aprobación | Sí | Sí | Sí | Beta | Sí | Sí |
| Mide si sus recomendaciones funcionaron | No | No | No | No | No | Las R2 y R3, con «no concluyente» frecuente; las R1, en conjunto |
| Conoce el negocio del cliente | Perfil de IA escrito a mano | No | Contexto del agente | Atributos propios | No | Ficha completa |
| Español y mercado español | Chat en español | No | No | No | Solo cuentas en inglés | Sí |

Fuentes: 02 (funciones leídas página a página en la ayuda oficial de cada una), 03, 10 §3 (reseñas de Capterra).

**Otros actores** (03): las plataformas de gran empresa (SA360, Skai) marcan la dirección —carteras, previsión, «escuadrones
de agentes» con puntos de aprobación— pero no son para agencias de leads locales, y Marin quebró en 2025 (lección: no
depender de proveedores de nicho). Los agentes «totalmente autónomos» (Groas, Albert, Ryze) **no tienen ninguna medición
independiente**. El servidor oficial de Google para asistentes solo lee y apenas escribe. No se encontró ninguna herramienta
española equivalente (10 §5.4).

### 10.2 Qué copiar de cada una

| De | Qué copiar |
|---|---|
| **Adalysis** | La transparencia: cada control con su umbral por defecto, editable. El árbol de tres etapas (antes del clic, clic, conversión) con el historial de cambios encima. El nivel de calidad ponderado por impresiones y gasto. La pantalla inicial multicuenta con alertas y presupuesto. «Resolver solo» lo rutinario |
| **Opteo** | La ventana de datos que se alarga hasta tener suficientes. El impacto anualizado en cada mejora. «Comprobaciones hechas: 1.240, nada que proponer» (enseña que se ha mirado). Supresiones de la alerta de cero conversiones (no repetir en 4 días, no avisar si la acción suele tener pocas). Segmentos y términos protegidos. Nombre de lugar como negativa |
| **Optmyzr** | Excluir cambios recientes para que una regla no reaccione a sí misma. La similitud término ↔ palabra como filtro secundario (≥85 muy relevante, ≤20 no relevante). Las peticiones de cambio que otro compañero revisa. Los tres mayores contribuyentes positivos y negativos. Posponer alertas 1, 7 o 28 días |
| **TrueClicks** | Separar monitorización diaria (cosas rotas) de recomendaciones semanales (buenas prácticas). «Días que lleva fallando». Aplicar higiene por patrón de nombre de campaña. El truco del informe de subastas a una hoja |
| **Google** | Proponer y confirmar con simulación previa. El detector oficial que compara con el mismo día de la semana |
| **Proyectos abiertos** | «Desconocido» nunca se adivina; cobertura de evidencia visible (claude-ads) |
| **Practicantes** | Rutina de 15 minutos de Lolk; las 4C de Rhodes; umbral del 85 % de Rooijmans; registro de decisiones con línea base y fecha de revisión |

### 10.3 Qué evitar (quejas reales de usuarios; 10 §3)

| Queja | De quién | Cómo lo evitamos |
|---|---|---|
| «Encuentra tantos problemas que abruma; el reto es saber qué priorizar» | TrueClicks | Cola corta; presupuesto de atención por persona y sumando todos los módulos (apartado 7.3); como mucho 12-15 tipos de hallazgo |
| «Para tener buena nota acabas haciendo cambios de los que no estás convencido» | TrueClicks | **Ninguna nota que penalice descartar**, y ninguna nota que obligue: por eso la medición tiene tres estados y no un aprobado (la v1 se contradecía aquí). Descartar con motivo es un dato valioso |
| «No entiende el contexto»; recomendaciones redundantes o contradictorias | Opteo | Ficha del cliente en cada juicio; una propuesta por causa; deduplicar las que afectan al mismo gasto |
| «Demasiado fácil hacer cambios masivos entre cuentas»; valores por defecto peligrosos | Optmyzr | Límites duros, tope de lote, ningún clic toca más de una cuenta y **ninguna lista de negativas compartida entre cuentas** (la v1 se contradecía con TER-03) |
| Curva de aprendizaje, interfaz densa | Optmyzr, Adalysis | Lenguaje llano; lo primero que se ve es qué hacer hoy |
| Datos con 24 h de retraso; cambios que hay que aplicar fuera | Adalysis | Señales horarias para lo crítico. Mientras sea solo lectura: salida lista para pegar y cierre automático por historial (apartado 7.2). Aplicar negativas con un clic, en cuanto Enric lo autorice |
| Umbrales no ajustables a los objetivos de cada cuenta | TrueClicks | Umbrales por cliente |
| Herramientas de puja pensadas para CPC manual | Optmyzr, Opteo | Todo el catálogo parte de Smart Bidding |
| El precio sube con cuentas y gasto | Todas | No aplica |

### 10.4 Comprar o construir [opinión]

La auditoría y las recomendaciones de un clic ya existen y son baratas (TrueClicks es gratis para vuestro tamaño). **Reimplementar
eso no es la ventaja.** El valor de construir está en lo que no se puede comprar: los cruces con CRM, web, SEO y ficha, la
estadística para cuentas pequeñas y la memoria de resultados. Sugerencia práctica: dar de alta TrueClicks en paralelo unas
semanas como **vara de medir** (¿encuentra algo que nuestro catálogo no?), sin depender de ella. Mientras el módulo se
construye puede servir además de **parche**, leído por Enric o por el agente y no como otra bandeja para Eury (R2). Dos
comprobaciones antes: que la inversión total no supere su tramo gratuito, y que los contratos con los clientes permitan dar
acceso a sus cuentas a un tercero.

---

## 11. Innovaciones propias

Lo que ninguna herramienta analizada hace y nosotros podríamos hacer por tener 25+ cuentas, el CRM, el SEO y la web en la
misma herramienta. Para cada una, lo que hace falta y su límite real. **Son hipótesis de producto**: varias dependen de
datos que el inventario (apartado 13.2) todavía no ha contado. La v2 retira una (los ajustes de estacionalidad por sucesos
locales, que partían de un error sobre para qué sirve ese ajuste) y añade cuatro (17 a 20).

| # | Innovación | Por qué nadie la tiene | Qué hace falta | Límite honesto |
|---|---|---|---|---|
| 1 | **Diagnóstico con causas de fuera de Google Ads**: web caída, formulario roto, cambio en la landing, demanda orgánica, reseñas, horario | Las herramientas solo ven la plataforma de anuncios | Un contrato nuevo en el núcleo para consultar el estado de una URL en una fecha | Solo en clientes con web rastreada y cuentas de Google conectadas |
| 2 | **Coste por lead cualificado por campaña y servicio**, con conciliación por tipo de acción | Asumen que las conversiones son verdad; el CRM pequeño (GoHighLevel) no entra en sus paneles | Guardar identificador de clic y etapa del lead | Depende de que alguien marque la etapa en el CRM: es un proyecto de hábitos del cliente. Por término no habrá dato ni en un año |
| 3 | **Referencia del sector entre cuentas** para decidir con pocos datos, con punto de partida semántico | Una herramienta de una cuenta no puede; las multicuenta no lo hacen | Sector y tipo de conversión normalizados en la ficha | Con 25 cuentas, casi todos los sectores tendrán una o dos: en la práctica empieza siendo referencia de la cuenta. Es una apuesta a medio plazo, no una ventaja de salida |
| 4 | **Causa común**: si medio sector cae el mismo día, es el mercado o Google | Nadie compara cuentas entre sí | El almacén | — |
| 5 | **Tasa de acierto por tipo de acción** (acciones R2 y R3; experimentos solo dentro de una cuenta) | Nadie mide si sus recomendaciones funcionan; la nota de optimización de Google mide adopción, no efecto | Registro de predicciones y evaluación | El efecto de una acción pequeña es menor que el ruido mensual: el veredicto será casi siempre «no concluyente». Algo útil, en uno o dos años y para las acciones más frecuentes; no «en meses» |
| 6 | **La demanda orgánica como grupo de control** y estacionalidad calculada con datos propios | No tienen Search Console del mismo cliente con histórico diario | Ya existe en Rendimiento | La equivalencia entre consultas de pago y orgánicas es aproximada |
| 7 | **Negocio local de verdad**: zona de servicio real, horario frente a llamadas perdidas, municipios como negativas, coherencia con la ficha de Google | Las herramientas son para comercio electrónico de EE. UU. | Ficha completa (zona, horario) | Datos de llamadas según lo que el CRM ofrezca |
| 8 | **Ley española en la revisión de anuncios**, incluidos los textos que genera Google | Google solo revisa sus políticas | Lista de vetos por sector, mantenida | No sustituye al criterio legal del cliente |
| 9 | **Sintonía con el texto real de la página**, páginas elegidas por Google y cambios en la web | No tienen el rastreador | Capacidad de embeddings en el núcleo | — |
| 10 | **Los cambios de Google como causa fechada** | Las alertas culpan al gestor de lo que cambió Google | Calendario mantenido | Requiere disciplina para mantenerlo |
| 11 | **Puente Ads ↔ SEO en las dos direcciones** | Son herramientas distintas | Encargos entre módulos vía núcleo | La reducción de inversión por «ya somos primeros» hay que probarla, no asumirla |
| 12 | **Benchmark español** por sector y provincia | No existe ninguno público | Tiempo y cuentas | 25 cuentas es poco: solo medianas, solo no marca, solo en sectores con 3 o más cuentas, y sin provincia |
| 13 | **Auditor de lo que Google automatiza**: gasto invisible, tráfico traído por la IA, migraciones | Empieza a verse (Adalysis), nadie lo resume | El almacén | — |
| 14 | **Honestidad**: probabilidad en cada propuesta, «no concluyente», cobertura de evidencia, datos inmaduros en gris | Las herramientas venden certezas | Diseño | — |
| 15 | **Llamadas cualificadas por su contenido** en España (aparcada) | Google solo lo da en EE. UU. y Canadá | Grabación en el CRM y base legal | Decisión legal previa; excluida en sector sensible |
| 16 | *(Retirada en la v2: ajustes de estacionalidad por sucesos locales.)* | — | — | El ajuste informa de un cambio de tasa de conversión, no de demanda; queda como presupuesto temporal (PUJ-09) |
| 17 | **Objetivo calculado desde el negocio**: coste máximo por lead desde margen, cierre y cuota, con la capacidad del cliente como puerta de escalado | Las herramientas reciben un CPA objetivo y no preguntan de dónde sale ni si el cliente puede atender más | Acuerdo de objetivos pactado y mantenido | Muchos clientes no saben su margen ni su tasa de cierre: empezará como provisional |
| 18 | **Vigilancia de lo que no se ve desde la campaña**: entrega del lead, llamadas perdidas, pausas olvidadas, cierres, prueba activa del formulario | Viven dentro de las métricas de Google | CRM, GA4 y rastreador por cliente | Solo donde existan esas conexiones |
| 19 | **Leads totales del negocio como árbitro** de la incrementalidad (marca, PMax, ficha) | Informan de sus propias conversiones | CRM con todas las fuentes | Con pocos leads, las pruebas salen «no concluyente» |
| 20 | **Expediente de cuenta y reglas del cliente**: lo que hoy está en la cabeza del gestor, escrito y heredable | Guardan cambios, no motivos ni acuerdos | Disciplina de uso | Vale lo que se escriba en él |

**La idea de fondo** [opinión]: las herramientas del mercado son *auditoras de la cuenta*. Lo que proponemos es un *gestor
que conoce el negocio*, que duda cuando debe y que aprende de sus resultados. Hay que ser honestos: la v1 se quedaba en
auditor (lo demostró R3). Lo que lo acerca a gestor son el acuerdo de objetivos, la capacidad, lo que pasa después del
clic y la relación con el cliente (apartados 2 y 7). Lo primero se compra; lo segundo solo se puede construir donde ya
viven la ficha, la web, el SEO y el CRM, y solo si esos datos existen de verdad en cada cuenta.

---

## 12. Riesgos, ley y protección de datos

### 12.1 Riesgos y cómo mitigarlos

| Riesgo | Cómo se manifiesta | Mitigación |
|---|---|---|
| **La herramienta se abandona** (nuevo; el más probable según R2) | El equipo concluye «esto solo me da más avisos»; se revisa la cola y además se sigue con la rutina vieja | Orden de construcción por adopción (apartado 13.2); retirar el ritual L-X-V por escrito; modo sombra antes de avisar; medir horas antes y después |
| **Fatiga de alertas** | El equipo deja de leer | Presupuesto de atención por persona y global, canales, silencios con fecha, sin recordatorios repetidos (apartado 7.3); como mucho 12-15 tipos de hallazgo; calibración con 90 días de histórico |
| **Aprobar sin pensar** (nuevo) | Con aprobación en un clic, se aprueba todo | Fricción proporcional al riesgo, tope de lote, muestra ciega, señales visibles para el propio gestor (apartado 7.6) |
| **El agente aprende del aprendiz** (nuevo) | Calla lo que el gestor aún no domina | Las respuestas no tocan la detección; umbrales por resumen mensual aprobado; casos de oro con desenlace conocido (apartado 7.4) |
| **Descualificación del gestor** (nuevo) | Nadie en la agencia sabe diagnosticar sin la herramienta | Tres capas de explicación, «primero tú» voluntario, una revisión al mes sin diagnóstico previo (apartado 7.5). O aceptarlo a sabiendas |
| **Un solo gestor** (nuevo) | Vacaciones, baja o marcha de Eury | Suplente definido, modo ausencia, expediente de cuenta como traspaso (apartado 7.7) |
| **Cruces que no existen** (nuevo) | La ventaja depende de CRM con etapas, landing rastreada y cuentas conectadas, y nadie lo ha contado | Inventario de cobertura antes de diseñar; cada diagnóstico dice qué no pudo mirar |
| **Objetivo mal puesto** (nuevo) | Todos los umbrales cuelgan de un CPL inventado; se escala con la agenda llena | Acuerdo de objetivos con fórmula, calidad del dato visible y revisión por disparadores (apartado 2) |
| **Promesas de resultado infladas** (nuevo) | «Te hemos ahorrado 3.200 €» que nadie sabe calcular | Registro de valor con regla de honestidad (AGE-04); rangos y «no concluyente» |
| **Alucinaciones** | Causa inventada; cifra mal calculada; consejo obsoleto (un estudio halló un 20 % de respuestas erróneas de IA generalista sobre PPC); anuncio que promete lo que el cliente no ofrece | El código calcula y la IA solo cita lo calculado; juez de anclaje en los textos; base de conocimiento con lo obsoleto; examen de prompts; «no concluyente» permitido |
| **Acciones peligrosas** | Cambio masivo; presupuesto × 100; pausar la marca; bajar un objetivo y hundir los leads; degradar la única conversión que alimenta la puja | Solo lectura primero; límites duros en código; simulación previa; aprobación según riesgo; etiqueta y registro; vuelta atrás; freno de emergencia fuera del servidor; nada R3 sin persona; nada entre cuentas |
| **Sanear la medición asusta al cliente** (nuevo) | Al dejar de contar clics de teléfono, «caen» sus conversiones | Plan de saneamiento por tandas, series en paralelo y aviso previo (apartado 3.B) |
| **Datos malos** | Medición rota; días inmaduros; conversiones fraccionarias redondeadas; zona horaria; cuota sumada entre niveles; CRM sin etapas; ficha desactualizada | Estados de medición; conciliador; principios del apartado 8.1; fecha de confirmación en los datos de la ficha (NEG-07) |
| **Regresión a la media y mirar hasta que salte** | Se pausa lo peor de una muestra pequeña y «mejora» solo; una regla evaluada cada semana acaba saltando por azar | Encogimiento bayesiano; reglas sobre la ventana completa, no sobre rachas; negativas estadísticas con caducidad (apartado 5.2) |
| **Memoria que se engaña** | El agente concluye que algo «nunca funciona» por un resultado ruidoso | Memoria de resultados medidos, con caducidad y exploración mínima |
| **Cambios de Google** | Versión retirada; enumerados que cambian; función que desaparece; nuevos mandos fuera de la API | Vigía de la API (GOO-07); calendario de plataforma; cliente propio con versión configurable; no diseñar sobre lo retirado |
| **Google absorbe lo que construimos** (nuevo) | Cada año se ven menos términos y hay menos mandos | Parte de términos delgada; invertir en lo defendible (apartado 2.6) |
| **Acceso** | Las afirmaciones de acceso no están probadas; Google revoca tras 90 días sin uso; clave de la cuenta de servicio expuesta | Prueba real antes de planificar (apartado 9.1); uso diario; clave solo en el entorno, nunca en un archivo versionado; mínimo privilegio |
| **Protección de datos** | Ver 12.2 y 12.3 | Ver 12.2 y 12.3 |
| **Políticas de Google y ley española** | Sanidad sin listas de clientes ni garantías de curación (RD 1907/1996); medicamentos de prescripción en palabras o anuncios; abogados sin promesas de resultado (art. 20 del Estatuto); financiero con verificación; superlativos sin prueba | Detector de sector regulado desde la ficha (ANU-06); textos automáticos apagados por defecto en esos sectores; vetos validados con asesoría |
| **Marcas ajenas** (corregido) | La v1 decía «pujar por marcas ajenas (Ley de Marcas)». Pujar por la marca de un competidor es en general lícito en la UE; el riesgo está en **usar la marca en el texto del anuncio o inducir a confusión** | El agente no veta campañas de competencia; sí veta la marca ajena en los textos [validar con asesoría] |
| **Dos clientes competidores** (nuevo) | El agente recomienda a uno pujar contra el otro usando información del otro | Regla explícita de conflicto: ningún término, anuncio ni cifra identificable cruza entre competidores directos (12.4) |
| **Sector con pocos clientes** | Referencia del sector poco fiable | Solo con 3 o más cuentas; si no, referencia de la propia cuenta, y se dice |
| **Coste de IA** | Tablas enteras a un modelo caro | Cascada; lotes; caché; presupuesto por agente en la pasarela |
| **Responsabilidad** | Un error del agente lo paga la agencia | Traza de quién aprobó y por qué; cambios como «petición revisada», no como acción del modelo |
| **Confianza del equipo** | El 40 % de los profesionales no automatiza porque no se fía con presupuestos de clientes (Optmyzr) | Explicar cada propuesta y lo que no se propone; empezar por lo que Eury ya hace; ningún control oculto sobre el gestor |

### 12.2 Protección de datos al cruzar el CRM con la publicidad

**Todo este apartado necesita validación de asesoría jurídica.** No es asesoría: es la lista de lo que la v1 no planteaba y
el consultor de negocio señaló (R3, aceptado). La v1 trataba el RGPD como un riesgo genérico con una mitigación («guardar
el enlace lead ↔ clic sin datos personales en claro») que era una **falsa tranquilidad**.

- **«Sin datos en claro» no saca del RGPD.** El identificador de clic es un identificador en línea; unido a la etapa del
  lead es dato personal seudonimizado. El hash de correo y teléfono no es anonimización. Aplica el reglamento entero: base
  legal, información, plazo de conservación, derechos.
- **Roles.** El cliente es responsable del tratamiento; la agencia, encargada. Hace falta contrato de encargo (art. 28) que
  cubra esta herramienta y sus subencargados (alojamiento, GoHighLevel, proveedor de IA, Microsoft Clarity). Consecuencia:
  ampliar la conexión con el CRM no es solo decisión de Enric; **cada cliente tiene que autorizarla**.
- **Consentimiento.** La política de consentimiento de usuarios de la UE de Google exige consentimiento para usar datos con
  fines publicitarios. La subida lleva la señal de consentimiento y **no se sube a quien lo rechazó**; el conciliador cuenta
  esos leads aparte.
- **Supresión.** La Data Manager API no permite retirar conversiones: hay que decidir cómo se atiende la solicitud de
  supresión de un lead ya subido.
- **Papel de Google** en conversiones mejoradas y listas de clientes, y transferencias internacionales: comprobar el estado
  vigente.
- **Evaluación de impacto.** Recomendable una plantilla única para la combinación CRM + publicidad + IA; casi seguro
  obligatoria en clientes de salud y si algún día se transcriben llamadas.
- **IA.** Ningún dato identificable de un lead llega a un modelo sin que el contrato de encargo lo cubra.
- **Modo de consentimiento.** Pasar de básico a avanzado (enviar señales sin cookies cuando el usuario rechaza) es una
  decisión legal del cliente, no una optimización. El agente informa del coste en datos de cada opción y nada más (MED-07).
- **reCAPTCHA** sin consentimiento: hay una sentencia austriaca en contra; la validación en servidor es la alternativa.

### 12.3 Modo «sector sensible» por cliente

Para clínicas (médica, dental, estética, fertilidad, psicología, adicciones), despachos de abogados y cualquier servicio que
revele salud, situación económica o judicial. Que alguien pida cita en una clínica de fertilidad es dato de salud (art. 9);
enviar su identificador a Google, aunque sea con hash, exige como mínimo consentimiento explícito [validar con asesoría].

Es una **bandera de la ficha que el código aplica como límite duro**, igual que el tope de presupuesto:

| Qué | En modo sector sensible |
|---|---|
| Subida de leads a Google (MED-10) | **Desactivada por defecto.** Si se activa, sin correo ni teléfono; decidir con asesoría si se permite al menos el identificador de clic |
| Listas de clientes y remarketing | No |
| Transcripción de llamadas (LEAD-07) | Excluida |
| Clarity | Sin grabación en formularios ni en páginas de cita |
| Informes y benchmark | Solo agregados |
| Textos automáticos de Google | Apagados por defecto (GOO-03) |
| Redacción de anuncios por el agente | Bloqueada hasta cerrar, por comunidad autónoma, la autorización previa de publicidad sanitaria |

### 12.4 Transparencia y ética con el cliente

Cláusulas que conviene tener en el contrato antes de encender el módulo [validar con asesoría]:

- **Uso de IA:** la agencia usa sistemas de IA bajo supervisión humana; la responsabilidad es de la agencia; qué datos del
  cliente se tratan y dónde.
- **Uso cruzado de datos:** el benchmark y la referencia del sector hacen que los datos del cliente A mejoren las decisiones
  del cliente B, a veces su competidor en la misma provincia. Necesita cláusula y un límite: nunca términos, anuncios ni
  cifras identificables entre competidores directos.
- **Conflicto entre competidores:** el agente no recomienda a un cliente pujar contra otro con información del otro.
- **Experimentos:** solo dentro de la cuenta de cada cliente (APR-03).
- **Informes:** qué se promete medir y qué no (ventas, solo si el cliente las informa).

Sin verificar: si el Reglamento de IA de la UE impone algo más que la obligación general de formar al personal que usa
sistemas de IA. No parece que obligue a etiquetar textos de anuncios.

---

## 13. Decisiones para Enric, orden de construcción y lo no verificado

### 13.1 Decisiones y preguntas para Enric

Todas las recomendaciones son **[opinión]** de quien firma. Las marcadas ⛔ tocan una línea roja del proyecto (efectos hacia
fuera con clientes o cambios en cuentas reales): no se hace nada hasta tu respuesta.

**A. Antes de escribir código (no cuestan desarrollo y deciden todo lo demás)**

| # | Decisión o pregunta | Por qué importa | Recomendación |
|---|---|---|---|
| 1 | **Probar el acceso con las manos:** crear el proyecto de Google Cloud, pedir el nivel, añadir la cuenta de servicio a la MCC y leer una cuenta | Todo el plan descansa en documentación de sep-oct 2026 que nadie ha probado. Media hora lo confirma o lo desmiente | Hacerlo esta semana. Pedir Basic directamente (con comprobaciones horarias, Explorer no basta) |
| 2 | **¿Cuál de los cuatro números de la agencia persigue el módulo?** Horas por cuenta, cuentas por gestor, bajas o ingreso por cuenta (apartado 2.5) | Cambia el orden: horas → términos y Cartera primero; bajas → informe al cliente y riesgo de baja primero; ingreso → calidad del lead y niveles de servicio | Horas por cuenta primero (es lo que libera a Eury y lo que se puede medir antes), bajas después |
| 3 | **Medir una semana real de Eury** (qué hace, en qué cuentas, cuánto tarda) y anotar las bajas del último año | Es la línea base del proyecto y hoy no existe. Las horas que cita este documento son estimaciones sin fuente | Sí, antes de construir nada |
| 4 | **Inventario de cobertura**, una fila por cuenta: inversión y cuota; leads al mes por campaña; ¿CRM conectado, entran ahí los leads de Ads, alguien marca etapas?; ¿la landing de los anuncios está en la web rastreada?; ¿GA4, Search Console y GBP conectados?; ¿hay objetivo y presupuesto de medios pactados?; ¿quién tiene el acceso de administrador y la facturación?; ¿quién habla con el cliente? | Toda la diferenciación depende de datos que nadie ha contado. La apuesta de R2 es que menos de un tercio de las cuentas tiene etapas usables en el CRM | Sí. Lo rellenan Eury y Enric en una tarde; el agente puede precargar lo que ya está en la herramienta |
| 5 | **Nivel de cliente (A, B, C)** para cada cuenta | Decide prioridad, frecuencia de revisión y techo de horas | Fijarlo al cerrar el inventario |
| 6 | **Acuerdo de objetivos por cliente**: quién lo pacta y por cuáles se empieza | Sin él, todos los umbrales cuelgan de un número puesto a ojo | Quien hable con el cliente, empezando por los A. Para el resto, objetivo provisional (mediana del CPL de 90 días), marcado como provisional |
| 7 | **¿Cómo cobra la agencia: cuota fija o porcentaje de la inversión?** | Si es porcentaje, proponer al cliente gastar menos va contra el ingreso de la agencia: conflicto de interés | Regla escrita: el agente propone reducciones igualmente. A medio plazo, cuota fija por nivel de servicio |

**B. Líneas rojas que conviene decidir al empezar, no al final**

| # | Decisión | Por qué importa | Recomendación |
|---|---|---|---|
| 8 ⛔ | **Capturar el identificador de clic y la etapa del lead desde ya** (ampliar la conexión con GoHighLevel y poner el script en webs y formularios) | No es retroactivo: cada mes sin capturar es un mes menos de histórico de calidad, el mismo argumento que para el almacén. Pero es dato personal: necesita autorización de cada cliente y contrato de encargo | Sí, tras una consulta legal única (decisión 20), empezando por clientes que no sean de sector sensible |
| 9 ⛔ | **Aplicar con un clic las negativas aprobadas por Eury** (en exacta o en listas creadas por la herramienta dentro de una sola cuenta), con etiqueta y deshacer | Es el cambio más reversible que existe y el que convierte el lote de términos en ahorro grande. La v1 lo dejaba para la última fase | Sí, decidirlo al empezar el paso de términos. Todo lo demás sigue en solo lectura |
| 10 ⛔ | **Pausa de emergencia automática y acotada** | Sin ella, un aviso de fin de semana es solo estrés | Sí, pero solo para un caso: URL final con error confirmado dos veces y gasto, con reanudación automática y aviso. El gasto desbocado se cubre con un tope en un script de la MCC (PRO-11). Avisar a los clientes de que existe |
| 11 ⛔ | **Pedir al cliente que marque sus leads** (lista semanal «¿cuáles eran buenos?», borrador que envía una persona) | Sin ese dato, la calidad del lead es teoría en la mayoría de las cuentas | Sí, con 3-5 clientes A para empezar. Una versión con botones automáticos, más adelante y con diseño propio |
| 12 ⛔ | **Subir leads cualificados y ventas a Google** (Data Manager API) | Es la palanca más potente en leads según las fuentes, y cambia lo que aprende el algoritmo | Sí, pero tarde y cliente a cliente: como conversión secundaria unas semanas, nunca por defecto en sector sensible, y después de la consulta legal |
| 13 ⛔ | **Sanear la medición** de las cuentas en estado «dudosa» | Cambia lo que aprende la puja y hace «caer» las conversiones que ve el cliente | 2-3 cuentas por semana, por nivel de cliente, con series en paralelo y aviso previo al cliente |
| 14 | **Buzón de la agencia como usuario con notificaciones en cada cuenta** (MED-14) | Es lo único que avisa de un pago rechazado o una verificación pendiente antes del corte | Sí |
| 15 | **Prueba activa con envío real de un lead de prueba** | Crea un contacto en el CRM del cliente | Solo en clientes que lo acepten; en el resto, la prueba sin envío |

**C. Personas**

| # | Pregunta | Por qué importa | Recomendación |
|---|---|---|---|
| 16 | **¿Qué deja de hacer Eury y a qué dedica el tiempo liberado?** ¿Se retira por escrito la revisión L-X-V? | Si el ritual viejo no se retira, el agente es trabajo añadido | Retirarlo con fecha cuando la pantalla Cartera lleve dos semanas funcionando |
| 17 | **¿Quién hace de sénior?** (valida umbrales, casos de oro y la muestra ciega) | Si Eury es el único que sabe de Ads, el agente aprendería de quien aún está aprendiendo | Enric a corto plazo, 30 minutos a la semana. Valorar unas horas al mes de un consultor externo. Si no hay nadie, asumir que el agente es el sénior de hecho y no relajar ningún control del apartado 7.6 |
| 18 | **¿Quién cubre a Eury** en vacaciones, bajas y fines de semana? ¿Quién habla con el cliente de Ads? | Un solo gestor es el mayor riesgo operativo del servicio | Nombrar suplente antes de encender las interrupciones |
| 19 | **¿Queremos que Eury aprenda a diagnosticar o aceptamos depender de la herramienta?** | Si el agente diagnostica siempre, nadie aprende | Que aprenda: tres capas de explicación, «primero tú» voluntario y una revisión al mes sin diagnóstico previo. Hablarlo con él antes de diseñarlo |

**D. Legal y contratos**

| # | Decisión | Por qué importa | Recomendación |
|---|---|---|---|
| 20 | **Una consulta de asesoría** que cubra: contrato de encargo con cada cliente y subencargados, cláusula de IA, uso cruzado de datos entre clientes, modo sector sensible, supresión de leads ya subidos, y publicidad sanitaria por comunidad autónoma | Varias decisiones de arriba dependen de ella | Hacerla una vez, antes de la decisión 8 |
| 21 | **Lista de clientes en modo sector sensible** | Límite duro en el código | Marcarlos en el inventario; ante la duda, sensible |
| 22 | **Benchmark entre clientes:** ¿solo interno o también en informes? | Confidencialidad y competidores directos | Solo interno, agregado y con cláusula |

**E. Más adelante o menores**

| # | Decisión | Recomendación |
|---|---|---|
| 23 | **Niveles de servicio** (base y avanzado) y precio | Decidir con el inventario y la línea base delante, no ahora |
| 24 | **TrueClicks** como vara de medir y parche temporal, más un script de ritmo de presupuesto en la MCC | Sí, si los contratos permiten dar acceso a un tercero y la inversión total cabe en su tramo gratuito |
| 25 | **Informe de subastas programado** | Probarlo en 3 cuentas con volumen; no merece un despliegue general |
| 26 | **Llamadas: grabación y clasificación** | Aparcado. Antes, medir duración y llamadas perdidas |
| 27 | **Comercio electrónico** (las pocas cuentas que hay) | Fuera del primer alcance: Shopping y feeds no se han investigado a fondo |
| 28 | **Plazos internos** (interrupción vista en 1 hora laboral, hallazgo decidido en 2 días) | Valores de partida; ajustarlos tras el modo sombra |

### 13.2 Orden de construcción [opinión, para debatir]

**Qué cambió respecto a la v1 y por qué.** La v1 ordenaba por dependencia lógica (la medición invalida todo, luego va
primero) y dejaba para el final tanto lo que más horas ahorra como lo único que no se puede recuperar después. Los tres
revisores lo atacaron desde sitios distintos y en parte se contradicen:

| Revisor | Qué pide primero | Su razón |
|---|---|---|
| R1 (cuentas) | Que nada esté roto y la auditoría de higiene de las 25 cuentas | Es lo que más dinero recupera el primer mes |
| R2 (operativa) | Cartera y lote de términos | Es lo que quita trabajo; sin adopción no hay módulo |
| R3 (negocio) | Identificador de clic, acuerdo de objetivos y calidad del lead | Es lo que seguirá siendo nuestro en tres años y lo que no es retroactivo |

**Cómo lo resuelvo.** Las tres cosas son ciertas y no compiten por el mismo recurso. Lo de R3 que no es retroactivo
(capturar el identificador, pactar objetivos, conseguir que el cliente devuelva el dato) casi no es desarrollo: son
decisiones y hábitos, y arrancan **en el paso 0, en paralelo a todo**. En desarrollo, primero lo que se nota la primera
semana (R2), con los hechos duros y la auditoría de R1 inmediatamente detrás. El diagnóstico fino, que era la fase 2 de la
v1, baja; el bayesiano entre cuentas y el benchmark van al final.

| Paso | Qué | Capacidades | Qué nota el equipo | ¿Defendible ante Google? |
|---|---|---|---|---|
| **0** | **Sin código.** Prueba de acceso; inventario de cobertura; semana real de Eury y bajas del último año; nivel de cliente; acuerdos de objetivos (provisionales donde haga falta); consulta legal; decisiones 8 a 10 | NEG-01 (en papel), AGE-01 (línea base) | Nada todavía. Decide el resto del orden | Sí: es el objetivo de negocio |
| **0b** | **Captura del identificador de clic** y de la etapa del lead, en los clientes que lo autoricen. Empieza la lista semanal de leads al cliente | MED-05, MED-15, NEG-05 | Nada visible; cada día cuenta | **Lo más defendible** |
| **1** | **Acceso, almacén y descarga del histórico** (métricas de hasta 37 meses; historial de cambios y fotos diarias desde ya) | Sincronización, PRO-08 | Nada todavía | Soporte |
| **2** | **Pantalla Cartera y las cuatro interrupciones** (campaña parada o desbocada, rechazo, landing caída, pago), con ritmo de gasto, CPL frente a objetivo, estado de la medición y último cambio con su autor. Las ocho respuestas, activas | PRO-01, PRO-05, PRO-06, PRO-07, PRO-13, MED-01 (estados), MED-12, MED-14, INF-01 | **Deja de entrar en las 25 cuentas a ver si pasa algo** | Sí (cruza web y contrato) |
| **3** | **Auditoría de higiene de las 25 cuentas**, una vez, y vigilancia de que no vuelva. Sale por tandas dentro de la revisión de cuenta, no como 25 listas de avisos | EST-07, EST-01, EST-02, EST-04, EST-06, TER-04, TER-11, GOO-01, GOO-06, LAN-06, LLA-02 | El mayor recorte de gasto inútil del primer mes | A medias: Google no audita contra el negocio |
| **4** | **Lote de términos, versión delgada**: reglas, ficha, n-gramas, zona, embeddings y juez pequeño; salida lista para pegar y cierre por historial. Si se aprueba la decisión 9, aplicación con un clic | TER-01, TER-02, TER-03, TER-06, TER-12 | **Primer ahorro grande de horas** | No: es lo que antes caduca. Por eso, delgada |
| **5** | **Lo que no se ve desde las métricas de campaña**: entrega del lead, llamadas, latido y prueba activa, cierres, lanzamientos, otra cuenta anunciando. Donde el inventario diga que hay CRM o GA4 | MED-02, MED-03, MED-13, MED-16 a 18, LLA-01, LLA-03, NEG-03, EST-10 a 12 | Se dejan de escapar los fallos más caros | Sí |
| **6** | **Diagnóstico con el porqué, en modo sombra** al menos dos semanas: se guarda lo que habría avisado, Enric y Eury lo puntúan, se pasan los 26 casos y se calibra el tope con 90 días de histórico. Después se enciende | DIA-01, 03, 05, 06, 07; PRO-02, 03, 09, 12; PUJ-01, 03; CUO-01, 03, 05; GOO-04 | Responde a la petición del brief sin quemar la confianza | Sí |
| **7** | **Guion de revisión, expediente de cuenta e informe al cliente** con objetivo frente a resultado; cierre de mes; previsión sencilla | INF-02, 03, 07, 08; PLAN-01; AGE-02, AGE-04; ESC-05 | Recorta los días de revisión profunda; es lo que el cliente ve | Sí |
| **8** | **Saneamiento de la medición** por tandas (decisión 13) | MED-04, 07, 09, 11 | — | Sí |
| **9** | **Calidad del lead**, en las cuentas donde el paso 0b haya dado datos. Subida a Google (decisión 12) | LEAD-01 a 06, NEG-04, NEG-06, MED-10 | El salto de valor, donde haya datos | **Lo más defendible** |
| **10** | **Planificación, landing, anuncios y propuestas R2** | PLAN-02 a 05; PUJ-02, 04 a 08, 10, 11; CUO-02, 06; LAN; ANU; ESC; NEG-02; AGE-01, AGE-03 | Estrategia y venta adicional con evidencia | Sí (previsión y negocio); no (anuncios) |
| **Final** | **Estadística entre cuentas y aprendizaje**: bayesiano jerárquico con sector, benchmark, descomposición fina, evaluación con control | APR-02, 04, 05; DIA-02 completa; PUJ-05 | Solo si el inventario dice que hay sectores con 3 o más cuentas | Sí, si hay datos |

**Calendario y Navidad.** Estamos a finales de noviembre. Si los pasos 0 y 1 ocupan diciembre, no se envía ningún aviso en
plena campaña de Navidad. La línea base sale del histórico descargado, con Black Friday, Navidad y Reyes marcados como
periodos especiales; el modo sombra del diagnóstico no empieza antes de mediados de enero.

**Primera semana de uso real** (R2, adoptado tal cual). Solo esto:

1. **Cartera**: una fila por cuenta, cinco columnas, colores.
2. **Como máximo 2 interrupciones al día**, de los cuatro tipos del paso 2.
3. **Un lote de términos al día para 5 cuentas** (las 25 en la semana), con salida para pegar. Si el paso 4 aún no está,
   la primera semana es solo Cartera.
4. Las ocho respuestas, activas desde el primer día.
5. Diagnóstico y anomalías, **en sombra**: no se envían.
6. Viernes, 30 minutos con Eury y Enric: qué sobró, qué faltó, qué no se entendió.

**Criterio de éxito:** que Eury deje de abrir las 25 cuentas lunes, miércoles y viernes porque Cartera le basta, y que diga
cuántas horas le ha costado el lote frente a su revisión de términos habitual. Si eso no pasa, no se construye nada más
hasta entender por qué.

**Lo que ya no se construye al principio:** tableros de cuota de impresiones y de nivel de calidad, test de anuncios,
ratio Lin-Rodnitzky, experimentos entre cuentas, ajustes de estacionalidad, transcripción de llamadas.

### 13.3 Lo no verificado (consolidado)

**Pendiente de prueba real (de aquí cuelga el plan)**
- Que el token de desarrollador ya no exista, los niveles Explorer y Basic y sus cupos, y que una cuenta de servicio en la
  MCC baste para leer. Documentación leída; nadie lo ha probado.
- Que la Data Manager API no exija el nivel de acceso de la API de Ads, que una cuenta de servicio baste, y sus cuotas.
- Que el historial de cambios recoja o no los cambios hechos con Google Ads Editor (el informe 04 dice que no; un revisor
  lo duda). De ello depende el cierre automático de propuestas.
- El efecto del cambio del 17 ago 2026 en campañas de **leads con CPA objetivo**: no está medido (los datos son de comercio
  electrónico). Por eso el agente lo presenta como causa «posible».

**Técnico, comprobar antes de diseñar**
- Recurso de la API para el detalle de llamadas en la v26 (`call_view` en versiones anteriores) y para el estado de
  verificación del anunciante.
- Si los envíos de formularios de Google se pueden leer por API, y el plazo de 30 días para descargarlos.
- Si la versión publicada del contenedor de etiquetas se puede leer desde fuera de forma fiable.
- Si el informe de subastas se puede programar desde la MCC para varias cuentas o hay que hacerlo una a una.
- Si la acción nativa de GoHighLevel sigue subiendo conversiones tras el 15 jun 2026, y si llamadas importadas y ajustes de
  conversión de la API de Ads también quedaron bloqueados.
- Histórico del nivel de calidad por API segmentado por fecha; tipos de simulación por recurso, cuántos días cubren y en
  cuántas campañas pequeñas existen; lista exacta de motivos de estado de campaña.
- Límite de peticiones por segundo de la API; estado de las librerías para Node.
- Umbral de 700 clics en 7 días para el modelado por consentimiento (dos informes lo citan; uno no lo encontró).
- Disponibilidad en España de los recursos de mensaje de WhatsApp y de los servicios locales de Google (un informe dice que
  existen para hogar desde 2020; otro lo deja sin verificar).
- Plazo real de la cuota de impresiones (2-3 días frente a 24-48 h).

**De la agencia (se resuelve con el inventario y la semana de medición)**
- Cuántas cuentas tienen CRM con etapas marcadas, landing rastreada, GA4, Search Console y GBP conectados, objetivo pactado.
- Cuántas campañas están por debajo de 15 leads al mes; cuántos sectores tienen 3 o más cuentas.
- Horas reales por tarea. Todas las cifras de tiempo de este documento (15-30 horas semanales, el lunes de Eury, el ahorro
  por paso) son estimaciones de oficio sin medir.
- Qué parte de los leads son llamadas («entre la mitad y tres cuartos» es estimación de un revisor).
- El reparto de valor por niveles que da el consultor de cuentas (35 % en «que nada esté roto», 25 % en higiene, 15 % en
  términos…) es criterio de oficio: orienta el orden, no es una medición.
- Cómo cobra la agencia (cuota fija o porcentaje).

**Legal (validar con asesoría; nada de esto es asesoría)**
- Roles de responsable y encargado, contrato de encargo y subencargados; base legal para subir datos a Google; supresión.
- Si en sector sensible se puede subir al menos el identificador de clic.
- Autorizaciones autonómicas de publicidad sanitaria; lista de reguladores financieros españoles para la verificación.
- Alcance exacto del riesgo de marcas ajenas en textos de anuncio.
- Obligaciones del Reglamento de IA de la UE para una agencia que usa estos sistemas.

**De mercado**
- Precios de Optmyzr y Adalysis; rendimiento de cualquier agente autónomo; reseñas de G2 y Reddit (bloqueadas; solo se leyó
  Capterra). Tramo gratuito de TrueClicks para la inversión total de la agencia.
- Los estudios de Optmyzr, Adalysis y smec son de proveedores, con sus clientes: correlaciones, no causalidad. El de Portent
  sobre velocidad, igual: no se usa para estimar euros.
- Cifras de AI Max de fuentes secundarias (Monks, Mantica, Brainlabs). Volumen de Microsoft Ads en España.

**De método (propuestas propias, a calibrar con vuestros datos antes de fiarse)**
- Pesos de la confianza de causa; fórmula de prioridad y pesos por nivel de cliente; umbrales bayesianos (10 % y 30 %); la
  fuerza m; el «punto de partida semántico»; la tasa de los términos nuevos frente a la del sector.
- Todos los topes del presupuesto de atención (2 interrupciones, 5 + 3 en el parte) y los plazos internos.
- La fórmula del nivel de calidad de Geddes (pesos 3,5 / 1,75 / 2 / 1) es ingeniería inversa de 2017.
- La estacionalidad por sector en España y que los CPC españoles sean menores que los de EE. UU. son hipótesis sin datos.
- Los benchmarks de LocaliQ repiten cifras entre ediciones: solo orden de magnitud.

**Sin cubrir**
- Comercio electrónico (feeds, Shopping) a fondo; comunidades en español, portugués y alemán más allá de lo leído; gestión
  real de Microsoft Ads y Meta (solo se contemplan como recomendación).

---

## 14. Fuentes clave

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


---

## 15. Registro de la revisión

Tres revisores recibieron la v1 con el encargo de tirarla abajo. Aquí está cada crítica con su decisión y el motivo en una
línea. Los números son los del propio revisor (sus archivos están en `docs/ads/investigacion/revision/`); cuando un revisor
repite la misma crítica en dos sitios, va en una sola fila. Las referencias «v1 §» usan la numeración de la v1; «→» indica
dónde queda en esta versión.

**Balance.** De 174 críticas: 149 aceptadas, 23 aceptadas en parte, 1 rechazada y 1 que queda pendiente de una prueba. Que
haya tan pocos rechazos no es cortesía: la mayoría de las críticas señalaban errores comprobables (un cálculo, una
contradicción interna, un caso real que el diseño no veía) o huecos que la v1 ni planteaba. Donde no estoy de acuerdo, o
solo lo estoy a medias, el motivo está escrito.

### 15.1 Donde los revisores se contradicen, y qué se decidió

| Tema | Posturas | Decisión |
|---|---|---|
| Qué se construye primero | R1: que nada esté roto y la higiene. R2: Cartera y términos (adopción). R3: identificador de clic, objetivos y calidad del lead (lo defendible) | Lo de R3 que no es retroactivo arranca en el paso 0 porque casi no es desarrollo; en desarrollo, primero R2 y enseguida R1 (→ 13.2) |
| Términos | R1 y R2: es el trabajo que más horas se lleva. R3: es lo que antes absorberá Google | Se construyen pronto pero delgados, sin el bayesiano entre cuentas (→ 2.6) |
| Tope de avisos | R1: 3 urgentes al día y el resto semanal. R2: 2 interrupciones + 5 decisiones + 3 informativos, por persona y global | El de R2: es compatible con el de R1 y define canales y dueño (→ 7.3) |
| Cuentas pequeñas | R2: no salen nunca en la cola y son las que se dan de baja. R3: tope de horas según la cuota, o se comen al gestor | Las dos: suelo de revisión por nivel y techo de horas por cuota (→ 4.6) |
| Solo lectura | R2: durante cinco fases es doble trabajo. R3: no hay que tocarlo | Se mantiene, con salida lista para pegar, cierre automático y dos decisiones adelantadas a Enric (→ 7.2) |
| Madurez de las conversiones | R1: en local la conversión cae en la misma visita. R2: el resumen del lunes usa días inmaduros | Se mide por cuenta; el lunes vale para gasto y leads primarios, y los cualificados van como «provisional» |
| Listas de negativas por sector | R1: subir a R2 con vista previa. R2: nada de lista compartida, solo sugerencia por cuenta | La de R2, más estricta (→ TER-03) |
| Estrategia y canales | R1: ESC-07 sobra en local. R3: falta estrategia y previsión | Deja de ser un control periódico y pasa a la revisión trimestral con guion (→ PLAN-04, PLAN-05) |
| Umbral de «campaña desbocada» | R1: 1,5× el presupuesto sin conversiones. R2: 1,7-1,8× o acumulado | El de R1 más el acumulado de 3 días (→ PRO-01) |

### 15.2 R1 · Consultor de cuentas

| Crítica | Qué señalaba | Decisión | Motivo y dónde queda |
|---|---|---|---|
| R1-G1 · 2.1 MED-01 | La puerta «sin nota mínima el agente calla» suspendería a la mayoría de cuentas locales | Aceptada | Callaba donde más falta hace. Tres estados que solo limitan lo que depende de la conversión → MED-01, 3.B |
| R1-2.1 MED-09 | «Clic en teléfono o WhatsApp nunca primaria» degrada la única señal de la puja | Aceptada | Sin señal mejor, degradar hunde el volumen. El hallazgo es «construir la señal» → MED-01, MED-09 |
| R1-2.1 «1-3 primarias» | Cuatro leads legítimos no caben en la regla | Aceptada | La regla correcta es «ninguna cuenta dos veces el mismo evento» → MED-01 |
| R1-G2 · 2.1 MED-02 | «Ads > CRM» se leía como sobreconteo | Aceptada | Diagnóstico al revés: lo primero y lo caro es que el lead no llega → MED-02 |
| R1-G2 · 2.1 MED-03 | «Si el CRM también cae, es real»: un formulario roto tumba los dos | Aceptada | Tres firmas, mirando otros canales y llamadas → MED-03 |
| R1-G3 · 2.1 v1 §3.3 | La descomposición logarítmica no existe con cero conversiones y da precisión falsa con 10-30 | Aceptada | Error de método: versión aditiva, filtro de ruido, orden en vez de porcentajes → 4.3 |
| R1-2.1 v1 §3.3 (2 y 3) | Cuota «< 10 %» y universo elegible estirado por amplia y AI Max | Aceptada | Límites añadidos → 4.3 |
| R1-G4 · 2.1 v1 §3.2 | El paso «¿es real?» podía silenciar un pago rechazado en festivo | Aceptada | Hechos duros siempre y primero → 4.2 A |
| R1-2.1 paso 3 | Siempre hay cambios en 14 días: hace falta filtro de peso | Aceptada | 20-30 % del gasto afectado y fecha ±2 días → 4.2 |
| R1-G5 · 2.1 TER-02, TER-07, v1 §4.2 | Regla evaluada cada semana hasta que salte | Aceptada | Mismo error que criticaba en los tests; calculado: 46-79 % de falsos en un año → 5.2 |
| R1-2.1 v1 §4.3 | Punto de partida optimista; se vendía gastar más como ventaja | Aceptada | Recalculado con la tasa de términos nuevos y pérdida esperada → 5.3 |
| R1-2.1 TER-03 | Lista de sector con riesgo R1 es un cambio masivo | Aceptada | Y con la versión más estricta de R2 → TER-03 |
| R1-2.1 TER-05 | Añadir en exacta todo término con 2 conversiones trocea datos | En parte | «Término protegido» por defecto; añado un motivo propio para añadirlo (no depender del emparejamiento amplio) → TER-05 |
| R1-G6 · 2.1 PUJ-02 | «<15 conversiones = riesgo» sería alerta permanente | Aceptada | A nivel de cuenta y cartera; contexto, no alerta → PUJ-02 |
| R1-2.1 PUJ-09 | El ajuste de estacionalidad es para tasa de conversión, no para demanda | Aceptada | Ejemplo erróneo. Sustituido por presupuesto temporal; innovación 16 retirada → PUJ-09, 11 |
| R1-G6 · 2.1 CUO-03 | «Ranking perdido > 30 %» es normal con CPA objetivo | Aceptada | Variación frente a línea base propia → CUO-03 |
| R1-G6 · 2.1 CUO-02 | Subir presupuesto con CPL medio en objetivo contradice el coste marginal | Aceptada | Solo con objetivo; redistribuir o argumento para el cliente → CUO-02, 5.7 |
| R1-2.1 EST-01 | Apagar socios o cambiar presencia no es R1 | Aceptada | R2, de uno en uno → EST-01 |
| R1-F1 | Familia de llamadas | Aceptada | LLA-01 a 03; recurso de la API por comprobar en v26 → 3.C |
| R1-F2 | Formularios de Google sin entregar | Aceptada | MED-13; el plazo de 30 días, por comprobar |
| R1-F3 | Avisos de Google por correo; inferir el corte por horas | Aceptada | MED-14 (pide decisión 14) y MED-12 corregida |
| R1-F4 | Lo pausado que debería estar activo | Aceptada | PRO-13 |
| R1-F5 | Cierres del cliente | Aceptada | EST-10, unido al calendario comercial de R3 |
| R1-F6 | Modo lanzamiento | Aceptada | EST-11 |
| R1-F7 | El identificador de clic se pierde en redirecciones | Aceptada | MED-15 |
| R1-F8 | Versión del contenedor y huella del formulario | En parte | La huella, sí; leer la versión del contenedor desde fuera está por comprobar → MED-16 |
| R1-F9 | Acciones de conversión creadas solas | Aceptada | MED-01 |
| R1-F10 | Clasificar quién hizo cada cambio | Aceptada | PRO-08 |
| R1-F11 | Otra cuenta anunciando al mismo cliente | Aceptada | EST-12 (solo donde hay GA4) |
| R1-F12 | Certificado, dominio y latido de leads | Aceptada | PRO-06, MED-17 |
| R1-F13 | Marca con Smart Bidding paga de más | Aceptada | PUJ-11 |
| R1-F14 | Las negativas no caducan | Aceptada | TER-12 |
| R1-F15 | Mismo término en varias campañas | Aceptada | TER-07 |
| R1-F16 | Exclusiones de contenido a nivel de cuenta | Aceptada | EST-01 |
| R1-F17 | Propiedad, accesos y línea base congelada al heredar | Aceptada | Tanda 0 de EST-07 |
| R1-F18 | Cierre de mes | Aceptada | INF-07 |
| R1-F19 | Tiempo de respuesta al lead, semanal | Aceptada | NEG-03 |
| R1-2.2 PRO-01 | «+140 % frente a ayer» salta cada lunes; «> 2×» no puede ocurrir | Aceptada | PRO-01 |
| R1-2.2 PRO-03 (mediana) | Con recuentos bajos, mediana 0 y MAD 0 | Aceptada | Media de 8 semanas → 5.1, 5.5 |
| R1-2.2 PRO-03 (α) | α = 2 % en 100 campañas son varias falsas por semana | Aceptada | Binomial negativa, sobre clics, calibración con histórico → 5.1 |
| R1-2.2 MED-04 | Tasa > 30-40 % salta en marca y llamadas | Aceptada | MED-04 |
| R1-2.2 PUJ-07 | Apagar por horario corta formularios nocturnos | Aceptada | PUJ-07 |
| R1-2.2 LAN-01 | La mayoría de palabras no tiene nota | Aceptada | Cobertura visible → LAN-01 |
| R1-2.2 EST-05 | Lista en «segmentación» puede ser remarketing a propósito | Aceptada | EST-05 |
| R1-2.2 EST-03 | Separaciones por decisión del cliente | Aceptada | Campo «motivo de negocio» → EST-03 |
| R1-2.2 PMax | Qué hacer con una PMax heredada que funciona | Aceptada | Se audita, no se desmonta → 1.2 |
| R1-2.2 CUO-04 | El informe de subastas no da filas en campañas pequeñas | Aceptada | «En parte de las cuentas»; CUO-05 es la vía principal |
| R1-2.2 DIA-04 | Search Console también llega tarde y es ruido en webs pequeñas | Aceptada | Solo con volumen y posición estable → DIA-04 |
| R1-2.3 TER-08, EST-08, ESC-08, LEAD-07 | Sobran en local | Aceptada | Aparcadas → 3 (introducción) |
| R1-2.3 ANU-03 | Un grupo local no reúne datos para un test | En parte | Aparcada; se conserva el método como regla de «mejor no testar que testar mal» → 5.6 |
| R1-2.3 PRO-10 | Google casi nunca reembolsa | En parte | Fuera el expediente; se mantiene como evidencia y exclusión de zona → PRO-10 |
| R1-2.3 ESC-07 | Sobra en local | En parte | Sale como control; su contenido pasa a PLAN, porque R3 pide con razón más estrategia |
| R1-2.3 GOO-08 | Solo para AI Max | Aceptada | GOO-08 |
| R1-2.3 · 5.2-5 APR-03 | Experimentos entre cuentas | Aceptada | Solo dentro de una cuenta; R2 y R3 coinciden → APR-03 |
| R1-3 · G8 | Prioridades y orden: higiene de las 25 cuentas en la fase 1 | En parte | La auditoría sube al paso 3; delante van Cartera y hechos duros. Sus porcentajes de valor son estimación de oficio → 13.2 |
| R1-4 | 26 casos reales: 10 bien, 6 a medias, 10 fallados | Aceptada | Pasan a ser el examen de aceptación → 4.8, APR-06 |
| R1-5.1 (acceso) | «Verificado» era documentación leída, no prueba | Aceptada | «Según documentación, pendiente de prueba real» → 0, 9.1, decisión 1 |
| R1-5.1 (17 ago) | Sin cifras en leads se usaba como causa | Aceptada | Sale como «posible» → PUJ-03, DIA-05 |
| R1-5.1 (servicios locales) | Los informes se contradicen sobre España | Aceptada | No se sugiere hasta comprobar → EST-09 |
| R1-5.2-1 | Rutina «no mirar conversiones de ayer» frente a alertas diarias de conversión | Aceptada | A diario solo cuenta entera y sobre clics → PRO-03 |
| R1-5.2-2 | «10 alertas por mañana» no es excepción | Aceptada | Presupuesto de atención → 7.3 |
| R1-5.2-3 | «Nada masivo» frente a TER-03 y PUJ-09 | Aceptada | Las dos corregidas |
| R1-5.2-4 | CUO-02 frente a v1 §4.7 | Aceptada | 5.7 |
| R1-5.2-6 | Ejemplos con cerrajeros | Aceptada | Sustituidos |
| R1-5.2-7 | Ejemplo de madurez: «ayer» corregido con F(0) | Aceptada | Error de cálculo: 2,35 leads y 51 €, no 42 € → 5.4 |
| R1-5.2-8 | R1 aplicado a cambios que no son pequeños | Aceptada | Definición de riesgos rehecha → 3 (introducción) |
| R1-5.3 «90 %» | «Exactamente el 90 % del trabajo manual» | Aceptada | Comprobado en 09b: es el 90 % de los *cambios manuales*; la frase venía del propio informe en bruto → 0 |
| R1-5.3 Poisson | «Ninguna herramienta lo usa» | Aceptada | «Ninguna de las cuatro analizadas lo documenta» → 5.1 |
| R1-5.3 madurez | No es problema central en local | En parte | Cierto para formulario y llamada; sigue importando en el lead cualificado. Se mide por cuenta → 5.4 |
| R1-5.3 «120 capacidades» | Es un pasivo, no un activo | Aceptada | Apagadas por defecto, aparcadas y 12-15 tipos visibles → 3, 7.1 |
| R1-5.3 Portent | Correlación de proveedor | Aceptada | No se usa para estimar euros → LAN-03 |
| R1-5.3 ficha | Varias capacidades heredan una ficha sin mantener | Aceptada | Fecha de última confirmación → NEG-07 |

### 15.3 R2 · Operativa de agencia

| Crítica | Qué señalaba | Decisión | Motivo y dónde queda |
|---|---|---|---|
| R2-V1 · 1.6 | Un analista, no un puesto de trabajo: ninguna pantalla | Aceptada | Era el hueco mayor de producto → 7.1 |
| R2-V2 · 5.1 | Las fases 0-2 no ahorran ni un minuto | Aceptada | Orden rehecho por adopción → 13.2 |
| R2-V3 | Solo lectura durante cinco fases es doble trabajo | En parte | Sigue naciendo en solo lectura (línea roja); se añade lo que lo hace soportable → 7.2 |
| R2-V4 · 2.3 · 6.1 · 6.2 | La puerta de medición deja mudo al agente y es «una nota que obliga» | Aceptada | Tres estados y plan de saneamiento → 3.B |
| R2-V5 · 4.1 | Los cruces dependen de datos que nadie ha contado | Aceptada | Inventario de cobertura, antes que nada → 13.1 (4), 13.2 |
| R2-V6 · 3.3 | El agente aprende del aprendiz | Aceptada | Las respuestas no tocan la detección → 7.4, APR-07 |
| R2-V7 · 4.2 | Las cuentas pequeñas no salen nunca en la cola | Aceptada | Impacto relativo, peso del cliente y suelo de atención → 4.6 |
| R2-4.2 (pesos) | Fórmula con nivel y riesgo de baja | En parte | Adoptada; los pesos son criterio a calibrar, se añade el techo de horas de R3 y no se enseña como «euros» |
| R2-V8 | Faltan nivel de cliente, pendientes, guardias, traspaso, control de calidad | Aceptada | 7.7 |
| R2-V9 · 6.7 | Poisson avisa a los 15-20 días en campañas pequeñas | Aceptada | La consecuencia no estaba sacada: prueba activa y señales adelantadas → MED-18, 5.1 |
| R2-1.1 · P5 | No dice qué deja de hacer Eury | Aceptada | Retirar el ritual por escrito → 7.2, decisión 16 |
| R2-1.2 a 1.3 | El lunes y el miércoles con el diseño de la v1 | Aceptada | Como estimación del revisor, a medir → 7.2 |
| R2-1.4 | Guion de revisión de cuenta | Aceptada | 7.1 |
| R2-1.5 | Ahorro por fase | En parte | Se usa para ordenar; son cifras sin medir y así se marcan |
| R2-P1 | Cierre automático por historial de cambios | Aceptada | Depende de la cobertura de Editor, por comprobar → 7.2 |
| R2-P2 | Salida lista para aplicar | Aceptada | 7.2 |
| R2-P3 | Adelantar la decisión de aplicar negativas | Aceptada | Decisión 9, con recomendación de sí |
| R2-P4 | Pausa de emergencia automática | En parte | Solo para landing caída (es un hecho); el gasto desbocado, por tope en script de la MCC → decisión 10 |
| R2-2.1 | Tabla de fallos típicos de adopción | Aceptada | Recogida en 12.1 |
| R2-2.2 (topes) · 6.19 | Presupuesto de atención por persona y global | Aceptada | Como valores de partida, a calibrar en sombra → 7.3 |
| R2-2.2 (agrupación, silencios, recordatorios) | Reglas que faltaban | Aceptada | 7.3 |
| R2-2.2 (plantilla) | «Por qué te lo digo ahora» | Aceptada | Ejemplo rehecho → 4.7 |
| R2-2.2 (respuestas) | Ocho respuestas y regla dura sobre umbrales | Aceptada | 7.4 |
| R2-2.3 (saneamiento) | Arreglar la medición hace «caer» los resultados del cliente | Aceptada | Plan por tandas con aviso previo → 3.B, decisión 13 |
| R2-3.1 (capas, caso de la semana, lo que no se propone) | Cómo debe enseñar | Aceptada | 7.5 |
| R2-3.1 (nivel por familia) | Nivel que sube con decisiones que salieron bien | En parte | Nivel por familia, sí; calculado, no: sería ruido con apariencia de nota → 7.5 |
| R2-3.1 («primero tú») | En 1 de cada 5 diagnósticos | En parte | Voluntario, con la frecuencia que elija el gestor y sin informar aciertos → 7.5 |
| R2-3.2 (fricción, tope, muestra ciega, retrospectiva) | Controles contra aprobar sin pensar | Aceptada | Muestra ciega con juez de IA al no haber segunda persona → 7.6 |
| R2-3.2 (piloto automático) | Señales, con aviso «a Enric, no a Eury» | En parte | Las señales, sí; ocultas al gestor, no → 7.6 |
| R2-3.2 (propuestas de control) | Plantar propuestas dudosas para detectar piloto automático | **Rechazada** | Es una trampa a la única persona del equipo; destruye la confianza que hay que ganar, y la muestra ciega cubre el mismo riesgo → 7.6 |
| R2-3.3 (casos de oro) | «Lo que hizo Eury» enseña el nivel básico | Aceptada | Casos con desenlace conocido → APR-06 |
| R2-3.4 | Descualificación | Aceptada | Decisión 19 |
| R2-4.3 | Pendientes del cliente, lo que decide el cliente, ficha de reunión, marcado de leads | Aceptada | 7.7, riesgo RC, INF-08, NEG-05 |
| R2-4.4 | Circuito de encargos con web y SEO | Aceptada | 7.7 |
| R2-4.5 | Plazos internos | En parte | Como valores de partida; con un solo gestor los fija Enric → decisión 28 |
| R2-4.6 | Alta de cuentas; el histórico existe desde el día 1 | Aceptada | La v1 dejaba entender que había que esperar 6-8 semanas → 7.7, 5.5 |
| R2-4.7 | Guardias, ausencias y traspaso | Aceptada | 7.7, decisión 18 |
| R2-4.8 | Control de calidad del trabajo humano | Aceptada | Sin clasificación de personas → 7.6 |
| R2-4.9 | Registro de no-acciones; predicción individual solo en R2 y R3 | Aceptada | APR-01 |
| R2-5.1 (Navidad) | La línea base incluiría Black Friday, Navidad y Reyes | Aceptada | Periodos especiales y sombra hasta enero → 5.5, 13.2 |
| R2-5.2 | Orden alternativo A-J | Aceptada | Es la base del nuevo orden, fusionado con R1 y R3 → 13.2 |
| R2-5.3 | Primera semana de uso y criterio de éxito | Aceptada | Adoptado tal cual → 13.2 |
| R2-5.4 | TrueClicks como parche mientras se construye | En parte | Sí, con dos comprobaciones previas (tramo gratuito, contratos) → 10.4, decisión 24 |
| R2-6.3 | Presupuesto oculto al gestor | Aceptada | La v1 confundía inversión en medios con cuota de agencia → 8.4 |
| R2-6.4 | «Manos quietas» no puede bloquear en solo lectura | Aceptada | Semáforo y aviso posterior → PUJ-06 |
| R2-6.5 | EST-01 no es R1 | Aceptada | Coincide con R1 |
| R2-6.6 | Explorer no basta con comprobaciones horarias | Aceptada | Basic pasa a requisito → 9.1 |
| R2-6.8 | Falsas alarmas repetidas en el tiempo | Aceptada | 5.1 |
| R2-6.9 | Duda de que el historial no cubra Google Ads Editor | Pendiente de prueba | El informe 04 y el revisor se contradicen y ninguno lo ha probado → 9.2, 13.3 |
| R2-6.10 | El «90 %» es de cambios, no de trabajo | Aceptada | Coincide con R1 y R3 |
| R2-6.11 | El ejemplo bayesiano contradice el argumento de venta | Aceptada | El beneficio es menos falsos positivos, no rapidez → 5.3 |
| R2-6.12 | Referencia de sector con 25 cuentas | Aceptada | Solo con 3 o más cuentas; fuera del resumen → 5.3, APR-04 |
| R2-6.13 | Experimentos entre cuentas | Aceptada | Coincide con R1 y R3 |
| R2-6.14 | «Cada acción se evalúa» es falso para R1 | Aceptada | R2 y R3; las R1 en conjunto → APR-01, 10.1 |
| R2-6.15 | MAD con 6-8 puntos en campañas pequeñas | Aceptada | Método según volumen → 5.5 |
| R2-6.16 | «> 2× el presupuesto» no salta nunca | Aceptada | PRO-01 |
| R2-6.17 | El resumen del lunes usa días inmaduros | En parte | Vale para gasto y leads primarios donde maduran en horas; cualificados, «provisional» → INF-02 |
| R2-6.18 | «Dos bloqueos ya no existen» sin prueba | Aceptada | Coincide con R1 y R3 |
| R2-6.20 | Seis agentes deben ser una sola voz | Aceptada | 6.4, 7.1 |
| R2-6.21 | Listas de negativas por sector | Aceptada | TER-03 |
| R2-6.22 | Los tiempos no tienen fuente: medir una semana real | Aceptada | Decisión 3 |
| R2-7 | Siete preguntas para Enric | Aceptada | 13.1 |

### 15.4 R3 · Paid media y negocio

| Crítica | Qué señalaba | Decisión | Motivo y dónde queda |
|---|---|---|---|
| R3-1 · 1.1 · 1.2 | No existe un objetivo de negocio por cliente | Aceptada | Era el hueco mayor de negocio → 2.2, NEG-01 |
| R3-1.2 (fórmula) | CPL máximo calculado desde margen, cierre y cuota | Aceptada | Con cuatro precisiones propias (tipo de lead, recurrencia, cuota móvil, objetivo provisional) → 2.2 |
| R3-2 · 1.3 | Se recomienda subir presupuesto sin mirar la capacidad del cliente | Aceptada | Tercera luz del semáforo → NEG-02, ESC-03 |
| R3-NEG-03 | Respuesta al lead, semanal | Aceptada | Sustituye a LEAD-09 |
| R3-NEG-04 | Tasa de cierre vigilada | Aceptada | Con su límite: con 2 ventas al mes solo se ve por trimestre |
| R3-NEG-05 | Retorno del dato con botones para el cliente | En parte | Primero borrador que envía una persona; los botones son un mensaje a cliente real y piden diseño y decisión → decisión 11 |
| R3-3 · 5.3 · 7.11 | El identificador de clic estaba en la fase 4 y no es retroactivo | Aceptada | Mismo argumento que la v1 usaba para el almacén → paso 0b |
| R3-4 · 6.1 · 7.10 | RGPD tratado como riesgo genérico; «sin datos en claro» es falsa tranquilidad | Aceptada | A validar con asesoría → 12.2 |
| R3-6.2 | Modo sector sensible | Aceptada | Límite duro en el código → 12.3 |
| R3-6.3 | Pasar el modo de consentimiento a avanzado es decisión legal del cliente | Aceptada | Riesgo RC → MED-07. La comprobación del banner queda como informativa, no como auditoría legal |
| R3-6.4 | Medicamentos de prescripción, autorización autonómica, superlativos, textos automáticos | Aceptada | ANU-06, GOO-03 |
| R3-6.5 | Cláusula de IA, uso cruzado, experimentos, competidores, Reglamento de IA | Aceptada | 12.4 |
| R3-5 · 2.1 · 2.2 | No hay previsión ni escenarios | En parte | Contenido aceptado (PLAN-01 a 05); se coloca después del diagnóstico y con rangos anchos: con estas cuentas una previsión estrecha sería precisión falsa |
| R3-PLAN-03 | Reducción honesta y conflicto de interés si se cobra por porcentaje | Aceptada | Decisión 7 |
| R3-PLAN-04 | Microsoft Ads, Meta y otros canales | Aceptada | Como recomendación, no como gestión |
| R3-6 · 3.1 | Los cuatro números de la agencia y su línea base | Aceptada | 2.5, decisiones 2 y 3 |
| R3-AGE-01 a 04 | Rentabilidad, riesgo de baja, venta adicional, registro de valor | En parte | Aceptadas, pero son de la agencia entera: van al núcleo y Ads aporta señales (regla del proyecto) → 3.Q |
| R3-AGE-05 | Niveles de servicio y precio | Aceptada | Como decisión 23, no como capacidad |
| R3-11 · 3.3 · 7.17 | El informe al cliente no lleva objetivo, previsión ni tareas del cliente | Aceptada | Plantilla de seis bloques → INF-03 |
| R3-7 · 4.2 · 7.5 | CUO-06 y ESC-01 se contradicen sobre la marca | Aceptada | Regla única; añado qué hacer cuando no hay volumen para probar → CUO-06 |
| R3-4.3 | Prueba por semanas alternas | Aceptada | Con sus límites → 5.8 |
| R3-4.1 · 4.4 | Leads totales como árbitro; acciones locales; tres columnas; benchmark sin marca | Aceptada | 2.4, NEG-06, MED-01, LEAD-01, APR-04 |
| R3-12 · 4.5 | Falta la rama «cambió otra cosa del marketing del cliente» | Aceptada | DIA-07 |
| R3-4.6 | Vista SEO + ficha + Ads en la misma decisión | En parte | Dentro de la revisión trimestral (PLAN-05), no como capacidad propia ahora |
| R3-5.1 | Un tercio del catálogo caduca; se construye antes lo que antes absorberá Google | En parte | El diagnóstico es correcto (→ 2.6), pero no se invierte el orden: términos antes por adopción, y delgados |
| R3-9 · 5.2 | El modelo de datos nace atado a Google | Aceptada | Columna de plataforma, métricas neutras, motor que no conoce a Google → 8.1 |
| R3-5.3 | Reordenar las fases | En parte | Identificador y objetivos al paso 0; informe al cliente antes. La previsión no va con el diagnóstico sino después |
| R3-8 · 7.1 | «Coste por venta por término» no es posible con estos volúmenes | Aceptada | Promesa que el propio apartado de estadística desmentía → 0, LEAD-01 |
| R3-7.2 | «En meses» sabremos qué funciona por sector | Aceptada | «En uno o dos años, para las acciones más frecuentes» → 0, 11 |
| R3-10 · 7.3 | El valor del lead es el punto de equilibrio, no el máximo | Aceptada | Error de concepto → LEAD-04, 2.2 |
| R3-10 · 7.4 | Igualar CPA marginal solo vale si un lead vale lo mismo | Aceptada | Retorno marginal y tope de capacidad → 5.7, PUJ-05 |
| R3-7.6 | CUO-02 y ESC-04 contra el negocio | Aceptada | Coincide con R1 |
| R3-7.7 | «Exactamente el 90 %» | Aceptada | Coincide con R1 y R2 |
| R3-7.8 | Umbrales de volumen incoherentes (30, 15, <15) | Aceptada | Unificados y con su origen (Google o expertos) → PUJ-02, LEAD-05 |
| R3-7.9 | «Pujar por marcas ajenas» mal planteado como riesgo legal | Aceptada | Habría vetado campañas legítimas → 12.1 [validar] |
| R3-7.12 | La fórmula de prioridad ignora el coste para la agencia y no son «euros» | Aceptada | 4.6 |
| R3-7.13 | La tabla comparativa enfrenta nuestro objetivo con su presente | Aceptada | Presentada como hipótesis de producto → 0, 10.1 |
| R3-7.14 | α = 2 % | Aceptada | Coincide con R1 y R2 |
| R3-7.15 | El acceso descansa en hechos no probados | Aceptada | Coincide con R1 y R2 |
| R3-7.16 | Servicios locales de Google sin verificar | Aceptada | Coincide con R1 |
| R3 (cierre) | Lo que está bien y no hay que tocar | Mantenido | Solo lectura primero, «el código calcula y la IA redacta», la estadística del apartado 5, «no concluyente», no reimplementar lo que ya es gratis |
