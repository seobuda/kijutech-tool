# Barreras de arquitectura, reglas del arnés y batería de prompts
**Fecha:** 2026-11-22  
**Rama:** feature/guardrails-verificacion  
**Commit:** 83049760

Origen: análisis de la entrevista a Lauren Tan (Cursor) sobre agentes autónomos (`docs/Arquitectura ingeniera SpaceX.md`),
contrastado con el código; después se revisaron unas instrucciones propuestas por otra IA (Gemini) y se corrigieron
antes de aplicarlas. Enric aprobó hacer los bloques 1 a 4 en una rama nueva con todas las comprobaciones.

## Qué se construyó
- `tests/arquitectura-guardrails.test.ts` (nuevo, 9 pruebas): núcleo sin módulos ni capa de aplicación; un módulo no
  importa a otro; toda carpeta de `lib/` clasificada (núcleo, módulo o capa de aplicación); solo
  `lib/operaciones/clickup.ts` habla con `api.clickup.com`; `updateTaskStatus`/`updateTaskDue`/`updateTaskAssignees`/
  `addTaskComment` solo desde la bandeja de salida (y el escenario externo de ClickUp real); ningún `'use server'`
  reexporta tipos; toda tabla del esquema y de las migraciones con prefijo de módulo o del núcleo (lista cerrada). Lee
  imports estáticos, `export … from`, `import()` dinámicos, `require()` y rutas relativas.
- `tests/ia-prompts-evals.test.ts` (nuevo): batería de referencia de `ops_note_to_requests`. El corrector corre siempre
  (sin IA); la ejecución real solo con `RUN_REAL_EVALS=true`. Casos construidos con los clientes y miembros de la base
  (sin nombres de clientes en el repositorio): cliente por alias, fecha de la nota, dos encargos, responsable nombrado y
  tarea propia. `EVAL_PROMPT_FILE` (prompt candidato), `EVAL_REPEAT`, `EVAL_MIN_SCORE` (por defecto 1).
- `.claude/settings.json` (nuevo, versionado): 27 reglas «ask» del arnés de Claude Code para lo que CLAUDE.md marca como
  «siempre con aprobación».
- `CLAUDE.md`: la sección caducada «Estado actual / Roadmap Fase A» pasa a una nota corta que remite a ESTADO; se añade
  que las reglas de arquitectura las vigila la prueba nueva, las reglas del arnés y el uso de la batería al cambiar un
  prompt. No se quitó ninguna regla.
- `docs/ESTADO.md`: cabecera corta (antes, un párrafo de 5.350 caracteres), `main` y migraciones reales (59), número de
  pruebas, contradicciones corregidas (festivos, pestañas por rol, secretos, límite de IA, alcance del comprobador del
  mapa, reorganización UX, tablas eliminadas, modelos), pendientes, cronología y sección nueva §22 «Mecanismos de
  verificación y control» con el estado real de cada uno.
- `docs/Arquitectura ingeniera SpaceX.md`: el documento de origen (lo puso Enric), versionado porque ESTADO lo cita.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Reglas de la otra IA corregidas antes de aplicarlas**: tal como venían, tres barreras fallaban el primer día (el
  núcleo no lleva prefijo de tabla; el escenario de ClickUp real llama a la API a propósito; «etc.» no define qué es un
  módulo). Se definieron listas explícitas (módulos, núcleo, capa de aplicación) con sus motivos.
- **Excepción `wireApp()`**: la barrera encontró que `lib/agentes/actions.ts`, `lib/estrategia/actions.ts` y
  `lib/rendimiento/actions.ts` importan `lib/app-wiring` (con lo que cada módulo carga todos los demás). Arreglarlo es
  tocar código en producción, fuera del alcance; se dejó como excepción estrecha (solo esas tres) y otra prueba avisa si
  alguna deja de hacer falta.
- **Barrera verificada por mutación**: en una copia desechable dentro del contenedor se introdujeron 11 infracciones
  (una o más por regla, incluidas rutas relativas, `import()` dinámico, alias en el import y una carpeta nueva): las 11
  se detectaron, cada una en su prueba.
- **La batería salta la IA por defecto en vez de simularla**: con una IA simulada no se evalúa el prompt. Así nunca gasta
  en el despliegue.
- **Nota mínima 1 (no 0,8)**: con 0,8, un prompt saboteado a propósito (perdía el responsable nombrado) aprobaba con 0,92,
  porque el código rescata parte del trabajo de la IA. Con 1 suspende.
- **Ejecución real una vez en local** para validar la herramienta: prompt actual 1,00 (5/5); prompt saboteado 0,92
  (suspende). Unas 15 llamadas en total, con la clave local (céntimos).
- **Reglas del arnés en `.claude/settings.json` (versionado)** y no en el local: así valen en cualquier máquina y se
  revisan en git. `app/(login)` se escribe `app/?login?/**` para no meter paréntesis dentro de la regla.
- **Bloque 2 (pantallas tras desplegar) no construido**: necesita usuarios en la cuenta de pruebas de producción (nunca
  `super_admin` por S2/S3) y decidir cómo anotar sus errores (hoy irían a la cuenta real y avisarían a Enric; el arreglo
  de raíz toca el núcleo). Queda en §16 esperando a Enric.
- **No se toca `lib/auth/security-process-map.ts`**: está en `lib/auth/` (necesita OK); queda como pendiente.
- Las pruebas se ejecutaron sobre una copia del árbol de trabajo dentro del contenedor (como hace `deploy.sh`), sin
  reconstruir la imagen ni tocar `/app`. Lo temporal se borró.

## Qué verificar manualmente
- Que Claude Code **pide permiso** con las reglas nuevas: en una sesión nueva, pedirle editar `lib/db/schema.ts` o
  ejecutar `rm` debe sacar la petición. En esta sesión dos órdenes de prueba (`rm` en el scratchpad y `git clean -n`) se
  ejecutaron sin que Claude pudiera ver si hubo petición: confirmarlo (y, si no salió, revisar con `/permissions`).
- `docker exec kijutech_app pnpm test` tras reconstruir: 498 pruebas correctas y 1 saltada.
- Opcional, cuando se cambie el prompt de convertir notas: pasar la batería real (ver ESTADO §2 y §22).

## Pendientes detectados
- Pantallas tras desplegar (H1): dos decisiones de Enric (§16).
- Sacar `wireApp()` de las acciones de los módulos a la capa de aplicación.
- Añadir las barreras al bloque Seguridad del Mapa Visual (`lib/auth/`, con OK).
- Más baterías: triaje de bloqueos y dudas del equipo.
- Que el Técnico de mantenimiento pueda lanzar los escenarios existentes para decir si un fallo se reproduce.
- Mapa Visual: se comprobó que pasa («22 automatizaciones, 20 tareas del planificador, 7 prompts, 43 tablas, 113 pasos en
  16 mapas»); esta sesión no añade procesos, tareas, tablas ni prompts, así que no requiere nodos nuevos.
