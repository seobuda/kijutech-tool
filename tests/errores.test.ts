// Registro central de errores (núcleo, 17 nov 2026): reglas puras (huella, secretos, consola, diagnóstico, rutas de
// código) y, con la base, agrupar, reabrir al volver, visibilidad por cuenta, estados, diagnóstico y botones.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { sysErrorEvents, sysErrorGroups, tenants } from '@/lib/db/schema';
import { setAgentJobCreator } from '@/lib/core/capabilities';
import { alertMessage, cleanDiagnosis, fingerprint, guessSeverity, isNoise, normalizeMessage, parseConsoleArgs, safeContext, scrub } from '@/lib/core/error-rules';
import {
  cleanErrorSettings,
  errorEvents,
  flushErrors,
  getErrorGroup,
  handleErrorButton,
  listErrorGroups,
  readCode,
  errorStats,
  reportError,
  requestDiagnosis,
  runErrorHousekeeping,
  safeCodePath,
  saveDiagnosis,
  saveErrorSettings,
  searchCode,
  setErrorStatus
} from '@/lib/core/errors';

describe('errores: reglas', () => {
  it('quita secretos antes de guardar', () => {
    const s = scrub('Bearer abcdefghijklmnop sk-ant-api03-XYZXYZXYZ123 token=supersecreto123 https://u:clave@host.com/x postgres://k:pw@db:5432/x 123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA ?key=AIzaSyXX');
    expect(s).not.toMatch(/abcdefghijklmnop|XYZXYZXYZ123|supersecreto123|clave@|pw@|AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA|AIzaSyXX/);
  });

  it('el mismo fallo con ids, números y URLs distintos cae en el mismo grupo', () => {
    const a = 'No se pudo crear la tarea 8f14e45f-ceea-467a-9575-0123456789ab en https://x.com/a (intento 3)';
    const b = 'No se pudo crear la tarea 11111111-2222-4333-8444-555555555555 en https://y.com/b (intento 1)';
    expect(normalizeMessage(a)).toBe(normalizeMessage(b));
    expect(fingerprint(null, 'ops', 'x', a)).toBe(fingerprint(null, 'ops', 'x', b));
    expect(fingerprint('t1', 'ops', 'x', a)).not.toBe(fingerprint('t2', 'ops', 'x', a));
    expect(fingerprint(null, 'ops', 'x', a)).not.toBe(fingerprint(null, 'ops', 'y', a));
  });

  it('lee la etiqueta de consola del proyecto: módulo, zona y mensaje', () => {
    const p = parseConsoleArgs(['[agente] herramienta crear_encargo:', 'La respuesta de la IA se cortó']);
    expect(p).toMatchObject({ source: 'agentes', area: 'agente herramienta crear_encargo', message: 'La respuesta de la IA se cortó' });
    const e = new Error('boom');
    const q = parseConsoleArgs(['[estrategia] estratega:', e]);
    expect(q.source).toBe('estrategia');
    expect(q.message).toContain('boom');
    expect(q.stack).toContain('boom');
    expect(parseConsoleArgs([e]).source).toBe('sistema');
    expect(isNoise('(node:1) ExperimentalWarning: x')).toBe(true);
    expect(guessSeverity('warn', 'x')).toBe('aviso');
    expect(guessSeverity('error', 'connect ECONNREFUSED 127.0.0.1:5432')).toBe('critico');
  });

  it('contexto recortado y sin secretos; diagnóstico validado', () => {
    expect(safeContext({ token: 'abcdef123456', a: 1 })).toEqual({ token: '***', a: 1 });
    expect(safeContext('x'.repeat(10_000)).recortado).toBeDefined();
    expect(cleanDiagnosis({ causa: '', arreglo: 'x' })).toBeNull();
    expect(cleanDiagnosis({ causa: 'c', arreglo: 'a', confianza: 40, riesgo: 'raro', archivos: ['a.ts', 3] })).toMatchObject({ confianza: 10, riesgo: 'medio', archivos: ['a.ts'] });
  });

  it('el aviso de Telegram escapa el HTML', () => {
    const html = alertMessage({ title: '<b>x</b> & y', source: 'web', area: 'página /a', severity: 'critico', occurrences: 3, reopened: true, userMessage: '<i>', link: null });
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt; &amp; y');
    expect(html).toContain('Vuelve');
    expect(html).not.toContain('<i>');
  });

  it('el Técnico solo lee código permitido: nunca .env, node_modules ni rutas fuera', () => {
    expect(safeCodePath('lib/ai/gateway.ts')).toBe('lib/ai/gateway.ts');
    expect(safeCodePath('./app/api/errores/route.ts')).toBe('app/api/errores/route.ts');
    for (const bad of ['.env', 'lib/../.env', '/etc/passwd', 'node_modules/x/index.js', 'backups/backup.sql', 'lib/.env.local', '../x.ts', 'lib/x.png']) expect(safeCodePath(bad), bad).toBeNull();
  });

  it('busca y lee código del servidor', async () => {
    expect(await searchCode('registerErrorCapabilities')).toContain('lib/core/errors.ts:');
    expect(await readCode('lib/core/error-rules.ts', 1, 3)).toContain('Registro central de errores');
    expect(await readCode('.env')).toContain('no permitida');
  });

  it('ajustes en rango', () => {
    expect(cleanErrorSettings({ maxDiagnosesPerDay: 99, retentionDays: 1, alertMinSeverity: 'x', alerts: false })).toMatchObject({ maxDiagnosesPerDay: 10, retentionDays: 7, alertMinSeverity: 'error', alerts: false });
  });
});

