# Diseño: rendimiento del equipo (5B tiempos + 5C juego)

**Fecha:** 2026-11-12 · **Estado:** enfoque aprobado por Enric el 12 nov (puntos por resultado y el tiempo como información, estimación propia de un toque, bonus progresivo por trimestres, sin ranking). Esquema de 5B aprobado y **5B construido** (rama `feature/tiempos-tarea`, migración 0045; ver docs/ESTADO.md §6.19). 5C, pendiente. En la construcción, el margen propuesto se calcula al abrir la pestaña Tiempos en vez de guardarse en una columna.

Este documento sustituye a la primera propuesta de 5B, que solo resolvía la parte técnica: cómo medir bien el tiempo de cada tarea. Aquí se diseña 5B y 5C juntos, partiendo de la pregunta de Enric: **¿es el mejor sistema para el objetivo?** Para responderla hay que unir tecnología y psicología.

---

## 1. El objetivo, dicho con precisión

No es «medir el tiempo», sino conseguir cinco cosas:
1. **Que el equipo rinda más y mejor**, de forma sostenida y no solo las dos primeras semanas.
2. **Que se viva como algo propio y justo**, no como vigilancia.
3. **Que el agente tenga datos reales** para repartir la carga y fijar plazos creíbles. La visión es que Operaciones sustituya a un humano.
4. **Que el bonus de Navidad premie lo que de verdad importa a Kijutech**: entregas a tiempo, con calidad y sin que haya que perseguir a nadie.
5. **Que dé ganas de usarlo**, «casi como un videojuego».

## 2. Qué dice la investigación (y qué cambia del diseño)

| Hallazgo | Fuente | Qué implica |
|---|---|---|
| Vigilar electrónicamente **no mejora el rendimiento**. Un metaanálisis de 94 estudios (23.000 personas) no encuentra relación en velocidad, cantidad ni comportamiento | The Conversation, resumen del metaanálisis (no he leído el original) | Medir por medir no sirve. El dato tiene que **devolverse a la persona** como ayuda, o no aporta nada |
| La supervisión **resta motivación propia** cuando se percibe como control | Estudio de 2013 basado en la teoría de la autodeterminación (Revue de GRH) | Diseñarlo para la **autonomía**: que la persona decida y vea primero su propio dato |
| Pagar o puntuar por una métrica **la distorsiona**: los comerciales mueven fechas para llegar a la cuota y se amontonan justo por encima del umbral | Oyer 1998; Larkin 2014; estudio de agentes de seguros en China | Si los puntos premian «estar dentro del tiempo», la gente **cambiará el tipo de tarea, inflará estimaciones o no cambiará de tarea activa**. No premiar la velocidad directamente |
| El esfuerzo es máximo cuando el objetivo **ni está asegurado ni perdido**; si te quedas muy atrás, dejas de intentarlo | Estudio estructural de comerciales (Harvard) | **Un umbral anual del 90 % es peligroso**: quien lo pierde en octubre deja de esforzarse hasta enero |
| Los **rankings desmotivan a los de abajo** (el efecto más fuerte, en los peores) y generan envidia | Barankay (Wharton); Universidad de Jyväskylä 2026; varios estudios | **Nada de ranking público**. Progreso personal y objetivos de equipo |
| Un juego de ventas **solo funcionó en quien se lo creyó**; en el resto empeoró el ánimo. El rendimiento no subió en ningún grupo | Experimento de campo en Wharton, 448 comerciales | Hace falta que el equipo **lo acepte**: explicar, dar voz y empezar con una **temporada de prueba** sin dinero en juego |
| La gamificación tiene **efectos reales pero pequeños** (g ≈ 0,25–0,49 en aprendizaje) | Metaanálisis de 2020 | Expectativa honesta: el juego **refuerza** un buen sistema, no arregla uno malo |
| **Avanzar en tareas pequeñas** es lo que más motiva en el día a día, y los retrocesos pesan más que los avances | Amabile y Kramer, unas 12.000 entradas de diario | Hacer **visible el avance diario** y no castigar: un aviso negativo resta más de lo que suma uno positivo |
| Las **rachas** enganchan por aversión a la pérdida, y funcionan mejor con **comodines limitados** | Duolingo (sus propios datos); estudio de Penn y UCLA sobre el margen de error | Rachas con comodines, y las vacaciones o ausencias justificadas no rompen la racha |
| Las **estimaciones propias** mejoran con feedback en tareas repetidas, aunque la evidencia es mixta | Roy et al. 2008; Frontiers 2018 (sin efecto) | Pedir una estimación de un toque y enseñar el resultado. En una agencia las tareas se repiten por tipo, que es el mejor caso |
| Para el trabajo funcionan los motores «sombrero blanco» (sentido, maestría, autonomía). Los de urgencia o escasez enganchan pero desgastan | Octalysis (Yu-kai Chou; marco de un consultor, no evidencia empírica) | Base de maestría y autonomía. La urgencia, solo en misiones semanales puntuales |

