// SEO · Salud técnica: los tipos de hallazgo (Hito 1, 23 nov 2026). Sin imports: lo usan también las pantallas.

export type Severity = 'info' | 'aviso' | 'importante' | 'critico';
export type SaludKind = { kind: string; title: string; explain: string; severityDefault: Severity; ruleVersion: number; group: SaludGroup };
export type SaludGroup = 'rastreo' | 'indexacion' | 'contenido' | 'enlazado' | 'datos_estructurados' | 'search_console' | 'local';

export const SALUD_GROUP_LABEL: Record<SaludGroup, string> = {
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
  { kind: 'seo.gsc_page_not_crawled', group: 'search_console', title: 'Página con impresiones que el rastreo no encontró', explain: 'Google la muestra en resultados pero no se llega a ella navegando por la web: puede estar huérfana, fuera del sitemap o ser antigua.', severityDefault: 'aviso', ruleVersion: 1 }
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

export const SEO_KINDS: SaludKind[] = [...SALUD_KINDS, ...LOCAL_KINDS, ...MAPA_KINDS];
export const SALUD_KIND_BY_KEY = new Map(SEO_KINDS.map((k) => [k.kind, k]));
