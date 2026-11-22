import 'server-only';
// Entorno de pruebas (19 nov 2026): una cuenta (tenant) aparte, dueña de todo lo simulado. Así nada de lo que pase en
// las pruebas aparece en los resúmenes, informes, Equipo hoy, piloto o plazos de la cuenta real: la plataforma ya
// separa los datos por cuenta (y las pruebas de seguridad lo comprueban).
//
// Qué tiene la cuenta de pruebas:
//   - bot de Telegram con token centinela «SIM:<id>» y modo «simulado»: tg() lo manda al simulador (nunca a internet);
//     la escucha, el webhook y el planificador lo ignoran;
//   - «ClickUp» con token centinela «SIM:…»: cuFetch() falla al momento sin salir a internet;
//   - IA bloqueada (ai_key_mode_allowed = byok_required sin clave propia): ninguna función de IA puede llamar fuera;
//   - dos miembros simulados ya vinculados: «Kiju IA (pruebas)» (empleado) y «Dueño (simulado)»;
//   - una lista simulada con sus estados mapeados (en curso / revisión / listo);
//   - ficha de Equipo del empleado simulado (todos los días, sin comida ni silencio) y un tipo de tarea con margen, para
//     las pruebas de jornada y tiempos. Jornada y tiempos están APAGADAS en la cuenta de pruebas: solo las encienden
//     sus escenarios mientras corren (y las apagan al terminar).
import { randomBytes } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { hashPassword } from '@/lib/auth/session';
import {
  roles,
  userRoles,
  users,
  opsClickupConnections,
  opsSimEnvironments,
  opsStatusMap,
  opsTeamProfiles,
  opsTelegramConfig,
  opsTelegramMembers,
  opsWorkTypes,
  tenants
} from '@/lib/db/schema';
import { encrypt } from '@/lib/ai/encryption';
import { SIM_TOKEN_PREFIX } from '@/lib/operaciones/telegram';

// Ids NUMÉRICOS, como los de ClickUp: los botones de jornada y tiempos (jw:…, tt:…, ttu:…) solo aceptan dígitos. Viven en
// la cuenta de pruebas, así que no pueden chocar con una persona real. Hasta el 19 nov eran «sim-dueno» / «sim-ia»
// (ensureSimEnvironment los sustituye).
export const SIM_OWNER_ID = '9000001';
export const SIM_EMPLOYEE_ID = '9000002';
const OLD_SIM_IDS = ['sim-dueno', 'sim-ia'];
export const SIM_WORK_TYPE = { key: 'sim-tarea', label: 'Tarea de prueba', minMinutes: 5, maxMinutes: 20 };
export const SIM_LIST_ID = 'sim-lista';
export const SIM_LIST_NAME = 'Pruebas simuladas';
export const SIM_STATUSES = { inProgress: 'en curso', inReview: 'revisión', done: 'listo' };

// Números de chat NEGATIVOS y propios de cada entorno: un chat privado real de Telegram nunca es negativo, y algunas
// tablas (ops_telegram_pending) se indexan solo por chat. Así un chat simulado no puede coincidir con una persona real
// ni con otro entorno.
export function simChatIds(simTenantId: string): { owner: number; employee: number } {
  const n = parseInt(simTenantId.replace(/-/g, '').slice(0, 7), 16);
  return { owner: -(n * 10 + 1), employee: -(n * 10 + 2) };
}

export type SimChat = { key: 'employee' | 'owner'; chatId: number; clickupUserId: string; name: string; role: string };
export function simChats(simTenantId: string): SimChat[] {
  const ids = simChatIds(simTenantId);
  return [
    { key: 'employee', chatId: ids.employee, clickupUserId: SIM_EMPLOYEE_ID, name: 'Kiju IA (pruebas)', role: 'Empleado del equipo (IA de pruebas)' },
    { key: 'owner', chatId: ids.owner, clickupUserId: SIM_OWNER_ID, name: 'Dueño (simulado)', role: 'Quien lleva las operaciones (simulado)' }
  ];
}

export type SimEnv = { ownerTenantId: string; simTenantId: string };

export async function getSimEnvironment(ownerTenantId: string): Promise<SimEnv | null> {
  const [row] = await db.select().from(opsSimEnvironments).where(eq(opsSimEnvironments.tenantId, ownerTenantId)).limit(1);
  return row ? { ownerTenantId, simTenantId: row.simTenantId } : null;
}

/** ¿Es esta cuenta un entorno de pruebas? (Para que nada «real» la trate como una cuenta más.) */
export async function isSimTenant(tenantId: string): Promise<boolean> {
  const [row] = await db.select({ id: opsSimEnvironments.id }).from(opsSimEnvironments).where(eq(opsSimEnvironments.simTenantId, tenantId)).limit(1);
  return Boolean(row);
}

