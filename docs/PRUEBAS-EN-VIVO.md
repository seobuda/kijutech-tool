# Activación en vivo con el equipo — guía paso a paso

**Para:** Enric · **Cuándo:** viernes 13 nov 2026 (ensayo y arranque) y lunes 16 nov (primer informe semanal)
**Requisito:** desplegada la versión con la revisión de autonomía (`feature/autonomia`), que no lleva migraciones.

> Regla de oro del día: **si algo molesta al equipo, se apaga en 10 segundos** (Sistema → Automatizaciones → interruptor de la
> tarjeta) y se arregla con calma. Nada de lo que hace el sistema borra datos; todo se corrige desde la web.

---

## 0. Antes de empezar (unos 30 min, puede ser hoy o mañana temprano)

### 0.1 Telegram: que todos estén vinculados
**Sistema → Telegram.** Comprueba que Jesús, Mayelin y **Eury** salen como vinculados. Si Eury no lo está, genera su enlace y
mándaselo. Quien no esté vinculado no recibe nada cuando apagues el modo pruebas.

### 0.2 Fichas: el horario de cada persona
**Equipo → Fichas.** Es lo que más importa: el bot escribe según el horario de cada ficha. Revisa en cada persona:
- **zona horaria**;
- **hora de entrada**;
- **horas por día**;
- **días laborables**;
- **comida** (inicio y fin).

Si una ficha está mal, el bot dará los buenos días a deshora.
- Opcional: «Mi panel:», para enlazar la ficha con el usuario web de la persona si tiene uno.

### 0.3 Calendario: festivos y vacaciones
En **Equipo → Calendario** añade:
- **Festivos de toda la agencia** que vengan: por ejemplo, 8 dic, 25 dic, 1 ene y 6 ene.
- **Festivos de un país**, si alguien trabaja desde otro país: márcalos solo para esas personas.
- **Vacaciones o ausencias** ya conocidas del equipo.

Esos días el bot no da los buenos días ni insiste, los avisos esperan al siguiente día laborable y los plazos se corren.

### 0.4 Automatizaciones nuevas: revisa los valores
En **Sistema → Automatizaciones** hay cuatro tarjetas nuevas:

| Tarjeta | Por defecto | Qué mirar |
|---|---|---|
| Plazos de lo que espera de ti | Encendida: revisión 24 h, bloqueo 2 h, correo 4 h (Top 1 h) | Ajusta a tu ritmo |
| Informes | Encendida: parte 09:30 y semanal el lunes 08:30, con copia por correo | Pulsa **«Enviarme una prueba»**: te llega el parte de hoy con datos reales |
| Piloto automático | Encendida, con la **limpieza semanal apagada** | Enciende la limpieza semanal cuando el equipo se haya acostumbrado (quizá dentro de una o dos semanas) |
| Tope de gasto de IA | 5 $/día y 60 $/mes | Pon tu tope real |

### 0.5 Copia de seguridad que avisa si falla
En el servidor, como `root`, sustituye la copia actual por el script nuevo. Hace la copia, comprueba que no está rota y la deja
anotada; así **Salud te avisa** si un día no se hace.

```
ssh -i ~/.ssh/kijutech_brain root@207.154.216.13
chmod +x /opt/kijutech/scripts/backup.sh
/opt/kijutech/scripts/backup.sh          # pruébalo una vez: debe terminar en «OK …»
crontab -e                               # cambia la línea de la copia de las 03:00 por:
0 3 * * * /opt/kijutech/scripts/backup.sh >> /opt/kijutech/backups/backup.log 2>&1
```

En la línea vieja del cron aparece `/opt/kijutech/backup.sh`; la nueva usa la carpeta `scripts/`. Cuando quieras la copia
**fuera de DigitalOcean** (NAS o Google Drive), se instala `rclone` y se pone `RCLONE_REMOTE=…` en `/opt/kijutech/backup.env`.
Lo vemos juntos: hace falta tu acceso a Drive o al NAS.

### 0.6 Vigilancia desde fuera del servidor (recomendado, 5 min)
El vigilante actual vive en el mismo servidor: si se cae el servidor entero, no avisa nadie. Opciones:
- **Un servicio de monitorización gratuito** que consulte `https://brain.kijutech.com/api/health` cada 5 min y avise a tu correo
  o a Telegram. Los planes y límites no los he verificado. Solo recibe la URL pública, ningún dato.
- **Un cron en tu NAS** que haga lo mismo.

Crear la cuenta del servicio lo haces tú.

---

## 1. Ensayo en modo pruebas (viernes temprano, 20 min, solo tú)

Con el **modo pruebas todavía activo**, todo lo que el bot mandaría al equipo te llega a ti con «iba dirigido a…».

