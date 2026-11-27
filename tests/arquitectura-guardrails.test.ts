import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Barreras de arquitectura: reglas de CLAUDE.md que antes solo se cumplían porque quien programa las recordaba.
 * Leen el código fuente y fallan si alguien las incumple, así que un despliegue con una infracción no sale
 * (deploy.sh pasa toda la batería sobre el commit exacto).
 *
 * Cada excepción lleva su motivo. Si una regla necesita una excepción nueva, se añade aquí con el porqué:
 * es una decisión consciente, no un atajo.
 */
const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'backups', 'docs', '.pnpm-store', '.claude']);

function walk(dir: string, filter: (f: string) => boolean, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, filter, out);
    else if (filter(full)) out.push(full);
  }
  return out;
}
const rel = (f: string) => path.relative(ROOT, f).replace(/\\/g, '/');
const read = (f: string) => fs.readFileSync(f, 'utf8');
const codeFiles = (dir = ROOT) => walk(dir, (f) => /\.(ts|tsx|js|mjs)$/.test(f));
// Las pruebas pueden importar cualquier cosa para probarla: las reglas son para el código de la aplicación.
const appCode = () => codeFiles().filter((f) => !rel(f).startsWith('tests/'));

// ---------------------------------------------------------------------------------------------------------------
// 1. Núcleo y módulos
// ---------------------------------------------------------------------------------------------------------------

// Módulos: cada uno es dueño de sus datos y no conoce a los demás; se hablan a través del núcleo.
const MODULES = ['operaciones', 'agentes', 'estrategia', 'rendimiento', 'seo'];
// Núcleo e infraestructura común: cualquiera puede usarlos, pero ellos no dependen de ningún módulo.
const CORE = ['core', 'auth', 'db', 'ai', 'projects', 'errors.ts', 'utils.ts'];
// Capa de aplicación: une varios módulos a propósito (arranque, vistas que leen de varios, el Mapa Visual).
// Puede importar módulos, pero ni el núcleo ni los módulos pueden importarla a ella.
const APP_LAYER = ['app-wiring.ts', 'equipo', 'inicio', 'architecture-map'];

// Excepciones conocidas, una por una (origen → destino). Una nueva hace fallar la prueba.
const KNOWN_IMPORT_EXCEPTIONS = new Map([
  // Estas acciones llaman a wireApp() para tener el registro de capacidades cargado en el contexto de la acción.
  // De forma indirecta el módulo carga todos los demás: pendiente de sacar ese arranque a la capa de aplicación
  // (ESTADO §16). Mientras tanto, solo estas tres.
  ['lib/agentes/actions.ts → lib/app-wiring', 'wireApp() en las acciones'],
  ['lib/estrategia/actions.ts → lib/app-wiring', 'wireApp() en las acciones'],
  ['lib/rendimiento/actions.ts → lib/app-wiring', 'wireApp() en las acciones'],
  ['lib/seo/jefe-actions.ts → lib/app-wiring', 'wireApp() en las acciones (chat con el Jefe SEO por la capacidad agentChat, D3)']
]);

type Zone = { kind: 'module' | 'core' | 'app' | 'outside'; name: string };

function zoneOf(absPath: string): Zone {
  const r = rel(absPath);
  if (!r.startsWith('lib/')) return { kind: 'outside', name: r.split('/')[0] };
  // Un import llega sin extensión (`@/lib/app-wiring`) y el archivo con ella: se comparan sin extensión.
  const name = r.split('/')[1].replace(/\.(ts|tsx)$/, '');
  const has = (list: string[]) => list.some((n) => n.replace(/\.(ts|tsx)$/, '') === name);
  if (has(MODULES)) return { kind: 'module', name };
  if (has(CORE)) return { kind: 'core', name };
  if (has(APP_LAYER)) return { kind: 'app', name };
  return { kind: 'outside', name };
}

// Todo lo que carga otro archivo: import estático, `export … from`, import() dinámico y require().
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm;

function importsOf(file: string): string[] {
  const out: string[] = [];
  for (const m of read(file).matchAll(SPECIFIER)) {
    const spec = m[1];
    if (spec.startsWith('@/')) out.push(path.join(ROOT, spec.slice(2)));
    else if (spec.startsWith('.')) out.push(path.resolve(path.dirname(file), spec));
  }
  return out;
}