/** Crea el entorno la primera vez y repara lo que falte (idempotente). */
export async function ensureSimEnvironment(ownerTenantId: string): Promise<SimEnv> {
  let env = await getSimEnvironment(ownerTenantId);
  if (!env) {
    const [owner] = await db.select({ slug: tenants.slug, name: tenants.name }).from(tenants).where(eq(tenants.id, ownerTenantId)).limit(1);
    if (!owner) throw new Error('La cuenta no existe');
    const [sim] = await db
      .insert(tenants)
      .values({ name: `${owner.name} · pruebas`.slice(0, 100), slug: `${owner.slug}-pruebas`.slice(0, 100), plan: 'internal', aiKeyModeAllowed: 'byok_required' })
      .returning({ id: tenants.id });
    await db.insert(opsSimEnvironments).values({ tenantId: ownerTenantId, simTenantId: sim.id }).onConflictDoNothing();
    env = (await getSimEnvironment(ownerTenantId))!;
  }
  const t = env.simTenantId;
  const token = `${SIM_TOKEN_PREFIX}${t}`;

  // La IA siempre bloqueada en la cuenta de pruebas, aunque alguien la cambie.
  await db.update(tenants).set({ aiKeyModeAllowed: 'byok_required' }).where(eq(tenants.id, t));

  const [conn] = await db.select({ id: opsClickupConnections.id }).from(opsClickupConnections).where(eq(opsClickupConnections.tenantId, t)).limit(1);
  if (conn) {
    await db.update(opsClickupConnections).set({ meClickupId: SIM_OWNER_ID }).where(eq(opsClickupConnections.tenantId, t));
  } else {
    const k = encrypt(token);
    await db.insert(opsClickupConnections).values({
      tenantId: t,
      apiKeyEncrypted: k.encrypted,
      apiKeyIv: k.iv,
      workspaceId: 'sim',
      workspaceName: 'ClickUp simulado',
      meClickupId: SIM_OWNER_ID,
      meUsername: 'Dueño (simulado)'
    });
  }

  const [cfg] = await db.select({ id: opsTelegramConfig.id }).from(opsTelegramConfig).where(eq(opsTelegramConfig.tenantId, t)).limit(1);
  if (!cfg) {
    const k = encrypt(token);
    await db.insert(opsTelegramConfig).values({
      tenantId: t,
      botTokenEncrypted: k.encrypted,
      botTokenIv: k.iv,
      botUsername: 'kiju_simulado_bot',
      botName: 'Bot simulado',
      testMode: false,
      receiveMode: 'simulado'
    });
  } else {
    // Nunca puede pasar a escuchar Telegram de verdad.
    await db.update(opsTelegramConfig).set({ receiveMode: 'simulado', webhookUrl: null, testMode: false }).where(eq(opsTelegramConfig.tenantId, t));
  }

  // Miembros con los ids antiguos (no numéricos): fuera, para que cada chat simulado sea de una sola persona.
  await db.delete(opsTelegramMembers).where(and(eq(opsTelegramMembers.tenantId, t), inArray(opsTelegramMembers.clickupUserId, OLD_SIM_IDS)));
  await db.delete(opsTeamProfiles).where(and(eq(opsTeamProfiles.tenantId, t), inArray(opsTeamProfiles.clickupUserId, OLD_SIM_IDS)));
  for (const c of simChats(t)) {
    await db
      .insert(opsTelegramMembers)
      .values({ tenantId: t, clickupUserId: c.clickupUserId, username: c.name, telegramChatId: c.chatId, telegramUsername: c.clickupUserId, linkedAt: new Date(), timezone: 'Europe/Madrid', workStart: '00:00', dailyEnabled: false })
      .onConflictDoUpdate({
        target: [opsTelegramMembers.tenantId, opsTelegramMembers.clickupUserId],
        set: { username: c.name, telegramChatId: c.chatId, linkCode: null, updatedAt: new Date() }
      });
  }

  // Ficha del empleado simulado: trabaja todos los días, sin comida ni horas de silencio (nada retiene sus avisos). Los
  // escenarios de jornada ajustan su hora de entrada.
  await db
    .insert(opsTeamProfiles)
    .values({ tenantId: t, clickupUserId: SIM_EMPLOYEE_ID, name: 'Kiju IA (pruebas)', jobTitle: 'Empleado simulado', workDays: '1,2,3,4,5,6,7', workStart: '00:00', hoursPerDay: '8', timezone: 'Europe/Madrid' })
    .onConflictDoNothing();
  await db
    .insert(opsWorkTypes)
    .values({ tenantId: t, key: SIM_WORK_TYPE.key, label: SIM_WORK_TYPE.label, minMinutes: SIM_WORK_TYPE.minMinutes, maxMinutes: SIM_WORK_TYPE.maxMinutes })
    .onConflictDoNothing();

  await db
    .insert(opsStatusMap)
    .values({ tenantId: t, clickupListId: SIM_LIST_ID, inProgressStatus: SIM_STATUSES.inProgress, inReviewStatus: SIM_STATUSES.inReview, doneStatus: SIM_STATUSES.done, edited: true })
    .onConflictDoNothing();
  return env;
}

