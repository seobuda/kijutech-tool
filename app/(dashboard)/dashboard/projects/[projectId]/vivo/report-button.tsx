'use client';

// Botón «Preparar el informe del mes»: deja el borrador en la bandeja de mensajes al cliente, siempre con aprobación.
import { useState, useTransition } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { draftMonthlyReportAction } from '@/lib/seo/cierre-actions';

export function ReportButton({ projectId }: { projectId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await draftMonthlyReportAction(projectId);
            setMsg(r.ok ? { ok: true, text: r.message ?? 'Hecho.' } : { ok: false, text: r.error });
          })
        }
        title="Prepara el informe del mes pasado como borrador. Se revisa y aprueba en Para ti antes de enviarlo."
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
        Preparar el informe del mes
      </Button>
      {msg && (
        <p role="status" className={msg.ok ? 'max-w-xs text-right text-xs text-success' : 'max-w-xs text-right text-xs text-destructive'}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
