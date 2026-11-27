# Fuentes de novedades SEO editables
**Fecha:** 2026-11-28  
**Rama:** feature/seo-fuentes  
**Commit:** 11c4ec06

## Qué se construyó
- `lib/db/migrations/0082_seo_fuentes.sql`, `lib/db/schema.ts`: tabla `seo_sources`.
- `lib/seo/id/fuentes-rules.ts` (nuevo, puro): fuentes de serie, niveles, dominio por nivel, normalizar la URL, canal de YouTube (por URL o por la página), RSS declarado por una web, rutas típicas y clave estable.
- `lib/seo/id/fuentes.ts` (nuevo): lectura pública (`fetchPublic`), crear las de serie, listar, detectar y comprobar una fuente, añadir, editar y quitar.
- `lib/seo/id/sources.ts`: lector de Atom, `parseFeed` (RSS o Atom), título del feed; adiós a la lista fija.
- `lib/seo/id/watch.ts`: lee las fuentes de la cuenta de 4 en 4, guarda el estado de cada una y separa lo oficial de lo demás.
- `lib/seo/fuentes-actions.ts` (nuevo): comprobar, añadir, editar, quitar y «Leer ahora» (admin).
- `app/(dashboard)/dashboard/seo/fuentes/` (nuevo): pantalla «Fuentes de novedades SEO».
- `app/(dashboard)/dashboard/conocimiento/novedades/page.tsx`: «Novedades de SEO» con oficiales y blogs por separado, nombre real de cada fuente y enlace a Fuentes.
- `components/app-shell/nav.ts`: entrada en Ajustes y nombre de la miga.
- Mapa Visual: pasos `seo-id` (SEO) y `kb-novedades` (Conocimiento); comprobación pasada.
- `tests/seo-fuentes.test.ts` (nueva, 8 pruebas).

## Migraciones aplicadas
`lib/db/migrations/0082_seo_fuentes.sql` (aditiva; copia local previa `backups/backup_pre_seo_fuentes_20261127.sql`):

```sql
CREATE TABLE IF NOT EXISTS "seo_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "key" varchar(40) NOT NULL,
  "label" varchar(160) NOT NULL,
  "kind" varchar(16) NOT NULL,
  "input_url" text NOT NULL,
  "feed_url" text NOT NULL,
  "level" varchar(12) DEFAULT 'reputada' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "builtin" boolean DEFAULT false NOT NULL,
  "last_checked_at" timestamp,
  "last_ok_at" timestamp,
  "last_error" text,
  "items_total" integer DEFAULT 0 NOT NULL,
  "created_by" varchar(120),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "seo_sources_key_unique" UNIQUE ("tenant_id", "key"),
  CONSTRAINT "seo_sources_kind_check" CHECK ("kind" IN ('google_status', 'rss', 'youtube')),
  CONSTRAINT "seo_sources_level_check" CHECK ("level" IN ('oficial', 'reputada', 'comunidad'))
);
CREATE INDEX IF NOT EXISTS "seo_sources_tenant_idx" ON "seo_sources" ("tenant_id", "active");
```

## Decisiones técnicas tomadas en auto mode
- **Qué se puede añadir** (Enric no sabía si dominio, RSS o YouTube): las tres cosas con un solo campo. Se detecta el tipo: RSS/Atom directo; web o blog (RSS que declara la página o rutas típicas); canal de YouTube (feed público de vídeos, sin clave de API). X, LinkedIn y boletines quedan fuera (no tienen RSS público).
- **Lo no oficial, aparte** (dominio `seo_ext`): los blogs publican mucho y, en la bitácora oficial, dispararían avisos por Telegram («core update» en un titular) y llenarían el resumen semanal. Se guardan siempre como «novedad» y se enseñan como opinión; el criterio sigue siendo lo oficial (plan del Jefe SEO, §5).
- **Fuentes de serie comprobadas desde el servidor** (14 de 16 candidatas). Search Engine Land y Screaming Frog devuelven 403 de Cloudflare a los robots: no se incluyen (no se salta la protección).
- **Sin protocolo completo:** tabla nueva dentro del módulo SEO, sin núcleo ni coste (lectura sin IA). La página de Conocimiento importa de `lib/seo` como otras páginas de `app/`.
- Bug encontrado por la prueba y la lectura real: el lector de Atom tenía `\b` sin escapar dentro de un `RegExp` de plantilla (YouTube y Moz salían vacíos); corregido.

## Qué verificar manualmente
- Ajustes → Fuentes de novedades SEO: 14 fuentes en dos niveles; «Leer ahora» y, en un minuto, la última lectura de cada una.
- Añadir `https://www.youtube.com/@AhrefsCom` (dirá que ya está) y otra web, por ejemplo un blog SEO en español.
- Conocimiento → Novedades: dos secciones (oficiales y blogs, marcados como opinión).

## Pendientes detectados
- El investigador (D5) aún no lee `seo_ext`: lo hará con triaje a la base de conocimiento.
- Si una web cambia de RSS, la fuente falla hasta que se edite (se ve el error en la pantalla; no hay «volver a detectar»).
- Search Engine Land y Screaming Frog: si publican un RSS accesible, se pueden añadir a mano.

## Revisor de código
Aprobar con cambios, sin graves. Arreglados los tres medios: la respuesta se corta a 3 MB mientras se descarga (antes se leía entera); enlaces de los feeds solo http(s) (nada de «javascript:» ni rutas relativas; prueba añadida); tope de 30 s para comprobar una fuente nueva (rutas adivinadas a 5 s) y trabajo de vigilancia a 420 s con 40 fuentes como máximo. Menor arreglado: solo el panel de incidencias y el blog de Search Central pueden avisar de una actualización de Google. Apuntado: cambiar el nivel de una fuente no mueve lo ya guardado a la otra sección.
