'use client';

// Plan de servicio → «El Jefe propone revisar el plan» (D6, solo administradores). Lo propone una pasada diaria sin coste
// cuando hay motivo; generar la versión nueva (Opus) solo pasa si un administrador lo pide.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { RevisionView } from '@/lib/seo/jefe/revision';
import { decideRevisionAction } from '@/lib/seo/jefe-actions';

export function RevisionProposal({ projectId, revision }: { projectId: string; revision: RevisionView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const decide = (accept: boolean) =>
    start(async () => {
      const r = await decideRevisionAction(projectId, revision.id, accept, reason);
      setMsg(r.ok ? { ok: true, text: r.message ?? 'Hecho.' } : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm">
      <p className="flex items-center gap-1.5 font-medium">
        <RefreshCcw className="size-4" aria-hidden /> El Jefe SEO propone revisar el plan (versión {revision.payload.planVersion})
      </p>
      <p>{revision.payload.reason}</p>
      <p className="text-xs text-muted-foreground">Generar la revisión lee otra vez el expediente con Opus (unos 0,6 $, dentro del tope del Jefe) y deja la versión nueva en sombra; el plan vigente no cambia hasta que la apruebes.</p>
      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} className="h-9 rounded-md border bg-background px-2 text-sm" placeholder="Comentario (obligatorio si no hace falta)" aria-label="Comentario sobre la revisión propuesta" />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => decide(true)}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />} Generar la revisión
        </Button>
        <Button size="sm" variant="outline" disabled={pending || reason.trim().length < 5} onClick={() => decide(false)}>
          <X className="size-4" /> No hace falta
        </Button>
      </div>
      {msg && <p role="status" className={msg.ok ? 'text-sm text-success' : 'text-sm text-destructive'}>{msg.text}</p>}
    </div>
  );
}
