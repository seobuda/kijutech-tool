# R1 · Revisión del consultor de cuentas

**Fecha:** 28 nov 2026 · **Documento revisado:** `docs/ads/INVESTIGACION-GOOGLE-ADS.md` (entero), con consultas a `bruto/02`, `06`, `09` y `09b`.
**Punto de vista:** quien lleva las cuentas a mano. Leads locales, cuentas de 300 a 3.000 €/mes, 5-40 leads al mes.
**Alcance:** lo que afirmo sobre la práctica en la cuenta es criterio de oficio, no fuente publicada. Los nombres de recursos de la API que cito los conozco de versiones anteriores: hay que comprobarlos en la v26. No he podido verificar las afirmaciones de plataforma fechadas en 2026 (ver 5.1).

---

## 0. Lo más grave, en orden

| # | Problema | Dónde | Consecuencia si no se corrige |
|---|---|---|---|
| G1 | La puerta «si la medición no pasa el examen, el agente no propone nada de rendimiento», combinada con «clic en teléfono o WhatsApp nunca primaria» | MED-01, MED-09 | Suspenden la mayoría de cuentas locales el primer día. El agente calla justo donde más falta hace, o empuja a degradar la única señal que tiene Smart Bidding |
| G2 | MED-02 lee «Ads cuenta más que el CRM» como sobreconteo, y MED-03 lee «el CRM también cae» como caída real | MED-02, MED-03, árbol paso 1 | Los dos casos más caros de la semana (el lead no llega al cliente; el formulario está roto) salen mal diagnosticados |
| G3 | La descomposición logarítmica no existe cuando las conversiones son cero, y con 10-30 conversiones da porcentajes con precisión falsa | DIA-02, apartado 3.3 | El caso estrella («3 días sin leads») no se puede descomponer con el método estrella |
| G4 | El paso 0 del árbol («¿es real?») puede silenciar antes de comprobar los hechos duros (pago, rechazo, URL caída) | Apartado 3.2 | Una tarjeta rechazada en un puente queda como «festivo, se anota» |
| G5 | Las reglas de términos repiten el error que el documento critica en los tests de anuncios: mirar cada semana hasta que algo cruce el umbral | TER-02, TER-07, apartado 4.2 | Se negativizan términos buenos con mala racha. La negativa no caduca nunca |
| G6 | Umbrales de cuota de impresiones y de presupuesto que con Smart Bidding son falsos positivos permanentes | CUO-02, CUO-03, PUJ-02 | Ruido diario y presión para subir presupuesto u objetivo |
| G7 | Faltan controles básicos de la cuenta local: llamadas, formularios de Google sin entregar, verificación del anunciante, campañas pausadas y olvidadas, cierre por vacaciones, lanzamientos, parámetros de seguimiento | Catálogo | Son incidencias de todas las semanas, no rarezas |
| G8 | El orden de construcción pone el diagnóstico fino antes que la auditoría de higiene de las 25 cuentas | Apartado 11.2 | Se retrasa lo que más dinero recupera el primer mes |

---

## 1. Lo que falta en el catálogo

Ordenado por frecuencia real de la incidencia. Cada entrada lleva el texto propuesto para añadirla.

### 1.1 Imprescindibles (familias MED, PRO y EST)

**F1 · Llamadas, como familia propia.** En local, entre la mitad y tres cuartos de los leads son llamadas. El catálogo las trata en una fila mensual (MED-08) y deja el recurso «por verificar». Existe un recurso de detalle de llamadas (`call_view` en versiones anteriores: estado atendida o perdida, duración, hora, campaña).
> **LLA-01 (D):** llamadas perdidas y duración por franja y campaña. Aviso si la tasa de perdidas en horario de anuncios supera la propia línea base o un 25 %. Entra en el árbol como sub-causa de «CR ↓».
> **LLA-02 (S):** recurso de llamada activo, con el número de la ficha, con horario igual al horario de atención real, y con informes de llamada activados. Número del recurso distinto del de la web o del de GBP: aviso.
> **LLA-03 (D):** «llamadas a cero con formularios normales» y al revés. Es la firma de un número de seguimiento caducado o de un formulario roto.

