'use client';

// Proyecto → Plan de mejora: parte interactiva (rehacer, aprobar con nota opcional, descartar con motivo, recuperar).
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, ChevronRight, ExternalLink, Loader2, RefreshCw, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState, Section } from '@/components/ui/page';
import { approvePlanItemAction, discardPlanItemAction, regeneratePlanAction, reopenPlanItemAction } from '@/lib/seo/plan-actions';

export type PlanItemView = {
  id: string;
  title: string;
  description: string;
  technique: string;
  techniqueLabel: string;
  priority: number;
  estHours: number;
  urls: number;
  overHours: boolean;
  impressions: number;
  hypothesis: { metric?: string; direction?: 'sube' | 'baja'; magnitudePct?: number; windowDays?: number };
  status: string;
  requestUrl: string | null;
  requestError: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  rejectNote: string | null;
  updatedAt: string;
};

const PRIORITY: Record<number, { label: string; tone: 'danger' | 'warning' | 'neutral' }> = { 1: { label: 'Alta', tone: 'danger' }, 2: { label: 'Media', tone: 'warning' }, 3: { label: 'Baja', tone: 'neutral' } };
const METRIC: Record<string, string> = { clics: 'los clics', impresiones: 'las impresiones', ctr: 'el porcentaje de clics (CTR)', posicion: 'la posición media' };
const fmtH = (h: number) => `${h.toLocaleString('es-ES', { maximumFractionDigits: 1 })} h`;
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-ES', { dateStyle: 'short' }) : '');

type Result = { ok: true } | { ok: false; error: string };

