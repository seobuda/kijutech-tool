-- ============================================================
-- KNOWLEDGE CARDS — Módulo SEO Kijutech
-- Etapas: onboarding, kickoff, audit
-- Ejecutar dentro del contenedor:
--   docker exec -i kijutech_db psql -U kijutech -d kijutech_db < seed-knowledge-cards.sql
-- Idempotente: borra las cards existentes de estas 3 etapas y las reinserта limpias
-- ============================================================

BEGIN;

-- Limpia las cards existentes de las 3 etapas para reinserción limpia
DELETE FROM seo_knowledge_cards WHERE stage_key IN ('onboarding', 'kickoff', 'audit');

-- ============================================================
-- ETAPA 0 — ONBOARDING Y MEDICIÓN
-- ============================================================

INSERT INTO seo_knowledge_cards (id, stage_key, "order", title, content, card_type, context_key) VALUES

(gen_random_uuid(), 'onboarding', 1, '¿Por qué medimos antes de actuar?',
'Antes de tocar nada en el proyecto, necesitamos una foto del punto de partida. Sin datos iniciales no podremos demostrar el progreso al cliente más adelante.

**La regla de oro:** si no está medido, no existe. Cualquier mejora que no podamos comparar con una línea base es invisible para el cliente y para nosotros.',
'concept', NULL),

(gen_random_uuid(), 'onboarding', 2, 'Google Search Console — qué confirmar',
'Antes de marcar GSC como listo, verifica que:

- El dominio **correcto** está verificado (con www y sin www si aplica)
- Hay al menos **28 días de datos** disponibles
- No aparecen errores críticos de cobertura en el informe de páginas
- El sitemap está enviado y procesado

Sin estos datos no podrás hacer una comparativa de posiciones inicial.',
'tip', 'gsc_verificado'),

(gen_random_uuid(), 'onboarding', 3, 'Google Analytics 4 — puntos críticos',
'GA4 es más complejo de configurar que Universal Analytics. Confirma:

- Los eventos de conversión **relevantes para el negocio** están marcados como conversiones (llamadas, formularios, ventas)
- El filtro de tráfico interno (IP de la oficina) está activo
- Si hay e-commerce, el módulo está activado y reportando transacciones

Un GA4 mal configurado te dará datos incorrectos durante todo el proyecto.',
'warning', 'ga4_configurado'),

(gen_random_uuid(), 'onboarding', 4, 'SE Ranking — configuración inicial',
'Al añadir el dominio en SE Ranking:

- Añade el dominio **con y sin www** para capturar todo el tráfico
- Configura el **país y ciudad** correctos donde quiere posicionarse el cliente
- Añade el motor de búsqueda relevante (Google.es para España)
- Importa las keywords iniciales si ya tienes alguna pista del cliente

El primer rastreo puede tardar 24h — mejor configurarlo el primer día.',
'tip', 'se_ranking_creado'),

(gen_random_uuid(), 'onboarding', 5, 'Google Business Profile — cuándo aplica',
'GBP es imprescindible para negocios con presencia física o que atienden a clientes en una zona geográfica concreta.

**No aplica si:** el cliente es un e-commerce puro sin tienda física o no quiere recibir clientes en su ubicación.

Si aplica: verifica que la ficha esté **reclamada por el cliente** (no por una agencia anterior), que el nombre, dirección y teléfono coincidan exactamente con los del sitio web, y que tenga al menos algunas reseñas.',
'concept', 'gbp_reclamado'),

(gen_random_uuid(), 'onboarding', 6, '¿Tienes dudas sobre qué herramienta usar?',
'Si tienes dudas sobre cómo configurar alguna de estas herramientas o qué datos mirar primero, puedes consultarlo directamente con el Tutor.

Pregúntale cosas como: *"¿Cómo verifico un dominio en GSC?"* o *"¿Qué conversiones debo activar en GA4 para un negocio de servicios locales?"*',
'tutor_reminder', NULL);

-- ============================================================
-- ETAPA 1 — KICKOFF
-- ============================================================

INSERT INTO seo_knowledge_cards (id, stage_key, "order", title, content, card_type, context_key) VALUES

(gen_random_uuid(), 'kickoff', 1, 'El objetivo del Kickoff',
'El Kickoff no es una reunión de presentación — es una sesión de extracción de información estratégica. Las respuestas que obtengas aquí definirán toda la estrategia de keywords, contenidos y prioridades del proyecto.

**Consejo:** haz el Kickoff con el dueño del negocio, no con el responsable de marketing. El dueño sabe qué margen deja cada servicio; el de marketing, no siempre.',
'concept', NULL),