**F2 · Formularios de Google sin entregar.** Los leads de un recurso de formulario caducan en Google a los 30 días si nadie los descarga o si falla el envío al CRM. LEAD-08 mide su calidad, nadie mide su entrega.
> **MED-13 (D):** envíos de formularios de Google en Ads frente a los recibidos en GoHighLevel por esa vía. Cualquier diferencia: aviso urgente (es un lead pagado que el cliente no ha visto).

**F3 · Verificación del anunciante, avisos de política de cuenta y facturación por correo.** La API no da alertas de cuenta y MED-12 lo «infiere» cuando el gasto ya es cero. Los avisos llegan por correo al dueño de la cuenta, que suele ser el cliente y no los lee.
> **MED-14 (E):** un buzón de la agencia dado de alta como usuario con notificaciones en cada cuenta; la herramienta (que ya tiene agente de correo) clasifica los correos de Google: pago rechazado, verificación pendiente con fecha límite, aviso de suspensión, anuncio rechazado. Es el único camino que avisa **antes** del corte. Complemento por API: estado de verificación de identidad y presupuesto de cuenta, a comprobar en v26.
> **Cambio en MED-12:** la inferencia se hace con impresiones por hora de toda la cuenta en horario de servicio (3-4 horas a cero frente a la línea base), no con «gasto a cero» del día.

**F4 · Lo pausado que debería estar activo.** PRO-01 solo mira campañas activas con cero impresiones. Lo habitual es lo contrario: alguien pausa «un momento» (vacaciones del cliente, landing en obras) y no se reactiva.
> **PRO-13 (D):** campaña, grupo o palabra pausados o con fecha de fin vencida que en los 60 días previos aportaba más del 10 % de los leads de la cuenta. Aviso a los 3 días con quién lo pausó. Toda pausa aplicada por el agente lleva fecha de revisión obligatoria.

**F5 · Cierres del cliente.** Agosto, fiestas locales, baja del autónomo. El anuncio sigue y nadie contesta.
> **EST-10 (E):** calendario de cierres en la ficha. Propuesta de pausa o de solo formulario al inicio y de reactivación al final. Silencia las alarmas de ese periodo.

**F6 · Modo lanzamiento.** El documento cita «campañas nuevas, revisión diaria» como regla de oficio pero no hay capacidad, y PRO-02 y PRO-03 necesitan 6-8 semanas de historia que una campaña nueva no tiene.
> **EST-11 (E + D durante 14 días):** lista previa al lanzamiento (zona y tipo de presencia, redes, listas de negativas enlazadas, objetivos de conversión de la campaña, horario, URL y parámetros, presupuesto, fecha de fin, recursos). Después, 14 días de vigilancia con umbrales absolutos: gasto sin impresiones en términos del servicio, primer lead antes de gastar 2 × CPA, términos revisados a diario. Las reglas con línea base quedan suspendidas y la referencia es la del sector.

**F7 · Parámetros de seguimiento y redirecciones.** LEAD-01 une Ads y CRM por identificador de clic o UTM. Si la URL final redirige y pierde los parámetros, todo el bloque LEAD queda ciego. MED-05 lo mira desde el CRM, tarde.
> **MED-15 (S + E):** el rastreador pide cada URL final con un identificador de clic de prueba y comprueba que sobrevive a las redirecciones. Además: plantilla de seguimiento y sufijo coherentes en toda la cuenta, sin UTM escritas a mano distintas por anuncio.

**F8 · Versión del contenedor de etiquetas.** La causa número uno de medición rota es que alguien publica en Tag Manager o cambia el formulario.
> **MED-16 (D):** versión publicada del contenedor y huella del marcado del formulario (identificadores, acción, campos) en cada landing con gasto. Un cambio es un evento fechado para el árbol, igual que el banner de cookies.

**F9 · Acciones de conversión creadas solas.** Cuentas heredadas arrastran «Local actions», «Clicks to call» de campañas Smart, eventos de GA4 importados automáticamente. MED-01 cuenta primarias pero no distingue el origen.
> **Añadir a MED-01:** lista de acciones creadas automáticamente o heredadas de campañas Smart y de la ficha de negocio; ninguna puede ser primaria sin decisión expresa.

**F10 · Clasificar quién hizo cada cambio.** PRO-08 habla de «usuario desconocido». Hace falta más: el cliente que entra tras una llamada del comercial de Google es un usuario conocido.
> **Añadir a PRO-08:** cada usuario se etiqueta como agencia, cliente, Google o herramienta. Todo cambio de «cliente» o «Google» en entidades con gasto avisa el mismo día. Scripts y reglas automáticas del gestor anterior: se detectan por el tipo de cliente del historial y se listan en EST-07.

