// Navegación de la herramienta: la usan la barra lateral, las migas y la paleta de comandos (⌘K).
// La visibilidad por rol aquí es solo de interfaz: cada página y acción comprueba su permiso en el servidor.
import {
  Activity,
  BookOpen,
  Bot,
  Brain,
  CalendarCheck,
  ClipboardList,
  FolderKanban,
  Inbox,
  LayoutGrid,
  Mail,
  MessageCircle,
  Network,
  NotebookPen,
  PlusCircle,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Users,
  UsersRound,
  Workflow,
  Building2,
  Gauge,
  type LucideIcon
} from 'lucide-react';

export type Roles = { isAdmin: boolean; isSuperAdmin: boolean; canAccessAi: boolean };

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  keywords?: string;
  show?: (r: Roles) => boolean;
  /** Marca activo también en subrutas (p. ej. /dashboard/projects/123). */
  prefix?: boolean;
};

export type NavGroup = { label: string; items: NavItem[] };

export const OPERACIONES_TABS: NavItem[] = [
  { href: '/dashboard/operaciones', label: 'Bloc de notas', icon: NotebookPen, keywords: 'nota dictar audio' },
  { href: '/dashboard/operaciones/equipo-hoy', label: 'Equipo hoy', icon: CalendarCheck, keywords: 'tareas hoy vencidas' },
  { href: '/dashboard/operaciones/bandeja', label: 'Mi bandeja', icon: Inbox, keywords: 'revisiones bloqueos pendientes' },
  { href: '/dashboard/operaciones/encargos', label: 'Encargos', icon: ClipboardList, keywords: 'tareas clickup' },
  { href: '/dashboard/operaciones/nuevo', label: 'Nuevo encargo', icon: PlusCircle, keywords: 'crear tarea' },
  { href: '/dashboard/operaciones/clientes', label: 'Clientes', icon: Building2, keywords: 'fichas semáforo alertas' },
  { href: '/dashboard/operaciones/correos', label: 'Correos', icon: Mail, keywords: 'email entrada' },
  { href: '/dashboard/operaciones/equipo', label: 'Equipo', icon: UsersRound, keywords: 'fichas personas horario' },
  { href: '/dashboard/operaciones/piloto', label: 'Piloto', icon: Gauge, keywords: 'métricas rendimiento' },
  { href: '/dashboard/operaciones/automatizaciones', label: 'Automatizaciones', icon: Workflow, keywords: 'avisos recordatorios resúmenes' },
  { href: '/dashboard/operaciones/telegram', label: 'Telegram', icon: MessageCircle, keywords: 'bot avisos' },
  { href: '/dashboard/operaciones/ajustes', label: 'Ajustes ClickUp', icon: SlidersHorizontal, keywords: 'token estados listas' }
];

export const NAV: NavGroup[] = [
  {
    label: 'Trabajo',
    items: [
      { href: '/dashboard/operaciones', label: 'Operaciones', icon: LayoutGrid, prefix: true, keywords: 'agente equipo clickup' },
      { href: '/dashboard/projects', label: 'Proyectos SEO', icon: FolderKanban, prefix: true, keywords: 'seo keywords clusters' }
    ]
  },
  {
    label: 'Inteligencia',
    items: [
      {
        href: '/dashboard/ai/settings',
        label: 'IA y modelos',
        icon: Sparkles,
        prefix: true,
        keywords: 'prompts proveedores claves',
        show: (r) => r.isSuperAdmin
      },
      { href: '/dashboard/ai/my-keys', label: 'Mis claves de IA', icon: Bot, show: (r) => r.canAccessAi && !r.isSuperAdmin },
      { href: '/dashboard/ai/brain', label: 'Cerebro', icon: Brain, keywords: 'aprendizaje costes', show: (r) => r.isSuperAdmin },
      { href: '/dashboard/architecture', label: 'Mapa del sistema', icon: Network, keywords: 'arquitectura procesos', show: (r) => r.isSuperAdmin }
    ]
  },
  {
    label: 'Administración',
    items: [
      { href: '/dashboard/usuarios', label: 'Usuarios', icon: Users, show: (r) => r.isSuperAdmin },
      { href: '/dashboard/seo/admin/cards', label: 'Conocimiento SEO', icon: BookOpen, show: (r) => r.isAdmin },
      { href: '/dashboard/seo/admin/settings', label: 'Configuración SEO', icon: SlidersHorizontal, show: (r) => r.isSuperAdmin }
    ]
  },
  {
    label: 'Cuenta',
    items: [
      { href: '/dashboard/general', label: 'Mi cuenta', icon: Settings },
      { href: '/dashboard/security', label: 'Seguridad', icon: Shield },
      { href: '/dashboard/activity', label: 'Actividad', icon: Activity }
    ]
  }
];

export function visibleNav(roles: Roles): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.show || i.show(roles)) })).filter((g) => g.items.length);
}

export function isActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.href) return true;
  return Boolean(item.prefix) && pathname.startsWith(`${item.href}/`);
}

// Migas: título legible de cada tramo conocido de la ruta.
const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Inicio',
  operaciones: 'Operaciones',
  projects: 'Proyectos SEO',
  ai: 'IA',
  settings: 'Ajustes',
  prompts: 'Prompts',
  brain: 'Cerebro',
  'my-keys': 'Mis claves',
  architecture: 'Mapa del sistema',
  usuarios: 'Usuarios',
  seo: 'SEO',
  admin: 'Administración',
  cards: 'Conocimiento',
  general: 'Mi cuenta',
  security: 'Seguridad',
  activity: 'Actividad',
  new: 'Nuevo',
  archived: 'Archivados',
  'keyword-research': 'Keyword research',
  clusters: 'Clusters',
  clustering: 'Clustering',
  competitors: 'Competidores',
  keywords: 'Keywords',
  onboarding: 'Onboarding',
  kickoff: 'Kickoff',
  audit: 'Radiografía',
  'content-plan': 'Plan de contenido'
};

export function breadcrumbs(pathname: string): { href: string; label: string }[] {
  const tab = OPERACIONES_TABS.find((t) => t.href === pathname);
  const parts = pathname.split('/').filter(Boolean);
  const out: { href: string; label: string }[] = [];
  let acc = '';
  for (const p of parts) {
    acc += `/${p}`;
    if (p === 'dashboard') continue;
    const tabHit = OPERACIONES_TABS.find((t) => t.href === acc);
    const label = tabHit && acc !== '/dashboard/operaciones' ? tabHit.label : SEGMENT_LABELS[p];
    // Identificadores (uuid, números): se muestran abreviados.
    out.push({ href: acc, label: label ?? (/^[0-9a-f-]{8,}$/i.test(p) || /^\d+$/.test(p) ? 'Detalle' : decodeURIComponent(p)) });
  }
  if (tab && pathname === '/dashboard/operaciones') out.push({ href: pathname, label: tab.label });
  return out;
}
