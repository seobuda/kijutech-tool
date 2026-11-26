# IDIOMA: Responde siempre en español, sin excepciones.

\# CLAUDE.md — kijutech-tool



\## Qué es este proyecto



Herramienta interna de la agencia Kijutech para gestionar proyectos SEO (y en el futuro, otros departamentos) de forma centralizada, sustituyendo ClickUp + Drive + chats sueltos. Fork de `nextjs/saas-starter`. Arquitectura núcleo + módulos, multi-tenant desde el esquema de datos pero single-tenant funcional en esta fase.



Documentación completa de arquitectura, decisiones y roadmap vive en el proyecto de Claude.ai asociado (no en este repo). Si necesitas contexto de diseño que no esté aquí, pregúntale a Enric antes de asumir.



\## Stack (no cambiar sin confirmar con Enric)



\- Next.js 16 App Router + PostgreSQL + Drizzle ORM + shadcn/ui + Tailwind

\- Auth: JWT en cookies httpOnly, ya incluida en el starter — no usar NextAuth ni Clerk

\- Stripe se eliminó en el paso 8 (4 nov 2026); no se reintroduce sin indicación explícita



\## CRÍTICO — Todo corre dentro de Docker, nunca en Windows directamente



Esta regla cuesta horas de debugging si se rompe. El motivo: en una sesión anterior, ejecutar `pnpm install` en Windows generó binarios nativos de Windows en `node\_modules` que, al mezclarse con el contenedor Linux, colgaban Turbopack silenciosamente sin dar ningún error.



\- \*\*Nunca\*\* ejecutes `pnpm install`, `pnpm add`, ni ningún comando de npm/pnpm en el host Windows

\- Todo comando de dependencias o build se ejecuta con `docker exec -it kijutech\_app <comando>`

\- Para levantar el entorno: `docker compose up -d`

\- Si cambias `Dockerfile.dev` o `package.json`: `docker compose up --build -d`

\- Migraciones: `docker exec -it kijutech\_app pnpm db:migrate`

\- No hay hot-reload — el contenedor corre en modo producción (`pnpm build` + `pnpm start`), no `pnpm dev`. Cada cambio de código requiere reconstruir la imagen.

\- Acceder a la app en el navegador por `http://127.0.0.1:3000` — \*\*nunca `localhost`\*\*, da `ERR\_CONNECTION\_RESET` en esta máquina por un problema de resolución IPv6 en Windows + WSL2 + Docker Desktop.



\## Arquitectura: núcleo vs. módulos



\- El núcleo (`tenants`, `users`, `roles`, `projects`, `modules`) nunca depende de un módulo específico

\- Un módulo (ej. `seo`) nunca es importado directamente por otro módulo — se comunican vía el núcleo como intermediario

\- Toda tabla de un módulo lleva su prefijo (`seo\_keywords`, `seo\_audit\_findings`...)

\- \*\*Si para resolver algo de un módulo parece necesario tocar el núcleo, aplica el protocolo de decisión\*\* (sección «Decisiones de diseño») antes de hacerlo: puede ser señal de que el módulo está mal diseñado, no un atajo válido. Si la auditoría no lo avala, pregunta a Enric.



\- Estas reglas (núcleo sin módulos, un módulo no importa a otro, prefijo de tabla, ClickUp por su cliente y su bandeja de salida) las comprueba `tests/arquitectura-guardrails.test.ts`: si se incumplen, las pruebas fallan y `deploy.sh` no despliega. Una excepción nueva se añade allí con su motivo, nunca en silencio.



\## Estado actual

El estado vivo del proyecto (qué existe, qué está en producción, qué falta y la hoja de ruta) está en `docs/ESTADO.md`. La Fase A (Docker, auth, esquema núcleo, tenant Kijutech con sus 4 roles y la lista de proyectos) está terminada desde agosto de 2026. Antes de empezar un bloque nuevo (un módulo o una lista de trabajo), confírmalo con Enric; dentro del bloque confirmado, Claude avanza solo (ver «Reglas de autonomía»).



No construyas nada fuera de lo que se confirme explícitamente — es fácil derivar hacia "mejorar" cosas que no tocan en esta fase.



\## Reglas de trabajo



\- Empieza cada sesión confirmando en qué punto del roadmap se está trabajando

\- Commits pequeños y frecuentes, mensaje claro de qué cambia y por qué

