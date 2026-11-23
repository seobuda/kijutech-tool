# Pendientes de Enric

Lista viva de lo que solo puede hacer Enric (accesos, decisiones, el equipo). Claude la actualiza al terminar cada bloque.
Detalle paso a paso de la activación en `docs/PRUEBAS-EN-VIVO.md`.

**Última actualización:** 23 nov 2026. En producción: `main` `654e90a9` (reorganización UX completa, fases 1 a 5), 59 migraciones.

## Departamento SEO: cimientos de la plataforma (23 nov, migración 0060, rama `feature/cimientos-plataforma`)
Aprobado: diseño v2 (`docs/DISENO-MODULO-SEO.md`), esquema y núcleo (`docs/DISENO-TECNICO-CIMIENTOS.md`), trabajador aparte y `parse5`. Construido y probado; **sin desplegar**.
- [ ] **Subir el servidor a 4 GB de RAM o más** (DigitalOcean → droplet → Resize). Sin esto no se despliega: el trabajador, el rastreo y Search Console no caben en 2 GB.
- [ ] Cuando esté, decir «despliega»: Claude fusiona la rama y lanza `deploy.sh --migrate` (hace backup antes; el permiso te lo pide).
- [ ] **El cliente de la prueba real** del Hito 1 (mejor con web, Search Console y ficha de Google). En su ficha → Contactos, marcar en «Qué recibe» a quién van las preguntas y los informes.
- [ ] Cuentas para el Hito 1: DataForSEO (recarga de 50 $), claves de Google Cloud de PageSpeed/CrUX y Places, y embeddings con saldo.
- [ ] Antes de que caduque SE Ranking: exportar las palabras clave y el histórico de los clientes.
- [ ] Con el cliente de la prueba: reclamar sus fichas en Bing Places y Apple Business, probar «Businesses in ChatGPT» (¿admite España?) y añadir sus redes en Search Console.
- [ ] Google Ads: no pedir el token de desarrollador (se retiró el 9 sep 2026).

## Reorganización UX: Inicio, Para ti, Equipo, cliente en un solo sitio y guía (20-21 nov, migración 0058)
Todo desplegado. Detalle en `docs/ESTADO.md` §6.31 a §6.35 y en `docs/DISENO-UX-REORGANIZACION.md`.
- [ ] **Enlazar cada usuario a su ficha** (Equipo → Tareas y jornada → Fichas). Sin ese enlace, la persona no ve su Inicio, ni Mis tareas, ni sus cifras: solo el aviso «Tu usuario aún no está enlazado».
- [ ] **Departamento y foto de cada persona:** Equipo → abre su ficha → «Departamento» y «Subir foto». Cada persona puede subir la suya. Opcional: fotos de los agentes.
- [ ] **Ver tu visita guiada** (sale sola la primera vez que entras en Inicio; después, Ayuda → «Ver la guía»). Dime si algún texto no es como lo explicarías. La de administración solo está comprobada con pruebas automáticas.
- [ ] **Una entrada de Conocimiento por pantalla** (con vídeo si lo grabas), para que «Ayuda sobre esta pantalla» encuentre algo. Mientras tanto, el glosario (Ayuda → Glosario) cubre los términos.
- [ ] **Revisar el glosario** (`/dashboard/ayuda`): que cada definición sea como tú la explicarías.
- [ ] **Avisar al equipo** del cambio de menú (Inicio, Mis tareas, Clientes, Equipo, Conocimiento) y de que la guía les saldrá sola al entrar.
- [ ] **Cerrar en ClickUp las tareas de prueba vencidas** que tienes asignadas (`[PRUEBA 6C-2]…` y la de Indautxu en «Pruebas Kiju», del 30 oct).

