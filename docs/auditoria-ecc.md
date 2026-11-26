# Auditoría de ECC (Everything Claude Code) para kijutech-tool

**Fecha:** 26 nov 2026. **Estado:** propuesta. No se ha aplicado nada: este documento espera la aprobación de Enric.
**ECC revisado:** `https://github.com/affaan-m/ECC`, commit `4adeee67` (19 nov 2026, v2.2.3). Se clonó con `--depth 1` en `/tmp/ecc-review` (en esta máquina es `C:\Users\seobu\AppData\Local\Temp\ecc-review`), fuera del proyecto. No se ejecutó ningún script de ECC: ni `install.sh`, ni npm, ni sus hooks. No se tocaron el proyecto, `~/.claude` ni ningún `settings.json`.
**Método:** tres revisiones de solo lectura en paralelo:
- hooks y seguridad de ECC;
- contexto, calidad, agentes y memoria de ECC;
- inventario de nuestra capa de producción.

Las afirmaciones clave las comprobé después con `grep` sobre el código. Las rutas de ECC son relativas a su repo; las nuestras, al nuestro.

---

## 1. Resumen ejecutivo

1. **Veredicto: cherry-pick mínimo.** Sobre todo ideas, casi nada de código. Instalar ECC completo queda descartado.
   - Añadiría más de 40 000 tokens fijos: 328 skills (unos 28 000), 72 agentes (unos 4 400) y reglas cargadas enteras.
   - Lanzaría entre 6 y 8 procesos `node` en cada llamada a herramienta.
   - Ejecutaría `npx tsc` y prettier en Windows al final de cada respuesta (`scripts/hooks/stop-format-typecheck.js:147-166`), lo que choca con nuestra regla de Docker.
2. **Desarrollo, lo que vale la pena:**
   - el criterio de revisión de `agents/code-reviewer.md:29-74`, adaptado como agente revisor propio que se pase antes de desplegar (hoy no hay ninguna revisión de código);
   - la lista de reglas `deny` de `the-security-guide.md:172-196`, adaptada a nuestros permisos nativos;
   - un test contra Unicode oculto en las instrucciones (`the-security-guide.md:206-224`).
3. **El resto de ECC para desarrollo ya lo hace Claude Code de serie o nuestro `deploy.sh`:** plan mode, `/context`, `/compact`, `/cost`, memoria automática, permisos, pruebas y mapa.
4. **Producción:** ECC no es su motor, pero aporta tres ideas útiles:
   - auditar nuestros agentes con la checklist de `skills/agent-architecture-audit`;
   - atar la aprobación al contenido exacto (`skills/social-publisher:89`) para cuando haya escritura en WordPress o Ads;
   - la «trifecta letal» de `the-security-guide.md:23-39`.
5. **Hay riesgos reales nuestros, con ECC o sin él, que pesan más que cualquier pieza de ECC:**
   - el gasto de IA no tiene un tope que corte;
   - la marca de «entrada no fiable» no cubre las herramientas propias;
   - no hay revisión de código ni pruebas adversarias de inyección.

   Ver el Top 5 (§5).
6. **Coste de contexto del plan propuesto:** unos 80 tokens fijos, menos del 0,5 % de nuestro arranque. Muy por debajo del límite del 20 %.

---

## 2. Fase 1: inventario de lo nuestro

### 2.1 Capa de desarrollo (Claude Code)

