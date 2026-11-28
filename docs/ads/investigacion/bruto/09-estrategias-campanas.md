# 09 — Estrategias y técnicas de campañas Google Ads (2025-2026)

Investigación del 28 nov 2026. Leyenda de fiabilidad usada en todo el documento:
**[DOC]** = documentado en ayuda oficial de Google (leído en esta sesión); **[EXP]** = opinión o estudio de experto/herramienta
(con sesgo posible); **[ANEC]** = anécdota o caso aislado; **[NV]** = no verificado (recuerdo de práctica común o dato leído solo
en resumen de búsqueda). Nota de método: varias páginas de Search Engine Land bloquearon la lectura directa (HTTP 403), así que
lo que cito de ellas viene del resumen del buscador y va marcado [EXP]/[NV].

## Resumen (lo esencial)

1. **Google empuja consolidación**: grupos temáticos (no SKAG), una sola concordancia amplia + Smart Bidding, sin segmentar por
   dispositivo [DOC support.google.com/google-ads/answer/14752782]. Los expertos aceptan la consolidación pero piden mantener
   control (marca / no marca / competidores separados, negativas, exactas «de seguridad») [EXP].
2. **Cambio importante desde el 17 ago 2026**: las estrategias con objetivo (tCPA/tROAS) en campañas «limitadas por presupuesto»
   ahora apuntan de forma más consistente al objetivo aunque bajes el presupuesto; una campaña que iba mejor que su objetivo
   tenderá a gastar y rendir *igual al objetivo* (más volumen, menos eficiencia) [DOC support.google.com/google-ads/answer/17061251].
   Cualquier alerta de «CPL sube» debe contemplar esto como causa.
3. **Cambiar presupuesto u objetivo NO dispara «Learning»**; sí lo disparan: estrategia nueva, añadir/quitar campañas o grupos de
   una cartera, o cambiar de forma significativa las acciones de conversión optimizadas. Dura ≤7 días, y converger lleva 1-2 ciclos
   de conversión [DOC .../answer/13020501]. Evaluar sobre el mayor de 2 ciclos de conversión o 2 semanas [DOC .../answer/6268633].
4. **Presupuesto**: gasto diario hasta 2× el medio, límite mensual 30,4×; desde el 1 jun 2026 el pacing con programación de
   anuncios intenta gastar hasta ese límite mensual aunque haya días apagados [DOC .../answer/2375423 y .../answer/16913225].
5. **PMax para leads**: funciona solo con medición limpia (objetivos de lead cualificado, reCAPTCHA, preguntas de cualificación,
   validación de servidor, exclusiones de marca, negativas a nivel cuenta/campaña, apagar expansión de URL si falla). No hay
   «search-only PMax» oficial; las palancas son indirectas [DOC .../answer/13775965].
6. **AI Max for Search** es una capa dentro de Search (coincidencia de términos + personalización de texto + expansión de URL).
   Es ineficaz si la campaña está limitada por presupuesto, ignora los títulos fijados con expansión de URL activa, y tiene
   controles de marca, URL y «text guidelines» [DOC .../answer/15910187]. Pruebas independientes: resultados mixtos [ANEC/EXP].
7. **RSA**: «Ad strength» es una guía de buenas prácticas, no un predictor demostrado; fijado parcial parece mejor que
   ninguno o total [EXP Optmyzr, SEJ]. Google sigue recomendando «Excelente» (cita +6 % conversiones de media) [DOC].
8. **Competencia**: la puja por marcas ajenas es legal en general pero con Nivel de calidad bajo y riesgo de reclamación; va en
   campaña propia, sin la marca ajena en el texto [EXP].
9. **LSA/PMax pago por lead** (migración de Local Services Ads): solo EE. UU. por ahora [DOC .../answer/17325249]; en España no
   aplica en 2026 (NV: calendario de 2027 para fuera de EE. UU. según ppc.land).
10. Hay varias **trampas de umbral**: Google no publica un mínimo numérico de conversiones para tCPA/Maximizar conversiones; solo
    15 conversiones/30 días para tROAS en el PDF de buenas prácticas [NV], 50 conversiones en Demand Gen [DOC]. Los «30/50
    conversiones al mes» de los blogs son heurística, no regla oficial.

---

## 1. Estructura de cuenta

### 1.1 Evolución histórica
- **SKAG (single keyword ad group)**: popular 2014-2019 para controlar anuncio/landing por palabra exacta. **Obsoleto** desde que
  las variantes cercanas y el Smart Bidding por subasta hacen que cada grupo de un solo término fragmente los datos. Google ahora
  dice textualmente: «Move single-keyword ad groups into themed ad groups» y que la segmentación de un solo objetivo hace que
  Smart Bidding optimice cada objetivo por separado [DOC support.google.com/google-ads/answer/14752782].
- **STAG (single theme ad group)**: 5-20 palabras de un mismo tema/intención por grupo; el estándar «intermedio» 2019-2023 [EXP].
- **Hagakure** (Brad Geddes/Hagakure de Google/Optmyzr, 2019): pocos campañas, grupos muy amplios, concordancias mezcladas, confiar
  en el Smart Bidding. No encontré en esta búsqueda una fuente primaria actual que use el término; la idea está absorbida en la
  recomendación oficial de consolidación [NV sobre el término].
- **Consolidación 2025-2026**: Google insiste en estructuras sencillas y agrupadas; un portavoz matizó que consolidar no es el
  objetivo en sí sino rendir igual o mejor con menos granularidad [EXP SEJ: searchenginejournal.com/google-clarifies-its-stance-on-campaign-consolidation/567295].
  Search Engine Land (resumen) advierte contra pasarse: grupos con cientos de palabras pierden control
  [EXP searchengineland.com/consolidate-legacy-skags-464518].

