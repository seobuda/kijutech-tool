'use server';

import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  projects,
  seoKwClusterKeywords,
  seoKwClusters,
  seoKwCompetitors,
  seoKwProgress,
  seoKwRaw,
  seoShareTokens,
  type NewSeoKwProgress
} from '@/lib/db/schema';
import { assertUserInProjectTenant, upsertStageStatus } from '@/lib/seo/actions';
import { getKwCompetitors, getKwRaw, getKwStepProgress, getShareToken } from '@/lib/seo/kw-queries';
import { buildSeRankingInstructions, buildTutorPrompt } from '@/lib/seo/kw-instructions';

const KW_STEPS = ['competitors', 'keywords', 'clustering', 'clusters'] as const;

async function syncKeywordResearchStageStatus(projectId: string) {
  const rows = await db
    .select()
    .from(seoKwProgress)
    .where(eq(seoKwProgress.projectId, projectId));

  const byStep = new Map(rows.map((r) => [r.step, r]));
  const allCompleted = KW_STEPS.every((step) => byStep.get(step)?.status === 'completed');
  const anyStarted = KW_STEPS.some((step) => {
    const status = byStep.get(step)?.status;
    return status === 'in_progress' || status === 'completed';
  });

  const overallStatus = allCompleted ? 'completed' : anyStarted ? 'in_progress' : 'pending';
  await upsertStageStatus(projectId, 'keyword_research', overallStatus);
}