**Conclusión:** la primera propuesta medía bien, pero colocaba el tiempo como nota. Por Goodhart, eso acaba en trampas, y además se vive como vigilancia. El tiempo tiene que ser **información para la persona y para el agente**, no una puntuación. Los puntos tienen que salir de cosas difíciles de falsear y alineadas con el negocio.

## 3. Principios del sistema

1. **Tu dato es primero tuyo.** Cada persona ve su panel antes de que se puntúe nada.
2. **Se premia el resultado, no la velocidad:** entregar cuando dijiste, con calidad (aceptado sin devolución) y sin que haya que perseguirte.
3. **Se compite contigo mismo y se coopera con el equipo.** Sin ranking.
4. **Avance visible cada día:** el cierre de jornada enseña lo conseguido.
5. **Pasarse de tiempo no es una falta, es un dato:** «¿qué la complicó?».
6. **Perdón incluido:** comodines, vacaciones que no rompen nada, temporadas que empiezan de cero.
7. **Reglas claras y conocidas**, pactadas con el equipo en una temporada de prueba.

## 4. 5B — Tiempos de tarea (la base de datos fiable)

### Cómo se mide
- **Una tarea activa a la vez.** Empezar una tarea (desde el aviso, los buenos días o 🔄 *Cambiar tarea* en el panel) la deja activa y pausa la anterior. Cuentan solo los minutos trabajados de la jornada: los descansos y la comida no suman.
- **Al terminar, «¿con qué sigues?»**, con el mismo mensaje de los buenos días. Cambiar de tarea es un toque, y así se forma el hábito sin esfuerzo.
- Si una tarea se **cierra directamente en ClickUp**, se calcula igual.

### La estimación propia: el «juego de precisión»
- Al empezar una tarea, un toque: **«¿Cuánto te llevará? 20 · 30 · 45 min · otro»**. Las opciones salen de la mediana real de ese tipo.
- Al terminar: **«Estimaste 30, han sido 34. ¡Muy cerca! 🎯»**. Es feedback inmediato y entrena una habilidad: la **precisión**, que se puede subir de nivel.
- Por qué funciona: la persona **se compromete** (autonomía), **aprende** (maestría) y el agente recibe **plazos creíbles** sin que nadie los imponga.
- Contra las trampas: la precisión **solo da puntos si se acierta por los dos lados**, sin quedarse muy corto ni muy largo. Inflar estimaciones se nota al compararlas con la mediana del tipo. Por eso **no se premia la velocidad**.

### Márgenes por tipo
- Margen mínimo y máximo por tipo de tarea, **editable por Enric** (por ejemplo, artículo 20–30 min).
- Con suficientes tareas, el sistema **propone el margen a partir de los datos reales** y Enric lo acepta o lo ajusta. Un margen inventado acaba siendo injusto.
- **Si una tarea pasa del máximo**, al cerrarla el bot pide **la URL y el motivo con botones**: el cliente cambió el encargo, era más grande de lo esperado, estuve bloqueado, otra cosa. Es lo que pediste. Pero va presentado como «ayúdanos a ajustar», no como una falta, y alimenta la mejora de márgenes y tipos.
- **Muy por debajo del mínimo:** no se avisa a nadie. Se marca en el panel de Enric, porque suele ser un tipo mal puesto.
- **Tareas sin tipo:** el tipo lo pone quien crea el encargo (Enric o el agente), no quien lo hace, para evitar cambiar de tipo y caer en un margen más cómodo. Si falta, el bot pregunta al empezar.