**F11 · Otra cuenta anunciando al mismo cliente.** El cliente lanza una campaña desde la ficha de Google, o queda viva la cuenta de la agencia anterior. No aparece en subastas (Google no enfrenta al mismo dominio).
> **EST-12 (S):** sesiones de pago de Google en GA4 cuyo nombre o identificador de campaña no existe en nuestra cuenta. Aviso.

**F12 · Certificado, dominio y formulario funcional.** PRO-06 mira 404 y 5xx. Un certificado caducado, un dominio sin renovar o un formulario que devuelve 200 y no envía no se ven.
> **Añadir a PRO-06:** caducidad de certificado y dominio (aviso a 14 días). **MED-17 (D):** latido de leads por todos los canales: si el CRM no recibe ningún formulario de ninguna fuente (pago, orgánico, directo) en un plazo anormal para esa web, el formulario está roto.

### 1.2 Importantes

**F13 · Marca con Smart Bidding.** CUO-06 vigila la cuota de marca pero no su precio. Una campaña de marca en maximizar conversiones o CPA objetivo paga de más sistemáticamente.
> **PUJ-11 (M):** CPC de marca frente a su histórico y estrategia de la campaña de marca. Propuesta: cuota de impresiones objetivo con tope de CPC, o CPC manual.

**F14 · Caducidad de negativas.** Nada revisa una negativa una vez puesta. TER-06 solo ve conflictos con palabras activas.
> **TER-12 (T):** toda negativa puesta por regla estadística (no por intención) lleva fecha de revisión a 6 meses. Listas compartidas: enlace a todas las campañas, incluidas las nuevas.

**F15 · Mismo término servido por varias campañas** (Search, PMax, AI Max, grupos distintos) con coste distinto. GOO-02 lo mira solo a nivel de campaña.
> **Añadir a TER-07:** término con gasto en dos o más campañas o grupos; decidir cuál lo sirve.

**F16 · Exclusiones de contenido y de ubicaciones a nivel de cuenta** (aplicaciones, canales infantiles) para lo que tenga Display, vídeo o PMax. GOO-01 lo mira a posteriori; es un ajuste de entrada. Añadir a EST-01.

**F17 · Propiedad y accesos al heredar.** EST-07 audita rendimiento. Falta: quién es dueño de la cuenta, del perfil de pagos, de GA4, de Tag Manager y de la ficha; enlaces a otras cuentas y gestores que siguen conectados; línea base congelada de los 90 días previos para poder demostrar después la mejora. Añadir como tanda 0 de EST-07.

**F18 · Cierre de mes.** PRO-07 proyecta el ritmo. Falta la rutina: gasto real frente a contrato y factura, ajuste de presupuestos diarios del día 1, campañas con presupuesto compartido, y aviso al responsable si el cliente pagó menos o más de lo contratado.
> **INF-07 (M, día 1 y día −5):** cuadre de gasto y propuesta de presupuestos diarios del mes siguiente.

**F19 · Tiempo de respuesta al lead.** LEAD-09 es mensual y «si el CRM lo da». Es la primera causa de «los leads son malos». Pasarla a semanal y meterla en el árbol (ver caso 5 del apartado 4).

---

## 2. Capacidades mal planteadas

### 2.1 Las que harían daño

**MED-01 · La puerta total.** Tal como está escrita, una cuenta con «clic en llamar» como primaria suspende y el agente no puede decir ni que hay un 30 % de gasto fuera de zona.
> **Redacción propuesta:** «La nota de medición bloquea solo las propuestas que dependen de la conversión (pujas, objetivos, presupuesto, escalado, pausas por CPA). No bloquea lo que es cierto con independencia de ella: zona, redes, URL rotas, rechazos, términos fuera de servicio por intención, ritmo de gasto.»

**MED-01 y MED-09 · «Clic en teléfono o WhatsApp nunca primaria».** Si no hay nada mejor del mismo evento, degradarla deja a Smart Bidding optimizando solo formularios: se desplaza a escritorio y se hunde el volumen. Y cambiar primarias en 25 cuentas es la acción más arriesgada del catálogo.
> **Redacción propuesta:** «El clic en teléfono o WhatsApp no es primaria **cuando existe una señal mejor del mismo evento** (llamada con duración, conversación en el CRM). Mientras no exista, se mantiene como primaria y el hallazgo es "construir la señal mejor", no "degradar". El cambio se hace de una acción cada vez, con la nueva en secundaria 2-4 semanas para comparar recuentos.»
> «1-3 primarias» también falla: formulario, llamada desde anuncio, llamada desde web y WhatsApp son cuatro leads legítimos. La regla correcta es «cada primaria es un lead distinto y ninguna cuenta dos veces el mismo».

