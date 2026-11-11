'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bot,
  CalendarDays,
  CheckCircle2,
  Circle,
  CloudOff,
  ExternalLink,
  FileText,
  History,
  Inbox,
  Loader2,
  Lock,
  Mic,
  NotebookPen,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
  type LucideIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge, EmptyState, Section, Skeleton } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import {
  getConversionState,
  deleteNote,
  discardProposal,
  saveNote,
  sendNoteRequests,
  startConversion
} from '@/lib/operaciones/note-actions';
import type { ClickUpSpaceWithLists } from '@/lib/operaciones/clickup';
import {
  CONVERSION_TIMEOUT_MS,
  type ConversionState,
  type NoteAudioInfo,
  type NoteProposal,
  type ProposalItem
} from '@/lib/operaciones/note-types';
import { RetryButton } from './encargos/retry-button';

type Member = { id: string; username: string };

type HistoryRow = {
  id: string;
  status: string;
  preview: string;
  spaceName: string | null;
  updatedAt: string;
};

type NoteView = {
  id: string;
  content: string;
  updatedAt: string; // última vez que el SERVIDOR confirmó un guardado
  status: string;
  spaceId: string;
  assigneeId: string;
  conversion: ConversionState | null;
  audios: NoteAudioInfo[];
  requests: {
    id: string;
    title: string;
    status: string;
    url: string | null;
    error: string | null;
    listName: string | null;
  }[];
};

const AUTOSAVE_MS = 2500;
const RETRY_SAVE_MS = 8000;

// Copia local de seguridad (localStorage): se escribe en cada cambio, ANTES de
// intentar guardar en el servidor, para que un guardado fallido nunca pierda texto.
type LocalCopy = { content: string; spaceId: string; assigneeId: string; ts: number };

const localKey = (noteId: string | null) => `ops-note-v1:${noteId ?? 'new'}`;

function readLocal(noteId: string | null): LocalCopy | null {
  try {
    const raw = localStorage.getItem(localKey(noteId));
    return raw ? (JSON.parse(raw) as LocalCopy) : null;
  } catch {
    return null;
  }
}

function writeLocal(noteId: string | null, copy: LocalCopy) {
  try {
    localStorage.setItem(localKey(noteId), JSON.stringify(copy));
  } catch {
    // localStorage lleno o bloqueado: no se puede hacer más; el aviso de guardado sigue siendo fiable.
  }
}

function clearLocal(noteId: string | null) {
  try {
    localStorage.removeItem(localKey(noteId));
  } catch {
    // nada
  }
}

// Deja la nota abierta en la URL (?nota=id). Así, cualquier recarga de la página
// (p. ej. al terminar de enviar los encargos, cuando la nota ya no es un borrador)
// vuelve a esta misma nota en vez de abrir una en blanco.
function pinNoteInUrl(noteId: string) {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('nota') === noteId) return;
    url.searchParams.delete('nueva');
    url.searchParams.set('nota', noteId);
    window.history.replaceState(window.history.state, '', url.pathname + url.search);
  } catch {
    // sin historial disponible: no es crítico
  }
}

const timeFmt = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
});
const MAX_RECORDING_SECONDS = 600;

// Controles de formulario: mismo lenguaje que Input (borde suave, anillo de foco visible).
const fieldBase =
  'w-full rounded-lg border border-input bg-background text-sm shadow-xs transition-[color,box-shadow,border-color] outline-none focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/25 disabled:cursor-not-allowed disabled:opacity-60';
const selectClass = `${fieldBase} h-9 px-3`;
const textareaClass = `${fieldBase} px-3 py-2 leading-relaxed`;
const fieldLabel = 'text-xs font-medium text-muted-foreground';
const brandButton = 'bg-brand text-white hover:bg-brand/90';

const PRIORITIES = [
  { value: 1, label: 'Urgente' },
  { value: 2, label: 'Alta' },
  { value: 3, label: 'Normal' },
  { value: 4, label: 'Baja' }
];

const dateFmt = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit'
});

