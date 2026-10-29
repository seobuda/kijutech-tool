# Informe de estado real — kijutech-tool

**Fecha:** 2026-10-29 · **Rama:** main (último commit `2d8dcca0`)
**Método:** lectura de código, consulta de solo lectura a la base de datos, `tsc` y peticiones HTTP a la app en marcha. No se modificó código ni datos.

> **Limitación importante:** no pude entrar en las pantallas protegidas. El navegador no tenía sesión y no introduzco contraseñas. Lo que digo de cada pantalla sale del código y de los datos de la base, no de haberla abierto. Las pantallas marcadas «sin comprobar en navegador» conviene revisarlas a mano.

---

## 1. Stack y versiones reales

| Pieza | Versión real |
|---|---|
| Next.js | `15.6.0-canary.59` (versión canary, no estable) |
| React / React DOM | 19.1.0 |
| Node (contenedor) | 24.19.0 (imagen `node:24-alpine`) |
| PostgreSQL | 16.15, imagen `pgvector/pgvector:pg16`, extensión `vector` 0.8.6 |
| Drizzle ORM / drizzle-kit | 0.43.1 / 0.31.x |
| Tailwind | 4.1.7 |
| TypeScript | 5.8.x |
| Auth | `jose` (JWT) + `bcryptjs`, cookie httpOnly |
| Otras | `@xyflow/react` (Mapa Visual), `hdbscan-ts` (clustering), `zod`, `swr`, `stripe`, `radix-ui`, `lucide-react` |
| Gestor | pnpm, dentro de Docker |

- El contenedor corre en modo producción (`pnpm build` + `pnpm start`), sin recarga en caliente.
- Dos contenedores en marcha: `kijutech_app` y `kijutech_db` (sano).
- El proyecto no tiene paquetes de pruebas (ni vitest ni jest).

## 2. Mapa de la aplicación

Comprobado por HTTP sin sesión: `/`, `/sign-in`, `/sign-up`, `/pricing` y `/share/...` responden 200. `/dashboard/*` redirige a `/sign-in`.

### Públicas
| Ruta | Qué hace | Estado |
|---|---|---|
| `/` | Portada | Funciona, pero es la **portada original de la plantilla** («Build Your SaaS Faster Than Ever») |
| `/sign-in`, `/sign-up` | Login y registro | Funcionan, en inglés. Ver riesgo de seguridad en el apartado 6 |
| `/pricing` | Precios de Stripe | Sin uso. Los registros muestran error de Stripe: «Invalid API Key» (clave no válida) |
| `/share/[token]/keyword-research` | Vista pública de clusters para el cliente | Funciona por código (token no existente da 200 con página 404) |

### Panel (requiere sesión)
| Ruta | Qué hace | Estado (sin comprobar en navegador) |
|---|---|---|
| `/dashboard` | «Team» de la plantilla | Resto de plantilla, sin uso real |
| `/dashboard/projects` (+ `new`, `[id]/edit`, `archived`) | Lista, alta, edición, archivo y borrado definitivo de proyectos | Completo por código. 1 proyecto existente |
| `/dashboard/projects/[id]/seo` | Asistente SEO (portada) | Completo |
| `…/seo/onboarding` | Checklist de onboarding | Completo (4 elementos guardados) |
| `…/seo/kickoff` | Cuestionario de kickoff | Completo (7 respuestas guardadas) |
| `…/seo/audit` | Radiografía inicial | Hay formulario; **0 hallazgos guardados** |
| `…/seo/keyword-research` + `keywords`, `competitors`, `clustering`, `clusters` | Keyword Research en 4 pasos | Completo, con datos reales |
| `…/clusters/[id]/competitors` y `/content-plan` | Competidores SERP + plan de contenido pilar-satélite | Funciona (con datos: 1 competidor, 2 planes) |
| `/dashboard/ai/settings`, `/brain`, `/my-keys` | Configuración de IA, Panel del Cerebro, claves propias | Completo |
| `/dashboard/ai/settings/prompts/[key]` | Edición de prompts | Completo (2 prompts) |
| `/dashboard/seo/admin/cards` y `/settings` | Tarjetas de conocimiento y ajustes SEO | Completo (48 tarjetas) |
| `/dashboard/architecture` | Mapa Visual del Sistema (solo super_admin) | Completo |
| `/dashboard/general`, `/activity`, `/security` | Cuenta, actividad y seguridad | Heredadas de la plantilla, en inglés |

### API
`/api/projects/.../progress`, `/kw-progress`, `/competitors` comprueban usuario y cuenta. `/api/user`, `/api/team`, `/api/user/roles` devuelven datos del usuario en sesión. `/api/stripe/*` sin uso.

## 3. Base de datos (34 tablas, datos reales contados)

