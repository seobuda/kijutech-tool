# Pruebas simuladas fase 2 y encargos por Telegram que no se pierden
**Fecha:** 2026-11-19  
**Rama:** feature/pruebas-fase2  
**Commit:** d167e2bc

## Qué se construyó
Enric pidió dos cosas:
- terminar la fase 2 de las pruebas simuladas;
- mejorar los encargos pedidos por audio en Telegram. El último audio («que Jesús se forme en datos estructurados») falló tres veces seguidas con «No he podido convertirlo en un encargo claro». El Técnico de mantenimiento ya lo había diagnosticado.

**Pruebas simuladas, fase 2:**
- `lib/operaciones/sim/kit.ts` (nuevo): las ayudas para escribir escenarios salen de `scenarios.ts` y se comparten. `Scenario` gana `external` y `fromRequest`. `ScenarioCtx` gana `ownerTenantId`.
- `lib/operaciones/sim/scenarios-jornada.ts` (nuevo): tres escenarios con **reloj simulado** (`runJornada` con la hora que se quiera, y `rewind()` para mover hacia atrás las horas guardadas de la cuenta de pruebas):
  - `jornada-comandos`: /empiezo → «Otra cosa» → tarea escrita, /descanso 10, /vuelvo y /termino, más un segundo /termino que no duplica.
  - `jornada-reloj`: buenos días a su hora y una sola vez, reintento a los 10 min y uno solo, «¿Has vuelto?» al acabar el descanso, «¿Terminas?» y cierre automático marcado.
  - `tiempos-tarea`: tipo, estimación, 45 min simulados fuera del margen (5-20), motivo y URL, y «¿Con qué sigues?».

  Jornada y tiempos se encienden en la cuenta de pruebas solo mientras corre el escenario, sin retener avisos ni mandar correos, y se apagan siempre al terminar.
- `lib/operaciones/sim/scenarios-clickup.ts` (nuevo): `clickup-real`, con el token real y en la lista «Pruebas Kiju»:
  - comprueba que los estados «en curso» y «listo» del mapa existen en ClickUp;
  - con una sola tarea de prueba, sin responsable y reutilizada (marca `[kiju:…]`, que la vigilancia ignora), cambia el estado, comenta y la cierra.

  Es **externo**: no entra en «todas» ni en el despliegue.
- `lib/operaciones/sim/env.ts`:
  - ids **numéricos** para los miembros simulados (`9000001` dueño, `9000002` empleado), porque los botones de jornada y tiempos solo aceptan dígitos;
  - sustituye a los antiguos `sim-ia` / `sim-dueno`;
  - `meClickupId` actualizado;
  - ficha de Equipo del empleado simulado y tipo de tarea «Tarea de prueba».
- `lib/operaciones/sim/requests.ts` (nuevo) + `actions.ts` + vista: **Pedir una prueba**.
  - La petición queda pendiente; se puede retirar.
  - Pasa a «hecha» cuando se ejecuta un escenario con `fromRequest` igual a su id.
  - Se guarda en `ops_settings` (`sim_test_requests`).
- `lib/operaciones/sim/runner.ts`: «todas» excluye los escenarios externos y marca las peticiones hechas.
- `app/(dashboard)/dashboard/operaciones/pruebas/`:
  - sección «Pedir una prueba»;
  - etiqueta «ClickUp real»;
  - texto que dice que se pasan tras cada despliegue.
- `scripts/deploy.sh`: tras la verificación, `run-scenarios.sh --despliegue <commit>`. Si falla y no hubo migración, `rollback.sh`.
- `scripts/run-scenarios.sh`: opción `--despliegue <commit>` (trigger y commit en el cuerpo).
- `scripts/server-status.sh`: línea de pruebas pedidas pendientes y `--errores [palabra]`, con los últimos 25 fallos del registro de la cuenta real con su mensaje. Sigue siendo de solo lectura.