\- No rompas lo que ya funciona: la auth end-to-end verificada es la base de todo lo demás



## Reglas de autonomía (modelo del 26 nov 2026, aprobado por Enric)

Enric quiere que Claude termine los módulos acordados **sin pararse a pedir permiso**. La frontera no es «local frente a
producción», sino **código frente a efectos hacia fuera**: el código siempre se puede revertir (git, `rollback.sh`); un correo
a un cliente, un cambio en Google Ads o datos reales borrados, no.

**Claude trabaja sin preguntar** (dentro del trabajo acordado con Enric, p. ej. la lista cerrada de un módulo):
- Código, pantallas, rutas, ramas, commits, pruebas, Mapa Visual, `docs/ESTADO.md` y documentos de sesión.
- **Migraciones aditivas**: tablas nuevas, columnas nuevas (con valor por defecto o anulables), índices, datos de semilla y
  prompts nuevos. No rompen el código anterior, así que la vuelta atrás del código sigue funcionando.
- Fusionar en `main`, subir y desplegar con `bash scripts/deploy.sh` o `bash scripts/deploy.sh --migrate`. Se despliega
  **por tandas**, al cerrar cada sección, no tras cada cambio pequeño. Sin migración, si la verificación falla el script vuelve
  solo a la versión anterior. **Con `--migrate` no vuelve solo** (la base ya cambió): como las migraciones son aditivas, Claude
  ejecuta `bash scripts/rollback.sh` (vuelve el código; las tablas o columnas nuevas no molestan al código anterior) y avisa a
  Enric; la base solo se restaura desde `backups/backup_pre_deploy_*.sql.gz` con su OK.
- Antes de migrar **en local** las tablas de un módulo nuevo, sigue valiendo «Backup obligatorio» (`pg_dump` y rama propia).
- Probar con efectos reales solo en lo nuestro: ClickUp en la lista «Pruebas Kiju», correo solo a direcciones de Kijutech,
  el usuario de pruebas de desarrollo.
- Decisiones de producto e integraciones: con el **protocolo de decisión** (sección «Decisiones de diseño» más abajo),
  sin esperar a Enric. Cada decisión queda apuntada en el documento de sesión («Decisiones tomadas») para que Enric la
  revise cuando quiera; si no le gusta, se cambia.

**Líneas rojas: aquí Claude SIEMPRE para y pregunta** (y mientras espera, sigue con otra parte del trabajo):
1. **Migraciones destructivas**: borrar o renombrar tablas o columnas, cambiar tipos, `DROP`, `TRUNCATE`, `DELETE` de datos
   reales. Se evitan por diseño (añadir y dejar de usar, en vez de borrar).
2. **Efectos hacia fuera con clientes o dinero**: enviar un correo o mensaje a un cliente real, cambiar pujas, presupuestos o
   anuncios en cuentas reales de Google Ads, publicar en la web de un cliente, contratar o activar un servicio de pago nuevo,
   o subir un límite de gasto.
3. **Login y sesión**: `app/(login)/` y `lib/auth/` (salvo añadir un guard o un permiso nuevo en `permissions.ts`).
4. **Borrar datos, tablas o archivos existentes** con contenido real.
5. `docker-compose*.yml`, `Dockerfile*` y dependencias nuevas (`pnpm add`): se preguntan, salvo que estén dentro de un
   plan ya aprobado que las nombre.

**Controles que sustituyen la revisión manual** (obligatorios antes de cada fusión en `main`):
- Pruebas (`pnpm test` en el contenedor) y `node scripts/check-architecture-map.js`; `deploy.sh` además los repite sobre el
  commit exacto, pasa las pruebas simuladas en producción y vuelve atrás si algo falla.
- **Revisor de código** (`.claude/agents/revisor-codigo.md`) sobre el diff de la rama. Un hallazgo grave se arregla antes de
  fusionar; si no se puede, se apunta en el documento de sesión y se avisa a Enric.
- Después de cada despliegue, Claude le cuenta a Enric qué ha cambiado, el resultado de la verificación y cómo deshacerlo
  (`bash scripts/rollback.sh`; producción en solo lectura con `bash scripts/server-status.sh`). No hay SSH libre al servidor:
  si hace falta otro comando allí, se pide a Enric o se añade a un script revisado.

