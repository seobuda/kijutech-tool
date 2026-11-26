'use client';

// Proyecto → Expediente → Puesta en marcha (alta de la cartera, 26 nov 2026): lo que le falta al proyecto para que
// funcionen el informe, las posiciones, el local y la medición, con lo que hace el sistema solo y lo que confirma una
// persona. «Ponerlo en marcha» lanza el rastreo; la auditoría, el expediente, el mapa y la propuesta de la IA van solos.
import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle, Loader2, Rocket, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Section } from '@/components/ui/page';
import type { ReadyItem } from '@/lib/seo/alta/rules';
import { proposeFichaAction, startProjectSetupAction } from '@/lib/seo/expediente-actions';

export function PuestaEnMarcha({ projectId, items, done, total, canEdit, audited, proposing }: { projectId: string; items: ReadyItem[]; done: number; total: number; canEdit: boolean; audited: boolean; proposing: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const act = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { type: 'ok', text: ok } : { type: 'error', text: r.error });
      router.refresh();
    });
  const complete = done === total;
  return (
    <Section
      title={
        <span className="inline-flex items-center gap-2">
          <Rocket className="size-4" />
          Puesta en marcha {complete ? <Badge tone="success">Lista</Badge> : <Badge tone="warning">{`${done} de ${total}`}</Badge>}
        </span>
      }
      description="Lo que necesita el proyecto para el informe mensual, las posiciones (servicio × zona), el local y medir resultados. Lo marcado «automático» lo hace el sistema; lo demás lo propone la IA y tú lo confirmas abajo."
      actions={
        canEdit ? (
          <span className="flex flex-wrap gap-2">
            {!audited && (
              <Button size="sm" className="bg-brand text-white hover:bg-brand/90" disabled={pending} onClick={() => act(() => startProjectSetupAction(projectId), 'En marcha: rastreo, auditoría, expediente, mapa y propuesta de la IA, en ese orden (de 10 a 40 minutos según la web).')}>
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Rocket className="size-3.5" />}
                Ponerlo en marcha
              </Button>
            )}
            {audited && (
              <Button size="sm" variant="outline" disabled={pending || proposing} onClick={() => act(() => proposeFichaAction(projectId), 'Pedida: la propuesta de la IA aparece abajo en un minuto.')}>
                {proposing ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                {proposing ? 'La IA está proponiendo…' : 'Volver a proponer con IA'}
              </Button>
            )}
          </span>
        ) : undefined
      }
    >
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((i) => (
          <li key={i.key} className="flex items-start gap-2 text-sm">
            {i.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Hecho" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Pendiente" />}
            <span>
              <span className={i.ok ? '' : 'font-medium'}>{i.label}</span>
              {i.auto && !i.ok && <span className="ml-1 text-xs text-muted-foreground">(automático)</span>}
              {!i.ok && <span className="block text-xs text-muted-foreground">{i.hint}</span>}
            </span>
          </li>
        ))}
      </ul>
      {msg && (
        <p role="status" className={msg.type === 'ok' ? 'mt-3 text-sm text-success' : 'mt-3 text-sm text-destructive'}>
          {msg.text}
        </p>
      )}
    </Section>
  );
}