// --- Usuarios de la cuenta de pruebas (22 nov 2026) -----------------------------------------------------------------
// Las pruebas «pantallas-*» recorren las pantallas con una sesión de cada rol. Tres usuarios, uno por rol, NUNCA
// super_admin: hoy un super_admin de cualquier cuenta puede cambiar ajustes de toda la plataforma (riesgo S2/S3 de la
// revisión del 17 nov). Nadie conoce su contraseña (aleatoria y descartada al crearla): no se puede entrar con ellos por
// el formulario; solo el servidor les abre sesión, dentro de una prueba.
export const SIM_USER_ROLES = ['admin', 'editor', 'lector'] as const;
export type SimUserRole = (typeof SIM_USER_ROLES)[number];

export function simUserEmail(simTenantId: string, role: SimUserRole): string {
  return `pruebas-${role}@${simTenantId.replace(/-/g, '').slice(0, 12)}.pruebas.invalid`;
}

/** Crea (si faltan) los tres usuarios de la cuenta de pruebas con su rol, y quita cualquier super_admin de esa cuenta. */
export async function ensureSimUsers(simTenantId: string): Promise<Record<SimUserRole, number>> {
  if (!(await isSimTenant(simTenantId))) throw new Error('Solo se crean usuarios de prueba en una cuenta de pruebas');
  const roleRows = await db.select({ id: roles.id, name: roles.name }).from(roles);
  const roleId = (name: string) => roleRows.find((r) => r.name === name)?.id ?? null;
  const out = {} as Record<SimUserRole, number>;
  for (const role of SIM_USER_ROLES) {
    const rid = roleId(role);
    if (!rid) throw new Error(`Falta el rol ${role}`);
    const email = simUserEmail(simTenantId, role);
    let [u] = await db.select({ id: users.id, tenantId: users.tenantId }).from(users).where(eq(users.email, email)).limit(1);
    if (!u) {
      const passwordHash = await hashPassword(randomBytes(32).toString('base64url'));
      [u] = await db
        .insert(users)
        .values({ tenantId: simTenantId, email, name: `Pruebas · ${role}`, passwordHash, role: 'member' })
        .onConflictDoNothing()
        .returning({ id: users.id, tenantId: users.tenantId });
      if (!u) [u] = await db.select({ id: users.id, tenantId: users.tenantId }).from(users).where(eq(users.email, email)).limit(1);
    }
    if (!u || u.tenantId !== simTenantId) throw new Error(`El usuario de pruebas ${role} no es de la cuenta de pruebas`);
    // Exactamente un rol de cuenta: el suyo.
    const current = await db.select({ id: userRoles.id, roleId: userRoles.roleId }).from(userRoles).where(and(eq(userRoles.userId, u.id), isNull(userRoles.projectId)));
    const wrong = current.filter((r) => r.roleId !== rid).map((r) => r.id);
    if (wrong.length) await db.delete(userRoles).where(inArray(userRoles.id, wrong));
    if (!current.some((r) => r.roleId === rid)) await db.insert(userRoles).values({ userId: u.id, roleId: rid });
    out[role] = u.id;
  }
  // Ningún super_admin en la cuenta de pruebas, aunque alguien lo asigne a mano.
  const superId = roleId('super_admin');
  if (superId) {
    const simUserIds = db.select({ id: users.id }).from(users).where(eq(users.tenantId, simTenantId));
    await db.delete(userRoles).where(and(eq(userRoles.roleId, superId), inArray(userRoles.userId, simUserIds)));
  }
  return out;
}

/** Token del bot simulado (el mismo valor que guarda cifrado ops_telegram_config). */
export const simBotToken = (simTenantId: string) => `${SIM_TOKEN_PREFIX}${simTenantId}`;

/** El tenant de un token centinela «SIM:<id>» (el simulador lo usa para saber de qué cuenta es cada mensaje). */
export function simTenantFromToken(token: string): string | null {
  if (!token.startsWith(SIM_TOKEN_PREFIX)) return null;
  const id = token.slice(SIM_TOKEN_PREFIX.length);
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export async function simMember(simTenantId: string, clickupUserId: string) {
  const [m] = await db
    .select()
    .from(opsTelegramMembers)
    .where(and(eq(opsTelegramMembers.tenantId, simTenantId), eq(opsTelegramMembers.clickupUserId, clickupUserId)))
    .limit(1);
  return m ?? null;
}
