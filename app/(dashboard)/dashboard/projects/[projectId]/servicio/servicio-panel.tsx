'use client';

// Proyecto → Trabajo → Plan de servicio: versión elegida (por defecto la aprobada), sus frentes por trimestre con evidencias
// y pronósticos, y lo que avisa el puntuador del código. Admin: generar versión nueva, aprobar, rechazar con motivo y
// poner nota (modo sombra: «¿lo habría hecho yo así?»).
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Compass, HelpCircle, Loader2, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Section } from '@/components/ui/page';
import type { PlanView } from '@/lib/seo/jefe/plan';
import { KIND_LABEL, type FrenteKind } from '@/lib/seo/jefe/plan-rules';
import { PLAYBOOKS, type PlaybookKey } from '@/lib/seo/estrategia/playbooks';
import { approvePlanAction, rejectPlanAction, requestMasterPlanAction, scorePlanAction } from '@/lib/seo/jefe-actions';
import type { ChangeView } from '@/lib/seo/jefe/cambios';
import { JefeChat, PlanChanges } from './jefe-chat';

type Res = { ok: true; message?: string } | { ok: false; error: string };
const STATUS: Record<string, { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }> = {
  borrador: { label: 'Preparando', tone: 'info' },
  sombra: { label: 'En sombra (por revisar)', tone: 'warning' },
  propuesto: { label: 'Propuesto', tone: 'warning' },
  aprobado: { label: 'Aprobado', tone: 'success' },
  sustituido: { label: 'Sustituido', tone: 'neutral' },
  rechazado: { label: 'Rechazado', tone: 'danger' }
};
const PRIORITY = ['', 'Alta', 'Media', 'Baja'];
const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<Res>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.message ?? 'Hecho.' } : { ok: false, text: r.error });
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  return { pending, msg, run };
}

function Generate({ projectId, view }: { projectId: string; view: PlanView }) {
  const { pending, msg, run } = useAct();
  const [horizon, setHorizon] = useState(12);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Horizonte del plan" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value={12}>12 meses</option>
          <option value={24}>24 meses</option>
        </select>
        <Button size="sm" disabled={pending || view.generating} onClick={() => run(() => requestMasterPlanAction(projectId, horizon))}>
          {pending || view.generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {view.generating ? 'Preparando…' : view.versions.length ? 'Generar versión nueva' : 'Generar el plan'}
        </Button>
        <span className="text-xs text-muted-foreground">
          Opus 5.5 · unos 0,6 $ · gasto del Jefe este mes: {view.spent.toFixed(2)} $ de {view.budget} $
        </span>
      </div>
      {msg && <p role="status" className={msg.ok ? 'text-sm text-success' : 'text-sm text-destructive'}>{msg.text}</p>}
    </div>
  );
}

function Decide({ projectId, planId, status, score }: { projectId: string; planId: string; status: string; score: number | null }) {
  const { pending, msg, run } = useAct();
  const [note, setNote] = useState('');
  const [stars, setStars] = useState<number>(score ?? 0);
  const open = status === 'sombra' || status === 'propuesto';
  return (
    <Section title="Tu revisión" description="Modo sombra: puntúa si lo habrías planteado así (1 = nada, 5 = igual que yo). Si lo rechazas, el motivo lo lee el Jefe en la siguiente versión.">
      <div className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Nota de 1 a 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <Button key={n} type="button" size="sm" variant={stars === n ? 'default' : 'outline'} aria-pressed={stars === n} onClick={() => setStars(n)} disabled={pending}>
              {n}
            </Button>
          ))}
          <Button size="sm" variant="outline" disabled={pending || !stars} onClick={() => run(() => scorePlanAction(projectId, planId, stars, note))}>
            Guardar nota
          </Button>
        </div>
        <label className="text-sm">
          Comentario o motivo <span className="text-muted-foreground">(obligatorio para rechazar)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1 w-full rounded-md border bg-background p-2 text-sm" placeholder="P. ej.: primero hay que arreglar la ficha de Google; el contenido nuevo puede esperar al segundo trimestre." />
        </label>
        {open && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={() => run(() => approvePlanAction(projectId, planId, note), () => setNote(''))}>
              <Check className="size-4" /> Aprobar este plan
            </Button>
            <Button size="sm" variant="outline" disabled={pending || note.trim().length < 5} onClick={() => run(() => rejectPlanAction(projectId, planId, note), () => setNote(''))}>
              <X className="size-4" /> Rechazar
            </Button>
          </div>
        )}
        {msg && <p role="status" className={msg.ok ? 'text-sm text-success' : 'text-sm text-destructive'}>{msg.text}</p>}
      </div>
    </Section>
  );
}

