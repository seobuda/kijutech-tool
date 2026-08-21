export function seoProgressSwrKey(projectId: string) {
  return `/api/projects/${projectId}/seo/progress`;
}

export function seoKwProgressSwrKey(projectId: string) {
  return `/api/projects/${projectId}/seo/kw-progress`;
}

export function seoClusterCompetitorsSwrKey(projectId: string, clusterId: string) {
  return `/api/projects/${projectId}/seo/keyword-research/clusters/${clusterId}/competitors`;
}
