# Pestañas de Operaciones según el rol
**Fecha:** 2026-11-12  
**Rama:** fix/pestanas-por-rol  
**Commit:** ba9c3b9a

## Qué se construyó
- `components/app-shell/nav.ts`: `adminOnly` en las pestañas cuya página exige admin (Agente, Piloto, Equipo → Jornada y las cuatro de Sistema) y `visibleTabs(tabs, roles)`.
- `components/app-shell/use-roles.ts` (nuevo): `useRoles()` sacado de `app-shell.tsx` para reutilizarlo.
- `app/(dashboard)/dashboard/operaciones/operaciones-tabs.tsx`: las pestañas de la sección se filtran por rol.
- `components/app-shell/command-palette.tsx`: la paleta (Ctrl+K) ya no ofrece pantallas de admin a quien no lo es.
- `tests/nav-roles.test.ts` (nuevo): cada pestaña tiene su página y solo se oculta al editor si su página exige admin.
- `docs/ESTADO.md`: cabecera, §13 (menú según el rol) y §18.
- Mapa Visual: sin cambios (no cambia ningún proceso); la comprobación pasó.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Encontrado al revisar en local tras desplegar la jornada:** con el usuario de pruebas (editor) la pestaña «Jornada» aparecía y al pulsarla redirigía al Bloc. Agente y Piloto tenían el mismo problema desde antes. Se ocultan en vez de mostrar un aviso, porque el editor no tiene nada que hacer ahí.
- La prueba compara cada pestaña con el texto `requirePagePermission('admin')` de su página, para que una pantalla nueva solo para admin no vuelva a quedar visible.

## Qué verificar manualmente
- Con un usuario admin: en Operaciones siguen Agente y Piloto; en Equipo, Jornada; y el grupo Sistema completo.
- Revisado en local con el usuario de pruebas (editor): Equipo muestra Hoy y Fichas; Operaciones, sin Agente ni Piloto; sin errores en los logs.

## Pendientes detectados
- No se pudo ver la pantalla Equipo → Jornada en local: el usuario de pruebas es editor. Para revisarla haría falta darle admin temporalmente o verla con la cuenta de Enric en producción.
- La descripción de la sección Equipo menciona la jornada aunque el editor no vea esa pestaña (menor).
