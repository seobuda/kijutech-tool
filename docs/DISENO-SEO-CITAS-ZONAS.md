# Diseño · SEO parte 5c: citas en directorios y páginas de zona

**Fecha:** 2026-11-27 · **Rama:** `feature/seo-local-5c` · **Lista:** parte 5 (local), tanda 5c.

## Objetivo
1. **Citas:** saber si el negocio está en los directorios que pesan en España (Páginas Amarillas, QDQ, Cylex, Infobel, Yelp, Facebook, Apple Maps y Bing Places) y si su nombre, dirección y teléfono (NAP) coinciden con la ficha. Que el equipo tenga la lista de qué falta o qué corregir.
2. **Páginas de zona:**
   - proponer páginas «servicio + población» para las poblaciones de la zona que no tienen página propia;
   - detectar **páginas puerta**: páginas de zona casi idénticas que solo cambian el nombre de la población. Google las penaliza.

## Citas: cómo, sin rastrear directorios ajenos
- **No se rastrean los directorios:** sus condiciones lo prohíben y sus webs bloquean a los robots.
- Se usa **la búsqueda de Google**, con la SERP orgánica de DataForSEO que ya tenemos, en cola: `"{nombre}" site:{dominio del directorio}` por directorio.
  - 8 búsquedas × 0,0006 $ = **unos 0,005 $** por proyecto. Se hace **cada trimestre** (proceso editable) o a mano.
  - El primer resultado da la URL de la ficha en el directorio, el título y el fragmento. Del fragmento se saca el teléfono con una expresión regular (sin IA) para compararlo con el de la ficha.
- **Resultado por directorio:** `encontrada` (con URL), `no_encontrada` o `teléfono distinto`. La persona puede marcar «revisada» o «no aplica».
- **Hallazgos:**
  - `seo.citation_missing` (info): falta en 3 o más directorios principales;
  - `seo.citation_nap_mismatch` (aviso): teléfono distinto en algún directorio.

  Técnica `citas_directorios`.
- **Lo que no se hace:** dar de alta en los directorios (efecto hacia fuera, y suele pedir verificación por teléfono) ni contratar agregadores de pago (línea roja).

## Páginas de zona
- **Poblaciones:** las de la zona confirmada (`zoneTowns`), sin la principal. Si la zona solo tiene una población, no hay páginas de zona que proponer.
- **¿Ya tiene página?** Del rastreo: páginas indexables cuyo título, H1 o URL contienen la población (normalizada). Si no hay ninguna, se propone `seo.zone_page_missing` (aviso) con «servicio principal + población», solo si el negocio atiende a domicilio o en las dos modalidades (`atencion`). Un negocio que solo atiende en su local no necesita páginas por población. Técnica `pagina_zona`: brief corto, contenido **útil y propio** de la zona y nada de copiar y pegar.
- **Páginas puerta:** entre las páginas con población en el título o la URL (al menos 3), grupos con simhash a 3 bits o menos (el mismo criterio de casi duplicados que ya usamos) → `seo.doorway_pages` (importante), con las URLs del grupo. Técnica `contenido_duplicado`.
- Se calcula en la **auditoría** (son reglas puras sobre el rastreo), fuente `seo.salud:rastreo`, así que van en la lista de la auditoría.

## Puntos de vista
1. **SEO local:** las citas consistentes ayudan algo, sobre todo la coherencia del NAP; lo más útil es detectar teléfonos o direcciones viejos. Las páginas de zona funcionan si son útiles, y las copias son el error más común de las agencias.
2. **Costes y legalidad:** sin rastrear directorios y con búsquedas de Google a 0,0006 $; dar de alta es manual.
3. **Producto:** una lista clara de directorios con su estado y enlace; las páginas de zona entran como propuestas en el plan.

## Alternativas
| | Qué | Coste | Riesgo | Se pierde |
|---|---|---|---|---|
| **A. `site:` en Google con DataForSEO y reglas sobre el rastreo (elegida)** | Lo descrito | Unos 0,005 $/trimestre | `site:` no siempre indexa la ficha del directorio (falsos «no encontrada») | Precisión del NAP completo |
| B. Rastrear los directorios | | 0 | Condiciones y bloqueos | — |
| C. Agregador de pago (BrightLocal, Whitespark, Yext) | Auditoría y alta | 30-500 $/mes | Línea roja (servicio de pago) | — |
| D. Lista manual sin comprobar | Solo enlaces de búsqueda | 0 | Trabajo humano | Automatización |

## Decisión (hipótesis)
**A**, marcando «no encontrada» como «no la encontramos en Google» (no «no existe») y dejando a la persona marcarla.

**Pregunta 1. ¿Cumple el objetivo final?** Sí: el sistema comprueba y propone, y la persona da de alta.

**Pregunta 2. ¿Qué riesgo oculto tiene?** Los falsos «no encontrada» por cómo indexa Google: se dice así y no se avisa por 1 o 2. Los nombres muy genéricos pueden coincidir con otro negocio: se exige que el fragmento o el título contengan la población o el teléfono.