El arnés (`.claude/settings.json`) todavía pregunta al editar `lib/db/schema.ts` y `lib/db/migrations/**`: mientras Enric no
quite esas dos entradas, esa pregunta es la única parada en las migraciones aditivas.

Si una tarea roza una línea roja y hay duda, se trata como línea roja: pregunta y sigue con otra cosa mientras tanto.



\## Backup obligatorio antes de migrar un módulo nuevo



Regla permanente, no solo para el módulo SEO: antes de aplicar cualquier migración de Drizzle que introduzca las tablas de un módulo nuevo, son obligatorios estos dos pasos:



\- \*\*Backup de Postgres con `pg\_dump`\*\*, ejecutado dentro del contenedor y volcado al host (el contenedor `kijutech\_db` no tiene bind mount al repo, así que hay que redirigir la salida, no dejarla dentro del contenedor):



  ```

  docker exec kijutech\_db pg\_dump -U kijutech -d kijutech\_db > backups/backup\_pre\_<modulo>\_<fecha>.sql

  ```



  (`<modulo>` = nombre del módulo, ej. `seo`; `<fecha>` = fecha en formato `YYYYMMDD`, ej. `20260816`). La carpeta `backups/` no está versionada — `.gitignore` ya excluye `backup\_\*.sql`, no hace falta tocar la configuración.



  Para restaurar si algo sale mal: `docker exec -i kijutech\_db psql -U kijutech -d kijutech\_db < backups/backup\_pre\_<modulo>\_<fecha>.sql` (sobre una BD limpia — el dump no usa `IF NOT EXISTS`).



\- \*\*Rama de Git separada\*\* para el trabajo del módulo (ej. `feature/fase-b-seo`), nunca migrar directamente sobre `main`.



Estos dos pasos van antes del `docker exec kijutech\_app pnpm db:migrate` de la sección de Docker de arriba, no lo sustituyen.

## Documentación automática de sesión

Antes de hacer el commit final de cada sesión, genera un archivo de
documentación en `/docs/sessions/` con el siguiente nombre:

  YYYY-MM-DD-HH-[descripcion-corta-en-kebab-case].md

`HH` es la hora de cierre de la sesión en formato 24h (00-23).

Ejemplo: `2026-08-17-16-fase-b-ajustes-ux.md`

Genera el archivo ANTES del commit, para que quede versionado en git
junto al código que describe.

### Estructura obligatoria del archivo

```markdown
# [Descripción corta de la sesión]
**Fecha:** YYYY-MM-DD  
**Rama:** nombre-de-la-rama  
**Commit:** hash del último commit sustantivo de la sesión (se rellena antes de commitear este documento)

## Qué se construyó
Lista de archivos nuevos y modificados relevantes, con una línea
explicando qué hace cada uno.

## Migraciones aplicadas
Para cada migración: nombre del archivo .sql y el SQL completo aplicado.
Si no hubo migraciones: "Ninguna."

## Decisiones técnicas tomadas en auto mode
Decisiones que Claude Code tomó por su cuenta durante la sesión
(no las pedidas explícitamente en el prompt) — qué problema encontró,
qué decidió y por qué. Si no hubo ninguna: "Ninguna."

## Qué verificar manualmente
Lista concreta de cosas que el usuario debe comprobar en el navegador
o en la base de datos para validar que todo funciona.

## Pendientes detectados
Cosas que Claude Code identificó durante la sesión que podrían necesitar
atención futura — bugs potenciales, mejoras obvias, deuda técnica.
Si no hay nada: "Ninguno."
```

### Reglas
- El archivo lo genera Claude Code, no el usuario — nunca pedirlo
  explícitamente, hacerlo siempre como parte del cierre de sesión
- Si la sesión tiene varios commits intermedios, el documento describe
  el trabajo completo de la sesión, no cada commit por separado
- El campo "Commit" lleva el hash del último commit sustantivo de la
  sesión (el de código, no el del propio documento). Se rellena ANTES
  de hacer el commit del documento, no después — así el hash siempre
  referencia un commit que ya existe
- La carpeta /docs/sessions/ se crea si no existe
- Estos archivos se suben al proyecto de Claude (chat) para mantener
  el historial técnico accesible entre sesiones

## Regla de UX mínima — pensar antes de construir

