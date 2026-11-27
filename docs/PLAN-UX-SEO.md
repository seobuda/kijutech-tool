# Plan de UX/UI del módulo SEO

**Fecha:** 2026-11-27. **Origen:** Enric pidió revisar la estructura, la UX, la arquitectura, el diseño y los gráficos de SE Ranking, Semrush y Ahrefs (con las cuentas de la agencia abiertas en Chrome) y, con eso, mejorar el módulo SEO.
**Estado:** **v2 aprobada por Enric** el 27 nov (tras la revisión independiente de Fable 5.2, §9). Fases 0 y 1 hechas el 27 nov (ESTADO §6.67). Portal del cliente y «explicado para el cliente», aparcados por Enric.

## 1. Lo que se vio en las tres herramientas

**SE Ranking** (todos los proyectos, resumen de centrosdym, Rankings detallado, Marketing local):
- Navegación en **dos niveles**:
  - una barra de iconos con las grandes áreas (Proyectos, Investigación, Backlinks, Auditoría, Búsqueda con IA, Contenido, Local, Informes);
  - un menú lateral con las secciones del proyecto, agrupadas y plegables.
- **Selector de proyecto** arriba del menú, con buscador y carpetas («Clientes»): se cambia de cliente sin volver a la lista.
- **Resumen del proyecto hecho de widgets.** Una fila de cifras clave (presencia en IA, tráfico, palabras, dominios, visibilidad) con su variación y su periodo, y debajo bloques (IA por asistente, Rankings con minigráficos, Analítica, Auditoría, Competencia, Plan de marketing, Insights, Contenido). Cada bloque tiene **«Ver informe detallado»** y se puede **quitar** (botón «Widgets» para elegirlos).
- **Estados vacíos con una sola acción clara** («Conectar Google Search Console», «Iniciar auditoría», «Ejecutar análisis»).
- **Tabla de posiciones de referencia:**
  - una columna por fecha;
  - celdas de color (verde = top 3, azul = mejora, rojo = caída) con flecha y número de puestos;
  - etiqueta de grupo con color en cada palabra;
  - filtros rápidos (Todo · Top 1 · 3 · 5 · 10 · 20…);
  - buscador, «Modo de vista», «Filtros» y «Columnas».
- **Plan de marketing** con barra de progreso (completada · por hacer · ignorada).
- «Contenido»: puntuación de contenido por página (semáforo) con el botón «Mejorar».

**Semrush** (vacío de proyectos y visión general de dominio de centrosdym):
- Barra de iconos por área (SEO, IA, Tráfico, Local, Contenido, Anuncios, Social, Informes) y menú con **encabezados de grupo** (Panel de control, Análisis de la competencia, Investigación de palabras clave…).
- **Estado vacío de la cuenta = una sola caja** «Introduce una web · Empieza ahora».
- **Dos tarjetas de cifras arriba** («Búsqueda de IA» y «SEO»). Cada número es grande, con su variación en verde o rojo y es un enlace a su informe.
- **Periodo en chips** (1M · 6M · 1A · 2A · Todo) y conmutador Días/Meses; Exportar y PDF siempre visibles.
- **Gráfico de palabras por tramos de posición** (top 3, 4-10, 11-20, 21-50, 51-100, resúmenes de IA) como áreas apiladas, con las **actualizaciones de Google marcadas en el eje** y «Notas» propias.
- Donut de la distribución de posiciones y tablas cortas de «lo mejor» con enlace al informe completo.

**Ahrefs** (panel de proyectos y Site Audit de CM Ibérica):
- **Lista de proyectos pensada para agencia.** Cada cliente es una fila con:
  - miniatura de la web;
  - **índice de salud en un medidor**;
  - visibilidad en IA (AI Overviews, AI Mode, ChatGPT);
  - DR y dominios;
  - tráfico y palabras, con su variación y su **minigráfico**.
- También tiene favoritos, carpetas, portfolios y «Compartido».
- **Site Audit:**
  - medidores grandes (salud 68 «Justo» con su histórico por rastreo; visibilidad en IA 92 «Excelente» con su desglose);
  - barras de errores, advertencias y avisos;
  - donut de URL con y sin errores;
  - tabla **«Novedades / Problemas principales»** con insignia «Nuevo», rastreado, cambio, añadido, nuevo, eliminado, minigráfico, ayuda «?» y menú «⋮» por fila;
  - «Comparar con [rastreo anterior]» arriba;
  - menú lateral propio de la herramienta (Vista general, Todos los problemas, Informes por tema).
