# AI Gateway — Infraestructura base (Bloque 1)
**Fecha:** 2026-08-19
**Rama:** feature/ai-gateway
**Commit:** 58208bb2

## Qué se construyó

Primer bloque de la infraestructura de IA: esquema de datos, cifrado de
claves, adaptadores por proveedor y el gateway que centraliza toda
llamada a un modelo de lenguaje. Sin UI todavía — eso es Bloque 2/3.

Esquema (`lib/db/schema.ts`):
- `tenants.ai_key_mode_allowed`: controla si un tenant puede/debe usar
  su propia clave (`platform_only` | `byok_allowed` | `byok_required`)
- `ai_provider_settings`: una fila por tenant+proveedor, con la API key
  cifrada, el modelo elegido y si está activa/por defecto
- `ai_model_pricing`: tabla de precios por proveedor+modelo con rango
  de vigencia (`effective_from`/`effective_to`), para poder cambiar
  precios sin perder el histórico de coste ya calculado en jobs viejos
- `ai_jobs`: registro de cada llamada a la IA — inputs, outputs, coste
  estimado, tokens, estado (`processing`/`completed`/`failed`)

Cifrado (`lib/ai/encryption.ts`):
- AES-256-GCM con `crypto` nativo de Node, sin librerías externas
- IV aleatorio de 16 bytes por cada `encrypt()`; el auth tag de GCM
  (16 bytes) se concatena al ciphertext dentro del campo `encrypted`
- Clave maestra desde `AI_ENCRYPTION_KEY`; si falta, `throw` explícito

Adaptadores (`lib/ai/adapters/*.ts`), misma interfaz `sendMessage()`:
- `anthropic.ts`: separa los mensajes `system` del resto (la API de
  Anthropic los pasa por un campo `system` aparte, no dentro de
  `messages`)
- `openai.ts` y `deepseek.ts`: formato idéntico (DeepSeek es compatible
  con la API de OpenAI), solo cambia el endpoint
- `gemini.ts`: convierte `AIMessage[]` al formato `contents[]` de
  Gemini (`role: 'assistant'` → `'model'`), auth por query param en
  vez de header, y los mensajes `system` van en `systemInstruction`

Gateway (`lib/ai/gateway.ts`): `callAI()` como único punto de entrada.
Crea el `ai_job`, resuelve qué proveedor/clave usar según
`ai_key_mode_allowed` del tenant, descifra la key, llama al adaptador
con timeout de 60s, calcula el coste contra `ai_model_pricing` y
actualiza el job a `completed` o `failed`. Nunca loguea la key
descifrada.

Prompt y parser de clustering (`lib/ai/prompts/cluster-keywords.ts`,
`lib/ai/parsers/cluster-keywords.ts`): listos para que el Bloque 2 los
conecte a la función `cluster_keywords` — no se usan todavía en ningún
flujo real.

Variable de entorno: `AI_ENCRYPTION_KEY` añadida a `.env` (gitignorado)
y a `docker-compose.yml` (sección `environment` del servicio `app`).
También añadida como placeholder a `.env.example` para dejar constancia
de que existe, sin exponer el valor real. El valor generado se le
entregó a Enric aparte del chat.

## Migraciones aplicadas

`lib/db/migrations/0012_equal_alice.sql` — las 4 migraciones pedidas,
generadas juntas por `drizzle-kit generate` en un único archivo (mismo
comportamiento que en sesiones anteriores: una corrida de `generate`
agrupa todos los cambios pendientes del esquema en un solo `.sql`):

```sql
CREATE TABLE "ai_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid,
	"function" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'processing' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"provider" varchar(20),
	"model" varchar(100),
	"key_mode_used" varchar(20),
	"input_tokens" integer,
	"output_tokens" integer,
	"estimated_cost" numeric(10, 6),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ai_model_pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(20) NOT NULL,
	"model" varchar(100) NOT NULL,
	"input_cost_per_1k" numeric(10, 6) DEFAULT '0' NOT NULL,
	"output_cost_per_1k" numeric(10, 6) DEFAULT '0' NOT NULL,
	"effective_from" date DEFAULT now() NOT NULL,
	"effective_to" date,
	CONSTRAINT "ai_model_pricing_provider_model_effective_from_unique" UNIQUE("provider","model","effective_from")
);
--> statement-breakpoint
CREATE TABLE "ai_provider_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" varchar(20) NOT NULL,
	"api_key_encrypted" text,
	"api_key_iv" text,
	"model" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"key_mode" varchar(20) DEFAULT 'platform' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_provider_settings_tenant_id_provider_unique" UNIQUE("tenant_id","provider")
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "ai_key_mode_allowed" varchar(20) DEFAULT 'platform_only' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_settings" ADD CONSTRAINT "ai_provider_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
```

