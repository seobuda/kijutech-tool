# UX fase 3: Equipo humano + IA
**Fecha:** 2026-11-21  
**Rama:** feature/ux-fase3-equipo  
**Commit:** f58c4f3f

## Qué se construyó
- `lib/db/schema.ts` y `lib/db/migrations/0058_equipo_avatares.sql`, con el esquema aprobado por Enric:
  - columna `ops_team_profiles.department_key`;
  - tablas `ops_team_avatars` y `agt_agent_avatars`.
- `lib/equipo/team.ts`: vista de la aplicación que junta a personas (Operaciones) y agentes (Agentes).
  - `getTeamOrg`: el organigrama, con el estado ahora y la foto de cada uno.
  - `getActivityToday`: la actividad del día en un solo registro (botones del equipo, trabajos de los agentes, dudas respondidas y acciones del agente).
  - `activityOf`, `initialsOf` y `hueOf`.
- `lib/equipo/actions.ts`: `setAvatar`, `removeAvatar` y `setPersonDepartment`, con sus guardas de permisos.
- `lib/equipo/avatar-rules.ts`: qué imagen se acepta. Se comprueba el contenido real y que no pase de 200 KB.
- `app/api/equipo/avatar/route.ts`: sirve las fotos, solo con sesión y siempre de la propia cuenta.
- `app/(dashboard)/dashboard/equipo/`:
  - la portada con el organigrama y la actividad de hoy;
  - `[tipo]/[id]/`, la ficha común de persona o agente;
  - `[tipo]/`, que redirige a la portada (las migas de pan enlazan ahí);
  - `member-card.tsx` y `activity-feed.tsx`.
- `components/equipo/`:
  - `member-avatar.tsx`: foto, o iniciales con un color fijo, o un robot para los agentes;
  - `avatar-editor.tsx`: reduce la imagen a 256 px WebP en el navegador;
  - `department-select.tsx`.
- `components/app-shell/nav.ts`: Equipo lleva al organigrama. Subentradas: Organigrama, Tareas y jornada, Agentes de IA, Departamentos e Informes.
- `app/(dashboard)/dashboard/agentes/`: `?editar=<clave>` abre directamente el formulario de ese agente.
- `lib/inicio/panel.ts`: `getMyProfile` devuelve también el id de la ficha.
- Mapa Visual:
  - `lib/operaciones/process-map.ts` y `lib/agentes/process-map.ts`: las dos tablas nuevas;
  - `lib/architecture-map/registry.ts`: el nodo de la fase 3 pasa a construido.
- `tests/equipo-humano-ia.test.ts` (8 pruebas) y `tests/nav-roles.test.ts`, actualizado.
- `docs/ESTADO.md` (§6.33) y `docs/DISENO-UX-REORGANIZACION.md` (§7).

## Migraciones aplicadas
`0058_equipo_avatares.sql`. En local se aplicó con `docker exec kijutech_app pnpm db:migrate`, después de `backups/backup_pre_equipo_avatares_20261121.sql`:

```sql
ALTER TABLE "ops_team_profiles" ADD COLUMN IF NOT EXISTS "department_key" varchar(40);
CREATE TABLE IF NOT EXISTS "ops_team_avatars" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"mime" varchar(30) NOT NULL,
	"data" bytea NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ops_team_avatars_mime_check" CHECK ("ops_team_avatars"."mime" IN ('image/webp', 'image/png', 'image/jpeg'))
);
CREATE TABLE IF NOT EXISTS "agt_agent_avatars" (
	"agent_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"mime" varchar(30) NOT NULL,
	"data" bytea NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agt_agent_avatars_mime_check" CHECK ("agt_agent_avatars"."mime" IN ('image/webp', 'image/png', 'image/jpeg'))
);
ALTER TABLE "ops_team_avatars" ADD CONSTRAINT "ops_team_avatars_profile_id_ops_team_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."ops_team_profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "ops_team_avatars" ADD CONSTRAINT "ops_team_avatars_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "agt_agent_avatars" ADD CONSTRAINT "agt_agent_avatars_agent_id_agt_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agt_agents"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "agt_agent_avatars" ADD CONSTRAINT "agt_agent_avatars_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
```

## Decisiones técnicas tomadas en auto mode
- **Fotos en tablas aparte y en la base de datos**, aprobado por Enric. Así no dependen de ningún servicio externo, entran en las copias diarias y no se cargan en las ~21 consultas que leen fichas enteras.
- **La imagen se reduce en el navegador** a 256 px WebP (con PNG de respaldo) antes de subirla. En el servidor se comprueban los primeros bytes: no se aceptan SVG (pueden llevar código) ni archivos que dicen un tipo y son otro.
- **El organigrama de la portada lo ve todo el equipo, pero el detalle no.** Solo administración ve en qué está cada uno y la actividad del día, y cada persona solo puede entrar en su propia ficha. Es lo acordado en §3 de la propuesta: los datos de otros, solo admin.
- **El gasto de un agente solo lo ve super_admin**, coherente con el Inicio (el admin, sin costes).
- **`lib/equipo/` es una vista de la aplicación**, como el Inicio: lee de Operaciones y de Agentes sin que un módulo importe al otro.
- **Lo que ya tenía pantalla se enlaza, no se duplica**: horario, jornada, tiempos e instrucciones de los agentes. Para estas últimas se añadió `?editar=` a Agentes.
- **El registro de actividad solo recoge lo que hace una persona o un agente.** Los avisos automáticos (recordatorios, copias espejo) se dejan fuera para que no sea ruido.

## Qué verificar manualmente
- **Antes de desplegar:** aprobar el despliegue con migración (`bash scripts/deploy.sh --migrate`), que hace copia de seguridad antes.
- En producción, entrar en Equipo y comprobar el organigrama con los agentes reales.
- Asignar a cada persona su departamento desde su ficha y subir las fotos (o pedir a cada uno que suba la suya).
- Revisar que la actividad de hoy cuenta lo que ha pasado.

Ya revisado en local:
- Se dio el rol admin temporal al usuario de pruebas, con permiso de Enric.
- Portada: Dirección, Gabinete con Operaciones y Cuentas debajo, jefes con su etiqueta y la actividad de hoy.
- En la ficha de Jesús: se subió una imagen generada (quedó en 1,5 KB WebP) y se le asignó Operaciones. Apareció en su departamento.
- Al terminar se quitaron la foto, el departamento y el rol.
- Sin errores en la consola ni en los logs.
- 478/478 pruebas pasan. El Mapa Visual está actualizado (43 tablas) y `node scripts/check-architecture-map.js` pasa.

## Pendientes detectados
- **El registro de actividad** aún no recoge entradas y salidas de jornada ni lo que se hace desde la web (aceptar en Para ti, etc.).
- **Las migas de pan de la ficha** dicen «Persona › Detalle» en vez del nombre.
- **El jefe de operaciones aparece como jefe de Operaciones** aunque está apagado (atenuado, con estado «Apagado»). Es correcto, pero Enric tiene pendiente encenderlo.
- **Siguientes fases:**
  - 4: el cliente en un solo sitio;
  - 5: ayuda y pulido.
