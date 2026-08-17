# Fase B — Mejoras de UX del wizard SEO (reset, checklist, asistente contextual)
**Fecha:** 2026-08-17  
**Rama:** feature/fase-b-seo  
**Commit:** 9642e70b

## Qué se construyó

Sesión completa de mejoras de UX sobre el wizard SEO construido en el Checkpoint 3, antes de fusionar Fase B a main. Repartida en varios commits intermedios (2d191bbe, df2169f7, 323744cd, 9642e70b) más este cierre de sesión.

**Reset de etapa (las 3 etapas funcionales):**
- `lib/seo/actions.ts`: `resetOnboardingStage`, `resetKickoffStage`, `resetAuditStage` — cada una vuelve `seo_stage_progress.status` a `pending` y borra los datos propios de la etapa (checklist desmarcada / respuestas de kickoff borradas / hallazgos de auditoría borrados)
- Botón "Reiniciar etapa" añadido en `onboarding-checklist.tsx`, `kickoff-form.tsx` y `audit-form.tsx`, visible solo si la etapa está `in_progress` o `completed`, con `confirm()` del navegador antes de ejecutar

**Checklist de Onboarding personalizable y totalmente editable:**
- `lib/seo/onboarding-checklist-items.ts` (nuevo): extrae la lista de los 4 items fijos (antes hardcodeada en el componente) para poder reutilizarla también desde `context-keys.ts` y `actions.ts`
- `addCustomChecklistItem` / `removeChecklistItem` en `lib/seo/actions.ts`: permiten añadir herramientas nuevas y eliminar **cualquier** item de la checklist, fijo o personalizado (petición explícita del usuario: un proyecto sin Google Business Profile debe poder quitar ese item por defecto)
- `ensureOnboardingInitialized(projectId)`: siembra los 4 items fijos una única vez, en la primerísima visita a Onboarding (cuando aún no existe fila en `seo_stage_progress` para esa etapa). Como esa fila nunca se borra —tampoco al resetear, que solo cambia su `status`— un item eliminado no vuelve a reaparecer en visitas futuras
- `onboarding-checklist.tsx` reescrito para renderizar todos los items desde las filas reales de la tabla (ya no hay lista hardcodeada en la UI), cada uno con botón "×"

**Rediseño de knowledge cards como asistente contextual:**
- `seo_knowledge_cards.context_key` (migración 0007, ver abajo): permite asociar una tarjeta a un input concreto del formulario de la etapa
- `seo_onboarding_checklist.is_custom` (misma migración 0007): distingue items fijos de personalizados
- `seo-assistant-context.tsx` / `seo-assistant-panel.tsx`: panel con avatar 🤖, burbuja con triángulo CSS y color de borde según `card_type`; muestra la card contextual del input con foco, o un carrusel de cards genéricas si no hay coincidencia, o "Sin contenido todavía." si no hay ninguna
- Cada input de Onboarding/Kickoff/Radiografía reporta su foco (`onFocus`/`onBlur`) vía contexto de React, sin acoplar formulario y panel
- `lib/seo/context-keys.ts` (nuevo): mapea cada etapa a sus `question_key`/`check_point`/`item_key` conocidos, reutilizado por el editor Admin SEO
- `knowledge-card-form.tsx`: el campo "Asociar a input específico" pasó de texto libre a un `<select>` que se recalcula según la etapa elegida en el propio formulario — ya no hace falta conocer de memoria el código interno del input

**Reposicionamiento del asistente (última petición de la sesión):**
- `seo-wizard-shell.tsx` (nuevo, sustituye a `seo-stage-layout.tsx`): el asistente pasa de ser una tercera columna a la derecha (40% del ancho) a vivir apilado bajo el nav de etapas en la columna izquierda, debajo de la última etapa del manifest (NotebookLM). El contenido central pasa a ocupar todo el ancho restante
- `layout.tsx` centraliza ahora la query `getKnowledgeCardsByStage()` (antes se repetía en cada `page.tsx`)

**Gobernanza (este cierre de sesión):**
- `CLAUDE.md`: añadido el bloque "Documentación automática de sesión" al final del archivo, sin tocar el resto — regla permanente que exige generar este mismo tipo de documento antes de cada commit final de sesión

## Migraciones aplicadas

**0007_steady_leo.sql** (generada, backup previo confirmado, aplicada tras mostrar el SQL a Enric):

