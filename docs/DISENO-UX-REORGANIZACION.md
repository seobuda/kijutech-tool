# Propuesta: que la herramienta se entienda sola (UX y organización)

**Fecha:** 2026-11-20 · **Estado:** propuesta para Enric. Nada construido. **Siguiente sesión: empezar por aquí** (ver §7).

**Encargo de Enric (20 nov):** «Si le paso la herramienta a alguien, no sabe ni por dónde empezar». Él, después de 15 años con Semrush, Ahrefs, Sistrix, Adobe, SE Ranking y Google, siente que la estructura no transmite lo que la herramienta es: una agencia con departamentos, humanos y agentes de IA trabajando juntos. Objetivo: que el equipo entre sin que haya que explicarle cada sección, y que él mismo note un orden claro. Uso: Chrome en Windows (Mayi, en Mac); el móvil no se contempla de momento.

---

## 1. Diagnóstico: cómo está hoy (datos del código)

| Hecho | Dato |
|---|---|
| Pantallas | **66** páginas |
| Barra lateral | ~20 entradas en 4 grupos (Trabajo, Inteligencia, Administración, Cuenta) |
| Operaciones | **21 pestañas** en 3 secciones (Operaciones, Equipo, Sistema) |
| Otras pestañas | Agentes, 7 · ficha del cliente, 9 · Estrategia, 6 + 4 · Conocimiento, 5 |
| Al entrar | Se abre el **Bloc de notas**, no una vista de «qué me toca» |

**Por qué cuesta orientarse** (no es una cuestión de colores; es la estructura):

1. **Está organizada por cómo se construyó, no por lo que hace cada persona.** Cada módulo nuevo (Rendimiento, Estrategia, Conocimiento, Agentes…) ha sumado su entrada en la barra. La investigación coincide en organizar por tareas y roles, no por funciones (§2).
2. **Lo que espera de Enric está repartido en 7 sitios:**
   - Mi bandeja (revisiones y bloqueos);
   - Agente (propuestas);
   - Correos;
   - Conocimiento → Pendientes de revisar;
   - Agentes → Dudas del equipo;
   - Errores;
   - Estrategia → propuestas del estratega.

   En Telegram llega todo junto; en la herramienta no.
3. **Un mismo cliente vive en 5 sitios:** Clientes, Rendimiento, Estrategia, Proyectos SEO y Encargos. Herramientas como Semrush o SE Ranking giran alrededor del proyecto o cliente.
4. **Humanos y agentes están separados.** «Equipo» son las personas y «Agentes» la IA, cada uno por su lado. La visión de Enric es un único equipo con departamentos (el organigrama ya existe, pero escondido en Agentes → Departamentos).
5. **Nombres que se pisan:**
   - «Conocimiento» y «Conocimiento SEO»;
   - «Rendimiento» (de clientes) frente a Tiempos y Piloto (del equipo);
   - «Agente» (pestaña de Operaciones) y «Agentes» (módulo);
   - «Salud» y «Errores», dos sitios para «algo va mal»;
   - la entrada «Sistema» de la barra abre Operaciones → Automatizaciones.
6. **Lo técnico se mezcla con el trabajo diario:** automatizaciones, tokens, pruebas, servidor y prompts están al lado de Encargos y Clientes.
7. **Casi ninguna pantalla explica para qué sirve.** Hay estados vacíos con mensaje en las pantallas nuevas, pero no en todas, ni hay una primera vez guiada.

---

## 2. Qué dice la investigación (2025–2026), con lo fiable separado de lo dudoso

**Aviso honesto:** casi todo lo publicado sobre UX de herramientas con agentes son blogs de agencias y fabricantes. Estudios académicos sólidos hay pocos. Abajo marco cada fuente.

