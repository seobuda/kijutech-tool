# UX fase 2: Para ti, la bandeja única
**Fecha:** 2026-11-21  
**Rama:** feature/ux-fase2-para-ti  
**Commit:** 26b5bcd5

## Qué se construyó
- `lib/inicio/para-ti.ts`: la bandeja única, sin tablas propias. Contiene:
  - `KINDS`, la única definición de los 9 tipos: etiqueta, departamento, si es urgente y si lo decide solo el dueño;
  - `getParaTi`, que recoge cada elemento del estado de su módulo y lo ordena (lo urgente primero; dentro, lo que más espera);
  - `filterEntries` y `countByKind`, que son puros.
- `app/(dashboard)/dashboard/para-ti/page.tsx`: la pantalla Para ti, solo para admin.
  - Filtros por departamento del organigrama y por tipo, que van en la dirección.
  - Revisiones y bloqueos se deciden ahí mismo, pero solo el dueño de las operaciones.
  - Los demás elementos enlazan a su sitio concreto.
  - Se actualiza sola y tiene estados vacíos.
- `app/api/para-ti/route.ts`: el número de la barra. Solo admin, y devuelve solo `{ count, urgent }`.
- `app/(dashboard)/dashboard/operaciones/bandeja/items.ts`: `toBandejaItems`, sacado de Mi bandeja para compartirlo con Para ti.
- `components/app-shell/nav.ts` y `app-shell.tsx`: «Para ti» lleva a la bandeja única y muestra su número, rojo si hay algo urgente. «Mi bandeja» sale de las subentradas.
- `lib/inicio/panel.ts`: `getWaiting` sale ahora de `getParaTi`, así los recuentos del Inicio y de Para ti no pueden desajustarse. Las tarjetas del Inicio llevan a Para ti filtrado por su tipo.
- `lib/architecture-map/registry.ts`: el nodo «Para ti» pasa a construido.
- `tests/para-ti.test.ts`: 6 pruebas nuevas.
- `docs/ESTADO.md` (§6.32) y `docs/DISENO-UX-REORGANIZACION.md` (§7) actualizados.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Solo el dueño decide revisiones y bloqueos.** Se mantiene la regla de Mi bandeja (`isInboxOwner`). Los demás admins ven esos elementos en la lista con la nota «lo decide quien lleva las operaciones», en vez de un candado. Así se resuelve lo detectado en la fase 1 sin cambiar quién decide.
- **Se decide ahí mismo solo lo que ya tenía botones reutilizables** (revisiones y bloqueos, con `BandejaList`). Correos, propuestas del agente, dudas, base, estratega, fichas y errores enlazan a su elemento concreto, con `?id=` o `?tab=` cuando la pantalla lo admite. Llevar sus botones a Para ti queda como mejora: cada uno tiene su propio componente y sus acciones.
- **Filtro por departamento del organigrama** (`agt_departments`), con nombres por defecto si falta alguno. Cada tipo tiene asignado un departamento:
  - Sistema: los errores;
  - Cuentas y Estrategia: el estratega y las fichas;
  - Operaciones: todo lo demás.
- **Una sola definición de los tipos** (`KINDS`), que usan Para ti, el Inicio y el contador, para que no se desajusten.
- **El contador de la barra se pide cada minuto** y solo para admin. Devuelve únicamente el número, nunca el contenido. Si falla, devuelve 0 y lo registra, para que el menú no se rompa por esto.
- **«Mi bandeja» sale de la barra.** Para ti ya la incluye y, para un admin que no es el dueño, llevaba a un candado. Sigue en Día a día y en su dirección de siempre.

## Qué verificar manualmente
- Entrar como Enric en Para ti:
  - el número de la barra debe coincidir con el total;
  - los filtros por departamento y por tipo deben funcionar;
  - un bloqueo debe poder responderse ahí mismo.
- Desde Inicio, pulsar una tarjeta de «Lo que espera de ti»: debe abrir Para ti filtrado por ese tipo.
- Pulsar «Resolver» en un elemento de cada tipo y comprobar que lleva a su sitio: la entrada de la base, el error, la pestaña Estrategia o Memoria del cliente, Correos, Propuestas del agente o Dudas del equipo.

Ya revisado en local:
- **Como admin** (rol temporal en el usuario de pruebas, con permiso de Enric): sale el bloqueo pendiente con la nota del dueño, el número 1 en rojo en la barra y los filtros con los nombres del organigrama.
- **Como super_admin**, que es el dueño porque su ficha no está enlazada: el bloqueo aparece con sus botones. No se pulsó ninguno.
- Al terminar, el usuario de pruebas volvió a ser solo editor.
- Sin errores en la consola ni en los logs.
- 470/470 pruebas pasan, el Mapa Visual está actualizado y `node scripts/check-architecture-map.js` pasa.

## Pendientes detectados
- **Decidir ahí mismo también** correos, propuestas del agente, dudas del equipo, propuestas del estratega y cambios en fichas. Hoy enlazan a su pantalla.
- **Rendimiento:** Para ti hace unas 9 consultas a la base de datos. El contador las repite cada minuto por cada admin con la herramienta abierta. Con pocos admins no es un problema; si crecen, convendría una caché corta.
- **Ver el contenido de cada pendiente sin salir de la lista** (vista previa), para revisar más rápido.
- **Siguientes fases:**
  - 3: Equipo humano + IA, con foto o avatar (necesita esquema);
  - 4: el cliente en un solo sitio;
  - 5: ayuda y pulido.