**Encargos por Telegram (`crear_encargo`):**
- `lib/operaciones/request-proposer.ts`:
  - `ALL_SPACES`: con él, la IA ve las listas de todos los espacios seleccionados, como «Espacio / Carpeta / Lista»;
  - `AGENCY_WORK_RULES` se añade al prompt del panel: el trabajo interno es un encargo y la tarea principal nunca va a «no convertido».
- `lib/operaciones/agent-capabilities.ts` (`crear_encargo`):
  - el espacio sale de la lista elegida o del cliente; si no hay ninguno, todos los espacios;
  - nuevo parámetro `lista`: búsqueda por nombre o ruta, preguntando si es ambigua o no existe;
  - un encargo sin lista ya no se descarta en silencio: la herramienta dice qué preparó y pide la lista, con las internas primero;
  - mensaje claro si la IA no vio ninguna tarea;
  - la propuesta enseña también lo que no es un encargo.

**Arreglos encontrados por el camino:**
- `lib/operaciones/automations.ts` (`saveAutomation`): **las automatizaciones apagadas de serie (jornada, tiempos) no se podían encender desde el panel**. Al encender se guardaba `null` («por defecto»), y para ellas el valor por defecto es apagado. Lo destapó el escenario de jornada.
- `lib/operaciones/jornada-bot.ts`: si ClickUp no respondía, los buenos días y «¿Con qué sigues?» no salían. Ahora salen sin la lista de tareas (`teamTodaySafe`).

**Mapa Visual** (`lib/operaciones/process-map.ts`):
- pasos nuevos `ops-sim-deploy` y `ops-sim-ask`;
- `ops-sim-run`, `ops-sim-env`, `ops-convert` y `ops-ai-convert` actualizados.

La comprobación pasa: 111 pasos.

**Pruebas:**
- `tests/pruebas-simuladas.test.ts`, 11 en total:
  - las 13 internas pasan, y la externa no entra en «todas»;
  - jornada y tiempos quedan apagadas;
  - los ids son numéricos;
  - «Pedir una prueba»;
  - encender y apagar jornada desde el panel.
- `tests/encargos-telegram.test.ts` (nuevo, 5, con la IA simulada):
  - todos los espacios y las reglas en el prompt;
  - sin lista, pregunta con las internas primero;
  - con `lista`, la usa;
  - lista ambigua o inexistente;
  - ninguna tarea.
- `tests/seguridad.test.ts`: las 2 acciones nuevas, solo para admin.

**Documentación:** `docs/ESTADO.md` (§6.27, §6.21, cabecera y cronología) y `docs/DESPLIEGUE.md`.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Reloj simulado sin tocar el código de producción.**
  - El planificador ya aceptaba `now`.
  - Para «ha pasado el tiempo» se mueven hacia atrás las horas guardadas de la cuenta de pruebas (registros, tiempos y avisos de jornada).
  - Primero se intentó adelantar la hora del planificador. Eso daba un segundo reintento falso, porque los avisos se guardan con la hora real, así que se cambió a mover las horas hacia atrás.
- **ClickUp real como escenario externo y fuera del despliegue.** Si ClickUp cae, no debe impedir desplegar ni provocar una vuelta atrás. Se reutiliza siempre la misma tarea, para no ensuciar la lista. No se añadió borrar tareas al cliente de ClickUp.
- **Pedir una prueba sin tabla nueva** (en `ops_settings`) y sin editor: es texto para Claude. La petición se marca «hecha» sola al ejecutarse su escenario.
- **Reglas del trabajo interno en el código**, no en el prompt de la base. Actualizar el prompt en producción habría sido tocar datos con `psql`. Se añaden al prompt del panel y valen también para el Bloc y el correo; constan en el Mapa Visual.
- **Pedir la lista en vez de una lista por defecto configurable.** No hace falta pantalla nueva, el agente ya conversa, y sin cliente la IA ve también las listas internas. Si se repite mucho, se puede añadir una lista interna por defecto.
- **`lib/auth/security-process-map.ts` sin tocar:** el texto del paso «Despliegue protegido» del bloque Seguridad no menciona aún las pruebas tras desplegar. CLAUDE.md pide aprobación para cualquier archivo de `lib/auth/`, así que quedó fuera. El paso `ops-sim-deploy` del mapa de Operaciones lo describe.
- **El entorno borra sus miembros y fichas con los ids antiguos** (`sim-ia`, `sim-dueno`). Son datos de la cuenta de pruebas creados por las propias pruebas; si no se borraran, cada chat simulado tendría dos personas.

