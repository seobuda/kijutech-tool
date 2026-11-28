// SEO · Alta de la cartera: reglas PURAS (parte 2, 26 nov 2026; docs/DISENO-SEO-ALTA-CARTERA.md). Sin base de datos ni
// IA: elegir las páginas que se le enseñan a la IA, preparar su entrada (texto ajeno delimitado), validar lo que propone
// con evidencia comprobable y calcular la «puesta en marcha» del proyecto.
import { normText } from '@/lib/seo/expediente/rules';

export type AltaPage = { url: string; title: string | null; h1: string[]; h2: string[]; anchors: string[]; inlinks: number };

/** Páginas que no describen servicios: legales, blog, etiquetas, autores, carrito, cuenta… */
export const NOT_SERVICE = /\/(aviso-legal|legal|privacidad|privacy|politica|cookies?|terminos|condiciones|blog|noticias|news|tag|etiqueta|category|categoria|author|autor|page|feed|carrito|cart|checkout|mi-cuenta|my-account|wp-json|search|buscar)(\/|$|-)/i;

/** Las páginas que se enseñan a la IA: las más enlazadas desde la web (el menú), sin legales ni blog; como mucho `max`. */
export function candidatePages(pages: AltaPage[], max = 120): AltaPage[] {
  return pages
    .filter((p) => {
      try {
        return !NOT_SERVICE.test(new URL(p.url).pathname);
      } catch {
        return false;
      }
    })
    .sort((a, b) => b.inlinks - a.inlinks)
    .slice(0, max);
}

