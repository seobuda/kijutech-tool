// Reglas puras de las pruebas «pantallas-*» (22 nov 2026): qué pantallas se recorren y cuándo una visita cuenta como
// fallo. Sin base de datos ni red, para poder probarlas solas (tests/pantallas.test.ts).

export type PageVisit = { route: string; status: number; location: string | null; body: string };
export type PageOutcome = 'ok' | 'sin-acceso' | 'fallo';
export type PageVerdict = { route: string; outcome: PageOutcome; detail: string };

/**
 * Las pantallas a recorrer, sacadas del manifiesto de rutas que genera `next build` (.next/app-path-routes-manifest.json):
 * así una pantalla nueva entra sola, sin mantener una lista. Solo páginas del panel (/dashboard…) sin parte variable
 * ([id]): la cuenta de pruebas no tiene clientes ni proyectos con los que rellenarlas.
 */
export function pageRoutes(manifest: Record<string, string>): string[] {
  const out = new Set<string>();
  for (const [file, route] of Object.entries(manifest)) {
    if (!file.endsWith('/page')) continue;
    if (typeof route !== 'string' || !route.startsWith('/dashboard')) continue;
    if (route.includes('[')) continue;
    out.add(route);
  }
  return [...out].sort();
}

// Marcas de React/Next que NO son un fallo: redirecciones, «no encontrado» y la página que pasa a pintarse en el navegador.
const HARMLESS_DIGEST = /^(NEXT_|BAILOUT_TO_CLIENT_SIDE_RENDERING|DYNAMIC_SERVER_USAGE)/;
// La página de error de la herramienta (app/error.tsx lleva esta marca): si aparece, la pantalla se rompió. Se busca la
// marca y no el texto «Algo ha fallado», que también puede salir en la lista de Errores.
const ERROR_PAGE_TEXT = 'data-pagina-error';

/** Un fallo que React dejó marcado en el HTML (un trozo de la pantalla que reventó en el servidor), o null. */
export function failedDigest(body: string): string | null {
  for (const m of body.matchAll(/data-dgst="([^"]*)"/g)) {
    if (m[1] && !HARMLESS_DIGEST.test(m[1])) return m[1];
  }
  return null;
}

/** Veredicto de una visita: fallo (5xx, sesión rechazada, página de error o trozo roto), sin acceso (su rol no la ve) u ok. */
export function judgePage(v: PageVisit): PageVerdict {
  const at = (outcome: PageOutcome, detail: string): PageVerdict => ({ route: v.route, outcome, detail });
  if (v.status >= 500) return at('fallo', `respondió ${v.status}`);
  if (v.status >= 300 && v.status < 400) {
    const loc = v.location ?? '';
    if (/\/sign-in\b/.test(loc)) return at('fallo', 'rechazó la sesión de prueba (mandó a iniciar sesión)');
    return at('sin-acceso', `redirige a ${loc.replace(/^https?:\/\/[^/]+/, '') || '¿?'}`);
  }
  if (v.status === 404) return at('sin-acceso', 'no encontrada para este rol');
  if (v.status !== 200) return at('fallo', `respondió ${v.status}`);
  if (v.body.includes(ERROR_PAGE_TEXT)) return at('fallo', 'muestra la página de error');
  const dg = failedDigest(v.body);
  if (dg) return at('fallo', `una parte de la pantalla falló en el servidor (código ${dg})`);
  return at('ok', '200');
}