### 1.2 Recomendaciones actuales de Google [DOC .../answer/14752782]
- Un grupo = palabras que comparten página de destino o tema creativo; una campaña = palabras que comparten presupuesto y objetivo.
- Unificar todas las concordancias de un grupo temático y usar solo amplia (las duplicadas parten los datos de Smart Bidding;
  amplia es la única que usa todas las señales de intención). Google cita que el 62 % de los anunciantes con Smart Bidding usan
  amplia como principal.
- Quitar segmentación por dispositivo (Smart Bidding ya lo considera). Segmentar campañas por **objetivo de negocio**.
- Quitar duplicadas y palabras sin servir.
- Una sola estrategia/objetivo por grupo de campañas.

### 1.3 Lo que dicen los expertos y la práctica de agencia [EXP/NV salvo indicación]
- **Marca vs. no marca: separar siempre.** La marca tiene CPA 3-10× menor y esconde el rendimiento real de captación si va junto;
  Smart Bidding tiende a volcarse en marca. Con exclusiones de marca en PMax/AI Max y listas de negativas de marca en la
  campaña no marca para que cada tráfico entre donde debe.
- **Competidores**: campaña propia, presupuesto topado, CPA objetivo propio (ver apartado 6).
- **Por servicio**: separar campaña cuando el servicio tiene **presupuesto, margen o CPA objetivo distinto** (p. ej. implante dental
  vs. limpieza, reforma integral vs. reparación). Si el CPA objetivo es el mismo, un grupo temático por servicio dentro de
  una campaña es suficiente. Criterio práctico: una campaña debería generar **≥15-30 conversiones/mes** para que Smart Bidding
  aprenda bien (heurística [NV]; Google solo documenta 50 en Demand Gen y 15/30 días para tROAS).
- **Por zona**: separar campaña solo si cambia el CPA tolerable o el presupuesto por zona (ciudad con competencia fuerte vs. pueblos
  cercanos) o si hay varios locales. Para ubicaciones, usar «Presencia: personas en o que visitan habitualmente» y no «presencia o
  interés» cuando llegan leads fuera de zona [DOC .../answer/13775965].
- **Palabras por grupo**: la guía de Google no da número; práctica común 5-20 palabras de un mismo tema [NV]. El tamaño ideal es
  el que permite que los anuncios RSA sean relevantes para todas.
- **Dispositivos, horarios, audiencias**: no segmentar campañas por ello salvo diferencia clara de negocio (llamadas fuera de horario
  de atención, por ejemplo).
- **Regla de decisión sugerida para el agente**: si una campaña tiene <15 conversiones/30 días y existe otra con el mismo CPA objetivo
  y misma oferta, proponer fusionar. Si un grupo mezcla intenciones muy distintas (servicio A y B con landing distinta), proponer partir.

---

## 2. Concordancias y Smart Bidding

### 2.1 Concordancias
- **Amplia + Smart Bidding**: recomendación oficial de Google. Funciona **si**: hay conversiones suficientes y fiables, hay negativas, y el
  objetivo de conversión es de calidad (lead cualificado, no «clic en teléfono» solo). Riesgo en lead gen con poco volumen: tráfico
  irrelevante durante el aprendizaje [EXP].
- **Exacta**: control y protección de la marca; útil como «red de seguridad» para términos de alto valor y para forzar prioridad
  (con AI Max, las amplias dejan de tratarse como exactas en la priorización si desactivas la coincidencia de AI Max; para mantener el
  comportamiento antiguo hay que añadir copias exactas [DOC .../answer/15910187]).
- **Frase**: estado intermedio; las «variantes cercanas» ya están incluidas en exacta/frase desde 2021-2024 [NV de fechas]. En cuentas
  nuevas con poco volumen, frase+exacta con tCPA o Maximizar clics suele ser la entrada prudente [EXP].
- **Posición media**: métrica retirada (2019); usar cuota de impresiones en parte superior y absoluta superior (para el producto:
  ya anotado en el brief).

### 2.2 Estrategias de puja y cuándo usarlas
| Estrategia | Cuándo | Notas documentadas |
|---|---|---|
| CPC manual / Maximizar clics (con tope) | Cuenta nueva sin datos de conversión o con seguimiento roto | Google: si usas Maximizar conversiones sin histórico, pasa antes a Maximizar clics o CPC manual para acumular datos [DOC .../answer/6268633] |
| Maximizar conversiones (sin objetivo) | Arranque con algo de datos; objetivo = volumen | Gasta todo el presupuesto; el CPA fluctúa |
| Maximizar conversiones con tCPA | Lead gen con ≥ unas decenas de conversiones/mes | Fija el tCPA cerca del máximo CPL aceptable; muy bajo restringe volumen [DOC .../answer/13775965] |
| Maximizar valor / tROAS | Cuando hay valor por lead (calificado, venta cerrada) | Conversión cercana al cierre con ≥15 conversiones en 30 días [DOC .../answer/13775965]; tROAS a o bajo el ROAS histórico [DOC .../answer/6268633]; valores ≥4 semanas o 3 ciclos antes de poner tROAS [DOC] |
| Cuota de impresiones objetivo | Defensa de marca | Se usa en campaña de marca; NV detalle |

