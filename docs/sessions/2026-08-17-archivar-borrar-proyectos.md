# Archivar y borrar proyectos permanentemente
**Fecha:** 2026-08-17  
**Rama:** main  
**Commit:** 21703c3c

## Qué se construyó

Petición de Enric: no había forma de borrar un proyecto para "volver a empezarlo". Antes de construir nada se paró a confirmar diseño con él (ver decisiones abajo), porque un DELETE directo sobre `projects` chocaba con dos foreign keys del núcleo sin `ON DELETE CASCADE`.

- `lib/projects/actions.ts` (archivo ya existente, extendido — no creado de cero): `archiveProject`, `restoreProject`, `deleteProjectPermanently(projectId, confirmationText)`, y el guard compartido `assertCanManageProject` (admin/super_admin, mismo tenant que el proyecto)
- `lib/db/queries.ts`: `getProjectsForUser()` ahora excluye `status = 'archived'`; nueva `getArchivedProjectsForUser()`
- `app/(dashboard)/dashboard/projects/page.tsx`: botón "Archivar" por fila (solo admin/super_admin) + enlace a "Proyectos archivados"
- `app/(dashboard)/dashboard/projects/archive-project-button.tsx`: confirm() del navegador antes de archivar
- `app/(dashboard)/dashboard/projects/archived/page.tsx` (nuevo, guardia server-side que redirige si no es admin/super_admin), `restore-project-button.tsx`, `delete-project-button.tsx` (expande un campo que exige escribir "BORRAR" antes de habilitar la confirmación)

## Migraciones aplicadas

Ninguna. Se evaluó explícitamente añadir `ON DELETE CASCADE` a `user_roles.project_id` y `project_modules.project_id` (núcleo) para simplificar el borrado, pero se descartó junto con Enric a favor de borrar esas filas explícitamente dentro de una transacción en `deleteProjectPermanently`, para no tocar el esquema del núcleo. Las tablas del módulo SEO (`seo_stage_progress`, `seo_kickoff_answers`, `seo_audit_findings`, `seo_onboarding_checklist`) ya tenían `ON DELETE CASCADE` desde que se crearon, así que no necesitaron cambio.

## Decisiones técnicas tomadas en auto mode

- **Dónde vive el guard de permisos**: `assertCanManageProject` se creó en `lib/projects/actions.ts` (núcleo) en vez de reutilizar el patrón `assertSeoAdmin` de `lib/seo/admin-actions.ts`, porque borrar un proyecto no es una acción del módulo SEO — es una capacidad del núcleo. Duplica el criterio de roles (`admin`/`super_admin`) pero mantiene la frontera núcleo/módulo intacta, en línea con la regla del CLAUDE.md de no dejar que un módulo se filtre hacia el núcleo ni al revés.
- **Solo se puede borrar permanentemente un proyecto ya archivado**: `deleteProjectPermanently` valida `project.status === 'archived'` antes de aceptar la palabra de confirmación, para que no exista una ruta directa de "activo -> borrado" que salte el paso intermedio de archivado (aunque hoy no hay UI que lo permita, la validación vive en el propio action, no solo en la UI).

## Qué verificar manualmente

- Con un usuario `admin` o `super_admin`: en `/dashboard/projects`, cada fila debe tener un botón "Archivar" (con confirmación) y debe verse el enlace "Proyectos archivados".
- Con un usuario `editor` o `lector`: no debe verse ni el botón "Archivar" ni el enlace a archivados; si se entra directamente a `/dashboard/projects/archived` por URL, debe redirigir a `/dashboard/projects`.
- Archivar un proyecto: debe desaparecer de la lista principal y aparecer en "Proyectos archivados".
- Desde archivados: "Restaurar" debe devolverlo a la lista principal sin pérdida de datos.
- Desde archivados: "Borrar permanentemente" sin escribir "BORRAR" debe mantener el botón de confirmación deshabilitado; al escribirlo y confirmar, el proyecto debe desaparecer del todo.
- Tras un borrado permanente, comprobar en la base de datos que no quedan filas huérfanas en `user_roles`, `project_modules`, `seo_stage_progress`, `seo_kickoff_answers`, `seo_audit_findings` ni `seo_onboarding_checklist` para ese `project_id`.

## Pendientes detectados

- `seed-knowledge-cards.sql` sigue en la raíz del repo sin trackear en git (arrastrado de una sesión anterior) — sigue pendiente decidir si se versiona o se descarta.
- El layout de la fila en "Proyectos archivados" no está pulido para cuando se expande el panel de confirmación "BORRAR" junto al botón "Restaurar" — funciona pero visualmente podría reorganizarse mejor (por ejemplo, ocultando "Restaurar" mientras se confirma el borrado).