Enric confirmó explícitamente aplicar con `effective_from date DEFAULT
now()` en vez de `DEFAULT CURRENT_DATE` (Drizzle traduce `.defaultNow()`
en una columna `date` a `now()`; Postgres lo castea a fecha —
funcionalmente equivalente al `CURRENT_DATE` original del pedido).

Seed de precios aplicado directamente vía `psql` (no un script `tsx`
nuevo, para no crear un archivo de seed de un solo uso):

```sql
INSERT INTO ai_model_pricing (provider, model, input_cost_per_1k, output_cost_per_1k) VALUES
('anthropic', 'claude-sonnet-4-6', 0.003, 0.015),
('anthropic', 'claude-opus-4-6',   0.015, 0.075),
('anthropic', 'claude-haiku-4-5',  0.001, 0.005),
('openai', 'gpt-4o',          0.005, 0.015),
('openai', 'gpt-4o-mini',     0.000150, 0.000600),
('openai', 'o3-mini',         0.001100, 0.004400),
('gemini', 'gemini-1.5-pro',   0.003500, 0.010500),
('gemini', 'gemini-1.5-flash', 0.000350, 0.001050),
('gemini', 'gemini-2.0-flash', 0.000100, 0.000400),
('deepseek', 'deepseek-chat',      0.000140, 0.000280),
('deepseek', 'deepseek-reasoner',  0.000550, 0.002190)
ON CONFLICT (provider, model, effective_from) DO NOTHING;
```

11 filas insertadas y verificadas con `SELECT`.

## Decisiones técnicas tomadas en auto mode

- **Sin bind mount de código en el contenedor**: `kijutech_app` corre
  sobre lo copiado en el build de la imagen (`Dockerfile.dev` hace
  `COPY . .` y `pnpm build` en tiempo de build), no hay volumen que
  refleje cambios del host en vivo. Por eso `drizzle-kit generate`
  dentro del contenedor escribía el `.sql` solo en el filesystem del
  contenedor, no en el repo del host. Tuve que:
  1. Reconstruir la imagen (`docker compose up --build -d`) después de
     editar `schema.ts`, para que el contenedor viera el esquema nuevo
  2. Generar la migración dentro del contenedor
  3. Copiar los 3 archivos generados (`.sql`, `meta/<n>_snapshot.json`,
     `meta/_journal.json`) al host con `docker cp`, porque si no se
     habrían perdido al recrear el contenedor
  Esto no es exclusivo de esta sesión — aplica a cualquier migración
  futura del proyecto. Vale la pena que lo tengas presente si migras
  sin mí: sin un `docker cp` de por medio, `pnpm db:generate` "funciona"
  pero el `.sql` nunca llega al repo.
- **Nombre de fase en el commit ("Fase D")**: en la primera versión de
  este commit usé esa etiqueta siguiendo el patrón de commits
  anteriores (Fase B, Fase C), pero el roadmap de CLAUDE.md no define
  ninguna Fase D — era una suposición mía. Enric lo corrigió al
  arrancar el Bloque 2: mensaje reescrito a "feature/ai-gateway —
  Bloque 1: infraestructura base (...)", sin prefijo de fase. Como el
  commit del doc de sesión ya se había creado encima, no era un simple
  `amend` de HEAD — hizo falta un `git reset --soft` a antes de ambos
  commits y volver a commitear en dos pasos para no perder la
  separación código/doc.
- **Selección de proveedor/clave en el gateway**: la spec describía dos
  ramas de búsqueda (`key_mode = 'platform'` vs `'byok'`) sin decir
  explícitamente qué determina cuál usar. Interpreté
  `ai_key_mode_allowed` del tenant como el que decide: `platform_only`
  y `byok_required` fuerzan un único modo (y lanzan error descriptivo
  si no hay clave activa en ese modo); `byok_allowed` prueba primero
  BYOK del tenant y si no hay ninguna activa, cae a `platform`. Esto no
  estaba pedido explícitamente así — es la interpretación más natural
  del propósito de esos 3 valores, pero conviene que la confirmes antes
  del Bloque 2, cuando se conecte a una función real.