- **Umbrales numéricos de conversiones**: Google no publica uno para tCPA; el PDF de buenas prácticas lista el mínimo en 1 conversión
  (posible nota al pie) y 15/30 días para tROAS [NV; services.google.com/fh/files/misc/smartbiddingbestpractices1s.pdf]. Demand Gen:
  «al menos 50 conversiones» para una base sólida y esperar 30-50 tras un cambio [DOC .../answer/16797388]. Blogs: 30/mes para tCPA y 50 para
  tROAS (heurística [NV]).
- **Un solo escalón del embudo por estrategia**: pujar hacia una sola acción de conversión principal; las demás como no ofertables
  (observación) para acelerar el aprendizaje, ya que varios escalones dentro de un tCPA entran en conflicto [DOC .../answer/13775965 y
  .../answer/16797388].

### 2.3 Fase de aprendizaje y cambios sin romper
- «Learning» ≤7 días; Smart Bidding sigue aprendiendo después [DOC .../answer/13020501]. PMax lead gen: 1-2 semanas, hasta 6 con poco volumen
  o configuración compleja [DOC .../answer/13775965].
- **No disparan aprendizaje**: cambios de presupuesto, objetivos (tCPA/tROAS), creatividades, segmentación [DOC .../answer/13020501].
- **Sí lo disparan**: crear/reactivar estrategia; añadir/quitar campañas o grupos a la estrategia; cambio significativo de acciones de
  conversión; aplicar cartera nueva.
- **Pasos recomendados**: Demand Gen: cambiar pujas 5-10 % por semana y total ±15 %; no cambiar el objetivo de conversión en una campaña
  viva, mejor campaña nueva; subir presupuesto hasta 15 % si consistentemente gasta >80 % [DOC .../answer/16797388]. Para tCPA en Search no hay
  cifra oficial; la práctica común de «10-20 % cada 1-2 semanas» [EXP/NV] es compatible con la guía de «lo gradual».
- Tras subir/bajar presupuesto, evaluar tras 1-2 ciclos de conversión [DOC .../answer/17061251].
- **Ciclos de conversión**: usar el tiempo real desde clic a lead (en formularios suele ser 0-3 días; si el lead se cualifica por CRM puede
  ser 14-30 días). Importante para el agente: **no juzgar CPL de los últimos N días antes de ese retraso** (Google recomienda excluir el periodo
  de retraso al alinear objetivos [DOC .../answer/17061251]).

### 2.4 Ajustes de estacionalidad, exclusiones de datos, carteras
- **Ajuste de estacionalidad**: avisa a Smart Bidding de un cambio temporal esperado de conversión (promos, ventas), pensado para sucesos
  breves (1-7 días); no para picos predecibles cada año, que el sistema ya modela [DOC .../answer/9461281; matiz «solo sorpresas» es opinión de un
  artículo secundario, EXP].
- **Exclusión de datos**: para caídas de seguimiento o fallos de la web; solo afecta a lo que aprende Smart Bidding, no a los informes; no abusar
  [DOC .../answer/10370710 vía búsqueda]. Para el módulo: cuando se detecte caída de conversiones por fallo de la web (rastreador SEO,
  vigilancia de páginas caídas), proponer exclusión de datos con las fechas exactas.
- **Carteras de pujas**: compartir una estrategia entre campañas con el mismo objetivo para sumar datos; aplicar una cartera nueva dispara
  aprendizaje. Útil para campañas pequeñas del mismo tipo/CPL (p. ej. varias ciudades del mismo servicio) [DOC aprendizaje; recomendación de uso EXP].

### 2.5 Novedades de pujas 2026
- **17 ago 2026: tCPA/tROAS más fiel al objetivo bajo limitación de presupuesto** (Search, Shopping, PMax, Demand Gen, Travel, Display; no App ni
  Vídeo) [DOC .../answer/17061251]. Opciones de Google: mantener, alinear con CPA/ROAS del último mes (sin periodo de retraso), fijar uno propio, pasar a
  Maximizar sin objetivo, o subir presupuesto cómodamente por encima del gasto medio.
- **Promotion Mode (beta)** para campañas Search con tROAS, ventanas de 3-14 días [EXP smarter-ecommerce, SEJ]. Más e-commerce que servicios locales.
- **Smart Bidding Exploration** exige tROAS y presupuesto no limitante [EXP SEJ].

---

## 3. Por tipo de campaña

### 3.1 Search (incluido AI Max for Search)
**Search clásica**: sigue siendo la base de lead gen local. Pilares: palabras de intención alta, negativas, extensiones, landing alineada.

**AI Max for Search** (lanzado 2025) [DOC .../answer/15910187]:
- No es tipo de campaña: capa dentro de Search con tres bloques: *coincidencia de términos de búsqueda* (amplia + tecnología sin palabras clave),
  *personalización de texto* (antes «recursos creados automáticamente») y *expansión de URL final* (requiere la personalización de texto).
- Controles: ubicaciones de interés, inclusiones/exclusiones de marca, inclusiones/exclusiones de URL, «text guidelines» (exclusión de
  términos y restricciones de mensaje), negativas, conmutador por grupo de la coincidencia, retirar recursos.
- Informes: tipo «AI Max» en términos de búsqueda con columna de origen, vista combinada término-título-URL, columna «Seleccionado por» para landing.
- **Limitaciones**: ineficaz con presupuesto limitado (alerta); los RSA fijados no se respetan con expansión de URL; plantillas de seguimiento
  deben ser compatibles.
