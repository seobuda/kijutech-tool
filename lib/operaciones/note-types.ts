// Tipos compartidos entre las acciones de servidor y la pantalla del Bloc de notas.

export type ProposalItem = {
  key: string; // id local para React (no se guarda en ops_requests)
  title: string;
  description: string; // markdown, mismo formato que ops_prepare_request
  missingData: string[];
  listId: string; // '' = la IA no encontró una lista que encaje
  assigneeId: string; // '' = sin asignar
  assigneeName: string;
  dueDate: string; // '' o AAAA-MM-DD
  priority: number; // 1 urgente … 4 baja
  // Opción del campo "Cliente" de la lista elegida ('' = ninguna clara). Items antiguos: undefined.
  clientOptionId?: string;
  clientName?: string;
  // Paso 5: tipo de trabajo (clave de ops_work_types; '' = sin tipo) y casilla «requiere mi revisión».
  workTypeKey?: string;
  requiresReview?: boolean;
  // Equipo: por qué la IA propuso a este responsable según las fichas (una línea; '' = no lo propuso ella).
  assigneeReason?: string;
};

export type NoteProposal = {
  items: ProposalItem[];
  notConverted: string[]; // partes de la nota que no son encargos
};

// Estado de la conversión "nota → encargos". Se guarda en ops_notes.proposal
// (jsonb) para que sobreviva a cambiar de pestaña o recargar la página.
export type ConversionState =
  | { state: 'processing'; step: string; startedAt: string }
  | { state: 'error'; error: string }
  | { state: 'done'; items: ProposalItem[]; notConverted: string[] };

// Tiempo máximo de una conversión. Pasado este tiempo más un margen, un
// "processing" se da por muerto (p. ej. el servidor se reinició a mitad): se
// muestra como error en vez de dejar la pantalla pensando.
export const CONVERSION_TIMEOUT_MS = 150_000;
const CONVERSION_STALE_MS = CONVERSION_TIMEOUT_MS + 15_000;

export function normalizeConversionState(raw: unknown): ConversionState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  if (r.state === 'processing') {
    const started = Date.parse(String(r.startedAt));
    if (!Number.isFinite(started) || Date.now() - started > CONVERSION_STALE_MS) {
      return {
        state: 'error',
        error: 'La conversión tardó demasiado y se canceló. Inténtalo de nuevo.'
      };
    }
    return { state: 'processing', step: String(r.step ?? 'Procesando…'), startedAt: String(r.startedAt) };
  }
  if (r.state === 'error') {
    return { state: 'error', error: String(r.error ?? 'Error desconocido') };
  }
  // 'done', o el formato anterior ({ items, notConverted }) sin campo state.
  if (r.state === 'done' || Array.isArray(r.items)) {
    return {
      state: 'done',
      items: (r.items as ProposalItem[]) ?? [],
      notConverted: (r.notConverted as string[]) ?? []
    };
  }
  return null;
}

export type NoteAudioInfo = {
  id: string;
  sizeBytes: number;
  hasTranscript: boolean;
  createdAt: string;
};
