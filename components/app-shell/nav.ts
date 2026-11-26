// Navegación de la herramienta: la usan la barra lateral, las migas y la paleta de comandos (⌘K).
// La visibilidad por rol aquí es solo de interfaz: cada página y acción comprueba su permiso en el servidor.
import {
  Activity,
  MessageCircleQuestion,
  Bug,
  Library,
  ListTodo,
  Bot,
  Brain,
  CalendarCheck,
  CalendarDays,
  Coins,
  Server,
  FileBarChart,
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
  Home,
  FlaskConical,
  HeartPulse,
  Clock,
  IdCard,
  LineChart,
  Compass,
  Cog,
  Timer,
  UserRound,
  type LucideIcon
} from 'lucide-react';

export type Roles = { isAdmin: boolean; isSuperAdmin: boolean; canAccessAi: boolean; /** editor o más: puede crear y editar. */ canEdit: boolean };

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
  /** Subentradas de un espacio: se despliegan bajo él cuando estás dentro. */
  children?: NavItem[];
  /** Muestra un número al lado (p. ej. lo que espera en Para ti). */
  badge?: 'paraTi';
};

export type NavGroup = { label: string; items: NavItem[] };

// El módulo Operaciones se muestra en tres secciones (las rutas siguen bajo /dashboard/operaciones para
// no romper los enlaces de Telegram y de los avisos): el día a día, el equipo y lo técnico del sistema.
export type SectionKey = 'operaciones' | 'equipo' | 'sistema';
export type TabSection = { key: SectionKey; label: string; description: string; icon: LucideIcon; tabs: NavItem[] };

// Pestañas cuya página exige admin (requirePagePermission('admin')): se ocultan al resto para no llevarles
// a una redirección. Solo visual; el guard real está en cada página.
const adminOnly = (r: Roles) => r.isAdmin;

export const OPS_SECTIONS: TabSection[] = [
  {
    key: 'operaciones',
    label: 'Día a día',
    icon: LayoutGrid,
    description: 'El trabajo que entra y lo que espera tu decisión: notas, bandeja, encargos y correos, con datos en directo de ClickUp.',
    tabs: [
      { href: '/dashboard/operaciones', label: 'Bloc de notas', icon: NotebookPen, keywords: 'nota dictar audio' },
      { href: '/dashboard/operaciones/bandeja', label: 'Mi bandeja', icon: Inbox, keywords: 'revisiones bloqueos pendientes' },
      { href: '/dashboard/operaciones/encargos', label: 'Encargos', icon: ClipboardList, keywords: 'tareas clickup' },
      { href: '/dashboard/operaciones/nuevo', label: 'Nuevo encargo', icon: PlusCircle, keywords: 'crear tarea' },
      { href: '/dashboard/operaciones/correos', label: 'Correos', icon: Mail, keywords: 'email entrada' },
      { href: '/dashboard/operaciones/agente', label: 'Propuestas del agente', icon: Bot, keywords: 'agente propuestas aprobación autonomía acierto', show: adminOnly },
      { href: '/dashboard/operaciones/informes', label: 'Informes', icon: FileBarChart, keywords: 'informe semanal mensual parte resumen', show: adminOnly },
      { href: '/dashboard/operaciones/piloto', label: 'Métricas del agente', icon: Gauge, keywords: 'piloto métricas rendimiento agente', show: adminOnly }
    ]
  },
  {
    key: 'equipo',
    label: 'Equipo',
    icon: UsersRound,
    description: 'Las personas: tareas de hoy, jornada real, tiempos de tarea, fichas con su horario y el panel de cada uno.',
    tabs: [
      { href: '/dashboard/operaciones/equipo-hoy', label: 'Hoy', icon: CalendarCheck, keywords: 'equipo hoy tareas vencidas estado' },
      { href: '/dashboard/operaciones/jornada', label: 'Jornada', icon: Clock, keywords: 'fichaje entrada salida descansos comida horas', show: adminOnly },
      { href: '/dashboard/operaciones/tiempos', label: 'Tiempos', icon: Timer, keywords: 'tiempos tareas márgenes estimación precisión', show: adminOnly },
      { href: '/dashboard/operaciones/calendario', label: 'Calendario', icon: CalendarDays, keywords: 'festivos vacaciones ausencias días libres', show: adminOnly },
      { href: '/dashboard/operaciones/equipo', label: 'Fichas', icon: IdCard, keywords: 'equipo fichas personas horario' },
      { href: '/dashboard/operaciones/mi-panel', label: 'Mi panel', icon: UserRound, keywords: 'mi jornada mis tiempos precisión' }
    ]
  },
  {
    key: 'sistema',
    label: 'Ajustes del sistema',
    icon: Cog,
    description: 'Lo técnico: automatizaciones, salud del sistema, pruebas simuladas, bot de Telegram y conexión con ClickUp.',
    tabs: [
      { href: '/dashboard/operaciones/automatizaciones', label: 'Automatizaciones', icon: Workflow, keywords: 'avisos recordatorios resúmenes', show: adminOnly },
      { href: '/dashboard/operaciones/gasto-ia', label: 'Gasto de IA', icon: Coins, keywords: 'coste ia tokens presupuesto anthropic claude previsión', show: adminOnly },
      { href: '/dashboard/operaciones/servidor', label: 'Servidor y costes', icon: Server, keywords: 'digitalocean coste servidor memoria disco cpu factura', show: adminOnly },
      { href: '/dashboard/operaciones/salud', label: 'Salud', icon: HeartPulse, keywords: 'errores incidencias caídas colas atascadas estado', show: adminOnly },
      { href: '/dashboard/operaciones/pruebas', label: 'Pruebas', icon: FlaskConical, keywords: 'pruebas simuladas escenarios telegram simulado test kiju ia', show: adminOnly },
      { href: '/dashboard/operaciones/telegram', label: 'Telegram', icon: MessageCircle, keywords: 'bot avisos', show: adminOnly },
      { href: '/dashboard/operaciones/ajustes', label: 'Ajustes ClickUp', icon: SlidersHorizontal, keywords: 'token estados listas', show: adminOnly }
    ]
  }
];

