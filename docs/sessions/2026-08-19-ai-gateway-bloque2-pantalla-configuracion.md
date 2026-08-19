# AI Gateway — Bloque 2: pantalla de configuración de proveedores
**Fecha:** 2026-08-19
**Rama:** feature/ai-gateway
**Commit:** 89c60807

## Qué se construyó

Sin migraciones — el esquema ya estaba completo del Bloque 1. UI y
server actions sobre las tablas `ai_provider_settings`,
`ai_model_pricing` y `tenants.ai_key_mode_allowed` que ya existían.

Queries (`lib/ai/queries.ts`, nuevo):
- `getAiProviderSettings(tenantId, keyMode?)`, `getAiModelPricing()`,
  `getAiJobs(tenantId, limit?)` — las tres pedidas — más
  `getTenantAiMode(tenantId)` y `getTenantsWithAiMode()`, necesarias
  para el guard de `/dashboard/ai/my-keys` y la Sección 3, no pedidas
  explícitamente por nombre pero requeridas por el resto del pedido

Actions (`lib/ai/actions.ts`, nuevo): `saveProviderSettings`,
`deleteProviderKey`, `updateModelPricing`, `addModelPricing`,
`updateTenantAiMode` — las 5 pedidas. Cada una valida el rol
correspondiente contra `userRoles`/`roles` directamente (sin importar
nada de `lib/seo/`, para no romper el aislamiento núcleo/módulos).

`saveProviderSettings` seguida al pie de la letra:
1. Valida modelo no vacío
2. Si hay key nueva: llamada de prueba real (`'di solo: ok'`) al
   adaptador correspondiente antes de guardar nada
3. Si la prueba falla: no guarda, devuelve el error tal cual lo dio el
   proveedor
4. Si pasa: cifra con `lib/ai/encryption.ts` (Bloque 1) y hace un
   `insert ... onConflictDoUpdate` sobre `(tenant_id, provider)` —
   backing off automáticamente a la fila existente si ya había una para
   ese proveedor
5. Al marcar "Por defecto", desactiva el resto de proveedores del mismo
   tenant en una query previa

Pantallas:
- `/dashboard/ai/settings` (super_admin): 3 secciones — keys de
  plataforma, precios por modelo, control por tenant — tal como se
  pidió
- `/dashboard/ai/my-keys` (tenant admin, solo si
  `ai_key_mode_allowed != 'platform_only'`): mismo componente de
  proveedores que la Sección 1, reutilizado con `keyMode="byok"`

Componentes nuevos:
- `app/(dashboard)/dashboard/ai/provider-settings-section.tsx`
  (compartido entre ambas pantallas): gestiona los 4 proveedores fijos
  como filas independientes, con la exclusividad mutua de "Por
  defecto" resuelta en estado local (activar el default de una fila
  desmarca las demás al instante, sin esperar a guardar)
- `app/(dashboard)/dashboard/ai/settings/pricing-section.tsx`: tabla
  editable inline + fila para añadir una entrada nueva
- `app/(dashboard)/dashboard/ai/settings/tenant-control-section.tsx`:
  tabla de tenants con select de modo + guardar por fila
- `lib/ai/provider-meta.ts`: metadata compartida (emoji, label, modelo
  por defecto de cada proveedor; labels de los 3 modos de tenant) —
  reutilizada por server y client components
- `components/ui/switch.tsx`: no existía ningún toggle en el proyecto
  todavía; añadido siguiendo el mismo patrón shadcn que ya usan
  `dropdown-menu.tsx`/`radio-group.tsx` (primitiva de `radix-ui`, ya
  instalado — no se añadió ninguna dependencia nueva)

Navegación:
- `app/(dashboard)/dashboard/layout.tsx`: entrada "IA & Modelos",
  apunta a `/dashboard/ai/settings` para super_admin o
  `/dashboard/ai/my-keys` para tenant admin con BYOK habilitado
- `app/api/user/roles/route.ts`: ahora devuelve también
  `aiKeyModeAllowed` del tenant del usuario (antes solo `roles`),
  necesario para que el sidebar (client component) decida sin una
  llamada extra

## Migraciones aplicadas

Ninguna.

## Decisiones técnicas tomadas en auto mode

- **Bug real encontrado y corregido: Next.js sanitiza los `throw` de
  Server Actions en build de producción.** Lo detecté probando la
  pantalla en el navegador real (rebuild + `pnpm start`, sin
  hot-reload, tal como corre siempre este proyecto): active el toggle
  "Activo" de Anthropic sin key y guardé — en vez del mensaje "No
  puedes activar un proveedor sin una API key guardada" que lanza
  `saveProviderSettings`, la pantalla mostró el genérico "An error
  occurred in the Server Components render...". Esto rompía
  directamente el requisito "Si falla: muestra el error sin guardar"
  del pedido — el punto entero de la llamada de prueba es que el admin
  vea *por qué* falló. Reescribí las 5 actions de `lib/ai/actions.ts`
  para que nunca lancen: devuelven `{ error: string } | { success:
  true }`, y los 3 componentes cliente comprueban `'error' in result`
  en vez de `try/catch`. Verificado de nuevo en el navegador con una
  key inválida real contra la API de Anthropic: el error 401 exacto de
  Anthropic llegó a la pantalla.
  **Esto mismo afecta a código ya existente fuera de este bloque** —
  `lib/seo/admin-actions.ts` (`updateSeoSetting`, `createKnowledgeCard`,
  etc.) lanza `throw new Error(...)` de la misma forma y sufrirá el
  mismo problema en producción si alguna vez ese `throw` se dispara
  desde la UI. No lo toqué (fuera del alcance de este pedido, y son
  rutas donde hasta ahora el caso de error no se había probado en
  producción), pero lo dejo anotado como hallazgo para una sesión
  futura.
