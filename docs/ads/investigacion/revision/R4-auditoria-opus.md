# R4 · Auditoría independiente de la versión 2

**Fecha:** 28 nov 2026 · **Documento auditado:** `docs/ads/INVESTIGACION-GOOGLE-ADS.md` (versión 2, entero) · **Contrastado
con:** los 11 informes de `investigacion/bruto/`, `R1`-`R3`, `BRIEF.md`, `CLAUDE.md`, `docs/SEO-PUNTO-DE-RETORNO.md` y
`lib/core/capabilities.ts`. **Encargo:** buscar fallos, no confirmar.

**Qué no he hecho.** No he consultado fuentes externas: todo lo «verificado» aquí significa «coincide con el informe en bruto
que lo cita», no «es cierto en Google». Los cálculos los he rehecho con un script (integración numérica de la Beta y
simulación de Monte Carlo con 20.000-200.000 repeticiones).

---

## Veredicto

**La dirección de diseño se sostiene; el documento todavía no está listo para convertirse en diseño técnico.** Lo esencial
aguanta la auditoría: nacer en solo lectura, «el código calcula y la IA redacta», hechos duros antes que estadística, acuerdo
de objetivos por cliente, orden por adopción con la parte de términos delgada, y la honestidad sobre lo que no se sabe. El
muestreo factual sale limpio: de 42 afirmaciones contrastadas, 35 coinciden con su fuente, 7 son parciales y ninguna la
contradice.

Los fallos están en tres sitios:

1. **Un error estadístico que la v2 cree haber corregido y ha reintroducido.** La regla bayesiana de términos, mirada cada
   semana, negativiza la mitad de los términos que convierten justo en objetivo (G1).
2. **Falta una pieza que cualquier vigilante necesita:** saber que él mismo está ciego (G2).
3. **Huecos de integración.** Hay dependencias huérfanas en el orden de construcción, efectos hacia fuera sin marcar como
   línea roja y piezas del núcleo que ya existen y no se usan. Además, el documento no tiene en cuenta que el SEO está
   congelado ni dice cuánto cuesta construir el módulo.

Nada de esto obliga a cambiar la decisión de fondo. Todo se corrige en el documento antes de diseñar tablas.

---

## 1. Muestreo de afirmaciones factuales (42)

OK = coincide con la fuente interna citada · PARCIAL = la fuente lo dice con un matiz que el documento pierde · NO = la
fuente lo contradice.

