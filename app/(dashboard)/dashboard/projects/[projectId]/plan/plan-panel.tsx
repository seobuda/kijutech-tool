'use client';

// Proyecto → Plan de mejora (26 nov 2026, Plan A+B). De arriba abajo:
//   1. Resumen de horas del mes y «Aprobar lo de este mes» (con lo que se pondrá por defecto, a la vista).
//   2. Las propuestas pendientes repartidas por meses según las horas del proyecto (lo crítico, siempre este mes).
//      Cada una dice por qué está ahí y lo que puede traer. «Aprobar» abre una vista previa editable (título, horas,
//      lista, responsable, fecha, páginas y nota) antes de crear el encargo; «Descartar» pide el motivo, que actúa.
//   3. Lo aprobado, con el estado real del encargo (responsable, fecha, en curso o hecho, y hasta cuándo se mide).
//   4. Descartadas y caducadas, plegadas.
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, Check, ChevronDown, ChevronRight, ExternalLink, Loader2, RefreshCw, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState, Section } from '@/components/ui/page';
import { MarkdownLite } from '@/components/ui/markdown-lite';
import { cn } from '@/lib/utils';
import { approvePlanItemAction, approveThisMonthAction, discardPlanItemAction, regeneratePlanAction, reopenPlanItemAction } from '@/lib/seo/plan-actions';

export type PlanItemView = {
  id: string;
  title: string;
  description: string;
  technique: string;
  techniqueLabel: string;
  priority: number;
  estHours: number;
  urls: string[];
  overHours: boolean;
  impressions: number;
  gainPerMonth: number;
  why: string;
  hypothesis: { metric?: string; direction?: 'sube' | 'baja'; magnitudePct?: number; windowDays?: number };
  status: string;
  requestUrl: string | null;
  requestError: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  rejectNote: string | null;
  updatedAt: string;
  /** Mes en el que cabe (0 = este), solo las pendientes. */
  month: number | null;
  /** Estado real del encargo (lo aprobado). */
  task: { status: string | null; assigneeName: string | null; dueDate: string | null; doneAt: string | null } | null;
};
export type PlanContext = {
  monthlyHours: number | null;
  usedThisMonth: number;
  monthNames: string[];
  lists: { id: string; name: string }[];
  members: { id: string; name: string }[];
  defaults: { listId: string | null; assigneeId: string | null; dueDate: string };
  discardReasons: Record<string, string>;
};

const PRIORITY: Record<number, { label: string; tone: 'danger' | 'warning' | 'neutral' }> = { 1: { label: 'Alta', tone: 'danger' }, 2: { label: 'Media', tone: 'warning' }, 3: { label: 'Baja', tone: 'neutral' } };
const METRIC: Record<string, string> = { clics: 'los clics', impresiones: 'las impresiones', ctr: 'el porcentaje de clics (CTR)', posicion: 'la posición media' };
const TASK_STATUS: Record<string, { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }> = {
  asignado: { label: 'Pendiente de empezar', tone: 'neutral' },
  en_curso: { label: 'En curso', tone: 'info' },
  en_revision: { label: 'En revisión', tone: 'info' },
  devuelto: { label: 'Devuelto', tone: 'warning' },
  bloqueado: { label: 'Bloqueado', tone: 'danger' },
  completado: { label: 'Hecho', tone: 'success' }
};
const fmtH = (h: number) => `${h.toLocaleString('es-ES', { maximumFractionDigits: 1 })} h`;
const fmtDate = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const selectClass = 'h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm shadow-xs';

type Result = { ok: true; message?: string; url?: string | null } | { ok: false; error: string };