| Pieza | Qué hay |
|---|---|
| `CLAUDE.md` del proyecto | 24 820 caracteres y 289 líneas, unos **7 000 tokens**. Recoge las reglas de Docker, de autonomía y aprobaciones, despliegue, documento de sesión, UX, IA, Mapa Visual, ESTADO, ramas, ClickUp, usuario de pruebas, Telegram, seguridad y la regla de cuestionarse tres veces. |
| `~/.claude/CLAUDE.md` (usuario) | No existe. |
| Memoria automática | `~/.claude/projects/C--dev-kijutech-tool/memory/`: 33 ficheros. El índice `MEMORY.md` ocupa 5 913 caracteres (unos 1 800 tokens) y se carga en cada sesión. |
| `.claude/` del proyecto | Solo `settings.json`, `settings.local.json` y un `.lock`. **No hay agentes, comandos, skills, reglas ni hooks propios.** |
| `.claude/settings.json` (versionado) | 27 reglas **`ask`**:<br>- editar el esquema, las migraciones, `lib/auth`, `app/(login)`, docker-compose, Dockerfile y `.env`;<br>- `pnpm`, `npm`, `npx` y `corepack`;<br>- `docker run`, `docker compose down` y `docker volume`;<br>- `rm`, `git rm`, `git clean`, `git reset --hard` y los push forzados;<br>- `deploy.sh --migrate`, `db:migrate` y `db:generate`;<br>- `DROP TABLE`, `DROP COLUMN`, `TRUNCATE` y `DELETE FROM`.<br>**No hay ninguna regla `deny` ni hooks.** |
| `.claude/settings.local.json` (sin versionar) | 16 reglas `allow`: git add y commit, docker compose up, `docker exec kijutech_app`, merge, `push origin main`, `deploy.sh`, `rollback.sh`, `server-status.sh` y algunos `docker cp` antiguos. Una regla `ask`: `deploy.sh --migrate`. |
| `~/.claude/settings.json` (usuario) | Modelo opus, actualizaciones en el canal latest y `autoMode.allow`, con el protocolo de despliegue aprobado el 19 nov. Sin hooks. |
| Modo de permisos | Auto mode, con el clasificador nativo y las reglas de arriba. |
| MCP | **Ninguno local:** `~/.claude.json` no tiene `mcpServers` ni globales ni del proyecto, y no hay `.mcp.json`.<br>Disponibles por la cuenta de claude.ai: Claude Docs, Gmail, Drive, Docs, Sheets, Slides, Calendar, Meetings y otros (diferidos, cargan solo el nombre); Claude in Chrome (extensión); y el plugin de GitHub (hoy falla al conectar).<br>**ClickUp, Telegram, Search Console, GA4 y DataForSEO no son MCP:** son integraciones del propio código de la plataforma. |
| Plugins y skills de usuario | El marketplace oficial `claude-plugins-official` y skills sincronizadas de la cuenta, gestionadas por Anthropic. |
| Versión de Claude Code | 2.1.331. Por encima de la 2.0.65, la mínima que pide `the-security-guide.md:41-63` por los fallos CVE-2025-59536 y CVE-2026-21852. |

**Coste de contexto inicial (estimación; falta el `/context` real, que solo puede lanzar Enric):**

| Bloque | Tokens aproximados |
|---|---|
| Sistema y herramientas integradas | 12 000-15 000 |
| `CLAUDE.md` | 7 000 |
| `MEMORY.md` | 1 800 |
| Lista de skills (unas 30 descripciones) | 3 000 |
| Instrucciones de los servidores MCP y nombres de las herramientas diferidas | 2 000-3 000 |
| **Total** | **unos 26 000-30 000** |

El 20 % de margen son **unos 5 500 tokens como máximo**.

### 2.2 Capa de producción (la plataforma)

- **Orquestación:** hay dos caminos.
  - **La pasarela `callAI`** (`lib/ai/gateway.ts:289`): Anthropic, OpenAI, Gemini y DeepSeek, con proveedor de reserva (375-392) y tiempo máximo con cancelación. La usan correo, bloqueos, notas, Estrategia, núcleo y SEO.
  - **El motor de agentes** (`lib/agentes/engine.ts`): usa el SDK de Anthropic directamente.
    - Hace hasta 8 vueltas de herramientas (14 en subagentes, con tope 20, línea 115).
    - Usa `web_fetch` y `web_search`.
    - Solo ejecuta las herramientas de `agent.tools` (209).
    - Agentes (`lib/agentes/store.ts:83-173`):
      - `operations_manager`: Opus 5.5, **sin presupuesto**;
      - `revisor_web`, `mantenimiento` y `jefe_sistema`: 10 $ al mes cada uno;
      - `jefe_operaciones`: 30 $ al mes, apagado.
- **Credenciales:**
  - Todas las claves de proveedores (IA, ClickUp, Telegram, DataForSEO, Google OAuth, Resend, DigitalOcean) van cifradas con AES-256-GCM y una única clave maestra, `AI_ENCRYPTION_KEY` (`lib/ai/encryption.ts`). Se rotan con `scripts/rotate-encryption-key.js`.
  - Se enmascaran con `maskSecret` (`lib/auth/mask.ts`).
  - Los errores y el código que lee el Técnico se limpian con `scrub()` (`lib/core/error-rules.ts:37-48`).
  - `safeCodePath` impide que el Técnico lea `.env` y las claves.
  - **Hueco:** el HMAC del estado de Google OAuth usa `process.env.AUTH_SECRET || 'dev'` (`lib/agentes/integrations.ts:243,251`, comprobado). Si faltara la variable, no fallaría de forma segura.
  - **Hueco:** se pide el permiso `business.manage` (`integrations.ts:233`), que permite escribir en Business Profile, aunque las herramientas solo lean.
