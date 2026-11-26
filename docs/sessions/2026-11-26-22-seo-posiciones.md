# SEO parte 4: posiciones en Google (y el informe pasa al final)
**Fecha:** 2026-11-26  
**Rama:** feature/seo-posiciones  
**Commit:** 56c3d2f2

## Qué se construyó
- **Decisión de Enric:** el informe mensual pasa al final. Antes habrá una parte nueva de **integración con GoHighLevel**, para leer los leads de la subcuenta de cada cliente y de los formularios incrustados en su web, y montar con ellos un panel en vivo (`docs/LISTA-CERRADA-SEO.md`).
- `lib/db/migrations/0069_seo_posiciones.sql` y `schema.ts`: tablas `seo_rank_keywords` (semilla) y `seo_rank_checks` (filas compactas con el estado de cada tarea).
- `lib/core/capabilities.ts`: `SerpSource` gana `postTasks`, `getTask`, `locations` y `volumes`.
- `lib/agentes/integrations.ts` y `register.ts`: cola asíncrona de DataForSEO, con el `status_code` de cada tarea y el emparejamiento solo por etiqueta. También `summarizeSerpItems`, la lista de ubicaciones cacheada y los volúmenes.
- `lib/seo/posiciones/rules.ts` (reglas puras): semilla, poblaciones de la zona, idioma por búsqueda, ubicación, lectura de la SERP para el cliente (el mapa por dominio o por nombre, sin fichas pagadas), caídas con margen y cuota de visibilidad.
- `lib/seo/posiciones/posiciones.ts`:
  - **semilla:** solo añade;
  - **envío semanal:** filas pendientes primero, tope antes de enviar y gasto apuntado al enviar;
  - **recogida por id:** caduca a las 48 h;
  - **hallazgos** con margen.
- `lib/seo/posiciones/view.ts` y `lib/seo/posiciones-actions.ts`: añadir, pausar y quitar búsquedas, y «Consultar ahora».
- Proceso `seo.posiciones` en «Vigilancia automática» (`lib/seo/vigilancia/`).
- Tipos `seo.rank_drop` y `seo.lost_local_pack`, técnica `recuperar_mapa`, y la fuente en Salud, el plan y el dossier del estratega.
- **UI:** pestaña **Posiciones** (`projects/[projectId]/posiciones/`), con resumen, cuota de visibilidad y una tabla con posición, cambio, mapa, IA, evolución y volumen.
- `tests/seo-posiciones.test.ts` (12 pruebas), Mapa Visual (paso «Posiciones en Google»), `docs/ESTADO.md` §6.49 y `docs/DISENO-SEO-POSICIONES.md`.

## Migraciones aplicadas
**0069_seo_posiciones.sql** (aditiva): crea `seo_rank_keywords` (índice único por proyecto, búsqueda y dispositivo; CHECK de origen, estado y dispositivo) y `seo_rank_checks` (índice único por búsqueda y ejecución; índices por proyecto y fecha y de las filas abiertas; CHECK de estado). El SQL completo está en el archivo. Backup local previo: `backups/backup_pre_seo_posiciones_20261126.sql`.

## Decisiones técnicas tomadas en auto mode
- **Auditoría Opus con la documentación de DataForSEO.** Se cobra al enviar y `task_get` es gratis durante 30 días, así que:
  - el gasto se apunta al enviar;
  - se recoge por el id guardado;
  - hay filas pendientes con clave única;
  - el idioma va por búsqueda;
  - las caídas tienen margen (dos semanas seguidas);
  - el mapa no se busca solo por dominio.
- **Revisor de código** (bloqueó; corregido):
  - las filas pendientes huérfanas bloqueaban el proyecto para siempre: ahora se cierran pasada 1 h;
  - el envío va protegido y, si falla, apunta el coste estimado;
  - la consulta manual y la programada usan la misma clave, así que nunca corren a la vez;
  - el volumen apunta su gasto tras cada llamada;
  - las tareas se emparejan solo por etiqueta;
  - si falta el coste de una tarea, se apunta el estimado.
- **Coste:** unos 0,0018 $ por búsqueda y semana (cola estándar, 2 páginas y AI Overview), unos 0,39 $ al mes con 50 búsquedas, más el volumen mensual (unos 0,06-0,08 $).

## Qué verificar manualmente
- CM Ibérica → **Posiciones** → «Consultar ahora». En 5-45 minutos (cola estándar de DataForSEO) aparecen la posición, el mapa y la IA de cada búsqueda.
- En Salud → Vigilancia automática aparece «Posiciones en Google», cada 7 días.
- En Salud → Gasto en datos aparece «posiciones: consulta semanal».

## Pendientes detectados
- **Por verificar con la cuenta real [NV]:**
  - los códigos 40601 y 40602 de `task_get` (tarea en cola);
  - el coste que devuelve `task_post`;
  - que la ubicación España admita el idioma `ca`.
- `pingback_url` para recoger antes, ahora que hay servidor público.
- `location_coordinate` y el geo-grid: parte 5 (Local).
