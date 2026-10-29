import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsNoteAudios, opsNotes } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { transcribeAudio } from '@/lib/operaciones/transcribe';

// Los audios entran por una ruta (y no por una acción de servidor) porque las
// acciones tienen un límite de 1 MB por defecto. 10 min de audio webm/opus ≈ 5 MB.
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

// POST multipart:
//  - nuevo audio:  noteId + audio (archivo) → se guarda y se transcribe
//  - reintento:    audioId → vuelve a transcribir el audio ya guardado
// El archivo se guarda SIEMPRE antes de transcribir: si la transcripción falla,
// el audio no se pierde (y se adjuntará igualmente a las tareas).
export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });

  const form = await request.formData();
  const retryId = form.get('audioId');

  let audioId: string;
  let noteId: string;
  let mimeType: string;
  let data: Buffer;

  if (typeof retryId === 'string' && retryId) {
    const [row] = await db
      .select()
      .from(opsNoteAudios)
      .where(and(eq(opsNoteAudios.id, retryId), eq(opsNoteAudios.tenantId, user.tenantId)))
      .limit(1);
    if (!row) return Response.json({ error: 'Audio no encontrado' }, { status: 404 });
    audioId = row.id;
    noteId = row.noteId;
    mimeType = row.mimeType;
    data = row.data;
  } else {
    const file = form.get('audio');
    const noteIdField = form.get('noteId');
    if (!(file instanceof Blob) || typeof noteIdField !== 'string') {
      return Response.json({ error: 'Faltan el audio o la nota' }, { status: 400 });
    }
    if (file.size === 0) return Response.json({ error: 'El audio está vacío' }, { status: 400 });
    if (file.size > MAX_AUDIO_BYTES) {
      return Response.json({ error: 'El audio supera los 20 MB' }, { status: 413 });
    }

    const [note] = await db
      .select({ id: opsNotes.id })
      .from(opsNotes)
      .where(and(eq(opsNotes.id, noteIdField), eq(opsNotes.tenantId, user.tenantId)))
      .limit(1);
    if (!note) return Response.json({ error: 'Nota no encontrada' }, { status: 404 });

    noteId = note.id;
    mimeType = file.type || 'audio/webm';
    data = Buffer.from(await file.arrayBuffer());
    const [row] = await db
      .insert(opsNoteAudios)
      .values({
        noteId,
        tenantId: user.tenantId,
        mimeType,
        sizeBytes: data.length,
        data
      })
      .returning({ id: opsNoteAudios.id });
    audioId = row.id;
  }

  try {
    const transcript = await transcribeAudio({ tenantId: user.tenantId, noteId, mimeType, data });
    await db.update(opsNoteAudios).set({ transcript }).where(eq(opsNoteAudios.id, audioId));
    return Response.json({ audioId, transcript });
  } catch (e) {
    // El audio ya está guardado; se devuelve el motivo para mostrarlo.
    return Response.json({
      audioId,
      error: e instanceof Error ? e.message : 'No se pudo transcribir el audio'
    });
  }
}