**MED-02 · Interpretación del cociente.** «Ads / CRM > 1,2: sobreconteo.» La primera hipótesis debe ser la contraria y la cara: el formulario dispara la etiqueta pero el lead no llega al CRM (webhook caído, correo en spam). Además, con 10 leads por semana, 12 frente a 10 no es señal, y la atribución de canal de GoHighLevel pierde llamadas.
> **Redacción propuesta:** «Comparar por tipo de acción (formularios con formularios), con prueba de recuento y no con cociente fijo. Ads > CRM: primero comprobar entrega del lead (urgente), después doble conteo. Ads < CRM: consentimiento o etiqueta.»

**MED-03 · Firma del formulario roto.** «Si el CRM también cae: es real (landing u oferta).» Un formulario roto tumba las dos cosas a la vez.
> **Redacción propuesta:** tres firmas. (a) Ads a cero y CRM normal: etiqueta. (b) Ads normal y CRM a cero: entrega. (c) Los dos a cero con sesiones normales: mirar los leads de **otros canales** y las llamadas; si también están a cero, formulario o web; si siguen, oferta o tráfico. La frecuencia horaria solo tiene sentido a nivel de cuenta y pasando por el mismo filtro de Poisson que PRO-03.

**TER-02, TER-07 y apartado 4.2 · Mirar hasta que salte.** La cifra del 5 % vale para una sola mirada. La regla se evalúa cada semana sobre cientos de términos: un término que rinde justo en objetivo acaba teniendo una racha de 3 × CPA sin conversión casi seguro a lo largo de un año. Es el mismo defecto que el apartado 4.6 atribuye a los tests de anuncios.
> **Redacción propuesta:** «La regla se aplica al total del término en la ventana (o en su vida), nunca a una racha. Si el término tiene conversiones previas, se juzga por su CPA acumulado. Negativa estadística: en exacta, con fecha de revisión (TER-12). Negativa de frase solo por intención o por n-grama con evidencia agregada.»

**Apartado 4.3 · El punto de partida es optimista.** El ejemplo parte de la tasa media del sector (8 %) para un término nuevo. Los términos nuevos que entran por amplia son peores que la media: los buenos ya son palabras clave. Resultado visible en la propia tabla: con cero conversiones el agente espera hasta 180 € (4,5 × CPA) donde la regla de oficio corta en 120 €. Se presenta como ventaja y es más gasto.
> **Redacción propuesta:** «El punto de partida de un término nuevo es la tasa de los términos nuevos del sector, no la de las campañas. La decisión se toma por pérdida esperada (euros que cuesta esperar frente a leads que cuesta cortar), no solo por P < 10 %.»

**TER-03 · Lista compartida de sector con riesgo R1.** Una negativa de frase aplicada a varias cuentas a la vez es un cambio masivo, que el apartado 8.3 dice querer evitar. «Segunda mano» o «curso» son servicio para algún cliente.
> **Cambio:** R2, validación contra la ficha de cada cuenta afectada y vista previa de los términos con conversión que bloquearía.

**TER-05 · Añadir en exacta todo término con 2 conversiones.** Hoy el término ya se sirve; añadirlo no aporta tráfico, trocea los datos del grupo y llena la cuenta de palabras de poco volumen que luego TER-07 pedirá archivar.
> **Redacción propuesta:** «Solo se añade si hace falta controlar algo: anuncio o landing distintos, enrutarlo a otro grupo, o protegerlo de una negativa. Si no, se marca como "término protegido".»

**PUJ-02 · «Menos de 15 conversiones en 30 días = riesgo» y «maximizar clics = error».** Casi todas las campañas de estas cuentas tienen menos de 15. La alerta sería permanente y la salida que propone (fusionar) choca con clientes que quieren presupuesto por servicio o por sede. Y maximizar clics con tope, o CPC manual, es lo correcto en una cuenta sin historial o en marca.
> **Redacción propuesta:** «Se evalúa a nivel de cuenta y de cartera. Con menos de 15 al mes en toda la cuenta: maximizar conversiones sin objetivo o cartera común; no es alerta, es contexto. Maximizar clics es hallazgo solo si la campaña lleva más de 30 días, tiene conversiones medidas y no es de marca.»

