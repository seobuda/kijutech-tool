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
const schedulerTasks = uniq(all(/await ((?:process|run)[A-Za-z]+)\(cfg\.tenantId/g, workerSrc));
const mappedRuns = new Set(listOf(/runs: \[([^\]]*)\]/g, mapSrc));
for (const t of schedulerTasks) if (!mappedRuns.has(t)) fail(`Tarea del planificador «${t}()» sin entrada en el mapa: añade runs: ['${t}'] al paso que la ejecuta.`);
for (const t of mappedRuns) if (!schedulerTasks.includes(t)) fail(`El mapa cita la tarea «${t}()», que no está en el planificador (telegram-worker.ts).`);

// 3. Tablas ops_*
const tables = uniq(all(/pgTable\(\s*'(ops_[a-z_]+)'/g, schemaSrc));
const mappedTables = new Set(listOf(/tables: \[([^\]]*)\]/g, mapSrc));
for (const t of tables) if (!mappedTables.has(t)) fail(`Tabla «${t}» sin entrada en el mapa: añádela a tables: [...] del paso que la usa.`);
for (const t of mappedTables) if (!tables.includes(t)) fail(`El mapa cita la tabla «${t}», que no existe en el esquema.`);

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

// 6. Enlaces entre mapas
const mapIds = all(/^ {2}(\w+): [A-Z_]+,$/gm, mapSrc.slice(mapSrc.indexOf('export const OPS_MAPS')));
const known = new Set([...mapIds, 'clustering', 'competitor_analysis']);
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