Antes de construir cualquier pantalla o funcionalidad nueva, Claude Code
debe hacerse estas preguntas y resolverlas en el diseño, sin que Enric
tenga que pedirlo explícitamente:

**Flujos básicos que toda entidad necesita:**
- ¿Se puede crear? → botón "Nuevo/Añadir" visible
- ¿Se puede editar? → botón "Editar" accesible desde la lista y desde el detalle
- ¿Se puede eliminar? → botón "Eliminar" con confirmación previa
- ¿Se puede archivar/pausar sin eliminar? → si la entidad tiene estados, debe poder cambiar de estado
- ¿Se puede resetear? → si hay progreso o datos acumulados, debe haber forma de volver al inicio
- ¿Se puede guardar sin completar? → guardar borrador siempre separado de "marcar como completado"

**Flujos de lista:**
- ¿Qué pasa si la lista está vacía? → estado vacío con mensaje claro y botón de acción
- ¿Cómo vuelve el usuario a la lista desde el detalle? → breadcrumb o botón "Volver" siempre presente
- ¿El usuario sabe dónde está? → título de página claro, navegación activa marcada

**Flujos de formulario:**
- ¿Qué pasa si el usuario cierra sin guardar? → los datos no se pierden (autoguardado) o hay aviso
- ¿Qué campos son obligatorios y cuáles opcionales? → indicado visualmente
- ¿Qué pasa después de guardar? → redirección clara, no pantalla en blanco

**Regla general:** si un usuario puede quedarse atascado sin saber qué hacer
a continuación, falta un botón o un mensaje. Añadirlo es parte del trabajo,
no un extra que Enric tiene que pedir.

## Directiva de optimización de IA

Antes de implementar cualquier función que use la API de IA
(llamadas de completado, generación de texto, análisis), Claude Code debe
evaluar si existe una solución más eficiente y escalar mejor que una
llamada de completado directa.

Preguntas obligatorias antes de implementar cualquier función de IA:

1. ¿Esta tarea requiere razonamiento o solo similitud/clasificación?
   - Si es similitud → considerar embeddings + clustering matemático
   - Si es razonamiento → llamada de completado normal

2. ¿El output puede ser muy largo y cortarse?
   - Si sí → considerar embeddings + completado corto final
   - O dividir en llamadas pequeñas con contexto compartido

3. ¿Hay una solución matemática/algorítmica que evite llamar
   a la IA completamente?
   - Ejemplo: deduplicación, ordenación, filtrado → no necesitan IA

4. ¿El mismo resultado se puede conseguir con un modelo más
   pequeño y barato?
   - Tareas simples de clasificación → Haiku o GPT-4o-mini
   - Tareas complejas de razonamiento → Sonnet o GPT-4o

Si Claude Code detecta una oportunidad de optimización de este
tipo durante el desarrollo, debe señalarla explícitamente antes
de implementar la solución obvia, aunque no haya sido pedida.
Ejemplos de lo que hay que señalar:
- "Esta función podría usar embeddings en vez de completado,
   ahorrando un 95% del coste — ¿lo implementamos así?"
- "Este análisis podría hacerse con un modelo más pequeño
   sin perder calidad — ¿usamos Haiku aquí?"
- "Esta tarea no necesita IA — un algoritmo simple lo resuelve
   igual de bien y gratis — ¿lo hacemos sin IA?"

## Mapa Visual del Sistema — regla permanente: el mapa es parte de "terminado"

**Ningún paso (de cualquier módulo) se considera terminado hasta que el Mapa Visual refleje lo
construido: nodos, estado, descripción y ajustes.** No requiere que Enric lo pida.

Cuando una sesión añada, elimine, reordene o modifique sustancialmente un proceso, un paso, una
automatización, una tabla, un prompt de IA o una pieza de un módulo:

- **Operaciones:** actualiza `lib/operaciones/process-map.ts` (`OPS_MAPS`: nivel 2 = procesos y piezas,
  nivel 3 = pasos). Cada paso declara `when` (cuándo se ejecuta), `ai` (qué decide la IA), `code` (qué
  decide el código), `tables`, `settings` (automatizaciones del panel que le afectan: el mapa muestra
  sus valores ACTUALES y enlaza al ajuste, nunca escribas valores fijos), `prompts`, `runs` (tareas del
  planificador) y `live` (proveedor de «última ejecución» de `lib/operaciones/map-live.ts`).
