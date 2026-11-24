# SEO Hito 2: webs de la competencia frente a la del cliente
**Fecha:** 2026-11-24  
**Rama:** feature/seo-competencia-webs  
**Commit:** c3c8eb8d

## Qué se construyó
- **`lib/seo/competencia/compare.ts`** (nuevo, reglas puras, sin IA):
  - `siteProfile`: perfil de una web. Cuenta páginas indexables, la mediana de palabras y de respuesta del servidor, los datos estructurados y qué servicio tiene página propia. Las etiquetas, categorías y autores no cuentan como página de un servicio.
  - `compareSites`: frases con lo que le falta al cliente frente a la competencia.
  - `ownPositions` y `gapQueries`: huecos, es decir, búsquedas donde sale el competidor y el cliente no.
- **`lib/seo/competencia/competencia.ts`**:
  - `crawlCompetitors`: rastreo ligero de 50 páginas de hasta 5 competidores confirmados y directos, uno por web cada 30 días.
  - `competitorComparison`: los datos para la pantalla.
  - `findCompetitors` guarda los huecos en la evidencia de cada competidor.
- **`lib/seo/mapa-actions.ts`**:
  - nueva acción `crawlCompetitorsAction` (permiso `edit`);
  - al confirmar un competidor se rastrea su web.
- **Pantalla Proyectos → Palabras**:
  - sección «Sus webs frente a la del cliente», con las conclusiones y una tabla;
  - los huecos aparecen en cada competidor.
- **`lib/core/crawler.ts`** (núcleo, cambio genérico): las URLs del sitemap se ordenan por longitud de ruta.
- **Mapa Visual**:
  - paso `seo-competencia-webs` en `lib/seo/salud/process-map.ts`;
  - descripción de `seo-competencia` actualizada.
  - `node scripts/check-architecture-map.js` pasa.
- **`docs/ESTADO.md`**: §6.39.
- **Pruebas**:
  - `tests/seo-competencia-webs.test.ts` (6);
  - `tests/seguridad.test.ts` con la acción nueva;
  - 645 pruebas pasan.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Sin esquema nuevo.** El rastreador del núcleo ya tenía el objetivo `competidor`. Los huecos van en la evidencia del competidor, que ya es JSON.
- **Cambio en el núcleo, genérico.** Con un tope de 50 páginas, el rastreo de la competencia veía sobre todo el blog cuando el sitemap lista antes las entradas. Ahora las URLs del sitemap van ordenadas por longitud de ruta. No depende de ningún módulo y también ayuda al rastreo propio cuando llega a su tope.
- **Servicios comparados.** Se usan los de la ficha («Qué vende u ofrece»). Si no hay, se usan los temas del mapa que más se ven, sin los de marca.
- **Umbrales para dar una conclusión:**
  - un dato estructurado, si lo usa al menos la mitad de la competencia rastreada;
  - el servidor, si el del cliente pasa de 800 ms y es 1,5 veces más lento;
  - el texto, si el cliente tiene menos del 60 %.
- **Directorios fuera.** No se rastrean los competidores marcados como directorio.

## Qué verificar manualmente
- Proyectos → CM Ibérica → Palabras:
  - confirmar un competidor: en unos minutos aparece en «Sus webs frente a la del cliente»;
  - comprobar que las conclusiones tienen sentido.
- Tras volver a pulsar «Buscar competencia», en cada competidor debe salir la línea «Sale y la web del cliente no: …».

## Pendientes detectados
- La mediana de palabras de cm-iberica.net en local es de unas 10.600 por página. Parece demasiado alta: conviene revisar cómo cuenta las palabras `extractPage` (quizá cuenta menús o scripts).
- La mediana de respuesta de su servidor es de unos 5 s. Si se confirma en producción, es un hallazgo de velocidad para el cliente.
- Reseñas de la competencia: esperan a Places o a Business Profile.