| Hallazgo | Fuente | Fiabilidad | Qué implica para nosotros |
|---|---|---|---|
| Las fricciones diarias en una herramienta empresarial vienen de que el flujo no encaja con el trabajo real, de barreras en la arquitectura de la información y de necesidades distintas según el rol | Estudio de métodos mixtos, 81 usuarios, 7 meses (conferencia AHFE 2026, app móvil de ventas) | Académico; es móvil, así que se transfiere con cautela | Ordenar por lo que hace cada rol, no por módulos |
| Organizar la navegación por tareas, no por categorías de funciones; vistas por rol; revelar el detalle a demanda | UXmatters (2025), guías de diseño de paneles SaaS | Práctica profesional | Inicio por persona y detalle bajo demanda |
| Fallo típico: enseñar a todos la misma navegación y el mismo panel; lo mejor es mostrar lo relevante según el rol y el contexto | Guías de portales y herramientas internas (2025–2026) | Práctica profesional | El equipo ve un menú corto y Enric el completo |
| Separar lo personal (bandeja, «mis tareas») de lo compartido; la bandeja con «prioritario» primero; lo delegado a agentes aparece en «mis tareas» con su estado (trabajando, esperando, terminado) | Linear (documentación y cambios de 2024–2026) | Producto de referencia | Una bandeja «Para ti» y el trabajo de los agentes visible como el de las personas |
| Los agentes entran en el **organigrama** con identidad propia (nombre, a quién reportan, quién los supervisa) y un **registro central** con dueño, estado y herramientas | Microsoft Agent 365 (nov 2025, disponible desde mayo 2026) | Producto de referencia | Nuestro organigrama humanos + IA es la dirección correcta: hay que sacarlo a primer plano |
| Agentes que aparecen junto a los contactos humanos, con nombre, avatar y conversación (Salesforce, Slack); ningún gran sistema de diseño tiene aún una sección «agentes» (feb 2026) | Pixelmojo (2026) | Blog; dato verificable | No hay un estándar que copiar: nos toca definir el patrón |
| Los agentes funcionan mejor como **proponentes** con aprobaciones claras, recibos de lo que hicieron y posibilidad de deshacer. Pedir aprobación para todo crea «fatiga» y se aprueba sin leer | Varias guías de 2026 (HITL, receipts, approval fatigue) | Práctica profesional, consistente entre fuentes | Aprobaciones agrupadas y priorizadas, con autonomía donde ya se ha ganado la confianza (ya lo hacemos por niveles) |
| 18 pautas de interacción humano-IA: dejar claro qué puede hacer y con qué acierto, mostrar por qué, facilitar corregir y descartar, aprender del usuario | Microsoft HAX (CHI 2019, validado con 49 diseñadores) | Académico, clásico | Cada agente con «qué hace / qué no / cómo de bien lo hace» y la corrección a un clic |
| La transparencia mejora la confianza y el uso correcto, pero las señales textuales ligeras solas no bastan | Revisión sistemática de confianza (arXiv); tesis RIT 2025 | Académico, resultados mixtos | Enseñar actividad y resultados reales de cada agente (acierto, coste, lo corregido), no solo etiquetas |
| NN/g trata a los agentes como **usuarios** que usan el producto junto a las personas; diseño orientado a resultados | NN/g (encuesta 2026 a 521 profesionales; agenda 2025) | Fuente seria, cita indirecta | Que cada pantalla diga el resultado («3 clientes en alerta»), no solo datos |

**Guías del equipo de Chrome (skill modern-web-guidance)** aplicables a Chrome de escritorio:
- **Pestañas:** una sola fila; si no caben, un botón «Más», sin partirlas en dos filas.
- **Migas de pan:** con separador visible.
- **Avisos:** no bloqueantes; los diálogos, solo para lo que tiene consecuencias.
- **Barras fijas:** que no ocupen más del 12 % de la pantalla y nunca varias apiladas.
- **Feedback de cada estado:** pasar el ratón, pulsar y foco con teclado, con el foco siempre visible.
- **Texto:** tamaños en `rem`, sin alturas fijas en lo que lleva texto.
- **Formularios:** el error aparece solo después de tocar el campo, se marca qué es obligatorio y el autocompletado es correcto.
- **Pantalla estrecha:** nada se corta a 320 px. No es prioritario sin móvil, pero sirve para ventanas partidas.