## Jefe de operaciones: dudas del equipo (rama `feature/jefe-operaciones-fase2`, migración 0057, 20 nov)
Aprobado: agente libre con garantías en código, Opus 5.5 para los jefes y el esquema. Detalle en `docs/ESTADO.md` §6.30.
- [x] **Desplegar con migración** (desplegado el 20 nov, `326a1a07`). El Operations manager y el jefe de sistema ya usan Opus 5.5.
- [ ] **Probarlo antes de encenderlo para todos:** desde tu chat principal escribe «/jefe tu duda» (funciona aunque esté apagado; te llegan la respuesta con sus botones y las aprobaciones). Prueba una duda que esté en la base, una que no, «No me sirve» y algo de plazos.
- [ ] **Avisar al equipo** antes de dejarlo encendido: pueden preguntar por su chat de siempre (texto o audio, o respondiendo al aviso de un encargo); verán la fuente y los botones Me sirve / No me sirve / Que lo vea Enric.
- [ ] **Decidir cuándo pasar la IA general a «Las envía solo»** (de serie, con tu aprobación).
- [ ] Vigilar el coste del jefe los primeros días (cada duda muestra su coste; presupuesto del jefe: 30 $/mes, editable en Agentes).

## Base de conocimiento y Mapa de contenido (rama `feature/jefe-operaciones`, migración 0056, 20 nov)
Aprobado: diseño (opción A, núcleo, escaladas por el chat principal, IA general con tu aprobación, categorías, solo publicas tú) y esquema. Detalle en `docs/ESTADO.md` §6.29.
- [x] **Desplegar con migración** (Claude lo lanza con tu OK; hace backup antes).
- [ ] **Importar de ClickUp (una sola vez)** en producción: Trabajo → Conocimiento → «Importar de ClickUp» (espacio «📚 Base de Conocimiento»). En local: 127 tareas con contenido a «Para más tarde» (40 vacías no entran; 77 con vídeos alojados en ClickUp, etiqueta «vídeo en clickup»: pásalos a Google Drive al revisarlos). Desde entonces, nada de conocimiento en ClickUp.
- [ ] **Revisar por tandas** la pestaña «Para más tarde» (tus horas de conocimiento): publicar, editar o archivar.
- [ ] **Embeddings:** la clave de Gemini local no tiene saldo (402). Si en producción pasa lo mismo, la búsqueda funciona solo por palabras: recarga Gemini o configura otro proveedor de embeddings en IA y modelos (coste de céntimos).
- [ ] **Prueba por Telegram:** «apunta en la base: …» al Operations manager; te llega la propuesta con botones. Y «¿qué tenemos en la base sobre …?».
- [ ] **Mapa de contenido:** que Mayi añada el enlace del Google Sheet en cada cliente con SEO (ficha → Webs y cuentas → tipo «Mapa de contenido»).
- [ ] **Explicar al equipo** el botón «Proponer una entrada» de Conocimiento (necesitan usuario en la herramienta; por Telegram llegará con la fase 2).

## Organigrama y chat de Sistema (rama `feature/departamentos-sistema`, migración 0055, 20 nov)
Aprobado: esquema, núcleo, despliegue con migración y el arreglo de raíz de los errores de las pruebas. Detalle en `docs/ESTADO.md` §6.28.
- [x] Crear el bot «Kijutech Sistema» en @BotFather (hecho el 20 nov).
- [x] **Desplegar con migración** (Claude lo lanza con tu OK; hace backup antes).
- [x] **Agentes → Departamentos → Sistema y Plataforma:** pega el token del bot y pulsa Guardar.
- [x] **Abre el chat con el bot y pulsa «Iniciar»** (si al guardar no te escribió) y vuelve a pulsar «Comprobar».
- [ ] **Hora del parte** en Automatizaciones → «Parte de Sistema» (por defecto 09:00). «Enviarme una prueba» te lo manda al momento.
- [x] **Prueba:** escríbele o mándale un audio al bot de Sistema: «¿cómo está el sistema?».
- [ ] **Mira la pantalla Agentes → Departamentos** (también en móvil): Claude no la ha podido ver en el navegador.
- [ ] Marca como resuelto en Sistema → Errores el grupo que crearon las pruebas el 19 nov («[jornada] tareas de hoy sin ClickUp»).
- [ ] (Pendiente de tu OK) Actualizar el texto del paso «Despliegue protegido» del bloque Seguridad del Mapa Visual (`lib/auth/`).

