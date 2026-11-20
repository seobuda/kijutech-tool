# UX fase 1: Inicio por rol y menú en cinco espacios
**Fecha:** 2026-11-20  
**Rama:** feature/ux-fase1  
**Commit:** 9b04c567

## Qué se construyó
Primero se confirmaron con Enric las decisiones pendientes de `docs/DISENO-UX-REORGANIZACION.md` §6: cinco espacios con Ajustes aparte, el equipo ve solo lo suyo, se empieza por la fase 1, y en la fase 3 habrá foto o avatar.

- `app/(dashboard)/dashboard/page.tsx`: `/dashboard` deja de redirigir al Bloc de notas y pasa a ser el Inicio, distinto según el rol. Un usuario sin rol ve un aviso en vez de entrar en un bucle de redirecciones.
- `app/(dashboard)/dashboard/_inicio/admin-home.tsx`: el panel de super_admin y admin.
  - Arriba, «Lo que espera de ti», con nueve tipos, el número de cada uno, lo más antiguo y un clic a su sitio.
  - Debajo, cuatro tarjetas: Clientes, Equipo hoy, Agentes y Sistema. El gasto de IA solo lo ve super_admin.
- `app/(dashboard)/dashboard/_inicio/team-home.tsx`: el Inicio de cada persona, como panel (lo pidió Enric tras ver la primera versión):
  - **lo urgente**: devoluciones, bloqueos sin resolver y dudas sin valorar;
  - **cómo vas**: terminadas, a tiempo, dentro del margen y precisión, sin ranking;
  - **tu día** y, al lado, la jornada, las dudas y lo nuevo de la base.
- `app/(dashboard)/dashboard/mis-tareas/`: la pantalla **Mis tareas** (vencidas, hoy, 7 días, hasta 14 días y sin fecha) y `task-list.tsx`, la fila de tarea que comparte con Inicio.
- `lib/operaciones/my-tasks.ts`: la **fuente de tareas** con un tipo propio (`WorkTask`). Hoy junta ClickUp (una consulta de workspace por persona, con caché de 2 min) y los encargos de la herramienta. Cuando la herramienta sustituya a ClickUp, en 2027, solo cambiará esta capa.
- `lib/inicio/panel.ts`: añade `getMyUrgent` y `getMyStats`.
- `tests/mis-tareas.test.ts`: reparto por fechas y unión con el encargo.
- `app/(dashboard)/dashboard/_inicio/parts.tsx`: piezas comunes (saludo, tarjeta de área, carga y «no disponible»).
- `lib/inicio/panel.ts`: los datos del Inicio, solo de lectura. Cada bloque está protegido por `safeBlock`: si falla, lo registra en el registro de errores y la tarjeta dice «no disponible».
- `components/app-shell/nav.ts`:
  - espacios con subentradas, `NEW_ACTIONS` («＋ Nuevo») y `ACCOUNT_LINKS`;
  - para marcar la entrada activa, `activeChild` elige la subentrada más concreta;
  - nombres únicos: Fichas SEO, Propuestas del agente, Métricas del agente, Rendimiento web, Día a día y Ajustes del sistema.
- `components/app-shell/app-shell.tsx`: subentradas desplegables y botón «＋ Nuevo» (en escritorio y en móvil). Mi cuenta, Seguridad y Actividad pasan al menú del usuario, y el logo lleva a Inicio.
- `components/app-shell/command-palette.tsx`: la paleta (Ctrl+K) busca también en las subentradas e incluye las acciones «Nuevo: …».
- `components/app-shell/use-roles.ts`: rol `canEdit` (editor o superior).
- `app/(dashboard)/dashboard/clientes/page.tsx` y `clientes-view.tsx`: `?nuevo=1` abre directamente el alta de cliente.
- `lib/architecture-map/registry.ts`: nodo «Inicio y navegación» como construido, y las fases 2 a 5 como nodos grises.
- `tests/nav-roles.test.ts`: pruebas nuevas de la barra (ver «Decisiones»).
- `docs/ESTADO.md` (§6.31, pendientes, hoja de ruta, cronología y mapa de archivos) y `docs/DISENO-UX-REORGANIZACION.md` (§7, decisiones confirmadas).

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Subentradas en la barra en vez de mover pantallas.** Las rutas no cambian, así que los enlaces de Telegram siguen valiendo. Cada pantalla se coloca en su espacio, y las subentradas se despliegan solo dentro de ese espacio para que la barra siga siendo corta.
- **Dónde va cada pantalla:**
  - Encargos va en Clientes.
  - Bloc de notas va en Para ti y, además, en «＋ Nuevo → Nota».
  - Informes va en Equipo.
  - Errores va en Para ti, como «algo que espera de ti». Salud sigue en Ajustes → Sistema.
