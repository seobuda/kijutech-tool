'use client';

// Proyecto → Salud técnica: parte interactiva (lanzar la auditoría, descartar o aceptar hallazgos, copiar el JSON-LD).
// Mientras el rastreo está en marcha (y unos minutos después, cuando se aplica la auditoría) se refresca solo.
import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, ChevronRight, Copy, ExternalLink, Loader2, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Section } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { SALUD_GROUP_LABEL, SALUD_KIND_BY_KEY, type SaludGroup, type Severity } from '@/lib/seo/salud/kinds';
import type { SaludFinding, SaludView } from '@/lib/seo/salud/view';
import { decideSaludFindingAction, saveSeoBusinessTypeAction, startSaludAuditAction } from '@/lib/seo/salud-actions';

const SEV: Record<Severity, { label: string; tone: 'danger' | 'warning' | 'info' | 'neutral'; order: number }> = {
  critico: { label: 'Crítico', tone: 'danger', order: 0 },
  importante: { label: 'Importante', tone: 'warning', order: 1 },
  aviso: { label: 'Aviso', tone: 'info', order: 2 },
  info: { label: 'Info', tone: 'neutral', order: 3 }
};
const CRAWL_STATUS: Record<string, string> = { pendiente: 'En cola', en_curso: 'Rastreando', hecho: 'Terminado', error: 'Con error' };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const path = (u: string | null) => {
  if (!u) return '—';
  try {
    const x = new URL(u);
    return decodeURI(x.pathname + x.search) || '/';
  } catch {
    return u;
  }
};

