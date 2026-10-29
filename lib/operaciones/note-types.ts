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
};

export type NoteProposal = {
  items: ProposalItem[];
  notConverted: string[]; // partes de la nota que no son encargos
};

export type NoteAudioInfo = {
  id: string;
  sizeBytes: number;
  hasTranscript: boolean;
  createdAt: string;
};