## Estrategia de clientes, fase 1 (rama `feature/estrategia-viva`, migración 0050)
Diseño v4 aprobado («ok a todo, adelante con la fase 1»; posiciones solo con Search Console). Detalle en `docs/ESTADO.md` §6.24.
- [ ] **Desplegar con migración** (hace backup antes): `! git checkout main && git merge --no-ff feature/estrategia-viva && git push origin main && bash scripts/deploy.sh --migrate`
- [ ] **Revisar los planes** en Trabajo → Estrategia → Planes (Mantenimiento web, SEO local, SEO estratégico): frecuencias por defecto según la investigación; cámbialas, renómbralos o crea otros.
- [ ] **Activar los clientes** que llevan seguimiento (Trabajo → Estrategia → «Activar un cliente», o en la ficha → Estrategia). Los demás no gastan nada. Para que haya datos, el cliente necesita su web y su Search Console en Webs y cuentas.
- [ ] **En cada cliente activado:** añadir sus palabras clave (Estrategia → Palabras clave → «Sugerir desde Search Console»), crear sus objetivos («Calcular partida y proponer metas») y pulsar «Procesar encargos anteriores» en Trabajo e impacto.
- [ ] **Calendario:** añadir las actualizaciones de Google recientes (p. ej. la core update de noviembre de 2026, que empezó el día 10, según el Google Search Status Dashboard). Salen en las gráficas de Rendimiento y en los avisos.
- [ ] **Mirar las pantallas** (pestaña Estrategia y panel), también en móvil y oscuro: Claude no ha podido verlas en el navegador.
- [ ] **Explicar al equipo** la pregunta nueva del bot al cerrar un encargo sobre una página: «¿en qué URL se ha hecho este trabajo?» («✍️ Escribir» o «No aplica»). Se puede apagar en Estrategia → Ajustes.
- [ ] **PageSpeed (opcional):** sin clave, Google limita las consultas de velocidad. Si sale «Google limita las peticiones sin clave», crear una clave de la API de PageSpeed Insights en Google Cloud; para usarla en producción hay que añadir `PAGESPEED_API_KEY` al `.env` del servidor y a `docker-compose.prod.yml` (cambio que necesita tu aprobación).
- [ ] **Probar por Telegram:** «¿cómo va la estrategia de [cliente]?» (usa estrategia_cliente).


## Rendimiento del cliente + propiedades de Google (rama `feature/rendimiento-cliente`, migración 0049)
Incluye el paso A (propiedades de Google por cliente) y los pasos B1, B2 y B3 (sección Rendimiento). Informe por correo del 15 nov.
- [x] **Desplegado** el 15 nov (`4426ae3b`, 50 migraciones; web 200, Telegram sin errores).
- [ ] **Comprobar que Google está conectado** en Agentes → Integraciones (si no, ni el panel de Google de las fichas ni la descarga funcionan).
- [ ] **En cada cliente:** Clientes → cliente → Webs y cuentas → «Buscar en Google» → marcar las suyas → «Añadir a la ficha». Después «Comprobar accesos». En unos minutos empieza a descargarse su histórico.
- [ ] **Poner la fecha de inicio del servicio** en las fichas (Empresa y negocio): sale como hito en las gráficas y permite comparar «antes del servicio».
- [ ] **Mirar la pestaña Rendimiento** de 2-3 clientes y el panel **Rendimiento** del menú (Claude no ha podido verlas en el navegador: el permiso para levantar un servidor de vista previa se denegó). Revisa en móvil y en oscuro.
- [ ] **Business Profile:** si su estado sale en «Error» con un 403, Google aún no ha aprobado la API para el proyecto: solicitarlo en la consola de Google Cloud.
- [ ] **Probar por Telegram:** «¿cómo va [cliente]?» (debe usar rendimiento_cliente, sin gastar llamadas a Google), «prepárame el informe del mes de [cliente]» y «apunta que hoy publicamos la web nueva de [cliente]» (llega con ✅ / ✖️).
- [ ] **Ajustes de avisos** en Rendimiento → «Avisos e informes» (por defecto: caídas y subidas del 30 %, mínimo 20 por semana, resumen el día 5 y apartado en el informe semanal).

## Ficha del cliente en el núcleo (desplegada el 14 nov, `d7aa3091`)
- [x] Desplegada con migración 0048.
- [ ] **Revisar con tu cuenta** en brain.kijutech.com → **Clientes** (nueva sección en el menú): la lista, abrir una ficha y pasar por sus 7 pestañas;
  probar «Rellenar con IA» con un audio en un cliente real y «Aplicar»; comprobar que el contrato solo aparece con tu cuenta de admin.