**PUJ-09 · El ejemplo es erróneo.** El ajuste de estacionalidad informa de un cambio previsto en la **tasa de conversión**. Una ola de calor sube la demanda; eso Smart Bidding lo absorbe solo y la palanca es el presupuesto. Con 1-2 leads al día además no hay con qué estimar el porcentaje.
> **Cambio:** sacar PUJ-09 del catálogo local. Sustituir por «suceso local: propuesta de presupuesto temporal dentro del contrato». Quitar la innovación 16 del apartado 9.

**CUO-03 · «Pérdida por ranking > 30 %».** Con CPA objetivo, perder el 40-70 % por ranking es normal: el algoritmo renuncia a subastas a propósito. Umbral fijo: alerta eterna y presión para subir objetivo.
> **Redacción propuesta:** «Variación frente a la propia línea base de 8 semanas, solo en las palabras principales y en la cuota de concordancia exacta. Nunca umbral absoluto.»

**CUO-02 · «Perdida por presupuesto > 10 % con CPL en objetivo: subir presupuesto».** En maximizar conversiones sin objetivo la campaña siempre está limitada por presupuesto: es su diseño. Y el presupuesto es del contrato: subirlo es una conversación comercial, no un ajuste. Contradice además el apartado 4.7 (el lead adicional cuesta 1,43 veces el medio).
> **Redacción propuesta:** «Solo en campañas con objetivo. Salida 1: redistribuir dentro del contrato. Salida 2: oportunidad comercial para el responsable de cuenta, con el CPA marginal estimado, no el medio. Riesgo R0.»

**EST-01 · Riesgo R1 y «un clic».** Apagar socios, quitar Display o cambiar el tipo de presencia mueve volumen de golpe y desestabiliza la puja. Es R2, y de uno en uno por campaña (lo exige el propio PUJ-06).

**Apartado 3.3 · Descomposición.** Tres fallos prácticos:
1. Con conversiones a cero, ln(0) no existe. Hace falta una versión aditiva sobre lo esperado (clics × tasa esperada).
2. La cuota de impresiones por debajo del 10 % llega como «< 10 %»; en campañas pequeñas «búsquedas elegibles» no se puede calcular.
3. Con amplia y AI Max el universo elegible lo estira Google. «Impresiones / cuota» deja de medir demanda.
> **Redacción propuesta:** «Un factor solo entra en el reparto si su cambio supera su propio ruido. Si ninguno lo supera: "no concluyente". No se enseñan porcentajes con menos de 30 conversiones en el periodo de comparación; se enseña el orden de los factores.»

**Apartado 3.2 · Orden del árbol.**
> **Redacción propuesta:** «Los hechos duros (pago, suspensión, rechazo, URL o certificado caídos, etiqueta ausente, entrega del lead) se comprueban siempre, a diario, haya o no anomalía, y avisan aunque sea festivo. El paso "¿es real?" solo filtra las anomalías estadísticas.»
> **Paso 3:** en una cuenta gestionada siempre hay cambios en los 14 días previos. Un cambio solo es causa candidata si toca entidades que suman al menos el 20-30 % del gasto afectado y la fecha encaja con ±2 días (más el retraso de conversión).

### 2.2 Las que darían ruido

