#!/usr/bin/env node
// Comprobación del Mapa Visual del Sistema (módulo Operaciones).
// Falla (código 1) si algo registrado en el código no tiene su entrada en lib/operaciones/process-map.ts:
//   - una automatización del panel (lib/operaciones/automations.ts)  → `automation: 'clave'`
//   - una tarea del planificador (telegram-worker.ts)                 → `runs: ['funcion']`
//   - un prompt de IA usado en lib/operaciones                        → `prompts: ['clave']`
//   - una tabla ops_* del esquema (lib/db/schema.ts)                  → `tables: ['ops_...']`
// y también si el mapa está roto: archivos que no existen, enlaces a mapas o pasos inexistentes,
// proveedores de «última ejecución» sin implementar o ids de paso repetidos.
// Es JavaScript plano que solo lee texto: se puede ejecutar en el host (`node scripts/check-architecture-map.js`)
// o en el contenedor. Regla de CLAUDE.md: ejecutarla antes de cada commit de cierre de paso.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const problems = [];
const fail = (msg) => problems.push(msg);

const mapSrc = read('lib/operaciones/process-map.ts');
const registrySrc = read('lib/architecture-map/registry.ts');
const automationsSrc = read('lib/operaciones/automations.ts');
const workerSrc = read('lib/operaciones/telegram-worker.ts');
const schemaSrc = read('lib/db/schema.ts');
const liveSrc = read('lib/operaciones/map-live.ts');

const all = (re, src, group = 1) => [...src.matchAll(re)].map((m) => m[group]);
const listOf = (re, src) =>
  all(re, src).flatMap((body) => all(/'([^']+)'/g, body));
const uniq = (a) => [...new Set(a)];

// 1. Automatizaciones del panel
const automationKeys = all(/^ {4}key: '([a-z_]+)',/gm, automationsSrc);
const mappedAutomations = new Set(all(/automation: '([a-z_]+)'/g, mapSrc));
for (const k of automationKeys) if (!mappedAutomations.has(k)) fail(`Automatización «${k}» (panel) sin entrada en el mapa: añade settings: [{ automation: '${k}' }] al paso que afecta.`);
for (const k of mappedAutomations) if (!automationKeys.includes(k)) fail(`El mapa referencia la automatización «${k}», que no existe en automations.ts.`);

// Campos citados en settings: deben existir en alguna automatización.
const fieldKeys = new Set(all(/\{ key: '([A-Za-z]+)', label:/g, automationsSrc));
for (const body of all(/fields: \[([^\]]*)\]\s*\}/g, mapSrc)) {
  for (const f of all(/'([^']+)'/g, body)) if (!fieldKeys.has(f)) fail(`El mapa cita el campo «${f}», que no existe en ninguna automatización.`);
}

// 2. Tareas del planificador
// Cada paso va aislado en step('nombre', () => tarea(t)); también vale la forma antigua
// `await tarea(cfg.tenantId)`.
const schedulerTasks = uniq(all(/\b((?:process|run|retriage|retry)[A-Za-z]+)\((?:cfg\.tenantId|t)\)/g, workerSrc));
const mappedRuns = new Set(listOf(/runs: \[([^\]]*)\]/g, mapSrc));
for (const t of schedulerTasks) if (!mappedRuns.has(t)) fail(`Tarea del planificador «${t}()» sin entrada en el mapa: añade runs: ['${t}'] al paso que la ejecuta.`);
for (const t of mappedRuns) if (!schedulerTasks.includes(t)) fail(`El mapa cita la tarea «${t}()», que no está en el planificador (telegram-worker.ts).`);

