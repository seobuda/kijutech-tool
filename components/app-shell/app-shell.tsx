'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import useSWR, { mutate } from 'swr';
import { Dialog as DialogPrimitive, DropdownMenu as DM } from 'radix-ui';
import {
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Search,
  Sun,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { signOut } from '@/app/(login)/actions';
import type { SafeUser } from '@/lib/db/queries';
import { breadcrumbs, isActive, visibleNav, type NavGroup } from './nav';
import { CommandPalette } from './command-palette';
import { useRoles } from './use-roles';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// --- Tema ---------------------------------------------------------------------

type Theme = 'light' | 'dark' | 'system';

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>('system');
  useEffect(() => {
    try {
      const t = localStorage.getItem('theme');
      if (t === 'light' || t === 'dark') setThemeState(t);
    } catch {
      /* sin almacenamiento: tema del sistema */
    }
  }, []);
  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      if (t === 'system') localStorage.removeItem('theme');
      else localStorage.setItem('theme', t);
    } catch {
      /* sin almacenamiento */
    }
    const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  }, []);
  return [theme, setTheme];
}

// --- Marca ----------------------------------------------------------------------

function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link href="/dashboard/operaciones" className="flex items-center gap-2.5 px-1 group" aria-label="Kijutech, inicio">
      <span className="relative grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand to-[oklch(0.6_0.2_25)] text-brand-foreground shadow-sm ring-1 ring-black/5">
        <span className="text-[15px] font-bold tracking-tight">K</span>
      </span>
      {!collapsed && (
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-semibold tracking-tight">Kijutech</span>
          <span className="text-[11px] text-muted-foreground">Centro de operaciones</span>
        </span>
      )}
    </Link>
  );
}

// --- Navegación lateral -----------------------------------------------------

