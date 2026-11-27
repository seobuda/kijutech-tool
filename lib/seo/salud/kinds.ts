// SEO · Salud técnica: los tipos de hallazgo (Hito 1, 23 nov 2026). Sin imports: lo usan también las pantallas.

export type Severity = 'info' | 'aviso' | 'importante' | 'critico';
export type SaludKind = { kind: string; title: string; explain: string; severityDefault: Severity; ruleVersion: number; group: SaludGroup };
export type SaludGroup = 'vigilancia' | 'rastreo' | 'indexacion' | 'contenido' | 'enlazado' | 'datos_estructurados' | 'search_console' | 'local';

export const SALUD_GROUP_LABEL: Record<SaludGroup, string> = {
  vigilancia: 'Vigilancia continua: web caída, velocidad e indexación',
  rastreo: 'Rastreo y respuestas',
  indexacion: 'Indexación y canonical',
  contenido: 'Títulos, encabezados y contenido',
  enlazado: 'Enlazado interno',
  datos_estructurados: 'Datos estructurados',
  search_console: 'Cruce con Search Console',
  local: 'Local: nombre, dirección, teléfono y servicios'
};

/** Los tipos de hallazgo de Salud. Se registran en el núcleo al arrancar (lib/seo/register.ts). */
export const SALUD_KINDS: SaludKind[] = [
  { kind: 'seo.http_5xx', group: 'rastreo', title: 'Página con error del servidor (5xx)', explain: 'La web falla al servir esta página: Google no puede leerla y, si dura, la quita del índice.', severityDefault: 'critico', ruleVersion: 1 },
  { kind: 'seo.http_4xx', group: 'rastreo', title: 'Página rota (4xx) enlazada desde la web', explain: 'Hay enlaces internos a una página que no existe: el visitante y Google llegan a un error y se pierde la fuerza del enlace.', severityDefault: 'importante', ruleVersion: 1 },
  { kind: 'seo.fetch_error', group: 'rastreo', title: 'No se pudo leer la página', explain: 'La petición falló (tiempo agotado, conexión cortada o dirección no permitida). Si se repite, Google también tendrá problemas.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.redirect_chain', group: 'rastreo', title: 'Cadena de redirecciones', explain: 'Una redirección lleva a otra redirección: hace más lenta la carga y Google puede dejar de seguirla. Debe ir directa al destino final.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.link_to_redirect', group: 'enlazado', title: 'Enlaces internos a una redirección', explain: 'La web enlaza a una URL que redirige: conviene enlazar directamente a la URL final.', severityDefault: 'info', ruleVersion: 1 },
  { kind: 'seo.js_rendered', group: 'rastreo', title: 'Posible web pintada con JavaScript', explain: 'La página trae muy poco texto en el HTML y muchos scripts: si el contenido solo aparece con JavaScript, Google tarda más en verlo y otros buscadores e IAs pueden no verlo.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.slow_server', group: 'rastreo', title: 'La web tarda mucho en responder', explain: 'La mediana de lo que tarda el servidor en entregar cada página es alta: empeora la experiencia y las Core Web Vitals, y Google rastrea menos páginas por visita. Suele arreglarse con caché, un plugin de caché o un alojamiento mejor.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.not_https', group: 'rastreo', title: 'Página sin HTTPS', explain: 'La página se sirve sin cifrar: Google lo penaliza y el navegador la marca como «no segura».', severityDefault: 'importante', ruleVersion: 1 },
  { kind: 'seo.sitemap_missing', group: 'indexacion', title: 'Sin sitemap o sitemap vacío', explain: 'No se encontró un sitemap con páginas de la web (ni en robots.txt ni en /sitemap.xml). Ayuda a Google a descubrir y priorizar las páginas.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.noindex_in_sitemap', group: 'indexacion', title: 'Página con noindex dentro del sitemap', explain: 'El sitemap pide a Google que indexe una página que a la vez dice «no me indexes»: señales contradictorias.', severityDefault: 'importante', ruleVersion: 1 },
  { kind: 'seo.non200_in_sitemap', group: 'indexacion', title: 'URL del sitemap que no responde 200', explain: 'El sitemap debe listar solo URLs finales que funcionan; esta redirige o da error.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.canonical_other', group: 'indexacion', title: 'Canonical apuntando a otra URL', explain: 'La página dice que su versión principal es otra: Google indexará la otra. Correcto si es una variante; un error si no.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.canonical_broken', group: 'indexacion', title: 'Canonical a una URL que no responde 200', explain: 'La versión principal que declara la página redirige o da error: Google ignorará el canonical o elegirá otra.', severityDefault: 'importante', ruleVersion: 1 },
  { kind: 'seo.title_missing', group: 'contenido', title: 'Página sin título', explain: 'El título es lo primero que se ve en Google y una de las señales más fuertes de qué trata la página.', severityDefault: 'importante', ruleVersion: 1 },
  { kind: 'seo.title_duplicate', group: 'contenido', title: 'Título repetido en varias páginas', explain: 'Varias páginas con el mismo título compiten entre sí y Google no sabe cuál mostrar.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.title_long', group: 'contenido', title: 'Título demasiado largo', explain: 'Más de ~65 caracteres: Google lo corta en los resultados y lo importante puede no verse.', severityDefault: 'info', ruleVersion: 1 },
  { kind: 'seo.meta_description_missing', group: 'contenido', title: 'Sin meta descripción', explain: 'Google se inventará el texto del resultado; una buena descripción mejora los clics.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.meta_description_duplicate', group: 'contenido', title: 'Meta descripción repetida', explain: 'La misma descripción en varias páginas: no ayuda a distinguirlas en los resultados.', severityDefault: 'info', ruleVersion: 1 },
  { kind: 'seo.h1_missing', group: 'contenido', title: 'Página sin H1', explain: 'El encabezado principal dice a Google y al visitante de qué trata la página.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.h1_multiple', group: 'contenido', title: 'Varios H1 en la página', explain: 'No es grave, pero un único H1 claro ordena mejor la página.', severityDefault: 'info', ruleVersion: 1 },
  { kind: 'seo.thin_content', group: 'contenido', title: 'Contenido escaso', explain: 'Menos de 200 palabras: difícil que posicione salvo que sea una página de contacto o similar.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.duplicate_content', group: 'contenido', title: 'Contenido duplicado', explain: 'Varias páginas indexables con el mismo texto: Google elige una y las demás no posicionan.', severityDefault: 'importante', ruleVersion: 1 },
  { kind: 'seo.near_duplicate', group: 'contenido', title: 'Contenido casi duplicado', explain: 'Páginas con un texto casi igual (p. ej. la misma plantilla cambiando la ciudad): riesgo de que Google las vea como una sola.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.images_without_alt', group: 'contenido', title: 'Imágenes sin texto alternativo', explain: 'El atributo alt describe la imagen a Google Imágenes y a personas con lector de pantalla.', severityDefault: 'info', ruleVersion: 1 },
  { kind: 'seo.orphan_in_sitemap', group: 'enlazado', title: 'Página huérfana', explain: 'Está en el sitemap pero ninguna página de la web la enlaza: Google le da poca importancia.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.deep_page', group: 'enlazado', title: 'Página muy profunda', explain: 'Hacen falta más de 4 clics desde la portada para llegar: Google la rastrea menos y le da menos peso.', severityDefault: 'info', ruleVersion: 1 },
  { kind: 'seo.schema_org_missing', group: 'datos_estructurados', title: 'Sin datos estructurados del negocio', explain: 'Ninguna página declara quién es el negocio (Organization o LocalBusiness): Google y las IAs lo entienden peor. En Datos estructurados está el código listo para pegar.', severityDefault: 'importante', ruleVersion: 1 },
  { kind: 'seo.schema_fields_missing', group: 'datos_estructurados', title: 'Datos del negocio incompletos', explain: 'El bloque del negocio no tiene todos los campos básicos (nombre, dirección, teléfono, web).', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.schema_faq', group: 'datos_estructurados', title: 'Marcado FAQ que ya no sirve', explain: 'Google dejó de mostrar los resultados enriquecidos de preguntas frecuentes para casi todas las webs: este marcado no aporta y conviene revisarlo.', severityDefault: 'info', ruleVersion: 1 },
  { kind: 'seo.schema_self_reviews', group: 'datos_estructurados', title: 'Reseñas del propio negocio marcadas', explain: 'Google no muestra estrellas de reseñas que un negocio pone sobre sí mismo y puede considerarlo marcado engañoso.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.gsc_page_not_crawled', group: 'search_console', title: 'Página con impresiones que el rastreo no encontró', explain: 'Google la muestra en resultados pero no se llega a ella navegando por la web: puede estar huérfana, fuera del sitemap o ser antigua.', severityDefault: 'aviso', ruleVersion: 1 },
  // Parte 1, técnico completo (26 nov 2026): sobre datos que el rastreo ya guardaba.
  { kind: 'seo.robots_blocks_resources', group: 'rastreo', title: 'robots.txt bloquea a Google estilos o scripts de la web', explain: 'Google no puede descargar algunos CSS o JavaScript de la web porque robots.txt se lo prohíbe: no ve la página como un usuario y puede pensar que no está adaptada al móvil o que le falta contenido.', severityDefault: 'importante', ruleVersion: 1 },
  { kind: 'seo.sitemap_blocked', group: 'indexacion', title: 'Páginas del sitemap bloqueadas por robots.txt', explain: 'El sitemap pide a Google que rastree páginas que robots.txt le prohíbe visitar: o sobran en el sitemap o el bloqueo es un error.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.ai_crawlers_blocked', group: 'rastreo', title: 'robots.txt bloquea a rastreadores de IA', explain: 'Algunos asistentes de IA no pueden leer la web. Si son los de búsqueda (ChatGPT, Perplexity, Claude, Copilot), la web no podrá salir citada en sus respuestas. Bloquear los de entrenamiento (GPTBot, Google-Extended) es una decisión del cliente.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.page_regressed', group: 'indexacion', title: 'Página que funcionaba y ahora no', explain: 'En el rastreo anterior esta página respondía bien y se podía indexar; ahora da error o tiene noindex. Suele pasar tras un cambio en la web (plugin, migración, tema nuevo). Si no es a propósito, hay que corregirlo antes de que Google la quite.', severityDefault: 'importante', ruleVersion: 1 },
  // Parte 6 (técnico 2b, 27 nov 2026).
  { kind: 'seo.soft_404', group: 'indexacion', title: 'Páginas que dicen «no encontrada» pero responden bien', explain: 'Estas páginas muestran un «página no encontrada» pero el servidor responde 200 (todo bien). Google las trata como páginas vacías (soft 404): o se arreglan, o deben responder 404 o redirigir a la página buena.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.soft_404_site', group: 'indexacion', title: 'La web responde «todo bien» a páginas que no existen', explain: 'Pedimos una dirección inventada y la web contestó 200 o redirigió a la portada en vez de dar un 404. Google acaba indexando páginas vacías y las direcciones viejas nunca caducan. Se arregla en el servidor o en el plugin de redirecciones (una página 404 de verdad).', severityDefault: 'importante', ruleVersion: 1 },
  { kind: 'seo.staging_links', group: 'rastreo', title: 'Restos de la web de pruebas (staging)', explain: 'La web enlaza, carga archivos o declara direcciones de una copia de pruebas (staging, localhost o un dominio temporal del hosting). Pasa al publicar una web nueva sin cambiar todas las direcciones: enlaces rotos, contenido duplicado o datos que apuntan a la copia. Hay que reemplazarlas por las de la web real. (Las imágenes no se revisan.)', severityDefault: 'importante', ruleVersion: 1 },
  { kind: 'seo.internal_nofollow', group: 'enlazado', title: 'Enlaces internos con nofollow a páginas que queremos posicionar', explain: 'La web enlaza a sus propias páginas importantes con rel="nofollow": le dice a Google que no les pase fuerza. Es normal en el aviso legal, las cookies o el carrito (esas no se cuentan), pero no en páginas de servicio.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.schema_inconsistent', group: 'datos_estructurados', title: 'Teléfonos distintos en los datos estructurados', explain: 'Los datos estructurados del negocio dicen un teléfono en unas páginas y otro en otras. Google no sabe cuál es el bueno. Con una sola sede, todas las páginas deben decir el mismo.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.seo_plugins_conflict', group: 'rastreo', title: 'Dos plugins de SEO a la vez', explain: 'La web tiene activos dos plugins de SEO (por ejemplo Yoast y Rank Math): cada uno pone sus títulos, descripciones, schema y sitemap, y salen duplicados o contradictorios. Hay que dejar uno solo (pasando antes su configuración).', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.redirect_loop', group: 'rastreo', title: 'Bucle de redirecciones', explain: 'Unas URLs se redirigen entre sí y nunca llegan a una página: el navegador muestra un error y Google abandona. Hay que dejar una sola redirección al destino final.', severityDefault: 'importante', ruleVersion: 1 },
  { kind: 'seo.anchor_generic', group: 'enlazado', title: 'Página enlazada casi siempre con textos genéricos', explain: 'Casi todos los enlaces internos a esta página dicen «leer más», «aquí» o nada. Google usa el texto del enlace para entender de qué trata la página: mejor describir el destino («reformas de cocinas en Sabadell»).', severityDefault: 'info', ruleVersion: 1 },
  { kind: 'seo.hreflang_invalid', group: 'indexacion', title: 'hreflang con códigos de idioma no válidos', explain: 'Las etiquetas hreflang usan un código que Google no entiende (debe ser como «es», «ca», «es-ES» o «x-default»): Google ignora esas etiquetas.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.hreflang_not_reciprocal', group: 'indexacion', title: 'hreflang sin vuelta', explain: 'Esta página dice que tiene una versión en otro idioma, pero esa versión no la enlaza de vuelta. Google solo hace caso al par si los dos se enlazan, así que puede mostrar el idioma equivocado.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.hreflang_broken', group: 'indexacion', title: 'hreflang hacia una página que no se puede indexar', explain: 'La versión en otro idioma a la que apunta da error, redirige o tiene noindex: el par no sirve.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.lang_missing', group: 'indexacion', title: 'Páginas sin idioma declarado', explain: 'Falta el atributo de idioma en la etiqueta <html> (lang="es" o lang="ca"). Ayuda a los buscadores, los traductores y los lectores de pantalla; es imprescindible en webs con varios idiomas.', severityDefault: 'info', ruleVersion: 1 }
];

/**
 * Local sin Places (fuente «seo.local:nap»): se comprueban con el expediente, no con el rastreo, así que tienen su
 * propia fuente (la auditoría no los resuelve al no producirlos).
 */
export const LOCAL_KINDS: SaludKind[] = [
  { kind: 'seo.nap_name_mismatch', group: 'local', title: 'El nombre de la web no coincide con la ficha', explain: 'La web se presenta con otro nombre (en sus datos estructurados o en el nombre del sitio). Google une la marca, la ficha de Google y la web por el nombre: debe ser el mismo en todas partes.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.nap_phone_mismatch', group: 'local', title: 'El teléfono de la web no coincide con la ficha', explain: 'La web muestra otro teléfono principal que la ficha del cliente. Un teléfono distinto en la web, la ficha de Google y los directorios resta confianza en las búsquedas locales.', severityDefault: 'importante', ruleVersion: 1 },
  { kind: 'seo.nap_phone_missing', group: 'local', title: 'La web no muestra un teléfono enlazable', explain: 'La portada no tiene ningún enlace tel: ni teléfono en los datos estructurados: en el móvil no se puede llamar con un toque y Google no puede contrastarlo con la ficha.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.nap_address_mismatch', group: 'local', title: 'La dirección de la web no coincide con la ficha', explain: 'El código postal o la población de la web no son los de la ficha del cliente. Para Google Maps, la dirección debe ser idéntica en la web, la ficha de Google y los directorios.', severityDefault: 'importante', ruleVersion: 1 },
  { kind: 'seo.service_page_missing', group: 'local', title: 'Servicio sin página propia', explain: 'Un servicio de la ficha del cliente no tiene una página de la web dedicada (ni en la URL, ni en el título, ni en el H1). Una página por servicio es lo que más ayuda a aparecer cuando alguien busca ese servicio.', severityDefault: 'aviso', ruleVersion: 1 }
];

/** Mapa de palabras (fuente «seo.mapa:gsc», Hito 2): se calculan con el detalle de Search Console, no con el rastreo. */
export const MAPA_KINDS: SaludKind[] = [
  { kind: 'seo.cannibalization', group: 'search_console', title: 'Canibalización: dos páginas se turnan una búsqueda', explain: 'Para la misma búsqueda, Google alterna semana a semana entre dos o más páginas de la web: ninguna se consolida y las dos posicionan peor. Hay que elegir una (unir contenidos y redirigir, o diferenciar claramente cada página y enlazar a la buena).', severityDefault: 'aviso', ruleVersion: 1 },
  // Oportunidades del mapa de palabras (26 nov 2026): no son errores, son trabajo que puede traer clics.
  { kind: 'seo.topic_new_page', group: 'search_console', title: 'Búsquedas sin página: crear una nueva', explain: 'Google ya muestra la web para estas búsquedas, pero ninguna página trata el tema ni pasa de la posición 20. Una página dedicada al tema puede traer clics nuevos.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.topic_unclear_page', group: 'search_console', title: 'Búsquedas sin página clara: elegir y reforzar una', explain: 'Para estas búsquedas Google reparte las impresiones entre varias páginas y ninguna se las lleva. Hay una que ya sale en el top 20: conviene reforzarla (título, H1, contenido y enlaces internos) en vez de crear otra.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.striking_distance', group: 'search_console', title: 'Búsquedas al alcance (posición 4-15)', explain: 'La web ya sale para estas búsquedas cerca del top 3. Con poco trabajo en su página (título, H1, una sección que responda a la búsqueda y enlaces internos) pueden subir y traer bastantes más clics.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.low_ctr', group: 'search_console', title: 'Páginas con pocos clics para su posición', explain: 'La página sale en el top 10 pero recibe muchos menos clics de lo normal en esa posición: el título o la descripción no atraen. A veces es un resumen de IA de Google que responde antes; aun así, mejorar el título suele ayudar.', severityDefault: 'aviso', ruleVersion: 1 }
];

/** Vigilancia continua (SEO parte 0, 26 nov 2026): procesos programados por proyecto (lib/seo/vigilancia/). */
export const VIGILANCIA_KINDS: SaludKind[] = [
  { kind: 'seo.site_down', group: 'vigilancia', title: 'La web no responde o da error del servidor', explain: 'La portada no carga o devuelve un error 5xx: nadie puede ver la web y, si dura, Google empieza a quitar páginas del índice. Es urgente.', severityDefault: 'critico', ruleVersion: 1 },
  { kind: 'seo.home_error', group: 'vigilancia', title: 'La portada responde con error', explain: 'La portada devuelve un error 4xx (no existe o está prohibida): los visitantes y Google llegan a una página de error.', severityDefault: 'critico', ruleVersion: 1 },
  { kind: 'seo.home_noindex', group: 'vigilancia', title: 'La portada tiene «noindex»', explain: 'La portada pide a Google que no la muestre. Suele pasar al publicar una web nueva olvidando quitar la opción de WordPress «Disuadir a los motores de búsqueda». Google la quitará de los resultados.', severityDefault: 'critico', ruleVersion: 1 },
  { kind: 'seo.robots_block_all', group: 'vigilancia', title: 'robots.txt bloquea toda la web', explain: 'El robots.txt prohíbe a Google rastrear la web entera («Disallow: /»). En pocos días deja de actualizar y mostrar sus páginas.', severityDefault: 'critico', ruleVersion: 1 },
  { kind: 'seo.ssl_expiring', group: 'vigilancia', title: 'Certificado SSL caducado o a punto de caducar', explain: 'Con el certificado caducado el navegador avisa de «sitio no seguro» y casi todos los visitantes se van. Se renueva en el alojamiento.', severityDefault: 'importante', ruleVersion: 1 },
  { kind: 'seo.cwv_slow', group: 'vigilancia', title: 'Lenta para los usuarios reales (Core Web Vitals)', explain: 'Los datos reales de Chrome de los últimos 28 días suspenden alguna Core Web Vital (LCP, INP o CLS) en móvil. Afecta a la experiencia, a la conversión y un poco al posicionamiento.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.cwv_average', group: 'vigilancia', title: 'Velocidad mejorable (Core Web Vitals)', explain: 'Los datos reales de Chrome dan alguna Core Web Vital en «necesita mejorar». No es grave, pero conviene mejorarla antes de que empeore.', severityDefault: 'info', ruleVersion: 1 },
  // Parte 1: prueba de laboratorio (Lighthouse) de unas pocas páginas representativas, dentro del proceso de velocidad.
  { kind: 'seo.viewport_missing', group: 'vigilancia', title: 'Página sin adaptar al móvil (viewport)', explain: 'Falta la etiqueta meta viewport: en el móvil la página se ve en miniatura y hay que hacer zoom. Google indexa con la versión móvil, así que afecta directamente.', severityDefault: 'importante', ruleVersion: 1 },
  { kind: 'seo.mixed_content', group: 'vigilancia', title: 'Contenido mixto: recursos sin HTTPS', explain: 'La página es https pero carga imágenes, scripts u hojas de estilo por http: el navegador los bloquea o avisa de «no seguro», y la página puede verse rota.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.images_unsized', group: 'vigilancia', title: 'Imágenes sin ancho y alto', explain: 'Varias imágenes no declaran su tamaño: al cargar, el contenido salta de sitio (empeora la métrica CLS de Google y la experiencia).', severityDefault: 'info', ruleVersion: 1 },
  { kind: 'seo.images_heavy', group: 'vigilancia', title: 'Imágenes que se pueden aligerar', explain: 'La página carga imágenes más pesadas de lo necesario (sin comprimir, en formato antiguo o más grandes de lo que se muestran). Aligerarlas acelera la carga en el móvil.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.not_indexed', group: 'vigilancia', title: 'Página importante que Google no tiene indexada', explain: 'Search Console dice que esta página (de las que más clics traen o la portada) no está en el índice de Google. Hay que ver el motivo en la inspección de URL.', severityDefault: 'importante', ruleVersion: 1 },
  { kind: 'seo.page_drop', group: 'search_console', title: 'Página que pierde clics', explain: 'Esta página ha perdido una parte importante de sus clics de Google en las últimas 4 semanas frente a las 4 anteriores. Si el año pasado no pasó lo mismo, no es temporada: revisar si cambió la página, si un competidor la adelantó o si hubo una actualización de Google.', severityDefault: 'aviso', ruleVersion: 1 }
];

/** Enlaces a otras webs (fuente «seo.salud:externos»): trabajo aparte, con su propia lista para que la auditoría no los resuelva. */
export const EXTERNOS_KINDS: SaludKind[] = [
  { kind: 'seo.external_broken', group: 'enlazado', title: 'Enlace roto hacia otra web', explain: 'La web enlaza a una página de otra web que ya no existe (404/410) o a un dominio que ha dejado de existir. Al visitante le sale un error y transmite descuido: hay que quitar el enlace o cambiarlo por uno que funcione.', severityDefault: 'aviso', ruleVersion: 1 }
];

/** Posiciones (fuente «seo.posiciones:serp», parte 4): con margen para no avisar por la volatilidad semanal de Google. */
export const POSICIONES_KINDS: SaludKind[] = [
  { kind: 'seo.rank_drop', group: 'search_console', title: 'Búsqueda importante que sale del top 10', explain: 'Esta búsqueda estaba en la primera página de Google y lleva dos semanas seguidas fuera. Mirar qué página salía, si cambió, quién la ha adelantado y si coincide con una actualización de Google.', severityDefault: 'importante', ruleVersion: 1 },
  { kind: 'seo.zone_page_missing', group: 'local', title: 'Población con búsquedas y sin página propia', explain: 'Se busca su servicio en esta población (hay búsquedas o impresiones), no sale en la primera página y la web no tiene una página que hable de esa población. Una página útil y propia (trabajos hechos allí, desplazamiento, precios) puede posicionar; una copia cambiando el nombre del pueblo, no.', severityDefault: 'info', ruleVersion: 1 },
  { kind: 'seo.lost_local_pack', group: 'local', title: 'Ya no sale en el mapa de Google para esta búsqueda', explain: 'Google sigue enseñando el mapa con negocios para esta búsqueda, pero el cliente ha dejado de aparecer dos semanas seguidas. Revisar su ficha de Google (categoría, horario, reseñas recientes, si está marcada como cerrada) y quién ha entrado.', severityDefault: 'importante', ruleVersion: 1 }
];

/** Ficha de Google (fuente «seo.local:ficha», parte 5a): datos de DataForSEO comparados con lo confirmado. */
export const FICHA_KINDS: SaludKind[] = [
  { kind: 'seo.gbp_closed', group: 'local', title: 'La ficha de Google aparece cerrada', explain: 'Google enseña la ficha del cliente como cerrada (temporal o definitivamente), comprobado dos veces. Si no es verdad, el negocio pierde llamadas y visitas cada día: hay que corregirlo ya en Business Profile.', severityDefault: 'critico', ruleVersion: 1 },
  { kind: 'seo.gbp_changed', group: 'local', title: 'Ha cambiado algo de la ficha de Google', explain: 'El nombre, la categoría principal, el teléfono, la web o el horario de la ficha ya no coinciden con lo confirmado. Google y otras personas pueden editar la ficha sin avisar. Si el cambio lo hicimos nosotros, pulsa «Aceptar el cambio»; si no, revértelo en Business Profile.', severityDefault: 'importante', ruleVersion: 1 },
  { kind: 'seo.reviews_behind', group: 'local', title: 'Menos reseñas o peor nota que la competencia', explain: 'Frente a los competidores con ficha (3 o más), tiene menos de la mitad de reseñas que lo normal o una nota claramente más baja. Las reseñas pesan mucho para salir en el mapa y para que llamen.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.reviews_stalled', group: 'local', title: 'No entran reseñas nuevas', explain: 'En los últimos 60 días no ha subido el número de reseñas. Google valora que lleguen reseñas de forma constante: conviene pedirlas a los clientes con el enlace directo.', severityDefault: 'aviso', ruleVersion: 1 }
];

/** Mapa por zonas (fuente «seo.local:geogrid», parte 5b). */
export const GEOGRID_KINDS: SaludKind[] = [
  { kind: 'seo.geogrid_weak', group: 'local', title: 'Sale poco en el mapa de su zona', explain: 'En menos del 30 % de los puntos de la cuadrícula alrededor del negocio sale entre los 3 primeros del mapa para su búsqueda principal. El top 3 del mapa es donde se llevan casi todas las llamadas.', severityDefault: 'aviso', ruleVersion: 1 },
  { kind: 'seo.geogrid_drop', group: 'local', title: 'Ha bajado en el mapa por zonas', explain: 'Frente a la medición anterior (mismos puntos y búsqueda), la media de puesto ha empeorado 3 o más y al menos 8 puntos han bajado 3 puestos o más.', severityDefault: 'importante', ruleVersion: 1 },
  { kind: 'seo.maps_spam', group: 'local', title: 'Competidor con nombre sospechoso en el mapa', explain: 'Un competidor que sale en el top 3 en muchos puntos tiene un nombre que parece relleno de palabras clave (Google lo prohíbe: el nombre debe ser el real del negocio). Se puede sugerir la edición a Google; si su rótulo real es así, descártalo.', severityDefault: 'info', ruleVersion: 1 }
];

/** Parte 6 (6b): páginas de dinero («seo.vigilancia:dinero»). */
export const DINERO_FINDING_KINDS: SaludKind[] = [
  { kind: 'seo.money_page_changed', group: 'vigilancia', title: 'Una página importante ha cambiado a peor', explain: 'Una de las páginas que más importan (portada, las de más clics, las fijadas o las de un encargo en curso) estaba bien y ahora no: dejó de responder, tiene noindex, su canonical apunta a otra, se quedó sin título o H1, o perdió más de la mitad del texto. Se ha confirmado dos veces (30 min). Si el cambio es a propósito, «Dejar así» lo acepta como la nueva referencia.', severityDefault: 'importante', ruleVersion: 1 },
  { kind: 'seo.money_pages_unreadable', group: 'vigilancia', title: 'No podemos leer las páginas importantes', explain: 'Llevamos varias pasadas sin poder leer ninguna de las páginas vigiladas (la web nos bloquea o tarda demasiado). Mientras dure, no podemos avisar si cambian. Suele ser un cortafuegos o un plugin de seguridad: hay que permitir nuestro robot.', severityDefault: 'info', ruleVersion: 1 }
];

/** Parte 6: señales de web hackeada («seo.vigilancia:hackeo», en los detectores semanales). */
export const HACKEO_FINDING_KINDS: SaludKind[] = [
  { kind: 'seo.hacked_queries', group: 'search_console', title: 'Búsquedas basura nuevas en Search Console (posible hackeo)', explain: 'Han empezado a salir búsquedas de fármacos, réplicas, apuestas o en japonés o chino que nada tienen que ver con el negocio. Es la señal típica de una web hackeada que publica páginas basura (a veces solo visibles para Google). Si sus páginas no son de la web, es urgente: limpiar, cambiar contraseñas, actualizar y pedir la revisión en Search Console.', severityDefault: 'critico', ruleVersion: 1 },
  { kind: 'seo.hacked_pages', group: 'search_console', title: 'Páginas basura en la web (posible hackeo)', explain: 'Google muestra (o el rastreo encontró) páginas con direcciones o títulos de fármacos, réplicas, apuestas o en japonés o chino. Casi siempre es un hackeo: hay que limpiar la web, quitar esas páginas y pedir la revisión en Search Console.', severityDefault: 'critico', ruleVersion: 1 }
];

/** Parte 5c: teléfonos antiguos publicados («seo.local:nap_antiguo») y páginas puerta («seo.salud:puertas»), cada una con su fuente. */
export const NAP_ANTIGUO_KINDS: SaludKind[] = [
  { kind: 'seo.old_nap_found', group: 'local', title: 'Un teléfono antiguo sigue publicado en otras webs', explain: 'Un teléfono que ya no es el del negocio aparece en directorios u otras webs: quien llame a ese número no le encontrará. Hay que pedir la corrección en cada web (o editar la ficha si es suya).', severityDefault: 'aviso', ruleVersion: 1 }
];
export const PUERTAS_KINDS: SaludKind[] = [
  { kind: 'seo.doorway_pages', group: 'contenido', title: 'Páginas puerta: la misma página cambiando la población', explain: 'Hay 3 o más páginas casi idénticas que solo cambian el nombre de la población. Google las considera páginas puerta y puede penalizar la web entera. Mejor una sola página bien hecha, o páginas de zona con contenido propio y útil de cada sitio.', severityDefault: 'importante', ruleVersion: 1 }
];

export const SEO_KINDS: SaludKind[] = [...SALUD_KINDS, ...LOCAL_KINDS, ...MAPA_KINDS, ...VIGILANCIA_KINDS, ...EXTERNOS_KINDS, ...POSICIONES_KINDS, ...FICHA_KINDS, ...GEOGRID_KINDS, ...NAP_ANTIGUO_KINDS, ...PUERTAS_KINDS, ...HACKEO_FINDING_KINDS, ...DINERO_FINDING_KINDS];
export const SALUD_KIND_BY_KEY = new Map(SEO_KINDS.map((k) => [k.kind, k]));