// 3. Tablas ops_*
const tables = uniq(all(/pgTable\(\s*'(ops_[a-z_]+)'/g, schemaSrc));
const mappedTables = new Set(listOf(/tables: \[([^\]]*)\]/g, mapSrc));
for (const t of tables) if (!mappedTables.has(t)) fail(`Tabla «${t}» sin entrada en el mapa: añádela a tables: [...] del paso que la usa.`);
// Operaciones también puede citar las tablas del cliente del núcleo (clients, client_*), si existen.
const coreClientTables = uniq(all(/pgTable\(\s*'(clients|client_[a-z_]+)'/g, schemaSrc));
for (const t of mappedTables) if (!tables.includes(t) && !coreClientTables.includes(t)) fail(`El mapa cita la tabla «${t}», que no existe en el esquema.`);

// 4. Prompts de IA usados en lib/operaciones (cadenas 'ops_...' que no son tablas)
const opsFiles = fs.readdirSync(path.join(root, 'lib/operaciones')).filter((f) => f.endsWith('.ts') && f !== 'process-map.ts');
const promptKeys = new Set();
for (const f of opsFiles) {
  for (const k of all(/'(ops_[a-z_]+)'/g, read(`lib/operaciones/${f}`))) {
    if (!tables.includes(k) && !k.endsWith('_check')) promptKeys.add(k);
  }
}
const mappedPrompts = new Set(listOf(/prompts: \[([^\]]*)\]/g, mapSrc));
for (const k of promptKeys) if (!mappedPrompts.has(k)) fail(`Prompt de IA «${k}» sin entrada en el mapa: añade prompts: ['${k}'] al paso que lo usa.`);
for (const k of mappedPrompts) if (!promptKeys.has(k)) fail(`El mapa cita el prompt «${k}», que no se usa en lib/operaciones.`);
if (!liveSrc.includes(`'ops_transcribe_audio'`)) fail('map-live.ts no consulta la lista de prompts de Operaciones.');
for (const k of promptKeys) if (!liveSrc.includes(`'${k}'`)) fail(`map-live.ts no incluye el prompt «${k}» (se muestra su nombre y estado en el mapa).`);

