// SEO · Enlaces rotos hacia otras webs: reglas PURAS (parte 1, técnico 2a, 26 nov 2026). Se prueban sin red.
import { sha1 } from '@/lib/core/crawl-extract';
import type { FindingInput } from '@/lib/core/findings-rules';

export type ExternalCheck = { state: 'ok' | 'roto' | 'dns' | 'desconocido'; status: number };

/** Qué dice una respuesta: roto (404/410), dominio inexistente (dns) o no se sabe (bloqueos, 5xx, tiempo agotado). */
export function classifyExternal(status: number, error: string | null): ExternalCheck {
  if (status === 404 || status === 410) return { state: 'roto', status };
  if (status >= 200 && status < 400) return { state: 'ok', status };
  if (!status && error && /ENOTFOUND/.test(error)) return { state: 'dns', status: 0 };
  return { state: 'desconocido', status };
}

/** Orden de comprobación: primero las que ya tenían hallazgo abierto; luego el resto, en un orden que cambia con cada rastreo. */
export function checkOrder(urls: string[], openTargets: Set<string>, seed: string): string[] {
  const key = (u: string) => sha1(`${seed}|${u}`);
  return [...urls].sort((a, b) => Number(openTargets.has(b)) - Number(openTargets.has(a)) || (key(a) < key(b) ? -1 : 1));
}

type OpenFinding = { kind: string; dedupeKey: string; url: string | null; value: number | null; evidence: Record<string, unknown> };

/**
 * Lo que se sincroniza: los rotos comprobados en esta pasada (un hallazgo por URL de destino, con las páginas que la
 * enlazan), y los abiertos que esta pasada no ha podido decidir (no comprobados o «no se sabe»), tal cual, para no
 * resolverlos sin motivo. Un dominio inexistente cuenta la primera vez como informativo y, si sigue, como aviso.
 */
export function externalFindings(results: Map<string, ExternalCheck>, linkedFrom: Map<string, string[]>, prevDns: Set<string>, open: OpenFinding[]): FindingInput[] {
  const out: FindingInput[] = [];
  const decided = new Set<string>();
  for (const [target, r] of results) {
    if (r.state === 'desconocido') continue;
    decided.add(target);
    if (r.state === 'ok') continue;
    const from = linkedFrom.get(target) ?? [];
    out.push({
      kind: 'seo.external_broken',
      dedupeKey: `seo.external_broken:${sha1(target).slice(0, 16)}`,
      url: from[0] ?? null,
      severity: r.state === 'dns' && !prevDns.has(target) ? 'info' : 'aviso',
      metric: 'paginas',
      value: from.length,
      evidence: { target, status: r.status, dns: r.state === 'dns', pages: from.slice(0, 10) }
    });
  }
  for (const f of open) {
    const target = String(f.evidence?.target ?? '');
    if (!decided.has(target)) out.push({ kind: f.kind, dedupeKey: f.dedupeKey, url: f.url, value: f.value, evidence: f.evidence });
  }
  return out;
}
