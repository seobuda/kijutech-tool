'use server';

// Acciones web del módulo Rendimiento. Todas comprueban permisos en el servidor:
//   - ver el rendimiento de un cliente, sus hitos, el informe del mes y «Sincronizar ahora»: «edit» (como la ficha);
//   - los ajustes de avisos e informes: «admin».
import { revalidatePath } from 'next/cache';
import { checkPermission, requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { wireApp } from '@/lib/app-wiring';
import { PerfError, deleteAnnotation, saveAnnotation, saveSettings, type AnnotationInput, type SettingsInput } from '@/lib/rendimiento/store';
import { clientPerformance, monthlyClientText, type ClientPerformance } from '@/lib/rendimiento/report';
import { runPerformanceSync } from '@/lib/rendimiento/sync';
import { monthStart, type CompareKey, type PeriodKey } from '@/lib/rendimiento/rules';

type Ok<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown, fallback: string): { ok: false; error: string } => ({ ok: false, error: e instanceof PerfError ? e.userMessage : publicError(e, fallback) });

const PERIODS: PeriodKey[] = ['28', '90', '365', 'all', 'custom'];
const COMPARES: CompareKey[] = ['prev', 'yoy', 'contract', 'none'];
const ymd = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

export async function getClientPerformanceAction(clientId: string, opts: { period?: string; compare?: string; from?: string; to?: string }): Promise<Ok<{ data: ClientPerformance }>> {
  try {
    const user = await requirePermission('edit');
    const isAdmin = (await checkPermission('admin')).ok;
    const data = await clientPerformance(user.tenantId, String(clientId), {
      period: PERIODS.includes(opts.period as PeriodKey) ? (opts.period as PeriodKey) : '28',
      compare: COMPARES.includes(opts.compare as CompareKey) ? (opts.compare as CompareKey) : 'prev',
      from: ymd(opts.from),
      to: ymd(opts.to),
      isAdmin
    });
    if (!data) return { ok: false, error: 'Ese cliente no existe.' };
    return { ok: true, data };
  } catch (e) {
    return fail(e, 'No se pudo cargar el rendimiento');
  }
}

export async function getMonthlyReportAction(clientId: string, month: string): Promise<Ok<{ text: string | null }>> {
  try {
    const user = await requirePermission('edit');
    const m = ymd(`${String(month).slice(0, 7)}-01`);
    if (!m) return { ok: false, error: 'Mes no válido' };
    const isAdmin = (await checkPermission('admin')).ok;
    return { ok: true, text: await monthlyClientText(user.tenantId, String(clientId), monthStart(m), { isAdmin }) };
  } catch (e) {
    return fail(e, 'No se pudo preparar el informe');
  }
}

export async function saveAnnotationAction(clientId: string, input: AnnotationInput): Promise<Ok<{ id: string }>> {
  try {
    const user = await requirePermission('edit');
    const id = await saveAnnotation(user.tenantId, String(clientId), { id: input.id ?? null, date: input.date, kind: input.kind, title: input.title, notes: input.notes, source: 'manual', createdBy: user.id });
    return { ok: true, id };
  } catch (e) {
    return fail(e, 'No se pudo guardar el hito');
  }
}

export async function deleteAnnotationAction(id: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    await deleteAnnotation(user.tenantId, String(id));
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo eliminar el hito');
  }
}

/** «Sincronizar ahora»: descubre las propiedades de la ficha y descarga lo que pueda en unos 20 s; el resto sigue solo. */
export async function resyncClientAction(clientId: string): Promise<Ok<{ units: number; errors: number; pending: number }>> {
  try {
    const user = await requirePermission('edit');
    wireApp();
    const { requestResync } = await import('@/lib/rendimiento/store');
    await requestResync(user.tenantId, String(clientId));
    const r = await runPerformanceSync(user.tenantId, { clientId: String(clientId), force: true, budgetMs: 20_000 });
    return { ok: true, ...r };
  } catch (e) {
    return fail(e, 'No se pudo sincronizar');
  }
}

export async function savePerfSettingsAction(input: SettingsInput): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    await saveSettings(user.tenantId, {
      alertsEnabled: typeof input.alertsEnabled === 'boolean' ? input.alertsEnabled : undefined,
      alertPct: input.alertPct,
      alertRises: typeof input.alertRises === 'boolean' ? input.alertRises : undefined,
      alertMinVolume: input.alertMinVolume,
      monthlyReport: typeof input.monthlyReport === 'boolean' ? input.monthlyReport : undefined,
      weeklySection: typeof input.weeklySection === 'boolean' ? input.weeklySection : undefined
    });
    revalidatePath('/dashboard/rendimiento');
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudieron guardar los ajustes');
  }
}
