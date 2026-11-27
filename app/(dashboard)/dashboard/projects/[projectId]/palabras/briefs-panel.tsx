'use client';

// Proyecto → Palabras → Briefs (SEO parte 9a, 27 nov 2026): briefs de contenido hechos con la SERP real. Cada brief se ve
// plegado (búsqueda, estado y nota) y se despliega por secciones; se copia como texto para el redactor o el encargo.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, ChevronRight, ClipboardCopy, FileText, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, Section } from '@/components/ui/page';
import type { BriefView } from '@/lib/seo/contenido/briefs';
import { briefToTaskAction, briefToWordPressAction, markBriefUsedAction, requestBriefAction, retryBriefAction, setBriefStatusAction } from '@/lib/seo/contenido-actions';
import { briefToText, type BriefData } from '@/lib/seo/contenido/brief-text';

const STATUS: Record<string, { label: string; tone: 'neutral' | 'info' | 'success' | 'outline' | 'danger' | 'warning' }> = {
  preparando: { label: 'Preparando…', tone: 'info' },
  borrador: { label: 'Borrador', tone: 'neutral' },
  listo: { label: 'Listo para redactar', tone: 'success' },
  usado: { label: 'Publicado', tone: 'outline' },
  fallido: { label: 'No se pudo preparar', tone: 'danger' },
  archivado: { label: 'Archivado', tone: 'outline' }
};
const INTENT: Record<string, string> = { local: 'local (mapa)', transaccional: 'contratar / comprar', informacional: 'informarse', mixta: 'mixta' };
type Sub = { label: string; sites: number };
type D = { query?: string; related?: string[]; intent?: string | null; pageType?: string | null; volume?: number | null; words?: number | null; subtopics?: Sub[]; questions?: string[]; references?: { url: string; words: number }[]; readable?: number; client?: Record<string, unknown>; target?: string | null; links?: { from: string; anchor: string }[]; score?: { score: number; missing: string[]; wordsLow: boolean; queryInTitle: boolean; queryInH1: boolean; words: number } | null };

const path = (u: string) => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};

const briefText = (b: BriefView) => briefToText(b.keyword, b.data as BriefData);

