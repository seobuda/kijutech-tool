'use client';

// Plan de servicio → «Estrategia del trimestre» (Jefe SEO D4, solo administradores): la estrategia trimestral que sale del
// plan aprobado, calculada por código. Aprobar crea la estrategia de siempre (Trabajo → Estrategia), enlazada al plan.
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarRange, Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Section } from '@/components/ui/page';
import { PLAYBOOKS, type PlaybookKey } from '@/lib/seo/estrategia/playbooks';
import type { CycleProposalView } from '@/lib/seo/jefe/ciclos';
import { decideCycleAction, proposeCycleAction } from '@/lib/seo/jefe-actions';

const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const paramText = (p: Record<string, unknown>) =>
  Object.entries(p)
    .filter(([, v]) => v != null && v !== '' && typeof v !== 'object')
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(' · ');

export function CycleProposal({ projectId, proposals, hasApprovedPlan }: { projectId: string; proposals: CycleProposalView[]; hasApprovedPlan: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.message ?? 'Hecho.' } : { ok: false, text: r.error });
      if (r.ok) {
        setReason('');
        router.refresh();
      }
    });
  if (!hasApprovedPlan && !proposals.length) return null;
  const open = proposals.find((p) => p.status === 'pendiente' || (p.status === 'aprobada' && p.payload.pendingCreate));
  const last = proposals.find((p) => p !== open);
  return (
    <Section
      title={
        <span className="flex items-center gap-1.5">
          <CalendarRange className="size-4" aria-hidden /> Estrategia del trimestre (desde el plan)
        </span>
      }
      description="Las líneas del trimestre que toca, sacadas del plan aprobado por código (sin coste de IA): por prioridad, como mucho 3 y solo si caben en las horas. Al aprobarla se crea la estrategia en Trabajo → Estrategia, como si la hicieras a mano. El siguiente trimestre se propone solo 21 días antes de que acabe el actual."
    >
      <div className="flex flex-col gap-3 p-5">
        {!open && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={pending || !hasApprovedPlan} onClick={() => run(() => proposeCycleAction(projectId))}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <CalendarRange className="size-4" />} Proponer la estrategia del trimestre
            </Button>
            {!hasApprovedPlan && <span className="text-xs text-muted-foreground">Hace falta un plan aprobado.</span>}
          </div>
        )}
        {open && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{open.payload.name}</span>
              <Badge tone={open.status === 'pendiente' ? 'warning' : 'info'}>{open.status === 'pendiente' ? 'Por aprobar' : 'Aprobada: se crea al cerrar la estrategia activa'}</Badge>
              <span className="text-xs text-muted-foreground">
                {open.payload.months} meses desde el {fmt(open.payload.startsOn)} · {open.payload.hours} h{open.payload.available != null ? ` de ${open.payload.available} h para estrategia` : ''}
                {open.payload.auto ? ' · propuesta automática' : ''}
              </span>
            </div>
            <ul className="flex flex-col gap-1 text-sm">
              {open.payload.lines.map((l) => (
                <li key={l.masterItemId}>
                  <span className="font-medium">{PLAYBOOKS[l.playbook as PlaybookKey]?.label ?? l.playbook}</span> — {l.title}
                  {paramText(l.params) && <span className="text-xs text-muted-foreground"> ({paramText(l.params)})</span>}
                </li>
              ))}
            </ul>
            {open.payload.skipped.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">Frentes del trimestre que no entran ({open.payload.skipped.length})</summary>
                <ul className="mt-1 flex flex-col gap-0.5 pl-3">
                  {open.payload.skipped.map((s, i) => (
                    <li key={`${s.frente}-${i}`}>
                      {s.title}: <span className="text-muted-foreground">{s.reason}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {open.payload.createError && <p className="text-sm text-destructive">No se ha podido crear: {open.payload.createError}. Arréglalo (p. ej. las horas del proyecto) o cancélala.</p>}
            {open.status === 'aprobada' && (
              <div className="flex flex-wrap items-center gap-2">
                <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} className="h-9 rounded-md border bg-background px-2 text-sm" placeholder="Motivo para cancelarla" aria-label="Motivo para cancelar la estrategia aprobada" />
                <Button size="sm" variant="outline" disabled={pending || reason.trim().length < 5} onClick={() => run(() => decideCycleAction(projectId, open.id, false, reason))}>
                  <X className="size-4" /> Cancelar
                </Button>
              </div>
            )}
            {open.status === 'pendiente' && (
              <>
                <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} className="h-9 rounded-md border bg-background px-2 text-sm" placeholder="Comentario (obligatorio para descartar)" aria-label="Comentario sobre la estrategia propuesta" />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={pending} onClick={() => run(() => decideCycleAction(projectId, open.id, true, reason))}>
                    <Check className="size-4" /> Aprobar y crear la estrategia
                  </Button>
                  <Button size="sm" variant="outline" disabled={pending || reason.trim().length < 5} onClick={() => run(() => decideCycleAction(projectId, open.id, false, reason))}>
                    <X className="size-4" /> Descartar
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
        {last && (
          <p className="text-xs text-muted-foreground">
            Anterior: {last.payload.name} — {last.status === 'aprobada' ? 'aprobada' : last.status === 'rechazada' ? `descartada${last.decisionReason ? ` (${last.decisionReason})` : ''}` : last.status}
            {last.payload.cycleId && (
              <>
                {' · '}
                <Link href={`/dashboard/projects/${projectId}/estrategia`} className="underline-offset-4 hover:underline">
                  ver en Estrategia
                </Link>
              </>
            )}
          </p>
        )}
        {msg && <p role="status" className={msg.ok ? 'text-sm text-success' : 'text-sm text-destructive'}>{msg.text}</p>}
      </div>
    </Section>
  );
}
