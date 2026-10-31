'use server';

// Acciones del panel de Automatizaciones: guardar, restaurar, vista previa y «Enviarme una prueba».
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import { opsNotifications } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import {
  DEF,
  getAuto,
  invalidateAutomations,
  logAutomationChange,
  renderTemplate,
  resetAutomation,
  sampleValues,
  saveAutomation,
  validateTemplate,
  type SaveInput
} from '@/lib/operaciones/automations';
import { getOwnerMember } from '@/lib/operaciones/telegram-config';
import { processNotifications } from '@/lib/operaciones/notifications';
import { clampMessage, escapeHtml } from '@/lib/operaciones/telegram';
import { disableWatch, enableWatch } from '@/lib/operaciones/watch';
import { buildStartupText, getLastHeartbeat } from '@/lib/operaciones/startup';

type Res<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error('No autenticado');
  return user;
}

const fail = (e: unknown, fallback: string): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof Error ? e.message : fallback
});

const refresh = () => revalidatePath('/dashboard/operaciones/automatizaciones');

export async function saveAutomationAction(key: string, input: SaveInput): Promise<Res> {
  try {
    const user = await requireUser();
    const res = await saveAutomation(user.tenantId, user.id, key, input);
    refresh();
    return res;
  } catch (e) {
    return fail(e, 'No se pudo guardar');
  }
}

export async function resetAutomationAction(key: string): Promise<Res> {
  try {
    const user = await requireUser();
    await resetAutomation(user.tenantId, user.id, key);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo restaurar');
  }
}

// La vigilancia se enciende con su propia lógica (lectura inicial sin avisar); aquí solo se registra el cambio.
export async function setWatchEnabledAction(enabled: boolean): Promise<Res<{ message: string }>> {
  try {
    const user = await requireUser();
    const before = (await getAuto(user.tenantId, 'watch')).enabled;
    let message = 'Vigilancia desactivada.';
    if (enabled) {
      const r = await enableWatch(user.tenantId);
      if (!r.ok) return r;
      message = `Activada. Se han anotado ${r.baseline} tareas abiertas como punto de partida (no avisan).`;
    } else {
      await disableWatch(user.tenantId);
    }
    if (before !== enabled) {
      await logAutomationChange(user.tenantId, user.id, 'watch', 'enabled', before ? 'encendida' : 'apagada', enabled ? 'encendida' : 'apagada');
    }
    invalidateAutomations(user.tenantId);
    refresh();
    return { ok: true, message };
  } catch (e) {
    return fail(e, 'No se pudo cambiar la vigilancia');
  }
}

// Vista previa de un texto con datos de ejemplo (sin guardar nada).
export async function previewTemplateAction(key: string, template: string): Promise<Res<{ html: string }>> {
  try {
    await requireUser();
    const def = DEF.get(key);
    if (!def?.template) return { ok: false, error: 'Sin texto editable' };
    const err = validateTemplate(def, template);
    if (err) return { ok: false, error: err };
    return { ok: true, html: renderTemplate(def, template.trim(), sampleValues(def)) };
  } catch (e) {
    return fail(e, 'No se pudo generar la vista previa');
  }
}

// «Enviarme una prueba»: llega siempre al Telegram del dueño, con el texto (guardado, o el borrador si se envía)
// rellenado con datos de ejemplo y el mismo código de formato que los avisos reales.
export async function sendAutomationTestAction(key: string, draft?: string): Promise<Res<{ message: string }>> {
  try {
    const user = await requireUser();
    const def = DEF.get(key);
    if (!def) return { ok: false, error: 'Automatización desconocida' };
    const owner = await getOwnerMember(user.tenantId);
    if (!owner?.telegramChatId) return { ok: false, error: 'Tu Telegram aún no está vinculado (Telegram → Vincular).' };
    const auto = await getAuto(user.tenantId, key);

    let body: string;
    if (def.template) {
      const tpl = (draft ?? auto.template).trim();
      const err = validateTemplate(def, tpl);
      if (err) return { ok: false, error: err };
      body = renderTemplate(def, tpl, sampleValues(def));
    } else if (key === 'startup') {
      body = await buildStartupText(user.tenantId, await getLastHeartbeat(user.tenantId));
    } else {
      const cfg = def.fields.map((f) => `• ${escapeHtml(f.label)}: <b>${escapeHtml(String(auto.cfg[f.key]))}</b>${f.unit ? ` ${escapeHtml(f.unit)}` : ''}`);
      body = [escapeHtml(def.testNote ?? ''), `Estado: <b>${auto.enabled ? 'encendida' : 'apagada'}</b>`, ...cfg].filter(Boolean).join('\n');
    }
    await db.insert(opsNotifications).values({
      tenantId: user.tenantId,
      kind: 'test',
      dedupeKey: `test:automation:${key}:${Date.now()}`,
      forClickupUserId: owner.clickupUserId,
      forName: owner.username,
      payload: { text: clampMessage(`🧪 <b>Prueba · ${escapeHtml(def.title)}</b> <i>(datos de ejemplo)</i>\n\n${body}`), testMode: false }
    });
    void processNotifications(user.tenantId);
    return { ok: true, message: 'Prueba en cola: te llegará a Telegram en unos segundos.' };
  } catch (e) {
    return fail(e, 'No se pudo enviar la prueba');
  }
}
