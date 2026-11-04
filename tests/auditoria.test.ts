import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Auditorías estáticas: leen el código fuente y fallan si alguien añade una acción sin guard,
 * deja un secreto en un archivo versionado o vuelve a exponer algo que ya se cerró.
 */
const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'backups', 'tests', 'docs']);

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
const sourceFiles = () => walk(ROOT, (f) => /\.(ts|tsx)$/.test(f));
const useServerFiles = () => sourceFiles().filter((f) => /^\s*['"]use server['"];?/m.test(read(f).slice(0, 200)));

// Cualquiera de estas llamadas, dentro de la acción, cuenta como comprobación de permisos.
const GUARD =
  /getUserIfAllowed\(|requirePermission\(|checkPermission\(|requireManager\('|requireUser\('|requireInboxOwner\(|assertUserInProjectTenant\(|safeAssertUserInProjectTenant\(|assertClusterAccess\(|assertCompetitorAccess\(|assertRawAccess\(|assertClusterKeywordAccess\(|assertCanManageProject\(|assertSeoAdmin\(|assertSuperAdmin\(|isSuperAdmin\(|isTenantAdmin\(/;

// Acciones públicas o de la propia cuenta del usuario (no necesitan un rol concreto).
const SIN_GUARD_DE_ROL = new Set([
  'app/(login)/actions.ts:signOut',
  'app/(login)/actions.ts:signIn',
  'app/(login)/actions.ts:updatePassword',
  'app/(login)/actions.ts:deleteAccount',
  'app/(login)/actions.ts:updateAccount'
]);

describe('auditoría de acciones del servidor', () => {
  it('cada función exportada de un archivo «use server» comprueba permisos', () => {
    const sinGuard: string[] = [];
    for (const file of useServerFiles()) {
      const src = read(file).replace(/\r\n/g, '\n');
      // funciones: export async function nombre(...)
      const re = /export async function (\w+)\(/g;
      const marks: { name: string; idx: number }[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) marks.push({ name: m[1], idx: m.index });
      marks.forEach((mk, i) => {
        const block = src.slice(mk.idx, i + 1 < marks.length ? marks[i + 1].idx : src.length);
        const id = `${rel(file)}:${mk.name}`;
        if (!GUARD.test(block) && !SIN_GUARD_DE_ROL.has(id)) sinGuard.push(id);
      });
      // envoltorios: export const x = validatedActionWithUser(schema, fn, permiso?)
      const reConst = /export const (\w+) = validatedActionWithUser\(/g;
      while ((m = reConst.exec(src))) {
        const rest = src.slice(m.index);
        const end = rest.search(/\n\);\n/);
        const block = end === -1 ? rest : rest.slice(0, end);
        const id = `${rel(file)}:${m[1]}`;
        const conPermiso = /,\s*'(view|edit|admin|users)'\s*$/.test(block.trimEnd());
        if (!conPermiso && !GUARD.test(block) && !SIN_GUARD_DE_ROL.has(id)) sinGuard.push(id);
      }
    }
    expect(sinGuard, `Acciones sin comprobación de permisos:\n${sinGuard.join('\n')}`).toEqual([]);
  });

  it('las funciones internas no se exportan desde archivos «use server» (serían endpoints públicos)', () => {
    const expuestas: string[] = [];
    for (const file of useServerFiles()) {
      const src = read(file);
      for (const m of src.matchAll(/export (?:async )?function ((?:ensure|upsert|assert)\w*)\(/g)) {
        expuestas.push(`${rel(file)}:${m[1]}`);
      }
    }
    expect(expuestas).toEqual([]);
  });

  it('ninguna ruta de API usa getUser() sin comprobar el rol', () => {
    const rutas = walk(path.join(ROOT, 'app/api'), (f) => /route\.ts$/.test(f));
    const permitidas = new Set([
      'app/api/telegram/webhook/route.ts', // se autentica con el secreto del webhook
      'app/api/user/roles/route.ts' // solo devuelve los roles de la propia sesión (la interfaz decide qué menús enseñar)
    ]);
    const sospechosas = rutas
      .filter((f) => !permitidas.has(rel(f)))
      .filter((f) => /\bgetUser\(\)/.test(read(f)))
      .map(rel);
    expect(sospechosas).toEqual([]);
  });

  it('el webhook de Telegram valida el secreto con comparación de tiempo constante', () => {
    const src = read(path.join(ROOT, 'app/api/telegram/webhook/route.ts'));
    expect(src).toMatch(/timingSafeEqual/);
    expect(src).toMatch(/x-telegram-bot-api-secret-token/);
  });
});

describe('auditoría de secretos', () => {
  const textFiles = () =>
    walk(ROOT, (f) => !/\.(png|ico|jpg|jpeg|gif|woff2?|lock|sql)$/.test(f) && !f.endsWith('pnpm-lock.yaml'));

  it('los valores reales de AUTH_SECRET y AI_ENCRYPTION_KEY no aparecen en ningún archivo', () => {
    const valores = [process.env.AUTH_SECRET, process.env.AI_ENCRYPTION_KEY].filter((v): v is string => !!v && v.length > 16);
    expect(valores.length).toBeGreaterThan(0); // las pruebas corren con las variables reales
    const encontrados: string[] = [];
    for (const f of textFiles()) {
      const src = read(f);
      for (const v of valores) if (src.includes(v)) encontrados.push(rel(f));
    }
    expect(encontrados).toEqual([]);
  });

  it('docker-compose.yml no contiene secretos escritos a mano', () => {
    const src = read(path.join(ROOT, 'docker-compose.yml'));
    const literal = [...src.matchAll(/^\s*(AUTH_SECRET|AI_ENCRYPTION_KEY|POSTGRES_PASSWORD):\s*(.+)$/gm)].filter(
      (m) => !m[2].trim().startsWith('${')
    );
    expect(literal.map((m) => m[1])).toEqual([]);
    expect(src).not.toMatch(/postgresql:\/\/[^:\s]+:(?!\$\{)[^@\s]+@/); // contraseña dentro de una URL
  });

  it('.env.example existe y no trae valores para los secretos', () => {
    const src = read(path.join(ROOT, '.env.example'));
    for (const k of ['AUTH_SECRET', 'AI_ENCRYPTION_KEY', 'POSTGRES_PASSWORD', 'POSTGRES_URL', 'OPS_TEST_PASSWORD', 'SEED_ADMIN_PASSWORD']) {
      expect(src, k).toMatch(new RegExp(`^${k}=\\s*$`, 'm'));
    }
  });

  it('.gitignore y .dockerignore dejan fuera .env y las copias de seguridad', () => {
    const git = read(path.join(ROOT, '.gitignore'));
    expect(git).toMatch(/^\.env$/m);
    const docker = read(path.join(ROOT, '.dockerignore')).split(/\r?\n/).map((l) => l.trim());
    for (const entry of ['.env', '.git', 'node_modules', 'backups']) expect(docker, entry).toContain(entry);
    expect(docker.some((l) => l.includes('`'))).toBe(false); // el bug original: comillas invertidas
  });
});

describe('auditoría de lo que se ha cerrado', () => {
  it('no hay registro público', () => {
    expect(fs.existsSync(path.join(ROOT, 'app/(login)/sign-up'))).toBe(false);
    expect(read(path.join(ROOT, 'app/(login)/actions.ts'))).not.toMatch(/export const signUp\b/);
  });

  it('Stripe ya no está', () => {
    expect(fs.existsSync(path.join(ROOT, 'app/api/stripe'))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, 'lib/payments'))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, 'app/(dashboard)/pricing'))).toBe(false);
    expect(read(path.join(ROOT, 'package.json'))).not.toMatch(/stripe/i);
  });

  it('el usuario completo (con password_hash) no se serializa al navegador', () => {
    const layout = read(path.join(ROOT, 'app/layout.tsx'));
    expect(layout).toMatch(/getSafeUser\(\)/);
    expect(layout).not.toMatch(/getUser\(\)|getTeamForUser\(\)/);
  });

  it('los tokens cifrados no viajan a los componentes: solo booleanos o valores enmascarados', () => {
    const fallos: string[] = [];
    for (const f of walk(path.join(ROOT, 'app'), (x) => x.endsWith('.tsx'))) {
      const lines = read(f).split('\n');
      lines.forEach((line, i) => {
        if (/(apiKeyEncrypted|embeddingApiKeyEncrypted|botTokenEncrypted|apiKeyIv|botTokenIv)\b/.test(line)) {
          // la expresión puede ocupar varias líneas: se mira también el entorno inmediato
          const ventana = lines.slice(Math.max(0, i - 1), i + 3).join(' ');
          if (!/Boolean\(|decrypt\(/.test(ventana)) fallos.push(`${rel(f)}:${i + 1}`);
        }
      });
    }
    expect(fallos).toEqual([]);
  });
});
