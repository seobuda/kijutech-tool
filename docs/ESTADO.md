# ESTADO — kijutech-tool

> **Documento vivo y de referencia.** Recoge todo lo que existe, cómo funciona, qué está decidido, qué se ha probado y qué falta. Se actualiza al cerrar cada paso de trabajo (junto al documento de sesión y al Mapa Visual).
> **No contiene claves, contraseñas ni valores de `.env`** (solo sus nombres).

**Fecha de esta versión:** 2026-10-31 (paso 7: preparar el piloto del lunes 2 nov)
**Rama de trabajo:** `feature/paso-7-piloto` (creada desde `main`; cada mejora nueva va en su propia rama). **Operaciones ya está fusionada en `main`** (fast-forward, 30 oct): `main` y `operaciones` coinciden en `9110754f`; la rama `operaciones` se mantiene.
**Rama `main`:** `9110754f` hasta que se apruebe y fusione el paso 7. Ramas antiguas de SEO (`feature/fase-d-*`, `feature/mapa-visual-sistema`) ya fusionadas.
**Repositorio:** `https://github.com/seobuda/kijutech-tool` (origen `origin`).
**Informes anteriores:** `docs/INFORME-ESTADO.md` (auditoría del 29 oct, previa a Operaciones; su análisis de SEO y de seguridad sigue vigente) y `docs/sessions/` (un documento por sesión, 45 hasta hoy).

---

## Índice

