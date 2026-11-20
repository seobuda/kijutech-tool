'use client';

// Ficha de una entrada de la base de conocimiento. Lectura para todo el equipo; para Enric (admin): editor, revisión de
// las propuestas (pedir cambios a la IA, volver a redactar), estados (publicar, más tarde, archivar) y eliminar.
// Los cambios sin guardar avisan antes de salir de la página.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Archive, ArrowLeft, CheckCircle2, Clock, ExternalLink, Pencil, Plus, RotateCcw, Save, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { KB_SOURCE_LABEL, KB_STATUS_LABEL, type KbLink, type KbSource, type KbStatus } from '@/lib/core/knowledge-rules';
import {
  deleteArticleAction,
  markReviewedAction,
  redraftArticleAction,
  reviseArticleAction,
  saveArticleAction,
  setArticleStatusAction
} from '@/lib/core/knowledge-actions';
import { areaClass, brandBtn, ConfirmDelete, MsgLine, selectClass, useRun } from '../clientes/ui';

export type ArticleData = {
  id: string;
  title: string;
  problem: string;
  solution: string;
  categoryId: string;
  tags: string[];
  links: KbLink[];
  status: string;
  sourceType: string;
  sourceUrl: string | null;
  requestedByName: string | null;
  requestText: string | null;
  editNotes: { at: string; instruction: string }[];
  timesUsed: number;
  helpful: number;
  notHelpful: number;
  updatedAt: string;
  reviewedAt: string | null;
  publishedAt: string | null;
  needsReview: boolean;
};
type Category = { id: string; name: string; archived: boolean };

const STATUS_TONE: Record<string, 'success' | 'brand' | 'warning' | 'neutral'> = { publicada: 'success', propuesta: 'brand', mas_tarde: 'warning', borrador: 'neutral', archivada: 'neutral' };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');

