# Diseño · SEO parte 2: alta de la cartera (3 clientes de prueba)

**Fecha:** 2026-11-26 · **Rama:** `feature/seo-alta-cartera` · **Clientes:** cm-iberica (ficha completa), rfserveis y centrosdym (ficha vacía; Search Console conectado en los tres).

## Objetivo
Que un proyecto SEO quede **listo para trabajar**, es decir, con datos para el informe, las posiciones, el local y la medición, **sin que el equipo rellene formularios**. La IA propone y una persona confirma con un clic.

## Lo que ya existe
- **Expediente** (`lib/seo/expediente/`): recoge datos solos (ficha, web con JSON-LD, `tel:` y redes, Wayback, GSC), cada uno con su origen y una confianza, y permite confirmar o descartar y «pasar a la ficha» (servicios, tipo y logo).
- **Completitud de la ficha** del núcleo (`completeness`, `lib/core/client-rules.ts`): 14 comprobaciones con pesos.
- **Campos de la ficha:**
  - `business`: a qué se dedica;
  - `offerings`: qué vende;
  - `area`: zona;
  - `audience`: público.
- **Competencia:** se busca con DataForSEO y una persona confirma.
- **Preguntas al cliente** por correo, con aprobación.

## Lo que falta
1. **Proponer con IA lo que no se averigua con reglas:**
   - a qué se dedica;
   - los servicios (con la URL de su página, si la hay);
   - la zona (poblaciones o comarcas);
   - el público.

   Hoy los servicios y la zona solo salen de la ficha o de la respuesta del cliente.
2. **«Puesta en marcha» del proyecto**: una lista de comprobación con semáforo, que dice qué falta y lo arregla con un botón. Sale en el Expediente y en la lista de proyectos.

## Puntos de vista
1. **Especialista SEO local.** Sin servicios y zona no hay semilla para las posiciones («servicio + población»), ni páginas por servicio o de zona, ni geo-grid. Es lo primero.

   **Riesgo:** que la IA invente servicios que no ofrece, o una zona demasiado amplia.
2. **Producto y equipo.** El equipo no quiere formularios. Una sola pantalla con lo que falta y propuestas de un clic, y un botón «Ponerlo en marcha» que lance lo automático en orden (auditoría, expediente, mapa, propuesta IA y búsqueda de competencia).
3. **Costes e IA.** Siguiendo la directiva de optimización de IA:
   - **¿hace falta IA?** Para listar páginas candidatas a servicio, no: sirven los títulos, los H1 y los textos del menú. Para nombrar y agrupar los servicios como los diría un cliente y deducir la zona, sí: es juicio.
   - **Modelo:** Haiku 5.5 basta (extraer y resumir con evidencia). Una llamada por proyecto, con unos 6-10 k tokens de entrada (títulos, H1, textos de menú, JSON-LD y las 50 búsquedas con más impresiones) y céntimos de coste. Se registra en el gateway (`callAI`, función `seo_proponer_ficha`) y entra en el presupuesto de IA.
   - **Seguridad:** el texto de la web es ajeno, así que va delimitado como `<<<DATO NO FIABLE … FIN>>>` y las instrucciones que contenga se ignoran.

## Alternativas
| | Qué | Coste | Riesgo | Se pierde |
|---|---|---|---|---|
| **A. Haiku propone con evidencia y la persona confirma (elegida)** | Hechos `origen: ia`, confianza 40, provisionales; un clic los pasa a la ficha | Céntimos por proyecto | Inventar: lo frena exigir una cita literal o una URL de la web para cada servicio y la confirmación humana | — |
| B. Solo reglas (menú y H1) | Lista de páginas candidatas | 0 | Nombres feos y duplicados; sin zona ni negocio | Calidad |
| C. Preguntar al cliente (preguntas por correo) | Ya existe | 0 | Tarda días y depende del cliente | Rapidez; se mantiene como complemento |
| D. Sonnet u Opus | | 10-30 veces más | — | Nada que lo justifique |