- **Nuevo proceso periódico:** añade su proveedor `live` en `map-live.ts` (última ejecución y error).
- **Otros módulos (SEO, etc.):** el array `*_PROCESS_MAP` va junto a la función principal del proceso, siguiendo
  el patrón de `lib/ai/clustering/pipeline.ts` (`CLUSTERING_PROCESS_MAP`), y se registra en
  `lib/architecture-map/registry.ts` (`getProcessMap` / `PROCESS_MAP_IDS`).
- **Módulo o etapa nueva del sistema:** añade su nodo a `CORE_NODES` / `SUPPORT_NODES` o confirma que se
  deriva de `modules/seo/manifest.json`. Lo pendiente va como nodo gris en `FUTURE_NODES` con una frase de qué
  será; al construirlo, pasa a `built`.
- **Comprobación automática (obligatoria):** antes de cada commit de cierre de paso, ejecuta
  `node scripts/check-architecture-map.js` (también `pnpm check:map` dentro del contenedor). Falla si una
  automatización del panel, una tarea del planificador, un prompt de IA o una tabla `ops_*` no tiene su
  entrada en el mapa, o si el mapa está roto (archivos inexistentes, enlaces rotos). Si falla, el paso no está
  terminado: corrige el mapa y vuelve a ejecutarla. Si la comprobación necesita un criterio nuevo (por ejemplo,
  otra familia de tablas), amplíala en el mismo paso.
- Menciona en el documento de sesión que el mapa se actualizó y que la comprobación pasó.

## docs/ESTADO.md — regla permanente: también es parte de "terminado"

`docs/ESTADO.md` es el documento de estado completo del proyecto (documento vivo). **Ningún paso se considera
terminado hasta que `docs/ESTADO.md` refleje lo construido**, igual que el Mapa Visual: actualiza las secciones
afectadas (valores del panel, tablas y conteos, prompts, integraciones, seguridad, datos de prueba, pendientes,
hoja de ruta, cronología, mapa de archivos), y la fecha de la cabecera. Va en el mismo commit de cierre de paso,
junto al documento de sesión. Sin secretos ni valores de `.env`.

## Ramas — regla permanente

`main` solo recibe trabajo terminado y aprobado. Cada mejora nueva va en su propia rama (`feature/...`, `fix/...`
u otra descriptiva), nunca directamente sobre `main`. Las ramas ya fusionadas (p. ej. `operaciones`) se mantienen.


## ClickUp: caché y consultas agrupadas — regla permanente

El token de ClickUp tiene un límite de 100 peticiones por minuto, y cada
pantalla que llamaba a ClickUp en directo tardaba segundos (el Bloc y
"Nuevo encargo" hacían 27 peticiones cada vez que se abrían). Por eso:

- Toda funcionalidad nueva que llame a ClickUp debe usar la caché de la base
  de datos (espacios, carpetas, listas, miembros) y consultas agrupadas a
  nivel de workspace siempre que sea posible. Nunca pedir "lista por lista" ni
  "persona por persona" si existe una consulta que lo resuelva de una vez.
- Una pantalla no debe llamar a ClickUp para pintarse si el dato está en caché.
  Los datos en directo (tareas) se cargan después de pintar la página, con
  indicador de carga, y con caché corta.
- Toda llamada a ClickUp pasa por el cliente de `lib/operaciones/clickup.ts`
  (contador por minuto, espera ante el límite y reintento ante un 429). No usar
  `fetch` directo a la API de ClickUp.
- Antes de dar por terminada una pantalla nueva que use ClickUp, medir cuántas
  peticiones hace al cargar (Ajustes → peticiones de la última hora).

## Usuario de pruebas de desarrollo y verificación tras cada despliegue

- Existe un usuario de pruebas SOLO para desarrollo, de la cuenta Kijutech. Su
  email y contraseña están en `.env` (`OPS_TEST_EMAIL`, `OPS_TEST_PASSWORD`),
  que no se versiona. Antes de subir a un servidor hay que borrarlo.
- Después de cada despliegue que toque Operaciones, Claude Code inicia sesión
  con ese usuario en `http://127.0.0.1:3000`, recorre Bloc de notas, Equipo hoy
  y Encargos comprobando que cargan sin errores, que el autoguardado confirma
  el guardado, y que `docker logs kijutech_app` no muestra `ReferenceError`.
