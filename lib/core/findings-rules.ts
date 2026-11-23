// Hallazgos: regla pura del ciclo de vida (cimientos, 23 nov 2026). Se prueba sin base de datos.

export type FindingInput = {
  kind: string;
  /** Identifica el mismo hallazgo entre ejecuciones (p. ej. «title_missing:<hash de la URL>»). */
  dedupeKey: string;
  severity?: 'info' | 'aviso' | 'importante' | 'critico';
  url?: string | null;
  query?: string | null;
  metric?: string | null;
  value?: number | null;
  evidence?: Record<string, unknown>;
};

export type ExistingFinding = { id: string; dedupeKey: string; status: string };

/**
 * Qué hacer con lo detectado en esta ejecución frente a lo que ya había (de la misma fuente y tipos):
 * - insert: lo nuevo;
 * - update: lo que sigue apareciendo (reopen = estaba resuelto y vuelve);
 * - resolve: lo abierto que ya no aparece.
 * Un descartado o aceptado nunca se reabre ni se resuelve solo. Si llega dos veces la misma clave, cuenta una.
 */
export function planFindingSync(existing: ExistingFinding[], incoming: FindingInput[]): {
  insert: FindingInput[];
  update: { id: string; input: FindingInput; reopen: boolean }[];
  resolve: string[];
} {
  const byKey = new Map(existing.map((e) => [e.dedupeKey, e]));
  const seen = new Set<string>();
  const insert: FindingInput[] = [];
  const update: { id: string; input: FindingInput; reopen: boolean }[] = [];
  for (const f of incoming) {
    if (seen.has(f.dedupeKey)) continue;
    seen.add(f.dedupeKey);
    const e = byKey.get(f.dedupeKey);
    if (!e) insert.push(f);
    else update.push({ id: e.id, input: f, reopen: e.status === 'resuelto' });
  }
  const resolve = existing.filter((e) => e.status === 'abierto' && !seen.has(e.dedupeKey)).map((e) => e.id);
  return { insert, update, resolve };
}
