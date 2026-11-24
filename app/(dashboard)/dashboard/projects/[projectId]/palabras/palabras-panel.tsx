'use client';

// Proyecto → Palabras: parte interactiva (rehacer el mapa, ver las búsquedas de cada tema, renombrar o descartar).
import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Loader2, Pencil, RefreshCw, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState, Section, StatCard } from '@/components/ui/page';
import { buildKeywordMapAction, crawlCompetitorsAction, decideCompetitorAction, findCompetitorsAction, updateTopicAction } from '@/lib/seo/mapa-actions';
import { Check, Globe, Search } from 'lucide-react';
import type { CompetitorComparison } from '@/lib/seo/competencia/competencia';

export type TopicView = {
  id: string;
  name: string;
  url: string | null;
  origin: string;
  status: string;
  metrics: Record<string, number | null>;
  queries: { query: string; clicks: number; impressions: number; position: number | null }[];
};
type Job = { status: string; result: Record<string, unknown> | null; error: string | null; finishedAt: string | null };
export type CompetitorView = { id: string; name: string; domain: string | null; status: string; kind: string; source: string; evidence: Record<string, unknown> };
type CompJob = { status: string; result: Record<string, unknown> | null; error: string | null };

const n = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('es-ES'));
const path = (u: string) => {
  try {
    const x = new URL(u);
    return decodeURI(x.pathname) || '/';
  } catch {
    return u;
  }
};