describe('barreras de arquitectura: núcleo y módulos', () => {
  const libFiles = codeFiles(path.join(ROOT, 'lib'));

  it('toda carpeta de lib/ está clasificada como núcleo, módulo o capa de aplicación', () => {
    // Una carpeta nueva sin clasificar quedaría fuera de las reglas: obliga a decidir dónde va.
    const sinClasificar = fs
      .readdirSync(path.join(ROOT, 'lib'))
      .filter((n) => zoneOf(path.join(ROOT, 'lib', n)).kind === 'outside');
    expect(sinClasificar).toEqual([]);
  });

  it('el núcleo no importa ningún módulo ni la capa de aplicación', () => {
    const fallos: string[] = [];
    for (const f of libFiles) {
      if (zoneOf(f).kind !== 'core') continue;
      for (const target of importsOf(f)) {
        const z = zoneOf(target);
        if (z.kind === 'module' || z.kind === 'app') fallos.push(`${rel(f)} → ${rel(target)}`);
      }
    }
    expect(fallos).toEqual([]);
  });

  it('un módulo no importa a otro módulo ni a la capa de aplicación', () => {
    const fallos: string[] = [];
    for (const f of libFiles) {
      const from = zoneOf(f);
      if (from.kind !== 'module') continue;
      for (const target of importsOf(f)) {
        const z = zoneOf(target);
        const edge = `${rel(f)} → ${rel(target)}`;
        if (((z.kind === 'module' && z.name !== from.name) || z.kind === 'app') && !KNOWN_IMPORT_EXCEPTIONS.has(edge)) {
          fallos.push(edge);
        }
      }
    }
    expect(fallos).toEqual([]);
  });

  it('las excepciones conocidas siguen existiendo (si se arregla una, se quita de la lista)', () => {
    // Evita que la lista crezca con restos: una excepción que ya no hace falta es un agujero abierto sin motivo.
    const edges = new Set<string>();
    for (const f of libFiles) for (const t of importsOf(f)) edges.add(`${rel(f)} → ${rel(t)}`);
    expect([...KNOWN_IMPORT_EXCEPTIONS.keys()].filter((e) => !edges.has(e))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 2 y 3. ClickUp: un solo cliente con contador, y los cambios por la bandeja de salida
// ---------------------------------------------------------------------------------------------------------------

const CLICKUP_CLIENT = 'lib/operaciones/clickup.ts';
// Cambios en ClickUp que disparan el flujo de Telegram: solo la bandeja de salida (clave única y reintentos).
const CLICKUP_MUTATIONS = ['updateTaskStatus', 'updateTaskDue', 'updateTaskAssignees', 'addTaskComment'];
const MUTATION_ALLOWED = new Map([
  ['lib/operaciones/outbox.ts', 'la bandeja de salida es el único camino previsto'],
  [
    'lib/operaciones/sim/scenarios-clickup.ts',
    'escenario externo que comprueba el ClickUp real en la lista de pruebas; no entra en el despliegue'
  ]
]);

describe('barreras de arquitectura: ClickUp', () => {
  it('solo el cliente con contador habla con la API de ClickUp', () => {
    // Sin el cliente no hay contador de 100 peticiones por minuto, ni espera ante el límite, ni reintento ante 429.
    const fallos = appCode()
      .filter((f) => rel(f) !== CLICKUP_CLIENT && /api\.clickup\.com/i.test(read(f)))
      .map(rel);
    expect(fallos).toEqual([]);
  });

  it('los cambios de estado, fecha, responsable y comentarios solo salen de la bandeja de salida', () => {
    const names = CLICKUP_MUTATIONS.join('|');
    const imported = new RegExp(`import\\s*(?:type\\s*)?\\{[^}]*\\b(${names})\\b[^}]*\\}\\s*from\\s*['"][^'"]*clickup['"]`);
    const dynamic = new RegExp(`import\\(\\s*['"][^'"]*operaciones/clickup['"]\\s*\\)`);
    const called = new RegExp(`(?<!function\\s)\\b(${names})\\s*\\(`);
    const fallos: string[] = [];
    for (const f of appCode()) {
      const r = rel(f);
      if (r === CLICKUP_CLIENT || MUTATION_ALLOWED.has(r)) continue;
      const src = read(f);
      if (imported.test(src)) fallos.push(`${r}: importa una función de cambio de ClickUp`);
      else if (dynamic.test(src) && called.test(src)) fallos.push(`${r}: carga el cliente de ClickUp y llama a una función de cambio`);
    }
    expect(fallos).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 4. Archivos 'use server'
// ---------------------------------------------------------------------------------------------------------------

describe('barreras de arquitectura: acciones del servidor', () => {
  it('ningún archivo «use server» reexporta tipos (rompe las acciones en ejecución con Turbopack)', () => {
    // Sí vale `export type X = …` en línea; lo que rompe es `export type { X }` o `export { type X }`.
    const fallos = appCode()
      .filter((f) => /^\s*['"]use server['"];?/m.test(read(f).slice(0, 200)))
      .filter((f) => /^\s*export\s+(?:type\s*\{|\{[^}]*\btype\s+\w)/m.test(read(f)))
      .map(rel);
    expect(fallos).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 5. Tablas con el prefijo de su módulo
// ---------------------------------------------------------------------------------------------------------------

// Prefijos de módulo y de las piezas del núcleo que tienen familia propia (IA, conocimiento, errores).
const TABLE_PREFIXES = ['ops_', 'seo_', 'ai_', 'agt_', 'kb_', 'perf_', 'est_', 'sys_'];
// Tablas del núcleo sin prefijo. Añadir una aquí es decidir que es núcleo (y el núcleo necesita aprobación).
const CORE_TABLES = new Set([
  'tenants', 'users', 'roles', 'user_roles', 'projects', 'modules', 'project_modules', 'auth_login_attempts',
  'clients', 'client_contacts', 'client_locations', 'client_assets', 'client_competitors', 'client_memory',
  // Cimientos de la plataforma (23 nov 2026, migración 0060, aprobados por Enric): los usan SEO y después Ads.
  'project_assets', 'client_contact_subscriptions', 'client_messages', 'jobs', 'job_schedules',
  'gsc_properties', 'gsc_queries', 'gsc_pages', 'gsc_daily', 'gsc_daily_totals', 'gsc_daily_country', 'gsc_monthly',
  'crawl_runs', 'crawl_pages', 'crawl_links', 'findings',
  // Hito 1 SEO (23 nov 2026, migración 0061, aprobado por Enric): registro de intervenciones (técnica + hipótesis de cada
  // encargo), común a SEO, Estrategia y Ads. La bitácora de I+D va en kb_ (familia de la base de conocimiento).
  'interventions',
  // Preguntas al cliente (25 nov 2026, migración 0064, aprobado por Enric): banco por servicio, preguntas de cada cliente,
  // cuestionario en línea y textos de los correos. Comunes a todos los departamentos (SEO, Ads, Web…).
  'client_question_templates', 'client_questions', 'client_questionnaires', 'client_comms_templates',
  // Conexiones del cliente y sus leads (27 nov 2026, migración 0075; Enric eligió «WordPress en el núcleo»): WordPress
  // para borradores y GoHighLevel para leads; los usarán también Webs y Ads.
  'client_connections', 'client_leads',
  // Uso de las pantallas (27 nov 2026, migración 0077; plan de UX del SEO v2 aprobado por Enric): línea base del rediseño.
  'app_usage_events',
  // Restos de la plantilla, pendientes de borrar con una migración (ESTADO §16).
  'teams', 'team_members', 'invitations', 'activity_logs'
]);
const tableOk = (t: string) => CORE_TABLES.has(t) || TABLE_PREFIXES.some((p) => t.startsWith(p));

describe('barreras de arquitectura: tablas', () => {
  it('toda tabla del esquema lleva el prefijo de su módulo o es del núcleo', () => {
    const schema = read(path.join(ROOT, 'lib/db/schema.ts'));
    const tables = [...schema.matchAll(/pgTable\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    // Si el extractor se queda corto la barrera no vería nada: tiene que encontrar todas las declaraciones.
    expect(tables.length).toBe((schema.match(/pgTable\(/g) ?? []).length);
    expect(tables.length).toBeGreaterThan(50);
    expect(tables.filter((t) => !tableOk(t))).toEqual([]);
  });

  it('las migraciones escritas a mano tampoco crean tablas sin prefijo', () => {
    const dir = path.join(ROOT, 'lib/db/migrations');
    const fallos: string[] = [];
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.sql'))) {
      for (const m of read(path.join(dir, f)).matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) {
        if (!tableOk(m[1].toLowerCase())) fallos.push(`${f}: ${m[1]}`);
      }
    }
    expect(fallos).toEqual([]);
  });
});