| ID | Problema | Cambio |
|---|---|---|
| PRO-01 | «Gasto +140 % frente a ayer» salta cada lunes en B2B. «Gasto > 2× el presupuesto diario» no puede ocurrir (Google corta en 2×) | Comparar con el mismo día de la semana y con suelo en euros. Umbral de 1,5× sin conversiones |
| PRO-03 y 4.5 | Con recuentos bajos la mediana del mismo día de la semana es 0 o 1 y el MAD es 0: λ y z no salen | Para leads, media de 8 semanas (por día o semanal), no mediana. Decirlo en 4.5 |
| PRO-03 | α = 2 % por campaña y día, en unas 100 campañas, son varias falsas alarmas por semana, y los leads llegan a rachas | Binomial negativa por defecto y contar sobre clics (ya propuesto como ajuste 2: hacerlo la regla principal) |
| MED-04 | «Tasa > 30-40 % = doble conteo» salta en marca, urgencias y campañas de llamada | Excluir marca y llamadas; comparar con la referencia de su tipo |
| PUJ-07 | «Horario como encendido o apagado» por llamadas perdidas corta también los formularios nocturnos, que suelen ser los leads más baratos | Decidir por separado llamada y formulario; fuera de horario, quitar el recurso de llamada, no la campaña |
| LAN-01 | La mayoría de palabras de una cuenta local no tiene nota (sin datos) | Enseñar la cobertura: % del gasto con nota |
| EST-05 | Una lista en «segmentación» puede ser una campaña de remarketing intencionada | Avisar solo si la campaña no se llama ni se usa como tal |
| EST-03 | Fusionar campañas separadas por decisión del cliente | Campo «motivo de negocio» que exime |
| 1.2, PMax | «No recomendar PMax hasta 30 cualificados al mes» no dice qué hacer con una PMax heredada que funciona | «Una PMax en marcha se audita (GOO-01) y se compara; no se desmonta por regla» |
| CUO-04 | El informe de subastas no devuelve filas en campañas pequeñas y hay que programarlo cuenta a cuenta (a comprobar si el gestor permite uno común) | Presentarlo como «disponible en parte de las cuentas»; CUO-05 es la vía principal |
| DIA-04 | Search Console también llega con 2-3 días y en webs pequeñas las impresiones orgánicas son ruido; además cambian por posiciones | Control válido solo con volumen mínimo y posición estable; si no, usar el sector |

### 2.3 Las que sobran en local (quitar o aparcar)

TER-08 (pensado para cuentas grandes con puja manual), ANU-03 (un grupo local no reúne 7 conversiones por anuncio en meses; basta ANU-01 y ANU-02), PRO-10 (Google casi nunca reembolsa; mantener solo la exclusión), EST-08, ESC-07, ESC-08, GOO-08 salvo AI Max, APR-03 (ver 5.2), LEAD-07.

---

## 3. Prioridad real para leads locales en España

| Nivel | Familias y capacidades | Parte del valor (estimación de oficio) |
|---|---|---|
| **1. Que nada esté roto** | MED-01 (reformulada), MED-02, MED-03, MED-12, PRO-01, PRO-05, PRO-06, PRO-07, PRO-08 y las nuevas F1-F8, F12 | ~35 % |
| **2. Auditoría de higiene de las 25 cuentas, una vez, y vigilancia de que no vuelva** | EST-01, EST-02, EST-06, EST-07, TER-04, TER-11, EST-04, GOO-01, GOO-06, LAN-06 | ~25 % |
| **3. Términos y negativas** | TER-01, TER-02 (corregida), TER-03, TER-06 | ~15 % |
| **4. Calidad del lead** | LEAD-01, LEAD-03, LEAD-09, MED-10 | ~15 %, pero meses de trabajo con el cliente |
| **5. Diagnóstico con el porqué** | DIA simplificado (hechos duros + cambios + cuota), PUJ-01, PUJ-03, CUO-01 | ~5 % en dinero; alto en confianza del equipo |
| **6. Resto** | Anuncios, nivel de calidad, landing fina, escalado, aprendizaje, benchmark | ~5 % |

El 80 % sale de los niveles 1 a 3 más LEAD-01 y LEAD-03. Son casi todo código y reglas simples.

**Cambio propuesto al apartado 11.2:**
- Fase 1 incluye EST-07 corrida sobre las 25 cuentas (hoy está «cuando haya datos») y EST-01, EST-02, TER-04, TER-11.
- Fase 2 pasa a ser términos; el diagnóstico va en fase 3 y empieza por la lista de hechos duros, sin descomposición.
- La descomposición, el bayesiano jerárquico entre cuentas y toda la familia APR van al final. Con 25 cuentas repartidas en muchos sectores, la «referencia del sector» son una o dos cuentas por celda.

---

## 4. Casos reales de cada semana frente al diseño

Detecta = salta una alerta a tiempo. Explica = el mensaje dice la causa correcta.

