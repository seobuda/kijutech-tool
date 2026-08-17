'use server';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  projects,
  seoAuditFindings,
  seoKickoffAnswers,
  seoOnboardingChecklist,
  seoStageProgress
} from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { getStageProgress } from '@/lib/seo/queries';

async function assertUserInProjectTenant(projectId: string) {
  const user = await getUser();
  if (!user) {
    throw new Error('No autenticado');
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    throw new Error('Proyecto no encontrado');
  }

  if (project.tenantId !== user.tenantId) {
    throw new Error('No autorizado: el proyecto no pertenece a tu tenant');
  }

  return { user, project };
}

export async function saveKickoffAnswers(
  projectId: string,
  answers: { questionKey: string; answer: string }[]
) {
  await assertUserInProjectTenant(projectId);

  for (const { questionKey, answer } of answers) {
    await db
      .insert(seoKickoffAnswers)
      .values({
        projectId,
        questionKey,
        answer,
        answeredAt: new Date()
      })
      .onConflictDoUpdate({
        target: [seoKickoffAnswers.projectId, seoKickoffAnswers.questionKey],
        set: { answer, answeredAt: new Date() }
      });
  }
}

export async function saveAuditFindings(
  projectId: string,
  findings: {
    area: string;
    checkPoint: string;
    status: string | null;
    finding: string | null;
    priority: string | null;
    recommendedAction: string | null;
  }[]
) {
  await assertUserInProjectTenant(projectId);

  for (const f of findings) {
    await db
      .insert(seoAuditFindings)
      .values({
        projectId,
        area: f.area,
        checkPoint: f.checkPoint,
        status: f.status,
        finding: f.finding,
        priority: f.priority,
        recommendedAction: f.recommendedAction
      })
      .onConflictDoUpdate({
        target: [
          seoAuditFindings.projectId,
          seoAuditFindings.area,
          seoAuditFindings.checkPoint
        ],
        set: {
          status: f.status,
          finding: f.finding,
          priority: f.priority,
          recommendedAction: f.recommendedAction
        }
      });
  }
}

async function upsertStageStatus(
  projectId: string,
  stageKey: string,
  status: string
) {
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

export async function markStageComplete(projectId: string, stageKey: string) {
  await assertUserInProjectTenant(projectId);
  await upsertStageStatus(projectId, stageKey, 'completed');
}

export async function markStageInProgress(projectId: string, stageKey: string) {
  await assertUserInProjectTenant(projectId);
  await upsertStageStatus(projectId, stageKey, 'in_progress');
}

export async function ensureStageInProgress(projectId: string, stageKey: string) {
  const progress = await getStageProgress(projectId);
  const current = progress.find((p) => p.stageKey === stageKey);
  if (!current || current.status === 'pending') {
    await markStageInProgress(projectId, stageKey);
  }
}

export async function toggleOnboardingChecklistItem(
  projectId: string,
  itemKey: string,
  checked: boolean
) {
  await assertUserInProjectTenant(projectId);

  await db
    .insert(seoOnboardingChecklist)
    .values({
      projectId,
      itemKey,
      checked,
      checkedAt: checked ? new Date() : null
    })
    .onConflictDoUpdate({
      target: [seoOnboardingChecklist.projectId, seoOnboardingChecklist.itemKey],
      set: {
        checked,
        checkedAt: checked ? new Date() : null
      }
    });
}

export async function resetOnboardingStage(projectId: string) {
  await assertUserInProjectTenant(projectId);

  await upsertStageStatus(projectId, 'onboarding', 'pending');

  await db
    .update(seoOnboardingChecklist)
    .set({ checked: false, checkedAt: null })
    .where(eq(seoOnboardingChecklist.projectId, projectId));
}

function normalizeItemKey(label: string) {
  return label.trim().toLowerCase().replace(/\s+/g, '_');
}

export async function addCustomChecklistItem(projectId: string, label: string) {
  await assertUserInProjectTenant(projectId);

  const itemKey = normalizeItemKey(label);
  if (!itemKey) {
    throw new Error('El nombre de la herramienta no puede estar vacío');
  }

  await db
    .insert(seoOnboardingChecklist)
    .values({
      projectId,
      itemKey,
      isCustom: true,
      checked: false
    })
    .onConflictDoNothing();
}

export async function removeCustomChecklistItem(
  projectId: string,
  itemKey: string
) {
  await assertUserInProjectTenant(projectId);

  await db
    .delete(seoOnboardingChecklist)
    .where(
      and(
        eq(seoOnboardingChecklist.projectId, projectId),
        eq(seoOnboardingChecklist.itemKey, itemKey),
        eq(seoOnboardingChecklist.isCustom, true)
      )
    );
}

export async function resetKickoffStage(projectId: string) {
  await assertUserInProjectTenant(projectId);

  await upsertStageStatus(projectId, 'kickoff', 'pending');

  await db
    .delete(seoKickoffAnswers)
    .where(eq(seoKickoffAnswers.projectId, projectId));
}

export async function resetAuditStage(projectId: string) {
  await assertUserInProjectTenant(projectId);

  await upsertStageStatus(projectId, 'audit', 'pending');

  await db
    .delete(seoAuditFindings)
    .where(eq(seoAuditFindings.projectId, projectId));
}
