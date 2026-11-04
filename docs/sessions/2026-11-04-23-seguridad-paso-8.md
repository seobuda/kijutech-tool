# Paso 8: seguridad antes de subir a un servidor
**Fecha:** 2026-11-04
**Rama:** feature/seguridad (creada desde feature/paso-7-piloto; sin fusionar en main)
**Commit:** 690a77f2 (último commit sustantivo; antes: aaaacac9 parte A, a3cd16f4 parte B, d97d1d20 partes C y D)

## Qué se construyó

**Parte A · Next.js 16**
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`: Next 15.6 canary → **16.4.5** (última estable), React 19.1 → 19.3.1, con el codemod oficial. Se descartaron los `export const instant = false` que añadía a ~45 páginas (solo valen con Cache Components, que no usamos).
- `middleware.ts` → `proxy.ts` (convención de Next 16). `next.config.ts`: fuera `experimental.ppr` y `clientSegmentCache`.
- `Dockerfile.dev`: copia `pnpm-workspace.yaml` (excepciones de `minimumReleaseAge`: Next 16.4.5 tenía menos de 2 días) y compila con un `POSTGRES_URL` de relleno solo durante el build.

**Parte B · Permisos por rol, en el servidor**
- `lib/auth/permissions.ts`: matriz de roles (`view`/`edit`/`admin`/`users`) y guards (`checkPermission`, `requirePermission`, `getUserIfAllowed`, `requirePagePermission`).
- Todas las acciones de `lib/operaciones/*-actions.ts` y las rutas de API exigen su permiso; `validatedActionWithUser` acepta un permiso como tercer parámetro.
- `lib/seo/access.ts` (nuevo, `server-only`): `assertUserInProjectTenant` (ahora exige editor), `ensure*`, `upsertStageStatus`, `setKwStepStatus`, `requireEditPermission`. Salen de los archivos `'use server'`: dejan de ser endpoints.
- `lib/operaciones/inbox-owner.ts`: Mi bandeja solo para el dueño. `lib/auth/mask.ts`: tokens enmascarados en Ajustes ClickUp, Telegram y claves de IA.
- Páginas de Ajustes ClickUp, Automatizaciones, Telegram y Piloto: solo admin. Layouts de Operaciones y SEO: exigen al menos un rol.

**Parte C · Cerrar puertas**
- `app/(login)/actions.ts`: `signIn` con límite de intentos y mensaje genérico; **eliminados** `signUp`, `removeTeamMember` e `inviteTeamMember`. `/sign-up` y `/pricing` redirigen a `/sign-in`.
- `lib/auth/rate-limit.ts` + tabla `auth_login_attempts` (migración 0037).
- `app/(dashboard)/dashboard/usuarios/` (nuevo): alta de usuarios y listado, solo `super_admin`.
- `lib/db/queries.ts` (`getSafeUser`, `getSafeTeam`), `app/layout.tsx`, `app/api/user/route.ts`, `app/api/team/route.ts`: dejan de exponer el hash.
- `docker-compose.yml`: secretos por `${VAR}`; `.env.example` sin valores; PostgreSQL solo en `127.0.0.1:5433`. `.dockerignore` reescrito (estaba roto). `scripts/rotate-encryption-key.js`.
- `lib/seo/kw-actions.ts`: `disableShareToken` y `regenerateShareToken` + botones en `clusters-board.tsx`.
- `lib/errors.ts` (`publicError`) aplicado a las acciones; `app/error.tsx`; cabeceras de seguridad en `next.config.ts`.

**Parte D · Fachada pública**
- Stripe fuera: rutas, `lib/payments`, dependencia, `lib/db/setup.ts` y `db:setup`; `seed.ts` sin credenciales por defecto (pide `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`).
- `/` redirige a `/sign-in`; «Kijutech Tool» (cabecera, título, login); login, 404 y error en español; `/dashboard` redirige a Operaciones.

**Pruebas y cierre**
- `vitest.config.ts`, `tests/` (`seguridad`, `permisos`, `auditoria`, `http`, `setup`, `fixtures`): **70 pruebas**, `pnpm test`.
- Mapa Visual: nodo «Seguridad» con `lib/auth/security-process-map.ts` (7 pasos) en `lib/architecture-map/registry.ts`; `scripts/check-architecture-map.js` valida sus archivos. **El mapa se actualizó y la comprobación pasó** (13 automatizaciones, 7 tareas, 6 prompts, 33 tablas, 77 pasos, 13 mapas).
- `docs/ESTADO.md` actualizado (cabecera, §2, §3, §4, §10, §12, §13 reescrita, §14–§16, §18–§20) y `CLAUDE.md` (stack y regla de seguridad con `pnpm test` como comprobación de cierre).

## Migraciones aplicadas
Backup previo: `backups/backup_pre_seguridad_20261104.sql` (sin versionar).

`lib/db/migrations/0037_auth_login_attempts.sql` (a mano, con su entrada en `meta/_journal.json`):

```sql
CREATE TABLE IF NOT EXISTS "auth_login_attempts" (
  "id" serial PRIMARY KEY NOT NULL,
  "email" varchar(255) NOT NULL,
  "ip" varchar(64),
  "succeeded" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_login_attempts_email_created_idx" ON "auth_login_attempts" USING btree ("email","created_at");
```

Dato sin migración: se asignó el rol `editor` al usuario de pruebas `ops-test@kijutech.test` (insert en `user_roles`; sin rol ya no puede nada).

## Decisiones técnicas tomadas en auto mode
- **`Dockerfile.dev` copia `pnpm-workspace.yaml`**: sin eso el build fallaba porque pnpm rechaza paquetes de menos de 2 días y Next 16.4.5 salió el día anterior. Se pueden quitar las excepciones cuando pase el plazo.
- **Fuga del hash descubierta y cerrada** (no estaba en el plan): `app/layout.tsx` metía `getUser()` completo en el HTML de todas las páginas con sesión, y `assertUserInProjectTenant` (exportada desde un archivo `'use server'`) devolvía el usuario completo a quien la invocara.
- **`.dockerignore` estaba roto** (comillas invertidas): la imagen llevaba `.env`, `.git` y `backups/`. Reescrito. Como consecuencia el build ya no ve `.env`, por eso `Dockerfile.dev` pasa un `POSTGRES_URL` de relleno solo al `pnpm build`.
- **PostgreSQL en `127.0.0.1:5433`**: hay un PostgreSQL nativo de Windows ocupando el 5432. Se actualizó `POSTGRES_URL` en `.env` (puerto del host).
- **Funciones internas de SEO movidas a `lib/seo/access.ts`** y `ensure*` pasan a no hacer nada si no se puede editar (un lector abre la página sin avanzar el progreso).
- **«Mi bandeja» sin esquema nuevo**: el dueño se deduce de la ficha de equipo enlazada al usuario de ClickUp del token; si no hay enlace, solo `super_admin`.
- **El panel «Team» del starter** (suscripción e invitaciones) se eliminó: `/dashboard` redirige a Operaciones y el menú «Team» pasa a «Usuarios» (solo super_admin).
- **`publicError` filtra por patrones técnicos** (no por tipo de error), porque el código lanza muchos `Error` con texto en español pensado para la persona; es una heurística y se anota como riesgo.
- **CSP sin `script-src`**: una CSP con nonce para los scripts en línea de Next queda para cuando haya servidor.
- **Pruebas con cookies de sesión reales**, no con `getUser` simulado, y con entradas inofensivas (ids que no existen) para que una regresión en un guard no toque datos reales. Un `outcome()` más estricto cuenta como denegación solo un mensaje de permisos. Se comprobó la sensibilidad rompiendo dos guards a propósito.
- **Tests de las acciones de SEO por id** (`assertClusterAccess`…): ahora comprueban el permiso antes de consultar, para no revelar si un id existe.
- **Cambio de dependencias en un contenedor temporal** con volumen anónimo para `node_modules` (nunca `pnpm` en Windows).

## Qué verificar manualmente
1. Iniciar sesión con **tu cuenta super_admin** y recorrer lo que el usuario de pruebas no puede ver: Arquitectura (nodo **Seguridad** con sus 7 pasos), IA, SEO admin, y las pestañas Automatizaciones, Telegram, Piloto y Ajustes ClickUp.
2. **Usuarios** (`/dashboard/usuarios`): crear un usuario `lector` y entrar con él: debe poder ver pero no guardar nada (Bloc, encargos, fichas, SEO), no ver los tokens (en Ajustes solo aparecerían enmascarados, pero un lector ni entra) y no ver Mi bandeja.
3. Con un `editor`: Bloc, encargos y fichas funcionan; Ajustes ClickUp, Automatizaciones, Telegram y Piloto te devuelven al panel.
4. Tras iniciar sesión, **Ajustes ClickUp** y **Telegram** (como admin) muestran el token como `pk_…a1b2`, nunca completo; en **IA** la clave aparece enmascarada.
5. Equipo → **Mi bandeja**: ¿te aparece a ti como dueño? Si no, falta enlazar tu ficha de equipo a tu usuario (hoy solo `super_admin` la ve).
6. Clusters del SEO: botones **Regenerar enlace** y **Desactivar enlace**; abrir el enlace viejo debe dar «no encontrado».
7. `http://127.0.0.1:3000/sign-up` redirige al inicio de sesión; la portada `/` también.
8. Cinco contraseñas mal seguidas bloquean ese correo (usa uno inexistente para no bloquearte).
9. `docker exec kijutech_app pnpm test` → 70 pruebas en verde (reconstruir antes si cambias código). `docker logs kijutech_app` sin `ReferenceError`.
10. **No he probado en el navegador** el alta de usuarios por la interfaz ni las pantallas de super_admin (las cubren las pruebas automáticas, no un clic mío).

## Pendientes detectados
- **Antes de producción:** `scripts/rotate-encryption-key.js` (prueba en seco y `--apply`), `AUTH_SECRET` y contraseña de la BD nuevos, borrar el usuario de pruebas. Los valores de desarrollo siguen en el historial de Git (estuvieron versionados).
- Las **pestañas** de administración siguen visibles para editores (la acción y la página los rechazan); ocultarlas es cosmético.
- No hay pantalla para **cambiar el rol o dar de baja** a un usuario (hoy solo alta).
- `proxy.ts` excluye `/api`: la protección depende de cada ruta (ahora la vigila una auditoría estática).
- **CSP con `script-src`** (nonce) y HTTPS cuando haya servidor. `x-forwarded-for` es falsificable (el límite cuenta por correo).
- Limpieza de plantilla restante: `README.md`, tablas `teams`/`team_members`/`invitations` y columnas `stripe_*` de `teams`, páginas heredadas `general`, `activity` y `security`.
- El PostgreSQL de Windows que ocupa el 5432: confirmar que no es un servicio olvidado (y que ningún script de host apunta a él).
- Las excepciones de `minimumReleaseAge` en `pnpm-workspace.yaml` (Next 16.4.5) se pueden quitar pasados unos días.
- `feature/seguridad` parte de `feature/paso-7-piloto`, que **tampoco está fusionada en `main`**: habrá que fusionar el 7 y luego el 8 (o ambas a la vez) con tu aprobación.
