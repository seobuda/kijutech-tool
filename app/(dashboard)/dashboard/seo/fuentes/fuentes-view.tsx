'use client';

// SEO → Fuentes de novedades: lista por nivel con su estado (última lectura, error, publicaciones guardadas) y, para
// administradores, añadir (comprobando antes que se lee), renombrar, cambiar el nivel, pausar y quitar.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, FlaskConical, Loader2, Pause, Play, Plus, RefreshCw, Search, Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Section } from '@/components/ui/page';
import type { SeoSourceRow } from '@/lib/db/schema';
import { KIND_LABEL, LEVEL_LABEL, type SourceKind, type SourceLevel } from '@/lib/seo/id/fuentes-rules';
import { addSourceAction, deleteSourceAction, investigateNowAction, previewSourceAction, readSourcesNowAction, updateSourceAction } from '@/lib/seo/fuentes-actions';

type Res = { ok: true; message?: string } | { ok: false; error: string };
const LEVELS: SourceLevel[] = ['oficial', 'reputada', 'comunidad'];
const LEVEL_HELP: Record<SourceLevel, string> = {
  oficial: 'Lo publica Google, Bing u otro buscador: avisa de actualizaciones y va al resumen semanal.',
  reputada: 'Blogs y canales de herramientas o medios SEO de referencia: opinión informada, se guarda aparte.',
  comunidad: 'Opiniones, foros o creadores: rumor hasta que se confirme, se guarda aparte.'
};
const fmt = (d: string | null) => (d ? new Date(d).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'nunca');

function useRun() {
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
  return { pending, msg, run, setMsg };
}

function AddSource() {
  const { pending, msg, run, setMsg } = useRun();
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [level, setLevel] = useState<SourceLevel>('reputada');
  const [preview, setPreview] = useState<{ kind: string; feedUrl: string; title: string | null; items: number; sample: string[] } | null>(null);
  const [checking, startCheck] = useTransition();
  const check = () =>
    startCheck(async () => {
      setMsg(null);
      setPreview(null);
      const r = await previewSourceAction(url);
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setPreview(r);
      if (!label.trim() && r.title) setLabel(r.title);
    });
  return (
    <Section title="Añadir una fuente" description="Pega la dirección de un blog o web (se busca su RSS), de un RSS o Atom, o de un canal de YouTube (…/@nombre). Se comprueba que se puede leer antes de añadirla. Redes como X o LinkedIn y los boletines por correo no se pueden leer así.">
      <div className="flex flex-col gap-3 p-5">
        <div className="flex flex-col gap-2 md:flex-row">
          <label className="flex-1 text-sm">
            Dirección <span className="text-destructive">*</span>
            <input value={url} onChange={(e) => (setUrl(e.target.value), setPreview(null))} maxLength={500} placeholder="https://ahrefs.com/blog/ o https://www.youtube.com/@canal" className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" />
          </label>
          <div className="flex items-end">
            <Button size="sm" variant="outline" disabled={checking || url.trim().length < 4} onClick={check}>
              {checking ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Comprobar
            </Button>
          </div>
        </div>
        {preview && (
          <div className="rounded-md border p-3 text-sm">
            <p className="flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="size-4 text-success" aria-hidden /> Se puede leer: {KIND_LABEL[preview.kind as SourceKind] ?? preview.kind} con {preview.items} publicaciones
            </p>
            <p className="mt-1 break-all text-xs text-muted-foreground">{preview.feedUrl}</p>
            {preview.sample.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                {preview.sample.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2 md:flex-row">
          <label className="flex-1 text-sm">
            Nombre <span className="text-muted-foreground">(opcional: si no, el del propio feed)</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={160} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" />
          </label>
          <label className="text-sm md:w-56">
            Nivel
            <select value={level} onChange={(e) => setLevel(e.target.value as SourceLevel)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm">
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABEL[l]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs text-muted-foreground">{LEVEL_HELP[level]}</p>
        <div>
          <Button size="sm" disabled={pending || url.trim().length < 4} onClick={() => run(() => addSourceAction({ url, label, level }), () => (setUrl(''), setLabel(''), setPreview(null)))}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Añadir fuente
          </Button>
        </div>
        {msg && <p role="status" className={msg.ok ? 'text-sm text-success' : 'text-sm text-destructive'}>{msg.text}</p>}
      </div>
    </Section>
  );
}

function SourceRow({ s, canEdit }: { s: SeoSourceRow; canEdit: boolean }) {
  const { pending, msg, run } = useRun();
  const [label, setLabel] = useState(s.label);
  const [confirming, setConfirming] = useState(false);
  const failing = Boolean(s.lastError);
  return (
    <li className="flex flex-col gap-1.5 px-5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {canEdit ? (
          <input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => label.trim() !== s.label && run(() => updateSourceAction(s.id, { label }))} maxLength={160} aria-label="Nombre de la fuente" className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm font-medium md:max-w-sm" />
        ) : (
          <span className="font-medium">{s.label}</span>
        )}
        <Badge tone="neutral">{KIND_LABEL[s.kind as SourceKind] ?? s.kind}</Badge>
        {!s.active && <Badge tone="warning">En pausa</Badge>}
        {s.builtin && <span className="text-xs text-muted-foreground">de serie</span>}
      </div>
      <a href={s.inputUrl} target="_blank" rel="noreferrer" className="break-all text-xs text-muted-foreground underline-offset-2 hover:underline">
        {s.inputUrl}
      </a>
      <p className={failing ? 'flex items-center gap-1 text-xs text-destructive' : 'text-xs text-muted-foreground'}>
        {failing && <TriangleAlert className="size-3.5" aria-hidden />}
        Última lectura: {fmt(s.lastCheckedAt as unknown as string | null)}
        {failing ? ` · falló: ${s.lastError}` : s.lastOkAt ? ' · bien' : ''} · {s.itemsTotal} publicaciones guardadas
      </p>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <select value={s.level} disabled={pending} onChange={(e) => run(() => updateSourceAction(s.id, { level: e.target.value as SourceLevel }))} aria-label="Nivel de la fuente" className="h-8 rounded-md border bg-background px-2 text-xs">
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABEL[l]}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => updateSourceAction(s.id, { active: !s.active }))}>
            {s.active ? <Pause className="size-4" /> : <Play className="size-4" />} {s.active ? 'Pausar' : 'Reanudar'}
          </Button>
          {!s.builtin &&
            (confirming ? (
              <>
                <span className="text-xs">¿Quitarla? Lo ya leído se queda en Novedades.</span>
                <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(() => deleteSourceAction(s.id))}>
                  Sí, quitar
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>
                  No
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirming(true)}>
                <Trash2 className="size-4" /> Quitar
              </Button>
            ))}
        </div>
      )}
      {msg && <p role="status" className={msg.ok ? 'text-xs text-success' : 'text-xs text-destructive'}>{msg.text}</p>}
    </li>
  );
}

