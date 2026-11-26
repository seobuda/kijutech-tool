# Diseño · SEO parte 5: local (tanda 5a, ficha de Google y reseñas)

**Fecha:** 2026-11-26 · **Rama:** `feature/seo-local-5a` · **Lista:** `docs/LISTA-CERRADA-SEO.md`, parte 5. La parte se divide en tres tandas:
- **5a:** ficha de Google y reseñas;
- **5b:** geo-grid y spam en Maps;
- **5c:** citas y páginas de zona con la regla contra las páginas puerta.

## Objetivo (5a)
Que cada proyecto local sepa:
1. **cuál es la ficha de Google** del cliente, identificada y confirmada;
2. **si cambia algo importante** en ella: nombre, categoría, horario, teléfono, web o «cerrada temporal o definitivamente». Google y terceros la editan sin avisar;
3. **cómo van sus reseñas frente a la competencia:** nota, número y ritmo de reseñas nuevas al mes;
4. **cómo pedir reseñas:** el enlace directo «escribir una reseña» y un texto para enviar a sus clientes.

Las coordenadas de la ficha sirven además para el geo-grid de la tanda 5b.

## Fuentes
**Google Places API (New)**: la integración `places` ya está en Agentes, con la clave de Enric. Las llamadas:
- **Text Search** («nombre + población»): busca candidatas para identificar la ficha del cliente y la de cada competidor confirmado.
- **Place Details:**
  - `displayName`, `primaryType`, `types`, `formattedAddress`, `location`, `businessStatus`, `regularOpeningHours`, `nationalPhoneNumber`, `websiteUri`, `rating`, `userRatingCount`, `googleMapsUri`;
  - **sin el texto de las reseñas** en esta tanda, porque cuesta más (SKU «Atmosphere») y solo trae 5.

**Precios [NV]:** Details Enterprise unos 20 $ por 1000 y Text Search Pro unos 32 $ por 1000. Hay 1000 gratis al mes por SKU en la cuenta de facturación de Google.

**Uso:**
- vigilancia **semanal** de la ficha del cliente: unas 4 llamadas al mes;
- foto **mensual** de 5 competidores como mucho: unas 5 llamadas;
- identificación: 1-2 Text Search por proyecto, una sola vez.

Unas 10 llamadas por proyecto y mes, es decir, 0,20 $ como mucho si se pasa del gratuito. Se apunta en `seo_data_spend` con el coste estimado: Places no devuelve coste.

## Piezas
1. **Integración en el núcleo:** capacidad `PlacesSource` (la registra Agentes, igual que `SerpSource`) con `search(text, bias)` y `details(placeId)`. SEO no sabe de Google Places.
2. **Tabla `seo_local_places`** (del módulo): una ficha por proyecto y papel (`cliente` o `competidor`), con `place_id`, nombre, `client_competitor_id` si es un competidor, estado (`propuesta`, `confirmada` o `descartada`), latitud y longitud. La ficha del cliente se **propone sola**: Text Search con el nombre y la población de la zona o de la dirección, y se elige la candidata cuyo dominio web o teléfono coincide con el del cliente. Una persona la confirma. Si no coincide nada, se muestran las candidatas para elegir.
3. **Tabla `seo_local_snapshots`**: una foto por ficha y fecha, en filas compactas, con los campos de Details normalizados y un hash del horario.
4. **Proceso `seo.local`** (en «Vigilancia automática», cada 7 días): foto del cliente cada semana y de los competidores cada 4 semanas. Compara la última foto con la anterior y genera estos hallazgos (fuente `seo.local:ficha`):
   - `seo.gbp_closed`: cerrada temporal o definitivamente (crítico, con aviso por Telegram como la web caída);
   - `seo.gbp_changed`: nombre, categoría principal, teléfono, web u horario cambiados respecto a lo confirmado. La persona lo acepta («lo cambiamos nosotros») o lo revierte en Business Profile;
   - `seo.reviews_behind`: menos de la mitad de reseñas que la mediana de los competidores, o una nota 0,3 o más por debajo;
   - `seo.reviews_stalled`: ninguna reseña nueva en 60 días (por la diferencia del recuento entre fotos).
5. **Pestaña nueva «Local»** en el proyecto:
   - la ficha del cliente (confirmar o elegir otra);
   - lo vigilado y los cambios;
   - una tabla de reseñas frente a los competidores (nota, número y nuevas al mes);
   - **«Conseguir reseñas»**: el enlace `https://search.google.com/local/writereview?placeid=…`, copiable, y un texto para WhatsApp o correo.

   Sin QR por ahora: necesitaría una dependencia nueva (línea roja). Se hace con el enlace.
6. **Técnicas del plan:**
   - `ficha_google_corregida`, para un cambio o un cierre;
   - `campana_resenas`, para quedarse atrás o tener las reseñas paradas.

## Puntos de vista
1. **SEO local:** la ficha es el activo número 1 de una pyme local. Las ediciones de Google («cerrado», categoría cambiada) hunden las llamadas sin que nadie se entere. Las reseñas (número, ritmo y nota) son de los factores locales con más peso.
2. **Costes y seguridad:**
   - Places con field masks mínimas, sin texto de reseñas y con la frecuencia justa;
   - la clave sigue cifrada en Agentes;
   - el `place_id` es estable, pero Google puede cambiarlo: un `NOT_FOUND` se trata como «revisar la ficha», no como cerrada.
