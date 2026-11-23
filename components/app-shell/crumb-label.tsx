'use client';

// Nombre de la última miga (23 nov 2026). Las migas salen de la ruta, y un identificador se ve como «Detalle». Una ficha
// (persona, cliente, entrada…) pinta <CrumbLabel label={nombre} /> y la miga y el título móvil muestran ese nombre.
// Solo vale para la ruta en la que se pintó: al salir de la página se borra.
import { useEffect, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';

type State = { path: string; label: string } | null;
let state: State = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

export function CrumbLabel({ label }: { label: string }) {
  const pathname = usePathname();
  useEffect(() => {
    state = { path: pathname, label };
    emit();
    return () => {
      if (state?.path === pathname) {
        state = null;
        emit();
      }
    };
  }, [pathname, label]);
  return null;
}

/** Nombre puesto por la página para esta ruta, o null. */
export function useCrumbLabel(pathname: string): string | null {
  const s = useSyncExternalStore(subscribe, () => state, () => null);
  return s && s.path === pathname ? s.label : null;
}