| # | Afirmación de la v2 (ubicación) | Fuente comprobada | Resultado |
|---|---|---|---|
| 1 | El 90 % de los cambios manuales del mercado son del tipo de lo que hace Eury: términos, pausas, CPL (0, punto 1) | 01:553, 09b:49-361 | **PARCIAL.** Optmyzr dice que el ~90 % de lo manual es *segmentación* (palabras y negativas), y que la tarea más repetida es el **presupuesto**. Ni las pausas ni la vigilancia del CPL son «segmentación» |
| 2 | Solo el 3 % usa exclusión de marca en PMax (1.1) | 01:551, 01:607 | OK |
| 3 | Ad Strength sin correlación en más de 1M de anuncios (1.1) | 01:550 | OK |
| 4 | AI Max: Google, +14 % y +27 % (1.2) | 09b:350 | OK |
| 5 | smec, 250+ campañas: +13 % de valor, CPA +16 %, ROAS mediano 0 % (1.2) | 01:365, 07:16 | **PARCIAL.** Son campañas de **retail**; la v2 lo usa para decidir sobre leads sin decirlo (en el 17 ago sí lo dice) |
| 6 | Exacta mejor ROAS en el 72,5 % de cuentas (1.2) | 01:549 | OK |
| 7 | 17 ago: CPC +15,8 %, cuota 40→31 %, perdida por presupuesto 4→33 % (9.5) | 09b:44, 09b:322 | OK (y el ámbito de comercio electrónico está bien señalado) |
| 8 | Rooijmans: tCPA de 300 a 220 y leads de 20-30 a 6 (1.2) | 07:80 | OK |
| 9 | Adalysis, 5.900 cuentas, fijación (1.2) | 01:240 | OK |
| 10 | Röttgerding: 576 tests A/A, 55 % con ≥1.000 impresiones y 81 % con 100.000 (5.6) | 01:467-468 | OK |
| 11 | Rooijmans: >60 clics, >5 €, <0,5 conversiones en 90 días; 7.000 $ (1.2) | 01:309, 01:322 | OK |
| 12 | 35 clientes por gestor; el 55 % controla el ritmo de gasto a mano (1.4) | 07:12, 07:135 | OK (encuesta Fluency a más de 75 agencias de EE. UU.; la v2 omite el país) |
| 13 | 37 meses de datos diarios desde jun 2026 (5.5, 8.3) | 04:173 | OK |
| 14 | `change_event` 30 días; `change_status` 90 días (PRO-08, 8.3) | 04:27, 04:658 | OK |
| 15 | Modelado por consentimiento: 700 clics en 7 días (MED-07) | 04:486, 06:223, 09b:115 | OK; la discrepancia con el 09b está señalada |
| 16 | 2× al día y 30,4× al mes; días apagados desde el 1 jun 2026 (PRO-07) | 09:21, 09:266-268 | OK |
| 17 | Impresiones totales −11 % interanual (CUO-07) | 09b:270 | OK (Q1 2026 frente a Q1 2025) |
| 18 | «Google pide ≥15 conversiones en 30 días para pujar a una acción y ≥30 para evaluar un CPA objetivo» (PUJ-02, LEAD-05) | 06:26, 10:170-176 | **PARCIAL / contradicción entre informes no resuelta.** El 06 da el 15 solo para metas de lead cualificado. El 10 (verificado en la ayuda oficial) dice: «Los 15 o 30 que circulan son reglas antiguas o de practicantes, no requisito actual»; el 30 es una *recomendación de evaluación* y el único umbral oficial es «<7». LEAD-05 lo llama «umbral de Google» |
| 19 | Adalysis: mínimos de 350 impresiones y 7 conversiones (5.6) | 05:590 | OK (omite los 300 clics) |
| 20 | Conversion Lift: unos 5.000 $ y 1.000 conversiones (5.8) | 08:18 | OK |
| 21 | TrueClicks gratis hasta 50.000 $ al mes (3.S, 10.1) | 02:24, 02:468 | OK |
| 22 | Optmyzr ~208 $, Adalysis ~149 $, Opteo 249-499 $ (10.1) | 02:350, 02:634, 02:45-50 | OK |
| 23 | Token de desarrollador retirado el 9 sep 2026 (9.1) | 04:51-75, 10:9 | OK (según la documentación) |
| 24 | Explorer 2.880, Basic 15.000, Standard con unos 10 días (9.1) | 04:82-88 | OK |
| 25 | Basic: verificación de marca «en minutos» (9.1) | 04:71-72, 04:87 | **PARCIAL.** «Minutos» es el tiempo de aprobación *tras* verificar. El mismo informe recoge dos problemas conocidos: `AUTHORIZATION_ERROR` en proyectos ascendidos después del 9 sep, y rechazos por la facturación del proyecto. La «media hora» del resumen es optimista |
| 26 | 20 cuentas por correo; la cuenta de servicio va en la MCC (9.1) | 04:113, 10:79 | OK |
| 27 | v26 del 14 oct 2026, se retira en nov 2027; unos 13 meses por versión (9.1) | 04:21, 04:163 | OK |
| 28 | Revocación tras 90 días sin uso (9.1) | 04:66 | OK |
| 29 | Paginar no gasta cupo (9.1) | 04:98 | OK |
| 30 | API gratuita: «la documentación no lo afirma» (9.1) | 04:18 | **PARCIAL.** El 04 lo afirma sin matiz; la v2 es más prudente que su fuente (no es un fallo) |
| 31 | Subida offline bloqueada para nuevos desde el 15 jun 2026 (9.3) | 04:31, 04:500 | OK |
| 32 | Data Manager en la interfaz lee PostgreSQL, últimos 14 días (9.3) | 09b:76 | OK |
| 33 | Scripts: 30 minutos y 50 cuentas (9.6) | 04:44, 04:607 | OK |
| 34 | Llamadas cualificadas por IA solo en EE. UU. y Canadá (LEAD-07) | 06:41, 06:101 | OK |
| 35 | La mitad de las PMax servía páginas no elegidas (LAN-06) | 05:21, 05:127 | OK (muestra de ppc.io) |
| 36 | Opteo: 0 conversiones en 4 días fijos (5.1) | 02:147-149 | OK |
| 37 | Wenner: unas 140 funciones, unas 30 útiles; inestable por encima de 10-12 (6.3) | 01:562-563 | OK |
| 38 | 20 % de respuestas erróneas de IA generalista sobre PPC (APR-08) | 03:103 | OK |
| 39 | Ask Advisor solo en inglés (10.1) | 03:101 | OK |
| 40 | «El 40 % de los profesionales no automatiza porque no se fía» (12.1) | 01:553, 09b:359 | **PARCIAL.** Según el 09b es una encuesta informal de 64 personas; se presenta como dato general |
| 41 | Geddes: si el CPC sube un 25 % y el CPA no cambia, el sistema funciona (4.4) | 10:368 | OK |
| 42 | Feb 2027: DSA a AI Max, anuncios solo de llamada, retirada de la v23 (9.5) | 04:35, 04:160, 04:555 | OK |

Además, la frase de 5 «Los tres revisores rehicieron los cálculos de este apartado y los dieron por correctos» es
**PARCIAL**. R2 rehízo la tabla de Poisson y R3 los cálculos de la v1; R1 no dice haberlos rehecho. Y los números **nuevos**
de la v2 no los ha revisado nadie: el ejemplo bayesiano recalculado y el 46 % / 79 %.

**Resultado:** 35 OK, 7 PARCIAL, 0 NO. La disciplina de fuentes es buena. Los fallos de la v2 no están en los hechos sino
en el razonamiento y en la integración.