Lo que **no** cogemos de esas guías: rehacer los componentes de shadcn/Radix con funciones nativas, carruseles, animaciones vistosas, WebGL ni passkeys.

---

## 3. La propuesta: cinco espacios, y cada persona ve lo suyo

### 3.1 El mapa nuevo (antes → después)

| Espacio | Para qué (una frase) | Qué reúne de lo que hay hoy | Lo ve |
|---|---|---|---|
| **🏠 Inicio** | «Qué me toca hoy y qué necesita de mí» | Nuevo. Para Enric: lo que espera de él, el estado del equipo, la actividad de los agentes hoy, los clientes en alerta y el gasto. Para cada persona: sus tareas de hoy, su jornada, sus dudas abiertas y lo nuevo de la base | Todos (versión según el rol) |
| **📥 Para ti** | La bandeja única: todo lo que espera una decisión | Mi bandeja, propuestas del agente, correos por responder, entradas de conocimiento por revisar, dudas escaladas del equipo, propuestas del estratega, errores graves. Con prioridad y filtro por departamento, como el chat de Telegram pero ordenado | Enric y admin (el equipo: lo suyo, p. ej. devoluciones) |
| **🏢 Clientes** | Todo lo de un cliente en su ficha | Clientes + Rendimiento + Estrategia + Proyectos SEO + Encargos del cliente, como pestañas de la ficha. Las vistas «de todos los clientes» (semáforo, rendimiento global, calendario de Google) quedan como pestañas de Clientes | Todos (el equipo, solo lectura donde toque) |
| **👥 Equipo** | Personas y agentes, un solo equipo | Organigrama (departamentos con su jefe), fichas de personas y de agentes en el mismo listado con etiqueta «Humano» o «IA», qué está haciendo cada uno ahora, jornada y tiempos (humanos), instrucciones, herramientas, acierto y coste (agentes), dudas del equipo, conversaciones, trabajos | Todos (el equipo ve el organigrama y su propia ficha; los datos de otros, solo admin) |
| **📚 Conocimiento** | Lo que sabemos hacer | Igual que hoy, y además es la **ayuda de la propia herramienta** (cada pantalla enlaza a su entrada «Cómo funciona esto») | Todos |
| **⚙️ Ajustes** *(abajo, separado)* | Lo técnico, fuera de la vista diaria | Automatizaciones, Telegram, ClickUp, IA y modelos, integraciones, voz, usuarios, salud, errores, pruebas, servidor, gasto de IA, mapa del sistema, configuración SEO | Solo admin |

**Encargos y Bloc de notas** no desaparecen. Pasan a ser **acciones**: un botón «＋ Nuevo» siempre visible (nota, encargo, cliente o entrada de conocimiento) y la lista de Encargos dentro de Inicio y de cada cliente. Las direcciones actuales se mantienen o redirigen, para que los enlaces de Telegram no se rompan.

### 3.2 Lo que ve el equipo (menú corto)
Inicio · Mis tareas · Clientes (los que lleva) · Equipo (organigrama y mi ficha) · Conocimiento · Mi cuenta. **Seis entradas, ningún término técnico.** Con lo que ya hay en Telegram (avisos, botones, el jefe de operaciones), la herramienta web es su consulta y su panel, no un sitio más donde trabajar.

