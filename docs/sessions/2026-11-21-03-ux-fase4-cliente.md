# UX fase 4: el cliente en un solo sitio
**Fecha:** 2026-11-21  
**Rama:** feature/ux-fase4-cliente  
**Commit:** c34c2b27

## Qué se construyó
- `app/(dashboard)/dashboard/clientes/[id]/ficha-view.tsx`: nuevas pestañas de la ficha.
  - A la vista: Resumen · Encargos · Rendimiento · Estrategia · SEO.
  - En el desplegable «Ficha y ajustes»: Empresa y negocio, Contactos, Webs y cuentas, Competencia, Memoria y Operaciones. Muestra la pestaña activa y sus recuentos.
  - En el Resumen, una línea con el trabajo del cliente (`WorkStrip`).
- `app/(dashboard)/dashboard/clientes/[id]/tab-trabajo.tsx`: las pestañas Encargos (abiertos y completados) y SEO (proyectos del cliente).
- `app/(dashboard)/dashboard/clientes/[id]/page.tsx`: `clientWork`, que carga los encargos (por la opción de ClickUp o por el nombre) y los proyectos SEO (por id, nombre o alias).
- `app/(dashboard)/dashboard/clientes/layout.tsx`: márgenes de la sección, que no los tenía.
- `components/clientes-tabs.tsx`: pestañas comunes del espacio Clientes. Se pusieron en `clientes/page.tsx`, `rendimiento/page.tsx`, `estrategia/page.tsx` y `projects/page.tsx`.
- `app/(dashboard)/dashboard/projects/new/page.tsx` y `project-form.tsx`: `?cliente=` deja el cliente ya escrito.
- `lib/architecture-map/registry.ts`: el nodo de la fase 4 pasa a construido.
- `docs/ESTADO.md` (§6.34) y `docs/DISENO-UX-REORGANIZACION.md` (§7).

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Pestañas: como mucho 5 a la vista + «Ficha y ajustes»**, siguiendo el principio de §3.4 de la propuesta (como mucho 6). Se ve lo del día a día y los datos de la ficha quedan a un clic. Las claves `?tab=` no cambian, así que los enlaces de Para ti y los de siempre siguen valiendo.
- **Proyectos SEO por nombre o alias, sin tocar su creación.** `projects.client_id` existe pero el formulario nunca lo rellena. Rellenarlo sería tocar el núcleo y, según CLAUDE.md, hay que preguntar antes. Queda como pendiente.
- **Encargos por la opción de ClickUp o por el nombre de cliente del encargo.** No se hacen peticiones a ClickUp en directo: se usan los encargos guardados en la herramienta, que ya incluyen los creados en ClickUp y reflejados aquí.
- **Las vistas de todos los clientes, como pestañas** (Fichas, Rendimiento web, Estrategia, Proyectos SEO). Encargos sigue en Día a día y en la ficha de cada cliente.
- **Arreglo de paso:** la sección Clientes no tenía márgenes y salía una barra de desplazamiento horizontal. Se añadió un layout con el contenedor común.

## Qué verificar manualmente
- Abrir la ficha de un cliente con trabajo y comprobar:
  - pestaña Encargos (abiertos arriba y completados debajo);
  - pestaña SEO;
  - desplegable «Ficha y ajustes» con sus 6 secciones;
  - la línea de trabajo del Resumen.
- En Para ti, pulsar «Resolver» en una propuesta del estratega: debe abrir la pestaña Estrategia de la ficha.
- Recorrer las pestañas Fichas · Rendimiento web · Estrategia · Proyectos SEO del espacio Clientes.

Ya revisado en local como editor (no hizo falta cambiar roles):
- ficha de clubpilatesindautxu.es con sus 8 encargos;
- el desplegable «Ficha y ajustes»;
- los márgenes nuevos;
- las pestañas en Rendimiento web;
- el formulario de nuevo proyecto con el cliente ya escrito.

Pruebas y mapa: 478/478 pruebas pasan, el Mapa Visual está actualizado y `node scripts/check-architecture-map.js` pasa.

## Pendientes detectados
- **Guardar `projects.client_id`** al crear un proyecto SEO, con un selector de cliente en vez de texto libre. Es núcleo: necesita el OK de Enric.
- **Los encargos sin cliente** no aparecen en ninguna ficha. Podrían salir en una vista «Sin cliente».
- **«Nuevo encargo» desde la ficha** no lleva el cliente ya elegido. El formulario de Operaciones no lo admite todavía.
- **Siguiente:** fase 5, ayuda y pulido.
- **Archivo ajeno a la sesión:** hay un archivo sin versionar, `docs/Arquitectura ingeniera SpaceX.md`, que no es de esta sesión. No se ha tocado.