/** Quita lo que podría cerrar el delimitador del texto ajeno y recorta. */
export const clean = (s: string | null | undefined, max = 200) => (s ?? '').replace(/<<<|>>>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export type AltaInput = { pages: AltaPage[]; jsonldText: string; address: string | null; areaServed: string[]; gscQueries: string[] };

/** El texto que recibe la IA: todo dato de la web va dentro de <<<DATO NO FIABLE … FIN>>>. */
export function promptBlocks(input: AltaInput): { paginas: string; jsonld: string; busquedas: string; direccion: string } {
  const paginas = input.pages
    .map((p) => `- ${clean(p.url, 200)} | título: ${clean(p.title, 120)} | h1: ${clean(p.h1.join(' / '), 120)}${p.h2.length ? ` | h2: ${clean(p.h2.slice(0, 4).join(' / '), 160)}` : ''}${p.anchors.length ? ` | enlazada como: ${clean(p.anchors.slice(0, 3).join(' / '), 120)}` : ''}`)
    .join('\n');
  return {
    paginas: `<<<DATO NO FIABLE\n${paginas.slice(0, 18000)}\nFIN>>>`,
    jsonld: `<<<DATO NO FIABLE\n${clean(input.jsonldText, 3000)}\nFIN>>>`,
    busquedas: `<<<DATO NO FIABLE\n${input.gscQueries.map((q) => `- ${clean(q, 100)}`).join('\n').slice(0, 4000)}\nFIN>>>`,
    direccion: `<<<DATO NO FIABLE\n${clean([input.address, ...input.areaServed].filter(Boolean).join(' · '), 600)}\nFIN>>>`
  };
}

export type ServiceProposal = { nombre: string; url: string | null; cita: string; sinPagina: boolean };
export type AltaProposal = { negocio: string | null; servicios: ServiceProposal[]; zona: { texto: string; cita: string } | null; publico: string | null };

const has = (hay: string, needle: string) => normText(hay).includes(normText(needle));
/** Palabras con significado (4 letras o más), normalizadas; quita plurales sencillos para comparar «reformas» y «reforma». */
const tokens = (s: string) => new Set(normText(s).split(' ').filter((w) => w.length >= 4).map((w) => w.replace(/(es|s)$/, '')));
/** El nombre del servicio y su cita comparten alguna palabra con significado (la cita prueba ESE servicio). */
const related = (name: string, quote: string) => {
  const q = tokens(quote);
  return [...tokens(name)].some((t) => q.has(t));
};
const goodQuote = (q: unknown): q is string => typeof q === 'string' && q.trim().length >= 4 && /\p{L}{3,}/u.test(q);
/** Un servicio, como los guarda la ficha: ≤ 60 caracteres, ≤ 6 palabras y sin comas. */
const goodName = (n: unknown): n is string => typeof n === 'string' && n.trim().length >= 3 && n.trim().length <= 60 && n.trim().split(/\s+/).length <= 6 && !/[,;]/.test(n);

/**
 * Valida lo que propone la IA con lo que realmente hay en la entrada (nada se acepta por fe):
 * - servicio con URL: la URL existe en el rastreo y su cita está en el título, el H1 o el texto de un enlace a ESA página;
 * - servicio sin URL: la cita está en un H2, en el JSON-LD o en una búsqueda de Search Console (queda «sin página»);
 * - zona: la cita está en la dirección, en el área de servicio del JSON-LD o en una búsqueda; si no, no hay zona;
 * - negocio y público: resumen de la IA, sin cita (se dice en la pantalla); como mucho 300 caracteres.
 */
export function validateProposal(raw: unknown, input: AltaInput): AltaProposal {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const byUrl = new Map(input.pages.map((p) => [p.url, p]));
  const h2All = input.pages.flatMap((p) => p.h2);
  const services: ServiceProposal[] = [];
  const seen = new Set<string>();
  for (const s of Array.isArray(r.servicios) ? r.servicios : []) {
    const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
    if (!goodName(o.nombre) || !goodQuote(o.cita) || !related(o.nombre, o.cita)) continue;
    const name = o.nombre.trim();
    const key = normText(name);
    if (!key || seen.has(key)) continue;
    const url = typeof o.url === 'string' && byUrl.has(o.url) ? o.url : null;
    let ok = false;
    if (url) {
      const p = byUrl.get(url)!;
      ok = [p.title ?? '', ...p.h1, ...p.anchors].some((t) => has(t, o.cita as string));
    } else ok = h2All.some((h) => has(h, o.cita as string)) || has(input.jsonldText, o.cita) || input.gscQueries.some((q) => has(q, o.cita as string));
    if (!ok) continue;
    seen.add(key);
    services.push({ nombre: name, url, cita: (o.cita as string).trim().slice(0, 160), sinPagina: !url });
    if (services.length >= 15) break;
  }
  let zona: AltaProposal['zona'] = null;
  const z = (r.zona && typeof r.zona === 'object' ? r.zona : {}) as Record<string, unknown>;
  const pobl = (Array.isArray(z.poblaciones) ? z.poblaciones : []).filter((x): x is string => typeof x === 'string' && x.trim().length >= 2 && x.trim().length <= 40).map((x) => x.trim());
  if (pobl.length && goodQuote(z.cita)) {
    const sources = [input.address ?? '', ...input.areaServed, ...input.gscQueries];
    if (sources.some((t) => has(t, z.cita as string))) zona = { texto: [...new Set(pobl)].join(', ').slice(0, 255), cita: (z.cita as string).trim().slice(0, 160) };
  }
  const short = (v: unknown) => (typeof v === 'string' && v.trim().length >= 10 ? v.trim().slice(0, 300) : null);
  return { negocio: short(r.negocio), servicios: services, zona, publico: short(r.publico) };
}

/** Idiomas de la web (sin IA): el atributo lang de las páginas y las versiones hreflang. Códigos de 2 letras, por uso. */
export function webLanguages(pages: { lang: string | null; hreflang: { lang: string }[] | null }[]): string[] {
  const two = (c: string | null | undefined) => (c ?? '').toLowerCase().slice(0, 2);
  // Manda el idioma propio de cada página (<html lang>); las versiones hreflang solo añaden idiomas, detrás.
  const own = new Map<string, number>();
  for (const p of pages) {
    const c = two(p.lang);
    if (/^[a-z]{2}$/.test(c)) own.set(c, (own.get(c) ?? 0) + 1);
  }
  const total = pages.length || 1;
  const main = [...own].filter(([, n]) => n / total >= 0.05).sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const alt = new Set<string>();
  for (const p of pages) for (const h of p.hreflang ?? []) if (/^[a-z]{2}$/.test(two(h.lang))) alt.add(two(h.lang));
  return [...new Set([...main, ...alt])].slice(0, 4);
}

// --- Puesta en marcha ------------------------------------------------------------------------------------------------

export type ReadyItem = { key: string; label: string; ok: boolean; auto: boolean; hint: string };
export type ReadyState = {
  web: boolean;
  gscAssigned: boolean;
  gscHasData: boolean;
  audited: boolean;
  mapBuilt: boolean;
  negocio: boolean;
  servicios: boolean;
  zona: boolean;
  contacto: boolean;
  atencion: boolean;
  idiomas: boolean;
  competencia: number;
  /** Simulación del 27 nov: lo que bloquea el trabajo si falta (opcionales: sin dato, no se piden). */
  ficha?: boolean;
  accesoWeb?: boolean;
};

/**
 * Lo que necesita un proyecto para que funcionen el informe, las posiciones (servicio × zona), el local y la medición.
 * «auto» = lo hace el sistema solo (no es tarea de nadie: solo hay que esperar o lanzarlo).
 */
export function readiness(s: ReadyState): { items: ReadyItem[]; done: number; total: number } {
  const items: ReadyItem[] = [
    { key: 'web', label: 'Web en el alcance del proyecto', ok: s.web, auto: false, hint: 'Edita el proyecto y marca la web del cliente.' },
    { key: 'gsc', label: 'Search Console asignado y con datos', ok: s.gscAssigned && s.gscHasData, auto: !s.gscAssigned ? false : true, hint: s.gscAssigned ? 'Asignado: la primera descarga tarda unas horas.' : 'Edita el proyecto y marca su propiedad de Search Console.' },
    { key: 'auditoria', label: 'Primera auditoría hecha', ok: s.audited, auto: true, hint: 'Pulsa «Empezar análisis»: rastrea la web y lo demás va solo, por etapas.' },
    { key: 'mapa', label: 'Mapa de palabras hecho', ok: s.mapBuilt, auto: true, hint: 'Se hace solo tras la auditoría si hay datos de Search Console.' },
    { key: 'negocio', label: 'A qué se dedica (confirmado)', ok: s.negocio, auto: false, hint: 'La IA lo propone tras la auditoría: confírmalo abajo.' },
    { key: 'servicios', label: 'Servicios (confirmados)', ok: s.servicios, auto: false, hint: 'La IA los propone tras la auditoría: confírmalos abajo y pásalos a la ficha.' },
    { key: 'zona', label: 'Zona donde trabaja (confirmada)', ok: s.zona, auto: false, hint: 'La IA la propone si la web o Google la dicen; si no, escríbela o pregúntasela al cliente.' },
    { key: 'atencion', label: 'Cómo atiende (local, a domicilio u online)', ok: s.atencion, auto: false, hint: 'Elige abajo: cambia el sentido de la zona y del mapa de Google.' },
    { key: 'idiomas', label: 'Idiomas en los que le buscan', ok: s.idiomas, auto: false, hint: 'Se deducen de la web: confírmalos abajo.' },
    { key: 'competencia', label: 'Competencia confirmada (3 o más)', ok: s.competencia >= 3, auto: false, hint: 'En Palabras → Competencia: buscar en Google y confirmar los competidores reales.' },
    { key: 'contacto', label: 'Contacto con correo para el informe', ok: s.contacto, auto: false, hint: 'En la ficha del cliente → Contactos: marca quién recibe los informes.' },
    ...(s.ficha === undefined ? [] : [{ key: 'ficha', label: 'Ficha de Google confirmada', ok: s.ficha, auto: false, hint: 'En la pestaña Local: «Buscar su ficha» y confirmarla (o pegar su enlace de Maps).' }]),
    ...(s.accesoWeb === undefined ? [] : [{ key: 'acceso', label: 'Acceso a la web (para hacer los encargos)', ok: s.accesoWeb, auto: false, hint: 'En la ficha del cliente → Activos: marca la web con acceso «sí» (y apunta dónde están los accesos).' }])
  ];
  return { items, done: items.filter((i) => i.ok).length, total: items.length };
}