function NavList({
  groups,
  pathname,
  collapsed,
  onNavigate
}: {
  groups: NavGroup[];
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-5" aria-label="Navegación principal">
      {groups.map((g) => (
        <div key={g.label} className="flex flex-col gap-0.5">
          {!collapsed && (
            <div className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
              {g.label}
            </div>
          )}
          {g.items.map((item) => {
            const active = isActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                title={collapsed ? item.label : undefined}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors',
                  'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  active && 'bg-sidebar-accent text-sidebar-accent-foreground',
                  collapsed && 'justify-center px-0'
                )}
              >
                {active && (
                  <span className="absolute -left-3 top-1.5 bottom-1.5 w-1 rounded-r-full bg-brand" aria-hidden />
                )}
                <item.icon
                  className={cn(
                    'size-[18px] shrink-0 transition-colors',
                    active ? 'text-brand' : 'text-muted-foreground group-hover:text-foreground'
                  )}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

// --- Menú de usuario ---------------------------------------------------------

function UserMenu({ collapsed }: { collapsed?: boolean }) {
  const { data: user } = useSWR<SafeUser | null>('/api/user', fetcher);
  const router = useRouter();
  const [theme, setTheme] = useTheme();
  const name = user?.name || user?.email?.split('@')[0] || '';
  const initials = (name || '?')
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join('');

  async function handleSignOut() {
    await signOut();
    mutate('/api/user');
    router.push('/sign-in');
  }

  return (
    <DM.Root>
      <DM.Trigger
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-sidebar-accent outline-none focus-visible:ring-2 focus-visible:ring-ring',
          collapsed && 'justify-center'
        )}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-muted to-secondary text-xs font-semibold text-foreground ring-1 ring-border">
          {initials}
        </span>
        {!collapsed && (
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{name}</span>
            <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
          </span>
        )}
      </DM.Trigger>
      <DM.Portal>
        <DM.Content
          side="top"
          align="start"
          sideOffset={8}
          className="z-50 min-w-60 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="px-2 py-1.5 text-xs text-muted-foreground">Tema</div>
          <div className="mb-1 grid grid-cols-3 gap-1 px-1">
            {(
              [
                ['light', Sun, 'Claro'],
                ['dark', Moon, 'Oscuro'],
                ['system', Monitor, 'Sistema']
              ] as const
            ).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[11px] transition-colors hover:bg-accent',
                  theme === value ? 'border-brand/60 bg-brand-soft text-foreground' : 'border-transparent text-muted-foreground'
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>
          <DM.Separator className="my-1 h-px bg-border" />
          <DM.Item asChild>
            <Link
              href="/dashboard/general"
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent"
            >
              Mi cuenta
            </Link>
          </DM.Item>
          <DM.Item
            onSelect={() => void handleSignOut()}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive outline-none data-[highlighted]:bg-destructive-soft"
          >
            <LogOut className="size-4" />
            Cerrar sesión
          </DM.Item>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

// --- Migas ---------------------------------------------------------------------

function Breadcrumbs({ pathname }: { pathname: string }) {
  const crumbs = breadcrumbs(pathname);
  return (
    <ol className="flex min-w-0 items-center gap-1 text-sm" aria-label="Estás aquí">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <li key={`${c.href}-${i}`} className={cn('flex min-w-0 items-center gap-1', !last && 'hidden sm:flex')}>
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />}
            {last ? (
              <span className="truncate font-medium text-foreground" aria-current="page">
                {c.label}
              </span>
            ) : (
              <Link href={c.href} className="truncate text-muted-foreground transition-colors hover:text-foreground">
                {c.label}
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// --- Armazón ---------------------------------------------------------------------

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const roles = useRoles();
  const groups = visibleNav(roles);
  const [userCollapsed, setCollapsed] = useState(false);
  // Portátiles con escala del 125-150 % tienen ~900-1250 px útiles: la barra se queda visible
  // pero en modo iconos para dejar sitio al contenido.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = matchMedia('(max-width: 1279px)');
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const collapsed = userCollapsed || narrow;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('sidebar') === 'collapsed');
    } catch {
      /* sin almacenamiento */
    }
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem('sidebar', c ? 'open' : 'collapsed');
      } catch {
        /* sin almacenamiento */
      }
      return !c;
    });
  };

  // ⌘K / Ctrl+K abre la paleta desde cualquier pantalla.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex min-h-[100dvh] w-full bg-background">
      {/* Barra lateral (escritorio) */}
      <aside
        className={cn(
          'sticky top-0 hidden h-[100dvh] shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out md:flex',
          collapsed ? 'w-[68px]' : 'w-64'
        )}
      >
        <div className={cn('flex h-16 items-center px-4', collapsed && 'justify-center px-0')}>
          <Logo collapsed={collapsed} />
        </div>
        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className={cn(
              'flex h-9 w-full items-center gap-2 rounded-lg border bg-card px-2.5 text-sm text-muted-foreground shadow-xs transition-colors hover:border-foreground/20 hover:text-foreground',
              collapsed && 'justify-center px-0'
            )}
            aria-label="Buscar (Ctrl+K)"
          >
            <Search className="size-4 shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Buscar…</span>
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl K</kbd>
              </>
            )}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <NavList groups={groups} pathname={pathname} collapsed={collapsed} />
        </div>
        <div className="flex flex-col gap-1 border-t border-sidebar-border p-3">
          <UserMenu collapsed={collapsed} />
          <button
            type="button"
            onClick={toggleCollapsed}
            hidden={narrow}
            className="flex h-8 items-center justify-center gap-2 rounded-lg text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
            aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
            {!collapsed && 'Contraer'}
          </button>
        </div>
      </aside>

      {/* Menú móvil */}
      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 md:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-sidebar shadow-lg data-[state=open]:animate-in data-[state=open]:slide-in-from-left md:hidden">
            <DialogPrimitive.Title className="sr-only">Menú</DialogPrimitive.Title>
            <div className="flex h-16 items-center justify-between px-4">
              <Logo />
              <DialogPrimitive.Close className="rounded-lg p-2 text-muted-foreground hover:bg-sidebar-accent" aria-label="Cerrar menú">
                <X className="size-5" />
              </DialogPrimitive.Close>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2">
              <NavList groups={groups} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            </div>
            <div className="border-t border-sidebar-border p-3">
              <UserMenu />
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="-ml-1 rounded-lg p-2 text-muted-foreground hover:bg-accent md:hidden"
            aria-label="Abrir menú"
          >
            <Menu className="size-5" />
          </button>
          <Breadcrumbs pathname={pathname} />
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="rounded-lg p-2 text-muted-foreground hover:bg-accent md:hidden"
              aria-label="Buscar"
            >
              <Search className="size-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 animate-fade-up">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} groups={groups} roles={roles} />
    </div>
  );
}