export function BriefsPanel({ projectId, briefs, canEdit, topics }: { projectId: string; briefs: BriefView[]; canEdit: boolean; topics: { topicKey: string; name: string; url: string | null; query: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [kw, setKw] = useState('');
  const [topic, setTopic] = useState('');
  const [pub, setPub] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const act = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.message ? { type: 'ok', text: r.message } : null) : { type: 'error', text: r.error });
      router.refresh();
    });
  const visible = briefs.filter((b) => b.status !== 'archivado');
  const sel = topics.find((t) => t.topicKey === topic);

  return (
    <Section title="Briefs de contenido" description="Para escribir o mejorar una página: lo que trata la competencia que gana en Google (subtemas, preguntas, extensión), los datos propios del cliente y desde qué páginas enlazarla. Sin IA: sale de la SERP real. Si mejora una página existente, lleva su nota y lo que le falta.">
      {msg && <p role="status" className={msg.type === 'ok' ? 'mb-2 text-sm text-success' : 'mb-2 text-sm text-destructive'}>{msg.text}</p>}
      {canEdit && (
        <form
          className="mb-4 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const keyword = (sel?.query ?? kw).trim();
            if (keyword) act(() => requestBriefAction(projectId, keyword, sel?.topicKey ?? null, sel?.url ?? null));
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">De un tema</span>
            <select value={topic} onChange={(e) => setTopic(e.target.value)} className="h-9 max-w-xs rounded-md border bg-background px-2 text-sm">
              <option value="">— o escribe la búsqueda —</option>
              {topics.slice(0, 200).map((t) => (
                <option key={t.topicKey} value={t.topicKey}>
                  {t.name}
                  {t.url ? '' : ' (sin página)'}
                </option>
              ))}
            </select>
          </label>
          {!sel && <Input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="Búsqueda principal" className="max-w-xs" aria-label="Búsqueda principal del brief" />}
          <Button type="submit" size="sm" disabled={pending || (!sel && kw.trim().length < 3)}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            Preparar brief
          </Button>
        </form>
      )}
      {visible.length ? (
        <div className="flex flex-col gap-2">
          {visible.map((b) => {
            const d = b.data as D;
            const st = STATUS[b.status] ?? { label: b.status, tone: 'outline' as const };
            const isOpen = open === b.id;
            return (
              <div key={b.id} className="rounded-md border">
                <button type="button" className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-sm" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : b.id)}>
                  {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="font-medium">{b.keyword}</span>
                  <Badge tone={st.tone}>{st.label}</Badge>
                  {d.score && <Badge tone={d.score.score >= 70 ? 'success' : d.score.score >= 40 ? 'warning' : 'danger'}>Nota {d.score.score}</Badge>}
                  <span className="text-muted-foreground">{d.target ? path(d.target) : 'página nueva'}</span>
                </button>
                {isOpen && (
                  <div className="flex flex-col gap-3 border-t px-3 py-3 text-sm">
                    {b.error && <p className="text-muted-foreground">{b.error}</p>}
                    {canEdit && b.status === 'fallido' && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => retryBriefAction(projectId, b.id))}>
                          Reintentar
                        </Button>
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => setBriefStatusAction(projectId, b.id, 'archivado'))}>
                          Archivar
                        </Button>
                      </div>
                    )}
                    {b.status !== 'preparando' && b.status !== 'fallido' && (
                      <>
                        <p className="text-muted-foreground">
                          {d.intent ? `Intención: ${INTENT[d.intent] ?? d.intent}. ` : ''}
                          {d.words ? `Extensión orientativa: unas ${d.words} palabras. ` : ''}
                          {d.readable != null ? `${d.readable} webs de la competencia leídas.` : ''}
                        </p>
                        {d.score && (
                          <div className="rounded-md bg-muted/40 p-2">
                            <p className="font-medium">Lo que le falta a la página</p>
                            <ul className="mt-1 list-disc pl-5">
                              {!d.score.queryInTitle && <li>La búsqueda en el título.</li>}
                              {!d.score.queryInH1 && <li>La búsqueda en el H1.</li>}
                              {d.score.wordsLow && <li>Texto escaso ({d.score.words} palabras).</li>}
                              {d.score.missing.slice(0, 10).map((m) => (
                                <li key={m}>Subtema: {m}</li>
                              ))}
                              {!d.score.missing.length && d.score.queryInTitle && d.score.queryInH1 && !d.score.wordsLow && <li>Nada importante: cubre lo que trata la competencia.</li>}
                            </ul>
                          </div>
                        )}
                        <details>
                          <summary className="cursor-pointer font-medium">Subtemas ({d.subtopics?.length ?? 0}) y preguntas ({d.questions?.length ?? 0})</summary>
                          <ul className="mt-1 list-disc pl-5">
                            {(d.subtopics ?? []).map((s) => (
                              <li key={s.label}>
                                {s.label} <span className="text-muted-foreground">({s.sites} webs)</span>
                              </li>
                            ))}
                            {(d.questions ?? []).map((q) => (
                              <li key={q} className="text-muted-foreground">
                                {q}
                              </li>
                            ))}
                          </ul>
                        </details>
                        {(d.links?.length ?? 0) > 0 && (
                          <details>
                            <summary className="cursor-pointer font-medium">Enlazar desde ({d.links!.length} páginas)</summary>
                            <ul className="mt-1 list-disc pl-5">
                              {d.links!.map((l) => (
                                <li key={l.from}>
                                  {path(l.from)} <span className="text-muted-foreground">con «{l.anchor}»</span>
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              void navigator.clipboard?.writeText(briefText(b)).then(() => setCopied(b.id));
                            }}
                          >
                            {copied === b.id ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />}
                            {copied === b.id ? 'Copiado' : 'Copiar como texto'}
                          </Button>
                          {canEdit && (b.status === 'borrador' || b.status === 'listo') && !(b.data as { request?: { ref?: string } }).request?.ref && (
                            <Button size="sm" disabled={pending} onClick={() => act(() => briefToTaskAction(projectId, b.id))} title="Crea el encargo en ClickUp con este brief dentro (lista, responsable y fecha según la ficha del cliente)">
                              Encargar al redactor
                            </Button>
                          )}
                          {(b.data as { request?: { url?: string | null } }).request?.url && (
                            <a href={(b.data as { request: { url: string } }).request.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                              Ver el encargo
                            </a>
                          )}
                          {canEdit && (b.status === 'borrador' || b.status === 'listo') && !b.wpEditUrl && (
                            <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => briefToWordPressAction(projectId, b.id))} title="Crea una entrada NUEVA en borrador en el WordPress del cliente con este esqueleto (hace falta conectar WordPress en la ficha del cliente). Publicarla lo hace una persona.">
                              Crear borrador en WordPress
                            </Button>
                          )}
                          {b.wpEditUrl && (
                            <a href={b.wpEditUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                              Abrir el borrador en WordPress
                            </a>
                          )}
                          {canEdit && b.status === 'borrador' && (
                            <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => setBriefStatusAction(projectId, b.id, 'listo'))}>
                              Marcar listo
                            </Button>
                          )}
                          {canEdit && (b.status === 'borrador' || b.status === 'listo') && (
                            <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => setBriefStatusAction(projectId, b.id, 'archivado'))}>
                              Archivar
                            </Button>
                          )}
                        </div>
                        {canEdit && (b.status === 'borrador' || b.status === 'listo') && (
                          <form
                            className="flex flex-wrap gap-2"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const u = (pub[b.id] ?? '').trim();
                              if (u) act(() => markBriefUsedAction(projectId, b.id, u));
                            }}
                          >
                            <Input value={pub[b.id] ?? d.target ?? ''} onChange={(e) => setPub({ ...pub, [b.id]: e.target.value })} placeholder="URL publicada" className="max-w-md" aria-label="URL publicada" />
                            <Button type="submit" size="sm" disabled={pending}>
                              Ya está publicada
                            </Button>
                          </form>
                        )}
                        {b.publishedUrl && <p className="text-muted-foreground">Publicada en {b.publishedUrl}: se medirá si funcionó (Plan → Resultados).</p>}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Aún no hay briefs. Elige un tema (o escribe una búsqueda) y pulsa «Preparar brief».</p>
      )}
    </Section>
  );
}
