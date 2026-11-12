'use client';

import useSWR from 'swr';
import type { Roles } from './nav';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Roles del usuario para mostrar u ocultar menú y pestañas (solo visual: cada página y acción tiene su
// propio guard en el servidor). Mientras carga, se comporta como sin rol (oculta lo de admin).
export function useRoles(): Roles {
  const { data } = useSWR<{ roles: string[]; aiKeyModeAllowed: string }>('/api/user/roles', fetcher);
  const roles = data?.roles ?? [];
  const isSuperAdmin = roles.includes('super_admin');
  const isAdmin = isSuperAdmin || roles.includes('admin');
  const byok = (data?.aiKeyModeAllowed ?? 'platform_only') !== 'platform_only';
  return { isAdmin, isSuperAdmin, canAccessAi: isSuperAdmin || (roles.includes('admin') && byok) };
}