- **Entradas externas y prompt injection:**
  - **Telegram:**
    - el webhook exige su secreto, comparado en tiempo constante (`app/api/telegram/webhook/route.ts`);
    - solo atiende chats vinculados con un código de un solo uso (`telegram-handler.ts:150-173`);
    - los botones de aprobación solo los pulsa el dueño (`agent-capabilities.ts:168`).
  - **Correo:**
    - firma HMAC que caduca a los 5 minutos, validación con zod y limpieza de caracteres invisibles (`inbound-email-rules.ts`);
    - el texto externo va dentro de `<datos_no_fiables>` y el destinatario lo fija el código;
    - **el `authStatus` del dueño lo declararía el Worker de Cloudflare, que aún no existe** (ESTADO §15).
  - **ClickUp:** se delimitan los bloqueos, la extracción de Estrategia, el estratega, las preguntas, el conocimiento y `preguntas.ts`.
  - **Webs que leen los agentes:**
    - `web_fetch`/`web_search` marcan el turno como `untrustedInput` (`engine.ts:172`);
    - con esa marca, `proposeOrRun` baja «autónomo» a «con aprobación» (`agent-capabilities.ts:111`) y `escribir_al_cliente` obliga a aprobar (`lib/core/platform.ts:50`).
  - **Huecos (comprobados):**
    - la marca `untrustedInput` **solo** salta con las herramientas web de Anthropic. No la activan las propias que devuelven texto ajeno: ficha, encargos, casos, conocimiento o errores;
    - el título, la meta y el H1 rastreados de la competencia entran **sin delimitar** en `lib/seo/competitor-analysis-prompt.ts` (líneas 22-24 de su `formatCompetitor`);
    - los mensajes del equipo al jefe de operaciones tampoco van delimitados (`team.ts:362-364`). Lo mitiga que ese agente solo tiene herramientas de lectura;
    - no hay un delimitador común: cada módulo usa el suyo.
  - **Argumentos de las herramientas:** JSON Schema con `additionalProperties:false` y recorte a mano (`register.ts:35-39`), sin zod.
- **Registro y auditoría:**
  - `ai_jobs` guarda los mensajes completos 90 días;
  - `sys_error_*` es el registro de errores;
  - `ops_request_events` guarda los eventos con `logEvent`;
  - `ops_agent_actions` guarda propuesta, autonomía y decisión;
  - `agt_messages` guarda las conversaciones.
  - **No hay registro inmutable:** la retención borra.
- **Límites de coste:**
  - presupuesto mensual por agente, comprobado *antes* de cada ejecución (`engine.ts:118`);
  - tope propio en Estrategia;
  - el Vigía de IA (`lib/operaciones/ai-watch.ts`) **solo avisa** por Telegram (448-465).
  - **`callAI` no comprueba ningún presupuesto** (comprobado: no hay `budget` ni `cap` en `gateway.ts`). El agente principal tampoco tiene tope.
- **Aprobación humana:**
  - Las herramientas de cambio aprueban por defecto (`proposeOrRun`), **pero se pueden poner en «autónomo»**.
  - Correo a clientes:
    - `email_reply` nunca es autónomo;
    - `escribir_al_cliente` pide aprobación por defecto, **pero admite «nunca» por cuenta o cliente** (`comms-rules.ts:43`).
  - Las escrituras en ClickUp solo salen por la bandeja de salida, y lo vigila una prueba.
  - Ningún agente puede borrar.
  - **WordPress y Google Ads: no hay integración**, ni de lectura ni de escritura.
- **Pruebas, CI y revisión:**
  - 53 ficheros de pruebas y unas 690 pruebas, entre ellas:
    - seguridad y permisos;
    - auditoría estática de los guards;
    - barreras de arquitectura;
    - examen de prompts (solo `ops_note_to_requests` tiene batería);
    - pruebas simuladas en producción y apertura de todas las pantallas por rol.
  - `scripts/deploy.sh` hace de CI local:
    - exige estar en main, sin cambios sin commit y con `origin` al día;
    - pasa el mapa y las pruebas sobre el commit exacto;
    - bloquea si hay migraciones pendientes sin `--migrate`;
    - hace un backup validado;
    - verifica y vuelve atrás solo si algo falla.
  - **No hay CI en GitHub, ni lint ni `tsc` aparte, ni revisión de código, ni pruebas adversarias de inyección** (solo `seguridad.test.ts:724`). Claude fusiona y despliega solo.

---

## 3. Fase 2: lo que contiene ECC (resumen con evidencias)

- **Tamaño:** 72 agentes, 328 skills, 99 comandos, 122 reglas en 22 carpetas de lenguaje y 4 980 ficheros (109 MB).
- **Coste de contexto:**
  - las descripciones de las skills, unos 28 000 tokens;
  - las de los agentes, unos 4 400;
  - las reglas se cargan enteras: solo `rules/common`, unos 5 000; todas juntas, unos 70 000.
