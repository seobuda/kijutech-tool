# Memoria de cliente y contactos (paso A de «Operaciones como puesto de trabajo»)
**Fecha:** 2026-11-06  
**Rama:** feature/memoria-cliente-email  
**Commit:** 9bfeb70a

## Qué se construyó
- `lib/db/schema.ts`: tablas `ops_client_senders` (correo exacto o dominio de cada cliente) y `ops_client_memory` (hechos con tipo, estado propuesto/aceptado/descartado, origen y quién/cuándo lo decidió).
- `lib/db/migrations/0038_ops_client_memory.sql` y su entrada en `meta/_journal.json`: crea las dos tablas (con `IF NOT EXISTS`, como la 0036).
- `lib/operaciones/client-memory-rules.ts` (nuevo): reglas puras: normalizar correos y dominios, rechazar dominios públicos (gmail.com…), validar el texto de la memoria (máx. 1000 caracteres, sin contraseñas) y `matchSender` (de qué cliente es un remitente).
- `lib/operaciones/client-memory-actions.ts` (nuevo, `'use server'`): listar, añadir, editar, aceptar/descartar y borrar datos y contactos. Cada acción llama a su guard y filtra por la cuenta del usuario.
- `app/(dashboard)/dashboard/operaciones/clientes/client-memoria.tsx` (nuevo) y `clientes-view.tsx`: sección «Contactos y memoria» dentro de la ficha de un cliente ya guardado. Estados vacíos, confirmación al eliminar, bloque de «propuestos por la IA» pendientes de revisar, «Descartados» recuperables.
- `lib/operaciones/process-map.ts`: nuevo paso «Memoria y contactos de cliente» (en curso) en el Mapa Visual.
- `tests/client-memoria.test.ts` (nuevo, 16 pruebas de las reglas) y `tests/seguridad.test.ts` (acciones nuevas en las listas de permisos por rol y un bloque de memoria con aislamiento entre cuentas).

El Mapa Visual se actualizó y `node scripts/check-architecture-map.js` pasó (35 tablas, 78 pasos en 13 mapas).

## Migraciones aplicadas
`0038_ops_client_memory.sql`, aplicada **solo en la base local** (en producción se aplicará al desplegar esta rama). Backup previo: `backups/backup_pre_memoria_cliente_20261106.sql` (no versionado).

```sql
CREATE TABLE IF NOT EXISTS "ops_client_senders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "ops_clients"("id") ON DELETE CASCADE,
  "kind" varchar(10) NOT NULL,
  "value" varchar(255) NOT NULL,
  "name" varchar(255),
  "role" varchar(120),
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ops_client_senders_unique" UNIQUE("tenant_id", "kind", "value"),
  CONSTRAINT "ops_client_senders_kind_check" CHECK ("kind" IN ('email', 'domain'))
);
CREATE INDEX IF NOT EXISTS "ops_client_senders_client_idx" ON "ops_client_senders" USING btree ("client_id");
CREATE TABLE IF NOT EXISTS "ops_client_memory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "ops_clients"("id") ON DELETE CASCADE,
  "kind" varchar(20) NOT NULL,
  "text" text NOT NULL,
  "status" varchar(12) DEFAULT 'aceptado' NOT NULL,
  "source_type" varchar(12) DEFAULT 'manual' NOT NULL,
  "source_id" varchar(100),
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ops_client_memory_kind_check" CHECK ("kind" IN ('preferencia', 'promesa', 'decision', 'contexto', 'restriccion')),
  CONSTRAINT "ops_client_memory_status_check" CHECK ("status" IN ('propuesto', 'aceptado', 'descartado')),
  CONSTRAINT "ops_client_memory_source_check" CHECK ("source_type" IN ('manual', 'email', 'nota', 'encargo'))
);
CREATE INDEX IF NOT EXISTS "ops_client_memory_client_idx" ON "ops_client_memory" USING btree ("client_id", "status");
```

