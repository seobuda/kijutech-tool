# Configuración global del módulo SEO (tabla seo_settings)
**Fecha:** 2026-08-17  
**Rama:** main  
**Commit:** 674152d4

## Qué se construyó

Sesión corta, un único commit sustantivo (674152d4), directamente sobre `main` (la fusión de Fase B ya había cerrado `feature/fase-b-seo` en una sesión anterior).

- `lib/db/schema.ts`: tabla `seoSettings` (id, key único, value nullable, label, description nullable, updated_at)
- `lib/db/migrations/0008_third_puff_adder.sql`: `CREATE TABLE seo_settings` — SQL mostrado a Enric antes de aplicar
- `lib/db/seed-seo.ts`: siembra la fila `tutor_url` -> `https://claude.ai` (idempotente, `onConflictDoNothing`); ejecutado manualmente tras el build (`pnpm db:seed-seo`)
- `lib/seo/queries.ts`: `getAllSeoSettings()`, `getSeoSettingValue(key)`
- `lib/seo/admin-actions.ts`: `updateSeoSetting(key, value)` restringida a `super_admin` vía nuevo `assertSuperAdmin` (distinto de `assertSeoAdmin`, que también deja pasar a `admin`); se extrajo `getAssignedTenantRoles()` para no duplicar la query de roles entre ambos guards
- `app/(dashboard)/dashboard/seo/admin/settings/page.tsx` + `setting-row.tsx`: pantalla nueva con guardia server-side (redirige si no es `super_admin`), lista de settings con label/descripción/valor, cada fila con su propio input y botón "Guardar" independiente
- `app/(dashboard)/dashboard/layout.tsx`: entrada "Configuración SEO" en el sidebar, visible solo para `super_admin` (antes el sidebar solo distinguía el bloque `admin`/`super_admin` conjunto para "Admin SEO")
- `seo-assistant-panel.tsx` / `seo-wizard-shell.tsx` / `seo/layout.tsx` (wizard de proyecto): el botón "Abrir Tutor Claude" deja de tener la URL hardcodeada — se lee `tutor_url` en el layout del wizard (Server Component) y se pasa por props hasta el panel, con fallback a `https://claude.ai` si el setting no existiera

## Migraciones aplicadas

**0008_third_puff_adder.sql** (SQL mostrado a Enric antes de aplicar, backup previo confirmado):

```sql
CREATE TABLE "seo_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" text,
	"label" varchar(200) NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seo_settings_key_unique" UNIQUE("key")
);
```

Backup previo: `backups/backup_pre_seo_settings_20260817.sql` (no versionado, excluido por `.gitignore`).

## Decisiones técnicas tomadas en auto mode

- **Longitudes de `varchar`**: el pedido especificaba solo "varchar" para `key` y `label` sin longitud. Se usó `varchar(100)` para `key` (consistente con `item_key`/`question_key` en otras tablas del módulo) y `varchar(200)` para `label` (consistente con `title` de `seo_knowledge_cards`), sin confirmación explícita por ser una decisión de bajo riesgo y reversible.
- **`assertSuperAdmin` como guard separado de `assertSeoAdmin`**: en vez de parametrizar `assertSeoAdmin` con una lista de roles permitidos, se creó una función separada más explícita, y se extrajo la query de roles compartida (`getAssignedTenantRoles`) a una función interna para no duplicarla. Se prefirió por legibilidad — quien lea `updateSeoSetting` ve directamente `assertSuperAdmin` sin tener que mirar qué argumento se le pasó.
- **Fallback a `https://claude.ai` si el setting no existe**: por si algún entorno no ha ejecutado `db:seed-seo` todavía, para que el botón "Abrir Tutor Claude" no rompa ni quede vacío.

## Qué verificar manualmente

- Entrar en `/dashboard/seo/admin/settings` con un usuario `super_admin`: debe verse la fila "URL del Tutor Claude" con su descripción y valor actual (`https://claude.ai`).
- Entrar con un usuario `admin` (no `super_admin`): debe redirigir a `/dashboard` — la pantalla es más restrictiva que `/dashboard/seo/admin/cards`.
- Comprobar que el enlace "Configuración SEO" en el sidebar solo aparece para `super_admin`, no para `admin`.
- Cambiar el valor de `tutor_url` a otra URL, guardar, y comprobar en el wizard de cualquier proyecto que el botón "Abrir Tutor Claude" de una card `tutor_reminder` abre la nueva URL.
- Confirmar que `pnpm db:seed-seo` es idempotente: ejecutarlo dos veces no duplica la fila `tutor_url` ni sobrescribe un valor ya editado manualmente.

## Pendientes detectados

- El seed de `tutor_url` no se ejecuta automáticamente en el flujo de `docker compose up --build` — hay que lanzar `pnpm db:seed-seo` a mano tras cada entorno nuevo (mismo patrón que el registro del módulo en `modules`, no es una regresión de esta sesión).
- `seed-knowledge-cards.sql` sigue en la raíz del repo sin trackear en git (se ejecutó en una sesión anterior para poblar las knowledge cards de ejemplo) — pendiente de decidir si se versiona o se descarta.
