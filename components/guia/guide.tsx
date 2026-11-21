'use client';

// Cuándo se muestra la visita guiada (fase 5 UX, 21 nov 2026):
// - sola, la primera vez que alguien entra en Inicio (se recuerda en este navegador, por usuario);
// - cuando se pide desde el botón «Ayuda» de la barra superior (si no estás en Inicio, te lleva y empieza allí).
// Administración ve la visita de administración; el resto del equipo, la suya.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import useSWR from 'swr';
import type { SafeUser } from '@/lib/db/queries';
import { ADMIN_TOUR, availableSteps, TEAM_TOUR, tourSeenKey, type TourStep } from './steps';
import { Tour } from './tour';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const GuideCtx = createContext<{ start: () => void }>({ start: () => {} });
export const useGuide = () => useContext(GuideCtx);

function readSeen(userId: number): boolean {
  try {
    return localStorage.getItem(tourSeenKey(userId)) === 'vista';
  } catch {
    return true; // sin almacenamiento: no insistir en cada visita
  }
}
function writeSeen(userId: number) {
  try {
    localStorage.setItem(tourSeenKey(userId), 'vista');
  } catch {
    /* sin almacenamiento */
  }
}

export function GuideProvider({ isAdmin, children }: { isAdmin: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: user } = useSWR<SafeUser | null>('/api/user', fetcher);
  const { data: rolesData } = useSWR<{ roles: string[] }>('/api/user/roles', fetcher);
  const [steps, setSteps] = useState<TourStep[] | null>(null);

  const open = useCallback(() => {
    const list = availableSteps(isAdmin ? ADMIN_TOUR : TEAM_TOUR, (sel) => Boolean(document.querySelector(sel)));
    setSteps(list);
  }, [isAdmin]);

  const start = useCallback(() => {
    if (pathname === '/dashboard') open();
    else router.push('/dashboard?guia=1');
  }, [pathname, open, router]);

  // Primera vez en Inicio, o vuelta desde otra pantalla con ?guia=1. Se espera un momento a que carguen las tarjetas.
  useEffect(() => {
    if (pathname !== '/dashboard' || !user || !rolesData || steps) return;
    // ?guia=1 se lee de la dirección aquí (no con useSearchParams, que obligaría a envolver cada página en Suspense).
    const asked = new URLSearchParams(window.location.search).get('guia') === '1';
    if (!asked && readSeen(user.id)) return;
    const t = setTimeout(() => {
      if (asked) router.replace('/dashboard', { scroll: false });
      open();
    }, 1200);
    return () => clearTimeout(t);
  }, [pathname, user, rolesData, steps, open, router]);

  const onClose = useCallback(() => {
    if (user) writeSeen(user.id);
    setSteps(null);
    // Al terminar, el foco vuelve al botón de ayuda (desde donde se puede repetir).
    setTimeout(() => document.querySelector<HTMLElement>('[data-tour="ayuda"]')?.focus(), 0);
  }, [user]);

  return (
    <GuideCtx.Provider value={{ start }}>
      {children}
      {steps && steps.length > 0 && <Tour steps={steps} onClose={onClose} />}
    </GuideCtx.Provider>
  );
}