- Desde el 22 nov 2026, el despliegue abre además TODAS las pantallas fijas del panel con un usuario admin, editor
  y lector de la cuenta de pruebas (pruebas `pantallas-*`) y vuelve atrás si alguna se rompe. Esos usuarios nunca son
  `super_admin` y nadie sabe su contraseña. Una pantalla nueva entra sola (sale del manifiesto de `next build`).
- Para crear tareas reales en ClickUp durante las pruebas se usa SOLO la lista
  "Pruebas Kiju", asignadas al dueño del token. Las notas de prueba se eliminan
  al terminar.

## Procesos de fondo (Telegram): un solo oyente

- El bot de Telegram se escucha desde `instrumentation.ts` (dentro de `kijutech_app`), no
  desde un servicio aparte. Un candado de PostgreSQL asegura que solo un proceso escucha;
  si Telegram da error 409 (conflicto), pestaña Telegram lo muestra.
- Nunca arrancar un segundo proceso que use el mismo token de bot (otro contenedor, otro
  ordenador o un script con `getUpdates`): Telegram corta al primero.
- En un servidor con URL pública se cambia a webhook desde pestaña Telegram.
- Todo aviso pasa por `ops_notifications` (clave única, reintentos); no enviar mensajes
  de Telegram directamente desde otras funcionalidades.
- Todo cambio en ClickUp que dispare el flujo de Telegram (estado de la tarea o comentario) pasa por la
  bandeja de salida `ops_clickup_outbox` (`lib/operaciones/outbox.ts`): clave única, reintentos y el cliente con
  contador. No llamar a `updateTaskStatus` / `addTaskComment` directamente desde otras funcionalidades.
- Cada pulsación de botón y acción del bot se registra con `logEvent` (`ops_request_events`).

## Seguridad — regla permanente (desde el paso 8, 4 nov 2026)

La seguridad es parte de "terminado", igual que el Mapa Visual y ESTADO.md. Detalle completo en
`docs/ESTADO.md` §13.

- **Permisos por rol, siempre en el servidor.** Toda acción del servidor o ruta de API nueva llama a su
  guard de `lib/auth/permissions.ts` (`getUserIfAllowed`, `requirePermission`, `checkPermission`, o el
  tercer parámetro de `validatedActionWithUser`) antes de hacer nada. Ocultar un botón no cuenta.
  Niveles: `view` (lector), `edit` (editor: Bloc, encargos, fichas, SEO), `admin` (tokens,
  automatizaciones, niveles y servicios, borrar), `users` (solo super_admin). Un usuario sin rol no puede ni ver.
- **Las funciones internas no se exportan desde archivos `'use server'`** (cada export sería un endpoint
  público): van en un módulo con `import 'server-only'` (ver `lib/seo/access.ts`).
- **Nada sensible al navegador:** nunca devolver la fila completa de `users` (lleva `password_hash`) ni
  pasarla a un componente; usar `getSafeUser()`. Los tokens solo se muestran enmascarados (`maskSecret`).
- **Secretos:** solo en `.env` (ignorado por Git y por Docker); `docker-compose.yml` los lee con `${VAR}`.
  `.env.example` lleva los nombres sin valores. Nunca escribir un valor real en un archivo versionado.
- **Errores:** al usuario, mensajes genéricos (`publicError()` de `lib/errors.ts`); el detalle va a los logs.
- **Pruebas de seguridad:** `docker exec kijutech_app pnpm test` (Vitest, dentro del contenedor; reconstruir
  antes con `docker compose up --build -d` para que lleve el código actual). **Debe pasar antes de cada
  commit de cierre de paso**, junto a `node scripts/check-architecture-map.js`. Una auditoría estática
  falla si una acción exportada no tiene guard. Si añades una acción o pantalla con un permiso nuevo,
  añade su prueba en `tests/seguridad.test.ts`; si cambia una capa de seguridad, actualiza el bloque
  Seguridad del Mapa Visual (`lib/auth/security-process-map.ts`).