- **Inicio sin `requirePagePermission`.** Ese guard manda a `/dashboard` a quien no tiene permiso, así que un usuario sin rol entraría en un bucle (ya pasaba antes a través del Bloc de notas). Inicio usa `checkPermission` y muestra un aviso.
- **Cada tarjeta con su propio Suspense.** La página se pinta al momento y las tareas de ClickUp llegan después, con su indicador, como pide la regla de ClickUp. Se reutiliza la caché de 2 minutos de `getTeamToday`.
- **Mis tareas, contra un tipo propio.** Enric anunció que en 2027 la herramienta sustituirá a ClickUp, así que la pantalla no usa los tipos de ClickUp sino `WorkTask`. No se ha creado una tabla de tareas propia: es una decisión de esquema que se planteará como proyecto aparte.
- **Solo consulta.** Empezar y terminar tareas siguen por Telegram, para no tener dos caminos para lo mismo mientras ClickUp siga.
- **Cifras del equipo sin ranking ni horas en grande**, por coherencia con Mi panel (para mejorar, no para compararse). Los puntos y rachas quedan para el paso 5C.
- **Las fechas de otro año llevan el año.** Una tarea vencida en 2025 aparecía como «jue, 20 nov» y parecía de esta semana.
- **Prueba nueva:** «nadie ve en el menú una página que no puede abrir». Calcula el permiso de cada entrada leyendo la página y los layouts que la envuelven. Encontró un fallo antes del commit: «Nuevo → Entrada de conocimiento» se ofrecía al editor y la página exige admin. Ahora solo la ve admin.
- **«Sistema y automatizaciones» se cortaba en la barra**: se queda en «Sistema».

## Qué verificar manualmente
- Entrar con el usuario de Enric en `http://127.0.0.1:3000/dashboard`:
  - debe salir el panel con «Lo que espera de ti» y las cuatro tarjetas;
  - el gasto de IA solo debe aparecer en la tarjeta Sistema.
- Pulsar cada aviso de «Lo que espera de ti» y comprobar que lleva al sitio correcto.
- Recorrer los espacios. Las subentradas solo deben desplegarse dentro de su espacio, y la entrada marcada debe ser la correcta, por ejemplo Equipo → Organigrama.
- Probar «＋ Nuevo → Cliente»: el formulario de alta debe abrirse directamente.
- Abrir con Ctrl+K y buscar «nuevo» y «organigrama».
- Pedir a una persona del equipo con la ficha enlazada que mire su Inicio y diga si se entiende sin explicaciones.

Ya revisado en esta sesión, en local:
- **Vista de editor** con el usuario de pruebas: menú corto, aviso de «ficha sin enlazar», «＋ Nuevo» con 4 acciones y alta de cliente con `?nuevo=1`.
- **Inicio del equipo y Mis tareas con datos reales**: se enlazó de forma temporal el usuario de pruebas a la ficha de Enric, con su permiso, y luego se desenlazó.
  - Se vieron lo urgente (1 bloqueo), las cifras, las 34 vencidas y Mis tareas completa.
  - Una vez ClickUp tardó demasiado en responder: la tarjeta lo registró y no tumbó el resto.
  - 1 petición a ClickUp por persona cada 2 minutos como mucho.
- **Vista de admin**: se le dio el rol admin al usuario de pruebas de forma temporal, con permiso de Enric, y luego se le quitó (vuelve a ser editor).
  - Panel completo, con 1 bloqueo, el semáforo y 61 tareas vencidas.
  - Inicio hace 1 petición a ClickUp al cargar.
- Sin errores en la consola ni en `docker logs`.

Pruebas y mapa:
- 464/464 pruebas pasan (`pnpm test`).
- El Mapa Visual está actualizado y `node scripts/check-architecture-map.js` pasa.

## Pendientes detectados
- **«Mi bandeja» es personal**: solo la ve el dueño de las operaciones, así que un admin que no lo sea ve un candado al entrar en Para ti. La fase 2 (bandeja única) debe resolverlo.
- **En local ninguna ficha del equipo está enlazada a un usuario.** Sin ese enlace, nadie del equipo ve su Inicio ni Mis tareas. Hay que comprobarlo en producción (Equipo → Fichas).
- **Tabla de tareas propia**: el siguiente paso grande para dejar ClickUp en 2027. Necesita esquema, plan de migración de datos y la aprobación de Enric.
- **Tareas de prueba en ClickUp asignadas a Enric** (`[PRUEBA 6C-2]…` y la de Indautxu en «Pruebas Kiju», vencidas desde el 30 oct): conviene cerrarlas.
- **`/dashboard/projects/new` no tiene guard de página**; la protección está solo en la acción. Ya era así antes; conviene revisarlo.
- **Accesibilidad**: cuando estás dentro de una subentrada, el espacio y la subentrada llevan los dos `aria-current`. Es menor; se puede ajustar en la fase 5 (pulido).
- **Siguientes fases**:
  - 2: Para ti, la bandeja única;
  - 3: Equipo humano + IA, con foto o avatar (necesita esquema);
  - 4: el cliente en un solo sitio;
  - 5: ayuda y pulido.
