# Embedding key separada del proveedor de chat
**Fecha:** 2026-08-20
**Rama:** feature/clustering-pipeline
**Commit:** 7de32914

## Qué se construyó

- `lib/db/schema.ts` — 4 columnas nuevas en `ai_provider_settings`: `embedding_api_key_encrypted`, `embedding_api_key_iv`, `embedding_provider`, `embedding_model` (todas nullable).
- `lib/db/migrations/0018_happy_barracuda.sql` — migración con los 4 `ALTER TABLE ADD COLUMN`.
- `lib/ai/provider-meta.ts` — `EMBEDDING_PROVIDERS` (`openai`/`gemini`/`voyage`), `EMBEDDING_PROVIDER_META` (labels para la UI) y `DEFAULT_EMBEDDING_MODEL` (modelo de embeddings por defecto por proveedor, incluyendo `anthropic` → `voyage-3` para el caso "mismo que chat").
- `lib/ai/gateway.ts` — nueva `getEmbeddingConfig(tenantId, keyMode)`: resuelve el proveedor/modelo/key de embeddings a usar, con fallback a la key principal si no hay una de embeddings guardada, y al modelo de embeddings por defecto si `embedding_model` quedó vacío.
- `lib/ai/actions.ts` — `saveProviderSettings()` acepta `embeddingProvider`/`embeddingModel`/`embeddingApiKey`; cifra y guarda la key de embeddings igual que la principal; si se revierte a "mismo que chat" borra `embedding_provider`, `embedding_model` y la key guardada.
- `lib/ai/clustering/layers/1-embeddings.ts` — el modelo de embeddings ya no está hardcodeado por proveedor (`embedBatchOpenAI`/`Gemini`/`Voyage` reciben el modelo como parámetro); se añadió `voyage` como proveedor explícito (antes solo se llegaba a Voyage vía `anthropic`).
- `lib/ai/clustering/types.ts` y `pipeline.ts` — `ClusteringInput` ahora lleva `embeddingProvider`/`embeddingModel`/`embeddingApiKey` separados de `provider`/`model`/`apiKey` (chat); el coste estimado de embeddings usa el modelo real, no un mapa fijo por proveedor de chat.
- `lib/ai/clustering/feedback/capture.ts` y `lib/seo/kw-ai-actions.ts` — tanto el análisis con IA como la captura de feedback en background (confirmación de clusters) ahora resuelven la config de embeddings vía `getEmbeddingConfig()` en vez de asumir el proveedor de chat.
- `app/(dashboard)/dashboard/ai/provider-settings-section.tsx` — subsección expandible "Configuración de embeddings (opcional)" en cada tarjeta de proveedor (select de proveedor de embeddings, campo de modelo con placeholder dinámico, campo de key solo visible si el proveedor difiere del chat).
- `app/(dashboard)/dashboard/ai/settings/page.tsx` y `.../ai/my-keys/page.tsx` — pasan los nuevos campos de embeddings a `ProviderRowData`.
- **Actualización posterior en la misma sesión**: `DEFAULT_EMBEDDING_MODEL['gemini']` pasó de `text-embedding-004` (deprecado por Google) a `gemini-embedding-001`. Este modelo soporta Matryoshka Representation Learning, así que `embedBatchGemini` (`lib/ai/clustering/layers/1-embeddings.ts`) ahora manda `outputDimensionality: 1536` en la llamada a `embedContent`, pidiendo el vector completo de 1536 dimensiones directamente en vez de recibir 768 y rellenar con ceros. El padding con ceros (`padToTargetDimensions`) sigue existiendo porque Voyage (1024 dims) todavía lo necesita — para Gemini pasa a ser un no-op.

## Migraciones aplicadas

`lib/db/migrations/0018_happy_barracuda.sql`:

```sql
ALTER TABLE "ai_provider_settings" ADD COLUMN "embedding_api_key_encrypted" text;--> statement-breakpoint
ALTER TABLE "ai_provider_settings" ADD COLUMN "embedding_api_key_iv" text;--> statement-breakpoint
ALTER TABLE "ai_provider_settings" ADD COLUMN "embedding_provider" varchar(20);--> statement-breakpoint
ALTER TABLE "ai_provider_settings" ADD COLUMN "embedding_model" varchar(100);
```

