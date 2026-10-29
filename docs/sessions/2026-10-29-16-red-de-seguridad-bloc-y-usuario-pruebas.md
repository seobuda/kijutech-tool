# Red de seguridad del Bloc de notas y usuario de pruebas
**Fecha:** 2026-10-29  
**Rama:** operaciones  
**Commit:** (ver historial de la rama)

## Qué se construyó
- `bloc-notas.tsx` — el estado «Guardado ✓ hh:mm:ss» solo aparece cuando la base de datos ha confirmado el guardado (la acción devuelve la fila guardada). Si falla, aviso rojo visible «No se ha podido guardar. Copia local activada.», reintento automático cada 8 s y botón «Reintentar ahora». Aviso del navegador al cerrar con cambios sin guardar.
- Copia local en `localStorage` (clave `ops-note-v1:<id>`) escrita en cada cambio y tras cada guardado confirmado. Al abrir, si es más reciente que la del servidor y distinta, ofrece «Recuperar la copia local» / «Descartar».
- Corregida una carrera: si se seguía escribiendo mientras se guardaba, el estado pasaba a «Guardado» sin estarlo.
- Corregido otro fallo hallado en el recorrido de pruebas: tras «Enviar todo», la nota deja de ser borrador y la página se recargaba abriendo una nota en blanco, perdiendo los resultados. Ahora la nota abierta se fija en la URL (`?nota=id`).
- `CLAUDE.md` — dos reglas permanentes nuevas: caché y consultas agrupadas con ClickUp, y usuario de pruebas con verificación tras cada despliegue.
- `.env.example` — nombres `OPS_TEST_EMAIL` y `OPS_TEST_PASSWORD` (la contraseña real solo está en `.env`, que no se versiona).

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Usuario de pruebas:** `ops-test@kijutech.test`, de la cuenta Kijutech, creado desde la propia página de registro. Para no interferir con la sesión de Enric en el mismo Chrome (cookies compartidas en `127.0.0.1`), las pruebas se hacen desde `http://ops-test.localhost:3000`, que Chrome resuelve a local con un almacén de cookies aparte.
- La contraseña se generó aleatoria y solo está en `.env`.
- Las pruebas de fallo de guardado se hicieron rompiendo `window.fetch` en el navegador, sin tocar el código.

## Qué verificar manualmente
- Escribir en el bloc: «Guardado ✓» con hora tras unos segundos.
- Desactivar la red (o parar `kijutech_app`) y escribir: debe salir el aviso rojo. Al volver, se guarda solo.
- Cerrar la pestaña con una copia local más nueva y reabrir: ofrece recuperarla.

## Pendientes detectados
- **Verificado en la prueba:** autoguardado (la base de datos confirmó), fallo simulado con aviso y copia local, reintento automático, recuperación de copia local, conversión con progreso visible, recarga que retoma el resultado, y 3 tareas reales en «Pruebas Kiju» asignadas a Enric Tabilo, con descripción y marca.
- **No verificado de extremo a extremo tras el arreglo de la URL:** el clic final de «Enviar todo» de la segunda prueba fue bloqueado por el sistema de permisos (escritura real en ClickUp), así que no se ha visto la pantalla de resultados con el arreglo ya aplicado; sí se verificó la vista de una nota convertida con sus 3 encargos.
- **Límite de ClickUp ya alcanzado en pruebas:** el bloc llegó a mostrar «429». Causa: 27 peticiones por cada carga de Bloc/Nuevo encargo y 10 por Equipo hoy. Pendiente de la caché de estructura.
- Notas de prueba en la base de datos (2): una convertida y una borrador. Hay que borrarlas al terminar, según la regla nueva.
- El usuario de pruebas debe borrarse antes de subir a un servidor.
