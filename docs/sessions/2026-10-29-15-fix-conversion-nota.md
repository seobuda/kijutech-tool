# Fix: "Convertir en encargos" se quedaba colgado
**Fecha:** 2026-10-29  
**Rama:** operaciones  
**Commit:** (ver historial de la rama; commit "Fix Bloc de notas: conversión en segundo plano…")

## Qué se construyó
- **Causa raíz corregida:** se elimina `export type { SyncResult }` de `lib/operaciones/request-actions.ts`. Turbopack lo compila como una exportación real en los archivos `'use server'` (en el chunk aparecía `ensureServerEntryExports([SyncResult, …])`), y al cargar el módulo lanzaba `ReferenceError: SyncResult is not defined`, rompiendo todas las acciones del bloque (incluido el autoguardado). `nuevo-encargo-form.tsx` importa ahora el tipo desde `lib/operaciones/sync.ts`.
- `lib/operaciones/note-actions.ts` — `convertNote` se sustituye por `startConversion` + `getConversionState`: valida, lanza el trabajo en segundo plano y devuelve al instante. El paso actual, el resultado o el error se guardan en `ops_notes.proposal` (jsonb, sin cambios de esquema).
  - Pasos visibles: «Leyendo las listas del espacio…», «Preparando encargos con IA… (N listas, N caracteres)», «Revisando la respuesta de la IA…».
  - Límite total de 2,5 minutos con mensaje claro; las respuestas cortadas por límite de tokens se distinguen de un JSON inválido; `max_tokens` sube de 6000 a 8000.
- `lib/operaciones/note-types.ts` — `ConversionState` y `normalizeConversionState` (un «procesando» demasiado viejo se muestra como error).
- `lib/operaciones/clickup.ts` — toda llamada a ClickUp tiene límite de 20 s (60 s al subir adjuntos) con mensaje de error claro.
- `bloc-notas.tsx` y `page.tsx` — sondeo cada 1,5 s del estado, con tope en el cliente; al cambiar de pestaña o recargar se retoma el progreso, el error o la revisión; el guardado y «Enviar todo» ya no pueden dejar la pantalla pensando si el servidor falla; aviso de error con «Reintentar» y «Cerrar aviso».

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- El estado de la conversión se guarda en la columna `proposal` ya existente en lugar de añadir columnas nuevas.
- El trabajo en segundo plano usa una promesa sin `await` dentro de la acción (el servidor es un proceso Node persistente, como en otras partes del proyecto); si el servidor se reinicia a mitad, el estado caduca y se muestra como error.
- Aunque el diagnóstico pedía revisar las listas dentro de carpetas: ya se leían bien (`/space/{id}/folder` devuelve sus listas); verificado con el token real: 12 espacios en 0,8 s, hasta 53 listas por espacio.

## Qué verificar manualmente
- Operaciones → Bloc de notas: elegir espacio y responsable, escribir una nota y pulsar «Convertir en encargos». Debe mostrarse el paso actual y los segundos.
- Cambiar de pestaña o recargar a mitad: al volver se ve el progreso, el resultado (revisión) o el error, nunca una pantalla vacía.
- Con una nota vacía o sin espacio, el botón no se activa / muestra el motivo.

## Pendientes detectados
- **Diagnóstico del intento fallido:** no había ninguna fila de `ai_jobs` ni de `ops_notes` del intento: la IA nunca se llamó y la nota nunca se guardó, porque las acciones del servidor no se cargaban.
- El flujo completo (con sesión) no se ha podido ejecutar desde aquí: se verificó la compilación, la ausencia del error en los logs y la lectura real de listas de ClickUp.
- Lección: en archivos `'use server'` no se pueden reexportar tipos con `export type { X }`; hay que importarlos desde su módulo.