- Cuadrícula de 3 columnas en pantalla ancha, con mucho aire y tarjetas blancas sobre fondo gris claro.

**Patrones comunes a las tres:**
1. La cifra primero, grande, con su variación. La explicación, en un «?» y no en un párrafo.
2. Un gráfico de evolución en cada pantalla principal.
3. Semáforo de color coherente en todas partes.
4. Navegación lateral agrupada por áreas, con selector de proyecto.
5. Resumen hecho de bloques, cada uno con «Ver detalle».
6. Tablas densas pero ordenables y filtrables, con columnas a elegir.
7. Comparación con el periodo o rastreo anterior siempre visible.
8. Estados vacíos con un solo botón.

## 2. Diagnóstico del módulo SEO actual (visto el 27 nov en local)
- **Todo es texto.** En Resumen y en Salud no hay ninguna cifra grande, ningún medidor ni ningún gráfico (solo los minigráficos de Posiciones). Cada bloque es un párrafo.
- **10 pestañas en fila** (Resumen · En vivo · Salud técnica · Expediente · Palabras · Posiciones · Local · IA · Autoridad · Plan de mejora), más sub-vistas dentro de varias. Hay cosas importantes escondidas: los **briefs y los artículos** están en Palabras → «Briefs de contenido».
- **Sin selector de proyecto:** para cambiar de cliente hay que volver a la lista.
- **La lista de proyectos son tarjetas casi vacías** (nombre, cliente y dos insignias), sin una sola métrica. No sirve para ver la cartera de un vistazo.
- **Columna estrecha y párrafos explicativos largos** en cada pantalla. En pantalla ancha sobra la mitad.
- **Lo que nos diferencia no se ve:**
  - el trabajo hecho y si funcionó;
  - los leads;
  - el plan → encargos en ClickUp;
  - las aprobaciones.

  Ninguna de las tres tiene esto: **es lo que más hay que lucir**.
- Detalles: la respuesta de la IA se ve como texto pegado; la vista previa del artículo es texto plano; los colores de gravedad no son los mismos en todas las pantallas.

## 3. Principios del rediseño (v2)
1. **Decisión → evidencia → cifra.** Nuestro usuario no es un analista: es un junior que ejecuta y Enric, que aprueba. Cada pantalla empieza por **qué hay que hacer ahora** (3 acciones como mucho, con su botón); después va el porqué, y al final las cifras. Las tres herramientas acaban en «el problema»; nosotros, en «funcionó / no funcionó / no concluyente».
2. **La unidad del módulo es el «Caso».** Un hallazgo o tema recorre su vida en una línea: detectado → propuesto → aprobado → encargo en ClickUp → hecho → medido a 28/56/90 días → veredicto, con su evidencia y su antes/después. Todo enlaza a su Caso.
3. **Honestidad estadística en cada cifra.** Con pocos datos se dice «sin datos suficientes»; nunca un −18 % en rojo sobre 40 clics. Nada de notas 0-100: en vez del medidor de salud, «3 críticos · 2 nuevos desde el último rastreo».
4. **Como mucho 4 cifras y una acción principal por pantalla.** Fuera el párrafo descriptivo de cada pantalla. **Se queda el texto de trabajo** (la receta y «cómo se verifica»), visible: un tooltip no sirve en móvil ni con teclado.
5. **Por rol.** Enric ve la cartera y lo que pide su decisión; el junior, qué hacer hoy y cómo; el redactor, sus briefs. No hacen falta bloques personalizables.
6. **Un solo lenguaje visual en toda la app.** Las piezas van a `components/ui`, y el semáforo y las aprobaciones son los de Para ti. El color nunca va solo: siempre con icono y texto.
7. **Rápido.** Cada bloque carga por separado (`loading` y `error` en cada pantalla), con consultas agrupadas y, si hace falta, una foto diaria por proyecto.

## 4. Navegación (v2)
- **No hay menú lateral propio:** la app ya tiene el global. Quedan **seis pestañas**, con las sub-vistas `?vista=` que ya existen:

