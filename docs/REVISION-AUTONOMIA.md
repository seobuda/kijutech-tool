# Revisión de autonomía — qué falta para que el sistema funcione sin estar pendiente

**Fecha:** 2026-11-12 · **Base:** `main` `75481a59` (producción) · **Pedido por Enric:** «quiero que sea un sistema prácticamente
autónomo… que me informe de lo necesario, me envíe los reportes… analizar si hay algo mejorable u optimizable».

> **Límite de esta revisión:** está hecha sobre el código, `docs/ESTADO.md` y las sesiones. **No he podido leer la base de datos de
> producción**: el permiso de la sesión bloqueó la consulta de solo lectura por SSH. Lo marcado con **(sin verificar en producción)**
> sale de la documentación y conviene confirmarlo (consulta al final).

> **Estado (12 nov, noche): aprobado por Enric («dale a todo») y construido en `feature/autonomia`, sin migraciones.**
>
> **Hecho:**
> - B1 calendario;
> - B2 correos en Mi bandeja y en los resúmenes;
> - B3 plazos con recordatorio. La decisión por defecto al vencer el plazo **no** se ha hecho: solo recuerda;
> - B4 parte con «Mover a mañana» y sugerencia de quién cubre. Reasignar sigue siendo en ClickUp, porque la bandeja de salida no
>   tiene esa acción y añadirla necesita una migración;
> - B5 limpieza semanal (apagada por defecto);
> - B6 autonomía con propuesta y bajada automática;
> - B7 tope de IA como incidencia de Salud. Avisa, no corta las llamadas;
> - C1–C4 informes;
> - D2 comprobaciones de salud (IA, disco, copia);
> - E ESTADO.md.
>
> **Preparado, pero lo instala Enric:** D3 (`scripts/backup.sh` con subida opcional con `rclone`) y D1 (servicio externo).
>
> **Sin hacer:**
> - D4 IA de reserva, porque toca la pasarela del núcleo;
> - el aviso de cuota de Resend;
> - la prueba de restauración automática.
>
> **Guía de activación:** `docs/PRUEBAS-EN-VIVO.md`.

---

## 1. Diagnóstico en una frase

**Las piezas para la autonomía están construidas, pero el sistema todavía funciona «para Enric» y no «en lugar de Enric».** Hay tres
motivos:

1. **Está a medio encender.** El modo pruebas del bot (todo llega solo a ti), la jornada y los tiempos están apagados. Además, 50 de
   52 clientes no tienen la ficha completa para generar alertas y hay una persona sin vincular al bot.
2. **Todo pasa por ti y nada escala.** Hay varias colas que esperan tu decisión sin plazo ni recordatorio. Una de ellas, las
   respuestas a correos de clientes, ni siquiera sale en tus resúmenes.
3. **Informa al momento, pero no da informes.** Tienes resúmenes a las 13:00 y a las 18:00 y alertas cuando algo falla. No hay
   informe semanal ni mensual, ni de equipo, ni de clientes, ni del propio sistema.

A esto se suma un punto débil de resiliencia: **quien vigila y quien guarda las copias viven en el mismo servidor que vigilan.**

---

## 2. Principios que propongo (para juzgar todo lo demás)

Son los que usan los equipos de operaciones que funcionan solos («gestión por excepción»):

| Principio | Qué significa aquí |
|---|---|
| **Silencio = todo bien** | Solo te llega lo que necesita tu decisión o lo que se sale de lo normal. Lo demás va a un informe periódico. |
| **Toda cola tiene dueño, plazo y escalado** | Nada puede esperar indefinidamente: pasado un plazo se recuerda, se escala o se decide con una regla por defecto. |
| **Todo proceso automático demuestra que funciona** | Cada tarea de fondo deja su «última vez que fue bien», y alguien externo avisa si deja de hacerlo. |
| **Lo que decides dos veces igual se convierte en regla** | Tus decisiones repetidas se proponen como regla automática, con tu aprobación. |
| **La autonomía sube con datos y baja sola** | Subir de nivel la aprueba Enric con datos. Bajar ante errores es automático, porque va en la dirección segura. |
| **Lo que sale hacia un cliente, siempre con aprobación** | Hasta que los datos digan lo contrario (decisión ya tomada para los correos). |

---

## 3. Hallazgos

### A. Activación: lo que ya existe y no está trabajando (impacto máximo, casi sin código)