- [ ] **Telegram:** «Nos ha entrado un cliente nuevo…» con web, contacto, dirección y competidor → ✅ → comprobar que cada dato está en su pestaña. Borrar la ficha de prueba.
- [ ] **Completar fichas** poco a poco: la lista enseña el % de cada una y la ficha dice qué falta (lo más rápido: un audio por cliente con «Rellenar con IA» o al agente).

## Viernes 13 — antes de activar al equipo (unos 45 min)
- [ ] **Revisar con tu cuenta de admin** lo que Claude no puede ver (no hay usuario de pruebas en producción):
  - [ ] Equipo → Tiempos;
  - [ ] Equipo → Fichas: el selector «Mi panel:»;
  - [ ] Equipo → Calendario: añadir y quitar un festivo;
  - [ ] Operaciones → Informes: las tres vistas;
  - [ ] Sistema → Automatizaciones: las 4 tarjetas nuevas y «Enviarme una prueba» en Informes;
  - [ ] Sistema → Salud: las comprobaciones nuevas.
- [ ] **Telegram:** vincular a **Eury** (Sistema → Telegram).
- [ ] **Fichas de Equipo:** horario correcto de cada persona (zona, entrada, horas, días y comida). Rellenar las fichas de **Eury y
  Mayelin**.
- [ ] **Calendario:** festivos que vienen (8 dic, 25 dic, 1 ene, 6 ene…), festivos del país de quien trabaja desde fuera y
  vacaciones conocidas.
- [ ] **Automatizaciones:** revisar los plazos (Plazos de lo que espera de ti), las horas de los informes y tu tope de gasto de IA.
- [ ] **Buzón del agente:** comprobar en Correos → Buzón del agente que la clave de Resend está conectada. Si no, no entra ningún
  correo de cliente.
- [ ] **Copia diaria nueva y prueba de restauración mensual** en el servidor (§0.5 de la guía): `chmod +x`, probar cada una una vez y poner las dos líneas del cron.

## Viernes 13 — activación
- [ ] Ensayo de 20 min con **modo pruebas activo** y la **Jornada real** encendida (§1 de la guía).
- [ ] Mandar la guía al equipo (`docs/GUIA-EQUIPO-JORNADA.md`) con el mensaje del §2.1.
- [ ] **Apagar el modo pruebas** (Sistema → Telegram) y vigilar el día (tabla del §2.3).
- [ ] Recordar: si algo molesta, se apaga el interruptor de la tarjeta en Automatizaciones y en unos 10 segundos deja de actuar.

## Fin de semana (cuando puedas)
- [ ] **Vigilancia desde fuera del servidor:** cuenta en un servicio de monitorización que consulte
  `https://brain.kijutech.com/api/health`, o un cron en tu NAS (§0.6).
- [ ] **Copia fuera de DigitalOcean:** decidir destino (Google Drive de la agencia o NAS) y dar el acceso, para configurar `rclone`
  juntos.
- [ ] **Gemini:** recargar créditos de la clave de transcripción, o decidir otro proveedor. Sin esto, el dictado por voz no funciona.
- [ ] **Fichas de clientes:** 50 de 52 están en gris (sin servicio ni horas), así que no generan alertas. En **Operaciones → Clientes →
  «Ver propuestas»** salen servicios, responsable habitual y listas sacados del historial de ClickUp: revisa y pulsa «Aplicar» en cada
  una (unos 15 min para todas).
- [ ] **Limpieza de datos de prueba:** borrar en ClickUp las tareas de prueba de la lista «Pruebas Kiju» (ver `docs/ESTADO.md` §14)
  y resolver los posibles clientes duplicados (`sih`/`Sihbou.com`, familia «CP …»/`clubpilatesindautxu.es`,
  `Spid2005.com`/`SonidoFundamental`).

## Lunes 16
- [ ] 08:30: leer el **primer informe semanal** (saldrá corto) y decir qué sobra o qué falta.
- [ ] Encender **Tiempos de tarea** (Automatizaciones) y, si puedes, poner los márgenes en Equipo → Tiempos.
- [ ] Si llega la propuesta de subir la autonomía del agente, decidir con el botón.

