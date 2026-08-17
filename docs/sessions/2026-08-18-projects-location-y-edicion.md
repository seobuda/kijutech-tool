# Añade projects.location y edición de proyectos
**Fecha:** 2026-08-18
**Rama:** feature/fase-c-keyword-research
**Commit:** 241796c2

## Qué se construyó

Petición de Enric: resolver el placeholder `[ubicación del proyecto]` que quedó pendiente en la sesión anterior de Keyword Research, añadiendo un campo de ubicación real a los proyectos. Un único commit sustantivo (241796c2), sobre la misma rama de Fase C.

- `lib/db/schema.ts`: `projects.location` (varchar 255, nullable) — toca el núcleo, migración mostrada y confirmada antes de aplicar
- `lib/projects/actions.ts`: `createProject` incluye `location`; nueva `updateProject` (no existía ninguna acción de edición de proyecto hasta ahora)
- `lib/db/queries.ts`: `getProjectById(projectId)` con verificación de tenant, para precargar el formulario de edición
- `app/(dashboard)/dashboard/projects/project-form.tsx` (nuevo, compartido entre crear y editar): sustituye al formulario inline que vivía dentro de `new/page.tsx`
- `/dashboard/projects/[projectId]/edit` (ruta nueva): antes no existía ninguna forma de editar un proyecto ya creado
- Botón "Editar" añadido en la lista de `/dashboard/projects`, junto a "Abrir SEO"
- `lib/seo/kw-instructions.ts` / `lib/seo/kw-actions.ts`: `buildSeRankingInstructions` ahora recibe `location` y lo usa en el bloque de instrucciones del paso 1 de Keyword Research en vez del placeholder entre corchetes

## Migraciones aplicadas

**0010_keen_ronan.sql** (SQL mostrado a Enric antes de aplicar, backup previo confirmado):

```sql
ALTER TABLE "projects" ADD COLUMN "location" varchar(255);
```

Backup previo: `backups/backup_pre_projects_location_20260818.sql`.

## Decisiones técnicas tomadas en auto mode

- **Se construyó la edición de proyectos completa, no solo el campo `location`**: el pedido decía "actualiza el formulario de creación y edición de proyectos en /dashboard/projects/new", pero esa ruta es solo la de creación — no existía ninguna pantalla de edición. En vez de pedir aclaración, se interpretó que Enric asumía que ya existía (o la quería), y se construyó `updateProject` + la ruta `/dashboard/projects/[projectId]/edit` + un botón "Editar" en la lista, reutilizando el mismo formulario para ambos casos. Esto además ya lo pedía la "Regla de UX mínima" añadida a CLAUDE.md la sesión anterior ("¿Se puede editar? → botón accesible desde la lista y desde el detalle").
- **Permiso de `updateProject`**: se le dio el mismo nivel que `createProject` — cualquier miembro autenticado del tenant, sin restricción de rol — en vez de restringirlo a admin/super_admin como archive/restore/delete. Editar el nombre, cliente, dominio o ubicación de un proyecto no es una acción destructiva ni de las que CLAUDE.md pide tratar con más cuidado, así que se mantuvo la misma confianza que ya existía para la creación.
- **Fallback al placeholder si `location` es NULL**: proyectos creados antes de esta migración no tienen ubicación. En vez de generar el texto de instrucciones con un hueco vacío o un `null` literal, se mantiene `[ubicación del proyecto]` como aviso visual de que falta rellenar ese dato — desaparece en cuanto se edita el proyecto y se guarda una ubicación.

## Qué verificar manualmente

- Entra en `/dashboard/projects/new`: debe aparecer el campo "Ubicación objetivo" con el placeholder "Ej: Barcelona, Sant Cugat, España...", debajo de "Dominio".
- Crea un proyecto con ubicación, luego pulsa "Editar" desde la lista → el formulario debe precargar todos los campos, incluida la ubicación.
- Edita el nombre o la ubicación y guarda → confirma que vuelve a la lista y los cambios se reflejan.
- En un proyecto CON ubicación guardada: completa el paso 1 de Keyword Research y confirma que las instrucciones generadas para SE Ranking usan la ubicación real en vez de `[ubicación del proyecto]`.
- En un proyecto SIN ubicación (uno creado antes de esta sesión, si lo hay): confirma que el placeholder entre corchetes sigue apareciendo tal cual, sin romper el texto generado.

## Pendientes detectados

Ninguno nuevo — el pendiente de la sesión anterior ("`[ubicación del proyecto]` sin resolver") queda cerrado por este cambio, con el matiz del fallback documentado arriba para proyectos sin ubicación.
