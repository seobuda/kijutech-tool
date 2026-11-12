# Plan de pruebas: Jornada real (paso 5A)

Circuito completo **de un tirón en unos 20 minutos** (15 si pulsas «Termino» en vez de esperar el cierre automático). Todo llega a tu Telegram gracias al **modo pruebas**.

---

## 0. Antes de empezar: cuándo hacerlo

**Hazlo por la mañana en Madrid, antes de las 13:00** (antes de las 8:00 en Santo Domingo), cuando el equipo aún no ha empezado. Hay dos motivos:

1. **Con el modo pruebas activo, TODOS los avisos del equipo te llegan a ti**, no a ellos (encargos nuevos, recordatorios…). Si lo activas con el equipo trabajando, se quedan sin avisos mientras dure la prueba.
2. **Con la jornada encendida, los buenos días sustituyen al resumen diario del equipo.** Si la enciendes antes de su hora de entrada y la dejas encendida, ese día les llegarían a ti.

> Al terminar la prueba: **apaga la jornada y el modo pruebas** (paso 6).

---

## 1. Elige a la persona de prueba

En modo pruebas los botones que pulsas se apuntan **a la persona a la que iba dirigido el mensaje**. Tú no fichas (quien lleva las operaciones queda fuera), así que la prueba se hace con la ficha de **una persona del equipo**.

- Elige a una persona cuya ficha esté **activa** en Equipo → Fichas. Su Telegram no hace falta: todo te llega a ti.
- Los registros de prueba quedarán en su jornada de hoy y **los anulas al final** (paso 6).
- Los buenos días salen **una sola vez al día por persona**: si repites la prueba el mismo día, usa a otra persona.

---

## 2. Configuración para la prueba

### 2.1 Sistema → Telegram
- **Modo pruebas: ACTIVADO.**

### 2.2 Sistema → Automatizaciones → Jornada real

| Ajuste | Valor para la prueba | Valor normal |
|---|---|---|
| Interruptor | **Encendida** | Apagada hasta presentarlo al equipo |
| Volver a avisar si no empieza | **5 min** (el mínimo) | 10 min |
| Avisos máximos sin respuesta | **1** | 4 |
| Avisar también por correo | **Sí** (en modo pruebas el correo te llega a ti) | Sí |
| Cupo diario de descansos | **1 min** (para ver el aviso de cupo superado) | 20 min |
| Margen de la comida | **0 min** | 10 min |
| Cierre automático tras el horario | **5 min** | 120 min |
| Retener avisos mientras está fuera | Sí (en modo pruebas no se aplica) | Sí |

Guarda los cambios.

### 2.3 Equipo → Fichas → la persona de prueba

Para no hacer cuentas con la diferencia horaria, ponle **temporalmente tu zona**. Anota sus valores actuales para restaurarlos después.

Llamamos **T** a la hora actual de Madrid redondeada **al minuto siguiente** (si son las 10:41:30, T = 10:42).

| Campo | Valor para la prueba | Ejemplo con T = 10:42 |
|---|---|---|
| Zona horaria | **Europe/Madrid** | Europe/Madrid |
| Días laborables | Que incluya **hoy** | — |
| Hora de entrada | **T** | 10:42 |
| Horas por día | **0,25** (15 min: fin de horario en T+15) | → termina 10:57 |
| Comida | De **T+8** a **T+10** (2 min) | 10:50 – 10:52 |
| Silencio | Vacío | — |

Guarda la ficha.

---

## 3. El circuito, minuto a minuto

El planificador mira cada 30 s, así que cada mensaje puede tardar **hasta medio minuto**.