/** Todas las pestañas del módulo (paleta de comandos y migas). */
export const OPERACIONES_TABS: NavItem[] = OPS_SECTIONS.flatMap((s) => s.tabs);

/** Pestañas que puede ver este usuario (las de admin, solo a admin). */
export function visibleTabs(tabs: NavItem[], roles: Roles): NavItem[] {
  return tabs.filter((t) => !t.show || t.show(roles));
}

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

// Barra lateral en cinco espacios (fase 1 de la reorganización UX, 20 nov 2026): Inicio · Para ti · Clientes · Equipo ·
// Conocimiento, y Ajustes aparte con lo técnico. Las rutas no cambian (los enlaces de Telegram siguen valiendo): solo
// cambia dónde aparece cada pantalla. Cada espacio despliega sus subentradas cuando estás dentro.
const canEdit = (r: Roles) => r.canEdit;

export const NAV: NavGroup[] = [
  {
    label: 'Espacios',
    items: [
      { href: '/dashboard', label: 'Inicio', icon: Home, keywords: 'inicio panel resumen hoy portada' },
      { href: '/dashboard/mis-tareas', label: 'Mis tareas', icon: ListTodo, keywords: 'tareas pendientes vencidas hoy semana mis encargos' },
      {
        href: '/dashboard/para-ti',
        label: 'Para ti',
        icon: Inbox,
        keywords: 'pendiente decisión bandeja aprobar revisar urgente',
        show: adminOnly,
        badge: 'paraTi',
        children: [
          { href: '/dashboard/para-ti', label: 'Todo lo pendiente', icon: Inbox, keywords: 'bandeja única revisiones bloqueos' },
          { href: '/dashboard/operaciones/agente', label: 'Propuestas del agente', icon: Bot, keywords: 'agente aprobación autonomía' },
          { href: '/dashboard/operaciones/correos', label: 'Correos', icon: Mail, keywords: 'email entrada responder' },
          { href: '/dashboard/agentes/equipo', label: 'Dudas del equipo', icon: MessageCircle, keywords: 'dudas escaladas jefe de operaciones' },
          { href: '/dashboard/errores', label: 'Errores', icon: Bug, keywords: 'errores fallos incidencias diagnóstico mantenimiento técnico registro logs' },
          { href: '/dashboard/operaciones', label: 'Bloc de notas', icon: NotebookPen, keywords: 'nota dictar audio' }
        ]
      },
      {
        href: '/dashboard/clientes',
        label: 'Clientes',
        icon: Building2,
        prefix: true,
        keywords: 'fichas cliente contactos webs cuentas competencia semáforo alertas onboarding',
        show: canEdit,
        children: [
          { href: '/dashboard/clientes', label: 'Fichas', icon: IdCard, prefix: true, keywords: 'fichas cliente' },
          { href: '/dashboard/operaciones/encargos', label: 'Encargos', icon: ClipboardList, prefix: true, keywords: 'tareas clickup encargos' },
          { href: '/dashboard/rendimiento', label: 'Rendimiento web', icon: LineChart, keywords: 'search console analytics business profile ficha google clics sesiones llamadas métricas histórico informe mensual caídas' },
          { href: '/dashboard/estrategia', label: 'Estrategia', icon: Compass, keywords: 'objetivos planes seguimiento palabras clave salud web velocidad oportunidades señales frecuencias calendario google updates estratega' },
          { href: '/dashboard/projects', label: 'Proyectos SEO', icon: FolderKanban, prefix: true, keywords: 'seo keywords clusters' },
          { href: '/dashboard/clientes/preguntas', label: 'Banco de preguntas', icon: MessageCircleQuestion, keywords: 'preguntas cuestionario cliente onboarding briefing correo plantilla' }
        ]
      },
      {
        href: '/dashboard/equipo',
        label: 'Equipo',
        icon: UsersRound,
        prefix: true,
        keywords: 'equipo personas agentes organigrama jornada fichas hoy',
        children: [
          { href: '/dashboard/equipo', label: 'Organigrama', icon: Network, prefix: true, keywords: 'organigrama personas agentes ia actividad fotos' },
          { href: '/dashboard/operaciones/equipo-hoy', label: 'Tareas y jornada', icon: UsersRound, section: 'equipo', keywords: 'equipo hoy jornada tiempos fichas horario' },
          { href: '/dashboard/agentes', label: 'Agentes de IA', icon: Bot, prefix: true, keywords: 'agente ia telegram audio subagentes integraciones conversaciones trabajos voz instrucciones', show: adminOnly },
          { href: '/dashboard/agentes/departamentos', label: 'Departamentos', icon: Network, keywords: 'departamentos jefes bots telegram', show: adminOnly },
          { href: '/dashboard/operaciones/informes', label: 'Informes', icon: FileBarChart, keywords: 'informe semanal mensual parte resumen', show: adminOnly }
        ]
      },
      { href: '/dashboard/conocimiento', label: 'Conocimiento', icon: Library, prefix: true, keywords: 'base de conocimiento tutoriales procedimientos soluciones dudas vídeos cómo se hace ayuda' }
    ]
  },
  {
    label: 'Ajustes',
    items: [
      { href: '/dashboard/operaciones/automatizaciones', label: 'Sistema', icon: Cog, section: 'sistema', keywords: 'automatizaciones salud telegram clickup servidor pruebas gasto', show: adminOnly },
      { href: '/dashboard/usuarios', label: 'Usuarios', icon: Users, show: (r) => r.isSuperAdmin },
      { href: '/dashboard/ai/settings', label: 'IA y modelos', icon: Sparkles, prefix: true, keywords: 'prompts proveedores claves', show: (r) => r.isSuperAdmin },
      { href: '/dashboard/ai/my-keys', label: 'Mis claves de IA', icon: Bot, show: (r) => r.canAccessAi && !r.isSuperAdmin },
      { href: '/dashboard/ai/brain', label: 'Cerebro', icon: Brain, keywords: 'aprendizaje costes', show: (r) => r.isSuperAdmin },
      { href: '/dashboard/architecture', label: 'Mapa del sistema', icon: Network, keywords: 'arquitectura procesos', show: (r) => r.isSuperAdmin },
      { href: '/dashboard/seo/admin/settings', label: 'Configuración SEO', icon: SlidersHorizontal, show: (r) => r.isSuperAdmin }
    ]
  },
  {
    label: 'Cuenta',
    items: [{ href: '/dashboard/general', label: 'Mi cuenta', icon: Settings, keywords: 'perfil contraseña seguridad actividad' }]
  }
];