- **Resultados externos**: Google publica casos (p. ej. +16 % leads y −13 % CPL en MyConnect [ANEC de Google]). Un resumen cita a Monks diciendo que
  el 99 % de las impresiones de AI Max no dio conversiones en ~30.000 términos [NV, no localizado el original]; Search Engine Land (30 días de pruebas) y casos
  tempranos muestran tasas de conversión más bajas que exacta en un ejemplo (0,76 % vs 4,67 %) [EXP vía buscador; leer original pendiente]. Una agencia de
  e-commerce: sin expansión de URL empeoró y con ella +9 % ingresos [ANEC].
- **Postura sugerida**: probar con **experimentos** de Google (existen «AI Max experiments» [DOC .../answer/16450159]) en 1-2 campañas con volumen y
  presupuesto holgado, medir CPL/CPA por conversiones **cualificadas**, no activar por defecto en cuentas con <30 conversiones/mes ni con presupuesto limitado.
  Revisar a diario los términos «AI Max» las dos primeras semanas.

### 3.2 Performance Max para lead gen
Riesgos [EXP/DOC]: leads spam y baja calidad, tráfico de Display/YouTube/Discover poco intencional, canibalización de marca, pérdida de visibilidad
(poca transparencia por canal), objetivo de conversión flojo (clic en teléfono).

Qué dice Google [DOC .../answer/13775965]:
- Medición: objetivos específicos de lead («Enviar formulario de lead», «Lead cualificado»); pasar puntuación/valor de lead; esperar 1-2 semanas (hasta 6).
- Pujas: valor → maximizar valor con tROAS si hay ≥15 conversiones/30 días de un objetivo cercano al cierre; volumen → maximizar conversiones con tCPA
  cercano al máximo CPL, o sin tCPA si hay pocos datos.
- Calidad: formularios de lead con preguntas de cualificación, reCAPTCHA y validación en servidor.
- Controles: revisar insights de términos, añadir negativas (campaña o cuenta), **apagar expansión de URL** si sale en páginas irrelevantes,
  exclusiones de marca, revisar ubicaciones y excluirlas (listas a nivel cuenta/MCC), revisar adecuación de contenido.
- Creatividad: variedad; subir tus vídeos propios para evitar los autogenerados.
- Los objetivos de lead de alto valor (cualificado, convertido, reserva, presupuesto) activan protecciones de tráfico inválido específicas de lead gen
  [DOC vía buscador].

Controles disponibles (2025-2026):
- Negativas por campaña (hasta 10.000) y por cuenta (hasta 1.000) que aplican a Search/Shopping inventory [EXP vía buscador; verificar en ayuda].
- Exclusiones de marca (cubren erratas y otros alfabetos mejor que las negativas) [EXP SEL].
- **Exclusiones de audiencias de primera parte** y nuevos informes (presupuesto proyectado, demografía, segmentación por red en ubicaciones, informe de productos con
  todas las redes desde 15 jun 2026) [EXP SERoundtable/SEJ sobre anuncio de mar 2026].
- **Señales de audiencia y temas de búsqueda**: son orientativas, no restrictivas [EXP].
- **Sin «search-only PMax» oficial**. «Feed-only PMax» (solo fuente de datos) existe para e-commerce con Merchant Center; no aplica a leads de servicios.
  No hay control oficial de presupuesto por canal [EXP vía buscador, comprobar en ayuda].
- **Subida de conversiones sin conversión offline**: Google dijo en mayo 2026 que la API de Ads dejaría de aceptar *nuevos* adoptantes de importación de
  conversiones offline desde el 15 jun 2026 (mirar alternativas: «conversiones mejoradas para clientes potenciales» y la API de conversiones de datos) [NV vía buscador].
  **Comprobar esto con la ayuda oficial antes de diseñar nada sobre importación de conversiones de GoHighLevel.**

**Cuándo usar PMax en servicios locales**: solo cuando ya hay 30+ conversiones/mes limpias, Search está cubierta (marca excluida), y hay calidad
medible (conversión cualificada). Si no, Search (con AI Max opcional) y Demand Gen para demanda [EXP ExpertBeacon, Seer].

### 3.3 Demand Gen
- No sirve en Search/Shopping; sirve en YouTube, Discover, Gmail, Display (Google Maps no). Capta demanda aún no expresada con inventario barato [EXP].
- Guía oficial [DOC .../answer/16797388]: presupuesto diario ≥10× tCPA; sano si gasta ≤80 %; ≥50 conversiones para base sólida; pujas 5-10 % por semana,
  ±15 %; grupos consolidados; todos los canales salvo motivo; optimizar a conversión profunda, resto no ofertable; no cambiar el objetivo de conversión en una campaña viva.
- Calidad de lead: SEL afirma que los leads de Demand Gen tienen menos spam que PMax [EXP/vendedor]. Sin datos medibles en negocios locales [NV].
- Útil para: remarketing frío con vídeo/imagen, audiencias propias (listas de clientes, «lookalike» de primera parte), clínicas con tratamientos de decisión larga. No para urgencias (fontanero).

### 3.4 Display / remarketing
- Display clásico para captar leads: mala fama (baja calidad) [EXP]. Útil solo para **remarketing** con listas de visitantes y exclusiones de apps/ubicaciones basura.
- Restricción: **remarketing basado en salud** está limitado por la política de publicidad personalizada (no segmentar por condiciones médicas) [NV, política conocida; verificar para clínicas].
- Con la desaparición de audiencias similares (retiradas a partir de 2023-2024 y sustituidas por señales/segmentos optimizados) [NV de fechas], el valor está en las listas propias.