describe('errores: con la base', () => {
  const SLUG = 'prueba-errores';
  const OTHER = 'prueba-errores-otra';
  let tid = '';
  let other = '';
  const cleanup = async () => {
    const rows = await db.select({ id: tenants.id }).from(tenants).where(inArray(tenants.slug, [SLUG, OTHER]));
    if (rows.length) await db.delete(tenants).where(inArray(tenants.id, rows.map((r) => r.id)));
  };

  beforeAll(async () => {
    await cleanup();
    const [t] = await db.insert(tenants).values({ name: 'Prueba errores', slug: SLUG }).returning();
    const [o] = await db.insert(tenants).values({ name: 'Prueba errores otra', slug: OTHER }).returning();
    tid = t.id;
    other = o.id;
    // Sin avisos ni diagnóstico automático: la app local en marcha no debe gastar IA con estos errores de prueba.
    await saveErrorSettings(tid, { alerts: false, autoDiagnose: false });
    await saveErrorSettings(other, { alerts: false, autoDiagnose: false });
  });
  afterAll(cleanup);

  it('agrupa repeticiones, guarda muestras con contexto y se reabre si vuelve tras resolverse', async () => {
    for (let i = 0; i < 3; i++) {
      reportError({ error: new Error(`Fallo de prueba ${i} con id 8f14e45f-ceea-467a-9575-01234567890${i}`), source: 'pruebas', area: 'agrupar', tenantId: tid, context: { intento: i, apiKey: 'abcdefgh12345' }, actor: 'Tester', channel: 'telegram', userMessage: 'No he podido' });
    }
    await flushErrors();
    const groups = await listErrorGroups(tid, { status: 'todos', source: 'pruebas' });
    expect(groups).toHaveLength(1);
    const g = groups[0];
    expect(g).toMatchObject({ occurrences: 3, status: 'nuevo', severity: 'error', area: 'agrupar' });
    const evs = await errorEvents(g.id);
    expect(evs.length).toBeGreaterThan(0);
    expect(evs[0]).toMatchObject({ actor: 'Tester', channel: 'telegram', userMessage: 'No he podido' });
    expect(JSON.stringify(evs[0].context)).not.toContain('abcdefgh12345');

    expect((await setErrorStatus(tid, g.id, 'resuelto', 'Tester')).ok).toBe(true);
    reportError({ error: new Error('Fallo de prueba 9 con id 8f14e45f-ceea-467a-9575-012345678909'), source: 'pruebas', area: 'agrupar', tenantId: tid, severity: 'critico' });
    await flushErrors();
    const again = await getErrorGroup(tid, g.id);
    expect(again).toMatchObject({ status: 'nuevo', reopenedCount: 1, occurrences: 4, severity: 'critico', resolvedAt: null });
  });

  it('una cuenta no ve los errores de otra', async () => {
    reportError({ message: 'Error solo de la otra cuenta', source: 'pruebas', area: 'aislamiento', tenantId: other });
    await flushErrors();
    const [mine] = await listErrorGroups(other, { status: 'todos', source: 'pruebas' });
    expect(mine).toBeDefined();
    expect(await getErrorGroup(tid, mine.id)).toBeNull();
    expect((await setErrorStatus(tid, mine.id, 'ignorado', 'x')).ok).toBe(false);
    expect((await saveDiagnosis(tid, mine.id, { causa: 'c', arreglo: 'a' })).ok).toBe(false);
  });

  it('diagnóstico guardado pasa a «investigando»; botones solo para el dueño', async () => {
    const [g] = await listErrorGroups(tid, { status: 'todos', source: 'pruebas' });
    const r = await saveDiagnosis(tid, g.id, { causa: 'El adaptador leía solo el primer bloque', evidencia: 'lib/ai/adapters/anthropic.ts:49', arreglo: 'Unir los bloques de texto', archivos: ['lib/ai/adapters/anthropic.ts'], riesgo: 'bajo', confianza: 9 });
    expect(r.ok).toBe(true);
    const d = await getErrorGroup(tid, g.id);
    expect(d?.status).toBe('investigando');
    expect((d?.diagnosis as { confianza: number }).confianza).toBe(9);

    const no = await handleErrorButton({ tenantId: tid, data: `ig:${g.id}`, chatId: '1', by: 'x', isOwner: false });
    expect(no.alert).toBe(true);
    const yes = await handleErrorButton({ tenantId: tid, data: `ig:${g.id}`, chatId: '1', by: 'Enric', isOwner: true });
    expect(yes.keyboard).toBeNull();
    expect((await getErrorGroup(tid, g.id))?.status).toBe('ignorado');
    expect((await handleErrorButton({ tenantId: tid, data: 'zz:nada', chatId: '1', by: 'Enric', isOwner: true })).alert).toBe(true);
  });

  it('cifras, limpieza y diagnóstico automático: el SQL funciona y respeta el tope del día', async () => {
    const stats = await errorStats(tid);
    expect(stats.open + stats.fresh + stats.events24).toBeGreaterThanOrEqual(0);
    const evs0 = await db.select().from(sysErrorEvents).where(eq(sysErrorEvents.tenantId, tid));
    // Una muestra muy antigua se borra; las recientes se quedan.
    await db.update(sysErrorEvents).set({ createdAt: new Date(Date.now() - 400 * 86_400_000) }).where(eq(sysErrorEvents.id, evs0[0].id));
    const r = await runErrorHousekeeping(tid, new Date(Date.now() + 2 * 3_600_000));
    expect(r.purged).toBeGreaterThanOrEqual(1);
    expect(r.diagnosed).toBe(0); // diagnóstico automático apagado en esta cuenta
    const evs1 = await db.select().from(sysErrorEvents).where(eq(sysErrorEvents.tenantId, tid));
    expect(evs1.length).toBe(evs0.length - 1);
    // Con el diagnóstico automático encendido y un creador de trabajos falso: encarga como mucho N al día.
    const created: string[] = [];
    setAgentJobCreator(async (j) => {
      created.push(j.agentKey);
      return { ok: true, id: crypto.randomUUID() };
    });
    try {
      await saveErrorSettings(tid, { autoDiagnose: true, maxDiagnosesPerDay: 1 });
      reportError({ message: 'Error para el diagnóstico automático A', source: 'pruebas', area: 'auto', tenantId: tid });
      reportError({ message: 'Otro error distinto para el diagnóstico B', source: 'pruebas', area: 'auto2', tenantId: tid });
      await flushErrors();
      await db.update(sysErrorGroups).set({ firstSeen: new Date(Date.now() - 10 * 60_000) }).where(eq(sysErrorGroups.tenantId, tid));
      const r2 = await runErrorHousekeeping(tid);
      expect(r2.diagnosed).toBe(1);
      expect(created).toEqual(['mantenimiento']);
      expect((await runErrorHousekeeping(tid)).diagnosed).toBe(0); // tope del día alcanzado
      // Pedirlo otra vez enseguida: ya está en marcha.
      const [g] = (await listErrorGroups(tid, { status: 'todos' })).filter((x) => x.diagnosisRequestedAt);
      expect((await requestDiagnosis(tid, g.id, 'x')).ok).toBe(false);
    } finally {
      await saveErrorSettings(tid, { autoDiagnose: false });
    }
  });

  it('borrar la cuenta borra sus errores (cascada)', async () => {
    const [g] = await listErrorGroups(other, { status: 'todos', source: 'pruebas' });
    await db.delete(tenants).where(eq(tenants.id, other));
    expect(await db.select().from(sysErrorGroups).where(eq(sysErrorGroups.id, g.id))).toHaveLength(0);
    expect(await db.select().from(sysErrorEvents).where(eq(sysErrorEvents.groupId, g.id))).toHaveLength(0);
  });
});
