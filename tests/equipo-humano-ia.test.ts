import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, like } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsTeamAvatars, opsTeamProfiles } from '@/lib/db/schema';
import { cleanupFixtures, createFixtures, loginAs, PREFIX, type Fixtures } from './fixtures';
import { parseAvatar, sniffMime, AVATAR_MAX_BYTES } from '@/lib/equipo/avatar-rules';
import { activityOf, decisionText, getActivityToday, hueOf, initialsOf, webEventText, workEventText, type ActivityItem } from '@/lib/equipo/team';
import { removeAvatar, setAvatar, setPersonDepartment } from '@/lib/equipo/actions';
import { GET as getAvatar } from '@/app/api/equipo/avatar/route';

// Equipo humano + IA (fase 3 UX, 21 nov 2026): fotos, departamento de las personas y quién puede cambiarlos.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const pngUrl = `data:image/png;base64,${PNG.toString('base64')}`;

describe('Fotos: qué imagen se acepta', () => {
  it('reconoce WebP, PNG y JPEG por su contenido', () => {
    expect(sniffMime(PNG)).toBe('image/png');
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffMime(Buffer.from('RIFF0000WEBPVP8 '))).toBe('image/webp');
    expect(sniffMime(Buffer.from('<svg></svg>'))).toBeNull();
  });

  it('acepta una imagen válida y rechaza lo demás', () => {
    expect(parseAvatar(pngUrl).ok).toBe(true);
    expect(parseAvatar('data:image/svg+xml;base64,PHN2Zz4=').ok).toBe(false); // SVG no (puede llevar código)
    expect(parseAvatar(`data:image/jpeg;base64,${PNG.toString('base64')}`).ok).toBe(false); // dice JPEG y es PNG
    expect(parseAvatar(`data:image/png;base64,${Buffer.alloc(AVATAR_MAX_BYTES + 1, 0x89).toString('base64')}`).ok).toBe(false);
    expect(parseAvatar(42).ok).toBe(false);
  });
});

describe('Organigrama: iniciales, color y actividad', () => {
  it('iniciales y color estables', () => {
    expect(initialsOf('Eury Genaro')).toBe('EG');
    expect(initialsOf('Jesús')).toBe('J');
    expect(hueOf('Mayelin')).toBe(hueOf('Mayelin'));
    expect(hueOf('Mayelin')).toBeGreaterThanOrEqual(0);
  });

  it('la actividad de un agente va por su clave y la de una persona por su ClickUp o su nombre', () => {
    const at = new Date();
    const items: ActivityItem[] = [
      { key: '1', at, who: 'Revisor web', whoKind: 'agente', text: 'entregó', clickupUserId: null, agentKey: 'revisor_web' },
      { key: '2', at, who: 'Jesús', whoKind: 'persona', text: 'empezó', clickupUserId: '77', agentKey: null },
      { key: '3', at, who: 'Mayelin', whoKind: 'persona', text: 'terminó', clickupUserId: null, agentKey: null }
    ];
    expect(activityOf(items, { name: 'Revisor web', clickupUserId: null, agentKey: 'revisor_web' }).map((i) => i.key)).toEqual(['1']);
    expect(activityOf(items, { name: 'Jesús', clickupUserId: '77', agentKey: null }).map((i) => i.key)).toEqual(['2']);
    expect(activityOf(items, { name: 'Mayelin', clickupUserId: null, agentKey: null }).map((i) => i.key)).toEqual(['3']);
  });
});