- **Hooks** (`hooks/hooks.json`): **28 entradas**, y cada una lanza un `node -e` propio (línea 9). Solo se agrupan Bash (`pre-bash-dispatcher.js`, 6 comprobaciones) y PostToolUse (unos 13 sub-hooks en 2 procesos).
  - **Latencia estimada, sin medir:**
    - Bash, unos 4 `node` antes y 2 después;
    - Edit, unos 6 antes y 2 después;
    - más bash y python de `observe` en cada herramienta.
  - **Red saliente:** solo `mcp-health-check` (hace una petición HTTP real al servidor MCP **enviando sus cabeceras con los tokens**, línea 603, o arranca su binario, 454-461) y `plan-canvas-pending` (solo a 127.0.0.1).
  - **Escrituras en disco:** `~/.claude/metrics/`, `~/.claude/state/`, `~/.claude/session-data/`, `~/.gateguard/`, `~/.claude/mcp-health-cache.json` y `~/.local/share/ecc-homunculus/`.
  - **Perfiles** (`scripts/lib/hook-flags.js:65-140`): `ECC_HOOKS_ENABLED`, `ECC_HOOK_PROFILE` (minimal, standard o strict) y `ECC_DISABLED_HOOKS`.
- **Los cinco hooks pedidos:**

| Hook | Qué hace | ¿Bloquea? | ¿Red? | ¿Se puede copiar suelto? |
|---|---|---|---|---|
| `config-protection.js` (269 líneas) | Impide editar configuraciones de linter y formateador ya existentes (l.23-130). Excluye a propósito `.env`, el esquema y Docker (l.110-117). No ve `sed -i`. | Sí (exit 2) | No | Sí, pero protege cosas que no tenemos |
| `block-no-verify.js` (1 516 líneas, más `lib/shell-scan` de 548) | Impide `--no-verify`, `core.hooksPath` y `GIT_CONFIG_*` (l.214-338). Solo en Bash. | Sí | No | Sí |
| `governance-capture.js` (374 líneas) | Apagado por defecto (l.295). Solo escribe en stderr (l.162-164), aunque diga que guarda en una tabla. | No | No | No (arrastra unas 2 200 líneas y GateGuard) |
| `mcp-health-check.js` (901 líneas) | Antes de cada herramienta MCP, prueba el servidor por red o arrancándolo; si está caído, bloquea (l.757-760). | Sí | **Sí** | No recomendable |
| `gateguard-fact-force.js` (2 848 líneas, unas 10 000 con sus dependencias) | Deniega la primera edición de cada fichero hasta que el modelo responda unas preguntas (l.2279). | Sí (deny) | No | No |

- **Eficiencia:**
  - `skills/context-budget` remite al `/context` nativo (l.19-37, 78-82).
  - `suggest-compact.js` cuenta llamadas y avisa a partir de 50; no hace red.
  - `cost-tracker.js` guarda el coste de cada sesión en `~/.claude/metrics/costs.jsonl`, con una tabla de precios fija que se queda desfasada (l.33, 77-103).
  - **Ninguna gana a lo que trae Claude Code.**
- **Calidad:**
  - `code-reviewer.md` es la mejor pieza (l.29-74):
    - umbral de confianza del 80 %;
    - cuatro preguntas antes de cada hallazgo;
    - prueba exigida en los graves;
    - «cero hallazgos es válido».
  - `security-reviewer`, `planner` y `architect` son genéricos o van atados a Stripe, Supabase y Vercel.
  - `tdd-workflow` ocupa unos 5 800 tokens.
  - `verification-loop` lo hace mejor nuestro `deploy.sh`, que además lo impone.
- **Agentes:**
  - `agent-architecture-audit` describe 12 capas y sus patrones de fallo (l.36-106):
    - herramienta exigida en el prompt pero no en el código;
    - memoria contaminada;
    - bucles de reparación ocultos;
    - corrupción en el transporte a Telegram.
  - `cost-aware-llm-pipeline`: enrutar por complejidad y reintentar solo errores transitorios (l.80-104). Es básico frente al Vigía.
  - Marketing (`content-engine`, `brand-voice`, `seo`, `social-publisher`): genérico y pensado para X/LinkedIn. Se salvan dos ideas:
    - `brand-voice`, un perfil de estilo sacado de textos reales;
    - `social-publisher:89`, la aprobación atada al contenido exacto y renovada si cambia.
- **Memoria (`continuous-learning-v2`):**
  - Su hook `observe.sh` (977 líneas) guarda la entrada y la salida de **cada** herramienta (hasta 5 000 caracteres cada una) en `~/.local/share/ecc-homunculus/<proyecto>/observations.jsonl`.
  - Filtra los secretos con expresiones regulares (l.531-572). Un token sin formato conocido, como el de ClickUp, podría escaparse (es una inferencia, no lo probé).
  - Archiva al llegar a 10 MB y purga a los 30 días.
  - Su observador opcional envía las observaciones a Anthropic con `claude --model haiku`.
  - **No compensa:** añade latencia en cada herramienta, deja datos sensibles en disco y duplica la memoria automática.
