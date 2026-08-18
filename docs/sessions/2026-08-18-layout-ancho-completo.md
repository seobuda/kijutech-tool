# Mejora de layout global — ancho completo como herramienta profesional
**Fecha:** 2026-08-18
**Rama:** feature/fase-c-keyword-research
**Commit:** 46058fb5

## Qué se construyó

Petición de Enric: eliminar el centrado con `max-width` del dashboard interno
(estilo SE Ranking/Linear/Notion, sidebar fijo + contenido a ancho completo) y
mejorar el tamaño/proporción de las tarjetas del mapa de clusters. Cambio de
CSS/layout puro, un único commit sustantivo (46058fb5), en la misma rama de Fase C.

- `app/(dashboard)/dashboard/layout.tsx`: quitado `max-w-7xl mx-auto` del
  contenedor que envuelve sidebar+contenido; el `<main>` pasa de `p-0 lg:p-4`
  a `p-0 lg:p-6` (24px de padding en vez de 16px)
- `app/(dashboard)/dashboard/projects/[projectId]/seo/layout.tsx`: quitado el
  padding horizontal propio (`p-4 lg:p-8` → `p-4 lg:py-6 lg:px-0`) porque
  duplicaba el padding que ya aporta `dashboard/layout.tsx` a partir de `lg`
- `app/(dashboard)/dashboard/projects/[projectId]/seo/seo-wizard-shell.tsx`:
  el nav de etapas SEO pasa de `lg:w-72` (288px) a `lg:w-[220px]` fijo cuando
  expandido (colapsado se mantiene en 48px, sin cambios ahí)
- `app/(dashboard)/dashboard/projects/[projectId]/seo/keyword-research/clusters/clusters-board.tsx`:
  el grid de clusters pasa de `sm:grid-cols-2 lg:grid-cols-3` (fijo) a
  `grid-cols-[repeat(auto-fill,minmax(280px,1fr))]` (auto-fill responsive)
- `app/(dashboard)/dashboard/projects/[projectId]/seo/keyword-research/clusters/cluster-card.tsx`:
  tarjeta con padding interno de 16px (antes 24px+24px duplicado), altura
  mínima 320px y ancho máximo 320px; título en `text-lg font-semibold`
  (antes `font-medium` normal); más separación entre keywords (`space-y-2`
  en vez de `space-y-1`); contadores de búsquedas/visitas rediseñados con
  iconos (`Search`/`TrendingUp` de lucide-react) y número grande en negrita
  en vez de emoji + texto plano; la nota para el cliente se empuja al fondo
  de la tarjeta (`mt-auto`) para que el `border-top` quede siempre pegado al
  final independientemente de cuántas keywords tenga el cluster

## Migraciones aplicadas

Ninguna — cambio de CSS/layout puro.

## Decisiones técnicas tomadas en auto mode

- **No se tocó el Header compartido de `app/(dashboard)/layout.tsx`** (el que
  tiene el logo y el botón de sign-up/menú de usuario, con su propio
  `max-w-7xl mx-auto`): se intentó al principio, pero ese layout también
  envuelve las páginas públicas de marketing (`app/(dashboard)/page.tsx` y
  `app/(dashboard)/pricing/page.tsx`), que siguen centradas con `max-w-7xl`
  en su propio contenido. Quitarle el max-width solo al Header habría dejado
  esas páginas con la barra superior a ancho completo pero el contenido
  debajo centrado — una inconsistencia visual en páginas fuera del alcance
  del encargo (marketing, no la herramienta interna). Se revirtió ese cambio
  y se dejó el ajuste de ancho completo únicamente en
  `dashboard/layout.tsx` (el layout con sidebar, exclusivo de `/dashboard/*`).
  Efecto secundario: dentro del dashboard, la barra superior con el logo
  queda centrada a 1280px mientras el sidebar+contenido de abajo ocupan todo
  el ancho — ligera inconsistencia visual que solo se resolvería separando
  ese Header en un layout propio para `/dashboard/*`, cambio de arquitectura
  de rutas que no estaba pedido en este encargo.
- **Se quitó el padding horizontal propio del layout del wizard SEO**
  (`seo/layout.tsx`) en vez de solo el `max-w-7xl` del contenedor: aunque el
  encargo no lo pedía explícitamente para ese archivo, mantenerlo habría
  sumado su padding (32px por lado en `lg`) al de `dashboard/layout.tsx`
  (24px), dejando ~56px de espacio muerto a cada lado — contrario al espíritu
  de "sin espacio muerto" del Cambio 3. Se interpretó que era parte de
  "cualquier wrapper adicional dentro del wizard SEO que limite el ancho"
  (Cambio 4), y se dejó solo el padding vertical propio de esa sección,
  delegando el horizontal al layout padre.