### 3.3 Humanos e IA como un equipo (la parte diferencial)
- **Una misma ficha para personas y agentes:** foto o avatar, nombre, departamento, a quién reporta, qué hace, estado ahora («trabajando en…», «esperando a Enric», «libre»), su actividad de hoy y su rendimiento. En los humanos: jornada, tiempos y precisión. En los agentes: acierto de sus propuestas, coste y lo que Enric les ha corregido.
- **Organigrama visible** como portada de Equipo: Dirección → jefes (Opus) → personas y subagentes. Es lo que hoy está en Agentes → Departamentos.
- **Actividad del día en un solo feed**, como un canal de equipo: «Jefe de operaciones respondió a Mayi (📚 base)», «Revisor web entregó el informe de X», «Jesús terminó Y». Son los «recibos» de la investigación: se ve qué ha hecho cada uno, humano o IA.
- **Coherente con lo construido:** los jefes con Opus, los subagentes con Sonnet, las aprobaciones por niveles de autonomía. La interfaz pasa a contarlo.

### 3.4 Que se entienda sola (principios para cada pantalla)
1. **Cabecera con una frase** de para qué sirve la pantalla y **su acción principal** a la vista.
2. **Pestañas de una sola fila, como mucho 6**; lo demás en «Más».
3. **Estados vacíos que enseñan:** qué aparecerá aquí y el botón para empezar. Ya lo hacemos en las pantallas nuevas; falta llevarlo a todas.
4. **Ayuda conectada a la base de conocimiento:** un «¿Cómo funciona esto?» en cada pantalla abre su entrada, con vídeo si lo hay. Así los vídeos que Enric grabe una vez sirven para siempre y la ayuda se mantiene en el mismo sitio.
5. **Primera vez guiada:** una lista de 4–5 pasos en el Inicio de un usuario nuevo («Vincula tu Telegram», «Mira tus tareas de hoy», «Pregunta una duda al jefe»…), que desaparece al completarla.
6. **Un nombre por concepto** y un glosario en Conocimiento. Las incoherencias de §1.5 se resuelven.
7. **Lo técnico nunca en las pantallas de trabajo:** cada «ajuste» vive en Ajustes, con un enlace «Configurar» desde donde afecta.
8. **Pulido visual con las guías de Chrome** (§2): foco visible, pestañas, migas, avisos no bloqueantes, formularios y textos sin alturas fijas.

---

## 4. Cuestionada tres veces

1. **¿Cumple el objetivo final o solo el de hoy?** El objetivo es que Operaciones sustituya a un humano, con supervisión, y que el equipo trabaje sin formación. Inicio y Para ti son el «escritorio del supervisor», y el Equipo humano + IA hace visible esa sustitución. Sirve para el final, no solo para hoy.
2. **¿Coste o riesgo oculto a semanas vista?**
   - Mover pantallas rompe la memoria muscular de Enric y los enlaces de Telegram. Se mitiga manteniendo o redirigiendo las direcciones y haciéndolo por fases.
   - El riesgo real es convertir Inicio en un «panel de todo»: tiene que ser corto (lo de hoy y lo que espera) y con vistas por rol.
   - Riesgo de la bandeja única: si mezcla sin prioridad, se vuelve otro sitio que ignorar. Va con prioridad, agrupación y «lo urgente primero», igual que los avisos.
3. **¿Hay algo que ya tenemos y no usamos?** Sí, y mucho:
   - el organigrama (escondido);
   - la paleta de comandos Ctrl+K (pocos la conocen);
   - la base de conocimiento como ayuda;
   - los datos de «lo que espera de Enric» (`pendientes_de_enric` ya los junta para el agente);
   - los avisos de Telegram ya agrupados.

   La propuesta reutiliza todo eso; casi no hay datos nuevos.

### Alternativas comparadas
| Opción | Esfuerzo | Riesgo | Qué se gana | Qué se pierde |
|---|---|---|---|---|
| **A. Cinco espacios + Inicio + Para ti + equipo humano-IA, por fases** (recomendada) | Medio-alto: 4 fases, casi todo interfaz y sin esquema | Bajo si se mantienen las direcciones | Orientación inmediata por rol, el modelo de agencia visible y menos formación | Costumbre de las rutas actuales (al principio) |
| B. Solo ordenar la barra lateral y renombrar | Bajo (1 sesión) | Muy bajo | Menos confusión de nombres | No resuelve «por dónde empiezo» ni los 7 sitios de pendientes |
| C. Rediseño visual completo (nuevo sistema de diseño e identidad) | Alto | Medio-alto: rehacer componentes sin cambiar el fondo | Aspecto más «de producto» | Mucho trabajo en lo que no es el problema (el problema es la estructura) |
| D. No tocar nada y grabar vídeos | Horas de Enric | Bajo | Nada en la herramienta | La formación se repite con cada persona y los vídeos caducan con cada cambio |

