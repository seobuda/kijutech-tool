import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  projects,
  seoKwProgress,
  seoOnboardingChecklist,
  seoStageProgress,
  type NewSeoKwProgress
} from '@/lib/db/schema';
import { checkPermission } from '@/lib/auth/permissions';
import { getStageProgress } from '@/lib/seo/queries';
import { getKwStepProgress } from '@/lib/seo/kw-queries';
import { ONBOARDING_CHECKLIST_ITEMS } from '@/lib/seo/onboarding-checklist-items';

/**
 * Funciones INTERNAS de SEO. Viven fuera de los archivos 'use server' a propósito: en un
 * archivo 'use server' cada función exportada es un endpoint que cualquiera con sesión puede
 * invocar desde el navegador. Aquí solo las importa código del servidor (acciones y páginas),
 * y `server-only` hace fallar el build si alguien las importa desde un componente cliente.
 */

export const KW_STEPS = ['competitors', 'keywords', 'clustering', 'clusters'] as const;

// Exige sesión, rol de editor o superior y que el proyecto sea de la cuenta del usuario.
// Todas las acciones de SEO que modifican datos pasan por aquí.
export async function assertUserInProjectTenant(projectId: string) {
  const perm = await checkPermission('edit');
  if (!perm.ok) {
    throw new Error(perm.error === 'No autenticado' ? 'No autenticado' : 'No tienes permiso para modificar SEO');
  }
  const { user } = perm;

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

  // Mismo mensaje para «no existe» y «es de otra cuenta»: no revela qué proyectos existen.
  if (!project || project.tenantId !== user.tenantId) {
    throw new Error('Proyecto no encontrado');
  }

  return { user, project };
}

// Para las páginas: ¿puede esta persona modificar este proyecto? Sin lanzar errores.
async function canEditProject(projectId: string): Promise<boolean> {
  try {
    await assertUserInProjectTenant(projectId);
    return true;
  } catch {
    return false;
  }
}

export async function upsertStageStatus(projectId: string, stageKey: string, status: string) {
  await db
    .insert(seoStageProgress)
    .values({
      projectId,
      stageKey,
      status,
      completedAt: status === 'completed' ? new Date() : null
    })
    .onConflictDoUpdate({
      target: [seoStageProgress.projectId, seoStageProgress.stageKey],
      set: {
        status,
        completedAt: status === 'completed' ? new Date() : null
      }
    });
}

// Las páginas llaman a esto al abrirse. Un lector (o alguien de otra cuenta) no avanza el progreso.
export async function ensureStageInProgress(projectId: string, stageKey: string) {
  if (!(await canEditProject(projectId))) return;
  const progress = await getStageProgress(projectId);
  const current = progress.find((p) => p.stageKey === stageKey);
  if (!current || current.status === 'pending') {
    await upsertStageStatus(projectId, stageKey, 'in_progress');
  }
}

export async function ensureOnboardingInitialized(projectId: string) {
  if (!(await canEditProject(projectId))) return;
  const progress = await getStageProgress(projectId);
  const current = progress.find((p) => p.stageKey === 'onboarding');

  if (!current) {
    // Primera visita a Onboarding para este proyecto: siembra los items
    // fijos una única vez. A partir de aquí, si el usuario elimina uno,
    // no debe volver a aparecer — por eso esto no se repite en visitas
    // posteriores ni tras un "Reiniciar etapa" (que conserva esta fila).
    await db
      .insert(seoOnboardingChecklist)
      .values(
        ONBOARDING_CHECKLIST_ITEMS.map((item) => ({
          projectId,
          itemKey: item.itemKey,
          isCustom: false,
          checked: false
        }))
      )
      .onConflictDoNothing();
  }

  await ensureStageInProgress(projectId, 'onboarding');
}

async function syncKeywordResearchStageStatus(projectId: string) {
  const rows = await db.select().from(seoKwProgress).where(eq(seoKwProgress.projectId, projectId));

  const byStep = new Map(rows.map((r) => [r.step, r]));
  const allCompleted = KW_STEPS.every((step) => byStep.get(step)?.status === 'completed');
  const anyStarted = KW_STEPS.some((step) => {
    const status = byStep.get(step)?.status;
    return status === 'in_progress' || status === 'completed';
  });

  const overallStatus = allCompleted ? 'completed' : anyStarted ? 'in_progress' : 'pending';
  await upsertStageStatus(projectId, 'keyword_research', overallStatus);
}

export async function setKwStepStatus(
  projectId: string,
  step: (typeof KW_STEPS)[number],
  status: string,
  extra: Partial<NewSeoKwProgress> = {}
) {
  await db
    .insert(seoKwProgress)
    .values({
      projectId,
      step,
      status,
      completedAt: status === 'completed' ? new Date() : null,
      ...extra
    })
    .onConflictDoUpdate({
      target: [seoKwProgress.projectId, seoKwProgress.step],
      set: {
        status,
        completedAt: status === 'completed' ? new Date() : null,
        ...extra
      }
    });

  await syncKeywordResearchStageStatus(projectId);
}

export async function ensureKwStepInProgress(projectId: string, step: (typeof KW_STEPS)[number]) {
  if (!(await canEditProject(projectId))) return;
  const current = await getKwStepProgress(projectId, step);
  if (!current || current.status === 'pending') {
    await setKwStepStatus(projectId, step, 'in_progress');
  }
}
