'use client';

// Botones del expediente de una cuenta: «Marcar revisada» (nota de una línea; la próxima revisión sale del nivel del
// cliente) y «Fijar objetivo provisional» (congelado; se explica por qué no se puede cuando no se puede). Después de
// guardar se dice qué ha pasado y la página se recarga.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CircleCheck, Target, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { reviewAdsAccountAction, setAdsProvisionalGoalAction } from '@/lib/ads/actions';

type Msg = { ok: boolean; text: string } | null;
function Flash({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p role="status" className={msg.ok ? 'flex items-start gap-1.5 text-sm text-success' : 'flex items-start gap-1.5 text-sm text-destructive'}>
      {msg.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <span>{msg.text}</span>
    </p>
  );
}

export function ReviewForm({ accountId, suggestedNext, levelLabel }: { accountId: string; suggestedNext: string; levelLabel: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await reviewAdsAccountAction(accountId, note);
          if (r.ok) {
            setMsg({ ok: true, text: `Revisión guardada. La próxima toca el ${r.next}.` });
            setNote('');
            router.refresh();
          } else setMsg({ ok: false, text: r.error });
        });
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        Nota de la revisión *
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} required placeholder="Qué viste o qué decidiste, en una línea" />
      </label>
      <p className="text-xs text-muted-foreground">
        La próxima revisión quedará para el {suggestedNext} ({levelLabel}).
      </p>
      <Button type="submit" size="sm" disabled={pending || note.trim().length < 3}>
        Marcar revisada
      </Button>
      <Flash msg={msg} />
    </form>
  );
}

export function ProvisionalGoalButton({ accountId, allowed, reason }: { accountId: string; allowed: boolean; reason: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <div className="space-y-2">
      <Button
        size="sm"
        variant="outline"
        disabled={!allowed || pending}
        title={reason ?? undefined}
        onClick={() =>
          start(async () => {
            if (!confirm('Se fijará como objetivo provisional el CPL de los 90 días previos (sin los 7 últimos) y quedará congelado. ¿Seguir?')) return;
            const r = await setAdsProvisionalGoalAction(accountId);
            if (r.ok) {
              setMsg({ ok: true, text: `Objetivo provisional fijado: CPL ${r.cpl.toFixed(2)} ${r.currency ?? ''} y ${r.monthly.toFixed(0)} ${r.currency ?? ''}/mes, con ${r.conversions} conversiones de base. Es un supuesto, no un objetivo de negocio.` });
              router.refresh();
            } else setMsg({ ok: false, text: r.error });
          })
        }
      >
        <Target aria-hidden /> Fijar objetivo provisional
      </Button>
      {!allowed && reason && <p className="text-xs text-muted-foreground">{reason}</p>}
      <Flash msg={msg} />
    </div>
  );
}
