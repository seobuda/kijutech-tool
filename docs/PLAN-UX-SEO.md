# Plan de UX/UI del módulo SEO

**Fecha:** 2026-11-27. **Origen:** Enric pidió revisar la estructura, la UX, la arquitectura, el diseño y los gráficos de SE Ranking, Semrush y Ahrefs (con las cuentas de la agencia abiertas en Chrome) y, con eso, mejorar el módulo SEO.
**Estado:** propuesta. No se construye nada hasta que Enric la apruebe.

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

## 3. Principios del rediseño
1. **Cifra → tendencia → detalle → acción.** Cada pantalla empieza con 3-6 cifras con su variación, sigue con un gráfico y termina en la tabla, y cada problema lleva su botón de acción.
2. **Menos texto.** Las explicaciones van a un «?» con tooltip (conectado al glosario de Ayuda que ya existe). Un párrafo solo cuando una persona tiene que decidir algo.
3. **Un solo semáforo** para todo el módulo: crítico, importante, aviso, info y bien, con los mismos colores y los mismos iconos.
4. **Comparación siempre visible:** frente a la semana, el mes o el rastreo anterior.
5. **Nuestro diferencial, arriba:** en los gráficos se marcan los **encargos hechos** (además de las actualizaciones de Google) y se ve el «¿funcionó?» junto al dato.
6. **Ancho completo y cuadrícula** de 2-3 columnas en escritorio, una columna en móvil y modo oscuro desde el principio.
7. **Estados vacíos con una acción.**

## 4. Nueva arquitectura de navegación
**Cartera (lista de proyectos), al estilo de Ahrefs.** Una fila por cliente con:
- miniatura;
- medidor de salud;
- visitas de Google del mes, con variación y minigráfico;
- búsquedas en el top 10;
- leads del mes;
- presencia en IA;
- urgentes;
- progreso del plan del mes.

Además: filtros por responsable o por estado, favoritos y orden por «lo que pide atención».

**Dentro del proyecto: menú lateral agrupado** (sustituye a las 10 pestañas) y **selector de proyecto** arriba.

| Grupo | Secciones |
|---|---|
| Visión | Resumen · Resultados (lo que hoy es «En vivo»: leads y visitas) · Informe del mes |
| Técnico | Salud y auditoría · Vigilancia y velocidad · Cambios en la web |
| Búsquedas | Posiciones · Palabras y temas · Demanda |
| Contenido | **Briefs y artículos** (sale de Palabras) · Contenido que pierde tráfico |
| Local | Ficha y reseñas · Mapa por zonas · Citas y zonas |
| IA y autoridad | Asistentes de IA · Autoridad |
| Trabajo | Plan de mejora · ¿Funcionó? (resultados de los encargos) |
| Proyecto | Expediente y puesta en marcha · Ajustes (procesos, frecuencias, gasto) |

En móvil, el menú lateral se convierte en un desplegable arriba.

## 5. Pantalla por pantalla