| # | Hallazgo | Efecto | Qué hacer |
|---|---|---|---|
| A1 | **Modo pruebas del bot activo (sin verificar en producción).** | El equipo no recibe nada: avisos, recordatorios, resúmenes y bloqueos llegan solo a ti. **El sistema no puede sustituir a nadie mientras siga así.** | Vincular a Eury, apagar el modo pruebas y vigilar una semana. |
| A2 | **Jornada y tiempos apagados** (a propósito). | Sin la jornada no hay retención de avisos en pausas ni minutos reales. Sin tiempos no hay datos para los márgenes ni para 5C. | Encenderlos tras A1 y **después de B1**: sin festivos ni vacaciones, el bot molestaría en días libres. |
| A3 | **50 de 52 clientes en gris**, con la ficha sin completar. | Las alertas de clientes, el plazo y el responsable habitual no funcionan para casi nadie. | Rellenado asistido: el agente propone cada ficha (servicio y responsable habitual) a partir del historial de ClickUp y tú aceptas por lotes. |
| A4 | **Fichas de Eury y Mayelin sin rellenar** y ninguna ficha enlazada a su usuario web. | La IA reparte peor y nadie ve Mi panel. | Rellenarlas con «Rellenar con IA» y enlazarlas en Fichas. |
| A5 | **Clave de Gemini sin créditos.** | El dictado por voz del Bloc y el audio de las fichas no funcionan. | Recargar la clave o pasar la transcripción a otro proveedor. |
| A6 | **Buzón del agente:** al desplegarlo faltaba conectar la clave de Resend (sin verificar en producción). | Si sigue sin conectar, no entra ningún correo de cliente. | Comprobarlo en Correos → Buzón del agente. |

### B. Bloqueos de autonomía en lo construido (código)

| # | Hallazgo | Por qué importa | Propuesta |
|---|---|---|---|
| B1 | **No hay festivos ni vacaciones planificadas.** «Hoy no trabajo» solo vale para el día. | Con la jornada encendida, un festivo o unas vacaciones de dos semanas generan buenos días, reintentos y **correos diarios** a quien está libre. También falsean plazos, recordatorios y alertas. **Es lo primero que rompería la confianza del equipo.** | Calendario de festivos (nacional, autonómico y local) y ausencias por rango: «vacaciones del 1 al 15». La jornada, los plazos y los recordatorios lo respetan. *Necesita una tabla: aprobación de esquema.* |
| B2 | **Las respuestas propuestas a correos de clientes no salen en Mi bandeja ni en los resúmenes.** Solo llega un Telegram en el momento. | Si ese mensaje se pierde, **un cliente puede quedarse sin respuesta en silencio**. Es el peor fallo posible para un sistema que sustituye a una persona. | Llevarlas a Mi bandeja y a la sección «Necesita de ti» con su antigüedad. Recordatorio a las X horas y aviso urgente si el correo es de un cliente Top. |
| B3 | **Lo que espera de ti no tiene plazo ni escalado:** revisiones, bloqueos escalados, propuestas de correo y notas sin convertir. | Te obliga a estar pendiente: si no miras, se acumula. | Un plazo por tipo (por ejemplo, revisión 24 h laborables, bloqueo 2 h, correo de cliente 4 h). Pasado el plazo, recordatorio único. Si es seguro, decisión por defecto: por ejemplo, una revisión sin respuesta en 48 h se acepta sola y queda registrada como «aceptada por plazo». Todo configurable en Automatizaciones. |
| B4 | **Persona ausente con tareas que vencen hoy:** no pasa nada. | Las entregas se caen sin que nadie lo vea hasta el día siguiente. | Al marcar ausencia, o si no ficha a media mañana: «Mayelin no está hoy y tiene 3 tareas que vencen. Propuesta: pasar 2 a Jesús (tiene hueco) y mover 1 a mañana», con botones. |
| B5 | **La limpieza de vencidas es un botón manual.** | Las vencidas se acumulan hasta que te acuerdas. | Pasada automática semanal, por ejemplo el lunes a primera hora, por persona y con tope. |
| B6 | **La autonomía del agente solo se recomienda en la pestaña Agente**, que hay que abrir. | Nunca sube de nivel si no entras a mirarla. | Mensaje semanal: «Respuestas a bloqueos: 34 decisiones, 97 % sin cambios. ¿Pasarla a autónomo?», con botón. **Bajada automática** si en autónomo baja del 80 %. |
| B7 | **Sin tope de gasto de IA.** Ya estaba en pendientes. | Un bucle o un pico de correos podría disparar el coste sin que te enteres. | Tope diario y mensual en el panel. Al 80 %, aviso. Al 100 %, solo lo imprescindible (bloqueos y correos) y propuestas sin IA. |

### C. Informes: qué te llega hoy y qué falta

**Hoy te llega:**
- resúmenes de bandeja a las 13:00 y a las 18:00, con lo completado, lo resuelto por el agente, lo que sigue sin respuesta, las
  alertas de clientes, la jornada y lo que necesita de ti;
