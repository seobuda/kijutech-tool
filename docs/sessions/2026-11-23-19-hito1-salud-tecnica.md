# SEO Hito 1, primera parte: Salud técnica (y despliegue de los cimientos)
**Fecha:** 2026-11-23  
**Rama:** feature/hito1-seo  
**Commit:** a6f4efda

## Qué se construyó

Antes, en la misma sesión:
- Comprobé el servidor ampliado: 4 vCPU, 8 GB y 154 GB, con la web, Telegram y la copia de las 03:00 bien.
- Desplegué los cimientos (`5ff3234e`, migración 0060, con el permiso de Enric): backup `backup_pre_deploy_20261123_1805.sql.gz`, 61 migraciones, `kijutech_worker` en marcha, 16/16 pruebas simuladas y 571 pruebas.
- Enric asignó la propiedad de Search Console de CM Ibérica y creó su proyecto con alcance en producción. El primer trabajo de descarga se procesó sin fallos.

Código nuevo (sin migración):
- `lib/seo/salud/kinds.ts` — los 31 tipos de hallazgo de Salud, con título, explicación, gravedad, área y versión. Sin imports, para que lo use también la pantalla.
- `lib/seo/salud/audit-rules.ts` — las reglas, puras y sin IA, sobre las páginas rastreadas:
  - rastreo: 4xx/5xx, cadenas de redirección, servidor lento, HTTPS, web pintada con JavaScript;
  - indexación: sitemap, noindex, canonical;
  - contenido: títulos, descripciones, H1, contenido escaso, duplicado y casi duplicado, alt;
  - enlazado: huérfanas y profundidad;
  - datos estructurados;
  - cruce con Search Console.
- `lib/seo/salud/audit.ts` — lanza el rastreo de la web del alcance y registra el trabajo `seo.salud.audit`. Ese trabajo espera al rastreo re-encolándose cada 2 min, sin tocar el núcleo, y guarda los hallazgos con `syncFindings`.
- `lib/seo/salud/jsonld.ts` — el JSON-LD del negocio, la web y cada local, a partir de la ficha. Nunca incluye FAQ ni reseñas propias; avisa de lo que falta.
- `lib/seo/salud/view.ts` — los datos de la pantalla, solo lectura.
- `lib/seo/salud-actions.ts` — lanzar la auditoría y descartar, aceptar o reabrir un hallazgo, con permiso «edit» y el proyecto de la cuenta.
- `lib/seo/register.ts` y `lib/app-wiring.ts` — alta del módulo SEO al arrancar, en la web y en el trabajador.
- `app/(dashboard)/dashboard/projects/[projectId]/salud/` — la pantalla **Proyectos → Salud**:
  - estado del rastreo y Search Console;
  - hallazgos por área y gravedad, con descartar, aceptar y reabrir;
  - JSON-LD con botón de copiar.
  - Se refresca sola mientras rastrea.
- `app/(dashboard)/dashboard/projects/page.tsx` — botón «Salud» en cada proyecto.
- `lib/seo/salud/process-map.ts`, `lib/architecture-map/registry.ts` y `scripts/check-architecture-map.js` — el nodo y el mapa «Salud técnica» y su comprobación.
- `tests/seo-salud.test.ts` (18 pruebas) y `tests/seguridad.test.ts` (2 acciones nuevas).
- `docs/DISENO-TECNICO-HITO1.md` — el diseño de lo que falta del Hito 1 y necesita esquema, **para aprobar**.
- `docs/ESTADO.md` — §6.37, cabecera, §9, §17, §18 y §19.

## Migraciones aplicadas
Ninguna en esta parte. Desplegada en producción, al principio de la sesión, la **0060** de los cimientos, con su SQL en `docs/sessions/2026-11-23-21-cimientos-plataforma.md`.