### 3.5 YouTube / vídeo
- Para negocios locales: baja prioridad salvo marca o tratamientos de alto valor; mejor vía Demand Gen o PMax que como campañas aparte. Las campañas de vídeo de
  alcance/visualización **no** cambian con la actualización de tCPA/tROAS de ago 2026 [DOC .../answer/17061251].

### 3.6 Llamadas
- Recursos de llamada y campañas «solo llamadas» (retiradas o relegadas desde 2025 [NV]); en la práctica: recurso de llamada con horario, **conversión de llamada por duración mínima**
  (p. ej. ≥60 s) y seguimiento de llamadas desde anuncio y desde web. Para el módulo: el agente debe preguntar si las llamadas cuentan como conversión y con qué duración mínima.
- Llamadas fuera de horario: usar programación de anuncios o desactivar el recurso de llamada fuera de horario.

### 3.7 Local (Business Profile, LSA, PMax pago por lead)
- **PMax con objetivos de pago por lead** (migración de LSA): empezó en ago 2026 solo en EE. UU.; sin palabras clave; se cobra por lead válido por teléfono con duración mínima; usa datos
  del perfil de empresa; categorías 1-10; Google recomienda ejecutarla junto con Search/PMax/Demand Gen [DOC .../answer/17325249]. Fuera de EE. UU.: 2027 [NV, ppc.land].
- LSA sigue operativo en algunos países europeos para ciertas categorías [NV]; la política prohíbe anuncios de cerrajeros en España desde nov 2024 [DOC vía buscador, .../adspolicy/answer/15303051].
- **Recurso de ubicación** (Business Profile enlazado) y «campañas de acciones locales» no aplican igual que en EE. UU.; para España usar recurso de ubicación + llamada + sitelinks [NV].

### 3.8 Qué funciona en negocios locales de servicios [EXP/práctica, NV de cifras]
1. Search de intención alta («dentista en [ciudad]», «implantes dentales precio», «reformas baños [ciudad]») con exacta/frase + amplia controlada.
2. Campaña de marca barata y siempre activa.
3. Recursos: llamada, ubicación, sitelinks (precio, presupuesto, opiniones), formulario de leads.
4. Landing local con CTA único; formulario corto; llamada y WhatsApp medidos.
5. PMax/AI Max como segunda fase.
6. Demand Gen/remarketing para tratamientos de decisión larga.

---

## 4. Anuncios y recursos

### 4.1 RSA
- Hasta 15 títulos (30 car.) y 4 descripciones (90 car.). Google recomienda variedad [DOC .../answer/6167122 vía buscador].
- **Ad strength**: «Excelente» se asocia a +6 % conversiones de media según Google [DOC .../answer/13775965]. Optmyzr no encuentra correlación con el rendimiento real
  [EXP optmyzr.com/blog/google-rsa-performance-study]. Postura: Ad strength ≥ «Bueno» como higiene, **no objetivo**; el rendimiento (CPL cualificado) manda.
- **Fijar**: parcial (p. ej. un título de marca o legal en posición 1, resto libre) gana a total o a nada en CPA/CTR según Optmyzr y SEJ [EXP].
  Con AI Max + expansión de URL, los fijados se ignoran [DOC .../answer/15910187]. Fijar solo si hay obligación legal/de marca (p. ej. aviso sanitario).
- Títulos <20 caracteres con menor CPA en un estudio de Optmyzr [EXP, no verificado en detalle].
- **Pruebas de anuncios en la era RSA**: sin A/B clásico; usar (a) informes de recursos («Mejor/Bueno/Bajo» ya sin usar como verdad), (b) **experimentos de campaña** de Google
  con variantes de anuncio, (c) 2 RSA por grupo con mensajes distintos y comparar CTR/CVR a 30+ días [EXP].
- Contenido para leads: propuesta de valor, precio o «desde», zona, urgencia, prueba social (valoraciones), CTA.

### 4.2 Recursos
- **Sitelinks** (4-6, con descripciones), **extractos estructurados** (servicios), **destacados**, **llamada**, **ubicación**, **imagen**, **precio**, **promoción**, **formularios de lead**
  [DOC en general]. Los recursos aumentan CTR y ocupan espacio; con Smart Bidding se eligen por subasta.
- **Formularios de leads de Google** (lead form asset): menos fricción, pero **más spam y menor calidad** salvo con preguntas de cualificación, reCAPTCHA y validación [DOC .../answer/13775965].
  Para el módulo: comparar tasa de «lead cualificado» en CRM (GoHighLevel) entre formulario de Google y web.
- **Recursos generados automáticamente**: Google puede crear títulos/descripciones/sitelinks/imágenes. Desactivar o revisar si el sector tiene restricciones (salud, legal, financiero)
  [EXP]; en AI Max, «personalización de texto» puede reescribir; hay «text guidelines» para vetar términos [DOC].

---

## 5. Presupuestos y ritmo

### 5.1 Mecánica [DOC .../answer/1704443, 2375423, 10486637]
- Presupuesto diario = **medio**. Un día puede gastar hasta **2×**; el cobro diario se limita a 2×; el exceso se compensa en otros días.
- Límite mensual = **30,4×** presupuesto diario medio (365/12); si la sobreentrega lo supera, Google abona el exceso.
- Cambio a mitad de mes: límite = lo ya gastado + (nuevo presupuesto × días restantes).
- **Programación de anuncios (cambio 1 jun 2026)**: el pacing intenta gastar hasta el límite mensual aunque haya días apagados; los días apagados no sirven.
  Consecuencia: **campañas con horario/días apagados gastan más en los días activos**; las alertas de «gasto diario» deben tener esto en cuenta [DOC .../answer/16913225].
