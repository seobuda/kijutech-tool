import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { getStageProgress } from '@/lib/seo/queries';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const user = await getUser();
  if (!user) {
    return Response.json({ progress: [] }, { status: 401 });
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project || project.tenantId !== user.tenantId) {
    return Response.json({ progress: [] }, { status: 404 });
  }

  const progress = await getStageProgress(projectId);
  return Response.json({ progress });
}