(gen_random_uuid(), 'kickoff', 2, 'Servicio rentable — por qué es la primera pregunta',
'No todos los servicios de un cliente merecen el mismo esfuerzo SEO. Posicionar palabras clave de servicios con margen bajo es trabajo que no se rentabiliza.

**Cómo profundizar:** si el cliente menciona varios servicios, pregunta cuál tiene mejor margen, no cuál vende más. Volumen y rentabilidad raramente coinciden.

Ejemplo: una clínica dental puede vender muchas limpiezas (bajo margen) pero vivir de los implantes (alto margen). La estrategia SEO debe apuntar a implantes.',
'tip', 'servicio_rentable'),

(gen_random_uuid(), 'kickoff', 3, 'Cliente no deseado — filtrar desde el SEO',
'Esta pregunta parece extraña pero es muy útil: si el cliente sabe qué perfil de cliente le hace perder tiempo o dinero, podemos evitar posicionar keywords que atraigan ese perfil.

**Ejemplo práctico:** un abogado que no quiere casos de accidentes de tráfico porque son muy costosos de llevar — evitamos keywords como "abogado accidente tráfico" aunque tengan volumen.',
'tip', 'cliente_no_deseado'),

(gen_random_uuid(), 'kickoff', 4, 'Zona geográfica — el error más común',
'El error más frecuente es asumir que el cliente quiere posicionarse en toda España cuando en realidad solo puede atender clientes en un radio de 50km.

**Preguntas de seguimiento útiles:**
- ¿Atiendes clientes de forma presencial o también online?
- ¿Tienes capacidad para gestionar clientes de otras provincias?
- ¿Hay zonas donde ya tienes clientes y zonas donde quieres crecer?

La respuesta define si hacemos SEO local, regional o nacional.',
'warning', 'zona_geografica'),

(gen_random_uuid(), 'kickoff', 5, 'Competidores directos — cómo usarlos',
'Los competidores que menciona el cliente son un punto de partida, no la lista definitiva. El cliente conoce a sus competidores comerciales, pero no necesariamente a sus competidores SEO (que pueden ser directorios, medios o agregadores).

**Qué hacer con esta información:**
- Analiza sus dominios en SE Ranking para ver qué keywords les funcionan
- Identifica su estructura de contenidos
- Busca huecos que ellos no cubren y tú sí puedes cubrir',
'concept', 'competidores_directos'),

(gen_random_uuid(), 'kickoff', 6, 'Posicionamiento de competidores — el argumento de venta',
'Esta información es muy poderosa para el cliente: ver en qué posiciones están sus competidores con keywords concretas mientras ellos todavía no aparecen en el mapa.

**Cómo presentarlo:** captura de pantalla de SE Ranking con las posiciones de los competidores vs. el cliente (sin posición o en página 5+). Es el argumento visual más efectivo para que el cliente entienda el punto de partida real.',
'tip', 'competidores_posicionamiento'),

(gen_random_uuid(), 'kickoff', 7, 'Estrategia previa — aprender de lo que ya se hizo',
'Si el cliente ha trabajado con otra agencia antes, hay información valiosa que extraer:

**Preguntas clave:**
- ¿Tienes acceso a los informes de la agencia anterior?
- ¿Sabes qué keywords intentaban posicionar?
- ¿Hubo alguna penalización o caída de tráfico brusca?
- ¿Por qué cambiaste de agencia?

Una caída brusca de tráfico en el pasado puede indicar una penalización manual de Google que hay que resolver antes de empezar.',
'warning', 'estrategia_previa'),

(gen_random_uuid(), 'kickoff', 8, 'Redes sociales — su rol en la estrategia SEO',
'Las redes sociales no posicionan directamente en Google, pero tienen un efecto indirecto importante: generan tráfico de marca, señales sociales y potenciales backlinks.

**Lo que nos importa saber:**
- ¿Hay contenido publicado regularmente? (indica que alguien produce contenido, recurso aprovechable)
- ¿Tienen comunidad activa? (potencial de amplificación de contenidos)
- ¿El cliente puede/quiere invertir tiempo en redes? (condiciona la estrategia de contenidos)',
'concept', 'redes_sociales');

