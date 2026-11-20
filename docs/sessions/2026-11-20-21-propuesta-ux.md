# Propuesta de reorganización UX y análisis de la skill de Google
**Fecha:** 2026-11-20  
**Rama:** docs/propuesta-ux  
**Commit:** 18ebf960

## Qué se construyó
No se ha construido código: es una propuesta para Enric.

- **`docs/DISENO-UX-REORGANIZACION.md` (nuevo).** Diagnóstico con datos del código: 66 pantallas, unas 20 entradas en la barra, 21 pestañas en Operaciones, pendientes de Enric repartidos en 7 sitios y un cliente repartido en 5. Incluye investigación de 2025–2026 con su fiabilidad y las guías aplicables del equipo de Chrome. La propuesta organiza la herramienta en cinco espacios (Inicio, Para ti, Clientes, Equipo humano + IA, Conocimiento) más Ajustes aparte, con vistas por rol. Está cuestionada tres veces, con alternativas y un plan en 5 fases.
- **Panel de inicio (§7).** Enric pidió que el super administrador y los administradores entren a un panel con el resumen de todo. Queda acordado: lo accionable primero y después el resumen de cada área.
- **Análisis de la skill «modern-web-guidance» (GoogleChrome).** Ya estaba instalada como plugin. Es un buscador de 209 guías que se descarga de npm cada vez. Las guías son buenas para la calidad técnica de la interfaz (accesibilidad, formularios, pestañas, foco) y no para el criterio de producto. Se usa de forma selectiva y siempre dentro de un contenedor Docker.
- **Mejora futura apuntada** (`docs/ESTADO.md` §16 y memoria): avisar al equipo solo de las tareas de hoy. Lo detectó Jesús, que recibió un aviso de otro día y se puso con esa tarea.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **La skill de Google se ejecutó en un contenedor Docker temporal** (`node:24-alpine`), por la regla de no usar npm en Windows. Las guías se guardaron en el scratchpad, fuera del repositorio.
- **El navegador es Chrome de escritorio** (Mayi, en Mac; el móvil no se contempla), así que las técnicas de Chrome se pueden usar con menos red de seguridad. Aun así, no se propone rehacer los componentes de shadcn/Radix.

## Qué verificar manualmente
- Leer `docs/DISENO-UX-REORGANIZACION.md` y responder las preguntas de §6.

## Pendientes detectados
- **Siguiente sesión:** fase 1 de la propuesta, con el panel de inicio de administración primero (plan en §7 del documento).
- **Pendientes de antes:**
  - probar y encender el jefe de operaciones;
  - importar ClickUp en producción;
  - avisar solo de las tareas de hoy;
  - subagentes que presentan su trabajo a su jefe;
  - el paso «Despliegue protegido» del mapa de Seguridad (necesita OK);
  - el `TimeoutNegativeWarning`.