**Pregunta 3. ¿Hay algo que ya tengamos y no usemos?** Sí, y se reutiliza:
- la cola de DataForSEO orgánico (`postTasks`/`getTask` de las posiciones);
- el simhash del rastreo;
- `zoneTowns`;
- la zona, el teléfono y cómo atiende, confirmados.

## Auditoría independiente
La hizo un subagente Opus 5.5 con esfuerzo alto. **Veredicto: la idea vale y es barata, pero no está lista.**

**Graves:**
1. **Las páginas puerta no se detectan con el simhash actual.** Se calcula sobre todo el `<body>` (menú y pie incluidos). Una página que solo cambia la población queda a 7-10 bits (estimación, no medido), no a 3 o menos. Además, el rastreo no guarda el texto.
2. **Solapa con `seo.near_duplicate`**, cuya explicación ya habla de «la misma plantilla cambiando la ciudad». Daría avisos y tareas dobles.
3. **El fragmento de la SERP no llega:** `SerpTaskResult` solo lleva rank, dominio y URL.

**Importantes:**
4. **El teléfono del fragmento** rinde poco y da falsos «distinto» (listados de categoría, teléfonos ocultos). Lo útil es **buscar el NAP antiguo**: teléfonos o direcciones viejos que sigan publicados.
5. **Apple Business Connect y Bing Places no se pueden comprobar con `site:`.** Los directorios que importan dependen del sector.
6. **«Ya tiene página»:** el texto suelto da coincidencias falsas («Vic» en «servicio»), los nombres de varias palabras fallan, la zona lleva comarcas y relleno, y un artículo del blog cuenta como página de zona.
7. **Proponer páginas sin demanda** empuja a crear contenido delgado.

**Menores:**
- Puertas también por patrón de URL repetido.
- Las citas pesan un 7 % (Whitespark 2026, una encuesta): algo barato y en severidad info.

**Decisión final, rehecha:**

**A. NAP antiguo y teléfono** (sustituye a «citas por directorio»):
- Búsqueda en Google, en directo (`serpSource.search`, unos 0,002 $), del teléfono actual en sus formatos y de los **teléfonos o direcciones antiguos o distintos** que ya conoce el expediente: los descartados, los de Wayback o los que no coinciden con lo confirmado. Como mucho 4 búsquedas por trimestre o a mano.
- Hallazgo `seo.old_nap_found` (aviso): el teléfono o la dirección antiguos aparecen publicados en otra web, con su URL, para pedir la corrección.
- **Directorios por sector:** una lista para revisar a mano en la pestaña Local, con enlaces de búsqueda y casillas «revisado», sin comprobación automática. Por ejemplo:
  - salud: Doctoralia y Top Doctors;
  - restauración: TripAdvisor y TheFork;
  - reformas y hogar: Habitissimo y Cronoshare;
  - general: Páginas Amarillas, QDQ, Cylex, Apple Business Connect, Bing Places y Facebook.
- **Núcleo:** `SerpResult.organic` gana `description` (opcional y aditivo), anotado aquí según el protocolo.

**B. Páginas de zona condicionadas a la demanda:**
- Solo para las búsquedas «servicio + población» que ya siguen las Posiciones (origen `servicio_zona`), con volumen o impresiones mayores que 0 y **fuera del top 10**, y cuya población no tiene una página propia.
- «Página propia»: la población (normalizada y con límites de palabra) aparece en el título, el H1 o la URL de una página indexable que no es del blog.
- Solo si el negocio atiende a domicilio o en las dos modalidades.
- Hallazgo `seo.zone_page_missing` (**info**), con técnica `pagina_zona`. El brief pide datos propios de esa población (trabajos hechos allí, desplazamiento, precios).
- Se calcula cuando se recogen las posiciones (fuente `seo.posiciones:serp`, lista aparte).

**C. Páginas puerta con su propia comprobación:**
- Al terminar la auditoría, un trabajo aparte **vuelve a descargar** como mucho 20 páginas candidatas: las que llevan una población en el título o la URL, o forman un patrón de URL repetido de 3 o más.
- Quita las líneas comunes con la portada (menú y pie) y cambia los nombres de población por un marcador.
- Compara el texto con **Jaccard de trigramas de 0,8 o más** en grupos de 3 o más → `seo.doorway_pages` (importante), fuente propia `seo.salud:puertas`.
- **Para no duplicar:** el plan agrupa por técnica y las URLs de un grupo de puertas se quitan de la propuesta de `near_duplicate` (al generar el plan, no en los hallazgos).

## Lo construido (27 nov) y lo que cambió al construir
- Todo lo de la decisión final, con dos ajustes:
  - **Direcciones antiguas: no** (de momento solo teléfonos). Una dirección se escribe de muchas formas y la búsqueda daría ruido; el teléfono es exacto y es lo que hace perder llamadas.
  - **Directorios: sin casillas «revisado»**, solo enlaces. Guardar las casillas pedía una tabla nueva para algo que hoy se revisa una vez; si el equipo lo pide, se añade.
- Como mucho 3 teléfonos por búsqueda (no 4), 0,002 $ cada uno.
- **No verificado:** que el fragmento (`description`) de la SERP en directo de DataForSEO traiga el teléfono tal como sale en Google; se verá en la primera búsqueda real.