1. **Sistema → Automatizaciones → Jornada real → encender.** No toques nada más.
2. A la **hora de entrada de cada persona** te llegará su «buenos días» (con la cabecera de modo pruebas). Comprueba que:
   - llega a su hora;
   - lleva sus tareas de hoy y las vencidas;
   - a quien está de vacaciones o en festivo no le llega.
3. Pulsa un botón de tarea en uno de esos mensajes. En **Equipo → Jornada** debe aparecer la entrada de esa persona.
   Después **anúlala** (botón Anular, con motivo «ensayo»). Así ves que todo se corrige sin borrar.
4. **Operaciones → Informes → Parte de hoy:** vista previa de lo que te llegaría.
5. **Mi bandeja:** si hay respuestas a correos pendientes, ahora salen arriba.

Si algo no cuadra (horarios, tareas, personas), me lo dices y lo ajustamos antes de seguir.

---

## 2. Arranque con el equipo (viernes)

### 2.1 Avisa al equipo (antes de apagar el modo pruebas)
Mándales `docs/GUIA-EQUIPO-JORNADA.md`, la guía para el equipo. Un mensaje corto que puedes copiar:

> Hola equipo: desde hoy registramos la jornada con el bot de Telegram (el mismo de los encargos). Son 4–6 toques al día. Os paso
> la guía; leedla en 5 minutos. Hoy es día de prueba: si algo falla o molesta, decídmelo y lo corregimos. No hay que hacer nada
> más que pulsar los botones cuando el bot pregunte.

### 2.2 Apaga el modo pruebas
**Sistema → Telegram → Modo pruebas → apagar.** Desde este momento cada persona recibe sus mensajes.

### 2.3 Qué vigilar durante el día

| Cuándo | Qué debe pasar | Dónde mirarlo |
|---|---|---|
| Hora de entrada de cada uno | Le llegan los buenos días; al pulsar una tarea queda su entrada | Equipo → Jornada (columna estado) |
| Si no responde | Reintento cada 10 min (hasta 4) por Telegram y correo | Equipo → Jornada |
| 09:30 o 45 min después de la última entrada | Te llega el **parte de la mañana** (solo si hay algo que contar) | Tu Telegram |
| Durante el día | Descansos, comida y «Tengo que salir» con motivo | Equipo → Jornada |
| Si algo espera de ti y pasa su plazo | **Un** recordatorio con botones | Tu Telegram / Mi bandeja |
| Fin del horario | «¿Terminas?» y, sin respuesta, cierre automático marcado | Equipo → Jornada |
| 13:00 y 18:00 | Tus resúmenes de siempre (ahora con correos pendientes) | Tu Telegram |

### 2.4 Si algo va mal
- **Molesta a alguien o llega a deshora:** apaga **Jornada real**. Revisa la ficha de esa persona (zona y hora) y vuelve a
  encenderla.
- **Alguien se equivocó de botón:** Equipo → Jornada → Anular o Añadir, con motivo.
- **Un día libre que no estaba:** Equipo → Calendario → añadirlo. Se aplica en unos segundos.
- **Algo raro en general:** Sistema → Salud. Y avísame con una captura.

### 2.5 Tiempos de tarea: cuándo encenderlos
**Recomendación: el lunes, no el viernes.** El primer día el equipo aprende la jornada; añadir el mismo día «¿cuánto te llevará?»
en cada tarea es demasiado a la vez. El lunes: **Automatizaciones → Tiempos de tarea → encender**. Antes, si puedes, pon los
márgenes de los tipos en **Equipo → Tiempos**; si no, se proponen solos con los datos reales.

---

## 3. Lunes 16: primer informe semanal

- **08:30:** te llega el **informe semanal** de la semana pasada, con copia por correo y enlace a Operaciones → Informes. Como la
  jornada solo funcionó el viernes, saldrá corto; sirve para ver el formato.
- Si el agente cumple el criterio, te llegará también la **propuesta de subir su autonomía**, con botón.
- Enciende **Tiempos de tarea** (ver 2.5).
- Dime qué te sobra o te falta en el parte y en el semanal y lo ajusto.

## 4. Primera semana: qué revisar cada día (5 min)
- El **parte de la mañana**: si no llega, es que todo está en orden.
- **Mi bandeja**, si te llega algún recordatorio de plazo.
- El viernes, **Equipo → Jornada → semana**, para ver salidas sin marcar o cupos de descanso superados. Si se repiten, lo hablas con
  la persona (no es para castigar: son datos para ajustar).

Cuando la primera semana vaya fina, **5C** (temporadas, niveles y misiones) tendrá ya los datos reales con los que empezar.