-- ============================================================
-- ETAPA 2 — RADIOGRAFÍA INICIAL
-- ============================================================

INSERT INTO seo_knowledge_cards (id, stage_key, "order", title, content, card_type, context_key) VALUES

-- Cards genéricas de la etapa (context_key = NULL)
(gen_random_uuid(), 'audit', 1, 'Cómo usar la Radiografía Inicial',
'La Radiografía es una foto técnica del estado actual del sitio. No es un informe para el cliente — es tu diagnóstico interno para saber por dónde empezar.

**Criterio para valorar cada punto:**
- **Bien:** no requiere acción inmediata
- **Mejorable:** hay que corregirlo, pero no es urgente
- **Crítico:** bloquea el posicionamiento y hay que resolverlo antes de cualquier otra acción',
'concept', NULL),

(gen_random_uuid(), 'audit', 2, 'El orden de prioridad en la auditoría',
'No todos los problemas tienen el mismo impacto. El orden correcto de resolución es:

1. **Técnico crítico** — si Google no puede rastrear e indexar bien el sitio, nada más importa
2. **Rendimiento** — Core Web Vitals son factor de ranking confirmado desde 2021
3. **Contenido** — thin content y duplicados diluyen la autoridad del dominio
4. **Autoridad** — backlinks tóxicos pueden pesar como ancla
5. **Local** — solo si el negocio es local

Resuelve en este orden, no por lo que le resulte más visible al cliente.',
'tip', NULL),

-- Área TÉCNICO
(gen_random_uuid(), 'audit', 3, 'Titles — el factor on-page más importante',
'El title tag sigue siendo el factor on-page con más peso en el ranking. Problemas habituales:

- **Duplicados:** dos páginas con el mismo title compiten entre sí
- **Demasiado largos:** Google los trunca por encima de ~60 caracteres
- **Sin keyword principal:** el title no incluye la keyword objetivo de la página
- **Genéricos:** "Inicio", "Página 1", títulos del CMS sin editar

Herramienta para revisarlo rápido: Screaming Frog en modo free (hasta 500 URLs).',
'tip', 'titles'),

(gen_random_uuid(), 'audit', 4, 'Meta descriptions — su impacto real',
'Las meta descriptions **no son factor de ranking directo**, pero sí afectan al CTR (% de clics en los resultados). Una meta description bien escrita puede aumentar el tráfico sin mejorar posiciones.

**Lo que hay que revisar:**
- Que existan (Google puede generar las suyas si no hay, y suelen ser peores)
- Que no estén duplicadas
- Que incluyan un llamado a la acción claro
- Longitud óptima: 150-160 caracteres',
'concept', 'meta_descriptions'),

(gen_random_uuid(), 'audit', 5, 'H1 — una por página, sin excepciones',
'Cada página debe tener exactamente un H1, y debe contener la keyword principal de esa página.

**Errores frecuentes en WordPress:**
- El nombre del sitio aparece como H1 en todas las páginas
- El H1 y el title son exactamente iguales (no es obligatorio que sean distintos, pero es una oportunidad perdida)
- Páginas sin H1 o con varios H1 (algunos temas usan H1 para elementos decorativos)',
'warning', 'h1'),

(gen_random_uuid(), 'audit', 6, 'Errores 404 — cómo identificarlos y priorizarlos',
'No todos los 404 son igual de graves. Prioriza así:

- **Críticos:** páginas que antes tenían tráfico o backlinks y ahora dan 404
- **Importantes:** páginas enlazadas desde el menú o desde otras páginas internas
- **Ignorables:** URLs aleatorias sin historial ni enlaces

Herramienta: Google Search Console → Cobertura → Excluidas → No encontrada (404).
Para cada 404 crítico: redireccionamiento 301 a la página más relevante.',
'tip', 'errores_404'),

(gen_random_uuid(), 'audit', 7, 'Canonical — evitar el contenido duplicado técnico',
'La etiqueta canonical le dice a Google qué versión de una URL es la "oficial". Sin ella, Google puede indexar múltiples versiones de la misma página y dividir su autoridad.

**Casos habituales que generan duplicados sin canonical:**
- `http` vs `https`
- `www` vs sin `www`
- URLs con y sin barra final (`/servicios` vs `/servicios/`)
- Parámetros de URL de filtros o paginación

Revisa que todas las versiones no canónicas redirigen a la versión correcta.',
'concept', 'canonical'),

