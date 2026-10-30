import { getUser } from '@/lib/db/queries';
import { transcribeAudio } from '@/lib/operaciones/transcribe';
import { canManageProfiles } from '@/lib/operaciones/team-profiles';

// Audio de «Rellenar con IA» (ficha del Equipo): solo se transcribe, no se guarda.
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await getUser();
  if (!user || !canManageProfiles(user)) return Response.json({ error: 'No autenticado' }, { status: 401 });

  const form = await request.formData();
  const file = form.get('audio');
  if (!(file instanceof Blob) || file.size === 0) {
    return Response.json({ error: 'El audio está vacío' }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) return Response.json({ error: 'El audio supera los 20 MB' }, { status: 413 });

  try {
    const transcript = await transcribeAudio({
      tenantId: user.tenantId,
      noteId: 'ficha-equipo',
      mimeType: file.type || 'audio/webm',
      data: Buffer.from(await file.arrayBuffer())
    });
    return Response.json({ transcript });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'No se pudo transcribir el audio' });
  }
}
