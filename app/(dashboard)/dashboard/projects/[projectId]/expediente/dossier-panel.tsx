'use client';

// Proyecto → Expediente: parte interactiva (recoger datos, confirmar o descartar cada uno, escribir el correcto y pasar
// el tipo de negocio o el logo a la ficha del cliente). Mientras se recogen los datos, se refresca sola.
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Mail, Pencil, RefreshCw, RotateCcw, ShieldCheck, ShieldQuestion, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState, Section } from '@/components/ui/page';
import type { DossierFactView, DossierView } from '@/lib/seo/expediente/view';
import { ATENCION_OPTIONS, display } from '@/lib/seo/expediente/rules';
import { applyFactToFichaAction, collectDossierAction, decideDossierFactAction, savePersonaFactAction } from '@/lib/seo/expediente-actions';
import type { dossierQuestionsSummary } from '@/lib/seo/preguntas/preguntas';

type DossierQuestionsSummary = Awaited<ReturnType<typeof dossierQuestionsSummary>>;

const SOURCE: Record<string, string> = { ficha: 'Ficha', web: 'Web', places: 'Google Maps', wayback: 'Archivo de Internet', gsc: 'Search Console', busqueda: 'Búsqueda', persona: 'Persona', ia: 'IA', cliente: 'Respuesta del cliente' };
const STATUS: Record<string, { label: string; tone: 'success' | 'neutral' | 'warning' }> = {
  confirmado: { label: 'Confirmado', tone: 'success' },
  provisional: { label: 'Provisional', tone: 'warning' },
  descartado: { label: 'Descartado', tone: 'neutral' }
};
const EDITABLE = new Set(['nombre', 'negocio', 'web', 'telefono', 'tipo_negocio', 'perfiles', 'logo', 'servicios', 'zona', 'publico', 'atencion', 'idiomas']);
const TO_FICHA = new Set(['tipo_negocio', 'logo', 'servicios', 'zona', 'negocio', 'publico']);
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—');

function valueText(field: string, v: unknown, types: { value: string; label: string }[]): string {
  if (field === 'tipo_negocio' && typeof v === 'string') return types.find((t) => t.value === v)?.label ?? v;
  if (field === 'atencion' && typeof v === 'string') return ATENCION_OPTIONS.find((o) => o.value === v)?.label ?? v;
  if (field === 'marca_en_google' && v && typeof v === 'object') {
    const m = v as { busquedas?: number; clics?: number; impresiones?: number; ejemplos?: string[] };
    return `${m.clics ?? 0} clics y ${m.impresiones ?? 0} impresiones en ${m.busquedas ?? 0} búsquedas${m.ejemplos?.length ? ` (p. ej. «${m.ejemplos.slice(0, 3).join('», «')}»)` : ''}`;
  }
  if ((field === 'primera_fecha_web' || field === 'datos_search_console') && typeof v === 'string') return new Date(v).toLocaleDateString('es-ES', { dateStyle: 'long' });
  return display(field, v);
}

