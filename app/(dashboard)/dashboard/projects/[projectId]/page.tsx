// Entrada a un proyecto SEO (27 nov 2026): la ficha del cliente enlaza aquí y no había página (daba 404). Va al Resumen.
import { notFound, redirect } from 'next/navigation';

export default async function ProjectIndexPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound();
  redirect(`/dashboard/projects/${projectId}/resumen`);
}
