# Módulo Operaciones: conexión ClickUp y vista Equipo hoy
**Fecha:** 2026-10-29  
**Rama:** operaciones  
**Commit:** e52191a5

## Qué se construyó
- `lib/db/schema.ts` — tabla `ops_clickup_connections` (una conexión por tenant, token cifrado).
- `lib/operaciones/clickup.ts` — cliente de solo lectura de la API v2 de ClickUp: workspaces, espacios, listas y reparto de tareas por miembro (vencidas / hoy / sin fecha). "Hoy" se calcula en Europe/Madrid.
- `lib/operaciones/queries.ts` — lee la conexión y descifra el token (solo servidor).
- `lib/operaciones/actions.ts` — guardar token (lo valida contra ClickUp antes), eliminarlo y "Probar conexión".
- `app/(dashboard)/dashboard/operaciones/` — `layout.tsx` + pestañas, `page.tsx` (Equipo hoy), `ajustes/` (formulario del token y resultado de la prueba).
- `modules/operaciones/manifest.json` — manifest del módulo.
- `app/(dashboard)/dashboard/layout.tsx` — entrada "Operaciones" en el menú lateral.
- `lib/architecture-map/registry.ts` — nodo "Operaciones" en el Mapa Visual (`CORE_NODES`).
- No se ha tocado nada del módulo SEO.

## Migraciones aplicadas
`lib/db/migrations/0022_ops_clickup_connections.sql`:

```sql
CREATE TABLE "ops_clickup_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"api_key_encrypted" text NOT NULL,
	"api_key_iv" text NOT NULL,
	"workspace_id" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ops_clickup_connections_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
ALTER TABLE "ops_clickup_connections" ADD CONSTRAINT "ops_clickup_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
```

Backup previo: `backups/backup_pre_operaciones_20261029_1022.sql` (860 KB, 34 tablas).

## Decisiones técnicas tomadas en auto mode
- **Mismo formato de cifrado que las claves de IA:** columnas `api_key_encrypted` y `api_key_iv`; la etiqueta GCM va dentro del texto cifrado, como hace `encryption.ts`.
- **El token se valida contra ClickUp antes de guardarse**, para no almacenar uno roto.
- **Tareas sin fecha:** se cuentan, no se listan.
- **Equipo hoy** lee todas las tareas abiertas del workspace (con subtareas) y las reparte por asignado; si una tarea tiene varios asignados aparece en cada uno. Tope de 30 páginas (3.000 tareas) con aviso en pantalla.
- **Workspace:** se recuerda el primero al probar la conexión; con varios, hay selector por `?ws=`.
- **Despliegue sin reconstruir imagen:** `docker compose up --build` falla en `pnpm rebuild` (`ERR_PNPM_IGNORED_BUILDS`), porque `npm install -g pnpm` instala un pnpm más nuevo. No se tocó `Dockerfile.dev`. Se copiaron los archivos al contenedor con `docker cp`, se ejecutó `pnpm build` dentro y se reinició.

## Qué verificar manualmente
- Entrar en `http://127.0.0.1:3000/dashboard/operaciones/ajustes`, pegar el token y guardar.
- "Probar conexión": debe mostrar tu workspace, espacios y listas.
- `/dashboard/operaciones`: cada miembro con sus vencidas, de hoy y sin fecha; comparar con ClickUp.
- Los enlaces abren la tarea correcta en ClickUp.
- En la base: `select api_key_encrypted from ops_clickup_connections` debe verse cifrado, no el token.
- El nodo "Operaciones" aparece en `/dashboard/architecture`.

## Pendientes detectados
- **No probado con un token real**: no había sesión ni token disponible en esta sesión.
- `Dockerfile.dev` no reconstruye: hay que fijar la versión de pnpm o tolerar `pnpm rebuild` (requiere aprobación).
- Si se reconstruye la imagen desde cero, el código sí está en el repo; el contenedor actual se montó con `docker cp`.
- Cualquier usuario del tenant puede ver, cambiar o borrar el token (sin control de roles; decidido dejarlo para antes de subir a servidor).
- Los límites de ClickUp (100 peticiones/minuto) pueden afectar en workspaces grandes.
- La fecha de entrega "hoy" depende de la zona Europe/Madrid.
