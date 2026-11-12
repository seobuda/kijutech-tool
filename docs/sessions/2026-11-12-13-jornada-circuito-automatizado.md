# Jornada: circuito completo automatizado y arreglo del hueco de comida
**Fecha:** 2026-11-12  
**Rama:** test/jornada-circuito  
**Commit:** fa93499e

## Qué se construyó
- `tests/jornada-circuito.test.ts`: el plan de pruebas de `docs/PRUEBAS-JORNADA.md` de punta a punta (15 pasos) con el reloj simulado. Se interceptan Telegram, ClickUp («Equipo hoy») y el correo; todo lo demás es código real contra la base de datos local (manejador del bot, planificador, cola de avisos, consultas de la pestaña y del resumen). Usa una cuenta de prueba propia (`seg-test-jornada-circuito`) que se borra al terminar, sin configuración de Telegram en la base de datos (no la ve el proceso local).
  - Empleado: buenos días con botones, reintento por Telegram y correo, entrada con la tarea, `/descanso 2` con aviso de cupo, «¿Has vuelto?», «Tengo que salir» con motivo (rechaza uno demasiado corto), comida sin marcar y alargada, `/jornada`, «¿Terminas?», `/termino` repetido, corrección de la hora al día siguiente, «Hoy no trabajo», `/ayuda`.
  - Sistema: el dueño no recibe nada ni ficha, nada se marca solo, botón de otra persona rechazado, aviso normal retenido en pausa y liberado al volver, máximo de reintentos, cierre automático a la hora de fin, datos de la pestaña Jornada, minutos reales trabajados, resumen del dueño con el día corregido y sin reintentos tras una ausencia.
- `lib/operaciones/notifications.ts`: **arreglo** encontrado por la prueba: los mensajes de la jornada esperaban al hueco de comida o silencio de la ficha (p. ej. «¿Has vuelto?» de un descanso que acaba en su hora de comida). Ahora salen al momento.
- Mapa Visual (paso «Avisos retenidos») y `docs/ESTADO.md` §6.18 actualizados; la comprobación pasó.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- Simular el reloj solo para `Date` y situar el día de prueba dos días atrás: la base de datos usa su propia hora para decidir qué avisos tocan, así que los avisos del «pasado simulado» siempre están vencidos para ella.
- Comprobado que la prueba detecta fallos: sin el arreglo del hueco de comida fallan 7 de los 15 pasos.

## Qué verificar manualmente
- Lo que la prueba no cubre: cómo se ven los mensajes y botones en Telegram de verdad, y las pantallas web (Equipo → Hoy, Equipo → Jornada, menú nuevo).

## Pendientes detectados
- Verificación visual de las pantallas: requiere reconstruir el contenedor local (`docker compose up --build -d`), bloqueado por el permiso de la sesión.
- Batería completa: 186 pruebas OK; las 9 que fallan son del entorno temporal (HTTP sin app en el puerto 3000 y auditoría que ve el `.env` montado).