(gen_random_uuid(), 'audit', 8, 'Indexación — robots.txt y noindex',
'Antes de cualquier trabajo de contenidos, confirma que Google puede indexar lo que debe indexar.

**Qué revisar:**
- `robots.txt` no bloquea carpetas importantes (error clásico en staging que se sube a producción)
- No hay páginas con `noindex` accidentales (páginas de servicios, categorías importantes)
- En GSC: informe de Cobertura → páginas excluidas por noindex

Un solo `Disallow: /` en robots.txt bloquea todo el sitio — lo hemos visto.',
'warning', 'indexacion'),

(gen_random_uuid(), 'audit', 9, 'Sitemap XML — su función real',
'El sitemap no garantiza el indexado, pero sí facilita que Google descubra todas las URLs del sitio, especialmente las que no tienen muchos enlaces internos.

**Qué debe incluir un buen sitemap:**
- Solo páginas indexables (sin noindex, sin 404, sin redirecciones)
- Prioridades y frecuencias de actualización realistas
- Enviado y procesado en GSC (verificar que no da errores)

En WordPress: el plugin Yoast o Rank Math lo generan automáticamente. Verificar que no incluye páginas de etiquetas o autores sin contenido.',
'tip', 'sitemap'),

(gen_random_uuid(), 'audit', 10, 'Estructura de URLs — legible y predecible',
'Las URLs deben describir el contenido de la página de forma clara y concisa.

**URLs bien estructuradas:**
- `dominio.com/servicios/reformas-banos` ✓
- `dominio.com/?p=1423` ✗
- `dominio.com/es/inicio/servicios/cat1/sub/reformas-banos-modernos-2024` ✗ (demasiado profunda)

**Reglas básicas:**
- Sin mayúsculas, sin acentos, sin caracteres especiales
- Separador de palabras: guion medio (`-`), nunca guion bajo (`_`)
- Máximo 3-4 niveles de profundidad',
'concept', 'estructura_urls'),

-- Área RENDIMIENTO
(gen_random_uuid(), 'audit', 11, 'Core Web Vitals — los 3 indicadores que miden Google',
'Desde 2021, los Core Web Vitals son factor de ranking confirmado. Los tres indicadores son:

- **LCP (Largest Contentful Paint):** tiempo que tarda en cargar el elemento más grande visible. Objetivo: < 2.5s
- **CLS (Cumulative Layout Shift):** estabilidad visual — que los elementos no salten al cargar. Objetivo: < 0.1
- **INP (Interaction to Next Paint):** respuesta a la interacción del usuario. Objetivo: < 200ms

Herramienta: PageSpeed Insights (datos de campo reales, no solo laboratorio).',
'concept', 'core_web_vitals'),

(gen_random_uuid(), 'audit', 12, 'Velocidad móvil — la prioridad real',
'Google usa **mobile-first indexing** desde 2019: indexa y rankea basándose en la versión móvil del sitio, no en la de escritorio.

Un sitio rápido en escritorio y lento en móvil tiene el problema donde más importa.

**Puntuación mínima aceptable en PageSpeed Insights (móvil):** 50+. Por debajo de 40 es problemático. Por encima de 80 es bueno.

Las imágenes sin optimizar y el JavaScript bloqueante son las causas más frecuentes de lentitud móvil.',
'warning', 'velocidad_movil'),

(gen_random_uuid(), 'audit', 13, 'Velocidad escritorio — contexto',
'La velocidad de escritorio suele ser significativamente mejor que la móvil en la mayoría de sitios. Si hay problemas graves en escritorio, en móvil serán peores.

Usa la puntuación de escritorio como referencia, pero no te quedes solo con ella — el dato que importa para el ranking es el móvil.',
'tip', 'velocidad_escritorio'),

(gen_random_uuid(), 'audit', 14, 'Imágenes — el problema más fácil de resolver con más impacto',
'Las imágenes sin optimizar son la causa número uno de sitios lentos. Problemas habituales:

- Imágenes en formato JPG/PNG en vez de WebP (30-50% más ligeras)
- Imágenes subidas a 3000px de ancho cuando se muestran a 800px
- Sin atributo `alt` (problema de accesibilidad y SEO)
- Sin lazy loading (cargando imágenes que el usuario no va a ver)

En WordPress: plugins como Imagify o ShortPixel optimizan automáticamente.',
'tip', 'imagenes_optimizadas'),