1. [Qué es esto y para quién](#1-qué-es-esto-y-para-quién)
2. [Cómo se levanta y se despliega](#2-cómo-se-levanta-y-se-despliega)
3. [Stack y versiones](#3-stack-y-versiones)
4. [Reglas de trabajo y restricciones vigentes](#4-reglas-de-trabajo-y-restricciones-vigentes)
5. [Arquitectura general](#5-arquitectura-general)
6. [Módulo Operaciones (detalle completo)](#6-módulo-operaciones-detalle-completo)
7. [Panel de Automatizaciones: todos los valores](#7-panel-de-automatizaciones-todos-los-valores)
8. [IA: proveedores, prompts y funciones](#8-ia-proveedores-prompts-y-funciones)
9. [Módulo SEO](#9-módulo-seo)
10. [Base de datos](#10-base-de-datos)
11. [Integraciones externas](#11-integraciones-externas)
12. [Mapa Visual del Sistema y su comprobación](#12-mapa-visual-del-sistema-y-su-comprobación)
13. [Seguridad](#13-seguridad)
14. [Datos y elementos de prueba (a limpiar antes de servidor)](#14-datos-y-elementos-de-prueba-a-limpiar-antes-de-servidor)
15. [Qué se ha probado y qué no](#15-qué-se-ha-probado-y-qué-no)
16. [Pendientes y deuda técnica](#16-pendientes-y-deuda-técnica)
17. [Hoja de ruta (lo planeado, en gris en el mapa)](#17-hoja-de-ruta-lo-planeado-en-gris-en-el-mapa)
18. [Cronología de la construcción](#18-cronología-de-la-construcción)
19. [Mapa de archivos](#19-mapa-de-archivos)
20. [Comprobaciones tras cada despliegue](#20-comprobaciones-tras-cada-despliegue)
21. [Glosario](#21-glosario)

---

## 1. Qué es esto y para quién

Herramienta **interna de la agencia Kijutech** para gestionar proyectos SEO y, desde octubre de 2026, las **operaciones del equipo** (encargos, ClickUp, Telegram), sustituyendo ClickUp + Drive + chats sueltos. Es un fork de `nextjs/saas-starter`, con arquitectura **núcleo + módulos**: multi-tenant desde el esquema de datos, single-tenant en la práctica (un único tenant, «Kijutech»).

- **Usuaria/o principal:** Enric (`hola@enriquetabilo.com`), super admin y dueño del token de ClickUp y del bot de Telegram.
- **Equipo en ClickUp (5 miembros en caché):** Enric Tabilo, Eury Genaro, Jesus M, Mayelin y «Kijutech agencia» (usuario de la agencia, sin persona detrás).
- **Idioma:** todo en español (instrucción permanente de `CLAUDE.md`). La interfaz heredada de la plantilla sigue en inglés en algunas pantallas (ver §16).
- **Módulos:** `seo` (Fase A–D construida en agosto) y `operaciones` (octubre). Un módulo nunca importa a otro; se comunican a través del núcleo.

## 2. Cómo se levanta y se despliega

Desde el paso 7 los dos contenedores llevan `restart: unless-stopped` (arrancan solos si el ordenador se reinicia). **Para que funcione tras reiniciar Windows:** Docker Desktop → Settings → General → «Start Docker Desktop when you sign in»; iniciar sesión en Windows (o inicio de sesión automático con `netplwiz`); desactivar suspensión e hibernación en el horario del piloto; fijar las horas activas de Windows Update.

Todo corre **dentro de Docker**. **Nunca** se ejecuta `pnpm`/`npm` en el host Windows (en una sesión anterior, `pnpm install` en Windows generó binarios nativos que colgaban Turbopack en silencio).

| Qué | Comando |
|---|---|
| Levantar | `docker compose up -d` |
| Reconstruir tras cambiar código (**no hay hot-reload**: el contenedor corre `pnpm build` + `pnpm start`) | `docker compose up --build -d` |
| Migraciones (después del build; el contenedor lleva las migraciones dentro de la imagen) | `docker exec kijutech_app pnpm db:migrate` |
| Backup antes de migrar un módulo | `docker exec kijutech_db pg_dump -U kijutech -d kijutech_db > backups/backup_pre_<modulo>_<fecha>.sql` |
| Restaurar (sobre BD limpia) | `docker exec -i kijutech_db psql -U kijutech -d kijutech_db < backups/backup_pre_<modulo>_<fecha>.sql` |
| Comprobar el Mapa Visual | `node scripts/check-architecture-map.js` (o `pnpm check:map` en el contenedor) |
| Logs | `docker logs kijutech_app` |

- **URL de la app:** `http://127.0.0.1:3000` (**nunca `localhost`**: da `ERR_CONNECTION_RESET` en esta máquina por IPv6 + WSL2 + Docker Desktop). Para el usuario de pruebas se usa `http://ops-test.localhost:3000` (host aparte, para tener otra sesión).
- **Contenedores:** `kijutech_app` (Next.js, puerto 3000) y `kijutech_db` (PostgreSQL 16 con `pgvector`, puerto 5432, volumen `kijutech_pgdata`).
- **Variables de entorno** (solo nombres): `POSTGRES_URL`, `BASE_URL`, `AUTH_SECRET`, `AI_ENCRYPTION_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `OPS_TEST_EMAIL`, `OPS_TEST_PASSWORD` (estas dos en `.env`, no versionado). Opcionales de desarrollo: `OPS_DEV_REMINDER_MINUTES` (acorta los recordatorios) y `OPS_SIMULATE_FAILURE` (simula fallo de ClickUp).
- **Procesos de fondo:** `instrumentation.ts` arranca, dentro de `kijutech_app`, la escucha del bot de Telegram y el planificador (cada 30 s). No hay servicios aparte.
- **Dockerfile.dev:** fija `pnpm 11.21.0` (`packageManager` + corepack) para que la imagen reconstruya.
- **Nunca** `docker compose down -v` ni nada que borre el volumen de la base de datos.
- **Migraciones:** `lib/db/migrations/0000`…`0035` (36). Las de Operaciones son `0022`–`0035`. Hay scripts SQL sueltos de prompts en `scripts/` (ver §8).

## 3. Stack y versiones

| Pieza | Versión / detalle |
|---|---|
| Next.js | `15.6.0-canary.59` (App Router; canary, no estable) |
| React | 19.1 |
| Node (contenedor) | 24.x (`node:24-alpine`) |
| PostgreSQL | 16 con extensión `vector` (imagen `pgvector/pgvector:pg16`) |
| ORM | Drizzle (`drizzle-orm` 0.43, `drizzle-kit` 0.31) |
| Estilos / UI | Tailwind 4.1, shadcn/ui (Radix), `lucide-react` |
| Auth | JWT en cookie httpOnly con `jose` + `bcryptjs` (incluida en la plantilla; **no** NextAuth ni Clerk) |
| Mapa Visual | `@xyflow/react` |
| Clustering | embeddings + `hdbscan-ts` |
| Otras | `zod`, `swr`, `stripe` (**instalado pero INACTIVO**, no configurar sin orden explícita) |
| Gestor | `pnpm` (dentro de Docker) |
| Pruebas automáticas | **No hay** (ni vitest ni jest); solo `tsc` (en el build) y la comprobación del Mapa Visual |

## 4. Reglas de trabajo y restricciones vigentes

### De `CLAUDE.md` (versionadas)
- **Aprobación explícita SIEMPRE** antes de: tocar `lib/db/schema.ts` o generar/aplicar migraciones; modificar `app/(login)/` o `lib/auth/`; `git push` a `origin main`; modificar `docker-compose.yml` o `Dockerfile.dev`; borrar datos, tablas o archivos existentes; instalar dependencias (`pnpm add`).
- **Modo automático** permitido para: componentes, rutas nuevas, formularios, estilos y todo lo que no toque tablas existentes ni datos guardados.
- **Backup + rama aparte** antes de migrar las tablas de un módulo nuevo (`pg_dump` a `backups/`, que no se versiona).
- **Documento de sesión** antes del commit final: `docs/sessions/YYYY-MM-DD-HH-descripcion.md` con *Qué se construyó, Migraciones aplicadas, Decisiones técnicas en auto mode, Qué verificar manualmente, Pendientes detectados* (y el hash del último commit sustantivo).
- **Regla de UX mínima:** toda pantalla nueva resuelve crear / editar / eliminar con confirmación / archivar / resetear / guardar borrador; estados vacíos con mensaje y acción; volver desde el detalle; avisos al cerrar sin guardar; redirección clara tras guardar.
- **Directiva de optimización de IA:** antes de usar una llamada de completado, valorar embeddings, algoritmos sin IA o un modelo más barato, y señalarlo.
- **Mapa Visual (regla permanente, ampliada el 30 oct):** ningún paso se considera terminado hasta que el mapa refleje lo construido (nodos, estado, descripción y ajustes), y `node scripts/check-architecture-map.js` debe pasar antes de cada commit de cierre de paso.
- **ClickUp:** caché en BD y consultas agrupadas por workspace; todo pasa por `lib/operaciones/clickup.ts` (contador por minuto, espera ante el límite, reintento ante 429; nunca `fetch` directo); medir las peticiones de cualquier pantalla nueva; tareas de prueba SOLO en la lista «Pruebas Kiju», asignadas al dueño del token.
- **Telegram:** un solo oyente del bot (candado de PostgreSQL 74200126); todo aviso por `ops_notifications`; todo cambio hacia ClickUp que dispare el flujo por `ops_clickup_outbox`; cada pulsación con `logEvent`.
- **Verificación tras cada despliegue** con el usuario de pruebas (ver §20).
- **Arquitectura:** el núcleo nunca depende de un módulo; si para resolver algo de un módulo parece necesario tocar el núcleo, se para y se pregunta.

### Dadas por Enric durante el trabajo (no están todas en `CLAUDE.md`)
- **No incluir claves, contraseñas ni `.env`** en informes; no repetir valores de credenciales. La contraseña del usuario de pruebas solo vive en `.env`.
- **Fichas de cliente sin contraseñas** (el código rechaza textos del tipo «contraseña: …»).
- **Seguridad de plantilla, registro abierto, roles, pruebas automáticas y limpieza de plantilla: aplazados «ahora»**; se harán antes de subir a un servidor.
- **SQL:** mostrar el SQL de toda tabla o columna nueva y **esperar aprobación** antes de aplicar; siempre con backup previo.
- **ClickUp real:** tareas SOLO en «Pruebas Kiju» (espacio «🎨 Desarrollo y Diseño Web», lista `1200940000008801`, workspace `90151902543`), **asignadas a Enric Tabilo** (se denegó asignar a otras personas); las notas de prueba se borran al terminar; **las tareas de ClickUp no las borra el asistente**, las borra Enric.
- **Telegram Web sin sesión:** el asistente no inicia sesión; las pulsaciones de botones reales las hace Enric.
- **Seguridad del bot:** ignora chats no vinculados salvo `/start` con código válido; los botones solo cuentan desde el chat del responsable (o del dueño en modo pruebas); Aceptar, Devolver y Responder solo del dueño.
- **Push:** autorizado por Enric paso a paso a la rama `operaciones`; **a `main` no se ha hecho push de Operaciones**.
- **Convenciones de código descubiertas:** en archivos `'use server'` solo pueden exportarse funciones async (nada de constantes ni funciones síncronas) y **no se reexportan tipos** (`export type { X }` rompe las acciones en runtime con Turbopack; sí `export type X = …` inline). El shell del asistente falla con heredocs que mezclan apóstrofos/`${}` y saltos de línea: se escriben archivos con la herramienta de edición.

## 5. Arquitectura general

- **Núcleo:** `tenants`, `users`, `roles`, `user_roles`, `projects`, `modules`/`project_modules`. 4 roles fijos: `super_admin`, `admin`, `editor`, `lector`. Hoy: 1 tenant (Kijutech), 2 usuarios (Enric y el usuario de pruebas), 1 proyecto, 1 asignación de rol.
- **Módulos:** toda tabla lleva el prefijo del módulo (`seo_*`, `ops_*`, `ai_*` para la pasarela de IA).
- **Pasarela de IA** (`lib/ai/gateway.ts`, `callAI()`): punto único para todo modelo (proveedor y clave, cifrado AES-256-GCM, timeout de 60 s, `max_tokens` configurable, coste, registro en `ai_jobs`).
- **Panel (rutas bajo `/dashboard`):** `projects` (SEO), `ai` (Configuración, Cerebro, Mis claves, prompts), `seo` (admin de tarjetas y ajustes), `operaciones`, `architecture` (Mapa Visual, solo super admin), y restos de la plantilla (`general`, `activity`, `security`).
- **API:** `/api/operaciones/{audio,equipo-audio}`, `/api/telegram/webhook` (preparada para servidor), `/api/projects/[id]/…` (progreso), `/api/user`, `/api/team`, `/api/stripe/*` (sin uso).

## 6. Módulo Operaciones (detalle completo)

Estado: **construido y funcionando en local** (modo pruebas activo). Pestañas, de izquierda a derecha: **Bloc de notas · Equipo hoy · Mi bandeja · Equipo · Clientes · Encargos · Nuevo encargo · Automatizaciones · Telegram · Ajustes ClickUp**.

### 6.1 Conexión con ClickUp
- Una conexión por tenant (`ops_clickup_connections`): token de API **cifrado** (AES-256-GCM, el mismo cifrado que las claves de IA), nunca sale del servidor. Guarda workspace, usuario del token (`me_clickup_id`) y `structure_synced_at`.
- **Caché de estructura en BD** (espacios `ops_clickup_spaces`, listas `ops_clickup_lists`, miembros `ops_clickup_members`, campos personalizados `ops_clickup_fields`, correspondencia de estados `ops_status_map`). Se refresca sola cada hora o con botón en **Ajustes ClickUp**. Las pantallas no llaman a ClickUp para pintarse. Hoy: **12 espacios, 191 listas, 5 miembros, 193 estados mapeados**; solo se guardan las listas de los espacios seleccionados.
- **Cliente único con contador** (`lib/operaciones/clickup.ts`): cuenta peticiones por minuto (espera al 80 % del límite de 100), reintenta ante 429 y registra cada petición en `ops_clickup_requests` (877 hasta hoy; Ajustes muestra las de la última hora). Todas las consultas se agrupan por workspace (no «lista por lista»).
- **Campo personalizado «Cliente»** de ClickUp: se cachea y la IA solo puede elegir entre sus opciones reales; se rellena al crear la tarea. («Cliente Redes Sociales», 11 opciones, no se usa.)
- **Zona horaria:** «hoy» y las fechas de entrega se calculan en `Europe/Madrid`; las fechas se envían sin hora.

### 6.2 Entrada de trabajo
1. **Bloc de notas** (`ops_notes`, `ops_note_audios`): se escribe o se dicta (grabación en el navegador, máx. 10 min; el audio se guarda **antes** de transcribir; transcripción con Gemini, modelo configurable en `ops_settings`, por defecto `gemini-flash-latest`). **Autoguardado** cada pocos segundos, copia local en el navegador y red de seguridad si el guardado falla; sobrevive a cerrar el navegador. Historial con abrir/borrar notas. Una nota convertida es de solo lectura.
2. **Convertir en encargos con IA** (prompt `ops_note_to_requests` v6): la IA propone uno o varios encargos (título, descripción, prioridad, lista de ClickUp, cliente por alias, servicio, responsable con razón en una línea) y separa «no convertido». **El código valida** (descarta listas/miembros inexistentes), reconoce el cliente por nombre o alias, calcula la **fecha en días laborables** según el plazo del cliente (festivos no contemplados), y aplica el responsable por prioridad: tarea propia → elegido o nombrado en la nota → habitual del cliente para ese servicio → propuesto por las fichas de Equipo. Las **tareas propias** (llamar o escribir al cliente, decidir, aprobar, pedir datos) van siempre a Enric. Las notas nuevas del Bloc llevan responsable «Sin asignar».
3. **Revisión en pantalla:** tarjetas editables, aviso ámbar si el cliente está desactivado o no coincide, casilla «requiere revisión»; la propuesta se guarda en la nota (jsonb) para sobrevivir a una recarga.
4. **Envío fiable a ClickUp** (`ops_requests`): se guarda **siempre primero** como `pendiente_clickup`; la tarea se crea con la marca `[kiju:ID]` en la descripción; pasa a `creado` solo cuando ClickUp confirma (con id y URL), o a `error_sync` con el motivo y botón **Reintentar**. En un reintento se busca antes la marca (hasta 30 páginas de 100 tareas) para no duplicar; un **índice único parcial** sobre `clickup_task_id` lo garantiza en BD. Se adjunta el audio a la tarea.
5. **Nuevo encargo (formulario):** alternativa sin pasar por el Bloc; «Preparar con IA» (`ops_prepare_request` v2) redacta título, resultado esperado, pasos, criterios y datos que faltan, sin inventar.
6. **Aviso por Telegram** al responsable cuando ClickUp confirma (§6.4).

### 6.3 Ejecución (flujo del encargo)
Estados (`ops_requests.work_status`): `asignado → en_curso → (bloqueado) → en_revision → completado`, con `devuelto` que vuelve a en curso. Transiciones **atómicas** (condicionadas al estado de origen: pulsar dos veces no repite nada).
- **▶️ Empezar ahora / 🕐 Más tarde** (aviso inicial). Quien pulsa Empezar entre varios responsables avisados queda como principal. «Más tarde» cuenta como visto y deja solo Empezar.
- **🚫 Bloqueado:** el bot pregunta qué necesita (texto o captura); la IA (`ops_blocker_triage`) revisa la tarea, su descripción, la nota original y los comentarios. **Solo responde sola si devuelve respuesta Y fuente**; con cualquier duda escala (una captura sin texto va directa al dueño; la IA no analiza imágenes). Si escala, llega a Mi bandeja y, si es urgente (prioridad 1), al instante. La respuesta del dueño le llega a la persona y queda como comentario en ClickUp.
- **✅ Hecho / 👀 Hecho, ¿lo revisas?:** el segundo pasa a `en_revision` y pide nota o enlace (con «Sin comentario»). Revisión con **revisor intercambiable** (`reviewers.ts`; hoy: dueño o ninguno): **Aceptar** completa; **Devolver** pide motivo, vuelve a en curso y avisa a la persona. Las revisiones urgentes llegan al instante; el resto, al resumen y a Mi bandeja.
- **Cierre en ClickUp:** el cambio de estado (o un comentario si la lista no tiene ese estado, según `ops_status_map`, que se propone por nombre y se edita en Ajustes) entra en la **bandeja de salida** `ops_clickup_outbox` con clave única y reintentos.
- **Registro de eventos** (`ops_request_events`): cada pulsación y acción (seen, start, later, done, accepted, agent_answered, escalated, review_requested, reminder_sent…) con persona, encargo y hora exacta. Base de la futura medición de rendimiento. La pestaña **Encargos** tiene la columna «Última acción» (cualquier botón cuenta como visto).
- **Conversaciones pendientes del bot** (`ops_telegram_pending`): enlace, motivo, pregunta o respuesta; caducan (30 min por defecto, ajustable).

### 6.4 Telegram
- Bot **KijutechPMBot**, escucha por **long polling** (`receive_mode = polling`); ruta `/api/telegram/webhook` preparada para servidor.
- **Un solo oyente:** candado de PostgreSQL 74200126; un 409 o un 401 quedan anotados y visibles en la pestaña Telegram.
- **Vinculación** por enlace `t.me/<bot>?start=<código>`: el código sirve **una sola vez** (UPDATE atómico); un chat no vinculado se ignora. Hoy hay 5 miembros: **Enric, Jesus y Mayelin vinculados; Eury y «Kijutech agencia» sin vincular**.
- **Modo pruebas ACTIVO** (por defecto): todo aviso llega solo al dueño con la cabecera «iba dirigido a…»; no se aplica el silencio de las fichas.
- **Cola de avisos** `ops_notifications`: clave única, estados `pendiente/enviado/fallido`, reclamo con candado de 90 s, reintentos con espera creciente (máx. configurable, 6 por defecto). Tipos: `new_request`, `daily_summary`, `test`, `review_request`, `block_alert`, `reply`, `returned`, `digest`, `reminder`. Historial y botones de prueba en la pestaña Telegram.
- **Silencio por persona:** comida y un hueco de silencio en la ficha de Equipo (+ casilla «Los urgentes pueden saltarse el silencio», desactivada). Los avisos que reaccionan a algo se **retrasan** al final del hueco; los envíos programados salen en el **momento permitido más cercano**. Probado como lógica; no con envíos reales fuera del modo pruebas.

### 6.5 Planificador (cada 30 s, solo el proceso líder)
Orden: `processNotifications` → `runDailySummaries` → `runDigests` → `processOutbox` → `runWatch` → `runReminders` → `runActivityDaily`.

### 6.6 Vigilancia de ClickUp (6C)
Sin webhooks: una consulta agrupada de workspace cada ~150 s (ajustable) con `date_updated_gt` y un cursor (`ops_clickup_watch`, instantáneas en `ops_clickup_task_snapshots`: 873 tareas). Decide el código: las tareas con marca `[kiju:]` son nuestras; una tarea nueva (creada tras activar) o recién asignada a alguien vinculado entra como **encargo espejo** (`origin = clickup`) con aviso y botones (el creador no se avisa a sí mismo; cliente copiado del campo Cliente); **cierre en ClickUp → encargo completado**; **reasignación** → cambia el responsable y se avisa al nuevo (el aviso viejo se reescribe «ahora lo lleva…»). Lo anterior a la activación solo se anota. «Vinculado» = Telegram vinculado (en modo pruebas basta ser miembro de ClickUp). Interruptor «Vigilar ClickUp» **activado**.

### 6.7 Recordatorios
Un único recordatorio por persona y encargo: si nadie pulsa nada en un tiempo de jornada laboral de esa persona (120 min laborables); o, tras «Más tarde», si vence hoy y a mitad de su jornada sigue sin empezar. Usa el horario de la ficha (zona, entrada, horas por día, días). Lo que sigue sin respuesta al terminar la jornada sale una vez en la sección «⏳ Sin respuesta» del primer resumen del dueño. Solo en desarrollo existe `OPS_DEV_REMINDER_MINUTES` (o la fila `dev_reminder_minutes`) para acortarlos.

### 6.8 Resúmenes
- **Del equipo** (`daily_summary`): a la hora de entrada de cada persona, en su zona, lunes a viernes: tareas vencidas y de hoy (reutiliza la consulta de «Equipo hoy», caché de 2 min). Si no tiene ninguna, no manda nada. Clave por persona y fecha: un reinicio no duplica ni pierde (si el servidor estaba apagado, sale dentro del margen).
- **De mi bandeja** (`digest`): a las 13:00 y 18:00 (hora de Madrid, ajustable), lunes a viernes: ✅ Completado, 🤖 Resuelto por el agente, ⏳ Sin respuesta, 📉 Clientes en alerta (solo en el último del día), 🙋 Necesita de ti (con botones Aceptar/Devolver/Responder). **Cortafuegos de avisos:** al dueño solo le llegan al instante los bloqueos y revisiones **urgentes** (prioridad 1).
- **Mi bandeja** (pestaña): lo que necesita del dueño (revisiones y bloqueos escalados) por tiempo de espera; se calcula del estado actual, sin tabla propia.
- **Equipo hoy** (pestaña): qué tiene hoy, vencido y sin fecha cada persona (una consulta de workspace con filtro de fecha; «sin fecha» se recalcula cada 30 min a 9 peticiones).

### 6.9 Fichas de Equipo (6A)
Una ficha por persona (`ops_team_profiles`, 5): puesto, descripción, notas, **tipos de trabajo** como principal o apoyo (`ops_team_profile_work_types`, 3 asignaciones; catálogo `ops_work_types`: cambio web, landing, artículo, Google Ads, mantenimiento, otro), **horario** (zona, hora de entrada, horas por día, días laborables), **comida y silencio** y su casilla de urgentes. Es la **fuente única** de zona y horario (los avisos leen de aquí). «Rellenar con IA» (`ops_profile_fill`) propone campos desde texto o audio y **nunca guarda por su cuenta**. La IA propone responsable a partir de estas fichas (solo personas activas con miembro de ClickUp vinculado). La ficha lleva `user_id` para que más adelante cada persona vea la suya. Las horas por día y los tipos de trabajo aún no se usan para repartir carga.

### 6.10 Fichas de Clientes (6B)
**52 fichas sembradas** (`ops_clients`, 52 activas): nombres alternativos/alias, nivel y plazo en días laborables (`ops_client_levels`: Top, Estándar, Mantenimiento), servicios con responsable habitual (`ops_services`: seo, google_ads, web, mantenimiento, gohighlevel; `ops_client_services`), listas habituales, negocio y estrategia. «Kijutech» tiene nota interna. «Rellenar con IA» (`ops_client_fill`). El agente propone cliente por alias, lista habitual, responsable habitual del servicio y fecha por plazo. **Sin contraseñas** en las fichas. Una ficha con encargos no se borra, solo se desactiva. Niveles y servicios son tablas editables sin CHECK de valores.

### 6.11 Alertas de clientes (6D)
**Pasada diaria** (03:00 Madrid) con **una consulta agrupada** (≈3 peticiones para ~300 tareas) → `ops_client_activity` (52): última actividad, completadas del mes, abiertas con fecha en el horizonte del cliente y **horas aproximadas** (tiempo laboral entre Empezar y Hecho de los encargos del cliente). **Semáforo** en Clientes: 🔴 sin actividad, 🟠 sin trabajo planificado, 🟢 bien, ⚪ gris (no genera alertas o «Ficha sin completar»). Solo vigila clientes activos, vinculados, con servicio u horas al mes y «Genera alertas» encendido (**hoy 50 de 52 están en gris** hasta que Enric las complete; Kijutech tiene las alertas apagadas). Umbrales por nivel (inactividad: Top 7 / Estándar 14 / Mantenimiento 30 días; horizonte planificado: 7 / 14 / desactivado) y por cliente. Las alertas nuevas salen en el último resumen del día con recordatorio semanal si siguen; la marca «ya avisada» se borra al desaparecer la condición. Botón «Recalcular actividad» y **«Trabajo de este mes»** (actual o anterior, con «Copiar»). Si la pasada falla se reintenta cada 30 min y el error se ve en Clientes.

### 6.12 Panel de Automatizaciones (6E)
Pestaña **Automatizaciones**: 12 tarjetas con interruptor, tiempos con límites, texto con huecos y vista previa, «Enviarme una prueba» y «Restaurar valores»; **Próximos envíos** (24 h, calculado al vuelo) y **Registro de cambios** (quién, qué, cuándo, valor anterior y nuevo). Detalle y valores por defecto en §7.

### 6.13 Fiabilidad y seguridad (resumen)
Envío sin duplicados (marca `[kiju:]` + índice único); copia local del Bloc y audio antes de transcribir; contador de peticiones y espera ante el límite; un único oyente del bot; códigos de vinculación de un solo uso; chats no vinculados ignorados; botones solo desde el chat del responsable; avisos con clave única (nunca dos veces); cambios a ClickUp por bandeja de salida con reintentos; token de ClickUp cifrado.

### 6.14 Paso 7: preparar el piloto (31 oct)
- **Limpieza de vencidas** (`lib/operaciones/cleanup.ts`, `cleanup-actions.ts`, `cleanup-panel.tsx`): botón «Enviar limpieza de vencidas» en **Equipo** y en **Automatizaciones**, a una persona o a todas (con confirmación). Una consulta agrupada de ClickUp (la de «Equipo hoy») da las vencidas de los espacios seleccionados, de la más antigua a la más reciente, con tope por tanda (`maxTasks` 30). El bot envía **una tarea cada vez** (aviso con clave única) con ✅ Ya está hecha (estado «hecho» de la lista), 📅 Nueva fecha (mañana, en 3 días, lunes de la semana que viene o ✍️ escribir `dd/mm` o `dd/mm/aaaa`), 🗑 Ya no aplica (estado de tipo «closed» de la lista, o «hecho» si no existe, más un comentario) y ⏹ Parar limpieza. Todo cambio en ClickUp va por `ops_clickup_outbox` (nueva acción `set_due`). Al terminar, la persona recibe las gracias con su resumen y a Enric le llega **dentro de sus resúmenes de las 13:00 y 18:00** (no inmediato). **Modo pruebas:** todo llega a Enric; las tareas de **otras personas se simulan** (se registra, no se escribe en ClickUp); solo las de Enric son reales.
- **La limpieza no falsea informes:** lo cerrado o descartado en una limpieza **no cuenta** en «Trabajo de este mes» ni en «completadas del mes»; sale aparte en «Cerradas en limpieza» sin contar en el total. Los cambios de una limpieza no cuentan como **última actividad del cliente** el día en que se tocaron (se excluyen con `ops_cleanup_items`).
- **Pestaña Piloto** (`lib/operaciones/pilot.ts`): por semana (lunes a domingo, Madrid) y por persona: encargos creados por origen (bloc, Nuevo encargo, ClickUp), del aviso a Empezar y de Empezar a Hecho (media y mediana, en minutos laborables), bloqueos resueltos por la IA frente a los que llegaron a Enric, revisiones aceptadas y devueltas, recordatorios, encargos sin respuesta, tareas revisadas en limpiezas, y «Tu bandeja» (interrupciones inmediatas frente a lo que fue a los resúmenes). Se calcula al vuelo; fecha de inicio configurable (`pilot_start` en `ops_settings`, por defecto el próximo lunes: **2026-11-02**). Sección **Sugerencias** con capturas (se piden al bot al verlas, ruta `/api/operaciones/suggestion-photo/[id]`).
- **Voz del equipo en el bot:** `/sugerencia` (texto o captura, guarda persona y hora; sale una vez en el resumen de las 18:00) y `/ayuda` (qué hace cada botón; texto fijo en el código).
- **Fiabilidad:** aviso «🟢 Sistema en marcha» al arrancar el proceso líder, con el tiempo apagado (por el latido `worker_heartbeat` de cada vuelta de 30 s), cuánto cayó en horario laboral del equipo y qué quedó pendiente (avisos y cambios de ClickUp en cola). Llega siempre a Enric. Cada `docker compose up --build` también lo envía (se puede apagar en Automatizaciones → «Aviso Sistema en marcha»).
- **Migración 0036** (backup `backups/backup_pre_piloto_20261031.sql`): tablas `ops_cleanup_runs`, `ops_cleanup_items`, `ops_suggestions`; columna `ops_telegram_pending.cleanup_item_id`; nuevos valores en las comprobaciones de `ops_notifications.kind` (`cleanup`, `cleanup_summary`, `startup`) y `ops_clickup_outbox.action` (`set_due`).

## 7. Panel de Automatizaciones: todos los valores

Los valores por defecto viven en el código (`lib/operaciones/automations.ts`); la tabla `ops_automations` solo guarda lo que se cambia (restaurar = borrar la fila). Caché de 10 s. Textos en formato de Telegram (`<b>`, `<i>`, `<u>`, `<code>`, `<a href>`) con huecos validados; una línea con un hueco opcional vacío desaparece.

| Automatización | Qué hace | Valores (por defecto → rango) | Huecos del texto |
|---|---|---|---|
| `new_request` Aviso de encargo nuevo | Avisa al responsable con los botones | — (solo interruptor y texto) | `{tarea}` `{lista}` `{fecha}` `{cliente}` `{resumen}` `{url}` `{etiqueta}` |
| `reminder_unanswered` Recordatorio sin respuesta | Un recordatorio si nadie pulsa nada | `minutes` 120 → 15–480 min laborables | `{nombre}` `{tarea}` `{fecha}` `{cliente}` `{url}` |
| `reminder_later` Recordatorio tras «Más tarde» | Si vence hoy y no ha empezado a mitad de jornada | `dayPct` 50 → 10–90 % de la jornada | ídem |
| `daily_team` Resumen diario del equipo | «Buenos días» a la hora de entrada | `windowMin` 180 → 30–360 | `{nombre}` `{vencidas}` `{hoy}` `{fecha}` |
| `digest` Resúmenes de mi bandeja | Lo completado, del agente y lo que necesita de ti | `times` 13:00,18:00 (1–4 horas); `windowMin` 180 → 30–360; `includeUnanswered` sí | `{secciones}` |
| `client_alerts` Alertas de clientes | Sección «Clientes en alerta» | `remindDays` 7 → 1–30 | `{total}` `{lista}` |
| `activity_scan` Pasada diaria de actividad | Calcula la actividad por cliente | `time` 03:00 (Madrid); `retryMin` 30 → 5–240 | — |
| `watch` Vigilancia de ClickUp | Mira ClickUp (interruptor con su propia lógica de activación) | `everySec` 150 → 60–900 | — |
| `cleanup` Limpieza de vencidas | Envía las vencidas de cada persona de una en una | `maxTasks` 30 → 5–100 | `{nombre}` `{total}` (texto de introducción) |
| `startup` Aviso «Sistema en marcha» | Avisa al arrancar y mide las paradas | `minDownMin` 3 → 1–120 min | — |
| `urgent_block` Aviso urgente de bloqueo | Instantáneo si prioridad 1 | — | `{detalle}` |
| `urgent_review` Aviso urgente de revisión | Instantáneo si prioridad 1 | — | `{detalle}` |
| `delivery` Envío y respuestas por Telegram | Reintentos y tiempo para contestar al bot | `maxAttempts` 6 → 1–10; `pendingMinutes` 30 → 5–240 | — |

**Estado actual en BD:** 3 filas en `ops_automations` (la de `digest` con sus horas iniciales copiadas por la migración y dos restauradas tras pruebas) y 4 entradas en el registro de cambios (pruebas del 30 oct). Las horas del resumen de bandeja ya **solo** se editan aquí (la pestaña Telegram las muestra con enlace). Las horas de entrada, comida y silencio se editan en Equipo; los umbrales de clientes, en Clientes.

## 8. IA: proveedores, prompts y funciones

- **Proveedores soportados:** Anthropic, OpenAI, Gemini, DeepSeek (`lib/ai/adapters`). **Configurado:** Anthropic, modelo `claude-sonnet-4-6`, clave de plataforma cifrada. **Embeddings:** Gemini `gemini-embedding-001` (1536 dim.) con clave propia separada (también Voyage y OpenAI). Hay pantalla de configuración, panel del Cerebro (aprendizaje y costes por función) y «Mis claves».
- **Transcripción de audio:** Gemini (`gemini-flash-latest` por defecto; `gemini-2.5-flash` ya no está disponible para claves nuevas). **La clave de Gemini no tiene créditos**: el audio de «Rellenar con IA» y la transcripción **no se han probado de extremo a extremo**. Chrome graba `audio/webm`, que no está en la lista oficial de Gemini (puede requerir convertir a WAV si lo rechaza).
- **Prompts editables** (tabla `ai_prompts`, 7; se editan en `/dashboard/ai/settings/prompts/[key]`):

| Clave | Nombre | Versión | Para qué |
|---|---|---|---|
| `cluster_keywords` | Clustering de Keywords | v6 | SEO |
| `cluster_strategic` | Clasificación estratégica de clusters | v2 | SEO |
| `ops_note_to_requests` | Convertir nota en encargos | v6 | Operaciones (con alias de clientes, servicios y fichas de Equipo) |
| `ops_prepare_request` | Preparar encargo | v2 | Operaciones |
| `ops_blocker_triage` | Revisar un bloqueo | v1 | Operaciones |
| `ops_client_fill` | Rellenar la ficha de un cliente | v1 | Operaciones |
| `ops_profile_fill` | Rellenar la ficha de una persona | v1 | Operaciones |

  Además `ops_transcribe_audio` es la clave que usa la transcripción (modelo configurable en `ops_settings`).
- **Scripts de prompts** (`scripts/ops-*.sql`): una instalación nueva sembraría el `ops_note_to_requests` v1 (migración 0024); hay que aplicar después los scripts de prompts (v2…v6, paso 5, equipo, clientes) en orden. Pendiente consolidarlo.
- **Decisiones con la IA:** la IA propone, el código valida. Solo el triaje de bloqueos puede responder por sí misma, y únicamente con respuesta + fuente. Recordatorios, resúmenes, alertas, silencio, vigilancia y panel **no usan IA**.
- **Uso:** `ai_jobs` registra 51 llamadas (el SEO tuvo ~27 % de fallos históricos por límites de `max_tokens`, ya corregidos).

## 9. Módulo SEO

Construido en agosto de 2026 (Fases A–D). Detalle y auditoría completa en `docs/INFORME-ESTADO.md`. Resumen:
- **Etapas (8 en el manifest, 4 activas):** Onboarding y Medición (completa), Kickoff (completa), Radiografía inicial (parcial: formulario, **0 hallazgos guardados**), Keyword Research (completa). Estrategia, Ejecución, Reporting y NotebookLM: «Próximamente».
- **Keyword Research (4 pasos):** competidores → keywords (manual, texto o CSV de SE Ranking) → **clustering con IA** (embeddings + HDBSCAN, noise recovery, modificadores de intención, marcas, fusión, feedback y movimiento de keywords) → clusters, con **enlace público** para el cliente (`/share/[token]`). **Fase D:** competidores desde SERP por cluster con scraping y **análisis IA**, y **plan de contenido pilar-satélite**.
- **Datos hoy:** 1 proyecto, 33 keywords, 24 clusters (39 keywords asignadas), 3 competidores, 1 competidor por cluster, 0 análisis guardados, 2 planes de contenido, 1 enlace público, 48 tarjetas de conocimiento, 159 modificadores de intención, 24 ejemplos y 37 feedbacks de clustering.
- **A medias:** auditoría sin hallazgos; el paso 3 figura «en curso»; `seo_kw_raw.embedding` vacío (los vectores no se guardan ahí).
- **Pendiente (ver §17):** SEO automatizado (auditoría por API, competidores desde la SERP y volúmenes con DataForSEO).

## 10. Base de datos

**Total: 66 tablas** (11 núcleo, 15 SEO, 7 IA, 33 Operaciones). Conteos reales a 2026-10-30; las 3 tablas del paso 7 (`ops_cleanup_runs`, `ops_cleanup_items`, `ops_suggestions`) se crearon el 31 oct (1 tanda de limpieza real en curso para Enric, 30 tareas).

**Núcleo / plantilla:** `tenants` 1 · `users` 2 · `roles` 4 · `user_roles` 1 · `projects` 1 · `modules` 1 · `project_modules` 0 · `teams` 2 · `team_members` 2 · `invitations` 0 · `activity_logs` 10 (`teams`, `team_members` e `invitations` son restos de la plantilla pendientes de limpieza).

**SEO (15):** `seo_stage_progress` 4 · `seo_onboarding_checklist` 4 · `seo_kickoff_answers` 7 · `seo_audit_findings` 0 · `seo_kw_progress` 4 · `seo_kw_competitors` 3 · `seo_kw_raw` 33 · `seo_kw_clusters` 24 · `seo_kw_cluster_keywords` 39 · `seo_cluster_competitors` 1 · `seo_competitor_analysis` 0 · `seo_cluster_content_plan` 2 · `seo_share_tokens` 1 · `seo_knowledge_cards` 48 · `seo_settings` 1.

**IA (7):** `ai_provider_settings` 1 · `ai_model_pricing` 12 · `ai_prompts` 7 · `ai_jobs` 51 · `ai_clustering_examples` 24 · `ai_clustering_feedback` 37 · `ai_intent_modifiers` 159.

**Operaciones (30):**
| Tabla | Para qué | Filas |
|---|---|---|
| `ops_clickup_connections` | Conexión (token cifrado) | 1 |
| `ops_clickup_spaces` / `_lists` / `_members` / `_fields` | Caché de estructura | 12 / 191 / 5 / 1 |
| `ops_status_map` | Estados de cada lista ↔ flujo | 193 |
| `ops_clickup_requests` | Contador de peticiones a ClickUp | 877 |
| `ops_clickup_watch` / `ops_clickup_task_snapshots` | Vigilancia y sus instantáneas | 1 / 873 |
| `ops_clickup_outbox` | Bandeja de salida hacia ClickUp | 3 |
| `ops_notes` / `ops_note_audios` | Bloc y audios | 2 / 0 |
| `ops_requests` | Encargos (27: 20 herramienta, 7 ClickUp; 27 `creado`; work_status: 20 asignado, 3 completado, 3 en curso, 1 bloqueado) | 27 |
| `ops_request_events` | Registro de eventos | 21 |
| `ops_blockers` | Bloqueos | 1 |
| `ops_telegram_config` / `_members` / `_pending` | Bot, vinculación y conversaciones | 1 / 5 / 1 |
| `ops_notifications` | Cola y registro de avisos | 37 |
| `ops_work_types` | Tipos de trabajo | 6 |
| `ops_team_profiles` / `ops_team_profile_work_types` | Fichas de Equipo | 5 / 3 |
| `ops_clients` / `ops_client_levels` / `ops_services` / `ops_client_services` | Fichas de Clientes | 52 / 3 / 5 / 2 |
| `ops_client_activity` | Actividad por cliente | 52 |
| `ops_settings` | Ajustes clave-valor (modelo de transcripción, estado de la pasada de actividad) | 2 |
| `ops_automations` / `ops_automation_changes` | Panel de Automatizaciones | 3 / 4 |

**Migraciones de Operaciones:** `0022` conexión ClickUp · `0023` encargos · `0024` notas (siembra prompt v1) · `0025` caché de ClickUp · `0026` Telegram · `0027`–`0028` campo Cliente · `0029` flujo del paso 5 (estados, eventos, bloqueos, bandeja de salida, pendientes) · `0030` fichas de Equipo · `0031` Clientes · `0032` vigilancia · `0033` tipo de aviso `reminder` · `0034` alertas de clientes · `0035` Automatizaciones, comida y silencio. Backups en `backups/` (no versionados, un `backup_pre_operaciones_*` por paso).

## 11. Integraciones externas

| Servicio | Uso | Estado |
|---|---|---|
| **ClickUp** (API v2) | Estructura, tareas, creación, estados, comentarios, campo Cliente | Conectado con token real; funciona |
| **Telegram** (Bot API) | Avisos, botones, vinculación | Bot real `KijutechPMBot` conectado en modo pruebas; las pulsaciones de botones las hace Enric a mano |
| **Gemini** | Transcripción y embeddings | **Sin créditos** en la clave de transcripción → audio sin probar |
| **Anthropic** | Modelo por defecto de todas las funciones de IA | Funciona |
| **SE Ranking** | Importación de keywords por CSV | Funciona (manual) |
| **DataForSEO** | Volúmenes, SERP, auditoría | **No integrado** (planeado) |
| **Stripe** | Plantilla | Instalado e **inactivo**; la clave inválida genera «Invalid API Key» al visitar la zona de pagos |

## 12. Mapa Visual del Sistema y su comprobación

- **`/dashboard/architecture`** (solo super admin): React Flow en **tres niveles** con migas de pan. Nivel 1: Núcleo, Motor de IA, Cerebro, Admin SEO, **Operaciones (construido)**, **Integraciones**, Análisis de competidores, el wizard SEO y **10 pendientes en gris**. Nivel 2: 15 procesos y piezas de Operaciones (nuevas: Limpieza de vencidas y Piloto). Nivel 3: 77 pasos en 13 mapas con *cuándo se ejecuta, qué decide la IA, qué decide el código, tablas, prompts, ajustes con sus valores actuales y enlace al ajuste*.
- **Mapa vivo:** muestra los **valores actuales del panel** y la **última ejecución / error** de vigilancia, pasada de actividad, resúmenes, recordatorios, cola de avisos, bandeja de salida, Telegram, planificador y caché de ClickUp (`lib/operaciones/map-live.ts`).
- **Recorrido nota → completada** con botones «Sigue en…».
- **Datos:** `lib/operaciones/process-map.ts` (`OPS_MAPS`), `lib/architecture-map/registry.ts` (nivel 1, `FUTURE_NODES`, `PROCESS_MAP_IDS`); SEO usa `CLUSTERING_PROCESS_MAP` y `COMPETITOR_ANALYSIS_PROCESS_MAP`.
- **Comprobación automática:** `scripts/check-architecture-map.js` falla si una automatización del panel, una tarea del planificador, un prompt de IA o una tabla `ops_*` no tiene su entrada, o si el mapa está roto. **Estado: pasa** (13 automatizaciones, 7 tareas del planificador, 6 prompts, 33 tablas, 77 pasos, 13 mapas). Solo cubre Operaciones y valida presencia y coherencia, no la veracidad de las descripciones.

## 13. Seguridad

**Decisión vigente:** la seguridad de plantilla, el registro, los roles y las pruebas automáticas se **aplazan** y se hacen **antes de subir a un servidor**.

**Bien hecho:** las acciones de SEO y proyectos comprueban usuario y que el proyecto sea de su tenant; las de IA y ajustes exigen super admin; claves de IA y token de ClickUp **cifrados**; ids de tenant derivados del usuario; Telegram con vinculación de un solo uso, chats no vinculados ignorados y botones restringidos; avisos y envíos con claves únicas.

**Riesgos abiertos (heredados y de Operaciones)**
1. **Alto — registro abierto:** `/sign-up` mete a cualquiera en el tenant Kijutech; las acciones comprueban la cuenta pero no el rol, así que un desconocido con cuenta vería y editaría proyectos.
2. **Alto — sin comprobación de rol en acciones SEO:** un `lector` puede crear, editar y borrar.
3. **Alto — Operaciones sin control de roles:** cualquier usuario del tenant puede ver, cambiar o borrar el token de ClickUp, cambiar automatizaciones, fichas y clientes, y enviar pruebas (`canManageProfiles` devuelve `true` para cualquier usuario). **Condición obligatoria: resolver este riesgo (control de roles en Operaciones) ANTES de dar acceso a la web a cualquier miembro del equipo y antes de subir a un servidor.** Decisión de Enric, sin excepciones.
4. **Medio — `/api/user` devuelve el usuario completo (con el hash) y `/api/team` los miembros.**
5. **Medio — middleware excluye `/api`**; la protección depende de cada ruta.
6. **Medio — enlaces públicos `/share/[token]`:** UUID sin caducidad, sin revocar ni regenerar, sin límite de peticiones.
7. **Bajo — secretos de desarrollo en `docker-compose.yml`** versionados (contraseña de BD, `AUTH_SECRET`, `AI_ENCRYPTION_KEY`): rotar si el repositorio sale de esta máquina.
8. **Bajo — mensajes de error internos** visibles al usuario.
9. **Telegram:** con varios servidores el candado impide dos oyentes, pero las cachés en memoria (Equipo hoy 2 min, panel 10 s, mes de clientes 2 min, contador de peticiones) son **por proceso**. Un duplicado teórico es posible si el servidor cae justo entre enviar y anotar un mensaje (Telegram no tiene clave de idempotencia).

## 14. Datos y elementos de prueba (a limpiar antes de servidor)

> **Paso 7:** antes del piloto se borran de la base de datos los encargos, eventos, avisos y notas de prueba anteriores (sin tocar fichas, clientes, configuración, cachés ni `ops_clickup_task_snapshots`), con recuento previo y OK de Enric. El usuario de pruebas se queda hasta antes de subir a un servidor.

- **Usuario de pruebas** de desarrollo: `ops-test@kijutech.test` (contraseña solo en `.env`; accede por `http://ops-test.localhost:3000`). **Debe borrarse antes de subir a un servidor.**
- **Tareas de ClickUp** en «Pruebas Kiju» que Enric debe borrar: `[PRUEBA PASO 5]` A–E · `[PRUEBA 6C]` · `[PRUEBA 6C-2]` A, B, B2, C, D (el asistente no borra tareas de ClickUp).
- **Datos de prueba en la BD:** encargos y notas de prueba (de los 27 encargos y 2 notas), eventos, avisos, un bloqueo, la ficha «RF Serveis» rellenada como prueba (revisar sus datos), entradas del registro de cambios del panel, y la tarea de Eury de «CP Poblenou» (real, asignada en ClickUp).
- **Sesión de Chrome:** el navegador de automatización tiene sesión de ClickUp de **Mayelin** (se usó como «otra persona»); Telegram Web no tiene sesión.
- **Modo pruebas del bot:** activo; hay que apagarlo conscientemente al pasar a producción.
- Ficheros sueltos en la raíz del repo: `backup_pre_fase_b.sql` (ignorado por git) y `seed-knowledge-cards-keyword-research.sql`.

## 15. Qué se ha probado y qué no

**Probado con datos reales:** conversión de notas con IA; envío a ClickUp (tareas reales en «Pruebas Kiju»); caché y contador; Bloc con autoguardado, fallo simulado, copia local y reintento; flujo de botones con Telegram simulado y ClickUp/IA reales; Telegram real para avisos y la prueba del panel (llegan al dueño); recordatorios (sin respuesta, tras «Más tarde», «Sin respuesta» en el resumen); vigilancia (aviso por tarea nueva, cierre en ClickUp → completado, reasignación); semáforo de clientes con datos reales (RF Serveis verde, «san bernardo» rojo temporal); «Trabajo de este mes»; panel (cambio de un tiempo aplicado sin tocar código, texto editado con la prueba recibida); lógica del silencio (cálculo de huecos); Mapa Visual (recorrido por clics y valores reales); `tsc` en cada build y log del servidor sin `ReferenceError`.

**Probado en el paso 7:** pestañas Piloto, Equipo y Automatizaciones (cargan, métricas con datos reales de las pruebas previas, fecha de inicio guardada y restaurada); envío real de la limpieza de las vencidas de Enric a su Telegram (30 tareas + 1 para otra tanda; llegó el primer mensaje con botones); «Sistema en marcha» tras reconstruir y tras `docker restart` de los dos contenedores («Reinicio rápido»); política `unless-stopped` en ambos contenedores.

**No probado:** las pulsaciones de la limpieza (cerrar, nueva fecha, escribir fecha, descartar, parar) y `/sugerencia`/`/ayuda` desde el móvil (las pulsa Enric); la simulación de tareas de otras personas en la práctica; la exclusión de tareas limpiadas en «Trabajo de este mes» y en la pasada de actividad con datos reales; un apagado real en horario laboral (mensaje con tiempo y pendientes); el arranque automático tras reiniciar Windows; pulsaciones de botones reales desde el móvil de cada persona (salvo las de Enric); un 409/429 real; audio de extremo a extremo (clave de Gemini sin créditos; formato `webm`); silencio con envíos reales (modo pruebas desactivado); varios servidores; alertas con clientes completados (hoy 50 de 52 en gris); cualquier prueba automática (no existen).

## 16. Pendientes y deuda técnica

**Antes de subir a un servidor**
- Seguridad, roles y registro abierto (§13); limpieza de la plantilla (logo ACME, portada, Stripe, textos en inglés, `README.md`, título «Next.js SaaS Starter», tablas `teams`/`invitations`, TODO de email de invitación en `app/(login)/actions.ts`); pruebas automáticas; rotar secretos.
- Borrar el usuario de pruebas, tareas `[PRUEBA …]` y datos de prueba (§14); apagar el modo pruebas; pasar Telegram a webhook; copias de seguridad programadas.
- Redirección para el enlace «Abrir tarea» de Encargos (hoy no registra clics): pasar por la herramienta.
- Cachés por proceso (un solo servidor por ahora).

**Deuda técnica conocida**
- **Columnas obsoletas por borrar** con una migración futura: `ops_telegram_members.timezone`, `ops_telegram_members.work_start`, `ops_telegram_config.digest_timezone`, `ops_telegram_config.digest_times`.
- **Festivos** no contemplados en plazos ni horas laborables.
- **Textos de «Respuesta» y «Devuelto»** (avisos a la persona) fijos en el código; los avisos urgentes solo permiten editar el encabezado (`{detalle}` viene del código).
- Consolidar los **scripts de prompts** de Operaciones en la siembra.
- La **comprobación del mapa** no cubre el SEO ni valida la veracidad de las descripciones.
- Las **horas por cliente salen ≈0** si el trabajo no pasa por Empezar/Hecho.
- Una tarea con **varios responsables** crea un único encargo; si luego se quita al principal y queda otro, no se re-asigna. Un cambio de estado en ClickUp distinto de «cerrar» (o reabrir una tarea cerrada) no se refleja.
- Un estado de ClickUp «en curso» se aplica aunque la tarea ya esté en él; la IA no analiza capturas.
- Un encargo ya guardado no se puede editar ni eliminar; una nota convertida no se reabre; una nota nueva no aparece en el historial hasta recargar; al dejar la revisión abierta mucho tiempo se vio un `?nueva=1` con una nota en blanco (no reproducido).
- «Sin fecha» cuesta 9 peticiones cada 30 min; tras reiniciar el servidor la primera visita a Equipo hoy vuelve a consultar.
- El adjunto de audios: si falla a mitad de varios, al reintentar se vuelven a adjuntar los primeros. No hay precio del modelo de transcripción, así que su coste sale vacío.
- Al desactivar o borrar una ficha de Equipo no se cambian los encargos ya asignados.
- Las fichas de **Eury y Mayelin** las crea Enric (solo Jesús está rellenado). **Posibles duplicados de clientes** sin resolver (los resuelve Enric; no fusionar nada): `sih` / `Sihbou.com`; «clubpilatesindautxu.es» frente a la familia «CP …» y `PilatesClubSpain.com`; `Spid2005.com` / `SonidoFundamental`.
- SEO: 0 hallazgos de auditoría; análisis de competidores sin filas guardadas; el botón «Activar» del pre-filtrado del Cerebro es un placeholder; `ai_jobs` no guarda el mensaje de error; Next.js en canary; sin hot-reload.

## 17. Hoja de ruta (lo planeado, en gris en el mapa)

Cada uno con su nodo en el nivel 1 del Mapa Visual:
- **Servidor:** subir a un servidor con dirección pública (webhook de Telegram, copias de seguridad, seguridad real de usuarios y roles, limpieza de la plantilla).
- **Jornada y rendimiento:** medir rendimiento, no presencia, con flexibilidad: botones «tengo que salir» y «he vuelto», y hora de entrada frente a primera actividad real. Se apoya en `ops_request_events`.
- **Niveles y recompensas:** progreso visible, carreras con formaciones desbloqueables y bonos mensuales que se pueden perder, con un salario base que solo sube.
- **Subagentes por área:** agentes de IA por área o por cliente que revisan el trabajo antes que Enric, con su ficha y su criterio (p. ej. redacción con el tono de cada cliente o diseño web con el criterio de Enric); se enchufan como **revisor intercambiable** (`reviewers.ts`: solo tendrán que llamar a `acceptWork()` o `returnWork()`).
- **Diccionario de la agencia:** herramientas, clientes y personas, más los errores del dictado por voz; en parte ya lo cubren los nombres alternativos de las fichas de clientes.
- **Audios al bot de Telegram** desde el móvil para crear notas.
- **Entrada de trabajo por email** (reenvío a una dirección propia).
- **Reglas de decisión que aprenden de las respuestas** de Enric.
- **SEO automatizado:** auditoría por API, competidores desde la SERP y volúmenes con DataForSEO.
- **Deuda técnica:** ver §16 (nodo propio en el mapa con sus 4 partidas).

## 18. Cronología de la construcción

- **Ago 2026 (SEO y núcleo):** Docker Compose y auth verificada; esquema núcleo y tenant Kijutech (16 ago); Fase B (onboarding, kickoff, asistente); Fase C (Keyword Research, importación CSV de SE Ranking, pasarela de IA, clustering con embeddings + HDBSCAN, noise recovery, feedback, Panel del Cerebro, tokens y costes); Fase D (competidores SERP, análisis IA, plan pilar-satélite); Mapa Visual (21–22 ago).
- **29 oct:** informe de estado (`INFORME-ESTADO.md`); módulo Operaciones y conexión con ClickUp; nuevo encargo hacia ClickUp (envío fiable); Bloc de notas con audio; fix de la conversión; red de seguridad del Bloc y usuario de pruebas; caché de ClickUp y contador; tareas propias; avisos por Telegram; historial y pestaña Telegram; campo Cliente.
- **30 oct:** paso 5 (flujo desde Telegram, bloqueos con IA, cortafuegos, Mi bandeja, eventos) · 6A Equipo · 6B Clientes · 6C botones por fases, recordatorios y vigilancia de ClickUp · «Última acción» · 6D alertas de clientes · 6E panel de Automatizaciones · Mapa Visual de Operaciones con regla y comprobación.
- **31 oct:** paso 7, preparar el piloto: limpieza asistida de vencidas, pestaña Piloto, `/sugerencia` y `/ayuda`, «Sistema en marcha» y arranque automático de los contenedores; la limpieza no falsea alertas ni informes.
- Historial completo: `git log` (233 commits) y `docs/sessions/` (45 documentos).

## 19. Mapa de archivos

- **`lib/operaciones/`** — lógica del módulo: `clickup.ts` (cliente con contador), `structure.ts` (caché), `queries.ts`, `note-actions.ts` / `note-types.ts` / `transcribe.ts` (Bloc), `request-actions.ts` (encargos), `workflow.ts` (estados), `blockers.ts`, `reviewers.ts`, `inbox.ts`, `events.ts`, `outbox.ts`, `status-map.ts`, `telegram.ts` / `telegram-config.ts` / `telegram-handler.ts` / `telegram-worker.ts` / `telegram-actions.ts`, `notifications.ts` (cola y resumen del equipo), `digest.ts`, `reminders.ts`, `watch.ts` / `watch-actions.ts`, `quiet.ts`, `team-profiles.ts` / `profile-actions.ts`, `clients.ts` / `client-actions.ts` / `client-activity.ts`, `team-today.ts` / `team-actions.ts`, `automations.ts` / `automation-actions.ts` / `upcoming.ts`, `map-live.ts`, `process-map.ts`, `settings.ts`, `work-types.ts`, `flow-actions.ts`.
- **`app/(dashboard)/dashboard/operaciones/`** — una carpeta por pestaña (`bandeja`, `equipo`, `equipo-hoy`, `clientes`, `encargos`, `nuevo`, `automatizaciones`, `telegram`, `ajustes`) más `bloc-notas.tsx` y `operaciones-tabs.tsx`.
- **`lib/ai/`** — pasarela (`gateway.ts`, adaptadores), clustering (`clustering/pipeline.ts`), cifrado, precios.
- **`lib/seo/`**, **`modules/seo/manifest.json`** — módulo SEO.
- **`lib/architecture-map/registry.ts`** y **`app/(dashboard)/dashboard/architecture/`** — Mapa Visual.
- **`lib/db/`** — `schema.ts`, `migrations/`, semillas.
- **`scripts/`** — `check-architecture-map.js` y scripts SQL de prompts y semillas.
- **`instrumentation.ts`** — arranque de los procesos de fondo.
- **`docs/`** — este documento, `INFORME-ESTADO.md` y `sessions/`.

## 20. Comprobaciones tras cada despliegue

1. `docker compose up --build -d` y, si hay migración, backup + `docker exec kijutech_app pnpm db:migrate`.
2. Iniciar sesión con el usuario de pruebas en `http://ops-test.localhost:3000` y recorrer **Bloc de notas, Equipo hoy y Encargos** (y la pestaña tocada): cargan sin errores y el autoguardado confirma.
3. `docker logs kijutech_app` sin `ReferenceError`.
4. `node scripts/check-architecture-map.js` pasa.
5. Si se tocó Telegram: comprobar la pestaña Telegram (sin conflicto 409) y enviar una prueba desde Automatizaciones.
6. Documento de sesión, commit y push a `operaciones` (con autorización).

## 21. Glosario

- **Encargo:** unidad de trabajo del módulo (fila de `ops_requests`) vinculada a una tarea de ClickUp.
- **Encargo espejo:** encargo creado a partir de una tarea que nació o se asignó directamente en ClickUp (`origin = clickup`).
- **Marca `[kiju:ID]`:** texto en la descripción de las tareas creadas por la herramienta; evita duplicados y permite reconocer las propias.
- **Bandeja de salida (outbox):** cola con reintentos de los cambios hacia ClickUp.
- **Cortafuegos de avisos:** solo lo urgente (prioridad 1) llega al instante al dueño; lo demás va en los resúmenes y en Mi bandeja.
- **Modo pruebas:** todo aviso llega solo al dueño, con la cabecera «iba dirigido a…».
- **Líder:** el único proceso que escucha el bot y ejecuta el planificador (candado de PostgreSQL).
- **Revisor intercambiable:** punto de extensión (`reviewers.ts`) donde hoy revisa el dueño y mañana podrán revisar agentes de IA.
- **Jornada laboral:** horario de la ficha de Equipo (zona, entrada, horas por día y días); base de los recordatorios y del silencio.
- **Pasada de actividad:** cálculo diario (03:00 Madrid) de la actividad de cada cliente.
