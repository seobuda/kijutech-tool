'use server';

// SEO · acciones del análisis inicial (docs/PLAN-SEO-JEFE.md, D0). «Empezar análisis» y «Avanzar ahora»: edición.
// «Continuar sin esto» (saltar una conexión imprescindible o una etapa): solo administradores (decisión de Enric).
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { advance, SetupError, skipItem, startAnalysis } from '@/lib/seo/arranque/arranque';

type Ok = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (e: unknown): Ok => ({ ok: false, error: e instanceof SetupError ? e.userMessage : publicError(e, 'No se pudo completar la acción') });
const paths = (id: string) => {
  revalidatePath(`/dashboard/projects/${id}/resumen`);
  revalidatePath(`/dashboard/projects/${id}/expediente`);
};

async function ownProject(tenantId: string, projectId: string): Promise<boolean> {
  if (!UUID.test(projectId)) return false;
  const [p] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  return Boolean(p);
}

export async function startAnalysisAction(projectId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    const r = await startAnalysis(user.tenantId, projectId, user.name || user.email);
    paths(projectId);
    return { ok: true, message: r.created ? 'Análisis en marcha: avanza solo cada 10 minutos y se para donde falte algo.' : 'El análisis ya estaba en marcha: se ha dado un empujón.' };
  } catch (e) {
    return fail(e);
  }
}

export async function advanceNowAction(projectId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    const pushed = await advance(user.tenantId, projectId);
    paths(projectId);
    return { ok: true, message: pushed.length ? `Empujado: ${pushed.join(', ')}.` : 'Nada que empujar ahora: lo que está en curso sigue su ritmo.' };
  } catch (e) {
    return fail(e);
  }
}

export async function skipSetupItemAction(projectId: string, key: string, reason: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    const why = String(reason ?? '').trim();
    if (why.length < 3) return { ok: false, error: 'Escribe por qué se continúa sin esto (queda apuntado).' };
    await skipItem(user.tenantId, projectId, String(key ?? ''), user.name || user.email, why);
    await advance(user.tenantId, projectId).catch(() => []);
    paths(projectId);
    return { ok: true, message: 'Apuntado: el análisis continúa sin esto.' };
  } catch (e) {
    return fail(e);
  }
}
