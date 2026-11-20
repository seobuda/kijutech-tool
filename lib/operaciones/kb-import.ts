import 'server-only';

// Importación única del espacio «Base de Conocimiento» de ClickUp a la base de conocimiento del núcleo (20 nov 2026).
// UNA consulta agrupada de workspace (paginada), por el cliente con contador (regla de ClickUp de CLAUDE.md). Sin IA:
// el título y la descripción pasan tal cual, la categoría sale del nombre de la carpeta o la lista, y cada entrada
// guarda el enlace a la tarea original (los clips de vídeo adjuntos siguen allí). Todo entra en «Para más tarde».
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsClickupSpaces } from '@/lib/db/schema';
import { fetchSpaceTasksForKb } from '@/lib/operaciones/clickup';
import { getClickUpToken } from '@/lib/operaciones/queries';
import { insertImportedArticles, refreshEmbeddings } from '@/lib/core/knowledge';
import { categoryFromClickUpName, linksInText } from '@/lib/core/knowledge-rules';

export type KbSpaceOption = { id: string; name: string; suggested: boolean };

/** Espacios de ClickUp de la caché (sin llamar a ClickUp); el que se llama «conocimiento» va marcado. */
export async function kbSpaceOptions(tenantId: string): Promise<KbSpaceOption[]> {
  const rows = await db.select({ id: opsClickupSpaces.clickupSpaceId, name: opsClickupSpaces.name }).from(opsClickupSpaces).where(eq(opsClickupSpaces.tenantId, tenantId));
  return rows
    .map((r) => ({ id: r.id, name: r.name, suggested: /conocimiento/i.test(r.name) }))
    .sort((a, b) => Number(b.suggested) - Number(a.suggested) || a.name.localeCompare(b.name, 'es'));
}

export type KbImportResult = { found: number; imported: number; existing: number; withSecrets: number; requests: number; truncated: boolean };

export async function importKnowledgeFromClickUp(tenantId: string, spaceId: string, userId: number | null): Promise<KbImportResult> {
  const [space] = await db
    .select({ id: opsClickupSpaces.clickupSpaceId })
    .from(opsClickupSpaces)
    .where(and(eq(opsClickupSpaces.tenantId, tenantId), eq(opsClickupSpaces.clickupSpaceId, spaceId)))
    .limit(1);
  if (!space) throw new Error('Ese espacio no está en la caché de ClickUp');
  const conn = await getClickUpToken(tenantId);
  if (!conn?.workspaceId) throw new Error('ClickUp no está conectado');
  const { tasks, truncated, requests } = await fetchSpaceTasksForKb(conn.token, conn.workspaceId, spaceId);
  const items = tasks.map((t) => {
    const md = t.markdown.trim();
    return {
      sourceId: t.id,
      sourceUrl: t.url,
      title: t.name,
      solution: md || '(Sin descripción en ClickUp: el contenido, como un vídeo adjunto, está en la tarea original.)',
      categoryKey: categoryFromClickUpName(t.folderName, t.listName, t.name),
      tags: [t.folderName, t.listName !== 'List' ? t.listName : ''].filter(Boolean),
      links: [{ title: 'Tarea original en ClickUp', url: t.url }, ...linksInText(md)]
    };
  });
  const r = await insertImportedArticles(tenantId, 'clickup', items, userId);
  // Los embeddings se calculan después, en tandas (el planificador sigue si quedan).
  void refreshEmbeddings(tenantId, 200).catch((e) => console.error('[conocimiento] embeddings tras importar:', e instanceof Error ? e.message : e));
  return { found: tasks.length, ...r, requests, truncated };
}