type Investigation = { at: string | null; result: Record<string, unknown> | null; error: string | null };

function Investigator({ inv, canEdit }: { inv: Investigation; canEdit: boolean }) {
  const { pending, msg, run } = useRun();
  const r = inv.result ?? {};
  const n = (k: string) => (typeof r[k] === 'number' ? (r[k] as number) : 0);
  return (
    <Section
      title={
        <span className="flex items-center gap-1.5">
          <FlaskConical className="size-4" aria-hidden /> Investigador del Jefe SEO
        </span>
      }
      description="Cada 3 días, y solo si hay novedades: el código aparta lo que no tiene que ver con nuestro trabajo (sin coste), Sonnet 5.5 dice qué cambia, en qué líneas y a qué clientes afecta, y lo importante (como mucho 3) te llega como propuesta de entrada en Conocimiento, con fecha, nivel (oficial, reputada o rumor) y enlaces. Una opinión nunca pasa por oficial. La lectura gasta del tope del Jefe SEO; la redacción de cada propuesta, de la IA de la base."
    >
      <div className="flex flex-col gap-2 p-5 text-sm">
        <p>
          {inv.at ? `Última pasada: ${fmt(inv.at)}. ` : 'Aún no ha pasado. '}
          {inv.result && `${n('leidas')} novedades nuevas, ${n('pertinentes')} pertinentes, ${n('propuestas')} propuesta(s) a la base.`}
          {inv.result && typeof r.motivo === 'string' ? ` (${r.motivo})` : ''}
        </p>
        {inv.error && <p className="text-destructive">La última pasada falló: {inv.error}</p>}
        {canEdit && (
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => investigateNowAction())}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />} Investigar ahora
            </Button>
            {msg && <p role="status" className={msg.ok ? 'text-sm text-success' : 'text-sm text-destructive'}>{msg.text}</p>}
          </div>
        )}
      </div>
    </Section>
  );
}

export function FuentesView({ sources, canEdit, investigation }: { sources: SeoSourceRow[]; canEdit: boolean; investigation: Investigation }) {
  const { pending, msg, run } = useRun();
  return (
    <div className="flex flex-col gap-4">
      <Investigator inv={investigation} canEdit={canEdit} />
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => readSourcesNowAction())}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Leer ahora
          </Button>
          {msg && <p role="status" className={msg.ok ? 'text-sm text-success' : 'text-sm text-destructive'}>{msg.text}</p>}
        </div>
      )}
      {LEVELS.map((level) => {
        const list = sources.filter((s) => s.level === level);
        if (!list.length) return null;
        return (
          <Section key={level} title={`${LEVEL_LABEL[level]} · ${list.length}`} description={LEVEL_HELP[level]}>
            <ul className="divide-y">
              {list.map((s) => (
                <SourceRow key={s.id} s={s} canEdit={canEdit} />
              ))}
            </ul>
          </Section>
        );
      })}
      {canEdit && <AddSource />}
    </div>
  );
}