## Qué verificar manualmente
- Sistema → Pruebas:
  - aparecen 14 escenarios, entre ellos «Jornada», «Tiempos» e «Integraciones» con la etiqueta «ClickUp real»;
  - tras el despliegue, las 13 internas en verde, con «tras desplegar».
- Pulsa ▶ en «ClickUp de verdad»: en ClickUp, la lista «Pruebas Kiju» debe tener una tarea «[PRUEBA automática] Comprobación de ClickUp», cerrada y con un comentario. **No debería llegarte ninguna notificación.**
- «Pedir una prueba»: escribe un caso, pulsa Pedir y prueba a retirarlo.
- Telegram: manda de nuevo el audio de la formación de Jesús.
  - Si existe una lista interna, debe proponerla.
  - Si no, el agente te preguntará en qué lista. Contesta por voz o por texto y debe proponerlo con ✅ / ✖️.
- Automatizaciones: encender «Jornada real» ya funciona. **No la enciendas sin decidirlo**: afecta al equipo.

## Después del despliegue (19 nov, 15:45)
- Desplegado `0835302a` sin migración. **13 de 13 pruebas simuladas correctas en producción**, lanzadas solas por `deploy.sh`. Verificación:
  - web 200;
  - Telegram por webhook, sin error;
  - prioridad 0;
  - 0 errores de JavaScript.
- **Ruido encontrado:** en la cuenta de pruebas, los buenos días escribían «[jornada] tareas de hoy sin ClickUp» con `console.error`, porque esa cuenta no tiene ClickUp. El registro de errores captura la consola **sin saber de qué cuenta es**, así que lo anotó como fallo de la cuenta real (4 apariciones, un grupo «nuevo») y pudo avisar a Enric por Telegram.
- **Arreglo inmediato** (rama `fix/pruebas-sin-ruido`, dentro de Operaciones):
  - `teamTodaySafe` no escribe en el log si la cuenta es la de pruebas;
  - el ejecutor ya no escribe en el log los fallos de un escenario, que quedan en su ejecución;
  - prueba nueva: una tanda completa no puede llamar a `console.error`.
- El grupo de error que ya se creó en producción hay que marcarlo como resuelto en Sistema → Errores (Claude no escribe en la base de producción).

## Pendientes detectados
- **Atribuir al entorno de pruebas los errores de la consola** (arreglo de raíz del ruido anterior). Toca el núcleo (`lib/core/errors.ts`): un registro genérico del tipo `registerConsoleTenantResolver`. Con él, lo que se escriba durante una ejecución simulada quedaría en la cuenta de pruebas, con avisos y diagnóstico apagados, y no en la real. CLAUDE.md pide preguntar antes de tocar el núcleo: pendiente del OK de Enric.
- Actualizar el texto del paso «Despliegue protegido» en `lib/auth/security-process-map.ts` para que mencione las pruebas tras desplegar. Necesita el OK de Enric (`lib/auth/`).
- `TimeoutNegativeWarning` en los logs de producción (19/11 a las 01:07, 12:17 y 13:17): algún `setTimeout` recibe un tiempo negativo. Es inofensivo, pero conviene localizarlo.
- Si Enric pide a menudo tareas internas, una lista interna por defecto configurable evitaría la pregunta.
- Tras el despliegue, revisar con `server-status.sh --errores crear_encargo` si vuelven a aparecer fallos al crear encargos.
