# Caché de ClickUp, consulta agrupada y contador de peticiones
**Fecha:** 2026-10-29  
**Rama:** operaciones  
**Commit:** (ver historial de la rama)

## Qué se construyó
- `lib/operaciones/clickup.ts` (reescrito) — único punto de salida a ClickUp (`cuFetch`): contador por minuto (espera al llegar al 80 % del límite de 100), reintento con espera ante un 429 (hasta 3 veces), registro de cada petición en `ops_clickup_requests` (con borrado automático de los de más de 24 h, como mucho cada 10 min) y límite de 20 s por llamada. Incluye las consultas agrupadas: `fetchDueTasks` (workspace, filtrada por `due_date_lt`, espacios y responsables) y `countTasksWithoutDate`.
- `lib/operaciones/structure.ts` — caché en base de datos de espacios, listas y miembros: `getStructure`, `syncStructure`, `ensureFresh` (refresco en segundo plano si tiene más de 1 hora) y `setSelectedSpaces`. En la primera sincronización todos los espacios quedan seleccionados.
- `lib/operaciones/team-today.ts` + `team-actions.ts` — caché de 2 minutos en memoria con botón «Actualizar ahora», y «sin fecha» calculado en segundo plano cada 30 minutos (stale-while-revalidate), mostrado después de pintar.
- Páginas: Bloc de notas y Nuevo encargo leen solo de la caché; Equipo hoy pinta al instante (Suspense) y carga las tareas después; Ajustes tiene la lista de espacios con casillas, «Actualizar desde ClickUp» y la tabla de peticiones de la última hora.
- `note-actions.ts` — convertir una nota y «Enviar todo» usan las listas y los miembros de la caché (cero llamadas a ClickUp).
- `nuevo-encargo-form.tsx` — el responsable sale de los miembros del workspace en caché (ya no se pide por lista).
- `CLAUDE.md` — regla permanente de caché y consultas agrupadas.

## Migraciones aplicadas
`lib/db/migrations/0025_ops_clickup_cache.sql`: tablas `ops_clickup_spaces`, `ops_clickup_lists`, `ops_clickup_members`, `ops_clickup_requests` (con índice por cuenta y hora) y cuatro columnas nuevas en `ops_clickup_connections` (`workspace_name`, `me_clickup_id`, `me_username`, `structure_synced_at`). Backup previo: `backups/backup_pre_operaciones_cache_20261029_1154.sql` (914 KB, 39 tablas).

## Decisiones técnicas tomadas en auto mode
- El estado compartido (contador, caché de 2 min, «sin fecha», bloqueo de sincronización) está en `globalThis`, porque las páginas y las acciones de servidor cargan el módulo por separado. Sin tabla ni Redis: se pierde al reiniciar el servidor (la primera visita tras reiniciar recalcula).
- El contador es por proceso: asume un único servidor.
- El responsable de «Nuevo encargo» ya no se limita a los miembros de esa lista, sino a todos los del workspace; si ClickUp rechaza a alguien, el error sale en el encargo.
- Equipo hoy ya no muestra el email de cada persona (la caché guarda solo nombre).
- Al quitar el token también se borra la caché de espacios, listas y miembros.
- `due_date_lt` incluye todo lo vencido y lo de hoy en una sola consulta, que se reparte después por persona en el servidor.

## Qué verificar manualmente
- Ajustes → desmarcar un espacio y guardar: desaparece de los desplegables del Bloc; al volver a marcarlo recupera sus listas.
- Ajustes → tabla de peticiones de la última hora: debe quedar en cifras bajas al navegar entre pestañas.
- Equipo hoy: la página sale al instante con «Cargando…»; «sin fecha» pasa de «…» a un número unos segundos después; «Actualizar ahora» fuerza una consulta nueva.

## Pendientes detectados
- No se ha provocado un 429 real para probar el reintento (el contador lo evita); la lógica está revisada pero no ejercitada con una respuesta real.
- «Sin fecha» sigue costando 9 peticiones cada 30 min (ClickUp no tiene filtro para tareas sin fecha).
- Tras reiniciar el servidor, la primera visita a Equipo hoy vuelve a costar 1 petición y el recálculo de «sin fecha» otras 9.
- Si el contenedor se escala a varias instancias, el contador y las cachés en memoria dejarán de ser compartidos.