| # | Situación | ¿Detecta? | ¿Explica? | Hueco |
|---|---|---|---|---|
| 1 | El cliente cambia el formulario y la conversión deja de dispararse | Sí (MED-03) | Sí, si el CRM sigue recibiendo | Depende de la frecuencia del rastreador; añadir F8 |
| 2 | El formulario se rompe de verdad (no envía) | Sí | **No**: MED-03 lo da por «caída real» | Corrección de MED-03 y F12 |
| 3 | El formulario envía pero el lead no llega al CRM ni al correo | Sí (MED-02) | **No**: dice «sobreconteo» | Corrección de MED-02 |
| 4 | Tarjeta caducada o pago rechazado | Tarde (gasto ya a cero) | A medias: no distingue de suspensión o pausa | F3 |
| 5 | El cliente deja de coger el teléfono | **No** (LEAD-09 mensual y condicional) | No | F1, F19 |
| 6 | Google aplica recomendaciones automáticas | Sí (PRO-08, EST-06) | Sí | — |
| 7 | El cliente entra y cambia cosas tras hablar con un comercial de Google | Parcial | Parcial: no es «usuario desconocido» | F10 |
| 8 | Entra un competidor con presupuesto | Parcial y con 3-7 días (CUO-05) | Parcial: quién es, solo si sale en los resultados rastreados | Asumirlo: confianza media como máximo |
| 9 | Web caída o error 500 | Sí (PRO-06) | Sí | — |
| 10 | Certificado o dominio caducados | Depende del vigilante del SEO | — | F12 |
| 11 | Anuncios rechazados (marca registrada, salud, destino no funciona) | Sí (PRO-05) | Sí | — |
| 12 | Cuenta suspendida o verificación del anunciante vencida | Suspensión sí; verificación **no** hasta el corte | — | F3 |
| 13 | Campaña pausada por vacaciones y no reactivada | **No** | — | F4, F5 |
| 14 | Negocio cerrado en agosto con anuncios activos | **No** (solo silencia alarmas) | — | F5 |
| 15 | Un término amplio nuevo se come el presupuesto | Sí (TER-10, rama «gasto ↑») | Sí | La revisión de términos es semanal: pasar a diaria el control de «término nuevo con > X % del gasto del día» |
| 16 | Rediseño de la web: etiqueta duplicada o desaparecida | Sí (MED-04, MED-03) | Sí | MED-04 es semanal: debería dispararse por evento de cambio de web |
| 17 | Oleada de spam en formularios | Sí si alguien marca no válidos (LEAD-03) | Sí | Añadir señal sin CRM: conversiones de madrugada, misma zona, tasa imposible |
| 18 | Cambio de objetivo de CPA «porque lo pedía Google» y caída de leads | Sí (PUJ-04) | Sí | — |
| 19 | Lanzamiento de campaña nueva que no arranca o gasta mal | **No** (sin línea base) | — | F6 |
| 20 | Otra campaña del propio cliente (Smart desde la ficha, agencia anterior) | **No** | — | F11 |
| 21 | Número de seguimiento de llamadas caducado o mal desviado | **No** | — | F1 (LLA-03) |
| 22 | Presupuesto agotado a media mañana tras el cambio del 17 de agosto | Sí (PRO-07, PUJ-03) | Sí | — |
| 23 | Leads de Google (formulario nativo) que nadie descarga | **No** | — | F2 |
| 24 | Festivo local o puente | Sí | Sí | Corregir orden del árbol (G4) |
| 25 | Redirección nueva que borra el identificador de clic | Tarde (MED-05, fase 4) | Parcial | F7 |
| 26 | Leads baratos que no cualifican tras abrir amplia o AI Max | Lento (LEAD-02 mensual) | Sí | Pasar a quincenal cuando hay cambio de concordancia en el historial |

**Balance:** de 26 casos, el diseño resuelve bien 10 (casos 1, 6, 9, 11, 15, 16, 17, 18, 22, 24), a medias 6 (4, 7, 8, 10, 25, 26), y falla o no ve 10 (2, 3, 5, 12, 13, 14, 19, 20, 21, 23). Los fallos se concentran en llamadas, entrega del lead, pausas y cierres, lanzamientos y avisos de cuenta: lo que no se ve desde las métricas de campaña.

---

## 5. Errores, contradicciones y afirmaciones dudosas

### 5.1 Afirmaciones de las que cuelga el plan y que hay que probar con las manos