| Pantalla | Cómo queda |
|---|---|
| **Resumen** | Fila de cifras clave: salud (medidor), visitas de Google (± % y minigráfico), top 10, leads del mes, presencia en IA y gasto de datos. Gráfico de visitas a 12 meses con **marcas de nuestros encargos y de las actualizaciones de Google**. Bloques «Lo urgente», «Este mes» (barra de progreso del plan), «Posiciones», «Local» e «IA», cada uno con «Ver detalle». |
| **Salud y auditoría** | Medidor de salud con histórico por rastreo. Barras de crítico, importante, aviso e info. Tabla «Novedades / Todos» con insignia Nuevo, casos, cambio frente al rastreo anterior, «?» y acción (va al plan / dejar así). «Comparar con el rastreo del …». |
| **Posiciones** | Cifras (top 3, top 10, en el mapa, citado por la IA). Gráfico por tramos de posición (áreas apiladas). Tabla al estilo de SE Ranking: una columna por semana, celdas de color, flecha de cambio, **etiqueta de tema con color**, filtros Top 3/10/20 y columnas a elegir. |
| **Asistentes de IA** | Cifra de presencia por asistente con su evolución. Matriz pregunta × asistente con celdas de color. Detalle **con formato** (párrafos y listas, el nombre del cliente y de la competencia resaltados, fuentes como etiquetas) en lugar de texto pegado. |
| **Local** | El mapa por zonas como cuadrícula de calor (color por posición) sobre un fondo esquemático. Reseñas frente a la competencia en barras. Ficha con los cambios marcados. |
| **Autoridad** | Gráfico de dominios que enlazan (cliente frente a competencia) en el tiempo. Barras de ganados y perdidos por mes. Huecos en una tabla con su fuerza en barra. |
| **Briefs y artículos** | Lista con estado (brief, artículo, borrador en WordPress, publicado, medido). Al abrir uno: el brief a la izquierda y la **vista previa formateada del artículo** a la derecha, con los `[verificar: …]` resaltados. Botones «Redactar», «Crear borrador en WordPress» y «Encargar». |
| **Plan de mejora** | Barra de progreso del mes (hecho, en curso, pendiente), propuestas por prioridad con su impacto estimado y, en «¿Funcionó?», los veredictos con su gráfico antes/después. |
| **Resultados** (hoy En vivo) | Leads y visitas en un gráfico doble. Páginas que traen contactos, con barras. El informe del mes, con vista previa. |

## 6. Sistema visual: piezas comunes
- **Piezas:** tarjeta de cifra (valor, variación, minigráfico, «?»), medidor, gráfico de línea o área con marcas (encargos y actualizaciones de Google), barras apiladas, donut, celda de calor, tabla (cabecera fija, ordenar, filtros, columnas a elegir, paginación), bloque con «Ver detalle», estado vacío con una acción e insignia de gravedad única.
- **Paleta:** una sola paleta de datos validada para claro y oscuro (con la guía de visualización de datos) y un semáforo común.
- **Densidad:** ancho completo; texto explicativo en tooltips.

## 7. Decisiones que necesito de Enric
1. **Librería de gráficos** (una dependencia nueva es línea roja 5):
   - **A. Gráficos propios en SVG.** Ya hay minigráficos así. Sin dependencias y ligero, pero más trabajo y menos interacción (tooltips sencillos).
   - **B. Recharts.** La más usada con React; tooltips, zoom y leyendas gratis. Añade unos 100 KB.
   - **Recomendación: B**, con su OK. Con la A todo es posible, pero tarda más y queda menos pulido.
2. **¿Resumen con bloques que cada persona puede quitar u ordenar** (como SE Ranking) o un Resumen fijo e igual para todos? Recomendación: **fijo** al principio (menos piezas y más fácil de enseñar al equipo) y personalizable más adelante si se pide.
3. **Nombres del menú** (los de la tabla del §4): ¿te encajan como los diría el equipo?
4. ¿La **cartera de proyectos** sustituye a «Proyectos SEO» o queda como vista aparte?

## 8. Fases (cada una se despliega sola)
| Fase | Qué | Tamaño |
|---|---|---|
| 1 | Piezas visuales comunes (cifra, medidor, gráficos, tabla, semáforo, estados vacíos) + menú lateral agrupado + selector de proyecto | M |
| 2 | Cartera de proyectos + Resumen nuevo (con las marcas de encargos en el gráfico) | M |
| 3 | Salud y auditoría + Posiciones (tabla por semanas y gráfico por tramos) | M-L |
| 4 | IA (detalle con formato), Local (cuadrícula de calor), Autoridad, Briefs y artículos (vista previa formateada) | M-L |
| 5 | Plan y «¿Funcionó?», Resultados e informe; repaso de móvil y oscuro; guía y glosario actualizados | M |

Antes de cada fase: recorrido en el navegador, protocolo de decisión para lo que cueste deshacer, revisor de código y pruebas de pantallas con cada rol. Los datos ya existen: el rediseño es de presentación y navegación, sin migraciones previstas, salvo quizá favoritos y carpetas de la cartera.
