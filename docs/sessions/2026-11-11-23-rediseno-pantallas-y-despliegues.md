# Rediseño de pantallas, inicio de sesión y despliegues del 11 nov
**Fecha:** 2026-11-11  
**Rama:** feature/ui-pantallas → main  
**Commit:** 846e8eb8

## Qué se construyó
- `app/(login)/login.tsx`: inicio de sesión nuevo (panel de marca con ventajas, formulario con error visible), con la misma acción `signIn` y los mismos campos. Lo aprobó Enric («haz lo pendiente»).
- `operaciones/bloc-notas.tsx`: editor como documento, barra de acciones, indicador «Guardado · hace X», historial en tarjetas y propuestas de la IA numeradas.
- `operaciones/clientes/*` y `correos/*`: cifras de clientes, lista densa con semáforo, ficha por bloques, memoria con estados; correos como bandeja con detalle en dos columnas.
- `equipo-hoy`, `bandeja`, `equipo`, `piloto`, `encargos`, `nuevo`, `automatizaciones`, `cleanup-panel.tsx`, `sync-pending.tsx`: maquetación con las piezas comunes.
- `components/app-shell/app-shell.tsx`: barra lateral visible desde 768 px y en modo iconos por debajo de 1280 px (portátiles al 125-150 %).
- `projects/page.tsx`: proyectos en tarjetas con estado.
- `tests/http.test.ts`: comprueba el texto nuevo del inicio de sesión.
- `docs/DISENO-MOTOR-ACCIONES.md`: diseño del paso 2 (motor de acciones del agente).

## Migraciones aplicadas
En esta parte, ninguna. En el despliegue anterior de la misma sesión (22:20) se aplicaron en producción `0038_ops_client_memory.sql` y `0039_ops_inbound_emails.sql`, ya documentadas en sus sesiones del 6 y el 7 nov (backup previo `backups/backup_pre_ui_correos_20261111.sql.gz` en el servidor).

## Decisiones técnicas tomadas en auto mode
- **Tres agentes en paralelo** para la maquetación, con archivos separados y la orden de no cambiar la lógica. Se comprobó después, archivo por archivo, que las llamadas a acciones del servidor y las importaciones de `lib/` no cambiaron (solo se añadió `cn`).
- Se quitaron emojis de botones y etiquetas de pantalla y se sustituyeron por iconos (los textos de Telegram no se tocaron).
- Se añadieron dos indicadores de pantalla: «Cambios sin guardar» en Automatizaciones y el resumen de la última semana en Piloto.
- **Despliegue en dos tandas:** primero el código con migraciones (con backup) y después solo la interfaz, para poder revertir cada parte por separado.

## Qué verificar manualmente
- En producción, con tu usuario: el inicio de sesión, el Bloc (escribir, ver «Guardado», convertir), Clientes (abrir una ficha y guardar), Automatizaciones (cambiar un valor y restaurarlo) y Nuevo encargo.
- En Telegram: pulsar los botones de un encargo, y si es posible en uno con dos responsables.
- El tema oscuro desde el menú del avatar.

## Pendientes detectados
- La lista de Correos no trae un extracto del cuerpo: necesita ampliar la consulta.
- Algunos JSX del formulario de Equipo tienen sangría irregular (solo estética del código).
- Paso 2 de la hoja de ruta, el motor de acciones: diseñado y pendiente de construir.