- avisos urgentes de prioridad 1;
- incidencias de salud al abrirse y al resolverse;
- el aviso «Sistema en marcha» al arrancar.

**Falta:**

| # | Informe | Contenido propuesto | Cuándo |
|---|---|---|---|
| C1 | **Parte de la mañana**, sustituye al primer resumen | Quién ha empezado y quién falta. Ausencias y lo que se cae por ellas (B4). Lo que vence hoy y está en riesgo. Lo que necesita de ti, ordenado por antigüedad. Estado del sistema solo si algo va mal. | A la hora de entrada más temprana del equipo + 30 min |
| C2 | **Informe semanal** | *Equipo:* jornada, entregas a tiempo, precisión de estimación, bloqueos y tiempo hasta empezar, sin ranking y con tendencia frente a la semana anterior. *Clientes:* actividad, alertas y horas trabajadas frente a contratadas. *Agente:* aciertos por tipo y recomendación de autonomía (B6). *Sistema:* incidencias, paradas, coste de IA y peticiones a ClickUp. *Pendientes tuyos* con antigüedad. | Lunes 08:30: un Telegram corto con enlace a una página con el detalle y copia por correo |
| C3 | **Informe mensual por cliente** | Borrador automático de «Trabajo de este mes» (ya existe el cálculo), listo para enviar al cliente **con tu aprobación**. | Día 1 laborable |
| C4 | **Informe de salud** | Solo cuando hay algo: copias, disco, coste, cuotas (D2). Si todo va bien, una línea en el informe semanal. | Por excepción |

Por coherencia con el principio 1, los resúmenes de las 13:00 y las 18:00 deberían **no enviarse si no hay nada que decidir ni nada
anómalo**. Hoy el de bandeja ya no se envía vacío; con C1 y C2 el de las 13:00 probablemente sobre.

**Alternativas para el informe semanal** (regla de comparar al menos tres):

| Opción | A favor | En contra |
|---|---|---|
| **Telegram corto + página web con el detalle + copia por correo** (recomendada) | Lo lees en el móvil y el detalle queda guardado y comparable semana a semana. | Hay que guardar una instantánea semanal (una tabla nueva o `ops_settings`). |
| Solo Telegram | Lo más sencillo. | Un informe largo en Telegram se lee mal y no queda histórico consultable. |
| Solo correo HTML | Bueno para archivar o reenviar. | El correo se mira menos que Telegram. Cuota de Resend: 100 al día, aunque uno por semana no importa. |
| No hacer nada (pestañas Piloto, Tiempos, Agente y Salud) | Coste cero. | Exige que entres a mirar, que es justo lo que no quieres. |

### D. Resiliencia: que no se caiga sin que lo sepas

| # | Hallazgo | Riesgo | Propuesta |
|---|---|---|---|
| D1 | **El vigilante externo corre en el mismo servidor** (cron en el droplet). | Si cae el servidor entero (DigitalOcean, disco lleno, memoria), **no avisa nadie**. | Vigilancia desde fuera: un servicio de monitorización gratuito que consulte `/api/health` y avise por Telegram o correo, o un cron en tu NAS. *Planes gratuitos y límites sin verificar.* Solo recibe la URL pública, ningún dato. |
| D2 | **Salud no comprueba:** que la copia de las 03:00 se hizo, el espacio en disco, el coste de IA, la cuota de Resend, el saldo de Gemini ni la caducidad del token de ClickUp. | Hoy comprueba 9 cosas: planificador, avisos, Telegram, cambios y encargos hacia ClickUp, límite de ClickUp, vigilancia, IA y correos. Una copia que falla en silencio solo se descubre el día que hace falta. | Añadir comprobaciones de copia reciente, disco por encima del 80 %, gasto de IA (B7) y cuota de correo, con el mismo sistema de incidencias. |
| D3 | **Copias solo dentro de DigitalOcean** (dump diario de 7 días en el mismo droplet y snapshot semanal). Ya estaba en pendientes. | Si se pierde la cuenta o el droplet, se pierde todo. **Nunca se ha probado a restaurar.** | Copia diaria cifrada fuera, al NAS y a Google Drive. **Prueba de restauración automática mensual** en un contenedor desechable, con resultado en el informe semanal. |
| D4 | **La clave de IA tiene un solo proveedor por función.** | Si Anthropic cae o se acaba el saldo, los bloqueos y los correos se paran. La comprobación de salud lo detecta, pero no lo resuelve. | Proveedor de reserva en la pasarela de IA (`callAI`), que ya admite cuatro: si falla el principal, usa el secundario y lo anota. |