3. **Producto:** confirmar la ficha con un clic y pedir reseñas con un enlace. Nada de formularios.

## Alternativas
| | Qué | Coste | Riesgo | Se pierde |
|---|---|---|---|---|
| **A. Places API (elegida)** | Lo descrito | Unos 0-0,20 $ al mes | Precios y cuota [NV] | El texto de las reseñas y responderlas |
| B. DataForSEO Business Data (`my_business_info` y reviews) | Ficha y todas las reseñas | Céntimos | Cobertura en España [NV]; también por tareas | — (se reserva para el texto de las reseñas en una tanda futura) |
| C. Business Profile API | La ficha propia con estadísticas y respuesta a reseñas | 0 | **Aún no aprobada por Google** (aparcado) | Hoy no es posible |
| D. Nada | | 0 | Se pierde lo más importante del local | — |

## Decisión (hipótesis) y sus tres preguntas
La alternativa **A**, dejando B para el texto de las reseñas y C para responderlas cuando Google la apruebe.

**Pregunta 1. ¿Cumple el objetivo final?** Sí: vigila sola, avisa por excepción y da al equipo la acción concreta (revertir o pedir reseñas).

**Pregunta 2. ¿Qué coste o riesgo oculto tiene?**
- Que Places cambie de precio: el gasto se apunta y se acota.
- Falsos cambios por la normalización (horario con otro formato): se compara un hash de lo normalizado.
- Fichas de cadenas o con varios locales: v1 tiene una ficha por proyecto; el modelo admite varias.

**Pregunta 3. ¿Hay algo que ya tengamos y no usemos?** Sí, y se reutiliza:
- la integración Places;
- los competidores confirmados;
- la zona, la dirección y el teléfono del expediente;
- la vigilancia programada;
- el aviso por Telegram;
- el tope de gasto.

## Auditoría independiente
La hizo un subagente Opus 5.5 con esfuerzo alto, que comprobó en la web los términos de Google Maps Platform y sus precios. **Veredicto: la alternativa A no se aprueba.**

**Graves:**
1. **Los términos de Places no permiten guardar nada salvo el `place_id`.** La latitud y la longitud solo 30 días; nombre, nota, número de reseñas, horario, teléfono y web, nada (Maps Service Terms §15.3 y §15.4 para el EEE; políticas de la API de Places). Además, **facturando en el EEE se aplica la lista cerrada de «EEA Places API Permitted Uses»**, y vigilar a la competencia o analizar reseñas no está en ella. Las fotos, el ritmo de reseñas y las coordenadas para el geo-grid lo incumplían.
2. **`primaryType` de Places no es la categoría de la ficha de Google:** daría falsos «cambió la categoría».

**Importantes:**
- **Identificación de la ficha:** por el `cid` del paquete local de DataForSEO o por el activo `business_profile`; la web y el teléfono, como último recurso.
- **La ficha va por cliente, no por proyecto.**
- **Cierre:** confirmarlo consultando dos veces.
- **Nombre:** fijar el idioma de la consulta.
- **Horario:** comparar las franjas, no el texto.
- **Cambios:** compararlos con lo confirmado.
- **Reseñas:**
  - «paradas» necesita 3 fotos o más y 60 días;
  - «por detrás» necesita 3 competidores o más y mínimos de reseñas, sin agregadores;
  - los competidores sin ficha no se buscan a ciegas.

**Decisión final, alternativa B: DataForSEO `business_data/google/my_business_info`, en directo** (unos 0,0054 $ por consulta [NV]).
- **Uso:** cliente cada semana y competidores cada mes. Unos 0,05 $ al mes por proyecto: en directo y no en cola, por simplicidad, porque el coste es mínimo.
- **Datos que da:** categoría real y secundarias, teléfono, web, nota, número de reseñas y su distribución, estado (abierta, cerrada temporalmente, cerrada definitivamente), si está reclamada, `place_id`, `cid` y coordenadas.
- **Identificación:** `my_business_info` con «nombre + población» y comprobación por dominio o teléfono, o pegando la URL de Maps o el `cid`. Una persona confirma. El `cid` del paquete local de posiciones se conserva para la tanda 5b.
- **Tablas del módulo, por cliente:**
  - `seo_local_places`: ficha, papel, estado y referencia de lo confirmado;
  - `seo_local_snapshots`: fotos compactas.
- **Hallazgos:**
  - `gbp_closed`: confirmado a los 30 min y avisado una vez por ficha y estado;
  - `gbp_changed`: frente a lo confirmado y que alguien puede «aceptar», lo que actualiza la referencia;
  - `reviews_behind` y `reviews_stalled`, con mínimos.
- **Places no se usa** para esto. La integración se queda, como mucho, para consultas del momento sin guardar nada. Se avisa a Enric de que su descripción («reseñas de la competencia») no es un uso permitido en el EEE.
- **Pendiente [NV]:**
  - la cobertura de `my_business_info` en España con una cuenta real;
  - las condiciones de DataForSEO sobre guardar sus datos;
  - las reseñas fechadas (endpoint de reseñas, solo en cola), que van a una tanda posterior.