export function ServicioPanel({ projectId, view, isAdmin, changes }: { projectId: string; view: PlanView; isAdmin: boolean; changes: ChangeView[] }) {
  const plan = view.current;
  const base = `/dashboard/projects/${projectId}/servicio`;
  if (!plan)
    return (
      <div className="flex flex-col gap-4">
        {isAdmin && <Generate projectId={projectId} view={view} />}
        <EmptyState
          icon={Compass}
          title={view.generating ? 'El Jefe SEO está preparando el plan' : 'Este proyecto aún no tiene plan de servicio'}
          description={
            view.generating
              ? 'Tarda unos minutos: lee todo el expediente del proyecto. Recarga la página en un rato.'
              : isAdmin
                ? 'Genera el plan: el Jefe SEO lee el expediente (Search Console, problemas, temas, competencia…) y propone qué trabajar cada trimestre. Quedará en sombra hasta que lo apruebes.'
                : 'Cuando un administrador apruebe el plan, aparecerá aquí. Mientras tanto, el trabajo sigue en Estrategia y en el Plan de mejora.'
          }
          action={
            <Link href={`/dashboard/projects/${projectId}/expediente`} className="text-sm text-primary underline-offset-4 hover:underline">
              Ver el expediente del proyecto
            </Link>
          }
        />
        {isAdmin && <JefeChat projectId={projectId} />}
      </div>
    );
  const st = STATUS[plan.status] ?? { label: plan.status, tone: 'neutral' as const };
  const scorer = (plan.scorer ?? {}) as { score?: number; divergences?: string[]; warnings?: string[]; q1Hours?: number; q1Available?: number | null; shadowNote?: string };
  const quarters = Math.max(1, Math.round(plan.horizonMonths / 3));
  const diagnosis = asList(plan.diagnosis) as { text: string; evidence: string[] }[];
  const discarded = asList(plan.discarded) as { option: string; reason: string }[];

  return (
    <div className="flex flex-col gap-4">
      {isAdmin && <Generate projectId={projectId} view={view} />}
      {view.versions.length > 1 && (
        <nav aria-label="Versiones del plan" className="flex flex-wrap gap-2 text-sm">
          {view.versions.map((v) => (
            <Link key={v.id} href={`${base}?v=${v.id}`} aria-current={v.id === plan.id ? 'page' : undefined} className={v.id === plan.id ? 'rounded-md border border-primary px-2 py-1 font-medium' : 'rounded-md border px-2 py-1 text-muted-foreground hover:text-foreground'}>
              v{v.version} · {STATUS[v.status]?.label ?? v.status}
            </Link>
          ))}
        </nav>
      )}

      <Section
        title={
          <span className="flex flex-wrap items-center gap-2">
            Versión {plan.version} <Badge tone={st.tone}>{st.label}</Badge>
            {plan.confidence && <Badge tone="neutral">Confianza {plan.confidence}</Badge>}
          </span>
        }
        description={`${plan.horizonMonths} meses desde el ${fmtDate(plan.startsOn)} · ${plan.model ?? ''}${plan.costUsd ? ` · ${Number(plan.costUsd).toFixed(2)} $` : ''}${plan.decidedBy ? ` · decidido por ${plan.decidedBy}` : ''}`}
      >
        <div className="flex flex-col gap-4 p-5">
          <p className="text-[15px] leading-relaxed">{plan.thesis}</p>
          {plan.reviewNote && (
            <p className="rounded-md bg-muted p-3 text-sm">
              <span className="font-medium">Revisión: </span>
              {plan.reviewNote}
            </p>
          )}
          {isAdmin && scorer.shadowNote && (
            <p className="rounded-md border p-3 text-sm">
              <span className="font-medium">Tu nota{plan.shadowScore ? ` (${plan.shadowScore}/5)` : ''}: </span>
              {scorer.shadowNote}
            </p>
          )}
          {diagnosis.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-semibold">Diagnóstico</h3>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
                {diagnosis.map((d, i) => (
                  <li key={i}>
                    {d.text} {d.evidence?.length > 0 && <span className="text-xs text-muted-foreground">({d.evidence.length} datos)</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Section>

      {isAdmin && (scorer.divergences?.length || scorer.warnings?.length) ? (
        <Section title={`Lo que avisa el código${scorer.score != null ? ` · orden ${scorer.score}/100` : ''}`} description="Comprobaciones sin IA: evidencias que no existen, líneas que no se pueden hacer, horas del primer trimestre y si el orden se sale del criterio de la agencia. No vetan: te avisan.">
          <ul className="flex flex-col gap-1 p-5 text-sm">
            {[...(scorer.divergences ?? []), ...(scorer.warnings ?? [])].map((w, i) => (
              <li key={i} className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-strong" aria-hidden />
                {w}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {Array.from({ length: quarters }, (_, i) => i + 1).map((q) => {
        const items = plan.items.filter((it) => it.fromQuarter <= q && it.toQuarter >= q);
        if (!items.length) return null;
        return (
          <Section key={q} title={`Trimestre ${q}`} description={q === 1 && scorer.q1Hours != null ? `Líneas que empiezan aquí: ${scorer.q1Hours} h${scorer.q1Available != null ? ` de ${scorer.q1Available} h para estrategia` : ''}` : undefined}>
            <ul className="divide-y">
              {items.map((it) => {
                const cond = (it.params as Record<string, unknown>)?.condicionado;
                const continues = it.fromQuarter < q;
                return (
                  <li key={it.id} className="flex flex-col gap-1.5 px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{it.title}</span>
                      <Badge tone="neutral">{KIND_LABEL[it.kind as FrenteKind] ?? it.kind}</Badge>
                      {it.playbook && <Badge tone="info">{PLAYBOOKS[it.playbook as PlaybookKey]?.label ?? it.playbook}</Badge>}
                      <Badge tone={it.priority === 1 ? 'danger' : it.priority === 2 ? 'warning' : 'neutral'}>Prioridad {PRIORITY[it.priority] ?? it.priority}</Badge>
                      {continues && <span className="text-xs text-muted-foreground">(sigue desde el T{it.fromQuarter})</span>}
                    </div>
                    {!continues && (
                      <>
                        <p className="text-sm text-muted-foreground">{it.rationale}</p>
                        {typeof cond === 'string' && <p className="text-xs text-warning-strong">Condicionado: {cond}</p>}
                        {it.forecast && <p className="text-xs">Pronóstico (calculado por código, no es promesa): {it.forecast}</p>}
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground">Datos que lo respaldan ({it.evidence.length})</summary>
                          <ul className="mt-1 flex flex-col gap-0.5 pl-3">
                            {it.evidence.map((e) => (
                              <li key={e.id}>
                                <span className="font-mono text-[11px] text-muted-foreground">{e.id.split(':')[0]}</span> {e.label}
                                {Object.entries(e.data ?? {})
                                  .filter(([, v]) => v != null && v !== '')
                                  .slice(0, 4)
                                  .map(([k, v]) => ` · ${k}: ${String(v).slice(0, 60)}`)
                                  .join('')}
                              </li>
                            ))}
                          </ul>
                        </details>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        );
      })}

      <div className="grid gap-4 md:grid-cols-3">
        <Section title="Riesgos">
          <ul className="flex list-disc flex-col gap-1 p-5 pl-9 text-sm">{(asList(plan.risks) as string[]).map((r, i) => <li key={i}>{r}</li>)}{!asList(plan.risks).length && <li className="list-none text-muted-foreground">—</li>}</ul>
        </Section>
        <Section title={<span className="flex items-center gap-1.5"><HelpCircle className="size-4" aria-hidden /> Lo que no sabe</span>}>
          <ul className="flex list-disc flex-col gap-1 p-5 pl-9 text-sm">{(asList(plan.unknowns) as string[]).map((r, i) => <li key={i}>{r}</li>)}{!asList(plan.unknowns).length && <li className="list-none text-muted-foreground">—</li>}</ul>
        </Section>
        <Section title="Lo que descartó">
          <ul className="flex flex-col gap-2 p-5 text-sm">
            {discarded.map((d, i) => (
              <li key={i}>
                <span className="font-medium">{d.option}</span>
                <span className="text-muted-foreground"> — {d.reason}</span>
              </li>
            ))}
            {!discarded.length && <li className="text-muted-foreground">—</li>}
          </ul>
        </Section>
      </div>

      {isAdmin && plan.status !== 'borrador' && <Decide projectId={projectId} planId={plan.id} status={plan.status} score={plan.shadowScore} />}
      {isAdmin && <PlanChanges projectId={projectId} changes={changes} />}
      {isAdmin && <JefeChat projectId={projectId} />}
    </div>
  );
}