function mmss(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function BlocNotas({
  spaces,
  clientFields,
  workTypes,
  members,
  meId,
  history,
  note
}: {
  spaces: ClickUpSpaceWithLists[];
  clientFields: ClientFields;
  workTypes: { key: string; label: string }[];
  members: Member[];
  meId: string;
  history: HistoryRow[];
  note: NoteView | null;
}) {
  const router = useRouter();
  const readOnly = note?.status === 'convertida';

  const [content, setContent] = useState(note?.content ?? '');
  const [spaceId, setSpaceId] = useState(note?.spaceId ?? '');
  // Las notas nuevas arrancan «Sin asignar»: la IA propone responsable según las fichas del Equipo.
  const [assigneeId, setAssigneeId] = useState(note ? note.assigneeId : '');
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(note?.updatedAt ?? null);
  const [recover, setRecover] = useState<LocalCopy | null>(null);
  const [conversion, setConversion] = useState<ConversionState | null>(note?.conversion ?? null);
  const [starting, setStarting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [audios, setAudios] = useState<NoteAudioInfo[]>(note?.audios ?? []);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [convertError, setConvertError] = useState<string | null>(null);

  // Valores "vivos" para el autoguardado, que no deben depender del render.
  const noteIdRef = useRef<string | null>(note?.id ?? null);
  const latest = useRef({ content, spaceId, assigneeId });
  latest.current = { content, spaceId, assigneeId };
  const dirty = useRef(false);
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const mounted = useRef(false);

  const spaceName = spaces.find((s) => s.id === spaceId)?.name ?? null;
  const assigneeName = members.find((m) => m.id === assigneeId)?.username ?? null;

  // Guarda la nota (la crea la primera vez). Las llamadas se encadenan para
  // que dos guardados seguidos nunca creen dos notas.
  const persist = useCallback(
    (force = false): Promise<string | null> => {
      const run = async (): Promise<string | null> => {
        const s = latest.current;
        if (!noteIdRef.current && !s.content.trim() && !s.spaceId && !force) return null;
        setSaveState('saving');
        let res;
        try {
          res = await saveNote({
            id: noteIdRef.current,
            content: s.content,
            spaceId: s.spaceId || null,
            spaceName: spaces.find((sp) => sp.id === s.spaceId)?.name ?? null,
            assigneeId: s.assigneeId || null,
            assigneeName: members.find((m) => m.id === s.assigneeId)?.username ?? null
          });
        } catch {
          // Un fallo del servidor no puede dejar la cadena de guardados rota ni la pantalla pensando.
          setSaveState('error');
          setSaveError('no se pudo contactar con el servidor');
          return null;
        }
        if (!res.ok) {
          setSaveState('error');
          setSaveError(res.error);
          return null;
        }

        // La base de datos ha confirmado (devuelve la fila guardada). La nota ya tiene id:
        // la copia local pasa a su clave definitiva.
        if (!noteIdRef.current) {
          clearLocal(null);
          noteIdRef.current = res.id;
          pinNoteInUrl(res.id);
        }
        setSaveError(null);
        setLastSavedAt(res.savedAt);
        // La copia local siempre refleja lo último guardado (hora = la del servidor).
        writeLocal(res.id, {
          content: s.content,
          spaceId: s.spaceId,
          assigneeId: s.assigneeId,
          ts: Date.parse(res.savedAt)
        });

        // Si mientras se guardaba se siguió escribiendo, NO está todo guardado todavía.
        const cur = latest.current;
        const unchanged =
          cur.content === s.content && cur.spaceId === s.spaceId && cur.assigneeId === s.assigneeId;
        if (unchanged) {
          dirty.current = false;
          setSaveState('saved');
        } else {
          setSaveState('dirty');
        }
        return res.id;
      };
      const next = saveChain.current.then(run, run);
      saveChain.current = next;
      return next;
    },
    [spaces, members]
  );

  // Autoguardado: unos segundos después de dejar de escribir.
  useEffect(() => {
    if (readOnly) return;
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    dirty.current = true;
    setSaveState('dirty');
    // Copia local inmediata, antes de intentar el servidor.
    writeLocal(noteIdRef.current, { content, spaceId, assigneeId, ts: Date.now() });
    const t = setTimeout(() => void persist(), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [content, spaceId, assigneeId, readOnly, persist]);

  // Al abrir: si la copia local es más reciente que la del servidor, se ofrece recuperarla.
  useEffect(() => {
    if (readOnly) return;
    const local = readLocal(note?.id ?? null);
    if (!local || !local.content.trim()) return;
    const serverContent = note?.content ?? '';
    const serverTs = note ? Date.parse(note.updatedAt) : 0;
    if (local.content !== serverContent && local.ts > serverTs) setRecover(local);
    // solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Una nota ya existente se deja fijada en la URL desde el principio.
  useEffect(() => {
    if (note?.id) pinNoteInUrl(note.id);
    // solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Con un guardado fallido se reintenta solo, y se avisa antes de cerrar la pestaña
  // si hay algo sin guardar.
  useEffect(() => {
    if (readOnly || saveState !== 'error') return;
    const id = setInterval(() => void persist(), RETRY_SAVE_MS);
    return () => clearInterval(id);
  }, [readOnly, saveState, persist]);

  useEffect(() => {
    if (readOnly) return;
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current || saveState === 'error') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [readOnly, saveState]);

  // Si se oculta la pestaña o se cierra, se intenta guardar lo pendiente.
  useEffect(() => {
    if (readOnly) return;
    const flush = () => {
      if (dirty.current) void persist();
    };
    const onVisibility = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, [readOnly, persist]);

  // ------------------------------------------------------------------ audio
  const [recState, setRecState] = useState<'idle' | 'recording' | 'uploading'>('idle');
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const appendTranscript = (text: string) =>
    setContent((c) => (c.trim() ? `${c.trimEnd()}\n\n${text}` : text));

  const uploadAudio = async (form: FormData, isNew: boolean) => {
    setRecState('uploading');
    setAudioError(null);
    try {
      const res = await fetch('/api/operaciones/audio', { method: 'POST', body: form });
      const json = (await res.json()) as {
        audioId?: string;
        transcript?: string;
        error?: string;
        size?: number;
      };
      if (json.audioId) {
        setAudios((prev) => {
          const existing = prev.find((a) => a.id === json.audioId);
          if (existing) {
            return prev.map((a) => (a.id === json.audioId ? { ...a, hasTranscript: !!json.transcript } : a));
          }
          return [
            ...prev,
            {
              id: json.audioId!,
              sizeBytes: Number(form.get('size') ?? 0),
              hasTranscript: !!json.transcript,
              createdAt: new Date().toISOString()
            }
          ];
        });
      }
      if (json.transcript) appendTranscript(json.transcript);
      if (json.error) {
        setAudioError(
          `${json.error}${isNew || json.audioId ? ' — El audio está guardado: se adjuntará igualmente a las tareas.' : ''}`
        );
      }
      if (!json.error && json.transcript === '') {
        setAudioError('No se oyó ninguna voz en el audio.');
      }
    } catch {
      setAudioError('No se pudo enviar el audio al servidor.');
    } finally {
      setRecState('idle');
    }
  };

  const stopRecording = () => {
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
    if (timer.current) clearInterval(timer.current);
  };

  const startRecording = async () => {
    setAudioError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setAudioError('Este navegador no permite grabar audio.');
      return;
    }
    // La nota debe existir para colgar el audio de ella.
    const id = await persist(true);
    if (!id) return;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setAudioError('No se pudo acceder al micrófono (permiso denegado).');
      return;
    }

    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks.current = [];
    mr.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks.current, { type: mr.mimeType || 'audio/webm' });
      const form = new FormData();
      form.append('noteId', id);
      form.append('audio', blob, 'nota.webm');
      form.append('size', String(blob.size));
      void uploadAudio(form, true);
    };
    recorder.current = mr;
    mr.start();
    setSeconds(0);
    setRecState('recording');
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_RECORDING_SECONDS) stopRecording();
        return s + 1;
      });
    }, 1000);
  };

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      if (recorder.current && recorder.current.state !== 'inactive') {
        recorder.current.onstop = null;
        recorder.current.stream.getTracks().forEach((t) => t.stop());
      }
    },
    []
  );

  const retryTranscription = (audioId: string) => {
    const form = new FormData();
    form.append('audioId', audioId);
    void uploadAudio(form, false);
  };

  // --------------------------------------------------------------- convertir
  // La conversión corre en el servidor en segundo plano; aquí solo se lanza y se
  // consulta su estado (paso actual / resultado / error), que queda guardado en la
  // nota: si cambias de pestaña o recargas, al volver se retoma donde estaba.
  const processing = conversion?.state === 'processing';

  const convert = async () => {
    setConvertError(null);
    setStarting(true);
    try {
      const id = await persist(true);
      if (!id) {
        setConvertError(`No se pudo guardar la nota antes de convertirla${saveError ? `: ${saveError}` : ''}.`);
        return;
      }
      const res = await startConversion(id);
      if (!res.ok) {
        setConvertError(res.error);
        return;
      }
      setConversion({ state: 'processing', step: 'Empezando…', startedAt: new Date().toISOString() });
    } catch {
      setConvertError('No se pudo contactar con el servidor. Recarga la página y vuelve a intentarlo.');
    } finally {
      setStarting(false);
    }
  };

  // Sondeo del estado mientras hay una conversión en marcha.
  useEffect(() => {
    if (!processing || !noteIdRef.current) return;
    const noteId = noteIdRef.current;
    const startedAt = Date.parse((conversion as { startedAt: string }).startedAt);
    let failures = 0;
    let stopped = false;

    const poll = async () => {
      if (stopped) return;
      setNow(Date.now());
      // Tope en el cliente: pase lo que pase, la pantalla nunca espera más de esto.
      if (Date.now() - startedAt > CONVERSION_TIMEOUT_MS + 20_000) {
        setConversion({
          state: 'error',
          error: 'La conversión tardó demasiado y se canceló. Inténtalo de nuevo.'
        });
        return;
      }
      try {
        const s = await getConversionState(noteId);
        failures = 0;
        if (!stopped) {
          setConversion(
            s ?? { state: 'error', error: 'Se perdió el estado de la conversión. Inténtalo de nuevo.' }
          );
        }
      } catch {
        if (++failures >= 5 && !stopped) {
          setConversion({
            state: 'error',
            error: 'No se pudo consultar el estado de la conversión (servidor sin respuesta). Recarga la página.'
          });
        }
      }
    };

    const id = setInterval(() => void poll(), 1500);
    const onVisible = () => document.visibilityState === 'visible' && void poll();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processing]);

  const canConvert =
    !readOnly &&
    Boolean(content.trim()) &&
    Boolean(spaceId) &&
    !starting &&
    !processing &&
    recState === 'idle';

  const elapsed =
    conversion?.state === 'processing'
      ? Math.max(0, Math.round((now - Date.parse(conversion.startedAt)) / 1000))
      : 0;

  const [openingId, setOpeningId] = useState<string | null>(null);

  const removeNoteById = async (id: string, converted: boolean) => {
    const msg = converted
      ? '¿Eliminar esta nota? Los encargos que creó y sus tareas de ClickUp NO se borran.'
      : '¿Eliminar esta nota y sus audios? Esta acción no se puede deshacer.';
    if (!window.confirm(msg)) return;
    const res = await deleteNote(id);
    if (!res.ok) {
      window.alert(res.error);
      return;
    }
    clearLocal(id);
    if (id === noteIdRef.current) {
      dirty.current = false;
      window.location.href = '/dashboard/operaciones?nueva=1';
    } else {
      router.refresh();
    }
  };
  const removeNote = () => (noteIdRef.current ? removeNoteById(noteIdRef.current, readOnly) : Promise.resolve());

  const hasNote = Boolean(noteIdRef.current);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="min-w-0 space-y-4">
        {conversion?.state === 'done' && !readOnly ? (
          <ReviewPanel
            noteId={noteIdRef.current!}
            proposal={{ items: conversion.items, notConverted: conversion.notConverted }}
            spaces={spaces}
            clientFields={clientFields}
            workTypes={workTypes}
            spaceId={spaceId}
            members={members}
            onBack={async () => {
              await discardProposal(noteIdRef.current!);
              setConversion(null);
            }}
            onSent={() => router.refresh()}
          />
        ) : (
          <>
            {saveState === 'error' && !readOnly && (
              <Callout tone="danger" icon={CloudOff} role="alert" title="No se ha podido guardar. Copia local activada.">
                <p>
                  Tu texto está a salvo en este navegador. Motivo: {saveError ?? 'desconocido'}. Se reintenta solo
                  cada pocos segundos; no cierres la pestaña hasta que vuelva a poner «Guardado».
                </p>
                <div className="pt-1">
                  <Button size="sm" variant="outline" onClick={() => void persist(true)}>
                    <RotateCcw />
                    Reintentar ahora
                  </Button>
                </div>
              </Callout>
            )}
            {recover && !readOnly && (
              <Callout
                tone="warning"
                icon={AlertTriangle}
                role="alert"
                title="Hay una copia local más reciente que la del servidor"
              >
                <p>
                  Guardada en este navegador el {dateFmt.format(new Date(recover.ts))} ({recover.content.length}{' '}
                  caracteres, frente a {content.length} en el servidor).
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    className={brandButton}
                    onClick={() => {
                      setContent(recover.content);
                      setSpaceId(recover.spaceId);
                      setAssigneeId(recover.assigneeId);
                      setRecover(null);
                    }}
                  >
                    Recuperar la copia local
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      clearLocal(noteIdRef.current);
                      setRecover(null);
                    }}
                  >
                    Descartar
                  </Button>
                </div>
              </Callout>
            )}

            {/* Editor: la nota es la protagonista, como un documento. */}
            <section
              className={cn(
                'overflow-hidden rounded-xl border bg-card shadow-xs transition-[box-shadow,border-color]',
                !readOnly && 'focus-within:border-brand/50 focus-within:shadow-sm'
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-3 sm:px-5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                    <NotebookPen className="size-4" aria-hidden />
                  </span>
                  <Label htmlFor="note" className="text-[15px] font-semibold">
                    Nota
                  </Label>
                  {readOnly ? (
                    <Badge tone="success" dot>
                      Convertida
                    </Badge>
                  ) : hasNote ? (
                    <Badge tone="neutral" dot>
                      Borrador
                    </Badge>
                  ) : (
                    <Badge tone="outline">Nueva</Badge>
                  )}
                </div>
                <SaveIndicator state={saveState} savedAt={lastSavedAt} hasNote={hasNote} readOnly={readOnly} />
              </div>

              <div className="grid gap-3 border-b bg-muted/30 px-4 py-3.5 sm:grid-cols-2 sm:px-5">
                <div className="space-y-1.5">
                  <Label htmlFor="space" className={fieldLabel}>
                    Espacio de ClickUp{' '}
                    <span className="text-destructive" aria-hidden>
                      *
                    </span>
                  </Label>
                  <select
                    id="space"
                    className={selectClass}
                    value={spaceId}
                    disabled={readOnly}
                    required
                    onChange={(e) => setSpaceId(e.target.value)}
                  >
                    <option value="">Elige un espacio…</option>
                    {spaces.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="assignee" className={fieldLabel}>
                    Persona responsable (opcional)
                  </Label>
                  <select
                    id="assignee"
                    className={selectClass}
                    value={assigneeId}
                    disabled={readOnly}
                    onChange={(e) => setAssigneeId(e.target.value)}
                  >
                    <option value="">Sin asignar</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.username}
                        {m.id === meId ? ' (yo)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <textarea
                id="note"
                rows={16}
                className={cn(
                  'block min-h-[18rem] w-full resize-y border-0 bg-transparent px-4 py-4 text-[15px] leading-7 text-foreground outline-none placeholder:text-muted-foreground/70 sm:min-h-[24rem] sm:px-5 sm:py-5',
                  (readOnly || processing) && 'cursor-default text-foreground/85'
                )}
                placeholder="Escribe o dicta todo lo que tengas en la cabeza: uno o varios trabajos, ideas, recordatorios… La IA lo separará después."
                value={content}
                readOnly={readOnly || processing}
                aria-busy={processing || undefined}
                onChange={(e) => setContent(e.target.value)}
              />

              {!readOnly && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-3 py-2.5 sm:px-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {recState === 'recording' ? (
                      <Button
                        variant="outline"
                        onClick={stopRecording}
                        className="border-destructive/40 text-destructive hover:bg-destructive-soft hover:text-destructive"
                      >
                        <span className="relative flex size-2.5" aria-hidden>
                          <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive opacity-60" />
                          <span className="relative inline-flex size-2.5 rounded-full bg-destructive" />
                        </span>
                        <Square className="size-3.5 fill-current" aria-hidden />
                        Parar y transcribir
                        <span className="tabular-nums">({mmss(seconds)})</span>
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={startRecording} disabled={recState === 'uploading'}>
                        {recState === 'uploading' ? (
                          <>
                            <Loader2 className="animate-spin" aria-hidden />
                            Transcribiendo…
                          </>
                        ) : (
                          <>
                            <Mic aria-hidden />
                            Grabar audio
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {hasNote && (
                      <Button
                        variant="ghost"
                        onClick={removeNote}
                        aria-label="Eliminar nota"
                        title="Eliminar nota"
                        className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                      >
                        <Trash2 aria-hidden />
                        <span className="hidden sm:inline">Eliminar nota</span>
                      </Button>
                    )}
                    <Button onClick={convert} disabled={!canConvert} className={brandButton}>
                      {starting || processing ? (
                        <>
                          <Loader2 className="animate-spin" aria-hidden />
                          Convirtiendo…
                        </>
                      ) : (
                        <>
                          <Sparkles aria-hidden />
                          Convertir en encargos
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </section>

            {!readOnly && !spaceId && content.trim() && (
              <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
                <AlertCircle className="size-3.5 shrink-0" aria-hidden />
                Elige el espacio para poder convertir la nota.
              </p>
            )}
            {convertError && (
              <Callout tone="danger" icon={AlertCircle} role="alert">
                <p>{convertError}</p>
              </Callout>
            )}
            {conversion?.state === 'processing' && (
              <div className="space-y-3" aria-live="polite">
                <Callout tone="info" icon={Loader2} iconClassName="animate-spin" title={conversion.step}>
                  <p className="text-xs opacity-90">
                    <span className="tabular-nums">{elapsed} s</span> · Puedes cambiar de pestaña o recargar: el
                    resultado se guarda y lo verás al volver.
                  </p>
                </Callout>
                <ProposalSkeleton />
              </div>
            )}
            {conversion?.state === 'error' && !readOnly && (
              <Callout tone="danger" icon={AlertCircle} role="alert" title="La conversión ha fallado">
                <p>{conversion.error}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" onClick={convert} disabled={!canConvert} className={brandButton}>
                    <RotateCcw />
                    Reintentar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (noteIdRef.current) await discardProposal(noteIdRef.current);
                      setConversion(null);
                    }}
                  >
                    Cerrar aviso
                  </Button>
                </div>
              </Callout>
            )}
            {audioError && (
              <Callout tone="warning" icon={Mic} role="alert">
                <p>{audioError}</p>
              </Callout>
            )}

            {audios.length > 0 && (
              <Section
                title={`Audios de esta nota (${audios.length})`}
                description="Los audios se adjuntan a cada tarea creada desde esta nota."
                className="[&>div:last-child]:p-0"
              >
                <ul className="divide-y">
                  {audios.map((a, i) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                        <Mic className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">Audio {i + 1}</span>
                        {a.sizeBytes ? (
                          <span className="text-muted-foreground"> · {(a.sizeBytes / 1024).toFixed(0)} KB</span>
                        ) : null}
                      </span>
                      {a.hasTranscript ? (
                        <Badge tone="success" dot>
                          Transcrito
                        </Badge>
                      ) : (
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge tone="warning" dot>
                            Sin transcribir
                          </Badge>
                          {!readOnly && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => retryTranscription(a.id)}
                              disabled={recState !== 'idle'}
                            >
                              <RotateCcw />
                              Transcribir de nuevo
                            </Button>
                          )}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {readOnly && note && (
              <Section
                title="Encargos creados desde esta nota"
                className="[&>div:last-child]:p-0"
                actions={
                  <>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/dashboard/operaciones?nueva=1">
                        <Plus />
                        Nueva nota
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={removeNote}
                      className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                    >
                      <Trash2 />
                      Eliminar nota
                    </Button>
                  </>
                }
              >
                {note.requests.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted-foreground">
                    Ninguno (se eliminaron o no se llegaron a crear).
                  </p>
                ) : (
                  <ul className="divide-y">
                    {note.requests.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5 text-sm">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                            <FileText className="size-4" aria-hidden />
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-pretty">{r.title}</p>
                            {r.listName && <p className="text-xs text-muted-foreground">{r.listName}</p>}
                            {r.error && r.status !== 'creado' && (
                              <p className="mt-1 text-xs text-destructive">{r.error}</p>
                            )}
                          </div>
                        </div>
                        {r.url ? (
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-md text-sm font-medium text-brand outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-brand/25"
                          >
                            Abrir tarea
                            <ExternalLink className="size-3.5" aria-hidden />
                          </a>
                        ) : (
                          <RetryButton requestId={r.id} />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            )}
          </>
        )}
      </div>

      <aside className="lg:sticky lg:top-4" aria-label="Historial de notas">
        <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              <History className="size-4 text-muted-foreground" aria-hidden />
              Historial
              {history.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground tabular-nums">{history.length}</span>
              )}
            </h2>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/operaciones?nueva=1">
                <Plus />
                Nueva nota
              </Link>
            </Button>
          </div>
          {history.length === 0 ? (
            <EmptyState
              icon={NotebookPen}
              title="Aún no hay notas"
              description="Lo que escribas se guarda solo y aparecerá aquí."
              className="m-3 border-0 bg-transparent py-10"
            />
          ) : (
            <ul className="space-y-1.5 p-2 lg:max-h-[calc(100dvh-12rem)] lg:overflow-y-auto">
              {history.map((h) => {
                const active = h.id === note?.id;
                const opening = openingId === h.id;
                return (
                  <li key={h.id} className="group relative">
                    {/* Navegación completa (no de cliente): abrir una nota siempre recarga su contenido. */}
                    <a
                      href={`/dashboard/operaciones?nota=${h.id}`}
                      onClick={() => setOpeningId(h.id)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'block rounded-lg border px-3 py-2.5 pr-10 text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-brand/25',
                        active
                          ? 'border-brand/50 bg-brand-soft'
                          : 'border-transparent hover:border-border hover:bg-muted/60',
                        opening && 'opacity-60'
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <Badge tone={h.status === 'convertida' ? 'success' : 'neutral'} dot>
                          {h.status === 'convertida' ? 'Convertida' : 'Borrador'}
                        </Badge>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                          {opening && <Loader2 className="size-3 animate-spin" aria-hidden />}
                          {opening ? 'Abriendo…' : dateFmt.format(new Date(h.updatedAt))}
                        </span>
                      </span>
                      <span className="mt-1.5 line-clamp-2 block text-foreground/90 text-pretty">{h.preview}</span>
                      {h.spaceName && (
                        <span className="mt-1 block truncate text-xs text-muted-foreground">{h.spaceName}</span>
                      )}
                    </a>
                    <button
                      type="button"
                      aria-label="Eliminar nota"
                      title="Eliminar nota"
                      onClick={() => void removeNoteById(h.id, h.status === 'convertida')}
                      className="absolute right-1.5 bottom-1.5 grid size-7 place-items-center rounded-md text-muted-foreground/70 outline-none transition-opacity hover:bg-destructive-soft hover:text-destructive focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-destructive/25 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Piezas de presentación
// ---------------------------------------------------------------------------

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

function agoLabel(ts: number, now: number): string | null {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return 'ahora mismo';
  if (s < 60) return `hace ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  return null;
}

// Indicador discreto de autoguardado. «Guardado» solo si la base de datos lo ha
// confirmado (hora de esa confirmación); el tiempo relativo se calcula tras montar
// para no descuadrar el HTML del servidor.
function SaveIndicator({
  state,
  savedAt,
  hasNote,
  readOnly
}: {
  state: SaveState;
  savedAt: string | null;
  hasNote: boolean;
  readOnly: boolean;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [savedAt]);

  let icon: ReactNode;
  let text: string;
  let tone = 'text-muted-foreground';
  let title: string | undefined;

  if (readOnly) {
    icon = <Lock className="size-3.5" aria-hidden />;
    text = 'Nota convertida (solo lectura)';
  } else if (state === 'saved') {
    if (hasNote && savedAt) {
      const ts = Date.parse(savedAt);
      const rel = now !== null ? agoLabel(ts, now) : null;
      icon = <CheckCircle2 className="size-3.5 text-success" aria-hidden />;
      text = `Guardado · ${rel ?? (now !== null && now - ts > 86_400_000 ? dateFmt.format(new Date(ts)) : timeFmt.format(new Date(ts)))}`;
      title = `Guardado a las ${timeFmt.format(new Date(ts))}`;
    } else {
      icon = <Circle className="size-3.5" aria-hidden />;
      text = 'Sin guardar (empieza a escribir)';
    }
  } else if (state === 'dirty') {
    icon = <span className="size-2 rounded-full bg-warning" aria-hidden />;
    text = 'Cambios sin guardar…';
  } else if (state === 'saving') {
    icon = <Loader2 className="size-3.5 animate-spin" aria-hidden />;
    text = 'Guardando…';
  } else {
    icon = <CloudOff className="size-3.5" aria-hidden />;
    text = 'NO guardado · copia local activada';
    tone = 'text-destructive font-medium';
  }

  return (
    <span
      data-testid="save-status"
      role="status"
      aria-live="polite"
      title={title}
      className={cn('inline-flex items-center gap-1.5 text-xs tabular-nums', tone)}
    >
      {icon}
      {text}
    </span>
  );
}

const calloutTone = {
  danger: 'border-destructive/30 bg-destructive-soft text-destructive',
  warning: 'border-warning/40 bg-warning-soft text-warning-strong',
  info: 'border-info/30 bg-info-soft text-info',
  success: 'border-success/30 bg-success-soft text-success'
} as const;

// Aviso con icono (error, advertencia, progreso o éxito).
function Callout({
  tone,
  icon: Icon,
  iconClassName,
  title,
  role,
  className,
  testId,
  children
}: {
  tone: keyof typeof calloutTone;
  icon?: LucideIcon;
  iconClassName?: string;
  title?: ReactNode;
  role?: 'alert' | 'status';
  className?: string;
  testId?: string;
  children?: ReactNode;
}) {
  return (
    <div
      role={role}
      data-testid={testId}
      className={cn('flex gap-3 rounded-xl border px-4 py-3 text-sm', calloutTone[tone], className)}
    >
      {Icon && <Icon className={cn('mt-0.5 size-4 shrink-0', iconClassName)} aria-hidden />}
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-medium">{title}</p>}
        {children}
      </div>
    </div>
  );
}

// Esqueleto de las propuestas mientras la IA convierte la nota.
function ProposalSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i} className="space-y-3 rounded-xl border bg-card p-5 shadow-xs">
          <div className="flex items-center gap-3">
            <Skeleton className="size-7 rounded-lg" />
            <Skeleton className="h-5 w-2/3" />
          </div>
          <Skeleton className="h-20 w-full" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pantalla de revisión: una tarjeta editable por encargo
// ---------------------------------------------------------------------------

type SendResult = { ok: true; taskUrl: string; reused: boolean } | { ok: false; error: string; requestId: string };

function ReviewPanel({
  noteId,
  proposal,
  spaces,
  clientFields,
  workTypes,
  spaceId,
  members,
  onBack,
  onSent
}: {
  noteId: string;
  proposal: NoteProposal;
  spaces: ClickUpSpaceWithLists[];
  clientFields: ClientFields;
  workTypes: { key: string; label: string }[];
  spaceId: string;
  members: Member[];
  onBack: () => void;
  onSent: () => void;
}) {
  const lists = spaces.find((s) => s.id === spaceId)?.lists ?? [];
  const [items, setItems] = useState<ProposalItem[]>(proposal.items);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, SendResult> | null>(null);

  // Campo Cliente de una lista (de la caché; null si la lista no lo tiene).
  const fieldOf = (listId: string) => {
    const fid = lists.find((l) => l.id === listId)?.clientFieldId;
    return fid ? clientFields[fid] ?? null : null;
  };

  const update = (key: string, patch: Partial<ProposalItem>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const missingList = items.some((i) => !i.listId);
  const missingTitle = items.some((i) => !i.title.trim());

  const sendAll = async () => {
    setError(null);
    setSending(true);
    let res;
    try {
      res = await sendNoteRequests(
        noteId,
        items.map((i) => ({
          key: i.key,
          title: i.title,
          description: i.description,
          listId: i.listId,
          assigneeId: i.assigneeId,
          assigneeName: i.assigneeName,
          dueDate: i.dueDate,
          priority: i.priority,
          clientOptionId: i.clientOptionId ?? '',
          workTypeKey: i.workTypeKey ?? '',
          requiresReview: Boolean(i.requiresReview)
        }))
      );
    } catch {
      setSending(false);
      setError(
        'No se pudo contactar con el servidor. Mira en «Encargos»: si ya aparecen, el envío siguió; si no, vuelve a intentarlo.'
      );
      return;
    }
    setSending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const map: Record<string, SendResult> = {};
    for (const r of res.results) {
      map[r.key] = r.result.ok
        ? { ok: true, taskUrl: r.result.taskUrl, reused: r.result.reused }
        : { ok: false, error: r.result.error, requestId: r.result.requestId };
    }
    setResults(map);
  };

  const sent = results !== null;
  const allOk = sent && Object.values(results!).every((r) => r.ok);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">
              Revisión: {items.length} encargo{items.length === 1 ? '' : 's'}
            </h2>
            <p className="text-sm text-muted-foreground text-pretty">
              Edita lo que quieras antes de enviar. Las listas son las del espacio elegido.
            </p>
          </div>
        </div>
        {!sent && (
          <Button variant="ghost" onClick={onBack} disabled={sending}>
            <ArrowLeft />
            Volver a la nota
          </Button>
        )}
      </div>

      {items.length === 0 && (
        <EmptyState
          icon={Inbox}
          title="La IA no ha encontrado ningún encargo en la nota"
          description="Revisa «No convertido» más abajo o vuelve a la nota."
          className="py-10"
        />
      )}

      {items.map((item, idx) => {
        const result = results?.[item.key];
        const fid = `p-${idx}`;
        return (
          <article key={item.key} className="overflow-hidden rounded-xl border bg-card shadow-xs">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2.5 sm:px-5">
              <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className="grid size-6 place-items-center rounded-md border bg-card text-foreground tabular-nums">
                  {idx + 1}
                </span>
                Encargo {idx + 1}
              </span>
              <div className="flex items-center gap-2">
                {result?.ok && (
                  <a
                    href={result.taskUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-medium text-success outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-success/30"
                  >
                    <CheckCircle2 className="size-3.5" aria-hidden />
                    Creado — abrir tarea
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                )}
                {!sent && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setItems((prev) => prev.filter((i) => i.key !== item.key))}
                    disabled={sending}
                    className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                  >
                    <X />
                    Quitar
                  </Button>
                )}
              </div>
            </header>

            <div className="space-y-4 p-4 sm:p-5">
              {result && !result.ok && (
                <Callout tone="danger" icon={AlertCircle} role="alert">
                  <p>No se pudo crear en ClickUp: {result.error}</p>
                  <RetryButton requestId={result.requestId} />
                </Callout>
              )}

              <div className="space-y-1.5">
                <Label htmlFor={`${fid}-title`} className={fieldLabel}>
                  Título
                </Label>
                <Input
                  id={`${fid}-title`}
                  value={item.title}
                  disabled={sent}
                  aria-invalid={!item.title.trim() || undefined}
                  className="h-10 text-[15px] font-medium"
                  onChange={(e) => update(item.key, { title: e.target.value })}
                />
              </div>

              {item.missingData.length > 0 && (
                <Callout tone="warning" icon={AlertTriangle} title="Faltan datos:">
                  <ul className="ml-4 list-disc space-y-0.5">
                    {item.missingData.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </Callout>
              )}

              <div className="space-y-1.5">
                <Label htmlFor={`${fid}-desc`} className={fieldLabel}>
                  Descripción
                </Label>
                <textarea
                  id={`${fid}-desc`}
                  rows={10}
                  className={`${textareaClass} resize-y font-mono text-[13px]`}
                  value={item.description}
                  disabled={sent}
                  onChange={(e) => update(item.key, { description: e.target.value })}
                />
              </div>

              <ClientPicker
                id={`${fid}-client`}
                field={fieldOf(item.listId)}
                hasList={Boolean(item.listId)}
                value={item.clientOptionId ?? ''}
                disabled={sent}
                onChange={(o) =>
                  update(item.key, { clientOptionId: o?.id ?? '', clientName: o?.label ?? '', clientWarning: '' })
                }
              />

              {item.clientWarning && (
                <Callout tone="warning" icon={AlertTriangle} testId="client-warning">
                  <p>{item.clientWarning}. Decide si quieres enviar este encargo igualmente.</p>
                </Callout>
              )}

              <div className="grid gap-4 rounded-lg border bg-muted/20 p-3.5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`${fid}-list`} className={fieldLabel}>
                    Lista{' '}
                    <span className="text-destructive" aria-hidden>
                      *
                    </span>
                  </Label>
                  <select
                    id={`${fid}-list`}
                    className={cn(selectClass, !item.listId && 'border-destructive/70')}
                    value={item.listId}
                    disabled={sent}
                    required
                    aria-invalid={!item.listId || undefined}
                    onChange={(e) => {
                      // Si la nueva lista usa otro campo Cliente, el cliente elegido ya no vale.
                      const f = fieldOf(e.target.value);
                      const keep = f?.options.some((o) => o.id === item.clientOptionId);
                      update(item.key, {
                        listId: e.target.value,
                        ...(keep ? {} : { clientOptionId: '', clientName: '', clientWarning: '' })
                      });
                    }}
                  >
                    <option value="">Elige una lista…</option>
                    {lists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.folder ? `${l.folder} / ${l.name}` : l.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${fid}-assignee`} className={fieldLabel}>
                    Responsable
                  </Label>
                  <select
                    id={`${fid}-assignee`}
                    className={selectClass}
                    value={item.assigneeId}
                    disabled={sent}
                    onChange={(e) =>
                      update(item.key, {
                        assigneeId: e.target.value,
                        assigneeName: members.find((m) => m.id === e.target.value)?.username ?? '',
                        assigneeReason: ''
                      })
                    }
                  >
                    <option value="">Sin asignar</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.username}
                      </option>
                    ))}
                  </select>
                  {item.assigneeReason && (
                    <p
                      className="flex items-start gap-1.5 text-xs text-muted-foreground"
                      data-testid="assignee-reason"
                    >
                      <Bot className="mt-px size-3.5 shrink-0 text-brand" aria-hidden />
                      <span>Propuesto por la IA: {item.assigneeReason}</span>
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${fid}-due`} className={fieldLabel}>
                    Entrega
                  </Label>
                  <Input
                    id={`${fid}-due`}
                    type="date"
                    value={item.dueDate}
                    disabled={sent}
                    onChange={(e) => update(item.key, { dueDate: e.target.value, dueReason: '' })}
                  />
                  {item.dueReason && (
                    <p className="flex items-start gap-1.5 text-xs text-muted-foreground" data-testid="due-reason">
                      <CalendarDays className="mt-px size-3.5 shrink-0" aria-hidden />
                      <span>{item.dueReason}</span>
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${fid}-priority`} className={fieldLabel}>
                    Prioridad
                  </Label>
                  <select
                    id={`${fid}-priority`}
                    className={selectClass}
                    value={item.priority}
                    disabled={sent}
                    onChange={(e) => update(item.key, { priority: Number(e.target.value) })}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${fid}-type`} className={fieldLabel}>
                    Tipo de trabajo
                  </Label>
                  <select
                    id={`${fid}-type`}
                    className={selectClass}
                    value={item.workTypeKey ?? ''}
                    disabled={sent}
                    onChange={(e) => update(item.key, { workTypeKey: e.target.value })}
                  >
                    <option value="">Sin tipo</option>
                    {workTypes.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex cursor-pointer items-center gap-2.5 self-end rounded-lg border bg-background px-3 py-2 text-sm shadow-xs has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-brand/25">
                  <input
                    type="checkbox"
                    className="size-4 accent-brand outline-none"
                    checked={Boolean(item.requiresReview)}
                    disabled={sent}
                    onChange={(e) => update(item.key, { requiresReview: e.target.checked })}
                  />
                  Requiere mi revisión
                </label>
              </div>
            </div>
          </article>
        );
      })}

      {proposal.notConverted.length > 0 && (
        <div className="rounded-xl border border-dashed bg-muted/30 p-4 sm:p-5">
          <p className="flex items-center gap-2 text-sm font-medium">
            <FileText className="size-4 text-muted-foreground" aria-hidden />
            No convertido en encargos
          </p>
          <p className="mt-0.5 mb-2 text-xs text-muted-foreground">
            Partes de tu nota que la IA no considera encargos. Nada se pierde: sigue en la nota.
          </p>
          <ul className="ml-5 list-disc space-y-0.5 text-sm text-foreground/85">
            {proposal.notConverted.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <Callout tone="danger" icon={AlertCircle} role="alert">
          <p>{error}</p>
        </Callout>
      )}

      {!sent ? (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card/95 px-4 py-3 shadow-md backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <span className="text-xs text-muted-foreground">
            {missingList ? (
              <span className="text-destructive">Elige una lista para cada encargo.</span>
            ) : (
              `${items.length} encargo${items.length === 1 ? '' : 's'} listo${items.length === 1 ? '' : 's'} para ClickUp`
            )}
          </span>
          <Button
            onClick={sendAll}
            disabled={sending || items.length === 0 || missingList || missingTitle}
            className={brandButton}
          >
            {sending ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Enviando a ClickUp…
              </>
            ) : (
              <>
                <Send aria-hidden />
                {`Enviar todo (${items.length})`}
              </>
            )}
          </Button>
        </div>
      ) : (
        <Callout
          tone={allOk ? 'success' : 'warning'}
          icon={allOk ? CheckCircle2 : AlertTriangle}
          role="status"
          title={
            allOk
              ? 'Todos los encargos están creados en ClickUp.'
              : 'Algunos no se pudieron crear: pulsa Reintentar en cada uno (también desde Encargos).'
          }
        >
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onSent}>
              Cerrar revisión
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/operaciones/encargos">Ver encargos</Link>
            </Button>
          </div>
        </Callout>
      )}
    </div>
  );
}

export type ClientFields = Record<string, { name: string; options: { id: string; label: string }[] }>;

// Desplegable de cliente (campo personalizado de ClickUp). Vacío + aviso si no hay uno claro.
function ClientPicker({
  id,
  field,
  hasList,
  value,
  disabled,
  onChange
}: {
  id: string;
  field: ClientFields[string] | null;
  hasList: boolean;
  value: string;
  disabled: boolean;
  onChange: (o: { id: string; label: string } | null) => void;
}) {
  if (!hasList) return null;
  if (!field) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <AlertCircle className="size-3.5 shrink-0" aria-hidden />
        Esta lista no tiene campo «Cliente»: la tarea se creará sin él.
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={fieldLabel}>
        Cliente
      </Label>
      <select
        id={id}
        className={cn(selectClass, !value && 'border-warning/70')}
        value={value}
        disabled={disabled}
        aria-describedby={!value ? `${id}-hint` : undefined}
        onChange={(e) => onChange(field.options.find((o) => o.id === e.target.value) ?? null)}
      >
        <option value="">Sin cliente</option>
        {field.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {!value && (
        <p id={`${id}-hint`} className="text-xs text-warning-strong">
          La IA no ha encontrado un cliente claro en la nota. Elígelo o déjalo vacío.
        </p>
      )}
    </div>
  );
}