B es un buen **primer paso** dentro de A (fase 1), no una alternativa completa.

---

## 5. Plan por fases (cada fase usable por sí sola)

| Fase | Qué | Esquema | Riesgo |
|---|---|---|---|
| **1. Orden y entrada** | Barra lateral con los cinco espacios y Ajustes aparte; nombres únicos; **Inicio** (versión Enric y versión equipo) como portada; menú del equipo de 6 entradas; botón «＋ Nuevo»; redirecciones | No | Bajo |
| **2. Para ti** | Bandeja única con prioridad y filtros por departamento (reúne los 7 sitios); recuento en la barra | Probablemente no (lee lo que ya existe) | Bajo |
| **3. Equipo humano + IA** | Organigrama como portada de Equipo; fichas unificadas con estado y actividad; feed de actividad del día | Quizá un campo de avatar o foto (a confirmar) | Medio |
| **4. Cliente en un solo sitio** | La ficha absorbe Rendimiento, Estrategia, SEO y Encargos del cliente; las vistas globales como pestañas de Clientes | No | Medio (muchas pantallas) |
| **5. Ayuda y pulido** | «¿Cómo funciona esto?» enlazado a la base, primera vez guiada, glosario y pulido con las guías de Chrome (foco, pestañas, migas, formularios) | No (las entradas de ayuda son datos de la base) | Bajo |

En cada fase: Mapa Visual, ESTADO.md, pruebas y revisión en el navegador, como siempre.

---

## 6. Decisiones que necesito de Enric
1. ¿Te encaja la estructura de **cinco espacios** (Inicio · Para ti · Clientes · Equipo · Conocimiento, y Ajustes aparte)?
2. ¿Qué debe ver el **equipo** en su Inicio y en su menú? Propuesta: sus tareas de hoy, su jornada, sus dudas y lo nuevo de la base; nada de costes ni de datos de los demás.
3. ¿Empezamos por la **fase 1**, que es la de más impacto y menos riesgo?
4. ¿Quieres **foto o avatar** para personas y agentes en el Equipo (fase 3)?

---

## 7. Acordado el 20 nov y punto de partida de la siguiente sesión

**Enric (20 nov):** el super administrador y los administradores tienen que entrar a un **panel (dashboard) con el resumen de todo**, como las grandes herramientas. Acordado; es el «Inicio» de §3.1 para administración, con este orden:
1. **Arriba, lo que espera de ti:** aprobaciones, dudas escaladas, entradas por revisar y errores graves, con su número y un clic para resolverlo. Es el acceso a «Para ti».
2. **Debajo, el resumen de cada área**, en tarjetas que llevan a su sección:
   - clientes en alerta y rendimiento;
   - el equipo hoy, humanos y agentes: quién trabaja en qué, retrasos y bloqueos;
   - la actividad de los agentes y su acierto;
   - el sistema: salud, errores y gasto de IA frente al presupuesto.
3. **Roles:**
   - super_admin: todo, con servidor y costes de la plataforma;
   - admin: lo mismo, sin plataforma ni costes;
   - equipo: su propio inicio (sus tareas de hoy, su jornada, sus dudas, lo nuevo de la base), sin datos de los demás.

Principio: **lo accionable primero**, nunca un muro de gráficas.

**Confirmado por Enric (20 nov, noche)** (preguntas de §6): cinco espacios con Ajustes aparte; el equipo ve solo lo suyo (sus tareas, su jornada, sus dudas y lo nuevo de la base); empezar por la fase 1; **foto o avatar** en el Equipo (fase 3, necesitará un campo nuevo y su aprobación de esquema).