/** Entradas del menú de usuario (fuera de la barra para que sea corta). */
export const ACCOUNT_LINKS: NavItem[] = [
  { href: '/dashboard/general', label: 'Mi cuenta', icon: Settings },
  { href: '/dashboard/security', label: 'Seguridad', icon: Shield, keywords: 'contraseña' },
  { href: '/dashboard/activity', label: 'Actividad', icon: Activity, keywords: 'registro' }
];

/** Acciones del botón «＋ Nuevo»: crear sin tener que saber en qué sección vive cada cosa. */
export const NEW_ACTIONS: NavItem[] = [
  { href: '/dashboard/operaciones', label: 'Nota', icon: NotebookPen, keywords: 'dictar idea apunte', show: canEdit },
  { href: '/dashboard/operaciones/nuevo', label: 'Encargo', icon: ClipboardList, keywords: 'tarea clickup', show: canEdit },
  { href: '/dashboard/clientes?nuevo=1', label: 'Cliente', icon: Building2, keywords: 'ficha', show: canEdit },
  { href: '/dashboard/conocimiento/nueva', label: 'Entrada de conocimiento', icon: Library, keywords: 'tutorial procedimiento', show: adminOnly },
  { href: '/dashboard/projects/new', label: 'Proyecto SEO', icon: FolderKanban, keywords: 'seo', show: canEdit }
];