- Campañas compartidas, PMax y Demand Gen: el ritmo se reparte según la oportunidad de la subasta (no uniforme); el informe de presupuesto de PMax estima gasto a fin de mes [EXP vía buscador].

### 5.2 Escalado y reducción
- Demand Gen: subir hasta 15 % cuando gasta >80 % de forma constante [DOC .../answer/16797388]. Practica común en Search: +20 % cada 3-7 días si el CPL aguanta [EXP/NV].
- Google (ago 2026): mantener el presupuesto «cómodamente por encima del gasto medio»; evaluar 1-2 ciclos de conversión tras cada subida [DOC .../answer/17061251].
- **Reducción**: con tCPA/tROAS ahora seguirá el objetivo (menos volatilidad) [DOC]; con Maximizar conversiones el CPA fluctuará [DOC].
- **Presupuesto limitado**: no meter más palabras/AI Max si ya está limitada; subir presupuesto, reducir ámbito o subir tCPA [DOC AI Max: ineficaz si limitada].
- **Presupuesto mínimo útil**: Demand Gen ≥10× tCPA/día [DOC]; para Search, regla práctica: presupuesto diario ≥ 3-5× el CPL objetivo para dar ≥3-5 clics/conversiones opcionales al día [NV].
- **Pacing propio del módulo**: Google no avisa de que el mes va a acabar mal; calcular proyección = gasto + (medio diario × días restantes) y comparar con el límite 30,4×.

---

## 6. Competencia

### 6.1 Pujar por competidores
- Generalmente permitido como palabra clave; restringido en texto del anuncio; **el formulario de solicitud de marcas desapareció en feb 2025**, ahora basta con que no haya queja [EXP agencia canadiense; verificar política Google].
- En España: Ley 17/2001 de Marcas; el criterio es la confusión sobre el origen; hay jurisprudencia (Ortodoncis v. Vitaldent) [EXP]. Para negocios regulados, consultar a legales.
- **Nivel de calidad bajo** en competidores (landing menos relevante, CTR esperado bajo), CPCs más altos y conversión menor [EXP wearetg, otros].
- Recomendación: campaña separada, presupuesto limitado, tCPA propio más laxo o solo si hay diferenciación clara, **sin nombrar al competidor en el texto**; revisar si el cliente tiene ficha de competencia (ya en la ficha) para listas.

### 6.2 Proteger la marca
- Campaña de marca barata (exacta + frase), con parte superior absoluta objetivo; supervisar cuota de impresiones en marca y quién puja sobre ella (informe de subasta).
- Si un competidor puja por la marca del cliente: evaluar cuota perdida de marca; reaccionar sube el CPC; no siempre merece la pena si la web orgánica ya es 1.º.
- Reclamación por marca solo si el competidor usa la marca en el texto.

### 6.3 Auction Insights (Información de subastas) [DOC .../answer/2579754]
- **Porcentaje de impresiones, cuota de solapamiento (overlap), posición superior (outranking), parte superior de página, parte superior absoluta**.
- **Lectura clave**: solapamiento alto + cuota de superación baja = estás en las mismas subastas y las pierdes [EXP Seer]. Comparar siempre la parte superior de un competidor con el solapamiento.
- Límite: sin datos si tu cuota <10 %; Search Partners no tiene desglose de posición [EXP vía buscador].
- **Reacción a un competidor nuevo (propuesta, no hay playbook documentado)**: (1) detectar aparición en el informe con solapamiento creciente; (2) ver si cae la cuota de superación y la parte superior; (3) comprobar
  cuota perdida por clasificación vs. presupuesto; (4) mejorar Ranking (anuncio, landing, NC) antes que subir pujas; (5) revisar si el competidor puja por marca; (6) revisar su landing/oferta con el rastreador de competencia SEO.

---

## 7. Tácticas de expertos menos conocidas (con fiabilidad)

| Táctica | Para qué | Fiabilidad |
|---|---|---|
| Excluir Search Partners en lead gen | Calidad de tráfico; WordStream avisa de que puede perder conversiones rentables | [EXP] opiniones divididas; probar con experimento, no por defecto |
| Excluir Red de Display en campañas de Search | Search y Display tienen propósitos distintos; Google dice que puede mejorar con Display | [EXP]; en 2025-2026 es opt-in en muchos casos |
| Listas compartidas de negativas por sector | Cadencia, rapidez, coherencia entre 25+ cuentas | [EXP] una por sector (p. ej. «gratis», «empleo», «curso», «DIY»), otra de marca; los scripts de conflictos no cubren PMax/Shopping |
| Negative keyword sculpting | Dirigir cada consulta a la campaña correcta (marca/no marca, competidor, servicio) | [EXP] Útil con amplia; mantener una lista de «protección de marca» |
| Horarios con Smart Bidding | Desactivar/ajustar solo si hay motivo de negocio (nadie atiende) | [EXP] para B2B; las pujas por hora/día con Smart Bidding las absorbe el sistema; no encontré fuente sólida sobre ajustes por día en Smart Bidding [NV] |
| Objetivo por día de la semana | Diferencia real de CVR entre días | [NV] solo con segmentación en campañas separadas |
| Experimentos A/B de campaña (Google) | Probar AI Max, estrategia de puja, estructura | [DOC AI Max experiments .../answer/16450159] |
| Scripts de seguridad: detección de anomalías, gasto/horas, conflictos de negativas | Alertar de picos de gasto o caída de conversiones | [EXP optmyzr, SEJ]; **la herramienta puede hacer lo mismo con la API sin scripts** |
| Conversiones mejoradas para clientes potenciales | Aportar emails/teléfonos hash para mejorar la medición | [DOC en general; NV de requisitos] |
| Orden de optimización: medición → estructura → negativas → pujas → anuncios | Primero arreglar la señal que alimenta a Smart Bidding | [EXP común] |
| Análisis de términos de búsqueda con clasificación por intención (IA) | Detectar términos con clics sin conversión, mejores que el promedio | Producto propio |
| Ajuste de tCPA al cambiar la landing | Si cae el rendimiento, acercar el tCPA al CPA real y esperar a que reaprenda | [DOC .../answer/13775965] |
| Excluir ubicaciones/apps basura en PMax y Display (listas a nivel MCC) | Calidad | [DOC .../answer/13775965] |