### E. Optimizaciones y orden

- **`docs/ESTADO.md` tiene partes desfasadas** que pueden confundir a futuras sesiones:
  - la cabecera habla de la rama `feature/seguridad` «sin fusionar»;
  - §2 dice 40 migraciones;
  - §10 dice 70 tablas;
  - §12 y §13 tienen conteos antiguos;
  - §20 dice «push a `operaciones`».

  Arreglo pequeño: actualizarlos al estado real.
- **Muchas notificaciones distintas para ti:** resúmenes, urgentes, salud, arranque, propuestas de correo, propuestas de bloqueos, jornada y limpiezas. Con C1 y C2, revisar cuáles pasan a ir solo en informe.
- **Pendientes antiguos que afectan a la autonomía:** reabrir en ClickUp no se refleja; los cambios de estado distintos de «cerrar» se ignoran; una tarea con varios responsables pierde al secundario; las horas por cliente salen ≈0 sin Empezar/Hecho. Conviene resolverlos antes de que los informes C2 y C3 se usen para decidir.
- **No veo nada que sobre ni que convenga quitar.** La arquitectura (cola de avisos, bandeja de salida, motor de acciones con niveles y planificador con pasos aislados) es la correcta para crecer en autonomía. El problema está en la activación, las colas sin plazo y los informes, no en los cimientos.

---

## 4. Plan propuesto (por orden de impacto)

| Fase | Qué | Quién | Esquema |
|---|---|---|---|
| **0. Encender lo que hay** (1–2 semanas) | Vincular a Eury, completar fichas de equipo y clientes (con A3 asistido), comprobar Resend, recargar Gemini y apagar el modo pruebas. | Enric, con ayuda de Claude para A3 | No |
| **1. Nada se pierde en silencio** | B2 correos en bandeja y resúmenes, B3 plazos y escalado, B7 tope de IA, D2 comprobaciones nuevas, D1 vigilancia externa y E (ESTADO.md). | Claude | Probablemente no (ajustes en `ops_settings` y automatizaciones) |
| **2. Calendario** | B1 festivos y vacaciones por rango. Después, **encender la jornada** y, días más tarde, los tiempos. | Claude, y Enric enciende | **Sí** (tabla de ausencias y festivos) |
| **3. Informes** | C1 parte de la mañana, C2 informe semanal (Telegram + página + correo), C3 borrador mensual por cliente y C4 salud. | Claude | Sí (instantánea del informe semanal) |
| **4. Que decida más solo** | B4 reasignación ante ausencias, B5 limpieza semanal automática, B6 autonomía con mensaje semanal y bajada automática, D4 IA de reserva y reglas aprendidas de tus decisiones. | Claude | Según el punto |
| **5. 5C** | Temporadas, niveles y misiones, ya diseñadas. Encaja mejor después de 3: el informe semanal será su base. | Claude | Sí |
| **Aparte** | D3 copias fuera de DigitalOcean y prueba de restauración. | Claude + Enric (acceso al NAS o Drive) | No |

**Por qué este orden.** Lo he cuestionado tres veces:
1. *¿Cumple el objetivo final?* Sin la fase 0 el sistema no sustituye a nadie, por buenas que sean las demás. Por eso va primero,
   aunque no sea código.
2. *¿Qué riesgo oculto hay a semanas vista?* Encender la jornada sin calendario (B1) quemaría la confianza del equipo en el primer
   festivo o en las primeras vacaciones. Por eso la jornada se enciende después de la fase 2, y no antes como te recomendé.
3. *¿Hay algo que ya tenemos y no usamos?* Sí: «Trabajo de este mes», las métricas del Piloto, la recomendación de autonomía y la
   salud. Los informes de la fase 3 son sobre todo reunir lo que ya se calcula, no crear cálculos nuevos.

**Descartado:**
- **Hacer 5C ahora.** Gamificar sin informes ni calendario medirá mal.
- **Subir la autonomía de los correos.** Primero hay que tener la cola visible (B2) y datos.
- **Rehacer piezas.** Los cimientos están bien.

---

## 5. Para confirmar el estado de producción

Consulta de solo lectura que no pude ejecutar. La puede lanzar Enric con `! <comando>` o dando permiso:

```
ssh -i ~/.ssh/kijutech_brain root@207.154.216.13 "docker exec kijutech_db psql -U kijutech -d kijutech_db -c \"select test_mode, receive_mode from ops_telegram_config; select count(*) miembros, count(chat_id) vinculados from ops_telegram_members; select key, enabled from ops_automations order by key; select status, count(*) from ops_agent_actions group by 1; select status, count(*) from ops_inbound_emails group by 1;\""
```
