'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import {
  Users,
  Settings,
  Shield,
  Activity,
  Menu,
  FolderKanban,
  BookOpen,
  SlidersHorizontal,
  Sparkles
} from 'lucide-react';

const ADMIN_ROLES = ['admin', 'super_admin'];

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { data: rolesData } = useSWR<{ roles: string[]; aiKeyModeAllowed: string }>(
    '/api/user/roles',
    fetcher
  );
  const isSeoAdmin = rolesData?.roles?.some((r) => ADMIN_ROLES.includes(r)) ?? false;
  const isSuperAdmin = rolesData?.roles?.includes('super_admin') ?? false;
  const isTenantAdmin = rolesData?.roles?.includes('admin') ?? false;
  const isByokTenant = (rolesData?.aiKeyModeAllowed ?? 'platform_only') !== 'platform_only';
  const canAccessAi = isSuperAdmin || (isTenantAdmin && isByokTenant);

  const navItems = [
    { href: '/dashboard', icon: Users, label: 'Team' },
    { href: '/dashboard/projects', icon: FolderKanban, label: 'Proyectos' },
    { href: '/dashboard/general', icon: Settings, label: 'General' },
    { href: '/dashboard/activity', icon: Activity, label: 'Activity' },
    { href: '/dashboard/security', icon: Shield, label: 'Security' },
    ...(isSeoAdmin
      ? [
          {
            href: '/dashboard/seo/admin/cards',
            icon: BookOpen,
            label: 'Admin SEO'
          }
        ]
      : []),
    ...(isSuperAdmin
      ? [
          {
            href: '/dashboard/seo/admin/settings',
            icon: SlidersHorizontal,
            label: 'Configuración SEO'
          }
        ]
      : []),
    ...(canAccessAi
      ? [
          {
            href: isSuperAdmin ? '/dashboard/ai/settings' : '/dashboard/ai/my-keys',
            icon: Sparkles,
            label: 'IA & Modelos'
          }
        ]
      : [])
  ];

  return (
    <div className="flex flex-col min-h-[calc(100dvh-68px)] w-full">
      {/* Mobile header */}
      <div className="lg:hidden flex items-center justify-between bg-white border-b border-gray-200 p-4">
        <div className="flex items-center">
          <span className="font-medium">Settings</span>
        </div>
        <Button
          className="-mr-3"
          variant="ghost"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        >
          <Menu className="h-6 w-6" />
          <span className="sr-only">Toggle sidebar</span>
        </Button>
      </div>

      <div className="flex flex-1 h-full">
        {/* Sidebar */}
        <aside
          className={`w-64 bg-white lg:bg-gray-50 border-r border-gray-200 lg:block ${
            isSidebarOpen ? 'block' : 'hidden'
          } lg:relative absolute inset-y-0 left-0 z-40 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <nav className="h-full overflow-y-auto p-4">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} passHref>
                <Button
                  variant={pathname === item.href ? 'secondary' : 'ghost'}
                  className={`shadow-none my-1 w-full justify-start ${
                    pathname === item.href ? 'bg-gray-100' : ''
                  }`}
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Button>
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-0 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