```sql
ALTER TABLE "seo_knowledge_cards" ADD COLUMN "context_key" varchar(100);
--> statement-breakpoint
ALTER TABLE "seo_onboarding_checklist" ADD COLUMN "is_custom" boolean DEFAULT false NOT NULL;
```

Backup previo: `backups/backup_pre_seo_ux_20260817.sql` (no versionado, excluido por `.gitignore`).

El resto de cambios de esta sesión (reset de etapas, items eliminables, reposicionamiento del asistente) no requirieron migración nueva.

## Decisiones técnicas tomadas en auto mode

- **Cómo hacer que los items fijos eliminados no reaparezcan sin añadir una columna nueva**: la opción obvia era añadir una columna `removed` a `seo_onboarding_checklist`, pero eso implicaba otra migración. En su lugar se reutilizó el ciclo de vida de `seo_stage_progress` como señal de "primera visita a la etapa": la siembra de los 4 items fijos solo ocurre si todavía no existe fila de progreso para `onboarding`, y esa fila nunca se borra (ni el reset la borra, solo cambia su `status`), así que la siembra no se repite nunca más y un item eliminado se queda eliminado.
- **Dónde vive el estado de foco (`focusedKey`) tras mover el asistente**: al pasar el asistente de la columna de contenido (hermano directo del formulario) a la columna del nav (renderizada en `layout.tsx`, fuera del árbol de cada `page.tsx`), el proveedor de contexto `SeoAssistantContext` tuvo que subir de nivel — de `seo-stage-layout.tsx` (uno por etapa) a un único `seo-wizard-shell.tsx` compartido por las 3 etapas, para que el foco de los inputs siga llegando al panel aunque ya no sean hermanos directos.
- **Fetch de knowledge cards centralizado**: como las cards no son específicas de proyecto (solo de etapa), se centralizó la query `getKnowledgeCardsByStage()` en `layout.tsx` en vez de repetirla en cada `page.tsx`, ahora que el shell necesita conocer las cards de todas las etapas (para elegir las de la etapa activa vía `pathname`) y no solo las de la etapa actual.
- **Reset de Kickoff/Radiografía borra las filas en vez de vaciar los campos**: se optó por `DELETE` de `seo_kickoff_answers`/`seo_audit_findings` en vez de un `UPDATE` a valores vacíos, por simplicidad y porque el formulario ya maneja el caso de "sin respuesta previa" (precarga con string vacío) sin cambios adicionales.

## Qué verificar manualmente

- En las 3 etapas (Onboarding, Kickoff, Radiografía): rellenar, completar, y comprobar que "Reiniciar etapa" borra los datos y devuelve el nav a gris (pendiente).
- Onboarding: eliminar un item fijo (ej. Google Business Profile) con el "×", recargar la página y confirmar que no vuelve a aparecer; comprobar que tampoco reaparece tras un "Reiniciar etapa".
- Añadir una herramienta personalizada, marcarla/desmarcarla, eliminarla con "×" y confirmar persistencia tras recargar.
- Admin SEO (`/dashboard/seo/admin/cards`): crear una tarjeta, cambiar la etapa en el formulario y comprobar que el select "Asociar a input específico" recalcula sus opciones; guardar con un contexto asociado y comprobar que aparece al hacer foco en ese input concreto del wizard.
- Comprobar visualmente que el asistente ya no ocupa una tercera columna: debe verse apilado bajo el nav de etapas (columna izquierda), debajo de "NotebookLM", con el contenido central ocupando el ancho restante.
- Confirmar que el fade entre cards del asistente y el carrusel de cards genéricas siguen funcionando igual que antes del reposicionamiento.

## Pendientes detectados

- Si existía algún proyecto de prueba que ya hubiera visitado Onboarding **antes** de esta sesión, los items fijos que nunca se llegaron a marcar (sin fila en `seo_onboarding_checklist`) no se recrean retroactivamente — la siembra automática solo ocurre en la primerísima visita. No es un bug, pero puede sorprender si se revisa un proyecto de pruebas antiguo.
- El editor Admin SEO no ofrece forma de reasociar una `knowledge_card` a un `item_key` personalizado (custom) de un proyecto concreto, porque las cards son globales por etapa y los items custom son por proyecto — limitación de diseño conocida, no una petición pendiente.
- Sin tests automatizados para nada de lo construido en Fase B (fuera de alcance explícito desde el Checkpoint 3).
