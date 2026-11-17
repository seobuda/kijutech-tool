'use server';

// Acciones de la pantalla Errores (registro central de errores, 17 nov 2026). Todas de administración.
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { wireApp } from '@/lib/app-wiring';
import { errorEvents, getErrorGroup, requestDiagnosis, saveErrorNote, saveErrorSettings, setErrorStatus } from '@/lib/core/errors';
import { fixBrief, STATUSES, type Diagnosis, type ErrorStatus } from '@/lib/core/error-rules';

type Result = { ok: boolean; message: string; error?: string };
// `error` además de `message`: así lo leen las pruebas de seguridad (permiso denegado) igual que el resto de acciones.
const fail = (e: unknown, fallback: string): Result => {
  const m = publicError(e, fallback);
  return { ok: false, message: m, error: m };
};
const id = (v: unknown) => String(v ?? '').slice(0, 40);
const who = (u: { name: string | null; email: string }) => u.name || u.email;

export async function setErrorStatusAction(errorId: string, status: string): Promise<Result> {
  try {
    const user = await requirePermission('admin');
    if (!(STATUSES as string[]).includes(status)) return { ok: false, message: 'Estado no válido.' };
    const r = await setErrorStatus(user.tenantId, id(errorId), status as ErrorStatus, who(user));
    revalidatePath('/dashboard/errores');
    return r;
  } catch (e) {
    return fail(e, 'No se pudo cambiar el estado');
  }
}

export async function saveErrorNoteAction(errorId: string, note: string): Promise<Result> {
  try {
    const user = await requirePermission('admin');
    const r = await saveErrorNote(user.tenantId, id(errorId), String(note ?? ''));
    revalidatePath('/dashboard/errores');
    return r;
  } catch (e) {
    return fail(e, 'No se pudo guardar la nota');
  }
}

export async function requestDiagnosisAction(errorId: string): Promise<Result> {
  try {
    const user = await requirePermission('admin');
    wireApp();
    const r = await requestDiagnosis(user.tenantId, id(errorId), who(user));
    revalidatePath('/dashboard/errores');
    return r;
  } catch (e) {
    return fail(e, 'No se pudo encargar el diagnóstico');
  }
}

export async function saveErrorSettingsAction(values: Record<string, unknown>): Promise<Result> {
  try {
    const user = await requirePermission('admin');
    const v = values ?? {};
    await saveErrorSettings(user.tenantId, {
      alerts: v.alerts,
      alertMinSeverity: v.alertMinSeverity,
      autoDiagnose: v.autoDiagnose,
      maxDiagnosesPerDay: v.maxDiagnosesPerDay,
      retentionDays: v.retentionDays
    });
    revalidatePath('/dashboard/errores');
    return { ok: true, message: 'Ajustes guardados.' };
  } catch (e) {
    return fail(e, 'No se pudieron guardar los ajustes');
  }
}

/** Texto para pasar el error a quien lo arregle (Claude Code): mensaje, traza, contexto y diagnóstico. */
export async function errorBriefAction(errorId: string): Promise<Result & { text?: string }> {
  try {
    const user = await requirePermission('admin');
    const g = await getErrorGroup(user.tenantId, id(errorId));
    if (!g) return { ok: false, message: 'Ese error no existe.' };
    const evs = await errorEvents(g.id, 3);
    const text = fixBrief(
      { title: g.title, source: g.source, area: g.area, severity: g.severity, occurrences: g.occurrences, firstSeen: g.firstSeen.toISOString().slice(0, 16), lastSeen: g.lastSeen.toISOString().slice(0, 16), diagnosis: (g.diagnosis as Diagnosis | null) ?? null },
      evs.map((e) => ({ message: e.message, stack: e.stack, context: e.context, createdAt: e.createdAt.toISOString() }))
    );
    return { ok: true, message: 'Copiado.', text };
  } catch (e) {
    return fail(e, 'No se pudo preparar el texto');
  }
}