## Decisiones técnicas tomadas en auto mode
- **Migración escrita a mano, no con `pnpm db:generate`:** al generarla, drizzle-kit produjo SQL para docenas de tablas que ya existen (`ops_clients`, `ops_services`, `ops_suggestions`…) porque las migraciones 0030–0037 no tienen snapshot y compara contra el de la 0029. La descarté sin aplicarla (el diario y el snapshot generados se borraron) y escribí solo mis dos tablas, igual que las anteriores. Queda anotado en ESTADO.md: no usar `db:generate` hasta rehacer los snapshots.
- **Dos tablas nuevas y la ficha intacta:** no añadí columnas a `ops_clients`; la memoria y los contactos son aparte (aditivo, sin tocar datos existentes).
- **Permisos:** ver, añadir, editar, aceptar y descartar piden `edit`; borrar de verdad pide `admin` (como borrar fichas). Un editor corrige descartando sin perder el dato.
- **Dominios públicos:** se rechazan como dominio de cliente (si no, cualquiera con Gmail parecería ese cliente); solo valen como correo exacto. Un subdominio no hereda el dominio y, si dos clientes reclaman lo mismo, `matchSender` no adivina.
- **Contexto de IA todavía sin conectar:** no modifiqué ningún prompt (`ops_note_to_requests`). La memoria la consumirá la entrada por email (paso B), para no cambiar el comportamiento actual sin tener cómo medirlo.
- **Pruebas sin servidor:** `pnpm test` pasa las 83 que no necesitan servidor. Las 8 de `tests/http.test.ts` hacen peticiones a `127.0.0.1:3000` y fallan sin él (no es regresión). **No arranqué la app local** porque la base local tiene el mismo bot de Telegram en polling y `telegram-worker.ts` ejecutaría `deleteWebhook` sobre producción.
- **Verificación en el navegador con una copia desechable:** creé `kijutech_verify` (copia de la local) sin `ops_telegram_config`, `ops_clickup_connections`, `ops_clickup_outbox` ni `ops_notifications`, y con la vigilancia de ClickUp apagada; levanté la app contra ella con el usuario de pruebas de `.env`. Al terminar eliminé el contenedor y la base. Se comprobó después que el webhook de producción seguía intacto.

## Qué verificar manualmente
- En la app (tras desplegar): Operaciones → Clientes → Editar un cliente → sección «Contactos y memoria»: añadir un correo (se guarda en minúsculas) y probar `gmail.com` como dominio (debe rechazarse con un mensaje claro).
- Añadir un dato de memoria y probar «contraseña: x» (se rechaza). Editar, descartar y recuperar un dato.
- Con un usuario **editor** no debe aparecer «Eliminar»; con **admin** sí, y pide confirmación.
- En la ficha de un cliente **nuevo** (sin guardar) debe verse el aviso «Guarda la ficha para poder añadir contactos y memoria».
- Antes de desplegar en producción: hacer `pg_dump` del servidor y aplicar `pnpm db:migrate` allí.

## Pendientes detectados
- **Paso B, entrada por email:** buzón de Gmail gratuito aparte al que reenvía la regla de Gmail; lectura IMAP; reconocer cliente con `matchSender`; propuesta a Telegram con Aprobar/Corregir/Descartar. Enric escribió la dirección como `kijutech.agency@gmial.com`: confirmar que es `gmail.com` y qué usa ya esa cuenta. Comprobar que Google sigue permitiendo contraseñas de aplicación.
- La IA aún no propone datos de memoria ni la lee: pendiente para el paso B.
- Rehacer los snapshots de drizzle (o decidir seguir a mano) para poder usar `db:generate`.
- La base local conserva el bot de Telegram en polling: proponer borrar `ops_telegram_config` local para que nadie rompa producción arrancando la app.
- Los datos de memoria no se pueden buscar entre clientes ni se limita su número por cliente (con decenas basta; si crecen, valorar embeddings).
- Desplegar la rama en producción (migración 0038) cuando se apruebe.