**Fase 1 hecha (20 nov, rama `feature/ux-fase1`):** Inicio por rol, barra lateral en cinco espacios con subentradas y Ajustes aparte, botón «＋ Nuevo», nombres únicos y las mismas rutas de antes. Detalle en `docs/ESTADO.md` §6.31. Diferencia con el plan: el equipo no tiene entrada «Mis tareas» aparte, porque sus tareas ya están en su Inicio (su menú queda en Inicio, Clientes si es editor, Equipo, Conocimiento y Mi cuenta).

**Plan para la siguiente sesión:**
1. Confirmar con Enric las decisiones de §6.
2. Fase 1 en una rama nueva (`feature/ux-fase1`):
   - **panel de inicio** de administración (el de este apartado) e inicio del equipo;
   - barra lateral con los cinco espacios y Ajustes aparte;
   - nombres únicos;
   - botón «＋ Nuevo»;
   - redirecciones para no romper los enlaces de Telegram;
   - `/dashboard` lleva al panel (hoy redirige al Bloc de notas).
3. Para el panel, reutilizar lo que ya existe:
   - `pendientes_de_enric` y `getInbox` (lo que espera de Enric);
   - `evaluateClient` y `ops_client_activity` (semáforo de clientes);
   - `getTeamToday` y `getCurrentDays` (equipo);
   - `listTeamQuestions`, `countByStatus` de la base y errores abiertos;
   - `getAiOverview` (gasto de IA).
4. Guías de Chrome (modern-web-guidance): ejecutarlas siempre en un contenedor Docker (`docker run --rm node:24-alpine npx -y modern-web-guidance@latest …`), nunca npm en Windows.

## Fuentes
- Estudio de carga cognitiva en una app empresarial (AHFE 2026): https://openaccess.cms-conferences.org/publications/book/979-8-950676-08-6/article/979-8-950676-08-6_11
- UXmatters, «From Features to Value» (2025): https://www.uxmatters.com/mt/archives/2025/03/from-features-to-value-designing-saas-dashboards-that-deliver-insights.php
- Enterprise SaaS UX (2026): https://www.parallelhq.com/blog/enterprise-saas-ux
- Herramientas internas, DronaHQ (2025): https://www.dronahq.com/internal-tools-ux/
- Linear, My Issues e Inbox: https://linear.app/docs/my-issues · https://linear.app/docs/inbox · https://linear.app/changelog/2026-09-03-priority-inbox
- Microsoft Agent 365 (agentes en el organigrama y registro): https://www.microsoft.com/en-us/microsoft-365/blog/2025/11/18/microsoft-agent-365-the-control-plane-for-ai-agents/ · https://learn.microsoft.com/microsoft-agent-365/onboard
- Pixelmojo, «From UX to AX» (2026): https://www.pixelmojo.io/blogs/from-ux-to-ax-design-when-ai-becomes-coworker
- Aprobaciones, deshacer y confianza en agentes: https://www.moolstudio.com/blog/agentic-ai-ux-saas-approvals-undo-trust · https://www.aydesign.ai/blog/human-in-the-loop-ai-design-guide-2026 · https://icmd.app/article/shipping-ai-teammates-in-2026-the-product-leader-s-playbook-for-agentic-ux-guard-1778937806284
- Microsoft HAX, 18 pautas de interacción humano-IA: https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/
- Revisión sistemática sobre la confianza adecuada en la IA: https://arxiv.org/pdf/2311.06305 · tesis RIT 2025: https://repository.rit.edu/theses/12379
- NN/g, encuesta de IA en UX 2026: https://www.nngroup.com/articles/ai-in-ux-survey-26/
- Guías del equipo de Chrome (modern-web-guidance): navbar, breadcrumbs, tabs, typography, persistent-toast-notifications, accessibility, forms, dialog, form-factor-adaptation, natural-interactions, content-first-noise-reduction.