---

## 2. Hallazgos GRAVES

### G1 · La regla bayesiana de términos repite el error de «mirar hasta que salte» y dice lo contrario de lo que hace

**Ubicación:** 5.3 (ejemplo recalculado y «Reglas de decisión de partida»), 10.1 (fila «Decide bien con pocos datos»), TER-01
paso 4, y R1 (fila «R1-2.1 v1 §4.3») en 15.2.

**Evidencia.** He rehecho la tabla de 5.3 y es correcta como foto de un momento: 29 %, 9,0 %, 4,8 %, 23,8 % y 82,8 %. El
problema es qué pasa cuando la regla «actuar si P(cumple) < 10 %» se evalúa **cada semana**, que es como funciona el lote
semanal. Simulé un término que convierte **exactamente en objetivo** (CR 5 %, CPA 40 €), con 10 clics por semana durante un
año, el punto de partida Beta(2, 48) del documento y esa regla:

| Tasa real del término | CPA real | Probabilidad de negativizarlo en un año | Gasto mediano al cortarlo |
|---|---|---|---|
| 5 % (justo en objetivo) | 40 € | **50 %** | 120 € |
| 7 % (un 40 % mejor que el objetivo) | 28,6 € | **18 %** | 60 € |
| 3 % (malo) | 66,7 € | 96 % | 120 € |

Con 5 clics por semana salen cifras parecidas (45 %, 18 % y 88 %).

En consecuencia:

- **El error que R1 encontró en 5.2 (G5) reaparece en 5.3.** La v2 lo corrige para la regla e^(−k) («una sola mirada»), pero
  la regla bayesiana se mira igual cada semana y no lleva ninguna corrección.
- **El texto dice lo contrario de lo que hace.** «Lo que da es menos falsos positivos» era verdad con el punto de partida
  del sector (8 %), por encima del objetivo. Con el punto de partida «honesto» (4 %, por debajo del objetivo), el método
  corta **antes** y, por tanto, da **más** falsos positivos que k = 3. Las dos frases de 5.3 («no da rapidez, da menos falsos
  positivos» y «corta antes que k = 3») no pueden ser ciertas a la vez para un término bueno.
- **La crítica de R1 («decidir por pérdida esperada, no solo por P < 10 %») figura como aceptada, pero el cuerpo sigue
  usando P < 10 %.** Se menciona la pérdida esperada y no se aplica.
- **El 05 ya proponía un margen que la v2 ha perdido.** El 05:516 decide con P(CPA > 1,5 × CPA*) > 0,9; la v2 lo cambió por
  P(CPA > CPA*) > 0,9, sin el margen del 1,5 ×.
- **Todo depende de una cifra ilustrativa.** «Los términos nuevos convierten al 4 %» está marcada como ilustrativa, pero
  decide el resultado.

**Gravedad.** Es la pieza que la tabla comparativa vende como ventaja frente al mercado. Además, cada negativa equivocada
dura 6 meses, y en una cuenta de 6 leads al mes eso puede quitar un servicio entero.

**Corrección propuesta (redacción para 5.3):**

> «**Qué da de verdad.** Una probabilidad explícita y una forma de combinar la intención con los datos. Rapidez no da, y
> menos falsos positivos solo si el punto de partida no está por debajo del objetivo.
>
> **Regla de decisión.** Se negativiza si se cumplen las tres condiciones:
> 1. P(CPA > 1,5 × CPL máximo) > 0,9 (margen del 05 §5);
> 2. el gasto acumulado es ≥ 2 × CPL máximo;
> 3. la pérdida esperada de seguir (euros que se gastarán en 4 semanas si el término es malo) supera la de cortar (leads que
>    se pierden si es bueno, por su valor).
>
> El punto de partida de los términos nuevos se **estima con los datos de la cuenta** (bayes empírico) y nunca puede quedar
> por debajo del 80 % de la tasa objetivo mientras no haya al menos 200 términos nuevos con datos para estimarla. Antes de
> activarla, se simula sobre 90 días de histórico **con miradas semanales** y se publica la tasa de términos en objetivo que
> negativiza. El tope es que, en un año, no más del 10 % de los términos que convierten en objetivo reciba una negativa
> estadística.»

Y en 10.1: la casilla «Decide bien con pocos datos» de Kijutech debe decir «por calibrar», no «Sí».

### G2 · El vigilante no vigila si él mismo está ciego

**Ubicación:** 8.2 (guarda el «Estado de sincronización» pero ninguna capacidad lo lee), 7.1 y INF-01 («comprobadas 25
cuentas, 1.240 controles»), 4.2 A (hechos duros), 9.1 (revocación a los 90 días, retirada de versiones) y familia MED.

**Evidencia.** Ninguna de las unas 150 capacidades avisa de que **nuestros propios datos** no están al día. Hay tres formas
de fallar en silencio, todas documentadas en la propia investigación:

1. **La API de Google deja de responder** (revocación tras 90 días sin uso, versión retirada, cupo agotado, error de
   autorización conocido del 04:69). Las reglas que comparan con la línea base no encuentran nada, y la pantalla Hoy dice
   «comprobadas 25 cuentas… 0 cosas para ti».
