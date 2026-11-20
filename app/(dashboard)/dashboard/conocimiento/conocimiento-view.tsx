'use client';

// Lista de la base de conocimiento: pestañas por estado (las que no son «Publicadas», solo para admin), buscador
// (por significado y por palabras), proponer una entrada (todo el equipo), categorías e importación de ClickUp (admin).
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { AlertTriangle, Archive, ChevronRight, Clock, Download, FileText, Inbox, Lightbulb, Link2, Plus, Search, Send, Settings2, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { KB_SOURCE_LABEL, KB_STATUS_LABEL, type KbSource, type KbStatus } from '@/lib/core/knowledge-rules';
import { archiveCategoryAction, saveCategoryAction, submitRequestAction } from '@/lib/core/knowledge-actions';
import { importKnowledgeAction } from '@/lib/operaciones/kb-import-actions';
import { areaClass, brandBtn, MsgLine, selectClass, useRun, type Msg } from '../clientes/ui';

export type ArticleRow = {
  id: string;
  title: string;
  problem: string;
  status: string;
  sourceType: string;
  category: string | null;
  tags: string[];
  requestedByName: string | null;
  timesUsed: number;
  helpful: number;
  notHelpful: number;
  linkCount: number;
  updatedAt: string;
  needsReview: boolean;
};
type Category = { id: string; name: string; archived: boolean };
type Space = { id: string; name: string; suggested: boolean };

const TABS: { key: KbStatus; icon: typeof FileText; hint: string }[] = [
  { key: 'publicada', icon: FileText, hint: 'Las que usan el equipo y los agentes.' },
  { key: 'propuesta', icon: Inbox, hint: 'Solicitudes del equipo y dictados ya redactados por la IA: publícalas, cámbialas o déjalas para más tarde.' },
  { key: 'mas_tarde', icon: Clock, hint: 'Tu cola para las horas de conocimiento: lo que dejaste para más tarde y lo importado de ClickUp.' },
  { key: 'borrador', icon: FileText, hint: 'Entradas que estás escribiendo.' },
  { key: 'archivada', icon: Archive, hint: 'Descartadas o retiradas. No las usa nadie; se pueden recuperar.' }
];

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

export function ConocimientoView({
  isAdmin,
  status,
  q,
  categoryId,
  counts,
  rows,
  categories,
  spaces,
  importedCount
}: {
  importedCount: number;
  isAdmin: boolean;
  status: KbStatus;
  q: string;
  categoryId: string;
  counts: Record<KbStatus, number>;
  rows: ArticleRow[];
  categories: Category[];
  spaces: Space[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(q);
  const [panel, setPanel] = useState<'proponer' | 'importar' | 'categorias' | null>(null);
  const [searching, startSearch] = useTransition();

  const go = (params: { estado?: string; q?: string; cat?: string }) => {
    const p = new URLSearchParams();
    const estado = params.estado ?? status;
    if (estado !== 'publicada') p.set('estado', estado);
    const qq = params.q ?? query;
    if (qq.trim()) p.set('q', qq.trim());
    const cat = params.cat ?? categoryId;
    if (cat) p.set('cat', cat);
    startSearch(() => router.replace(`${pathname}${p.size ? `?${p.toString()}` : ''}`, { scroll: false }));
  };

  const visibleTabs = isAdmin ? TABS : TABS.filter((t) => t.key === 'publicada');
  const tab = TABS.find((t) => t.key === status)!;
  const activeCats = categories.filter((c) => !c.archived);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button className={brandBtn} onClick={() => setPanel(panel === 'proponer' ? null : 'proponer')} aria-expanded={panel === 'proponer'}>
          <Lightbulb aria-hidden />
          Proponer una entrada
        </Button>
        {isAdmin && (
          <>
            <Button asChild variant="outline">
              <Link href="/dashboard/conocimiento/nueva">
                <Plus aria-hidden />
                Nueva entrada
              </Link>
            </Button>
            <Button variant={importedCount ? 'ghost' : 'outline'} onClick={() => setPanel(panel === 'importar' ? null : 'importar')} aria-expanded={panel === 'importar'}>
              <Download aria-hidden />
              {importedCount ? 'ClickUp (ya importado)' : 'Importar de ClickUp'}
            </Button>
            <Button variant="ghost" onClick={() => setPanel(panel === 'categorias' ? null : 'categorias')} aria-expanded={panel === 'categorias'}>
              <Settings2 aria-hidden />
              Categorías
            </Button>
          </>
        )}
      </div>

      {panel === 'proponer' && <ProposePanel isAdmin={isAdmin} onClose={() => setPanel(null)} />}
      {panel === 'importar' && isAdmin && <ImportPanel spaces={spaces} importedCount={importedCount} onClose={() => setPanel(null)} />}
      {panel === 'categorias' && isAdmin && <CategoriesPanel categories={categories} onClose={() => setPanel(null)} />}

      {visibleTabs.length > 1 && (
        <div role="tablist" aria-label="Estado de las entradas" className="flex gap-1 overflow-x-auto border-b">
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={t.key === status}
              onClick={() => go({ estado: t.key })}
              className={cn(
                '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap',
                t.key === status ? 'border-brand font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <t.icon className="size-4" aria-hidden />
              {KB_STATUS_LABEL[t.key]}
              <span className={cn('rounded-full px-1.5 text-xs tabular-nums', t.key === 'propuesta' && counts.propuesta > 0 ? 'bg-brand text-white' : 'bg-muted')}>{counts[t.key]}</span>
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{tab.hint}</p>

      <form
        role="search"
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: query });
        }}
      >
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Busca como lo preguntarías: «cómo redirigir una URL»" aria-label="Buscar en la base de conocimiento" className="pl-8" />
        </div>
        <select aria-label="Categoría" className={selectClass} value={categoryId} onChange={(e) => go({ cat: e.target.value })}>
          <option value="">Todas las categorías</option>
          {activeCats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" disabled={searching}>
          Buscar
        </Button>
        {(q || categoryId) && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setQuery('');
              go({ q: '', cat: '' });
            }}
          >
            <X aria-hidden />
            Quitar filtros
          </Button>
        )}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={q ? Search : tab.icon}
          title={q ? 'No hay nada que se parezca a eso' : status === 'publicada' ? 'Todavía no hay entradas publicadas' : `No hay entradas en «${KB_STATUS_LABEL[status]}»`}
          description={
            q
              ? 'Prueba con otras palabras o propón una entrada para que quede en la base.'
              : status === 'publicada'
                ? isAdmin
                  ? 'Escribe la primera, importa lo que tienes en ClickUp o publica las propuestas del equipo.'
                  : 'Si sabes resolver algo que a otros les sirva, propónlo: Enric lo revisa y lo publica.'
                : status === 'propuesta'
                  ? 'Cuando alguien del equipo proponga una entrada o la dictes por Telegram, aparecerá aquí ya redactada.'
                  : status === 'mas_tarde'
                    ? 'Lo que dejes para más tarde y lo importado de ClickUp aparecerá aquí.'
                    : undefined
          }
          action={
            !q && status === 'publicada' ? (
              <Button className={brandBtn} onClick={() => setPanel('proponer')}>
                <Lightbulb aria-hidden />
                Proponer una entrada
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/dashboard/conocimiento/${r.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.title}</span>
                    {r.category && <Badge tone="brand">{r.category}</Badge>}
                    {r.needsReview && (
                      <Badge tone="warning">
                        <AlertTriangle aria-hidden />
                        Revisar (más de un año)
                      </Badge>
                    )}
                  </div>
                  {r.problem && <p className="line-clamp-2 text-sm text-muted-foreground">{r.problem}</p>}
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {r.sourceType !== 'manual' && <span>{KB_SOURCE_LABEL[r.sourceType as KbSource] ?? r.sourceType}</span>}
                    {r.requestedByName && <span>Propuesta por {r.requestedByName}</span>}
                    {r.linkCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Link2 className="size-3" aria-hidden />
                        {r.linkCount} {r.linkCount === 1 ? 'enlace' : 'enlaces'}
                      </span>
                    )}
                    {r.timesUsed > 0 && <span>Usada {r.timesUsed} {r.timesUsed === 1 ? 'vez' : 'veces'}</span>}
                    {r.helpful + r.notHelpful > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <ThumbsUp className="size-3" aria-label="Le sirvió" />
                        {r.helpful}
                        <ThumbsDown className="ml-1 size-3" aria-label="No le sirvió" />
                        {r.notHelpful}
                      </span>
                    )}
                    <span>Actualizada el {fmtDate(r.updatedAt)}</span>
                    {r.tags.slice(0, 4).map((t) => (
                      <span key={t} className="rounded bg-muted px-1.5">
                        {t}
                      </span>
                    ))}
                  </p>
                </div>
                <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PanelBox({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 shadow-xs" aria-label={title}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Cerrar">
          <X aria-hidden />
        </Button>
      </div>
      {children}
    </section>
  );
}

function ProposePanel({ isAdmin, onClose }: { isAdmin: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [done, setDone] = useState<Msg>(null);
  const { run, pending, msg } = useRun();
  return (
    <PanelBox title="Proponer una entrada" onClose={onClose}>
      <p className="text-sm text-muted-foreground text-pretty">
        Cuéntalo con tus palabras: qué problema o duda es y cómo se resuelve. La IA lo ordena y {isAdmin ? 'te llega' : 'le llega a Enric'} por Telegram para revisarlo antes de publicarlo.
      </p>
      <label className="block space-y-1">
        <span className="text-sm font-medium">
          Qué sabes resolver <span className="text-destructive">*</span>
        </span>
        <textarea
          className={cn(areaClass, 'min-h-32')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ej.: cuando un cliente con Elementor dice que el formulario no envía correos, hay que revisar primero el SMTP en WP Mail SMTP…"
          maxLength={8000}
          required
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">
          Enlace a un vídeo o documento <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
        </span>
        <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" type="url" />
      </label>
      <p className="text-xs text-muted-foreground">Nunca escribas contraseñas: solo dónde están los accesos.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className={brandBtn}
          disabled={pending || text.trim().length < 10}
          onClick={() =>
            run(
              async () => {
                const r = await submitRequestAction({ text, links: link.trim() ? [{ title: '', url: link.trim() }] : [] });
                if (r.ok) setDone({ type: 'ok', text: r.drafted ? 'Enviada. La IA la ha redactado y está pendiente de revisión.' : 'Enviada. Queda pendiente de revisión.' });
                return r;
              },
              'Enviada.',
              () => {
                setText('');
                setLink('');
              }
            )
          }
        >
          <Send aria-hidden />
          {pending ? 'Enviando… (la IA la está redactando)' : 'Enviar propuesta'}
        </Button>
        <MsgLine msg={done ?? msg} />
      </div>
    </PanelBox>
  );
}

function ImportPanel({ spaces, importedCount, onClose }: { spaces: Space[]; importedCount: number; onClose: () => void }) {
  const [spaceId, setSpaceId] = useState(spaces.find((s) => s.suggested)?.id ?? spaces[0]?.id ?? '');
  const [result, setResult] = useState<string | null>(null);
  const { run, pending, msg } = useRun();
  return (
    <PanelBox title="Importar de ClickUp (una sola vez)" onClose={onClose}>
      {importedCount > 0 && (
        <p className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
          Ya importado: {importedCount} {importedCount === 1 ? 'entrada vino' : 'entradas vinieron'} de ClickUp. Desde ahora el conocimiento se gestiona aquí; no hace falta escribir nada en ClickUp. Volver a importar solo traería lo que falte.
        </p>
      )}
      <p className="text-sm text-muted-foreground text-pretty">
        Trae a «Para más tarde» las tareas del espacio que tienen contenido (descripción, o vídeos y archivos adjuntos), para revisarlas por tandas; las vacías no entran. Cada entrada guarda el enlace a la tarea original. Los vídeos alojados en ClickUp quedan marcados para pasarlos a Google Drive al revisarlos. Lo ya importado no se duplica, y lo que parezca llevar una contraseña no entra.
      </p>
      {spaces.length === 0 ? (
        <p className="text-sm">No hay espacios de ClickUp en la caché. Conecta ClickUp en Sistema → ClickUp.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Espacio de ClickUp" className={selectClass} value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Button
            className={brandBtn}
            disabled={pending || !spaceId}
            onClick={() =>
              run(
                async () => {
                  const r = await importKnowledgeAction(spaceId);
                  if (r.ok)
                    setResult(
                      `${r.found} tareas en ClickUp: ${r.imported} importadas${r.existing ? `, ${r.existing} ya estaban` : ''}${r.empty ? `, ${r.empty} vacías (no entran)` : ''}${r.withSecrets ? `, ${r.withSecrets} no entran porque parecen llevar contraseñas (revísalas en ClickUp)` : ''}.${r.withClickUpFiles ? ` ${r.withClickUpFiles} tienen vídeos o archivos alojados en ClickUp (etiqueta «vídeo en clickup»).` : ''} ${r.requests} ${r.requests === 1 ? 'petición' : 'peticiones'} a ClickUp.${r.truncated ? ' Había más de 3.000 tareas: vuelve a importar para traer el resto.' : ''}`
                    );
                  return r;
                },
                'Importación terminada.'
              )
            }
          >
            <Download aria-hidden />
            {pending ? 'Importando…' : 'Importar'}
          </Button>
          <MsgLine msg={msg} />
        </div>
      )}
      {result && <p className="text-sm">{result}</p>}
    </PanelBox>
  );
}

function CategoriesPanel({ categories, onClose }: { categories: Category[]; onClose: () => void }) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const { run, pending, msg } = useRun();
  return (
    <PanelBox title="Categorías" onClose={onClose}>
      <ul className="divide-y rounded-lg border">
        {categories.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
            {editing?.id === c.id ? (
              <>
                <Input className="h-8 max-w-xs" value={editing.name} onChange={(e) => setEditing({ id: c.id, name: e.target.value })} aria-label="Nombre de la categoría" />
                <Button size="sm" className={brandBtn} disabled={pending} onClick={() => run(() => saveCategoryAction(c.id, editing.name), 'Categoría guardada.', () => setEditing(null))}>
                  Guardar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
              </>
            ) : (
              <>
                <span className={cn('flex-1', c.archived && 'text-muted-foreground line-through')}>{c.name}</span>
                <Button size="sm" variant="ghost" onClick={() => setEditing({ id: c.id, name: c.name })}>
                  Renombrar
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => archiveCategoryAction(c.id, !c.archived), c.archived ? 'Categoría recuperada.' : 'Categoría archivada.')}>
                  {c.archived ? 'Recuperar' : 'Archivar'}
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva categoría" aria-label="Nueva categoría" />
        <Button variant="outline" disabled={pending || !name.trim()} onClick={() => run(() => saveCategoryAction(null, name), 'Categoría añadida.', () => setName(''))}>
          <Plus aria-hidden />
          Añadir
        </Button>
        <MsgLine msg={msg} />
      </div>
      <p className="text-xs text-muted-foreground">Archivar una categoría la oculta de los filtros; sus entradas no se borran.</p>
    </PanelBox>
  );
}