## Vigía de IA (cuando puedas)
- [x] **Los 80 $/mes son solo de la API** (confirmado el 13 nov): el informe de costes de Anthropic los cubriría.
- [ ] **Clave de administración de Anthropic** (opcional): en tu consola no aparece «Admin keys». Según la documentación, una cuenta
  individual tiene que crear antes una organización en `platform.claude.com/settings/organization`. Después, en Settings → Admin keys,
  crear una y pegarla en Sistema → Gasto de IA. Mientras tanto el vigía usa el coste estimado de cada llamada de la herramienta, que
  es lo mismo si la clave de la API solo la usa la herramienta (no cuenta la caché de prompt ni la búsqueda web).
- [ ] **IA de reserva:** para que funcione hace falta una segunda clave con saldo de otro proveedor (OpenAI, Gemini o DeepSeek) en IA
  y modelos. La de Gemini no tiene créditos.

## Servidor y costes (DigitalOcean)
- [ ] **Token de DigitalOcean de solo lectura:** en DigitalOcean → API → Tokens, crear uno «Custom scopes» con solo lectura de
  billing, droplet, snapshot, sizes y monitoring, y pegarlo en Sistema → Servidor y costes. El token que hay en el `.env` del PC
  funciona, pero no sé qué permisos tiene: para el servidor mejor uno que solo pueda leer.
- [ ] **Revisar el presupuesto de DigitalOcean** (45 $/mes por defecto; el coste fijo actual es ~37 $/mes) en Automatizaciones →
  Servidor y costes.
- [ ] (Informativo) La cuenta tiene otros dos servidores (el de 2020 de 12 $ + copias y Findersuite de 7 $) y 19 GB de snapshots
  antiguos (~1,15 $/mes). Si alguno ya no hace falta, se ve en la pantalla; Claude no toca nada de DigitalOcean.

## Agentes (cuando puedas)
- [ ] **Probar el agente por Telegram:** escríbele «¿cómo va el equipo hoy?» y mándale un audio. Comprueba que entiende el audio (verás
  🎙 «…») y que te contesta también con nota de voz. Guía: `docs/GUIA-AGENTES.md`.
- [ ] **Precios de voz:** en IA y modelos, revisa los precios de OpenAI (gpt-4o-mini y la voz). El coste de la voz se anota con un
  precio aproximado.
- [ ] **Integraciones** (Agentes → Integraciones):
  - DataForSEO: usuario y contraseña de la API;
  - Clarity: token de exportación;
  - Google: crear el cliente OAuth en Google Cloud con la URI que indica la pantalla, y pedir a Google el acceso a la API de
    Business Profile si lo quieres.
- [ ] **Revisar la ficha del Operations manager y del Revisor web** (Agentes → Editar) y crear los subagentes que quieras
  (redactor, auditor…).

## Decisiones que esperan tu aprobación (Claude no las hace sin tu OK)
- [ ] **Proyectos SEO con su cliente de verdad** (21 nov): al crearlos el cliente se guarda solo como texto, y la ficha los encuentra por nombre o alias. Guardar `projects.client_id` con un selector de cliente toca el núcleo.
- [ ] **Recordar en la base de datos quién ha visto la guía** (21 nov), para que no vuelva a salir en otro navegador. Hoy se recuerda en cada navegador. Necesita esquema.
- [x] **Reasignar desde el parte con un botón:** aprobada y desplegada (migración 0046).
- [x] **IA de reserva:** aprobada y construida (falta la segunda clave, ver arriba).
- [ ] **5C: temporadas, niveles y misiones.** El diseño está aprobado; falta aprobar su esquema de base de datos. Mejor después de
  1–2 semanas de jornada real.
- [ ] **Módulo Google Ads (propio, más adelante):** decidido el 16 nov que Ads será un módulo independiente y avanzado (es de los
  departamentos que más facturan), con su investigación y diseño propios cuando acabe Estrategia. Puedes ir pidiendo ya el
  **token de desarrollador de la API de Google Ads** desde la cuenta de administrador (MCC), porque Google lo revisa y tarda.