- **"Sin espacio entre el nav de etapas SEO y el sidebar principal" (Cambio 3)
  se interpretó como "sin espacio muerto de centrado/max-width", no como
  0px literales**: el nav de etapas sigue separado del sidebar por el
  padding estándar de 24px que también usan el resto de páginas del
  dashboard (Proyectos, Settings...), en vez de pegarlo literalmente al
  borde del sidebar sin ningún respiro. Forzar 0px ahí habría roto la
  coherencia visual con el resto del dashboard y no encajaba con el tono
  "herramienta profesional" pedido — Notion/Linear tampoco pegan el
  contenido al sidebar sin ningún margen.
- **El grid de clusters usa literalmente `minmax(280px, 1fr)`** tal como pedía
  el encargo, y el límite de "máximo 320px" se aplicó como `max-w-[320px]`
  en la propia tarjeta (no en la columna del grid) — así la columna puede
  crecer con `1fr` para repartir el espacio sobrante, pero la tarjeta nunca
  se ve más ancha de 320px; el hueco sobrante (si lo hay) queda vacío a la
  derecha de la tarjeta dentro de su celda.
- **Los contadores de búsquedas/visitas cambiaron de emoji (📊🎯) a iconos de
  lucide-react** (`Search`, `TrendingUp`) con el número en `text-lg
  font-semibold`: no se pidió explícitamente quitar los emojis, pero el
  encargo pedía "más prominencia visual" y coherencia con "herramienta
  profesional" — el resto de la UI ya usa iconos de lucide-react
  consistentemente, no emojis.

## Qué verificar manualmente

1. **Ancho completo:** entra en `/dashboard/projects` y confirma que la
   lista ya no está centrada con márgenes grandes a los lados — debe llegar
   casi hasta el borde derecho de la pantalla, con ~24px de aire.
2. **Mapa de clusters:** entra en el Paso 4 de Keyword Research de un
   proyecto con varios clusters y confirma que las tarjetas se ven
   cuadradas, bien proporcionadas, sin comprimirse.
3. **Conteo de tarjetas por fila:** en una pantalla de 1440px con el nav de
   etapas SEO expandido, la cuenta hecha a mano (ver "Pendientes
   detectados" abajo) da ~3 tarjetas por fila, no las 4-5 que anticipaba el
   encargo — confírmalo en el navegador y dime si quieres que ajuste el
   ancho mínimo de tarjeta o el ancho del sidebar para acercarse más a ese
   objetivo.
4. **Nav colapsable:** confirma que el botón de colapsar/expandir el nav de
   etapas SEO (de la sesión anterior) sigue funcionando con el nuevo ancho
   de 220px.
5. **Resto del dashboard:** revisa Proyectos, Settings, Activity y Security
   para confirmar que ninguna pantalla se rompe con la eliminación del
   `max-w-7xl` (algunas pueden verse ahora con líneas de texto muy largas al
   no tener su propio límite de ancho — si se ve mal en alguna, dímelo y le
   añado un `max-w` local a esa pantalla en concreto).
6. **Cabecera superior:** confirma que la barra superior con el logo (fuera
   del dashboard con sidebar, ej. si navegas a `/pricing`) se ve igual que
   antes — no se tocó.

## Pendientes detectados

- **El "4-5 tarjetas por fila a 1440px" del encargo no cuadra con la
  aritmética real del layout.** Con sidebar de 256px + nav de etapas SEO de
  220px + ~48px de padding + 24px de gap entre nav y contenido, el ancho
  disponible para el grid a 1440px es de ~892px, lo que con
  `minmax(280px, 1fr)` y gap de 16px da 3 columnas, no 4-5 (a 1280px da 2,
  no 3-4). Para llegar a 4-5 columnas a 1440px haría falta reducir el ancho
  mínimo de tarjeta (por ejemplo a ~220-240px) o colapsar el nav de etapas
  SEO. No se cambió el mínimo de 280px porque el encargo lo pedía
  explícitamente ("Mínimo 280px por tarjeta") — se prefirió avisar aquí en
  vez de desviarme silenciosamente del número pedido. Pendiente de que
  Enric decida si prioriza el mínimo de 280px o el número de columnas.