- **Riesgos del propio repo:**
  - `package.json` no tiene postinstall.
  - **El instalador escribe en `~/.claude/settings.json`** (`scripts/lib/install/claude-settings.js:297-449`).
  - En `mcp-configs/` hay unos 38 MCP con `npx -y` sin versión fija.
  - No encontré secretos reales ni telemetría remota en los hooks.
- **Nota sobre los informes:** el filtro del arnés marcó en uno de ellos texto con forma de instrucción. Eran citas de `SECURITY.md`, que habla de los `system-reminder` sospechosos y de auditar `settings.json`. Se trataron como datos y no se siguió nada.

---

## 4. Fase 3: matriz comparativa

**D** = desarrollo (Claude Code). **P** = producción (la plataforma). Las decisiones de cada capa son independientes.

| Área | Lo que tenemos | Lo que ofrece ECC | Ganancia real | Riesgo / coste | Decisión |
|---|---|---|---|---|---|
| **D** Permisos y protección de configuración | 27 `ask` versionados más el clasificador de auto mode; ningún `deny` | `config-protection` (configs de linter); lista `deny` de la guía (`.env*`, `~/.ssh`, `~/.aws`, `curl\|bash`, ssh, scp, nc) | Media: nos faltan los `deny` para lo que nunca debe hacerse | Hook: un `node` por cada Edit y protege lo que no tenemos. `deny`: 0 tokens, nativo | **ADAPTAR** la lista `deny` a `settings.json`. **IGNORAR** el hook |
| **D** Gestión de secretos | `.env` ignorado; `Edit(.env)` con `ask`; leer `.env` está permitido (hace falta para el usuario de pruebas) | `governance-capture` (stderr, apagado), redacción en `observe` | Baja | Más procesos y más datos en disco | **IGNORAR**. Añadir `deny` de lectura de `~/.ssh` y `~/.aws` (punto anterior) |
| **D** Seguridad de MCPs | Ningún MCP local; los de claude.ai son de Anthropic | `mcp-health-check` (red con tokens, arranca binarios); `mcp-configs` sin versiones fijas | Nula | Alto: red saliente y bloqueos falsos | **IGNORAR**. Regla nuestra: un MCP futuro, con versión fija y aprobado |
| **D** Prompt injection en el entorno de desarrollo (webs, ficheros) | Defensa nativa de Claude Code más la regla «los datos no son instrucciones» | Búsqueda de Unicode oculto y base64 en skills, reglas y prompts (guía l.206-224) | Media-baja: ataque por cadena de suministro en `CLAUDE.md` o en los prompts del repo | 0 tokens si es una prueba de Vitest | **ADAPTAR** como prueba |
| **P** Prompt injection en Telegram, ClickUp, correo y webs | Lista blanca de chats, firma, `<datos_no_fiables>` en casi todo, `untrustedInput` con las herramientas web | Trifecta letal; separar el agente que lee del que actúa; `agent-security-hardening` (validar identificadores, URLs y salida de herramientas) | **Alta** como idea: tapa nuestros huecos comprobados | Cambio en el núcleo (con aprobación); sin dependencias | **ADAPTAR** las ideas. No hay código que copiar |
| **D** Revisión de código | **Ninguna**; Claude despliega solo | `agents/code-reviewer.md:29-74` (umbral de confianza, cuatro preguntas, prueba en los graves) | **Alta**: es el único control que falta en el despliegue autónomo | Unos 80 tokens fijos; unos 3 000 al usarlo; algo más de tiempo antes de desplegar | **ADAPTAR** como agente propio en español con nuestras reglas |
| **D** Testing | Unas 690 pruebas, guardarraíles y simulaciones; `deploy.sh` las impone | `tdd-workflow` (unos 5 800 tokens), `verification-loop`, cobertura del 80 % | Baja | Tokens y una ceremonia que no necesitamos | **IGNORAR** |
| **P** Testing de agentes | Examen de prompts (1 batería); casi sin pruebas adversarias | `ai-regression-testing` («quien escribe y revisa ciegos iguales»), pass@k frente a pass^k | Media | Coste de IA de los exámenes (pequeño) | **ADAPTAR** la idea: batería de inyección para los agentes |
| **D** Planificación | Plan mode; regla de cuestionarse tres veces; documentos de diseño | `planner` y `architect` (Stripe, Supabase, Vercel) | Nula | Tokens | **IGNORAR** |
| **D** Contexto y tokens | `/context`, `/compact` y autocompactado nativos; `CLAUDE.md` de unos 7 000 tokens | `context-budget`, `suggest-compact`; modos con `--append-system-prompt-file` (longform l.55-78) | Baja (hooks); media (adelgazar `CLAUDE.md`) | Los hooks añaden procesos | **IGNORAR** los hooks. **Opcional:** sacar de `CLAUDE.md` lo que se usa poco (ahorraría unos 2 000-3 000 tokens por sesión) |
| **D** Memoria entre sesiones | Memoria automática nativa (`MEMORY.md` más ficheros), documentos de sesión y `ESTADO.md` | `continuous-learning-v2` (guarda todas las entradas y salidas) | Nula | Latencia en cada herramienta, datos sensibles en disco, bash | **IGNORAR** |
| **D** Orquestación de subagentes | Herramienta Agent nativa, subagentes en paralelo y worktrees | `rules/common/agents.md`, 72 agentes | Nula | Unos 4 400 tokens | **IGNORAR** |
| **P** Orquestación de agentes | Motor propio, departamentos y jefes, subagentes por trabajos | `agent-architecture-audit` (12 capas, patrones de fallo) | **Media-alta** como checklist de auditoría | 0 tokens si es un documento | **ADAPTAR** como checklist en `docs/` y pasarla una vez |
| **D** Control de costes | `/cost` y uso de la cuenta | `cost-tracker` (histórico JSONL, precios fijos) | Baja | Un hook en Stop y precios que se desfasan | **IGNORAR** |
| **P** Control de costes | Presupuesto por agente antes de ejecutar; Vigía que solo avisa; **`callAI` sin tope; el principal sin presupuesto** | `cost-aware-llm-pipeline` (rastreador con `budget_limit`, reintentar solo errores transitorios) | **Alta** como idea | Toca la pasarela del núcleo (con aprobación) | **ADAPTAR** la idea: tope duro en la pasarela |
| **D** Registro y auditoría | Historial de la sesión de Claude Code más git | Hooks de registro de comandos y `governance` | Baja | Procesos | **IGNORAR** |
| **P** Registro y auditoría | `ai_jobs`, `ops_agent_actions`, `ops_request_events`, `sys_error_*` (la retención los borra) | Registro estructurado de herramienta, aprobación y red (guía l.283-312) | Media: aprobaciones y cambios de autonomía sin rastro duradero | Una tabla (migración) | **ADAPTAR** más adelante, con aprobación (ver §8, paso 6) |

