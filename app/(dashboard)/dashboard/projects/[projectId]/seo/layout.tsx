// Asistente SEO de agosto (kickoff, keyword research con CSV de SE Ranking, clustering y plan de contenido): RETIRADO de
// la interfaz el 26 nov 2026 por decisión de Enric (docs/LISTA-CERRADA-SEO.md). Lo sustituyen las pestañas del proyecto
// (Salud, Expediente, Palabras y Plan). Sus tablas (seo_kw_*, seo_cluster_*…) se conservan sin borrar; cualquier enlace
// antiguo a /seo/... lleva al Expediente del proyecto.
import { redirect } from 'next/navigation';

export default async function SeoLegacyLayout({ params }: { children: React.ReactNode; params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  redirect(`/dashboard/projects/${encodeURIComponent(projectId)}/expediente`);
}