### Pantallas
- **Equipo → Tiempos (Enric):**
  - márgenes por tipo, con la propuesta automática;
  - medias por tipo y por persona;
  - tareas fuera de margen con su URL y su motivo;
  - anular y corregir.
- **Mi panel (cada persona, privado):** mi día, mis tareas, mi precisión y mi evolución. Llega en 5B, antes de los puntos, para que el equipo vea su dato primero.

## 5. 5C — El juego (temporadas, niveles y misiones)

### De dónde salen los puntos (de cosas difíciles de falsear)
| Acción | Por qué |
|---|---|
| Entregar **en la fecha comprometida** | Es lo que le importa al cliente |
| Entregar con **calidad**: aceptado sin devolución | Sin esto, los puntos premiarían hacer las cosas rápido y mal |
| **Precisión** de tu estimación (acierto por los dos lados) | Maestría, y plazos fiables para el agente |
| **Jornada bien llevada**: entrada al empezar, pausas marcadas, cierre | Sin esto no hay datos; también premia ser responsable |
| **Responder rápido** a avisos y bloqueos | Que no haya que perseguir a nadie |
| **Justificar** una tarea fuera de margen (URL y motivo) | Que contar lo que pasó sume en vez de restar |

Todo con **tope diario**, para que no compense hacer muchas tareas pequeñas a costa de las importantes.

### Elementos de juego («sombrero blanco»)
- **Niveles por especialidad** (Artículos, Cambios web, Google Ads…): «Artículos nivel 4». Es un camino de maestría visible y premia hacerse experto.
- **Racha de días bien llevados**, con **2 comodines al mes**. Vacaciones y ausencias justificadas no la rompen.
- **Misión de la semana**, la única dosis de urgencia, por ejemplo «cero vencidas el viernes». Corta y opcional.
- **Objetivo de equipo**, por ejemplo «vencer a las vencidas»: si el equipo baja de X tareas vencidas este mes, **todos** ganan un premio. Así se coopera en lugar de competir.
- **Logros con sentido:** «10 tareas seguidas sin devolución», «primera semana con precisión del 90 %».
- **Cierre del día:** «Hoy: 5 tareas, 4 a tiempo, precisión 88 %, +42 puntos, racha 7 🔥». Es el avance visible de cada día.
- **Cierre de temporada (trimestral):** resumen personal, mejores marcas y reconocimiento. La temporada siguiente empieza de cero.

### El bonus de Navidad (cambio importante)
- Tu idea era un **umbral anual del 90 %**. La investigación avisa de dos efectos: quien lo pierde pronto **deja de intentarlo**, y quien está cerca **hace trampas para llegar**.
- **Propuesta: bonus progresivo por temporadas.** Cada trimestre se gana una parte del bonus según el nivel alcanzado, con tramos y no todo o nada. En Navidad se paga la suma de los cuatro trimestres. Quien tuvo un mal trimestre vuelve a empezar de cero y **siempre tiene algo por lo que luchar**.
- Se puede mantener el «90 %» como **tramo máximo** del trimestre, para conservar la idea pero sin el precipicio.

### Lanzamiento
1. **Temporada 0 (2–4 semanas):** todo funciona y se ve, pero sin dinero en juego. Sirve para ajustar márgenes, puntos y misiones con el equipo.
2. **Pedirles opinión** (con `/sugerencia` y una charla). Aceptarlo es lo que decide si el juego suma o resta.
3. Primera temporada real con bonus.

## 6. Riesgos y cómo se cubren
| Riesgo | Cómo se cubre |
|---|---|
| Olvidar cambiar de tarea activa | «¿Con qué sigues?» al terminar; el panel muestra la tarea activa; corrección en la web |
| Inflar estimaciones | La precisión puntúa por los dos lados y se compara con la mediana del tipo |
| Cambiar el tipo de tarea | El tipo lo pone quien crea el encargo |
| Muchas tareas pequeñas | Tope diario; los puntos van por entrega y calidad, no por cantidad |
| Sensación de vigilancia | Panel propio primero, sin ranking, temporada 0 y reglas pactadas |
| Desgaste del juego | Misiones que rotan, temporadas que reinician, logros nuevos por temporada |
| Se convierte en lo único que importa | El bonus es progresivo y una parte se reserva para el juicio de Enric (actitud, ayuda) |