---

## 5. Top 5 de mejoras de seguridad (con ECC o sin él, por impacto)

1. **Tope duro de gasto de IA que corte, no solo que avise (P).**
   - Hoy `callAI` no mira ningún presupuesto, el agente principal no tiene tope y el Vigía solo manda un aviso.
   - Un bucle, un error o una inyección que dispare llamadas no tiene freno hasta fin de mes.
   - Propuesta:
     - comprobar el gasto del mes y del día de la cuenta en la pasarela antes de cada llamada, y cortar al pasar el tope (con margen para lo crítico);
     - dar presupuesto también al agente principal;
     - comprobarlo dentro del bucle del motor, no solo al empezar.
2. **Una sola forma de tratar el texto ajeno (P).**
   - Una función común en el núcleo, `untrusted(texto, origen)`, que limpie los caracteres invisibles, recorte y delimite.
   - Que la marca `untrustedInput` salte también con las herramientas propias que devuelven texto de terceros (ficha, encargos, conocimiento, errores, competencia).
   - Delimitar el título, la meta y el H1 de la competencia (`competitor-analysis-prompt.ts`) y los mensajes del equipo (`team.ts`).
   - **Una batería de pruebas de inyección:** una página, un comentario de ClickUp y un correo con instrucciones, que no deben provocar ningún cambio sin aprobación.
3. **Revisión de código antes del despliegue autónomo (D).**
   - Hoy nadie revisa lo que Claude fusiona y despliega.
   - Propuesta: un agente revisor propio, adaptado de `code-reviewer.md`, con nuestras reglas (guards, exportaciones en `'use server'`, bandeja de salida de ClickUp, núcleo y módulos, prefijos de tabla, datos no fiables). Se pasaría sobre el diff de la rama antes de cada fusión.
   - Los hallazgos graves que no se resuelvan van al documento de sesión y a Enric.
4. **Candados en la autonomía y fallar de forma segura (P).**
   - Que «nunca aprobar» en los correos a clientes y «autónomo» en las herramientas de cambio:
     - exijan rol admin;
     - dejen un registro de quién y cuándo;
     - nunca se apliquen a un turno con entrada no fiable (eso último ya se cumple para «autónomo»).
   - Quitar el `|| 'dev'` del HMAC de Google OAuth (`integrations.ts:243,251`): sin `AUTH_SECRET`, debe fallar.
   - Antes de dar al agente cualquier escritura en WordPress o Ads, diseñar la aprobación atada al contenido exacto (patrón de `social-publisher:89`): se aprueba un contenido concreto, cambiarlo pide otra aprobación, y generar y ejecutar van en pasos separados.
