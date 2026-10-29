import fs from 'fs';
import { and, asc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import { opsNoteAudios, opsRequests } from '@/lib/db/schema';
import { getClickUpToken } from '@/lib/operaciones/queries';
import { attachFileToTask, createTask, findTaskByMarker } from '@/lib/operaciones/clickup';
import { enqueueNewRequestNotification } from '@/lib/operaciones/notifications';

export type SyncResult =
  | { ok: true; requestId: string; taskUrl: string; reused: boolean }
  | { ok: false; requestId: string; error: string };

// Solo desarrollo: fuerza un fallo para probar el reintento.
//  - "before": falla antes de llamar a ClickUp (no se crea nada).
//  - "after":  ClickUp CREA la tarea pero se pierde la confirmación; el
//              reintento debe encontrarla por su marca y no duplicarla.
// Se activa con la variable OPS_SIMULATE_FAILURE o, sin tocar la config de
// Docker, creando el archivo /tmp/ops-simulate-failure con ese valor dentro.
function simulatedFailure(): 'before' | 'after' | null {
  let mode = process.env.OPS_SIMULATE_FAILURE?.trim();
  if (!mode) {
    try {
      mode = fs.readFileSync('/tmp/ops-simulate-failure', 'utf8').trim();
    } catch {
      mode = undefined;
    }
  }
  return mode === 'before' || mode === 'after' ? mode : null;
}

function audioExtension(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  return 'audio';
}

// Envío fiable de un encargo ya guardado en ops_requests:
//  1. se crea la tarea en ClickUp (o, en un reintento, se reutiliza la que ya
//     existe: la guardada, o la que lleve la marca [kiju:ID] en la lista);
//  2. se guardan id y URL de la tarea en cuanto existen;
//  3. si el encargo viene de una nota con audio, se adjunta a la tarea;
//  4. solo entonces pasa a "creado". Cualquier fallo → "error_sync" con motivo.
export async function syncToClickUp(
  requestId: string,
  tenantId: string,
  isRetry: boolean
): Promise<SyncResult> {
  const [row] = await db
    .select()
    .from(opsRequests)
    .where(and(eq(opsRequests.id, requestId), eq(opsRequests.tenantId, tenantId)))
    .limit(1);
  if (!row) return { ok: false, requestId, error: 'Encargo no encontrado' };

  if (row.status === 'creado' && row.clickupTaskUrl) {
    return { ok: true, requestId, taskUrl: row.clickupTaskUrl, reused: true };
  }

  const markFailed = async (message: string): Promise<SyncResult> => {
    await db
      .update(opsRequests)
      .set({ status: 'error_sync', errorMessage: message, updatedAt: new Date() })
      .where(eq(opsRequests.id, requestId));
    revalidatePath('/dashboard/operaciones/encargos');
    return { ok: false, requestId, error: message };
  };

  try {
    const conn = await getClickUpToken(tenantId);
    if (!conn) throw new Error('ClickUp no está conectado (falta el token en Ajustes)');

    const marker = `[kiju:${row.id}]`;

    // Audios de la nota (si el encargo viene de una).
    const audios = row.noteId
      ? await db
          .select()
          .from(opsNoteAudios)
          .where(and(eq(opsNoteAudios.noteId, row.noteId), eq(opsNoteAudios.tenantId, tenantId)))
          .orderBy(asc(opsNoteAudios.createdAt))
      : [];

    let task: { id: string; url: string } | null = row.clickupTaskId
      ? { id: row.clickupTaskId, url: row.clickupTaskUrl ?? '' }
      : null;
    let reused = Boolean(task);

    // En un reintento, antes de crear nada se comprueba si la tarea ya existe
    // en la lista (p. ej. se creó pero no llegó la confirmación).
    if (!task && isRetry) {
      task = await findTaskByMarker(conn.token, row.clickupListId, marker);
      reused = Boolean(task);
    }

    if (!task) {
      const sim = simulatedFailure();
      if (sim === 'before') {
        throw new Error('Fallo simulado (modo desarrollo: antes de llamar a ClickUp)');
      }

      const transcripts = audios.map((a) => a.transcript?.trim()).filter(Boolean);
      const transcriptBlock = transcripts.length
        ? `\n\n## Transcripción del audio\n${transcripts.join('\n\n')}`
        : '';

      task = await createTask(conn.token, row.clickupListId, {
        name: row.title,
        description: `${row.preparedDescription}${transcriptBlock}\n\n${marker}`,
        assigneeId: row.assigneeClickupId ? Number(row.assigneeClickupId) : null,
        dueDate: row.dueDate,
        priority: row.priority
      });

      if (sim === 'after') {
        throw new Error(
          'Fallo simulado (modo desarrollo: la tarea SÍ se creó en ClickUp pero se perdió la confirmación)'
        );
      }
    }

    // La tarea existe: se guardan ya su id y URL (aún sin pasar a "creado").
    if (!row.clickupTaskId) {
      await db
        .update(opsRequests)
        .set({ clickupTaskId: task.id, clickupTaskUrl: task.url, updatedAt: new Date() })
        .where(eq(opsRequests.id, requestId));
    }

    // Audio de la nota → adjunto de la tarea.
    if (audios.length > 0 && !row.audioAttachedAt) {
      for (const [i, a] of audios.entries()) {
        await attachFileToTask(conn.token, task.id, {
          filename: `nota-audio-${i + 1}.${audioExtension(a.mimeType)}`,
          mimeType: a.mimeType,
          data: a.data
        });
      }
      await db
        .update(opsRequests)
        .set({ audioAttachedAt: new Date() })
        .where(eq(opsRequests.id, requestId));
    }

    // Confirmado por ClickUp → "creado".
    await db
      .update(opsRequests)
      .set({
        status: 'creado',
        clickupTaskId: task.id,
        clickupTaskUrl: task.url,
        errorMessage: null,
        syncedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(opsRequests.id, requestId));

    // Aviso por Telegram: SOLO ahora que ClickUp ha confirmado la tarea. Es idempotente
    // (dedupe por encargo) y nunca debe estropear un envío correcto.
    void enqueueNewRequestNotification(requestId).catch((e) =>
      console.error('[telegram] no se pudo encolar el aviso:', e instanceof Error ? e.message : e)
    );

    revalidatePath('/dashboard/operaciones/encargos');
    return { ok: true, requestId, taskUrl: task.url, reused };
  } catch (e) {
    return markFailed(e instanceof Error ? e.message : 'Error desconocido al enviar a ClickUp');
  }
}