- **Timeout de 60s implementado con `Promise.race` en el gateway**, no
  con `AbortController` dentro de cada adaptador: mantiene los 4
  adaptadores simples (cada uno solo hace su `fetch` normal) y
  centraliza el límite de tiempo en el único sitio que la spec pedía
  ("añadir el retry después" sugiere que el gateway es donde vive este
  tipo de control, no los adaptadores). Efecto práctico: al superarse
  el timeout, la promesa del gateway se resuelve con error y el job se
  marca `failed`, pero el `fetch` en curso no se cancela de verdad (la
  petición HTTP sigue en marcha hasta que el proveedor responda o
  cierre la conexión). Si en el Bloque 2/3 esto importa (por ejemplo,
  para no seguir "pagando" tokens de una llamada ya abandonada), habría
  que pasar un `AbortSignal` a cada adaptador — lo dejo anotado como
  pendiente, no lo até porque no estaba en el pedido de este bloque.
- **Fila de `ai_jobs.input` guarda los mensajes y el proveedor
  preferido**, no un objeto vacío: no estaba especificado qué debía
  llevar `input`, y guardar la petición completa (sin la key, que
  nunca pasa por ahí) es lo que hace útil ese campo para depurar un job
  fallado más adelante.
- **Coste `null` si no hay pricing para el modelo usado**: si un tenant
  configura un modelo BYOK que no está en `ai_model_pricing` (por
  ejemplo, un modelo nuevo que Enric no ha añadido a la tabla todavía),
  el gateway no falla el job por eso — completa igual y deja
  `estimated_cost = null`. Fallar el job entero por falta de un precio
  habría bloqueado el uso real de la IA por un dato administrativo.
- **Fences de markdown en el parser de clustering**: la spec solo pedía
  manejar "respuesta no es JSON válido", pero en la práctica los
  modelos a veces envuelven el JSON en \`\`\`json aunque se les pida
  explícitamente que no lo hagan. Añadí un `stripMarkdownFences()|`
  defensivo antes del `JSON.parse()` — es la causa más común de que un
  parser "estricto" falle en producción con una respuesta que en
  realidad sí era válida.

## Qué verificar manualmente

No hay UI en este bloque, así que no hay nada que probar en el
navegador todavía. Lo que sí puedes comprobar tú mismo:

1. **El valor de `AI_ENCRYPTION_KEY`** que te pasé en el chat — guárdalo
   en un gestor de contraseñas o similar, fuera del repo. Si se pierde,
   cualquier clave ya cifrada en `ai_provider_settings` queda
   irrecuperable (no hay forma de descifrarla sin la clave maestra).
2. Que `docker compose up --build -d` sigue arrancando limpio para ti
   (yo lo comprobé dos veces en esta sesión, pero conviene que lo veas
   correr en tu máquina también).
3. Revisa las 11 filas de `ai_model_pricing` si quieres (`docker exec
   kijutech_db psql -U kijutech -d kijutech_db -c "SELECT * FROM
   ai_model_pricing;"`) — los precios son aproximados a día de hoy
   según tu propio pedido, no los verifiqué contra ninguna fuente
   oficial de precios de cada proveedor.

## Pendientes detectados

- **No hay ninguna fila en `ai_provider_settings` todavía** — el
  gateway no tiene ninguna clave real que usar hasta que exista al
  menos una fila `is_active = true`. Eso es trabajo de Bloque 2/3 (UI
  de configuración de proveedores).
- **Ningún tenant real tiene `ai_key_mode_allowed` distinto del default
  `platform_only`** — no hace falta tocarlo a mano, es el valor
  correcto de partida.
- **No hay reintentos automáticos** (explícitamente fuera de este
  bloque, según tu pedido) — una llamada que falle por un error
  transitorio del proveedor (rate limit, 500 puntual) queda como
  `failed` sin reintento.
- **El timeout de 60s no cancela la petición HTTP en curso** (ver
  decisión técnica arriba) — anotado por si interesa resolverlo cuando
  se conecte una función real.
