# Jornada real: plan de pruebas comprimido y guía para el equipo
**Fecha:** 2026-11-12  
**Rama:** fix/jornada-pruebas  
**Commit:** 66c89526

## Qué se construyó
- `docs/PRUEBAS-JORNADA.md`: plan de pruebas con todo el circuito (buenos días, reintento con correo, entrada, descanso sobre el cupo, salida con motivo, comida sin marcar y alargada, fin de horario, cierre automático y correcciones en la web) en unos 20 minutos, con los valores exactos de la automatización y de la ficha, y cómo dejarlo todo como estaba.
- `docs/GUIA-EQUIPO-JORNADA.md`: guía para el equipo (por qué, el día paso a paso, comandos y preguntas frecuentes).
- `lib/operaciones/automations.ts`: el cierre automático admite desde 5 min (antes 30), para poder probarlo.
- `app/(dashboard)/dashboard/operaciones/equipo/equipo-view.tsx`: horas por día en pasos de 0,05 h (antes 0,5), para un horario de prueba de 15 min.
- `lib/operaciones/jornada-worker.ts`: en modo pruebas el correo de reintento va al dueño (copia oculta del buzón), con «[Modo pruebas · iba para …]» en el asunto; antes habría llegado a la persona real.
- Los dos documentos se enviaron por correo a Enric desde `agente@equipo.kijutech.com` (Resend), en HTML y con adjuntos .html y .md.
- Mapa Visual: sin cambios de estructura; la comprobación pasó. `docs/ESTADO.md` §6.18 actualizado.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Correo de reintento al dueño en modo pruebas:** al preparar el plan se vio que el correo de reintento llegaba a la persona real del equipo aunque Telegram estuviera en modo pruebas.
- **Recomendar la prueba por la mañana en Madrid:** el modo pruebas desvía al dueño todos los avisos del equipo, y la jornada encendida sustituye su resumen diario; fuera de su horario no les afecta.
- **Envío de los documentos con un script temporal** (en el directorio temporal de la sesión, no versionado) y la clave de Resend de `.env`, sin pasar por la app.

## Qué verificar manualmente
- Que han llegado los dos correos (y no están en spam).
- Seguir `docs/PRUEBAS-JORNADA.md` en producción **después de desplegar esta rama** (sin ella, el cierre automático no baja de 30 min y las horas por día no bajan de 0,5).

## Pendientes detectados
- Al presentar la guía al equipo, confirmar el cupo de descansos real (por defecto 20 min) y la hora a la que empieza a funcionar.
- La pregunta de corrección del cierre automático y la sección de jornada del resumen solo se ven al día siguiente (documentado en el plan).