function filterItems(items: NavItem[], roles: Roles): NavItem[] {
  return items
    .filter((i) => !i.show || i.show(roles))
    .map((i) => (i.children ? { ...i, children: filterItems(i.children, roles) } : i));
}

export function visibleNav(roles: Roles): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: filterItems(g.items, roles) })).filter((g) => g.items.length);
}

export function visibleActions(roles: Roles): NavItem[] {
  return filterItems(NEW_ACTIONS, roles);
}

/** Todas las entradas (espacios y subentradas) en una lista plana: para la paleta de comandos. */
export function flatNav(groups: NavGroup[]): { item: NavItem; group: string }[] {
  return groups.flatMap((g) => g.items.flatMap((i) => [{ item: i, group: g.label }, ...(i.children ?? []).map((c) => ({ item: c, group: i.label }))]));
}

function matches(item: NavItem, pathname: string): boolean {
  if (item.section) {
    return (pathname === '/dashboard/operaciones' || pathname.startsWith('/dashboard/operaciones/')) && sectionOf(pathname).key === item.section;
  }
  const href = item.href.split('?')[0];
  if (pathname === href) return true;
  return Boolean(item.prefix) && pathname.startsWith(`${href}/`);
}

/** Subentrada activa: la que mejor encaja (la más concreta), para que «Agentes de IA» no se marque en «Organigrama». */
export function activeChild(item: NavItem, pathname: string): NavItem | null {
  let best: NavItem | null = null;
  for (const c of item.children ?? []) {
    if (!matches(c, pathname)) continue;
    // Una entrada de sección (Personas) encaja en todas las pestañas del Equipo: gana cualquier otra más concreta.
    if (!best || (best.section && !c.section) || (!c.section && !best.section && c.href.length > best.href.length)) best = c;
  }
  return best;
}

export function isActive(item: NavItem, pathname: string): boolean {
  if (matches(item, pathname)) return true;
  return Boolean(item.children?.length) && activeChild(item, pathname) !== null;
}

// Migas: título legible de cada tramo conocido de la ruta.
const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Inicio',
  operaciones: 'Día a día',
  errores: 'Errores',
  clientes: 'Clientes',
  rendimiento: 'Rendimiento web',
  estrategia: 'Estrategia',
  projects: 'Proyectos SEO',
  preguntas: 'Banco de preguntas',
  // Pestañas SEO del proyecto (Hito 1 y 2).
  salud: 'Salud técnica',
  expediente: 'Expediente',
  palabras: 'Palabras',
  plan: 'Plan de mejora',
  ai: 'IA',
  settings: 'Ajustes',
  prompts: 'Prompts',
  brain: 'Cerebro',
  'my-keys': 'Mis claves',
  architecture: 'Mapa del sistema',
  usuarios: 'Usuarios',
  seo: 'SEO',
  admin: 'Administración',
  cards: 'Fichas SEO',
  general: 'Mi cuenta',
  'mis-tareas': 'Mis tareas',
  'para-ti': 'Para ti',
  equipo: 'Equipo',
  conocimiento: 'Conocimiento',
  nueva: 'Nueva entrada',
  ayuda: 'Ayuda y glosario',
  agentes: 'Agentes',
  departamentos: 'Departamentos',
  conversaciones: 'Conversaciones',
  trabajos: 'Trabajos',
  voz: 'Voz',
  integraciones: 'Integraciones',
  persona: 'Persona',
  agente: 'Agente',
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
