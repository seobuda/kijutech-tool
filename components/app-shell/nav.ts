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
  HeartPulse,
  Clock,
  IdCard,
  Cog,
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
  /** Sección del módulo Operaciones a la que lleva (se marca activa en todas sus pestañas). */
  section?: SectionKey;
};

export type NavGroup = { label: string; items: NavItem[] };

// El módulo Operaciones se muestra en tres secciones (las rutas siguen bajo /dashboard/operaciones para
// no romper los enlaces de Telegram y de los avisos): el día a día, el equipo y lo técnico del sistema.
export type SectionKey = 'operaciones' | 'equipo' | 'sistema';
export type TabSection = { key: SectionKey; label: string; description: string; icon: LucideIcon; tabs: NavItem[] };

export const OPS_SECTIONS: TabSection[] = [
  {
    key: 'operaciones',
    label: 'Operaciones',
    icon: LayoutGrid,
    description: 'El centro de mando del agente: entrada de trabajo, encargos, clientes y correos con datos en directo de ClickUp.',
    tabs: [
      { href: '/dashboard/operaciones', label: 'Bloc de notas', icon: NotebookPen, keywords: 'nota dictar audio' },
      { href: '/dashboard/operaciones/bandeja', label: 'Mi bandeja', icon: Inbox, keywords: 'revisiones bloqueos pendientes' },
      { href: '/dashboard/operaciones/encargos', label: 'Encargos', icon: ClipboardList, keywords: 'tareas clickup' },
      { href: '/dashboard/operaciones/nuevo', label: 'Nuevo encargo', icon: PlusCircle, keywords: 'crear tarea' },
      { href: '/dashboard/operaciones/clientes', label: 'Clientes', icon: Building2, keywords: 'fichas semáforo alertas' },
      { href: '/dashboard/operaciones/correos', label: 'Correos', icon: Mail, keywords: 'email entrada' },
      { href: '/dashboard/operaciones/agente', label: 'Agente', icon: Bot, keywords: 'propuestas aprobación autonomía acierto' },
      { href: '/dashboard/operaciones/piloto', label: 'Piloto', icon: Gauge, keywords: 'métricas rendimiento' }
    ]
  },
  {
    key: 'equipo',
    label: 'Equipo',
    icon: UsersRound,
    description: 'Las personas: tareas de hoy, jornada real (entradas, pausas y salidas) y fichas con su horario.',
    tabs: [
      { href: '/dashboard/operaciones/equipo-hoy', label: 'Hoy', icon: CalendarCheck, keywords: 'equipo hoy tareas vencidas estado' },
      { href: '/dashboard/operaciones/jornada', label: 'Jornada', icon: Clock, keywords: 'fichaje entrada salida descansos comida horas' },
      { href: '/dashboard/operaciones/equipo', label: 'Fichas', icon: IdCard, keywords: 'equipo fichas personas horario' }
    ]
  },
  {
    key: 'sistema',
    label: 'Sistema',
    icon: Cog,
    description: 'Lo técnico: automatizaciones, salud del sistema, bot de Telegram y conexión con ClickUp.',
    tabs: [
      { href: '/dashboard/operaciones/automatizaciones', label: 'Automatizaciones', icon: Workflow, keywords: 'avisos recordatorios resúmenes' },
      { href: '/dashboard/operaciones/salud', label: 'Salud', icon: HeartPulse, keywords: 'errores incidencias caídas colas atascadas estado' },
      { href: '/dashboard/operaciones/telegram', label: 'Telegram', icon: MessageCircle, keywords: 'bot avisos' },
      { href: '/dashboard/operaciones/ajustes', label: 'Ajustes ClickUp', icon: SlidersHorizontal, keywords: 'token estados listas' }
    ]
  }
];

/** Todas las pestañas del módulo (paleta de comandos y migas). */
export const OPERACIONES_TABS: NavItem[] = OPS_SECTIONS.flatMap((s) => s.tabs);

/** Sección de una ruta de Operaciones: pestaña exacta o, en subrutas (detalle), la pestaña más larga que la contiene. */
export function sectionOf(pathname: string): TabSection {
  const exact = OPS_SECTIONS.find((s) => s.tabs.some((t) => t.href === pathname));
  if (exact) return exact;
  let best: { s: TabSection; len: number } | null = null;
  for (const s of OPS_SECTIONS) {
    for (const t of s.tabs) {
      if (t.href !== '/dashboard/operaciones' && pathname.startsWith(`${t.href}/`) && (!best || t.href.length > best.len)) {
        best = { s, len: t.href.length };
      }
    }
  }
  return best?.s ?? OPS_SECTIONS[0];
}

export const NAV: NavGroup[] = [
  {
    label: 'Trabajo',
    items: [
      { href: '/dashboard/operaciones', label: 'Operaciones', icon: LayoutGrid, section: 'operaciones', keywords: 'agente encargos clickup' },
      { href: '/dashboard/operaciones/equipo-hoy', label: 'Equipo', icon: UsersRound, section: 'equipo', keywords: 'jornada fichas personas' },
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
      { href: '/dashboard/operaciones/automatizaciones', label: 'Sistema', icon: Cog, section: 'sistema', keywords: 'automatizaciones salud telegram clickup', show: (r) => r.isAdmin },
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
  if (item.section) {
    return (pathname === '/dashboard/operaciones' || pathname.startsWith('/dashboard/operaciones/')) && sectionOf(pathname).key === item.section;
  }
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
    // El tramo «operaciones» muestra la sección (Operaciones, Equipo o Sistema) y lleva a su primera pestaña.
    if (acc === '/dashboard/operaciones') {
      const s = sectionOf(pathname);
      if (s.key !== 'operaciones') {
        out.push({ href: s.tabs[0].href, label: s.label });
        continue;
      }
    }
    const tabHit = OPERACIONES_TABS.find((t) => t.href === acc);
    const label = tabHit && acc !== '/dashboard/operaciones' ? tabHit.label : SEGMENT_LABELS[p];
    // Identificadores (uuid, números): se muestran abreviados.
    out.push({ href: acc, label: label ?? (/^[0-9a-f-]{8,}$/i.test(p) || /^\d+$/.test(p) ? 'Detalle' : decodeURIComponent(p)) });
  }
  if (tab && pathname === '/dashboard/operaciones') out.push({ href: pathname, label: tab.label });
  return out;
}
