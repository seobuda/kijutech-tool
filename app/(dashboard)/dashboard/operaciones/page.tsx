import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsNoteAudios, opsNotes, opsRequests } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { getClickUpToken } from '@/lib/operaciones/queries';
import { ClickUpError, getMe, getSpacesWithLists, getWorkspaces } from '@/lib/operaciones/clickup';
import type { NoteAudioInfo, NoteProposal } from '@/lib/operaciones/note-types';
import { BlocNotas } from './bloc-notas';

export const dynamic = 'force-dynamic';

export default async function BlocNotasPage({
  searchParams
}: {
  searchParams: Promise<{ nota?: string; nueva?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const conn = await getClickUpToken(user.tenantId);
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

  try {
    const workspaces = await getWorkspaces(conn.token);
    const workspace = workspaces.find((w) => w.id === conn.workspaceId) ?? workspaces[0];
    if (!workspace) {
      return <p className="text-sm text-muted-foreground">Tu cuenta de ClickUp no tiene workspaces.</p>;
    }
    const [spaces, me] = await Promise.all([
      getSpacesWithLists(conn.token, workspace.id),
      getMe(conn.token)
    ]);

    return (
      <BlocNotas
        key={current?.id ?? 'nueva'}
        spaces={spaces}
        members={workspace.members.map((m) => ({ id: String(m.id), username: m.username }))}
        meId={String(me.id)}
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
                status: current.status,
                spaceId: current.clickupSpaceId ?? '',
                assigneeId: current.assigneeClickupId ?? '',
                proposal: (current.proposal as NoteProposal | null) ?? null,
                audios,
                requests: noteRequests
              }
            : null
        }
      />
    );
  } catch (e) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
        <p className="font-medium text-red-700">No se han podido cargar los datos de ClickUp</p>
        <p className="text-sm text-red-700">
          {e instanceof ClickUpError ? e.message : 'No se pudo contactar con ClickUp'}
        </p>
        <Link href="/dashboard/operaciones/ajustes" className="text-sm underline">
          Revisar ajustes
        </Link>
      </div>
    );
  }
}