describe('Equipo: permisos de fotos y departamentos', () => {
  let fx: Fixtures;
  let profileId: string;
  beforeAll(async () => {
    fx = await createFixtures();
    const [p] = await db
      .insert(opsTeamProfiles)
      .values({ tenantId: fx.kijutechTenantId, name: `${PREFIX}persona`, clickupUserId: `${PREFIX}cu`, userId: fx.users.lector.id })
      .returning({ id: opsTeamProfiles.id });
    profileId = p.id;
  });
  afterAll(async () => {
    await loginAs(null);
    await db.delete(opsTeamProfiles).where(and(eq(opsTeamProfiles.tenantId, fx.kijutechTenantId), like(opsTeamProfiles.name, `${PREFIX}%`)));
    await cleanupFixtures();
  });

  it('un editor no puede cambiar la foto de otra persona ni su departamento', async () => {
    await loginAs(fx.users.editor);
    expect((await setAvatar('persona', profileId, pngUrl)).ok).toBe(false);
    expect((await setPersonDepartment(profileId, 'operaciones')).ok).toBe(false);
  });

  it('la propia persona sí puede cambiar su foto (aunque sea lector), pero no la de un agente', async () => {
    await loginAs(fx.users.lector);
    expect((await setAvatar('persona', profileId, pngUrl)).ok).toBe(true);
    expect((await setAvatar('agente', profileId, pngUrl)).ok).toBe(false);
  });

  it('la foto solo se sirve con sesión y dentro de la misma cuenta', async () => {
    const req = () => new Request(`http://x/api/equipo/avatar?tipo=persona&id=${profileId}`);
    await loginAs(null);
    expect((await getAvatar(req())).status).toBe(403);
    await loginAs(fx.users.otraCuenta);
    expect((await getAvatar(req())).status).toBe(404);
    await loginAs(fx.users.editor);
    const ok = await getAvatar(req());
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Content-Type')).toBe('image/png');
  });

  it('admin cambia el departamento (y rechaza uno que no existe) y quita la foto', async () => {
    await loginAs(fx.users.admin);
    expect((await setPersonDepartment(profileId, 'no_existe')).ok).toBe(false);
    expect((await setPersonDepartment(profileId, 'operaciones')).ok).toBe(true);
    const [p] = await db.select({ d: opsTeamProfiles.departmentKey }).from(opsTeamProfiles).where(eq(opsTeamProfiles.id, profileId));
    expect(p.d).toBe('operaciones');
    expect((await removeAvatar('persona', profileId)).ok).toBe(true);
    expect(await db.select().from(opsTeamAvatars).where(eq(opsTeamAvatars.profileId, profileId))).toHaveLength(0);
  });
});

// 23 nov 2026: la actividad del día también enseña la jornada y lo que se hace desde la web.
describe('Actividad del día: jornada y acciones web', () => {
  const w = (kind: string, source = 'telegram', extra: Partial<Parameters<typeof workEventText>[0]> = {}) =>
    workEventText({ kind, task: null, plannedMinutes: null, source, createdByName: null, ...extra });

  it('cada fichaje tiene su frase, y se distingue lo automático y lo anotado en la web', () => {
    expect(w('entrada', 'telegram', { task: 'Informe' })).toBe('empezó la jornada con «Informe»');
    expect(w('descanso', 'telegram', { plannedMinutes: 10 })).toBe('se tomó un descanso de 10 min');
    expect(w('vuelta')).toBe('volvió al trabajo');
    expect(w('salida', 'auto')).toBe('se le cerró la jornada automáticamente');
    expect(w('salida', 'web', { createdByName: 'Enric' })).toBe('terminó la jornada (anotado en la web por Enric)');
    expect(w('desconocido')).toBeNull();
  });

  it('acciones web: bloqueos respondidos, fichas y calendario; lo demás no sale', () => {
    expect(webEventText('owner_replied', null, 'Subir el blog')).toBe('respondió al bloqueo de «Subir el blog»');
    expect(webEventText('ficha_cliente', { client: 'Indautxu' }, null)).toBe('actualizó la ficha de Indautxu');
    expect(webEventText('calendario', { action: 'remove', name: 'Festivo' }, null)).toBe('quitó «Festivo» del calendario');
    expect(webEventText('autonomia', {}, null)).toBeNull();
  });

  it('decisiones sobre propuestas: quién y por dónde; lo no decidido no sale', () => {
    expect(decisionText('rechazado', 'panel', 'Apuntar algo')).toBe('descartó desde la web: Apuntar algo');
    expect(decisionText('aprobado', 'telegram', 'Responder al cliente')).toBe('aprobó por Telegram: Responder al cliente');
    expect(decisionText('propuesto', 'panel', 'x')).toBeNull();
  });

  it('la consulta del día funciona contra la base de datos', async () => {
    const [kiju] = await db.select({ id: opsTeamProfiles.tenantId }).from(opsTeamProfiles).limit(1);
    if (!kiju) return;
    const items = await getActivityToday(kiju.id, { limit: 20 });
    expect(Array.isArray(items)).toBe(true);
    for (let i = 1; i < items.length; i++) expect(items[i - 1].at.getTime()).toBeGreaterThanOrEqual(items[i].at.getTime());
  });
});
