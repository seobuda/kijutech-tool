import 'server-only';

// SEO · Avisos de lo grave que nadie vería si no abre el proyecto (simulación del 27 nov: hackeo y caída de tráfico se
// quedaban en un hallazgo). Telegram al dueño (núcleo: telegramOutbound, con clave única: una vez por episodio) y aviso
// del proyecto (emitProjectAlert, lo recoge Estrategia).
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';
import { emitProjectAlert, telegramOutbound } from '@/lib/core/capabilities';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const BASE_URL = () => (process.env.BASE_URL || '').replace(/\/$/, '');

export async function alertSeo(tenantId: string, projectId: string, key: string, title: string, lines: string[], tab = 'salud'): Promise<void> {
  try {
    await send(tenantId, projectId, key, title, lines, tab);
  } catch (e) {
    // Un fallo del aviso nunca tumba el proceso que lo pide (el hallazgo ya está guardado).
    console.error('[seo] aviso:', e instanceof Error ? e.message : e);
  }
}

async function send(tenantId: string, projectId: string, key: string, title: string, lines: string[], tab: string): Promise<void> {
  const [p] = await db.select({ name: projects.name, clientId: projects.clientId }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!p) return;
  const link = BASE_URL() ? `\n<a href="${BASE_URL()}/dashboard/projects/${projectId}/${tab}">Abrir el proyecto</a>` : '';
  await telegramOutbound()
    ?.notifyOwner(tenantId, key.slice(0, 200), `🚨 <b>${esc(p.name)}</b>: ${esc(title)}\n${lines.map((l) => `• ${esc(l)}`).join('\n')}${link}`)
    .catch((e) => console.error('[seo] aviso Telegram:', e instanceof Error ? e.message : e));
  if (p.clientId) await emitProjectAlert({ tenantId, clientId: p.clientId, projectId, title: `${title}`.slice(0, 300), source: 'seo.avisos' }).catch(() => undefined);
}
