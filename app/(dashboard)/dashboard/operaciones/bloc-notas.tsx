'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

const selectClass =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';

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
  members,
  meId,
  history,
  note
}: {
  spaces: ClickUpSpaceWithLists[];
  members: Member[];
  meId: string;
  history: HistoryRow[];
  note: NoteView | null;
}) {
  const router = useRouter();
  const readOnly = note?.status === 'convertida';

  const [content, setContent] = useState(note?.content ?? '');
  const [spaceId, setSpaceId] = useState(note?.spaceId ?? '');
  const [assigneeId, setAssigneeId] = useState(
    note ? note.assigneeId : members.some((m) => m.id === meId) ? meId : ''
  );
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

  // "Guardado" solo si la base de datos lo ha confirmado (hora de esa confirmación).
  const saveLabel = {
    saved:
      noteIdRef.current && lastSavedAt
        ? `Guardado ✓ ${timeFmt.format(new Date(lastSavedAt))}`
        : 'Sin guardar (empieza a escribir)',
    dirty: 'Cambios sin guardar…',
    saving: 'Guardando…',
    error: 'NO guardado · copia local activada'
  }[saveState];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-4 min-w-0">
        {conversion?.state === 'done' && !readOnly ? (
          <ReviewPanel
            noteId={noteIdRef.current!}
            proposal={{ items: conversion.items, notConverted: conversion.notConverted }}
            spaces={spaces}
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="space">
                  Espacio de ClickUp <span className="text-red-500">*</span>
                </Label>
                <select
                  id="space"
                  className={selectClass}
                  value={spaceId}
                  disabled={readOnly}
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
              <div className="space-y-2">
                <Label htmlFor="assignee">Persona responsable (opcional)</Label>
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

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="note">Nota</Label>
                <span
                  data-testid="save-status"
                  className={`text-xs ${
                    saveState === 'error'
                      ? 'text-red-600 font-medium'
                      : saveState === 'saved'
                        ? 'text-green-700'
                        : 'text-muted-foreground'
                  }`}
                >
                  {readOnly ? 'Nota convertida (solo lectura)' : saveLabel}
                </span>
              </div>
              {saveState === 'error' && !readOnly && (
                <div
                  role="alert"
                  className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 space-y-1"
                >
                  <p className="font-medium">No se ha podido guardar. Copia local activada.</p>
                  <p>
                    Tu texto está a salvo en este navegador. Motivo: {saveError ?? 'desconocido'}. Se reintenta
                    solo cada pocos segundos; no cierres la pestaña hasta que vuelva a poner «Guardado».
                  </p>
                  <Button size="sm" variant="outline" onClick={() => void persist(true)}>
                    Reintentar ahora
                  </Button>
                </div>
              )}
              {recover && !readOnly && (
                <div
                  role="alert"
                  className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-1"
                >
                  <p className="font-medium">Hay una copia local más reciente que la del servidor</p>
                  <p>
                    Guardada en este navegador el {dateFmt.format(new Date(recover.ts))} (
                    {recover.content.length} caracteres, frente a {content.length} en el servidor).
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
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
                </div>
              )}
              <textarea
                id="note"
                rows={16}
                className={`${selectClass} leading-relaxed`}
                placeholder="Escribe o dicta todo lo que tengas en la cabeza: uno o varios trabajos, ideas, recordatorios… La IA lo separará después."
                value={content}
                readOnly={readOnly || processing}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>

            {!readOnly && (
              <div className="flex flex-wrap items-center gap-2">
                {recState === 'recording' ? (
                  <Button variant="outline" onClick={stopRecording} className="border-red-300 text-red-700">
                    ⏹ Parar y transcribir ({mmss(seconds)})
                  </Button>
                ) : (
                  <Button variant="outline" onClick={startRecording} disabled={recState === 'uploading'}>
                    {recState === 'uploading' ? 'Transcribiendo…' : '🎙 Grabar audio'}
                  </Button>
                )}
                <Button onClick={convert} disabled={!canConvert}>
                  {starting || processing ? 'Convirtiendo…' : 'Convertir en encargos'}
                </Button>
                {noteIdRef.current && (
                  <Button variant="ghost" onClick={removeNote}>
                    Eliminar nota
                  </Button>
                )}
              </div>
            )}
            {!readOnly && !spaceId && content.trim() && (
              <p className="text-xs text-muted-foreground">Elige el espacio para poder convertir la nota.</p>
            )}
            {convertError && (
              <p className="text-sm text-red-600 rounded-md border border-red-200 bg-red-50 p-2">{convertError}</p>
            )}
            {conversion?.state === 'processing' && (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                <p className="font-medium">⏳ {conversion.step}</p>
                <p className="text-xs">
                  {elapsed} s · Puedes cambiar de pestaña o recargar: el resultado se guarda y lo verás al volver.
                </p>
              </div>
            )}
            {conversion?.state === 'error' && !readOnly && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 space-y-2">
                <p className="font-medium">La conversión ha fallado</p>
                <p>{conversion.error}</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={convert} disabled={!canConvert}>
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
              </div>
            )}
            {audioError && (
              <p className="text-sm text-amber-700 rounded-md border border-amber-300 bg-amber-50 p-2">
                {audioError}
              </p>
            )}

            {audios.length > 0 && (
              <div className="rounded-md border border-gray-200 bg-white p-3 text-sm space-y-1">
                <p className="font-medium">Audios de esta nota ({audios.length})</p>
                {audios.map((a, i) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-2 text-gray-700">
                    <span>
                      Audio {i + 1}
                      {a.sizeBytes ? ` · ${(a.sizeBytes / 1024).toFixed(0)} KB` : ''}
                    </span>
                    {a.hasTranscript ? (
                      <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">Transcrito</span>
                    ) : (
                      <>
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                          Sin transcribir
                        </span>
                        {!readOnly && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => retryTranscription(a.id)}
                            disabled={recState !== 'idle'}
                          >
                            Transcribir de nuevo
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Los audios se adjuntan a cada tarea creada desde esta nota.
                </p>
              </div>
            )}

            {readOnly && note && (
              <div className="rounded-md border border-gray-200 bg-white p-3 space-y-2">
                <p className="font-medium text-sm">Encargos creados desde esta nota</p>
                {note.requests.length === 0 && (
                  <p className="text-sm text-muted-foreground">Ninguno (se eliminaron o no se llegaron a crear).</p>
                )}
                {note.requests.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-start justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{r.title}</p>
                      <p className="text-xs text-muted-foreground">{r.listName}</p>
                      {r.error && r.status !== 'creado' && <p className="text-xs text-red-600">{r.error}</p>}
                    </div>
                    {r.url ? (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-orange-600 hover:underline whitespace-nowrap"
                      >
                        Abrir tarea
                      </a>
                    ) : (
                      <RetryButton requestId={r.id} />
                    )}
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <Link href="/dashboard/operaciones?nueva=1">
                    <Button size="sm" variant="outline">
                      Nueva nota
                    </Button>
                  </Link>
                  <Button size="sm" variant="ghost" onClick={removeNote}>
                    Eliminar nota
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <aside className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-medium text-sm">Historial</p>
          <Link href="/dashboard/operaciones?nueva=1">
            <Button size="sm" variant="outline">
              + Nueva nota
            </Button>
          </Link>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay notas. Lo que escribas se guarda solo y aparecerá aquí.
          </p>
        ) : (
          <ul className="space-y-1">
            {history.map((h) => (
              <li key={h.id} className="relative">
                {/* Navegación completa (no de cliente): abrir una nota siempre recarga su contenido. */}
                <a
                  href={`/dashboard/operaciones?nota=${h.id}`}
                  onClick={() => setOpeningId(h.id)}
                  className={`block rounded-md border p-2 pr-8 text-sm hover:bg-gray-50 ${
                    h.id === note?.id ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white'
                  } ${openingId === h.id ? 'opacity-60' : ''}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        h.status === 'convertida' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {h.status === 'convertida' ? 'Convertida' : 'Borrador'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {openingId === h.id ? 'Abriendo…' : dateFmt.format(new Date(h.updatedAt))}
                    </span>
                  </span>
                  <span className="mt-1 block truncate">{h.preview}</span>
                  {h.spaceName && <span className="block text-xs text-muted-foreground">{h.spaceName}</span>}
                </a>
                <button
                  type="button"
                  aria-label="Eliminar nota"
                  title="Eliminar nota"
                  onClick={() => void removeNoteById(h.id, h.status === 'convertida')}
                  className="absolute right-1 bottom-1 rounded px-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
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
  spaceId,
  members,
  onBack,
  onSent
}: {
  noteId: string;
  proposal: NoteProposal;
  spaces: ClickUpSpaceWithLists[];
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
          priority: i.priority
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-medium">Revisión: {items.length} encargo{items.length === 1 ? '' : 's'}</h2>
          <p className="text-sm text-muted-foreground">
            Edita lo que quieras antes de enviar. Las listas son las del espacio elegido.
          </p>
        </div>
        {!sent && (
          <Button variant="ghost" onClick={onBack} disabled={sending}>
            ← Volver a la nota
          </Button>
        )}
      </div>

      {items.length === 0 && (
        <div className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-muted-foreground">
          La IA no ha encontrado ningún encargo en la nota. Revisa «No convertido» más abajo o vuelve a la
          nota.
        </div>
      )}

      {items.map((item, idx) => {
        const result = results?.[item.key];
        return (
          <div key={item.key} className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium uppercase text-gray-500">Encargo {idx + 1}</p>
              {!sent && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setItems((prev) => prev.filter((i) => i.key !== item.key))}
                  disabled={sending}
                >
                  Quitar
                </Button>
              )}
              {result?.ok && (
                <a
                  href={result.taskUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700 hover:underline"
                >
                  ✅ Creado — abrir tarea
                </a>
              )}
            </div>

            {result && !result.ok && (
              <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700 space-y-1">
                <p>No se pudo crear en ClickUp: {result.error}</p>
                <RetryButton requestId={result.requestId} />
              </div>
            )}

            <div className="space-y-1">
              <Label>Título</Label>
              <Input
                value={item.title}
                disabled={sent}
                onChange={(e) => update(item.key, { title: e.target.value })}
              />
            </div>

            {item.missingData.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
                <p className="font-medium">Faltan datos:</p>
                <ul className="list-disc ml-5">
                  {item.missingData.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-1">
              <Label>Descripción</Label>
              <textarea
                rows={10}
                className={`${selectClass} font-mono`}
                value={item.description}
                disabled={sent}
                onChange={(e) => update(item.key, { description: e.target.value })}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label>
                  Lista <span className="text-red-500">*</span>
                </Label>
                <select
                  className={`${selectClass} ${!item.listId ? 'border-red-400' : ''}`}
                  value={item.listId}
                  disabled={sent}
                  onChange={(e) => update(item.key, { listId: e.target.value })}
                >
                  <option value="">Elige una lista…</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.folder ? `${l.folder} / ${l.name}` : l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Responsable</Label>
                <select
                  className={selectClass}
                  value={item.assigneeId}
                  disabled={sent}
                  onChange={(e) =>
                    update(item.key, {
                      assigneeId: e.target.value,
                      assigneeName: members.find((m) => m.id === e.target.value)?.username ?? ''
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
              </div>
              <div className="space-y-1">
                <Label>Entrega</Label>
                <Input
                  type="date"
                  value={item.dueDate}
                  disabled={sent}
                  onChange={(e) => update(item.key, { dueDate: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Prioridad</Label>
                <select
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
            </div>
          </div>
        );
      })}

      {proposal.notConverted.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="font-medium text-sm">No convertido en encargos</p>
          <p className="text-xs text-muted-foreground mb-2">
            Partes de tu nota que la IA no considera encargos. Nada se pierde: sigue en la nota.
          </p>
          <ul className="list-disc ml-5 text-sm space-y-0.5">
            {proposal.notConverted.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!sent ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={sendAll} disabled={sending || items.length === 0 || missingList || missingTitle}>
            {sending ? 'Enviando a ClickUp…' : `Enviar todo (${items.length})`}
          </Button>
          {missingList && <span className="text-xs text-red-600">Elige una lista para cada encargo.</span>}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <p className={`text-sm ${allOk ? 'text-green-700' : 'text-amber-700'}`}>
            {allOk
              ? 'Todos los encargos están creados en ClickUp.'
              : 'Algunos no se pudieron crear: pulsa Reintentar en cada uno (también desde Encargos).'}
          </p>
          <Button variant="outline" onClick={onSent}>
            Cerrar revisión
          </Button>
          <Link href="/dashboard/operaciones/encargos">
            <Button variant="ghost">Ver encargos</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