async function setKwStepStatus(
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

export async function ensureKwStepInProgress(
  projectId: string,
  step: (typeof KW_STEPS)[number]
) {
  const current = await getKwStepProgress(projectId, step);
  if (!current || current.status === 'pending') {
    await setKwStepStatus(projectId, step, 'in_progress');
  }
}

async function markRawKeywordAssigned(projectId: string, keywordText: string) {
  const normalized = keywordText.trim().toLowerCase();
  if (!normalized) {
    return;
  }

  const rows = await db
    .select({ id: seoKwRaw.id, keyword: seoKwRaw.keyword })
    .from(seoKwRaw)
    .where(eq(seoKwRaw.projectId, projectId));

  const match = rows.find((r) => r.keyword.trim().toLowerCase() === normalized);
  if (match) {
    await db.update(seoKwRaw).set({ assigned: true }).where(eq(seoKwRaw.id, match.id));
  }
}

// ---------------------------------------------------------------------------
// Paso 1 — Competidores
// ---------------------------------------------------------------------------

export async function saveTargetKeyword(projectId: string, keyword: string) {
  await assertUserInProjectTenant(projectId);

  const current = await getKwStepProgress(projectId, 'competitors');
  await setKwStepStatus(projectId, 'competitors', current?.status ?? 'in_progress', {
    targetKeyword: keyword
  });
}

async function assertCompetitorAccess(id: string) {
  const [competitor] = await db
    .select()
    .from(seoKwCompetitors)
    .where(eq(seoKwCompetitors.id, id))
    .limit(1);

  if (!competitor) {
    throw new Error('Competidor no encontrado');
  }

  await assertUserInProjectTenant(competitor.projectId);
  return competitor;
}

export async function addKwCompetitor(
  projectId: string,
  data: { name: string; url: string; position: number | null }
) {
  await assertUserInProjectTenant(projectId);

  const progress = await getKwStepProgress(projectId, 'competitors');
  const targetKeyword = progress?.targetKeyword?.trim();
  if (!targetKeyword) {
    throw new Error('Guarda primero la keyword objetivo antes de añadir competidores');
  }

  const existing = await getKwCompetitors(projectId);
  const nextOrder =
    existing.length > 0 ? Math.max(...existing.map((c) => c.order)) + 1 : 0;

  const [competitor] = await db
    .insert(seoKwCompetitors)
    .values({
      projectId,
      name: data.name,
      url: data.url,
      targetKeyword,
      position: data.position,
      order: nextOrder
    })
    .returning();

  await ensureKwStepInProgress(projectId, 'competitors');

  return competitor;
}

export async function updateKwCompetitor(
  id: string,
  data: { name: string; url: string; position: number | null }
) {
  await assertCompetitorAccess(id);

  await db
    .update(seoKwCompetitors)
    .set({ name: data.name, url: data.url, position: data.position })
    .where(eq(seoKwCompetitors.id, id));
}

export async function deleteKwCompetitor(id: string) {
  await assertCompetitorAccess(id);
  await db.delete(seoKwCompetitors).where(eq(seoKwCompetitors.id, id));
}

export async function completeStep1(projectId: string) {
  await assertUserInProjectTenant(projectId);

  const competitors = await getKwCompetitors(projectId);
  if (competitors.length < 3) {
    throw new Error('Necesitas al menos 3 competidores para completar este paso');
  }

  const [project] = await db
    .select({ location: projects.location })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  const instructionsText = buildSeRankingInstructions(
    competitors.map((c) => c.url),
    project?.location ?? null
  );
  await setKwStepStatus(projectId, 'competitors', 'completed', { instructionsText });

  return { instructionsText };
}

export async function resetStep1(projectId: string) {
  await assertUserInProjectTenant(projectId);

  await db.delete(seoKwCompetitors).where(eq(seoKwCompetitors.projectId, projectId));
  await setKwStepStatus(projectId, 'competitors', 'pending', {
    targetKeyword: null,
    instructionsText: null
  });
}

// ---------------------------------------------------------------------------
// Paso 2 — Extracción de keywords
// ---------------------------------------------------------------------------

export async function importKwRaw(projectId: string, rawText: string) {
  await assertUserInProjectTenant(projectId);

  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const existing = await getKwRaw(projectId);
  const existingKeys = new Set(existing.map((r) => r.keyword.trim().toLowerCase()));
  const seenInBatch = new Set<string>();

  const toInsert: { projectId: string; keyword: string; monthlyVolume: number | null }[] = [];

  for (const line of lines) {
    const [kwPart, volPart] = line.split(',').map((p) => p?.trim());
    if (!kwPart) {
      continue;
    }
    const key = kwPart.toLowerCase();
    if (existingKeys.has(key) || seenInBatch.has(key)) {
      continue;
    }
    seenInBatch.add(key);

    let volume: number | null = null;
    if (volPart) {
      const parsed = parseInt(volPart.replace(/\D/g, ''), 10);
      volume = Number.isFinite(parsed) ? parsed : null;
    }

    toInsert.push({ projectId, keyword: kwPart, monthlyVolume: volume });
  }

  let inserted: (typeof seoKwRaw.$inferSelect)[] = [];
  if (toInsert.length > 0) {
    inserted = await db.insert(seoKwRaw).values(toInsert).returning();
  }

  await ensureKwStepInProgress(projectId, 'keywords');

  return inserted;
}

export async function addKwRawManual(
  projectId: string,
  keyword: string,
  volume: number | null
) {
  await assertUserInProjectTenant(projectId);

  const [row] = await db
    .insert(seoKwRaw)
    .values({ projectId, keyword, monthlyVolume: volume })
    .returning();
  await ensureKwStepInProgress(projectId, 'keywords');

  return row;
}

async function assertRawAccess(id: string) {
  const [row] = await db.select().from(seoKwRaw).where(eq(seoKwRaw.id, id)).limit(1);
  if (!row) {
    throw new Error('Keyword no encontrada');
  }
  await assertUserInProjectTenant(row.projectId);
  return row;
}

export async function deleteKwRaw(id: string) {
  await assertRawAccess(id);
  await db.delete(seoKwRaw).where(eq(seoKwRaw.id, id));
}

export async function updateKwRawVolume(id: string, volume: number | null) {
  await assertRawAccess(id);
  await db.update(seoKwRaw).set({ monthlyVolume: volume }).where(eq(seoKwRaw.id, id));
}

export async function completeStep2(projectId: string) {
  await assertUserInProjectTenant(projectId);

  const rawKeywords = await getKwRaw(projectId);
  if (rawKeywords.length < 10) {
    throw new Error('Necesitas al menos 10 keywords para completar este paso');
  }

  const tutorText = buildTutorPrompt(
    rawKeywords.map((k) => ({ keyword: k.keyword, monthlyVolume: k.monthlyVolume }))
  );
  await setKwStepStatus(projectId, 'keywords', 'completed', { tutorText });

  return { tutorText };
}

export async function resetStep2(projectId: string) {
  await assertUserInProjectTenant(projectId);

  await db.delete(seoKwRaw).where(eq(seoKwRaw.projectId, projectId));
  await setKwStepStatus(projectId, 'keywords', 'pending', { tutorText: null });
}

// ---------------------------------------------------------------------------
// Paso 3 — Clustering con IA
// ---------------------------------------------------------------------------

export async function saveStep3Notes(projectId: string, notes: string) {
  await assertUserInProjectTenant(projectId);

  const current = await getKwStepProgress(projectId, 'clustering');
  await setKwStepStatus(projectId, 'clustering', current?.status ?? 'in_progress', { notes });
}

export async function completeStep3(projectId: string) {
  await assertUserInProjectTenant(projectId);
  await setKwStepStatus(projectId, 'clustering', 'completed');
}

export async function resetStep3(projectId: string) {
  await assertUserInProjectTenant(projectId);
  await setKwStepStatus(projectId, 'clustering', 'pending', { notes: null });
}

// ---------------------------------------------------------------------------
// Paso 4 — Mapa de clusters
// ---------------------------------------------------------------------------

type ClusterInput = {
  title: string;
  targetUrl: string | null;
  difficulty: string | null;
  priority: number;
  notes: string | null;
  clientNote: string | null;
};

async function assertClusterAccess(id: string) {
  const [cluster] = await db
    .select()
    .from(seoKwClusters)
    .where(eq(seoKwClusters.id, id))
    .limit(1);

  if (!cluster) {
    throw new Error('Cluster no encontrado');
  }

  await assertUserInProjectTenant(cluster.projectId);
  return cluster;
}

export async function createKwCluster(projectId: string, data: ClusterInput) {
  await assertUserInProjectTenant(projectId);

  const [cluster] = await db
    .insert(seoKwClusters)
    .values({ projectId, ...data })
    .returning();
  await ensureKwStepInProgress(projectId, 'clusters');

  return { ...cluster, keywords: [] };
}

export async function updateKwCluster(id: string, data: ClusterInput) {
  await assertClusterAccess(id);
  const [cluster] = await db
    .update(seoKwClusters)
    .set(data)
    .where(eq(seoKwClusters.id, id))
    .returning();
  return cluster;
}

export async function deleteKwCluster(id: string) {
  await assertClusterAccess(id);
  await db.delete(seoKwClusters).where(eq(seoKwClusters.id, id));
}

export async function updateKwClusterStatus(id: string, status: string) {
  await assertClusterAccess(id);
  await db.update(seoKwClusters).set({ status }).where(eq(seoKwClusters.id, id));
}

export async function updateClientNote(clusterId: string, note: string) {
  await assertClusterAccess(clusterId);
  await db.update(seoKwClusters).set({ clientNote: note }).where(eq(seoKwClusters.id, clusterId));
}

async function assertClusterKeywordAccess(id: string) {
  const [row] = await db
    .select()
    .from(seoKwClusterKeywords)
    .where(eq(seoKwClusterKeywords.id, id))
    .limit(1);

  if (!row) {
    throw new Error('Keyword no encontrada');
  }

  const cluster = await assertClusterAccess(row.clusterId);
  return { row, cluster };
}

export async function addClusterKeyword(
  clusterId: string,
  data: { keyword: string; monthlyVolume: number | null; isPrimary: boolean }
) {
  const cluster = await assertClusterAccess(clusterId);

  const keyword = await db.transaction(async (tx) => {
    if (data.isPrimary) {
      await tx
        .update(seoKwClusterKeywords)
        .set({ isPrimary: false })
        .where(eq(seoKwClusterKeywords.clusterId, clusterId));
    }
    const [row] = await tx
      .insert(seoKwClusterKeywords)
      .values({
        clusterId,
        keyword: data.keyword,
        monthlyVolume: data.monthlyVolume,
        isPrimary: data.isPrimary
      })
      .returning();
    return row;
  });

  await markRawKeywordAssigned(cluster.projectId, data.keyword);

  return keyword;
}

export async function updateClusterKeyword(
  id: string,
  data: { keyword: string; monthlyVolume: number | null; isPrimary: boolean }
) {
  const { row, cluster } = await assertClusterKeywordAccess(id);

  const updated = await db.transaction(async (tx) => {
    if (data.isPrimary) {
      await tx
        .update(seoKwClusterKeywords)
        .set({ isPrimary: false })
        .where(eq(seoKwClusterKeywords.clusterId, row.clusterId));
    }
    const [updatedRow] = await tx
      .update(seoKwClusterKeywords)
      .set(data)
      .where(eq(seoKwClusterKeywords.id, id))
      .returning();
    return updatedRow;
  });

  await markRawKeywordAssigned(cluster.projectId, data.keyword);

  return updated;
}

export async function deleteClusterKeyword(id: string) {
  await assertClusterKeywordAccess(id);
  await db.delete(seoKwClusterKeywords).where(eq(seoKwClusterKeywords.id, id));
}

export async function completeStep4(projectId: string) {
  await assertUserInProjectTenant(projectId);
  await setKwStepStatus(projectId, 'clusters', 'completed');
}

export async function resetStep4(projectId: string) {
  await assertUserInProjectTenant(projectId);

  await db.delete(seoKwClusters).where(eq(seoKwClusters.projectId, projectId));
  await setKwStepStatus(projectId, 'clusters', 'pending');
}

export async function generateShareToken(projectId: string) {
  await assertUserInProjectTenant(projectId);

  const existing = await getShareToken(projectId);
  if (existing) {
    return existing.token;
  }

  const token = randomUUID();
  await db
    .insert(seoShareTokens)
    .values({ projectId, token })
    .onConflictDoNothing({ target: seoShareTokens.projectId });

  const row = await getShareToken(projectId);
  return row!.token;
}