2. **Falla la sincronización con GoHighLevel.** MED-02 («Ads > CRM: el lead no llega»), MED-03 firma (b) y MED-17 («la web no
   recibe ningún formulario») avisarían de un **hecho duro con confianza alta** («entrega rota», «formulario roto») cuando lo
   roto es nuestra conexión. Ese aviso acabaría como encargo a web o como mensaje al cliente.
3. **El rastreador o la vigilancia de caídas del SEO se paran.** PRO-06 y MED-18 se quedan sin ver.

En un producto cuyo argumento es «los hechos duros se comprueban siempre», esto es lo primero que hay que tener. El
«1.240 controles» copiado de Opteo es exactamente la tranquilidad falsa que hay que evitar.

**Corrección propuesta (nueva capacidad, en el paso 1):**

> «**MED-00 ★ · Salud de nuestras propias fuentes.** Por cuenta y por fuente (API de Google Ads, GoHighLevel, GA4, Search
> Console, rastreador, vigilancia de caídas): hora del último dato bueno frente a su frescura esperada. Una fuente
> desactualizada **apaga** todas las reglas que dependen de ella y convierte su resultado en «no comprobado». Ningún hecho
> duro que dependa del CRM se emite si la sincronización del CRM no ha dado datos buenos en las últimas N horas. La cabecera
> de Hoy dice «comprobadas 23 de 25; 2 sin datos desde las 06:00 (GoHighLevel)». Una caída de la API de Google Ads es
> interrupción para el responsable técnico, no para Eury. Se apoya en lo que ya existe: `registerHealthCheck` de
> `lib/core/capabilities.ts` y el registro de errores `sys_error_*` con su Técnico de mantenimiento.»

Y en 4.2 A, una condición previa a toda la tabla: «Un hecho duro solo es un hecho si su fuente está sana (MED-00); si no, es
"no comprobado"».

---

## 3. Hallazgos IMPORTANTES

### I1 · El ejemplo estrella (4.7) contradice la arquitectura que presenta

**Ubicación:** 4.7. **Evidencia.** La página devuelve 500 «desde el martes a las 10:40» y el aviso llega tras 212 clics, por
la vía de «sin convertir». Pero PRO-06 comprueba **cada hora** y el apartado 4.2 A dice que los hechos duros se miran siempre
y primero. Con el diseño de la v2, ese caso se detecta el martes a las 11:40 como interrupción, no días después. Además:

- «Que sea casualidad tiene una probabilidad del 1 %» confunde P(datos | sin cambio) con P(sin cambio | datos), la falacia
  del fiscal, justo en el ejemplo que debe enseñar honestidad estadística.
- El 1 % sale de Poisson (e^(−4,5) = 1,1 %), cuando PRO-03 usa binomial negativa por defecto. Con dispersión k = 2, la
  probabilidad es del 9,5 %.

**Corrección:** usar dos ejemplos.

- Uno de **hecho duro**: «Desde las 10:40 la página /reformas-cocina devuelve error 500 (comprobado dos veces). Desde
  entonces, 31 clics y 57 €. Interrupción.»
- Otro de **anomalía estadística sin hecho duro**, con la frase correcta: «Si nada hubiera cambiado, ver cero leads con este
  volumen pasaría menos de 1 vez de cada 10». Calculado con binomial negativa y diciendo lo que no se pudo descartar.

### I2 · La binomial negativa es «por defecto», pero todas las cifras para Enric son de Poisson y subestiman el problema

**Ubicación:** 0 (punto 2), 5.1 (tabla y «segunda conclusión»), 4.7. **Evidencia (rehecha):**

- La tabla de Poisson es correcta, celda a celda.
- Con sobredispersión, que el propio documento da por hecha, las cifras empeoran. Con λ = 0,5 al día, tres días a cero pasan
  el 33 % de las veces con k = 2 y el 40 % con k = 1, no el 22 %. Con λ = 0,2 al día (6 al mes), avisar con α = 5 % pide 21
  días con k = 5, 35 con k = 2 y 96 con k = 1, no 15-20.
- La probabilidad por ventana no es la que vive el gestor. Con λ = 0,5, una campaña tiene un **98 %** de probabilidad de
  tener al menos una racha de 3 días a cero **en un mes**. Con λ = 1,5 (el umbral que 5.1 llama «señal»), un 22 % al mes por
  campaña, unas 2-3 falsas alarmas al año por campaña.
- «Un 2 % por campaña y día, sobre unas 100 campañas, son varias falsas alarmas por semana»: si se mira cada día, son unas 14
  a la semana.

**Corrección:** rehacer la tabla de 5.1 con dos columnas de binomial negativa (k = 2 y k = 5, marcadas como ilustrativas
hasta estimar k por cuenta), y cambiar el resumen a: «Con medio lead al día, casi todos los meses verás tres días seguidos a
cero por puro azar». La conclusión del documento sale reforzada, no debilitada.