(gen_random_uuid(), 'audit', 15, 'Caché — configuración básica',
'Una caché bien configurada puede reducir el tiempo de carga a la mitad para visitantes recurrentes.

**Tipos de caché relevantes:**
- **Caché del navegador:** archivos estáticos (CSS, JS, imágenes) se guardan localmente
- **Caché del servidor:** páginas HTML pre-generadas en vez de calculadas en cada visita
- **CDN:** distribución geográfica de assets estáticos

En WordPress: WP Rocket o W3 Total Cache. En sitios estáticos o con hosting gestionado: suele estar incluida.',
'concept', 'cache'),

-- Área CONTENIDO
(gen_random_uuid(), 'audit', 16, 'Thin content — páginas que hacen daño',
'El thin content son páginas con poco o ningún contenido de valor. Google las penaliza porque no responden bien a las búsquedas de los usuarios.

**Páginas habituales con thin content:**
- Páginas de etiquetas de WordPress con 1-2 posts
- Páginas de archivo por fecha
- Páginas de categorías sin descripción
- Fichas de productos con solo el nombre y el precio

**Solución:** o enriqueces el contenido o aplicas `noindex` para que no se indexen.',
'warning', 'thin_content'),

(gen_random_uuid(), 'audit', 17, 'Contenido duplicado — interno y externo',
'El contenido duplicado diluye la autoridad. Hay dos tipos:

**Interno:** dos páginas del mismo sitio con contenido muy similar o idéntico. Frecuente en e-commerce con variantes de producto o en sitios con versiones en varios idiomas mal configuradas.

**Externo:** el mismo contenido aparece en otro sitio (sindicación sin canonical, copias, scraping).

Herramienta para detectarlo internamente: Screaming Frog. Para duplicados externos: Copyscape.',
'concept', 'contenido_duplicado'),

(gen_random_uuid(), 'audit', 18, 'Keyword stuffing — un problema del pasado que algunos siguen haciendo',
'El keyword stuffing es repetir la misma keyword de forma artificial y excesiva en un texto. Google lo detecta y penaliza.

**Cómo identificarlo:** lee el texto en voz alta. Si suena forzado o repetitivo, probablemente hay keyword stuffing.

**Densidad de keyword razonable:** 1-2% del texto total. Si aparece más de una vez por cada 100 palabras de forma sistemática, hay un problema.',
'warning', 'keyword_stuffing'),

(gen_random_uuid(), 'audit', 19, 'Páginas sin texto relevante',
'Hay páginas que visualmente parecen completas pero que desde el punto de vista del texto indexable están casi vacías:

- Páginas construidas con imágenes donde el texto está dentro de la imagen (no indexable)
- Páginas con sliders y poco texto
- Páginas con contenido cargado vía JavaScript que Google no renderiza bien
- Páginas de contacto o legal sin contenido real (normal, pero hay que aplicar noindex)

Herramienta: ver el código fuente de la página y buscar texto real en el HTML.',
'tip', 'paginas_sin_texto'),

(gen_random_uuid(), 'audit', 20, 'Blog — su impacto en la estrategia SEO',
'Un blog activo con contenido relevante es uno de los activos SEO más potentes a largo plazo. Permite posicionar keywords informacionales y construir autoridad temática.

**Señales de un blog problemático:**
- Último post publicado hace más de 6 meses (señal de abandono)
- Posts muy cortos (< 500 palabras) sin valor real
- Sin estructura (sin H2, sin listas, sin imágenes)
- Temáticas dispersas sin relación con el negocio

Si el blog está abandonado, mejor aplicar noindex a los posts viejos de baja calidad que dejarlos indexados.',
'concept', 'blog_activo'),

-- Área AUTORIDAD
(gen_random_uuid(), 'audit', 21, 'Perfil de backlinks — qué buscar',
'Los backlinks son votos de confianza de otros sitios. La calidad importa mucho más que la cantidad.

**Métricas a revisar en SE Ranking o Ahrefs:**
- **Domain Rating / Authority Score:** autoridad global del dominio (0-100)
- **Número de dominios de referencia:** cuántos sitios distintos enlazan (más importante que el total de backlinks)
- **Ratio follow/nofollow:** los nofollow transmiten menos autoridad
- **Relevancia temática:** backlinks de sitios del mismo sector valen más',
'concept', 'perfil_backlinks'),