| Pestaña | Qué reúne |
|---|---|
| **Resumen** | «Qué necesita este proyecto ahora» (3 acciones como mucho) + 4 cifras (leads, visitas, top 10 y plan/horas del contrato) + la línea de tiempo |
| **Trabajo** | Plan, briefs y artículos y «¿Funcionó?» en **un embudo**: Propuesto · Aprobado · En curso · Hecho · Midiendo · Con veredicto. Fichas de Caso y aprobación por lote con horas y capacidad restante |
| **Técnico** | Salud (novedades frente al rastreo anterior), vigilancia y velocidad, cambios en la web y Autoridad (sub-vista que solo se ve si está encendida) |
| **Búsquedas** | Posiciones, temas y palabras, demanda y asistentes de IA (todas responden a «dónde aparecemos») |
| **Local** | Ficha y reseñas, mapa por zonas (cuadrícula de calor con selector de población) y citas y zonas |
| **Resultados** | Leads y visitas, línea de tiempo causa → efecto, páginas que traen contactos e informe del mes |

- **Engranaje del proyecto** en la cabecera: expediente, puesta en marcha, procesos, frecuencias y gasto.
- **Selector de proyecto** en la cabecera, con buscador. Al cambiar de cliente se mantiene la pestaña.
- **Cartera por excepción** (sustituye a «Proyectos SEO»):
  - las filas se ordenan por «pide atención», con el motivo en una frase («caída diagnosticada», «5 propuestas sin aprobar», «plan al 20 % a día 25», «gasto al 90 %») y **la acción en la fila**;
  - cada fila muestra leads, visitas con minigráfico, top 10 y horas («6 de 10 h»);
  - debajo, plegado, lo que está «todo en orden»;
  - sin miniaturas ni carpetas mientras haya pocos clientes.
- **Estados vacíos:** enlazan a la puesta en marcha (los 13 puntos), no un botón suelto por pantalla.

## 5. Lo que nos hace mejores que las tres

| Idea | Para quién | Por qué gana | Tamaño |
|---|---|---|---|
| **Ficha de Caso** (principio 2) | Todos | La competencia acaba en el problema; nosotros, en el veredicto | M |
| **Línea de tiempo causa → efecto:** visitas, leads y posiciones con marcas de **nuestros encargos**, cambios detectados en la web, cambios en la ficha y actualizaciones de Google. Al pulsar una marca se abre su Caso | Enric, cliente | Semrush solo marca las actualizaciones de Google | M |
| **Cartera por excepción**, con la acción en la fila | Enric | Ellos enseñan métricas; nosotros, decisiones pendientes | M |
| **Horas del contrato** («6 de 10 h», estimado frente a fichado) | Enric | Ninguna lo tiene; el dato ya existe | S |
| **Leads como métrica principal**, por página y canal (con pocos leads, solo descriptivo) | Enric, cliente | Ellos miden visibilidad; nosotros, negocio | S-M |
| **Veredicto honesto visible:** tres estados + «por qué no concluyente» + «qué miramos en su lugar» | Todos | Nadie más admite «no lo sé» | S |
| **«Hoy» por persona** en Mis tareas: encargos SEO con receta, URL, cómo se verifica, horas y botón «duda» al jefe de operaciones | Junior, redactor | Ninguna dice qué hacer hoy ni cómo | S-M |
| **Alertas accionables:** en Telegram y en Para ti, «Encargar», «Descartar con motivo» y «Ver caso» | Enric | Las suyas son correos informativos | S-M |
| **Aprobación por lote** del plan del mes, con impacto, horas y capacidad | Enric | Gestionar 20 clientes en 10 minutos | S |
| **«Explicado para el cliente»:** el mismo dato en una frase sin jerga, en el Resumen y en el informe | Cliente | Ocupa el lugar de AgencyAnalytics con un relato de causa → efecto | S |
| **Portal del cliente** (enlace de solo lectura) | Cliente | Lo mismo, en directo | L: toca el acceso (línea roja 3) y **lo decide Enric** |

## 6. Pantallas de detalle
- **Posiciones:**
  - tabla por semanas con 8 columnas como mucho, agrupada por tema;
  - celdas de color **con el número**, primera columna fija y scroll horizontal;
  - en lugar del gráfico por tramos, «suben / bajan / entran en el top 10».