- **«El token de desarrollador ya no existe», niveles Explorer y Basic, cuenta de servicio en el gestor, Data Manager API sin nivel de acceso.** El apartado 7.1 lo marca «verificado en documentación» y el resumen se lo da a Enric como bloqueo resuelto. No puedo confirmarlo ni desmentirlo. Antes de presentarlo así, una persona debe crear el proyecto y hacer una consulta real. Hasta entonces: «según la documentación leída».
- **Cambio del 17 de agosto en leads con CPA objetivo.** El propio documento admite que no hay cifras de leads, pero PUJ-03 y DIA-05 lo usan como causa. Debe salir como «posible», nunca con confianza alta.
- **Servicios locales de Google en España (EST-09).** El informe 06 dice que existen desde 2020 para hogar; el 09 lo marca sin verificar. Comprobar categorías antes de sugerirlo.

### 5.2 Contradicciones internas

1. **Rutina diaria «no mirar conversiones de ayer» (1.3)** frente a PRO-03 diaria y MED-03 horaria sobre conversiones. Resolver: a diario solo cuenta entera y filtro de Poisson sobre clics.
2. **«Una alerta por causa, unas 10 por mañana»** frente a «informar por excepción». Diez diarias para 25 cuentas no es excepción; Eury dejará de leerlas en dos semanas. Tope propuesto: 3 urgentes al día, el resto en la cola semanal.
3. **Apartado 8.3 («nada masivo»)** frente a TER-03 (lista de sector) y PUJ-09 (ajustes desde el gestor para varios clientes).
4. **CUO-02 (subir presupuesto con CPL en objetivo)** frente a 4.7 (el coste marginal es mayor que el medio).
5. **APR-03 (dar una mejora solo a la mitad de las cuentas al azar)** frente a la responsabilidad con cada cliente. Con 25 cuentas distintas no hay potencia estadística, y hay que poder explicarle a un cliente por qué no se le aplicó algo que se sabía bueno. Limitarlo a entidades dentro de una misma cuenta.
6. **Ejemplos con cerrajeros** (MED-04 por contexto, apartado 4.3, informe 06) cuando el documento afirma que la cerrajería no se puede anunciar en España.
7. **Ejemplo de madurez (4.4):** «ayer» se corrige con F(0) = 0,70; un día de antigüedad es F(1) = 0,85. Saldrían 2,35 leads y CPL de 51 €, no 42 €.
8. **Riesgo R1** definido como «pequeño y reversible» y aplicado a EST-01 y TER-03, que no lo son.

### 5.3 Afirmaciones dudosas o infladas

- «Lo que hace hoy Eury es exactamente el 90 % del trabajo manual del mercado»: retórica; el estudio citado no dice eso de esta agencia.
- «Ninguna herramienta usa Poisson»: cierto según lo leído (Opteo usa 4 días fijos), pero se afirma como hecho de mercado.
- «La madurez de conversiones» se presenta como problema central. En formulario y llamada local la conversión cae en la misma visita. Importa para el lead cualificado del CRM, no para la primaria. No debe retrasar la fase 1.
- «120 capacidades» como activo. Para quien revisa la cola es un pasivo: cada una es una fuente de avisos. El catálogo debería marcar cuáles están apagadas por defecto en cuentas de menos de 15 leads al mes.
- Portent («una página de 1 s convierte 3 veces más»): correlación de proveedor; no usarla para estimar impacto en euros.
- «El presupuesto del contrato» como tope duro supone que la ficha está al día. Lo mismo con servicios, zona y horario: media docena de capacidades (TER-04, EST-02, ANU-07, PUJ-07, LEAD-06) heredan los errores de una ficha que nadie mantiene.
  > **Añadir:** fecha de última confirmación de cada dato de la ficha usado por Ads; por encima de 6 meses, el hallazgo baja a «confirmar con el responsable».

---

## 6. Cambios mínimos antes de enseñarlo a Enric

1. Reescribir MED-01, MED-02, MED-03 y MED-09 con los textos de 2.1.
2. Añadir la familia de llamadas y las capacidades F2 a F8 y F12.
3. Reordenar el árbol: hechos duros siempre y primero; cambios con filtro de peso; descomposición solo con volumen.
4. Corregir TER-02, TER-05, PUJ-02, CUO-02, CUO-03; retirar PUJ-09.
5. Subir a R2 EST-01 y TER-03.
6. Cambiar el orden de construcción: auditoría de higiene de las 25 cuentas en la fase 1.
7. Rebajar en el resumen las afirmaciones de acceso a «según documentación, pendiente de prueba real».
