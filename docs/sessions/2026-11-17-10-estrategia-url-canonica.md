# Estrategia: URLs trabajadas con su versión canónica (hallazgo C3)
**Fecha:** 2026-11-17  
**Rama:** fix/estrategia-url-canonica  
**Commit:** c1b16e60

## Qué se construyó
- `lib/estrategia/rules.ts`: tres funciones puras nuevas.
  - `urlKey`: compara dos URLs como la misma página. No tiene en cuenta el protocolo, el «www.», la barra final ni el ancla.
  - `canonicalFromFacts`: elige la versión que se sigue. Primero la etiqueta canonical; si no la hay, la dirección final tras las redirecciones; si ninguna sirve, la URL escrita. Solo acepta una versión que siga dentro de la propiedad de Search Console.
  - `pickGscVariant`: de las páginas que tiene Search Console, elige la variante de la misma URL con más impresiones.
- `lib/estrategia/processes.ts`:
  - **`trackWorkUrls` y `resolveCanonical`:** los tres puntos que empiezan a seguir URLs ya no guardan la URL tal como se escribió, sino la canónica, y quitan los duplicados. Esos puntos son la extracción de encargos, «Procesar encargos anteriores» y la respuesta a «¿en qué URL…?».
  - **`runUrls`:** si la consulta diaria no trae datos de una URL, busca en Search Console la variante que sí tiene (filtro `contains`, máximo 5 búsquedas por ejecución) y pasa a seguir esa. El resumen dice cuántas se corrigieron.
  - **Palabras clave de páginas recién cambiadas:** comparan las URLs con `urlKey`.
- `lib/estrategia/process-map.ts`: los pasos «Trabajo hecho» y «Palabras clave, ficha de Google y URLs trabajadas» explican el comportamiento nuevo.
- `tests/estrategia.test.ts`:
  - 3 pruebas puras: `urlKey`, `canonicalFromFacts` y `pickGscVariant`.
  - 1 prueba con la base de datos: una URL sin datos pasa a la variante con www y barra final, y guarda sus datos diarios.
- `docs/ESTADO.md` (§ procesos, pendientes, cronología) y `docs/REVISION-2026-11-17.md`: C3 queda marcado ✅.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Dos defensas en vez de una.**
  - Al empezar a seguir una URL se resuelve su versión canónica, pidiendo la página.
  - Al medir, si no hay datos, se busca la variante que tiene Google.
  - Motivo: la primera falla si la web no responde en ese momento o si su canonical no coincide con lo que indexa Google. La segunda corrige también las URLs que ya se estaban siguiendo.
- **Una variante ya seguida no se sustituye.** Si la variante encontrada ya se sigue en otra fila (la clave única es cliente + URL), se deja como está y no se borran datos.
- **Límite de 5 búsquedas de variante por ejecución y cliente.** Una página nueva sin impresiones no tiene variante, y el límite evita gastar consultas cada día.
- **La canonical que apunta fuera de la propiedad se ignora:** se usa la redirección final o la URL escrita.

## Qué verificar manualmente
- Con un cliente con plan y Search Console asignado, responder a «¿en qué URL…?» con una URL sin «www» o sin barra final. En la pestaña Estrategia del cliente, la URL seguida debe aparecer como la tiene Google y, al día siguiente, con datos.
- En las ejecuciones del proceso «URLs trabajadas» puede aparecer «N corregida(s) a la versión que tiene Google».

Comprobaciones hechas:
- `pnpm test`: 372/372.
- `node scripts/check-architecture-map.js`: OK.
- Mapa Visual actualizado.

## Pendientes detectados
- **C4:** las medias diarias del «antes» y el «después» se dividen entre los días con datos, no entre los días del calendario. Con poco tráfico salen infladas. Es pequeño y está relacionado; sigue ⏳ en la revisión.
- Las URLs guardadas en `est_work_facts.urls` siguen tal como se escribieron (son el registro del trabajo). Solo cambia la URL que se sigue.