- **Técnico:** novedades frente al rastreo anterior (nuevo, resuelto, empeora), recuento por gravedad y receta visible. Sin medidor 0-100.
- **IA:** respuesta con formato (párrafos y listas, el cliente y la competencia resaltados, las fuentes como etiquetas) y presencia por asistente en el tiempo.
- **Local:** cuadrícula de calor con el número en cada celda y selector de población.
- **Briefs y artículos** (dentro de Trabajo): el brief a un lado y la **vista previa formateada** del artículo al otro, con los `[verificar: …]` resaltados.
- **Accesibilidad:** cada gráfico con su tabla alternativa; tooltips que funcionen con teclado y en táctil.
- **Móvil:** primero Cartera, Resumen y aprobar. Las tablas densas, en escritorio.

## 7. Gráficos
Hacen falta cuatro tipos: línea con marcas, barras, celda de calor y minigráfico. Se dibujan **en SVG propio en el servidor**, como los que ya existen en Posiciones y Velocidad: sin dependencias nuevas, ligeros y accesibles, con un tooltip sencillo. Recharts (línea roja 5) solo si la línea de tiempo acaba pidiendo zoom, y entonces se preguntará.

## 8. Fases (v2)

| Fase | Qué | Tamaño |
|---|---|---|
| 0 | **Línea base:** registrar con `logEvent` las visitas por pestaña, el tiempo hasta aprobar el plan y los clics hasta un encargo | S |
| 1 | Selector de proyecto, 6 pestañas, semáforo único, piezas comunes en `components/ui`, `loading`/`error` y redirecciones de las rutas antiguas | S-M |
| 2 | **Trabajo:** embudo, ficha de Caso, veredictos con antes/después, horas del contrato y aprobación por lote | M-L |
| 3 | **Cartera por excepción** + Resumen «qué necesita ahora» (+ foto diaria si hace falta: migración aditiva) | M |
| 4 | **Resultados:** línea de tiempo causa → efecto, leads, informe y «explicado para el cliente» | M |
| 5 | «Hoy» en Mis tareas y alertas accionables | S-M |
| 6 | Posiciones, Local (calor), IA con formato y Técnico (novedades) | M-L |
| 7 | Portal del cliente (si Enric lo aprueba), repaso de móvil y modo oscuro, guía y glosario | L |

**Qué se mide para saber si funciona** (comparado con la línea base de la fase 0):
- **Ritmo de trabajo:**
  - tiempo de Enric en la revisión semanal de la cartera (objetivo [opinión]: < 10 min con 5 clientes);
  - días de propuesta a aprobación y de aprobación a hecho;
  - % del plan mensual completado;
  - horas estimadas frente a fichadas.
- **Calidad del resultado:**
  - % de encargos con veredicto y % de «no concluyente»;
  - dudas del junior por encargo;
  - informes aprobados sin editar;
  - alertas atendidas en menos de 48 h.
- **Uso y rendimiento:**
  - clics desde un hallazgo hasta «encargar»;
  - tiempo de carga de Cartera y Resumen (p95);
  - uso de cada pestaña, para quitar la que nadie abra.

## 9. Revisión independiente (Fable 5.2, 27 nov) y qué cambió respecto a la v1
Se aceptan los 8 fallos que señaló:
1. El plan copiaba herramientas de analista.
2. No distinguía roles.
3. Añadía un segundo menú lateral con 18 secciones.
4. Partía en dos el diferencial.
5. Mostraba cifras sin incertidumbre y un medidor 0-100.
6. Lo mandaba todo a tooltips.
7. Ignoraba los atascos de flujo de la simulación.
8. Daba por hecho, con optimismo, que no haría falta ninguna migración, y no decía cómo medir el éxito.

De ahí salen los §3-§8 de esta versión.

**Sin verificar:** los tamaños S/M/L son estimaciones. Fable no vio las pantallas en el navegador; yo sí (§1-§2).

## 10. Decisiones que necesito de Enric
1. **¿Apruebas la v2** (6 pestañas, el Caso como unidad, cartera por excepción, gráficos en SVG propio) para empezar por las fases 0 y 1?
2. **Portal del cliente** (fase 7): ¿se plantea? Toca el acceso (línea roja 3).
3. **«Explicado para el cliente»:** ¿frases deterministas (gratis) o con IA cuando haga falta (con coste)?