### I3 · El orden de construcción deja huérfanas piezas de las que dependen otras

**Ubicación:** 13.2. **Evidencia.** He cruzado las 154 capacidades del catálogo con los pasos. Estas no están en ningún paso,
pero algo que sí está depende de ellas:

| Huérfana | Quién la necesita | Paso donde debería entrar |
|---|---|---|
| MED-00 (G2) y GOO-07 (vigía de la API) | Todo | 1 |
| MED-06 (madurez) | PRO-03 (paso 6) e INF-02 (paso 7) | 1, como recogida de datos |
| TER-05 (término protegido) | TER-01 y TER-02 (paso 4): sin él, una negativa puede bloquear lo que convierte (TER-06 solo lo detecta después) | 4 |
| APR-06 (casos de oro) y APR-01 (registro de decisiones) | El paso 6 «pasa los 26 casos»; las propuestas R2 de los pasos 3 y 10 necesitan predicción previa | 5-6 |
| PRO-11 (freno en la MCC) | Decisión 10, que se presenta como resuelta «al empezar» | 2, si Enric lo aprueba |
| DIA-04 (demanda frente a subasta) | Es uno de los cruces que se venden como únicos | 6 |
| GOO-03 (AI Max) | Las migraciones de sep 2026 ya están ocurriendo | 3 (auditoría) |
| NEG-07 (frescura de la ficha) | TER-04 y EST-02 usan la ficha desde el paso 3 | 3 |

Además, MED-01 sale en el paso 2 (columna «estado de la medición» en Cartera), pero para dar «sana» exige conciliar con el
CRM (MED-02, paso 5). Durante semanas las 25 cuentas saldrían como «dudosa»: una columna sin información y una invitación a
ignorarla.

**Corrección:** añadir estas piezas a sus pasos. Y en el paso 2: «hasta el paso 5, la columna de medición distingue "rota" de
"sin conciliar todavía", nunca "dudosa" por defecto».

### I4 · El objetivo provisional es circular en la mayoría de las cuentas

**Ubicación:** 2.2 (precisión 4), decisión 6, Cartera (7.1), TER-02, LAN-05, EST-11. **Evidencia.** El documento espera que
«muchos clientes no sabrán su margen ni su tasa de cierre». En esos casos el objetivo es la **mediana del CPL de los últimos
90 días**, y pasa esto:

- La columna «CPL frente a objetivo» de Cartera sale centrada en cero **por construcción**: no puede detectar una cuenta que
  paga de más de forma estructural.
- Si se recalcula cada 90 días, el objetivo persigue al rendimiento: si la cuenta empeora despacio, el objetivo empeora con
  ella.
- Los umbrales «k × CPA objetivo» quedan bien como regla relativa, pero el texto los presenta como «colgados del negocio».

**Corrección (redacción para 2.2, precisión 4):**

> «Objetivo provisional: la mediana del CPL de los 90 días previos a la fecha del acuerdo, **congelada**: no se recalcula
> sola. Mientras sea provisional, Cartera no enseña "CPL frente a objetivo" sino "CPL frente a su propia línea base", con la
> etiqueta "sin objetivo de negocio", y la cuenta no puede pasar a nivel A. A los 90 días sin acuerdo real, se abre un
> pendiente para el responsable del cliente.»

### I5 · Efectos hacia fuera que no se marcan como línea roja

**Ubicación:** 13.1 (decisiones 10, 14, 15 y 24), PRO-11, 9.6. **Evidencia** (CLAUDE.md, «Líneas rojas» 2 y 5, y
«Seguridad»):

- **Decisión 10.** Dice «Sí, pero solo para un caso» y en la misma celda añade un segundo caso automático: el tope de gasto
  del script de la MCC (PRO-11), que **pausa** campañas reales. El resumen de 0 repite «solo en ese caso». R2-P4 figura
  como «en parte: solo para landing caída» y luego se amplía.
- **Decisión 24.** Instalar «un script de ritmo de presupuesto en la MCC» y dar acceso a TrueClicks a las cuentas de los
  clientes no lleva ⛔. Lo primero es código que corre dentro de cuentas reales. Lo segundo da los datos de los clientes a un
  tercero, que pasa a ser subencargado (12.2) y servicio externo nuevo.
- **Decisión 14.** Dar de alta un usuario nuevo con notificaciones en cada cuenta cambia los accesos de cuentas que muchas
  veces son del cliente (MED-14 pide su permiso), pero no lleva ⛔.
- **Decisión 15.** Enviar un lead de prueba que crea un contacto en el CRM del cliente es un efecto hacia fuera.
- **9.6, el «puente».** Un script que exporta cada noche los datos de los clientes «a un punto de entrada nuestro» es una
  ruta pública nueva que recibe datos de terceros. Necesita su guarda de seguridad, un secreto, límites y su prueba en
  `tests/seguridad.test.ts`. No se menciona.

**Corrección:** marcar ⛔ las decisiones 14, 15 y 24. Partir la 10 en 10a (pausa por landing caída) y 10b (tope de gasto en la
MCC), cada una con su ⛔. En 9.6, añadir: «El punto de entrada es una ruta de API con secreto propio, guarda de permisos y
prueba de seguridad. El script solo lee».

