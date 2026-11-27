// SEO · Jefe SEO, D1: evidencias con CLAVE ESTABLE (docs/PLAN-SEO-JEFE.md §4, con la auditoría Opus, grave 4). PURO.
// Cada dato del expediente lleva un identificador que no cambia aunque se rehaga el mapa (los topic ids se borran): T:<topicKey>,
// U:<url>, Q:<búsqueda>, H:<dedupeKey del hallazgo>, C:<dominio>, N:<id de la novedad>, M:<id de la memoria>,
// X:<técnica>, P:<palabra seguida>, L:<ficha>. Una evidencia guarda además la copia de lo que valía al generar.

export type EvidenceType = 'T' | 'U' | 'Q' | 'H' | 'C' | 'N' | 'M' | 'X' | 'P' | 'L' | 'S';
export type Evidence = { id: string; type: EvidenceType; label: string; data: Record<string, unknown> };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
export function evidenceId(type: EvidenceType, key: string): string {
  const k = type === 'U' ? key.trim().replace(/[?#].*$/, '') : type === 'Q' || type === 'T' || type === 'P' ? norm(key) : key.trim();
  return `${type}:${k}`.slice(0, 260);
}

/** Valida las evidencias que cita la IA: solo las que existen en el expediente; devuelve las buenas y las descartadas. */
export function validateEvidence(cited: unknown, dossier: Map<string, Evidence>): { ok: Evidence[]; rejected: string[] } {
  const list = Array.isArray(cited) ? cited.map((x) => (typeof x === 'string' ? x : typeof x === 'object' && x && 'id' in x ? String((x as { id: unknown }).id) : '')).filter(Boolean) : [];
  const ok: Evidence[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  for (const raw of list.slice(0, 40)) {
    const id = raw.trim();
    if (seen.has(id)) continue;
    seen.add(id);
    const e = dossier.get(id);
    if (e) ok.push(e);
    else rejected.push(id.slice(0, 120));
  }
  return { ok, rejected };
}

/** Texto de un dato que viene de fuera (webs, títulos, búsquedas): delimitado como dato no fiable. */
export const untrusted = (s: string) => `<<<DATO NO FIABLE ${s.replace(/<<<|>>>/g, '').slice(0, 300)} FIN>>>`;

/** Una línea del expediente para el prompt: [id] etiqueta · datos clave. */
export function evidenceLine(e: Evidence, external = false): string {
  const data = Object.entries(e.data)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .slice(0, 8)
    .map(([k, v]) => `${k}=${typeof v === 'number' ? Math.round(v * 100) / 100 : String(v).replace(/[\s<>\[\]]+/g, ' ').slice(0, 80)}`)
    .join(' · ');
  return `[${e.id}] ${external ? untrusted(e.label) : e.label}${data ? ` · ${data}` : ''}`;
}
