# Pendientes de Enric

Lista viva de lo que solo puede hacer Enric (accesos, decisiones, el equipo). Claude la actualiza al terminar cada bloque.
Detalle paso a paso de la activación en `docs/PRUEBAS-EN-VIVO.md`.

**Última actualización:** 13 nov 2026, de madrugada. En producción: `main` `9cc5e08d` (autonomía e informes + fichas desde el historial), sin migraciones nuevas.

## Viernes 13 — antes de activar al equipo (unos 45 min)
- [ ] **Revisar con tu cuenta de admin** lo que Claude no puede ver (no hay usuario de pruebas en producción):
  - [ ] Equipo → Tiempos;
  - [ ] Equipo → Fichas: el selector «Mi panel:»;
  - [ ] Equipo → Calendario: añadir y quitar un festivo;
  - [ ] Operaciones → Informes: las tres vistas;
  - [ ] Sistema → Automatizaciones: las 4 tarjetas nuevas y «Enviarme una prueba» en Informes;
  - [ ] Sistema → Salud: las comprobaciones nuevas.
- [ ] **Telegram:** vincular a **Eury** (Sistema → Telegram).
- [ ] **Fichas de Equipo:** horario correcto de cada persona (zona, entrada, horas, días y comida). Rellenar las fichas de **Eury y
  Mayelin**.
- [ ] **Calendario:** festivos que vienen (8 dic, 25 dic, 1 ene, 6 ene…), festivos del país de quien trabaja desde fuera y
  vacaciones conocidas.
- [ ] **Automatizaciones:** revisar los plazos (Plazos de lo que espera de ti), las horas de los informes y tu tope de gasto de IA.
- [ ] **Buzón del agente:** comprobar en Correos → Buzón del agente que la clave de Resend está conectada. Si no, no entra ningún
  correo de cliente.
- [ ] **Copia diaria nueva y prueba de restauración mensual** en el servidor (§0.5 de la guía): `chmod +x`, probar cada una una vez y poner las dos líneas del cron.

## Viernes 13 — activación
- [ ] Ensayo de 20 min con **modo pruebas activo** y la **Jornada real** encendida (§1 de la guía).
- [ ] Mandar la guía al equipo (`docs/GUIA-EQUIPO-JORNADA.md`) con el mensaje del §2.1.
- [ ] **Apagar el modo pruebas** (Sistema → Telegram) y vigilar el día (tabla del §2.3).
- [ ] Recordar: si algo molesta, se apaga el interruptor de la tarjeta en Automatizaciones y en unos 10 segundos deja de actuar.

## Fin de semana (cuando puedas)
- [ ] **Vigilancia desde fuera del servidor:** cuenta en un servicio de monitorización que consulte
  `https://brain.kijutech.com/api/health`, o un cron en tu NAS (§0.6).
- [ ] **Copia fuera de DigitalOcean:** decidir destino (Google Drive de la agencia o NAS) y dar el acceso, para configurar `rclone`
  juntos.
- [ ] **Gemini:** recargar créditos de la clave de transcripción, o decidir otro proveedor. Sin esto, el dictado por voz no funciona.
- [ ] **Fichas de clientes:** 50 de 52 están en gris (sin servicio ni horas), así que no generan alertas. En **Operaciones → Clientes →
  «Ver propuestas»** salen servicios, responsable habitual y listas sacados del historial de ClickUp: revisa y pulsa «Aplicar» en cada
  una (unos 15 min para todas).
- [ ] **Limpieza de datos de prueba:** borrar en ClickUp las tareas de prueba de la lista «Pruebas Kiju» (ver `docs/ESTADO.md` §14)
  y resolver los posibles clientes duplicados (`sih`/`Sihbou.com`, familia «CP …»/`clubpilatesindautxu.es`,
  `Spid2005.com`/`SonidoFundamental`).

## Lunes 16
- [ ] 08:30: leer el **primer informe semanal** (saldrá corto) y decir qué sobra o qué falta.
- [ ] Encender **Tiempos de tarea** (Automatizaciones) y, si puedes, poner los márgenes en Equipo → Tiempos.
- [ ] Si llega la propuesta de subir la autonomía del agente, decidir con el botón.

## Decisiones que esperan tu aprobación (Claude no las hace sin tu OK)
- [ ] **Reasignar desde el parte con un botón:** necesita una migración pequeña (añadir la acción «reasignar» a la bandeja de
  salida hacia ClickUp).
- [ ] **IA de reserva:** si falla el proveedor principal, usar otro. Toca la pasarela de IA del núcleo (`lib/ai/gateway.ts`).
- [ ] **5C: temporadas, niveles y misiones.** El diseño está aprobado; falta aprobar su esquema de base de datos. Mejor después de
  1–2 semanas de jornada real.