- **`getTenantAiMode`/`getTenantsWithAiMode` en `lib/ai/queries.ts`**
  aunque no estaban en la lista de queries pedidas por nombre: hacen
  falta para el guard de `/dashboard/ai/my-keys` (necesita saber el
  modo del tenant antes de decidir si redirige) y para la Sección 3
  (lista de tenants). Consultan la tabla núcleo `tenants` directamente,
  igual que ya hacía `gateway.ts` en el Bloque 1 — no es un cruce de
  módulos, es el patrón normal de un módulo leyendo el núcleo.
- **Ningún dato de prueba quedó persistido.** Verificado tras la
  sesión: `ai_provider_settings` sigue vacía (0 filas — todos los
  intentos de guardado en las pruebas fallaron por diseño, antes de
  llegar al `insert`) y `tenants.ai_key_mode_allowed` de Kijutech volvió
  a `platform_only` tras probar temporalmente `byok_allowed` para
  verificar que `/dashboard/ai/my-keys` cargaba.
- **Sin `AlertDialog` para "Eliminar key"**: se pedía "con
  confirmación" — usé `window.confirm()` nativo en vez de construir un
  componente de diálogo nuevo (no existía ninguno en `components/ui/`
  todavía). Es la opción más simple que cumple el requisito sin añadir
  superficie nueva; si en el futuro se necesita un diálogo de
  confirmación con más contexto (mostrar qué se pierde, etc.), vale la
  pena construir uno de verdad entonces.
- **`deleteProviderKey` limpia la key pero no borra la fila**: pone
  `apiKeyEncrypted`/`apiKeyIv` a `null` y fuerza `isActive`/`isDefault`
  a `false`, conservando el `model` elegido. El botón se llama
  "Eliminar key", no "Eliminar proveedor" — mantener la fila con el
  modelo ya elegido evita que el admin tenga que volver a escribirlo si
  solo quería rotar o quitar la clave.

## Qué verificar manualmente

Ya verificado por mí en el navegador real (`http://127.0.0.1:3000`,
sesión de Enric como `hola@enriquetabilo.com`):

1. `/dashboard/ai/settings` carga con las 3 secciones, el sidebar
   muestra "IA & Modelos" bajo "Configuración SEO"
2. Activar un proveedor sin key → error "No puedes activar un
   proveedor sin una API key guardada", sin guardar nada
3. Guardar una key inválida de Anthropic → llamada real a la API de
   Anthropic, error 401 mostrado tal cual ("API key is invalid"), sin
   guardar nada
4. "Editar" en una fila de precios → se vuelve editable inline,
   "Cancelar" descarta sin tocar datos
5. Cambiar el modo de Kijutech a "BYOK permitido" → `/dashboard/ai/my-keys`
   pasa de redirigir a cargar correctamente; revertido a "Solo
   plataforma" al terminar

Lo que no pude probar sin una API key real de pago: el camino donde la
llamada de prueba **sí** pasa (key válida → se cifra y se guarda). La
lógica de cifrado ya se verificó por separado en el Bloque 1
(round-trip encrypt/decrypt). Cuando tengas una key real de cualquier
proveedor, vale la pena que la pruebes tú una vez para confirmar el
camino feliz completo.

También pendiente de probar (no lo hice, requeriría un segundo tenant
y un segundo usuario con rol `admin` que no sea `super_admin`): que un
tenant admin normal (no super_admin) solo vea "IA & Modelos" cuando su
tenant tiene BYOK habilitado, y que solo pueda tocar las keys de su
propio tenant.

## Pendientes detectados

- **Sanitización de errores de Server Actions en producción**
  (detallado arriba) afecta también a `lib/seo/admin-actions.ts` —
  candidato a una sesión de limpieza futura si alguna vez un `throw`
  de ahí necesita llegar a un usuario real.
- **No hay UI para ver `ai_jobs`** — la query `getAiJobs()` existe
  (pedida explícitamente) pero no se usa desde ninguna pantalla
  todavía. Es esperable: no hay ninguna función real generando jobs
  hasta que el Bloque 3 conecte `callAI()` a un flujo de verdad.
- **La prueba de conexión (`'di solo: ok'`) no tiene timeout propio**
  más allá del que ya tiene cada `fetch` por defecto — si un proveedor
  tarda mucho en responder con una key inválida, el botón "Guardar"
  puede quedarse cargando más de lo esperado. No until ahora ha sido un
  problema (los 401 son respuestas rápidas), lo anoto por si conviene
  acotarlo cuando se conecte una función real de Bloque 3.