5. **Reglas `deny` y vigilancia de la cadena de suministro en el entorno de desarrollo (D).**
   - Añadir a `.claude/settings.json`, como `deny`:
     - leer `~/.ssh`, `~/.aws` y `**/*.pem`;
     - `curl … | sh` y `wget … | sh`;
     - `ssh` y `scp` directos (nuestros scripts de despliegue los usan por dentro y no se ven afectados);
     - `nc`;
     - cambiar `ANTHROPIC_BASE_URL`.
   - Añadir una prueba que falle si `CLAUDE.md`, `.claude/`, `docs/` o los prompts de `scripts/*.sql` contienen Unicode invisible o bidi.
   - Regla escrita: ningún MCP ni plugin nuevo sin versión fija y aprobación.

*(Fuera del Top 5, ya conocido: los secretos de desarrollo siguen en el historial de Git, pero producción usa otros (ESTADO §13, riesgo 1). Una sola clave maestra sin KMS. Falta el Worker que autentica el correo del dueño (ESTADO §15). Y `ai_jobs` guarda los prompts completos 90 días: valorar si basta con 30.)*

---

## 6. Ficheros de ECC que se copian o adaptan

**No se copia ningún fichero tal cual.** Todo se reescribe en español, dentro de nuestro repo y versionado, sin depender del plugin.

| Origen en ECC | Destino nuestro | Cambios | Tokens fijos |
|---|---|---|---|
| `agents/code-reviewer.md` l.29-74 (criterio) y l.312-330 (código generado por IA) | `.claude/agents/revisor-codigo.md` | Español. Quitar las checklists genéricas y la «Prompt Defense Baseline». Añadir nuestras reglas: guards de `lib/auth/permissions.ts`, nada interno exportado desde `'use server'`, ClickUp por su cliente y su bandeja de salida, núcleo y módulos, prefijos de tabla, datos no fiables delimitados, sin `pnpm` en el host. Solo lectura (herramientas Read, Grep y Glob, más git diff por Bash). Modelo Sonnet. Devuelve hallazgos con fichero:línea y «cero hallazgos es válido». | unos 80 (descripción) |
| `the-security-guide.md` l.172-196 (lista `deny`) | `.claude/settings.json` → `permissions.deny` | Solo las reglas aplicables (ver Top 5, punto 5). Comprobar que no rompen `deploy.sh`, `server-status.sh` ni la lectura de `.env` para el usuario de pruebas. | 0 |
| `the-security-guide.md` l.206-224 (Unicode oculto) | `tests/cadena-suministro.test.ts` | Código propio (unas 40 líneas): recorrer `CLAUDE.md`, `.claude/**`, `docs/**/*.md` y `scripts/*.sql`, y fallar si hay U+200B-U+200F, U+202A-U+202E, U+2066-U+2069 o U+FEFF. | 0 |
| `skills/agent-architecture-audit/SKILL.md` l.36-147 (capas, patrones y greps) | `docs/CHECKLIST-AUDITORIA-AGENTES.md` | Español y resumido. Aplicado a nuestro motor (`engine.ts`), al bot, al correo y a los jefes. Es un documento, no una skill. | 0 |
| `skills/social-publisher/SKILL.md:89` (aprobación por contenido exacto) | Un párrafo en `docs/ESTADO.md` §13 (principio de diseño) | Para cuando lleguen las escrituras en WordPress y Ads. | 0 |
| `skills/cost-aware-llm-pipeline/SKILL.md` l.80-104 (qué errores se reintentan) | Ninguno; solo una comprobación en `lib/ai/gateway.ts` (`shouldFallback`) | Confirmar que no se reintentan los 400, 401 y 403. Es una verificación, no una copia. | 0 |

**Total fijo añadido: unos 80 tokens.** Es menos del 0,5 % del arranque y queda muy lejos de los 1 500 por pieza y del 20 % total.

---

## 7. Lo que se descarta y por qué

- **Instalar ECC completo** o como plugin:
  - más de 40 000 tokens fijos;
  - 28 hooks y entre 6 y 8 procesos `node` por herramienta;
  - el instalador escribe en `~/.claude/settings.json`;
  - las actualizaciones cambiarían el comportamiento sin avisar;
  - ejecuta `npx tsc` en Windows.