/** Texto en línea: enlaces clicables, **negrita**, *cursiva* y `código` (sin interpretar HTML). */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>()"']+|\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (/^https?:\/\//.test(p))
          return (
            <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="break-all text-brand underline-offset-2 hover:underline">
              {p}
            </a>
          );
        if (/^\*\*.+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
        if (/^`.+`$/.test(p))
          return (
            <code key={i} className="rounded bg-muted px-1 text-[13px]">
              {p.slice(1, -1)}
            </code>
          );
        if (/^\*.+\*$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

/**
 * Markdown sencillo (lo que escribe la IA de la base): títulos (#), listas (- y 1.), párrafos y formato en línea.
 * Sin dependencias ni HTML: todo se pinta como elementos de React.
 */
function RichText({ text, className }: { text: string; className?: string }) {
  type Block = { kind: 'h' | 'p' | 'ul' | 'ol'; lines: string[] };
  const blocks: Block[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const last = blocks[blocks.length - 1];
    if (!line.trim()) {
      blocks.push({ kind: 'p', lines: [] });
      continue;
    }
    const add = (kind: Block['kind'], content: string) => {
      if (kind !== 'h' && last?.kind === kind && last.lines.length) last.lines.push(content);
      else blocks.push({ kind, lines: [content] });
    };
    if (/^#{1,6}\s/.test(line)) add('h', line.replace(/^#+\s*/, ''));
    else if (/^\s*[-*]\s+/.test(line)) add('ul', line.replace(/^\s*[-*]\s+/, ''));
    else if (/^\s*\d+[.)]\s+/.test(line)) add('ol', line.replace(/^\s*\d+[.)]\s+/, ''));
    else add('p', line);
  }
  return (
    <div className={cn('space-y-2 break-words text-sm leading-relaxed', className)}>
      {blocks
        .filter((b) => b.lines.length)
        .map((b, i) =>
          b.kind === 'h' ? (
            <h3 key={i} className="pt-1 font-semibold">
              <Inline text={b.lines[0]} />
            </h3>
          ) : b.kind === 'ul' ? (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {b.lines.map((l, j) => (
                <li key={j}>
                  <Inline text={l} />
                </li>
              ))}
            </ul>
          ) : b.kind === 'ol' ? (
            <ol key={i} className="list-decimal space-y-1 pl-5">
              {b.lines.map((l, j) => (
                <li key={j}>
                  <Inline text={l} />
                </li>
              ))}
            </ol>
          ) : (
            <p key={i} className="whitespace-pre-wrap">
              <Inline text={b.lines.join('\n')} />
            </p>
          )
        )}
    </div>
  );
}

export function ArticleEditor({ data, isAdmin, categories }: { data: ArticleData | null; isAdmin: boolean; categories: Category[] }) {
  const router = useRouter();
  const isNew = !data;
  const initial = useMemo(
    () => ({
      title: data?.title ?? '',
      problem: data?.problem ?? '',
      solution: data?.solution ?? '',
      categoryId: data?.categoryId ?? '',
      tags: (data?.tags ?? []).join(', '),
      links: data?.links ?? []
    }),
    [data]
  );
  const [form, setForm] = useState(initial);
  const [editing, setEditing] = useState(isAdmin && (isNew || data.status !== 'publicada'));
  const [instruction, setInstruction] = useState('');
  const { run, pending, msg } = useRun();

  useEffect(() => setForm(initial), [initial]);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const input = () => ({ title: form.title, problem: form.problem, solution: form.solution, categoryId: form.categoryId || null, tags: form.tags, links: form.links.filter((l) => l.url.trim()) });
  const save = (publish: boolean) =>
    run(
      async () => {
        const r = await saveArticleAction(data?.id ?? null, input(), publish);
        if (r.ok && isNew) router.replace(`/dashboard/conocimiento/${r.id}`);
        return r;
      },
      publish ? 'Publicada.' : 'Guardada.',
      () => publish && setEditing(false)
    );
  const status = (s: KbStatus, ok: string) => run(() => setArticleStatusAction(data!.id, s), ok);
  const category = categories.find((c) => c.id === (data?.categoryId ?? ''))?.name;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/dashboard/conocimiento" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Conocimiento
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{isNew ? 'Nueva entrada' : data.title}</h1>
          {!isNew && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge tone={STATUS_TONE[data.status] ?? 'neutral'}>{KB_STATUS_LABEL[data.status as KbStatus] ?? data.status}</Badge>
              {category && <Badge tone="brand">{category}</Badge>}
              {data.sourceType !== 'manual' && <span>{KB_SOURCE_LABEL[data.sourceType as KbSource] ?? data.sourceType}</span>}
              {data.requestedByName && <span>Propuesta por {data.requestedByName}</span>}
              <span>Actualizada el {fmt(data.updatedAt)}</span>
              {data.reviewedAt && <span>Revisada el {fmt(data.reviewedAt)}</span>}
              {data.timesUsed > 0 && <span>Usada {data.timesUsed} {data.timesUsed === 1 ? 'vez' : 'veces'}</span>}
            </div>
          )}
        </div>
        {isAdmin && !isNew && !editing && (
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            Editar
          </Button>
        )}
      </div>

      {data?.needsReview && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning-strong">
          <AlertTriangle className="size-4" aria-hidden />
          Lleva más de un año sin revisar: comprueba que sigue siendo válida.
          {isAdmin && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => markReviewedAction(data.id), 'Marcada como revisada.')}>
              Sigue siendo válida
            </Button>
          )}
        </div>
      )}

      {/* Propuesta: lo que escribió la persona y pedir cambios a la IA */}
      {isAdmin && data && data.status !== 'publicada' && data.status !== 'archivada' && (data.requestText || data.status === 'propuesta') && (
        <section className="space-y-3 rounded-xl border border-brand/30 bg-brand-soft/40 p-4" aria-labelledby="h-solicitud">
          <h2 id="h-solicitud" className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-brand" aria-hidden />
            {data.requestText ? `Texto original${data.requestedByName ? ` de ${data.requestedByName}` : ''}` : 'Revisión'}
          </h2>
          {data.requestText && <RichText text={data.requestText} className="rounded-lg bg-card p-3 text-muted-foreground" />}
          <label className="block space-y-1">
            <span className="text-sm font-medium">Pedir cambios a la IA</span>
            <textarea className={cn(areaClass, 'min-h-20')} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Ej.: añade que primero hay que hacer copia de seguridad, y quita lo del plugin antiguo" maxLength={2000} />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button className={brandBtn} disabled={pending || !instruction.trim() || dirty} onClick={() => run(() => reviseArticleAction(data.id, instruction), 'Hecho: la IA ha rehecho la entrada.', () => setInstruction(''))}>
              <Wand2 aria-hidden />
              {pending ? 'Rehaciendo…' : 'Rehacer con mis cambios'}
            </Button>
            {data.requestText && (
              <Button variant="outline" disabled={pending || dirty} onClick={() => run(() => redraftArticleAction(data.id), 'Redactada de nuevo.')}>
                <RotateCcw aria-hidden />
                Volver a redactar desde el original
              </Button>
            )}
            {dirty && <span className="text-xs text-muted-foreground">Guarda o descarta tus cambios antes de pedírselos a la IA.</span>}
          </div>
          {data.editNotes.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Cambios pedidos hasta ahora ({data.editNotes.length})</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {data.editNotes.map((n, i) => (
                  <li key={i}>
                    {fmt(n.at)}: {n.instruction}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {editing ? (
        <section className="space-y-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5" aria-label="Editar entrada">
          <label className="block space-y-1">
            <span className="text-sm font-medium">
              Título <span className="text-destructive">*</span>
            </span>
            <Input value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={255} placeholder="Cómo lo buscaría alguien con la duda" required />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">
              Problema o pregunta <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
            </span>
            <textarea className={cn(areaClass, 'min-h-16')} value={form.problem} onChange={(e) => set('problem', e.target.value)} maxLength={4000} placeholder="El síntoma o la duda, como lo viviría alguien del equipo" />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">
              Solución <span className="text-destructive">*</span> <span className="text-xs font-normal text-muted-foreground">(necesaria para publicar)</span>
            </span>
            <textarea className={cn(areaClass, 'min-h-64 font-mono text-[13px]')} value={form.solution} onChange={(e) => set('solution', e.target.value)} maxLength={20000} placeholder={'1. Primer paso…\n2. Segundo paso…'} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm font-medium">Categoría</span>
              <select className={cn(selectClass, 'w-full')} value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                <option value="">Sin categoría</option>
                {categories
                  .filter((c) => !c.archived || c.id === form.categoryId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">
                Etiquetas <span className="text-xs font-normal text-muted-foreground">(separadas por comas)</span>
              </span>
              <Input value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="wordpress, rank math, redirecciones" />
            </label>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Enlaces y vídeos</legend>
            {form.links.map((l, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input className="min-w-40 flex-1" value={l.title} onChange={(e) => set('links', form.links.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="Título (p. ej. Vídeo: paso a paso)" aria-label={`Título del enlace ${i + 1}`} />
                <Input className="min-w-56 flex-[2]" value={l.url} onChange={(e) => set('links', form.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://…" type="url" aria-label={`Dirección del enlace ${i + 1}`} />
                <Button size="sm" variant="ghost" onClick={() => set('links', form.links.filter((_, j) => j !== i))} aria-label={`Quitar enlace ${i + 1}`}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => set('links', [...form.links, { title: '', url: '' }])}>
              <Plus aria-hidden />
              Añadir enlace
            </Button>
            <p className="text-xs text-muted-foreground">Vale cualquier enlace: clip de ClickUp, Loom, Google Drive o YouTube oculto. Nunca contraseñas.</p>
          </fieldset>

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button className={brandBtn} disabled={pending || !form.title.trim() || !form.solution.trim()} onClick={() => save(true)}>
              <CheckCircle2 aria-hidden />
              {data?.status === 'publicada' ? 'Guardar cambios' : 'Guardar y publicar'}
            </Button>
            {data?.status !== 'publicada' && (
              <Button variant="outline" disabled={pending || !form.title.trim()} onClick={() => save(false)}>
                <Save aria-hidden />
                {isNew ? 'Guardar como borrador' : 'Guardar sin publicar'}
              </Button>
            )}
            {!isNew && (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setForm(initial);
                  if (data.status === 'publicada') setEditing(false);
                }}
              >
                {dirty ? 'Descartar cambios' : 'Cancelar'}
              </Button>
            )}
            {isNew && (
              <Button asChild variant="ghost">
                <Link href="/dashboard/conocimiento">Cancelar</Link>
              </Button>
            )}
            {dirty && <span className="text-xs text-warning-strong">Cambios sin guardar</span>}
            <MsgLine msg={msg} />
          </div>
        </section>
      ) : (
        data && (
          <article className="space-y-5 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
            {data.problem && (
              <section>
                <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Problema</h2>
                <RichText text={data.problem} />
              </section>
            )}
            <section>
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Solución</h2>
              {data.solution ? <RichText text={data.solution} /> : <p className="text-sm text-muted-foreground">Sin solución todavía.</p>}
            </section>
            {data.links.length > 0 && (
              <section>
                <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Enlaces y vídeos</h2>
                <ul className="space-y-1">
                  {data.links.map((l) => (
                    <li key={l.url}>
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-brand hover:underline">
                        <ExternalLink className="size-3.5" aria-hidden />
                        {l.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {data.tags.length > 0 && (
              <p className="flex flex-wrap gap-1.5 text-xs">
                {data.tags.map((t) => (
                  <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                    {t}
                  </span>
                ))}
              </p>
            )}
            {!isAdmin && <p className="border-t pt-3 text-xs text-muted-foreground">¿Falta algo o está desactualizada? Propón una entrada nueva desde Conocimiento y Enric la revisa.</p>}
          </article>
        )
      )}

      {/* Estado y borrar (solo admin, entradas existentes) */}
      {isAdmin && data && (
        <section className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm shadow-xs" aria-label="Estado de la entrada">
          <span className="text-muted-foreground">Estado:</span>
          {data.status !== 'publicada' && !editing && (
            <Button size="sm" className={brandBtn} disabled={pending || !data.solution.trim()} onClick={() => status('publicada', 'Publicada.')}>
              <CheckCircle2 aria-hidden />
              Publicar
            </Button>
          )}
          {data.status !== 'mas_tarde' && data.status !== 'publicada' && (
            <Button size="sm" variant="outline" disabled={pending || dirty} onClick={() => status('mas_tarde', 'Guardada en «Para más tarde».')}>
              <Clock aria-hidden />
              Para más tarde
            </Button>
          )}
          {data.status === 'publicada' && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => status('borrador', 'Retirada: vuelve a borrador.')}>
              Retirar (pasar a borrador)
            </Button>
          )}
          {data.status !== 'archivada' ? (
            <Button size="sm" variant="ghost" disabled={pending || dirty} onClick={() => status('archivada', 'Archivada.')}>
              <Archive aria-hidden />
              Archivar
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => status('borrador', 'Recuperada como borrador.')}>
              <RotateCcw aria-hidden />
              Recuperar
            </Button>
          )}
          {data.sourceUrl && (
            <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand hover:underline">
              <ExternalLink className="size-3" aria-hidden />
              Original
            </a>
          )}
          <span className="ml-auto">
            <ConfirmDelete what="esta entrada" disabled={pending} onConfirm={() => run(() => deleteArticleAction(data.id), 'Eliminada.', () => router.push('/dashboard/conocimiento'))} />
          </span>
          {!editing && <MsgLine msg={msg} />}
        </section>
      )}
    </div>
  );
}