- **El arnés también pregunta:** `.claude/settings.json` (versionado) obliga a pedir permiso antes de editar
  el esquema, las migraciones, `lib/auth/`, `app/(login)/`, `docker-compose*.yml`, `Dockerfile*` y `.env`, y
  antes de `pnpm`/`npm`/`npx` en el host, `docker run`, borrar (`rm`, `git rm`, `git clean`, `git reset --hard`,
  `DROP`, `TRUNCATE`, `DELETE FROM`) o forzar un push; y **prohíbe** (`deny`) leer claves SSH, AWS y `.pem`,
  `curl|wget … | sh`, `ssh`/`scp`/`nc` directos y tocar `ANTHROPIC_BASE_URL`. No sustituye a las reglas de arriba: las respalda.
  Ampliar los permisos de Claude (este archivo o el `autoMode` del usuario) lo hace siempre Enric, nunca Claude.
- **Cambiar un prompt de IA:** antes de dejarlo activo, pasar su examen si lo tiene: desde el panel (IA → Prompts →
  el prompt → «Examinar el borrador sin guardarlo» o «Pasar examen»; queda en el historial) o con
  `RUN_REAL_EVALS=true ./node_modules/.bin/vitest run tests/ia-prompts-evals.test.ts` dentro del contenedor (~0,20 $
  por pasada). Hoy lo tiene `ops_note_to_requests`. Un examen nuevo se registra con `registerPromptEvalSuite`
  (`lib/ai/prompt-evals.ts`) desde el módulo dueño del prompt y se conecta en `wireApp()`.
- **Cambiar dependencias sin tocar Windows** (nunca `pnpm` en el host): montar el repo en un contenedor
  temporal con un volumen anónimo para `node_modules`, por ejemplo
  `docker run --rm -v "C:\dev\kijutech-tool:/work" -v /work/node_modules -w /work node:24-alpine sh -c "corepack enable && pnpm add -D <paquete>"`
  (en Git Bash anteponer `MSYS_NO_PATHCONV=1`).
- **Shell del asistente:** los heredocs y `node -e` con comillas, apóstrofos, `${}` o backticks se rompen
  (los backticks se ejecutan como comandos). Los archivos y scripts se escriben con la herramienta de
  archivos, no con la shell.

## Decisiones de diseño: protocolo de decisión — regla permanente (ampliada el 26 nov 2026)

Ante cualquier decisión no trivial (duda de producto, integración o servicio externo nuevo, arquitectura, proveedor,
modelo de datos, flujo nuevo, tocar el núcleo), Claude Code **no ejecuta ni crea nada** hasta completar estos pasos. Con
ellos decide solo, sin esperar a Enric (salvo las líneas rojas de «Reglas de autonomía»):

1. **Planifica desde 3 puntos de vista expertos distintos**, elegidos según el tema (p. ej. arquitecto de software,
   especialista del dominio —SEO, Google Ads, operaciones de agencia—, seguridad y costes, producto y UX, quien usa la
   pantalla). Cada uno propone su solución y sus riesgos.
2. **Compara al menos 3 alternativas reales** (incluida «no hacer nada» o «usar lo que ya hay») con coste, riesgo, esfuerzo
   y qué se pierde con cada una. Parte siempre del **objetivo final** (visión: Operaciones sustituye a un humano, con
   supervisión); una solución que solo sirve para probar se marca como provisional.
3. **Escribe la decisión como hipótesis** y cuestiónala tres veces desde ángulos distintos (¿cumple el objetivo final?;
   ¿qué coste o riesgo oculto tiene a semanas vista?; ¿hay algo que ya tenemos y no usamos?).
4. **Auditoría independiente con Opus 5.5 en esfuerzo alto**: lanza un subagente (herramienta Agent, `model: opus`,
   `effort: high`) al que se le da el problema, las alternativas y los ficheros relevantes, y se le pide que busque fallos
   en la decisión, no que la confirme. Si encuentra un fallo serio, vuelve al paso 1. Cuando la decisión se traduce en
   código, pasa además el revisor de código (`.claude/agents/revisor-codigo.md`) sobre el diff.
5. **Deja constancia** en el documento de diseño o de sesión: los 3 puntos de vista, las alternativas descartadas con su
   motivo, lo que dijo la auditoría y lo que no está verificado (precios, límites, documentación), sin afirmarlo como hecho.
6. No descartes una opción sin un motivo comprobable; si no hay motivo, dilo.

Para decisiones pequeñas y reversibles (un texto, un estilo, el orden de una lista) basta con el criterio de siempre; el
protocolo es para lo que cuesta deshacer.