- **`gateguard-fact-force`:** unas 10 000 líneas que deniegan la primera edición de cada fichero. Frena mucho y aporta poco frente a nuestras pruebas y al revisor.
- **`mcp-health-check`:** hace red saliente con los tokens de los MCP y arranca binarios. No tenemos MCP locales.
- **`config-protection`:** protege configuraciones de linter que no usamos. Lo nuestro ya está en `ask`.
- **`block-no-verify`:** no tenemos hooks de git (ni `.husky` ni `.git/hooks` activos), y el propio Claude Code ya prohíbe `--no-verify`. Si algún día hay hooks de git, se reconsidera.
- **`governance-capture`:** solo escribe en stderr y está apagado por defecto.
- **`context-budget`, `suggest-compact` y `cost-tracker`:** lo cubren `/context`, el autocompactado y `/cost`.
- **`continuous-learning-v2` y `observe`:** duplican la memoria automática, añaden latencia en cada herramienta y dejan entradas y salidas en disco.
- **`planner`, `architect`, `security-reviewer`, `tdd-workflow` y `verification-loop`:**
  - son genéricos o van atados a otro stack;
  - plan mode, `/security-review`, nuestra regla de cuestionarse tres veces y `deploy.sh` los cubren mejor.
- **`rules/` (122 ficheros):** son genéricos y se cargan enteros. Nuestro `CLAUDE.md` ya es específico.
- **`autonomous-agent-harness` y `continuous-agent-loop`:** sirven para convertir Claude Code en un agente, y nuestros agentes son la plataforma.
- **`mcp-configs/`:** unos 38 MCP con `npx -y` sin versión fija. No los necesitamos.
- **Skills de marketing:** genéricas y para redes sociales, por debajo de nuestro módulo SEO. Si un día hacemos textos de marca, la idea de `brand-voice` (un perfil de estilo sacado de textos reales) se diseña dentro de la plataforma, no como skill de Claude Code.

---

## 8. Plan de implantación (cada paso reversible y verificable)

Todo va en la rama **`chore/ecc-adopcion`**, con un commit por paso, y **solo con la aprobación de Enric**. Los pasos 1 a 4 son del entorno de desarrollo. Los pasos 5 y 6 son de producción, tocan el núcleo y llevan su propia aprobación y su propio diseño.

| # | Paso | Capa | Cómo se deshace | Cómo se verifica |
|---|---|---|---|---|
| 1 | Reglas `deny` en `.claude/settings.json` | D | Revertir el commit | Pedir a Claude leer `~/.ssh/known_hosts` → lo deniega. `bash scripts/server-status.sh` sigue funcionando. Leer `.env` para el usuario de pruebas sigue funcionando. |
| 2 | `tests/cadena-suministro.test.ts` | D | Borrar el fichero (con aprobación) o revertir | Pasa en limpio. Al meter a propósito un U+200B en un fichero temporal, falla. |
| 3 | Agente `.claude/agents/revisor-codigo.md` y una línea en `CLAUDE.md` («antes de fusionar, pasar el revisor sobre el diff de la rama») | D | Borrar el fichero y la línea | Pasarlo sobre una rama con un fallo sembrado (una acción sin guard): debe encontrarlo. Sobre una rama limpia debe devolver «sin hallazgos». `/context` muestra unos 80 tokens más. |
| 4 | `docs/CHECKLIST-AUDITORIA-AGENTES.md` y pasarla una vez sobre `lib/agentes/` | P (solo análisis) | Es documentación | Sale una lista de hallazgos con fichero:línea, que se trae a Enric. |
| 5 | **Tope duro de gasto** en `callAI` y en el motor; presupuesto del agente principal | P, toca el núcleo | Ajuste de la automatización a «solo avisar» (el comportamiento de hoy), además de revertir el commit | Pruebas: con el tope superado, `callAI` devuelve un error claro y no llama al proveedor. Lo crítico, con su margen, sigue funcionando. Aviso por Telegram. |
| 6 | **Texto ajeno común** (`untrusted()`), marca ampliada, competencia y equipo delimitados, batería de inyección; candados de autonomía y fin del `'dev'` | P, toca el núcleo | Revertir el commit (sin migración; el registro duradero de cambios de autonomía, si se quiere, irá aparte con migración) | Pruebas nuevas: una página, un comentario y un correo con instrucciones no producen ningún cambio sin aprobación. Sin `AUTH_SECRET`, el OAuth falla. Pasar a «autónomo» exige admin. |

Cada paso cierra como siempre: pruebas, Mapa Visual (si toca un proceso), `ESTADO.md` y documento de sesión. Los pasos 1 a 4 no necesitan desplegar, salvo la prueba del paso 2, que va con el siguiente despliegue normal. Los pasos 5 y 6 se despliegan con el protocolo habitual.

**Pendiente de Enric para cerrar la fase 4 con datos reales:** lanzar `/context` en una sesión nueva y pegar el resultado. La cifra de §2.1 es una estimación.