(gen_random_uuid(), 'audit', 22, 'Backlinks tóxicos — cuándo actuar',
'No todos los backlinks malos merecen la misma atención. Actúa solo si:

- Hay una penalización manual activa en GSC (lo verías en Acciones manuales)
- El perfil tiene una proporción anómala de backlinks spam (> 30-40% de dominios con spam score alto)
- Hay un patrón claro de manipulación de enlaces (anchor text exacto repetido masivamente)

**Herramienta de desautorización:** Google Disavow Tool. Úsala con criterio — desautorizar backlinks buenos por error hace daño.',
'warning', 'backlinks_toxicos'),

(gen_random_uuid(), 'audit', 23, 'Anchor text — diversidad natural',
'El anchor text es el texto visible del enlace. Un perfil de anchor text natural tiene diversidad:

- Nombre de marca: 40-50%
- URL desnuda (dominio.com): 20-30%
- Texto genérico ("clic aquí", "ver más"): 10-15%
- Keyword exacta: 5-10% máximo

Un perfil con 80% de anchor text de keyword exacta es una señal de manipulación que Google penaliza.',
'concept', 'anchor_text'),

(gen_random_uuid(), 'audit', 24, 'Domain Rating — cómo interpretarlo',
'El Domain Rating (DR en Ahrefs) o Authority Score (en SEMrush/SE Ranking) es una métrica propia de cada herramienta, no un dato oficial de Google.

**Cómo usarlo:**
- Como referencia comparativa con los competidores, no como métrica absoluta
- Un DR de 20 puede ser perfectamente competitivo en nichos locales
- Un DR de 60+ es necesario para competir en nichos muy competidos a nivel nacional

**No optimices para subir el DR** — optimiza para conseguir backlinks de calidad y el DR subirá como consecuencia.',
'tip', 'domain_rating'),

-- Área LOCAL
(gen_random_uuid(), 'audit', 25, 'Google Business Profile — la ficha más importante del SEO local',
'GBP es el factor más influyente en el posicionamiento local (resultados del mapa de Google).

**Qué verificar en la auditoría:**
- La ficha está verificada y activa (no suspendida)
- Nombre, dirección y teléfono son exactamente iguales a los del sitio web
- La categoría principal es la más relevante para el negocio
- Hay fotos actualizadas (mínimo 10, idealmente 30+)
- Las reseñas tienen respuesta del negocio',
'concept', 'google_business_profile'),

(gen_random_uuid(), 'audit', 26, 'NAP — consistencia en todas partes',
'NAP son las siglas de Name, Address, Phone (Nombre, Dirección, Teléfono). La consistencia del NAP en todas las menciones online es un factor de ranking local.

**Dónde revisar la consistencia:**
- Sitio web (footer, página de contacto)
- Google Business Profile
- Directorios (Páginas Amarillas, Yelp, TripAdvisor si aplica)
- Redes sociales

Una dirección escrita de forma diferente en cada sitio (Calle vs C/, nº vs número) confunde a Google y perjudica el posicionamiento local.',
'warning', 'nap_consistente'),

(gen_random_uuid(), 'audit', 27, 'Reseñas — su impacto en el ranking local',
'Las reseñas de Google son el segundo factor más importante en SEO local, después de la relevancia de GBP.

**Lo que importa:**
- **Cantidad:** más reseñas que los competidores directos
- **Puntuación media:** por encima de 4.0 idealmente 4.5+
- **Frecuencia:** reseñas recientes puntúan más que un volumen antiguo
- **Respuestas:** responder a todas las reseñas (positivas y negativas) es señal de negocio activo

**Estrategia básica:** pedir la reseña en el momento de mayor satisfacción del cliente (entrega del proyecto, fin del servicio).',
'tip', 'resenas'),

(gen_random_uuid(), 'audit', 28, 'Citas locales — menciones que construyen autoridad local',
'Las citas locales son menciones del negocio (NAP) en directorios, medios locales y sitios de referencia del sector.

**Directorios relevantes en España:**
- Páginas Amarillas
- Yelp
- Hotfrog
- Einforma (para empresas)
- Directorios sectoriales específicos (colegios profesionales, asociaciones, etc.)

**Regla:** mejor pocas citas con NAP correcto que muchas con datos inconsistentes. La calidad del directorio también importa — un directorio spam hace más daño que bien.',
'tip', 'citas_locales');

COMMIT;

-- Verificación rápida al final
SELECT stage_key, COUNT(*) as total_cards
FROM seo_knowledge_cards
GROUP BY stage_key
ORDER BY stage_key;
