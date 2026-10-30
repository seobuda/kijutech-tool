# Paso 6A · Sección «Equipo» (fichas por persona)
**Fecha:** 2026-10-30  
**Rama:** operaciones  
**Commit:** 51bcd5f0

## Qué se construyó
- `app/(dashboard)/dashboard/operaciones/equipo/page.tsx`, `equipo-view.tsx` — pestaña «Equipo»: lista de fichas con crear, editar, desactivar/reactivar y eliminar (con confirmación), estado vacío, aviso de cambios sin guardar, «Crear ficha» para miembros de ClickUp sin ficha, y el botón «Rellenar con IA» (texto pegado o audio).
- `lib/operaciones/team-profiles.ts` — consultas compartidas: fichas con tipos de trabajo, horario por miembro (`getScheduleMap`), zona del dueño, texto de fichas para el prompt y `canManageProfiles` / `canViewProfile` (hoy solo ve las fichas quien lleva las operaciones; `user_id` queda preparado para que cada miembro vea la suya).
- `lib/operaciones/profile-actions.ts` — acciones de servidor: `saveProfile` (valida zona, hora, días, miembro de ClickUp único y tipos reales), `createProfileForMember`, `setProfileActive`, `deleteProfile`, `aiFillProfile` (propone campos validados contra datos reales; no guarda).
- `app/api/operaciones/equipo-audio/route.ts` — transcribe el audio de «Rellenar con IA» sin guardarlo.
- Una sola fuente de verdad: `notifications.ts` (resumen diario por persona y fecha del aviso) y `digest.ts` (resúmenes del dueño) leen zona, hora de entrada y días laborables de la ficha; los resúmenes se omiten para fichas desactivadas. `telegram-config.ts`, `telegram-actions.ts`, `flow-actions.ts`, `telegram/page.tsx` y `telegram-ajustes.tsx` dejaron de usar `timezone`, `work_start` y `digest_timezone`; la pestaña Telegram los muestra en solo lectura con enlace a Equipo y solo gestiona vinculación y resumen diario.
- `lib/operaciones/note-actions.ts`, `note-types.ts`, `bloc-notas.tsx` — al convertir una nota, las fichas activas con miembro de ClickUp van al mismo prompt (sin llamada extra a la IA); la IA propone responsable y `motivo_responsable`, que se muestra bajo el selector (editable). Un responsable elegido en la nota manda.
- `scripts/ops-prompts-equipo.sql` — prompt `ops_note_to_requests` v5 (`{fichas}`, `motivo_responsable`) y nuevo `ops_profile_fill`.
- `lib/operaciones/process-map.ts` — Mapa Visual actualizado.

## Migraciones aplicadas
Backup previo: `backups/backup_pre_operaciones_equipo_20261030.sql`.
`lib/db/migrations/0030_ops_team_profiles.sql` (SQL aprobado antes de aplicar; con el cambio pedido de NO borrar columnas):
- Crea `ops_team_profiles` (nombre, miembro de ClickUp, `user_id`, puesto, descripción, notas, días, hora de entrada, horas por día, zona, activa) y `ops_team_profile_work_types` (clave del tipo + `primary`/`support`).
- Copia una ficha por cada fila de `ops_telegram_members` (nombre, zona y hora de entrada).
Datos ajustados a mano después: ficha «Kijutech agencia» desactivada (cuenta genérica) y Jesús con 7 h/día.

## Decisiones técnicas tomadas en auto mode
- Las fichas nuevas de miembros de ClickUp no se crean solas al abrir la pantalla (se borrarían y reaparecerían): hay un botón «Crear ficha».
- Ficha desactivada: no recibe resumen diario ni la propone el agente.
- Quien no tiene ficha usa valores por defecto (Santo Domingo, 09:00, L–V).
- Los días laborables de la ficha también rigen el resumen diario personal (antes era L–V fijo). El resumen del dueño sigue siendo L–V.
- La IA de las fichas usa el modelo activo de la pasarela (una sola llamada de completado; es extracción, no requiere embeddings).
- El audio de «Rellenar con IA» se transcribe y se descarta (no se guarda).

## Qué verificar manualmente
- Equipo: crear Eury y Mayelin (a mano o con «Rellenar con IA») marcando sus tipos de trabajo.
- Bloc: con «Sin asignar» (los notas nuevas vienen con tu usuario preseleccionado), convertir una nota sobre un cambio en una web y ver el motivo bajo el responsable.
- Telegram: que la zona y la entrada se ven en solo lectura y que el resumen diario llega a la hora de la ficha.
- Grabar un audio en «Rellenar con IA» (necesita la clave de Gemini con créditos; sin probar).

## Pendientes detectados
- **Migración posterior pendiente:** borrar `ops_telegram_members.timezone`, `ops_telegram_members.work_start` y `ops_telegram_config.digest_timezone`, cuando se compruebe que todo funciona. Hoy el código ya no las usa.
- Las fichas de Eury y Mayelin las crea el usuario; solo Jesús está rellenado (probado con IA).
- Las horas por día y los tipos de trabajo aún no se usan para repartir carga (solo para proponer responsable).
- Al desactivar o borrar una ficha no se cambian encargos ya asignados.
- El usuario de pruebas `ops-test@kijutech.test` y las tareas «[PRUEBA PASO 5]» siguen pendientes de borrar antes de subir a servidor.