// 5. Archivos citados
for (const f of uniq(all(/file: '([^']+)'/g, mapSrc))) if (!fs.existsSync(path.join(root, f))) fail(`El mapa cita un archivo que no existe: ${f}`);

// 5b. Mapa de Seguridad (lib/auth/security-process-map.ts): sus archivos deben existir
const securitySrc = read('lib/auth/security-process-map.ts');
for (const f of uniq(all(/file: '([^']+)'/g, securitySrc))) if (!fs.existsSync(path.join(root, f))) fail(`El mapa de Seguridad cita un archivo que no existe: ${f}`);
if (all(/^ {4}id: '([\w-]+)',/gm, securitySrc).length < 5) fail('El mapa de Seguridad parece vacío o roto (menos de 5 pasos).');

// 5c. Mapa del módulo Agentes (lib/agentes/process-map.ts): sus archivos y tablas deben existir
const agentesSrc = read('lib/agentes/process-map.ts');
for (const f of uniq(all(/file: '([^']+)'/g, agentesSrc))) if (!fs.existsSync(path.join(root, f))) fail(`El mapa de Agentes cita un archivo que no existe: ${f}`);
const agtTables = uniq(all(/pgTable\(\s*'(agt_\w+)'/g, schemaSrcForAgt()));
for (const t of agtTables) if (!agentesSrc.includes(`'${t}'`)) fail(`La tabla «${t}» (módulo Agentes) no aparece en el mapa de Agentes.`);
// 5d. Mapa de la ficha del cliente (núcleo, lib/core/clients-process-map.ts): archivos, y todas sus tablas citadas.
const clientesSrc = read('lib/core/clients-process-map.ts');
for (const f of uniq(all(/file: '([^']+)'/g, clientesSrc))) if (!fs.existsSync(path.join(root, f))) fail(`El mapa de Clientes cita un archivo que no existe: ${f}`);
for (const t of coreClientTables) if (!clientesSrc.includes(`'${t}'`)) fail(`La tabla «${t}» (cliente del núcleo) no aparece en el mapa de Clientes.`);
for (const t of listOf(/tables: \[([^\]]*)\]/g, clientesSrc)) if (!coreClientTables.includes(t) && !tables.includes(t)) fail(`El mapa de Clientes cita la tabla «${t}», que no existe en el esquema.`);
// 5e. Mapa del módulo Rendimiento (lib/rendimiento/process-map.ts): archivos y todas sus tablas perf_*.
const perfSrc = read('lib/rendimiento/process-map.ts');
for (const f of uniq(all(/file: '([^']+)'/g, perfSrc))) if (!fs.existsSync(path.join(root, f))) fail(`El mapa de Rendimiento cita un archivo que no existe: ${f}`);
for (const t of uniq(all(/pgTable\(\s*'(perf_\w+)'/g, schemaSrc))) if (!perfSrc.includes(`'${t}'`)) fail(`La tabla «${t}» (módulo Rendimiento) no aparece en el mapa de Rendimiento.`);
if (!/registerScheduled\('rendimiento de clientes'/.test(read('lib/rendimiento/register.ts'))) fail('La tarea del planificador de Rendimiento no está registrada (lib/rendimiento/register.ts).');
// 5f. Mapa del módulo Estrategia (lib/estrategia/process-map.ts): archivos, todas sus tablas est_*, la tarea del
// planificador y los prompts de IA que usa el módulo.
const estSrc = read('lib/estrategia/process-map.ts');
for (const f of uniq(all(/file: '([^']+)'/g, estSrc))) if (!fs.existsSync(path.join(root, f))) fail(`El mapa de Estrategia cita un archivo que no existe: ${f}`);
for (const t of uniq(all(/pgTable\(\s*'(est_\w+)'/g, schemaSrc))) if (!estSrc.includes(`'${t}'`)) fail(`La tabla «${t}» (módulo Estrategia) no aparece en el mapa de Estrategia.`);
if (!/registerScheduled\('estrategia de clientes'/.test(read('lib/estrategia/register.ts'))) fail('La tarea del planificador de Estrategia no está registrada (lib/estrategia/register.ts).');
const estPromptSrc = fs.readdirSync(path.join(root, 'lib/estrategia')).filter((f) => f.endsWith('.ts')).map((f) => read(`lib/estrategia/${f}`)).join('\n');
for (const k of uniq(all(/PROMPT\s*=\s*'(est_\w+)'/g, estPromptSrc))) if (!estSrc.includes(`'${k}'`)) fail(`Prompt de IA «${k}» (Estrategia) sin entrada en el mapa de Estrategia.`);
// 5g. Registro central de errores (núcleo, lib/core/errors-process-map.ts): archivos, todas sus tablas sys_* y la tarea
// del planificador.
const errSrc = read('lib/core/errors-process-map.ts');
for (const f of uniq(all(/file: '([^']+)'/g, errSrc))) if (!fs.existsSync(path.join(root, f))) fail(`El mapa de Errores cita un archivo que no existe: ${f}`);
for (const t of uniq(all(/pgTable\(\s*'(sys_\w+)'/g, schemaSrc))) if (!errSrc.includes(`'${t}'`)) fail(`La tabla «${t}» (registro de errores) no aparece en el mapa de Errores.`);
if (!/registerScheduled\('registro de errores'/.test(read('lib/core/errors.ts'))) fail('La tarea del planificador del registro de errores no está registrada (lib/core/errors.ts).');
// 5h. Base de conocimiento (núcleo, lib/core/knowledge-process-map.ts): archivos, todas sus tablas kb_*, sus prompts de
// IA (cadenas 'kb_...' de lib/core/knowledge.ts que no son tablas) y la tarea del planificador.
const kbSrc = read('lib/core/knowledge-process-map.ts');
for (const f of uniq(all(/file: '([^']+)'/g, kbSrc))) if (!fs.existsSync(path.join(root, f))) fail(`El mapa de Conocimiento cita un archivo que no existe: ${f}`);
const kbTables = uniq(all(/pgTable\(\s*'(kb_\w+)'/g, schemaSrc));
for (const t of kbTables) if (!kbSrc.includes(`'${t}'`)) fail(`La tabla «${t}» (base de conocimiento) no aparece en el mapa de Conocimiento.`);
const kbCode = read('lib/core/knowledge.ts');
for (const k of uniq(all(/'(kb_[a-z_]+)'/g, kbCode))) if (!kbTables.includes(k) && !kbSrc.includes(`prompts: ['${k}'`)) fail(`Prompt de IA «${k}» (base de conocimiento) sin entrada en el mapa de Conocimiento.`);
if (!/registerScheduled\('base de conocimiento'/.test(kbCode)) fail('La tarea del planificador de la base de conocimiento no está registrada (lib/core/knowledge.ts).');
// 5i. Plataforma (cimientos, núcleo, lib/core/platform-process-map.ts, 23 nov 2026): archivos, todas sus tablas
// (alcance del proyecto, cola de trabajos, Search Console en detalle, rastreador y hallazgos) y sus tipos de trabajo.
const pltSrc = read('lib/core/platform-process-map.ts');
for (const f of uniq(all(/file: '([^']+)'/g, pltSrc))) if (!fs.existsSync(path.join(root, f))) fail(`El mapa de Plataforma cita un archivo que no existe: ${f}`);
const pltTables = uniq(all(/pgTable\(\s*'((?:project_assets|jobs|job_schedules|gsc_\w+|crawl_\w+|findings|client_messages|interventions))'/g, schemaSrc));
for (const t of pltTables) if (!pltSrc.includes(`'${t}'`)) fail(`La tabla «${t}» (plataforma) no aparece en el mapa de Plataforma.`);
for (const k of uniq(all(/registerJobKind\(\{\s*kind: '([a-z.]+)'/g, ['lib/core/comms.ts', 'lib/core/gsc.ts', 'lib/core/crawler.ts'].map(read).join(' ')))) {
  const prefix = k.split('.')[0];
  const lanes = { comms: 'plt-comms', gsc: 'plt-gsc', crawl: 'plt-rastreo' };
  if (!lanes[prefix] || !pltSrc.includes(`id: '${lanes[prefix]}'`)) fail(`El trabajo «${k}» de la cola no tiene su paso en el mapa de Plataforma.`);
}
// Registro de intervenciones (Hito 1, migración 0061): su trabajo horario tiene su paso en el mapa de Plataforma.
if (/registerJobKind\(\{ kind: INTERVENTIONS_SYNC/.test(read('lib/core/interventions.ts')) && !pltSrc.includes("id: 'plt-intervenciones'")) fail('El trabajo «core.interventions.sync» no tiene su paso en el mapa de Plataforma.');

// 5j. SEO · Salud técnica (Hito 1, lib/seo/salud/process-map.ts, 23 nov 2026): archivos y tipos de trabajo del módulo SEO.
const saludSrc = read('lib/seo/salud/process-map.ts');
for (const f of uniq(all(/file: '([^']+)'/g, saludSrc))) if (!fs.existsSync(path.join(root, f))) fail(`El mapa de Salud técnica cita un archivo que no existe: ${f}`);
// Hito 1 completo (migración 0061): también los trabajos del expediente, el plan y la vigilancia de I+D, y las tablas
// seo_* nuevas (las del SEO antiguo, seo_stage_progress y compañía, tienen su propio mapa).
const seoJobSrc = ['lib/seo/salud/audit.ts', 'lib/seo/expediente/collect.ts', 'lib/seo/plan/plan.ts', 'lib/seo/id/watch.ts', 'lib/seo/mapa/mapa.ts', 'lib/seo/competencia/competencia.ts'].map(read).join(' ');
const seoJobKinds = [...all(/kind: '(seo\.[a-z.]+)',\s*timeoutS/g, seoJobSrc), ...all(/export const ID_\w+ = '(seo\.[a-z.]+)'/g, seoJobSrc)];
for (const k of uniq(seoJobKinds)) {
  if (!saludSrc.includes(`«${k}»`)) fail(`El trabajo «${k}» de la cola no aparece en el mapa de SEO (Salud técnica).`);
}
for (const t of ['seo_dossier_facts', 'seo_plan_items', 'seo_reviews', 'seo_topics', 'seo_topic_queries', 'seo_text_embeddings']) {
  if (!schemaSrc.includes(`'${t}'`)) fail(`Falta la tabla «${t}» en el esquema.`);
  else if (!saludSrc.includes(`'${t}'`)) fail(`La tabla «${t}» (SEO v2) no aparece en el mapa de SEO (Salud técnica).`);
}

function schemaSrcForAgt() {
  return read('lib/db/schema.ts');
}

// 6. Enlaces entre mapas
const mapIds = all(/^ {2}(\w+): [A-Z_]+,$/gm, mapSrc.slice(mapSrc.indexOf('export const OPS_MAPS')));
const known = new Set([...mapIds, 'clustering', 'competitor_analysis', 'security', 'agentes', 'clientes', 'plataforma', 'rendimiento', 'estrategia', 'errores', 'conocimiento', 'seo_salud']);
for (const id of uniq([...all(/detailMapId: '(\w+)'/g, mapSrc), ...all(/detailMapId: '(\w+)'/g, registrySrc)])) {
  if (!known.has(id)) fail(`detailMapId «${id}» no corresponde a ningún mapa registrado en OPS_MAPS.`);
}
for (const id of mapIds) {
  const opened = new RegExp(`detailMapId: '${id}'`).test(mapSrc + registrySrc);
  if (id !== 'ops' && !opened) fail(`El mapa «${id}» existe pero ningún nodo lo abre (detailMapId).`);
  if (id === 'ops' && !/detailMapId: 'ops'/.test(registrySrc)) fail('El nodo «Operaciones» del nivel 1 no abre el mapa «ops».');
}
for (const p of all(/next: \{ path: \[([^\]]*)\]/g, mapSrc)) {
  for (const id of all(/'([^']+)'/g, p)) if (!known.has(id)) fail(`Un enlace «Sigue en» apunta a un mapa inexistente: ${id}`);
}

// 7. Proveedores de «última ejecución»
for (const k of uniq(all(/live: '(\w+)'/g, mapSrc))) {
  if (!new RegExp(`\\n\\s+${k}:`).test(liveSrc)) fail(`El mapa usa el proveedor live «${k}», que no existe en map-live.ts.`);
}

// 8. Pasos: ids únicos y enlaces `to` válidos dentro de cada mapa
const seen = new Map();
const blocks = mapSrc.split(/\nconst (?:OPS_[A-Z]+|TECH_DEBT): ProcessStep\[\] = \[/).slice(1);
for (const b of blocks) {
  const ids = all(/^ {4}id: '([^']+)'/gm, b);
  for (const id of ids) {
    if (seen.has(id)) fail(`Id de paso repetido en el mapa: ${id}`);
    seen.set(id, true);
  }
  for (const body of all(/ to: \[([^\]]*)\]/g, b)) {
    for (const t of all(/'([^']+)'/g, body)) if (!ids.includes(t)) fail(`Un paso apunta (to) a «${t}», que no existe en su mapa.`);
  }
}

// 9. Nivel 1: Operaciones construido
if (!/id: 'operaciones'[\s\S]*?status: 'built'/.test(registrySrc)) fail('El nodo «Operaciones» del nivel 1 no figura como construido.');

if (problems.length) {
  console.error(`\nMAPA VISUAL: ${problems.length} problema(s)\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('\nActualiza lib/operaciones/process-map.ts (y lib/architecture-map/registry.ts si hace falta) y vuelve a ejecutar.\n');
  process.exit(1);
}
console.log(
  `Mapa Visual OK: ${automationKeys.length} automatizaciones, ${schedulerTasks.length} tareas del planificador, ${promptKeys.size} prompts, ${tables.length} tablas, ${seen.size} pasos en ${mapIds.length} mapas.`
);