export function PlanPanel({ projectId, items, canEdit, monthlyHours }: { projectId: string; items: PlanItemView[]; canEdit: boolean; monthlyHours: number | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string; url?: string | null } | null>(null);
  const [showOld, setShowOld] = useState(false);

  const run = (fn: () => Promise<Result & { message?: string; url?: string | null }>, okText?: string) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (!r.ok) setMsg({ type: 'error', text: r.error });
      else setMsg({ type: 'ok', text: r.message ?? okText ?? 'Hecho.', url: r.url ?? null });
      router.refresh();
    });

  const open = items.filter((i) => i.status === 'pendiente');
  const active = items.filter((i) => i.status === 'aprobada' || i.status === 'hecha');
  const old = items.filter((i) => i.status === 'descartada' || i.status === 'caducada');
  const pendingHours = open.reduce((s, i) => s + i.estHours, 0);

  const regen = canEdit && (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(async () => {
      const r = await regeneratePlanAction(projectId);
      return r.ok ? { ok: true, message: `Plan al día: ${r.pending} propuesta(s) pendiente(s)${r.created ? `, ${r.created} nueva(s)` : ''}.` } : r;
    })}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
      Rehacer con los hallazgos de ahora
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      {msg && (
        <p className={msg.type === 'error' ? 'text-sm text-destructive' : 'text-sm text-success'}>
          {msg.text}{' '}
          {msg.url && (
            <a href={msg.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              Abrir el encargo
            </a>
          )}
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="Todavía no hay plan"
          description="El plan sale de los hallazgos de Salud técnica. Pasa la auditoría (pestaña Salud técnica) o, si ya está hecha, rehaz el plan."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild variant="outline">
                <Link href={`/dashboard/projects/${projectId}/salud`}>Ir a Salud técnica</Link>
              </Button>
              {regen}
            </div>
          }
        />
      ) : (
        <>
          <Section
            title="Por aprobar"
            description={
              monthlyHours
                ? `${open.length} propuesta(s), ${fmtH(pendingHours)} en total; el proyecto tiene ${fmtH(monthlyHours)} al mes. Las que no caben están marcadas.`
                : `${open.length} propuesta(s), ${fmtH(pendingHours)} en total. El proyecto no tiene horas al mes definidas (edítalo para que el plan las respete).`
            }
            actions={regen}
          >
            {open.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay nada pendiente. Cuando la próxima auditoría encuentre algo, aparecerá aquí.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {open.map((i) => (
                  <ItemCard key={i.id} item={i} canEdit={canEdit} pending={pending} projectId={projectId} run={run} />
                ))}
              </ul>
            )}
          </Section>

          {active.length > 0 && (
            <Section title="Aprobadas" description="Encargos creados desde el plan. Cuando el equipo los termina, pasan a «Hecha» y empieza la medición.">
              <ul className="flex flex-col gap-3">
                {active.map((i) => (
                  <ItemCard key={i.id} item={i} canEdit={canEdit} pending={pending} projectId={projectId} run={run} />
                ))}
              </ul>
            </Section>
          )}

          {old.length > 0 && (
            <Section title={`Descartadas y caducadas (${old.length})`} actions={<Button size="sm" variant="ghost" onClick={() => setShowOld((v) => !v)}>{showOld ? 'Ocultar' : 'Ver'}</Button>}>
              {showOld ? (
                <ul className="flex flex-col gap-3">
                  {old.map((i) => (
                    <ItemCard key={i.id} item={i} canEdit={canEdit} pending={pending} projectId={projectId} run={run} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Las caducadas son propuestas cuyos hallazgos ya se arreglaron. Las descartadas no se vuelven a proponer salvo que las recuperes.</p>
              )}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function ItemCard({
  item,
  canEdit,
  pending,
  projectId,
  run
}: {
  item: PlanItemView;
  canEdit: boolean;
  pending: boolean;
  projectId: string;
  run: (fn: () => Promise<Result & { message?: string; url?: string | null }>, okText?: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<'none' | 'approve' | 'discard'>('none');
  const [note, setNote] = useState('');
  const p = PRIORITY[item.priority] ?? PRIORITY[2];
  const h = item.hypothesis;
  const status =
    item.status === 'aprobada' ? <Badge tone="info">En curso</Badge> : item.status === 'hecha' ? <Badge tone="success">Hecha</Badge> : item.status === 'descartada' ? <Badge tone="neutral">Descartada</Badge> : item.status === 'caducada' ? <Badge tone="neutral">Caducada</Badge> : null;
  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button type="button" className="flex min-w-0 flex-1 items-start gap-2 text-left" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {expanded ? <ChevronDown className="mt-0.5 size-4 shrink-0" /> : <ChevronRight className="mt-0.5 size-4 shrink-0" />}
          <span className="min-w-0">
            <span className="block text-sm font-medium">{item.title}</span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge tone={p.tone}>Prioridad {p.label.toLowerCase()}</Badge>
              <Badge tone="outline">{item.techniqueLabel}</Badge>
              <Badge tone="neutral">{fmtH(item.estHours)}</Badge>
              {item.impressions > 0 && <Badge tone="brand">{item.impressions.toLocaleString('es-ES')} impresiones (90 días)</Badge>}
              {item.overHours && item.status === 'pendiente' && <Badge tone="warning">No cabe este mes</Badge>}
              {status}
            </span>
          </span>
        </button>
        {canEdit && item.status === 'pendiente' && mode === 'none' && (
          <span className="flex gap-1">
            <Button size="sm" className="bg-brand text-white hover:bg-brand/90" disabled={pending} onClick={() => setMode('approve')}>
              <Check className="size-3.5" />
              Aprobar
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setMode('discard')}>
              <X className="size-3.5" />
              Descartar
            </Button>
          </span>
        )}
        {canEdit && item.status === 'descartada' && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => reopenPlanItemAction(projectId, item.id), 'Recuperada: vuelve a entrar en el plan.')}>
            <RotateCcw className="size-3.5" />
            Recuperar
          </Button>
        )}
        {item.requestUrl && (
          <a href={item.requestUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline underline-offset-2">
            Encargo <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>

      {mode !== 'none' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input className="h-9 max-w-md flex-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === 'approve' ? 'Nota para el equipo (opcional)' : 'Por qué se descarta (opcional)'} />
          <Button
            size="sm"
            className={mode === 'approve' ? 'bg-brand text-white hover:bg-brand/90' : ''}
            variant={mode === 'approve' ? 'default' : 'outline'}
            disabled={pending}
            onClick={() => {
              const n = note;
              setMode('none');
              setNote('');
              run(() => (mode === 'approve' ? approvePlanItemAction(projectId, item.id, n) : discardPlanItemAction(projectId, item.id, n)), mode === 'approve' ? 'Encargo creado.' : 'Descartada.');
            }}
          >
            {mode === 'approve' ? 'Crear el encargo' : 'Descartar'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode('none')}>
            Cancelar
          </Button>
        </div>
      )}

      {item.requestError && <p className="mt-2 text-sm text-destructive">{item.requestError}</p>}
      {item.decidedBy && item.status !== 'pendiente' && (
        <p className="mt-2 text-xs text-muted-foreground">
          {item.status === 'descartada' ? 'Descartada' : 'Aprobada'} por {item.decidedBy} el {fmtDate(item.decidedAt)}
          {item.rejectNote ? `: «${item.rejectNote}»` : ''}
        </p>
      )}
      {expanded && (
        <div className="mt-3 border-t pt-3">
          {h.metric && (
            <p className="mb-2 text-sm">
              <span className="font-medium">Qué esperamos:</span> que {h.direction === 'baja' ? 'bajen' : 'suban'} {METRIC[h.metric] ?? h.metric} de estas páginas en unos {h.windowDays ?? 56} días. Lo mediremos cuando el encargo esté hecho.
            </p>
          )}
          <pre className="whitespace-pre-wrap break-words font-sans text-sm text-muted-foreground">{item.description}</pre>
        </div>
      )}
    </li>
  );
}
