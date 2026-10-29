import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsNoteAudios, opsNotes, opsRequests } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { getClickUpConnection } from '@/lib/operaciones/queries';
import { ensureFresh, getStructure, selectedSpaces } from '@/lib/operaciones/structure';
import { normalizeConversionState, type NoteAudioInfo } from '@/lib/operaciones/note-types';
import { BlocNotas } from './bloc-notas';
import { SyncPending } from './sync-pending';

export const dynamic = 'force-dynamic';

export default async function BlocNotasPage({
  searchParams
}: {
  searchParams: Promise<{ nota?: string; nueva?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const conn = await getClickUpConnection(user.tenantId);
  if (!conn) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center space-y-3">
        <p className="font-medium">Todavía no has conectado ClickUp</p>
        <p className="text-sm text-muted-foreground">
          El Bloc de notas necesita el token para elegir el espacio y crear las tareas.
        </p>
        <Link
          href="/dashboard/operaciones/ajustes"
          className="inline-block rounded-full bg-orange-500 px-4 py-2 text-sm text-white hover:bg-orange-600"
        >
          Ir a Ajustes ClickUp
        </Link>
      </div>
    );
  }

  const { nota, nueva } = await searchParams;

  // Historial (sin el audio, que pesa).
  const notes = await db
    .select({
      id: opsNotes.id,
      content: opsNotes.content,
      status: opsNotes.status,
      spaceName: opsNotes.clickupSpaceName,
      updatedAt: opsNotes.updatedAt
    })
    .from(opsNotes)
    .where(eq(opsNotes.tenantId, user.tenantId))
    .orderBy(desc(opsNotes.updatedAt))
    .limit(100);

  // Nota abierta: la pedida, o (si no se pide "nueva") el último borrador, para
  // que al volver tras cerrar el navegador siga ahí lo que estabas escribiendo.
  const currentId =
    nueva === '1'
      ? null
      : (nota ?? notes.find((n) => n.status === 'borrador')?.id ?? null);

  const [current] = currentId
    ? await db
        .select()
        .from(opsNotes)
        .where(and(eq(opsNotes.id, currentId), eq(opsNotes.tenantId, user.tenantId)))
        .limit(1)
    : [];

  const audios: NoteAudioInfo[] = current
    ? (
        await db
          .select({
            id: opsNoteAudios.id,
            sizeBytes: opsNoteAudios.sizeBytes,
            transcript: opsNoteAudios.transcript,
            createdAt: opsNoteAudios.createdAt
          })
          .from(opsNoteAudios)
          .where(eq(opsNoteAudios.noteId, current.id))
          .orderBy(asc(opsNoteAudios.createdAt))
      ).map((a) => ({
        id: a.id,
        sizeBytes: a.sizeBytes,
        hasTranscript: Boolean(a.transcript),
        createdAt: a.createdAt.toISOString()
      }))
    : [];

  const noteRequests =
    current && current.status === 'convertida'
      ? await db
          .select({
            id: opsRequests.id,
            title: opsRequests.title,
            status: opsRequests.status,
            url: opsRequests.clickupTaskUrl,
            error: opsRequests.errorMessage,
            listName: opsRequests.clickupListName
          })
          .from(opsRequests)
          .where(eq(opsRequests.noteId, current.id))
          .orderBy(asc(opsRequests.createdAt))
      : [];

  {
    // La estructura sale de la caché de la base de datos: abrir el Bloc NO llama a
    // ClickUp. Si tiene más de 1 hora, se refresca en segundo plano sin esperar.
    const structure = await getStructure(user.tenantId);
    void ensureFresh(user.tenantId);
    if (!structure.syncedAt) return <SyncPending reason="never" />;
    const spaces = selectedSpaces(structure);
    if (spaces.length === 0) return <SyncPending reason="no-spaces" />;

    return (
      <BlocNotas
        key={current?.id ?? 'nueva'}
        spaces={spaces}
        members={structure.members}
        meId={structure.meId ?? ''}
        history={notes.map((n) => ({
          id: n.id,
          status: n.status,
          preview: n.content.trim().slice(0, 90) || '(nota vacía)',
          spaceName: n.spaceName,
          updatedAt: n.updatedAt.toISOString()
        }))}
        note={
          current
            ? {
                id: current.id,
                content: current.content,
                updatedAt: current.updatedAt.toISOString(),
                status: current.status,
                spaceId: current.clickupSpaceId ?? '',
                assigneeId: current.assigneeClickupId ?? '',
                conversion: normalizeConversionState(current.proposal),
                audios,
                requests: noteRequests
              }
            : null
        }
      />
    );
  }
}