export function PlanPanel({ projectId, items, canEdit, ctx }: { projectId: string; items: PlanItemView[]; canEdit: boolean; ctx: PlanContext }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string; url?: string | null } | null>(null);
  const [showOld, setShowOld] = useState(false);
  const [confirmMonth, setConfirmMonth] = useState(false);

  const run = (fn: () => Promise<Result>, okText?: string, after?: () => void) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (!r.ok) setMsg({ type: 'error', text: r.error });
      else {
        setMsg({ type: 'ok', text: r.message ?? okText ?? 'Hecho.', url: r.url ?? null });
        after?.();
      }
      router.refresh();
    });

  const open = items.filter((i) => i.status === 'pendiente');
  const active = items.filter((i) => i.status === 'aprobada' || i.status === 'hecha');
  const old = items.filter((i) => i.status === 'descartada' || i.status === 'caducada');
  const byMonth = useMemo(() => {
    const m = new Map<number, PlanItemView[]>();
    for (const i of open) m.set(i.month ?? 0, [...(m.get(i.month ?? 0) ?? []), i]);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [open]);
  const thisMonth = open.filter((i) => (i.month ?? 0) === 0);
  const thisMonthHours = thisMonth.reduce((s, i) => s + i.estHours, 0);
  const defList = ctx.lists.find((l) => l.id === ctx.defaults.listId)?.name ?? null;
  const defPerson = ctx.members.find((m) => m.id === ctx.defaults.assigneeId)?.name ?? null;

  const regen = canEdit && (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        run(async () => {
          const r = await regeneratePlanAction(projectId);
          return r.ok ? { ok: true, message: `Plan al día: ${r.pending} propuesta(s) pendiente(s)${r.created ? `, ${r.created} nueva(s)` : ''}.` } : r;
        })
      }
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
      Rehacer con los hallazgos de ahora
    </Button>
  );

  if (items.length === 0) {
    return (
      <EmptyState
        title="Todavía no hay plan"
        description="El plan sale de los hallazgos de Salud técnica y de las oportunidades del mapa de palabras. Pasa la auditoría (pestaña Salud técnica) o, si ya está hecha, rehaz el plan."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild variant="outline">
              <Link href={`/dashboard/projects/${projectId}/salud`}>Ir a Salud técnica</Link>
            </Button>
            {regen}
          </div>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {msg && (
        <p className={msg.type === 'error' ? 'text-sm text-destructive' : 'text-sm text-success'} role={msg.type === 'error' ? 'alert' : 'status'}>
          {msg.text}{' '}
          {msg.url && (
            <a href={msg.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              Abrir el encargo
            </a>
          )}
        </p>
      )}

      {/* Resumen del mes */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border text-brand">
            <CalendarDays className="size-4" aria-hidden />
          </span>
          <div className="text-sm">
            <p className="font-medium">
              {cap(ctx.monthNames[0])}:{' '}
              {ctx.monthlyHours ? (
                <>
                  {fmtH(ctx.usedThisMonth)} ya aprobadas y {fmtH(thisMonthHours)} por aprobar que caben, de {fmtH(ctx.monthlyHours)} al mes
                </>
              ) : (
                <>{fmtH(thisMonthHours)} por aprobar</>
              )}
            </p>
            {ctx.monthlyHours ? (
              <p className="text-muted-foreground">Lo que no cabe pasa a los meses siguientes, en orden de prioridad. Lo grave va siempre este mes.</p>
            ) : (
              <p className="text-muted-foreground">
                El proyecto no tiene horas al mes: todo sale como «este mes».{' '}
                <Link href={`/dashboard/projects/${projectId}/edit`} className="text-brand underline-offset-2 hover:underline">
                  Ponle las horas
                </Link>{' '}
                para repartirlo.
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {canEdit && thisMonth.length > 0 && !confirmMonth && (
            <Button size="sm" className="bg-brand text-white hover:bg-brand/90" disabled={pending} onClick={() => setConfirmMonth(true)}>
              <Check className="size-3.5" />
              Aprobar lo de este mes ({thisMonth.length})
            </Button>
          )}
          {regen}
        </div>
      </div>
      {confirmMonth && (
        <div className="space-y-2 rounded-xl border border-brand/30 bg-brand-soft/40 p-4 text-sm">
          <p>
            Se crearán <strong>{thisMonth.length} encargos</strong> ({fmtH(thisMonthHours)})
            {defPerson ? <> para <strong>{defPerson}</strong></> : ' (el responsable lo elegirá Operaciones)'}
            {defList ? <> en la lista <strong>{defList}</strong></> : ''}, con fecha <strong>{fmtDate(ctx.defaults.dueDate)}</strong>. Si quieres cambiar algo de uno, apruébalo uno a uno.
          </p>
          <div className="flex gap-2">
            <Button size="sm" className="bg-brand text-white hover:bg-brand/90" disabled={pending} onClick={() => run(() => approveThisMonthAction(projectId), undefined, () => setConfirmMonth(false))}>
              Crear los {thisMonth.length} encargos
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmMonth(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {open.length === 0 ? (
        <Section title="Por aprobar">
          <p className="text-sm text-muted-foreground">No hay nada pendiente. Cuando la próxima auditoría o el mapa de palabras encuentren algo, aparecerá aquí.</p>
        </Section>
      ) : (
        byMonth.map(([m, list]) => (
          <Section
            key={m}
            title={`${cap(ctx.monthNames[m] ?? `dentro de ${m} meses`)}${m === 0 ? ' · este mes' : ''}`}
            description={`${list.length} propuesta(s), ${fmtH(list.reduce((s, i) => s + i.estHours, 0))}${list.some((i) => i.gainPerMonth) ? ` · ≈ +${list.reduce((s, i) => s + i.gainPerMonth, 0).toLocaleString('es-ES')} clics/mes posibles` : ''}.`}
          >
            <ul className="flex flex-col gap-3">
              {list.map((i) => (
                <ItemCard key={i.id} item={i} canEdit={canEdit} pending={pending} projectId={projectId} run={run} ctx={ctx} />
              ))}
            </ul>
          </Section>
        ))
      )}

      {active.length > 0 && (
        <Section title="Aprobadas" description="Encargos creados desde el plan, con su estado real. Cuando el equipo los termina, empieza la medición: se compara lo esperado con lo que pasa en Google.">
          <ul className="flex flex-col gap-3">
            {active.map((i) => (
              <ItemCard key={i.id} item={i} canEdit={canEdit} pending={pending} projectId={projectId} run={run} ctx={ctx} />
            ))}
          </ul>
        </Section>
      )}

      {old.length > 0 && (
        <Section title={`Descartadas y caducadas (${old.length})`} actions={<Button size="sm" variant="ghost" onClick={() => setShowOld((v) => !v)}>{showOld ? 'Ocultar' : 'Ver'}</Button>}>
          {showOld ? (
            <ul className="flex flex-col gap-3">
              {old.map((i) => (
                <ItemCard key={i.id} item={i} canEdit={canEdit} pending={pending} projectId={projectId} run={run} ctx={ctx} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Las caducadas son propuestas cuyos hallazgos ya se arreglaron. Las descartadas no se vuelven a proponer salvo que las recuperes.</p>
          )}
        </Section>
      )}
    </div>
  );
}

function ItemCard({
  item,
  canEdit,
  pending,
  projectId,
  run,
  ctx
}: {
  item: PlanItemView;
  canEdit: boolean;
  pending: boolean;
  projectId: string;
  run: (fn: () => Promise<Result>, okText?: string, after?: () => void) => void;
  ctx: PlanContext;
}) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<'none' | 'approve' | 'discard'>('none');
  const p = PRIORITY[item.priority] ?? PRIORITY[2];
  const h = item.hypothesis;
  const t = item.task;
  const measureUntil = t?.doneAt && h.windowDays ? new Date(new Date(t.doneAt).getTime() + h.windowDays * 86_400_000).toISOString() : null;
  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button type="button" className="flex min-w-0 flex-1 items-start gap-2 text-left" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {expanded ? <ChevronDown className="mt-0.5 size-4 shrink-0" /> : <ChevronRight className="mt-0.5 size-4 shrink-0" />}
          <span className="min-w-0">
            <span className="block text-sm font-medium">{item.title}</span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge tone={p.tone}>Prioridad {p.label.toLowerCase()}</Badge>
              <Badge tone="neutral">{fmtH(item.estHours)}</Badge>
              {item.gainPerMonth > 0 && <Badge tone="brand">≈ +{item.gainPerMonth.toLocaleString('es-ES')} clics/mes</Badge>}
              {item.status === 'descartada' && <Badge tone="neutral">Descartada</Badge>}
              {item.status === 'caducada' && <Badge tone="neutral">Caducada</Badge>}
              {t && (item.status === 'aprobada' || item.status === 'hecha') && (
                <Badge tone={TASK_STATUS[t.status ?? '']?.tone ?? (item.status === 'hecha' ? 'success' : 'info')}>{TASK_STATUS[t.status ?? '']?.label ?? (item.status === 'hecha' ? 'Hecho' : 'En curso')}</Badge>
              )}
            </span>
            {item.status === 'pendiente' && <span className="mt-1 block text-xs text-muted-foreground">Por qué aquí: {item.why}</span>}
            {t && (item.status === 'aprobada' || item.status === 'hecha') && (
              <span className="mt-1 block text-xs text-muted-foreground">
                {t.assigneeName ? `Para ${t.assigneeName}` : 'Sin responsable'}
                {t.dueDate ? ` · fecha ${fmtDate(t.dueDate)}` : ''}
                {measureUntil ? ` · hecho el ${fmtDate(t.doneAt)}; se mide hasta el ${fmtDate(measureUntil)}` : ''}
              </span>
            )}
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

      {mode === 'approve' && <ApprovePreview item={item} ctx={ctx} pending={pending} onCancel={() => setMode('none')} onSubmit={(o) => run(() => approvePlanItemAction(projectId, item.id, o), 'Encargo creado.', () => setMode('none'))} />}
      {mode === 'discard' && <DiscardBox ctx={ctx} pending={pending} onCancel={() => setMode('none')} onSubmit={(reason, note) => run(() => discardPlanItemAction(projectId, item.id, note, reason), reason === 'ya_hecho' ? 'Descartada: se vuelve a pasar la auditoría para cerrar lo arreglado.' : reason === 'cliente_no' ? 'Descartada y guardado en la memoria del cliente: no se volverá a proponer.' : 'Descartada.', () => setMode('none'))} />}

      {item.requestError && <p className="mt-2 text-sm text-destructive">{item.requestError}</p>}
      {item.decidedBy && item.status !== 'pendiente' && (
        <p className="mt-2 text-xs text-muted-foreground">
          {item.status === 'descartada' ? 'Descartada' : 'Aprobada'} por {item.decidedBy} el {fmtDate(item.decidedAt)}
          {item.rejectNote ? `: «${item.rejectNote}»` : ''}
        </p>
      )}
      {expanded && (
        <div className="mt-3 space-y-3 border-t pt-3">
          {h.metric && (
            <p className="text-sm">
              <span className="font-medium">Qué esperamos:</span>{' '}
              {item.gainPerMonth > 0
                ? `unos ${item.gainPerMonth.toLocaleString('es-ES')} clics más al mes en estas búsquedas, en unos ${h.windowDays ?? 56} días.`
                : `que ${h.direction === 'baja' ? 'bajen' : 'suban'} ${METRIC[h.metric] ?? h.metric} de estas páginas en unos ${h.windowDays ?? 56} días.`}{' '}
              Lo mediremos cuando el encargo esté hecho.
            </p>
          )}
          <p className="text-xs text-muted-foreground">Técnica: {item.techniqueLabel} (sirve para medir después si funcionó).</p>
          <MarkdownLite text={item.description} className="text-muted-foreground" />
        </div>
      )}
    </li>
  );
}

function ApprovePreview({
  item,
  ctx,
  pending,
  onCancel,
  onSubmit
}: {
  item: PlanItemView;
  ctx: PlanContext;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (o: { title: string; estHours: number; urls?: string[]; listId: string | null; assigneeId: string | null; dueDate: string | null; note: string }) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [hours, setHours] = useState(String(item.estHours));
  const [listId, setListId] = useState(ctx.defaults.listId ?? '');
  const [assigneeId, setAssigneeId] = useState(ctx.defaults.assigneeId ?? '');
  const [due, setDue] = useState(ctx.defaults.dueDate);
  const [note, setNote] = useState('');
  const [urls, setUrls] = useState<Set<string>>(() => new Set(item.urls));
  const [showUrls, setShowUrls] = useState(false);
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-brand/30 bg-brand-soft/30 p-3">
      <p className="text-sm font-medium">Revisa el encargo antes de crearlo</p>
      <label className="grid gap-1 text-sm">
        <span className="text-muted-foreground">Título</span>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Responsable</span>
          <select className={selectClass} value={listId ? assigneeId : ''} disabled={!listId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">{listId ? 'Sin responsable' : 'Lo elige Operaciones'}</option>
            {ctx.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Lista de ClickUp</span>
          <select className={selectClass} value={listId} onChange={(e) => setListId(e.target.value)}>
            <option value="">Que la elija Operaciones</option>
            {ctx.lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Fecha</span>
          <Input type="date" value={listId ? due : ''} disabled={!listId} onChange={(e) => setDue(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Horas estimadas</span>
          <Input type="number" min={0.5} max={200} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} />
        </label>
      </div>
      {!listId && <p className="text-xs text-muted-foreground">Sin lista elegida, Operaciones elige lista, responsable y fecha con la ficha del cliente (como al dictar un encargo).</p>}
      {item.urls.length > 1 && (
        <div className="text-sm">
          <button type="button" className="text-brand hover:underline" onClick={() => setShowUrls((v) => !v)} aria-expanded={showUrls}>
            {urls.size} de {item.urls.length} páginas incluidas {showUrls ? '(ocultar)' : '(cambiar)'}
          </button>
          {showUrls && (
            <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-md border bg-card p-2">
              {item.urls.map((u) => (
                <li key={u}>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--brand)]"
                      checked={urls.has(u)}
                      onChange={(e) => {
                        const n = new Set(urls);
                        if (e.target.checked) n.add(u);
                        else n.delete(u);
                        setUrls(n);
                      }}
                    />
                    <span className="truncate">{u}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {urls.size < item.urls.length && <p className="mt-1 text-xs text-muted-foreground">Las que quites vuelven al plan en la siguiente tanda.</p>}
        </div>
      )}
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota para el equipo (opcional)" maxLength={1000} />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          className="bg-brand text-white hover:bg-brand/90"
          disabled={pending || !title.trim() || (item.urls.length > 0 && urls.size === 0)}
          onClick={() =>
            onSubmit({
              title,
              estHours: Number(hours) || item.estHours,
              urls: urls.size < item.urls.length ? [...urls] : undefined,
              listId: listId || null,
              assigneeId: listId ? assigneeId || null : null,
              dueDate: listId ? due || null : null,
              note
            })
          }
        >
          Crear el encargo
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function DiscardBox({ ctx, pending, onCancel, onSubmit }: { ctx: PlanContext; pending: boolean; onCancel: () => void; onSubmit: (reason: string, note: string) => void }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const HELP: Record<string, string> = {
    no_aplica: 'No se vuelve a proponer salvo que aparezcan hallazgos nuevos.',
    ya_hecho: 'Se vuelve a pasar la auditoría: lo arreglado se cierra solo.',
    no_prioritario: 'No se vuelve a proponer salvo con hallazgos nuevos; puedes recuperarla cuando quieras.',
    cliente_no: 'Se guarda en la memoria del cliente: el mapa y los agentes dejarán de proponerlo.'
  };
  return (
    <div className="mt-3 space-y-2 rounded-lg border p-3">
      <p className="text-sm font-medium">¿Por qué se descarta?</p>
      <div role="radiogroup" className="flex flex-wrap gap-1.5">
        {Object.entries(ctx.discardReasons).map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={reason === k} onClick={() => setReason(k)} className={cn('rounded-full border px-3 py-1 text-sm', reason === k ? 'border-brand bg-brand-soft text-brand' : 'bg-card hover:bg-muted')}>
            {label}
          </button>
        ))}
      </div>
      {reason && <p className="text-xs text-muted-foreground">{HELP[reason]}</p>}
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Detalle (opcional)" maxLength={1000} />
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={pending || !reason} onClick={() => onSubmit(reason, note)}>
          Descartar
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