Aplicada con `pnpm db:migrate` tras confirmación explícita de Enric (columnas nullable y aditivas sobre una tabla núcleo existente — no introduce tablas de un módulo nuevo, así que no aplicaba el backup obligatorio de `pg_dump`).

## Decisiones técnicas tomadas en auto mode

- **El modelo de embeddings "mismo que chat" no es el modelo de chat configurado.** El pedido original decía literalmente "si embedding_provider es null → usa provider, model y apiKey del proveedor principal", pero el campo `model` de `ai_provider_settings` es el modelo de CHAT (ej. `claude-sonnet-4-6`), que no es un modelo de embeddings válido. `getEmbeddingConfig()` usa en su lugar `DEFAULT_EMBEDDING_MODEL[provider]` (ej. `anthropic` → `voyage-3`) para ese caso, igual que ya hacía el código de embeddings antes de esta sesión.
- **Se creó y luego se eliminó `components/ui/select.tsx`** (basado en `radix-ui` Select, mismo patrón que el resto de `components/ui/`). Al probarlo en el navegador apareció un error de hidratación de React (#418) en `/dashboard/ai/settings`. Investigando con `git stash`, se confirmó que ese error de hidratación **ya existía en el código sin tocar, antes de esta sesión** — no lo causó el Select nuevo. Aun así, para no añadir una dependencia (Radix Select) ni arriesgar interacción con ese bug preexistente, se sustituyó por un `<select>` nativo con las mismas clases de Tailwind que el resto de inputs. El bug de hidratación preexistente queda sin tocar — ver "Pendientes detectados".
- **No hay llamada de prueba en vivo para la key de embeddings** (a diferencia de la key principal, que sí hace un `sendMessage` de prueba al guardar). El pedido no lo pidió explícitamente y añadir un endpoint de prueba de embeddings por proveedor quedaba fuera de alcance.
- **Se añadió `voyage` como proveedor de embeddings explícito**, separado de estar implícito solo cuando el proveedor de chat es `anthropic`. Se mantiene el mapeo `anthropic` → función de Voyage por compatibilidad (Anthropic no tiene API de embeddings propia).
- **Se corrigió de paso un bug latente**: la captura de feedback en background (`kw-ai-actions.ts`, al confirmar clusters) usaba `resolveActiveProvider()` (proveedor de chat) directamente para embeddings — para tenants con Anthropic activo, esto mandaba una key de Anthropic al endpoint de Voyage, fallando siempre en silencio (try/catch best-effort). Ahora usa `getEmbeddingConfig()` igual que el resto del pipeline.

## Qué verificar manualmente

- Probar con API keys reales (OpenAI, Gemini, Voyage) que las llamadas de embeddings funcionan de extremo a extremo — en esta sesión solo se verificó el guardado en BD con una key de prueba falsa (`AIzaSy...`), no una llamada real a la API de Gemini/Voyage.
- Correr un análisis de clustering real (paso de keyword research → clustering) con un tenant que tenga un proveedor de embeddings distinto configurado, para confirmar que la Capa 1 usa la key/modelo correctos de principio a fin.
- Revisar `/dashboard/ai/my-keys` (BYOK) en un tenant con `byok_allowed`/`byok_required` — en esta sesión el tenant de prueba tenía `platform_only`, así que esa página redirigía a `/dashboard` y no se pudo probar visualmente, solo se revisó el código.

## Pendientes detectados

- **Bug de hidratación de React preexistente** (`Minified React error #418`) en `/dashboard/ai/settings`, confirmado que ya existía antes de esta sesión (con `git stash` se reprodujo en el código sin tocar). No rompe la funcionalidad visible pero ensucia la consola. Vale la pena investigarlo aparte.
- No hay validación en vivo de la key de embeddings al guardar — un usuario podría guardar una key rota y no enterarse hasta que falle un job de clustering real.
- Si un tenant solo tiene DeepSeek activo (sin API de embeddings propia) y no configura un proveedor de embeddings explícito, el pipeline falla con un mensaje claro pidiendo configurar uno — comportamiento esperado, no un bug, pero puede sorprender la primera vez.