## Decisiones técnicas tomadas en auto mode
- **Espera al rastreo desde el módulo.** Para no añadir un aviso de «rastreo terminado» al núcleo, que habría que preguntar, el trabajo de auditoría se vuelve a encolar cada 2 min hasta 8 h. Cuesta unas pocas filas en `jobs` por auditoría.
- **Los tipos de hallazgo, en un archivo sin imports** (`kinds.ts`), para no meter `parse5` y `crypto` en el navegador.
- **Sin IA en la auditoría.** Son reglas fijas, gratis, repetibles y con versión. La IA llegará para el juicio, con el plan de mejora.
- **Huérfanas solo con el rastreo completo**, y el cruce con Search Console pasa a informativo si el rastreo se cortó. Así no hay falsos positivos por el tope de 500 páginas.
- **Contenido y títulos solo en páginas indexables** (200, sin noindex y con canonical propio). Las variantes con canonical a otra URL no cuentan.
- **Regla «servidor lento» añadida tras la prueba real.** cm-iberica.net tardaba una media de 5 s por página. Mide la mediana desde nuestro servidor: aviso a partir de 2,5 s, importante a partir de 5 s.
- **El tipo de negocio del JSON-LD no se guarda** (va en la URL `?tipo=`) hasta tener el expediente, que necesita esquema.
- **Rama `fix/server-status-cliente`.** Contiene una opción `--cliente` para `server-status.sh`, sin commit. Su cambio está guardado en `git stash` («server-status --cliente»). El permiso bloqueó ejecutarla porque amplía el acceso de lectura a producción, y lo decide Enric.

## Qué verificar manualmente
- **En producción, tras desplegar:** Proyectos → el de CM Ibérica → **Salud** → «Rastrear y auditar». Con la web lenta, 500 páginas tardan unos 50 min. Al terminar deberían salir los mismos hallazgos que en local, además de «La web tarda mucho en responder» y el cruce con Search Console, que en local no había.
- Revisar con criterio SEO los hallazgos de CM Ibérica que encontró la prueba local (500 páginas, 654 hallazgos):
  - **Contenido casi duplicado (73) y duplicado (5).** Cada artículo del blog incrusta el texto completo de otros artículos: un bloque de bucle de Elementor con 24 entradas y 7 contenidos de post. Las páginas comparadas tienen el 100 % de los trigramas en común. Es un problema grave y real de la plantilla.
  - **Duplicados exactos (5):** las páginas `/category/*/page/N/` y `/tag/*/page/N/` muestran lo mismo entre categorías.
  - **272 páginas sin meta descripción.** Yoast está instalado pero sin descripciones.
  - **Títulos con «- New CM-Iberica»:** el nombre del sitio en WordPress parece de prueba.
  - **3 enlaces internos rotos.** Uno es una errata: `…senales-de-risgo/`.
  - **27 URLs del sitemap que no dan 200** y **28 páginas con marcado FAQ**.
- El JSON-LD de CM Ibérica en producción: completar en su ficha el logo, la dirección, el teléfono y los perfiles, y elegir el tipo de negocio («Reformas y construcción» o «Contratista general»).
- El Mapa Visual: el nodo «Salud técnica (SEO v2)» en la fila de apoyo, con su mapa.

## Pendientes detectados
- **Aprobar `docs/DISENO-TECNICO-HITO1.md`:** 5 tablas (migración 0061), una del núcleo (`request_interventions`) y Places API. Sin eso no se puede seguir con el expediente, local, plan → encargos, hipótesis ni I+D.
- **El rastreo de 500 páginas de una web lenta tarda unos 50 min.** Para webs grandes convendrá subir el tope o priorizar el sitemap. El trabajo de 8 min por tramo aguanta.
- **La pantalla dice «aplicando la auditoría…» durante 4 min** tras terminar el rastreo, aunque haya acabado antes. Es cosmético: se podría mirar si hay un `seo.salud.audit` pendiente.
- **La extracción del rastreador cuenta todo el texto visible** (incluido el bucle de entradas). Para CM Ibérica es lo correcto, porque Google también lo ve, pero un análisis del «contenido principal» (`<main>`/`<article>`) ayudaría a explicar mejor los duplicados. Eso toca el núcleo (`crawl-extract.ts`): preguntar antes.
- **Datos de prueba locales:** cliente «CM Ibérica (prueba local)» con su proyecto (`db351db3…`), el rastreo de 500 páginas y los hallazgos, solo en la base local. Se pueden borrar cuando Enric lo diga.
- La opción `--cliente` de `server-status.sh`, pendiente de que Enric decida.