export function PalabrasPanel({ projectId, topics, canEdit, hasGsc, job, cannibal, competitors, compJob, comparison }: { projectId: string; topics: TopicView[]; canEdit: boolean; hasGsc: boolean; job: Job | null; cannibal: number; competitors: CompetitorView[]; compJob: CompJob | null; comparison: CompetitorComparison }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [filter, setFilter] = useState<'todos' | 'pagina' | 'nueva' | 'descartado'>('todos');
  const running = job?.status === 'pendiente' || job?.status === 'en_curso' || compJob?.status === 'pendiente' || compJob?.status === 'en_curso' || comparison.running;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 8_000);
    return () => clearInterval(t);
  }, [running, router]);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText?: string) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (!r.ok) setMsg({ type: 'error', text: r.error });
      else if (okText) setMsg({ type: 'ok', text: okText });
      router.refresh();
    });

  const shown = useMemo(
    () =>
      topics.filter((t) =>
        filter === 'descartado' ? t.status === 'descartado' : t.status === 'activo' && (filter === 'todos' || (filter === 'pagina' ? t.url !== null : t.url === null))
      ),
    [topics, filter]
  );
  const active = topics.filter((t) => t.status === 'activo');
  const r = job?.result ?? null;

  if (!hasGsc) {
    return (
      <EmptyState
        title="El proyecto no tiene Search Console"
        description="El mapa de palabras sale de las búsquedas reales de Search Console. Edita el proyecto y marca la propiedad del cliente en su alcance; la descarga del detalle empieza sola."
        action={
          <Button asChild className="bg-brand text-white hover:bg-brand/90">
            <Link href={`/dashboard/projects/${projectId}/edit`}>Editar el proyecto</Link>
          </Button>
        }
      />
    );
  }

  const rebuild = canEdit && (
    <Button size="sm" variant="outline" disabled={pending || running} onClick={() => run(() => buildKeywordMapAction(projectId), 'Calculando el mapa: tarda menos de un minuto.')}>
      {running ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
      {running ? 'Calculando…' : topics.length ? 'Rehacer el mapa' : 'Calcular el mapa'}
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      {msg && <p className={msg.type === 'error' ? 'text-sm text-destructive' : 'text-sm text-success'}>{msg.text}</p>}
      {job?.status === 'fallido' && <p className="text-sm text-destructive">El último cálculo falló: {job.error?.slice(0, 200) ?? 'sin detalle'}.</p>}

      {topics.length === 0 ? (
        <EmptyState
          title={running ? 'Calculando el mapa…' : 'Aún no hay mapa'}
          description="Se calcula solo después de cada auditoría de Salud técnica, o ahora con el botón. Si Search Console aún se está descargando, puede salir corto: vuelve a calcularlo mañana."
          action={rebuild || undefined}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <StatCard label="Temas" value={n(active.length)} />
            <StatCard label="Con página" value={n(active.filter((t) => t.url).length)} />
            <StatCard label="Piden página nueva" value={n(active.filter((t) => !t.url).length)} />
            <StatCard label="Clics anónimos" value={typeof r?.anonymousPct === 'number' ? `${r.anonymousPct} %` : '—'} />
          </div>
          {cannibal > 0 && (
            <div className="rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm">
              {cannibal} búsqueda(s) con canibalización: Google alterna entre varias páginas.{' '}
              <Link href={`/dashboard/projects/${projectId}/salud`} className="underline underline-offset-2">
                Verlas en Salud técnica
              </Link>{' '}
              · ya están en el plan de mejora.
            </div>
          )}
          <Section
            title="Temas"
            description={`Ordenados por impresiones (90 días). Agrupado ${r?.grouping === 'embeddings' ? 'por página y por significado' : 'por página y por palabras (sin embeddings disponibles)'}${Number(r?.pendingEmbeddings ?? 0) > 0 ? ` (${r?.pendingEmbeddings} búsquedas aún por palabras: el proveedor de embeddings limitó el uso; se completa solo en las próximas horas)` : ''}. «Clics anónimos» es la parte de los clics cuya búsqueda Google no enseña.`}
            actions={
              <>
                <select className="h-8 rounded-md border bg-background px-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filtrar temas">
                  <option value="todos">Todos</option>
                  <option value="pagina">Con página</option>
                  <option value="nueva">Página nueva</option>
                  <option value="descartado">Descartados</option>
                </select>
                {rebuild}
              </>
            }
          >
            {shown.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada con este filtro.</p>
            ) : (
              <ul className="divide-y">
                {shown.map((t) => (
                  <TopicRow key={t.id} topic={t} projectId={projectId} canEdit={canEdit} pending={pending} run={run} />
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
      <CompetitorsSection projectId={projectId} competitors={competitors} job={compJob} canEdit={canEdit} pending={pending} run={run} hasTopics={topics.length > 0} />
      <ComparisonSection projectId={projectId} data={comparison} canEdit={canEdit} pending={pending} run={run} />
    </div>
  );
}

function CompetitorsSection({
  projectId,
  competitors,
  job,
  canEdit,
  pending,
  run,
  hasTopics
}: {
  projectId: string;
  competitors: CompetitorView[];
  job: CompJob | null;
  canEdit: boolean;
  pending: boolean;
  run: (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText?: string) => void;
  hasTopics: boolean;
}) {
  const running = job?.status === 'pendiente' || job?.status === 'en_curso';
  const order: Record<string, number> = { propuesto: 0, confirmado: 1, descartado: 2 };
  const list = [...competitors].sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
  const r = job?.result ?? null;
  return (
    <Section
      title="Competencia en Google"
      description={`Quién sale en Google por las búsquedas principales del proyecto (orgánico y mapa), con DataForSEO. Lo que propone la búsqueda lo confirmas tú; los directorios salen marcados.${r && typeof r.searches === 'number' ? ` Última búsqueda: ${r.searches} búsquedas, ${String(r.costUsd ?? '?')} $.` : ''}`}
      actions={
        canEdit ? (
          <Button size="sm" variant="outline" disabled={pending || running || !hasTopics} onClick={() => run(() => findCompetitorsAction(projectId), 'Buscando la competencia: tarda uno o dos minutos.')}>
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            {running ? 'Buscando…' : 'Buscar competencia'}
          </Button>
        ) : undefined
      }
    >
      {job?.status === 'fallido' && <p className="mb-3 text-sm text-destructive">{job.error?.slice(0, 240) ?? 'La búsqueda falló'}</p>}
      {!hasTopics && <p className="mb-3 text-sm text-muted-foreground">Primero calcula el mapa de palabras: sus temas son las búsquedas de partida.</p>}
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin competidores todavía.</p>
      ) : (
        <ul className="divide-y">
          {list.map((c) => {
            const e = c.evidence as { apariciones?: number; de?: number; posicionMedia?: number | null; enPaqueteLocal?: number; valoracion?: number | null; resenas?: number | null; busquedas?: string[]; huecos?: string[] };
            return (
              <li key={c.id} className={c.status === 'descartado' ? 'py-2 text-muted-foreground' : 'py-2'}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{c.domain ?? c.name}</span>
                  {c.name && c.domain && c.name !== c.domain && <span className="text-xs text-muted-foreground">{c.name}</span>}
                  <Badge tone={c.status === 'confirmado' ? 'success' : c.status === 'propuesto' ? 'warning' : 'neutral'}>{c.status === 'confirmado' ? 'Confirmado' : c.status === 'propuesto' ? 'Propuesto' : 'Descartado'}</Badge>
                  {c.kind === 'agregador' && <Badge tone="outline">Directorio</Badge>}
                  {typeof e.apariciones === 'number' && <span className="text-xs text-muted-foreground">sale en {e.apariciones}{e.de ? ` de ${e.de}` : ''} búsquedas{e.posicionMedia ? `, posición media ${e.posicionMedia}` : ''}{e.enPaqueteLocal ? `, ${e.enPaqueteLocal} veces en el mapa` : ''}{e.valoracion ? ` · ★ ${e.valoracion}${e.resenas ? ` (${e.resenas})` : ''}` : ''}</span>}
                  {canEdit && (
                    <span className="ml-auto flex gap-1">
                      {c.status !== 'confirmado' && (
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => decideCompetitorAction(projectId, c.id, 'confirmado'))}>
                          <Check className="size-3.5" />
                          Confirmar
                        </Button>
                      )}
                      {c.status !== 'descartado' && (
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => decideCompetitorAction(projectId, c.id, 'descartado'))}>
                          <X className="size-3.5" />
                          Descartar
                        </Button>
                      )}
                    </span>
                  )}
                </div>
                {e.busquedas?.length ? <p className="mt-0.5 text-xs text-muted-foreground">Búsquedas: {e.busquedas.slice(0, 5).join(' · ')}</p> : null}
                {c.status !== 'descartado' && e.huecos?.length ? <p className="mt-0.5 text-xs text-warning-strong">Sale y la web del cliente no: {e.huecos.slice(0, 5).join(' · ')}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function TopicRow({
  topic,
  projectId,
  canEdit,
  pending,
  run
}: {
  topic: TopicView;
  projectId: string;
  canEdit: boolean;
  pending: boolean;
  run: (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(topic.name);
  const m = topic.metrics;
  const trend = m.tendenciaPct;
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button type="button" className="flex min-w-0 flex-1 items-start gap-2 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? <ChevronDown className="mt-0.5 size-4 shrink-0" /> : <ChevronRight className="mt-0.5 size-4 shrink-0" />}
          <span className="min-w-0">
            <span className="block text-sm font-medium">{topic.name}</span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {topic.url ? <Badge tone="outline">{path(topic.url)}</Badge> : <Badge tone="warning">Página nueva</Badge>}
              <span>{n(m.clics)} clics</span>·<span>{n(m.impresiones)} impresiones</span>·<span>posición {m.posicion ?? '—'}</span>·<span>{n(m.consultas)} búsquedas</span>
              {trend != null && <Badge tone={trend >= 0 ? 'success' : 'danger'}>{trend > 0 ? '+' : ''}{trend} % clics (28 días)</Badge>}
              {(m.marca ?? 0) > 0 && <Badge tone="neutral">marca</Badge>}
            </span>
          </span>
        </button>
        {canEdit && (
          <span className="flex gap-1">
            {!editing && (
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label="Cambiar el nombre">
                <Pencil className="size-3.5" />
              </Button>
            )}
            {topic.status === 'activo' ? (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => updateTopicAction(projectId, topic.id, { status: 'descartado' }))}>
                <X className="size-3.5" />
                Descartar
              </Button>
            ) : (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => updateTopicAction(projectId, topic.id, { status: 'activo' }))}>
                <RotateCcw className="size-3.5" />
                Recuperar
              </Button>
            )}
          </span>
        )}
      </div>
      {editing && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Input className="h-9 max-w-md" value={name} onChange={(e) => setName(e.target.value)} />
          <Button
            size="sm"
            className="bg-brand text-white hover:bg-brand/90"
            disabled={pending || !name.trim()}
            onClick={() => {
              setEditing(false);
              run(() => updateTopicAction(projectId, topic.id, { name }));
            }}
          >
            Guardar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        </div>
      )}
      {open && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">Búsqueda</th>
                <th className="py-1 pr-3 text-right font-medium">Clics</th>
                <th className="py-1 pr-3 text-right font-medium">Impresiones</th>
                <th className="py-1 text-right font-medium">Posición</th>
              </tr>
            </thead>
            <tbody>
              {topic.queries.map((q) => (
                <tr key={q.query} className="border-t">
                  <td className="py-1 pr-3">{q.query}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{n(q.clicks)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{n(q.impressions)}</td>
                  <td className="py-1 text-right tabular-nums">{q.position != null ? q.position.toFixed(1) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {topic.url && (
            <a href={topic.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs underline underline-offset-2">
              Abrir la página
            </a>
          )}
        </div>
      )}
    </li>
  );
}

const ms = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('es-ES')} ms`);
const STATUS_TEXT: Record<string, string> = { rastreando: 'Rastreando…', sin_rastrear: 'Sin rastrear', error: 'Falló' };

function ComparisonSection({
  projectId,
  data,
  canEdit,
  pending,
  run
}: {
  projectId: string;
  data: CompetitorComparison;
  canEdit: boolean;
  pending: boolean;
  run: (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText?: string) => void;
}) {
  if (!data.competitors.length) return null;
  const rows = [...(data.client ? [{ ...data.client, label: 'Cliente', status: 'hecho' as const, error: null }] : []), ...data.competitors.map((c) => ({ ...c, label: '' }))];
  return (
    <Section
      title="Sus webs frente a la del cliente"
      description="Rastreo ligero (50 páginas, las principales primero) de cada competidor confirmado, sin IA. Se rastrea al confirmarlo y se puede repetir una vez al mes. La web del cliente sale de su última auditoría."
      actions={
        canEdit ? (
          <Button size="sm" variant="outline" disabled={pending || data.running} onClick={() => run(() => crawlCompetitorsAction(projectId), 'Rastreando sus webs: unos minutos por web.')}>
            {data.running ? <Loader2 className="size-3.5 animate-spin" /> : <Globe className="size-3.5" />}
            {data.running ? 'Rastreando…' : 'Rastrear sus webs'}
          </Button>
        ) : undefined
      }
    >
      {data.takeaways.length > 0 && (
        <ul className="mb-4 list-disc space-y-1 pl-5 text-sm">
          {data.takeaways.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-1.5 pr-3 font-medium">Web</th>
              <th className="py-1.5 pr-3 font-medium">Páginas</th>
              <th className="py-1.5 pr-3 font-medium">Palabras (mediana)</th>
              <th className="py-1.5 pr-3 font-medium">Servidor</th>
              <th className="py-1.5 pr-3 font-medium">Servicios con página</th>
              <th className="py-1.5 font-medium">Datos estructurados</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => {
              const svc = Object.values(r.services);
              return (
                <tr key={`${r.label}${r.domain}`} className={r.label ? 'bg-muted/40' : undefined}>
                  <td className="py-1.5 pr-3">
                    <span className="font-medium">{r.domain}</span> {r.label && <Badge tone="info">{r.label}</Badge>}
                    {r.status !== 'hecho' && <span className={r.status === 'error' ? 'ml-1 text-xs text-destructive' : 'ml-1 text-xs text-muted-foreground'}>{STATUS_TEXT[r.status]}</span>}
                    {r.error && <span className="block text-xs text-destructive">{r.error}</span>}
                  </td>
                  <td className="py-1.5 pr-3">{r.status === 'hecho' || r.label ? n(r.pages) : '—'}</td>
                  <td className="py-1.5 pr-3">{n(r.medianWords)}</td>
                  <td className="py-1.5 pr-3">{ms(r.medianMs)}</td>
                  <td className="py-1.5 pr-3" title={Object.entries(r.services).map(([k, v]) => `${k}: ${v ? path(v) : 'no'}`).join('\n')}>
                    {r.pages ? `${svc.filter(Boolean).length} de ${svc.length}` : '—'}
                  </td>
                  <td className="py-1.5 text-xs text-muted-foreground">{r.schemaTypes.length ? r.schemaTypes.slice(0, 6).join(', ') : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!data.client && <p className="mt-3 text-sm text-muted-foreground">Falta el rastreo de la web del cliente: pasa la auditoría en Salud técnica para compararla.</p>}
      {data.services.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Servicios comparados: {data.services.join(' · ')}. Una página cuenta si todas las palabras del servicio están en su dirección, su título o su H1.</p>}
    </Section>
  );
}