## 7. Base de datos (para aprobar más adelante)
- `ops_work_types`: margen mínimo y máximo, y margen propuesto a partir de los datos.
- `ops_work_events`: nuevo evento «cambio de tarea activa».
- **Nueva `ops_task_times`:** una fila por tarea terminada y persona, con:
  - minutos trabajados y estimación propia;
  - el margen que había en ese momento;
  - el resultado y la URL con su motivo;
  - de dónde salió (bot, ClickUp o corrección);
  - se puede anular.
- 5C tendrá sus propias tablas (puntos, temporadas, logros, misiones); se diseñarán al llegar.

## 8. Alternativas descartadas
- **Puntos por velocidad o por estar dentro del margen** (la primera idea): invita a las trampas (Goodhart).
- **Reparto automático del tiempo entre tareas abiertas:** impreciso e injusto como base de un bonus.
- **Que la persona diga al final cuánto le ha llevado:** no es fiable con dinero en juego. La estimación *antes* sí sirve, porque se contrasta con lo medido.
- **Temporizador de ClickUp:** otra herramienta fuera de Telegram, con el mismo problema de disciplina. No he comprobado si vuestro plan lo incluye.
- **Ranking público:** desmotiva a los de abajo y genera envidia.
- **No hacer 5C (solo medir):** la vigilancia sola no mejora el rendimiento; sin devolver valor a la persona, el dato no rinde.

## Fuentes
- [Tracking your employees doesn't make them more productive (The Conversation)](https://theconversation.com/tracking-your-employees-doesnt-make-them-more-productive-286314)
- [Will monitoring systems kill intrinsic motivation? (Revue de GRH, 2013)](https://shs.cairn.info/revue-de-gestion-des-ressources-humaines-2013-4-page-35?lang=en)
- [Self-Determination Theory and Workplace Outcomes: A Meta-Analysis](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12887546/)
- [The Gamification of Learning: a Meta-analysis (2020)](https://link.springer.com/article/10.1007/s10648-019-09498-w)
- [Nonlinear incentives and the timing gaming problem (Oyer, Larkin)](https://sites.google.com/view/personnel-economics-resources/home/part-1-the-principal-agent-model/section-5-6-nonlinear-incentives-and-the-timing-gaming-problem)
- [Non-linear Incentives, Worker Productivity, and Firm Profits (NBER)](https://www.nber.org/system/files/working_papers/w25507/w25507.pdf)
- [Do Bonuses Enhance Sales Productivity? (Harvard)](https://dash.harvard.edu/bitstreams/7312037c-bb22-6bd4-e053-0100007fdf3b/download)
- [Freeman, Huang, Li: bonus thresholds and bunching (IZA DP 14125)](https://docs.iza.org/dp14125.pdf)
- [Barankay: ranking feedback lowers performance (Working Capital Review)](https://workingcapitalreview.com/?p=1843)
- [Leaderboards and rank: mixed effects (Emerald)](https://www.emerald.com/insight/content/doi/10.1108/intr-12-2021-0897/full/html)
- [From Motivation to Resentment: Gamification and the Envy Dilemma (Jyväskylä)](https://jyx.jyu.fi/jyx/Record/jyx_123456789_108211)
- [How gamification influences employees to be more productive: a meta-analysis](https://run.unl.pt/server/api/core/bitstreams/93a47fca-e20c-4d49-a52c-b9a3be15fa98/content)
- [The Progress Principle (Amabile y Kramer)](https://canadiangovernmentexecutive.ca/the-motivating-power-of-progress/)
- [How the Duolingo streak builds habit](https://blog.duolingo.com/how-duolingo-streak-builds-habit)
- [Planning fallacy and duration feedback (Frontiers 2018)](https://www.frontiersin.org/articles/10.3389/fpsyg.2018.00760)
- [White Hat gamification design (Yu-kai Chou)](https://yukaichou.com/gamification-study/white-hat-gamification-design/)
