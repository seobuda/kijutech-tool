'use client';

// «Rellenar con IA»: texto pegado o audio grabado → la IA propone la ficha completa (empresa, contactos, locales, webs y
// cuentas, competencia, memoria) → vista previa de lo que va a cambiar → «Aplicar». Nada se guarda sin pulsar «Aplicar»,
// y al aplicar el servidor vuelve a validarlo todo. Es lo mismo que hace el agente por Telegram.
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Mic, Minus, Plus, Sparkles, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { aiProposeClient, applyClientProposal, type ClientProposal } from '@/lib/operaciones/client-actions';
import { areaClass, brandBtn, MsgLine, type Msg } from './ui';

const MAX_RECORDING_SECONDS = 300;

export function AiFill({ clientId, onClose }: { clientId: string | null; onClose?: () => void }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  const [proposal, setProposal] = useState<ClientProposal | null>(null);
  const [pending, startTransition] = useTransition();
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
    if (timer.current) clearInterval(timer.current);
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

  const start = async () => {
    setMsg(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMsg({ type: 'error', text: 'Este navegador no permite grabar audio.' });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMsg({ type: 'error', text: 'No se pudo acceder al micrófono (permiso denegado).' });
      return;
    }
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks.current = [];
    mr.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      setTranscribing(true);
      try {
        const form = new FormData();
        form.append('audio', new Blob(chunks.current, { type: mr.mimeType || 'audio/webm' }), 'cliente.webm');
        // Misma ruta que la ficha del Equipo: solo transcribe, no guarda el audio.
        const res = await fetch('/api/operaciones/equipo-audio', { method: 'POST', body: form });
        const json = (await res.json()) as { transcript?: string; error?: string };
        if (json.error) setMsg({ type: 'error', text: json.error });
        else if (json.transcript) {
          setText((cur) => (cur ? `${cur}\n${json.transcript}` : json.transcript!));
          setMsg({ type: 'ok', text: 'Audio transcrito: revisa el texto y pulsa «Proponer».' });
        } else setMsg({ type: 'error', text: 'No se oyó ninguna voz en el audio.' });
      } catch {
        setMsg({ type: 'error', text: 'No se pudo enviar el audio.' });
      } finally {
        setTranscribing(false);
      }
    };
    recorder.current = mr;
    mr.start();
    setSeconds(0);
    setRecording(true);
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_RECORDING_SECONDS) stop();
        return s + 1;
      });
    }, 1000);
  };

  const propose = () =>
    startTransition(async () => {
      setMsg(null);
      setProposal(null);
      const res = await aiProposeClient(text, clientId);
      if (!res.ok) return setMsg({ type: 'error', text: res.error });
      setProposal(res.proposal);
    });

  const apply = () =>
    startTransition(async () => {
      if (!proposal) return;
      const res = await applyClientProposal(proposal.input, clientId);
      if (!res.ok) return setMsg({ type: 'error', text: res.error });
      setProposal(null);
      setText('');
      setMsg({ type: res.problems.length ? 'error' : 'ok', text: res.problems.length ? `Guardado, salvo: ${res.problems.join('; ')}` : 'Guardado en la ficha.' });
      if (!clientId) router.push(`/dashboard/clientes/${res.id}`);
      else router.refresh();
    });

  const sections = proposal ? [...new Set(proposal.lines.map((l) => l.section))] : [];

  return (
    <div className="w-full space-y-3 rounded-xl border border-brand/30 bg-brand-soft p-4" data-testid="ai-fill">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-brand" aria-hidden />
          Rellenar con IA
        </p>
        {onClose && (
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X aria-hidden />
            Cerrar
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground text-pretty">
        Cuenta lo que sepas del cliente (o graba un audio): a qué se dedica, su web, quién es el contacto, teléfono, dirección, qué quiere conseguir, sus competidores… La IA lo redacta y te enseña lo que va a cambiar antes de guardar. No dictes contraseñas.
      </p>
      <textarea
        rows={5}
        aria-label="Descripción del cliente para la IA"
        className={areaClass}
        placeholder="Ej.: Nos ha entrado José Pérez, tienda de deportes en Valencia, web joseperez.com. El contacto es José, el dueño, 600 000 000, prefiere WhatsApp. Quiere conseguir más clientes con leads. Su competencia es deportesgarcia.es…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className={brandBtn} disabled={pending || recording || transcribing || text.trim().length < 10} onClick={propose}>
          {pending && !proposal ? 'Pensando…' : 'Proponer'}
        </Button>
        {recording ? (
          <Button size="sm" variant="destructive" onClick={stop}>
            <Square className="fill-current" aria-hidden />
            Parar ({seconds}s)
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={pending || transcribing} onClick={start}>
            <Mic aria-hidden />
            {transcribing ? 'Transcribiendo…' : 'Grabar audio'}
          </Button>
        )}
        <MsgLine msg={msg} />
      </div>

      {proposal && (
        <div className="space-y-3 rounded-lg border bg-card p-3 shadow-xs" aria-live="polite" data-testid="ai-propuesta">
          <p className="text-sm font-semibold">{proposal.mode === 'crear' ? `Nueva ficha: ${proposal.name}` : `Cambios en la ficha de ${proposal.name}`}</p>
          {proposal.lines.length === 0 && <p className="text-sm text-muted-foreground">No hay nada que cambiar.</p>}
          {sections.map((sec) => (
            <div key={sec} className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{sec}</p>
              <ul className="space-y-1 text-sm">
                {proposal.lines
                  .filter((l) => l.section === sec)
                  .map((l, i) => (
                    <li key={i} className="flex gap-2">
                      {l.kind === 'remove' ? <Minus className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-label="Quitar" /> : <Plus className="mt-0.5 size-3.5 shrink-0 text-success" aria-label={l.kind === 'change' ? 'Cambiar' : 'Añadir'} />}
                      <span className="min-w-0">
                        <span className="font-medium">{l.label}</span>
                        {l.value ? <span className="whitespace-pre-line text-foreground/80">: {l.value}</span> : null}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          {proposal.warnings.length > 0 && (
            <ul className="space-y-0.5 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning-strong">
              {proposal.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className={brandBtn} disabled={pending || proposal.lines.length === 0} onClick={apply}>
              <Check aria-hidden />
              {pending ? 'Guardando…' : proposal.mode === 'crear' ? 'Crear la ficha' : 'Aplicar cambios'}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setProposal(null)}>
              Descartar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