## Decisión (hipótesis)
**A + C como complemento**, con estas piezas:
1. **Trabajo `seo.alta.proponer`** (cola):
   - Entrada: las páginas del último rastreo (título, H1, URL; como mucho 120, primero las del menú: las que más enlaces internos reciben), el JSON-LD (`areaServed`, `address`, `makesOffer`/`hasOfferCatalog`) y las 50 búsquedas con más impresiones en GSC (90 días, sin marca).
   - Prompt nuevo `seo_proponer_ficha` (migración de datos).
   - Salida JSON: `negocio`, `servicios[{nombre, url, cita}]`, `zona{poblaciones[], cita}` y `publico`.
   - **Validación por código:**
     - cada URL debe existir en el rastreo;
     - cada cita debe aparecer en el texto de entrada, si no, se descarta;
     - como mucho 15 servicios.
   - Se guarda como hechos del expediente (`servicios`, `zona` y los nuevos `negocio` y `publico`), con origen `ia`, confianza 40 y estado provisional.
2. **Pasar a la ficha:** `applyFactToFichaAction` acepta también `zona` (`clients.area`), `negocio` (`clients.business`) y `publico` (`clients.audience`). **Nunca pisa** un campo de la ficha que ya tenga texto: si lo tiene, pide confirmar el reemplazo.
3. **Puesta en marcha** (`lib/seo/alta/estado.ts`, pura más carga). Es un semáforo con estos elementos:
   - web en el alcance;
   - GSC asignado y con datos;
   - auditoría hecha;
   - ficha (a qué se dedica, servicios, zona, teléfono o dirección, tipo de negocio);
   - competencia confirmada (3 o más);
   - mapa de palabras hecho;
   - contacto que recibirá el informe.

   Cada uno lleva una acción (botón o enlace). El botón **«Ponerlo en marcha»** encola en orden lo automático que falte: auditoría → expediente → mapa → propuesta IA. La competencia es aparte, porque gasta DataForSEO y comprueba el tope. Sale arriba en el Expediente, y el semáforo en la lista de proyectos.
4. **Sin esquema nuevo:** los hechos van en `seo_dossier_facts`, cuyo campo es texto libre; se comprueba si hay restricción. La única migración es el prompt.

**Pregunta 1. ¿Cumple el objetivo final?** Sí: el sistema completa el proyecto y la persona solo supervisa. Las coordenadas para el geo-grid se dejan para la parte 5 (Local), con Places.

**Pregunta 2. ¿Qué riesgo oculto hay?**
- **Alucinación:** la frenan las citas y URLs comprobadas y la confirmación.
- **Inyección de instrucciones desde la web:** delimitada.
- **Coste:** acotado (1 llamada por proyecto, y de nuevo solo si se pide).

**Pregunta 3. ¿Hay algo que ya tengamos y no usemos?** Sí, y se reutiliza: el expediente, la completitud de la ficha, las preguntas al cliente, la competencia y el rastreo.

## Auditoría independiente
La hizo un subagente Opus 5.5 con esfuerzo alto. **Veredicto:** la alternativa A es buena, pero tal como estaba escrita rompía cuatro cosas existentes. Todo se corrigió antes de construir.

**Graves:**
1. La recogida del expediente borraría los hechos `ia`. → Se excluyen del borrado y de la reescritura.
2. El valor con objetos rompía `factKey`, `display`, la ficha y el mapa. → La forma sigue siendo `string[]` o `string`, y las pruebas van en `source_ref`.
3. El mapa usaba servicios sin confirmar. → Se excluye la IA salvo que esté confirmada.
4. Las preguntas al cliente le enseñarían la propuesta de la IA. → La IA sin confirmar cuenta como «falta».
5. «Pasar a la ficha» pisaba los servicios. → Ahora nunca pisa un texto distinto sin «Reemplazar».

**Medios:**
- **Validación más estricta:**
  - citas de 4 caracteres o más, con alguna palabra;
  - la cita debe estar en la misma página que la URL;
  - sin URL, se aceptan un H2, el JSON-LD o una búsqueda, y se marca «sin página»;
  - la zona solo vale si sale de la dirección, del área de servicio o de una búsqueda.
- Páginas candidatas sin legales ni blog, usando los textos de los enlaces.
- Encadenado sin tocar el núcleo: la propuesta se encola al final del expediente y solo si el rastreo cambió.
- Campos nuevos en `DOSSIER_FIELDS` y `maxTokens` a 4000.
- Se quita `<<<`/`>>>` del texto ajeno.
- La puesta en marcha añade idiomas, cómo atiende y un contacto con correo para el informe.

**Pendiente:**
- el examen del prompt (`registerPromptEvalSuite`) con los 3 clientes como casos, cuando haya propuestas reales;
- el semáforo en la lista de proyectos, con consultas agrupadas;
- las coordenadas, que van a la parte 5 (Local).