**Núcleo / plantilla**
| Tabla | Para qué | Filas |
|---|---|---|
| `tenants` | Cuentas (solo Kijutech) | 1 |
| `users` | Usuarios | 1 |
| `roles` | Los 4 roles fijos | 4 |
| `user_roles` | Rol de cada usuario | 1 |
| `projects` | Proyectos | 1 |
| `modules`, `project_modules` | Módulos activables | 1 / 0 |
| `teams`, `team_members`, `invitations` | Restos de la plantilla | 1 / 1 / 0 |
| `activity_logs` | Registro de actividad | 4 |

**SEO**
| Tabla | Para qué | Filas |
|---|---|---|
| `seo_stage_progress` | Estado de cada etapa | 4 |
| `seo_onboarding_checklist` | Checklist | 4 |
| `seo_kickoff_answers` | Respuestas del kickoff | 7 |
| `seo_audit_findings` | Hallazgos de la auditoría | 0 |
| `seo_kw_progress` | Estado de los 4 pasos de Keyword Research | 4 |
| `seo_kw_competitors` | Competidores del paso 1 | 3 |
| `seo_kw_raw` | Keywords importadas | 33 |
| `seo_kw_clusters` / `seo_kw_cluster_keywords` | Clusters y sus keywords | 24 / 39 |
| `seo_cluster_competitors` | URLs de competidores por cluster (scraping) | 1 |
| `seo_competitor_analysis` | Análisis IA de competidores | 0 |
| `seo_cluster_content_plan` | Plan de contenido | 2 |
| `seo_share_tokens` | Enlaces públicos | 1 |
| `seo_knowledge_cards`, `seo_settings` | Tarjetas de conocimiento y ajustes | 48 / 1 |

**IA**
| Tabla | Para qué | Filas |
|---|---|---|
| `ai_provider_settings` | Proveedor, modelo y claves cifradas | 1 |
| `ai_model_pricing` | Precios por modelo | 11 |
| `ai_prompts` | Prompts editables | 2 |
| `ai_jobs` | Registro de cada llamada a IA | 26 |
| `ai_clustering_examples` / `ai_clustering_feedback` | Aprendizaje del clustering | 24 / 37 |
| `ai_intent_modifiers` | Modificadores de intención | 159 |

Migraciones: 22 (0000–0021). Nota: `seo_kw_raw.embedding` está vacío en las 33 filas, no se guardan los vectores ahí.

## 4. Módulo SEO

Manifest con 8 etapas. El menú del asistente solo activa 4.

| Etapa | Estado |
|---|---|
| Onboarding y Medición | **Completa** |
| Kickoff | **Completa** (marcada completada en la BD) |
| Radiografía Inicial | **Parcial**: hay formulario y puntos de control, pero 0 hallazgos guardados |
| Keyword Research | **Completa** (4 pasos: competidores, keywords, clustering, clusters + competidores SERP y plan de contenido por cluster) |
| Estrategia, Ejecución, Reporting, NotebookLM | **Vacías**: solo aparecen como «Próximamente» |

**De principio a fin funciona:** importar keywords (manual, texto o CSV SE Ranking) → clustering con IA → revisión y movimiento de keywords entre clusters con feedback → enlace público para el cliente → scraping de competidores → análisis y plan de contenido.
**A medias:** el paso 3 de Keyword Research figura «en curso» en la BD; el análisis de competidores tiene 0 filas guardadas aunque hay 2 trabajos completados.

## 5. IA

- **Proveedores soportados:** Anthropic, OpenAI, Gemini, DeepSeek (adaptadores en `lib/ai/adapters`).
- **Configurado:** solo Anthropic, modelo `claude-sonnet-4-6`, clave de plataforma (cifrada en la BD).
- **Embeddings activos:** Gemini (`gemini-embedding-001`, 1536 dimensiones), con clave propia separada. También soporta Voyage y OpenAI.
- **Funciones con IA** (de `ai_jobs`): `cluster_keywords` (6 OK / 1 fallo), `cluster_strategic` (8 OK / 5 fallos), `competitor_analysis` (2 OK), `content_plan` (3 OK), `test_prompt` (1 fallo).
- **¿Funciona?** Sí para chat. Hay un 27 % de fallos históricos (probablemente los de los fixes de `max_tokens`). **No pude confirmar los embeddings** porque no quedan vectores guardados; el clustering se completó, lo que indica que funcionaron.

## 6. Seguridad

**Lo que está bien**
- Todas las acciones del módulo SEO y de proyectos llaman a `assertUserInProjectTenant`: comprueban usuario autenticado y que el proyecto pertenezca a su cuenta.
- Las acciones de IA y de ajustes (claves, precios, prompts, modo de cuenta) exigen `super_admin`. Las tarjetas SEO exigen admin SEO.
- Las claves de IA se guardan cifradas.
- Los ids de tenant se derivan del usuario, no de lo que manda el cliente.