### I6 · Lo que ya hay en el núcleo no se usa, y el SEO congelado no aparece

**Ubicación:** 8.4, 7.3 (presupuesto de atención «sumando todos los módulos»), PRO-12, 11 (innovaciones 1 y 9). **Evidencia.**

- **«Hace falta un contrato nuevo en el núcleo» para el estado de una URL y para los embeddings.** Pero `lib/core/` ya tiene
  `crawler.ts`, `crawl-extract.ts`, `findings.ts`, `interventions.ts`, y en `capabilities.ts` están `registerEventSource`
  (Estrategia ya lo usa para que Rendimiento lea sus eventos sin importar módulos), `registerMetricSource`,
  `ProjectDossierProvider`, `registerHealthCheck` y `registerChangeExecutor`. Los embeddings viven en `lib/ai/clustering`,
  fuera del módulo SEO. La pregunta 3 del protocolo de decisión («¿hay algo que ya tenemos y no usamos?») no se ha aplicado.
- **No se menciona que el SEO está congelado en `seo-v1`** (`docs/SEO-PUNTO-DE-RETORNO.md`, regla 3: «nunca se mezcla en la
  misma rama un cambio de SEO y uno de Ads»). Todo dato de vigilancia de caídas, registro de cambios de la web o PageSpeed
  que haya que exponer desde `lib/seo` es un **cambio en el SEO** y va en su propia rama. Esto afecta al paso 5 del orden.
- **El presupuesto de atención «por persona y sumando todos los módulos» cambia cómo funcionan los avisos de Operaciones y
  del SEO** (cola `ops_notifications`). Es tocar el núcleo, y el protocolo de decisión no se nombra aquí (sí en 8.4 para el
  acuerdo de objetivos).

**Corrección:** añadir a 8.4 una columna «¿existe ya?» con estas piezas y una nota: «Toda pieza que obligue a tocar
`lib/seo/**` va en una rama `feature/seo-…` aparte, con el protocolo de decisión, y se apunta en la sección 6 de
SEO-PUNTO-DE-RETORNO. El presupuesto de atención global es un cambio del núcleo: protocolo de decisión antes de diseñarlo».

### I7 · No se dice cuánto cuesta construir y mantener el módulo, ni cuánta IA gasta

**Ubicación:** 2.5, 6.1, 9.1, 12.1 («Coste de IA»), 13.2. **Evidencia.**

- 2.5 plantea bien la cuenta («un módulo de este tamaño para proteger 5.000 € al mes»), pero el documento nunca estima el
  tamaño: ni semanas de trabajo, ni horas de Enric revisando, ni mantenimiento. Con unas 150 capacidades, 11 pasos, 5
  pantallas, 8 tipos de respuesta, 7 silencios, 5 niveles de riesgo, 3 estados de medición, niveles A, B y C y tres niveles
  de autonomía por familia, la complejidad es alta para un gestor junior y un director.
- **El tiempo de Enric está infravalorado.** «30 minutos a la semana» como sénior choca con todo lo que se le asigna: modo
  sombra puntuado, resumen mensual de umbrales (APR-07), desacuerdos de la muestra ciega, aprobaciones R3, retrospectiva
  mensual, acuerdos de objetivos, revisión de 3 cuentas por semana durante el saneamiento y casos de oro.
- **Coste de IA sin dimensionar.** El documento remite a «la pasarela con su presupuesto». Según la memoria del proyecto
  (13 nov), ese presupuesto ronda los 80 $ al mes **para toda la agencia**. Ads añade Sonnet en cada diagnóstico, resumen e
  informe mensual de 25 cuentas, Opus en la auditoría de entrada de 25 cuentas y en las reestructuras, Fable u Opus en la
  revisión trimestral, un juez de IA en la muestra ciega, un agente que lee fuentes cada semana (GOO-04) y el redactor de
  anuncios. Hay que calcularlo con la tabla de precios vigente antes de comprometerse.
- **Coste externo sin dimensionar.** CUO-05, ANU-05 y ESC-05 consultan DataForSEO (anuncios en los resultados y volúmenes
  por palabra), que cobra por consulta. No se dice con qué frecuencia ni con qué caché.
- **Mantenimiento de la API.** Hay 3-4 versiones mayores al año (04:21) y hay que subir de versión al menos una vez al año,
  con unas 150 capacidades leyendo campos que cambian de nombre. GOO-07 avisa, pero no hay plan de **pruebas de contrato**
  (respuestas grabadas por versión) que diga qué se rompe al subir.

**Corrección:** añadir a 13.2 una columna «esfuerzo estimado» y una fila de «coste recurrente» (IA, DataForSEO, horas de
Enric). Añadir un «criterio de parada» por paso: si tras el paso 4 las horas de Eury no bajan al menos un X % medido, no se
construyen los pasos 6-10 hasta entender por qué. A 6.1, una línea: «Presupuesto de IA del módulo: N $ al mes calculados;
la pasarela corta por encima». A GOO-07: «pruebas de contrato con respuestas grabadas de la API por versión».