---

## 8. Por sector (estrategias típicas, [EXP/NV] salvo indicación)

> Benchmarks de CPC/CPL son de EE. UU. y orientativos: dentistas CPC ≈ 8 $, CVR ≈ 10,7 %, CPL ≈ 73 $; abogados CPC ≈ 9,87 $; reformas/hogar CPC ≈ 8,33 $, CPL ≈ 91 $;
> media CPL ≈ 66,7 $ [EXP WordStream 2026 vía buscador; wordstream.com/blog/2026-google-ads-benchmarks]. **No hay datos de España en estas fuentes.**

- **Reformas y hogar (fontanería, electricidad, cerrajería, climatización)**: Search + llamadas + ubicación; urgencia (24 h) y precio; campaña por servicio; cobertura por zona; presupuestos grandes
  conviene medir leads cualificados. Cerrajería: anuncios prohibidos en España [DOC política servicios locales]. PMax tras acumular datos; vigilar spam.
- **Clínicas (dental, estética, fisioterapia)**: Search por tratamiento (implantes, ortodoncia, botox, fisioterapia) y por zona; campaña de marca; reservas/citas como conversión; prueba social y precios «desde»;
  remarketing limitado por política de salud (no segmentar por condición). Políticas de sanidad y medicamentos: restricciones; telemedicina requiere certificación (LegitScript; en España reconocida desde
  5 ago 2026 según el certificador [NV; fuente interesada]); términos de medicamentos restringidos no certificables fuera de CA/EE. UU./NZ [DOC .../adspolicy/answer/16356807].
  Estética: tratamientos como bótox/inyectables tienen restricciones de contenido y de «antes/después» [NV].
- **Abogados**: CPC alto; palabras muy específicas (divorcio, despido, accidente) con zona; landing con teléfono; WhatsApp. El código deontológico de la abogacía regula la publicidad (no se pueden prometer resultados) [NV, no investigado].
  Servicios legales no requieren certificación de Google, pero **servicios financieros** sí (verificación según país) [NV].
- **Academias/formación**: estacionalidad fuerte (sept-oct, enero), campañas por curso, Search + Demand Gen/YouTube para marca, audiencias; conversión = solicitud de información (cualificada); pujas por competidores de academias
  frecuente. Ajuste de estacionalidad útil en matrículas.
- **Inmobiliaria**: Search por zona y tipo de operación, PMax con feed (si aplica), Demand Gen para promociones; leads de baja calidad → importar estado desde CRM [NV].
- **Servicios a domicilio**: igual que reformas; LSA/PMax pago por lead no disponibles en España en 2026 [NV].
- **B2B**: ciclos largos, pocas conversiones: puja por conversión intermedia, **programación por horario laboral**, LinkedIn complementario; lead cualificado importado es crítico; con <15 conversiones/mes usar Maximizar clics/CPC manual con conversiones como observación [DOC .../answer/6268633; SMX en ad schedule, EXP].
- **E-commerce pequeño**: Shopping/PMax con feed, tROAS con ≥15 conversiones/30 días [NV], margen real (valor de conversión neto), campañas de marca separadas, Promotion Mode para campañas puntuales [EXP].

### Restricciones de políticas (a revisar siempre)
- Salud y medicamentos: certificación según tipo y país; términos restringidos [DOC políticas; verificar texto para España].
- Servicios financieros: verificación del anunciante en países concretos [NV si aplica en España].
- Servicios locales: cerrajeros prohibidos en España [DOC .../adspolicy/answer/15303051].
- Publicidad personalizada: no segmentar por salud, finanzas, religión, etc. [NV, política general].
- Alerta para el módulo: avisar si el cliente es de un sector regulado antes de proponer remarketing o textos agresivos.

---

## Ideas para nuestro módulo

1. **Panel de salud de estructura**: cuántas campañas con <15-30 conversiones/30 días; propuesta de fusión; marca mezclada con no marca (clasificar términos con la ficha del cliente).
2. **Motor de causas de variación de CPL**: contemplar (a) cambio de ago 2026 en tCPA/tROAS por limitación de presupuesto; (b) cambios de landing (registro de cambios SEO); (c) pacing mensual; (d) cuota perdida por ranking/presupuesto;
   (e) nuevo competidor en subastas; (f) caída de seguimiento (exclusión de datos propuesta); (g) fase de aprendizaje por cambio de estructura.
