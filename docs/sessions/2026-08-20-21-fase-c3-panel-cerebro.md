# Fase C.3 — Panel del Cerebro (super_admin)
**Fecha:** 2026-08-20
**Rama:** main
**Commit:** 01c1cbf5

## Qué se construyó
- `app/(dashboard)/dashboard/ai/brain/page.tsx` (nuevo): página "Cerebro de IA", solo super_admin, con 3 tarjetas de solo lectura — modificadores de intención (umbral 200), ejemplos de clustering validados (umbral 50, activa RAG), feedback acumulado (sin umbral, desglose por tipo).
- `app/(dashboard)/dashboard/ai/brain/activation-banner.tsx` (nuevo): componente cliente del banner amarillo + botón "Activar" que aparece cuando `modifiers.total >= 200`; el botón es un placeholder consciente que muestra un mensaje inline ("Función disponible en próxima versión"), sin lógica de activación real todavía.
- `lib/ai/brain-queries.ts` (nuevo): `getIntentModifiersStats()`, `getClusteringExamplesStats(tenantId)`, `getClusteringFeedbackStats(tenantId)` — 3 queries de solo lectura (COUNT + FILTER), sin writes.
- `lib/ai/brain-constants.ts` (nuevo): `BRAIN_THRESHOLDS` (`intentModifiers: 200`, `clusteringExamples: 50`).
- `app/(dashboard)/dashboard/layout.tsx`: nuevo item de sidebar "Cerebro" (icono `Brain` de lucide-react), condicional a `isSuperAdmin`, junto al resto de items de administración.

## Migraciones aplicadas
Ninguna — el panel es solo lectura sobre tablas ya existentes (`ai_intent_modifiers`, `ai_clustering_examples`, `ai_clustering_feedback`).

## Decisiones técnicas tomadas en auto mode
- **`ai_intent_modifiers` no tiene columna `tenant_id`** (verificado en `lib/db/schema.ts` y en su uso real en `0-intent-normalizer.ts`/`kw-feedback-actions.ts`, ninguno filtra por tenant) — es una tabla global de patrones de idioma compartidos entre tenants. Se implementó `getIntentModifiersStats()` sin parámetro `tenantId`, en vez de forzar un filtro sobre una columna que no existe.
- **El sidebar de IA no tenía la sección estructurada que asumía el pedido** ("Configuración"/"Mis claves"/"Modelos" como sub-items). En realidad es un único item plano "IA & Modelos" que apunta a `/ai/settings` o `/ai/my-keys` según el rol; "Configuración" es una tab interna de `/ai/settings`, no un link de sidebar. Se añadió "Cerebro" como nuevo item plano condicional a `isSuperAdmin`, siguiendo el mismo patrón que los demás items de administración (`Admin SEO`, `Configuración SEO`).
- No existe componente `Progress` en `components/ui/`, ni librería de toasts instalada — la barra de progreso se construyó con un `div` simple (mismo patrón `rounded-full`/`bg-green-500`/`bg-blue-500` ya usado en otras partes del proyecto) y el placeholder del botón "Activar" usa un mensaje inline con `useState` en vez de un toast, siguiendo el patrón ya existente en `tenant-control-section.tsx`.

## Qué verificar manualmente
- Ya verificado en esta sesión con el navegador y sesión real de super_admin (`hola@enriquetabilo.com`): tarjeta de modificadores muestra 159/200 con desglose correcto (142 confirmados, 17 IA, 0 corregidos); tarjetas de ejemplos y feedback muestran correctamente el estado vacío.
- Estado "listo para activar" (barra verde + banner + botón) se probó bajando temporalmente el umbral a 100, reconstruyendo la imagen, confirmando visualmente, y revirtiendo a 200 con una segunda reconstrucción — el repo quedó en su estado final correcto.
- Pendiente de verificar cuando haya datos reales: que la tarjeta de "Ejemplos de clustering validados" y "Feedback acumulado" se vean bien con datos > 0 (ahora mismo están en 0 en el tenant Kijutech).
- Confirmar que el link "Cerebro" NO aparece en el sidebar para usuarios `admin`/`editor`/`lector` (solo se verificó visualmente con la sesión de super_admin; la condición `isSuperAdmin` en el código es la misma que usan los demás items admin-only, pero vale la pena una comprobación visual con otro usuario).

## Pendientes detectados
- El botón "Activar" es un placeholder — cuando se implemente la activación real del pre-filtrado automático, hay que decidir dónde se persiste ese estado (¿una fila en `ai_provider_settings`? ¿una tabla nueva?) y cablear la Capa 0 (`0-intent-normalizer.ts`) para que lo respete.
- El umbral de RAG (50 ejemplos) usado en la Tarjeta 2 es solo informativo — el RAG real ya se activa automáticamente con >= 5 ejemplos en `lib/ai/clustering/feedback/retrieval.ts` (implementado en una sesión anterior). Vale la pena revisar si el umbral de 50 mostrado en el panel debería alinearse con ese 5, o si son intencionalmente distintos (50 = "suficientes para resultados consistentes" vs. 5 = "mínimo técnico para activar").