### I8 · Los 12-15 tipos de hallazgo visibles no están enumerados

**Ubicación:** 0, 3 (introducción), 7.1, 12.1. **Evidencia.** La regla aparece cinco veces y es la defensa principal contra
la fatiga de alertas (crítica de R2, aceptada), pero ninguna parte del documento dice **cuáles** son. Sin la lista, cada
paso añadirá «solo uno más».

**Corrección:** una tabla en 7.1, «Hallazgos visibles en el lanzamiento». Por ejemplo: 1) cuenta sin servir; 2) rechazo con
gasto; 3) landing o formulario caídos; 4) gasto desbocado; 5) lead que no llega; 6) entidad pausada que aportaba leads; 7)
llamadas a cero o perdidas; 8) ritmo de gasto fuera de banda; 9) término que se come el gasto; 10) lote de términos; 11)
cambio ajeno en entidad con gasto; 12) medición rota; 13) caída de leads con su porqué; 14) cierre del cliente sin pausar;
15) nuestra fuente sin datos (MED-00). Cualquier hallazgo nuevo sustituye a uno de la lista: no se suma.

### I9 · La familia de llamadas descansa en un recurso sin verificar

**Ubicación:** 3.C, LLA-01 y LLA-03, 13.3. **Evidencia.** El documento estima que las llamadas son «entre la mitad y tres
cuartos de los leads» y crea una familia propia, pero el recurso del detalle de llamadas en la v26 está «por comprobar».
Además, muchos negocios usan números de seguimiento del CRM o del proveedor de telefonía, no los de Google.

**Corrección:** añadir a la decisión 1 (prueba de acceso) «leer el detalle de llamadas de una cuenta» y al inventario
(decisión 4) «¿quién da el número de seguimiento: Google, GoHighLevel u otro?». Si no hay recurso en la API, LLA-01 se apoya
en el CRM y se dice.

### I10 · Integraciones de las revisiones con contradicciones internas

| Dónde | Contradicción | Corrección |
|---|---|---|
| 7.2 frente a 7.7 | Lote de términos semanal para todas las cuentas («5 cuentas al día cubren las 25») frente a «quincenal en C» | Elegir una cadencia: semanal en A y B, quincenal en C, y rehacer la cuenta de 7.2 |
| 0 frente a 13.1 | «Las ocho decisiones que más pesan» lista nueve números (1, 2, 3, 6, 8, 9, 10, 17, 18) | Ver propuesta de agrupación (apartado 6 de esta auditoría) |
| PUJ-02 y LEAD-05 frente al 10 §1.6 | «Umbral de Google» frente a «no es requisito actual» | «≥15 en 30 días: criterio de practicantes y de Google para metas de lead cualificado (06); oficial solo "<7 sin objetivo recomendado" y "30 para evaluar"» |
| 2.5 frente al BRIEF | «3 días» de revisión leídos como 3 días por semana (60-120 h al mes, 40-80 € por hora). El brief es ambiguo: si son 3 días al mes, son unas 24 h y unos 200 € por hora, y el argumento económico cambia | Marcar la doble lectura y dejar que la resuelva la semana de medición (decisión 3) |
| 5 (introducción) | «Los tres revisores… los dieron por correctos» | «R2 y R3 rehicieron los cálculos de la v1; los de la v2 (5.2 y 5.3) son nuevos y los ha rehecho R4» |

---

## 4. Hallazgos MENORES

- **M1 · 5.2, 46 % y 79 %.** Con un proceso de Poisson en el gasto, contando también el primer y el último tramo, me sale un
  44 % (12 conversiones al año) y un 81 % (30). Corregir a «alrededor del 45 % y del 80 %».
- **M2 · 4.3, ejemplo LMDI.** Los factores dan −30,2 %, no −30 %, y por eso los porcentajes suman un 101 %. Usar CR −9,6 % o
  decir «redondeado».
- **M3 · Contexto que se pierde en las cifras.** AI Max de smec es retail (punto 5 del muestreo); el 40 % que no se fía es
  una encuesta informal de 64 personas (40); Fluency es EE. UU. (12). Añadir el matiz en una palabra.
- **M4 · 9.1, «media hora lo confirma».** El 04 recoge dos problemas conocidos de alta. Mejor «media hora si no aparece
  ninguno de los dos problemas conocidos; si aparece, días».
- **M5 · IA donde basta código.** MED-14 (C → Hk): los correos de Google tienen remitente y asunto fijos, así que las reglas
  bastan y Haiku solo hace falta para lo que no encaje. INF-01 (C → Hk): la cabecera de Hoy es código. DIA-06 rellena una
  plantilla fija de cuatro líneas sobre datos ya calculados: probar Haiku antes de Sonnet (directiva de IA, pregunta 4).
- **M6 · Encargos y ClickUp.** La «verificación al cerrar» de 7.7 obliga a saber cuándo se marca hecho un encargo. Debe leer
  el estado desde la caché, sin consultar ClickUp tarea a tarea (regla de ClickUp).
