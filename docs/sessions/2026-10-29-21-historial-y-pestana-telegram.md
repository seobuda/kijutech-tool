# Historial del Bloc (abrir/borrar notas) y pestaña Telegram
**Fecha:** 2026-10-29  
**Rama:** operaciones  
**Commit:** (ver historial de la rama)

## Qué se construyó
- `app/(dashboard)/dashboard/operaciones/bloc-notas.tsx` — las notas del historial se abren con navegación completa (siempre recarga la nota, con «Abriendo…»); cada nota tiene un 🗑 con confirmación, y las notas convertidas (solo lectura) tienen «Eliminar nota». Al borrar una convertida, los encargos y sus tareas de ClickUp se mantienen (FK `ops_requests.note_id` es `ON DELETE SET NULL`).
- `operaciones/telegram/page.tsx` + `operaciones-tabs.tsx` — Telegram pasa a su propia pestaña; se quita de Ajustes ClickUp (`ajustes/page.tsx`).
- `ajustes/telegram-ajustes.tsx` — «Enviar mensaje de prueba» y «Enviar resumen ahora» arriba y siempre visibles (desactivados sin bot); en modo pruebas el resumen de todos llega al dueño.
- `lib/operaciones/telegram-actions.ts` — revalida la nueva ruta. `CLAUDE.md` — «pestaña Telegram».

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- Con el usuario de pruebas el clic en el historial sí navegaba pero sin señal de que hacía algo y vía navegación de cliente; se pasó a enlace normal para garantizar que carga la nota.

## Qué verificar manualmente
- Clic en una nota del historial (borrador editable; convertida solo lectura con sus encargos).
- 🗑 en el historial y «Eliminar nota»: pide confirmación; los encargos de una convertida siguen en Encargos.
- Pestaña Telegram: botones arriba; el mensaje de prueba llega a tu Telegram.

## Pendientes detectados
- Una nota nueva no aparece en el historial hasta recargar.