**Riesgos que veo**
1. **Alto — registro abierto.** `/sign-up` permite que cualquiera se registre y lo mete en el tenant Kijutech. Las acciones solo comprueban la cuenta, no el rol, así que un desconocido con cuenta **puede ver y editar todos los proyectos**.
2. **Alto — sin comprobación de rol en acciones SEO.** Un `lector` puede crear, editar y borrar clusters y keywords. Solo archivar/borrar proyectos mira el rol.
3. **Medio — `/api/user` devuelve el usuario completo** (incluido el hash de contraseña) y `/api/team` devuelve miembros del equipo.
4. **Medio — `ensureStageInProgress`, `ensureKwStepInProgress` y `upsertStageStatus`** son funciones exportadas sin comprobación propia (dependen de quien las llame).
5. **Enlaces públicos `/share/[token]`:** el token es un UUID aleatorio, uno por proyecto, sin caducidad, sin forma de revocarlo ni regenerarlo, y sin límite de peticiones. Muestran solo clusters activos o completados con título, URL, keywords y nota para el cliente. No encontré datos internos expuestos, pero la nota del cliente es visible para cualquiera que tenga el enlace.
6. **Medio — middleware excluye `/api`**, por lo que la protección depende de cada ruta (las revisadas lo hacen).
7. **Bajo — secretos en `docker-compose.yml`:** contraseña de BD, `AUTH_SECRET` y `AI_ENCRYPTION_KEY` están escritos en el archivo y **versionados en Git**. Son valores «de desarrollo», pero si el repositorio sale de este equipo, hay que rotarlos. No los reproduzco aquí.
8. **Bajo — mensajes de error del servidor** lanzan `Error` con texto interno (p. ej. «No autorizado: el proyecto no pertenece a tu tenant»).

## 7. Restos de la plantilla original

- Logo y nombre **ACME** en `app/(dashboard)/layout.tsx:87`.
- Portada `/` con el texto de la plantilla y enlace «Deploy your own» a Vercel.
- `/pricing`, `/api/stripe/*` y `lib/payments/*`: Stripe instalado e inactivo, con clave inválida que genera errores en el log.
- Textos en inglés: login/registro, `not-found.tsx` («Page Not Found»), menú del panel (Team, Activity, Security, Sign out), `README.md` (plantilla original).
- Páginas sin uso real: `/dashboard` (Team), `/activity`, `/security`, `/general` según su contenido.
- Tablas `teams`, `team_members`, `invitations`; `signUp` aún crea un equipo por usuario; falta enviar email de invitación (TODO en `app/(login)/actions.ts:470`).
- Título de la pestaña: «Next.js SaaS Starter».

## 8. Pruebas automáticas

- **No existen**: ni archivos `*.test.*` ni framework de pruebas.
- Lo único que hay es el compilador: `tsc --noEmit` dentro del contenedor **terminó sin errores**.
- No ejecuté ESLint (no está instalado).

## 9. Errores conocidos, TODOs y cosas a medias

- Único TODO real en el código: enviar email de invitación (`app/(login)/actions.ts:470`).
- Log de la app: error de Stripe («Invalid API Key») al visitar la zona de pagos.
- 7 fallos históricos de IA (de 26 llamadas) en `ai_jobs` (sin registro del motivo: la tabla no guarda el mensaje de error).
- 4 etapas del asistente vacías; auditoría sin hallazgos; análisis de competidores sin datos guardados.
- No hay hot-reload, cada cambio exige reconstruir la imagen.
- Next.js en versión canary.
- En la raíz del repo hay `backup_pre_fase_b.sql` y `seed-knowledge-cards-keyword-research.sql` sueltos (el primero ignorado por git). La carpeta `backups/` aparece sin versionar, como está previsto.

## 10. Últimos 30 commits (resumen)

- **22 ago:** Fase D Bloque 2 (estrategia de contenido pilar-satélite) + documento de sesión; Mapa Visual con icono de detalle técnico; fusión a `main`.
- **21 ago:** Mapa Visual del Sistema (React Flow, solo super_admin); separación de Análisis de Competidores del núcleo; Fase D Bloque 1 (competidores SERP + análisis IA); refactor del extractor JSON; fix de `max_tokens` configurable; Panel del Cerebro con tokens y costes; fix estructural de marcas y fusión de intención en el clustering.
- **20 ago:** Fase C.3 Panel del Cerebro; Noise Recovery en clustering; modificadores de intención, mover keywords y feedback; CLAUDE.md con idioma español; hora en nombres de docs de sesión; pipeline de clustering con embeddings + HDBSCAN; modelo Gemini `gemini-embedding-001`.
