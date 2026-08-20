'use server';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiClusteringFeedback, aiIntentModifiers } from '@/lib/db/schema';
import { assertUserInProjectTenant } from '@/lib/seo/actions';
import { getKwClusterById } from '@/lib/seo/kw-queries';
import { wordsOf, extractModifier } from '@/lib/ai/clustering/layers/0-intent-normalizer';

type RecordFeedbackInput = {
  projectId: string;
  jobId?: string;
  feedbackType: string;
  originalValue?: unknown;
  correctedValue?: unknown;
  clusterId?: string;
  keyword?: string;
};

// Igual que captureClusteringFeedback (lib/ai/clustering/feedback/capture.ts)
// para el RAG de la Capa 4, esto es un registro de feedback aparte —
// ai_clustering_feedback, no ai_clustering_examples — pensado para
// alimentar en el futuro el "panel del cerebro" (fuera de alcance en esta
// sesión). Por eso nunca lanza: una llamada mal formada no puede tirar
// abajo la edición de un cluster.
//
// El pedido original incluía `tenantId` en los datos de entrada, pero
// aceptar un tenantId que manda el cliente sin validar sería confiar en
// datos no fiables — se deriva aquí mismo con assertUserInProjectTenant(),
// igual que el resto de Server Actions de este módulo.
export async function recordClusterFeedback(data: RecordFeedbackInput): Promise<void> {
  try {
    const { user } = await assertUserInProjectTenant(data.projectId);

    await db.insert(aiClusteringFeedback).values({
      tenantId: user.tenantId,
      projectId: data.projectId,
      jobId: data.jobId ?? null,
      feedbackType: data.feedbackType,
      originalValue: (data.originalValue ?? null) as object | null,
      correctedValue: (data.correctedValue ?? null) as object | null,
      clusterId: data.clusterId ?? null,
      keyword: data.keyword ?? null,
    });

    if (data.feedbackType === 'intent_changed' && data.clusterId) {
      await maybeCorrectIntentModifier(data.clusterId);
    }
  } catch (err) {
    console.error('recordClusterFeedback falló (ignorado, best-effort):', err);
  }
}

// Reconstruye qué modificador distingue cada keyword del cluster de su
// keyword principal (misma lógica de la Capa 0) y, si ese modificador
// venía de una clasificación de IA sin confirmar por un humano, la
// corrección de intención que acaba de hacer el usuario se toma como señal
// de que la IA se equivocó: el modificador pasa a 'different_intent' con
// source 'human_corrected' y confidence 100. No hay forma de saber con
// certeza CUÁL modificador causó el cambio de intención con la información
// que hay en BD (los ai_jobs no guardan las decisiones de la Capa 0), así
// que se corrigen todos los que aparezcan en el cluster — es una
// aproximación, documentada aquí a propósito.
async function maybeCorrectIntentModifier(clusterId: string): Promise<void> {
  const cluster = await getKwClusterById(clusterId);
  if (!cluster || cluster.keywords.length < 2) return;

  const primary = cluster.keywords.find((k) => k.isPrimary) ?? cluster.keywords[0];
  const rootWords = new Set(wordsOf(primary.keyword));
  if (rootWords.size === 0) return;

  for (const kw of cluster.keywords) {
    if (kw.id === primary.id) continue;
    const modifier = extractModifier(rootWords, kw.keyword);
    if (!modifier) continue;

    const [row] = await db
      .select()
      .from(aiIntentModifiers)
      .where(and(eq(aiIntentModifiers.modifier, modifier), eq(aiIntentModifiers.language, 'es')))
      .limit(1);

    if (row && row.source === 'ai_classified') {
      await db
        .update(aiIntentModifiers)
        .set({ effect: 'different_intent', source: 'human_corrected', confidence: 100, updatedAt: new Date() })
        .where(eq(aiIntentModifiers.id, row.id));
    }
  }
}