| Minuto | Qué haces | Qué debe pasar |
|---|---|---|
| **T** | Nada, espera. | Llega **☀️ Buenos días, [persona]** con sus tareas vencidas y de hoy, un botón **▶️** por tarea (si tiene), **▶️ Otra cosa**, **⏰ 15 min**, **⏰ 30 min** y **🏠 Hoy no trabajo**. Arriba: «🧪 Modo pruebas · iba dirigido a: …». |
| **T → T+5** | **No pulses nada.** | — |
| **T+5** | Mira Telegram y tu correo. | Llega **⏰ ¿Empezamos, [persona]? Aún no has marcado tu entrada**, con los mismos botones, y un **correo** del buzón del agente con el asunto «[Modo pruebas · iba para …] ¿Empiezas…?». |
| **T+5½** | Pulsa una tarea **▶️** (o **▶️ Otra cosa** y escribe «Prueba de jornada»). | **▶️ Entrada registrada a las …** con la tarea, y los botones ☕ 5/10/15 min, 🍽 Voy a comer, 🚪 Tengo que salir y ⏹ Termino. Si la tarea era un encargo suyo sin empezar, pasa a «en curso» en ClickUp. |
| **T+6** | En la web: **Equipo → Hoy**. | La tarjeta de la persona: **🟢 Trabajando**, con la hora de entrada y la tarea. |
| **T+6** | Escribe **/descanso 2** | **☕ Descanso de 2 min** y el aviso **«⚠️ Con este, hoy pasas tu cupo de 1 min en 1 min»**. Botón ↩️ He vuelto. |
| **T+8** | Espera. | **☕ Se acabó tu descanso de 2 min. ¿Has vuelto?** con ↩️ He vuelto y ☕ 5 min más. |
| **T+8** | Pulsa **↩️ He vuelto**. | **↩️ De vuelta. Pausa de 2 min.** |
| **T+8½** | Pulsa **🚪 Tengo que salir**. | Te pregunta **por qué**. Escribe «Prueba: médico». → **🚪 Anotado** con ↩️ He vuelto y ⏹ Ya no vuelvo hoy. |
| **T+9** | Pulsa **↩️ He vuelto**. | **De vuelta.** con la duración. |
| **T+10** | Espera (fin del hueco de comida, sin haberla marcado). | **🍽 No has marcado la comida. ¿Has comido ya?** con ✅ Sí, de T+8 a T+10, 🍽 Voy ahora y 🚫 Hoy no como. |
| **T+10** | Pulsa **🍽 Voy ahora**. | **🍽 Buen provecho. Tienes 2 min.** |
| **T+12** | Espera. | **🍽 Llevas 2 min comiendo (tu ficha: 2 min). ¿Has vuelto?** |
| **T+12** | Pulsa **↩️ He vuelto**. | **De vuelta.** |
| **T+12½** | Escribe **/jornada** | Estado: 🟢 Trabajando, entrada, minutos trabajados, descansos frente al cupo y comida. |
| **T+15** | Espera (fin del horario). | **🏁 Tu horario termina a las …** con el resumen y ⏹ Termino / ⏳ Sigo un rato. |
| **T+15** | **Opción rápida:** pulsa **⏹ Termino** y salta a T+20. **Opción completa:** no pulses nada. | Rápida: **⏹ Jornada terminada a las …** con el resumen del día. |
| **T+20** | (Opción completa) Espera al cierre automático. | No llega mensaje: el cierre es silencioso. En **Equipo → Jornada**, la salida aparece como **«… (auto)»** en naranja. |
| **T+20** | Escribe **/termino** | «Tu jornada de hoy ya terminó.» (comprueba que no deja terminar dos veces). |

---

## 4. Comprueba la web

**Equipo → Jornada** (hoy):
- Cifras de arriba: trabajaron 1 y **descansos sobre el cupo: 1**.
- Fila de la persona: entrada (con retraso si empezó después de T), comida 2 min, descansos «1 · 2 min (+1)» en rojo, salida urgente «Prueba: médico», salida (auto o normal) y tiempo trabajado.
- Pulsa la fila: línea de tiempo con todos los registros y su origen (Telegram / automático).
- **Anula** un registro: pide motivo y queda tachado con tu nombre y el motivo.
- **Añade** un registro (por ejemplo, una salida a otra hora con motivo «corrección de prueba»): aparece como «corrección».
- **Últimos 7 días:** la columna de hoy refleja las horas.

**Equipo → Hoy:** la tarjeta muestra ⏹ Terminó.

**Sistema → Automatizaciones → Jornada real → «Enviarme una prueba»:** te manda tus buenos días con botones. *(Esos botones registran TU jornada: si pulsas alguno, anúlalo en Equipo → Jornada).*

---

## 5. Lo que se prueba otro día (no cabe en el circuito)

| Qué | Cómo y cuándo |
|---|---|
| **Pregunta de corrección del cierre automático** | Si hoy hubo cierre automático, en los **siguientes buenos días** de esa persona llega «✏️ El … no marcaste «Termino»… ¿Es correcto?». Pulsa **✏️ Salí a otra hora** y escribe una hora (p. ej. 18:30): la salida automática se anula y queda la corregida. |
| **Sección «🕘 Jornada» de tu resumen** | Muestra el **último día laborable ya cerrado**, así que la prueba de hoy sale en el **primer resumen de mañana**. También con «Enviar resumen de la bandeja ahora» (Sistema → Telegram) a partir de mañana. |
| **«🏠 Hoy no trabajo»** | Otro día u otra persona: en los buenos días pulsa 🏠 y escribe el motivo. Ya no llegan reintentos ese día y en la pestaña sale 🏠 Ausente con el motivo. |
| **«⏰ Empezaré en 15 min»** | El siguiente aviso llega a los 15 min. |
| **Avisos retenidos en pausa** | **No se aplican en modo pruebas.** Se comprueban con el sistema ya en marcha: con alguien en ☕ descanso, un encargo nuevo para esa persona espera y le llega al pulsar «He vuelto». |

---

## 6. Al terminar: dejarlo todo como estaba

1. **Equipo → Jornada:** anula los registros de prueba de la persona (motivo: «prueba»). Nada se borra, pero así no cuentan.
2. **Equipo → Fichas:** restaura su **zona, hora de entrada, horas por día y comida**.
3. **Sistema → Automatizaciones → Jornada real:** pulsa **Restaurar valores** y **apágala** hasta presentárselo al equipo.
4. **Sistema → Telegram:** **desactiva el modo pruebas**.

---

## 7. Si algo no llega

- Espera 30 s más: el planificador mira cada 30 s.
- **Sistema → Salud:** que todo esté en verde (planificador con latido y cola de avisos sin fallos).
- **Sistema → Telegram:** que tu Telegram esté vinculado (en modo pruebas todo va a tu chat).
- Comprueba que la ficha de la persona está **activa**, que **hoy** está entre sus días y que la **zona** es Europe/Madrid.
- Si los buenos días no salen: ¿ya salieron hoy para esa persona? Solo salen una vez al día. Usa a otra persona.
