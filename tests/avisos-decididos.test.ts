// Propuesta decidida fuera de Telegram (23 nov 2026): al decidir en Para ti un correo, una propuesta de un agente o un
// bloqueo, su aviso de Telegram pierde los botones y dice qué se hizo. Telegram interceptado; cuenta de pruebas propia.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

const h = vi.hoisted(() => ({
  tenant: '' as string,
  sent: [] as { method: string; params: Record<string, unknown> }[]
}));

vi.mock('@/lib/operaciones/telegram', async (orig) => {
  const m = await orig<typeof import('@/lib/operaciones/telegram')>();
  return {
    ...m,
    tg: vi.fn(async (_token: string, method: string, params: Record<string, unknown> = {}) => {
      h.sent.push({ method, params });
      return true;
    })
  };
});
vi.mock('@/lib/operaciones/telegram-config', async (orig) => {
  const m = await orig<typeof import('@/lib/operaciones/telegram-config')>();
  return {
    ...m,
    getTelegramConfig: async (t: string) => (t === h.tenant ? ({ botToken: 'x' } as unknown as Awaited<ReturnType<typeof m.getTelegramConfig>>) : m.getTelegramConfig(t)),
    decodeBotToken: () => 'TOKEN-DE-PRUEBA'
  };
});

import { db } from '@/lib/db/drizzle';
import { opsNotifications, tenants } from '@/lib/db/schema';
import { closeDecidedNotice } from '@/lib/operaciones/notifications';

const SLUG = 'seg-test-avisos-decididos';
const BUTTONS = [[{ text: '✅ Hacerlo', data: 'at:ok:x' }]];

async function clean() {
  const [t] = await db.select().from(tenants).where(eq(tenants.slug, SLUG));
  if (!t) return;
  await db.delete(opsNotifications).where(eq(opsNotifications.tenantId, t.id));
  await db.delete(tenants).where(eq(tenants.id, t.id));
}

describe('aviso de una propuesta decidida en la web', () => {
  beforeAll(async () => {
    await clean();
    const [t] = await db.insert(tenants).values({ name: 'Pruebas avisos decididos', slug: SLUG }).returning();
    h.tenant = t.id;
    await db.insert(opsNotifications).values([
      { tenantId: t.id, kind: 'digest', dedupeKey: 'at:prop:enviado', chatId: 111, telegramMessageId: 222, status: 'enviado', sentAt: new Date(), payload: { text: 'Propuesta <b>A</b>', sentText: '🧪 cabecera\n\nPropuesta <b>A</b>', toOwner: true, buttons: BUTTONS } },
      { tenantId: t.id, kind: 'email_proposal', dedupeKey: 'email_proposal:pendiente', status: 'pendiente', payload: { text: 'Propuesta B', toOwner: true, buttons: BUTTONS } }
    ]);
  });
  afterAll(clean);

  it('ya enviado: se edita el mensaje, sin botones, conservando lo que se envió y añadiendo qué se hizo', async () => {
    h.sent = [];
    await closeDecidedNotice(h.tenant, 'at:prop:enviado', '✅ Hecho desde la web');
    expect(h.sent).toHaveLength(1);
    const { method, params } = h.sent[0];
    expect(method).toBe('editMessageText');
    expect(params).toMatchObject({ chat_id: 111, message_id: 222, reply_markup: { inline_keyboard: [] } });
    expect(params.text).toBe('🧪 cabecera\n\nPropuesta <b>A</b>\n\n<b>✅ Hecho desde la web</b>');
  });

  it('aún sin enviar: sale ya con la línea y sin botones (no se llama a Telegram ahora)', async () => {
    h.sent = [];
    await closeDecidedNotice(h.tenant, 'email_proposal:pendiente', '✖️ Descartada en la web');
    expect(h.sent).toHaveLength(0);
    const [n] = await db.select().from(opsNotifications).where(eq(opsNotifications.dedupeKey, 'email_proposal:pendiente'));
    const p = n.payload as { text: string; buttons: unknown[] };
    expect(p.text).toBe('Propuesta B\n\n<b>✖️ Descartada en la web</b>');
    expect(p.buttons).toEqual([]);
  });

  it('sin aviso (p. ej. la propuesta iba dentro de una conversación): no hace nada ni falla', async () => {
    h.sent = [];
    await expect(closeDecidedNotice(h.tenant, 'at:prop:no-existe', 'x')).resolves.toBeUndefined();
    expect(h.sent).toHaveLength(0);
  });
});
