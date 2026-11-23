// SEO · Local sin Places (Hito 1, 23 nov 2026; docs/DISENO-MODULO-SEO.md §5 «Local»): reglas PURAS, sin IA.
//   - Coherencia del NAP (nombre, dirección y teléfono) entre la ficha del cliente y lo que dice su web (expediente).
//   - Una página por servicio: cada servicio de la ficha («Qué vende u ofrece») debería tener su propia página indexable.
// Las reseñas y la ficha de Google llegarán con Places API.
import type { FindingInput } from '@/lib/core/findings-rules';
import { factKey, normText, sameName, display } from '@/lib/seo/expediente/rules';

export const LOCAL_SOURCE = 'seo.local:nap';

export type LocalFact = { field: string; value: unknown; source: string; status: string; sourceRef?: string | null };
export type LocalPage = { url: string; title: string | null; h1: string[] | null; indexable: boolean };

const STOP = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'o', 'en', 'con', 'para', 'por', 'a', 'al', 'un', 'una', 'su', 'sus', 'tu', 'tus',
  'servicio', 'servicios', 'todo', 'tipo', 'tipos', 'toda', 'todas', 'todos', 'etc'
]);

/** Servicios a partir del texto libre de la ficha: líneas, viñetas, comas o «;». Solo los que parecen un servicio. */
export function parseServices(text: string | null | undefined): string[] {
  if (!text?.trim()) return [];
  const parts = text
    .split(/\r?\n|;|•|·|,|\s-\s/)
    .map((x) => x.replace(/^[\s*\-–\d.)]+/, '').trim())
    .filter((x) => x.length >= 3 && x.length <= 60 && !/[.:!?]$/.test(x) && x.split(/\s+/).length <= 6);
  return [...new Map(parts.map((p) => [normText(p), p])).values()].slice(0, 25);
}

/** Palabras que identifican un servicio (sin vacías; raíz simple para plurales). */
export function serviceTokens(service: string): string[] {
  return normText(service)
    .split(' ')
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map((w) => w.replace(/(es|s)$/, ''));
}

/** ¿Alguna página indexable trata de este servicio? Todas sus palabras en la URL, el título o el H1. */
export function servicePage(service: string, pages: LocalPage[]): LocalPage | null {
  const toks = serviceTokens(service);
  if (!toks.length) return null;
  for (const p of pages) {
    if (!p.indexable) continue;
    let path = p.url;
    try {
      path = new URL(p.url).pathname;
    } catch {
      /* URL rara: se usa entera */
    }
    const hay = normText(`${path.replace(/[-_/]/g, ' ')} ${p.title ?? ''} ${(p.h1 ?? []).join(' ')}`)
      .split(' ')
      .map((w) => w.replace(/(es|s)$/, ''));
    if (toks.every((t) => hay.includes(t))) return p;
  }
  return null;
}

const ok = (f: LocalFact) => f.status !== 'descartado';
const hash = (s: string) => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return (h >>> 0).toString(16);
};

/**
 * Hallazgos locales. «facts» = datos del expediente (ficha, web, persona…); «services» = de la ficha; «pages» = del último
 * rastreo (null = no hay rastreo terminado: no se comprueban las páginas por servicio).
 */
export function auditLocal(input: { facts: LocalFact[]; services: string[]; pages: LocalPage[] | null; isOrganization: boolean }): FindingInput[] {
  const out: FindingInput[] = [];
  const facts = input.facts.filter(ok);
  // Lo que una persona confirmó manda sobre la ficha.
  const ref = (field: string) => facts.find((f) => f.field === field && f.source === 'persona') ?? facts.find((f) => f.field === field && f.source === 'ficha');
  const web = (field: string) => facts.find((f) => f.field === field && f.source === 'web');

  const name = { ref: ref('nombre'), web: web('nombre') };
  if (name.ref && name.web && !sameName(name.ref.value, name.web.value)) {
    out.push({
      kind: 'seo.nap_name_mismatch',
      dedupeKey: 'seo.nap_name_mismatch',
      evidence: { ficha: display('nombre', name.ref.value), web: display('nombre', name.web.value), donde: name.web.sourceRef ?? null }
    });
  }

  const phone = { ref: ref('telefono'), web: web('telefono') };
  if (phone.ref && phone.web && factKey('telefono', phone.ref.value) !== factKey('telefono', phone.web.value)) {
    out.push({
      kind: 'seo.nap_phone_mismatch',
      dedupeKey: 'seo.nap_phone_mismatch',
      evidence: { ficha: display('telefono', phone.ref.value), web: display('telefono', phone.web.value), donde: phone.web.sourceRef ?? null }
    });
  }
  if (!input.isOrganization && !phone.web && input.pages) {
    out.push({ kind: 'seo.nap_phone_missing', dedupeKey: 'seo.nap_phone_missing', evidence: { ficha: phone.ref ? display('telefono', phone.ref.value) : null } });
  }

  const addr = { ref: ref('direccion'), web: web('direccion') };
  if (addr.ref && addr.web) {
    const a = factKey('direccion', addr.ref.value);
    const b = factKey('direccion', addr.web.value);
    // Solo si los dos tienen código postal o población y no coinciden (una dirección sin CP no es una contradicción).
    const [cpA, cityA] = (a ?? '|').split('|');
    const [cpB, cityB] = (b ?? '|').split('|');
    const differs = (cpA && cpB && cpA !== cpB) || (!cpA || !cpB ? cityA && cityB && cityA !== cityB : false);
    if (differs) {
      out.push({
        kind: 'seo.nap_address_mismatch',
        dedupeKey: 'seo.nap_address_mismatch',
        evidence: { ficha: display('direccion', addr.ref.value), web: display('direccion', addr.web.value), donde: addr.web.sourceRef ?? null }
      });
    }
  }

  if (input.pages) {
    for (const s of input.services) {
      if (servicePage(s, input.pages)) continue;
      out.push({ kind: 'seo.service_page_missing', dedupeKey: `seo.service_page_missing:${hash(normText(s))}`, query: s.slice(0, 200), evidence: { servicio: s } });
    }
  }
  return out;
}