export function SaludPanel({ view, canEdit, businessType, businessTypes }: { view: SaludView; canEdit: boolean; businessType: string; businessTypes: { value: string; label: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const running = view.crawl && (view.crawl.status === 'pendiente' || view.crawl.status === 'en_curso');
  // Tras terminar el rastreo, la auditoría se aplica en la cola: se refresca mientras el trabajo siga pendiente.
  const auditing = view.crawl?.status === 'hecho' && view.auditPending;

  useEffect(() => {
    if (!running && !auditing) return;
    const t = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(t);
  }, [running, auditing, router]);

  const launch = () =>
    start(async () => {
      setMsg(null);
      const r = await startSaludAuditAction(view.project.id);
      if (!r.ok) return setMsg({ type: 'error', text: r.error });
      setMsg({ type: 'ok', text: r.already ? 'Ya había una auditoría en marcha: sigue con esa.' : 'Rastreo en marcha. Va despacio a propósito (1 página por segundo) para no cargar la web del cliente; esta pantalla se actualiza sola.' });
      router.refresh();
    });

  if (!view.web) {
    return (
      <EmptyState
        title="El proyecto no tiene web en su alcance"
        description="Edita el proyecto y marca la web del cliente en «Alcance del proyecto». Si el cliente no tiene la web en su ficha, añádela en Clientes → Más → Webs y cuentas."
        action={
          <Button asChild className="bg-brand text-white hover:bg-brand/90">
            <Link href={`/dashboard/projects/${view.project.id}/edit`}>Editar el proyecto</Link>
          </Button>
        }
      />
    );
  }

  const total = view.counts.critico + view.counts.importante + view.counts.aviso + view.counts.info;
  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Rastreo y auditoría"
        description={
          <>
            Web: <a href={view.web} target="_blank" rel="noreferrer" className="underline underline-offset-2">{view.web}</a> · hasta 500 páginas, respetando robots.txt.
          </>
        }
        actions={
          canEdit && (
            <Button onClick={launch} disabled={pending || Boolean(running)} className="bg-brand text-white hover:bg-brand/90">
              {pending || running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {running ? 'Rastreando…' : view.crawl ? 'Volver a auditar' : 'Rastrear y auditar'}
            </Button>
          )
        }
      >
        {msg && <p className={cn('mb-3 text-sm', msg.type === 'error' ? 'text-destructive' : 'text-success')}>{msg.text}</p>}
        {!view.crawl ? (
          <p className="text-sm text-muted-foreground">
            Todavía no se ha auditado. {canEdit ? 'Pulsa «Rastrear y auditar»: tarda unos minutos (depende del tamaño de la web) y no hace falta quedarse en la pantalla.' : 'Un editor puede lanzarla.'}
          </p>
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Estado</dt>
              <dd className="font-medium">
                {CRAWL_STATUS[view.crawl.status] ?? view.crawl.status}
                {auditing && ' · aplicando la auditoría…'}
                {view.auditError && <span className="text-destructive"> · la auditoría falló: {view.auditError.slice(0, 200)}. Vuelve a lanzarla.</span>}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Páginas leídas</dt>
              <dd className="font-medium">
                {view.crawl.pagesDone}
                {view.crawl.pagesDone >= view.crawl.maxPages && <span className="text-muted-foreground"> (tope alcanzado)</span>}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Empezó</dt>
              <dd className="font-medium">{fmt(view.crawl.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Terminó</dt>
              <dd className="font-medium">{fmt(view.crawl.finishedAt)}</dd>
            </div>
            {view.crawl.error && <p className="text-destructive sm:col-span-4">Error del rastreo: {view.crawl.error}</p>}
            {view.tech && (
              <p className="text-muted-foreground sm:col-span-4">
                Tecnología: <span className="font-medium text-foreground">{view.tech.cms ?? 'no identificada'}{view.tech.version ? ` ${view.tech.version}` : ''}</span>
                {view.tech.theme && <> · tema <span className="font-medium text-foreground">{view.tech.theme}</span></>}
                {view.tech.seoPluginLabels.length > 0 && <> · SEO: <span className="font-medium text-foreground">{view.tech.seoPluginLabels.join(', ')}</span></>}
                {view.tech.plugins.length > 0 && <> · {view.tech.plugins.length} plugins visibles ({view.tech.plugins.slice(0, 8).join(', ')}{view.tech.plugins.length > 8 ? '…' : ''})</>}
                <span className="block text-xs">Solo lo que deja huella en la web pública (muchos plugins no se ven).</span>
              </p>
            )}
          </dl>
        )}
        <div className="mt-4 border-t pt-3 text-sm text-muted-foreground">
          Search Console:{' '}
          {view.gsc.length ? (
            view.gsc.map((g) => (
              <span key={g.siteUrl} className="mr-3">
                {g.siteUrl} · {g.status === 'activa' ? (g.firstDate ? `datos del ${g.firstDate} al ${g.lastDate}` : 'descargando el histórico') : `${g.status}${g.lastError ? `: ${g.lastError.slice(0, 120)}` : ''}`}
              </span>
            ))
          ) : (
            <>
              no está en el alcance del proyecto (sin ella no se cruzan las páginas con impresiones).{' '}
              <Link href={`/dashboard/projects/${view.project.id}/edit`} className="underline underline-offset-2">
                Editar el alcance
              </Link>
            </>
          )}
        </div>
      </Section>

      {view.crawl && (
        <Section
          title="Hallazgos abiertos"
          description={
            total ? (
              <>
                Ordenados por gravedad. <strong>Lo que hay que arreglar no se toca aquí:</strong> pasa solo al{' '}
                <Link href={`/dashboard/projects/${view.project.id}/plan`} className="underline underline-offset-2">
                  Plan de mejora
                </Link>
                , agrupado en propuestas; al aprobar una se crea el encargo para el equipo. Los botones de cada caso son solo para quitar lo que no se va a hacer: «Dejar así» (lo sabemos y es a propósito) o «No es un problema» (falso aviso). Lo quitado no vuelve a salir.
              </>
            ) : undefined
          }
          actions={
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(SEV) as Severity[]).map((s) => (
                <Badge key={s} tone={SEV[s].tone}>
                  {SEV[s].label}: {view.counts[s]}
                </Badge>
              ))}
            </div>
          }
        >
          {view.open.length ? <FindingGroups items={view.open} projectId={view.project.id} canEdit={canEdit} /> : <p className="text-sm text-muted-foreground">{view.crawl.status === 'hecho' && !auditing ? 'Sin hallazgos abiertos. 🎉' : 'Aparecerán aquí cuando termine la auditoría.'}</p>}
        </Section>
      )}

      {view.decided.length > 0 && <Decided items={view.decided} projectId={view.project.id} canEdit={canEdit} />}

      <JsonLdSection view={view} canEdit={canEdit} businessType={businessType} businessTypes={businessTypes} />
    </div>
  );
}

function FindingGroups({ items, projectId, canEdit }: { items: SaludFinding[]; projectId: string; canEdit: boolean }) {
  const byKind = useMemo(() => {
    const m = new Map<string, SaludFinding[]>();
    for (const f of items) m.set(f.kind, [...(m.get(f.kind) ?? []), f]);
    return [...m.entries()].sort((a, b) => SEV[a[1][0].severity].order - SEV[b[1][0].severity].order || b[1].length - a[1].length);
  }, [items]);
  const groups = useMemo(() => {
    const g = new Map<SaludGroup, [string, SaludFinding[]][]>();
    for (const e of byKind) {
      const grp = SALUD_KIND_BY_KEY.get(e[0])?.group ?? 'rastreo';
      g.set(grp, [...(g.get(grp) ?? []), e]);
    }
    return [...g.entries()];
  }, [byKind]);
  return (
    <div className="flex flex-col gap-5">
      {groups.map(([grp, kinds]) => (
        <div key={grp}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{SALUD_GROUP_LABEL[grp]}</h3>
          <ul className="flex flex-col gap-2">
            {kinds.map(([kind, fs]) => (
              <KindRow key={kind} kind={kind} items={fs} projectId={projectId} canEdit={canEdit} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function KindRow({ kind, items, projectId, canEdit }: { kind: string; items: SaludFinding[]; projectId: string; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const meta = SALUD_KIND_BY_KEY.get(kind);
  const sev = SEV[items[0].severity] ?? SEV.info;
  return (
    <li className="rounded-lg border">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-accent/50" aria-expanded={open}>
        {open ? <ChevronDown className="mt-0.5 size-4 shrink-0" /> : <ChevronRight className="mt-0.5 size-4 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{meta?.title ?? kind}</span>
            <Badge tone={sev.tone}>{sev.label}</Badge>
            <span className="text-sm text-muted-foreground">{items.length === 1 ? '1 caso' : `${items.length} casos`}</span>
          </div>
          {meta && <p className="mt-0.5 text-sm text-muted-foreground">{meta.explain}</p>}
          <PlanSummary items={items} />
        </div>
      </button>
      {open && (
        <ul className="divide-y border-t">
          {items.slice(0, 200).map((f) => (
            <FindingItem key={f.id} f={f} projectId={projectId} canEdit={canEdit} />
          ))}
          {items.length > 200 && <li className="px-3 py-2 text-sm text-muted-foreground">… y {items.length - 200} más.</li>}
        </ul>
      )}
    </li>
  );
}

function detail(f: SaludFinding): string {
  const e = f.evidence;
  const parts: string[] = [];
  if (f.metric && f.value != null) parts.push(`${f.metric.replace(/_/g, ' ')}: ${f.value}`);
  if (typeof e.status === 'number') parts.push(`respuesta ${e.status}`);
  if (typeof e.to === 'string') parts.push(`→ ${path(e.to)}`);
  if (typeof e.canonical === 'string') parts.push(`canonical: ${e.canonical}`);
  if (typeof e.title === 'string') parts.push(`«${e.title}»`);
  if (typeof e.other === 'string') parts.push(`parecida a ${path(e.other)}`);
  if (Array.isArray(e.missing)) parts.push(`falta: ${(e.missing as string[]).join(', ')}`);
  if (Array.isArray(e.urls)) parts.push(`en: ${(e.urls as string[]).slice(0, 6).map(path).join(', ')}${(e.urls as string[]).length > 6 ? '…' : ''}`);
  if (typeof e.error === 'string') parts.push(e.error);
  return parts.join(' · ');
}

function FindingItem({ f, projectId, canEdit }: { f: SaludFinding; projectId: string; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const decide = (status: 'descartado' | 'aceptado') =>
    start(async () => {
      const r = await decideSaludFindingAction(projectId, f.id, status, status === 'descartado' ? reason : undefined);
      if (!r.ok) return setErr(r.error);
      setAsking(false);
      router.refresh();
    });
  return (
    <li className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        {f.url ? (
          <a href={f.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 truncate font-mono text-xs hover:underline">
            {path(f.url)}
            <ExternalLink className="size-3 shrink-0" />
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">Toda la web</span>
        )}
        {detail(f) && <p className="truncate text-xs text-muted-foreground">{detail(f)}</p>}
        {f.plan && (
          <p className="text-xs">
            <Badge tone={PLAN_STATUS[f.plan.status]?.tone ?? 'neutral'}>{PLAN_STATUS[f.plan.status]?.label ?? f.plan.status}</Badge>{' '}
            {f.plan.requestUrl ? (
              <a href={f.plan.requestUrl} target="_blank" rel="noreferrer" className="text-muted-foreground underline underline-offset-2">
                {f.plan.title}
              </a>
            ) : (
              <span className="text-muted-foreground">{f.plan.title}</span>
            )}
          </p>
        )}
        {err && <p className="text-xs text-destructive">{err}</p>}
      </div>
      {canEdit &&
        (asking ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="¿Por qué no es un problema? (opcional)"
              className="h-8 w-64 rounded-md border bg-background px-2 text-xs"
              maxLength={500}
            />
            <Button size="sm" disabled={pending} onClick={() => decide('descartado')}>
              No es un problema
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setAsking(false)}>
              Cancelar
            </Button>
          </div>
        ) : (
          <div className="flex shrink-0 gap-1.5">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => decide('aceptado')} title="Lo sabemos y lo dejamos así a propósito: sale del plan y no vuelve a salir. No crea ninguna tarea.">
              Dejar así
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setAsking(true)} title="Es un falso aviso: sale del plan y no vuelve a salir. No crea ninguna tarea.">
              No es un problema
            </Button>
          </div>
        ))}
    </li>
  );
}

const PLAN_STATUS: Record<string, { label: string; tone: 'warning' | 'info' | 'success' | 'neutral' }> = {
  pendiente: { label: 'En el plan, por aprobar', tone: 'warning' },
  aprobada: { label: 'Encargo creado', tone: 'info' },
  hecha: { label: 'Encargo hecho, falta reauditar', tone: 'success' }
};

/** Qué pasará con los casos de un tipo: en qué propuestas del plan van y cuántos quedan fuera. */
function PlanSummary({ items }: { items: SaludFinding[] }) {
  if (!items[0]?.plannable) return <p className="mt-1 text-xs text-muted-foreground">Informativo: no genera encargos en el plan.</p>;
  const props = new Map<string, NonNullable<SaludFinding['plan']>>();
  for (const f of items) if (f.plan) props.set(f.plan.title, f.plan);
  const outside = items.filter((f) => !f.plan).length;
  if (!props.size) return <p className="mt-1 text-xs text-muted-foreground">Entrará en el Plan de mejora la próxima vez que se rehaga.</p>;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      {[...props.values()].map((p) => (
        <Badge key={p.title} tone={PLAN_STATUS[p.status]?.tone ?? 'neutral'}>
          {PLAN_STATUS[p.status]?.label ?? p.status}: {p.title}
        </Badge>
      ))}
      {outside > 0 && <span>{outside} caso(s) más irán en el siguiente lote (cada propuesta lleva como mucho 40 páginas, las que más se ven primero).</span>}
    </p>
  );
}

function Decided({ items, projectId, canEdit }: { items: SaludFinding[]; projectId: string; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [pending, start] = useTransition();
  const reopen = (id: string) =>
    start(async () => {
      const r = await decideSaludFindingAction(projectId, id, 'abierto');
      if (r.ok) router.refresh();
    });
  return (
    <Section
      title={`Quitados: «Dejar así» y «No es un problema» (${items.length})`}
      description="No vuelven a salir en las siguientes auditorías. Se pueden reabrir."
      actions={
        <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
          {open ? 'Ocultar' : 'Ver'}
        </Button>
      }
    >
      {open ? (
        <ul className="divide-y text-sm">
          {items.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <span className="font-medium">{SALUD_KIND_BY_KEY.get(f.kind)?.title ?? f.kind}</span> · <span className="font-mono text-xs">{path(f.url)}</span>
                <p className="text-xs text-muted-foreground">
                  {f.status === 'aceptado' ? 'Dejado así' : 'No es un problema'}
                  {f.dismissReason ? `: ${f.dismissReason}` : ''}
                </p>
              </div>
              {canEdit && (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => reopen(f.id)}>
                  <RotateCcw className="size-3.5" />
                  Reabrir
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Pulsa «Ver» para revisarlos.</p>
      )}
    </Section>
  );
}

function JsonLdSection({ view, canEdit, businessType, businessTypes }: { view: SaludView; canEdit: boolean; businessType: string; businessTypes: { value: string; label: string }[] }) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  // Editor: el tipo se guarda en la ficha del cliente (lo usan también la medición y, después, Ads). Lector: solo se mira.
  const choose = (value: string) => {
    if (!canEdit || !view.project.clientId) return router.replace(`/dashboard/projects/${view.project.id}/salud?tipo=${encodeURIComponent(value)}`, { scroll: false });
    startSave(async () => {
      setSaveMsg(null);
      const r = await saveSeoBusinessTypeAction(view.project.id, value);
      setSaveMsg(r.ok ? 'Guardado en la ficha del cliente.' : r.error);
      router.replace(`/dashboard/projects/${view.project.id}/salud`, { scroll: false });
      router.refresh();
    });
  };
  return (
    <Section
      title="Datos estructurados (JSON-LD)"
      description="Código listo para pegar en la web, generado con los datos de la ficha del cliente. Sin preguntas frecuentes ni reseñas propias (Google no los muestra o no los admite)."
      actions={
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Tipo de negocio</span>
          <select
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={businessType}
            disabled={saving}
            onChange={(e) => choose(e.target.value)}
          >
            {businessTypes.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      }
    >
      {view.jsonld.missing.length > 0 && (
        <div className="mb-4 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm">
          <p className="font-medium">Para que el código esté completo, falta en la ficha:</p>
          <ul className="mt-1 list-disc pl-5">
            {view.jsonld.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          {view.project.clientId && (
            <Link href={`/dashboard/clientes/${view.project.clientId}`} className="mt-2 inline-block underline underline-offset-2">
              Abrir la ficha del cliente
            </Link>
          )}
        </div>
      )}
      <div className="flex flex-col gap-4">
        {view.jsonld.blocks.map((b) => (
          <CodeBlock key={b.key} title={b.title} where={b.where} code={b.code} />
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Después de pegarlo, compruébalo en la{' '}
        <a href="https://search.google.com/test/rich-results" target="_blank" rel="noreferrer" className="underline underline-offset-2">
          prueba de resultados enriquecidos de Google
        </a>
        .{' '}
        {saveMsg ? saveMsg : view.savedBusinessType ? 'El tipo de negocio está guardado en la ficha del cliente.' : 'El tipo de negocio aún no está en la ficha: al elegirlo se guarda allí.'}
      </p>
    </Section>
  );
}

function CodeBlock({ title, where, code }: { title: string; where: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="rounded-lg border">
      <div className="flex items-start justify-between gap-3 border-b px-3 py-2">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{where}</p>
        </div>
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
      <pre className="max-h-96 overflow-auto bg-muted/40 p-3 text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
