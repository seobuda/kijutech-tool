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
//   - una lista simulada con sus estados mapeados (en curso / revisión / listo).
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  opsClickupConnections,
  opsSimEnvironments,
  opsStatusMap,
  opsTelegramConfig,
  opsTelegramMembers,
  tenants
} from '@/lib/db/schema';
import { encrypt } from '@/lib/ai/encryption';
import { SIM_TOKEN_PREFIX } from '@/lib/operaciones/telegram';

export const SIM_OWNER_ID = 'sim-dueno';
export const SIM_EMPLOYEE_ID = 'sim-ia';
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
  if (!conn) {
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

  for (const c of simChats(t)) {
    await db
      .insert(opsTelegramMembers)
      .values({ tenantId: t, clickupUserId: c.clickupUserId, username: c.name, telegramChatId: c.chatId, telegramUsername: c.clickupUserId, linkedAt: new Date(), timezone: 'Europe/Madrid', workStart: '00:00', dailyEnabled: false })
      .onConflictDoUpdate({
        target: [opsTelegramMembers.tenantId, opsTelegramMembers.clickupUserId],
        set: { username: c.name, telegramChatId: c.chatId, linkCode: null, updatedAt: new Date() }
      });
  }

  await db
    .insert(opsStatusMap)
    .values({ tenantId: t, clickupListId: SIM_LIST_ID, inProgressStatus: SIM_STATUSES.inProgress, inReviewStatus: SIM_STATUSES.inReview, doneStatus: SIM_STATUSES.done, edited: true })
    .onConflictDoNothing();
  return env;
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
