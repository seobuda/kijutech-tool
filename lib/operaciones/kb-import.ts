import 'server-only';

// Importación ÚNICA del espacio «Base de Conocimiento» de ClickUp a la base de conocimiento del núcleo (20 nov 2026).
// Decisión de Enric: se importa una vez y, desde entonces, todo el conocimiento se gestiona en la herramienta.
//  - UNA consulta agrupada de workspace (paginada) por el cliente con contador (regla de ClickUp de CLAUDE.md).
//  - Solo entran tareas con contenido: descripción o, si no la tienen, adjuntos (vídeos, archivos). Para estas se pide la
//    tarea (1 petición cada una, con el contador); las que no tienen ni descripción ni adjuntos no entran.
//  - Sin IA: el título y la descripción pasan tal cual y la categoría sale del nombre de la carpeta o la lista.
//  - Cada entrada guarda el enlace a la tarea original. Los adjuntos viven en los servidores de ClickUp: la entrada lo
//    avisa para pasarlos a Drive al revisarla (si se deja ClickUp, esos enlaces podrían dejar de funcionar).
//  - Todo entra en «Para más tarde» para revisarlo por tandas.
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsClickupSpaces } from '@/lib/db/schema';
import { fetchSpaceTasksForKb, getTaskAttachments } from '@/lib/operaciones/clickup';
import { getClickUpToken } from '@/lib/operaciones/queries';
import { countImported, insertImportedArticles, refreshEmbeddings, type ImportItem } from '@/lib/core/knowledge';
import { categoryFromClickUpName, linksInText } from '@/lib/core/knowledge-rules';

export type KbSpaceOption = { id: string; name: string; suggested: boolean };

/** Espacios de ClickUp de la caché (sin llamar a ClickUp); el que se llama «conocimiento» va marcado. */
export async function kbSpaceOptions(tenantId: string): Promise<KbSpaceOption[]> {
  const rows = await db.select({ id: opsClickupSpaces.clickupSpaceId, name: opsClickupSpaces.name }).from(opsClickupSpaces).where(eq(opsClickupSpaces.tenantId, tenantId));
  return rows
    .map((r) => ({ id: r.id, name: r.name, suggested: /conocimiento/i.test(r.name) }))
    .sort((a, b) => Number(b.suggested) - Number(a.suggested) || a.name.localeCompare(b.name, 'es'));
}

/** Cuántas entradas vinieron ya de ClickUp (para que la pantalla diga que la importación está hecha). */
export async function kbImportStatus(tenantId: string): Promise<{ imported: number }> {
  return { imported: await countImported(tenantId, 'clickup') };
}

export type KbImportResult = { found: number; imported: number; existing: number; withSecrets: number; empty: number; withClickUpFiles: number; requests: number; truncated: boolean };

const CLICKUP_FILES = /clickup-attachments\.com|app\.clickup\.com\/.*\/(clips?|docs?)\b/i;
const FILES_NOTE = '\n\n> ⚠️ Este contenido tiene vídeos o archivos alojados en ClickUp. Si se deja de usar ClickUp, esos enlaces podrían dejar de funcionar: súbelos a Google Drive y cambia el enlace al revisar esta entrada.';

/** Quita los parámetros de acceso firmados de un enlace de ClickUp (authz_token, token…). */
export function stripClickUpToken(url: string): string {
  try {
    const u = new URL(url);
    if (!/clickup/i.test(u.hostname)) return url;
    for (const k of [...u.searchParams.keys()]) if (/token|signature|expires/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return url;
  }
}
const stripTokensInText = (t: string) => t.replace(/https?:\/\/[^\s<>()"'\]]+/gi, (m) => stripClickUpToken(m));

export async function importKnowledgeFromClickUp(tenantId: string, spaceId: string, userId: number | null): Promise<KbImportResult> {
  const [space] = await db
    .select({ id: opsClickupSpaces.clickupSpaceId })
    .from(opsClickupSpaces)
    .where(and(eq(opsClickupSpaces.tenantId, tenantId), eq(opsClickupSpaces.clickupSpaceId, spaceId)))
    .limit(1);
  if (!space) throw new Error('Ese espacio no está en la caché de ClickUp');
  const conn = await getClickUpToken(tenantId);
  if (!conn?.workspaceId) throw new Error('ClickUp no está conectado');
  const { tasks, truncated, requests: listRequests } = await fetchSpaceTasksForKb(conn.token, conn.workspaceId, spaceId);
  let requests = listRequests;
  let empty = 0;
  let withClickUpFiles = 0;
  const items: ImportItem[] = [];
  for (const t of tasks) {
    const md = t.markdown.trim();
    let attachments: { title: string; url: string }[] = [];
    if (!md) {
      // Sin descripción: solo entra si tiene adjuntos (normalmente, el vídeo del tutorial).
      // Sin el token firmado de la URL (authz_token): da acceso a quien tenga el enlace y caduca; no se guardan tokens.
      attachments = (await getTaskAttachments(conn.token, t.id).catch(() => [])).map((a) => ({ ...a, url: stripClickUpToken(a.url) }));
      requests++;
      if (attachments.length === 0) {
        empty++;
        continue;
      }
    }
    const links = [...attachments, ...linksInText(md).map((l) => ({ ...l, url: stripClickUpToken(l.url) })), { title: 'Tarea original en ClickUp', url: t.url }];
    const hostedInClickUp = attachments.length > 0 || links.some((l) => CLICKUP_FILES.test(l.url));
    if (hostedInClickUp) withClickUpFiles++;
    const body = stripTokensInText(md) || `Contenido en los adjuntos:\n${attachments.map((a) => `- ${a.title}: ${a.url}`).join('\n')}`;
    items.push({
      sourceId: t.id,
      sourceUrl: t.url,
      title: t.name,
      solution: hostedInClickUp ? `${body}${FILES_NOTE}` : body,
      categoryKey: categoryFromClickUpName(t.folderName, t.listName, t.name),
      tags: [t.folderName, t.listName !== 'List' ? t.listName : '', hostedInClickUp ? 'vídeo en clickup' : ''].filter(Boolean),
      links
    });
  }
  const r = await insertImportedArticles(tenantId, 'clickup', items, userId);
  // Los embeddings se calculan después, en tandas (el planificador sigue si quedan).
  void refreshEmbeddings(tenantId, 200).catch((e) => console.error('[conocimiento] embeddings tras importar:', e instanceof Error ? e.message : e));
  return { found: tasks.length, ...r, empty, withClickUpFiles, requests, truncated };
}