export function DossierPanel({ view, canEdit, businessTypes, questions }: { view: DossierView; canEdit: boolean; businessTypes: { value: string; label: string }[]; questions: DossierQuestionsSummary }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!view.collecting && !view.proposing) return;
    const t = setInterval(() => router.refresh(), 8_000);
    return () => clearInterval(t);
  }, [view.collecting, view.proposing, router]);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText?: string) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (!r.ok) setMsg({ type: 'error', text: r.error });
      else if (okText) setMsg({ type: 'ok', text: okText });
      router.refresh();
    });

  if (!view.project.clientId) {
    return (
      <EmptyState
        title="El proyecto no tiene cliente"
        description="El expediente se hace con la ficha del cliente: edita el proyecto y elige el cliente."
        action={
          <Button asChild className="bg-brand text-white hover:bg-brand/90">
            <Link href={`/dashboard/projects/${view.project.id}/edit`}>Editar el proyecto</Link>
          </Button>
        }
      />
    );
  }

  const any = view.fields.some((f) => f.facts.length);
  const collectBtn = canEdit && (
    <Button size="sm" variant="outline" disabled={pending || view.collecting} onClick={() => run(() => collectDossierAction(view.project.id), 'Recogiendo datos: tarda menos de un minuto.')}>
      {view.collecting ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
      {view.collecting ? 'Recogiendo…' : 'Volver a recoger'}
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      {msg && <p className={msg.type === 'error' ? 'text-sm text-destructive' : 'text-sm text-success'}>{msg.text}</p>}

      {!any ? (
        <EmptyState
          title="Aún no hay datos"
          description="Pulsa «Recoger datos»: miramos la ficha, la web, el archivo de Internet y Search Console. También se hace solo al terminar cada auditoría de Salud técnica."
          action={
            canEdit ? (
              <Button className="bg-brand text-white hover:bg-brand/90" disabled={pending || view.collecting} onClick={() => run(() => collectDossierAction(view.project.id), 'Recogiendo datos: tarda menos de un minuto.')}>
                {view.collecting ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                {view.collecting ? 'Recogiendo…' : 'Recoger datos'}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <Section
            title={
              <span className="inline-flex items-center gap-2">
                {view.identity.status === 'identificado' ? <ShieldCheck className="size-4 text-success" /> : <ShieldQuestion className="size-4 text-warning-strong" />}
                {view.identity.status === 'identificado' ? 'Identidad confirmada' : 'Identidad provisional'}
              </span>
            }
            description={`Última actualización: ${fmt(view.lastUpdate)}`}
            actions={collectBtn}
          >
            <p className="text-sm">
              {view.identity.status === 'identificado'
                ? 'Al menos dos señales independientes coinciden con la ficha: sabemos que hablamos del mismo negocio.'
                : 'Hace falta que al menos dos señales (dominio, teléfono, nombre o dirección) coincidan entre la ficha y otra fuente. Completa la ficha o confirma los datos.'}
            </p>
            {view.identity.matches.length > 0 && <p className="mt-2 text-sm text-muted-foreground">Coinciden: {view.identity.matches.join(' · ')}</p>}
            {view.identity.conflicts.length > 0 && (
              <div className="mt-3 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm">
                <p className="font-medium">No cuadra:</p>
                <ul className="mt-1 list-disc pl-5">
                  {view.identity.conflicts.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <Link href={`/dashboard/clientes/${view.project.clientId}`} className="mt-2 inline-block underline underline-offset-2">
                  Abrir la ficha del cliente
                </Link>
              </div>
            )}
          </Section>

          <Section title="Datos del negocio" description="Ordenados por confianza. «Confirmar» fija el dato; si cambia en su origen, vuelve a revisión.">
            <div className="divide-y">
              {view.fields
                .filter((f) => f.facts.length || (canEdit && EDITABLE.has(f.field)))
                .map((f) => (
                  <FieldRow key={f.field} projectId={view.project.id} field={f} canEdit={canEdit} pending={pending} run={run} businessTypes={businessTypes} />
                ))}
            </div>
          </Section>

          <QuestionsSection summary={questions} />
        </>
      )}
    </div>
  );
}

/** Las preguntas al cliente viven en su ficha (25 nov 2026): aquí solo cuántas son del expediente y el enlace. */
function QuestionsSection({ summary }: { summary: DossierQuestionsSummary }) {
  const href = summary.clientId ? `/dashboard/clientes/${summary.clientId}?tab=preguntas` : null;
  const parts = [
    summary.pending ? `${summary.pending} por preguntar` : null,
    summary.sent ? `${summary.sent} enviada(s), esperando respuesta` : null,
    summary.answered ? `${summary.answered} respondida(s)` : null
  ].filter(Boolean);
  return (
    <Section
      title={
        <span className="inline-flex items-center gap-2">
          <Mail className="size-4" />
          Preguntas al cliente
        </span>
      }
      description="Lo que el expediente no ha podido averiguar solo se le pregunta al cliente junto con el resto de sus preguntas (las de sus servicios), desde su ficha. Sus respuestas aparecen aquí arriba como «Respuesta del cliente» para que las confirmes."
      actions={
        href ? (
          <Button asChild size="sm" variant="outline">
            <Link href={href}>Ir a sus preguntas</Link>
          </Button>
        ) : undefined
      }
    >
      <p className="text-sm text-muted-foreground">
        {!summary.clientId
          ? 'El proyecto no tiene cliente: vincúlalo a su ficha para poder preguntarle.'
          : parts.length
            ? `Del expediente: ${parts.join(' · ')}.`
            : 'El expediente no tiene huecos ni datos dudosos: no hay nada que preguntarle por esto.'}
      </p>
    </Section>
  );
}

function FieldRow({
  projectId,
  field,
  canEdit,
  pending,
  run,
  businessTypes
}: {
  projectId: string;
  field: DossierView['fields'][number];
  canEdit: boolean;
  pending: boolean;
  run: (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText?: string) => void;
  businessTypes: { value: string; label: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{field.label}</p>
        {canEdit && EDITABLE.has(field.field) && !editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" />
            Escribir el correcto
          </Button>
        )}
      </div>
      {editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {field.field === 'atencion' ? (
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={text} onChange={(e) => setText(e.target.value)} aria-label="Cómo atiende">
              <option value="">Elige…</option>
              {ATENCION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : field.field === 'tipo_negocio' ? (
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={text} onChange={(e) => setText(e.target.value)}>
              <option value="">Elige…</option>
              {businessTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          ) : (
            <Input className="h-9 max-w-md" value={text} onChange={(e) => setText(e.target.value)} placeholder={field.field === 'perfiles' ? 'URLs separadas por comas' : field.field === 'idiomas' ? 'Códigos: es, ca' : field.field === 'servicios' ? 'Separados por comas' : ''} />
          )}
          <Button
            size="sm"
            className="bg-brand text-white hover:bg-brand/90"
            disabled={pending || !text.trim()}
            onClick={() => {
              run(() => savePersonaFactAction(projectId, field.field, text), 'Guardado.');
              setEditing(false);
              setText('');
            }}
          >
            Guardar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        </div>
      )}
      {field.facts.length === 0 && !editing && <p className="mt-1 text-sm text-muted-foreground">Sin datos.</p>}
      <ul className="mt-1 flex flex-col gap-1.5">
        {field.facts.map((x) => (
          <FactLine key={x.id} projectId={projectId} fact={x} canEdit={canEdit} pending={pending} run={run} businessTypes={businessTypes} />
        ))}
      </ul>
    </div>
  );
}

function FactLine({
  projectId,
  fact,
  canEdit,
  pending,
  run,
  businessTypes
}: {
  projectId: string;
  fact: DossierFactView;
  canEdit: boolean;
  pending: boolean;
  run: (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText?: string) => void;
  businessTypes: { value: string; label: string }[];
}) {
  const st = STATUS[fact.status];
  const toFicha = canEdit && fact.source !== 'ficha' && fact.status !== 'descartado' && TO_FICHA.has(fact.field);
  const [replace, setReplace] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const router = useRouter();
  const toFichaNow = (force: boolean) =>
    startBusy(async () => {
      const r = await applyFactToFichaAction(projectId, fact.id, force);
      if (!r.ok && r.needsReplace) setReplace(r.needsReplace);
      else {
        setReplace(null);
        if (!r.ok) run(async () => r);
        router.refresh();
      }
    });
  const evidence = fact.source === 'ia' ? iaEvidence(fact.sourceRef) : null;
  return (
    <li className={fact.status === 'descartado' ? 'flex flex-wrap items-center gap-2 text-sm text-muted-foreground line-through' : 'flex flex-wrap items-center gap-2 text-sm'}>
      <span className="break-all">{valueText(fact.field, fact.value, businessTypes)}</span>
      <Badge tone="outline">{SOURCE[fact.source] ?? fact.source}</Badge>
      <Badge tone={fact.confidence >= 80 ? 'success' : fact.confidence >= 55 ? 'info' : 'neutral'}>{fact.confidence} %</Badge>
      <Badge tone={st.tone}>{st.label}</Badge>
      {fact.agrees.length > 0 && <span className="text-xs text-success">coincide con {fact.agrees.map((s) => SOURCE[s] ?? s).join(', ')}</span>}
      {fact.conflicts.length > 0 && <span className="text-xs text-warning-strong">distinto en {fact.conflicts.map((s) => SOURCE[s] ?? s).join(', ')}</span>}
      {fact.sourceRef && /^https?:\/\//.test(fact.sourceRef) && (
        <a href={fact.sourceRef.split(' ')[0]} target="_blank" rel="noreferrer" className="text-xs underline underline-offset-2">
          ver origen
        </a>
      )}
      {fact.source === 'cliente' && fact.sourceRef && <span className="basis-full text-xs text-muted-foreground">{fact.sourceRef}</span>}
      {canEdit && (
        <span className="ml-auto flex items-center gap-1">
          {fact.status !== 'confirmado' && fact.status !== 'descartado' && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => decideDossierFactAction(projectId, fact.id, 'confirmado'))}>
              <Check className="size-3.5" />
              Confirmar
            </Button>
          )}
          {fact.status !== 'descartado' && fact.source !== 'ficha' && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => decideDossierFactAction(projectId, fact.id, 'descartado'))}>
              <X className="size-3.5" />
              Descartar
            </Button>
          )}
          {fact.status !== 'provisional' && fact.source !== 'persona' && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => decideDossierFactAction(projectId, fact.id, 'provisional'))}>
              <RotateCcw className="size-3.5" />
              Reabrir
            </Button>
          )}
          {toFicha && (
            <Button size="sm" variant="outline" disabled={pending || busy} onClick={() => toFichaNow(false)}>
              Pasar a la ficha
            </Button>
          )}
        </span>
      )}
      {evidence && <span className="basis-full text-xs text-muted-foreground">{evidence}</span>}
      {replace !== null && (
        <span className="basis-full rounded-md border border-warning/40 bg-warning-soft p-2 text-xs">
          La ficha ya dice: «{replace}». ¿La reemplazamos por este dato?{' '}
          <Button size="sm" variant="outline" className="ml-2 h-7" disabled={busy} onClick={() => toFichaNow(true)}>
            Reemplazar en la ficha
          </Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setReplace(null)}>
            Dejar la ficha como está
          </Button>
        </span>
      )}
    </li>
  );
}

/** Las pruebas de una propuesta de la IA (alta de la cartera): de qué página y frase sale cada servicio, o que no lleva cita. */
function iaEvidence(ref: string | null): string | null {
  if (!ref) return null;
  try {
    const e = JSON.parse(ref) as { items?: { n: string; u: string | null; c: string }[]; c?: string; sinCita?: boolean };
    if (e.sinCita) return 'Propuesto por la IA a partir de la web y de las búsquedas, sin una frase concreta que lo pruebe: revísalo antes de confirmarlo.';
    if (e.items?.length) {
      const path = (u: string) => {
        try {
          return decodeURI(new URL(u).pathname);
        } catch {
          return u;
        }
      };
      return `Propuesto por la IA. De dónde sale: ${e.items.map((i) => `${i.n} → «${i.c}» ${i.u ? `(${path(i.u)})` : '(sin página propia en la web)'}`).join(' · ')}`;
    }
    if (e.c) return `Propuesto por la IA. De dónde sale: «${e.c}»`;
  } catch {
    return null;
  }
  return null;
}
