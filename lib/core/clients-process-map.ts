// Mapa Visual de la ficha del cliente (NÚCLEO, 14 nov 2026; nivel 3). Se registra en lib/architecture-map/registry.ts
// (detailMapId «clientes»). Diseño: docs/DISENO-FICHA-CLIENTE.md.
import type { ProcessStep } from '@/lib/ai/clustering/pipeline';

export const CLIENTES_PROCESS_MAP: ProcessStep[] = [
  {
    id: 'cli-ficha',
    lane: 'La ficha',
    name: 'Ficha del cliente (núcleo)',
    description:
      'Toda la información del cliente en un sitio: identidad y estado (prospecto, onboarding, activo, pausado, baja), empresa, negocio, objetivos y estrategia, y contrato. La ven todos los módulos; Operaciones guarda aparte sus ajustes con el mismo id.',
    status: 'built',
    file: 'lib/core/clients.ts',
    when: 'Al crear o editar un cliente en Clientes, al aprobar una propuesta del agente o de «Rellenar con IA», y cada vez que un módulo necesita saber algo del cliente.',
    ai: 'Nada aquí (la redacción la hacen el agente o «Rellenar con IA», y esto solo valida y guarda).',
    code: 'Nombre único por cuenta (sin tildes ni mayúsculas). Fechas de alta y baja automáticas al cambiar el estado (con motivo de baja). Nunca contraseñas. El contrato (cuota, fechas) solo lo ve y edita un administrador (acción aparte con permiso admin; la ficha no lo envía al navegador de un editor). Borrar pregunta antes a los módulos (registro del núcleo): si tiene histórico (encargos en Operaciones, datos de Google en Rendimiento, seguimiento en Estrategia) hay que darle de baja primero (queda archivado) y confirmar escribiendo su nombre; el borrado arrastra todo lo del cliente.',
    tables: ['clients', 'ops_clients']
  },
  {
    id: 'cli-contactos',
    lane: 'La ficha',
    name: 'Contactos y locales',
    description: 'Personas del cliente con cargo, rol (decide, facturación, técnico, marketing), correo, teléfono, WhatsApp, canal preferido y quién es el principal; y sus locales o sedes con dirección, teléfono y horario.',
    status: 'built',
    file: 'lib/core/clients.ts',
    when: 'Desde la pestaña «Contactos» de la ficha, al aprobar una propuesta, y al asignar un correo a un cliente desde Correos (el remitente pasa a ser contacto).',
    ai: 'Nada aquí.',
    code: 'Un correo solo puede ser de un contacto de la cuenta (índice único). El primer contacto y el primer local quedan como principales; marcar otro quita la marca al anterior. Los correos de los contactos activos sirven para reconocer de qué cliente es un email (matchSender: dirección exacta > dominio; si dos clientes reclaman lo mismo, no adivina). Borrar un contacto de verdad es de administrador; un editor lo marca inactivo.',
    tables: ['client_contacts', 'client_locations']
  },
  {
    id: 'cli-comunicaciones',
    lane: 'La ficha',
    name: 'Qué recibe cada contacto',
    description: 'Cada contacto marca qué correos recibe (informes, preguntas, avisos, aprobaciones, facturación o todo; también por proyecto) y la ficha dice si los correos a este cliente pasan por aprobación. Si nadie recibe un tipo, lo avisa: el sistema no podrá escribirle de eso.',
    status: 'built',
    file: 'lib/core/comms.ts',
    when: 'Desde la pestaña «Contactos» («Qué recibe»); la aprobación, solo administración. Lo usan los correos a clientes (mapa Plataforma).',
    ai: 'Nada.',
    code: 'Destinatarios: contactos activos con correo que tengan ese tipo o «todo», para ese proyecto o para todos. Política: heredar (lo de la cuenta, por defecto siempre por aprobación), siempre o nunca.',
    tables: ['client_contact_subscriptions', 'client_messages', 'client_contacts']
  },
  {
    id: 'cli-webs',
    lane: 'La ficha',
    name: 'Webs y cuentas',
    description: 'Webs, dominios y cuentas del cliente (Search Console, Analytics, ficha de Google, Ads, redes, tienda, CRM y, desde el 20 nov 2026, el Mapa de contenido SEO en Google Sheets, con acceso directo en la cabecera de la ficha de los clientes con SEO) con si tenemos acceso y dónde están los accesos, y qué pueden hacer los agentes con ellas.',
    status: 'built',
    file: 'lib/core/clients.ts',
    when: 'Desde la pestaña «Webs y cuentas» y al aprobar una propuesta. Las herramientas de Google de los agentes (gsc_rendimiento, ga4_informe, gbp_rendimiento) usan la cuenta principal de cada tipo (primaryAsset) cuando se les dice solo el cliente.',
    ai: 'Nada aquí.',
    code: 'Nunca contraseñas (se rechaza cualquier texto que lo parezca). Una web o dominio puede «reconocer correos» de su dominio (email_domain, único por cuenta; nunca gmail.com y similares). La primera de cada tipo queda como principal. La ficha muestra qué integraciones están disponibles para el cliente según sus cuentas y lo conectado en Agentes → Integraciones.',
    tables: ['client_assets']
  },
  {
    id: 'cli-propiedades-google',
    lane: 'La ficha',
    name: 'Propiedades de Google por cliente',
    description: 'Asignar a cada cliente su propiedad de Search Console, Analytics 4 y ficha de Business Profile tomándolas de la cuenta de Google conectada: elegir de una lista en el formulario, «Buscar en Google» (las que coinciden con el dominio de sus webs) y «Comprobar accesos».',
    status: 'built',
    file: 'lib/core/client-directory.ts',
    when: 'Al pulsar «Buscar en Google» o «Comprobar accesos» en la pestaña «Webs y cuentas», o al elegir en el desplegable del formulario.',
    ai: 'Nada: emparejar por dominio es una comparación (matchExternalAssets).',
    code: 'El núcleo no sabe de Google: pregunta a los directorios que registran los módulos (registerAssetDirectory; Agentes registra el de Google). Caché de 5 minutos por cuenta. Solo se añade lo que Google ve de verdad (no se fía del navegador). Comprobar accesos: «Tenemos acceso» si aparece, «Sin acceso» si no; «Pedido, pendiente» se mantiene hasta que aparezca y «No hace falta» no se toca; un tipo cuya consulta falla no se toca.',
    tables: ['client_assets']
  },
  {
    id: 'cli-competencia',
    lane: 'La ficha',
    name: 'Competencia',
    description: 'Con quién compite el cliente (nombre, dominio y notas). Los que propone un agente quedan marcados.',
    status: 'built',
    file: 'lib/core/clients.ts',
    when: 'Desde la pestaña «Competencia» y al aprobar una propuesta. La usará el analista de competencia del onboarding.',
    ai: 'Nada aquí.',
    code: 'Dominio normalizado. Origen manual o agente.',
    tables: ['client_competitors']
  },
  {
    id: 'cli-memoria',
    lane: 'La ficha',
    name: 'Memoria del cliente',
    description: 'Lo que hay que recordar siempre: preferencias, promesas, decisiones, restricciones y contexto. Solo lo aceptado se usa como contexto (correos, encargos, agentes).',
    status: 'built',
    file: 'lib/core/client-memory-actions.ts',
    when: 'A mano desde la pestaña «Memoria», por el agente (anotar_memoria_cliente) o al aprobar una propuesta.',
    ai: 'Lo que propone la IA entra como «propuesto» y una persona lo acepta; lo que dicta Enric al agente y aprueba entra aceptado con origen «agente».',
    code: 'Máx. 1000 caracteres y sin contraseñas. Descartar lo puede hacer un editor; borrar de verdad, solo un administrador.',
    tables: ['client_memory']
  },
  {
    id: 'cli-completitud',
    lane: 'Completar la ficha',
    name: 'Completitud',
    description: 'Qué le falta a cada ficha para que el equipo y los agentes trabajen sin preguntar (negocio, objetivos, contacto, web, Search Console…), con un porcentaje en la lista y en la ficha.',
    status: 'built',
    file: 'lib/core/client-rules.ts',
    when: 'Al pintar la lista y la ficha, y en el texto de la ficha que lee el agente (así pregunta lo que falta).',
    ai: 'Nada: es un cálculo con pesos (lo esencial pesa más).',
    code: 'completeness(): 14 comprobaciones con peso 1–3. Se presenta como progreso (verde desde el 80 %), no como reproche.',
    tables: ['clients', 'client_contacts', 'client_locations', 'client_assets', 'client_competitors']
  },
  {
    id: 'cli-propuestas',
    lane: 'Completar la ficha',
    name: 'Propuestas de la IA (agente y «Rellenar con IA»)',
    description: 'Lo que cuenta Enric (texto o audio, por Telegram o en la ficha) se convierte en un plan validado: cada dato a su sitio (contactos, locales, webs, competencia, memoria, nivel y servicios), con vista previa, y se guarda solo al aprobar.',
    status: 'built',
    file: 'lib/operaciones/client-write.ts',
    when: 'Herramientas crear_cliente y actualizar_cliente del agente (con ✅ / ✖️ en Telegram) y botón «Rellenar con IA» de la lista y de la ficha («Proponer» → «Aplicar»).',
    ai: 'El agente (Claude) redacta los campos con lo que le cuentan y lo que lee en la web del cliente; en la web, el prompt ops_client_fill v2 propone la ficha completa.',
    code: 'Valida contra niveles, servicios, personas y opciones de ClickUp; rechaza contraseñas y duplicados; al editar, los textos se reemplazan y las listas se suman (un contacto con el mismo correo o nombre se completa); quitar es explícito. El contrato solo si quien propone es el dueño o un administrador. Al aplicar en la web se vuelve a validar en el servidor. Lo que falle (p. ej. un correo de otro cliente) se informa sin deshacer el resto.',
    prompts: ['ops_client_fill'],
    tables: ['clients', 'client_contacts', 'client_locations', 'client_assets', 'client_competitors', 'client_memory', 'ops_clients', 'ops_client_services']
  },
  {
    id: 'cli-preguntas-banco',
    lane: 'Preguntas al cliente',
    name: 'Banco de preguntas por servicio',
    description:
      'Las preguntas que se hacen a cada cliente según los servicios que le hacemos (General para todos, SEO, Google Ads, Web…), con para qué se pregunta, el tipo de respuesta, dónde se guarda (un campo de la ficha o la memoria) y cuándo: una vez al empezar o cada N días (promociones, cambios de presupuesto). Banco inicial redactado como lo haría un experto (migración 0064); se edita sin tocar código. También los textos de los correos (asunto y cuerpo con huecos {cliente}, {preguntas}, {enlace}…). Pantalla: Clientes → Banco de preguntas.',
    status: 'built',
    file: 'lib/core/questions.ts',
    when: 'Al editarlo en Clientes → Banco de preguntas (administrador). Un cambio pone al día las pendientes de todos los clientes que aún no se han enviado ni se han editado para ese cliente.',
    ai: 'Ninguna para guardar. «Proponer con IA»: ver el paso de propuestas.',
    code: 'Valida texto, tipo, destino (solo los del banco: memoria y campos de la ficha) y plazo (7–730 días). Borrar una pregunta quita sus pendientes; las ya enviadas o respondidas se quedan en cada cliente.',
    tables: ['client_question_templates', 'client_comms_templates']
  },
  {
    id: 'cli-preguntas-cliente',
    lane: 'Preguntas al cliente',
    name: 'Las preguntas de cada cliente',
    description:
      'Pestaña «Preguntas» de la ficha (a la vista, con el número de las que hay por preguntar): de qué servicios salen, quién las recibe (si nadie, se marca el contacto ahí mismo), lo que está en marcha (correo esperando aprobación, que se aprueba, corrige o descarta ahí; cuestionario activo) y la lista por preguntar agrupada por servicio, con «Ya lo sé» (respuesta a mano), editar solo para este cliente, «No aplica», preguntas sueltas y «Proponer con IA». Debajo, enviadas, respondidas (con la cita y a dónde fueron) y las que no aplican.',
    status: 'built',
    file: 'lib/core/questions.ts',
    when: 'Se ponen al día al abrir la ficha, antes de cada envío y en la pasada diaria (syncClientQuestions).',
    ai: 'Nada para decidir qué preguntar: reglas.',
    code: 'Se abren las del banco de General y de sus servicios (Operaciones dice cuáles: setClientServicesSource) que no estén abiertas, respondidas ni en «no aplica»; las periódicas, otra vez al pasar su plazo desde la respuesta. Las pendientes de un servicio que se le quita se cierran. Los módulos aportan «datos que faltan» (SEO: huecos del expediente; registerClientQuestionSource) y desaparecen si el dato deja de faltar. Un correo descartado devuelve sus preguntas a «por preguntar». Como mucho una abierta por pregunta del banco o dato (índices únicos parciales).',
    tables: ['client_questions', 'client_question_templates', 'client_contact_subscriptions']
  },
  {
    id: 'cli-preguntas-envio',
    lane: 'Preguntas al cliente',
    name: 'Envío: correo o cuestionario en línea',
    description:
      'Hasta 5 preguntas, correo corto (el cliente contesta al correo); con más, cuestionario en línea: un enlace privado de 30 días a /cuestionario/<token>, página pública sin sesión, con guardado automático y «Enviar respuestas». Se puede cambiar el canal y el texto solo para ese envío. Siempre por las comunicaciones del núcleo: destinatarios marcados para «Preguntas» y la política de aprobación del cliente. Envío automático: lo pide un módulo (SEO al reunir el expediente), una vez cada 30 días como mucho.',
    status: 'built',
    file: 'lib/core/questions.ts',
    when: '«Preparar envío» en la pestaña Preguntas; automático con el trabajo «clientes.preguntas.auto».',
    ai: 'Ninguna: plantilla editable con huecos.',
    code: 'Solo se guarda el hash (SHA-256) del token; 24 bytes aleatorios. Un cuestionario activo por cliente: el anterior se anula (lo escrito se entrega). Las acciones públicas solo aceptan preguntas de ese cuestionario, con tamaños limitados. Mientras un correo de preguntas espera aprobación no se prepara otro.',
    tables: ['client_questionnaires', 'client_questions', 'client_messages']
  },
  {
    id: 'cli-preguntas-respuestas',
    lane: 'Preguntas al cliente',
    name: 'Respuestas: leerlas y llevarlas a su sitio',
    description:
      'Por correo: la respuesta entra por el buzón, el núcleo la une a su hilo y Haiku saca lo que contesta a cada pregunta con la frase exacta. Por cuestionario: llegan ya ordenadas al pulsar «Enviar» (o al anular o caducar el enlace, lo que estuviera escrito). A mano: «Ya lo sé» / «Responder a mano». Cada respuesta va a su destino: un campo de la ficha (solo si estaba vacío; si dice otra cosa, la pestaña ofrece «Usar esta respuesta»), la memoria del cliente (la leen los agentes) o el módulo que la pidió (SEO: expediente, provisional). Aviso a Enric por Telegram.',
    status: 'built',
    file: 'lib/core/questions.ts',
    when: 'Al llegar la respuesta (trabajo «clientes.preguntas.leer»), al enviar el cuestionario o al apuntarla a mano.',
    ai: 'Haiku (prompt clientes_leer_respuestas) solo para leer el correo; el código descarta lo que no traiga una cita literal presente en lo que escribió el cliente (sin nuestro correo citado) o no tenga la forma de su tipo.',
    code: 'La respuesta nunca se pierde aunque falle su destino (queda en la pregunta). Nunca se pisa un campo de la ficha con contenido.',
    tables: ['client_questions', 'clients', 'client_memory'],
    prompts: ['clientes_leer_respuestas']
  },
  {
    id: 'cli-preguntas-ia',
    lane: 'Preguntas al cliente',
    name: '«Proponer con IA»',
    description: 'Se describe qué hace falta saber («todo lo necesario para configurar su primera campaña de Google Ads») y la IA propone entre 5 y 12 preguntas de experto, sin repetir las que ya hay. Se marcan las buenas y se añaden: al banco (de un servicio) o solo a un cliente (con su ficha como contexto).',
    status: 'built',
    file: 'lib/core/questions.ts',
    when: 'Botón «Proponer con IA» en el banco (administrador) y en la pestaña Preguntas de un cliente.',
    ai: 'Sonnet (prompt clientes_proponer_preguntas): es razonamiento de experto y se usa pocas veces al mes, así que no compensa un modelo menor. La ficha del cliente va marcada como dato no fiable.',
    code: 'No guarda nada: una persona elige. Se limpian forma, tipo y destino (solo los del banco) y se quitan las repetidas.',
    tables: ['client_question_templates', 'client_questions'],
    prompts: ['clientes_proponer_preguntas']
  },
  {
    id: 'cli-preguntas-diaria',
    lane: 'Preguntas al cliente',
    name: 'Pasada diaria',
    description: 'Pone al día las preguntas de los clientes con servicios (vuelven las periódicas) y cierra los cuestionarios caducados (lo escrito se entrega; lo demás vuelve a «por preguntar»).',
    status: 'built',
    file: 'lib/core/questions.ts',
    when: 'Una vez al día (proceso «clientes.preguntas.diaria» del planificador, dado de alta en la migración 0064).',
    ai: 'Nada.',
    code: 'Cada cliente aislado: un fallo no para a los demás.',
    tables: ['client_questions', 'client_questionnaires']
  },
  {
    id: 'cli-conexiones',
    lane: 'Conexiones',
    name: 'Conexiones con WordPress y GoHighLevel',
    description: 'Ficha → Webs y cuentas → Conexiones. WordPress: SEO crea borradores desde los briefs (nunca publica). GoHighLevel: los leads de los formularios de su web. Contraseña o token cifrados; la pantalla solo ve el final enmascarado. Se borran con el cliente.',
    status: 'built',
    file: 'lib/core/connections.ts',
    when: 'A mano (administrador): conectar, comprobar o quitar. WordPress se vuelve a comprobar antes de cada borrador.',
    ai: 'Nada.',
    code: 'WordPress: lista blanca (solo rol «contributor», sin publish_*, upload_files, unfiltered_html, edit_published/others ni manage_*), https en el puerto estándar, host de una web del cliente, sin seguir redirecciones (publicFetch), cambiar la URL o el usuario obliga a reescribir la contraseña, solo POST de entradas nuevas en borrador; enlace de edición construido por nosotros. GoHighLevel: host fijo, token de solo lectura (forms.readonly), cabecera Version 2021-07-28 (comprobada el 27 nov con una subcuenta real). Nunca se registran cabeceras ni cuerpos. Auditoría Opus: docs/DISENO-SEO-CIERRE.md.',
    tables: ['client_connections', 'client_assets', 'clients']
  },
  {
    id: 'cli-leads',
    lane: 'Conexiones',
    name: 'Leads de los formularios (GoHighLevel)',
    description: 'Cada día se descargan los envíos de formularios de cada cliente conectado: fecha, formulario, página de la web, referente, canal (orgánico, anuncios, directo, redes, otras webs) y UTM. Los usa la pestaña En vivo de SEO y el informe mensual.',
    status: 'built',
    file: 'lib/core/connections.ts',
    when: 'Una vez al día (proceso «clientes.leads», se da de alta al conectar el primer cliente) o «Descargar ahora».',
    ai: 'Nada.',
    code: 'GET /forms/submissions por páginas de 100 desde la última descarga − 2 días (35 días la primera vez), clave única por envío. RGPD: ni nombre, ni correo, ni teléfono, ni IP, ni id del contacto; URL sin parámetros y solo los utm_*. Retención 25 meses. Espera ante el 429.',
    tables: ['client_leads', 'client_connections']
  }
];