- **M7 · 9.2.** La facturación por API solo existe en cuentas con factura mensual (04:136, 04:381-382): en las de tarjeta no
  hay nada que leer. Dicho en una línea, refuerza por qué MED-14 es imprescindible.
- **M8 · 3.S.** Se dice que el PDF da «TrueClicks desde 208 $», y 208 $ es el precio de Optmyzr (02:350). Puede ser un error
  del PDF, pero no lo he podido comprobar porque el PDF no está en el repositorio.

---

## 5. Lo que sigue faltando para ser de verdad superior al mercado

1. **Saber cuándo se está ciego (G2).** Ninguna herramienta del mercado lo resuelve bien con datos de fuera de Google Ads.
   Para nosotros es imprescindible, porque dependemos de más fuentes.
2. **Un criterio de aceptación con números**, además de la adopción. Para el examen de los 26 casos: «aprobado si detecta
   ≥24 y explica bien ≥20». Para el modo sombra: falsas alarmas ≤ N por semana y tiempo hasta detectar un hecho duro ≤ 1
   hora. Para el valor: horas de Eury por cuenta antes y después.
3. **Una comparación seria con TrueClicks** (la «vara de medir» de 10.4): cuatro semanas en paralelo y una tabla de qué
   encontró cada uno, qué era real y con cuánto retraso. Es la única forma de afirmar «superior» con un hecho y no con una
   hipótesis.
4. **El plan de captura del identificador de clic en los embudos de GoHighLevel**, donde vive buena parte de las landings de
   captación (8.4 lo reconoce). Hay que decir quién lo instala en las 25 webs y embudos, y cómo se comprueba (MED-15).
5. **Pruebas de contrato de la API** por versión (I7).
6. **El coste unitario por cuenta** (IA, DataForSEO, API y horas), para que la decisión 23 (niveles de servicio) tenga
   números.

---

## 6. Claridad para Enric: 28 decisiones son demasiadas

El resumen es comprensible y honesto. El problema es la cantidad: 28 preguntas sueltas no se contestan, se aplazan. Además,
las «ocho que más pesan» son nueve y mezclan cosas de esta semana con cosas de meses vista. Propuesta: **cinco paquetes**,
cada uno con una sola respuesta y una fecha.

| Paquete | Decisiones | Pregunta única para Enric | Cuándo |
|---|---|---|---|
| **A. Arrancar** (sin código) | 1, 3, 4, 5, 6 | «¿Doy el visto bueno a la semana de arranque: prueba de acceso, medir a Eury, inventario, niveles A/B/C y acuerdos provisionales?» | Esta semana |
| **B. Rumbo** | 2, 7, 23 | «¿Qué número perseguimos (horas, bajas o ingreso) y cobramos cuota fija o porcentaje?» | Antes del paso 2 |
| **C. Escritura acotada** ⛔ | 9, 10a, 10b, 14, 24 | «¿Qué cambios puede hacer la herramienta en cuentas reales: negativas con un clic, pausa por landing caída, tope en script de la MCC, buzón en las cuentas, acceso de TrueClicks?» (casilla por casilla) | Antes del paso 4 |
| **D. Datos de clientes** ⛔ | 8, 11, 12, 13, 15, 20, 21, 22 | «¿Encargo la consulta legal única y, tras ella, empezamos a capturar el identificador y a pedir a los clientes que marquen sus leads?» | Consulta ya; el resto tras ella |
| **E. Personas** | 16, 17, 18, 19, 28 | «¿Quién hace de sénior, quién cubre a Eury, qué deja de hacer y lo hablamos con él?» | Antes de encender avisos |
| *Aparcadas* | 25, 26, 27 | No piden respuesta ahora | Revisión trimestral |

Con esto, el resumen de 0 puede terminar con «**Lo que necesito de ti esta semana: el paquete A**». Una respuesta, no
veintiocho.

---

## 7. Resumen de correcciones, por orden de urgencia

1. Rehacer la regla bayesiana de 5.3 con margen, gasto mínimo, pérdida esperada y simulación con miradas semanales; cambiar la
   casilla de 10.1 (G1).
2. Añadir MED-00, salud de nuestras propias fuentes, al paso 1, y condicionar los hechos duros a ella (G2).
3. Rehacer 4.7 con dos ejemplos; pasar las cifras de 5.1 y del resumen a binomial negativa, con la probabilidad mensual de
   racha (I1, I2).
4. Recolocar las piezas huérfanas en 13.2 y evitar que la medición salga «dudosa» por defecto (I3).
5. Congelar el objetivo provisional y sacarlo de «CPL frente a objetivo» (I4).
6. Marcar ⛔ las decisiones 14, 15 y 24, y partir la 10 (I5).
7. Mapear en 8.4 lo que ya existe en el núcleo y la regla del SEO congelado (I6).
8. Esfuerzo, coste recurrente y criterio de parada por paso (I7); lista cerrada de los hallazgos visibles (I8).
9. Agrupar las decisiones en cinco paquetes (apartado 6).