3. **Regla anti-reinicio**: avisar al aplicar cambios que *disparan aprendizaje* (cartera, conversión, composición) frente a los que no (presupuesto, objetivo); **plantilla de cambios por pasos** (5-10 %/semana, ±15 %).
4. **Calculadora de pacing mensual** con 30,4× y la regla de programación del 1 jun 2026; aviso temprano si el mes se pasa/queda corto.
5. **Auditoría de PMax/AI Max**: términos, URLs elegidas, ubicaciones; puntuación de spam por origen; comparar con la tasa de lead cualificado en GoHighLevel y Clarity.
6. **Banco de negativas por sector** (listas compartidas versionadas) con recomendación al crear cuentas; verificador de conflictos que cubra también PMax.
7. **Experimentos asistidos**: propuesta de experimento de AI Max, de Search Partners (excluir) o de estrategia de puja, con criterio de éxito, duración (2 ciclos o 2 semanas) y lectura automática.
8. **Detector de sector regulado** (ficha del cliente) que activa checklist de políticas.
9. **Seguimiento de la competencia**: cruzar informe de subasta con la competencia SERP (DataForSEO) y la ficha del cliente; alerta de entrada de competidor.
10. **Evaluación por ciclo de conversión real** del cliente (clic→lead→cualificado), no por días fijos.

## Lo que nadie hace bien
- Explicar **por qué** cambia el CPL combinando subasta, presupuesto, aprendizaje, landing y competencia a la vez (las herramientas muestran métricas sueltas).
- Detectar que una campaña está **consolidada de más o de menos** respecto al volumen de conversiones.
- Tratar los **cambios de política de Google** (p. ej. 17 ago 2026) como causa de variación y no como fallo del gestor.
- Medir calidad de lead por origen (formulario de Google vs. web vs. llamada) con CRM propio.
- Pacing mensual real teniendo en cuenta 30,4×, sobreentrega y programación de anuncios.
- Coordinación SEO ↔ Ads: parar pujas donde el orgánico ya es 1.º y viceversa.

## Lo no verificado (resumen)
- Umbrales numéricos de conversiones (15/30/50) fuera de lo que cita Google.
- Calendario de migración de LSA a PMax pago por lead fuera de EE. UU.
- Cambios de importación de conversiones offline (mayo 2026) y su impacto en GoHighLevel.
- Detalles de Search Partners/Display opt-in en 2026 por tipo de campaña.
- Cualquier cifra de pruebas de AI Max (Monks 99 %, 0,76 % vs 4,67 %).
- Políticas concretas para España en sanidad, financiero y abogacía (se encontraron fragmentos).
- Ajustes por día de la semana con Smart Bidding: sin fuente sólida.
- Promotion Mode y «Smart Bidding Exploration»: solo resúmenes.
- Lectura de las páginas bloqueadas de Search Engine Land (403).

## Fuentes
Documentación de Google (leída): 
- Estructura de cuenta: https://support.google.com/google-ads/answer/14752782
- Cambios en estrategias con objetivo (17 ago 2026): https://support.google.com/google-ads/answer/17061251
- Periodo de aprendizaje: https://support.google.com/google-ads/answer/13020501
- Medir Smart Bidding: https://support.google.com/google-ads/answer/6268633
- PMax lead gen: https://support.google.com/google-ads/answer/13775965
- AI Max: https://support.google.com/google-ads/answer/15910187 (y experimentos: https://support.google.com/google-ads/answer/16450159)
- Demand Gen guía: https://support.google.com/google-ads/answer/16797388
- Pago por lead PMax: https://support.google.com/google-ads/answer/17325249 y https://support.google.com/google-ads/answer/17213585
- Presupuestos: https://support.google.com/google-ads/answer/1704443, https://support.google.com/google-ads/answer/2375423, https://support.google.com/google-ads/answer/16913225, https://support.google.com/google-ads/answer/10486637
- Estacionalidad: https://support.google.com/google-ads/answer/9461281
- Auction insights: https://support.google.com/google-ads/answer/2579754
- Políticas: https://support.google.com/adspolicy/answer/15303051, https://support.google.com/adspolicy/answer/16356807, https://support.google.com/adspolicy/answer/14962491
- Smart Bidding best practices (PDF): https://services.google.com/fh/files/misc/smartbiddingbestpractices1s.pdf
- Anuncio PMax 2026: https://business.google.com/us/accelerate/resources/articles/new-performance-max-steering-and-reporting-updates-coming-in-2026

Terceros (solo vía resumen del buscador salvo indicación): 
- https://searchengineland.com/consolidate-legacy-skags-464518
- https://searchengineland.com/how-campaign-structure-shapes-google-ads-performance-481332
- https://searchenginejournal.com/google-clarifies-its-stance-on-campaign-consolidation/567295
- https://ppc.land/why-your-hyper-granular-campaigns-might-be-killing-performance-in-2026/
- https://searchengineland.com/googles-ai-max-for-search-30-days-testing-462568
- https://searchengineland.com/ai-max-early-case-studies-analysis-script-462706
- https://searchengineland.com/how-to-reduce-low-quality-leads-from-performance-max-campaigns-468687
- https://searchengineland.com/performance-max-brand-exclusions-395439
- https://searchengineland.com/google-search-partners-why-opt-out-481830
- https://www.optmyzr.com/blog/google-rsa-performance-study/
- https://wordstream.com/blog/2026-google-ads-benchmarks
- https://searchenginejournal.com/google-ads-product-manager-revealed-details-that-matter-before-black-friday/594102
- https://www.seerinteractive.com/insights/google-performance-max-vs-demand-gen
- https://www.seerinteractive.com/insights/auction-insights-market-opportunities
- https://www.wearetg.com/blog/bidding-on-competitor-brand-names/
- https://ppc.land/google-ads-filters-miss-fake-leads-so-advertisers-must-add-3-form-checks/
- https://ppc.land/local-services-ads/
